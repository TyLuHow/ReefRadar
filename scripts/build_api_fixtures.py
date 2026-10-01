#!/usr/bin/env python3
"""
D-22/D-17: Build dashboard-next/tests/fixtures/api/{sites,samples}.json
deterministically from the same code the router/classifier run.

- sites.json: the live-site snapshot (data/snapshots/api-sites.json) with
  every site passed through site_provenance.apply_label_provenance() --
  same overlay function, same data/site-label-provenance.json input, as
  Task 1 and the Lambda packages plans 01-11/01-12 will bundle. Top-level
  count fields (total_sites, total_all_sites, sites_with_embeddings,
  countries, version, source, notes, snapshot_at) are preserved verbatim.
- samples.json: {samples, stories} in the /samples response shape, sourced
  from data/audio-manifest.json's "gallery" section (written by
  scripts/build_gallery_manifest.py). "audio_path" is renamed to
  "audio_url" with its relative value kept as-is (no host, no query
  string) -- fixtures never carry a presigned S3 URL.

Deterministic: sorted keys, 2-space indent, LF line endings, trailing
newline. --check compares a fresh render (read, not written) against the
two committed fixture files and exits 1 if either differs.

Usage:
    py -3.12 scripts/build_api_fixtures.py          # write both fixtures
    py -3.12 scripts/build_api_fixtures.py --check  # verify, don't write
"""

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "lambdas" / "shared"))
import site_provenance as sp  # noqa: E402

SITES_SNAPSHOT_PATH = REPO_ROOT / "data" / "snapshots" / "api-sites.json"
PROVENANCE_PATH = REPO_ROOT / "data" / "site-label-provenance.json"
AUDIO_MANIFEST_PATH = REPO_ROOT / "data" / "audio-manifest.json"

SITES_FIXTURE_PATH = REPO_ROOT / "dashboard-next" / "tests" / "fixtures" / "api" / "sites.json"
SAMPLES_FIXTURE_PATH = REPO_ROOT / "dashboard-next" / "tests" / "fixtures" / "api" / "samples.json"


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def render_sites_fixture():
    snapshot = load_json(SITES_SNAPSHOT_PATH)
    provenance = load_json(PROVENANCE_PATH)

    fixture = dict(snapshot)
    fixture["sites"] = [sp.apply_label_provenance(s, provenance) for s in snapshot["sites"]]
    return fixture


def render_samples_fixture():
    manifest = load_json(AUDIO_MANIFEST_PATH)
    gallery = manifest["gallery"]

    samples = [
        {
            "id": sample["id"],
            "site_id": sample["site_id"],
            "name": sample["name"],
            "country": sample["country"],
            "country_code": sample["country_code"],
            "category": sample["category"],
            "description": sample["description"],
            "duration_seconds": sample["duration_seconds"],
            "audio_url": sample["audio_path"],
            "frequency_highlights": sample["frequency_highlights"],
            "coordinates": sample["coordinates"],
            "attribution": sample["attribution"],
        }
        for sample in gallery["samples"]
    ]

    stories = {
        key: {
            "title": story["title"],
            "subtitle": story["subtitle"],
            "sample_ids": story["sample_ids"],
        }
        for key, story in gallery["stories"].items()
    }

    return {"samples": samples, "stories": stories}


def render_to_text(data):
    return json.dumps(data, indent=2, sort_keys=True) + "\n"


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(render_to_text(data))


def check():
    mismatches = []
    for path, renderer in (
        (SITES_FIXTURE_PATH, render_sites_fixture),
        (SAMPLES_FIXTURE_PATH, render_samples_fixture),
    ):
        fresh = render_to_text(renderer())
        if not path.exists():
            mismatches.append(f"{path}: does not exist")
            continue
        # read_text() applies universal-newline translation, so a CRLF
        # working-tree checkout (Windows core.autocrlf) still compares
        # equal to the LF-joined fresh render.
        committed = path.read_text(encoding="utf-8")
        if committed != fresh:
            mismatches.append(f"{path}: differs from a fresh render")

    for m in mismatches:
        print(f"FAIL {m}")

    if mismatches:
        return 1
    print("OK: both fixtures match a fresh render")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="exit 1 if either fixture is stale, without writing")
    args = parser.parse_args()

    if args.check:
        return check()

    write_json(SITES_FIXTURE_PATH, render_sites_fixture())
    write_json(SAMPLES_FIXTURE_PATH, render_samples_fixture())
    print(f"OK: wrote {SITES_FIXTURE_PATH} and {SAMPLES_FIXTURE_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
