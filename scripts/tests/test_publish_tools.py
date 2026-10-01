"""
Tests for scripts/sync_sample_audio.py, scripts/publish_model.py and
scripts/verify_live_truth.py (plan 01-14).

S3 is mocked with moto; the public API is stubbed (no network). The one
test marked `live` hits the real API and is deselected by default.
"""

import hashlib
import io
import json
import wave

import boto3
import numpy as np
import pytest
from moto import mock_aws

import publish_model
import sync_sample_audio
import verify_live_truth

AUDIO_BUCKET = "test-audio"
EMB_BUCKET = "test-embeddings"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=AUDIO_BUCKET)
        client.create_bucket(Bucket=EMB_BUCKET)
        yield client


# ---------------------------------------------------------------- sync_sample_audio


@pytest.fixture
def repo(tmp_path):
    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()
    excerpts = []
    for name in ("a_1.wav", "b_2.wav"):
        data = f"RIFF-fake-{name}".encode()
        (audio_dir / name).write_bytes(data)
        excerpts.append({"excerpt_id": name[:-4], "path": f"audio/{name}", "sha256": sha(data)})
    manifest = {"excerpts": excerpts}
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest))
    return tmp_path, manifest, manifest_path


def test_manifest_uploads_rejects_local_hash_mismatch(repo):
    root, manifest, _ = repo
    manifest["excerpts"][0]["sha256"] = "0" * 64
    with pytest.raises(sync_sample_audio.SyncError, match="local sha256"):
        sync_sample_audio.manifest_uploads(manifest, root)


def test_verify_remote_hash_detects_corruption():
    with pytest.raises(sync_sample_audio.SyncError):
        sync_sample_audio.verify_remote_hash("k", b"tampered", sha(b"original"))
    sync_sample_audio.verify_remote_hash("k", b"ok", sha(b"ok"))


def test_retirement_plan_skips_real_prefix_and_folder_marker():
    keys = ["samples/", "samples/marrs/x.wav", "samples/old_synth.wav", "samples/sub/y.wav", "other/z.wav"]
    plan = sync_sample_audio.retirement_plan(keys, "20261001")
    assert plan == [
        {"source": "samples/old_synth.wav", "dest": "retired/synthetic-samples-20261001/old_synth.wav"},
        {"source": "samples/sub/y.wav", "dest": "retired/synthetic-samples-20261001/sub/y.wav"},
    ]


def test_dry_run_makes_no_writes(s3, repo, capsys):
    root, _, manifest_path = repo
    rc = sync_sample_audio.main(
        ["--dry-run", "--bucket", AUDIO_BUCKET, "--manifest", str(manifest_path), "--repo-root", str(root)],
        s3_client=s3,
    )
    assert rc == 0
    assert s3.list_objects_v2(Bucket=AUDIO_BUCKET).get("KeyCount", 0) == 0
    assert "[dry-run]" in capsys.readouterr().out


def test_confirm_uploads_with_content_type_and_hash_metadata(s3, repo):
    root, manifest, manifest_path = repo
    rc = sync_sample_audio.main(
        ["--confirm", "--bucket", AUDIO_BUCKET, "--manifest", str(manifest_path), "--repo-root", str(root)],
        s3_client=s3,
    )
    assert rc == 0
    for ex in manifest["excerpts"]:
        key = f"samples/marrs/{ex['excerpt_id']}.wav"
        head = s3.head_object(Bucket=AUDIO_BUCKET, Key=key)
        assert head["ContentType"] == "audio/wav"
        assert head["Metadata"]["sha256"] == ex["sha256"]
        assert sha(s3.get_object(Bucket=AUDIO_BUCKET, Key=key)["Body"].read()) == ex["sha256"]


def _seed_synthetic(s3):
    s3.put_object(Bucket=AUDIO_BUCKET, Key="samples/synth_a.wav", Body=b"synthetic-a")
    s3.put_object(Bucket=AUDIO_BUCKET, Key="samples/synth_b.wav", Body=b"synthetic-b")


