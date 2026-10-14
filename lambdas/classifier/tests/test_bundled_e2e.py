"""
Package-as-deployed end-to-end test for the classifier (plan 05-15, ML-01/02/06/08).

Builds the classifier zip from infrastructure/lambda-packages/classifier.json with
the deploy tooling's own packager, extracts it, and runs the handler in a
subprocess whose sys.path starts with the extracted directory, exactly the layout
of /var/task. Nothing resolves from the repository: every flat module and every
data file (stamp, manifest, reference embeddings, sites, projection, OOD reference,
successor model) is the one inside the package. AWS is moto; the inference Lambda
is a stub that returns the recorded fixture embeddings of the ind_H1 excerpt, after
checking that the windows it is sent are the very windows the fixture was recorded
from (so the "inference output" is that of the same audio).
"""

import hashlib
import io
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]

import lambda_packaging as pkg  # noqa: E402  (pytest.ini pythonpath: scripts)
import contract_lib  # noqa: E402

LEGACY_SIMILAR_SITE_KEYS = {
    "site_id", "similarity", "country", "status", "label_source", "label_source_name", "label_original",
}
EXCERPT = "ind_H1_20220830_120000.wav"
EXCERPT_PATH = REPO_ROOT / "dashboard-next" / "public" / "audio" / "marrs" / EXCERPT
FIXTURE_DIR = REPO_ROOT / "lambdas" / "preprocessor" / "tests" / "fixtures"
BUCKET = REPO_ROOT / "contracts" / "bucket"
SERVED_MODEL_DIR = REPO_ROOT / "models" / "interim-real-only-2026.10.1"

# archive_path -> repository source, byte for byte (binary) or LF-normalised (text).
BINARY_MEMBERS = {
    "reference_embeddings.f32": BUCKET / "v1" / "embeddings.f32",
    "ood_reference.f32": BUCKET / "v2" / "ood_reference.f32",
    "served_model_weights.npz": SERVED_MODEL_DIR / "reef_classifier_weights.npz",
}
TEXT_MEMBERS = {
    "contract_stamp.json": BUCKET / "v2" / "stamp.json",
    "contract_manifest.json": BUCKET / "contract" / "v2.json",
    "reference_sites.json": BUCKET / "v1" / "sites.json",
    "reference_projection.json": BUCKET / "v1" / "projection.json",
    "ood_reference.json": BUCKET / "v2" / "ood_reference.json",
    "served_model_config.json": SERVED_MODEL_DIR / "model_config.json",
}
CODE_MEMBERS = {
    "handler.py": REPO_ROOT / "lambdas" / "classifier" / "handler.py",
    "region_detection.py": REPO_ROOT / "lambdas" / "classifier" / "region_detection.py",
    "contract_stamp.py": REPO_ROOT / "lambdas" / "shared" / "contract_stamp.py",
    "reef_audio.py": REPO_ROOT / "lambdas" / "shared" / "reef_audio.py",
    "reef_reference.py": REPO_ROOT / "lambdas" / "shared" / "reef_reference.py",
}


@pytest.fixture(scope="module")
def package_zip():
    spec = pkg.load_spec("classifier")
    return spec, pkg.build_package(spec, REPO_ROOT)


def test_package_members_and_binary_bytes(package_zip):
    spec, zip_bytes = package_zip
    expected = set(BINARY_MEMBERS) | set(TEXT_MEMBERS) | set(CODE_MEMBERS)
    assert {m["archive_path"] for m in spec["members"]} == expected
    assert set(pkg.manifest_from_zip(zip_bytes)) == expected
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    for name, source in BINARY_MEMBERS.items():
        assert zf.read(name) == source.read_bytes(), f"{name} must be byte-identical to {source}"
    for name, source in {**TEXT_MEMBERS, **CODE_MEMBERS}.items():
        assert zf.read(name) == source.read_bytes().replace(b"\r\n", b"\n"), name


def test_packaged_data_matches_the_v2_manifest(package_zip):
    """The members the classifier verifies on load are exactly the manifest's pinned bytes."""
    _, zip_bytes = package_zip
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    manifest = json.loads(zf.read("contract_manifest.json"))
    pairs = {
        "embeddings": "reference_embeddings.f32",
        "sites": "reference_sites.json",
        "projection": "reference_projection.json",
        "ood_reference": "ood_reference.json",
        "ood_embeddings": "ood_reference.f32",
    }
    for artifact, member in pairs.items():
        entry = manifest["artifacts"][artifact]
        raw = zf.read(member)
        assert hashlib.sha256(raw).hexdigest() == entry["sha256"], artifact
        assert len(raw) == entry["bytes"], artifact
    stamp = json.loads(zf.read("contract_stamp.json"))
    assert stamp["contract_version"] == manifest["contract_version"] == 2
    assert stamp["dataset_version"] == manifest["dataset_version"]
    assert stamp["model_version"] == manifest["model_version"]
    config = json.loads(zf.read("served_model_config.json"))
    assert hashlib.sha256(zf.read("served_model_weights.npz")).hexdigest() == config["weights_sha256"]
    assert config["version"] == stamp["model_version"]


