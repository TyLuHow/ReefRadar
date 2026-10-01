#!/usr/bin/env python3
"""
Extract real, rule-selected MARRS excerpts from figshare site zips and write
a committed provenance manifest.

Per D-05/D-06/D-07 (Phase 1 Plan 3):
  - Selection is rule-based and deterministic (see select_file()).
  - Excerpts are served at the NATIVE sample rate (16 kHz) with ZERO gain
    change -- no resampling, no peak scaling of any kind. Do not reuse
    prepare_comparison_audio.py's level-matching step; this script never
    imports from it and never alters sample amplitude.
  - Every excerpt's provenance (source zip, source file, recorder-clock
    timestamp marked timezone-unverified, offset, duration, sha256,
    dataset DOI/licence) is recorded in data/audio-manifest.json.

Reuses the already-correct HTTP-Range central-directory reader from
scripts/download_marrs_samples.py (get_zip_central_directory,
download_file_from_zip) rather than re-implementing ZIP64 parsing.

Usage:
    py -3.12 scripts/extract_marrs_excerpts.py --sites ind_H1
    py -3.12 scripts/extract_marrs_excerpts.py --sites ind_D1,ind_N1,ind_R1
"""

import argparse
import hashlib
import io
import json
import os
import re
import sys
import wave
from datetime import datetime
from pathlib import Path

import numpy as np
import requests

# Make the sibling download_marrs_samples module importable regardless of cwd.
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from download_marrs_samples import get_zip_central_directory, download_file_from_zip  # noqa: E402

REPO_ROOT = SCRIPTS_DIR.parent
MARRS_AUDIO_DIR = REPO_ROOT / "dashboard-next" / "public" / "audio" / "marrs"
DEFAULT_MANIFEST_PATH = REPO_ROOT / "data" / "audio-manifest.json"
SITES_SNAPSHOT_PATH = REPO_ROOT / "data" / "snapshots" / "api-sites.json"

FIGSHARE_API_URL = "https://api.figshare.com/v2/articles/29958062/files"
FIGSHARE_DOI = "10.5522/04/29958062"

# Matches "<anything>_<YYYYMMDD>_<HHMMSS>.WAV" (case-insensitive extension).
# The site-id prefix itself may contain underscores (e.g. "ind_H1"), so the
# prefix is captured non-greedily rather than restricted to \w+.
TIMESTAMP_RE = re.compile(r"^(?P<prefix>.+)_(?P<date>\d{8})_(?P<time>\d{6})\.WAV$", re.IGNORECASE)


def list_figshare_files():
    """Paginate the figshare article's file listing until a short page."""
    files = []
    page = 1
    while True:
        resp = requests.get(FIGSHARE_API_URL, params={"page": page, "page_size": 100}, timeout=30)
        resp.raise_for_status()
        batch = resp.json()
        files.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    return files


def build_figshare_lookup(files):
    """site_id -> {download_url, size, id} for every real site zip."""
    lookup = {}
    for f in files:
        name = f.get("name", "")
        if not name.lower().endswith(".zip"):
            continue
        site_id = name[: -len(".zip")]
        if site_id.startswith("detections_"):
            continue
        lookup[site_id] = {
            "download_url": f["download_url"],
            "size": f["size"],
            "id": f["id"],
        }
    return lookup


def parse_timestamp(basename):
    """Return (date_str YYYYMMDD, time_str HHMMSS, datetime) or None."""
    m = TIMESTAMP_RE.match(basename)
    if not m:
        return None
    date_str, time_str = m.group("date"), m.group("time")
    try:
        dt = datetime.strptime(date_str + time_str, "%Y%m%d%H%M%S")
    except ValueError:
        return None
    return date_str, time_str, dt


def select_file(filenames, target_time="12:00:00", skip_days=1):
    """
    Rule-based, deterministic selection.

    From WAV basenames shaped <prefix>_<YYYYMMDD>_<HHMMSS>.WAV, pick the file
    on the deployment day (first recorded date + skip_days) whose time is
    nearest the target; falls forward to the next date that has files if the
    target date itself has none; ties resolve to the earlier time;
    non-matching names are ignored.
    """
    parsed = []
    for fn in filenames:
        result = parse_timestamp(fn)
        if result is None:
            continue
        _, _, dt = result
        parsed.append((fn, dt))

    if not parsed:
        raise ValueError(
            "No files match the expected <prefix>_YYYYMMDD_HHMMSS.WAV naming pattern"
        )

    parsed.sort(key=lambda item: item[1])
    dates = sorted({dt.date() for _, dt in parsed})
    first_date = dates[0]
    target_date = first_date.toordinal() + skip_days
    from datetime import date as _date

    target_date = _date.fromordinal(target_date)

    candidate_dates = [d for d in dates if d >= target_date]
    if not candidate_dates:
        raise ValueError(
            f"No files available on or after target date {target_date} "
            f"(first recorded date {first_date}, skip_days={skip_days})"
        )
    chosen_date = candidate_dates[0]

    th, tm, ts = (int(x) for x in target_time.split(":"))
    target_seconds = th * 3600 + tm * 60 + ts

    same_date = [(fn, dt) for fn, dt in parsed if dt.date() == chosen_date]

    def sort_key(item):
        _, dt = item
        seconds = dt.hour * 3600 + dt.minute * 60 + dt.second
        return (abs(seconds - target_seconds), seconds)

    best_fn, _ = min(same_date, key=sort_key)
    return best_fn


