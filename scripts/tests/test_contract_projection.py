"""
Phase 2 (CONTRACT-02): the 48 reference embeddings and their honest 2-D PCA projection.

The committed contracts/bucket/v1/embeddings.f32 holds the published float32 rows;
these tests recompute the PCA from those bytes and compare it with the committed
projection.json, so the published plane can be reproduced by anyone. The metadata
source (reference/metadata_v6.json) is never needed: the builder's source checks
are exercised with tiny synthetic files in tmp_path.
"""

import copy
import json
import pathlib
import shutil

import numpy as np
import pytest

import build_contract
import check_contract
import contract_lib

BUCKET_V1 = contract_lib.BUCKET_DIR / "v1"
MANIFEST = contract_lib.BUCKET_DIR / "contract" / "v1.json"

# Hashes of the 02-01 artifacts: adding embeddings and a projection must not touch them.
STAMP_SHA256 = "4f67a0569b99b4e2fd2af2d462520b4aa1fe8a80f46e636b38c85b10121e79b6"
MODEL_SHA256 = "13a6ada8fb699558887b5fdfb4d9b7c78d2c528afdebfcf60303ddf63af12cd5"
SPEC_SHA256 = "4b02ca76c6fa5ff7c3032641ad59d52f15b579b6278f902e1b30b472ea0711e9"

EXPECTED_RATIO = [0.18310361, 0.14682953]


