"""
Phase 2 (CONTRACT-03/05): the offline fixture set, the schema parity corpus, and the
additive-only / immutability guards that stop the bundle drifting.

Every test that changes something works on a tmp_path copy of contracts/; the repository's
own files are only read.
"""

import copy
import json
import pathlib
import shutil

import pytest

import build_contract
import check_contract
import contract_lib

CONTRACTS = contract_lib.CONTRACTS_DIR
FIXTURES = contract_lib.FIXTURES_DIR
BUCKET = contract_lib.BUCKET_DIR
REPO_ROOT = contract_lib.REPO_ROOT


def _load(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def _diff_paths(a, b, prefix=""):
    """Dotted paths at which two JSON values differ (missing keys count as differences)."""
    if isinstance(a, dict) and isinstance(b, dict):
        paths = []
        for key in sorted(set(a) | set(b)):
            where = f"{prefix}.{key}" if prefix else key
            if key not in a or key not in b:
                paths.append(where)
            else:
                paths += _diff_paths(a[key], b[key], where)
        return paths
    return [] if a == b else [prefix]


@pytest.fixture
def contracts_copy(tmp_path):
    target = tmp_path / "contracts"
    shutil.copytree(CONTRACTS, target)
    return target


def _run(copy_dir, *flags):
    return check_contract.main([*flags, "--contracts-dir", str(copy_dir)])


def _edit_json(path, mutate):
    data = _load(path)
    mutate(data)
    path.write_bytes(contract_lib.canonical_json_bytes(data))


# ---------------------------------------------------------------------------
# Fixture manifests and pointers
# ---------------------------------------------------------------------------

def test_fixture_v2_differs_from_v1_in_exactly_three_paths():
    v1 = _load(BUCKET / "contract" / "v1.json")
    v2 = _load(FIXTURES / "bucket" / "contract" / "v2.json")
    assert _diff_paths(v1, v2) == ["contract_version", "coverage.has_diel", "fixture"]
    assert (v1["contract_version"], v2["contract_version"]) == (1, 2)
    assert "fixture" not in v1 and v2["fixture"] is True
    assert (v1["coverage"]["has_diel"], v2["coverage"]["has_diel"]) == (False, True)


def test_fixture_v2_reuses_v1_artifact_uris_that_exist_in_the_bucket():
    v2 = _load(FIXTURES / "bucket" / "contract" / "v2.json")
    entries = []
    for entry in v2["artifacts"].values():
        entries += list(entry.values()) if "uri" not in entry and "present" not in entry else [entry]
    uris = [e["uri"] for e in entries if isinstance(e, dict) and "uri" in e]
    assert len(uris) >= 12
    for uri in uris:
        assert uri.startswith("v1/")
        assert (BUCKET / uri).is_file(), uri
    assert not (FIXTURES / "bucket" / "v1").exists()


def test_fixtures_live_only_under_contracts_fixtures():
    assert sorted(p.name for p in (BUCKET / "contract").iterdir()) == ["v1.json"]
    for path in (BUCKET / "contract").glob("v*.json"):
        assert _load(path).get("fixture") is not True


@pytest.mark.parametrize("name,version", [("latest-v1.json", 1), ("latest-v2.json", 2)])
def test_pointers_validate_and_hash_their_manifest(name, version):
    pointer = _load(FIXTURES / name)
    contract_lib.validate(pointer, "contract-pointer")
    assert pointer["contract_version"] == version
    assert pointer["manifest_uri"] == f"contract/v{version}.json"
    manifest_dir = BUCKET if version == 1 else FIXTURES / "bucket"
    data = (manifest_dir / pointer["manifest_uri"]).read_bytes()
    assert pointer["manifest_sha256"] == contract_lib.sha256_hex(data)


def test_fixture_manifest_validates_against_the_manifest_schema():
    contract_lib.validate(_load(FIXTURES / "bucket" / "contract" / "v2.json"), "contract-manifest")


def test_fixture_files_equal_a_fresh_build():
    assert build_contract.main(["--version", "1", "--check"]) == 0


# ---------------------------------------------------------------------------
# Curated invalid cases
# ---------------------------------------------------------------------------

def test_every_curated_invalid_case_is_rejected():
    cases = sorted((FIXTURES / "invalid").glob("*.json"))
    assert len(cases) >= 8
    for path in cases:
        case = _load(path)
        assert set(case) == {"schema", "instance", "reason"}, path.name
        assert case["reason"], path.name
        assert contract_lib.validation_errors(case["instance"], case["schema"]), path.name


def test_the_curated_cases_cover_each_named_invariant():
    names = {p.stem for p in (FIXTURES / "invalid").glob("*.json")}
    assert names == {
        "manifest-artifact-uri-with-https-scheme",
        "manifest-missing-coverage-has-effort",
        "pointer-manifest-uri-with-dot-dot",
        "site-acoustic-reference-null-projection",
        "site-location-only-with-embedding-row",
        "site-null-doi-without-note",
        "site-null-label-definition-with-degraded-status",
        "stamp-null-contract-version-with-dataset-version",
    }


def test_each_curated_case_breaks_exactly_one_thing():
    """Fixing the single named invariant must make the instance valid again."""
    cases = {p.stem: _load(p) for p in (FIXTURES / "invalid").glob("*.json")}
    fixed = copy.deepcopy(cases["site-acoustic-reference-null-projection"]["instance"])
    fixed["projection"] = {"x": 0.0, "y": 0.0}
    assert contract_lib.validation_errors(fixed, "site") == []
    fixed = copy.deepcopy(cases["site-location-only-with-embedding-row"]["instance"])
    fixed["embedding_row"] = None
    assert contract_lib.validation_errors(fixed, "site") == []
    fixed = copy.deepcopy(cases["manifest-missing-coverage-has-effort"]["instance"])
    fixed["coverage"]["has_effort"] = False
    assert contract_lib.validation_errors(fixed, "contract-manifest") == []
    fixed = copy.deepcopy(cases["pointer-manifest-uri-with-dot-dot"]["instance"])
    fixed["manifest_uri"] = "contract/v1.json"
    assert contract_lib.validation_errors(fixed, "contract-pointer") == []


# ---------------------------------------------------------------------------
# Parity corpus
# ---------------------------------------------------------------------------

def test_the_parity_corpus_is_deterministic_and_fresh():
    first = check_contract.build_corpus(CONTRACTS)
    assert check_contract.build_corpus(CONTRACTS) == first
    assert (FIXTURES / "parity-corpus.json").read_bytes() == first
    assert b"\r" not in first


def test_every_corpus_verdict_matches_the_python_validator():
    corpus = _load(FIXTURES / "parity-corpus.json")
    assert len(corpus) > 300
    verdicts = {"valid": 0, "invalid": 0}
    for entry in corpus:
        assert set(entry) == {"schema", "case", "verdict", "instance"}
        errors = contract_lib.validation_errors(entry["instance"], entry["schema"])
        assert ("invalid" if errors else "valid") == entry["verdict"], entry["case"]
        verdicts[entry["verdict"]] += 1
    assert verdicts["valid"] >= 14 and verdicts["invalid"] >= 250
    assert [(e["schema"], e["case"]) for e in corpus] == sorted((e["schema"], e["case"]) for e in corpus)


def test_the_corpus_covers_every_schema_and_every_mutation_kind():
    corpus = _load(FIXTURES / "parity-corpus.json")
    schemas = {e["schema"] for e in corpus}
    assert schemas == {
        "analysis-result", "contract-manifest", "contract-pointer", "model-version",
        "preprocessing-spec", "projection", "site",
    }
    cases = [e["case"] for e in corpus]
    for kind in ("valid:", "mutant:", "curated:"):
        assert any(c.startswith(kind) for c in cases)
    mutant_kinds = {c.rsplit("/", 1)[1].split(":", 1)[0] for c in cases if c.startswith("mutant:")}
    assert mutant_kinds >= {"drop", "type", "enum", "pattern"}
    site_roles = {c for c in cases if c.startswith("valid:site/")}
    assert len(site_roles) == 6  # one per dataset x reference_role present in the data
    projection = next(e for e in corpus if e["case"] == "valid:artifact/projection-truncated")
    assert len(projection["instance"]["mean"]) == 3


def test_a_stale_corpus_fails_the_check(contracts_copy, capsys):
    assert _run(contracts_copy, "--check") == 0
    path = contracts_copy / "fixtures" / "parity-corpus.json"
    path.write_bytes(path.read_bytes().replace(b'"verdict":"valid"', b'"verdict":"invalid"', 1))
    assert _run(contracts_copy, "--check") == 1
    assert "stale" in capsys.readouterr().out


def test_write_corpus_regenerates_a_deleted_corpus(contracts_copy):
    path = contracts_copy / "fixtures" / "parity-corpus.json"
    original = path.read_bytes()
    path.unlink()
    assert _run(contracts_copy, "--check") == 1
    assert _run(contracts_copy, "--write-corpus") == 0
    assert path.read_bytes() == original


# ---------------------------------------------------------------------------
# --additive
# ---------------------------------------------------------------------------

def test_additive_passes_on_the_repository(capsys):
    assert check_contract.main(["--check", "--additive"]) == 0
    assert "passed" in capsys.readouterr().out


def test_additive_fails_when_a_property_is_dropped(contracts_copy, capsys):
    def mutate(schema):
        del schema["properties"]["licence"]
        schema["required"].remove("licence")

    _edit_json(contracts_copy / "schema" / "site.schema.json", mutate)
    assert _run(contracts_copy, "--additive") == 1
    out = capsys.readouterr().out
    assert "dropped property 'licence'" in out


def test_additive_fails_when_an_enum_value_is_removed(contracts_copy, capsys):
    def mutate(schema):
        schema["properties"]["status"]["enum"].remove("restored_mid")

    _edit_json(contracts_copy / "schema" / "site.schema.json", mutate)
    assert _run(contracts_copy, "--additive") == 1
    assert "restored_mid" in capsys.readouterr().out


def test_additive_fails_when_a_new_required_key_is_added(contracts_copy, capsys):
    def mutate(schema):
        schema["properties"]["brand_new"] = {"type": "string"}
        schema["required"].append("brand_new")

    _edit_json(contracts_copy / "schema" / "site.schema.json", mutate)
    assert _run(contracts_copy, "--additive") == 1
    assert "brand_new" in capsys.readouterr().out


def test_additive_allows_a_new_optional_property(contracts_copy):
    def mutate(schema):
        schema["properties"]["brand_new_optional"] = {"type": "string"}

    _edit_json(contracts_copy / "schema" / "site.schema.json", mutate)
    assert _run(contracts_copy, "--additive") == 0


def test_additive_fails_when_a_committed_bundle_stops_validating(contracts_copy, capsys):
    def mutate(schema):
        schema["properties"]["latitude"]["maximum"] = 10

    _edit_json(contracts_copy / "schema" / "site.schema.json", mutate)
    assert _run(contracts_copy, "--additive") == 1
    assert "latitude" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# PUBLISHED.json immutability and fixture placement
# ---------------------------------------------------------------------------

def test_without_a_published_record_the_check_passes(contracts_copy):
    # v1 is now published, so the committed tree carries PUBLISHED.json; this test is about its absence.
    (contracts_copy / "PUBLISHED.json").unlink(missing_ok=True)
    assert not (contracts_copy / "PUBLISHED.json").exists()
    assert _run(contracts_copy, "--check") == 0


def test_a_matching_published_record_passes(contracts_copy):
    digest = contract_lib.sha256_hex((contracts_copy / "bucket" / "contract" / "v1.json").read_bytes())
    (contracts_copy / "PUBLISHED.json").write_bytes(
        contract_lib.canonical_json_bytes({"1": {"manifest_sha256": digest}})
    )
    assert _run(contracts_copy, "--check") == 0


def test_a_different_published_sha256_fails(contracts_copy, capsys):
    (contracts_copy / "PUBLISHED.json").write_bytes(
        contract_lib.canonical_json_bytes({"1": {"manifest_sha256": "0" * 64}})
    )
    assert _run(contracts_copy, "--check") == 1
    assert "published version 1 modified" in capsys.readouterr().out


def test_a_fixture_manifest_placed_in_the_bucket_fails(contracts_copy, capsys):
    shutil.copy(
        contracts_copy / "fixtures" / "bucket" / "contract" / "v2.json",
        contracts_copy / "bucket" / "contract" / "v2.json",
    )
    assert _run(contracts_copy, "--check") == 1
    assert "fixture" in capsys.readouterr().out


def test_a_fixture_manifest_that_forgets_its_marker_fails(contracts_copy, capsys):
    _edit_json(contracts_copy / "fixtures" / "bucket" / "contract" / "v2.json", lambda m: m.pop("fixture"))
    assert _run(contracts_copy, "--check") == 1
    assert "must be marked fixture true" in capsys.readouterr().out


def test_extra_files_under_fixtures_bucket_fail(contracts_copy, capsys):
    extra = contracts_copy / "fixtures" / "bucket" / "v1"
    extra.mkdir()
    (extra / "sites.json").write_bytes(b"{}\n")
    assert _run(contracts_copy, "--check") == 1
    assert "fixtures/bucket may only hold" in capsys.readouterr().out


def test_a_pointer_with_the_wrong_manifest_hash_fails(contracts_copy, capsys):
    def mutate(pointer):
        pointer["manifest_sha256"] = "f" * 64

    _edit_json(contracts_copy / "fixtures" / "latest-v2.json", mutate)
    assert _run(contracts_copy, "--check") == 1
    assert "manifest_sha256" in capsys.readouterr().out


def test_a_valid_curated_case_fails_the_check(contracts_copy, capsys):
    path = contracts_copy / "fixtures" / "invalid" / "site-null-doi-without-note.json"

    def mutate(case):
        case["instance"]["doi_note"] = "A stated reason."

    _edit_json(path, mutate)
    assert _run(contracts_copy, "--check") == 1
    assert "must be rejected" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# CI wiring and docs
# ---------------------------------------------------------------------------

def test_ci_python_job_runs_the_builder_and_the_checker():
    ci = (REPO_ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    assert ci.count("check_contract.py --check --additive") == 1
    assert ci.count("build_contract.py --version 1 --check") == 1
    assert ci.index("run: pytest") < ci.index("build_contract.py --version 1 --check")


def test_check_citations_treats_f32_as_binary():
    source = (REPO_ROOT / "scripts" / "check-citations.mjs").read_text(encoding="utf-8")
    assert source.count("'.f32'") == 1


def test_contract_docs_exist_and_state_the_projection_caveat():
    readme = (CONTRACTS / "README.md").read_text(encoding="utf-8")
    changelog = (CONTRACTS / "CHANGELOG.md").read_text(encoding="utf-8")
    for needle in ("check_contract.py --check --additive", "build_contract.py", "publish_contract.py",
                   "--set-latest", "33", "fixtures", "additive"):
        assert needle in readme, needle
    assert "v1" in changelog and "unpublished" in changelog.lower()


# ---------------------------------------------------------------------------
# A published version is frozen while the schemas may still grow
# ---------------------------------------------------------------------------

def _publish_v1(contracts_dir):
    digest = contract_lib.sha256_hex((contracts_dir / "bucket" / "contract" / "v1.json").read_bytes())
    (contracts_dir / "PUBLISHED.json").write_bytes(
        contract_lib.canonical_json_bytes({"1": {"manifest_sha256": digest}})
    )


def test_a_published_version_tolerates_an_additive_schema_change(contracts_copy, monkeypatch):
    _publish_v1(contracts_copy)

    def mutate(schema):
        schema["properties"]["brand_new_optional"] = {"type": "string"}

    _edit_json(contracts_copy / "schema" / "site.schema.json", mutate)
    assert _run(contracts_copy, "--check", "--additive") == 0
    monkeypatch.setattr(contract_lib, "CONTRACTS_DIR", contracts_copy)
    assert build_contract.main(["--version", "1", "--check"]) == 0


def test_an_unpublished_version_still_requires_schema_copies_to_match(contracts_copy, capsys):
    # Unpublished means no PUBLISHED.json entry; v1 is now recorded in the committed tree.
    (contracts_copy / "PUBLISHED.json").unlink(missing_ok=True)
    def mutate(schema):
        schema["properties"]["brand_new_optional"] = {"type": "string"}

    _edit_json(contracts_copy / "schema" / "site.schema.json", mutate)
    assert _run(contracts_copy, "--check") == 1
    assert "schema copy differs" in capsys.readouterr().out
