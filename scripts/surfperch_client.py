"""
Serial SurfPerch inference client for offline embedding jobs (Phase 5).

Offline jobs (training re-embedding, the excerpt embedding fixture, OOD
reference embedding) embed reef_audio windows through the DEPLOYED inference
Lambda with the same S3 batch protocol the classifier uses:

    1. put {"segments": [[160000 floats], ...], "sample_rate": 32000} under
       temp/embedding_batches/offline_* in the embeddings bucket
    2. invoke reefradar-2477-inference (RequestResponse) with {s3_bucket, s3_key}
    3. read {"statusCode": 200, "body": {"embeddings": [...]}}
    4. delete the temp object (also on failure)

Batches are strictly serial: the account's Lambda concurrency limit is 10 and
the inference container is heavy, so there is no thread pool (T-05-08-03).

Alignment is asserted on every batch: the container silently skips a segment
that is not exactly 160,000 samples, so a short response would otherwise shift
every later row (T-05-08-05). A wrong count, a wrong embedding length or a
non-finite value raises EmbeddingAlignmentError naming the batch.

Logging prints counts, object keys, status codes and timings only; never a
payload, a credential or a presigned URL (T-05-08-01). boto3 is imported inside
aws_session so tests and offline planning never touch it.
"""

import hashlib
import json
import time
import uuid

import numpy as np

DEFAULT_PROFILE = "reefradar"
DEFAULT_REGION = "us-east-1"
EXPECTED_ACCOUNT = "781978598306"
DEFAULT_BUCKET = "reefradar-2477-embeddings"
DEFAULT_FUNCTION = "reefradar-2477-inference"
BATCH_SIZE = 10
SAMPLE_RATE = 32000
WINDOW_SAMPLES = 160000
EMBEDDING_DIM = 1280
TEMP_PREFIX = "temp/embedding_batches/"

MAX_RETRIES = 3
RETRY_DELAYS = [1, 2, 4]  # seconds; same classes as lambdas/classifier/handler.py
THROTTLE_RETRY_DELAYS = [3, 8, 15]

COSINE_MIN = 0.99999
MAX_ABS = 1e-5

_THROTTLE_CODES = ("TooManyRequestsException", "ThrottlingException", "Throttling", "RequestLimitExceeded")
_INFRASTRUCTURE_CODES = ("ResourceNotFoundException",)


class EmbeddingAlignmentError(RuntimeError):
    """A batch returned the wrong number, length or finiteness of embeddings."""


class InferenceCallFailed(RuntimeError):
    """The inference call failed after every retry, or failed in a way retrying cannot fix."""


class _Retryable(Exception):
    def __init__(self, message, kind="INFERENCE_FAILED"):
        super().__init__(message)
        self.kind = kind


# --- helpers shared by the offline scripts ---------------------------------------------


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def window_sha256(window) -> str:
    """sha256 of a window's little-endian float32 bytes (the committed hash form)."""
    return sha256_hex(np.ascontiguousarray(window, dtype="<f4").tobytes())


def canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, indent=2, allow_nan=False) + "\n"


# --- AWS identity ------------------------------------------------------------------------


def aws_session(profile=DEFAULT_PROFILE, region=DEFAULT_REGION):
    """A profile-based boto3 Session. boto3 is imported here so tests never touch it."""
    import boto3

    return boto3.Session(profile_name=profile, region_name=region)


def assert_account(sts_client, expected=EXPECTED_ACCOUNT):
    """Refuse to continue unless the caller identity is in the expected account."""
    account = str(sts_client.get_caller_identity().get("Account", ""))
    if account != expected:
        raise RuntimeError(f"refusing to run: AWS account does not match the expected account {expected}")
    return account


def make_client(profile=DEFAULT_PROFILE, region=DEFAULT_REGION):
    """Build an InferenceClient on a profile session after checking the AWS account.

    Called only behind an explicit --confirm. The Lambda client waits for the long
    cold start and does not retry on its own: retries belong to InferenceClient so
    that no two invocations of the container can overlap.
    """
    from botocore.config import Config

    session = aws_session(profile, region)
    assert_account(session.client("sts"))
    lambda_client = session.client(
        "lambda",
        config=Config(read_timeout=330, connect_timeout=10, retries={"mode": "standard", "max_attempts": 1}),
    )
    return InferenceClient(session.client("s3"), lambda_client)


# --- client --------------------------------------------------------------------------------


def _error_kind(exc):
    """Classify an exception from lambda invoke by structured information, not message text."""
    if isinstance(exc, _Retryable):
        return exc.kind
    response = getattr(exc, "response", None)
    if isinstance(response, dict):
        code = response.get("Error", {}).get("Code", "")
        if code in _THROTTLE_CODES:
            return "THROTTLED"
        if code in _INFRASTRUCTURE_CODES:
            return "LAMBDA_NOT_FOUND"
        return "INFERENCE_FAILED"
    return "INFERENCE_FAILED"


