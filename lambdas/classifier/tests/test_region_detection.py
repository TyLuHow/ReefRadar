"""
Tests for lambdas/classifier/region_detection.py.

Per CONTEXT.md D-12/TRUTH-06, the 0.6/0.7 region confidence multiplier
that used to scale probabilities and confidence has been removed
entirely. These tests pin the NEW, honest behaviour: `adjust_classification`
never changes label/confidence/probabilities, and `detect_region` reports
a separate region object computed from the classifier's actual (audited)
training sites -- Indonesia and Kenya only, per
docs/model/deployed-model.lock.json (plan 01-10).

This file replaces the pre-fix characterization tests from plan 01-01,
which pinned the old 0.6/0.7-multiplier behaviour as "currently correct".
That behaviour is now gone; `test_old_multiplier_behaviour_is_removed`
below is the one test deliberately kept (inverted) to prove it.
"""

import sys
from pathlib import Path

import pytest

# region_detection.py lives one directory up from this test file
# (lambdas/classifier/region_detection.py); add it to sys.path so
# `import region_detection` resolves without needing a package __init__.
sys.path.insert(0, str(Path(__file__).parent.parent))

from region_detection import (  # noqa: E402
    DEFAULT_TRAINING_SITES,
    adjust_classification,
    detect_region,
)


RAW_CLASSIFICATION = {
    "label": "healthy",
    "confidence": 0.9,
    "probabilities": {
        "healthy": 0.4,
        "degraded": 0.3,
        "restored_early": 0.2,
        "restored_mid": 0.1,
    },
}


def _assert_probabilities_untouched(adjusted):
    assert adjusted["probabilities"] == RAW_CLASSIFICATION["probabilities"]
    assert adjusted["confidence"] == RAW_CLASSIFICATION["confidence"]
    assert adjusted["label"] == RAW_CLASSIFICATION["label"]
    assert sum(adjusted["probabilities"].values()) == pytest.approx(1.0, abs=1e-9)


# --- No coordinates ----------------------------------------------------------


def test_no_coordinates_probabilities_unmodified():
    region_result = detect_region(None, None)
    adjusted = adjust_classification(RAW_CLASSIFICATION, region_result)
    _assert_probabilities_untouched(adjusted)


def test_no_coordinates_fields():
    region_result = detect_region(None, None)
    assert region_result["coordinates_provided"] is False
    assert region_result["in_training_region"] is False
    assert region_result["training_countries"] == ["Indonesia", "Kenya"]


# --- In-training-region coordinates (South Sulawesi, Kenya) -----------------


def test_south_sulawesi_in_training_region():
    region_result = detect_region(-4.93, 119.32)
    adjusted = adjust_classification(RAW_CLASSIFICATION, region_result)
    _assert_probabilities_untouched(adjusted)
    assert region_result["coordinates_provided"] is True
    assert region_result["in_training_region"] is True
    assert region_result["training_countries"] == ["Indonesia", "Kenya"]


def test_kenya_in_training_region():
    region_result = detect_region(-2.21, 41.01)
    adjusted = adjust_classification(RAW_CLASSIFICATION, region_result)
    _assert_probabilities_untouched(adjusted)
    assert region_result["coordinates_provided"] is True
    assert region_result["in_training_region"] is True
    assert region_result["training_countries"] == ["Indonesia", "Kenya"]


# --- Outside-training-region coordinates (GBR, Maldives, Mexico, Florida) ---


@pytest.mark.parametrize(
    "lat,lon",
    [
        (-16.85, 146.23),  # Great Barrier Reef
        (4.89, 72.93),  # Maldives
        (18.34, -87.81),  # Mexico (Mesoamerican reef)
        (24.45, -81.93),  # Florida Keys
    ],
)
def test_outside_training_region_probabilities_unmodified(lat, lon):
    region_result = detect_region(lat, lon)
    adjusted = adjust_classification(RAW_CLASSIFICATION, region_result)
    _assert_probabilities_untouched(adjusted)
    assert region_result["coordinates_provided"] is True
    assert region_result["in_training_region"] is False
    assert region_result["training_countries"] == ["Indonesia", "Kenya"]


def test_great_barrier_reef_region_name():
    region_result = detect_region(-16.85, 146.23)
    assert region_result["region"] == "GREAT_BARRIER_REEF"
    assert region_result["in_training_region"] is False


def test_maldives_region_name():
    region_result = detect_region(4.89, 72.93)
    assert region_result["region"] == "MALDIVES"
    assert region_result["in_training_region"] is False


def test_mexico_region_name():
    region_result = detect_region(18.34, -87.81)
    assert region_result["region"] == "MESOAMERICAN_REEF"
    assert region_result["in_training_region"] is False


def test_florida_keys_region_name():
    region_result = detect_region(24.45, -81.93)
    assert region_result["region"] == "FLORIDA_KEYS"
    assert region_result["in_training_region"] is False


# --- Broad-region coordinates (Philippines) ----------------------------------


def test_philippines_resolves_to_broad_region_and_is_outside_training():
    region_result = detect_region(10.3, 123.9)
    assert region_result["scope"] == "broad"
    assert region_result["in_training_region"] is False


# --- No caveat claims Australia/Maldives/Mexico as classifier training ------
# --- countries (the caveat may still *name the detected region* -- e.g. -----
# --- "appears to be from Maldives" -- that's an honest location statement, -
# --- not a training-coverage claim). -----------------------------------------


