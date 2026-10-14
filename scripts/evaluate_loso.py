#!/usr/bin/env python3
"""
Grouped (leave-one-site-out) evaluation of the interim real-only classifier
(ML-03, Phase 5).

Every fold retrains the exact interim recipe (``train_interim_real_only.train_mlp``,
seed 42) on all windows of the four other sites and tests on the held-out
site's 20 windows. Per-window predictions are kept so every metric is
recomputable. Intervals come from a two-level cluster bootstrap (sites with
replacement, then windows within each drawn site).

Subcommands
-----------
    export-original   pack the gitignored training file into the committed,
                      sha256-pinned inputs (original.f32 + rows.json)
    run               run the five folds from committed inputs and print the
                      fold table and metrics as JSON lines (``--bootstrap`` adds
                      seeded intervals and baselines)
    report            run both model families (original and re-embedded rows),
                      validate against evaluation-report.schema.json and write
                      the canonical report.json (and, from plan 05-13 task 2,
                      the rendered REPORT.md)

Honest-reading caveats (carried into the model card by plan 05-13):

* The committed model was trained on 85 rows after an outer random 15 percent
  split (train_interim_real_only.py main); a site-held-out fold trains on all 80
  rows of the other four sites and does not replicate that split.
* Four evaluable sites give only 35 distinct site multisets, so the bootstrap
  distribution is lumpy and the percentile interval is indicative only
  (Cameron, Gelbach and Miller 2008: cluster inference with few clusters).
* Resampling both levels double-counts within-cluster variance relative to
  cluster-only resampling (Field and Welsh 2007), so the intervals are
  conservative (too wide), not too narrow.
* Sites are confounded with country, recorder and class (all degraded sites
  are Indonesian; one healthy site is Kenyan). A site-held-out fold measures
  site shift, not reef-health generalisation.
* ind_N1 is the only restored_early site; its fold has no restored_early in
  training, so it is reported as not evaluable and excluded from every average.
* The bootstrap uses the frozen legacy numpy.random.RandomState stream and
  records the NumPy version with every result.
"""

import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys

import numpy as np

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import contract_lib  # noqa: E402
import train_interim_real_only as trainer  # noqa: E402

EXPECTED_TRAINING_SHA256 = "e18c133ef1d640014fc77d4083d66f9cafe0773f509c738fe953a4d5e346ca7a"
SOURCE_KEY = "training/training_test_20.json"
EMBEDDING_DIM = 1280
SCHEMA_VERSION = 1
EMBEDDING_SPACE_ORIGINAL = (
    "original training pipeline (file peak-normalised to 1.0, linear interpolation; "
    "scripts/generate_training_embeddings.py)"
)
DEFAULT_MODEL_CONFIG = REPO_ROOT / "models" / "interim-real-only" / "model_config.json"
DEFAULT_OUT_DIR = "models/interim-real-only/evaluation/inputs"

NOT_EVALUABLE_REASON = "restored_early not evaluable: class absent from the training fold"
DEFAULT_SEED = 42
DEFAULT_B = 10000
DEFAULT_BOOTSTRAP_SEED = 20261011
MIN_SITES_FOR_INTERVAL = 2
CI_ESTIMATED = "estimated"
CI_NOT_ESTIMABLE_1_SITE = "not_estimable_1_site"
CI_NOT_ESTIMABLE_UNDEFINED = "not_estimable_undefined"
RNG_NAME = "numpy.random.RandomState"

# ---- evaluation report (plan 05-13) ----
REPORT_VERSION = "loso-2026.10.1"
REPORT_SCHEMA_STEM = "evaluation-report"
ORIGINAL_MODEL_VERSION = "interim-real-only"
ORIGINAL_SPEC_VERSION = "preproc-2026.10.0-as-deployed"
SERVED_MODEL_VERSION = "interim-real-only-2026.10.1"
SERVED_SPEC_VERSION = "preproc-2026.10.1-reef-audio"
DEFAULT_INPUTS_DIR = "models/interim-real-only/evaluation/inputs"
DEFAULT_REPORT_JSON = "models/interim-real-only/evaluation/report.json"
DEFAULT_REPORT_MD = "models/interim-real-only/evaluation/REPORT.md"
TRAINER_SCRIPT = "scripts/train_interim_real_only.py"
GENERATOR_SCRIPT = "scripts/evaluate_loso.py"
PROBABILITY_DECIMALS = 6
NEAR_TIE_MARGIN = 1e-3


class ExportError(Exception):
    pass


# --------------------------------------------------------------------------
# Inputs
# --------------------------------------------------------------------------

def _sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def _canonical_json(obj):
    return json.dumps(obj, sort_keys=True, indent=2) + "\n"


