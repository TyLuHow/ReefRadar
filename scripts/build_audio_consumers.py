#!/usr/bin/env python3
"""
D-05/D-07 (TRUTH-03/07/08): Generate the Next.js app's audio-consumer
artifacts from the single committed audio manifest (data/audio-manifest.json).

Task 1 (01-17) scope: mirror the manifest byte-for-byte into
dashboard-next/src/data/audio-manifest.json, so lib/audio-manifest.ts has a
build-time-importable copy. Task 3 extends this script to also generate
dashboard-next/public/audio/compare/manifest.json and
dashboard-next/public/audio/ATTRIBUTION.md from the same source manifest.

--check verifies the mirror (and, once extended, the other outputs) without
writing anything; exits 1 on any drift.

Deterministic: re-running against the same source manifest produces a
byte-identical mirror.

Usage:
    py -3.12 scripts/build_audio_consumers.py          # write outputs
    py -3.12 scripts/build_audio_consumers.py --check  # verify, exit 1 on drift
"""
import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_MANIFEST = REPO_ROOT / "data" / "audio-manifest.json"
MIRROR_MANIFEST = REPO_ROOT / "dashboard-next" / "src" / "data" / "audio-manifest.json"


def build_mirror(check: bool) -> bool:
    """Copy the source manifest byte-for-byte to the Next.js app mirror.

    Returns True if the mirror is (now) in sync with the source.
    """
    source_bytes = SOURCE_MANIFEST.read_bytes()
    if check:
        if not MIRROR_MANIFEST.exists():
            print(f"DRIFT: {MIRROR_MANIFEST} does not exist")
            return False
        if MIRROR_MANIFEST.read_bytes() != source_bytes:
            print(f"DRIFT: {MIRROR_MANIFEST} differs from {SOURCE_MANIFEST}")
            return False
        return True

    MIRROR_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MIRROR_MANIFEST.write_bytes(source_bytes)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify outputs are in sync; write nothing")
    args = parser.parse_args()

    ok = build_mirror(args.check)

    if args.check:
        if ok:
            print(f"OK: {MIRROR_MANIFEST} matches {SOURCE_MANIFEST}")
            return 0
        return 1

    print(f"OK: wrote {MIRROR_MANIFEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
