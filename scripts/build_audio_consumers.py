#!/usr/bin/env python3
"""
D-05/D-07/D-08/TRUTH-08: Generate every Next.js audio-consumer artifact from
the single committed audio manifest (data/audio-manifest.json).

Outputs:
  - dashboard-next/src/data/audio-manifest.json -- byte-for-byte mirror of
    data/audio-manifest.json, so lib/audio-manifest.ts has a build-time
    importable copy (Task 1).
  - dashboard-next/public/audio/compare/manifest.json -- Location Compare
    manifest, real files only: South Sulawesi (ind) and Great Barrier Reef
    (aus), the only two locations with real excerpts for every state they
    list (Task 3, D-08).
  - dashboard-next/public/audio/ATTRIBUTION.md -- generated attribution: the
    canonical MARRS citation plus one line per excerpt (Task 3, D-19).

--check verifies all three outputs without writing anything; exits 1 on any
drift.

Deterministic: re-running against the same source manifest and snapshot
produces byte-identical output (sorted keys, 2-space indent, LF line
endings).

Usage:
    py -3.12 scripts/build_audio_consumers.py          # write outputs
    py -3.12 scripts/build_audio_consumers.py --check  # verify, exit 1 on drift
"""
import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_MANIFEST = REPO_ROOT / "data" / "audio-manifest.json"
SITES_SNAPSHOT = REPO_ROOT / "data" / "snapshots" / "api-sites.json"
CITATIONS_PATH = REPO_ROOT / "dashboard-next" / "src" / "data" / "citations.json"

MIRROR_MANIFEST = REPO_ROOT / "dashboard-next" / "src" / "data" / "audio-manifest.json"
COMPARE_MANIFEST = REPO_ROOT / "dashboard-next" / "public" / "audio" / "compare" / "manifest.json"
ATTRIBUTION_MD = REPO_ROOT / "dashboard-next" / "public" / "audio" / "ATTRIBUTION.md"

# D-08: Location Compare locations, built only from sites that have a real
# excerpt in data/audio-manifest.json. South Sulawesi (ind) is the priority
# set (full degraded -> restored_early -> restored_mid -> healthy ladder);
# Australia (aus) has degraded/restored_mid/healthy. Any (location, status,
# site_id) listed here without a matching excerpt raises -- this script
# never emits a manifest entry whose file does not exist (D-08).
COMPARE_LOCATIONS = {
    "ind": {
        "name": "South Sulawesi",
        "region": "Indonesia",
        "sites": {
            "degraded": "ind_D1",
            "restored_early": "ind_N1",
            "restored_mid": "ind_R1",
            "healthy": "ind_H1",
        },
        "description": "MARRS restoration sites in South Sulawesi, Indonesia.",
    },
    "aus": {
        "name": "Great Barrier Reef",
        "region": "Australia",
        "sites": {
            "degraded": "aus_D1",
            "restored_mid": "aus_R1",
            "healthy": "aus_H1",
        },
        "description": "MARRS monitoring and restoration sites on the Great Barrier Reef, Australia.",
    },
}

STATUS_ORDER = ["degraded", "restored_early", "restored_mid", "healthy"]


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def dumps_json(data) -> str:
    return json.dumps(data, indent=2, sort_keys=True) + "\n"


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


# --- Compare manifest (Task 3, D-08) -----------------------------------------


def build_compare_manifest(manifest: dict, sites_by_id: dict) -> dict:
    excerpts_by_site_id = {e["site_id"]: e for e in manifest["excerpts"]}

    locations = []
    for loc_id in sorted(COMPARE_LOCATIONS):
        loc = COMPARE_LOCATIONS[loc_id]
        available = []
        files = {}
        excerpts_meta = {}
        for status in STATUS_ORDER:
            site_id = loc["sites"].get(status)
            if site_id is None:
                continue
            excerpt = excerpts_by_site_id.get(site_id)
            if excerpt is None:
                raise KeyError(
                    f"Compare location {loc_id!r} references site_id {site_id!r} for "
                    f"status {status!r}, which has no excerpt in data/audio-manifest.json (D-08)"
                )
            available.append(status)
            files[status] = excerpt["url_path"]
            excerpts_meta[status] = {
                "excerpt_id": excerpt["excerpt_id"],
                "site_id": excerpt["site_id"],
                "recorded_at": excerpt["recorded_at_recorder_clock"],
                "time_of_day": excerpt["time_of_day_recorder_clock"],
                "label_definition": excerpt["label"]["label_definition"],
            }

        if not available:
            raise ValueError(f"Compare location {loc_id!r} has no available states -- drop it (D-08)")

        site_ids = [loc["sites"][s] for s in available]
        lats = [sites_by_id[sid]["latitude"] for sid in site_ids if sid in sites_by_id]
        lngs = [sites_by_id[sid]["longitude"] for sid in site_ids if sid in sites_by_id]
        if len(lats) != len(site_ids) or len(lngs) != len(site_ids):
            missing = [sid for sid in site_ids if sid not in sites_by_id]
            raise KeyError(f"No snapshot coordinates for compare location {loc_id!r} sites {missing}")

        locations.append(
            {
                "id": loc_id,
                "name": loc["name"],
                "region": loc["region"],
                # Coordinates are the centroid of this location's real reference
                # sites, from data/snapshots/api-sites.json.
                "coordinates": {
                    "lat": round(sum(lats) / len(lats), 6),
                    "lon": round(sum(lngs) / len(lngs), 6),
                },
                "available": available,
                "files": files,
                "excerpts": excerpts_meta,
                "description": loc["description"],
            }
        )

    return {"locations": locations}