def test_retire_refuses_when_real_clips_not_live(s3, repo, capsys):
    root, _, manifest_path = repo
    _seed_synthetic(s3)
    rc = sync_sample_audio.main(
        ["--retire", "--confirm", "--bucket", AUDIO_BUCKET, "--manifest", str(manifest_path), "--repo-root", str(root), "--date", "20261001"],
        s3_client=s3,
    )
    assert rc == 1
    assert "refusing to retire" in capsys.readouterr().err
    keys = {o["Key"] for o in s3.list_objects_v2(Bucket=AUDIO_BUCKET)["Contents"]}
    assert keys == {"samples/synth_a.wav", "samples/synth_b.wav"}  # nothing touched


def test_retire_archives_then_deletes_originals(s3, repo):
    root, manifest, manifest_path = repo
    argv_base = ["--bucket", AUDIO_BUCKET, "--manifest", str(manifest_path), "--repo-root", str(root), "--date", "20261001"]
    assert sync_sample_audio.main(["--confirm", *argv_base], s3_client=s3) == 0
    _seed_synthetic(s3)
    assert sync_sample_audio.main(["--retire", "--confirm", *argv_base], s3_client=s3) == 0
    keys = {o["Key"] for o in s3.list_objects_v2(Bucket=AUDIO_BUCKET)["Contents"]}
    assert not any(k.startswith("samples/") and not k.startswith("samples/marrs/") for k in keys)
    assert "retired/synthetic-samples-20261001/synth_a.wav" in keys
    archived = s3.get_object(Bucket=AUDIO_BUCKET, Key="retired/synthetic-samples-20261001/synth_b.wav")["Body"].read()
    assert archived == b"synthetic-b"
    assert {f"samples/marrs/{e['excerpt_id']}.wav" for e in manifest["excerpts"]} <= keys


# ---------------------------------------------------------------- publish_model


def test_classify_live_state():
    locked = {"config": "L1", "weights": "L2"}
    interim = {"config": "I1", "weights": "I2"}
    assert publish_model.classify_live_state(locked, locked, interim) == publish_model.ACTION_ARCHIVE_AND_PUBLISH
    assert publish_model.classify_live_state(interim, locked, interim) == publish_model.ACTION_ALREADY_PUBLISHED
    assert publish_model.classify_live_state({"config": "X", "weights": "L2"}, locked, interim) == publish_model.ACTION_REFUSE


@pytest.fixture
def model_setup(s3, tmp_path):
    old_cfg, old_w = b'{"version": "2.0"}', b"old-weights"
    new_cfg, new_w = b'{"version": "interim-real-only"}', b"new-weights"
    s3.put_object(Bucket=EMB_BUCKET, Key=publish_model.CONFIG_KEY, Body=old_cfg)
    s3.put_object(Bucket=EMB_BUCKET, Key=publish_model.WEIGHTS_KEY, Body=old_w)
    src = tmp_path / "interim"
    src.mkdir()
    (src / "model_config.json").write_bytes(new_cfg)
    (src / "reef_classifier_weights.npz").write_bytes(new_w)
    lock = {
        "interim_required": True,
        "artifacts": {"version": "2.0", "config_sha256": sha(old_cfg), "weights_sha256": sha(old_w)},
    }
    lock_path = tmp_path / "lock.json"
    lock_path.write_text(json.dumps(lock))
    argv = ["--bucket", EMB_BUCKET, "--lock", str(lock_path), "--source", str(src), "--date", "20261001"]
    return argv, (old_cfg, old_w, new_cfg, new_w), lock_path


def _get(s3, key):
    return s3.get_object(Bucket=EMB_BUCKET, Key=key)["Body"].read()


def test_publish_dry_run_changes_nothing(s3, model_setup):
    argv, (old_cfg, old_w, *_), _ = model_setup
    assert publish_model.main(["--dry-run", *argv], s3_client=s3) == 0
    assert _get(s3, publish_model.WEIGHTS_KEY) == old_w
    assert s3.list_objects_v2(Bucket=EMB_BUCKET, Prefix="models/archive/").get("KeyCount", 0) == 0


def test_publish_archives_verified_copies_then_overwrites(s3, model_setup):
    argv, (old_cfg, old_w, new_cfg, new_w), _ = model_setup
    assert publish_model.main(["--confirm", *argv], s3_client=s3) == 0
    assert _get(s3, "models/archive/2.0-20261001/model_config.json") == old_cfg
    assert _get(s3, "models/archive/2.0-20261001/reef_classifier_weights.npz") == old_w
    assert _get(s3, publish_model.CONFIG_KEY) == new_cfg
    assert _get(s3, publish_model.WEIGHTS_KEY) == new_w
    # Idempotent: a second run sees the interim model and does nothing.
    assert publish_model.main(["--confirm", *argv], s3_client=s3) == 0


