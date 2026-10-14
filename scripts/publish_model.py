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
  --rollback <archive-prefix>
              restore the archived (audited) model from e.g.
              models/archive/2.0-20261001/ back to models/. The archive copies
              must hash-equal the lock's recorded hashes before anything is
              overwritten, and the restored live objects are re-verified.
              Warm classifier containers pick the change up within
              MODEL_REFRESH_SECONDS (they re-check the objects' ETags).

  --archive-version DIR
              archive a model version directory (model_config.json and
              reef_classifier_weights.npz, under models/) to
              models/archive/<version>/ with create-only puts (IfNoneMatch "*").
              The version is read from the config. Nothing under the live
              models/ keys is ever written, so the deployed classifier is not
              affected. A re-run with identical bytes reports exists_identical;
              an existing object with different bytes aborts. The config is
              uploaded as its LF bytes (the git blob). --dry-run prints the two
              target keys and sha256 values without any AWS call.

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
import re
import sys
from datetime import datetime, timezone

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_BUCKET = "reefradar-2477-embeddings"
CONFIG_KEY = "models/model_config.json"
WEIGHTS_KEY = "models/reef_classifier_weights.npz"
ARCHIVE_ROOT = "models/archive/"
MODELS_ROOT = REPO_ROOT / "models"
VERSION_PATTERN = re.compile(r"^[a-z0-9][a-z0-9.+-]*$")
ACTION_CREATED = "created"
ACTION_EXISTS_IDENTICAL = "exists_identical"

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


def rollback_model(s3, bucket, prefix, expected: dict) -> list[dict]:
    """Restore models/ from an archive prefix. Both archive objects are read and
    verified against `expected` (the lock's audited hashes) BEFORE the live
    objects are touched, then the live objects are re-downloaded and verified."""
    if not prefix.startswith(ARCHIVE_ROOT) or ".." in prefix or not prefix.endswith("/"):
        raise PublishError(f"--rollback prefix must look like {ARCHIVE_ROOT}<version>-<date>/ (got {prefix!r})")
    sources = {}
    for name, key in (("config", CONFIG_KEY), ("weights", WEIGHTS_KEY)):
        src = f"{prefix}{key.rsplit('/', 1)[-1]}"
        body = _get_bytes(s3, bucket, src)
        verify_hash(f"archive object {src}", body, expected[name])
        sources[name] = body
    return publish_artifacts(s3, bucket, sources)


def archive_version_keys(version: str) -> dict:
    """The two archive keys for a model version (never the live models/ keys)."""
    if not VERSION_PATTERN.match(version):
        raise PublishError(f"model version {version!r} does not match {VERSION_PATTERN.pattern}")
    prefix = f"{ARCHIVE_ROOT}{version}/"
    return {"config": f"{prefix}model_config.json", "weights": f"{prefix}reef_classifier_weights.npz"}


def load_version_dir(directory) -> dict:
    """Read a model version directory under models/ and return the archive plan.

    The config is taken as LF bytes (equal to its git blob on any checkout), the
    weights as-is. Refuses a directory outside models/, a version that is not a
    safe key segment, and weights that do not hash to the config's weights_sha256.
    """
    src = pathlib.Path(directory).resolve()
    root = pathlib.Path(MODELS_ROOT).resolve()
    if src == root or root not in src.parents:
        raise PublishError(f"--archive-version directory must be inside {root} (got {src})")
    try:
        config = (src / "model_config.json").read_bytes().replace(b"\r\n", b"\n")
        weights = (src / "reef_classifier_weights.npz").read_bytes()
    except OSError as exc:
        raise PublishError(f"could not read the model files in {src}: {exc.strerror or exc}") from exc
    try:
        version = json.loads(config.decode("utf-8")).get("version")
        weights_sha = json.loads(config.decode("utf-8")).get("weights_sha256")
    except (ValueError, AttributeError) as exc:
        raise PublishError("model_config.json is not a JSON object") from exc
    if not isinstance(version, str):
        raise PublishError("model_config.json has no string version")
    keys = archive_version_keys(version)
    if weights_sha is not None and weights_sha != sha256_hex(weights):
        raise PublishError("the weights sha256 does not match the config's weights_sha256")
    return {
        "version": version,
        "objects": [
            {"name": "config", "key": keys["config"], "body": config, "sha256": sha256_hex(config),
             "content_type": "application/json"},
            {"name": "weights", "key": keys["weights"], "body": weights, "sha256": sha256_hex(weights),
             "content_type": "application/octet-stream"},
        ],
    }


def _error_code(exc) -> str:
    return getattr(exc, "response", {}).get("Error", {}).get("Code", "")


def put_create_only(s3, bucket, obj) -> str:
    """Create one archive object; never overwrite. Returns created or exists_identical."""
    from botocore.exceptions import ClientError

    try:
        s3.put_object(
            Bucket=bucket,
            Key=obj["key"],
            Body=obj["body"],
            ContentType=obj["content_type"],
            Metadata={"sha256": obj["sha256"]},
            IfNoneMatch="*",
        )
        action = ACTION_CREATED
    except ClientError as exc:
        # 412: the key already exists; 409: another writer is putting it right now.
        # The byte comparison below decides; any other error propagates.
        if _error_code(exc) not in ("PreconditionFailed", "412", "ConditionalRequestConflict", "409"):
            raise
        existing = _get_bytes(s3, bucket, obj["key"])
        if sha256_hex(existing) != obj["sha256"]:
            raise PublishError(f"{obj['key']} exists with different content; archived versions are immutable") from None
        action = ACTION_EXISTS_IDENTICAL
    verify_hash(f"archived {obj['key']}", _get_bytes(s3, bucket, obj["key"]), obj["sha256"])
    return action


def archive_model_version(s3, bucket, plan) -> list[dict]:
    live = {CONFIG_KEY, WEIGHTS_KEY}
    results = []
    for obj in plan["objects"]:
        if obj["key"] in live or not obj["key"].startswith(f"{ARCHIVE_ROOT}{plan['version']}/"):
            raise PublishError(f"refusing to write {obj['key']}: not under {ARCHIVE_ROOT}{plan['version']}/")
        action = put_create_only(s3, bucket, obj)
        results.append({"key": obj["key"], "sha256": obj["sha256"], "bytes": len(obj["body"]),
                        "action": action, "verified": True})
    return results


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--confirm", action="store_true", help="Required for any S3 write")
    p.add_argument("--bucket", default=DEFAULT_BUCKET)
    p.add_argument("--profile", default="reefradar")
    p.add_argument("--region", default="us-east-1")
    p.add_argument("--lock", type=pathlib.Path, default=REPO_ROOT / "docs" / "model" / "deployed-model.lock.json")
    p.add_argument("--source", type=pathlib.Path, default=REPO_ROOT / "models" / "interim-real-only")
    p.add_argument(
        "--rollback", metavar="ARCHIVE_PREFIX", default=None,
        help="Restore the audited model from this archive prefix (e.g. models/archive/2.0-20261001/)",
    )
    p.add_argument(
        "--archive-version", metavar="DIR", type=pathlib.Path, default=None,
        help="Archive this model version directory under models/archive/<version>/ (create-only; "
             "never touches the live models/ keys)",
    )
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
        if args.archive_version is not None:
            if args.rollback is not None:
                raise PublishError("--archive-version cannot be combined with --rollback")
            plan = load_version_dir(args.archive_version)
            print(f"plan: archive version {plan['version']} to s3://{args.bucket}/{ARCHIVE_ROOT}{plan['version']}/ (create-only)")
            for obj in plan["objects"]:
                print(f"  {obj['key']}  bytes={len(obj['body'])}  sha256={obj['sha256']}")
            if not write:
                print("[dry-run] no S3 write made" if args.dry_run else "[no --confirm] no S3 write made")
                return 0
            s3 = s3_client if s3_client is not None else _s3_client(args.profile, args.region)
            results = archive_model_version(s3, args.bucket, plan)
            print(json.dumps({"action": "archive_model_version", "bucket": args.bucket,
                              "version": plan["version"], "archived": results}))
            return 0

        lock = json.loads(args.lock.read_text(encoding="utf-8"))
        if not lock.get("interim_required"):
            print("interim model not required by the audit; nothing to publish")
            return 0
        locked = locked_hashes(lock)

        if args.rollback is not None:
            s3 = s3_client if s3_client is not None else _s3_client(args.profile, args.region)
            print(f"plan: restore models/ from s3://{args.bucket}/{args.rollback} (verified against the lock)")
            if not write:
                for name, key in (("config", CONFIG_KEY), ("weights", WEIGHTS_KEY)):
                    src = f"{args.rollback}{key.rsplit('/', 1)[-1]}"
                    verify_hash(f"archive object {src}", _get_bytes(s3, args.bucket, src), locked[name])
                print("archive verified against the lock")
                print("[dry-run] no S3 write made" if args.dry_run else "[no --confirm] no S3 write made")
                return 0
            published = rollback_model(s3, args.bucket, args.rollback, locked)
            print(json.dumps({"action": "rollback_model", "bucket": args.bucket, "restored": published}))
            return 0

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
