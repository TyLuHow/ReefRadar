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
import time
from datetime import datetime, timezone

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import check_contract  # noqa: E402
import contract_lib  # noqa: E402
from setup_contract_infra import ACCOUNT_ID, BUDGET_NAME  # noqa: E402

DEFAULT_BUCKET = "reefradar-2477-contract"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
POINTER_CACHE = "public, max-age=60"
POINTER_KEY = "contract/latest.json"
DEFAULT_BUNDLE = REPO_ROOT / "contracts" / "bucket"
DEFAULT_PUBLISHED = REPO_ROOT / "contracts" / "PUBLISHED.json"

ACTION_CREATED = "created"
ACTION_EXISTS_IDENTICAL = "exists_identical"
REQUIRED_NOTIFICATIONS = 3
EXIT_BLOCKED = 2


class PublishError(RuntimeError):
    """Raised for any condition that must stop the publish."""


class BucketReadError(PublishError):
    """The bucket could not be read (no access, no credentials); distinct from a real conflict."""


def sha256_hex(data: bytes) -> str:
    return contract_lib.sha256_hex(data)


def content_type_for(key: str) -> str:
    return "application/octet-stream" if key.endswith(".f32") else "application/json"


# Pause before re-reading a key that a 409 ConditionalRequestConflict said is mid-write.
CONFLICT_RETRY_SECONDS = 2.0


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

def pointer_bytes(version: int, manifest_sha256: str, schema_dir: pathlib.Path) -> bytes:
    """Canonical bytes of contract/latest.json for a version, validated against its schema."""
    pointer = {
        "contract_version": version,
        "manifest_uri": f"contract/v{version}.json",
        "manifest_sha256": manifest_sha256,
    }
    errors = contract_lib.validation_errors(pointer, "contract-pointer", schema_dir)
    if errors:
        raise PublishError("pointer failed its schema: " + "; ".join(errors))
    return contract_lib.canonical_json_bytes(pointer)


def recorded_sha256(published: dict, version: int):
    """The manifest sha256 PUBLISHED.json records for a version (record object or bare hash), or None."""
    record = published.get(str(version))
    return record.get("manifest_sha256") if isinstance(record, dict) else record


