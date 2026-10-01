#!/usr/bin/env python3
"""
Public live verification of a published data contract (plan 02-04, CONTRACT-01 / CONTRACT-04).

Every request is an unauthenticated HTTPS GET carrying `Origin: http://localhost:3000`, so the
script sees exactly what a browser on the public internet sees. It checks:

  pointer     contract/latest.json answers 200 with Cache-Control exactly
              "public, max-age=60" and Access-Control-Allow-Origin "*", is a valid pointer,
              and (with --expect-latest N) names version N. `--version N` skips the pointer and
              verifies that version's manifest directly.
  manifest    contract/vN.json hashes to the pointer's manifest_sha256, is byte-for-byte the
              committed contracts/bucket/contract/vN.json, and is served immutable with CORS.
  artifacts   every artifact in the manifest answers 200 with the manifest's sha256 and byte
              count, Cache-Control "public, max-age=31536000, immutable" and CORS.
  privacy     the regional S3 URL answers 403 (the bucket is reachable only through the CDN),
              a version that does not exist answers 403 or 404, and the CDN root is never a
              bucket listing.

One PASS or FAIL line per check; exit 1 on any failure. Output carries status codes, byte
counts and hashes only, never response bodies, credentials or signed URLs.

Usage:
    py -3.12 scripts/verify_contract_live.py
    py -3.12 scripts/verify_contract_live.py --expect-latest 1
    py -3.12 scripts/verify_contract_live.py --version 1 --base-url https://<domain>/
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import check_contract  # noqa: E402
import contract_lib  # noqa: E402

ORIGIN = "http://localhost:3000"
TIMEOUT_SECONDS = 30
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
POINTER_CACHE = "public, max-age=60"
POINTER_PATH = "contract/latest.json"
MISSING_VERSION = 999999
BUCKET_NAME = "reefradar-2477-contract"
DEFAULT_BUCKET_URL = f"https://{BUCKET_NAME}.s3.us-east-1.amazonaws.com/"
DEFAULT_BUNDLE = REPO_ROOT / "contracts" / "bucket"
RESOURCES_PATH = REPO_ROOT / "infrastructure" / "resources.json"


def default_base_url():
    """https://<contract distribution domain>/ from infrastructure/resources.json, or None."""
    try:
        resources = json.loads(RESOURCES_PATH.read_text(encoding="utf-8"))
        domain = resources["cloudfront"]["distributions"]["contract"]["domain_name"]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return f"https://{domain}/"


def _header(resp, name: str):
    wanted = name.lower()
    for key, value in dict(resp.headers).items():
        if key.lower() == wanted:
            return value
    return None


class Report:
    """Prints one PASS/FAIL line per check and remembers whether any failed."""

    def __init__(self):
        self.failed = 0

    def check(self, name: str, ok: bool, detail: str = "") -> bool:
        suffix = f" ({detail})" if detail else ""
        print(f"{'PASS' if ok else 'FAIL'}: {name}{suffix}")
        if not ok:
            self.failed += 1
        return ok


def _fetch(session, url: str, report: Report, name: str):
    """One unauthenticated GET; a transport error is reported as a failed check, not raised."""
    try:
        return session.get(url, headers={"Origin": ORIGIN}, timeout=TIMEOUT_SECONDS, allow_redirects=False)
    except Exception as exc:  # noqa: BLE001 - the message could embed the URL, so report the class only
        report.check(name, False, f"request failed: {type(exc).__name__}")
        return None


def _sha(data: bytes) -> str:
    return contract_lib.sha256_hex(data)


def _status_ok(report: Report, name: str, resp) -> bool:
    return report.check(f"{name}: HTTP 200", resp.status_code == 200, f"status {resp.status_code}")


def _cors_ok(report: Report, name: str, resp) -> bool:
    value = _header(resp, "Access-Control-Allow-Origin")
    return report.check(f"{name}: CORS allows any origin", value == "*", f"Access-Control-Allow-Origin {value!r}")


