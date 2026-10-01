"""
End-to-end CONTRACT-04 test: the classifier writes the four version stamps
into the RESULT item and the router returns them from GET /visualize/{id}
and its /results/{id} alias. Both handlers share one moto DynamoDB table.
Legacy RESULT items (written before this phase) come back as null.
"""

import importlib.util
import io
import json
import os
from pathlib import Path

import boto3
import numpy as np
import pytest

_LAMBDAS_DIR = Path(__file__).resolve().parent.parent.parent
_REPO_ROOT = _LAMBDAS_DIR.parent
_spec = importlib.util.spec_from_file_location("lambdas_conftest", _LAMBDAS_DIR / "conftest.py")
_lambdas_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_lambdas_conftest)
load_lambda = _lambdas_conftest.load_lambda

AUDIO_BUCKET = "reefradar-2477-audio"
EMBEDDINGS_BUCKET = "reefradar-2477-embeddings"
METADATA_TABLE = "reefradar-2477-metadata"

STAMP = json.loads((_REPO_ROOT / "contracts" / "bucket" / "v1" / "stamp.json").read_text(encoding="utf-8"))
STAMP_KEYS = ("contract_version", "dataset_version", "model_version", "preprocessing_spec_version")

EMBEDDING_DIM = 1280
IDX_TO_LABEL = {"0": "degraded", "1": "healthy", "2": "restored_early"}


def _clear_tmp_cache():
    os.makedirs("/tmp", exist_ok=True)
    for path in ("/tmp/reef_classifier_weights.npz", "/tmp/model_config.json"):
        if os.path.exists(path):
            os.remove(path)


def _weights_npz():
    rng = np.random.RandomState(42)
    buf = io.BytesIO()
    np.savez(
        buf,
        w1=rng.normal(scale=0.05, size=(EMBEDDING_DIM, 256)).astype(np.float32),
        b1=np.zeros(256, dtype=np.float32),
        w2=rng.normal(scale=0.05, size=(256, 64)).astype(np.float32),
        b2=np.zeros(64, dtype=np.float32),
        w3=rng.normal(scale=0.05, size=(64, 3)).astype(np.float32),
        b3=np.zeros(3, dtype=np.float32),
    )
    return buf.getvalue()


def _setup_aws(model_version):
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket=AUDIO_BUCKET)
    s3.create_bucket(Bucket=EMBEDDINGS_BUCKET)
    s3.put_object(
        Bucket=AUDIO_BUCKET,
        Key="segments/analysis-1.json",
        Body=json.dumps({"segments": ["seg-0", "seg-1"], "sample_rate": 32000}),
    )
    s3.put_object(Bucket=EMBEDDINGS_BUCKET, Key="models/reef_classifier_weights.npz", Body=_weights_npz())
    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key="models/model_config.json",
        Body=json.dumps({"version": model_version, "idx_to_label": IDX_TO_LABEL, "test_accuracy": 0.8}),
    )
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


@pytest.fixture
def stack(aws):
    """Classifier and router handlers over one moto table; model version matches the stamp."""
    _clear_tmp_cache()
    _setup_aws(STAMP["model_version"])
    classifier = load_lambda("classifier")
    router = load_lambda("router")

    def _stub_inference(segments, sample_rate, analysis_id, request_id):
        rng = np.random.RandomState(123)
        return [rng.normal(size=EMBEDDING_DIM).tolist() for _ in segments]

    classifier.invoke_inference_with_retry = _stub_inference
    return classifier, router


def _get(router, path):
    event = {"requestContext": {"http": {"method": "GET"}, "stage": ""}, "rawPath": path}
    result = router.handler(event, context=None)
    return result, json.loads(result["body"])


def _run_analysis(classifier, analysis_id="analysis-1"):
    out = classifier.handler(
        {
            "upload_id": "upload-1",
            "analysis_id": analysis_id,
            "segments_key": "segments/analysis-1.json",
            "num_segments": 2,
            "latitude": -4.93,
            "longitude": 119.32,
        },
        context=None,
    )
    assert out["statusCode"] == 200


def test_classifier_result_is_stamped_and_visualize_returns_it(stack):
    classifier, router = stack
    _run_analysis(classifier)

    item = classifier.dynamodb.Table(METADATA_TABLE).get_item(
        Key={"pk": "ANALYSIS#analysis-1", "sk": "RESULT"}
    )["Item"]
    for key in STAMP_KEYS:
        assert item[key] == STAMP[key]

    result, body = _get(router, "/visualize/analysis-1")
    assert result["statusCode"] == 200
    for key in STAMP_KEYS:
        assert body[key] == STAMP[key]
    # Serialised as the integer 1, never 1.0.
    assert '"contract_version": 1' in result["body"]
    assert '"contract_version": 1.0' not in result["body"]

    # Existing fields are untouched.
    for key in ("classification", "similar_sites", "embedding_summary", "caveats"):
        assert key in body
    assert body["status"] == "complete"


def test_results_alias_returns_the_same_body(stack):
    classifier, router = stack
    _run_analysis(classifier)
    visualize, _ = _get(router, "/visualize/analysis-1")
    results, _ = _get(router, "/results/analysis-1")
    assert visualize["body"] == results["body"]


def test_legacy_result_without_stamp_returns_nulls(stack):
    _, router = stack
    router.dynamodb.Table(METADATA_TABLE).put_item(Item={
        "pk": "ANALYSIS#legacy-1",
        "sk": "RESULT",
        "status": "complete",
        "classification": {"predicted_class": "healthy"},
        "similar_sites": [],
        "embedding_summary": {"dimension": 1280},
        "caveats": "",
    })
    result, body = _get(router, "/visualize/legacy-1")
    assert result["statusCode"] == 200
    for key in STAMP_KEYS:
        assert key in body
        assert body[key] is None
    alias, _ = _get(router, "/results/legacy-1")
    assert alias["body"] == result["body"]
