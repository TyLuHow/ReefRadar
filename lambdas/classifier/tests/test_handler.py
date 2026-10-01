"""
End-to-end test for lambdas/classifier/handler.py (plan 01-11).

Exercises handler.handler() against moto-mocked S3/DynamoDB -- segments
JSON, a real-shape 1280-256-64-K classifier weights npz, model config,
and reference embeddings -- with invoke_inference_with_retry stubbed
(the only thing moto can't fake, since it calls a *different* Lambda
function). Confirms, end to end:

  - D-12/TRUTH-06: stored classification.probabilities are the model's
    raw softmax output (sum to 1), and classification.region is a
    separate, honest object built from the classifier's real (audited)
    training sites.
  - D-13: the RESULT item never carries a "visualization" key (the
    meaningless half-vector-mean projection has been removed).
  - D-17: similar_sites entries carry real label provenance instead of
    an invented health status for non-MARRS reference sites.

A packaging test also confirms infrastructure/lambda-packages/classifier.json
bundles the shared site_provenance.py/site-label-provenance.json members
the handler now imports.
"""

import importlib.util
import io
import json
import os
import sys
from decimal import Decimal
from pathlib import Path

import boto3
import numpy as np
import pytest
from moto import mock_aws

# Load lambdas/conftest.py by explicit file path (see
# test_load_lambda.py's own comment: a bare `import conftest` collides
# with scripts/tests/conftest.py's cached module name under pytest's
# collection order).
_LAMBDAS_DIR = Path(__file__).resolve().parent.parent.parent
_REPO_ROOT = _LAMBDAS_DIR.parent
_spec = importlib.util.spec_from_file_location("lambdas_conftest", _LAMBDAS_DIR / "conftest.py")
_lambdas_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_lambdas_conftest)
load_lambda = _lambdas_conftest.load_lambda

# pytest.ini's `pythonpath = scripts lambdas/shared` puts this on sys.path repo-wide.
import lambda_packaging as pkg  # noqa: E402

AUDIO_BUCKET = "reefradar-2477-audio"
EMBEDDINGS_BUCKET = "reefradar-2477-embeddings"
METADATA_TABLE = "reefradar-2477-metadata"

EMBEDDING_DIM = 1280
HIDDEN_1 = 256
HIDDEN_2 = 64
NUM_CLASSES = 3  # interim-shaped (degraded/healthy/restored_early), per 01-10 audit
IDX_TO_LABEL = {"0": "degraded", "1": "healthy", "2": "restored_early"}

# South Sulawesi, Indonesia -- inside the classifier's real training region.
TEST_LATITUDE = -4.93
TEST_LONGITUDE = 119.32

WEIGHTS_CACHE = "/tmp/reef_classifier_weights.npz"
CONFIG_CACHE = "/tmp/model_config.json"


def _clear_tmp_cache():
    """handler.py caches the downloaded model to /tmp for warm starts.

    Each test must see its own S3-uploaded fixture model, not a stale
    file left on disk by a previous test run, so clear (and ensure the
    directory exists -- on Windows, '/tmp' resolves to the current
    drive's root \\tmp, which may not exist yet) before every test.
    """
    os.makedirs("/tmp", exist_ok=True)
    for path in (WEIGHTS_CACHE, CONFIG_CACHE):
        if os.path.exists(path):
            os.remove(path)


def _build_weights_npz():
    rng = np.random.RandomState(42)
    w1 = rng.normal(scale=0.05, size=(EMBEDDING_DIM, HIDDEN_1)).astype(np.float32)
    b1 = np.zeros(HIDDEN_1, dtype=np.float32)
    w2 = rng.normal(scale=0.05, size=(HIDDEN_1, HIDDEN_2)).astype(np.float32)
    b2 = np.zeros(HIDDEN_2, dtype=np.float32)
    w3 = rng.normal(scale=0.05, size=(HIDDEN_2, NUM_CLASSES)).astype(np.float32)
    b3 = np.zeros(NUM_CLASSES, dtype=np.float32)

    buf = io.BytesIO()
    np.savez(buf, w1=w1, b1=b1, w2=w2, b2=b2, w3=w3, b3=b3)
    return buf.getvalue()


