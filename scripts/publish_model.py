#!/usr/bin/env python3
"""
Publish the interim real-only classifier, archiving the live model first
(plan 01-14, TRUTH-05/TRUTH-09).

The classifier Lambda reads s3://<bucket>/models/model_config.json and
models/reef_classifier_weights.npz. This script:

  1. Reads the live objects and classifies their sha256 against
     docs/model/deployed-model.lock.json (the audited v2.0 model) and the
     local interim artifacts.
  2. If the live model is the audited one: copies both objects to
     models/archive/<version>-<YYYYMMDD>/, re-downloads the archive copies
     and REFUSES to continue unless their sha256 equal the lock's recorded
     hashes. Only then overwrites models/ with the interim artifacts and
     re-downloads to verify their sha256.
  3. If the live model already equals the interim artifacts: no-op.
  4. Anything else: refuses (unexpected live state).

  --dry-run   print the plan (read-only S3 GETs only)
  --confirm   perform the archive + publish

Never prints presigned URLs or credentials; boto3 only, no shell.

Usage:
    py -3.12 scripts/publish_model.py --dry-run
    py -3.12 scripts/publish_model.py --confirm
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
from datetime import datetime, timezone

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_BUCKET = "reefradar-2477-embeddings"
CONFIG_KEY = "models/model_config.json"
WEIGHTS_KEY = "models/reef_classifier_weights.npz"
ARCHIVE_ROOT = "models/archive/"

ACTION_ARCHIVE_AND_PUBLISH = "archive_and_publish"
ACTION_ALREADY_PUBLISHED = "already_published"
ACTION_REFUSE = "refuse"


class PublishError(RuntimeError):
    """Raised for any condition that must stop the publish."""


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def archive_prefix(version: str, date_stamp: str) -> str:
    return f"{ARCHIVE_ROOT}{version}-{date_stamp}/"


def classify_live_state(live: dict, locked: dict, interim: dict) -> str:
    """live/locked/interim: {'config': sha256, 'weights': sha256}."""
    if live == interim:
        return ACTION_ALREADY_PUBLISHED
    if live == locked:
        return ACTION_ARCHIVE_AND_PUBLISH
    return ACTION_REFUSE


def verify_hash(label: str, body: bytes, expected: str) -> None:
    actual = sha256_hex(body)
    if actual != expected:
        raise PublishError(f"{label}: sha256 {actual} != expected {expected}")


def locked_hashes(lock: dict) -> dict:
    art = lock["artifacts"]
    return {"config": art["config_sha256"], "weights": art["weights_sha256"]}


def local_artifacts(source_dir) -> dict:
    src = pathlib.Path(source_dir)
    config = (src / "model_config.json").read_bytes()
    weights = (src / "reef_classifier_weights.npz").read_bytes()
    return {"config": config, "weights": weights}


def _get_bytes(s3, bucket, key) -> bytes:
    return s3.get_object(Bucket=bucket, Key=key)["Body"].read()


def archive_live_model(s3, bucket, prefix, expected: dict) -> list[dict]:
    """Copy the live objects to the archive prefix and verify the archive copies
    against the lock's hashes BEFORE anything is overwritten."""
    archived = []
    for name, key in (("config", CONFIG_KEY), ("weights", WEIGHTS_KEY)):
        dest = f"{prefix}{key.rsplit('/', 1)[-1]}"
        s3.copy_object(
            Bucket=bucket, Key=dest, CopySource={"Bucket": bucket, "Key": key}, MetadataDirective="COPY"
        )
        verify_hash(f"archive copy {dest}", _get_bytes(s3, bucket, dest), expected[name])
        archived.append({"key": dest, "sha256": expected[name], "verified": True})
    return archived


def publish_artifacts(s3, bucket, artifacts: dict) -> list[dict]:
    published = []
    content_types = {"config": "application/json", "weights": "application/octet-stream"}
    for name, key in (("config", CONFIG_KEY), ("weights", WEIGHTS_KEY)):
        digest = sha256_hex(artifacts[name])
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=artifacts[name],
            ContentType=content_types[name],
            Metadata={"sha256": digest},
        )
        verify_hash(f"published {key}", _get_bytes(s3, bucket, key), digest)
        published.append({"key": key, "sha256": digest, "bytes": len(artifacts[name]), "verified": True})
    return published


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--confirm", action="store_true", help="Required for any S3 write")
    p.add_argument("--bucket", default=DEFAULT_BUCKET)
    p.add_argument("--profile", default="reefradar")
    p.add_argument("--region", default="us-east-1")
    p.add_argument("--lock", type=pathlib.Path, default=REPO_ROOT / "docs" / "model" / "deployed-model.lock.json")
    p.add_argument("--source", type=pathlib.Path, default=REPO_ROOT / "models" / "interim-real-only")
    p.add_argument("--date", default=None, help="YYYYMMDD stamp for the archive prefix (default: today, UTC)")
    return p


def _s3_client(profile, region):
    import boto3

    return boto3.Session(profile_name=profile, region_name=region).client("s3")


def main(argv=None, s3_client=None) -> int:
    args = build_parser().parse_args(argv)
    write = args.confirm and not args.dry_run
    date_stamp = args.date or datetime.now(timezone.utc).strftime("%Y%m%d")

    try:
        lock = json.loads(args.lock.read_text(encoding="utf-8"))
        if not lock.get("interim_required"):
            print("interim model not required by the audit; nothing to publish")
            return 0
        locked = locked_hashes(lock)
        artifacts = local_artifacts(args.source)
        interim = {name: sha256_hex(data) for name, data in artifacts.items()}

        s3 = s3_client if s3_client is not None else _s3_client(args.profile, args.region)
        live = {
            "config": sha256_hex(_get_bytes(s3, args.bucket, CONFIG_KEY)),
            "weights": sha256_hex(_get_bytes(s3, args.bucket, WEIGHTS_KEY)),
        }
        action = classify_live_state(live, locked, interim)
        version = lock["artifacts"]["version"]
        prefix = archive_prefix(version, date_stamp)

        print(f"live config  sha256={live['config']}")
        print(f"live weights sha256={live['weights']}")
        print(f"lock (v{version}) config={locked['config']} weights={locked['weights']}")
        print(f"interim      config={interim['config']} weights={interim['weights']}")
        print(f"action: {action}")

        if action == ACTION_REFUSE:
            raise PublishError("live model matches neither the audited lock nor the interim artifacts; refusing")
        if action == ACTION_ALREADY_PUBLISHED:
            print("live model already equals the interim artifacts; nothing to do")
            return 0

        print(f"plan: archive models/ objects to s3://{args.bucket}/{prefix}, then publish interim artifacts")
        if not write:
            print("[dry-run] no S3 write made" if args.dry_run else "[no --confirm] no S3 write made")
            return 0

        archived = archive_live_model(s3, args.bucket, prefix, locked)
        published = publish_artifacts(s3, args.bucket, artifacts)
        print(json.dumps({"action": "publish_model", "bucket": args.bucket, "archived": archived, "published": published}))
        return 0
    except PublishError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