def test_publish_refuses_unexpected_live_model(s3, model_setup, capsys):
    argv, *_ = model_setup
    s3.put_object(Bucket=EMB_BUCKET, Key=publish_model.WEIGHTS_KEY, Body=b"someone-elses-weights")
    assert publish_model.main(["--confirm", *argv], s3_client=s3) == 1
    assert "refusing" in capsys.readouterr().err
    assert _get(s3, publish_model.WEIGHTS_KEY) == b"someone-elses-weights"
    assert s3.list_objects_v2(Bucket=EMB_BUCKET, Prefix="models/archive/").get("KeyCount", 0) == 0


def test_archive_aborts_before_overwrite_when_archive_hash_differs(s3, model_setup):
    argv, (old_cfg, old_w, _, _), _ = model_setup
    wrong = {"config": sha(old_cfg), "weights": "0" * 64}
    with pytest.raises(publish_model.PublishError, match="archive copy"):
        publish_model.archive_live_model(s3, EMB_BUCKET, "models/archive/2.0-20261001/", wrong)
    assert _get(s3, publish_model.WEIGHTS_KEY) == old_w


def test_rollback_restores_archived_model_verified_against_lock(s3, model_setup):
    argv, (old_cfg, old_w, new_cfg, new_w), _ = model_setup
    assert publish_model.main(["--confirm", *argv], s3_client=s3) == 0
    assert _get(s3, publish_model.CONFIG_KEY) == new_cfg

    prefix = "models/archive/2.0-20261001/"
    assert publish_model.main(["--rollback", prefix, "--dry-run", *argv], s3_client=s3) == 0
    assert _get(s3, publish_model.CONFIG_KEY) == new_cfg  # dry-run writes nothing

    assert publish_model.main(["--rollback", prefix, "--confirm", *argv], s3_client=s3) == 0
    assert _get(s3, publish_model.CONFIG_KEY) == old_cfg
    assert _get(s3, publish_model.WEIGHTS_KEY) == old_w


def test_rollback_refuses_archive_that_does_not_match_lock(s3, model_setup, capsys):
    argv, (old_cfg, old_w, new_cfg, new_w), _ = model_setup
    assert publish_model.main(["--confirm", *argv], s3_client=s3) == 0
    s3.put_object(Bucket=EMB_BUCKET, Key="models/archive/2.0-20261001/reef_classifier_weights.npz", Body=b"tampered")
    assert publish_model.main(["--rollback", "models/archive/2.0-20261001/", "--confirm", *argv], s3_client=s3) == 1
    assert _get(s3, publish_model.WEIGHTS_KEY) == new_w  # live model untouched


def test_rollback_rejects_prefix_outside_archive(s3, model_setup):
    argv, *_ = model_setup
    assert publish_model.main(["--rollback", "models/", "--confirm", *argv], s3_client=s3) == 1
    assert publish_model.main(["--rollback", "models/archive/../x/", "--confirm", *argv], s3_client=s3) == 1


# ---------------------------------------------------------------- verify_live_truth

MODEL_CARD = {"model_version": "interim-real-only", "classes": ["degraded", "healthy", "restored_early"]}


def _good_analysis(with_coords=True):
    return {
        "status": "complete",
        "classification": {
            "label": "healthy",
            "model_version": "interim-real-only",
            "probabilities": {"degraded": 0.1, "healthy": 0.7, "restored_early": 0.2},
            "region": {"coordinates_provided": with_coords, "in_training_region": with_coords},
        },
        "visualization": {},
        "similar_sites": [{"site_id": "x"}],
    }


def test_check_analysis_passes_good_response():
    assert verify_live_truth.check_analysis(_good_analysis(), MODEL_CARD, True) == []
    assert verify_live_truth.check_analysis(_good_analysis(False), MODEL_CARD, False) == []


