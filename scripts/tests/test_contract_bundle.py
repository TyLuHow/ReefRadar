"""
Phase 2 (CONTRACT-01): the integrity checker for every committed contract bundle.

check_contract.main(["--check"]) must pass on the repository as committed and must
fail (exit 1, one line per problem) on a temporary copy that has been tampered
with in each of the four ways the threat model names.
"""

import json
import pathlib
import shutil

import pytest

import check_contract
import contract_lib


@pytest.fixture
def contracts_copy(tmp_path, monkeypatch):
    target = tmp_path / "contracts"
    shutil.copytree(contract_lib.CONTRACTS_DIR, target)
    monkeypatch.setattr(contract_lib, "CONTRACTS_DIR", target)
    return target


def _rewrite_manifest(contracts_dir, mutate):
    path = contracts_dir / "bucket" / "contract" / "v1.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    mutate(manifest)
    path.write_bytes(contract_lib.canonical_json_bytes(manifest))


def test_committed_bundle_passes():
    assert check_contract.main(["--check"]) == 0


def test_the_copy_fixture_is_clean_before_tampering(contracts_copy):
    assert check_contract.main(["--check"]) == 0


def test_one_changed_byte_in_sites_json_fails(contracts_copy, capsys):
    path = contracts_copy / "bucket" / "v1" / "sites.json"
    data = path.read_bytes()
    assert b"Australia" in data
    path.write_bytes(data.replace(b"Australia", b"Australib", 1))
    assert check_contract.main(["--check"]) == 1
    out = capsys.readouterr().out
    assert "v1/sites.json" in out and "sha256" in out


def test_crlf_line_endings_fail(contracts_copy, capsys):
    path = contracts_copy / "bucket" / "v1" / "stamp.json"
    path.write_bytes(path.read_bytes().replace(b"\n", b"\r\n"))
    assert check_contract.main(["--check"]) == 1
    assert "CRLF" in capsys.readouterr().out


def test_a_manifest_marked_fixture_fails(contracts_copy, capsys):
    _rewrite_manifest(contracts_copy, lambda m: m.update(fixture=True))
    assert check_contract.main(["--check"]) == 1
    assert "fixture" in capsys.readouterr().out


def test_an_artifact_uri_with_dot_dot_fails(contracts_copy, capsys):
    def mutate(manifest):
        manifest["artifacts"]["sites"]["uri"] = "v1/../v1/sites.json"

    _rewrite_manifest(contracts_copy, mutate)
    assert check_contract.main(["--check"]) == 1
    assert "uri" in capsys.readouterr().out


def test_coverage_counts_must_match_the_sites(contracts_copy, capsys):
    def mutate(manifest):
        manifest["coverage"]["sites_with_embeddings"] = 44

    _rewrite_manifest(contracts_copy, mutate)
    assert check_contract.main(["--check"]) == 1
    assert "sites_with_embeddings" in capsys.readouterr().out


def test_a_stamp_that_disagrees_with_the_manifest_fails(contracts_copy, capsys):
    path = contracts_copy / "bucket" / "v1" / "stamp.json"
    stamp = json.loads(path.read_text(encoding="utf-8"))
    stamp["model_version"] = "some-other-model"
    path.write_bytes(contract_lib.canonical_json_bytes(stamp))
    assert check_contract.main(["--check"]) == 1
    assert "stamp" in capsys.readouterr().out


def test_a_missing_artifact_file_fails(contracts_copy, capsys):
    (contracts_copy / "bucket" / "v1" / "model_version.json").unlink()
    assert check_contract.main(["--check"]) == 1
    assert "model_version.json" in capsys.readouterr().out
