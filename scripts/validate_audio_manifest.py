#!/usr/bin/env python3
"""
Validate data/audio-manifest.json against the files it describes and against
the live-site snapshot (TRUTH-03/TRUTH-04 provenance guarantees).

Checks per excerpt entry:
  - the WAV file exists at `path`
  - its sha256 matches the recorded `sha256`
  - its actual sample rate is 16000 Hz and matches `sample_rate_hz`
  - its actual channel count is 1 (mono) and matches `channels`
  - its actual bit depth matches `bits_per_sample`
  - its actual duration matches `duration_s` (+/- 50ms)
  - `gain_db` is 0
  - `normalized` is false
  - `timezone` is "unverified"
  - `site_id` exists in data/snapshots/api-sites.json

Prints one line per failure; exits 1 if any failure, 0 otherwise.
"""

import argparse
import hashlib
import json
import sys
import wave
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MANIFEST_PATH = REPO_ROOT / "data" / "audio-manifest.json"
DEFAULT_SITES_SNAPSHOT_PATH = REPO_ROOT / "data" / "snapshots" / "api-sites.json"

DURATION_TOLERANCE_S = 0.05


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def validate_entry(entry, site_ids):
    failures = []
    eid = entry.get("excerpt_id", "<unknown>")

    rel_path = entry.get("path")
    if not rel_path:
        failures.append(f"{eid}: manifest entry has no 'path'")
        return failures

    path = REPO_ROOT / rel_path
    if not path.exists():
        failures.append(f"{eid}: file not found at {rel_path}")
        return failures

    actual_sha = sha256_file(path)
    if actual_sha != entry.get("sha256"):
        failures.append(
            f"{eid}: sha256 mismatch (manifest {entry.get('sha256')!r}, actual {actual_sha!r})"
        )

    try:
        with wave.open(str(path), "rb") as wf:
            actual_sr = wf.getframerate()
            actual_channels = wf.getnchannels()
            actual_bits = wf.getsampwidth() * 8
            actual_nframes = wf.getnframes()
            actual_duration = (actual_nframes / actual_sr) if actual_sr else 0.0
    except Exception as ex:  # noqa: BLE001 - surfaced as a validation failure, not a crash
        failures.append(f"{eid}: could not read WAV header: {ex}")
        return failures

    if actual_sr != 16000:
        failures.append(f"{eid}: actual sample rate {actual_sr} Hz != required 16000 Hz")
    if entry.get("sample_rate_hz") != actual_sr:
        failures.append(
            f"{eid}: manifest sample_rate_hz {entry.get('sample_rate_hz')} != actual {actual_sr}"
        )

    if actual_channels != 1:
        failures.append(f"{eid}: actual channel count {actual_channels} != required 1 (mono)")
    if entry.get("channels") != actual_channels:
        failures.append(f"{eid}: manifest channels {entry.get('channels')} != actual {actual_channels}")

    if entry.get("bits_per_sample") != actual_bits:
        failures.append(
            f"{eid}: manifest bits_per_sample {entry.get('bits_per_sample')} != actual {actual_bits}"
        )

    declared_duration = entry.get("duration_s")
    if declared_duration is None or abs(actual_duration - declared_duration) > DURATION_TOLERANCE_S:
        failures.append(
            f"{eid}: duration mismatch (manifest {declared_duration}s, actual {actual_duration:.3f}s)"
        )

    if entry.get("gain_db") != 0:
        failures.append(f"{eid}: gain_db must be 0, got {entry.get('gain_db')!r}")

    if entry.get("normalized") is not False:
        failures.append(f"{eid}: normalized must be false, got {entry.get('normalized')!r}")

    if entry.get("timezone") != "unverified":
        failures.append(f"{eid}: timezone must be 'unverified', got {entry.get('timezone')!r}")

    site_id = entry.get("site_id")
    if site_ids is not None and site_id not in site_ids:
        failures.append(f"{eid}: site_id {site_id!r} not found in data/snapshots/api-sites.json")

    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST_PATH))
    parser.add_argument("--sites-snapshot", default=str(DEFAULT_SITES_SNAPSHOT_PATH))
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    sites_path = Path(args.sites_snapshot)

    if not manifest_path.exists():
        print(f"FAIL manifest: {manifest_path} does not exist")
        return 1

    with open(manifest_path) as f:
        manifest = json.load(f)

    site_ids = None
    if sites_path.exists():
        with open(sites_path) as f:
            sites_data = json.load(f)
        site_ids = {s["site_id"] for s in sites_data.get("sites", [])}
    else:
        print(f"WARNING: {sites_path} not found -- skipping site_id membership check", file=sys.stderr)

    excerpts = manifest.get("excerpts", [])
    if not excerpts:
        print("FAIL manifest: no excerpts present")
        return 1

    all_failures = []
    for entry in excerpts:
        all_failures.extend(validate_entry(entry, site_ids))

    for failure in all_failures:
        print(f"FAIL {failure}")

    if all_failures:
        print(f"\n{len(all_failures)} validation failure(s) across {len(excerpts)} excerpt(s)")
        return 1

    print(f"OK: {len(excerpts)} excerpt(s) validated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
