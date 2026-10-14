"""
Pins for the committed re-embedded training inputs (plan 05-11, ML-01 / ML-03 /
ML-06). The 100 training files were re-embedded through reef_audio and the
deployed inference Lambda by scripts/reembed_training.py; these tests make sure the
committed rows still match the originals one-to-one and that the data files were
not edited after the live run. Offline: nothing here touches AWS or figshare.
"""

import hashlib
import json
import pathlib
import sys

import numpy as np

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent.parent
REPO_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))
sys.path.insert(0, str(REPO_ROOT / "lambdas" / "shared"))
import reef_audio  # noqa: E402

INPUTS = REPO_ROOT / "models" / "interim-real-only" / "evaluation" / "inputs"
REEMBEDDED_JSON = INPUTS / "reembedded.json"
REEMBEDDED_F32 = INPUTS / "reembedded.f32"
ROWS_JSON = INPUTS / "rows.json"


def _sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load():
    return json.loads(REEMBEDDED_JSON.read_text(encoding="utf-8")), json.loads(ROWS_JSON.read_text(encoding="utf-8"))


def test_reembedded_rows_match_original_order():
    doc, rows = _load()
    assert [r["file_id"] for r in doc["rows"]] == [r["file_id"] for r in rows["rows"]]
    assert [r["row"] for r in doc["rows"]] == list(range(100))
    assert [r["site_id"] for r in doc["rows"]] == [r["site_id"] for r in rows["rows"]]
    assert [r["label"] for r in doc["rows"]] == [r["label"] for r in rows["rows"]]


def test_reembedded_sha256_pins():
    doc, _rows = _load()
    assert doc["embeddings_sha256"] == _sha256(REEMBEDDED_F32)
    assert doc["source_rows"]["sha256"] == _sha256(ROWS_JSON)
    assert doc["count"] == 100
    assert doc["dim"] == 1280
    assert doc["dtype"] == "float32-le"
    assert REEMBEDDED_F32.stat().st_size == 100 * 1280 * 4 == 512000
    for row in doc["rows"]:
        assert len(row["wav_sha256"]) == 64
        assert len(row["window_sha256"]) == 64
        assert row["window_index"] == 0


def test_reembedded_spec_version_is_reef_audio():
    doc, _rows = _load()
    assert doc["spec_version"] == reef_audio.SPEC_VERSION


def test_reembedded_rows_finite():
    X = np.fromfile(REEMBEDDED_F32, dtype="<f4").reshape(100, 1280)
    assert np.isfinite(X).all()
    # no all-zero or constant rows: every row is a real embedding
    assert (X.std(axis=1) > 0).all()


def test_reembedded_drift_probe_is_recorded_from_the_rows():
    """The recorded drift is recomputable from the committed original and re-embedded rows."""
    doc, rows = _load()
    A = np.fromfile(INPUTS / rows["embeddings_file"], dtype="<f4").reshape(100, 1280).astype(np.float64)
    B = np.fromfile(REEMBEDDED_F32, dtype="<f4").reshape(100, 1280).astype(np.float64)
    cos = (A * B).sum(axis=1) / (np.linalg.norm(A, axis=1) * np.linalg.norm(B, axis=1))
    probe = doc["drift_probe"]
    assert probe["pairs"] == 100
    assert abs(float(cos.mean()) - probe["cosine"]["mean"]) < 1e-6
    assert abs(float(np.median(cos)) - probe["cosine"]["median"]) < 1e-6
    assert abs(float(cos.min()) - probe["cosine"]["min"]) < 1e-6
    assert abs(float(cos.max()) - probe["cosine"]["max"]) < 1e-6
