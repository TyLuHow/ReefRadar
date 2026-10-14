"""
Offline guard for the excerpt embedding fixture (plan 05-11, ML-01 / ML-06).

fixtures/excerpt_embeddings.{f32,json} hold the SurfPerch embeddings of the 54
windows of the 9 committed MARRS excerpts, recorded live through the deployed
inference Lambda by scripts/record_embedding_fixture.py. This test never calls
AWS: it proves the fixture file is intact and that it still corresponds, hash for
hash, to the windows reef_audio produces today from the committed excerpt WAVs.
If reef_audio or an excerpt changes, this fails and the fixture must be re-recorded
deliberately (live), never edited.
"""

import hashlib
import json
import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "scripts"))
sys.path.insert(0, str(REPO_ROOT / "lambdas" / "shared"))
import reef_audio  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"
EXCERPTS_DIR = REPO_ROOT / "dashboard-next" / "public" / "audio" / "marrs"


def _doc():
    return json.loads((FIXTURES / "excerpt_embeddings.json").read_text(encoding="utf-8"))


def _window_sha256(window):
    return hashlib.sha256(np.ascontiguousarray(window, dtype="<f4").tobytes()).hexdigest()


def test_fixture_embeddings_sha256_matches_file():
    doc = _doc()
    raw = (FIXTURES / "excerpt_embeddings.f32").read_bytes()
    assert hashlib.sha256(raw).hexdigest() == doc["embeddings_sha256"]
    assert len(raw) == 54 * 1280 * 4 == 276480


def test_fixture_shape_and_finite():
    doc = _doc()
    assert doc["count"] == 54
    assert doc["dim"] == 1280
    assert doc["dtype"] == "float32-le"
    X = np.fromfile(FIXTURES / "excerpt_embeddings.f32", dtype="<f4").reshape(54, 1280)
    assert np.isfinite(X).all()
    assert doc["tolerance"] == {"cosine_min": 0.99999, "max_abs": 1e-05}


def test_fixture_spec_version_is_reef_audio():
    assert _doc()["spec_version"] == reef_audio.SPEC_VERSION


def test_fixture_excerpts_match_committed_wavs():
    doc = _doc()
    assert len(doc["excerpts"]) == 9
    for entry in doc["excerpts"]:
        data = (EXCERPTS_DIR / entry["path"]).read_bytes()
        assert hashlib.sha256(data).hexdigest() == entry["sha256"], entry["path"]
        assert len(data) == entry["wav_bytes"]
    on_disk = sorted(p.name for p in EXCERPTS_DIR.glob("*.wav"))
    assert on_disk == [e["path"] for e in doc["excerpts"]]


def test_fixture_windows_match_current_reef_audio():
    """Every recorded window hash equals the hash of the window reef_audio decodes now."""
    doc = _doc()
    rows = []
    for entry in doc["excerpts"]:
        prepared = reef_audio.audio_to_windows((EXCERPTS_DIR / entry["path"]).read_bytes())
        assert len(prepared.windows) == len(entry["windows"]), entry["path"]
        for recorded, window in zip(entry["windows"], prepared.windows):
            assert recorded["window_sha256"] == _window_sha256(window), (entry["path"], recorded["index"])
            rows.append(recorded["row"])
    assert rows == list(range(54))
