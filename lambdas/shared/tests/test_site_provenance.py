"""
Tests for lambdas/shared/site_provenance.py (D-17 label provenance overlay).

`pythonpath = scripts lambdas/shared` in pytest.ini puts lambdas/shared on
sys.path for every pytest run in this repo, so `import site_provenance`
resolves directly -- the same module object the router, the classifier and
scripts/build_api_fixtures.py will all import.
"""

import copy
import json
import pathlib

import pytest
import site_provenance as sp

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent
PROVENANCE_PATH = REPO_ROOT / "data" / "site-label-provenance.json"
SNAPSHOT_PATH = REPO_ROOT / "data" / "snapshots" / "api-sites.json"


@pytest.fixture(scope="module")
def prov():
    return sp.load_provenance(str(PROVENANCE_PATH))


@pytest.fixture(scope="module")
def snapshot_sites():
    with open(SNAPSHOT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)["sites"]


def _find(sites, site_id):
    for s in sites:
        if s["site_id"] == site_id:
            return s
    raise AssertionError(f"{site_id} not found in snapshot")


def test_marrs_site_keeps_status_and_names_marrs_researchers(prov, snapshot_sites):
    site = _find(snapshot_sites, "ind_H1")
    assert site["status"] == "healthy"

    result = sp.apply_label_provenance(site, prov)

    assert result["status"] == "healthy"
    assert result["label_source"] == "marrs"
    assert "MARRS" in result["label_assigned_by"]
    assert result["label_definition"] == "Least disturbed reef habitat in the local area."


def test_apply_label_provenance_does_not_mutate_input(prov, snapshot_sites):
    site = _find(snapshot_sites, "aus_R1")
    original = copy.deepcopy(site)

    result = sp.apply_label_provenance(site, prov)

    assert site == original
    assert result is not site
    assert result["status"] == "restored_mid"


def test_borabora_tourist_and_boat_traffic_become_unknown(prov, snapshot_sites):
    tourist = sp.apply_label_provenance(_find(snapshot_sites, "borabora_tourist"), prov)
    boat = sp.apply_label_provenance(_find(snapshot_sites, "borabora_boat_traffic"), prov)

    assert tourist["status"] == "unknown"
    assert tourist["label_original"] == "tourist"
    assert "disturbance" in tourist["label_definition"].lower()

    assert boat["status"] == "unknown"
    assert boat["label_original"] == "boat traffic"
    assert "disturbance" in boat["label_definition"].lower()


def test_irma_western_dry_rocks_is_unknown_with_post_hurricane_period(prov, snapshot_sites):
    site = _find(snapshot_sites, "irma_western_dry_rocks")
    assert site["status"] == "healthy"  # pre-overlay value is ReefRadar's own invention

    result = sp.apply_label_provenance(site, prov)

    assert result["status"] == "unknown"
    assert "October 2017" in result["period"]
    assert "Irma" in result["period"]


def test_sanctsound_sites_are_unknown_with_null_label_original(prov, snapshot_sites):
    for site_id in ("sanctsound_fk01", "sanctsound_fk02", "sanctsound_fk03", "sanctsound_fk04"):
        result = sp.apply_label_provenance(_find(snapshot_sites, site_id), prov)
        assert result["status"] == "unknown"
        assert result["label_original"] is None
        assert "no health status" in result["status_basis"].lower()


def test_unknown_site_id_raises_keyerror(prov):
    with pytest.raises(KeyError):
        sp.apply_label_provenance({"site_id": "atlantis_Z9", "status": "healthy"}, prov)


def test_every_site_in_snapshot_resolves_to_a_label_source(prov, snapshot_sites):
    overlaid = [sp.apply_label_provenance(s, prov) for s in snapshot_sites]

    assert len(overlaid) == 54
    assert all(s["label_source"] for s in overlaid)


def test_overlay_never_invents_a_non_unknown_status(prov, snapshot_sites):
    marrs_statuses = {"healthy", "degraded", "restored_early", "restored_mid"}
    for s in snapshot_sites:
        result = sp.apply_label_provenance(s, prov)
        assert result["status"] in marrs_statuses | {"unknown"}
        if s["source"] == "MARRS":
            # MARRS statuses are never touched by the overlay.
            assert result["status"] == s["status"]


def test_ken_d3_carries_naming_note(prov, snapshot_sites):
    site = _find(snapshot_sites, "ken_D3")
    result = sp.apply_label_provenance(site, prov)

    assert "ken_D2" in result["label_note"]
    # ken_D3 has no per-site status_override: its MARRS status is untouched.
    assert result["status"] == site["status"]
