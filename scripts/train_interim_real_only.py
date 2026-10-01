#!/usr/bin/env python3
"""
Train the interim real-only reef classifier (D-11, TRUTH-05).

Per the model audit (docs/model/DEPLOYED-MODEL-AUDIT.md), the deployed
v2.0 classifier's `restored_mid` class has zero real training rows -- it
was trained entirely on synthetically generated audio
(scripts/add_restored_mid_and_retrain.py). No class may be served without
verifiable real training data, so this script retrains the same MLP
architecture (1280 -> 256 -> 64 -> K) on the real rows only.

This is a pure-NumPy reimplementation of the sklearn MLPClassifier
settings used for v2.0 (scripts/add_restored_mid_and_retrain.py:302-315):
hidden_layer_sizes=(256, 64), relu, adam (lr 0.001, beta1 0.9, beta2
0.999, eps 1e-8), alpha 0.001 (L2), batch_size 32, max_iter 200,
early_stopping with validation_fraction 0.15 and n_iter_no_change 15,
random_state 42. scikit-learn and PyTorch are not installed in this
project and adding either would require a new legitimacy review, so
this trainer has no new dependencies (numpy is already a project
dependency).

Its weights are saved with numpy.savez (a plain array container, no
pickling) and are provably compatible with the deployed classifier's own
forward pass (lambdas/classifier/handler.py:441-479) -- see
scripts/tests/test_train_interim_real_only.py.

Usage:
    py -3.12 scripts/train_interim_real_only.py \\
        --training data/training/training_test_20.json \\
        --lock docs/model/deployed-model.lock.json \\
        --out models/interim-real-only \\
        --seed 42
"""

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone

import numpy as np

DEFAULT_TRAINING = "data/training/training_test_20.json"
DEFAULT_LOCK = "docs/model/deployed-model.lock.json"
DEFAULT_OUT = "models/interim-real-only"

HIDDEN_DIMS = (256, 64)
ALPHA = 0.001  # L2 penalty, matches sklearn MLPClassifier(alpha=0.001)
BATCH_SIZE = 32
MAX_EPOCHS = 200
LR = 0.001
BETA1 = 0.9
BETA2 = 0.999
EPS = 1e-8
VALIDATION_FRACTION = 0.15
N_ITER_NO_CHANGE = 15
TOL = 1e-4
TEST_SIZE = 0.15

EVALUATION_NOTE = (
    "Accuracy is from a random per-window split; windows from the same "
    "site appear in train and test, so it is not an estimate of "
    "performance on new sites or regions. Grouped leave-one-site-out "
    "evaluation is Phase 5; retraining on more real data is Phase 12."
)


# --------------------------------------------------------------------------
# Data loading / filtering
# --------------------------------------------------------------------------

def load_training_samples(paths):
    """Load and merge `samples` arrays from one or more training JSON files."""
    samples = []
    for path in paths:
        with open(path, "r") as f:
            data = json.load(f)
        samples.extend(data["samples"])
    return samples


def filter_real_rows(samples):
    """Drop every row whose file_id contains "_synthetic_".

    Returns (real_samples, excluded_counts) where excluded_counts maps
    label -> number of synthetic rows dropped for that label.
    """
    real_samples = []
    excluded_counts = {}
    for sample in samples:
        if "_synthetic_" in sample.get("file_id", ""):
            label = sample.get("label", "unknown")
            excluded_counts[label] = excluded_counts.get(label, 0) + 1
        else:
            real_samples.append(sample)
    return real_samples, excluded_counts


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# --------------------------------------------------------------------------
# Pure-NumPy MLP: init, forward, backward, Adam, training loop
# --------------------------------------------------------------------------

def glorot_init(fan_in, fan_out, rng):
    """Glorot-uniform initialisation: U(-bound, bound), bound = sqrt(6/(fan_in+fan_out))."""
    bound = np.sqrt(6.0 / (fan_in + fan_out))
    return rng.uniform(-bound, bound, size=(fan_in, fan_out)).astype(np.float32)


def init_weights(input_dim, hidden_dims, num_classes, seed):
    rng = np.random.default_rng(seed)
    h1, h2 = hidden_dims
    weights = {
        "w1": glorot_init(input_dim, h1, rng),
        "b1": np.zeros(h1, dtype=np.float32),
        "w2": glorot_init(h1, h2, rng),
        "b2": np.zeros(h2, dtype=np.float32),
        "w3": glorot_init(h2, num_classes, rng),
        "b3": np.zeros(num_classes, dtype=np.float32),
    }
    return weights


