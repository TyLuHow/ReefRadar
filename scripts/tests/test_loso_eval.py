"""
Tests for scripts/evaluate_loso.py (ML-03): site-held-out folds, metrics,
two-level cluster bootstrap and baselines.

`-k fold` covers the folds and the committed inputs; `-k bootstrap` covers the
bootstrap, estimability rules and baselines.
"""

import hashlib
import json
import pathlib
import sys
import time

import numpy as np
import pytest

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent.parent
REPO_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))
import evaluate_loso as ev  # noqa: E402

INPUTS = REPO_ROOT / "models" / "interim-real-only" / "evaluation" / "inputs"
EMB_PATH = INPUTS / "original.f32"
ROWS_PATH = INPUTS / "rows.json"
EXPECTED_SOURCE_SHA = "e18c133ef1d640014fc77d4083d66f9cafe0773f509c738fe953a4d5e346ca7a"
NOT_EVALUABLE = "restored_early not evaluable: class absent from the training fold"


@pytest.fixture(scope="module")
def loso():
    X, rows = ev.load_inputs(EMB_PATH, ROWS_PATH)
    folds, preds = ev.run_loso(X, rows, seed=42)
    return X, rows, folds, preds


def _sha(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


# --------------------------------------------------------------------------
# folds
# --------------------------------------------------------------------------

def test_fold_export_refuses_wrong_sha(tmp_path):
    bogus = tmp_path / "training.json"
    bogus.write_text(json.dumps({"samples": []}))
    out = tmp_path / "out"
    rc = ev.main(["export-original", "--training", str(bogus), "--out-dir", str(out)])
    assert rc == 1
    assert not (out / "original.f32").exists()
    assert not (out / "rows.json").exists()


def test_fold_original_inputs_pinned():
    doc = json.loads(ROWS_PATH.read_text(encoding="utf-8"))
    assert doc["source"]["sha256"] == EXPECTED_SOURCE_SHA
    assert doc["embeddings_sha256"] == _sha(EMB_PATH)
    assert EMB_PATH.stat().st_size == 100 * 1280 * 4
    assert doc["count"] == 100 and doc["dim"] == 1280 and doc["dtype"] == "float32-le"
    X, rows = ev.load_inputs(EMB_PATH, ROWS_PATH)
    assert X.shape == (100, 1280) and X.dtype == np.float32
    assert len(rows) == 100
    assert {r["country"] for r in rows} == {"Indonesia", "Kenya"}
    assert all({"file_id", "site_id", "country", "label"} <= set(r) for r in rows)


def test_fold_load_inputs_rejects_tampered_embeddings(tmp_path):
    bad = tmp_path / "original.f32"
    data = bytearray(EMB_PATH.read_bytes())
    data[0] ^= 0xFF
    bad.write_bytes(bytes(data))
    with pytest.raises(ValueError):
        ev.load_inputs(bad, ROWS_PATH)


def test_fold_held_out_site_never_in_training(loso):
    _, rows, folds, preds = loso
    assert len(folds) == 5
    for fold in folds:
        assert fold["held_out_site"] not in fold["train_sites"]
        assert len(fold["train_sites"]) == 4
        assert fold["n_test"] == 20
        held = [p for p in preds if p["site_id"] == fold["held_out_site"]]
        assert len(held) == 20
        train_rows = {r["row"] for r in rows if r["site_id"] in fold["train_sites"]}
        assert not train_rows & {p["row"] for p in held}


def test_fold_ind_n1_not_evaluable(loso):
    _, _, folds, _ = loso
    n1 = next(f for f in folds if f["held_out_site"] == "ind_N1")
    assert n1["evaluable"] is False
    assert n1["reason"] == NOT_EVALUABLE
    assert n1["train_classes"] == ["degraded", "healthy"]
    assert sum(n1["predicted_distribution"].values()) == 20
    others = [f for f in folds if f["held_out_site"] != "ind_N1"]
    assert all(f["evaluable"] and f["train_classes"] == ["degraded", "healthy", "restored_early"]
               for f in others)


def test_fold_seeded_determinism(loso):
    X, rows, _, preds = loso
    _, preds2 = ev.run_loso(X, rows, seed=42)
    assert [p["predicted_label"] for p in preds] == [p["predicted_label"] for p in preds2]
    assert [p["probabilities"] for p in preds] == [p["probabilities"] for p in preds2]


def test_fold_metrics_exclude_non_evaluable(loso):
    _, _, folds, preds = loso
    m = ev.metrics_from_predictions(preds, folds)
    assert set(m["per_class"]) == {"degraded", "healthy"}  # restored_early absent
    for c in m["per_class"].values():
        assert c["n_sites"] == 2 and c["n_windows"] == 40
    assert m["balanced_accuracy"]["n_sites"] == 4
    assert m["balanced_accuracy"]["n_windows"] == 80
    assert m["balanced_accuracy"]["value"] == pytest.approx(
        np.mean([c["value"] for c in m["per_class"].values()]))
    assert set(m["per_region"]) == {"Indonesia", "Kenya"}
    assert m["per_region"]["Indonesia"]["n_sites"] == 3
    assert m["per_region"]["Indonesia"]["n_windows"] == 60
    assert m["per_region"]["Kenya"]["n_sites"] == 1
    assert m["per_region"]["Kenya"]["n_windows"] == 20
    assert [n["held_out_site"] for n in m["not_evaluable"]] == ["ind_N1"]


# --------------------------------------------------------------------------
# synthetic fixtures for the bootstrap
# --------------------------------------------------------------------------

def _synthetic(correct_by_site, classes_by_site, countries_by_site, n=20):
    """Build (folds, predictions) with the given number of correct windows per site."""
    folds, preds = [], []
    for site in sorted(correct_by_site):
        true = classes_by_site[site]
        wrong = "other" if true != "other" else "third"
        train_classes = sorted(set(classes_by_site.values()) | {"other"})
        folds.append({
            "held_out_site": site, "country": countries_by_site[site], "true_class": true,
            "train_sites": sorted(s for s in correct_by_site if s != site),
            "train_classes": train_classes, "n_test": n, "evaluable": True, "reason": None,
            "correct": correct_by_site[site], "predicted_distribution": {},
        })
        for j in range(n):
            ok = j < correct_by_site[site]
            preds.append({
                "row": len(preds), "file_id": f"{site}_{j}", "site_id": site,
                "country": countries_by_site[site], "true_label": true,
                "predicted_label": true if ok else wrong, "probabilities": {},
            })
    return folds, preds


CLASSES = {"a1": "alpha", "a2": "alpha", "b1": "beta", "b2": "beta"}
COUNTRIES = {"a1": "X", "a2": "X", "b1": "Y", "b2": "Y"}


# --------------------------------------------------------------------------
# bootstrap
# --------------------------------------------------------------------------

def test_bootstrap_seeded_repeatability(loso):
    _, _, folds, preds = loso
    r1 = ev.two_level_bootstrap(preds, folds, B=500, seed=20261011)
    r2 = ev.two_level_bootstrap(preds, folds, B=500, seed=20261011)
    assert r1 == r2
    assert r1["rng"] == "numpy.random.RandomState"
    assert r1["seed"] == 20261011 and r1["B"] == 500
    assert r1["numpy_version"] == np.__version__
    r3 = ev.two_level_bootstrap(preds, folds, B=500, seed=1)
    assert r3["metrics"] != r1["metrics"]


def test_bootstrap_separable_interval_brackets_point():
    folds, preds = _synthetic({s: 20 for s in CLASSES}, CLASSES, COUNTRIES)
    res = ev.two_level_bootstrap(preds, folds, B=500)
    for c in ("alpha", "beta"):
        m = res["metrics"]["per_class"][c]
        assert m["value"] == 1.0 and m["ci_low"] == 1.0 and m["ci_high"] == 1.0
        assert m["ci_status"] == "estimated"
    # mixed data: the point estimate lies within its interval
    folds, preds = _synthetic({"a1": 14, "a2": 8, "b1": 12, "b2": 4}, CLASSES, COUNTRIES)
    res = ev.two_level_bootstrap(preds, folds, B=2000)
    for m in list(res["metrics"]["per_class"].values()) + [res["metrics"]["balanced_accuracy"]]:
        assert m["ci_low"] <= m["value"] <= m["ci_high"]


def test_bootstrap_single_site_not_estimable():
    countries = {"a1": "X", "a2": "X", "b1": "Y", "b2": "Z"}  # Y and Z have one site each
    folds, preds = _synthetic({"a1": 10, "a2": 6, "b1": 5, "b2": 8}, CLASSES, countries)
    res = ev.two_level_bootstrap(preds, folds, B=300)
    y = res["metrics"]["per_region"]["Y"]
    assert y["ci_low"] is None and y["ci_high"] is None
    assert y["ci_status"] == "not_estimable_1_site"
    assert y["n_sites"] == 1 and y["n_windows"] == 20
    x = res["metrics"]["per_region"]["X"]
    assert x["ci_status"] == "estimated" and x["ci_low"] is not None


def test_bootstrap_defined_fraction_reported():
    folds, preds = _synthetic({"a1": 10, "a2": 6, "b1": 5, "b2": 8}, CLASSES, COUNTRIES)
    res = ev.two_level_bootstrap(preds, folds, B=2000)
    pc = res["metrics"]["per_class"]["alpha"]
    # undefined when both alpha sites are missing from a 4-site draw: probability 1/16
    assert 0.90 < pc["defined_fraction"] < 0.97
    bal = res["metrics"]["balanced_accuracy"]
    assert bal["defined_fraction"] <= pc["defined_fraction"]
    for m in res["metrics"]["per_region"].values():
        assert m["defined_fraction"] == 1.0
    for m in [bal, *res["metrics"]["per_class"].values(), *res["metrics"]["per_region"].values()]:
        assert {"value", "ci_low", "ci_high", "ci_status", "n_sites", "n_windows",
                "defined_fraction"} <= set(m)


def test_bootstrap_baselines_shape(loso):
    _, _, folds, preds = loso
    point = ev.metrics_from_predictions(preds, folds)
    base = ev.baselines(folds, preds)
    assert set(base) == {"training_majority", "uniform_random"}
    for name in base:
        b = base[name]
        for c, m in b["per_class"].items():
            assert m["n_sites"] == point["per_class"][c]["n_sites"]
            assert m["n_windows"] == point["per_class"][c]["n_windows"]
        assert b["balanced_accuracy"]["n_windows"] == point["balanced_accuracy"]["n_windows"]
        assert set(b["per_region"]) == set(point["per_region"])
    # every evaluable fold model has 3 classes, so uniform expectation is 1/3
    assert base["uniform_random"]["balanced_accuracy"]["value"] == pytest.approx(1 / 3)
    # the model is below both baselines' chance level on the original inputs
    assert point["balanced_accuracy"]["value"] < base["uniform_random"]["balanced_accuracy"]["value"]


def test_bootstrap_committed_inputs_full_b(loso):
    _, _, folds, preds = loso
    t0 = time.time()
    res = ev.two_level_bootstrap(preds, folds)  # defaults: B = 10,000, seed 20261011
    assert time.time() - t0 < 10
    assert res["B"] == 10000
    assert res["metrics"]["per_region"]["Kenya"]["ci_status"] == "not_estimable_1_site"
    assert res["metrics"]["per_region"]["Indonesia"]["ci_status"] == "estimated"
    for c in ("degraded", "healthy"):
        m = res["metrics"]["per_class"][c]
        assert m["ci_status"] == "estimated"
        assert m["ci_low"] <= m["value"] <= m["ci_high"]
