"""
Tests for scripts/build_gallery_manifest.py (D-05/D-09, TRUTH-04).

Assumes `py -3.12 scripts/build_gallery_manifest.py` has already been run
(as in the plan's <verify> command), so data/audio-manifest.json already
carries a "gallery" section to assert against. The idempotency test below
also re-runs the generator itself.
"""

import json
import pathlib
import shutil
import sys

import pytest

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent.parent
REPO_ROOT = SCRIPTS_DIR.parent

sys.path.insert(0, str(SCRIPTS_DIR))
import build_gallery_manifest as bgm  # noqa: E402

MANIFEST_PATH = REPO_ROOT / "data" / "audio-manifest.json"

# Banned-claims list (TRUTH-04 / D-09): gallery descriptions state only site,
# dataset label and definition, date/time, and duration -- no biology,
# condition or disturbance claims beyond what the dataset's own term says.
BANNED_CLAIM_WORDS = [
    "bleach",
    "coral cover",
    "overfish",
    "chorus density",
    "grouper",
    "clownfish",
    "parrotfish",
    "damselfish",
    "snapping shrimp",
    "fish chorus",
    "species",
]


@pytest.fixture(scope="module")
def generated_manifest():
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def test_gallery_section_present(generated_manifest):
    assert "gallery" in generated_manifest
    assert "samples" in generated_manifest["gallery"]
    assert "stories" in generated_manifest["gallery"]


def test_one_sample_per_excerpt(generated_manifest):
    assert len(generated_manifest["gallery"]["samples"]) == len(generated_manifest["excerpts"])


def test_every_excerpt_gained_a_label_object(generated_manifest):
    for excerpt in generated_manifest["excerpts"]:
        label = excerpt["label"]
        for key in ("status", "label_original", "label_definition", "label_assigned_by", "label_source"):
            assert key in label


def test_aus_r1_category_is_restored_mid(generated_manifest):
    samples_by_site = {s["site_id"]: s for s in generated_manifest["gallery"]["samples"]}
    assert samples_by_site["aus_R1"]["category"] == "restored_mid"


def test_no_phl_site_in_gallery(generated_manifest):
    assert not any(s["site_id"].startswith("phl") for s in generated_manifest["gallery"]["samples"])


def test_exactly_three_stories(generated_manifest):
    assert len(generated_manifest["gallery"]["stories"]) == 3


def test_stories_reference_only_existing_sample_ids(generated_manifest):
    sample_ids = {s["id"] for s in generated_manifest["gallery"]["samples"]}
    for story in generated_manifest["gallery"]["stories"].values():
        for sid in story["sample_ids"]:
            assert sid in sample_ids


def test_category_matches_site_status_for_every_sample(generated_manifest):
    excerpt_labels_by_site = {e["site_id"]: e["label"] for e in generated_manifest["excerpts"]}
    for sample in generated_manifest["gallery"]["samples"]:
        assert sample["category"] == excerpt_labels_by_site[sample["site_id"]]["status"]


def test_frequency_highlights_always_empty(generated_manifest):
    assert all(s["frequency_highlights"] == [] for s in generated_manifest["gallery"]["samples"])


def test_descriptions_avoid_banned_claims(generated_manifest):
    for sample in generated_manifest["gallery"]["samples"]:
        desc_lower = sample["description"].lower()
        for banned in BANNED_CLAIM_WORDS:
            assert banned not in desc_lower, f"{sample['id']} description contains banned claim {banned!r}"


def test_descriptions_state_site_id_and_timezone_unverified(generated_manifest):
    for sample in generated_manifest["gallery"]["samples"]:
        desc = sample["description"]
        assert sample["site_id"] in desc
        assert "timezone unverified" in desc


def test_samples_have_attribution(generated_manifest):
    for sample in generated_manifest["gallery"]["samples"]:
        attribution = sample["attribution"]
        assert attribution["citation_id"]
        assert attribution["short"]
        assert attribution["licence"]


def test_regenerating_manifest_is_idempotent(generated_manifest, tmp_path):
    backup = tmp_path / "audio-manifest-before.json"
    shutil.copy(MANIFEST_PATH, backup)

    bgm.main()

    after = MANIFEST_PATH.read_bytes()
    before = backup.read_bytes()
    assert after == before
