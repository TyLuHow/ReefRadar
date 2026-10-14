"""
Fixtures for the preprocessor handler tests (plan 05-07).

`preproc` loads the live handler under moto with a real S3 bucket and
metadata table; only the classifier invoke is replaced by a recorder (a
different Lambda is the one thing moto cannot run). The WAV builders live in
preproc_wavs.py.
"""

import importlib.util
import json
from pathlib import Path

import boto3
import pytest

# Load lambdas/conftest.py by explicit path (a bare `import conftest` collides
# with the other conftest modules under pytest's collection order).
_LAMBDAS_DIR = Path(__file__).resolve().parent.parent.parent
_spec = importlib.util.spec_from_file_location("lambdas_conftest", _LAMBDAS_DIR / "conftest.py")
_lambdas_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_lambdas_conftest)
load_lambda = _lambdas_conftest.load_lambda

AUDIO_BUCKET = "reefradar-2477-audio"
EMBEDDINGS_BUCKET = "reefradar-2477-embeddings"
METADATA_TABLE = "reefradar-2477-metadata"
CLASSIFIER_FUNCTION = "reefradar-2477-classifier"


class _InvokeRecorder:
    def __init__(self):
        self.calls = []

    def invoke(self, **kwargs):
        self.calls.append(kwargs)
        return {"StatusCode": 202}


class Preproc:
    """The live handler module plus helpers bound to its moto S3/DynamoDB."""

    def __init__(self, module, s3, recorder):
        self.module = module
        self.s3 = s3
        self.recorder = recorder
        self.table = module.dynamodb.Table(METADATA_TABLE)

    def put_upload(self, data, upload_id="up-1"):
        key = f"uploads/{upload_id}/input.wav"
        self.s3.put_object(Bucket=AUDIO_BUCKET, Key=key, Body=data)
        return upload_id, key

    def run(self, data, analysis_id="an-1", upload_id="up-1", **extra):
        _, key = self.put_upload(data, upload_id)
        event = {"upload_id": upload_id, "analysis_id": analysis_id, "s3_key": key}
        event.update(extra)
        return self.module.handler(event, None)

    def get_bytes(self, analysis_id, name):
        resp = self.s3.get_object(Bucket=AUDIO_BUCKET, Key=f"processed/{analysis_id}/{name}")
        return resp["Body"].read()

    def has_object(self, analysis_id, name):
        resp = self.s3.list_objects_v2(Bucket=AUDIO_BUCKET, Prefix=f"processed/{analysis_id}/{name}")
        return resp.get("KeyCount", 0) > 0

    def item(self, analysis_id, sk):
        resp = self.table.get_item(Key={"pk": f"ANALYSIS#{analysis_id}", "sk": sk})
        return resp.get("Item")

    def invoked_payloads(self):
        return [json.loads(c["Payload"]) for c in self.recorder.calls]


@pytest.fixture
def preproc(aws):
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket=AUDIO_BUCKET)
    ddb = boto3.client("dynamodb", region_name="us-east-1")
    ddb.create_table(
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
    module = load_lambda("preprocessor")
    module.CLASSIFIER_FUNCTION = CLASSIFIER_FUNCTION
    recorder = _InvokeRecorder()
    module.lambda_client = recorder
    return Preproc(module, s3, recorder)