_RUNNER = r'''
import hashlib, io, json, os, sys

package_dir, wav_path, rows_path, windows_path = sys.argv[1:5]
sys.path.insert(0, package_dir)

os.environ.update({
    "AWS_ACCESS_KEY_ID": "testing", "AWS_SECRET_ACCESS_KEY": "testing",
    "AWS_SESSION_TOKEN": "testing", "AWS_DEFAULT_REGION": "us-east-1",
    "AUDIO_BUCKET": "reefradar-2477-audio", "EMBEDDINGS_BUCKET": "reefradar-2477-embeddings",
    "METADATA_TABLE": "reefradar-2477-metadata", "INFERENCE_FUNCTION": "reefradar-2477-inference",
})
os.environ.pop("AWS_PROFILE", None)

import boto3
import numpy as np
from moto import mock_aws

BUCKET, TABLE = "reefradar-2477-audio", "reefradar-2477-metadata"
expected_hashes = json.load(open(windows_path))
rows = np.fromfile(rows_path, dtype="<f4").reshape(-1, 1280)


class FixtureInference:
    """Returns the recorded rows, after checking the batch holds the recorded windows."""

    def __init__(self, s3):
        self.s3, self.offset = s3, 0

    def invoke(self, FunctionName=None, InvocationType=None, Payload=None, **kw):
        req = json.loads(Payload)
        batch = json.loads(self.s3.get_object(Bucket=req["s3_bucket"], Key=req["s3_key"])["Body"].read())
        windows = np.asarray(batch["segments"], dtype=np.float32)
        for w in windows:
            digest = hashlib.sha256(np.ascontiguousarray(w, dtype="<f4").tobytes()).hexdigest()
            assert digest == expected_hashes[self.offset], "window differs from the recorded window"
            self.offset += 1
        chunk = rows[self.offset - len(windows):self.offset].tolist()
        body = json.dumps({"embeddings": chunk})
        return {"StatusCode": 200, "Payload": io.BytesIO(json.dumps({"statusCode": 200, "body": body}).encode())}


def plain(value):
    from decimal import Decimal
    if isinstance(value, Decimal):
        return float(value) if value != value.to_integral_value() else int(value)
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, list):
        return [plain(v) for v in value]
    return value


with mock_aws():
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket=BUCKET)
    s3.create_bucket(Bucket="reefradar-2477-embeddings")
    ddb = boto3.client("dynamodb", region_name="us-east-1")
    ddb.create_table(
        TableName=TABLE,
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}, {"AttributeName": "sk", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )

    import handler
    import reef_audio
    import reef_reference
    import contract_stamp

    # Everything resolved from the package directory, nothing from the repository.
    pkg_dir = os.path.realpath(package_dir)
    for mod in (handler, reef_audio, reef_reference, contract_stamp):
        assert os.path.realpath(mod.__file__).startswith(pkg_dir), mod.__file__
    assert os.path.realpath(reef_reference._MODULE_DIR) == pkg_dir

    handler.lambda_client = FixtureInference(s3)

    prepared = reef_audio.audio_to_windows(open(wav_path, "rb").read())
    raw = reef_audio.encode_segments(prepared.windows)
    sidecar = reef_audio.build_sidecar(prepared, raw)
    analysis_id = "11111111-2222-4333-8444-555555555555"
    seg_key = f"processed/{analysis_id}/segments.f32"
    side_key = f"processed/{analysis_id}/preprocessing.json"
    s3.put_object(Bucket=BUCKET, Key=seg_key, Body=raw)
    s3.put_object(Bucket=BUCKET, Key=side_key, Body=json.dumps(sidecar).encode())
    event = {
        "upload_id": "upload-1", "analysis_id": analysis_id,
        "segments_key": seg_key, "num_segments": int(prepared.windows.shape[0]),
        "segments_format": reef_audio.SEGMENTS_FORMAT, "preprocessing_key": side_key,
        "latitude": -4.93, "longitude": 119.32,
    }
    result = handler.handler(event, None)
    table = boto3.resource("dynamodb", region_name="us-east-1").Table(TABLE)
    item = table.get_item(Key={"pk": f"ANALYSIS#{analysis_id}", "sk": "RESULT"}).get("Item")
    error = table.get_item(Key={"pk": f"ANALYSIS#{analysis_id}", "sk": "ERROR"}).get("Item")
    stored = s3.get_object(Bucket=BUCKET, Key=f"processed/{analysis_id}/embeddings.f32")["Body"].read()
    print("RESULT_JSON=" + json.dumps({
        "handler_status": result["statusCode"],
        "item": plain(item) if item else None,
        "error": plain(error) if error else None,
        "stored_embeddings_sha256": hashlib.sha256(stored).hexdigest(),
    }))
'''