def test_check_analysis_flags_each_violation():
    bad = _good_analysis()
    bad["classification"]["probabilities"] = {"degraded": 0.1, "healthy": 0.5, "restored_early": 0.2, "restored_mid": 0.1}
    bad["classification"]["model_version"] = "2.0"
    bad["visualization"] = {"points": [1]}
    bad["classification"]["region"]["in_training_region"] = False
    out = " | ".join(verify_live_truth.check_analysis(bad, MODEL_CARD, True))
    assert "sum" in out and "keys" in out and "model_version" in out
    assert "visualization" in out and "in_training_region" in out
    assert verify_live_truth.check_analysis({"status": "failed"}, MODEL_CARD, True)
    assert verify_live_truth.check_analysis(_good_analysis(True), MODEL_CARD, False)  # coords reported when none sent


def test_check_analysis_probability_sum_tolerance_absorbs_six_decimal_rounding():
    body = _good_analysis()
    body["classification"]["probabilities"] = {"degraded": 0.333333, "healthy": 0.333333, "restored_early": 0.333333}
    assert verify_live_truth.check_analysis(body, MODEL_CARD, expect_coordinates=True) == []
    body["classification"]["probabilities"] = {"degraded": 0.3, "healthy": 0.3, "restored_early": 0.3}
    assert any("sum to" in f for f in verify_live_truth.check_analysis(body, MODEL_CARD, expect_coordinates=True))


def test_check_sites():
    sites = [{"site_id": f"ind_{i}", "label_source": "marrs", "status": "healthy"} for i in range(52)]
    sites += [{"site_id": "borabora_tourist", "label_source": "x", "status": "unknown"},
              {"site_id": "irma_western_dry_rocks", "label_source": "x", "status": "unknown"}]
    assert verify_live_truth.check_sites({"sites": sites}) == []
    sites[-1]["status"] = "degraded"
    sites[0].pop("label_source")
    out = " | ".join(verify_live_truth.check_sites({"sites": sites}))
    assert "label_source" in out and "unknown" in out
    assert "expected 54" in " | ".join(verify_live_truth.check_sites({"sites": sites[:3]}))


def test_check_samples_listing():
    manifest = {"gallery": {"samples": [{"id": "a"}, {"id": "b"}]}}
    assert verify_live_truth.check_samples_listing({"samples": [{"id": "b", "site_id": "s"}, {"id": "a", "site_id": "s"}]}, manifest) == []
    out = verify_live_truth.check_samples_listing({"samples": [{"id": "a", "site_id": "phl_x"}]}, manifest)
    assert any("missing" in f for f in out) and any("phl_" in f for f in out)


def _wav_bytes(sr, samples):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(samples.astype("<i2").tobytes())
    return buf.getvalue()


def test_check_clip_hash_and_synthetic_detection():
    rng = np.random.default_rng(0)
    real_like = _wav_bytes(16000, (rng.standard_normal(16000 * 2) * 800))
    assert verify_live_truth.check_clip("c", real_like, sha(real_like)) == []
    assert any("sha256" in f for f in verify_live_truth.check_clip("c", real_like, "0" * 64))
    synthetic = _wav_bytes(32000, np.sin(np.arange(32000) / 5) * 8000)  # 32 kHz tone: synthetic-era
    assert any("synthetic" in f for f in verify_live_truth.check_clip("c", synthetic, sha(synthetic)))
    assert verify_live_truth.check_clip("c", b"not wav", "x")


class _Resp:
    def __init__(self, payload=None, content=b"", status=200):
        self._payload, self.content, self.status_code = payload, content, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError("http")

    def json(self):
        return self._payload


def test_run_analysis_polls_until_complete():
    calls = {"visualize": 0}

    class Session:
        def post(self, url, **kw):
            if url.endswith("/upload"):
                return _Resp({"upload_id": "u1"})
            assert kw["json"] == {"upload_id": "u1", "latitude": 1.0, "longitude": 2.0}
            return _Resp({"analysis_id": "a1"}, status=202)

        def get(self, url, **kw):
            if "/status/" in url:
                calls["visualize"] += 1
                return _Resp({"status": "processing"} if calls["visualize"] < 3 else {"status": "complete"})
            assert "/visualize/a1" in url
            return _Resp({"status": "complete", "classification": {}})

    aid, body = verify_live_truth.run_analysis(
        Session(), "http://api", b"wav", "x.wav", (1.0, 2.0), timeout_s=30, poll_interval=0, sleep=lambda s: None
    )
    assert aid == "a1" and body["status"] == "complete" and calls["visualize"] == 3


@pytest.mark.live
def test_live_api_samples_and_sites_are_truthful():
    assert verify_live_truth.main(["--no-analysis"]) == 0
