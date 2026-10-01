"""
Characterization tests for lambdas/classifier/region_detection.py.

These tests pin the CURRENT, pre-fix behaviour of the region confidence
multiplier (0.6 out-of-distribution, 0.7 unknown-region) as it exists
today. Per CONTEXT.md D-12, this behaviour is known-wrong: raw softmax
probabilities should not be scaled by a region multiplier. Plan 01-11
removes the multiplier and inverts the assertions below.

Ported from scripts/test_region_detection.py (manual smoke script) into
pytest functions, plus two new characterization cases for the
soon-to-be-removed multiplier behaviour.
"""

import sys
from pathlib import Path

import pytest

# region_detection.py lives one directory up from this test file
# (lambdas/classifier/region_detection.py); add it to sys.path so
# `import region_detection` resolves without needing a package __init__.
sys.path.insert(0, str(Path(__file__).parent.parent))

from region_detection import detect_region, adjust_classification, REGION_BOUNDS  # noqa: E402


# --- In-distribution (training) regions -----------------------------------

def test_indonesia_in_training_distribution():
    result = detect_region(-4.93, 119.32)
    assert result["in_training_distribution"] is True
    assert result["confidence_multiplier"] == 1.0


def test_australia_gbr_in_training_distribution():
    result = detect_region(-18.0, 147.0)
    assert result["in_training_distribution"] is True
    assert result["region"] == "GREAT_BARRIER_REEF"


def test_kenya_in_training_distribution():
    result = detect_region(-2.22, 41.01)
    assert result["in_training_distribution"] is True
    assert result["region"] == "EAST_AFRICA"


def test_maldives_in_training_distribution():
    result = detect_region(4.17, 73.51)
    assert result["in_training_distribution"] is True
    assert result["region"] == "MALDIVES"


def test_mexico_mesoamerican_in_training_distribution():
    result = detect_region(20.5, -87.4)
    assert result["in_training_distribution"] is True
    assert result["region"] == "MESOAMERICAN_REEF"


# --- Out-of-distribution regions -------------------------------------------

def test_jamaica_out_of_distribution():
    result = detect_region(18.1, -77.3)
    assert result["in_training_distribution"] is False
    assert result["region"] == "CARIBBEAN"
    assert result["confidence_multiplier"] == 0.6


def test_florida_keys_out_of_distribution():
    # NOTE: the ad hoc scripts/test_region_detection.py this was ported from
    # asserted region == "CARIBBEAN" here, but FLORIDA_KEYS is a smaller,
    # more specific bounding box than CARIBBEAN, so smallest-area-wins
    # (region_detection.py:149-152) actually picks FLORIDA_KEYS. That
    # original assertion was never enforced (the script only counted
    # pass/fail, it didn't exit non-zero mid-run) — this pins the real
    # current behaviour instead of the stale manual-script expectation.
    result = detect_region(24.5, -81.8)
    assert result["in_training_distribution"] is False
    assert result["region"] == "FLORIDA_KEYS"


def test_red_sea_out_of_distribution():
    result = detect_region(25.0, 37.0)
    assert result["in_training_distribution"] is False
    assert result["region"] == "RED_SEA"


def test_eastern_atlantic_out_of_distribution():
    result = detect_region(15.0, -17.0)
    assert result["in_training_distribution"] is False
    assert result["region"] == "EASTERN_ATLANTIC"


# --- Unknown / null coordinates ---------------------------------------------

def test_unknown_coordinates():
    result = detect_region(None, None)
    assert result["in_training_distribution"] is False
    assert result["confidence_multiplier"] == 0.7
    assert result["region"] == "UNKNOWN"


# --- Overlap resolution (smallest bounding box wins) ------------------------

def test_mesoamerican_smaller_than_caribbean():
    meso = REGION_BOUNDS["MESOAMERICAN_REEF"]
    carib = REGION_BOUNDS["CARIBBEAN"]
    meso_area = (meso["lat_max"] - meso["lat_min"]) * (meso["lon_max"] - meso["lon_min"])
    carib_area = (carib["lat_max"] - carib["lat_min"]) * (carib["lon_max"] - carib["lon_min"])
    assert meso_area < carib_area


def test_east_africa_smaller_than_indian_ocean():
    ea = REGION_BOUNDS["EAST_AFRICA"]
    io = REGION_BOUNDS["INDIAN_OCEAN"]
    ea_area = (ea["lat_max"] - ea["lat_min"]) * (ea["lon_max"] - ea["lon_min"])
    io_area = (io["lat_max"] - io["lat_min"]) * (io["lon_max"] - io["lon_min"])
    assert ea_area < io_area


def test_gbr_smaller_than_indo_pacific_west():
    gbr = REGION_BOUNDS["GREAT_BARRIER_REEF"]
    ipw = REGION_BOUNDS["INDO_PACIFIC_WEST"]
    gbr_area = (gbr["lat_max"] - gbr["lat_min"]) * (gbr["lon_max"] - gbr["lon_min"])
    ipw_area = (ipw["lat_max"] - ipw["lat_min"]) * (ipw["lon_max"] - ipw["lon_min"])
    assert gbr_area < ipw_area


# --- Characterization of the known-wrong multiplier behaviour (D-12) -------
# These two tests pin CURRENT behaviour so plan 01-11 has a concrete
# regression signal to invert when it removes the region multiplier.

def test_characterization_unknown_region_multiplier_is_0_7():
    """detect_region(None, None) currently yields multiplier 0.7, region UNKNOWN."""
    result = detect_region(None, None)
    assert result["confidence_multiplier"] == 0.7
    assert result["region"] == "UNKNOWN"


def test_characterization_adjust_classification_scales_probabilities():
    """
    With no coordinates, adjust_classification currently scales probabilities
    that sum to 1 down to summing to 0.7 (the unknown-region multiplier).
    This is the exact bug D-12 removes: probabilities should remain raw
    softmax output, not be multiplied by a region confidence factor.
    """
    classification = {
        "confidence": 0.9,
        "probabilities": {
            "healthy": 0.4,
            "degraded": 0.3,
            "restored_early": 0.2,
            "restored_mid": 0.1,
        },
    }
    region_result = detect_region(None, None)
    adjusted = adjust_classification(classification, region_result)

    total = sum(adjusted["probabilities"].values())
    assert total == pytest.approx(0.7)