def _fixture_rows():
    doc = json.loads((FIXTURE_DIR / "excerpt_embeddings.json").read_text(encoding="utf-8"))
    entry = next(e for e in doc["excerpts"] if e["path"] == EXCERPT)
    first, last = entry["windows"][0]["row"], entry["windows"][-1]["row"]
    raw = (FIXTURE_DIR / "excerpt_embeddings.f32").read_bytes()
    chunk = raw[first * 1280 * 4:(last + 1) * 1280 * 4]
    return entry, chunk


@pytest.fixture(scope="module")
def deployed_run(package_zip, tmp_path_factory):
    _, zip_bytes = package_zip
    work = tmp_path_factory.mktemp("bundled-e2e")
    package_dir = work / "var_task"
    package_dir.mkdir()
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        zf.extractall(package_dir)
    entry, chunk = _fixture_rows()
    rows_path = work / "rows.f32"
    rows_path.write_bytes(chunk)
    windows_path = work / "windows.json"
    windows_path.write_text(json.dumps([w["window_sha256"] for w in entry["windows"]]), encoding="utf-8")
    runner = work / "run_handler.py"
    runner.write_text(_RUNNER, encoding="utf-8")

    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    proc = subprocess.run(
        [sys.executable, str(runner), str(package_dir), str(EXCERPT_PATH), str(rows_path), str(windows_path)],
        cwd=str(work), env=env, capture_output=True, text=True, timeout=300,
    )
    assert proc.returncode == 0, proc.stdout[-2000:] + proc.stderr[-4000:]
    lines = [ln for ln in proc.stdout.splitlines() if ln.startswith("RESULT_JSON=")]
    assert len(lines) == 1, proc.stdout[-2000:]
    return json.loads(lines[0][len("RESULT_JSON="):]), chunk


def test_package_as_deployed_produces_v2_stamped_full_result(deployed_run):
    run, chunk = deployed_run
    assert run["error"] is None
    assert run["handler_status"] == 200
    item = run["item"]
    assert item is not None and item["status"] == "complete"

    stamp = json.loads((BUCKET / "v2" / "stamp.json").read_text(encoding="utf-8"))
    assert item["stamp_status"] == "stamped"
    assert item["contract_version"] == 2
    assert item["dataset_version"] == "reefradar-reference-2026.10.0"
    assert item["model_version"] == "interim-real-only-2026.10.1"
    assert item["preprocessing_spec_version"] == "preproc-2026.10.1-reef-audio"
    for key, value in stamp.items():
        assert item[key] == value

    # the stub returned the recorded rows and the classifier stored exactly those
    assert run["stored_embeddings_sha256"] == hashlib.sha256(chunk).hexdigest()

    # windows, classification, legacy keys
    assert item["windows"]["count"] == 6
    probabilities = item["classification"]["probabilities"]
    assert abs(sum(probabilities.values()) - 1.0) < 1e-6
    assert item["classification"]["model_version"] == "interim-real-only-2026.10.1"
    assert "visualization" not in item
    assert item["embedding_summary"]["aggregation"] == "mean_of_window_probabilities"

    # all-site similarity, in the contract's own order
    manifest = json.loads((BUCKET / "contract" / "v2.json").read_text(encoding="utf-8"))
    sims = item["site_similarities"]
    assert len(sims["sites"]) == 54
    assert sum(1 for s in sims["sites"] if s["has_embedding"]) == 48
    assert sims["site_order"] == manifest["artifacts"]["embeddings"]["row_site_ids"]

    # legacy top-3 derived from the same ranking, in the legacy shape
    top3 = item["similar_sites"]
    assert len(top3) == 3
    ranked = sorted((s for s in sims["sites"] if s["has_embedding"]), key=lambda s: s["rank"])
    assert [s["site_id"] for s in top3] == [s["site_id"] for s in ranked[:3]]
    for entry in top3:
        assert set(entry) == LEGACY_SIMILAR_SITE_KEYS

    # projection and OOD come from the bundled artifacts
    projection = json.loads((BUCKET / "v1" / "projection.json").read_text(encoding="utf-8"))
    assert item["projection"]["explained_variance_ratio"] == pytest.approx(projection["explained_variance_ratio"])
    ood = json.loads((BUCKET / "v2" / "ood_reference.json").read_text(encoding="utf-8"))
    assert item["ood"]["threshold"] == pytest.approx(ood["threshold"])
    assert item["ood"]["reference_version"] == ood["ood_version"]
    assert item["ood"]["reference_sha256"] == manifest["artifacts"]["ood_embeddings"]["sha256"]
    assert len(item["ood"]["windows"]["distance"]) == 6

    # the stored document validates against the published schema
    document = {k: v for k, v in item.items() if k not in ("pk", "sk", "upload_id", "analysis_id")}
    errors = contract_lib.validation_errors(document, "analysis-result")
    assert errors == [], errors[:3]