class InferenceClient:
    """Embed reef_audio windows through the deployed inference Lambda, strictly serially."""

    def __init__(
        self,
        s3,
        lambda_client,
        bucket=DEFAULT_BUCKET,
        function_name=DEFAULT_FUNCTION,
        batch_size=BATCH_SIZE,
        sleep=time.sleep,
    ):
        self.s3 = s3
        self.lambda_client = lambda_client
        self.bucket = bucket
        self.function_name = function_name
        self.batch_size = int(batch_size)
        self.sleep = sleep

    # -- public ------------------------------------------------------------------

    def warm(self):
        """Invoke the function once with an empty payload so the container is loaded.

        The function answers an empty event with its own 400 'no segments' reply, which
        is expected here; the HTTP status of the invoke itself is returned.
        """
        started = time.time()
        response = self.lambda_client.invoke(
            FunctionName=self.function_name,
            InvocationType="RequestResponse",
            Payload=json.dumps({}),
        )
        status = response.get("StatusCode")
        print(f"warm-up invoke status {status} in {time.time() - started:.1f}s")
        return status

    def embed(self, windows):
        """Return a (n, 1280) float32 array for n windows of 160,000 samples."""
        arr = np.asarray(windows, dtype=np.float32)
        if arr.ndim != 2 or arr.shape[1] != WINDOW_SAMPLES:
            raise ValueError(f"windows must have shape (n, {WINDOW_SAMPLES}); got {arr.shape}")
        n = arr.shape[0]
        if n == 0:
            return np.zeros((0, EMBEDDING_DIM), dtype=np.float32)

        out = np.zeros((n, EMBEDDING_DIM), dtype=np.float32)
        num_batches = (n + self.batch_size - 1) // self.batch_size
        run_id = uuid.uuid4().hex[:12]
        for b in range(num_batches):
            lo, hi = b * self.batch_size, min((b + 1) * self.batch_size, n)
            out[lo:hi] = self._embed_batch(arr[lo:hi], b, num_batches, run_id)
        return out

    # -- internals ------------------------------------------------------------------

    def _embed_batch(self, batch, idx, total, run_id):
        key = f"{TEMP_PREFIX}offline_{run_id}_batch{idx}_{uuid.uuid4().hex[:8]}.json"
        body = json.dumps({"segments": batch.tolist(), "sample_rate": SAMPLE_RATE})
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=body, ContentType="application/json")
        try:
            rows = self._invoke_with_retry(key, idx, total)
            return self._check_alignment(rows, batch.shape[0], idx)
        finally:
            try:
                self.s3.delete_object(Bucket=self.bucket, Key=key)
            except Exception:
                print(f"warning: could not delete temp object {key}")

    def _invoke_with_retry(self, key, idx, total):
        last = None
        for attempt in range(MAX_RETRIES):
            started = time.time()
            try:
                print(f"batch {idx + 1}/{total} attempt {attempt + 1}/{MAX_RETRIES} key {key}")
                return self._invoke_once(key)
            except InferenceCallFailed:
                raise
            except Exception as exc:  # noqa: BLE001 - classified by structure below
                last = exc
                kind = _error_kind(exc)
                print(f"batch {idx + 1} attempt {attempt + 1} failed ({kind}) after {time.time() - started:.1f}s")
                if kind == "LAMBDA_NOT_FOUND" or attempt == MAX_RETRIES - 1:
                    break
                delays = THROTTLE_RETRY_DELAYS if kind == "THROTTLED" else RETRY_DELAYS
                self.sleep(delays[attempt])
        raise InferenceCallFailed(
            f"inference failed for batch {idx + 1} of {total} ({_error_kind(last)})"
        ) from last

    def _invoke_once(self, key):
        response = self.lambda_client.invoke(
            FunctionName=self.function_name,
            InvocationType="RequestResponse",
            Payload=json.dumps({"s3_bucket": self.bucket, "s3_key": key}),
        )
        payload = json.loads(response["Payload"].read().decode())
        if "FunctionError" in response:
            raise _Retryable(f"function error: {payload.get('errorType', 'unknown')}")
        status = payload.get("statusCode")
        body = payload.get("body", {})
        if isinstance(body, str):
            body = json.loads(body)
        if status == 200:
            embeddings = body.get("embeddings")
            if not embeddings:
                raise _Retryable("empty embeddings")
            return embeddings
        if status == 400:
            raise InferenceCallFailed("inference rejected the request (status 400); not retried")
        raise _Retryable(f"inference status {status}")

    @staticmethod
    def _check_alignment(rows, expected, idx):
        label = f"batch {idx + 1}"
        if len(rows) != expected:
            raise EmbeddingAlignmentError(f"{label}: expected {expected} embeddings, got {len(rows)}")
        for i, row in enumerate(rows):
            if len(row) != EMBEDDING_DIM:
                raise EmbeddingAlignmentError(
                    f"{label} row {i}: expected {EMBEDDING_DIM} values, got {len(row)}"
                )
        arr = np.asarray(rows, dtype=np.float32)
        if not np.all(np.isfinite(arr)):
            raise EmbeddingAlignmentError(f"{label}: non-finite embedding value")
        return arr


def compare_embeddings(a, b, cosine_min=COSINE_MIN, max_abs=MAX_ABS):
    """Per-row cosine and max abs difference; ok only when every row meets both bounds."""
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    if a.shape != b.shape or a.ndim != 2:
        raise ValueError(f"shape mismatch: {a.shape} vs {b.shape}")
    rows = []
    for i in range(a.shape[0]):
        na, nb = np.linalg.norm(a[i]), np.linalg.norm(b[i])
        cos = float(a[i] @ b[i] / (na * nb)) if na > 0 and nb > 0 else 0.0
        diff = float(np.max(np.abs(a[i] - b[i]))) if a.shape[1] else 0.0
        rows.append({"row": i, "cosine": cos, "max_abs_diff": diff,
                     "ok": bool(cos >= cosine_min and diff <= max_abs)})
    return {
        "ok": all(r["ok"] for r in rows),
        "min_cosine": min((r["cosine"] for r in rows), default=1.0),
        "max_abs_diff": max((r["max_abs_diff"] for r in rows), default=0.0),
        "rows": rows,
    }