@pytest.mark.parametrize(
    "lat,lon",
    [
        (None, None),
        (-4.93, 119.32),
        (-2.21, 41.01),
        (-16.85, 146.23),
        (4.89, 72.93),
        (18.34, -87.81),
        (24.45, -81.93),
        (10.3, 123.9),
    ],
)
def test_caveat_training_countries_are_only_indonesia_and_kenya(lat, lon):
    region_result = detect_region(lat, lon)
    # The field that actually drives any UI/API claim about training
    # coverage must never include the old (incorrect) 5-country MARRS
    # reference-site footprint -- only the classifier's real training
    # countries.
    assert region_result["training_countries"] == ["Indonesia", "Kenya"]
    caveat = region_result["caveat"]
    # The old caveat claimed "Confidence scores have been reduced." -- that
    # exact claim must be gone. A caveat may still honestly say confidence
    # was *not* reduced/adjusted (that's the correct, new claim).
    assert "confidence scores have been reduced" not in caveat.lower()
    assert "confidence has been reduced" not in caveat.lower()


# --- Legacy fields: in_training_distribution mirrors in_training_region, --
# --- confidence_adjusted is always False ------------------------------------


@pytest.mark.parametrize(
    "lat,lon",
    [
        (None, None),
        (-4.93, 119.32),
        (-2.21, 41.01),
        (-16.85, 146.23),
        (4.89, 72.93),
        (18.34, -87.81),
        (24.45, -81.93),
        (10.3, 123.9),
    ],
)
def test_legacy_fields_on_adjusted_region(lat, lon):
    region_result = detect_region(lat, lon)
    adjusted = adjust_classification(RAW_CLASSIFICATION, region_result)
    region = adjusted["region"]
    assert region["in_training_distribution"] == region["in_training_region"]
    assert region["confidence_adjusted"] is False


# --- T-01-11-01: non-numeric / out-of-range coordinates degrade gracefully --


@pytest.mark.parametrize(
    "lat,lon",
    [
        ("not-a-number", 119.32),
        (-4.93, "not-a-number"),
        (999, 119.32),  # out of valid latitude range
        (-4.93, -999),  # out of valid longitude range
        (float("nan"), 119.32),
    ],
)
def test_invalid_coordinates_treated_as_not_provided(lat, lon):
    region_result = detect_region(lat, lon)  # must not raise
    assert region_result["coordinates_provided"] is False
    assert region_result["region"] == "UNKNOWN"


# --- Default training sites mirror the audited lock file --------------------


def test_default_training_sites_are_indonesia_and_kenya_only():
    countries = {site["country"] for site in DEFAULT_TRAINING_SITES}
    assert countries == {"Indonesia", "Kenya"}
    assert len(DEFAULT_TRAINING_SITES) == 5


def test_custom_training_sites_override_default():
    custom_sites = [
        {"site_id": "aus_X1", "country": "Australia", "latitude": -18.0, "longitude": 147.0},
    ]
    region_result = detect_region(-18.0, 147.0, training_sites=custom_sites)
    assert region_result["training_countries"] == ["Australia"]
    assert region_result["in_training_region"] is True
    assert region_result["region"] == "GREAT_BARRIER_REEF"


# --- Characterization of the OLD multiplier behaviour (now removed) --------


def test_old_multiplier_behaviour_is_removed():
    """
    The old region_detection.py scaled probabilities/confidence by a
    0.6 (out-of-distribution) or 0.7 (unknown-region) multiplier, and
    exposed that multiplier as `confidence_multiplier` on detect_region's
    result. D-12 removes this entirely: no multiplier field exists, and
    probabilities/confidence pass through unmodified in every case,
    including the exact no-coordinates case that used to sum to 0.7.
    """
    region_result = detect_region(None, None)
    assert "confidence_multiplier" not in region_result

    adjusted = adjust_classification(RAW_CLASSIFICATION, region_result)
    total = sum(adjusted["probabilities"].values())
    assert total == pytest.approx(1.0, abs=1e-9)
    assert total != pytest.approx(0.7)


# --- WR-07: training coverage is distance-based, not bounding-box-based ------


@pytest.mark.parametrize(
    "lat,lon",
    [
        (-0.5, 130.5),  # Raja Ampat -- inside the INDONESIA box, ~1,000 km from Spermonde
        (5.5, 95.3),  # Aceh
        (-8.65, 115.2),  # Bali
    ],
)
def test_indonesia_elsewhere_is_not_in_training_region(lat, lon):
    region_result = detect_region(lat, lon)
    assert region_result["region"] == "INDONESIA"
    assert region_result["in_training_region"] is False
    assert region_result["training_sites_in_region"] == 0
    assert region_result["nearest_training_site_km"] > 500
    assert "No training site is close" in region_result["caveat"]


def test_spermonde_reports_nearest_training_site_distance():
    region_result = detect_region(-4.93, 119.32)
    assert region_result["in_training_region"] is True
    assert region_result["training_sites_in_region"] == 4
    assert region_result["nearest_training_site_km"] < 2
    adjusted = adjust_classification(RAW_CLASSIFICATION, region_result)
    assert adjusted["region"]["nearest_training_site_km"] == region_result["nearest_training_site_km"]
    assert adjusted["region"]["training_radius_km"] == region_result["training_radius_km"]


def test_broad_region_caveat_does_not_claim_there_is_no_training_data():
    # Philippines resolves to a broad box that CONTAINS the training sites; the
    # old caveat wrongly said that region "has no real training data".
    region_result = detect_region(10.3, 123.9)
    assert "has no real training data" not in region_result["caveat"]
    assert "No training site is close" in region_result["caveat"]


def test_training_site_without_coordinates_is_skipped_not_fatal():
    sites = [
        {"site_id": "bad", "country": "Nowhere", "latitude": None, "longitude": None},
        {"site_id": "good", "country": "Indonesia", "latitude": -4.93, "longitude": 119.32},
    ]
    region_result = detect_region(-4.93, 119.32, training_sites=sites)  # must not raise
    assert region_result["in_training_region"] is True
    assert region_result["training_sites_in_region"] == 1
