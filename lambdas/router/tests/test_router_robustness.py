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


# --- WR-13: percent-encoded X-Filename is decoded ----------------------------------


def _wav_bytes():
    return b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * 40


def _upload(module, filename_header):
    event = {
        "requestContext": {"http": {"method": "POST"}, "stage": ""},
        "rawPath": "/upload",
        "headers": {"content-type": "audio/wav", "x-filename": filename_header},
        "isBase64Encoded": True,
        "body": base64.b64encode(_wav_bytes()).decode(),
    }
    result = module.handler(event, context=None)
    return result, json.loads(result["body"])


@pytest.fixture
def upload_env(aws):
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket=AUDIO_BUCKET)
    _make_table()
    return load_lambda("router")


def test_upload_decodes_percent_encoded_filename_then_sanitises_it(upload_env):
    from urllib.parse import quote

    # Decoded first (so "%2E%2E%2F" cannot smuggle a path), then reduced to a
    # safe key component: no directories, only [A-Za-z0-9._-], capped length.
    result, body = _upload(upload_env, quote("../../etc/pass wd.wav"))
    assert result["statusCode"] == 200
    assert body["filename"] == "pass_wd.wav"
    assert body["s3_key"] == f"uploads/{body['upload_id']}/pass_wd.wav"

    _, body = _upload(upload_env, quote("珊瑚礁.wav"))
    assert body["filename"] == "___.wav"


def test_sanitize_filename_edge_cases(upload_env):
    f = upload_env.sanitize_filename
    assert f("..", "default.wav") == "default.wav"
    assert f("", "default.wav") == "default.wav"
    assert f("a\\b\\c.wav", "d") == "c.wav"
    assert f("x" * 300 + ".wav", "d").__len__() == 100
    assert f(".hidden.wav", "d") == "hidden.wav"


# --- WR-21: records are written before the pipeline is started ---------------------


class _RecordingLambda:
    def __init__(self, table, fail=False):
        self.table = table
        self.fail = fail
        self.seen_metadata_at_invoke = None

    def invoke(self, **kwargs):
        payload = json.loads(kwargs["Payload"])
        item = self.table.get_item(
            Key={"pk": f"ANALYSIS#{payload['analysis_id']}", "sk": "METADATA"}
        ).get("Item")
        self.seen_metadata_at_invoke = item is not None
        if self.fail:
            raise RuntimeError("boom")
        return {"StatusCode": 202}


def _analyze(module, upload_id):
    event = {
        "requestContext": {"http": {"method": "POST"}, "stage": ""},
        "rawPath": "/analyze",
        "body": json.dumps({"upload_id": upload_id}),
    }
    result = module.handler(event, context=None)
    return result, json.loads(result["body"])


def test_analyze_writes_records_before_invoking_the_pipeline(upload_env):
    table = boto3.resource("dynamodb", region_name="us-east-1").Table(METADATA_TABLE)
    table.put_item(Item={"pk": "UPLOAD#u1", "sk": "METADATA", "s3_key": "uploads/u1/a.wav"})
    upload_env.lambda_client = _RecordingLambda(table)

    result, body = _analyze(upload_env, "u1")
    assert result["statusCode"] == 202
    assert upload_env.lambda_client.seen_metadata_at_invoke is True


def test_analyze_records_terminal_error_when_pipeline_cannot_start(upload_env):
    table = boto3.resource("dynamodb", region_name="us-east-1").Table(METADATA_TABLE)
    table.put_item(Item={"pk": "UPLOAD#u2", "sk": "METADATA", "s3_key": "uploads/u2/a.wav"})
    upload_env.lambda_client = _RecordingLambda(table, fail=True)

    result, body = _analyze(upload_env, "u2")
    assert result["statusCode"] == 500
    analysis_id = [
        i["analysis_id"]
        for i in table.scan()["Items"]
        if i["pk"].startswith("ANALYSIS#") and i["sk"] == "METADATA"
    ][0]
    status_result, status_body = _get(upload_env, f"/status/{analysis_id}")
    assert status_body["status"] == "failed"
    assert status_body["error"]["code"] == "PIPELINE_START_FAILED"


# --- WR-18: honest upload limit --------------------------------------------------


def test_upload_over_the_real_limit_is_rejected_with_json(upload_env):
    big = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * (upload_env.MAX_UPLOAD_BYTES + 1)
    event = {
        "requestContext": {"http": {"method": "POST"}, "stage": ""},
        "rawPath": "/upload",
        "headers": {"content-type": "audio/wav"},
        "isBase64Encoded": True,
        "body": base64.b64encode(big).decode(),
    }
    result = upload_env.handler(event, context=None)
    body = json.loads(result["body"])
    assert result["statusCode"] == 400
    assert body["error"]["code"] == "FILE_TOO_LARGE"
    assert "4 MB" in body["error"]["message"]


def test_upload_limit_fits_in_a_lambda_sync_event(upload_env):
    # 4 MiB of WAV, base64-encoded (x4/3), must stay under the 6 MB sync payload cap.
    encoded = upload_env.MAX_UPLOAD_BYTES * 4 / 3
    assert encoded + 20_000 < 6 * 1024 * 1024
