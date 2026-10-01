"""
Phase 2 (CONTRACT-01/04): the honest ModelVersion, PreprocessingSpec and version
stamp artifacts of contract v1.

The preprocessing spec is compared with constants parsed straight out of
lambdas/preprocessor/handler.py, so the spec cannot drift from the code it
describes. The model artifact is compared with the committed model config, the
model card and the committed weights bytes. No accuracy figure may appear.
"""

import hashlib
import json
import pathlib
import re

import pytest

import contract_lib

REPO_ROOT = contract_lib.REPO_ROOT
BUNDLE = contract_lib.BUCKET_DIR / "v1"
MODEL_DIR = REPO_ROOT / "models" / "interim-real-only"
HANDLER = REPO_ROOT / "lambdas" / "preprocessor" / "handler.py"
CLASSIFIER = REPO_ROOT / "lambdas" / "classifier" / "handler.py"
MODEL_CARD = REPO_ROOT / "dashboard-next" / "src" / "data" / "model-card.json"
LOCK = REPO_ROOT / "docs" / "model" / "deployed-model.lock.json"
DEPLOY_LOG = REPO_ROOT / "docs" / "deploy" / "DEPLOY-LOG.md"


def _load(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def _strings_and_numbers(node, key=""):
    """Yield (key, value) for every scalar in a JSON document."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _strings_and_numbers(v, k)
    elif isinstance(node, list):
        for item in node:
            yield from _strings_and_numbers(item, key)
    else:
        yield key, node


@pytest.fixture(scope="module")
def model():
    return _load(BUNDLE / "model_version.json")


@pytest.fixture(scope="module")
def spec():
    return _load(BUNDLE / "preprocessing_spec.json")


@pytest.fixture(scope="module")
def stamp():
    return _load(BUNDLE / "stamp.json")


@pytest.fixture(scope="module")
def manifest():
    return _load(contract_lib.BUCKET_DIR / "contract" / "v1.json")


@pytest.fixture(scope="module")
def config():
    return _load(MODEL_DIR / "model_config.json")


def test_model_version_matches_the_committed_config_and_model_card(model, config):
    contract_lib.validate(model, "model-version")
    card = _load(MODEL_CARD)
    assert model["model_version"] == config["version"] == card["model_version"] == "interim-real-only"
    expected_classes = [config["idx_to_label"][str(i)] for i in range(config["num_classes"])]
    assert model["classes"] == expected_classes == ["degraded", "healthy", "restored_early"]
    assert model["classes"] == card["classes"]
    assert model["architecture"]["input_dim"] == config["input_dim"]
    assert model["architecture"]["hidden_dims"] == config["hidden_dims"]
    assert model["architecture"]["num_classes"] == config["num_classes"] == card["num_classes"]
    assert model["embedding_model"]["dimension"] == config["input_dim"]


def test_embedding_model_identity_matches_what_the_classifier_records(model):
    source = CLASSIFIER.read_text(encoding="utf-8")
    assert f"'embedding_model': '{model['embedding_model']['name']}'" in source
    assert f"'embedding_version': '{model['embedding_model']['version']}'" in source


def test_training_block_states_only_what_the_report_supports(model, config):
    training = model["training"]
    assert training["rows"] == config["training_samples"] == 100 == _load(MODEL_CARD)["training_rows"]
    assert training["sites"] == [s["site_id"] for s in config["training_sites"]]
    assert training["sites"] == ["ind_D2", "ind_D3", "ind_H4", "ind_N1", "ken_H1"]
    assert training["countries"] == config["training_countries"] == ["Indonesia", "Kenya"]
    assert training["synthetic_data"] is False
    assert training["synthetic_rows_excluded"] == config["synthetic_rows_excluded"] == 0
    assert training["seed"] == config["seed"]
    # The training report does not say how windows were pooled, so none is claimed.
    assert "pooling" not in training


def test_no_accuracy_figure_anywhere_in_the_model_artifact(model, config):
    assert model["evaluation"] is None
    assert model["evaluation_note"] == config["evaluation_note"]
    for key, value in _strings_and_numbers(model):
        if "accuracy" in key.lower():
            assert not isinstance(value, (int, float)) or isinstance(value, bool), key
        if isinstance(value, str):
            assert "90%" not in value
    text = (BUNDLE / "model_version.json").read_text(encoding="utf-8")
    assert "split_accuracy" not in text and "0.90" not in text


def test_model_hashes_equal_the_committed_files(model):
    config_lf = (MODEL_DIR / "model_config.json").read_bytes().replace(b"\r\n", b"\n")
    weights = (MODEL_DIR / "reef_classifier_weights.npz").read_bytes()
    assert model["config_sha256"] == hashlib.sha256(config_lf).hexdigest()
    assert model["weights_sha256"] == hashlib.sha256(weights).hexdigest()
    assert model["weights_location"] == "s3://reefradar-2477-embeddings/models/reef_classifier_weights.npz"


def test_deployed_config_hash_is_the_crlf_variant_recorded_in_the_deploy_log(model):
    config_lf = (MODEL_DIR / "model_config.json").read_bytes().replace(b"\r\n", b"\n")
    deployed = hashlib.sha256(config_lf.replace(b"\n", b"\r\n")).hexdigest()
    assert model["config_sha256_deployed"] == deployed
    assert model["config_sha256_deployed"] != model["config_sha256"]
    log = DEPLOY_LOG.read_text(encoding="utf-8")
    assert re.search(r"models/model_config\.json` sha256 `" + deployed + "`", log)


def test_predecessor_is_the_retired_synthetic_trained_model(model):
    lock = _load(LOCK)
    assert model["predecessor"]["model_version"] == lock["artifacts"]["version"] == "2.0"
    assert "synthetic" in model["predecessor"]["retired_reason"]
    assert "restored_mid" in model["predecessor"]["retired_reason"]


def _parse_handler_constants():
    source = HANDLER.read_text(encoding="utf-8")
    found = {}
    for name in (
        "TARGET_SAMPLE_RATE", "SEGMENT_DURATION", "SEGMENT_SAMPLES",
        "MIN_AUDIO_DURATION", "MAX_AUDIO_DURATION",
    ):
        match = re.search(rf"^{name}\s*=\s*([0-9.]+)", source, re.MULTILINE)
        assert match, name
        number = float(match.group(1))
        found[name] = int(number) if number.is_integer() and "." not in match.group(1) else number
    return found


def test_preprocessing_spec_equals_the_constants_in_the_preprocessor(spec):
    contract_lib.validate(spec, "preprocessing-spec")
    c = _parse_handler_constants()
    assert spec["sample_rate_hz"] == c["TARGET_SAMPLE_RATE"] == 32000
    assert spec["window_samples"] == c["SEGMENT_SAMPLES"] == 160000
    assert spec["window_s"] == c["SEGMENT_DURATION"] == 5.0
    assert spec["hop_s"] == spec["window_s"]
    assert spec["min_duration_s"] == c["MIN_AUDIO_DURATION"]
    assert spec["max_duration_s"] == c["MAX_AUDIO_DURATION"]
    assert spec["window_samples"] == spec["sample_rate_hz"] * spec["window_s"]


def test_preprocessing_spec_records_what_production_does_today(spec):
    assert spec["status"] == "as-deployed"
    assert spec["resampling"] == {"method": "linear_interpolation", "anti_alias_filter": False}
    assert spec["channel_mix"] == "mean"
    assert spec["trailing_partial_window"] == "dropped"
    assert spec["serving"]["window_pooling"] == "mean"
    scaling = spec["amplitude_scaling"]
    assert scaling["mono_pcm16"].startswith("divide by 32768")
    assert scaling["mono_pcm32"].startswith("divide by 2147483648")
    assert scaling["peak_normalised_mono_pcm16_pcm32"] is False
    # Averaging channels yields float64, which falls through to the peak-divide branch.
    assert scaling["peak_normalised_multichannel"] is True


def test_known_train_serve_gaps_are_listed_not_claimed_fixed(spec):
    gaps = {g["id"]: g for g in spec["known_gaps"]}
    assert {"F8a", "F8b", "F8c", "F8d"} <= set(gaps)
    for gap in gaps.values():
        assert gap["owner_phase"] == "Phase 5"
        assert "DATA-MODEL" in gap["reference"] and "F8" in gap["reference"]
        assert gap["status"] == "open"
    assert spec["embedding_model"]["dimension"] == 1280


def test_stamp_equals_the_manifest_versions_and_validates(stamp, manifest):
    contract_lib.validate(stamp, "analysis-result")
    assert stamp == {
        "contract_version": manifest["contract_version"],
        "dataset_version": manifest["dataset_version"],
        "model_version": manifest["model_version"],
        "preprocessing_spec_version": manifest["preprocessing_spec_version"],
    }
    assert stamp == {
        "contract_version": 1,
        "dataset_version": "reefradar-reference-2026.10.0",
        "model_version": "interim-real-only",
        "preprocessing_spec_version": "preproc-2026.10.0-as-deployed",
    }


def test_a_pre_contract_stamp_must_not_carry_dataset_or_spec_versions(stamp):
    pre_contract = {
        "contract_version": None,
        "dataset_version": None,
        "model_version": "interim-real-only",
        "preprocessing_spec_version": None,
    }
    contract_lib.validate(pre_contract, "analysis-result")
    invented = dict(pre_contract, dataset_version=stamp["dataset_version"])
    with pytest.raises(contract_lib.ContractError):
        contract_lib.validate(invented, "analysis-result")
    invented_spec = dict(pre_contract, preprocessing_spec_version=stamp["preprocessing_spec_version"])
    with pytest.raises(contract_lib.ContractError):
        contract_lib.validate(invented_spec, "analysis-result")
    missing_key = {k: v for k, v in stamp.items() if k != "model_version"}
    with pytest.raises(contract_lib.ContractError):
        contract_lib.validate(missing_key, "analysis-result")
