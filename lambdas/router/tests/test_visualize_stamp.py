"""
End-to-end CONTRACT-04 and Phase 5 test: the per-window classifier writes the
version stamps and the additive per-window blocks into the RESULT item, and the
router returns them from GET /visualize/{id} and its /results/{id} alias. Both
handlers share one moto DynamoDB table. Legacy RESULT items (written before this
phase) come back with exactly the keys they always had.
"""

import importlib.util
import json
from pathlib import Path

import boto3
import numpy as np
import pytest

import reef_audio
import reef_reference

_LAMBDAS_DIR = Path(__file__).resolve().parent.parent.parent
_REPO_ROOT = _LAMBDAS_DIR.parent
_spec = importlib.util.spec_from_file_location("lambdas_conftest", _LAMBDAS_DIR / "conftest.py")
_lambdas_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_lambdas_conftest)
load_lambda = _lambdas_conftest.load_lambda
write_served_model = _lambdas_conftest.write_served_model
FakeInferenceLambda = _lambdas_conftest.FakeInferenceLambda
prepare_excerpt = _lambdas_conftest.prepare_excerpt
put_binary_segments = _lambdas_conftest.put_binary_segments
TEST_MODEL_VERSION = _lambdas_conftest.TEST_MODEL_VERSION
TEST_DATASET_VERSION = _lambdas_conftest.TEST_DATASET_VERSION

AUDIO_BUCKET = "reefradar-2477-audio"
EMBEDDINGS_BUCKET = "reefradar-2477-embeddings"
METADATA_TABLE = "reefradar-2477-metadata"

# The stamp a v2 bundle will carry: covers the test model and the spec reef_audio runs.
STAMP = {
    "contract_version": 2,
    "dataset_version": TEST_DATASET_VERSION,
    "model_version": TEST_MODEL_VERSION,
    "preprocessing_spec_version": reef_audio.SPEC_VERSION,
}
STAMP_KEYS = tuple(STAMP)

EMBEDDING_DIM = 1280

# The keys /visualize returned before Phase 5; a legacy item must return exactly these.
LEGACY_BODY_KEYS = [
    "analysis_id", "status", "contract_version", "dataset_version", "model_version",
    "preprocessing_spec_version", "stamp_status", "classification", "similar_sites",
    "similar_sites_error", "visualization", "embedding_summary", "caveats",
]
NEW_KEYS = ("windows", "site_similarities", "projection", "ood", "input_audio")


