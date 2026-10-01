#!/usr/bin/env python3
"""
D-05/D-09 (TRUTH-04): Generate the gallery section of data/audio-manifest.json
from real excerpts (data/audio-manifest.json "excerpts", already real MARRS
audio per 01-03), the live-site snapshot (data/snapshots/api-sites.json) and
the D-17 label-provenance overlay (lambdas/shared/site_provenance.py +
data/site-label-provenance.json) -- the same overlay function the router and
classifier use, so the gallery can never drift from the per-site truth again.

Writes two things into data/audio-manifest.json, in place:
  - Each "excerpts[*]" entry gains a "label" object (status, label_original,
    label_definition, label_assigned_by, label_source).
  - A top-level "gallery": {samples, stories} section, built only from
    excerpts that exist and sites that exist in the snapshot -- no sample can
    reference a site absent from the reference dataset (TRUTH-04), and no
    sample's category can differ from its site's overlaid status.

Deterministic: re-running this script against its own output produces a
byte-identical data/audio-manifest.json (sorted keys, 2-space indent, LF
line endings, no non-deterministic ordering or randomness).

Usage:
    py -3.12 scripts/build_gallery_manifest.py
"""

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "lambdas" / "shared"))
import site_provenance as sp  # noqa: E402

MANIFEST_PATH = REPO_ROOT / "data" / "audio-manifest.json"
SITES_SNAPSHOT_PATH = REPO_ROOT / "data" / "snapshots" / "api-sites.json"
PROVENANCE_PATH = REPO_ROOT / "data" / "site-label-provenance.json"
CITATIONS_PATH = REPO_ROOT / "dashboard-next" / "src" / "data" / "citations.json"
GALLERY_STORIES_PATH = REPO_ROOT / "data" / "gallery-stories.json"

# D-05 action: fixed country_code map for the countries this gallery's
# excerpts cover today. Any country not listed here raises, rather than
# silently emitting a sample with no country_code.
COUNTRY_CODES = {
    "Indonesia": "IDN",
    "Australia": "AUS",
    "Mexico": "MEX",
    "Kenya": "KEN",
    "Maldives": "MDV",
}


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_label(site_overlay):
    """The subset of apply_label_provenance's output stored per excerpt."""
    return {
        "status": site_overlay["status"],
        "label_original": site_overlay["label_original"],
        "label_definition": site_overlay["label_definition"],
        "label_assigned_by": site_overlay["label_assigned_by"],
        "label_source": site_overlay["label_source"],
    }


def build_description(site_id, site_overlay, excerpt):
    """
    States only what is known: site id, the dataset's own label (quoted) and
    its definition, the recorder-clock date/time with 'timezone unverified',
    and the duration. No species, behaviour, or condition claims.
    """
    recorded_at = excerpt["recorded_at_recorder_clock"]
    date_part, _, time_part = recorded_at.partition("T")
    duration_s = excerpt["duration_s"]
    duration_str = str(int(duration_s)) if float(duration_s).is_integer() else str(duration_s)
    return (
        f'{site_id}: labelled "{site_overlay["label_original"]}" by {site_overlay["label_assigned_by"]} '
        f'({site_overlay["label_definition"]}) Recorded {date_part} at {time_part} '
        f"(recorder-clock time, timezone unverified). {duration_str}-second excerpt."
    )


def build_sample(excerpt, site, site_overlay, citation):
    site_id = excerpt["site_id"]
    category = site_overlay["status"]
    name_term = category.replace("_", " ").capitalize()
    region = site.get("region") or site["country"]
    country = site["country"]
    country_code = COUNTRY_CODES.get(country)
    if country_code is None:
        raise KeyError(f"No country_code mapped for country {country!r} (site {site_id})")

    return {
        "id": excerpt["excerpt_id"],
        "site_id": site_id,
        "excerpt_id": excerpt["excerpt_id"],
        "name": f"{name_term} reference reef, {region} ({site_id})",
        "country": country,
        "country_code": country_code,
        "category": category,
        "description": build_description(site_id, site_overlay, excerpt),
        "duration_seconds": excerpt["duration_s"],
        "audio_path": excerpt["url_path"],
        "frequency_highlights": [],
        "coordinates": {"lat": site["latitude"], "lng": site["longitude"]},
        "attribution": {
            "citation_id": site_overlay["label_source"],
            "short": citation["short"],
            "doi": citation.get("doi"),
            "licence": citation["licence"],
        },
    }


def build_gallery(manifest, sites_by_id, provenance, citations, gallery_stories):
    samples = []
    excerpt_id_by_site_id = {}

    for excerpt in manifest["excerpts"]:
        site_id = excerpt["site_id"]
        site = sites_by_id.get(site_id)
        if site is None:
            raise KeyError(
                f"Excerpt {excerpt['excerpt_id']} references site_id {site_id!r}, "
                "which is absent from data/snapshots/api-sites.json (TRUTH-04 violation)"
            )

        overlay = sp.apply_label_provenance(site, provenance)
        excerpt["label"] = build_label(overlay)

        citation = citations["citations"][overlay["label_source"]]
        samples.append(build_sample(excerpt, site, overlay, citation))
        excerpt_id_by_site_id[site_id] = excerpt["excerpt_id"]

    samples.sort(key=lambda s: s["id"])

    stories = {}
    for story_key, story in gallery_stories["stories"].items():
        sample_ids = []
        for site_id in story["sites"]:
            if site_id not in excerpt_id_by_site_id:
                raise KeyError(
                    f"Story {story_key!r} references site_id {site_id!r}, which has no "
                    "excerpt in data/audio-manifest.json"
                )
            sample_ids.append(excerpt_id_by_site_id[site_id])
        stories[story_key] = {
            "title": story["title"],
            "subtitle": story["subtitle"],
            "sample_ids": sample_ids,
        }

    return {"samples": samples, "stories": stories}


def main():
    manifest = load_json(MANIFEST_PATH)
    sites_snapshot = load_json(SITES_SNAPSHOT_PATH)
    provenance = load_json(PROVENANCE_PATH)
    citations = load_json(CITATIONS_PATH)
    gallery_stories = load_json(GALLERY_STORIES_PATH)

    sites_by_id = {s["site_id"]: s for s in sites_snapshot["sites"]}

    manifest["gallery"] = build_gallery(manifest, sites_by_id, provenance, citations, gallery_stories)

    with open(MANIFEST_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
        f.write("\n")

    print(
        f"OK: wrote gallery section ({len(manifest['gallery']['samples'])} samples, "
        f"{len(manifest['gallery']['stories'])} stories) to {MANIFEST_PATH}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
