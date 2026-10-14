"""
Phase 5 (ML-02, ML-03, ML-06, ML-08): the additive contract shapes this phase publishes.

Covers the per-window analysis-result keys, the training preprocessing spec on a model, the v2
preprocessing-spec details, the evaluation report and the OOD reference. Every test that changes
something works on a tmp_path copy of contracts/; the repository's own files are only read.
"""

import copy
import json
import pathlib
import shutil

import pytest

import check_contract
import contract_lib

CONTRACTS = contract_lib.CONTRACTS_DIR
EXAMPLES = CONTRACTS / "fixtures" / "examples"
BUCKET = contract_lib.BUCKET_DIR
SCHEMA_DIR = contract_lib.SCHEMA_DIR


def _load(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def _example(name):
    return _load(EXAMPLES / f"{name}.json")


def _errors(instance, stem):
    return contract_lib.validation_errors(instance, stem)


@pytest.fixture
def contracts_copy(tmp_path):
    target = tmp_path / "contracts"
    shutil.copytree(CONTRACTS, target)
    return target


def _edit_json(path, mutate):
    data = _load(path)
    mutate(data)
    path.write_bytes(contract_lib.canonical_json_bytes(data))


# ---------------------------------------------------------------------------
# Task 1: per-window analysis-result keys
# ---------------------------------------------------------------------------

def test_full_result_example_validates():
    full = _example("analysis-result-full")
    assert _errors(full, "analysis-result") == []
    assert full["windows"]["count"] == 2
    assert len(full["site_similarities"]["sites"]) == 54
    assert sum(1 for s in full["site_similarities"]["sites"] if s["has_embedding"]) == 48
    assert full["stamp_status"] == "stamped"
    for key in ("projection", "ood", "input_audio"):
        assert key in full


def test_stamp_only_results_still_validate():
    stamp = _load(BUCKET / "v1" / "stamp.json")
    assert _errors(stamp, "analysis-result") == []
    legacy = {
        "contract_version": None,
        "dataset_version": None,
        "model_version": "interim-real-only",
        "preprocessing_spec_version": None,
    }
    assert _errors(legacy, "analysis-result") == []
    # a legacy /visualize body can carry unknown keys alongside the stamp
    assert _errors({**stamp, "classification": {"status": "healthy"}}, "analysis-result") == []


def _set(path, value):
    def mutate(doc):
        node = doc
        for part in path[:-1]:
            node = node[part]
        node[path[-1]] = value

    return mutate


REJECTIONS = [
    ("probability_above_one", _set(["windows", "probabilities", "healthy", 0], 1.5), "windows/probabilities/healthy/0"),
    ("similarity_with_no_embedding", None, "site_similarities/sites/"),
    ("ood_status_not_inside_or_outside", _set(["ood", "windows", "status", 0], "maybe"), "ood/windows/status/0"),
    ("ood_k_not_one", _set(["ood", "k"], 5), "ood/k"),
    ("stamp_status_maybe", _set(["stamp_status"], "maybe"), "stamp_status"),
    ("projection_method_not_pca", _set(["projection", "method"], "tsne"), "projection/method"),
]


def _similarity_without_embedding(doc):
    entry = next(s for s in doc["site_similarities"]["sites"] if s["has_embedding"] is False)
    entry["similarity"] = 0.5


@pytest.mark.parametrize("name,mutate,where", REJECTIONS, ids=[r[0] for r in REJECTIONS])
def test_full_result_rejections(name, mutate, where):
    full = _example("analysis-result-full")
    assert _errors(full, "analysis-result") == []
    broken = copy.deepcopy(full)
    (mutate or _similarity_without_embedding)(broken)
    errors = _errors(broken, "analysis-result")
    assert errors, f"{name} was accepted"
    assert any(line.startswith(where) for line in errors), (name, errors)


def test_analysis_result_root_requires_only_the_four_stamp_keys():
    schema = _load(SCHEMA_DIR / "analysis-result.schema.json")
    assert sorted(schema["required"]) == [
        "contract_version", "dataset_version", "model_version", "preprocessing_spec_version",
    ]
    assert {"windows", "site_similarities", "projection", "ood", "input_audio", "stamp_status"} <= set(
        schema["properties"]
    )


def test_schemas_are_additive(contracts_copy, capsys):
    """The grown schemas still pass the structural and behavioural additive-only check."""
    assert check_contract.main(["--additive", "--contracts-dir", str(contracts_copy)]) == 0
    capsys.readouterr()
    # and dropping a v1 property from a current schema is still caught
    path = contracts_copy / "schema" / "analysis-result.schema.json"
    _edit_json(path, lambda s: s["properties"].pop("model_version"))
    assert check_contract.main(["--additive", "--contracts-dir", str(contracts_copy)]) == 1
    assert "dropped property 'model_version'" in capsys.readouterr().out


def test_examples_are_checked_and_in_the_corpus(contracts_copy, capsys):
    corpus = _load(CONTRACTS / "fixtures" / "parity-corpus.json")
    cases = {(e["schema"], e["case"]) for e in corpus}
    assert ("analysis-result", "valid:example/analysis-result-full") in cases
    assert any(c.startswith("mutant:example/analysis-result-full/") for _, c in cases)
    # a broken example is a problem line
    _edit_json(
        contracts_copy / "fixtures" / "examples" / "analysis-result-full.json",
        lambda d: d.update(stamp_status="maybe"),
    )
    assert check_contract.main(["--check", "--contracts-dir", str(contracts_copy)]) == 1
    out = capsys.readouterr().out
    assert "fixtures/examples/analysis-result-full.json" in out and "stamp_status" in out


# ---------------------------------------------------------------------------
# Task 2: model training spec, v2 preprocessing-spec details, train/serve parity
# ---------------------------------------------------------------------------

def _model_v1():
    return _load(BUCKET / "v1" / "model_version.json")


def _spec_v1():
    return _load(BUCKET / "v1" / "preprocessing_spec.json")


def test_model_training_spec_is_optional_and_additive():
    model = _model_v1()
    assert _errors(model, "model-version") == []  # the published v1 artifact still validates
    assert "preprocessing_spec_version" not in model["training"]

    grown = copy.deepcopy(model)
    grown["training"]["preprocessing_spec_version"] = "preproc-2026.10.0-as-deployed"
    grown["training"]["embedding_source"] = "deployed serving path, original embeddings"
    grown["served_from"] = "s3://reefradar-2477-embeddings/models/interim-real-only/"
    assert _errors(grown, "model-version") == []

    for mutate in (
        lambda m: m["training"].update(preprocessing_spec_version="Not A Version"),
        lambda m: m["training"].update(embedding_source=""),
        lambda m: m.update(served_from=""),
    ):
        broken = copy.deepcopy(grown)
        mutate(broken)
        assert _errors(broken, "model-version"), broken


def test_preprocessing_spec_v2_fields_validate():
    spec = _spec_v1()
    assert _errors(spec, "preprocessing-spec") == []  # the published v1 artifact still validates

    grown = copy.deepcopy(spec)
    grown["resampling"].update(
        kaiser_beta=5.0,
        half_length_factor=10,
        cutoff="1/max(up, down) of Nyquist",
        reference_implementation="scipy.signal.resample_poly 1.13.1 defaults",
    )
    grown["known_gaps"][0]["evidence"] = ["05-RESEARCH Q1", "05-RESEARCH Q5"]
    grown["known_gaps"][0]["closed_by"] = "05-05"
    grown["model_pin"] = {
        "kaggle_handle": "google/surfperch/tensorFlow2/1/1",
        "files": [{"path": "saved_model.pb", "bytes": 1234, "sha256": "a" * 64}],
    }
    grown["supported_input"] = {"format_tags": [1, 3], "pcm_bits": [16, 24, 32]}
    grown["levels"] = "peak and RMS dBFS of each 5 s window, floored at -120.0"
    assert _errors(grown, "preprocessing-spec") == []

    for mutate in (
        lambda s: s["resampling"].update(kaiser_beta="five"),
        lambda s: s["resampling"].update(half_length_factor=2.5),
        lambda s: s["known_gaps"][0].update(evidence=[""]),
        lambda s: s["known_gaps"][0].update(closed_by=""),
        lambda s: s["model_pin"]["files"][0].update(sha256="not-a-hash"),
        lambda s: s["model_pin"].pop("kaggle_handle"),
        lambda s: s.update(supported_input="all"),
        lambda s: s.update(levels=""),
    ):
        broken = copy.deepcopy(grown)
        mutate(broken)
        assert _errors(broken, "preprocessing-spec"), broken


def _check_with_model_edit(contracts_copy, mutate, capsys):
    _edit_json(contracts_copy / "bucket" / "v1" / "model_version.json", mutate)
    code = check_contract.main(["--check", "--contracts-dir", str(contracts_copy)])
    return code, capsys.readouterr().out


def test_parity_rule_rejects_training_spec_mismatch(contracts_copy, capsys):
    code, out = _check_with_model_edit(
        contracts_copy,
        lambda m: m["training"].update(preprocessing_spec_version="preproc-2020.01.0-other"),
        capsys,
    )
    assert code == 1
    assert "trained under preproc-2020.01.0-other but the contract serves preproc-2026.10.0-as-deployed" in out


def test_parity_rule_accepts_a_matching_training_spec(contracts_copy, capsys):
    manifest = _load(contracts_copy / "bucket" / "contract" / "v1.json")
    code, out = _check_with_model_edit(
        contracts_copy,
        lambda m: m["training"].update(preprocessing_spec_version=manifest["preprocessing_spec_version"]),
        capsys,
    )
    assert "trained under" not in out
    assert "preprocessing_spec_version differs from manifest" not in out


def test_v1_equality_rule_unchanged(contracts_copy, capsys):
    code, out = _check_with_model_edit(
        contracts_copy,
        lambda m: m.update(preprocessing_spec_version="preproc-2020.01.0-other"),
        capsys,
    )
    assert code == 1
    assert "model_version artifact: preprocessing_spec_version differs from manifest" in out
    assert "trained under" not in out