def _setup_s3_fixtures(s3):
    s3.create_bucket(Bucket=AUDIO_BUCKET)
    s3.create_bucket(Bucket=EMBEDDINGS_BUCKET)

    # Segments the preprocessor would have produced.
    segments_payload = {
        "segments": ["seg-0", "seg-1"],
        "sample_rate": 32000,
    }
    s3.put_object(
        Bucket=AUDIO_BUCKET,
        Key="segments/analysis-1.json",
        Body=json.dumps(segments_payload),
        ContentType="application/json",
    )

    s3.put_object(Bucket=EMBEDDINGS_BUCKET, Key="models/reef_classifier_weights.npz", Body=_build_weights_npz())
    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key="models/model_config.json",
        Body=json.dumps({
            "version": "interim-real-only-test",
            "idx_to_label": IDX_TO_LABEL,
            "test_accuracy": 0.8,
        }),
        ContentType="application/json",
    )

    rng = np.random.RandomState(7)
    reference_sites = [
        {
            "site_id": "ind_H4",
            "country": "Indonesia",
            "status": "healthy",
            "mean_embedding": rng.normal(size=EMBEDDING_DIM).tolist(),
        },
        {
            "site_id": "borabora_tourist",
            "country": "French Polynesia",
            "status": "degraded",
            "mean_embedding": rng.normal(size=EMBEDDING_DIM).tolist(),
        },
    ]
    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key="reference/metadata.json",
        Body=json.dumps({"sites": reference_sites}),
        ContentType="application/json",
    )


