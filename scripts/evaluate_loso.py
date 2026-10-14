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
import sys

import numpy as np

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

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

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
