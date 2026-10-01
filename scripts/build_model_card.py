#!/usr/bin/env python3
"""
Build dashboard-next/src/data/model-card.json -- the small set of model
facts the legacy UI copy (01-15, 01-19) reads instead of hard-coding
accuracy/class claims (D-11, D-12, TRUTH-05).

Prefers the interim real-only model's config (models/interim-real-only/
model_config.json) when it exists -- that is the model that will be
live once 01-14 publishes it. Falls back to the audited deployed model
(docs/model/deployed-model.lock.json) when no interim model was
required (synthetic_class_detected: false).

Usage:
    py -3.12 scripts/build_model_card.py \\
        --interim-config models/interim-real-only/model_config.json \\
        --lock docs/model/deployed-model.lock.json \\
        --out dashboard-next/src/data/model-card.json
"""

import argparse
import json
import os

DEFAULT_INTERIM_CONFIG = "models/interim-real-only/model_config.json"
DEFAULT_LOCK = "docs/model/deployed-model.lock.json"
DEFAULT_OUT = "dashboard-next/src/data/model-card.json"

SYNTHETIC_HISTORY_INTERIM = (
    "An earlier 4-class model (v2.0) included a restored_mid class "
    "trained entirely on synthetically generated audio, not real "
    "recordings; see docs/model/DEPLOYED-MODEL-AUDIT.md. This model "
    "retrains on the real rows only and drops that class."
)
SYNTHETIC_HISTORY_NONE = (
    "No class currently served was trained on synthetic audio; see "
    "docs/model/DEPLOYED-MODEL-AUDIT.md."
)


def build_from_interim_config(config, source_path):
    return {
        "model_version": config["version"],
        "classes": sorted(config["idx_to_label"].values(), key=lambda l: config["label_to_idx"][l]),
        "num_classes": config["num_classes"],
        "training_rows": config["training_samples"],
        "training_sites_count": len(config["training_sites"]),
        "training_countries": config["training_countries"],
        "evaluation_note": config["evaluation_note"],
        "synthetic_history": SYNTHETIC_HISTORY_INTERIM,
        "source": source_path,
    }


def build_from_lock(lock, source_path):
    artifacts = lock["artifacts"]
    idx_to_label = artifacts["idx_to_label"]
    label_order = sorted(idx_to_label.items(), key=lambda kv: int(kv[0]))
    classes = [label for _, label in label_order]
    training_sites = lock.get("training_sites", [])
    countries = sorted(set(s["country"] for s in training_sites))
    total_real_rows = sum(s.get("real_rows", 0) for s in training_sites)

    synthetic_history = (
        SYNTHETIC_HISTORY_NONE if not lock.get("synthetic_class_detected") else SYNTHETIC_HISTORY_INTERIM
    )

    return {
        "model_version": artifacts["version"],
        "classes": classes,
        "num_classes": artifacts["num_classes"],
        "training_rows": total_real_rows,
        "training_sites_count": len(training_sites),
        "training_countries": countries,
        "evaluation_note": (
            "Reported test_accuracy is from the deployed model's own "
            "random per-window split; it is not an estimate of "
            "performance on new sites or regions."
        ),
        "synthetic_history": synthetic_history,
        "source": source_path,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interim-config", default=DEFAULT_INTERIM_CONFIG)
    parser.add_argument("--lock", default=DEFAULT_LOCK)
    parser.add_argument("--out", default=DEFAULT_OUT)
    args = parser.parse_args()

    if os.path.exists(args.interim_config):
        with open(args.interim_config, "r") as f:
            config = json.load(f)
        card = build_from_interim_config(config, args.interim_config)
    else:
        with open(args.lock, "r") as f:
            lock = json.load(f)
        card = build_from_lock(lock, args.lock)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(card, f, indent=2)
        f.write("\n")

    print(f"Wrote {args.out} (model_version={card['model_version']}, classes={card['classes']})")


if __name__ == "__main__":
    main()