def extract_excerpt(wav_bytes, offset_s=15.0, duration_s=30.0):
    """
    Slice a byte-for-byte excerpt out of source WAV bytes. No resampling,
    no gain change of any kind (D-07). Raises if the source is not
    16000 Hz / 16-bit / mono, or is shorter than offset_s + duration_s.
    """
    buf = io.BytesIO(wav_bytes)
    with wave.open(buf, "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        nframes = wf.getnframes()

        if framerate != 16000:
            raise ValueError(f"Expected 16000 Hz source audio, got {framerate} Hz")
        if sampwidth != 2:
            raise ValueError(f"Expected 16-bit (2-byte) samples, got {sampwidth * 8}-bit")
        if channels != 1:
            raise ValueError(f"Expected mono source audio, got {channels} channels")

        start_frame = int(round(offset_s * framerate))
        duration_frames = int(round(duration_s * framerate))
        if nframes < start_frame + duration_frames:
            raise ValueError(
                f"Source too short: has {nframes} frames, "
                f"need {start_frame + duration_frames} (offset {offset_s}s + duration {duration_s}s)"
            )

        wf.setpos(start_frame)
        frames = wf.readframes(duration_frames)

    return {
        "frames": frames,
        "channels": channels,
        "sampwidth": sampwidth,
        "framerate": framerate,
        "nframes": duration_frames,
    }


def write_wav(path, excerpt):
    """Write excerpt frames unchanged, using the source's own WAV params."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(excerpt["channels"])
        wf.setsampwidth(excerpt["sampwidth"])
        wf.setframerate(excerpt["framerate"])
        wf.writeframes(excerpt["frames"])


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def compute_rms_dbfs(frames_bytes):
    """Informational only -- measured, never used to alter the audio."""
    arr = np.frombuffer(frames_bytes, dtype="<i2").astype(np.float64)
    if arr.size == 0:
        return None
    rms = float(np.sqrt(np.mean(arr ** 2)))
    if rms <= 0:
        return -120.0
    return round(20.0 * np.log10(rms / 32768.0), 2)


def load_site_snapshot_ids():
    if not SITES_SNAPSHOT_PATH.exists():
        return None
    with open(SITES_SNAPSHOT_PATH) as f:
        data = json.load(f)
    return {s["site_id"] for s in data.get("sites", [])}


def process_site(site_id, figshare_lookup, args, existing_entry):
    file_info = figshare_lookup[site_id]
    download_url = file_info["download_url"]
    size = file_info["size"]
    figshare_file_id = file_info["id"]

    print(f"[{site_id}] reading zip central directory ({size / (1024 * 1024):.0f} MB archive)...")
    entries = get_zip_central_directory(download_url, size)
    wav_entries = [
        e
        for e in entries
        if e["filename"].upper().endswith(".WAV") and not e["filename"].startswith("__MACOSX")
    ]
    if not wav_entries:
        raise SystemExit(f"ERROR: no WAV files found in {site_id}.zip central directory")

    basenames = sorted(os.path.basename(e["filename"]) for e in wav_entries)
    print(f"[{site_id}] first 3 WAV basenames (spot-check): {basenames[:3]}")

    chosen_basename = select_file(basenames, args.target_time, args.skip_days)
    chosen_entry = next(
        e for e in wav_entries if os.path.basename(e["filename"]) == chosen_basename
    )

    excerpt_id = os.path.splitext(chosen_basename)[0]
    output_filename = f"{excerpt_id}.wav"
    output_path = MARRS_AUDIO_DIR / output_filename

    if (
        output_path.exists()
        and existing_entry is not None
        and existing_entry.get("sha256") == sha256_file(output_path)
    ):
        print(f"[{site_id}] {output_filename} already present with matching sha256 -- skipping download")
        return existing_entry

    print(f"[{site_id}] downloading {chosen_basename} via HTTP range request...")
    wav_bytes = download_file_from_zip(download_url, chosen_entry)
    excerpt = extract_excerpt(wav_bytes, offset_s=args.offset, duration_s=args.duration)
    write_wav(output_path, excerpt)

    ts = parse_timestamp(chosen_basename)
    _, _, recorded_dt = ts

    entry = {
        "excerpt_id": excerpt_id,
        "site_id": site_id,
        "source_zip": f"{site_id}.zip",
        "source_file": chosen_entry["filename"],
        "figshare_file_id": figshare_file_id,
        "recorded_at_recorder_clock": recorded_dt.strftime("%Y-%m-%dT%H:%M:%S"),
        "timezone": "unverified",
        "time_of_day_recorder_clock": recorded_dt.strftime("%H:%M"),
        "offset_s": args.offset,
        "duration_s": args.duration,
        "sample_rate_hz": excerpt["framerate"],
        "channels": excerpt["channels"],
        "bits_per_sample": excerpt["sampwidth"] * 8,
        "gain_db": 0,
        "normalized": False,
        "path": str(output_path.relative_to(REPO_ROOT)).replace("\\", "/"),
        "url_path": f"/audio/marrs/{output_filename}",
        "sha256": sha256_file(output_path),
        "rms_dbfs": compute_rms_dbfs(excerpt["frames"]),
        "bytes": output_path.stat().st_size,
    }
    print(f"[{site_id}] wrote {output_path.relative_to(REPO_ROOT)} ({entry['bytes']} bytes, rms {entry['rms_dbfs']} dBFS)")
    return entry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sites", required=True, help="Comma-separated site ids, e.g. ind_H1,ind_D1")
    parser.add_argument("--target-time", default="12:00:00")
    parser.add_argument("--skip-days", type=int, default=1)
    parser.add_argument("--offset", type=float, default=15.0)
    parser.add_argument("--duration", type=float, default=30.0)
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST_PATH))
    args = parser.parse_args()

    sites = [s.strip() for s in args.sites.split(",") if s.strip()]
    if not sites:
        raise SystemExit("ERROR: --sites produced an empty site list")

    manifest_path = Path(args.manifest)

    existing_manifest = {}
    if manifest_path.exists():
        with open(manifest_path) as f:
            existing_manifest = json.load(f)
    existing_by_site = {e["site_id"]: e for e in existing_manifest.get("excerpts", [])}

    print("Fetching figshare file listing...")
    figshare_files = list_figshare_files()
    figshare_lookup = build_figshare_lookup(figshare_files)

    snapshot_ids = load_site_snapshot_ids()

    # Fail fast and loudly rather than silently substituting -- do all
    # membership checks before downloading anything.
    missing_from_figshare = [s for s in sites if s not in figshare_lookup]
    if missing_from_figshare:
        raise SystemExit(
            f"ERROR: site(s) not found in the figshare file listing: {missing_from_figshare}. "
            "Not substituting silently -- stopping."
        )
    if snapshot_ids is not None:
        missing_from_sites = [s for s in sites if s not in snapshot_ids]
        if missing_from_sites:
            raise SystemExit(
                f"ERROR: site(s) not found in data/snapshots/api-sites.json: {missing_from_sites}. "
                "Not substituting silently -- stopping."
            )

    updated_by_site = dict(existing_by_site)
    for site_id in sites:
        entry = process_site(site_id, figshare_lookup, args, existing_by_site.get(site_id))
        updated_by_site[site_id] = entry

    excerpts = sorted(updated_by_site.values(), key=lambda e: e["excerpt_id"])

    manifest = {
        "schema_version": 1,
        "dataset": {
            "citation_id": "marrs",
            "doi": FIGSHARE_DOI,
            "licence": "CC BY 4.0",
            "figshare_article": 29958062,
        },
        "selection_rule": (
            "For each site, among WAV files named <site>_<YYYYMMDD>_<HHMMSS>.WAV, select the "
            f"file on the date (first recorded date + {args.skip_days} day(s)) whose "
            f"recorder-clock time is nearest {args.target_time}; if no files exist on that "
            "date, fall forward to the next date that has files; ties resolve to the earlier "
            "time. Offset into the selected file is "
            f"{args.offset}s, excerpt duration is {args.duration}s."
        ),
        "timezone_note": (
            "Filename timestamps are the recorder clock; timezone unverified until Phase 8 (DATA-02)."
        ),
        "excerpts": excerpts,
    }

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print(f"\nWrote {manifest_path} with {len(excerpts)} excerpt(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