def forward_pass(x, weights):
    """Forward pass matching lambdas/classifier/handler.py:441-479 exactly.

    Returns (probs, cache) where cache holds intermediate activations
    needed for backprop. x must be 2D (n_samples, input_dim).
    """
    x = np.asarray(x, dtype=np.float32)
    z1 = x @ weights["w1"] + weights["b1"]
    h1 = np.maximum(0, z1)
    z2 = h1 @ weights["w2"] + weights["b2"]
    h2 = np.maximum(0, z2)
    logits = h2 @ weights["w3"] + weights["b3"]

    exp_logits = np.exp(logits - np.max(logits, axis=1, keepdims=True))
    probs = exp_logits / exp_logits.sum(axis=1, keepdims=True)

    cache = {"x": x, "z1": z1, "h1": h1, "z2": z2, "h2": h2, "logits": logits}
    return probs, cache


def predict_proba(X, weights):
    """Batch forward pass returning only probabilities (no cache)."""
    probs, _ = forward_pass(X, weights)
    return probs


def backward_pass(probs, y, cache, weights, n_total):
    """Gradients for softmax cross-entropy + L2 (alpha * 0.5 * sum(W^2) / n_total)."""
    n = probs.shape[0]
    y_onehot = np.zeros_like(probs)
    y_onehot[np.arange(n), y] = 1.0

    dlogits = (probs - y_onehot) / n  # mean cross-entropy gradient

    dw3 = cache["h2"].T @ dlogits + ALPHA * weights["w3"] / n_total
    db3 = dlogits.sum(axis=0)

    dh2 = dlogits @ weights["w3"].T
    dz2 = dh2 * (cache["z2"] > 0)
    dw2 = cache["h1"].T @ dz2 + ALPHA * weights["w2"] / n_total
    db2 = dz2.sum(axis=0)

    dh1 = dz2 @ weights["w2"].T
    dz1 = dh1 * (cache["z1"] > 0)
    dw1 = cache["x"].T @ dz1 + ALPHA * weights["w1"] / n_total
    db1 = dz1.sum(axis=0)

    return {
        "w1": dw1.astype(np.float32), "b1": db1.astype(np.float32),
        "w2": dw2.astype(np.float32), "b2": db2.astype(np.float32),
        "w3": dw3.astype(np.float32), "b3": db3.astype(np.float32),
    }


def cross_entropy_loss(probs, y):
    n = probs.shape[0]
    return -np.log(np.clip(probs[np.arange(n), y], 1e-12, 1.0)).mean()


def accuracy(probs, y):
    preds = np.argmax(probs, axis=1)
    return float((preds == y).mean())


def stratified_split(y, fraction, seed):
    """Seeded per-class split. Returns (idx_a, idx_b) where idx_b holds
    `fraction` of each class's indices (rounded, at least 1 if the class
    has more than 1 row), and idx_a holds the rest.
    """
    rng = np.random.default_rng(seed)
    idx_a, idx_b = [], []
    for label in np.unique(y):
        label_idx = np.where(y == label)[0]
        shuffled = rng.permutation(label_idx)
        n_b = max(1, round(len(shuffled) * fraction)) if len(shuffled) > 1 else 0
        idx_b.extend(shuffled[:n_b].tolist())
        idx_a.extend(shuffled[n_b:].tolist())
    rng.shuffle(idx_a)
    rng.shuffle(idx_b)
    return np.array(idx_a, dtype=np.int64), np.array(idx_b, dtype=np.int64)


def adam_init(weights):
    m = {k: np.zeros_like(v) for k, v in weights.items()}
    v = {k: np.zeros_like(v) for k, v in weights.items()}
    return m, v


def adam_step(weights, grads, m, v, t):
    for k in weights:
        m[k] = BETA1 * m[k] + (1 - BETA1) * grads[k]
        v[k] = BETA2 * v[k] + (1 - BETA2) * (grads[k] ** 2)
        m_hat = m[k] / (1 - BETA1 ** t)
        v_hat = v[k] / (1 - BETA2 ** t)
        weights[k] = (weights[k] - LR * m_hat / (np.sqrt(v_hat) + EPS)).astype(np.float32)