def load_bundle(bundle: pathlib.Path, version: int, published: dict | None = None) -> dict:
    """Validate the committed bundle for `version` and return what would be published.

    Refuses a manifest marked fixture, CRLF in any JSON file, a bundle that fails check_contract,
    and a manifest whose hash differs from the one PUBLISHED.json records for this version.

    Returns {"items": [{key, body, sha256, content_type}] in upload order (artifacts sorted by
    key, then the manifest), "manifest_sha256", "pointer": bytes}.
    """
    published = published or {}
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
    if manifest.get("fixture") is True:
        raise PublishError(f"contract/v{version}.json is marked fixture true; a fixture is never published")
    if b"\r" in raw:
        raise PublishError(f"contract/v{version}.json contains CRLF line endings (contract JSON must be LF-only)")
    manifest_sha = sha256_hex(raw)
    recorded = recorded_sha256(published, version)
    if recorded is not None and recorded != manifest_sha:
        raise PublishError(
            f"published version {version} modified: manifest sha256 {manifest_sha} differs from "
            f"PUBLISHED.json ({recorded}); versions are immutable, bump the contract version instead"
        )
    artifacts = manifest.get("artifacts") if isinstance(manifest.get("artifacts"), dict) else {}

    uris = sorted(
        {
            entry["uri"]
            for _, entry in check_contract._iter_artifacts(artifacts)
            if isinstance(entry, dict) and entry.get("present") is not False and isinstance(entry.get("uri"), str)
        }
    )
    for uri in uris:
        path = bundle / uri
        if uri.endswith(".json") and path.is_file() and b"\r" in path.read_bytes():
            raise PublishError(f"{uri} contains CRLF line endings (contract JSON must be LF-only)")
    problems = []
    try:
        # Once a version is published its bundled schema copies are frozen while the source schemas
        # may grow additively, so copy-equals-source only holds for a version not yet published.
        problems = check_contract.check_manifest(
            manifest_path, contracts_dir, fixture=False, copies_must_match=recorded is None
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
    items.append(
        {"key": f"contract/v{version}.json", "body": raw, "sha256": manifest_sha, "content_type": "application/json"}
    )
    return {
        "items": items,
        "manifest_sha256": manifest_sha,
        "pointer": pointer_bytes(version, manifest_sha, contracts_dir / "schema"),
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
        # 412: the key already exists. 409 ConditionalRequestConflict: another writer is
        # putting the same key right now. Either way the byte-compare below decides
        # (WR-04); any other error propagates and main() reports only its code.
        if _code(exc) not in ("PreconditionFailed", "412", "ConditionalRequestConflict", "409"):
            raise
        conflict = _code(exc) in ("ConditionalRequestConflict", "409")
    existing = _read_existing(s3, bucket, item["key"], retry_missing=conflict)
    if sha256_hex(existing) != item["sha256"]:
        raise PublishError(f"{item['key']} exists with different content; versions are immutable")
    return ACTION_EXISTS_IDENTICAL


def _read_existing(s3, bucket: str, key: str, retry_missing: bool) -> bytes:
    """Read an object that a conditional put reported as existing or being written.

    After a 409 the racing writer may not have finished, so a missing key is retried once
    after a short pause before it is reported as a lost race.
    """
    from botocore.exceptions import ClientError

    attempts = 2 if retry_missing else 1
    for attempt in range(attempts):
        try:
            return _get(s3, bucket, key)["Body"].read()
        except ClientError as exc:
            if retry_missing and attempt + 1 < attempts and _code(exc) in ("NoSuchKey", "404"):
                time.sleep(CONFLICT_RETRY_SECONDS)
                continue
            if retry_missing and _code(exc) in ("NoSuchKey", "404"):
                raise PublishError(
                    f"{key} is being written by another publisher (HTTP 409) and is not readable yet; "
                    "nothing was overwritten, re-run to retry"
                ) from exc
            raise PublishError(f"{key}: cannot be read back after a conditional write ({_code(exc) or 'error'})") from exc
    raise AssertionError("unreachable")  # pragma: no cover


def verify_objects(s3, bucket: str, items: list[dict]) -> None:
    """Re-download every object and compare its sha256 and Cache-Control."""
    from botocore.exceptions import ClientError

    for item in items:
        try:
            obj = _get(s3, bucket, item["key"])
        except ClientError as exc:
            raise PublishError(f"{item['key']}: cannot be re-downloaded from the bucket ({_code(exc) or 'error'})") from exc
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
        raise BucketReadError(f"cannot read {POINTER_KEY} ({_code(exc) or 'error'})") from exc
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
# Guards
# ---------------------------------------------------------------------------

def probe_object(s3, bucket: str, item: dict) -> str:
    """Read-only state of one object: absent | identical | different | cache_mismatch."""
    from botocore.exceptions import ClientError

    try:
        obj = _get(s3, bucket, item["key"])
    except ClientError as exc:
        if _code(exc) in ("NoSuchKey", "404", "NotFound"):
            return "absent"
        raise BucketReadError(f"cannot read {item['key']} ({_code(exc) or 'error'})") from exc
    if sha256_hex(obj["Body"].read()) != item["sha256"]:
        return "different"
    return "identical" if obj.get("CacheControl") == IMMUTABLE_CACHE else "cache_mismatch"


def inspect_bucket(s3, bucket: str, items: list[dict], version: int, pointer: bytes) -> dict:
    """Read-only look at what the bucket already holds, and why a publish could not proceed.

    Returns {"states": {key: state}, "pointer_state": absent|identical|older, "etag", "problems": [...]}.
    """
    states = {item["key"]: probe_object(s3, bucket, item) for item in items}
    problems = []
    for key, state in states.items():
        if state == "different":
            problems.append(f"{key} exists with different content; versions are immutable")
        elif state == "cache_mismatch":
            problems.append(
                f"{key} exists with identical bytes but not the immutable Cache-Control; "
                "an existing object is never rewritten"
            )
    current = read_pointer(s3, bucket)
    pointer_state, etag = "absent", None
    if current is not None:
        body, etag = current
        try:
            current_version = json.loads(body)["contract_version"]
        except (ValueError, KeyError, TypeError):
            current_version = None
        if body == pointer:
            pointer_state = "identical"
        elif not isinstance(current_version, int) or isinstance(current_version, bool):
            problems.append(f"{POINTER_KEY} is not a valid pointer; inspect it before publishing")
        elif current_version > version:
            problems.append(
                f"{POINTER_KEY} points at version {current_version}, newer than {version}; "
                f"publishing is forward-only, use --set-latest {version} to move the pointer back"
            )
        elif current_version == version:
            problems.append(f"{POINTER_KEY} names version {version} but a different manifest hash")
        else:
            pointer_state = "older"
    return {"states": states, "pointer_state": pointer_state, "etag": etag, "problems": problems}


def uncommitted_contract_paths(contracts_dir: pathlib.Path) -> list[str]:
    """`git status --porcelain` lines (including untracked files) under the contracts directory."""
    try:
        proc = subprocess.run(
            ["git", "-C", str(contracts_dir), "status", "--porcelain", "--", "."],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise PublishError(f"cannot verify that contracts/ is committed (git failed: {type(exc).__name__})") from exc
    if proc.returncode != 0:
        raise PublishError(f"cannot verify that {contracts_dir} is committed (git status failed)")
    return [line for line in proc.stdout.splitlines() if line.strip()]


def budget_gate(budgets) -> tuple[bool, str]:
    """(ok, detail): the cost-ceiling budget exists with all three notifications."""
    from botocore.exceptions import ClientError

    try:
        budgets.describe_budget(AccountId=ACCOUNT_ID, BudgetName=BUDGET_NAME)
        notifications = budgets.describe_notifications_for_budget(
            AccountId=ACCOUNT_ID, BudgetName=BUDGET_NAME
        ).get("Notifications", [])
    except ClientError as exc:
        if _code(exc) == "NotFoundException":
            return False, "budget not found"
        return False, f"cannot be verified ({_code(exc) or 'error'})"
    except Exception as exc:  # noqa: BLE001 - no credentials, unknown profile: report the class only
        return False, f"cannot be verified ({type(exc).__name__})"
    if len(notifications) < REQUIRED_NOTIFICATIONS:
        return False, f"{len(notifications)} of {REQUIRED_NOTIFICATIONS} notifications"
    return True, f"{len(notifications)} notifications"


def _budget_status(args, budgets_client) -> tuple[bool, str]:
    try:
        client = budgets_client if budgets_client is not None else _budgets_client(args.profile)
    except Exception as exc:  # noqa: BLE001
        return False, f"cannot be verified ({type(exc).__name__})"
    return budget_gate(client)


def _budget_line(ok: bool, detail: str) -> str:
    if ok:
        return f"budget gate: ok ({BUDGET_NAME}, {detail})"
    return f"BLOCKED: budget alarm {BUDGET_NAME} missing ({detail})"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    which = p.add_mutually_exclusive_group(required=True)
    which.add_argument("--version", type=int, metavar="N", help="publish contract version N")
    which.add_argument(
        "--set-latest", type=int, metavar="N",
        help="point contract/latest.json at an already published version N (rollback)",
    )
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


def _budgets_client(profile: str):
    import boto3

    return boto3.Session(profile_name=profile, region_name="us-east-1").client("budgets")


def _schema_dir(args) -> pathlib.Path:
    local = pathlib.Path(args.bundle).parent / "schema"
    return local if local.is_dir() else contract_lib.SCHEMA_DIR


def _publish(args, write: bool, s3_client, budgets_client) -> int:
    published = read_published(args.published_file)
    bundle = load_bundle(args.bundle, args.version, published)
    items, pointer = bundle["items"], bundle["pointer"]
    contracts_dir = pathlib.Path(args.bundle).parent
    print(f"plan: contract version {args.version} -> s3://{args.bucket}/ ({len(items)} objects, then {POINTER_KEY})")

    if write:
        dirty = uncommitted_contract_paths(contracts_dir)
        if dirty:
            raise PublishError(
                f"uncommitted changes under contracts/ ({len(dirty)} path(s)); "
                "publish only from a committed tree, commit them first"
            )
        ok, detail = _budget_status(args, budgets_client)
        if not ok:
            print(_budget_line(ok, detail), file=sys.stderr)
            return EXIT_BLOCKED
        s3 = s3_client if s3_client is not None else _s3_client(args.profile, args.region)
        seen = inspect_bucket(s3, args.bucket, items, args.version, pointer)
        if seen["problems"]:
            raise PublishError("; ".join(seen["problems"]))

        for item in items:
            action = put_immutable(s3, args.bucket, item)
            _emit(key=item["key"], bytes=len(item["body"]), sha256=item["sha256"], action=action)
        verify_objects(s3, args.bucket, items)

        if seen["pointer_state"] == "identical":
            action = "pointer_unchanged"
        else:
            action = flip_pointer(s3, args.bucket, pointer, seen["etag"])
        _emit(key=POINTER_KEY, bytes=len(pointer), sha256=sha256_hex(pointer), action=action)
        if recorded_sha256(published, args.version) is None:
            record_published(args.published_file, args.version, bundle["manifest_sha256"], args.bucket)
        print(f"published contract version {args.version}; {args.published_file.name} up to date")
        return 0

    # Read-only report: nothing below issues a put, copy or delete call.
    try:
        dirty = uncommitted_contract_paths(contracts_dir)
        print(f"tree: {'dirty (' + str(len(dirty)) + ' path(s) under contracts/; --confirm would refuse)' if dirty else 'clean'}")
    except PublishError as exc:
        print(f"tree: {exc}")
    print(_budget_line(*_budget_status(args, budgets_client)))

    seen = None
    try:
        s3 = s3_client if s3_client is not None else _s3_client(args.profile, args.region)
        seen = inspect_bucket(s3, args.bucket, items, args.version, pointer)
    except BucketReadError as exc:
        print(f"bucket not inspected ({exc})")
    except PublishError:
        raise
    except Exception as exc:  # noqa: BLE001 - no credentials or no profile: still show the plan
        print(f"bucket not inspected ({type(exc).__name__})")
    for item in items:
        state = seen["states"][item["key"]] if seen else None
        action = {"absent": "would_create", "identical": ACTION_EXISTS_IDENTICAL, None: "unchecked"}.get(state, "conflict")
        _emit(key=item["key"], bytes=len(item["body"]), sha256=item["sha256"], action=action)
    pointer_action = "unchecked"
    if seen:
        pointer_action = {"absent": "would_create", "identical": "pointer_unchanged", "older": "would_flip"}.get(
            seen["pointer_state"], "conflict"
        )
    _emit(key=POINTER_KEY, bytes=len(pointer), sha256=sha256_hex(pointer), action=pointer_action)
    print("[dry-run] no S3 write made" if args.dry_run else "[no --confirm] no S3 write made")
    if seen and seen["problems"]:
        raise PublishError("; ".join(seen["problems"]))
    return 0


def _set_latest(args, write: bool, s3_client, budgets_client) -> int:
    version = args.set_latest
    published = read_published(args.published_file)
    recorded = recorded_sha256(published, version)
    if recorded is None:
        raise PublishError(f"contract version {version} is not in {args.published_file.name}; only published versions can be set")
    manifest_key = f"contract/v{version}.json"
    print(f"plan: set {POINTER_KEY} to version {version} in s3://{args.bucket}/ (verified against {args.published_file.name})")

    if write:
        ok, detail = _budget_status(args, budgets_client)
        if not ok:
            print(_budget_line(ok, detail), file=sys.stderr)
            return EXIT_BLOCKED
    else:
        print(_budget_line(*_budget_status(args, budgets_client)))

    s3 = s3_client if s3_client is not None else _s3_client(args.profile, args.region)
    from botocore.exceptions import ClientError

    try:
        manifest_bytes = _get(s3, args.bucket, manifest_key)["Body"].read()
    except ClientError as exc:
        raise PublishError(f"{manifest_key}: cannot be read from the bucket ({_code(exc) or 'error'})") from exc
    if sha256_hex(manifest_bytes) != recorded:
        raise PublishError(
            f"{manifest_key} in the bucket hashes to {sha256_hex(manifest_bytes)}, "
            f"but {args.published_file.name} records {recorded}; refusing to point at it"
        )
    try:
        artifacts = json.loads(manifest_bytes.decode("utf-8"))["artifacts"]
    except (UnicodeDecodeError, ValueError, KeyError, TypeError) as exc:
        raise PublishError(f"{manifest_key}: the bucket copy is not a readable manifest") from exc
    to_verify = [{"key": manifest_key, "sha256": recorded}]
    for _, entry in check_contract._iter_artifacts(artifacts):
        if isinstance(entry, dict) and entry.get("present") is not False:
            to_verify.append({"key": entry["uri"], "sha256": entry["sha256"]})
    verify_objects(s3, args.bucket, to_verify)

    pointer = pointer_bytes(version, recorded, _schema_dir(args))
    current = read_pointer(s3, args.bucket)
    if current is not None and current[0] == pointer:
        action = "pointer_unchanged"
    elif not write:
        action = "would_flip" if current is not None else "would_create"
    else:
        action = flip_pointer(s3, args.bucket, pointer, current[1] if current is not None else None)
    _emit(key=POINTER_KEY, bytes=len(pointer), sha256=sha256_hex(pointer), action=action, verified_objects=len(to_verify))
    if not write:
        print("[dry-run] no S3 write made" if args.dry_run else "[no --confirm] no S3 write made")
    return 0


def main(argv=None, s3_client=None, budgets_client=None) -> int:
    args = build_parser().parse_args(argv)
    write = args.confirm and not args.dry_run
    try:
        if args.set_latest is not None:
            return _set_latest(args, write, s3_client, budgets_client)
        return _publish(args, write, s3_client, budgets_client)
    except PublishError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - never print a traceback (it can carry request detail)
        # botocore ClientError and friends: report only the AWS error code (WR-04).
        if type(exc).__name__ == "ClientError":
            print(f"error: AWS call failed ({_code(exc) or 'error'}); no further objects were written", file=sys.stderr)
            return 1
        raise


if __name__ == "__main__":
    sys.exit(main())
