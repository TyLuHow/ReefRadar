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
from botocore.exceptions import ClientError
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


@pytest.fixture(autouse=True)
def committed_tree(monkeypatch):
    """The temporary bundle is not in a git work tree; pretend contracts/ is committed."""
    monkeypatch.setattr(publish_contract, "uncommitted_contract_paths", lambda contracts_dir: [])


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
    """A budgets client that reports the owner's ceiling budget with its notifications."""

    def __init__(self, notifications=3, missing=False):
        self.notifications = notifications
        self.missing = missing

    def describe_budget(self, **kwargs):
        if self.missing:
            raise ClientError({"Error": {"Code": "NotFoundException", "Message": "no budget"}}, "DescribeBudget")
        return {"Budget": {"BudgetName": kwargs["BudgetName"]}}

    def describe_notifications_for_budget(self, **kwargs):
        return {"Notifications": [{}] * self.notifications}


def run(contracts, published, *extra, s3_client=None, version="1", budgets=None):
    argv = [
        "--version", version, "--bucket", BUCKET,
        "--bundle", str(contracts / "bucket"), "--published-file", str(published),
        *extra,
    ]
    return publish_contract.main(argv, s3_client=s3_client, budgets_client=budgets or StubBudgets())


def run_set_latest(contracts, published, version, *extra, s3_client=None, budgets=None):
    argv = [
        "--set-latest", str(version), "--bucket", BUCKET,
        "--bundle", str(contracts / "bucket"), "--published-file", str(published),
        *extra,
    ]
    return publish_contract.main(argv, s3_client=s3_client, budgets_client=budgets or StubBudgets())


class Intercept:
    """Runs `before(inner)` ahead of the first put_object to `key`, simulating a concurrent writer."""

    def __init__(self, inner, key, before):
        self._inner = inner
        self._key = key
        self._before = before
        self._done = False

    def put_object(self, **kwargs):
        if kwargs["Key"] == self._key and not self._done:
            self._done = True
            self._before(self._inner)
        return self._inner.put_object(**kwargs)

    def __getattr__(self, name):
        return getattr(self._inner, name)


def pointer_for(version: int, digest: str = "a" * 64) -> bytes:
    pointer = {"contract_version": version, "manifest_uri": f"contract/v{version}.json", "manifest_sha256": digest}
    return json.dumps(pointer, sort_keys=True, indent=2).encode("utf-8") + b"\n"


def read_pointer_version(s3) -> int:
    return json.loads(s3.get_object(Bucket=BUCKET, Key="contract/latest.json")["Body"].read())["contract_version"]


def keys_in(s3) -> set:
    return {o["Key"] for o in s3.list_objects_v2(Bucket=BUCKET).get("Contents", [])}


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


# ------------------------------------------------------------------ immutability


def test_an_existing_object_with_different_bytes_is_never_overwritten(s3, contracts, tmp_path, capsys):
    s3.put_object(Bucket=BUCKET, Key="v1/sites.json", Body=b'{"tampered": true}\n')
    recorder = Recorder(s3)

    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=recorder) == 1

    err = capsys.readouterr().err
    assert "v1/sites.json" in err and "exists with different content; versions are immutable" in err
    assert recorder.writes == []
    assert s3.get_object(Bucket=BUCKET, Key="v1/sites.json")["Body"].read() == b'{"tampered": true}\n'
    assert "contract/latest.json" not in keys_in(s3)
    assert not (tmp_path / "PUBLISHED.json").exists()


def test_an_object_that_appears_between_check_and_write_is_not_overwritten(s3, contracts, tmp_path, capsys):
    planted = b'{"raced": true}\n'
    racing = Intercept(s3, "v1/sites.json", lambda inner: inner.put_object(Bucket=BUCKET, Key="v1/sites.json", Body=planted))

    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=racing) == 1

    assert "v1/sites.json exists with different content; versions are immutable" in capsys.readouterr().err
    assert s3.get_object(Bucket=BUCKET, Key="v1/sites.json")["Body"].read() == planted
    assert "contract/latest.json" not in keys_in(s3)
    assert "contract/v1.json" not in keys_in(s3)


