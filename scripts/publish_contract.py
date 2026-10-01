#!/usr/bin/env python3
"""
Publish a data-contract version to the contract bucket (plan 02-04, CONTRACT-01).

For `--version N` the publisher writes, in this order:

  1. every artifact listed in contracts/bucket/contract/vN.json (data files and the
     schema copies), each with `If-None-Match: *`, Cache-Control
     "public, max-age=31536000, immutable", a ContentType from its extension and the
     sha256 as object metadata;
  2. contract/vN.json, the same way;
  3. a re-download of every one of those objects, compared by sha256 (and Cache-Control);
  4. only then contract/latest.json (Cache-Control "public, max-age=60"), the one mutable
     object, as the very last write. It is created with `If-None-Match: *` when absent and
     replaced with `If-Match: <etag read before the publish>` otherwise, so two publishers
     cannot silently overwrite each other; the pointer is re-downloaded and verified;
  5. contracts/PUBLISHED.json gains {"N": {manifest_sha256, published_at, git_sha, bucket}}.

The immutability rule: an existing object with different bytes is never overwritten. S3
answers 412 to the conditional write; the publisher then downloads the existing object and
accepts it only if its bytes are identical (so a re-run after a partial publish is
idempotent), otherwise the publish aborts before the pointer moves. Nothing is ever
retried without the condition, and no CloudFront invalidation is created (versions are
immutable and the pointer has a 60 second TTL).

Bodies are uploaded exactly as committed (the float32 file is untouched). The tool never
prints credentials, presigned URLs or signed query strings: it uses the boto3 profile and
prints JSON lines of key, bytes, sha256 and action only.

  --dry-run   print the plan (reads only; no put, copy or delete call)
  --confirm   perform the publish (a run with neither flag is also read-only)

Usage:
    py -3.12 scripts/publish_contract.py --version 1 --dry-run
    py -3.12 scripts/publish_contract.py --version 1 --confirm
"""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
from datetime import datetime, timezone

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import check_contract  # noqa: E402
import contract_lib  # noqa: E402

DEFAULT_BUCKET = "reefradar-2477-contract"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
POINTER_CACHE = "public, max-age=60"
POINTER_KEY = "contract/latest.json"
DEFAULT_BUNDLE = REPO_ROOT / "contracts" / "bucket"
DEFAULT_PUBLISHED = REPO_ROOT / "contracts" / "PUBLISHED.json"

ACTION_CREATED = "created"
ACTION_EXISTS_IDENTICAL = "exists_identical"


class PublishError(RuntimeError):
    """Raised for any condition that must stop the publish."""


def sha256_hex(data: bytes) -> str:
    return contract_lib.sha256_hex(data)


def content_type_for(key: str) -> str:
    return "application/octet-stream" if key.endswith(".f32") else "application/json"


def _code(exc) -> str:
    return getattr(exc, "response", {}).get("Error", {}).get("Code", "")


def current_git_sha() -> str:
    """The HEAD commit of this repository, or "unknown" when git cannot say."""
    try:
        proc = subprocess.run(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"], capture_output=True, text=True, timeout=30
        )
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    return proc.stdout.strip() if proc.returncode == 0 and proc.stdout.strip() else "unknown"


# ---------------------------------------------------------------------------
# The committed bundle
# ---------------------------------------------------------------------------