def _setup_dynamodb_fixture(dynamodb_client):
    dynamodb_client.create_table(
        TableName=METADATA_TABLE,
        KeySchema=[
            {"AttributeName": "pk", "KeyType": "HASH"},
            {"AttributeName": "sk", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


@pytest.fixture
def classifier_handler(aws):
    _clear_tmp_cache()
    s3 = boto3.client("s3", region_name="us-east-1")
    dynamodb_client = boto3.client("dynamodb", region_name="us-east-1")
    _setup_s3_fixtures(s3)
    _setup_dynamodb_fixture(dynamodb_client)

    module = load_lambda("classifier")

    def _stub_invoke_inference_with_retry(segments, sample_rate, analysis_id, request_id):
        rng = np.random.RandomState(123)
        return [rng.normal(size=EMBEDDING_DIM).tolist() for _ in segments]

    module.invoke_inference_with_retry = _stub_invoke_inference_with_retry
    return module


def _get_result_item(module, analysis_id):
    table = module.dynamodb.Table(METADATA_TABLE)
    resp = table.get_item(Key={"pk": f"ANALYSIS#{analysis_id}", "sk": "RESULT"})
    return resp["Item"]


def _to_float(value):
    return float(value) if isinstance(value, Decimal) else value


def test_handler_end_to_end_stores_raw_probabilities_and_honest_region(classifier_handler):
    event = {
        "upload_id": "upload-1",
        "analysis_id": "analysis-1",
        "segments_key": "segments/analysis-1.json",
        "num_segments": 2,
        "latitude": TEST_LATITUDE,
        "longitude": TEST_LONGITUDE,
    }

    result = classifier_handler.handler(event, context=None)
    assert result["statusCode"] == 200

    item = _get_result_item(classifier_handler, "analysis-1")
    assert item["status"] == "complete"

    classification = item["classification"]
    probabilities = {k: _to_float(v) for k, v in classification["probabilities"].items()}
    total = sum(probabilities.values())
    assert total == pytest.approx(1.0, abs=1e-6)
    assert _to_float(classification["confidence"]) == pytest.approx(max(probabilities.values()), abs=1e-6)

    region = classification["region"]
    assert region["coordinates_provided"] is True
    assert region["in_training_region"] is True
    assert region["training_countries"] == ["Indonesia", "Kenya"]
    assert region["training_sites_in_region"] >= 1
    # Legacy fields the current production frontend still reads.
    assert region["in_training_distribution"] == region["in_training_region"]
    assert region["confidence_adjusted"] is False


def test_handler_end_to_end_no_coordinates(classifier_handler):
    event = {
        "upload_id": "upload-2",
        "analysis_id": "analysis-2",
        "segments_key": "segments/analysis-1.json",
        "num_segments": 2,
    }

    result = classifier_handler.handler(event, context=None)
    assert result["statusCode"] == 200

    item = _get_result_item(classifier_handler, "analysis-2")
    classification = item["classification"]
    probabilities = {k: _to_float(v) for k, v in classification["probabilities"].items()}
    assert sum(probabilities.values()) == pytest.approx(1.0, abs=1e-6)

    region = classification["region"]
    assert region["coordinates_provided"] is False
    assert region["in_training_region"] is False


# --- D-13: no fake "embedding space" visualization ---------------------------
# --- D-17: similar_sites carry real label provenance ------------------------


def test_handler_no_visualization_and_similar_sites_carry_label_provenance(classifier_handler):
    event = {
        "upload_id": "upload-3",
        "analysis_id": "analysis-3",
        "segments_key": "segments/analysis-1.json",
        "num_segments": 2,
        "latitude": TEST_LATITUDE,
        "longitude": TEST_LONGITUDE,
    }

    result = classifier_handler.handler(event, context=None)
    assert result["statusCode"] == 200

    item = _get_result_item(classifier_handler, "analysis-3")

    # D-13: the half-vector-mean "embedding space" projection is gone.
    assert "visualization" not in item
    assert not hasattr(classifier_handler, "generate_visualization")

    # D-17: every similar_sites entry states who assigned its label and
    # what that dataset's own term for it was -- no invented health label
    # for a non-MARRS site.
    by_site = {s["site_id"]: s for s in item["similar_sites"]}

    marrs_site = by_site["ind_H4"]
    assert marrs_site["status"] == "healthy"
    assert marrs_site["label_source"] == "marrs"

    # Fixture stores this CoralSoundExplorer site's raw status as
    # "degraded" -- apply_label_provenance must override it to "unknown"
    # (a disturbance-context recording, not a MARRS-style health call).
    tourist_site = by_site["borabora_tourist"]
    assert tourist_site["status"] == "unknown"
    assert tourist_site["label_source"] == "coralsoundexplorer"
    assert tourist_site["label_original"] == "tourist"


# --- Packaging: classifier.json bundles the shared provenance members -------


def test_classifier_package_includes_shared_members():
    spec = pkg.load_spec("classifier")
    zip_bytes = pkg.build_package(spec, _REPO_ROOT)
    manifest = pkg.manifest_from_zip(zip_bytes)
    assert set(manifest) == {
        "handler.py",
        "region_detection.py",
        "site_provenance.py",
        "site_label_provenance.json",
    }


# --- WR-03: one authoritative outcome, no async-retry fighting the UI ---------


def _get_item(module, analysis_id, sk):
    table = module.dynamodb.Table(METADATA_TABLE)
    return table.get_item(Key={"pk": f"ANALYSIS#{analysis_id}", "sk": sk}).get("Item")


def test_inference_failure_records_error_and_returns_normally(classifier_handler):
    def _failing(segments, sample_rate, analysis_id, request_id):
        raise classifier_handler.InferenceError(
            "boom", error_type="TIMEOUT", retry_count=3, request_id="req-1"
        )

    classifier_handler.invoke_inference_with_retry = _failing
    event = {
        "upload_id": "upload-f1",
        "analysis_id": "analysis-f1",
        "segments_key": "segments/analysis-1.json",
        "num_segments": 2,
    }

    # Must NOT raise: raising would trigger Lambda's async retries.
    result = classifier_handler.handler(event, context=None)
    assert result["statusCode"] == 500

    err = _get_item(classifier_handler, "analysis-f1", "ERROR")
    assert err["error_code"] == "TIMEOUT"
    assert err["stage"] == "inference"
    assert err["request_id"] == "req-1"
    assert _get_item(classifier_handler, "analysis-f1", "RESULT") is None


def test_unexpected_failure_records_error_and_returns_normally(classifier_handler):
    event = {
        "upload_id": "upload-f2",
        "analysis_id": "analysis-f2",
        "segments_key": "segments/does-not-exist.json",
        "num_segments": 2,
    }
    result = classifier_handler.handler(event, context=None)
    assert result["statusCode"] == 500
    err = _get_item(classifier_handler, "analysis-f2", "ERROR")
    assert err["error_code"] == "CLASSIFICATION_FAILED"
    assert err["stage"] == "classification"


def test_duplicate_delivery_does_not_redo_work_or_overwrite_result(classifier_handler):
    event = {
        "upload_id": "upload-d1",
        "analysis_id": "analysis-d1",
        "segments_key": "segments/analysis-1.json",
        "num_segments": 2,
    }
    assert classifier_handler.handler(event, context=None)["statusCode"] == 200
    first = _get_item(classifier_handler, "analysis-d1", "RESULT")

    def _must_not_run(*args, **kwargs):
        raise AssertionError("inference must not run for a duplicate delivery")

    classifier_handler.invoke_inference_with_retry = _must_not_run
    result = classifier_handler.handler(event, context=None)
    assert result["statusCode"] == 200
    assert _get_item(classifier_handler, "analysis-d1", "RESULT") == first
    assert _get_item(classifier_handler, "analysis-d1", "ERROR") is None


def test_late_failure_never_contradicts_stored_result(classifier_handler):
    table = classifier_handler.dynamodb.Table(METADATA_TABLE)
    table.put_item(Item={"pk": "ANALYSIS#analysis-l1", "sk": "RESULT", "status": "complete"})
    out = classifier_handler._record_failure(
        table, "analysis-l1", "upload-l1", {"error_code": "X", "error": "late", "stage": "inference"}
    )
    assert out["statusCode"] == 200
    assert _get_item(classifier_handler, "analysis-l1", "ERROR") is None


# --- WR-04: model load-time validation and refresh ---------------------------


def _load_local_model(dirname):
    base = _REPO_ROOT / dirname
    config = json.loads((base / "model_config.json").read_text(encoding="utf-8"))
    with np.load(base / "reef_classifier_weights.npz") as npz:
        weights = {k: npz[k] for k in npz.files}
    return weights, config


@pytest.mark.parametrize("model_dir", ["models/interim-real-only", "models"])
def test_validate_model_accepts_published_and_archived_models(classifier_handler, model_dir):
    # The live interim (3-class) model and the archived v2.0 (4-class) model
    # must both keep loading.
    weights, config = _load_local_model(model_dir)
    classifier_handler.validate_model(weights, config)


def test_validate_model_rejects_class_count_mismatch(classifier_handler):
    weights, config = _load_local_model("models")  # 4 outputs
    config = dict(config)
    config["idx_to_label"] = {"0": "degraded", "1": "healthy", "2": "restored_early"}
    config["num_classes"] = 3
    with pytest.raises(ValueError):
        classifier_handler.validate_model(weights, config)


def test_validate_model_rejects_missing_label_map(classifier_handler):
    weights, config = _load_local_model("models")
    config = {k: v for k, v in config.items() if k != "idx_to_label"}
    with pytest.raises(ValueError):
        classifier_handler.validate_model(weights, config)


def test_load_rejects_weights_sha_mismatch(classifier_handler):
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key="models/model_config.json",
        Body=json.dumps({
            "version": "x", "idx_to_label": IDX_TO_LABEL, "num_classes": 3,
            "weights_sha256": "0" * 64,
        }),
    )
    with pytest.raises(Exception, match="sha256"):
        classifier_handler.load_classifier_model()


def test_warm_container_reloads_when_model_objects_change(classifier_handler):
    s3 = boto3.client("s3", region_name="us-east-1")
    _, config1 = classifier_handler.load_classifier_model()
    assert config1["version"] == "interim-real-only-test"

    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key="models/model_config.json",
        Body=json.dumps({"version": "v-next", "idx_to_label": IDX_TO_LABEL, "num_classes": 3}),
    )
    # Within the refresh window the cached model is served ...
    _, cached = classifier_handler.load_classifier_model()
    assert cached["version"] == "interim-real-only-test"
    # ... and once it elapses the changed ETag triggers a reload.
    classifier_handler._model_checked_at = 0.0
    _, config2 = classifier_handler.load_classifier_model()
    assert config2["version"] == "v-next"


def test_classify_probabilities_sum_to_one(classifier_handler):
    rng = np.random.RandomState(5)
    out = classifier_handler.classify_embedding(rng.normal(size=EMBEDDING_DIM))
    assert sum(out["probabilities"].values()) == pytest.approx(1.0, abs=1e-9)
    assert set(out["probabilities"]) == set(IDX_TO_LABEL.values())


# --- WR-05: similar-site lookup is honest about failure ----------------------


def test_similar_sites_reports_reason_when_no_comparable_embeddings(classifier_handler):
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key="reference/metadata.json",
        Body=json.dumps({"sites": [{"site_id": "ind_H4", "country": "Indonesia", "status": "healthy",
                                    "mean_embedding": [0.1] * 64}]}),
    )
    sites, note = classifier_handler.find_similar_sites_with_status(np.ones(EMBEDDING_DIM))
    assert sites == []
    assert "unavailable" in note


