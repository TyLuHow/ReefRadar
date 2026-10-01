"""
Tests for scripts/publish_contract.py (plan 02-04, CONTRACT-01 / CONTRACT-04).

S3 is mocked with moto (it honours If-None-Match and If-Match on put_object); the
budgets client is a small stub. Nothing here touches AWS.
"""

import hashlib
import json
import pathlib
import shutil

import boto3
import pytest
from moto import mock_aws

import publish_contract

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BUCKET = "reefradar-test-contract"
IMMUTABLE = "public, max-age=31536000, immutable"
POINTER_CACHE = "public, max-age=60"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET)
        yield client


@pytest.fixture
def contracts(tmp_path):
    """A private copy of contracts/bucket and contracts/schema, so tests may edit it freely."""
    root = tmp_path / "contracts"
    shutil.copytree(REPO_ROOT / "contracts" / "bucket", root / "bucket")
    shutil.copytree(REPO_ROOT / "contracts" / "schema", root / "schema")
    return root


@pytest.fixture
def manifest(contracts):
    return json.loads((contracts / "bucket" / "contract" / "v1.json").read_text(encoding="utf-8"))


def artifact_uris(manifest: dict) -> list[str]:
    uris = []
    for name, entry in manifest["artifacts"].items():
        group = entry.values() if name == "schemas" else [entry]
        uris += [e["uri"] for e in group if e.get("present") is not False]
    return sorted(uris)


class Recorder:
    """Delegates to a real client and records the order of write calls."""

    def __init__(self, inner):
        self._inner = inner
        self.writes = []

    def put_object(self, **kwargs):
        self.writes.append(("put_object", kwargs["Key"]))
        return self._inner.put_object(**kwargs)

    def copy_object(self, **kwargs):
        self.writes.append(("copy_object", kwargs["Key"]))
        return self._inner.copy_object(**kwargs)

    def delete_object(self, **kwargs):
        self.writes.append(("delete_object", kwargs["Key"]))
        return self._inner.delete_object(**kwargs)

    def __getattr__(self, name):
        return getattr(self._inner, name)


class StubBudgets:
    """A budgets client that reports the owner's ceiling budget with its three notifications."""

    def describe_budget(self, **kwargs):
        return {"Budget": {"BudgetName": kwargs["BudgetName"]}}

    def describe_notifications_for_budget(self, **kwargs):
        return {"Notifications": [{}, {}, {}]}


def run(contracts, published, *extra, s3_client=None, version="1"):
    argv = [
        "--version", version, "--bucket", BUCKET,
        "--bundle", str(contracts / "bucket"), "--published-file", str(published),
        *extra,
    ]
    return publish_contract.main(argv, s3_client=s3_client, budgets_client=StubBudgets())


# ------------------------------------------------------------------ tracer


def test_publish_writes_every_artifact_with_immutable_headers(s3, contracts, manifest, tmp_path):
    published = tmp_path / "PUBLISHED.json"
    assert run(contracts, published, "--confirm", s3_client=s3) == 0

    keys = artifact_uris(manifest) + ["contract/v1.json"]
    for key in keys:
        local = (contracts / "bucket" / key).read_bytes()
        obj = s3.get_object(Bucket=BUCKET, Key=key)
        assert obj["Body"].read() == local, key
        assert obj["CacheControl"] == IMMUTABLE, key
        assert obj["Metadata"]["sha256"] == sha(local), key
        expected_type = "application/octet-stream" if key.endswith(".f32") else "application/json"
        assert obj["ContentType"] == expected_type, key
    # nothing else is published
    listed = {o["Key"] for o in s3.list_objects_v2(Bucket=BUCKET)["Contents"]}
    assert listed == set(keys) | {"contract/latest.json"}


def test_manifest_follows_every_artifact_and_the_pointer_is_the_last_write(s3, contracts, manifest, tmp_path):
    recorder = Recorder(s3)
    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=recorder) == 0

    keys = [key for _, key in recorder.writes]
    assert {name for name, _ in recorder.writes} == {"put_object"}
    assert keys[-1] == "contract/latest.json"
    assert keys[-2] == "contract/v1.json"
    assert sorted(keys[:-2]) == artifact_uris(manifest)
    assert keys.count("contract/latest.json") == 1


def test_pointer_names_the_manifest_with_a_short_cache_ttl(s3, contracts, tmp_path):
    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=s3) == 0

    obj = s3.get_object(Bucket=BUCKET, Key="contract/latest.json")
    assert obj["CacheControl"] == POINTER_CACHE
    pointer = json.loads(obj["Body"].read())
    manifest_bytes = (contracts / "bucket" / "contract" / "v1.json").read_bytes()
    assert pointer == {
        "contract_version": 1,
        "manifest_uri": "contract/v1.json",
        "manifest_sha256": sha(manifest_bytes),
    }


def test_dry_run_issues_no_write_and_lists_the_plan(s3, contracts, manifest, tmp_path, capsys):
    recorder = Recorder(s3)
    published = tmp_path / "PUBLISHED.json"
    assert run(contracts, published, "--dry-run", s3_client=recorder) == 0

    assert recorder.writes == []
    assert not published.exists()
    out = capsys.readouterr().out
    for key in artifact_uris(manifest) + ["contract/v1.json", "contract/latest.json"]:
        assert key in out
    assert sha((contracts / "bucket" / "v1" / "sites.json").read_bytes()) in out
    assert s3.list_objects_v2(Bucket=BUCKET).get("KeyCount", 0) == 0


def test_a_run_without_confirm_writes_nothing(s3, contracts, tmp_path):
    recorder = Recorder(s3)
    assert run(contracts, tmp_path / "PUBLISHED.json", s3_client=recorder) == 0
    assert recorder.writes == []


def test_published_file_records_the_version_as_canonical_lf_json(s3, contracts, tmp_path):
    published = tmp_path / "PUBLISHED.json"
    assert run(contracts, published, "--confirm", s3_client=s3) == 0

    raw = published.read_bytes()
    assert b"\r" not in raw and raw.endswith(b"\n")
    data = json.loads(raw)
    record = data["1"]
    assert record["manifest_sha256"] == sha((contracts / "bucket" / "contract" / "v1.json").read_bytes())
    assert record["bucket"] == BUCKET
    assert record["published_at"].endswith("Z")
    assert record["git_sha"]
    assert raw == json.dumps(data, sort_keys=True, indent=2, ensure_ascii=False).encode("utf-8") + b"\n"


def test_output_has_one_json_line_per_key_and_no_secrets(s3, contracts, manifest, tmp_path, capsys):
    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=s3) == 0

    out = capsys.readouterr().out
    lines = [json.loads(line) for line in out.splitlines() if line.startswith("{")]
    by_key = {line["key"]: line for line in lines}
    assert set(by_key) >= set(artifact_uris(manifest) + ["contract/v1.json", "contract/latest.json"])
    sites = by_key["v1/sites.json"]
    assert sites["bytes"] == len((contracts / "bucket" / "v1" / "sites.json").read_bytes())
    assert sites["sha256"] == sha((contracts / "bucket" / "v1" / "sites.json").read_bytes())
    assert sites["action"] == "created"
    for needle in ("X-Amz-Signature", "AKIA", "SecretAccessKey"):
        assert needle not in out
