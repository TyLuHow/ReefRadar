"""
Tests for lambdas/shared/contract_stamp.py (CONTRACT-04 version stamps).

`pythonpath = scripts lambdas/shared` in pytest.ini puts lambdas/shared (and
scripts/, for contract_lib) on sys.path for every pytest run in this repo.
"""

import json
import pathlib

import pytest

import contract_lib
import contract_stamp as cs

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent
REPO_STAMP_PATH = REPO_ROOT / "contracts" / "bucket" / "v1" / "stamp.json"


@pytest.fixture(scope="module")
def repo_stamp():
    return json.loads(REPO_STAMP_PATH.read_text(encoding="utf-8"))


# --- load_stamp ---------------------------------------------------------------


def test_stamp_keys_are_the_four_contract_keys():
    assert cs.STAMP_KEYS == (
        "contract_version",
        "dataset_version",
        "model_version",
        "preprocessing_spec_version",
    )


def test_load_stamp_falls_back_to_the_repo_file(repo_stamp, monkeypatch, tmp_path):
    # No bundled contract_stamp.json next to the module -> the repo file is used.
    monkeypatch.setattr(cs, "_MODULE_DIR", str(tmp_path))
    # An empty tmp_path has no bundled file and no ../../contracts either, so
    # point the repo fallback back at the real checkout explicitly.
    monkeypatch.setattr(cs, "_REPO_STAMP_RELATIVE", str(REPO_STAMP_PATH))
    assert cs.load_stamp() == repo_stamp


def test_load_stamp_default_resolves_in_a_checkout(repo_stamp):
    assert cs.load_stamp() == repo_stamp


def test_load_stamp_prefers_the_bundled_file(monkeypatch, tmp_path):
    bundled = {
        "contract_version": 7,
        "dataset_version": "bundled-dataset",
        "model_version": "bundled-model",
        "preprocessing_spec_version": "bundled-preproc",
    }
    (tmp_path / "contract_stamp.json").write_text(json.dumps(bundled), encoding="utf-8")
    monkeypatch.setattr(cs, "_MODULE_DIR", str(tmp_path))
    assert cs.load_stamp() == bundled


def test_load_stamp_explicit_path(tmp_path):
    p = tmp_path / "x.json"
    p.write_text(json.dumps({"contract_version": 2}), encoding="utf-8")
    assert cs.load_stamp(str(p)) == {"contract_version": 2}


# --- stamp_for_model (tracer: copies values, sets model_version) ---------------


def test_stamp_for_model_copies_the_stamp_values(repo_stamp):
    out = cs.stamp_for_model(repo_stamp["model_version"], repo_stamp)
    assert out == repo_stamp
    assert set(out) == set(cs.STAMP_KEYS)


def test_stamp_for_model_returns_a_new_dict(repo_stamp):
    out = cs.stamp_for_model(repo_stamp["model_version"], repo_stamp)
    out["dataset_version"] = "mutated"
    assert repo_stamp["dataset_version"] != "mutated"