def test_similar_sites_reports_reason_when_reference_cannot_load(classifier_handler):
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.delete_object(Bucket=EMBEDDINGS_BUCKET, Key="reference/metadata.json")
    sites, note = classifier_handler.find_similar_sites_with_status(np.ones(EMBEDDING_DIM))
    assert sites == []
    assert "could not be loaded" in note


def test_reference_lookup_prefers_router_key_order(classifier_handler):
    s3 = boto3.client("s3", region_name="us-east-1")
    rng = np.random.RandomState(1)
    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key="reference/metadata_v6.json",
        Body=json.dumps({"sites": [{"site_id": "ken_H1", "country": "Kenya", "status": "healthy",
                                    "mean_embedding": rng.normal(size=EMBEDDING_DIM).tolist()}]}),
    )
    sites, key = classifier_handler.load_reference_sites()
    assert key == "reference/metadata_v6.json"
    assert [s["site_id"] for s in sites] == ["ken_H1"]


def test_handler_stores_similar_sites_error_note(classifier_handler):
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.delete_object(Bucket=EMBEDDINGS_BUCKET, Key="reference/metadata.json")
    event = {
        "upload_id": "upload-s1",
        "analysis_id": "analysis-s1",
        "segments_key": "segments/analysis-1.json",
        "num_segments": 2,
    }
    assert classifier_handler.handler(event, context=None)["statusCode"] == 200
    item = _get_result_item(classifier_handler, "analysis-s1")
    assert item["similar_sites"] == []
    assert "unavailable" in item["similar_sites_error"]


