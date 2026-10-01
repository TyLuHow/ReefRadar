"""
Wraps scripts/validate_audio_manifest.py and scripts/check_audio_real.py as
pytest tests so CI runs them on every push (TRUTH-03/TRUTH-04), per the path
referenced by 01-VALIDATION.md.
"""

import json
import pathlib
import sys

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent.parent
REPO_ROOT = SCRIPTS_DIR.parent

sys.path.insert(0, str(SCRIPTS_DIR))
import validate_audio_manifest as vam  # noqa: E402
import check_audio_real as car  # noqa: E402

MANIFEST_PATH = REPO_ROOT / "data" / "audio-manifest.json"
SITES_SNAPSHOT_PATH = REPO_ROOT / "data" / "snapshots" / "api-sites.json"


def _load_manifest_and_site_ids():
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        manifest = json.load(f)
    with open(SITES_SNAPSHOT_PATH, encoding="utf-8") as f:
        sites_data = json.load(f)
    site_ids = {s["site_id"] for s in sites_data["sites"]}
    return manifest, site_ids


def test_validate_audio_manifest_all_excerpts_pass():
    manifest, site_ids = _load_manifest_and_site_ids()
    excerpts = manifest["excerpts"]
    assert excerpts, "manifest has no excerpts"

    all_failures = []
    for entry in excerpts:
        all_failures.extend(vam.validate_entry(entry, site_ids))

    assert not all_failures, "\n".join(all_failures)


def test_check_audio_real_self_test_flags_synthetic_tones():
    assert car.run_self_test() == 0


def test_check_audio_real_committed_excerpts_are_not_flagged():
    manifest, _ = _load_manifest_and_site_ids()
    for entry in manifest["excerpts"]:
        path = REPO_ROOT / entry["path"]
        result = car.check_file(str(path))
        assert not result["flagged"], f"{entry['excerpt_id']}: {result['reasons']}"


# --- WR-11: --from-live-samples never leaks presigned URLs ------------------------


def test_live_samples_download_failure_prints_type_only(monkeypatch, capsys):
    import requests

    secret_url = "https://bucket.s3.amazonaws.com/samples/x.wav?X-Amz-Signature=TOPSECRET"

    class _ListResp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"samples": [{"id": "../evil", "site_id": "ind_H1", "audio_url": secret_url}]}

    def fake_get(url, timeout=None):
        if url == car.LIVE_SAMPLES_URL:
            return _ListResp()
        raise requests.ConnectionError(f"HTTPSConnectionPool: Max retries exceeded with url: {url}")

    monkeypatch.setattr(requests, "get", fake_get)
    code = car.run_live_samples_check()
    out = capsys.readouterr()
    assert code == 2
    assert "ConnectionError" in out.err
    assert "TOPSECRET" not in out.err and "TOPSECRET" not in out.out
