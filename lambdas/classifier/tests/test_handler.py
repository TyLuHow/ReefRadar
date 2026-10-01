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
