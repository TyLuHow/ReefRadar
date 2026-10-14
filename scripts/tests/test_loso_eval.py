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


import contract_lib  # noqa: E402
import subprocess  # noqa: E402

REPORT_PATH = REPO_ROOT / "models" / "interim-real-only" / "evaluation" / "report.json"
ORIGINAL_V = "interim-real-only"
SERVED_V = "interim-real-only-2026.10.1"


@pytest.fixture(scope="module")
def report():
    return json.loads(REPORT_PATH.read_text(encoding="utf-8"))


def _model(report, version):
    return next(m for m in report["models"] if m["model_version"] == version)


def _git_out(*args):
    try:
        return subprocess.run(["git", *args], cwd=str(REPO_ROOT), capture_output=True,
                              text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


# --------------------------------------------------------------------------
# evaluation report (plan 05-13): `-k report` and `-k reproduces`
# --------------------------------------------------------------------------

def test_report_validates_against_schema(report):
    contract_lib.validate(report, "evaluation-report")
    assert report["report_version"] == "loso-2026.10.1"
    assert report["method"] == "leave_one_site_out"
    assert report["served_model_version"] == SERVED_V
    assert report["schema_version"] == 1
    # the canonical bytes on disk are exactly what the writer would produce
    assert REPORT_PATH.read_bytes() == contract_lib.canonical_json_bytes(report)


def test_report_inputs_pinned(report):
    by_name = {i["name"]: i for i in report["inputs"]}
    assert set(by_name) == {"rows", "original_embeddings", "reembedded_rows",
                            "reembedded_embeddings", "training_file"}
    for name, rel in [("rows", "rows.json"), ("reembedded_rows", "reembedded.json")]:
        assert by_name[name]["sha256"] == ev._text_sha256(INPUTS / rel)
        assert by_name[name]["path"].endswith(rel)
    for name, rel in [("original_embeddings", "original.f32"), ("reembedded_embeddings", "reembedded.f32")]:
        assert by_name[name]["sha256"] == _sha(INPUTS / rel)
        assert by_name[name]["path"].endswith(rel)
    assert by_name["training_file"]["sha256"] == EXPECTED_SOURCE_SHA
    assert all(i["rows"] == 100 for i in report["inputs"])

    assert report["trainer"]["script"] == "scripts/train_interim_real_only.py"
    assert report["trainer"]["seed"] == 42
    sha = report["trainer"]["git_sha"]
    if _git_out("rev-parse", "--is-shallow-repository") == "false":
        assert _git_out("cat-file", "-t", sha) == "commit"
        assert _git_out("log", "-1", "--format=%H", "--", "scripts/train_interim_real_only.py") == sha
    b = report["bootstrap"]
    assert (b["B"], b["levels"], b["seed"], b["rng"]) == (10000, 2, 20261011, "numpy.random.RandomState")
    assert b["interval"] == "percentile_95" and b["min_sites_for_interval"] == 2
    assert b["numpy_version"]


def test_report_both_models_and_served_flag(report):
    assert [m["model_version"] for m in report["models"]] == [ORIGINAL_V, SERVED_V]
    orig, succ = _model(report, ORIGINAL_V), _model(report, SERVED_V)
    assert (orig["embeddings"], orig["preprocessing_spec_version"], orig["served"]) == (
        "original", "preproc-2026.10.0-as-deployed", False)
    assert (succ["embeddings"], succ["preprocessing_spec_version"], succ["served"]) == (
        "reembedded", "preproc-2026.10.1-reef-audio", True)
    assert sum(1 for m in report["models"] if m["served"]) == 1
    for m in report["models"]:
        assert len(m["folds"]) == 5 and len(m["predictions"]) == 100
        assert set(m["metrics"]["per_class"]) == {"degraded", "healthy"}
        assert set(m["metrics"]["per_region"]) == {"Indonesia", "Kenya"}
        assert m["metrics"]["balanced_accuracy"]["n_sites"] == 4
        assert set(m["baselines"]) == {"training_majority", "uniform_random"}
        for metric in [*m["metrics"]["per_class"].values(), *m["metrics"]["per_region"].values(),
                       m["metrics"]["balanced_accuracy"]]:
            assert metric["n_sites"] >= 1 and metric["n_windows"] >= 1
            assert "defined_fraction" in metric and "ci_status" in metric
    assert report["drift_probe"]["pairs"] == 100
    cos = report["drift_probe"]["cosine"]
    assert cos["min"] <= cos["median"] <= cos["max"] and cos["min"] <= cos["mean"] <= cos["max"]


def test_report_not_evaluable_and_not_estimable(report):
    for m in report["models"]:
        n1 = next(f for f in m["folds"] if f["held_out_site"] == "ind_N1")
        assert n1["evaluable"] is False
        assert n1["reason"] == NOT_EVALUABLE
        assert n1["correct"] is None
        assert "restored_early" not in n1["train_classes"]
        kenya = m["metrics"]["per_region"]["Kenya"]
        assert kenya["ci_status"] == "not_estimable_1_site"
        assert kenya["ci_low"] is None and kenya["ci_high"] is None
        assert kenya["n_sites"] == 1
        assert m["metrics"]["per_region"]["Indonesia"]["ci_status"] == "estimated"


def test_report_invalidated_figures(report):
    figs = {f["figure"]: f for f in report["invalidated_figures"]}
    assert set(figs) == {"split_accuracy", "overall_accuracy"}
    assert "1.0" in figs["split_accuracy"]["value"]
    assert "models/interim-real-only/model_config.json" in figs["split_accuracy"]["source"]
    assert "90.0%" in figs["overall_accuracy"]["value"]
    assert "docs/MODEL_EVALUATION.md" in figs["overall_accuracy"]["source"]
    assert all(f["reason"] for f in figs.values())
    assert any("35 distinct" in c for c in report["caveats"])
    assert any("confounded" in c for c in report["caveats"])
    assert any("earlier training pipeline" in c for c in report["caveats"])


def test_report_reproduces_metrics_from_predictions(report):
    """Every stored metric and interval is recomputed exactly from the stored predictions."""
    b = report["bootstrap"]
    for m in report["models"]:
        folds, preds = m["folds"], m["predictions"]
        boot = ev.two_level_bootstrap(preds, folds, B=b["B"], seed=b["seed"])["metrics"]
        point = ev.metrics_from_predictions(preds, folds)
        for c, stored in m["metrics"]["per_class"].items():
            assert stored == ev._schema_metric(boot["per_class"][c])
            assert stored["value"] == point["per_class"][c]["value"]
        for g, stored in m["metrics"]["per_region"].items():
            assert stored == ev._schema_metric(boot["per_region"][g])
            assert stored["value"] == point["per_region"][g]["value"]
        assert m["metrics"]["balanced_accuracy"] == ev._schema_metric(boot["balanced_accuracy"])
        assert m["metrics"]["balanced_accuracy"]["value"] == point["balanced_accuracy"]["value"]
        base = ev.baselines(folds, preds)
        for name in ("training_majority", "uniform_random"):
            assert m["baselines"][name] == ev._baseline_metric(base[name]["balanced_accuracy"])
        # stored per-fold correct counts agree with the stored predictions
        for f in folds:
            if f["evaluable"]:
                ps = [p for p in preds if p["site_id"] == f["held_out_site"]]
                assert f["correct"] == sum(p["predicted_label"] == p["true_label"] for p in ps)
    X_orig, _ = ev.load_inputs(EMB_PATH, ROWS_PATH)
    X_re, _ = ev.load_reembedded(INPUTS)
    assert ev.drift_probe(X_orig, X_re, report["drift_probe"]["note"]) == report["drift_probe"]


def test_report_reproduces_refit_within_tolerance(report):
    """Refitting every fold from the committed inputs reproduces the stored predictions.

    Labels must match except on rows whose stored top-two probability margin is
    below 1e-3; probabilities must agree within 1e-3.
    """
    X_orig, rows = ev.load_inputs(EMB_PATH, ROWS_PATH)
    X_re, _ = ev.load_reembedded(INPUTS)
    for version, X in ((ORIGINAL_V, X_orig), (SERVED_V, X_re)):
        stored = _model(report, version)
        folds, preds = ev.run_loso(X, rows, seed=report["trainer"]["seed"])
        assert folds == stored["folds"]
        assert len(preds) == len(stored["predictions"])
        for new, old in zip(preds, stored["predictions"]):
            assert (new["file_id"], new["site_id"], new["true_label"]) == (
                old["file_id"], old["site_id"], old["true_label"])
            top = sorted(old["probabilities"].values(), reverse=True)
            margin = top[0] - top[1]
            if margin >= ev.NEAR_TIE_MARGIN:
                assert new["predicted_label"] == old["predicted_label"]
            for k, v in old["probabilities"].items():
                assert new["probabilities"][k] == pytest.approx(v, abs=1e-3)


REPORT_MD_PATH = REPORT_PATH.with_name("REPORT.md")
DOC_PATH = REPO_ROOT / "docs" / "MODEL_EVALUATION.md"
BELOW = "below chance"
IDENTIFIED = "the model identified sites, not reef health"


def _with_balanced_interval(report, lo, hi, which=None):
    import copy
    r = copy.deepcopy(report)
    for m in r["models"]:
        if which is None or m["model_version"] == which:
            m["metrics"]["balanced_accuracy"]["ci_low"] = lo
            m["metrics"]["balanced_accuracy"]["ci_high"] = hi
    return r


def test_report_markdown_rendered_from_json(report):
    md = ev.render_markdown(report)
    assert REPORT_MD_PATH.read_bytes() == md.encode("utf-8")
    assert b"\r\n" not in REPORT_MD_PATH.read_bytes()
    assert f"The model served is `{report['served_model_version']}`" in md
    for m in report["models"]:
        assert f"## Model `{m['model_version']}`" in md
        bal = m["metrics"]["balanced_accuracy"]
        assert ev._f(bal["value"]) in md
        assert ev._interval_text(bal) in md
        for metric in (*m["metrics"]["per_class"].values(), *m["metrics"]["per_region"].values()):
            assert ev._f(metric["value"]) in md
        for f in m["folds"]:
            assert f["held_out_site"] in md
    assert NOT_EVALUABLE in md
    assert "CI not estimable (1 site)" in md
    for fig in report["invalidated_figures"]:
        assert fig["reason"] in md
    for c in report["caveats"]:
        assert c in md
    for i in report["inputs"]:
        assert i["sha256"] in md
    # nothing in the Markdown is a number that report.json does not hold: every
    # decimal in the text is formatted from the report (spot check on the served model)
    served = next(m for m in report["models"] if m["served"])
    assert ev._f(served["metrics"]["balanced_accuracy"]["ci_high"]) in md


@pytest.mark.parametrize("lo,hi,expect_below", [
    (0.0, 0.2, True),     # entirely under 0.5: below chance
    (0.6, 0.9, False),    # entirely above 0.5
    (0.3, 0.7, False),    # straddles 0.5
])
def test_report_markdown_states_chance_honestly(report, lo, hi, expect_below):
    r = _with_balanced_interval(report, lo, hi)
    md = ev.render_markdown(r)
    assert (BELOW in md) is expect_below
    assert (IDENTIFIED in md.lower()) is expect_below
    if not expect_below:
        # the text places the interval against 0.5 instead
        bal = r["models"][1]["metrics"]["balanced_accuracy"]
        sentence = ev.chance_statement(r["models"][1])
        assert ev._f(0.5) in sentence
        assert ("contains that line" in sentence) or ("whole interval lies above" in sentence)
        assert bal["ci_low"] == lo


def test_report_markdown_chance_is_per_model(report):
    r = _with_balanced_interval(report, 0.0, 0.2, which=ORIGINAL_V)
    r = _with_balanced_interval(r, 0.3, 0.7, which=SERVED_V)
    assert BELOW in ev.chance_statement(_model(r, ORIGINAL_V))
    assert BELOW not in ev.chance_statement(_model(r, SERVED_V))
    assert "identified sites" not in ev.chance_statement(_model(r, SERVED_V))


def test_model_evaluation_doc_withdraws_split_figures(report):
    doc = DOC_PATH.read_text(encoding="utf-8")
    for line in doc.splitlines():
        if "90.0%" in line:
            assert "withdrawn" in line
    for stale in ("Overall Accuracy", "Per-Class Performance", "Confusion Matrix",
                  "Confidence Calibration", "test_accuracy"):
        assert stale not in doc
    assert "models/interim-real-only/evaluation/REPORT.md" in doc
    assert "random split" in doc
    served = _model(report, SERVED_V)["metrics"]["balanced_accuracy"]
    assert ev._f(served["value"]) in doc
    assert ev._f(served["ci_low"]) in doc and ev._f(served["ci_high"]) in doc
    orig = _model(report, ORIGINAL_V)["metrics"]["balanced_accuracy"]
    assert ev._f(orig["value"]) in doc and ev._f(orig["ci_high"]) in doc
    assert SERVED_V in doc
    # the page's chance reading matches the report's intervals
    assert served["ci_low"] < 0.5 < served["ci_high"]
    assert orig["ci_high"] < 0.5


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