def export_original(training_path, out_dir, model_config_path=DEFAULT_MODEL_CONFIG):
    """Pack the original training rows into original.f32 + rows.json."""
    training_path = str(training_path)
    actual = trainer.file_sha256(training_path)
    if actual != EXPECTED_TRAINING_SHA256:
        raise ExportError(
            f"training file sha256 {actual} != expected {EXPECTED_TRAINING_SHA256}; refusing to export"
        )
    with open(training_path, "r") as f:
        data = json.load(f)
    samples = data["samples"]
    with open(model_config_path, "r") as f:
        cfg = json.load(f)
    country_by_site = {s["site_id"]: s["country"] for s in cfg["training_sites"]}

    X = np.array([s["embedding"] for s in samples], dtype="<f4")
    if X.shape != (len(samples), EMBEDDING_DIM):
        raise ExportError(f"unexpected embedding shape {X.shape}")
    emb_bytes = X.tobytes()

    rows = []
    for i, s in enumerate(samples):
        rows.append({
            "row": i,
            "file_id": s["file_id"],
            "site_id": s["site_id"],
            "country": country_by_site[s["site_id"]],
            "label": s["label"],
            "timestamp": s.get("timestamp"),
        })
    doc = {
        "schema_version": SCHEMA_VERSION,
        "source": {"key": SOURCE_KEY, "sha256": actual},
        "dtype": "float32-le",
        "dim": EMBEDDING_DIM,
        "count": len(samples),
        "embeddings_file": "original.f32",
        "embeddings_sha256": _sha256_bytes(emb_bytes),
        "embedding_space": EMBEDDING_SPACE_ORIGINAL,
        "rows": rows,
    }
    out_dir = pathlib.Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "original.f32").write_bytes(emb_bytes)
    with open(out_dir / "rows.json", "w", encoding="utf-8", newline="\n") as f:
        f.write(_canonical_json(doc))
    return doc


def load_inputs(embeddings_path, rows_path):
    """Load (X float32 (n, 1280), rows) and verify the pinned embeddings sha256."""
    with open(rows_path, "r", encoding="utf-8") as f:
        doc = json.load(f)
    raw = pathlib.Path(embeddings_path).read_bytes()
    if _sha256_bytes(raw) != doc["embeddings_sha256"]:
        raise ValueError(
            f"embeddings sha256 mismatch for {embeddings_path}: "
            f"{_sha256_bytes(raw)} != {doc['embeddings_sha256']}"
        )
    dim = doc["dim"]
    X = np.frombuffer(raw, dtype="<f4").reshape(-1, dim).astype(np.float32)
    rows = doc["rows"]
    if X.shape[0] != len(rows) or X.shape[0] != doc["count"]:
        raise ValueError("row count does not match embeddings")
    return X, rows


# --------------------------------------------------------------------------
# Leave-one-site-out folds
# --------------------------------------------------------------------------

def run_loso(X, rows, seed=DEFAULT_SEED):
    """Five site-held-out folds with the exact interim recipe.

    Returns (folds, predictions).
    """
    X = np.asarray(X, dtype=np.float32)
    sites = sorted({r["site_id"] for r in rows})
    folds = []
    predictions = []
    for site in sites:
        test_idx = [i for i, r in enumerate(rows) if r["site_id"] == site]
        train_idx = [i for i, r in enumerate(rows) if r["site_id"] != site]
        train_labels = sorted({rows[i]["label"] for i in train_idx})
        label_to_idx = {l: k for k, l in enumerate(train_labels)}
        y_train = np.array([label_to_idx[rows[i]["label"]] for i in train_idx], dtype=np.int64)
        weights, _info = trainer.train_mlp(X[train_idx], y_train, seed=seed)
        probs = trainer.predict_proba(X[test_idx], weights)

        true_class = rows[test_idx[0]]["label"]
        country = rows[test_idx[0]]["country"]
        evaluable = true_class in label_to_idx
        dist = {}
        correct = 0
        for j, i in enumerate(test_idx):
            pred = train_labels[int(np.argmax(probs[j]))]
            dist[pred] = dist.get(pred, 0) + 1
            if pred == rows[i]["label"]:
                correct += 1
            predictions.append({
                "row": rows[i]["row"],
                "file_id": rows[i]["file_id"],
                "site_id": site,
                "country": country,
                "true_label": rows[i]["label"],
                "predicted_label": pred,
                "probabilities": {l: float(probs[j][k]) for l, k in label_to_idx.items()},
            })
        folds.append({
            "held_out_site": site,
            "country": country,
            "true_class": true_class,
            "train_sites": sorted({rows[i]["site_id"] for i in train_idx}),
            "train_classes": train_labels,
            "n_test": len(test_idx),
            "evaluable": evaluable,
            "reason": None if evaluable else NOT_EVALUABLE_REASON,
            "correct": correct if evaluable else None,
            "predicted_distribution": dict(sorted(dist.items())),
        })
    return folds, predictions


# --------------------------------------------------------------------------
# Metrics
# --------------------------------------------------------------------------

def _site_outcomes(predictions, folds):
    """Per evaluable site: true class, country and the per-window correct array."""
    by_site = {}
    for p in predictions:
        by_site.setdefault(p["site_id"], []).append(p)
    outcomes = []
    for fold in sorted(folds, key=lambda f: f["held_out_site"]):
        if not fold["evaluable"]:
            continue
        site = fold["held_out_site"]
        ps = by_site[site]
        correct = np.array([p["predicted_label"] == p["true_label"] for p in ps], dtype=np.int64)
        outcomes.append({
            "site_id": site,
            "country": fold["country"],
            "true_class": fold["true_class"],
            "correct": correct,
            "n": len(ps),
        })
    return outcomes