def load_bundle(bundle: pathlib.Path, version: int) -> dict:
    """Validate the committed bundle for `version` and return what would be published.

    Returns {"items": [{key, body, sha256, content_type}] in upload order (artifacts sorted by
    key, then the manifest), "manifest_sha256", "pointer": bytes}.
    """
    bundle = pathlib.Path(bundle)
    contracts_dir = bundle.parent
    manifest_path = bundle / "contract" / f"v{version}.json"
    if not manifest_path.is_file():
        raise PublishError(f"{manifest_path}: no committed manifest for contract version {version}")
    raw = manifest_path.read_bytes()
    try:
        manifest = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PublishError(f"contract/v{version}.json: not valid UTF-8 JSON ({exc})") from exc
    if not isinstance(manifest, dict) or manifest.get("contract_version") != version:
        raise PublishError(f"contract/v{version}.json: contract_version is not {version}")
    artifacts = manifest.get("artifacts") if isinstance(manifest.get("artifacts"), dict) else {}

    uris = sorted(
        {
            entry["uri"]
            for _, entry in check_contract._iter_artifacts(artifacts)
            if isinstance(entry, dict) and entry.get("present") is not False and isinstance(entry.get("uri"), str)
        }
    )
    problems = []
    try:
        problems = check_contract.check_manifest(
            manifest_path, contracts_dir, fixture=False, copies_must_match=True
        )
    except (contract_lib.ContractError, OSError) as exc:
        problems = [str(exc)]
    if problems:
        shown = "; ".join(problems[:8]) + (f"; ... and {len(problems) - 8} more" if len(problems) > 8 else "")
        raise PublishError(f"bundle for contract version {version} failed check_contract: {shown}")

    items = []
    for uri in uris:
        body = (bundle / uri).read_bytes()
        items.append({"key": uri, "body": body, "sha256": sha256_hex(body), "content_type": content_type_for(uri)})
    manifest_key = f"contract/v{version}.json"
    manifest_sha = sha256_hex(raw)
    items.append({"key": manifest_key, "body": raw, "sha256": manifest_sha, "content_type": "application/json"})

    pointer = {"contract_version": version, "manifest_uri": manifest_key, "manifest_sha256": manifest_sha}
    errors = contract_lib.validation_errors(pointer, "contract-pointer", contracts_dir / "schema")
    if errors:
        raise PublishError("pointer failed its schema: " + "; ".join(errors))
    return {
        "items": items,
        "manifest_sha256": manifest_sha,
        "pointer": contract_lib.canonical_json_bytes(pointer),
    }


# ---------------------------------------------------------------------------
# S3 operations
# ---------------------------------------------------------------------------

def _get(s3, bucket: str, key: str) -> dict:
    return s3.get_object(Bucket=bucket, Key=key)


def put_immutable(s3, bucket: str, item: dict) -> str:
    """Write one object that must never change; return "created" or "exists_identical"."""
    from botocore.exceptions import ClientError

    try:
        s3.put_object(
            Bucket=bucket,
            Key=item["key"],
            Body=item["body"],
            ContentType=item["content_type"],
            CacheControl=IMMUTABLE_CACHE,
            Metadata={"sha256": item["sha256"]},
            IfNoneMatch="*",
        )
        return ACTION_CREATED
    except ClientError as exc:
        if _code(exc) not in ("PreconditionFailed", "412"):
            raise
    existing = _get(s3, bucket, item["key"])["Body"].read()
    if sha256_hex(existing) != item["sha256"]:
        raise PublishError(f"{item['key']} exists with different content; versions are immutable")
    return ACTION_EXISTS_IDENTICAL


def verify_objects(s3, bucket: str, items: list[dict]) -> None:
    """Re-download every object and compare its sha256 and Cache-Control."""
    for item in items:
        obj = _get(s3, bucket, item["key"])
        body = obj["Body"].read()
        if sha256_hex(body) != item["sha256"]:
            raise PublishError(f"{item['key']}: re-downloaded sha256 {sha256_hex(body)} != expected {item['sha256']}")
        if obj.get("CacheControl") != IMMUTABLE_CACHE:
            raise PublishError(
                f"{item['key']}: Cache-Control is {obj.get('CacheControl')!r}, expected {IMMUTABLE_CACHE!r} "
                "(an existing object cannot be rewritten; versions are immutable)"
            )


def read_pointer(s3, bucket: str):
    """(body bytes, ETag) of contract/latest.json, or None when it does not exist yet."""
    from botocore.exceptions import ClientError

    try:
        obj = _get(s3, bucket, POINTER_KEY)
    except ClientError as exc:
        if _code(exc) in ("NoSuchKey", "404", "NotFound"):
            return None
        raise PublishError(f"cannot read {POINTER_KEY} ({_code(exc) or 'error'})") from exc
    return obj["Body"].read(), obj["ETag"]