def _setup_aws():
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket=AUDIO_BUCKET)
    s3.create_bucket(Bucket=EMBEDDINGS_BUCKET)
    rng = np.random.RandomState(7)
    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key="reference/metadata.json",
        Body=json.dumps({"sites": [{
            "site_id": "ind_H4", "country": "Indonesia", "status": "healthy",
            "mean_embedding": rng.normal(size=EMBEDDING_DIM).tolist(),
        }]}),
    )
    boto3.client("dynamodb", region_name="us-east-1").create_table(
        TableName=METADATA_TABLE,
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    return s3


@pytest.fixture(scope="module")
def excerpt():
    return prepare_excerpt()


@pytest.fixture
def stack(aws, tmp_path, monkeypatch, excerpt):
    """Per-window classifier and router over one moto table; model, spec and stamp all match."""
    served_dir = tmp_path / "bundle"
    write_served_model(served_dir)
    monkeypatch.setattr(reef_reference, "_MODULE_DIR", str(served_dir))
    s3 = _setup_aws()
    classifier = load_lambda("classifier")
    router = load_lambda("router")
    classifier.lambda_client = FakeInferenceLambda(s3)
    classifier.get_contract_stamp = lambda: dict(STAMP)
    classifier._test_event = {
        "upload_id": "upload-1",
        "analysis_id": "analysis-1",
        "latitude": -4.93,
        "longitude": 119.32,
        **put_binary_segments(s3, AUDIO_BUCKET, "analysis-1", excerpt),
    }
    return classifier, router


def _get(router, path):
    event = {"requestContext": {"http": {"method": "GET"}, "stage": ""}, "rawPath": path}
    result = router.handler(event, context=None)
    return result, json.loads(result["body"])


def _run_analysis(classifier):
    out = classifier.handler(classifier._test_event, context=None)
    assert out["statusCode"] == 200


def _put_legacy_item(router, analysis_id="legacy-1"):
    router.dynamodb.Table(METADATA_TABLE).put_item(Item={
        "pk": f"ANALYSIS#{analysis_id}",
        "sk": "RESULT",
        "status": "complete",
        "classification": {"predicted_class": "healthy"},
        "similar_sites": [],
        "embedding_summary": {"dimension": 1280},
        "caveats": "",
    })


def test_classifier_result_is_stamped_and_visualize_returns_it(stack):
    classifier, router = stack
    _run_analysis(classifier)

    item = classifier.dynamodb.Table(METADATA_TABLE).get_item(
        Key={"pk": "ANALYSIS#analysis-1", "sk": "RESULT"}
    )["Item"]
    for key in STAMP_KEYS:
        assert item[key] == STAMP[key]
    assert item["stamp_status"] == "stamped"

    result, body = _get(router, "/visualize/analysis-1")
    assert result["statusCode"] == 200
    for key in STAMP_KEYS:
        assert body[key] == STAMP[key]
    assert body["stamp_status"] == "stamped"
    # Serialised as the integer 2, never 2.0.
    assert '"contract_version": 2' in result["body"]
    assert '"contract_version": 2.0' not in result["body"]

    # Existing fields are untouched.
    for key in ("classification", "similar_sites", "embedding_summary", "caveats"):
        assert key in body
    assert body["status"] == "complete"
    assert set(body["classification"]) == {"label", "confidence", "probabilities", "model_version", "region"}
    assert len(body["similar_sites"]) <= 3


def test_visualize_results_alias_identical(stack):
    classifier, router = stack
    _run_analysis(classifier)
    visualize, _ = _get(router, "/visualize/analysis-1")
    results, _ = _get(router, "/results/analysis-1")
    assert visualize["body"] == results["body"]


def test_visualize_legacy_item_keys_unchanged(stack):
    _, router = stack
    _put_legacy_item(router)
    result, body = _get(router, "/visualize/legacy-1")
    assert result["statusCode"] == 200
    assert list(body) == LEGACY_BODY_KEYS  # exactly the 13 keys, in order, no additive key
    for key in STAMP_KEYS:
        assert body[key] is None
    # CR-01: a legacy result has no stamp_status, so it can be told from an uncovered one.
    assert body["stamp_status"] is None
    assert body["visualization"] == {}
    alias, _ = _get(router, "/results/legacy-1")
    assert alias["body"] == result["body"]


def test_visualize_new_item_additive_keys_with_ints(stack):
    classifier, router = stack
    _run_analysis(classifier)
    result, body = _get(router, "/visualize/analysis-1")

    assert set(LEGACY_BODY_KEYS) <= set(body)
    present = [k for k in NEW_KEYS if k in body]
    assert present == ["windows", "input_audio"]  # site_similarities, projection, ood arrive in later plans

    windows = body["windows"]
    assert windows["count"] == 6 and type(windows["count"]) is int
    assert windows["index"] == [0, 1, 2, 3, 4, 5]
    assert all(type(i) is int for i in windows["index"])
    assert windows["classes"] == ["degraded", "healthy", "restored_early"]
    assert len(windows["probabilities"]["healthy"]) == 6
    assert any(type(p) is float for p in windows["probabilities"]["healthy"])
    assert body["input_audio"]["sample_rate_hz"] == 16000
    assert type(body["input_audio"]["sample_rate_hz"]) is int
    # Raw JSON text, not just parsed values: an integral count must not print as 6.0.
    assert '"count": 6,' in result["body"]
    assert '"sample_rate_hz": 16000,' in result["body"]
    assert '"count": 6.0' not in result["body"]

    # No S3 key and no per-window embedding ever leaves the API.
    assert "embeddings" not in result["body"] and "processed/" not in result["body"]


def test_visualize_extra_stored_keys_are_whitelisted(stack):
    """Only the five additive keys are copied; any other stored attribute stays private."""
    classifier, router = stack
    table = router.dynamodb.Table(METADATA_TABLE)
    table.put_item(Item={
        "pk": "ANALYSIS#wl-1", "sk": "RESULT", "status": "complete", "classification": {},
        "windows": {"count": 3, "index": [0, 1, 2]},
        "ood": {"k": 1, "summary": {"windows_outside": 2}},
        "internal_note": "never returned",
        "embeddings_key": "processed/wl-1/embeddings.f32",
    })
    result, body = _get(router, "/visualize/wl-1")
    assert body["windows"] == {"count": 3, "index": [0, 1, 2]}
    assert body["ood"]["summary"]["windows_outside"] == 2
    assert type(body["ood"]["summary"]["windows_outside"]) is int
    assert "internal_note" not in body and "embeddings_key" not in body


def test_visualize_never_returns_visualization_data(stack):
    classifier, router = stack
    _run_analysis(classifier)
    _put_legacy_item(router)
    for analysis_id in ("analysis-1", "legacy-1"):
        _, body = _get(router, f"/visualize/{analysis_id}")
        assert body["visualization"] == {}
    item = classifier.dynamodb.Table(METADATA_TABLE).get_item(
        Key={"pk": "ANALYSIS#analysis-1", "sk": "RESULT"}
    )["Item"]
    assert "visualization" not in item