def _metric(value, n_sites, n_windows):
    return {"value": value, "n_sites": n_sites, "n_windows": n_windows}


def _metrics_from_outcomes(outcomes):
    classes = sorted({o["true_class"] for o in outcomes})
    per_class = {}
    for c in classes:
        sub = [o for o in outcomes if o["true_class"] == c]
        tot = sum(o["n"] for o in sub)
        per_class[c] = _metric(float(sum(o["correct"].sum() for o in sub)) / tot, len(sub), tot)
    balanced = None
    if per_class:
        balanced = _metric(
            float(np.mean([m["value"] for m in per_class.values()])),
            len(outcomes), sum(o["n"] for o in outcomes),
        )
    per_region = {}
    for g in sorted({o["country"] for o in outcomes}):
        sub = [o for o in outcomes if o["country"] == g]
        tot = sum(o["n"] for o in sub)
        per_region[g] = _metric(float(sum(o["correct"].sum() for o in sub)) / tot, len(sub), tot)
    overall = None
    if outcomes:
        tot = sum(o["n"] for o in outcomes)
        overall = _metric(float(sum(o["correct"].sum() for o in outcomes)) / tot, len(outcomes), tot)
    return {
        "per_class": per_class,
        "balanced_accuracy": balanced,
        "per_region": per_region,
        "overall_accuracy": overall,
    }


def metrics_from_predictions(predictions, folds):
    """Per-class recall, balanced accuracy and per-region accuracy over evaluable folds only."""
    out = _metrics_from_outcomes(_site_outcomes(predictions, folds))
    out["not_evaluable"] = [
        {
            "held_out_site": f["held_out_site"],
            "true_class": f["true_class"],
            "country": f["country"],
            "reason": f["reason"],
            "predicted_distribution": f["predicted_distribution"],
            "n_windows": f["n_test"],
        }
        for f in folds if not f["evaluable"]
    ]
    return out


# --------------------------------------------------------------------------
# Baselines
# --------------------------------------------------------------------------

def baselines(folds, predictions):
    """Trivial baselines with the same n_sites / n_windows as the model metrics.

    training_majority: each fold predicts its training-majority class (ties by
    sorted label). uniform_random: expected recall 1/K for a K-class fold model.
    """
    by_site = {}
    for p in predictions:
        by_site.setdefault(p["site_id"], []).append(p)

    maj_preds = []
    for fold in folds:
        counts = {}
        for s in fold["train_sites"]:  # each site carries one true label
            lab = by_site[s][0]["true_label"]
            counts[lab] = counts.get(lab, 0) + len(by_site[s])
        top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        for p in by_site[fold["held_out_site"]]:
            maj_preds.append({**p, "predicted_label": top})
    majority = _metrics_from_outcomes(_site_outcomes(maj_preds, folds))

    # Uniform random: expected correct fraction 1/K for each evaluable fold.
    outcomes = _site_outcomes(predictions, folds)
    k_by_site = {f["held_out_site"]: len(f["train_classes"]) for f in folds}
    expected = []
    for o in outcomes:
        e = dict(o)
        e["correct"] = None
        e["expected"] = o["n"] / k_by_site[o["site_id"]]
        expected.append(e)

    def _agg(sub):
        tot = sum(o["n"] for o in sub)
        return _metric(float(sum(o["expected"] for o in sub)) / tot, len(sub), tot)

    classes = sorted({o["true_class"] for o in expected})
    u_per_class = {c: _agg([o for o in expected if o["true_class"] == c]) for c in classes}
    u_region = {g: _agg([o for o in expected if o["country"] == g])
                for g in sorted({o["country"] for o in expected})}
    uniform = {
        "per_class": u_per_class,
        "balanced_accuracy": _metric(
            float(np.mean([m["value"] for m in u_per_class.values()])),
            len(expected), sum(o["n"] for o in expected),
        ) if u_per_class else None,
        "per_region": u_region,
        "overall_accuracy": _agg(expected) if expected else None,
    }
    return {"training_majority": majority, "uniform_random": uniform}


# --------------------------------------------------------------------------
# Two-level cluster bootstrap
# --------------------------------------------------------------------------

def _interval(values, n_sites, B):
    defined = [v for v in values if not np.isnan(v)]
    frac = len(defined) / B if B else 0.0
    if n_sites < MIN_SITES_FOR_INTERVAL:
        return None, None, CI_NOT_ESTIMABLE_1_SITE, frac
    if not defined:
        return None, None, CI_NOT_ESTIMABLE_UNDEFINED, frac
    lo, hi = np.percentile(np.array(defined), [2.5, 97.5])
    return float(lo), float(hi), CI_ESTIMATED, frac


