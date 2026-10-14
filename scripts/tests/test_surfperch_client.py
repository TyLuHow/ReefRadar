"""
Tests for scripts/surfperch_client.py (ML-01, ML-03, ML-06): the serial,
alignment-checked inference client shared by every offline embedding job.

No test here touches the network. S3 is moto; the Lambda client is a fake that
reads the batch object from moto the way the real inference function does.
"""

import io
import json
import pathlib
import sys

import numpy as np
import pytest
from botocore.exceptions import ClientError

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SCRIPTS_DIR))
import surfperch_client as sc  # noqa: E402

moto = pytest.importorskip("moto")

BUCKET = "reefradar-2477-embeddings"


def _client_error(code):
    return ClientError({"Error": {"Code": code, "Message": "x"}}, "Invoke")


class FakeLambda:
    """Mimics lambda_client.invoke for the inference function."""

    def __init__(self, s3, behaviours=None, dim=1280):
        self.s3 = s3
        self.dim = dim
        self.calls = []  # (s3_key, n_segments)
        self.in_flight = 0
        self.max_in_flight = 0
        self.behaviours = list(behaviours or [])  # popped per invoke; None = normal

    def _payload(self, doc):
        return {"Payload": io.BytesIO(json.dumps(doc).encode()), "StatusCode": 200}

    def invoke(self, FunctionName, InvocationType, Payload):
        self.in_flight += 1
        self.max_in_flight = max(self.max_in_flight, self.in_flight)
        try:
            body = json.loads(Payload)
            if not body:
                return self._payload({"statusCode": 400, "body": json.dumps({"error": "No audio segments provided"})})
            assert InvocationType == "RequestResponse"
            obj = self.s3.get_object(Bucket=body["s3_bucket"], Key=body["s3_key"])
            batch = json.loads(obj["Body"].read())
            n = len(batch["segments"])
            assert all(len(s) == 160000 for s in batch["segments"])
            assert batch["sample_rate"] == 32000
            self.calls.append((body["s3_key"], n))
            behaviour = self.behaviours.pop(0) if self.behaviours else None
            if isinstance(behaviour, Exception):
                raise behaviour
            rows = [[float(i + len(self.calls))] * self.dim for i in range(n)]
            if behaviour == "short":
                rows = rows[:-1]
            elif behaviour == "wrong_dim":
                rows[0] = rows[0][:1279]
            elif behaviour == "nan":
                rows[0][3] = float("nan")
            elif behaviour == "bad400":
                return self._payload({"statusCode": 400, "body": json.dumps({"error": "bad"})})
            return self._payload({"statusCode": 200, "body": {"embeddings": rows}})
        finally:
            self.in_flight -= 1


@pytest.fixture
def aws(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    from moto import mock_aws
    import boto3

    with mock_aws():
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket=BUCKET)
        yield s3


def _windows(n):
    rng = np.random.default_rng(0)
    return (rng.standard_normal((n, 160000)) * 0.01).astype(np.float32)


def _leftover(s3):
    resp = s3.list_objects_v2(Bucket=BUCKET, Prefix="temp/embedding_batches/")
    return [o["Key"] for o in resp.get("Contents", [])]


def _make(s3, behaviours=None, sleeps=None):
    lam = FakeLambda(s3, behaviours)
    sleeps = sleeps if sleeps is not None else []
    client = sc.InferenceClient(s3, lam, sleep=sleeps.append)
    return client, lam, sleeps


def test_client_batches_serially(aws):
    client, lam, _ = _make(aws)
    out = client.embed(_windows(23))
    assert out.shape == (23, 1280) and out.dtype == np.float32
    assert [n for _, n in lam.calls] == [10, 10, 3]
    assert lam.max_in_flight == 1
    assert all(k.startswith("temp/embedding_batches/offline_") for k, _ in lam.calls)
    assert _leftover(aws) == []


def test_client_alignment_errors(aws):
    for behaviour in ("short", "wrong_dim", "nan"):
        client, lam, _ = _make(aws, [behaviour])
        with pytest.raises(sc.EmbeddingAlignmentError) as exc:
            client.embed(_windows(3))
        assert "batch 1" in str(exc.value)
        assert _leftover(aws) == [], behaviour  # temp object removed on failure too
        assert len(lam.calls) == 1  # alignment problems are not retried


def test_client_throttle_retry(aws):
    client, lam, sleeps = _make(aws, [_client_error("TooManyRequestsException")])
    out = client.embed(_windows(2))
    assert out.shape == (2, 1280)
    assert sleeps == [sc.THROTTLE_RETRY_DELAYS[0]]

    client, lam, sleeps = _make(aws, [_client_error("TooManyRequestsException")] * 3)
    with pytest.raises(sc.InferenceCallFailed):
        client.embed(_windows(2))
    assert sleeps == sc.THROTTLE_RETRY_DELAYS[:2]
    assert _leftover(aws) == []


def test_client_client_error_not_retried(aws):
    client, lam, sleeps = _make(aws, ["bad400"])
    with pytest.raises(sc.InferenceCallFailed):
        client.embed(_windows(1))
    assert sleeps == [] and len(lam.calls) == 1


def test_client_warm_and_account(aws):
    client, lam, _ = _make(aws)
    assert client.warm() == 200

    class Sts:
        def __init__(self, account):
            self.account = account

        def get_caller_identity(self):
            return {"Account": self.account, "Arn": "arn:aws:iam::x:user/y"}

    assert sc.assert_account(Sts(sc.EXPECTED_ACCOUNT)) == sc.EXPECTED_ACCOUNT
    with pytest.raises(RuntimeError) as exc:
        sc.assert_account(Sts("123456789012"))
    assert "123456789012" not in str(exc.value) or "refusing" in str(exc.value)


def test_compare_embeddings_bounds():
    rng = np.random.default_rng(1)
    a = rng.standard_normal((4, 1280)).astype(np.float32)
    same = sc.compare_embeddings(a, a.copy())
    assert same["ok"] and same["min_cosine"] >= 0.99999 and same["max_abs_diff"] == 0.0
    assert len(same["rows"]) == 4

    b = a.copy()
    b[2, 7] += 1e-3
    res = sc.compare_embeddings(a, b)
    assert not res["ok"]
    assert res["max_abs_diff"] == pytest.approx(1e-3, rel=1e-3)
    assert [r["ok"] for r in res["rows"]] == [True, True, False, True]

    # tiny perturbation inside both bounds passes
    c = a.copy()
    c[0, 0] += 5e-6
    assert sc.compare_embeddings(a, c)["ok"]

    with pytest.raises(ValueError):
        sc.compare_embeddings(a, a[:3])


def test_aws_session_imports_boto3_lazily():
    src = (SCRIPTS_DIR / "surfperch_client.py").read_text(encoding="utf-8")
    top = src.split("def aws_session")[0]
    assert "import boto3" not in top.replace("    import boto3", "")