def train_mlp(X, y, seed=42, hidden_dims=HIDDEN_DIMS, verbose=False):
    """Train the MLP on (X, y). Returns (weights, info) where info has
    best_val_accuracy, epochs_run and stopped_early.
    """
    X = np.asarray(X, dtype=np.float32)
    y = np.asarray(y, dtype=np.int64)
    input_dim = X.shape[1]
    num_classes = int(y.max()) + 1

    fit_idx, val_idx = stratified_split(y, VALIDATION_FRACTION, seed)
    if len(val_idx) == 0:
        # Too few rows per class to carve out a validation split --
        # fall back to using the full set for both (still deterministic).
        fit_idx, val_idx = np.arange(len(y)), np.arange(len(y))
    X_fit, y_fit = X[fit_idx], y[fit_idx]
    X_val, y_val = X[val_idx], y[val_idx]

    weights = init_weights(input_dim, hidden_dims, num_classes, seed)
    m, v = adam_init(weights)

    rng = np.random.default_rng(seed)
    best_val_acc = -1.0
    best_weights = {k: val.copy() for k, val in weights.items()}
    no_improve = 0
    t = 0
    epochs_run = 0
    stopped_early = False

    n_fit = len(y_fit)
    for epoch in range(1, MAX_EPOCHS + 1):
        epochs_run = epoch
        order = rng.permutation(n_fit)
        for start in range(0, n_fit, BATCH_SIZE):
            batch_idx = order[start:start + BATCH_SIZE]
            xb, yb = X_fit[batch_idx], y_fit[batch_idx]
            probs, cache = forward_pass(xb, weights)
            grads = backward_pass(probs, yb, cache, weights, n_fit)
            t += 1
            adam_step(weights, grads, m, v, t)

        val_probs, _ = forward_pass(X_val, weights)
        val_acc = accuracy(val_probs, y_val)
        if verbose:
            print(f"epoch {epoch}: val_acc={val_acc:.4f}")

        if val_acc > best_val_acc + TOL:
            best_val_acc = val_acc
            best_weights = {k: val.copy() for k, val in weights.items()}
            no_improve = 0
        else:
            no_improve += 1
            if no_improve >= N_ITER_NO_CHANGE:
                stopped_early = True
                break

    info = {
        "best_val_accuracy": best_val_acc,
        "epochs_run": epochs_run,
        "stopped_early": stopped_early,
    }
    return best_weights, info


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def build_config(weights, label_to_idx, idx_to_label, training_samples,
                  training_sites, training_countries, synthetic_rows_excluded,
                  source_training_files, split_accuracy, seed):
    return {
        "version": "interim-real-only",
        "created": datetime.now(timezone.utc).isoformat(),
        "input_dim": int(weights["w1"].shape[0]),
        "hidden_dims": list(HIDDEN_DIMS),
        "num_classes": len(label_to_idx),
        "label_to_idx": label_to_idx,
        "idx_to_label": {str(k): v for k, v in idx_to_label.items()},
        "training_samples": training_samples,
        "training_sites": training_sites,
        "training_countries": training_countries,
        "synthetic_rows_excluded": synthetic_rows_excluded,
        "source_training_files": source_training_files,
        "split_accuracy": split_accuracy,
        "seed": seed,
        "trainer": "scripts/train_interim_real_only.py (pure NumPy MLP: Glorot init, Adam, mini-batch 32, early stopping, no sklearn/torch)",
        "evaluation_note": EVALUATION_NOTE,
    }