def two_level_bootstrap(predictions, folds, group_fn=None, B=DEFAULT_B, seed=DEFAULT_BOOTSTRAP_SEED):
    """Two-level cluster bootstrap over the evaluable sites.

    Replicate: draw the evaluable sites with replacement, then draw the windows
    of each drawn site with replacement. Per-class recall pools correct over
    windows across drawn sites carrying the class (NaN when no such site was
    drawn); balanced accuracy averages the evaluable classes (NaN when any is
    undefined in the replicate). Per-group accuracy resamples sites within the
    group. ``group_fn`` maps a site outcome dict to its group (default: country).
    Percentile 2.5 / 97.5 over defined replicates; groups with fewer than
    MIN_SITES_FOR_INTERVAL sites get no interval.
    """
    if group_fn is None:
        def group_fn(o):
            return o["country"]
    outcomes = _site_outcomes(predictions, folds)
    point = _metrics_from_outcomes_grouped(outcomes, group_fn)
    n = len(outcomes)
    classes = sorted({o["true_class"] for o in outcomes})
    groups = sorted({group_fn(o) for o in outcomes})
    members = {g: [o for o in outcomes if group_fn(o) == g] for g in groups}

    rng = np.random.RandomState(seed)
    nan = float("nan")
    cls_vals = {c: [] for c in classes}
    bal_vals = []
    grp_vals = {g: [] for g in groups}
    for _ in range(B):
        idx = rng.randint(0, n, n)
        cor = {c: 0 for c in classes}
        tot = {c: 0 for c in classes}
        for i in idx:
            o = outcomes[i]
            m = o["n"]
            w = rng.randint(0, m, m)
            cor[o["true_class"]] += int(o["correct"][w].sum())
            tot[o["true_class"]] += m
        rec = {c: (cor[c] / tot[c] if tot[c] else nan) for c in classes}
        for c in classes:
            cls_vals[c].append(rec[c])
        vals = list(rec.values())
        bal_vals.append(nan if any(np.isnan(v) for v in vals) else float(np.mean(vals)))
        for g in groups:
            sub = members[g]
            gi = rng.randint(0, len(sub), len(sub))
            c_sum = 0
            t_sum = 0
            for i in gi:
                o = sub[i]
                m = o["n"]
                w = rng.randint(0, m, m)
                c_sum += int(o["correct"][w].sum())
                t_sum += m
            grp_vals[g].append(c_sum / t_sum if t_sum else nan)

    def _build(point_metric, values):
        lo, hi, status, frac = _interval(values, point_metric["n_sites"], B)
        return {
            "value": point_metric["value"],
            "ci_low": lo,
            "ci_high": hi,
            "ci_status": status,
            "n_sites": point_metric["n_sites"],
            "n_windows": point_metric["n_windows"],
            "defined_fraction": frac,
        }

    metrics = {
        "per_class": {c: _build(point["per_class"][c], cls_vals[c]) for c in classes},
        "balanced_accuracy": _build(point["balanced_accuracy"], bal_vals) if point["balanced_accuracy"] else None,
        "per_region": {g: _build(point["per_group"][g], grp_vals[g]) for g in groups},
    }
    return {
        "rng": RNG_NAME,
        "seed": seed,
        "B": B,
        "numpy_version": np.__version__,
        "interval": "percentile 95 (2.5, 97.5), linear interpolation, defined replicates only",
        "min_sites_for_interval": MIN_SITES_FOR_INTERVAL,
        "metrics": metrics,
    }


def _metrics_from_outcomes_grouped(outcomes, group_fn):
    base = _metrics_from_outcomes(outcomes)
    per_group = {}
    for g in sorted({group_fn(o) for o in outcomes}):
        sub = [o for o in outcomes if group_fn(o) == g]
        tot = sum(o["n"] for o in sub)
        per_group[g] = _metric(float(sum(o["correct"].sum() for o in sub)) / tot, len(sub), tot)
    base["per_group"] = per_group
    return base


# --------------------------------------------------------------------------
# Evaluation report (plan 05-13)
# --------------------------------------------------------------------------

def _text_sha256(path):
    """sha256 of a committed TEXT file over LF bytes (equals its git blob on any checkout)."""
    return contract_lib.sha256_hex(contract_lib.read_text_input_bytes(pathlib.Path(path)))


