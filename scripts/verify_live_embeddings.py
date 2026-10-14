#!/usr/bin/env python3
"""
Compare a live analysis's stored embeddings with the recorded offline fixture (plan 05-15).

Phase 5 success criterion 1 says the same audio must yield the same embeddings through the
offline and the live path. After the rollout, analyse the committed ind_H1 excerpt through the
public API, then run:

    py -3.12 scripts/verify_live_embeddings.py \\
        --analysis-id <uuid from the analysis> \\
        --excerpt dashboard-next/public/audio/marrs/ind_H1_20220830_120000.wav --confirm

The classifier stores each analysis's per-window embeddings at
s3://reefradar-2477-audio/processed/<analysis_id>/embeddings.f32 (n x 1280 little-endian
float32). This script reads that one object (read-only; the `reefradar` profile; the AWS
account 781978598306 is asserted first), takes the excerpt's rows from the fixture
lambdas/preprocessor/tests/fixtures/excerpt_embeddings.{f32,json} in window order, and
compares them with surfperch_client.compare_embeddings at the tolerance the fixture
recorded (cosine >= 0.99999, max abs difference <= 1e-5).

Exit 0 only if every window row meets both bounds. Exit 1 when the row counts differ, when
any row misses the tolerance, when the excerpt's sha256 differs from the fixture json, when
the fixture itself is damaged, or when the object cannot be read. Without --confirm no AWS
call is made (the offline checks still run) and the script says nothing was verified.

Output: counts, hashes and cosine statistics only. Object bodies and presigned URLs are never
printed. The analysis id is checked against a UUID pattern before it becomes part of the S3 key.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import sys

import numpy as np

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import surfperch_client  # noqa: E402

DEFAULT_FIXTURE_DIR = REPO_ROOT / "lambdas" / "preprocessor" / "tests" / "fixtures"
DEFAULT_BUCKET = "reefradar-2477-audio"
EMBEDDING_DIM = surfperch_client.EMBEDDING_DIM
ROW_BYTES = EMBEDDING_DIM * 4
FIXTURE_JSON = "excerpt_embeddings.json"
FIXTURE_F32 = "excerpt_embeddings.f32"
UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class VerificationError(RuntimeError):
    """A check failed; the message carries counts, names and hashes only."""


def load_fixture(fixture_dir: pathlib.Path, excerpt: pathlib.Path):
    """Return (tolerance, fixture rows for the excerpt in window order, window count).

    Raises VerificationError if the fixture is damaged, the excerpt is not in it, or the
    excerpt's sha256 differs from the one the fixture was recorded from.
    """
    try:
        doc = json.loads((fixture_dir / FIXTURE_JSON).read_text(encoding="utf-8"))
        raw = (fixture_dir / FIXTURE_F32).read_bytes()
    except (OSError, ValueError) as exc:
        raise VerificationError(f"fixture could not be read: {type(exc).__name__}") from exc

    if hashlib.sha256(raw).hexdigest() != doc.get("embeddings_sha256"):
        raise VerificationError("fixture embeddings sha256 does not match excerpt_embeddings.json")
    count, dim = int(doc.get("count", -1)), int(doc.get("dim", -1))
    if dim != EMBEDDING_DIM or len(raw) != count * ROW_BYTES:
        raise VerificationError("fixture embeddings have the wrong size for count x 1280 float32")
    matrix = np.frombuffer(raw, dtype="<f4").reshape(count, dim)

    entry = next((e for e in doc.get("excerpts", []) if e.get("path") == excerpt.name), None)
    if entry is None:
        raise VerificationError(f"excerpt {excerpt.name} is not in the fixture")
    try:
        excerpt_sha = hashlib.sha256(excerpt.read_bytes()).hexdigest()
    except OSError as exc:
        raise VerificationError(f"excerpt could not be read: {type(exc).__name__}") from exc
    if excerpt_sha != entry["sha256"]:
        raise VerificationError(
            f"excerpt sha256 {excerpt_sha} differs from the fixture's {entry['sha256']}"
        )

    windows = sorted(entry["windows"], key=lambda w: w["index"])
    rows = [int(w["row"]) for w in windows]
    if not rows or any(not 0 <= r < count for r in rows):
        raise VerificationError("fixture window rows are out of range")
    tolerance = doc.get("tolerance") or {}
    return (
        {"cosine_min": float(tolerance["cosine_min"]), "max_abs": float(tolerance["max_abs"])},
        matrix[rows].astype(np.float32),
        len(windows),
    )


def read_live_embeddings(s3_client, bucket: str, analysis_id: str) -> np.ndarray:
    """Read processed/<analysis_id>/embeddings.f32 and return it as an (n, 1280) float32 array."""
    key = f"processed/{analysis_id}/embeddings.f32"
    try:
        body = s3_client.get_object(Bucket=bucket, Key=key)["Body"].read()
    except Exception as exc:  # noqa: BLE001 - report the error code only, never the message
        code = getattr(exc, "response", {}).get("Error", {}).get("Code", type(exc).__name__)
        raise VerificationError(f"could not read s3://{bucket}/{key}: {code}") from exc
    if not body or len(body) % ROW_BYTES:
        raise VerificationError(
            f"embeddings object is {len(body)} bytes, not a whole number of 1280-float32 rows"
        )
    rows = np.frombuffer(body, dtype="<f4").reshape(-1, EMBEDDING_DIM)
    if not np.isfinite(rows).all():
        raise VerificationError("live embeddings contain NaN or infinity")
    return rows.astype(np.float32)


def make_s3_client(profile: str):
    """A read-only S3 client on the profile session, after asserting the AWS account."""
    session = surfperch_client.aws_session(profile)
    surfperch_client.assert_account(session.client("sts"))
    return session.client("s3")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--analysis-id", required=True, help="UUID of the live analysis to check")
    p.add_argument("--excerpt", type=pathlib.Path, required=True, help="the WAV that was analysed")
    p.add_argument("--fixture-dir", type=pathlib.Path, default=DEFAULT_FIXTURE_DIR)
    p.add_argument("--bucket", default=DEFAULT_BUCKET, help=f"audio bucket (default {DEFAULT_BUCKET})")
    p.add_argument("--profile", default=surfperch_client.DEFAULT_PROFILE)
    p.add_argument("--confirm", action="store_true", help="read the live object from AWS (read-only)")
    return p


def run(args, s3_client=None) -> int:
    if not UUID_PATTERN.match(args.analysis_id):
        raise VerificationError("analysis id is not a UUID (expected lowercase 8-4-4-4-12 hex)")
    tolerance, fixture_rows, window_count = load_fixture(args.fixture_dir, args.excerpt)
    print(
        f"fixture: {window_count} windows of {args.excerpt.name} "
        f"(cosine >= {tolerance['cosine_min']}, max abs <= {tolerance['max_abs']})"
    )

    if not args.confirm:
        print("NOT VERIFIED: no AWS call made (pass --confirm to read the live embeddings)")
        return 0

    client = s3_client if s3_client is not None else make_s3_client(args.profile)
    live = read_live_embeddings(client, args.bucket, args.analysis_id)
    print(f"rows: {live.shape[0]} live rows, {fixture_rows.shape[0]} fixture rows")
    if live.shape[0] != fixture_rows.shape[0]:
        print("FAIL: the live analysis has a different number of windows than the fixture")
        return 1

    report = surfperch_client.compare_embeddings(
        live, fixture_rows, cosine_min=tolerance["cosine_min"], max_abs=tolerance["max_abs"]
    )
    print(f"min cosine {report['min_cosine']:.9f}, max abs difference {report['max_abs_diff']:.3e}")
    bad = [r for r in report["rows"] if not r["ok"]]
    for r in bad:
        print(f"  window {r['row']}: cosine {r['cosine']:.9f}, max abs {r['max_abs_diff']:.3e}")
    if bad:
        print(f"FAIL: {len(bad)} of {len(report['rows'])} windows miss the fixture tolerance")
        return 1
    print(f"PASS: all {len(report['rows'])} live embeddings match the recorded fixture")
    return 0


def main(argv=None, s3_client=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return run(args, s3_client=s3_client)
    except VerificationError as exc:
        print(f"FAIL: {exc}")
        return 1
    except RuntimeError as exc:  # the account assertion
        print(f"FAIL: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
