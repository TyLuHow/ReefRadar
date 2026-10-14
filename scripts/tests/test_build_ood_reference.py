"""
Tests for scripts/build_ood_reference.py (plan 05-12, ML-03 / ML-06).

The OOD reference is the 100 re-embedded training windows plus a cosine-distance
threshold: the 95th percentile of leave-one-site-out nearest-neighbour distances.
These tests recompute the committed sidecar from the committed rows, validate it
against the contract schema, and check the tamper detection of --check.
Offline: nothing here touches AWS.
"""

import hashlib
import json
import pathlib
import shutil
import sys

import numpy as np
import pytest

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent.parent
REPO_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))
sys.path.insert(0, str(REPO_ROOT / "lambdas" / "shared"))
import build_ood_reference as ood  # noqa: E402
import contract_lib  # noqa: E402
import reef_audio  # noqa: E402

INPUTS = REPO_ROOT / "models" / "interim-real-only" / "evaluation" / "inputs"
REEMBEDDED_F32 = INPUTS / "reembedded.f32"
REEMBEDDED_JSON = INPUTS / "reembedded.json"
SIDECAR = REPO_ROOT / "models" / "interim-real-only-2026.10.1" / "ood_reference.json"


def _sidecar():
    return json.loads(SIDECAR.read_text(encoding="utf-8"))


def _lf_sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def test_ood_threshold_self_check():
    """--check against the committed sidecar passes, and an independent numpy
    recomputation (float64, row-normalised) gives the same threshold."""
    assert ood.main(["--check"]) == 0

    rows = json.loads(REEMBEDDED_JSON.read_text(encoding="utf-8"))["rows"]
    sites = np.array([r["site_id"] for r in rows])
    X = np.frombuffer(REEMBEDDED_F32.read_bytes(), dtype="<f4").reshape(100, 1280).astype(np.float64)
    X = X / np.linalg.norm(X, axis=1, keepdims=True)
    cos = X @ X.T
    dists = np.array([1.0 - cos[i][sites != sites[i]].max() for i in range(100)])
    assert abs(float(np.percentile(dists, 95)) - _sidecar()["threshold"]) < 1e-12


def test_ood_sidecar_schema_valid():
    doc = _sidecar()
    contract_lib.validate(doc, "ood-reference")
    assert doc["ood_version"] == "ood-2026.10.1-nn1-cosine"
    assert doc["metric"] == "cosine_distance"
    assert doc["k"] == 1
    assert doc["preprocessing_spec_version"] == reef_audio.SPEC_VERSION
    assert doc["embedding_model"] == {"name": "surfperch", "version": "1.0", "dimension": 1280}
    assert doc["embeddings"]["uri"] == "v2/ood_reference.f32"
    assert doc["embeddings"]["dtype"] == "float32-le"
    assert doc["embeddings"]["dim"] == 1280
    assert doc["embeddings"]["count"] == 100
    assert doc["calibration"]["method"] == "leave_one_site_out_nearest_neighbour"
    assert doc["calibration"]["percentile"] == 95
    assert doc["calibration"]["pooled_n"] == 100
    per_site = {s["site_id"]: s for s in doc["calibration"]["per_site"]}
    assert sorted(per_site) == ["ind_D2", "ind_D3", "ind_H4", "ind_N1", "ken_H1"]
    assert all(s["n"] == 20 for s in per_site.values())
    assert doc["threshold"] > 0
    note = doc["embedding_space_note"]
    assert "reef_audio" in note and "cannot detect" in note


def test_ood_sha256_matches_rows():
    doc = _sidecar()
    assert doc["embeddings"]["sha256"] == hashlib.sha256(REEMBEDDED_F32.read_bytes()).hexdigest()
    rows = json.loads(REEMBEDDED_JSON.read_text(encoding="utf-8"))["rows"]
    assert doc["row_site_ids"] == [r["site_id"] for r in rows]
    by_name = {pathlib.PurePosixPath(i["path"]).name: i["sha256"] for i in doc["source_inputs"]}
    assert by_name["reembedded.f32"] == hashlib.sha256(REEMBEDDED_F32.read_bytes()).hexdigest()
    assert by_name["reembedded.json"] == _lf_sha256(REEMBEDDED_JSON)
    assert by_name["rows.json"] == _lf_sha256(INPUTS / "rows.json")


def _clusters(dim=1280, per_site=6, sites=("a", "b", "c")):
    """Every site has the SAME two tight clusters, so a left-out site's windows
    always have a close neighbour at another site."""
    rng = np.random.default_rng(0)
    centers = rng.normal(size=(2, dim))
    rows, site_ids = [], []
    for s in sites:
        for i in range(per_site):
            rows.append(centers[i % 2] + rng.normal(scale=0.01, size=dim))
            site_ids.append(s)
    return np.array(rows, dtype=np.float32), site_ids


def test_ood_synthetic_clusters():
    X, site_ids = _clusters()
    result = ood.calibrate(X, site_ids)
    assert result["threshold"] < 0.01
    assert result["pooled_n"] == len(site_ids)
    assert {s["site_id"] for s in result["per_site"]} == {"a", "b", "c"}

    # A far-away probe (orthogonal to both clusters) is outside the threshold.
    rng = np.random.default_rng(99)
    probe = rng.normal(size=1280)
    assert ood.nearest_distance(probe, X) > result["threshold"]
    # A probe sitting on a training window is inside it.
    assert ood.nearest_distance(X[0].astype(np.float64), X) <= result["threshold"]


def test_ood_check_mode_detects_tampering(tmp_path):
    work = tmp_path / "ood_reference.json"
    shutil.copyfile(SIDECAR, work)
    assert ood.main(["--check", "--out", str(work)]) == 0

    doc = json.loads(work.read_text(encoding="utf-8"))
    tampered = dict(doc)
    tampered["threshold"] = doc["threshold"] + 1e-6
    work.write_bytes(contract_lib.canonical_json_bytes(tampered))
    assert ood.main(["--check", "--out", str(work)]) == 1

    tampered = json.loads(json.dumps(doc))
    tampered["embeddings"]["sha256"] = "0" * 64
    work.write_bytes(contract_lib.canonical_json_bytes(tampered))
    assert ood.main(["--check", "--out", str(work)]) == 1

    tampered = json.loads(json.dumps(doc))
    tampered["source_inputs"][0]["sha256"] = "1" * 64
    work.write_bytes(contract_lib.canonical_json_bytes(tampered))
    assert ood.main(["--check", "--out", str(work)]) == 1


def test_ood_check_mode_missing_sidecar_fails(tmp_path):
    assert ood.main(["--check", "--out", str(tmp_path / "absent.json")]) == 1
