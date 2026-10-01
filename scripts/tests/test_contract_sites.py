"""
Phase 2 (CONTRACT-01/02): the v1 sites artifact and manifest, proven against the
committed sources they were built from.

These tests read the committed files under contracts/bucket and compare them to
the independent committed inputs (snapshot, provenance overlay, citations, the
API fixture and the frozen legacy coordinate table). They never write a DOI,
licence or label literal of their own: every expectation is a positive equality
with its source of truth.
"""

import copy
import json
import pathlib

import pytest

import contract_lib
import site_provenance as sp

REPO_ROOT = contract_lib.REPO_ROOT
SNAPSHOT = REPO_ROOT / "data" / "snapshots" / "api-sites.json"
PROVENANCE = REPO_ROOT / "data" / "site-label-provenance.json"
CITATIONS = REPO_ROOT / "dashboard-next" / "src" / "data" / "citations.json"
API_FIXTURE = REPO_ROOT / "dashboard-next" / "tests" / "fixtures" / "api" / "sites.json"
LEGACY_COORDS = contract_lib.FIXTURES_DIR / "legacy-site-coordinates.json"
MANIFEST = contract_lib.BUCKET_DIR / "contract" / "v1.json"
SITES = contract_lib.BUCKET_DIR / "v1" / "sites.json"

SANCTSOUND_IDS = ["sanctsound_fk01", "sanctsound_fk02", "sanctsound_fk03", "sanctsound_fk04"]
LOCATION_ONLY_IDS = {"ken_D3", "irma_eastern_sambo", *SANCTSOUND_IDS}


