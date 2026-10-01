#!/usr/bin/env python3
"""
Hash-verified sync of the committed real MARRS excerpts to the served
sample prefix, and retirement of everything else under that prefix
(plan 01-14, TRUTH-02/03).

  --dry-run   (default without --confirm) print the planned actions only;
              the only AWS calls made are read-only listings.
  --confirm   upload each manifest excerpt to samples/marrs/<file> with
              ContentType audio/wav and metadata sha256, then re-download
              every object and fail if any sha256 differs from the
              committed data/audio-manifest.json.
  --retire    (with --confirm) copy every object under samples/ that is NOT
              under samples/marrs/ to retired/synthetic-samples-<YYYYMMDD>/
              <same name>, verify each copy, then delete the original.
              Refuses unless every manifest excerpt is already live with the
              right sha256. Retired objects are archived, never destroyed.

Never prints presigned URLs or credentials; boto3 only, no shell.

Usage:
    py -3.12 scripts/sync_sample_audio.py --dry-run
    py -3.12 scripts/sync_sample_audio.py --confirm
    py -3.12 scripts/sync_sample_audio.py --retire --dry-run
    py -3.12 scripts/sync_sample_audio.py --retire --confirm
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
from datetime import datetime, timezone

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_BUCKET = "reefradar-2477-audio"
SERVED_PREFIX = "samples/"
REAL_PREFIX = "samples/marrs/"
RETIRED_ROOT = "retired/"


class SyncError(RuntimeError):
    """Raised for any condition that must stop the sync."""


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def manifest_uploads(manifest: dict, repo_root) -> list[dict]:
    """One entry per manifest excerpt: S3 key, local path, expected sha256 and size.

    The local file's bytes are hashed here; a mismatch with the manifest
    stops everything before any upload (the committed manifest is the
    source of truth for what real audio is).
    """
    uploads = []
    for ex in manifest["excerpts"]:
        local = pathlib.Path(repo_root) / ex["path"]
        try:
            data = local.read_bytes()
        except OSError as e:
            raise SyncError(f"cannot read {ex['path']}: {e}") from e
        actual = sha256_hex(data)
        if actual != ex["sha256"]:
            raise SyncError(
                f"{ex['path']}: local sha256 {actual} != manifest {ex['sha256']}"
            )
        uploads.append(
            {
                "excerpt_id": ex["excerpt_id"],
                "key": f"{REAL_PREFIX}{local.name}",
                "path": ex["path"],
                "sha256": ex["sha256"],
                "bytes": len(data),
            }
        )
    return uploads


def verify_remote_hash(key: str, body: bytes, expected_sha256: str) -> None:
    actual = sha256_hex(body)
    if actual != expected_sha256:
        raise SyncError(f"{key}: remote sha256 {actual} != expected {expected_sha256}")


def retirement_plan(keys: list[str], date_stamp: str) -> list[dict]:
    """Map every object under samples/ that is not under samples/marrs/ (and
    is not the zero-byte folder marker) to retired/synthetic-samples-<date>/<name>."""
    plan = []
    for key in sorted(keys):
        if not key.startswith(SERVED_PREFIX) or key == SERVED_PREFIX:
            continue
        if key.startswith(REAL_PREFIX):
            continue
        name = key[len(SERVED_PREFIX):]
        plan.append(
            {"source": key, "dest": f"{RETIRED_ROOT}synthetic-samples-{date_stamp}/{name}"}
        )
    return plan


def copies_match(src_head: dict, dst_head: dict) -> bool:
    """Size and ETag equal. (CopyObject of a single-part object preserves the ETag.)"""
    return (
        src_head.get("ContentLength") == dst_head.get("ContentLength")
        and src_head.get("ETag") == dst_head.get("ETag")
    )


def list_keys(s3, bucket: str, prefix: str) -> list[str]:
    keys = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        keys.extend(obj["Key"] for obj in page.get("Contents", []))
    return keys


def _get_bytes(s3, bucket, key) -> bytes:
    return s3.get_object(Bucket=bucket, Key=key)["Body"].read()


def upload_real_excerpts(s3, bucket, uploads, repo_root) -> list[dict]:
    done = []
    for up in uploads:
        data = (pathlib.Path(repo_root) / up["path"]).read_bytes()
        s3.put_object(
            Bucket=bucket,
            Key=up["key"],
            Body=data,
            ContentType="audio/wav",
            Metadata={"sha256": up["sha256"]},
        )
        verify_remote_hash(up["key"], _get_bytes(s3, bucket, up["key"]), up["sha256"])
        done.append({"key": up["key"], "sha256": up["sha256"], "bytes": up["bytes"], "verified": True})
    return done


def assert_real_excerpts_live(s3, bucket, uploads) -> None:
    """Retirement precondition: every manifest excerpt is live with the right bytes."""
    for up in uploads:
        try:
            body = _get_bytes(s3, bucket, up["key"])
        except Exception as e:  # noqa: BLE001 - any failure blocks retirement
            raise SyncError(f"refusing to retire: {up['key']} not readable ({type(e).__name__})") from e
        verify_remote_hash(up["key"], body, up["sha256"])


def retire_objects(s3, bucket, plan) -> list[dict]:
    done = []
    for item in plan:
        s3.copy_object(
            Bucket=bucket,
            Key=item["dest"],
            CopySource={"Bucket": bucket, "Key": item["source"]},
            MetadataDirective="COPY",
        )
        src = s3.head_object(Bucket=bucket, Key=item["source"])
        dst = s3.head_object(Bucket=bucket, Key=item["dest"])
        if not copies_match(src, dst):
            # Multipart-origin ETags differ after a copy; fall back to content hashes.
            if src.get("ContentLength") != dst.get("ContentLength") or sha256_hex(
                _get_bytes(s3, bucket, item["source"])
            ) != sha256_hex(_get_bytes(s3, bucket, item["dest"])):
                raise SyncError(f"copy of {item['source']} to {item['dest']} failed verification; original kept")
        s3.delete_object(Bucket=bucket, Key=item["source"])
        done.append({"source": item["source"], "dest": item["dest"], "bytes": dst.get("ContentLength"), "verified": True})
    return done


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--dry-run", action="store_true", help="Print planned actions only")
    p.add_argument("--confirm", action="store_true", help="Required for any S3 write")
    p.add_argument("--retire", action="store_true", help="Retire non-manifest objects under samples/")
    p.add_argument("--bucket", default=DEFAULT_BUCKET)
    p.add_argument("--profile", default="reefradar")
    p.add_argument("--region", default="us-east-1")
    p.add_argument("--manifest", type=pathlib.Path, default=REPO_ROOT / "data" / "audio-manifest.json")
    p.add_argument("--repo-root", type=pathlib.Path, default=REPO_ROOT)
    p.add_argument("--date", default=None, help="YYYYMMDD stamp for the retired/ prefix (default: today, UTC)")
    return p


def _s3_client(profile, region):
    import boto3  # local import keeps the pure helpers import-light

    return boto3.Session(profile_name=profile, region_name=region).client("s3")


def main(argv=None, s3_client=None) -> int:
    args = build_parser().parse_args(argv)
    write = args.confirm and not args.dry_run
    date_stamp = args.date or datetime.now(timezone.utc).strftime("%Y%m%d")

    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        uploads = manifest_uploads(manifest, args.repo_root)
        s3 = s3_client if s3_client is not None else _s3_client(args.profile, args.region)
        existing = list_keys(s3, args.bucket, SERVED_PREFIX)

        if not args.retire:
            print(f"plan: upload {len(uploads)} manifest excerpt(s) to s3://{args.bucket}/{REAL_PREFIX}")
            for up in uploads:
                state = "exists (will overwrite, hash-verified)" if up["key"] in existing else "new"
                print(f"  {up['key']}  sha256={up['sha256'][:12]}...  {up['bytes']} bytes  [{state}]")
            if not write:
                print("[dry-run] no S3 write made" if args.dry_run else "[no --confirm] no S3 write made")
                return 0
            done = upload_real_excerpts(s3, args.bucket, uploads, args.repo_root)
            print(json.dumps({"action": "upload", "bucket": args.bucket, "objects": done}))
            return 0

        plan = retirement_plan(existing, date_stamp)
        print(f"plan: retire {len(plan)} non-manifest object(s) under s3://{args.bucket}/{SERVED_PREFIX}")
        for item in plan:
            print(f"  {item['source']} -> {item['dest']}")
        if not write:
            print("[dry-run] no S3 write made" if args.dry_run else "[no --confirm] no S3 write made")
            return 0
        assert_real_excerpts_live(s3, args.bucket, uploads)
        done = retire_objects(s3, args.bucket, plan)
        print(json.dumps({"action": "retire", "bucket": args.bucket, "objects": done}))
        return 0
    except SyncError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