# --- ATTRIBUTION.md (Task 3, D-19) -------------------------------------------


def build_attribution_md(manifest: dict, citation: dict) -> str:
    lines = [
        "# Audio Attribution",
        "",
        "Canonical citations: [docs/CITATIONS.md](../../../docs/CITATIONS.md)",
        "",
        f"## {citation['title']}",
        "",
        "Every audio file under this directory (including `compare/` and "
        "`marrs/`) is an excerpt of a real recording from this dataset. This "
        "file is generated by scripts/build_audio_consumers.py from "
        "data/audio-manifest.json -- do not edit by hand.",
        "",
        "**Citation:**",
        f"{', '.join(citation['authors'])} ({citation['year']}). {citation['title']}. "
        f"{citation['publisher']}. DOI: {citation['doi']}",
        "",
        f"**License:** {citation['licence']} ({citation['licence_url']})",
        "",
        "**Excerpts:**",
        "",
    ]
    for excerpt in sorted(manifest["excerpts"], key=lambda e: e["excerpt_id"]):
        date_part, _, time_part = excerpt["recorded_at_recorder_clock"].partition("T")
        lines.append(
            f"- `{Path(excerpt['url_path']).name}` -- site {excerpt['site_id']}, from "
            f"source file `{excerpt['source_file']}`, recorder-clock time {date_part} "
            f"{time_part} (timezone unverified), offset {excerpt['offset_s']}s, duration "
            f"{excerpt['duration_s']}s, no processing applied (gain {excerpt['gain_db']} dB, "
            f"native sample rate {excerpt['sample_rate_hz']} Hz)."
        )
    lines.append("")
    return "\n".join(lines)


# --- Orchestration ------------------------------------------------------------


def compute_outputs():
    manifest = load_json(SOURCE_MANIFEST)
    citations = load_json(CITATIONS_PATH)
    citation = citations["citations"][manifest["dataset"]["citation_id"]]
    sites_snapshot = load_json(SITES_SNAPSHOT)
    sites_by_id = {s["site_id"]: s for s in sites_snapshot["sites"]}

    mirror_bytes = SOURCE_MANIFEST.read_bytes()
    compare_manifest = build_compare_manifest(manifest, sites_by_id)
    attribution_md = build_attribution_md(manifest, citation)

    return mirror_bytes, compare_manifest, attribution_md


def run(check: bool) -> bool:
    mirror_bytes, compare_manifest, attribution_md = compute_outputs()
    expected_compare_text = dumps_json(compare_manifest)

    if check:
        ok = True

        if not MIRROR_MANIFEST.exists() or MIRROR_MANIFEST.read_bytes() != mirror_bytes:
            print(f"DRIFT: {MIRROR_MANIFEST} differs from {SOURCE_MANIFEST}")
            ok = False

        if not COMPARE_MANIFEST.exists() or load_json(COMPARE_MANIFEST) != compare_manifest:
            print(f"DRIFT: {COMPARE_MANIFEST} does not match the manifest-generated compare manifest")
            ok = False

        if not ATTRIBUTION_MD.exists() or ATTRIBUTION_MD.read_text(encoding="utf-8") != attribution_md:
            print(f"DRIFT: {ATTRIBUTION_MD} does not match the manifest-generated attribution text")
            ok = False

        if ok:
            print("OK: all audio consumer outputs are in sync with data/audio-manifest.json")
        return ok

    MIRROR_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    with open(MIRROR_MANIFEST, "wb") as f:
        f.write(mirror_bytes)
    write_text(COMPARE_MANIFEST, expected_compare_text)
    write_text(ATTRIBUTION_MD, attribution_md)

    print(f"OK: wrote {MIRROR_MANIFEST}")
    print(f"OK: wrote {COMPARE_MANIFEST} ({len(compare_manifest['locations'])} locations)")
    print(f"OK: wrote {ATTRIBUTION_MD} ({len(load_json(SOURCE_MANIFEST)['excerpts'])} excerpts)")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify outputs are in sync; write nothing")
    args = parser.parse_args()

    ok = run(args.check)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