def write_training_report(out_dir, config, excluded_counts, by_class, by_site, dropped_classes):
    path = os.path.join(out_dir, "TRAINING-REPORT.md")
    lines = []
    lines.append("# Interim Real-Only Model Training Report")
    lines.append("")
    lines.append(f"**Version:** `{config['version']}`  ")
    lines.append(f"**Created:** {config['created']}  ")
    lines.append(f"**Seed:** {config['seed']}")
    lines.append("")
    lines.append("## Why this model exists")
    lines.append("")
    lines.append(
        "The deployed v2.0 classifier's `restored_mid` class has zero real "
        "training rows (see docs/model/DEPLOYED-MODEL-AUDIT.md) -- it was "
        "trained entirely on synthetically generated audio "
        "(scripts/add_restored_mid_and_retrain.py). Per D-11, no class may "
        "be served without verifiable real training data, so this interim "
        "model is retrained on the real rows only."
    )
    if dropped_classes:
        lines.append("")
        lines.append(f"**Classes dropped:** {', '.join(dropped_classes)} (no real training rows).")
    lines.append("")
    lines.append(f"## Classes ({config['num_classes']})")
    lines.append("")
    lines.append("| Class | Real rows |")
    lines.append("|---|---|")
    for label, count in sorted(by_class.items()):
        lines.append(f"| {label} | {count} |")
    lines.append("")
    lines.append("## Rows per training site")
    lines.append("")
    lines.append("| Site | Country | Real rows |")
    lines.append("|---|---|---|")
    for site in config["training_sites"]:
        lines.append(f"| {site['site_id']} | {site['country']} | {site['rows']} |")
    lines.append("")
    if excluded_counts:
        lines.append(f"## Synthetic rows excluded: {sum(excluded_counts.values())}")
        lines.append("")
        lines.append("| Label | Synthetic rows dropped |")
        lines.append("|---|---|")
        for label, count in sorted(excluded_counts.items()):
            lines.append(f"| {label} | {count} |")
        lines.append("")
    else:
        lines.append("## Synthetic rows excluded: 0")
        lines.append("")
        lines.append(
            "No `_synthetic_` file_id rows were present in the source "
            "training file(s) used here."
        )
        lines.append("")
    lines.append("## Evaluation")
    lines.append("")
    lines.append(f"**Split accuracy (held-out 15%):** {config['split_accuracy']:.1%}")
    lines.append("")
    lines.append(f"**Caveat:** {EVALUATION_NOTE}")
    lines.append("")
    lines.append("## Consequence for the UI")
    lines.append("")
    if dropped_classes:
        lines.append(
            f"The model is {config['num_classes']}-class. The UI must not "
            f"render probabilities for {', '.join(dropped_classes)} from "
            "this model -- those values would be meaningless, not merely "
            "uncertain."
        )
    else:
        lines.append("No classes were dropped from the deployed model's class set.")
    lines.append("")
    lines.append("## Source training files")
    lines.append("")
    lines.append("| Key | sha256 |")
    lines.append("|---|---|")
    for f in config["source_training_files"]:
        lines.append(f"| {f['key']} | {f['sha256']} |")
    lines.append("")
    with open(path, "w") as out:
        out.write("\n".join(lines) + "\n")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--training", nargs="+", default=[DEFAULT_TRAINING])
    parser.add_argument("--lock", default=DEFAULT_LOCK)
    parser.add_argument("--out", default=DEFAULT_OUT)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    with open(args.lock, "r") as f:
        lock = json.load(f)

    interim_classes = set(lock["interim_classes"])
    lock_sites_by_id = {s["site_id"]: s for s in lock.get("training_sites", [])}

    samples = load_training_samples(args.training)
    real_samples, excluded_counts = filter_real_rows(samples)
    real_samples = [s for s in real_samples if s["label"] in interim_classes]

    dropped_classes = sorted(set(s["label"] for s in samples) - interim_classes)

    X = np.array([s["embedding"] for s in real_samples], dtype=np.float32)
    labels = [s["label"] for s in real_samples]
    unique_labels = sorted(set(labels))
    label_to_idx = {l: i for i, l in enumerate(unique_labels)}
    idx_to_label = {i: l for l, i in label_to_idx.items()}
    y = np.array([label_to_idx[l] for l in labels], dtype=np.int64)

    # Outer held-out split for the reported split_accuracy.
    train_idx, test_idx = stratified_split(y, TEST_SIZE, args.seed)
    X_train, y_train = X[train_idx], y[train_idx]
    X_test, y_test = X[test_idx], y[test_idx]

    weights, info = train_mlp(X_train, y_train, seed=args.seed)
    test_probs = predict_proba(X_test, weights)
    split_accuracy = accuracy(test_probs, y_test)

    by_class = {}
    by_site = {}
    for s in real_samples:
        by_class[s["label"]] = by_class.get(s["label"], 0) + 1
        by_site[s["site_id"]] = by_site.get(s["site_id"], 0) + 1

    training_sites = []
    countries = set()
    for site_id, rows in sorted(by_site.items()):
        lock_site = lock_sites_by_id.get(site_id, {})
        country = lock_site.get("country", "unknown")
        countries.add(country)
        training_sites.append({
            "site_id": site_id,
            "country": country,
            "latitude": lock_site.get("latitude"),
            "longitude": lock_site.get("longitude"),
            "rows": rows,
        })

    source_training_files = []
    for path in args.training:
        key = "training/" + os.path.basename(path)
        source_training_files.append({"key": key, "sha256": file_sha256(path)})

    config = build_config(
        weights=weights,
        label_to_idx=label_to_idx,
        idx_to_label=idx_to_label,
        training_samples=len(real_samples),
        training_sites=training_sites,
        training_countries=sorted(countries),
        synthetic_rows_excluded=sum(excluded_counts.values()),
        source_training_files=source_training_files,
        split_accuracy=split_accuracy,
        seed=args.seed,
    )

    os.makedirs(args.out, exist_ok=True)
    weights_path = os.path.join(args.out, "reef_classifier_weights.npz")
    np.savez(weights_path, **{k: v.astype(np.float32) for k, v in weights.items()})

    config_path = os.path.join(args.out, "model_config.json")
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)

    report_path = write_training_report(args.out, config, excluded_counts, by_class, by_site, dropped_classes)

    print(f"Trained {config['num_classes']}-class interim-real-only model on {config['training_samples']} real rows")
    print(f"Split accuracy (leakage caveat applies): {split_accuracy:.1%}")
    print(f"Wrote {weights_path}")
    print(f"Wrote {config_path}")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
