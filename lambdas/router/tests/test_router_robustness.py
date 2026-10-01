"""
Router robustness regressions from the Phase 1 code review (WR-01, WR-02,
WR-18, WR-21). All AWS is moto-mocked; fake credentials are forced by
lambdas/conftest.py.
"""

import base64
import importlib.util
import json
from pathlib import Path

import boto3
import pytest

_LAMBDAS_DIR = Path(__file__).resolve().parent.parent.parent
_spec = importlib.util.spec_from_file_location("lambdas_conftest", _LAMBDAS_DIR / "conftest.py")
_lambdas_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_lambdas_conftest)
load_lambda = _lambdas_conftest.load_lambda

METADATA_TABLE = "reefradar-2477-metadata"
EMBEDDINGS_BUCKET = "reefradar-2477-embeddings"
AUDIO_BUCKET = "reefradar-2477-audio"


def _make_table():
    ddb = boto3.resource("dynamodb", region_name="us-east-1")
    return ddb.create_table(
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
def table(aws):
    return _make_table()


@pytest.fixture
def router(aws):
    return load_lambda("router")


def _get(module, path):
    event = {"requestContext": {"http": {"method": "GET"}, "stage": ""}, "rawPath": path}
    result = module.handler(event, context=None)
    return result, json.loads(result["body"])


# --- WR-01: /visualize reports classifier failures ------------------------------


def test_visualize_reports_error_even_when_preprocessed_exists(router, table):
    aid = "a-1"
    table.put_item(Item={"pk": f"ANALYSIS#{aid}", "sk": "METADATA", "status": "processing"})
    table.put_item(Item={"pk": f"ANALYSIS#{aid}", "sk": "PREPROCESSED", "num_segments": 3})
    table.put_item(
        Item={
            "pk": f"ANALYSIS#{aid}",
            "sk": "ERROR",
            "error_code": "INFERENCE_FAILED",
            "error": "boom",
            "stage": "classification",
            "request_id": "req-123",
            "retry_count": 3,
        }
    )
    result, body = _get(router, f"/visualize/{aid}")
    assert result["statusCode"] == 200
    assert body["status"] == "failed"
    assert body["error"]["code"] == "INFERENCE_FAILED"
    assert body["error"]["request_id"] == "req-123"


def test_visualize_processing_when_only_metadata_exists(router, table):
    table.put_item(Item={"pk": "ANALYSIS#a-2", "sk": "METADATA", "status": "processing"})
    result, body = _get(router, "/visualize/a-2")
    assert result["statusCode"] == 200
    assert body["status"] == "processing"


def test_visualize_processing_when_preprocessed(router, table):
    table.put_item(Item={"pk": "ANALYSIS#a-3", "sk": "PREPROCESSED", "num_segments": 2})
    result, body = _get(router, "/visualize/a-3")
    assert body["status"] == "processing"


def test_visualize_unknown_analysis_is_404(router, table):
    result, body = _get(router, "/visualize/nope")
    assert result["statusCode"] == 404
    assert body["error"]["code"] == "ANALYSIS_NOT_FOUND"


# --- WR-02: /sites never fabricates data -----------------------------------------


def _put_metadata(obj, key="reference/metadata_v6.json"):
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket=EMBEDDINGS_BUCKET)
    s3.put_object(Bucket=EMBEDDINGS_BUCKET, Key=key, Body=json.dumps(obj))


def test_sites_skips_unknown_site_and_reports_it(router, aws):
    _put_metadata(
        {
            "sites": [
                {"site_id": "ind_H4", "country": "Indonesia", "status": "healthy", "has_embedding": True},
                {"site_id": "zzz_unknown_prefix", "country": "Nowhere", "status": "healthy"},
                {"country": "NoId"},
            ]
        }
    )
    result, body = _get(router, "/sites")
    assert result["statusCode"] == 200
    assert [s["site_id"] for s in body["sites"]] == ["ind_H4"]
    assert body["total_sites"] == 1
    assert body["total_all_sites"] == 3
    assert sorted(map(str, body["skipped_sites"])) == ["None", "zzz_unknown_prefix"]


def test_sites_legacy_list_metadata_does_not_crash(router, aws):
    _put_metadata(
        [{"site_id": "ind_H4", "country": "Indonesia", "status": "healthy", "has_embedding": True}],
        key="reference/metadata.json",
    )
    result, body = _get(router, "/sites")
    assert result["statusCode"] == 200
    assert body["total_sites"] == 1
    assert body["sites_with_embeddings"] == 1