def _load(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def manifest():
    return _load(MANIFEST)


@pytest.fixture(scope="module")
def sites():
    return _load(BUCKET_V1 / "sites.json")["sites"]


@pytest.fixture(scope="module")
def projection():
    return _load(BUCKET_V1 / "projection.json")


@pytest.fixture(scope="module")
def rows(manifest):
    data = (BUCKET_V1 / "embeddings.f32").read_bytes()
    return contract_lib.unpack_float32_rows(data, manifest["artifacts"]["embeddings"]["dim"])


def test_embeddings_file_and_manifest_entry(manifest, sites):
    data = (BUCKET_V1 / "embeddings.f32").read_bytes()
    assert len(data) == 48 * 1280 * 4 == 245760
    entry = manifest["artifacts"]["embeddings"]
    acoustic = sorted(s["site_id"] for s in sites if s["reference_role"] == "acoustic_reference")
    assert len(acoustic) == 48
    assert entry["uri"] == "v1/embeddings.f32"
    assert entry["dtype"] == "float32-le"
    assert entry["dim"] == 1280
    assert entry["count"] == 48
    assert entry["row_site_ids"] == acoustic
    assert entry["sha256"] == contract_lib.sha256_hex(data)
    assert entry["bytes"] == len(data)
    assert entry["content_type"] == "application/octet-stream"


def test_manifest_records_projection_and_reference_source(manifest):
    entry = manifest["artifacts"]["projection"]
    body = (BUCKET_V1 / "projection.json").read_bytes()
    assert entry["uri"] == "v1/projection.json"
    assert entry["method"] == "pca"
    assert entry["sha256"] == contract_lib.sha256_hex(body)
    assert entry["bytes"] == len(body)
    assert entry["explained_variance_ratio"] == _load(BUCKET_V1 / "projection.json")["explained_variance_ratio"]
    source = manifest["sources"]["reference_metadata"]
    assert source["bucket"] == "reefradar-2477-embeddings"
    assert source["key"] == contract_lib.REFERENCE_METADATA_KEY
    assert source["sha256"] == contract_lib.REFERENCE_METADATA_SHA256


def test_projection_matches_a_recomputation_from_the_published_rows(projection, rows, manifest):
    mean, components, coords, variance, ratio = contract_lib.pca_2d(rows)
    np.testing.assert_allclose(np.array(projection["mean"]), mean, atol=1e-8, rtol=0)
    np.testing.assert_allclose(np.array(projection["components"]), components, atol=1e-8, rtol=0)
    committed = np.array([[c["x"], c["y"]] for c in projection["coordinates"]])
    np.testing.assert_allclose(committed, coords, atol=2e-6, rtol=0)
    np.testing.assert_allclose(projection["explained_variance_ratio"], EXPECTED_RATIO, atol=1e-6, rtol=0)
    np.testing.assert_allclose(projection["explained_variance_ratio"], ratio, atol=1e-6, rtol=0)
    np.testing.assert_allclose(projection["explained_variance"], variance, atol=1e-7, rtol=0)
    assert projection["site_ids"] == manifest["artifacts"]["embeddings"]["row_site_ids"]
    assert [c["site_id"] for c in projection["coordinates"]] == projection["site_ids"]


def test_projection_states_how_little_variance_the_plane_shows(projection):
    assert projection["method"] == "pca"
    assert projection["input_uri"] == "v1/embeddings.f32"
    assert round(sum(projection["explained_variance_ratio"]), 3) == 0.33
    assert "33.0%" in projection["note"]
    assert "plane distances are not embedding distances" in projection["note"]
    assert len(projection["coordinates"]) == 48
    assert len(projection["mean"]) == 1280
    assert [len(c) for c in projection["components"]] == [1280, 1280]
    assert projection["cumulative_explained_variance_ratio"] == pytest.approx(
        sum(projection["explained_variance_ratio"]), abs=1e-7
    )
    assert projection["sign_rule"]


def test_sign_rule_makes_the_largest_loading_positive(projection):
    for component in projection["components"]:
        values = np.array(component)
        assert values[int(np.argmax(np.abs(values)))] > 0


def test_pca_does_not_depend_on_row_dtype_or_input_copy():
    rng = np.random.default_rng(7)
    rows = rng.normal(size=(12, 40)).astype("<f4")
    first = contract_lib.pca_2d(rows)
    second = contract_lib.pca_2d(rows.copy())
    for a, b in zip(first, second):
        np.testing.assert_array_equal(a, b)
    again = contract_lib.pca_2d(rows[::-1].copy())
    np.testing.assert_allclose(again[1], first[1], atol=1e-9)


def test_float32_packing_roundtrips_little_endian():
    values = np.array([[1.5, -2.25], [0.1, 3.0]], dtype=np.float64)
    data = contract_lib.pack_float32_rows(values)
    assert len(data) == 4 * 4
    assert data[:4] == np.float32(1.5).tobytes() == b"\x00\x00\xc0\x3f"
    back = contract_lib.unpack_float32_rows(data, 2)
    np.testing.assert_array_equal(back, values.astype(np.float32).astype(np.float64))


def test_unpack_rejects_a_truncated_file():
    with pytest.raises(contract_lib.ContractError):
        contract_lib.unpack_float32_rows(b"\x00" * 10, 4)


def test_only_acoustic_references_carry_embedding_row_and_projection(sites, projection, manifest):
    row_ids = manifest["artifacts"]["embeddings"]["row_site_ids"]
    coords = {c["site_id"]: c for c in projection["coordinates"]}
    for site in sites:
        if site["reference_role"] == "acoustic_reference":
            assert site["embedding_row"] == row_ids.index(site["site_id"])
            assert site["projection"] == {"x": coords[site["site_id"]]["x"], "y": coords[site["site_id"]]["y"]}
        else:
            assert site["embedding_row"] is None
            assert site["projection"] is None
    assert sum(1 for s in sites if s["embedding_row"] is not None) == 48


def test_schema_rejects_mismatched_embedding_fields(sites):
    acoustic = next(s for s in sites if s["reference_role"] == "acoustic_reference")
    location = next(s for s in sites if s["reference_role"] == "location_only")
    contract_lib.validate(acoustic, "site")
    contract_lib.validate(location, "site")

    for key in ("embedding_row", "projection"):
        broken = copy.deepcopy(acoustic)
        broken[key] = None
        with pytest.raises(contract_lib.ContractError):
            contract_lib.validate(broken, "site")
    wrong_row = copy.deepcopy(location)
    wrong_row["embedding_row"] = 3
    with pytest.raises(contract_lib.ContractError):
        contract_lib.validate(wrong_row, "site")
    wrong_projection = copy.deepcopy(location)
    wrong_projection["projection"] = {"x": 0.0, "y": 0.0}
    with pytest.raises(contract_lib.ContractError):
        contract_lib.validate(wrong_projection, "site")
    missing = copy.deepcopy(acoustic)
    del missing["embedding_row"]
    with pytest.raises(contract_lib.ContractError):
        contract_lib.validate(missing, "site")


def test_projection_schema_accepts_the_artifact_and_rejects_a_stripped_one(projection):
    contract_lib.validate(projection, "projection")
    stripped = copy.deepcopy(projection)
    del stripped["explained_variance_ratio"]
    with pytest.raises(contract_lib.ContractError):
        contract_lib.validate(stripped, "projection")
    no_note = copy.deepcopy(projection)
    del no_note["note"]
    with pytest.raises(contract_lib.ContractError):
        contract_lib.validate(no_note, "projection")


def test_manifest_schema_requires_embeddings_and_projection(manifest):
    for key in ("embeddings", "projection"):
        broken = copy.deepcopy(manifest)
        del broken["artifacts"][key]
        with pytest.raises(contract_lib.ContractError):
            contract_lib.validate(broken, "contract-manifest")


def test_earlier_artifacts_are_byte_identical_to_plan_02_01():
    assert contract_lib.sha256_hex((BUCKET_V1 / "stamp.json").read_bytes()) == STAMP_SHA256
    assert contract_lib.sha256_hex((BUCKET_V1 / "model_version.json").read_bytes()) == MODEL_SHA256
    assert contract_lib.sha256_hex((BUCKET_V1 / "preprocessing_spec.json").read_bytes()) == SPEC_SHA256


# ---------------------------------------------------------------------------
# Builder source checks (synthetic files only)
# ---------------------------------------------------------------------------

def _metadata_file(tmp_path, ids, dim=1280, no_embedding=()):
    sites = []
    for index, site_id in enumerate(ids):
        entry = {"site_id": site_id, "status": "healthy", "doi": "10.0000/stale"}
        if site_id not in no_embedding:
            entry["embedding"] = [float(index) + 0.5] * dim
        sites.append(entry)
    path = tmp_path / "metadata.json"
    path.write_bytes(json.dumps({"version": "6.0", "sites": sites}).encode("utf-8"))
    return path


def test_builder_aborts_when_the_metadata_sha256_differs(tmp_path):
    path = _metadata_file(tmp_path, ["a_1", "b_2"])
    with pytest.raises(contract_lib.ContractError, match="sha256"):
        build_contract.load_reference_rows(path, ["a_1", "b_2"])


def test_builder_aborts_when_the_embedded_id_set_differs(tmp_path):
    path = _metadata_file(tmp_path, ["a_1", "b_2", "c_3"])
    digest = contract_lib.sha256_hex(path.read_bytes())
    with pytest.raises(contract_lib.ContractError, match="acoustic_reference"):
        build_contract.load_reference_rows(path, ["a_1", "b_2"], expected_sha256=digest)
    only_one = _metadata_file(tmp_path, ["a_1", "b_2"], no_embedding={"b_2"})
    digest = contract_lib.sha256_hex(only_one.read_bytes())
    with pytest.raises(contract_lib.ContractError, match="acoustic_reference"):
        build_contract.load_reference_rows(only_one, ["a_1", "b_2"], expected_sha256=digest)


def test_builder_aborts_on_a_wrong_embedding_length(tmp_path):
    path = _metadata_file(tmp_path, ["a_1", "b_2"], dim=12)
    digest = contract_lib.sha256_hex(path.read_bytes())
    with pytest.raises(contract_lib.ContractError, match="1280"):
        build_contract.load_reference_rows(path, ["a_1", "b_2"], expected_sha256=digest)


def test_builder_reads_only_the_embedding_key_and_sorts_rows(tmp_path):
    path = _metadata_file(tmp_path, ["b_2", "a_1"], dim=1280)
    digest = contract_lib.sha256_hex(path.read_bytes())
    rows = build_contract.load_reference_rows(path, ["a_1", "b_2"], expected_sha256=digest)
    assert rows.shape == (2, 1280)
    assert rows[0, 0] == pytest.approx(1.5)  # a_1 is index 1 in the file
    assert rows[1, 0] == pytest.approx(0.5)


# ---------------------------------------------------------------------------
# Checker numeric verification
# ---------------------------------------------------------------------------

@pytest.fixture
def contracts_copy(tmp_path, monkeypatch):
    target = tmp_path / "contracts"
    shutil.copytree(contract_lib.CONTRACTS_DIR, target)
    monkeypatch.setattr(contract_lib, "CONTRACTS_DIR", target)
    return target


def _rewrite_manifest_artifact(contracts_dir, name):
    """Recompute a manifest entry's sha256/bytes after a test edited the artifact on disk."""
    path = contracts_dir / "bucket" / "contract" / "v1.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    entry = manifest["artifacts"][name]
    data = (contracts_dir / "bucket" / entry["uri"]).read_bytes()
    entry["sha256"] = contract_lib.sha256_hex(data)
    entry["bytes"] = len(data)
    path.write_bytes(contract_lib.canonical_json_bytes(manifest))


def test_checker_rejects_a_truncated_embeddings_file(contracts_copy, capsys):
    path = contracts_copy / "bucket" / "v1" / "embeddings.f32"
    path.write_bytes(path.read_bytes()[:-4])
    _rewrite_manifest_artifact(contracts_copy, "embeddings")
    assert check_contract.main(["--check"]) == 1
    assert "embeddings.f32" in capsys.readouterr().out


def test_checker_rejects_edited_projection_coordinates(contracts_copy, capsys):
    path = contracts_copy / "bucket" / "v1" / "projection.json"
    projection = json.loads(path.read_text(encoding="utf-8"))
    projection["coordinates"][0]["x"] += 0.01
    path.write_bytes(contract_lib.canonical_json_bytes(projection))
    _rewrite_manifest_artifact(contracts_copy, "projection")
    assert check_contract.main(["--check"]) == 1
    assert "projection" in capsys.readouterr().out


def test_checker_rejects_a_flipped_embedding_value(contracts_copy, capsys):
    path = contracts_copy / "bucket" / "v1" / "embeddings.f32"
    data = bytearray(path.read_bytes())
    data[0:4] = np.float32(5.0).tobytes()
    path.write_bytes(bytes(data))
    _rewrite_manifest_artifact(contracts_copy, "embeddings")
    assert check_contract.main(["--check"]) == 1
    assert "projection" in capsys.readouterr().out


def test_committed_bundle_passes_the_checker_and_rebuilds_identically():
    assert check_contract.main(["--check"]) == 0
    assert build_contract.main(["--version", "1", "--check"]) == 0