# --- WR-06: structured inference error types ---------------------------------


class _FakeLambdaClient:
    def __init__(self, exc):
        self.exc = exc
        self.calls = 0

    def invoke(self, **kwargs):
        self.calls += 1
        raise self.exc


def _client_error(code):
    from botocore.exceptions import ClientError
    return ClientError({"Error": {"Code": code, "Message": "x"}}, "Invoke")


def _run_batch(module, exc, monkeypatch):
    fake = _FakeLambdaClient(exc)
    module.lambda_client = fake
    sleeps = []
    monkeypatch.setattr(module.time, "sleep", lambda d: sleeps.append(d))
    with pytest.raises(module.InferenceError) as info:
        module.invoke_inference_batch("b", "k", 0, 1, "req")
    return info.value, fake, sleeps


def test_lambda_not_found_keeps_its_error_type_and_is_not_retried(classifier_handler, monkeypatch):
    err, fake, sleeps = _run_batch(classifier_handler, _client_error("ResourceNotFoundException"), monkeypatch)
    assert err.error_type == "LAMBDA_NOT_FOUND"
    assert fake.calls == 1
    assert sleeps == []
    assert "not deployed" in classifier_handler.get_error_suggestion(err.error_type)


def test_throttling_retries_with_longer_backoff(classifier_handler, monkeypatch):
    err, fake, sleeps = _run_batch(classifier_handler, _client_error("TooManyRequestsException"), monkeypatch)
    assert err.error_type == "THROTTLED"
    assert fake.calls == classifier_handler.MAX_RETRIES
    assert len(sleeps) == classifier_handler.MAX_RETRIES - 1
    assert all(d >= classifier_handler.THROTTLE_RETRY_DELAYS[i] for i, d in enumerate(sleeps))


def test_message_text_does_not_decide_the_error_type(classifier_handler, monkeypatch):
    err, _, _ = _run_batch(classifier_handler, RuntimeError("the word timeout appears here"), monkeypatch)
    assert err.error_type == "INFERENCE_FAILED"


def test_read_timeout_is_classified_as_timeout(classifier_handler, monkeypatch):
    from botocore.exceptions import ReadTimeoutError
    exc = ReadTimeoutError(endpoint_url="https://lambda.example")
    err, _, _ = _run_batch(classifier_handler, exc, monkeypatch)
    assert err.error_type == "TIMEOUT"
