"""
Tests for `publish_model.py --archive-version DIR` (plan 05-12, ML-03).

The mode archives a model version under models/archive/<version>/ with create-only
puts so the contract's model-version record can point at a truthful s3:// location.
It must never touch the live models/ keys the deployed classifier reads. S3 is
mocked with moto; no real AWS call is made.
"""

import hashlib
import json
import pathlib

import boto3
import pytest
from moto import mock_aws

import publish_model

BUCKET = "test-embeddings"
VERSION = "interim-real-only-2026.10.1"
LIVE_CONFIG = b'{"version": "interim-real-only"}'
LIVE_WEIGHTS = b"live-weights-bytes"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET)
        client.put_object(Bucket=BUCKET, Key=publish_model.CONFIG_KEY, Body=LIVE_CONFIG)
        client.put_object(Bucket=BUCKET, Key=publish_model.WEIGHTS_KEY, Body=LIVE_WEIGHTS)
        yield client


@pytest.fixture
def model_dir(tmp_path, monkeypatch):
    models = tmp_path / "models"
    monkeypatch.setattr(publish_model, "MODELS_ROOT", models)
    d = models / VERSION
    d.mkdir(parents=True)
    weights = b"successor-weights-bytes"
    config = {"version": VERSION, "weights_sha256": sha(weights), "num_classes": 3}
    config_lf = json.dumps(config, indent=2).encode("utf-8")
    (d / "model_config.json").write_bytes(config_lf)
    (d / "reef_classifier_weights.npz").write_bytes(weights)
    return d, config_lf, weights


def _get(s3, key):
    return s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()


def _all_keys(s3):
    return sorted(o["Key"] for o in s3.list_objects_v2(Bucket=BUCKET).get("Contents", []))


def _argv(model_dir_path, *extra):
    return ["--archive-version", str(model_dir_path), "--bucket", BUCKET, *extra]


def test_archive_dry_run_prints_keys_and_writes_nothing(s3, model_dir, capsys):
    d, config_lf, weights = model_dir
    before = _all_keys(s3)
    assert publish_model.main(_argv(d, "--dry-run"), s3_client=s3) == 0
    out = capsys.readouterr().out
    assert f"models/archive/{VERSION}/model_config.json" in out
    assert f"models/archive/{VERSION}/reef_classifier_weights.npz" in out
    assert sha(config_lf) in out
    assert sha(weights) in out
    assert _all_keys(s3) == before


def test_archive_without_confirm_writes_nothing(s3, model_dir):
    d, *_ = model_dir
    before = _all_keys(s3)
    assert publish_model.main(_argv(d), s3_client=s3) == 0
    assert _all_keys(s3) == before


def test_archive_confirm_writes_create_only_and_leaves_live_keys(s3, model_dir):
    d, config_lf, weights = model_dir
    assert publish_model.main(_argv(d, "--confirm"), s3_client=s3) == 0
    assert _get(s3, f"models/archive/{VERSION}/model_config.json") == config_lf
    assert _get(s3, f"models/archive/{VERSION}/reef_classifier_weights.npz") == weights
    # The deployed classifier reads these two keys; they must be byte-identical.
    assert _get(s3, publish_model.CONFIG_KEY) == LIVE_CONFIG
    assert _get(s3, publish_model.WEIGHTS_KEY) == LIVE_WEIGHTS
    assert _all_keys(s3) == sorted([
        publish_model.CONFIG_KEY,
        publish_model.WEIGHTS_KEY,
        f"models/archive/{VERSION}/model_config.json",
        f"models/archive/{VERSION}/reef_classifier_weights.npz",
    ])
    meta = s3.head_object(Bucket=BUCKET, Key=f"models/archive/{VERSION}/model_config.json")["Metadata"]
    assert meta["sha256"] == sha(config_lf)


def test_archive_rerun_with_identical_bytes_succeeds(s3, model_dir, capsys):
    d, *_ = model_dir
    assert publish_model.main(_argv(d, "--confirm"), s3_client=s3) == 0
    capsys.readouterr()
    assert publish_model.main(_argv(d, "--confirm"), s3_client=s3) == 0
    assert capsys.readouterr().out.count("exists_identical") == 2


def test_archive_existing_object_with_different_bytes_aborts(s3, model_dir, capsys):
    d, config_lf, weights = model_dir
    key = f"models/archive/{VERSION}/reef_classifier_weights.npz"
    s3.put_object(Bucket=BUCKET, Key=key, Body=b"someone-elses-bytes")
    assert publish_model.main(_argv(d, "--confirm"), s3_client=s3) == 1
    assert _get(s3, key) == b"someone-elses-bytes"
    assert "different content" in capsys.readouterr().err
    assert _get(s3, publish_model.WEIGHTS_KEY) == LIVE_WEIGHTS


def test_archive_uploads_config_as_lf_bytes(s3, model_dir):
    d, config_lf, _ = model_dir
    (d / "model_config.json").write_bytes(config_lf.replace(b"\n", b"\r\n"))
    assert publish_model.main(_argv(d, "--confirm"), s3_client=s3) == 0
    uploaded = _get(s3, f"models/archive/{VERSION}/model_config.json")
    assert uploaded == config_lf
    assert b"\r" not in uploaded
    assert sha(uploaded) == sha(config_lf)


@pytest.mark.parametrize("bad", ["Bad_Version", "../escape", "a/b", "-lead", "UPPER", ""])
def test_archive_refuses_bad_version_strings(s3, model_dir, bad):
    d, *_ = model_dir
    cfg = json.loads((d / "model_config.json").read_text(encoding="utf-8"))
    cfg["version"] = bad
    (d / "model_config.json").write_text(json.dumps(cfg), encoding="utf-8")
    before = _all_keys(s3)
    assert publish_model.main(_argv(d, "--confirm"), s3_client=s3) == 1
    assert _all_keys(s3) == before


def test_archive_refuses_dir_outside_models(s3, model_dir, tmp_path):
    outside = tmp_path / "elsewhere"
    outside.mkdir()
    d, *_ = model_dir
    (outside / "model_config.json").write_bytes((d / "model_config.json").read_bytes())
    (outside / "reef_classifier_weights.npz").write_bytes((d / "reef_classifier_weights.npz").read_bytes())
    before = _all_keys(s3)
    assert publish_model.main(_argv(outside, "--confirm"), s3_client=s3) == 1
    assert _all_keys(s3) == before


def test_archive_refuses_weights_that_do_not_match_config_sha(s3, model_dir):
    d, *_ = model_dir
    (d / "reef_classifier_weights.npz").write_bytes(b"different-weights")
    before = _all_keys(s3)
    assert publish_model.main(_argv(d, "--confirm"), s3_client=s3) == 1
    assert _all_keys(s3) == before


def test_archive_cannot_be_combined_with_rollback(s3, model_dir):
    d, *_ = model_dir
    assert publish_model.main(
        _argv(d, "--confirm", "--rollback", "models/archive/2.0-20261001/"), s3_client=s3
    ) == 1


def test_archive_never_targets_live_keys():
    for key in (publish_model.CONFIG_KEY, publish_model.WEIGHTS_KEY):
        assert not key.startswith(publish_model.ARCHIVE_ROOT)
    keys = publish_model.archive_version_keys(VERSION)
    assert all(k.startswith(f"models/archive/{VERSION}/") for k in keys.values())


def test_help_lists_archive_version(capsys):
    with pytest.raises(SystemExit):
        publish_model.main(["--help"])
    assert "--archive-version" in capsys.readouterr().out
