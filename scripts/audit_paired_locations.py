#!/usr/bin/env python3
"""
Audit MARRS sample directories to identify available locations
and health states for the audio comparison feature.

Scans data/marrs/samples/ and outputs data/paired_audio_locations.json.
"""

import json
import os
from pathlib import Path
from collections import defaultdict

SAMPLES_DIR = Path(__file__).resolve().parent.parent / "data" / "marrs" / "samples"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "paired_audio_locations.json"

# Country code to full name / region mapping
COUNTRY_INFO = {
    "aus": {"name": "Australia", "region": "Great Barrier Reef"},
    "ind": {"name": "Indonesia", "region": "Sulawesi"},
    "ken": {"name": "Kenya", "region": "Mombasa Coast"},
    "mal": {"name": "Maldives", "region": "North Male Atoll"},
    "mex": {"name": "Mexico", "region": "Caribbean Coast"},
}

# Status code to full name mapping
STATUS_MAP = {
    "H": "healthy",
    "D": "degraded",
    "R": "restored_mid",
    "N": "restored_early",
}


def main():
    if not SAMPLES_DIR.exists():
        print(f"ERROR: Samples directory not found: {SAMPLES_DIR}")
        return

    # Group sites by country code
    # Structure: country -> status -> site_name -> [wav_files]
    countries = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))

    for site_dir in sorted(SAMPLES_DIR.iterdir()):
        if not site_dir.is_dir():
            continue

        site_name = site_dir.name  # e.g., "ind_H1"
        parts = site_name.split("_")
        if len(parts) != 2:
            print(f"  Skipping unrecognized directory: {site_name}")
            continue

        country_code = parts[0]  # e.g., "ind"
        status_char = parts[1][0]  # e.g., "H"

        if country_code not in COUNTRY_INFO:
            print(f"  Skipping unknown country code: {country_code}")
            continue

        if status_char not in STATUS_MAP:
            print(f"  Skipping unknown status code: {status_char} in {site_name}")
            continue

        status_name = STATUS_MAP[status_char]

        # Count WAV files
        wav_files = [f for f in site_dir.iterdir() if f.suffix.upper() == ".WAV"]
        countries[country_code][status_name][site_name] = [str(f) for f in sorted(wav_files)]

    # Build output structure
    locations = []
    for country_code in sorted(countries.keys()):
        info = COUNTRY_INFO[country_code]
        statuses = countries[country_code]

        available_states = sorted(statuses.keys())
        sites_per_state = {}
        for status_name, sites in statuses.items():
            sites_per_state[status_name] = len(sites)

        # Also collect detailed site info for prepare script
        sites_detail = {}
        for status_name, sites in statuses.items():
            sites_detail[status_name] = {}
            for site_name, wav_files in sites.items():
                sites_detail[status_name][site_name] = {
                    "wav_count": len(wav_files),
                    "files": wav_files,
                }

        location = {
            "id": country_code,
            "name": info["name"],
            "region": info["region"],
            "available_states": available_states,
            "sites_per_state": sites_per_state,
            "sites_detail": sites_detail,
        }
        locations.append(location)

    output = {"locations": locations}

    # Write JSON
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Output written to: {OUTPUT_PATH}")
    print(f"\nFound {len(locations)} countries:\n")

    for loc in locations:
        states_str = ", ".join(loc["available_states"])
        print(f"  {loc['name']} ({loc['id']}): {states_str}")
        for state, count in loc["sites_per_state"].items():
            # Count total WAV files across all sites for this state
            total_wavs = sum(
                s["wav_count"] for s in loc["sites_detail"][state].values()
            )
            print(f"    {state}: {count} sites, {total_wavs} WAV files")


if __name__ == "__main__":
    main()
