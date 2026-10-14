"""
Phase 5 (05-14): contract v2 built on disk from reef_audio, the successor model, the
grouped evaluation report and the OOD reference, reusing the v1 dataset artifacts by uri.

Nothing here touches AWS. The bundle is what plan 05-16 publishes; until then it can be
rebuilt freely, and `build_contract.py --version 2 --check` proves it still equals a rebuild.
"""

import copy
import json
import pathlib
import shutil

import pytest

import build_contract
import check_contract
import contract_lib
import reef_audio

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
CONTRACTS = REPO_ROOT / "contracts"
BUCKET = CONTRACTS / "bucket"
V1 = BUCKET / "v1"
V2 = BUCKET / "v2"
EVALUATION = REPO_ROOT / "models" / "interim-real-only" / "evaluation"
SUCCESSOR = REPO_ROOT / "models" / "interim-real-only-2026.10.1"

SPEC_VERSION = "preproc-2026.10.1-reef-audio"
SUCCESSOR_VERSION = "interim-real-only-2026.10.1"
CLOSURE_WORDING = "serving and offline share one pipeline"


def _load(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def _lf(path):
    return contract_lib.read_text_input_bytes(pathlib.Path(path))


@pytest.fixture(scope="module")
def manifest():
    return _load(BUCKET / "contract" / "v2.json")


@pytest.fixture(scope="module")
def spec():
    return _load(V2 / "preprocessing_spec.json")


@pytest.fixture(scope="module")
def model():
    return _load(V2 / "model_version.json")


@pytest.fixture
def contracts_copy(tmp_path, monkeypatch):
    target = tmp_path / "contracts"
    shutil.copytree(contract_lib.CONTRACTS_DIR, target)
    monkeypatch.setattr(contract_lib, "CONTRACTS_DIR", target)
    return target


# ---------------------------------------------------------------------------
# Task 1: the recipe and the bundle it wrote
# ---------------------------------------------------------------------------

def test_v2_reuses_v1_dataset_artifacts(manifest):
    v1 = _load(BUCKET / "contract" / "v1.json")
    assert manifest["contract_version"] == 2
    for key in ("sites", "embeddings", "projection"):
        assert manifest["artifacts"][key] == v1["artifacts"][key], key
    assert manifest["artifacts"]["sites"]["uri"] == "v1/sites.json"
    assert manifest["artifacts"]["embeddings"]["uri"] == "v1/embeddings.f32"
    assert manifest["artifacts"]["projection"]["uri"] == "v1/projection.json"
    assert manifest["dataset_version"] == v1["dataset_version"] == "reefradar-reference-2026.10.0"
    assert manifest["coverage"] == v1["coverage"]
    assert manifest["datasets"] == v1["datasets"]
    assert manifest["model_version"] == SUCCESSOR_VERSION
    assert manifest["preprocessing_spec_version"] == SPEC_VERSION
    for key in ("evaluation_report", "ood_reference", "ood_embeddings"):
        entry = manifest["artifacts"][key]
        assert entry["uri"].startswith("v2/"), key
        assert contract_lib.sha256_hex((BUCKET / entry["uri"]).read_bytes()) == entry["sha256"]
    # v1 bytes are never written by the v2 recipe
    assert not (V2 / "sites.json").exists()
    assert not (V2 / "embeddings.f32").exists()
    assert not (V2 / "projection.json").exists()


def test_v2_spec_from_reef_audio_closes_f8abc_keeps_f8d(spec):
    summary = reef_audio.spec_summary()
    assert spec["spec_version"] == SPEC_VERSION == reef_audio.SPEC_VERSION
    assert spec["sample_rate_hz"] == 32000
    assert spec["window_s"] == 5.0
    assert spec["window_samples"] == 160000
    assert spec["hop_s"] == summary["hop_s"]
    for key in ("min_duration_s", "max_duration_s", "channel_mix", "amplitude_scaling", "supported_input", "levels"):
        assert spec[key] == summary[key], key
    resampling = spec["resampling"]
    assert resampling["method"] == "polyphase_kaiser_windowed_sinc"
    assert resampling["anti_alias_filter"] is True
    assert resampling["kaiser_beta"] == 5.0
    assert resampling["half_length_factor"] == 10
    assert "mean of the window probabilities" in spec["serving"]["window_pooling"]

    pin = spec["model_pin"]
    assert pin["kaggle_handle"] == "google/surfperch/tensorFlow2/1/1"
    files = {f["path"]: f for f in pin["files"]}
    assert files["saved_model.pb"]["bytes"] == 3859615
    assert files["variables/variables.data-00000-of-00001"]["bytes"] == 97026563
    assert files["variables/variables.index"]["bytes"] == 8491
    for path, digest in reef_audio.SAVED_MODEL_SHA256.items():
        assert files[path]["sha256"] == digest

    gaps = {g["id"]: g for g in spec["known_gaps"]}
    for gap_id in ("F8a", "F8b", "F8c"):
        assert gaps[gap_id]["status"] == "closed", gap_id
        assert gaps[gap_id]["evidence"], gap_id
        assert gaps[gap_id]["closed_by"], gap_id
    assert CLOSURE_WORDING in gaps["F8a"]["summary"] + " ".join(gaps["F8a"]["evidence"])
    assert CLOSURE_WORDING in gaps["F8c"]["summary"] + " ".join(gaps["F8c"]["evidence"])
    blob = json.dumps(spec)
    assert "train/serve skew closed" not in blob
    # F8c states what was measured, not perfect anti-aliasing
    f8c = " ".join([gaps["F8c"]["summary"], *gaps["F8c"]["evidence"]])
    assert "54 dB" in f8c and "17" in f8c and "18.6" in f8c
    assert "parity" in " ".join(gaps["F8a"]["evidence"]).lower()
    assert "resampl" in f8c.lower()
    assert "per-window" in " ".join(gaps["F8b"]["evidence"]).lower()
    assert gaps["F8d"]["status"] == "open"
    assert gaps["F8d"]["owner_phase"] == "Phase 11"
    open_ids = {g["id"] for g in spec["known_gaps"] if g["status"] == "open"}
    assert "F8d" in open_ids
    assert len(open_ids) >= 3  # F8d, the served model's evidence, the unrebuilt inference container
    owners = {g["owner_phase"] for g in spec["known_gaps"] if g["status"] == "open"}
    assert {"Phase 11", "Phase 12"} <= owners
    assert "unpinned" in blob and "tensorflow-cpu" in blob


def test_v2_model_version_evaluation_and_training_spec(model):
    report = _load(EVALUATION / "report.json")
    config = _load(SUCCESSOR / "model_config.json")
    assert model["model_version"] == SUCCESSOR_VERSION
    assert model["training"]["preprocessing_spec_version"] == SPEC_VERSION
    assert model["preprocessing_spec_version"] == SPEC_VERSION
    assert model["training"]["embedding_source"]
    assert model["training"]["synthetic_data"] is False
    served = next(m for m in report["models"] if m["served"])
    evaluation = model["evaluation"]
    assert evaluation["method"] == "leave_one_site_out"
    assert evaluation["report_uri"] == "v2/evaluation_report.json"
    assert evaluation["report_sha256"] == contract_lib.sha256_hex((V2 / "evaluation_report.json").read_bytes())
    assert evaluation["report_version"] == report["report_version"]
    assert evaluation["served_model_balanced_accuracy"] == served["metrics"]["balanced_accuracy"]
    assert model["evaluation_note"]
    assert "chance" in model["evaluation_note"]
    assert model["config_sha256"] == contract_lib.sha256_hex(_lf(SUCCESSOR / "model_config.json"))
    assert model["weights_sha256"] == config["weights_sha256"]
    assert model["weights_sha256"] == contract_lib.sha256_hex((SUCCESSOR / "reef_classifier_weights.npz").read_bytes())
    assert model["weights_location"] == (
        "s3://reefradar-2477-embeddings/models/archive/interim-real-only-2026.10.1/reef_classifier_weights.npz"
    )
    assert "classifier" in model["served_from"]
    assert model["predecessor"]["model_version"] == "interim-real-only"
    assert model["predecessor"]["retired_reason"] == config["predecessor"]["reason"]
    contract_lib.validate(model, "model-version")


def test_v2_stamp_values():
    assert _load(V2 / "stamp.json") == {
        "contract_version": 2,
        "dataset_version": "reefradar-reference-2026.10.0",
        "model_version": SUCCESSOR_VERSION,
        "preprocessing_spec_version": SPEC_VERSION,
    }


def test_v2_report_and_ood_bytes_copied(manifest):
    assert (V2 / "evaluation_report.json").read_bytes() == _lf(EVALUATION / "report.json")
    assert (V2 / "ood_reference.json").read_bytes() == _lf(SUCCESSOR / "ood_reference.json")
    assert (V2 / "ood_reference.f32").read_bytes() == (EVALUATION / "inputs" / "reembedded.f32").read_bytes()
    ood = _load(V2 / "ood_reference.json")
    assert ood["embeddings"]["uri"] == manifest["artifacts"]["ood_embeddings"]["uri"] == "v2/ood_reference.f32"
    assert ood["embeddings"]["sha256"] == manifest["artifacts"]["ood_embeddings"]["sha256"]
    assert ood["preprocessing_spec_version"] == SPEC_VERSION
    assert manifest["artifacts"]["ood_reference"]["uri"] == "v2/ood_reference.json"
    assert manifest["artifacts"]["evaluation_report"]["uri"] == "v2/evaluation_report.json"
    assert _load(V2 / "evaluation_report.json")["served_model_version"] == SUCCESSOR_VERSION


def test_v2_schema_copies_match_the_current_schemas(manifest):
    for stem in ("evaluation-report", "ood-reference", "preprocessing-spec", "model-version"):
        copy_path = V2 / "schema" / f"{stem}.schema.json"
        assert copy_path.read_bytes() == _lf(CONTRACTS / "schema" / f"{stem}.schema.json"), stem
    assert "evaluation_report" in manifest["artifacts"]["schemas"]
    assert "ood_reference" in manifest["artifacts"]["schemas"]


def test_v2_check_is_reproducible(contracts_copy, capsys):
    assert build_contract.main(["--version", "2", "--check"]) == 0
    assert "OK" in capsys.readouterr().out
    # a rebuild with the committed frozen_at yields bytes equal to the committed files
    frozen_at = _load(contracts_copy / "bucket" / "contract" / "v2.json")["frozen_at"]
    files = build_contract.build_bundle_v2(frozen_at, contracts_copy)
    assert "bucket/contract/v2.json" in files
    for rel, data in files.items():
        assert (contracts_copy / rel).read_bytes() == data, rel


def test_v2_check_fails_when_a_committed_file_differs(contracts_copy, capsys):
    path = contracts_copy / "bucket" / "v2" / "preprocessing_spec.json"
    path.write_bytes(path.read_bytes().replace(b"Phase 11", b"Phase 12", 1))
    assert build_contract.main(["--version", "2", "--check"]) == 1
    assert "v2/preprocessing_spec.json" in capsys.readouterr().out


def test_v1_check_unchanged(capsys):
    assert build_contract.main(["--version", "1", "--check"]) == 0
    assert "OK" in capsys.readouterr().out
    v1 = _load(BUCKET / "contract" / "v1.json")
    assert v1["model_version"] == "interim-real-only"
    assert v1["preprocessing_spec_version"] == "preproc-2026.10.0-as-deployed"


# ---------------------------------------------------------------------------
# Task 2: the checker rules for v2's cross-artifact links
# ---------------------------------------------------------------------------

def _rewrite(path, mutate, canonical=True):
    data = json.loads(path.read_text(encoding="utf-8"))
    mutate(data)
    path.write_bytes(contract_lib.canonical_json_bytes(data))


def _reseal(contracts_dir, label, uri):
    """Point the v2 manifest's entry for `label` at the (edited) file so only the link rule can fail."""
    manifest_path = contracts_dir / "bucket" / "contract" / "v2.json"
    data = (contracts_dir / "bucket" / uri).read_bytes()

    def mutate(manifest):
        entry = manifest["artifacts"][label]
        entry["sha256"] = contract_lib.sha256_hex(data)
        entry["bytes"] = len(data)

    _rewrite(manifest_path, mutate)


def _problems(contracts_dir):
    return check_contract.check_manifest(
        contracts_dir / "bucket" / "contract" / "v2.json", contracts_dir, copies_must_match=True
    )


def _tamper_ood_bytes(contracts_dir):
    path = contracts_dir / "bucket" / "v2" / "ood_reference.f32"
    path.write_bytes(path.read_bytes()[:-4])
    _reseal(contracts_dir, "ood_embeddings", "v2/ood_reference.f32")
    return "ood_reference.f32"


def _tamper_ood_rows_hash(contracts_dir):
    path = contracts_dir / "bucket" / "v2" / "ood_reference.f32"
    data = bytearray(path.read_bytes())
    data[0] ^= 0x01
    path.write_bytes(bytes(data))
    _reseal(contracts_dir, "ood_embeddings", "v2/ood_reference.f32")
    return "embeddings.sha256"


def _tamper_ood_spec(contracts_dir):
    path = contracts_dir / "bucket" / "v2" / "ood_reference.json"
    _rewrite(path, lambda d: d.update(preprocessing_spec_version="preproc-2026.10.0-as-deployed"))
    _reseal(contracts_dir, "ood_reference", "v2/ood_reference.json")
    return "ood_reference.preprocessing_spec_version"


def _tamper_model_report_sha(contracts_dir):
    path = contracts_dir / "bucket" / "v2" / "model_version.json"
    _rewrite(path, lambda d: d["evaluation"].update(report_sha256="0" * 64))
    _reseal(contracts_dir, "model_version", "v2/model_version.json")
    return "report_sha256"


def _tamper_model_report_uri(contracts_dir):
    path = contracts_dir / "bucket" / "v2" / "model_version.json"
    _rewrite(path, lambda d: d["evaluation"].update(report_uri="v2/other_report.json"))
    _reseal(contracts_dir, "model_version", "v2/model_version.json")
    return "report_uri"


def _tamper_report_served_model(contracts_dir):
    path = contracts_dir / "bucket" / "v2" / "evaluation_report.json"
    _rewrite(path, lambda d: d.update(served_model_version="interim-real-only"))
    _reseal(contracts_dir, "evaluation_report", "v2/evaluation_report.json")
    # keep model_version.evaluation.report_sha256 in step so only the served-model rule trips
    data = path.read_bytes()
    model_path = contracts_dir / "bucket" / "v2" / "model_version.json"
    _rewrite(model_path, lambda d: d["evaluation"].update(report_sha256=contract_lib.sha256_hex(data)))
    _reseal(contracts_dir, "model_version", "v2/model_version.json")
    return "served_model_version"


def _tamper_model_training_spec(contracts_dir):
    path = contracts_dir / "bucket" / "v2" / "model_version.json"
    _rewrite(path, lambda d: d["training"].update(preprocessing_spec_version="preproc-2026.10.0-as-deployed"))
    _reseal(contracts_dir, "model_version", "v2/model_version.json")
    return "trained under"


TAMPERINGS = [
    _tamper_ood_bytes,
    _tamper_ood_rows_hash,
    _tamper_ood_spec,
    _tamper_model_report_sha,
    _tamper_model_report_uri,
    _tamper_report_served_model,
    _tamper_model_training_spec,
]


def test_checker_v2_clean(contracts_copy):
    assert _problems(contracts_copy) == []
    assert check_contract.main(["--check", "--additive"]) == 0


@pytest.mark.parametrize("tamper", TAMPERINGS, ids=lambda f: f.__name__.replace("_tamper_", ""))
def test_checker_v2_cross_links(contracts_copy, tamper):
    needle = tamper(contracts_copy)
    problems = _problems(contracts_copy)
    assert problems, f"{tamper.__name__} produced no problem"
    assert any(needle in line for line in problems), (needle, problems)


def test_checker_v2_validates_report_and_ood_against_their_schemas(contracts_copy):
    path = contracts_copy / "bucket" / "v2" / "evaluation_report.json"
    _rewrite(path, lambda d: d.pop("report_version"))
    _reseal(contracts_copy, "evaluation_report", "v2/evaluation_report.json")
    assert any("evaluation-report" in line for line in _problems(contracts_copy))
    path = contracts_copy / "bucket" / "v2" / "ood_reference.json"
    _rewrite(path, lambda d: d.pop("ood_version"))
    _reseal(contracts_copy, "ood_reference", "v2/ood_reference.json")
    assert any("ood-reference" in line for line in _problems(contracts_copy))


def test_checker_v1_rules_unchanged(contracts_copy):
    assert check_contract.check_manifest(
        contracts_copy / "bucket" / "contract" / "v1.json", contracts_copy, copies_must_match=False
    ) == []
    assert copy.deepcopy(build_contract.V2_DATASET_VERSION) == build_contract.DATASET_VERSION
