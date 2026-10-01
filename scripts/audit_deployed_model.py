#!/usr/bin/env python
"""
D-10: Deployed model audit.

Records exactly which classifier is deployed and what it was trained on,
before any backend truth fix. Reasons from the artifacts actually present
(local fixture directory or the real S3 bucket), never from what a script
was *supposed* to have uploaded.

    scripts/add_restored_mid_and_retrain.py:140-260 generates `restored_mid`
    training rows from synthetic sine-wave + click audio (file_id marker
    "_synthetic_", site_id/label targets ind_R1/ind_R2 x restored_mid,
    l.44-59) and saves the augmented training file
    (training_with_restored_mid.json) only to the author's local disk
    (save_and_upload, l.348-366) -- it is never uploaded to S3. So the
    training/ prefix in S3 may only contain the original 100-row file, and
    any class the deployed config claims that isn't backed by a real row in
    an available training file is flagged `synthetic_class_detected`.

Modes:
    --local DIR   DIR/models/model_config.json, DIR/models/reef_classifier_weights.npz,
                  DIR/training/*.json -- used by tests and for offline reruns.
    --s3          Live mode: lists keys under models/ and training/ in
                  reefradar-2477-embeddings (boto3 Session profile "reefradar"),
                  downloads them to the repo's gitignored models/ and
                  data/training/ directories, then runs the same audit.

Never uploads anything. Never prints a presigned URL. Weights are loaded
with allow_pickle=False (T-01-10-01) and hashed from the raw bytes before
parsing.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import io
import json
import pathlib
import sys

import numpy as np

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = REPO_ROOT / "docs" / "model" / "deployed-model.lock.json"
DEFAULT_SITES_PATH = REPO_ROOT / "data" / "snapshots" / "api-sites.json"
DEFAULT_BUCKET = "reefradar-2477-embeddings"
DEFAULT_PROFILE = "reefradar"
DEFAULT_REGION = "us-east-1"

# scripts/add_restored_mid_and_retrain.py:44-59 (RESTORED_MID_SITES) -- the
# only site_id/label pairs the synthetic generator ever produces.
SYNTHETIC_GENERATOR_TARGETS = {
    ("ind_R1", "restored_mid"),
    ("ind_R2", "restored_mid"),
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_npz_bytes(data: bytes) -> dict:
    """Load an .npz from raw bytes without pickle (T-01-10-01)."""
    with np.load(io.BytesIO(data), allow_pickle=False) as npz:
        return {key: npz[key] for key in npz.files}


def is_synthetic_row(sample: dict) -> bool:
    """A row is synthetic when its file_id contains "_synthetic_", or when
    it has no file_id at all and its (site_id, label) pair matches the
    synthetic generator's known targets. A real file_id (no "_synthetic_"
    marker) is treated as evidence of a real recording even for a
    generator-target site/label pair.
    """
    file_id = sample.get("file_id")
    if file_id:
        return "_synthetic_" in file_id
    pair = (sample.get("site_id"), sample.get("label"))
    return pair in SYNTHETIC_GENERATOR_TARGETS


def analyze_training_data(samples: list) -> dict:
    """Per-file counts: total rows, real/synthetic rows, and breakdowns by
    label and by site.
    """
    by_label: dict = {}
    by_site: dict = {}
    real_rows = 0
    synthetic_rows = 0

    for sample in samples:
        label = sample.get("label")
        site_id = sample.get("site_id")
        synthetic = is_synthetic_row(sample)

        if synthetic:
            synthetic_rows += 1
        else:
            real_rows += 1

        label_counts = by_label.setdefault(label, {"real": 0, "synthetic": 0})
        label_counts["synthetic" if synthetic else "real"] += 1

        site_counts = by_site.setdefault(
            site_id, {"real": 0, "synthetic": 0, "country": sample.get("country")}
        )
        site_counts["synthetic" if synthetic else "real"] += 1

    return {
        "rows": len(samples),
        "real_rows": real_rows,
        "synthetic_rows": synthetic_rows,
        "by_label": by_label,
        "by_site": by_site,
    }


def aggregate_training_files(file_results: list) -> dict:
    """Sum by_label / by_site counts across every available training file."""
    total_by_label: dict = {}
    total_by_site: dict = {}

    for result in file_results:
        for label, counts in result.get("by_label", {}).items():
            agg = total_by_label.setdefault(label, {"real": 0, "synthetic": 0})
            agg["real"] += counts["real"]
            agg["synthetic"] += counts["synthetic"]
        for site_id, counts in result.get("by_site", {}).items():
            agg = total_by_site.setdefault(
                site_id, {"real": 0, "synthetic": 0, "country": counts.get("country")}
            )
            agg["real"] += counts["real"]
            agg["synthetic"] += counts["synthetic"]
            if not agg.get("country") and counts.get("country"):
                agg["country"] = counts["country"]

    return {"total_by_label": total_by_label, "total_by_site": total_by_site}


def classes_in_order(idx_to_label: dict) -> list:
    """Classes in index order (0..num_classes-1) when idx_to_label uses
    contiguous string-integer keys; falls back to sorted label values.
    """
    try:
        ordered = [idx_to_label[str(i)] for i in range(len(idx_to_label))]
        return ordered
    except KeyError:
        return sorted(set(idx_to_label.values()))


def compute_classes_without_real_rows(classes: list, total_by_label: dict) -> list:
    missing = []
    for label in classes:
        real = total_by_label.get(label, {}).get("real", 0)
        if real == 0:
            missing.append(label)
    return missing


def compute_decision(classes_without_real_rows: list, classes: list) -> dict:
    synthetic_class_detected = len(classes_without_real_rows) > 0
    interim_classes = [c for c in classes if c not in classes_without_real_rows]
    return {
        "synthetic_class_detected": synthetic_class_detected,
        "interim_required": synthetic_class_detected,
        "interim_num_classes": len(interim_classes),
        "interim_classes": interim_classes,
    }


def build_training_sites(total_by_site: dict, sites_lookup: dict) -> list:
    """Real training sites only (real_rows > 0), with country/lat/lon from
    the sites lookup (data/snapshots/api-sites.json).
    """
    sites = []
    for site_id, counts in sorted(total_by_site.items()):
        if counts.get("real", 0) <= 0:
            continue
        info = sites_lookup.get(site_id, {})
        sites.append(
            {
                "site_id": site_id,
                "country": info.get("country") or counts.get("country"),
                "latitude": info.get("latitude"),
                "longitude": info.get("longitude"),
                "real_rows": counts["real"],
            }
        )
    return sites


def build_artifact_summary(config_bytes: bytes, weights_bytes: bytes, config: dict, weights: dict) -> dict:
    weight_shapes = {name: list(arr.shape) for name, arr in weights.items()}
    num_classes = int(weights["w3"].shape[1]) if "w3" in weights else config.get("num_classes")
    return {
        "config_sha256": sha256_bytes(config_bytes),
        "weights_sha256": sha256_bytes(weights_bytes),
        "version": config.get("version"),
        "created": config.get("created"),
        "idx_to_label": config.get("idx_to_label", {}),
        "num_classes": num_classes,
        "weight_shapes": weight_shapes,
        "claimed_training_samples": config.get("training_samples"),
        "claimed_test_accuracy": config.get("test_accuracy"),
    }


def build_evidence() -> list:
    return [
        {
            "source": "lambdas/classifier/handler.py",
            "lines": "393-475",
            "statement": (
                "The deployed classifier downloads models/reef_classifier_weights.npz "
                "and models/model_config.json from S3, reads idx_to_label from the "
                "config, and runs a pure-NumPy forward pass (w1 -> ReLU -> w2 -> ReLU "
                "-> w3 -> softmax)."
            ),
        },
        {
            "source": "scripts/train_classifier.py",
            "lines": "39-83",
            "statement": (
                "Training data is loaded from training/training_test_20.json; each "
                "sample has embedding, label and site_id fields."
            ),
        },
        {
            "source": "scripts/add_restored_mid_and_retrain.py",
            "lines": "44-59",
            "statement": (
                "RESTORED_MID_SITES hardcodes the only two site_id/label targets the "
                "synthetic generator ever produces: ind_R1 and ind_R2, both labelled "
                "restored_mid."
            ),
        },
        {
            "source": "scripts/add_restored_mid_and_retrain.py",
            "lines": "144-177",
            "statement": (
                "generate_synthetic_audio() builds sine tones plus exponential-decay "
                "clicks and Gaussian noise -- no real recording is read for these rows."
            ),
        },
        {
            "source": "scripts/add_restored_mid_and_retrain.py",
            "lines": "225-261",
            "statement": (
                "generate_embeddings_for_site() writes file_id as "
                "'{site_id}_synthetic_{i:04d}' for every synthetic row it generates."
            ),
        },
        {
            "source": "scripts/add_restored_mid_and_retrain.py",
            "lines": "333-345",
            "statement": (
                "train_classifier() sets config['version'] = '2.0' and "
                "training_samples = len(X), i.e. existing real rows plus the newly "
                "generated synthetic restored_mid rows."
            ),
        },
        {
            "source": "scripts/add_restored_mid_and_retrain.py",
            "lines": "348-366",
            "statement": (
                "save_and_upload() writes the merged training file to "
                "data/training/training_with_restored_mid.json on local disk only -- "
                "it is never uploaded to S3. Only models/reef_classifier_weights.npz "
                "and models/model_config.json are uploaded."
            ),
        },
        {
            "source": ".planning/audit/DATA-MODEL.md",
            "lines": "F2, section 6",
            "statement": (
                "The training set table records degraded (ind_D2, ind_D3, 40 rows), "
                "healthy (ind_H4, ken_H1, 40 rows), restored_early (ind_N1, 20 rows), "
                "all real, and restored_mid (ind_R1, ind_R2, 40 rows) as synthetic "
                "sines -- 100 real + 40 synthetic = 140, matching the v2.0 config's "
                "claimed training_samples."
            ),
        },
    ]


def load_sites_lookup(path) -> dict:
    with open(path, "r") as f:
        data = json.load(f)
    lookup = {}
    for site in data.get("sites", []):
        lookup[site["site_id"]] = {
            "country": site.get("country"),
            "latitude": site.get("latitude"),
            "longitude": site.get("longitude"),
        }
    return lookup


def run_audit(
    config_bytes: bytes,
    weights_bytes: bytes,
    training_file_entries: list,
    sites_lookup: dict,
    s3_listing: list | None = None,
) -> dict:
    """training_file_entries: list of (key, samples) tuples."""
    config = json.loads(config_bytes)
    weights = load_npz_bytes(weights_bytes)

    artifacts = build_artifact_summary(config_bytes, weights_bytes, config, weights)
    classes_ordered = classes_in_order(config.get("idx_to_label", {}))

    training_files = []
    file_results = []
    for key, samples in training_file_entries:
        result = analyze_training_data(samples)
        file_results.append(result)
        training_files.append(
            {
                "key": key,
                "rows": result["rows"],
                "real_rows": result["real_rows"],
                "synthetic_rows": result["synthetic_rows"],
                "by_label": result["by_label"],
                "by_site": result["by_site"],
            }
        )

    aggregated = aggregate_training_files(file_results)
    classes_without_real_rows = compute_classes_without_real_rows(
        classes_ordered, aggregated["total_by_label"]
    )
    decision = compute_decision(classes_without_real_rows, classes_ordered)
    training_sites = build_training_sites(aggregated["total_by_site"], sites_lookup)

    return {
        "audited_at": datetime.datetime.now(datetime.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        "s3_listing": s3_listing or [],
        "artifacts": artifacts,
        "training_files": training_files,
        "classes_without_real_rows": classes_without_real_rows,
        "synthetic_class_detected": decision["synthetic_class_detected"],
        "interim_required": decision["interim_required"],
        "interim_num_classes": decision["interim_num_classes"],
        "interim_classes": decision["interim_classes"],
        "training_sites": training_sites,
        "evidence": build_evidence(),
    }


def _load_training_entries(training_paths: list) -> list:
    entries = []
    for path in training_paths:
        data = json.loads(path.read_text())
        samples = data.get("samples", data if isinstance(data, list) else [])
        entries.append((path.name, samples))
    return entries


def run_local_audit(local_dir, sites_path=DEFAULT_SITES_PATH) -> dict:
    local_dir = pathlib.Path(local_dir)
    config_path = local_dir / "models" / "model_config.json"
    weights_path = local_dir / "models" / "reef_classifier_weights.npz"
    training_dir = local_dir / "training"
    training_paths = sorted(training_dir.glob("*.json")) if training_dir.is_dir() else []

    config_bytes = config_path.read_bytes()
    weights_bytes = weights_path.read_bytes()
    training_entries = _load_training_entries(training_paths)
    sites_lookup = load_sites_lookup(sites_path)

    return run_audit(config_bytes, weights_bytes, training_entries, sites_lookup)


def _list_s3_prefix(s3_client, bucket: str, prefix: str) -> list:
    listing = []
    paginator = s3_client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            listing.append(
                {
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"].isoformat(),
                }
            )
    return listing


def run_s3_audit(
    bucket: str = DEFAULT_BUCKET,
    profile: str = DEFAULT_PROFILE,
    region: str = DEFAULT_REGION,
    sites_path=DEFAULT_SITES_PATH,
    repo_root: pathlib.Path = REPO_ROOT,
) -> dict:
    import boto3  # local import: keeps local/offline mode boto3-independent

    session = boto3.Session(profile_name=profile, region_name=region)
    s3_client = session.client("s3")

    s3_listing = _list_s3_prefix(s3_client, bucket, "models/") + _list_s3_prefix(
        s3_client, bucket, "training/"
    )
    s3_listing.sort(key=lambda item: item["key"])

    models_dir = repo_root / "models"
    training_dir = repo_root / "data" / "training"
    models_dir.mkdir(parents=True, exist_ok=True)
    training_dir.mkdir(parents=True, exist_ok=True)

    config_key = "models/model_config.json"
    weights_key = "models/reef_classifier_weights.npz"

    config_resp = s3_client.get_object(Bucket=bucket, Key=config_key)
    config_bytes = config_resp["Body"].read()
    (models_dir / "model_config.json").write_bytes(config_bytes)

    weights_resp = s3_client.get_object(Bucket=bucket, Key=weights_key)
    weights_bytes = weights_resp["Body"].read()
    (models_dir / "reef_classifier_weights.npz").write_bytes(weights_bytes)

    training_entries = []
    training_keys = sorted(
        item["key"]
        for item in s3_listing
        if item["key"].startswith("training/") and item["key"].endswith(".json")
    )
    for key in training_keys:
        resp = s3_client.get_object(Bucket=bucket, Key=key)
        raw = resp["Body"].read()
        local_name = key.split("/", 1)[-1]
        (training_dir / local_name).write_bytes(raw)
        data = json.loads(raw)
        samples = data.get("samples", data if isinstance(data, list) else [])
        training_entries.append((key, samples))

    sites_lookup = load_sites_lookup(sites_path)

    return run_audit(config_bytes, weights_bytes, training_entries, sites_lookup, s3_listing)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="D-10 deployed-model audit")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--local", metavar="DIR", help="Audit a local fixture/snapshot directory")
    mode.add_argument("--s3", action="store_true", help="Audit the live S3 artifacts")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--sites", default=str(DEFAULT_SITES_PATH))
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--profile", default=DEFAULT_PROFILE)
    parser.add_argument("--region", default=DEFAULT_REGION)
    args = parser.parse_args(argv)

    if args.local:
        lock = run_local_audit(args.local, sites_path=args.sites)
    else:
        lock = run_s3_audit(
            bucket=args.bucket, profile=args.profile, region=args.region, sites_path=args.sites
        )

    output_path = pathlib.Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(lock, f, indent=2, sort_keys=True)
        f.write("\n")

    print(f"Wrote {output_path}")
    print(f"  version={lock['artifacts']['version']} num_classes={lock['artifacts']['num_classes']}")
    print(f"  classes_without_real_rows={lock['classes_without_real_rows']}")
    print(f"  interim_required={lock['interim_required']} interim_num_classes={lock['interim_num_classes']}")
    print(f"  training_sites={[s['site_id'] for s in lock['training_sites']]}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