def _load(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def snapshot():
    return _load(SNAPSHOT)


@pytest.fixture(scope="module")
def citations():
    return _load(CITATIONS)["citations"]


@pytest.fixture(scope="module")
def sites():
    return _load(SITES)["sites"]


@pytest.fixture(scope="module")
def manifest():
    return _load(MANIFEST)


@pytest.fixture(scope="module")
def api_sites():
    return {s["site_id"]: s for s in _load(API_FIXTURE)["sites"]}


def test_sites_are_the_54_snapshot_sites_in_snapshot_order(sites, snapshot):
    assert len(sites) == 54
    assert [s["site_id"] for s in sites] == [s["site_id"] for s in snapshot["sites"]]


def test_every_record_validates_and_is_not_synthetic(sites):
    for record in sites:
        contract_lib.validate(record, "site")
        assert record["synthetic"] is False


def test_dataset_provenance_equals_overlay_and_citations(sites, snapshot, citations):
    prov = _load(PROVENANCE)
    for record, raw in zip(sites, snapshot["sites"]):
        overlaid = sp.apply_label_provenance(raw, prov)
        cite = citations[overlaid["label_source"]]
        assert record["dataset_id"] == overlaid["label_source"]
        assert record["dataset_name"] == raw["source"]
        assert record["doi"] == cite["doi"]
        assert record["licence"] == cite["licence"]
        assert record["licence_url"] == cite["licence_url"]
        assert record["dataset_url"] == cite["url"]
        assert record["label_assigned_by"] == overlaid["label_assigned_by"]
        assert record["label_source_name"] == overlaid["label_source_name"]


def test_doi_is_null_only_for_sanctsound_and_carries_the_citation_reason(sites, citations):
    null_doi = sorted(s["site_id"] for s in sites if s["doi"] is None)
    assert null_doi == SANCTSOUND_IDS
    reason = citations["sanctsound"]["verification_note"]
    assert reason
    for record in sites:
        if record["doi"] is None:
            assert record["doi_note"] == reason
        else:
            assert record["doi_note"] is None


def test_null_label_definition_implies_unknown_status_with_a_basis(sites):
    null_label = [s for s in sites if s["label_definition"] is None]
    assert null_label, "expected sites without an upstream label definition"
    for record in null_label:
        assert record["status"] == "unknown"
        assert isinstance(record["status_basis"], str) and record["status_basis"].strip()


def test_reference_role_is_counted_from_the_data(sites, snapshot):
    embedded = {s["site_id"] for s in snapshot["sites"] if s["has_embedding"]}
    roles = {s["site_id"]: s["reference_role"] for s in sites}
    assert sum(1 for r in roles.values() if r == "acoustic_reference") == 48
    assert sum(1 for r in roles.values() if r == "location_only") == 6
    assert {k for k, r in roles.items() if r == "acoustic_reference"} == embedded
    assert {k for k, r in roles.items() if r == "location_only"} == LOCATION_ONLY_IDS
    # The stale snapshot header must not be what the contract reports.
    assert snapshot["sites_with_embeddings"] != 48


def test_label_fields_equal_the_api_fixture(sites, api_sites):
    for record in sites:
        expected = api_sites[record["site_id"]]
        for key in (
            "status", "label_original", "label_definition", "label_assigned_by",
            "status_basis", "period", "label_note",
        ):
            assert record[key] == expected[key], (record["site_id"], key)


def test_location_and_coordinates_equal_the_frozen_legacy_table(sites):
    legacy = _load(LEGACY_COORDS)
    by_id = {s["site_id"]: s for s in sites}
    listed = [sid for sid in by_id if sid in legacy]
    assert len(listed) == 53
    for site_id in listed:
        assert by_id[site_id]["location_label"] == legacy[site_id]["location"], site_id
        assert by_id[site_id]["latitude"] == legacy[site_id]["lat"], site_id
        assert by_id[site_id]["longitude"] == legacy[site_id]["lon"], site_id
    missing = [sid for sid in by_id if sid not in legacy]
    assert missing == ["irma_eastern_sambo"]
    assert by_id["irma_eastern_sambo"]["location_label"] == "Florida Keys, USA"


def test_manifest_coverage_and_artifacts(manifest, sites):
    contract_lib.validate(manifest, "contract-manifest")
    assert manifest["contract_version"] == 1
    assert manifest["coverage"] == {
        "has_diel": False,
        "has_detections": False,
        "has_pre_post_event": False,
        "has_effort": False,
        "total_sites": 54,
        "sites_with_embeddings": 48,
        "countries": 7,
    }
    assert len({s["country"] for s in sites}) == 7
    for name in ("aggregates_diel", "aggregates_effort", "detections"):
        assert manifest["artifacts"][name] == {"present": False}
    entry = manifest["artifacts"]["sites"]
    body = SITES.read_bytes()
    assert entry["uri"] == "v1/sites.json"
    assert entry["sha256"] == contract_lib.sha256_hex(body)
    assert entry["bytes"] == len(body)
    assert entry["count"] == 54


def test_manifest_datasets_come_from_citations(manifest, citations):
    ids = [d["id"] for d in manifest["datasets"]]
    assert ids == ["marrs", "coralsoundexplorer", "irma", "sanctsound"]
    for dataset in manifest["datasets"]:
        cite = citations[dataset["id"]]
        assert cite["kind"] == "dataset"
        assert dataset["doi"] == cite["doi"]
        assert dataset["licence"] == cite["licence"]
        assert dataset["licence_url"] == cite["licence_url"]
        assert dataset["url"] == cite["url"]
        assert dataset["doi_note"] == (cite["verification_note"] if cite["doi"] is None else None)


def test_schema_rejects_the_provenance_invariants(sites):
    healthy_without_definition = copy.deepcopy(next(s for s in sites if s["status"] == "healthy"))
    healthy_without_definition["label_definition"] = None
    with pytest.raises(contract_lib.ContractError):
        contract_lib.validate(healthy_without_definition, "site")

    no_basis = copy.deepcopy(next(s for s in sites if s["label_definition"] is None))
    no_basis["status_basis"] = None
    with pytest.raises(contract_lib.ContractError):
        contract_lib.validate(no_basis, "site")

    no_reason = copy.deepcopy(next(s for s in sites if s["doi"] is None))
    no_reason["doi_note"] = None
    with pytest.raises(contract_lib.ContractError):
        contract_lib.validate(no_reason, "site")

    synthetic = copy.deepcopy(sites[0])
    synthetic["synthetic"] = True
    with pytest.raises(contract_lib.ContractError):
        contract_lib.validate(synthetic, "site")


def test_hashes_do_not_depend_on_line_endings(tmp_path):
    lf = tmp_path / "lf.txt"
    crlf = tmp_path / "crlf.txt"
    lf.write_bytes(b'{"a": 1}\n{"b": 2}\n')
    crlf.write_bytes(b'{"a": 1}\r\n{"b": 2}\r\n')
    assert contract_lib.sha256_hex(contract_lib.read_text_input_bytes(lf)) == contract_lib.sha256_hex(
        contract_lib.read_text_input_bytes(crlf)
    )


def test_committed_json_is_lf_only_and_gitattributes_pins_it():
    for path in contract_lib.BUCKET_DIR.rglob("*.json"):
        assert b"\r" not in path.read_bytes(), path
    attrs = (REPO_ROOT / ".gitattributes").read_text(encoding="utf-8")
    assert "contracts/**/*.json text eol=lf" in attrs
    assert "contracts/**/*.f32 binary" in attrs


def test_rebuild_is_byte_identical():
    import build_contract

    assert build_contract.main(["--version", "1", "--check"]) == 0
