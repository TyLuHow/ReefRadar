"""
Shared pytest fixtures for all Lambda tests.

Forces fake AWS credentials before any handler module is imported, so a
mis-written test can never read or write the real `reefradar-2477-*`
resources. Provides `load_lambda()` to import two different Lambda
modules that are both named `handler.py` as distinct Python module
objects, and an `aws` fixture that wraps moto's `mock_aws()` for tests
that need a fake S3/DynamoDB to talk to.
"""

import importlib.util
import os
import sys

import pytest
from moto import mock_aws

# --- Force fake AWS credentials at import time ---------------------------
# Any Lambda handler module creates boto3 clients/resources at import time
# (module-level `boto3.client(...)` calls). Setting these here, before any
# handler is imported, guarantees those clients can never reach real AWS.
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
os.environ["AWS_SESSION_TOKEN"] = "testing"
os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
os.environ.pop("AWS_PROFILE", None)

# Mirror production resource names so fixtures/tests reflect real keys.
# moto's mock_aws() guarantees none of this ever leaves the machine.
os.environ.setdefault("AUDIO_BUCKET", "reefradar-2477-audio")
os.environ.setdefault("EMBEDDINGS_BUCKET", "reefradar-2477-embeddings")
os.environ.setdefault("METADATA_TABLE", "reefradar-2477-metadata")
os.environ.setdefault("PREPROCESSOR_FUNCTION", "reefradar-2477-preprocessor")
os.environ.setdefault("INFERENCE_FUNCTION", "reefradar-2477-inference")

LAMBDAS_DIR = os.path.dirname(os.path.abspath(__file__))
VALID_FUNCTIONS = {"router", "preprocessor", "classifier"}


def load_lambda(fn: str, module: str = "handler"):
    """
    Load lambdas/<fn>/<module>.py as a uniquely-named module object.

    Both lambdas/router/handler.py and lambdas/classifier/handler.py are
    named `handler.py` — loading them via a plain `import handler` would
    collide. This loads each under a unique module name
    (`lambda_<fn>_<module>`) via importlib, so two Lambda modules that
    share a filename coexist as distinct objects in sys.modules.

    lambdas/<fn> and lambdas/shared are temporarily placed first on
    sys.path for the duration of the import, so sibling imports inside
    the handler (e.g. `from region_detection import ...`) resolve.
    """
    if fn not in VALID_FUNCTIONS:
        raise ValueError(
            f"Unknown lambda function {fn!r}; expected one of {sorted(VALID_FUNCTIONS)}"
        )

    fn_dir = os.path.join(LAMBDAS_DIR, fn)
    shared_dir = os.path.join(LAMBDAS_DIR, "shared")
    module_path = os.path.join(fn_dir, f"{module}.py")

    unique_name = f"lambda_{fn}_{module}"

    added_paths = [p for p in (fn_dir, shared_dir) if p not in sys.path]
    sys.path[0:0] = added_paths
    try:
        spec = importlib.util.spec_from_file_location(unique_name, module_path)
        loaded_module = importlib.util.module_from_spec(spec)
        sys.modules[unique_name] = loaded_module
        spec.loader.exec_module(loaded_module)
        return loaded_module
    finally:
        for p in added_paths:
            if p in sys.path:
                sys.path.remove(p)


@pytest.fixture
def aws():
    """Yield inside a moto mock_aws() context (fake S3/DynamoDB/etc.)."""
    with mock_aws():
        yield


# --- Phase 5 plan 05-09 helpers: served model, real excerpt, stubbed inference ---
#
# Shared by the classifier and router tests. Everything runs under moto: the
# inference Lambda is replaced by FakeInferenceLambda, which reads the batch the
# classifier staged in S3 and returns a deterministic 1280-d vector per window.

import hashlib  # noqa: E402
import io  # noqa: E402
import json as _json  # noqa: E402
from pathlib import Path as _Path  # noqa: E402

_REPO_ROOT = _Path(LAMBDAS_DIR).parent
EXCERPT_WAV = _REPO_ROOT / "dashboard-next" / "public" / "audio" / "marrs" / "ind_H1_20220830_120000.wav"

TEST_MODEL_VERSION = "interim-real-only-test"
TEST_DATASET_VERSION = "reefradar-reference-2026.10.0"
TEST_IDX_TO_LABEL = {"0": "degraded", "1": "healthy", "2": "restored_early"}


def write_served_model(directory, version=TEST_MODEL_VERSION, spec_version=None, num_classes=3, seed=42):
    """Write served_model_config.json + served_model_weights.npz into `directory`.

    Returns (config, weights). spec_version defaults to reef_audio.SPEC_VERSION.
    """
    import numpy as np
    import reef_audio

    spec = spec_version or reef_audio.SPEC_VERSION
    rng = np.random.RandomState(seed)
    weights = {
        "w1": rng.normal(scale=0.05, size=(1280, 256)).astype(np.float32),
        "b1": np.zeros(256, dtype=np.float32),
        "w2": rng.normal(scale=0.05, size=(256, 64)).astype(np.float32),
        "b2": np.zeros(64, dtype=np.float32),
        "w3": rng.normal(scale=0.05, size=(64, num_classes)).astype(np.float32),
        "b3": np.zeros(num_classes, dtype=np.float32),
    }
    buf = io.BytesIO()
    np.savez(buf, **weights)
    raw = buf.getvalue()
    names = ["degraded", "healthy", "restored_early", "restored_mid"][:num_classes]
    config = {
        "version": version,
        "preprocessing_spec_version": spec,
        "input_dim": 1280,
        "num_classes": num_classes,
        "idx_to_label": {str(i): name for i, name in enumerate(names)},
        "weights_sha256": hashlib.sha256(raw).hexdigest(),
        "test_accuracy": 0.8,
    }
    directory = _Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "served_model_weights.npz").write_bytes(raw)
    (directory / "served_model_config.json").write_text(_json.dumps(config), encoding="utf-8")
    return config, weights