def flip_pointer(s3, bucket: str, pointer: bytes, etag) -> str:
    """Write contract/latest.json conditionally and verify it by re-download.

    etag None: the pointer did not exist when it was read, so the write must create it.
    Otherwise the write only succeeds while the pointer still has that ETag.
    """
    from botocore.exceptions import ClientError

    kwargs = {
        "Bucket": bucket,
        "Key": POINTER_KEY,
        "Body": pointer,
        "ContentType": "application/json",
        "CacheControl": POINTER_CACHE,
        "Metadata": {"sha256": sha256_hex(pointer)},
    }
    if etag is None:
        kwargs["IfNoneMatch"] = "*"
    else:
        kwargs["IfMatch"] = etag
    try:
        s3.put_object(**kwargs)
    except ClientError as exc:
        if _code(exc) in ("PreconditionFailed", "412", "ConditionalRequestConflict", "409"):
            raise PublishError(
                f"{POINTER_KEY} changed since it was read (or was created concurrently); "
                "nothing was overwritten, re-run to retry"
            ) from exc
        raise
    obj = _get(s3, bucket, POINTER_KEY)
    if obj["Body"].read() != pointer or obj.get("CacheControl") != POINTER_CACHE:
        raise PublishError(f"{POINTER_KEY}: the re-downloaded pointer differs from what was written")
    return "pointer_created" if etag is None else "pointer_flipped"


# ---------------------------------------------------------------------------
# PUBLISHED.json
# ---------------------------------------------------------------------------

def read_published(path: pathlib.Path) -> dict:
    path = pathlib.Path(path)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PublishError(f"{path.name}: not valid JSON ({exc})") from exc
    if not isinstance(data, dict):
        raise PublishError(f"{path.name}: expected an object mapping version to a record")
    return data


def record_published(path: pathlib.Path, version: int, manifest_sha256: str, bucket: str) -> None:
    data = read_published(path)
    data[str(version)] = {
        "manifest_sha256": manifest_sha256,
        "published_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "git_sha": current_git_sha(),
        "bucket": bucket,
    }
    pathlib.Path(path).write_bytes(contract_lib.canonical_json_bytes(data))


def _emit(**fields) -> None:
    print(json.dumps(fields, sort_keys=True))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--version", type=int, required=True, metavar="N", help="contract version to publish")
    p.add_argument("--dry-run", action="store_true", help="print the plan; no write")
    p.add_argument("--confirm", action="store_true", help="required for any S3 write")
    p.add_argument("--bucket", default=DEFAULT_BUCKET)
    p.add_argument("--profile", default="reefradar")
    p.add_argument("--region", default="us-east-1")
    p.add_argument("--bundle", type=pathlib.Path, default=DEFAULT_BUNDLE, help="the contracts/bucket directory")
    p.add_argument("--published-file", type=pathlib.Path, default=DEFAULT_PUBLISHED)
    return p


def _s3_client(profile: str, region: str):
    import boto3

    return boto3.Session(profile_name=profile, region_name=region).client("s3")


def _publish(args, write: bool, s3_client, budgets_client) -> int:
    bundle = load_bundle(args.bundle, args.version)
    items = bundle["items"]
    print(f"plan: contract version {args.version} -> s3://{args.bucket}/ ({len(items)} objects, then {POINTER_KEY})")
    if not write:
        for item in items:
            _emit(key=item["key"], bytes=len(item["body"]), sha256=item["sha256"], action="would_create")
        _emit(key=POINTER_KEY, bytes=len(bundle["pointer"]), sha256=sha256_hex(bundle["pointer"]), action="would_flip")
        print("[dry-run] no S3 write made" if args.dry_run else "[no --confirm] no S3 write made")
        return 0

    s3 = s3_client if s3_client is not None else _s3_client(args.profile, args.region)
    current = read_pointer(s3, args.bucket)
    etag = current[1] if current else None

    for item in items:
        action = put_immutable(s3, args.bucket, item)
        _emit(key=item["key"], bytes=len(item["body"]), sha256=item["sha256"], action=action)
    verify_objects(s3, args.bucket, items)

    action = flip_pointer(s3, args.bucket, bundle["pointer"], etag)
    _emit(key=POINTER_KEY, bytes=len(bundle["pointer"]), sha256=sha256_hex(bundle["pointer"]), action=action)
    record_published(args.published_file, args.version, bundle["manifest_sha256"], args.bucket)
    print(f"published contract version {args.version}; {args.published_file.name} updated")
    return 0


def main(argv=None, s3_client=None, budgets_client=None) -> int:
    args = build_parser().parse_args(argv)
    write = args.confirm and not args.dry_run
    try:
        return _publish(args, write, s3_client, budgets_client)
    except PublishError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