def test_a_rerun_after_a_partial_publish_is_idempotent(s3, contracts, tmp_path, capsys):
    plan = publish_contract.load_bundle(contracts / "bucket", 1)
    for item in plan["items"][:5]:  # simulate a publish that stopped part way
        assert publish_contract.put_immutable(s3, BUCKET, item) == "created"
    capsys.readouterr()

    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=s3) == 0

    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.startswith("{")]
    actions = {line["key"]: line["action"] for line in lines}
    for item in plan["items"][:5]:
        assert actions[item["key"]] == "exists_identical"
    for item in plan["items"][5:]:
        assert actions[item["key"]] == "created"
    assert read_pointer_version(s3) == 1


def test_a_second_full_publish_changes_nothing(s3, contracts, tmp_path, capsys):
    published = tmp_path / "PUBLISHED.json"
    assert run(contracts, published, "--confirm", s3_client=s3) == 0
    first_record = published.read_bytes()
    capsys.readouterr()

    assert run(contracts, published, "--confirm", s3_client=s3) == 0

    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.startswith("{")]
    assert {line["action"] for line in lines if line["key"] != "contract/latest.json"} == {"exists_identical"}
    assert [line["action"] for line in lines if line["key"] == "contract/latest.json"] == ["pointer_unchanged"]
    assert published.read_bytes() == first_record


def test_an_existing_object_without_the_immutable_cache_header_is_refused(s3, contracts, tmp_path, capsys):
    body = (contracts / "bucket" / "v1" / "stamp.json").read_bytes()
    s3.put_object(Bucket=BUCKET, Key="v1/stamp.json", Body=body, CacheControl="no-cache")

    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=s3) == 1

    assert "Cache-Control" in capsys.readouterr().err
    assert "contract/latest.json" not in keys_in(s3)


def test_the_pointer_is_not_written_when_another_publisher_created_it_first(s3, contracts, tmp_path, capsys):
    planted = pointer_for(1)
    racing = Intercept(
        s3, "contract/latest.json",
        lambda inner: inner.put_object(Bucket=BUCKET, Key="contract/latest.json", Body=planted),
    )

    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=racing) == 1

    assert "changed since it was read" in capsys.readouterr().err
    assert s3.get_object(Bucket=BUCKET, Key="contract/latest.json")["Body"].read() == planted
    assert not (tmp_path / "PUBLISHED.json").exists()


# ------------------------------------------------------------------ bundle refusals


def test_a_fixture_manifest_is_refused_before_any_write(s3, contracts, tmp_path, capsys):
    path = contracts / "bucket" / "contract" / "v1.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["fixture"] = True
    path.write_bytes(json.dumps(data, sort_keys=True, indent=2, ensure_ascii=False).encode("utf-8") + b"\n")
    recorder = Recorder(s3)

    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=recorder) == 1

    assert "fixture" in capsys.readouterr().err
    assert recorder.writes == []


def test_a_crlf_json_artifact_is_refused_before_any_write(s3, contracts, tmp_path, capsys):
    path = contracts / "bucket" / "v1" / "stamp.json"
    path.write_bytes(path.read_bytes().replace(b"\n", b"\r\n"))
    recorder = Recorder(s3)

    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=recorder) == 1

    assert "CRLF" in capsys.readouterr().err
    assert recorder.writes == []


def test_a_bundle_that_fails_check_contract_is_refused_before_any_write(s3, contracts, tmp_path, capsys):
    path = contracts / "bucket" / "v1" / "stamp.json"
    stamp = json.loads(path.read_text(encoding="utf-8"))
    stamp["dataset_version"] = "tampered"
    path.write_bytes(json.dumps(stamp, sort_keys=True, indent=2).encode("utf-8") + b"\n")
    recorder = Recorder(s3)

    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=recorder) == 1

    assert "failed check_contract" in capsys.readouterr().err
    assert recorder.writes == []


def test_a_manifest_that_differs_from_the_published_record_is_refused(s3, contracts, tmp_path, capsys):
    published = tmp_path / "PUBLISHED.json"
    published.write_text(json.dumps({"1": {"manifest_sha256": "0" * 64}}), encoding="utf-8")
    recorder = Recorder(s3)

    assert run(contracts, published, "--confirm", s3_client=recorder) == 1

    assert "published version 1 modified" in capsys.readouterr().err
    assert recorder.writes == []


def test_uncommitted_changes_under_contracts_refuse_confirm_but_not_dry_run(
    s3, contracts, tmp_path, capsys, monkeypatch
):
    monkeypatch.setattr(publish_contract, "uncommitted_contract_paths", lambda d: [" M contracts/schema/site.schema.json"])
    recorder = Recorder(s3)

    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=recorder) == 1
    assert "uncommitted changes under contracts/" in capsys.readouterr().err
    assert recorder.writes == []

    assert run(contracts, tmp_path / "PUBLISHED.json", "--dry-run", s3_client=recorder) == 0
    assert "dirty" in capsys.readouterr().out
    assert recorder.writes == []


