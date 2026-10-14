"""
Live checks for the excerpt embedding fixture (plan 05-11, ML-01 / ML-06).

Marked `live`: deselected by default (pytest.ini addopts -m "not live"). Run once with

    py -3.12 -m pytest -m live lambdas/preprocessor/tests/test_embedding_fixture_live.py

These tests call the deployed reefradar-2477-inference Lambda serially from the
owner account (781978598306) and never write the fixture; regenerating it is
scripts/record_embedding_fixture.py's deliberate record mode.
"""

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "scripts"))
sys.path.insert(0, str(REPO_ROOT / "lambdas" / "shared"))
import reef_audio  # noqa: E402
import record_embedding_fixture as rec  # noqa: E402
from surfperch_client import compare_embeddings, make_client  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _run_check(client, doc, stored, windows):
    fresh = client.embed(windows)
    tol = doc["tolerance"]
    result = compare_embeddings(stored, fresh, tol["cosine_min"], tol["max_abs"])
    print(f"min cosine {result['min_cosine']:.8f}, max abs {result['max_abs_diff']:.3e}")
    return tol, result


@pytest.mark.live
def test_live_regeneration_twice_matches_fixture_within_tolerance():
    doc = json.loads((FIXTURES / "excerpt_embeddings.json").read_text(encoding="utf-8"))
    stored = np.fromfile(FIXTURES / "excerpt_embeddings.f32", dtype="<f4").reshape(doc["count"], doc["dim"])
    entries, windows = rec.prepare(rec.DEFAULT_EXCERPTS_DIR)
    assert rec.verify_inputs(doc, entries) == []

    client = make_client(rec.DEFAULT_PROFILE)  # asserts account 781978598306 first
    client.warm()
    for run in (1, 2):
        tol, result = _run_check(client, doc, stored, windows)
        assert result["min_cosine"] >= tol["cosine_min"], f"run {run}: min cosine {result['min_cosine']}"
        assert result["max_abs_diff"] <= tol["max_abs"], f"run {run}: max abs {result['max_abs_diff']}"
        assert result["ok"], f"run {run}: rows outside tolerance"


@pytest.mark.live
def test_live_kaggle_model_files_match_pinned_sha256():
    kagglehub = pytest.importorskip("kagglehub")
    root = Path(kagglehub.model_download(reef_audio.KAGGLE_MODEL_HANDLE))
    for rel, expected in reef_audio.SAVED_MODEL_SHA256.items():
        actual = hashlib.sha256((root / rel).read_bytes()).hexdigest()
        assert actual == expected, rel