def fake_embedding(window):
    """Deterministic 1280-d float32 vector, a pure function of the window's samples."""
    import numpy as np

    digest = hashlib.sha256(np.asarray(window, dtype="<f4").tobytes()).digest()
    seed = int.from_bytes(digest[:4], "little")
    return np.random.RandomState(seed).normal(size=1280).astype(np.float32)


class FakeInferenceLambda:
    """Stand-in for the lambda_client: serves the inference contract from S3 batches.

    mode: None (correct), 'short' (one embedding too few), 'long' (one too many),
    'wrong_length' (first row 1279 long), 'nan' (a NaN in the first row).
    """

    def __init__(self, s3_client, mode=None):
        self.s3 = s3_client
        self.mode = mode
        self.batch_sizes = []

    def invoke(self, FunctionName=None, InvocationType=None, Payload=None, **kwargs):
        import numpy as np

        req = _json.loads(Payload)
        body = self.s3.get_object(Bucket=req["s3_bucket"], Key=req["s3_key"])["Body"].read()
        batch = _json.loads(body)
        assert batch["sample_rate"] == 32000
        windows = np.asarray(batch["segments"], dtype=np.float32)
        self.batch_sizes.append(int(windows.shape[0]))
        rows = [fake_embedding(w).tolist() for w in windows]
        if self.mode == "short":
            rows = rows[:-1]
        elif self.mode == "long":
            rows = rows + [rows[-1]]
        elif self.mode == "wrong_length":
            rows[0] = rows[0][:-1]
        elif self.mode == "nan":
            rows[0][0] = float("nan")
        payload = _json.dumps({"statusCode": 200, "body": _json.dumps({"embeddings": rows})})
        return {"StatusCode": 200, "Payload": io.BytesIO(payload.encode())}


def prepare_excerpt():
    """The 30 s real MARRS excerpt as PreparedAudio (6 windows)."""
    import reef_audio

    return reef_audio.audio_to_windows(EXCERPT_WAV.read_bytes())


def put_binary_segments(s3_client, bucket, analysis_id, prepared, tamper=None):
    """Write segments.f32 and preprocessing.json as the preprocessor does; return the event keys.

    tamper='flip' changes one byte after the sidecar was built (sha mismatch),
    tamper='truncate' drops the last 4 bytes (length mismatch).
    """
    import reef_audio

    raw = reef_audio.encode_segments(prepared.windows)
    sidecar = reef_audio.build_sidecar(prepared, raw)
    if tamper == "flip":
        raw = bytes([raw[0] ^ 0xFF]) + raw[1:]
    elif tamper == "truncate":
        raw = raw[:-4]
    seg_key = f"processed/{analysis_id}/segments.f32"
    side_key = f"processed/{analysis_id}/preprocessing.json"
    s3_client.put_object(Bucket=bucket, Key=seg_key, Body=raw)
    s3_client.put_object(Bucket=bucket, Key=side_key, Body=_json.dumps(sidecar).encode())
    return {
        "segments_key": seg_key,
        "num_segments": int(prepared.windows.shape[0]),
        "segments_format": reef_audio.SEGMENTS_FORMAT,
        "preprocessing_key": side_key,
    }


def write_ood_contract(tmp_path, rows, threshold=0.5, version="ood-test-nn1-cosine"):
    """Write a tmp contract bucket: the committed v1 artifacts plus an OOD sidecar and matrix.

    `rows` is an (n, 1280) array of training-window embeddings. Returns the manifest path
    (a contract manifest whose artifacts also name ood_reference and ood_embeddings), for
    reef_reference.load_ood_reference(path) or for monkeypatching REPO_CONTRACT_MANIFEST.
    """
    import shutil

    import numpy as np

    dest = _Path(tmp_path) / "ood-bucket"
    shutil.copytree(_REPO_ROOT / "contracts" / "bucket", dest)
    rows = np.ascontiguousarray(rows, dtype="<f4")
    matrix_bytes = rows.tobytes()
    matrix_sha = hashlib.sha256(matrix_bytes).hexdigest()
    sidecar = {
        "schema_version": 1,
        "ood_version": version,
        "metric": "cosine_distance",
        "k": 1,
        "threshold": threshold,
        "embeddings": {
            "uri": "v2/ood_reference.f32", "sha256": matrix_sha, "dtype": "float32-le",
            "dim": 1280, "count": int(rows.shape[0]),
        },
        "row_site_ids": ["train_site"] * int(rows.shape[0]),
    }
    sidecar_bytes = _json.dumps(sidecar).encode("utf-8")
    # the real v2 bundle exists since 05-14; this tmp copy overwrites its OOD files
    (dest / "v2").mkdir(exist_ok=True)
    (dest / "v2" / "ood_reference.f32").write_bytes(matrix_bytes)
    (dest / "v2" / "ood_reference.json").write_bytes(sidecar_bytes)
    manifest_path = dest / "contract" / "v1.json"
    manifest = _json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["artifacts"]["ood_reference"] = {
        "uri": "v2/ood_reference.json", "sha256": hashlib.sha256(sidecar_bytes).hexdigest(),
        "bytes": len(sidecar_bytes), "content_type": "application/json",
    }
    manifest["artifacts"]["ood_embeddings"] = {
        "uri": "v2/ood_reference.f32", "sha256": matrix_sha, "bytes": len(matrix_bytes),
        "content_type": "application/octet-stream",
    }
    manifest_path.write_text(_json.dumps(manifest), encoding="utf-8")
    return manifest_path