# ------------------------------------------------------------------ budget gate


@pytest.mark.parametrize(
    "budgets", [StubBudgets(missing=True), StubBudgets(notifications=2)], ids=["missing", "two-of-three"]
)
def test_confirm_is_blocked_without_the_budget_alarm_and_its_notifications(s3, contracts, tmp_path, capsys, budgets):
    recorder = Recorder(s3)

    code = run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=recorder, budgets=budgets)

    assert code == 2
    assert "BLOCKED: budget alarm reefradar-2477-ceiling-25 missing" in capsys.readouterr().err
    assert recorder.writes == []
    assert not (tmp_path / "PUBLISHED.json").exists()


def test_dry_run_prints_the_budget_status_and_still_exits_zero(s3, contracts, tmp_path, capsys):
    code = run(contracts, tmp_path / "PUBLISHED.json", "--dry-run", s3_client=s3, budgets=StubBudgets(missing=True))

    assert code == 0
    assert "BLOCKED: budget alarm reefradar-2477-ceiling-25 missing" in capsys.readouterr().out
    run(contracts, tmp_path / "PUBLISHED.json", "--dry-run", s3_client=s3)
    assert "budget gate: ok" in capsys.readouterr().out


# ------------------------------------------------------------------ forward-only and rollback


def test_publish_refuses_to_move_the_pointer_back(s3, contracts, tmp_path, capsys):
    s3.put_object(Bucket=BUCKET, Key="contract/latest.json", Body=pointer_for(2))
    recorder = Recorder(s3)

    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=recorder) == 1

    err = capsys.readouterr().err
    assert "forward-only" in err and "--set-latest 1" in err
    assert recorder.writes == []
    assert read_pointer_version(s3) == 2


@pytest.fixture
def published_v1(s3, contracts, tmp_path):
    """Contract v1 published to the bucket, then the pointer moved on to a (pretend) version 2."""
    published = tmp_path / "PUBLISHED.json"
    assert run(contracts, published, "--confirm", s3_client=s3) == 0
    s3.put_object(Bucket=BUCKET, Key="contract/latest.json", Body=pointer_for(2))
    return published


def test_set_latest_rolls_the_pointer_back_to_a_verified_version(s3, contracts, published_v1, capsys):
    assert read_pointer_version(s3) == 2

    assert run_set_latest(contracts, published_v1, 1, "--confirm", s3_client=s3) == 0

    obj = s3.get_object(Bucket=BUCKET, Key="contract/latest.json")
    assert obj["CacheControl"] == POINTER_CACHE
    manifest_bytes = (contracts / "bucket" / "contract" / "v1.json").read_bytes()
    assert json.loads(obj["Body"].read()) == {
        "contract_version": 1, "manifest_uri": "contract/v1.json", "manifest_sha256": sha(manifest_bytes),
    }
    assert "pointer_flipped" in capsys.readouterr().out


def test_set_latest_refuses_a_version_that_is_not_in_the_published_file(s3, contracts, published_v1, capsys):
    recorder = Recorder(s3)

    assert run_set_latest(contracts, published_v1, 7, "--confirm", s3_client=recorder) == 1

    assert "not in PUBLISHED.json" in capsys.readouterr().err
    assert recorder.writes == []


def test_set_latest_refuses_when_the_bucket_manifest_differs_from_the_published_record(
    s3, contracts, published_v1, capsys
):
    s3.put_object(Bucket=BUCKET, Key="contract/v1.json", Body=b"{}\n")  # a manifest changed behind our back
    recorder = Recorder(s3)

    assert run_set_latest(contracts, published_v1, 1, "--confirm", s3_client=recorder) == 1

    assert "records" in capsys.readouterr().err
    assert recorder.writes == []
    assert read_pointer_version(s3) == 2


def test_set_latest_refuses_when_an_artifact_is_missing_from_the_bucket(s3, contracts, published_v1, capsys):
    s3.delete_object(Bucket=BUCKET, Key="v1/sites.json")
    recorder = Recorder(s3)

    assert run_set_latest(contracts, published_v1, 1, "--confirm", s3_client=recorder) == 1

    assert recorder.writes == []
    assert read_pointer_version(s3) == 2