def verify(session, base_url: str, bucket_url: str, bundle: pathlib.Path, version=None, expect_latest=None) -> int:
    """Run every check; returns the number of failed checks."""
    report = Report()
    base = base_url.rstrip("/") + "/"
    manifest_sha = None  # the hash the pointer promises, when a pointer is read

    if version is None:
        pointer_resp = _fetch(session, base + POINTER_PATH, report, "pointer")
        if pointer_resp is None or not _status_ok(report, "pointer", pointer_resp):
            return report.failed
        cache = _header(pointer_resp, "Cache-Control")
        report.check("pointer: Cache-Control is public, max-age=60", cache == POINTER_CACHE, f"Cache-Control {cache!r}")
        _cors_ok(report, "pointer", pointer_resp)
        try:
            pointer = json.loads(pointer_resp.content.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            report.check("pointer: is JSON", False)
            return report.failed
        errors = contract_lib.validation_errors(pointer, "contract-pointer", contract_lib.SCHEMA_DIR)
        if not report.check("pointer: valid contract pointer", not errors, f"{len(errors)} schema error(s)"):
            return report.failed
        version = pointer["contract_version"]
        manifest_sha = pointer["manifest_sha256"]
        if expect_latest is not None:
            report.check(
                f"pointer: names version {expect_latest}",
                version == expect_latest,
                f"pointer names version {version}",
            )

    manifest_path = f"contract/v{version}.json"
    manifest_resp = _fetch(session, base + manifest_path, report, "manifest")
    manifest = None
    if manifest_resp is not None and _status_ok(report, "manifest", manifest_resp):
        body = manifest_resp.content
        digest = _sha(body)
        if manifest_sha is not None:
            report.check("manifest: sha256 equals the pointer's manifest_sha256", digest == manifest_sha, f"sha256 {digest}")
        committed_path = pathlib.Path(bundle) / manifest_path
        if committed_path.is_file():
            committed = committed_path.read_bytes()
            report.check(
                "manifest: bytes equal the committed manifest",
                body == committed,
                f"served sha256 {digest}, committed sha256 {_sha(committed)}",
            )
        else:
            report.check("manifest: bytes equal the committed manifest", False, f"no committed {manifest_path}")
        cache = _header(manifest_resp, "Cache-Control")
        report.check("manifest: served immutable", cache == IMMUTABLE_CACHE, f"Cache-Control {cache!r}")
        _cors_ok(report, "manifest", manifest_resp)
        try:
            manifest = json.loads(body.decode("utf-8"))
            artifacts = manifest["artifacts"]
        except (UnicodeDecodeError, ValueError, KeyError, TypeError):
            report.check("manifest: readable", False)
            manifest = None

    if manifest is not None:
        for label, entry in check_contract._iter_artifacts(artifacts):
            if not isinstance(entry, dict) or entry.get("present") is False:
                continue
            name = f"artifact {label}"
            resp = _fetch(session, base + entry["uri"], report, name)
            if resp is None or not _status_ok(report, name, resp):
                continue
            digest = _sha(resp.content)
            report.check(
                f"{name}: sha256 equals the manifest",
                digest == entry.get("sha256") and len(resp.content) == entry.get("bytes"),
                f"{len(resp.content)} bytes, sha256 {digest}",
            )
            cache = _header(resp, "Cache-Control")
            report.check(f"{name}: served immutable", cache == IMMUTABLE_CACHE, f"Cache-Control {cache!r}")
            _cors_ok(report, name, resp)

    direct = _fetch(session, bucket_url.rstrip("/") + "/" + POINTER_PATH, report, "direct S3")
    if direct is not None:
        report.check("direct S3 access is denied", direct.status_code == 403, f"status {direct.status_code}")

    missing = _fetch(session, base + f"contract/v{MISSING_VERSION}.json", report, "missing version")
    if missing is not None:
        report.check(
            "a version that does not exist answers 403 or 404",
            missing.status_code in (403, 404),
            f"status {missing.status_code}",
        )

    root = _fetch(session, base, report, "root")
    if root is not None:
        listing = bool(re.search(r"ListBucketResult|<Contents>", root.content[:20000].decode("utf-8", "replace")))
        report.check("the CDN root is not a bucket listing", not listing, f"status {root.status_code}")

    return report.failed


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--base-url", default=None, help="CDN base URL (default: the contract distribution in resources.json)")
    p.add_argument("--expect-latest", type=int, metavar="N", help="fail unless contract/latest.json names version N")
    p.add_argument("--version", type=int, metavar="N", help="verify version N directly, without reading the pointer")
    p.add_argument("--bucket-url", default=DEFAULT_BUCKET_URL, help="regional S3 URL that must answer 403")
    p.add_argument("--bundle", type=pathlib.Path, default=DEFAULT_BUNDLE, help="the committed contracts/bucket directory")
    return p


def main(argv=None, session=None) -> int:
    args = build_parser().parse_args(argv)
    base_url = args.base_url or default_base_url()
    if not base_url:
        print("error: no --base-url given and infrastructure/resources.json has no contract distribution", file=sys.stderr)
        return 2
    if session is None:
        import requests

        session = requests.Session()
    failed = verify(
        session, base_url, args.bucket_url, args.bundle, version=args.version, expect_latest=args.expect_latest
    )
    print("OK: contract verified live" if not failed else f"FAILED: {failed} check(s) failed")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