def _git(*args):
    """Run git in the repo root; return stripped stdout, or None when unavailable."""
    try:
        out = subprocess.run(
            ["git", *args], cwd=str(REPO_ROOT), capture_output=True, text=True, check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    return out or None


def _last_commit_touching(path):
    return _git("log", "-1", "--format=%H", "--", path)


def load_reembedded(inputs_dir):
    """Load the re-embedded rows (X, rows).

    Embeddings and their pin come from reembedded.json/reembedded.f32; the row
    metadata (with country) comes from rows.json, after checking both list the
    same files in the same order.
    """
    inputs_dir = pathlib.Path(inputs_dir)
    X, re_rows = load_inputs(inputs_dir / "reembedded.f32", inputs_dir / "reembedded.json")
    _X0, rows = load_inputs(inputs_dir / "original.f32", inputs_dir / "rows.json")
    if len(rows) != len(re_rows):
        raise ValueError("reembedded.json and rows.json disagree on row count")
    for a, b in zip(rows, re_rows):
        if (a["file_id"], a["site_id"], a["label"]) != (b["file_id"], b["site_id"], b["label"]):
            raise ValueError(f"reembedded.json row {b['row']} does not match rows.json")
    return X, rows


def drift_probe(X_original, X_reembedded, note):
    """Cosine between each original row and the same file re-embedded."""
    a = np.asarray(X_original, dtype=np.float64)
    b = np.asarray(X_reembedded, dtype=np.float64)
    cos = np.sum(a * b, axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
    return {
        "pairs": int(cos.shape[0]),
        "cosine": {
            "mean": float(np.mean(cos)),
            "median": float(np.median(cos)),
            "min": float(np.min(cos)),
            "max": float(np.max(cos)),
        },
        "note": note,
    }


def _schema_metric(metric):
    out = dict(metric)
    # The harness says "not_estimable_undefined"; the contract calls it "undefined".
    if out["ci_status"] == CI_NOT_ESTIMABLE_UNDEFINED:
        out["ci_status"] = "undefined"
    return out


def _baseline_metric(metric):
    """A baseline is a point value: no interval, so ci_status is undefined."""
    return {
        "value": metric["value"],
        "ci_low": None,
        "ci_high": None,
        "ci_status": "undefined",
        "n_sites": metric["n_sites"],
        "n_windows": metric["n_windows"],
        "defined_fraction": None,
    }


def _stored_prediction(p):
    return {
        "file_id": p["file_id"],
        "site_id": p["site_id"],
        "true_label": p["true_label"],
        "predicted_label": p["predicted_label"],
        "probabilities": {k: round(v, PROBABILITY_DECIMALS) for k, v in sorted(p["probabilities"].items())},
    }


def evaluated_model(version, embeddings, spec_version, served, X, rows, B, bootstrap_seed, seed=DEFAULT_SEED):
    """One model family's folds, stored predictions, bootstrap metrics and baselines."""
    folds, predictions = run_loso(X, rows, seed=seed)
    boot = two_level_bootstrap(predictions, folds, B=B, seed=bootstrap_seed)
    base = baselines(folds, predictions)
    bm = boot["metrics"]
    return {
        "model_version": version,
        "embeddings": embeddings,
        "preprocessing_spec_version": spec_version,
        "served": served,
        "folds": folds,
        "predictions": [_stored_prediction(p) for p in predictions],
        "metrics": {
            "per_class": {c: _schema_metric(m) for c, m in sorted(bm["per_class"].items())},
            "per_region": {g: _schema_metric(m) for g, m in sorted(bm["per_region"].items())},
            "balanced_accuracy": _schema_metric(bm["balanced_accuracy"]),
        },
        "baselines": {
            "training_majority": _baseline_metric(base["training_majority"]["balanced_accuracy"]),
            "uniform_random": _baseline_metric(base["uniform_random"]["balanced_accuracy"]),
        },
    }


REPORT_CAVEATS = [
    "Only four sites are evaluable, so the bootstrap can draw only 35 distinct multisets of sites and its distribution is lumpy; the percentile interval is indicative only (Cameron, Gelbach and Miller 2008, 'Bootstrap-based improvements for inference with clustered errors', Review of Economics and Statistics, show that cluster inference with few clusters misleads).",
    "Resampling both sites and windows counts within-site variance twice relative to resampling sites alone (Field and Welsh 2007, 'Bootstrapping clustered data', Journal of the Royal Statistical Society Series B), so these intervals are conservative (too wide), not too narrow. Even so they are wide, and with five sites no interval here supports a claim of good performance.",
    "Sites are confounded with country, recorder and class: every degraded site is in Indonesia and one of the two healthy sites is in Kenya. A held-out site therefore measures site shift, not reef-health generalisation.",
    "restored_early has one site (ind_N1); the fold that holds it out has no restored_early in training, so that class has no recall and is excluded from every average. Kenya has one site (ken_H1), so its accuracy has no interval.",
    "Each fold retrains the interim recipe (train_mlp, seed 42) on all windows of the other four sites with its own 15% validation split; the committed models also used an outer random 15% test split that a site-held-out fold does not replicate. The fold models are not the served weights.",
    "Each of the 100 rows is one 5 s window (the first) of a distinct 60 s file, 20 windows per site; windows from the same site are strongly correlated, which is why the site, not the window, is the unit of resampling.",
    "The original model and the reference vectors come from the earlier training pipeline (file peak-normalised to 1.0, linear interpolation); the successor's embeddings come from the reef_audio pipeline served in production. The two models' numbers live in different embedding spaces and are not a measure of improvement.",
    "The successor exists because of the preprocessing mismatch, not because the model improved: it was trained with the same recipe and seed on the same 100 files re-embedded.",
    "Both models are interim and have no evidence of generalising to new sites; the real retrain and model selection are Phase 12.",
]

INVALIDATED_FIGURES = [
    {
        "figure": "split_accuracy",
        "value": "1.0 (100% on the held-out 15% split)",
        "source": "models/interim-real-only/model_config.json (split_accuracy) and models/interim-real-only-2026.10.1/model_config.json",
        "reason": "Measured on a random per-window split. Windows from the same site fall in both train and test, so the score reflects site identity leaking across the split and is not an estimate of performance on a new site. The leave-one-site-out result in this report supersedes it.",
    },
    {
        "figure": "overall_accuracy",
        "value": "90.0% (model version 1.0, generated 2026-02-03)",
        "source": "docs/MODEL_EVALUATION.md (as generated 2026-02-03)",
        "reason": "Measured on a random split with a few windows per class and the same site leakage, so it is not an estimate of performance on a new site. It is withdrawn; the leave-one-site-out result in this report supersedes it.",
    },
]


def build_report(inputs_dir=DEFAULT_INPUTS_DIR, B=DEFAULT_B, bootstrap_seed=DEFAULT_BOOTSTRAP_SEED):
    """Assemble the schema-valid evaluation report from the committed inputs."""
    inputs_dir = pathlib.Path(inputs_dir)
    X_orig, rows = load_inputs(inputs_dir / "original.f32", inputs_dir / "rows.json")
    X_re, _rows = load_reembedded(inputs_dir)

    successor_cfg_path = REPO_ROOT / "models" / SERVED_MODEL_VERSION / "model_config.json"
    cfg = json.loads(successor_cfg_path.read_text(encoding="utf-8"))
    if cfg["version"] != SERVED_MODEL_VERSION or cfg["preprocessing_spec_version"] != SERVED_SPEC_VERSION:
        raise ValueError("successor model_config.json does not match the served version constants")

    with open(inputs_dir / "reembedded.json", "r", encoding="utf-8") as f:
        re_doc = json.load(f)
    rows_doc = json.loads((inputs_dir / "rows.json").read_text(encoding="utf-8"))

    def _rel(name):
        return f"{DEFAULT_INPUTS_DIR}/{name}"

    inputs = [
        {"name": "rows", "path": _rel("rows.json"), "sha256": _text_sha256(inputs_dir / "rows.json"),
         "rows": rows_doc["count"]},
        {"name": "original_embeddings", "path": _rel("original.f32"),
         "sha256": _sha256_bytes((inputs_dir / "original.f32").read_bytes()), "rows": rows_doc["count"]},
        {"name": "reembedded_rows", "path": _rel("reembedded.json"),
         "sha256": _text_sha256(inputs_dir / "reembedded.json"), "rows": re_doc["count"]},
        {"name": "reembedded_embeddings", "path": _rel("reembedded.f32"),
         "sha256": _sha256_bytes((inputs_dir / "reembedded.f32").read_bytes()), "rows": re_doc["count"]},
        {"name": "training_file", "path": rows_doc["source"]["key"],
         "sha256": rows_doc["source"]["sha256"], "rows": rows_doc["count"]},
    ]

    if _git("status", "--porcelain", "--", GENERATOR_SCRIPT, TRAINER_SCRIPT):
        print("WARNING: generator or trainer script has uncommitted changes; "
              "the recorded git shas name the last commits, not this working tree", file=sys.stderr)

    original = evaluated_model(ORIGINAL_MODEL_VERSION, "original", ORIGINAL_SPEC_VERSION, False,
                               X_orig, rows, B, bootstrap_seed)
    successor = evaluated_model(SERVED_MODEL_VERSION, "reembedded", SERVED_SPEC_VERSION, True,
                                X_re, rows, B, bootstrap_seed)

    report = {
        "schema_version": SCHEMA_VERSION,
        "report_version": REPORT_VERSION,
        "method": "leave_one_site_out",
        "generated_by": {
            "script": GENERATOR_SCRIPT,
            "git_sha": _last_commit_touching(GENERATOR_SCRIPT) or "0" * 40,
        },
        "inputs": inputs,
        "trainer": {
            "script": TRAINER_SCRIPT,
            "git_sha": _last_commit_touching(TRAINER_SCRIPT) or "0" * 40,
            "seed": DEFAULT_SEED,
            "recipe_note": (
                "Each fold runs train_mlp on all windows of the other four sites with its own 15% "
                "validation split; the committed models also used an outer 15% random test split "
                "that a site-held-out fold does not replicate."
            ),
        },
        "bootstrap": {
            "B": B,
            "levels": 2,
            "seed": bootstrap_seed,
            "rng": RNG_NAME,
            "numpy_version": np.__version__,
            "interval": "percentile_95",
            "min_sites_for_interval": MIN_SITES_FOR_INTERVAL,
        },
        "models": [original, successor],
        "served_model_version": SERVED_MODEL_VERSION,
        "drift_probe": drift_probe(X_orig, X_re, re_doc["drift_probe"]["note"]),
        "invalidated_figures": INVALIDATED_FIGURES,
        "caveats": REPORT_CAVEATS,
    }
    contract_lib.validate(report, REPORT_SCHEMA_STEM)
    return report


def write_report(report, out_path):
    contract_lib.validate(report, REPORT_SCHEMA_STEM)
    out_path = pathlib.Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(contract_lib.canonical_json_bytes(report))


def _f(value):
    return "n/a" if value is None else f"{value:.4f}"


def _interval_text(metric):
    if metric["ci_status"] == "not_estimable_1_site":
        return "CI not estimable (1 site)"
    if metric["ci_low"] is None or metric["ci_high"] is None:
        return "interval undefined"
    return f"[{_f(metric['ci_low'])}, {_f(metric['ci_high'])}]"


def _metric_row(name, metric):
    frac = "" if metric["defined_fraction"] is None else _f(metric["defined_fraction"])
    return (f"| {name} | {_f(metric['value'])} | {_interval_text(metric)} | "
            f"{metric['n_sites']} | {metric['n_windows']} | {frac} |")


def chance_statement(model):
    """One plain sentence placing the balanced-accuracy interval against chance.

    Chance is 1/k for the k classes that have an evaluable fold. The phrases
    "below chance" and "the model identified sites, not reef health" appear only
    when the whole interval lies under that line.
    """
    bal = model["metrics"]["balanced_accuracy"]
    k = len(model["metrics"]["per_class"])
    chance = 1.0 / k
    head = (f"Balanced accuracy on held-out sites is {_f(bal['value'])} "
            f"(95% interval {_interval_text(bal)}, {bal['n_sites']} sites, {bal['n_windows']} windows). "
            f"Chance for the {k} evaluable classes is {_f(chance)}.")
    if bal["ci_low"] is None or bal["ci_high"] is None:
        return head + " The interval could not be estimated, so the result cannot be placed against chance."
    if bal["ci_high"] < chance:
        return (head + " The whole interval lies below chance: this result is below chance, "
                "which means systematic mislabelling and not noise. The model identified sites, "
                "not reef health.")
    if bal["ci_low"] > chance:
        return (head + " The whole interval lies above that line, but with so few sites this is "
                "not evidence that the model recognises reef health at a new place.")
    side = "above" if bal["value"] >= chance else "under"
    return (head + f" The interval contains that line (the point estimate sits {side} it), so the "
            "result cannot be told apart from chance and gives no evidence that the model "
            "recognises reef health at a new site.")


def _model_section(model, report):
    served = "served" if model["served"] else "not served, kept for comparison"
    embeddings = {
        "original": "original embeddings (earlier training pipeline)",
        "reembedded": "re-embedded rows (reef_audio, the pipeline the service uses)",
    }[model["embeddings"]]
    m = model["metrics"]
    lines = [
        f"## Model `{model['model_version']}` ({served})",
        "",
        f"Embedding space: {embeddings}; preprocessing `{model['preprocessing_spec_version']}`. "
        "Numbers below are in this embedding space only.",
        "",
        chance_statement(model),
        "",
        "| Metric | Value | 95% interval | Sites | Windows | Defined fraction |",
        "|---|---|---|---|---|---|",
    ]
    for c, metric in sorted(m["per_class"].items()):
        lines.append(_metric_row(f"{c} recall", metric))
    for fold in model["folds"]:
        if not fold["evaluable"]:
            lines.append(f"| {fold['true_class']} recall | {fold['reason']} | | | | |")
    lines.append(_metric_row("balanced accuracy", m["balanced_accuracy"]))
    for g, metric in sorted(m["per_region"].items()):
        lines.append(_metric_row(f"{g} accuracy", metric))
    for name, label in (("training_majority", "baseline: training majority"),
                        ("uniform_random", "baseline: uniform random")):
        b = model["baselines"][name]
        lines.append(f"| {label} (balanced) | {_f(b['value'])} | no interval | "
                     f"{b['n_sites']} | {b['n_windows']} | |")
    lines += ["", "### Folds", "",
              "| Held-out site | Country | True class | Correct | Predicted labels |",
              "|---|---|---|---|---|"]
    for fold in model["folds"]:
        dist = ", ".join(f"{k} {v}" for k, v in sorted(fold["predicted_distribution"].items(),
                                                       key=lambda kv: (-kv[1], kv[0])))
        correct = (f"{fold['correct']}/{fold['n_test']}" if fold["evaluable"] else "not evaluable")
        lines.append(f"| {fold['held_out_site']} | {fold['country']} | {fold['true_class']} | {correct} | {dist} |")
    for fold in model["folds"]:
        if not fold["evaluable"]:
            dist = ", ".join(f"{k} {v}" for k, v in sorted(fold["predicted_distribution"].items(),
                                                           key=lambda kv: (-kv[1], kv[0])))
            lines += ["",
                      f"{fold['held_out_site']} is the only {fold['true_class']} site, so this fold has no "
                      f"{fold['true_class']} in training. Result: {fold['reason']}. Predicted labels for its {fold['n_test']} windows: {dist}; "
                      "shown for completeness and excluded from every average."]
    lines.append("")
    return lines


def render_markdown(report):
    """Render the plain-language report from the report dict alone (no other source of numbers)."""
    served = next(m for m in report["models"] if m["model_version"] == report["served_model_version"])
    other = [m for m in report["models"] if m is not served]
    b = report["bootstrap"]
    cos = report["drift_probe"]["cosine"]
    lines = [
        f"# Leave-one-site-out evaluation `{report['report_version']}`",
        "",
        "This file is generated from `report.json` by `scripts/evaluate_loso.py report`; every number "
        "below is in that file. Do not edit it by hand.",
        "",
        "## What was measured",
        "",
        f"Each fold holds out every window of one site and trains the interim recipe on the other sites, "
        f"then tests on the held-out site. This asks the question the service cares about: does the model "
        f"work at a site it has never heard. The model served is `{report['served_model_version']}`; "
        + ("; ".join(f"`{m['model_version']}` is the earlier model and is not served" for m in other) + "."
           if other else ""),
        "",
        "## Plain reading",
        "",
    ]
    for m in report["models"]:
        lines.append(f"- `{m['model_version']}`"
                     + (" (served)" if m["served"] else " (not served)") + ": " + chance_statement(m))
    lines += [
        "",
        "Both models are interim and have no evidence of generalising to new sites. The result is "
        "reported with its intervals and the few-site caveats below; it is not a reef-health accuracy.",
        "",
    ]
    for m in report["models"]:
        lines += _model_section(m, report)
    lines += [
        "## Embedding drift between the two spaces",
        "",
        f"Over {report['drift_probe']['pairs']} pairs (the same file embedded both ways), cosine similarity "
        f"has mean {_f(cos['mean'])}, median {_f(cos['median'])}, minimum {_f(cos['min'])} and maximum "
        f"{_f(cos['max'])}. How it was measured: {report['drift_probe']['note']}. The two spaces are far apart, so the original "
        "model's numbers say nothing about the service's embeddings, and the two models' scores must not "
        "be read as one improving on the other.",
        "",
        "## Figures withdrawn",
        "",
    ]
    for fig in report["invalidated_figures"]:
        lines.append(f"- **{fig['figure']}**: {fig['value']}. Source: {fig['source']}. {fig['reason']}")
    lines += ["", "## Caveats", ""]
    for c in report["caveats"]:
        lines.append(f"- {c}")
    lines += [
        "",
        "## Reproduction",
        "",
        f"Bootstrap: {b['levels']} levels (sites with replacement, then windows within each drawn site), "
        f"B = {b['B']}, seed {b['seed']}, `{b['rng']}`, NumPy {b['numpy_version']}, percentile 95 interval, "
        f"no interval for a group with fewer than {b['min_sites_for_interval']} sites. "
        f"Trainer `{report['trainer']['script']}` at `{report['trainer']['git_sha']}`, seed "
        f"{report['trainer']['seed']}. Report generated by `{report['generated_by']['script']}` at "
        f"`{report['generated_by']['git_sha']}`.",
        "",
        "| Input | Path | Rows | sha256 |",
        "|---|---|---|---|",
    ]
    for i in report["inputs"]:
        lines.append(f"| {i['name']} | `{i['path']}` | {i['rows']} | `{i['sha256']}` |")
    lines.append("")
    return "\n".join(lines)


def write_markdown(report, md_path):
    md_path = pathlib.Path(md_path)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_bytes(render_markdown(report).encode("utf-8"))


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def _emit(obj):
    print(json.dumps(obj, sort_keys=True))


def _cmd_export(args):
    try:
        doc = export_original(args.training, args.out_dir)
    except ExportError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    print(f"Wrote {args.out_dir}/original.f32 and rows.json ({doc['count']} rows)")
    return 0


def _cmd_run(args):
    X, rows = load_inputs(args.embeddings, args.rows)
    folds, predictions = run_loso(X, rows, seed=args.seed)
    for f in folds:
        _emit({"type": "fold", **f})
    _emit({"type": "metrics", "seed": args.seed, **{
        k: v for k, v in metrics_from_predictions(predictions, folds).items()}})
    if args.bootstrap:
        _emit({"type": "bootstrap", **two_level_bootstrap(
            predictions, folds, B=args.B, seed=args.bootstrap_seed)})
        _emit({"type": "baselines", **baselines(folds, predictions)})
    return 0


def _cmd_report(args):
    report = build_report(args.inputs_dir, B=args.B, bootstrap_seed=args.bootstrap_seed)
    write_report(report, args.out)
    write_markdown(report, args.md)
    print(f"Wrote {args.out} and {args.md}")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_exp = sub.add_parser("export-original", help="pack the original training rows into committed inputs")
    p_exp.add_argument("--training", default=trainer.DEFAULT_TRAINING)
    p_exp.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    p_exp.set_defaults(func=_cmd_export)

    p_run = sub.add_parser("run", help="run leave-one-site-out and print JSON lines")
    p_run.add_argument("--embeddings", required=True)
    p_run.add_argument("--rows", required=True)
    p_run.add_argument("--seed", type=int, default=DEFAULT_SEED)
    p_run.add_argument("--bootstrap", action="store_true")
    p_run.add_argument("--B", type=int, default=DEFAULT_B)
    p_run.add_argument("--bootstrap-seed", type=int, default=DEFAULT_BOOTSTRAP_SEED)
    p_run.set_defaults(func=_cmd_run)

    p_rep = sub.add_parser("report", help="write the schema-valid evaluation report for both model families")
    p_rep.add_argument("--inputs-dir", default=DEFAULT_INPUTS_DIR)
    p_rep.add_argument("--out", default=DEFAULT_REPORT_JSON)
    p_rep.add_argument("--md", default=DEFAULT_REPORT_MD)
    p_rep.add_argument("--B", type=int, default=DEFAULT_B)
    p_rep.add_argument("--bootstrap-seed", type=int, default=DEFAULT_BOOTSTRAP_SEED)
    p_rep.set_defaults(func=_cmd_report)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