def test_set_latest_aborts_when_the_pointer_changes_between_read_and_write(s3, contracts, published_v1, capsys):
    planted = pointer_for(3)
    racing = Intercept(
        s3, "contract/latest.json",
        lambda inner: inner.put_object(Bucket=BUCKET, Key="contract/latest.json", Body=planted),
    )

    assert run_set_latest(contracts, published_v1, 1, "--confirm", s3_client=racing) == 1

    assert "changed since it was read" in capsys.readouterr().err
    assert s3.get_object(Bucket=BUCKET, Key="contract/latest.json")["Body"].read() == planted


def test_set_latest_dry_run_verifies_but_writes_nothing(s3, contracts, published_v1, capsys):
    recorder = Recorder(s3)

    assert run_set_latest(contracts, published_v1, 1, "--dry-run", s3_client=recorder) == 0

    assert recorder.writes == []
    assert "would_flip" in capsys.readouterr().out
    assert read_pointer_version(s3) == 2


def test_set_latest_is_blocked_without_the_budget_alarm(s3, contracts, published_v1, capsys):
    recorder = Recorder(s3)

    code = run_set_latest(contracts, published_v1, 1, "--confirm", s3_client=recorder, budgets=StubBudgets(missing=True))

    assert code == 2
    assert recorder.writes == []


def test_version_and_set_latest_are_mutually_exclusive():
    with pytest.raises(SystemExit):
        publish_contract.main(["--version", "1", "--set-latest", "1"])


# ------------------------------------------------------------------ WR-04: 409 on a conditional put


class RaisingPut:
    """Answers put_object for one key with a ClientError, optionally after a racing writer stored the same bytes."""

    def __init__(self, inner, key, code, racing_body=None):
        self._inner = inner
        self._key = key
        self._code = code
        self._racing_body = racing_body

    def put_object(self, **kwargs):
        if kwargs["Key"] == self._key:
            if self._racing_body is not None:
                self._inner.put_object(
                    Bucket=kwargs["Bucket"], Key=self._key, Body=self._racing_body,
                    ContentType=kwargs["ContentType"], CacheControl=kwargs["CacheControl"],
                    Metadata=kwargs["Metadata"],
                )
                self._racing_body = None
            raise ClientError({"Error": {"Code": self._code, "Message": "boom"}}, "PutObject")
        return self._inner.put_object(**kwargs)

    def __getattr__(self, name):
        return getattr(self._inner, name)


def test_a_409_from_a_racing_identical_writer_is_treated_as_exists_identical(s3, contracts, manifest, tmp_path, monkeypatch):
    monkeypatch.setattr(publish_contract, "CONFLICT_RETRY_SECONDS", 0)
    uri = artifact_uris(manifest)[0]
    body = (contracts / "bucket" / uri).read_bytes()
    racing = RaisingPut(s3, uri, "ConditionalRequestConflict", racing_body=body)
    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=racing) == 0
    assert sha(s3.get_object(Bucket=BUCKET, Key=uri)["Body"].read()) == sha(body)


def test_a_409_whose_key_never_appears_reports_a_lost_race_without_a_traceback(s3, contracts, manifest, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(publish_contract, "CONFLICT_RETRY_SECONDS", 0)
    uri = artifact_uris(manifest)[0]
    racing = RaisingPut(s3, uri, "ConditionalRequestConflict")
    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=racing) == 1
    err = capsys.readouterr().err
    assert "another publisher" in err
    assert "Traceback" not in err
    assert not (tmp_path / "PUBLISHED.json").exists()
    assert "contract/latest.json" not in keys_in(s3)


def test_a_409_with_different_bytes_is_still_refused(s3, contracts, manifest, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(publish_contract, "CONFLICT_RETRY_SECONDS", 0)
    uri = artifact_uris(manifest)[0]
    racing = RaisingPut(s3, uri, "ConditionalRequestConflict", racing_body=b"someone else's bytes")
    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=racing) == 1
    assert "different content" in capsys.readouterr().err


def test_any_other_aws_error_ends_with_its_code_and_no_traceback(s3, contracts, manifest, tmp_path, capsys):
    uri = artifact_uris(manifest)[0]
    failing = RaisingPut(s3, uri, "AccessDenied")
    assert run(contracts, tmp_path / "PUBLISHED.json", "--confirm", s3_client=failing) == 1
    err = capsys.readouterr().err
    assert "AccessDenied" in err
    assert "Traceback" not in err
    assert "boom" not in err
