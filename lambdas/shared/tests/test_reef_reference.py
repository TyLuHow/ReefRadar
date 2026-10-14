"""
Tests for lambdas/shared/reef_reference.py (plan 05-09): the served model the
classifier loads from files bundled with it, integrity-checked, bundled-first
like contract_stamp.py.

Why there is no S3 hot-reload test any more: the model now ships inside the
classifier zip together with the code that matches its preprocessing, so a
model change is a deploy (rollback is `deploy-lambdas.py --ref`), not an S3
object swap that the old classifier would pick up on legacy windows.
"""

import hashlib
import importlib.util
import io
import json
from pathlib import Path

import numpy as np
import pytest

import reef_audio
import reef_reference as rr

_LAMBDAS_DIR = Path(__file__).resolve().parent.parent.parent
_spec = importlib.util.spec_from_file_location("lambdas_conftest", _LAMBDAS_DIR / "conftest.py")
_lambdas_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_lambdas_conftest)
write_served_model = _lambdas_conftest.write_served_model


@pytest.fixture
def bundled(tmp_path, monkeypatch):
    """A tmp directory standing in for the Lambda package root, with a valid served model."""
    config, weights = write_served_model(tmp_path)
    monkeypatch.setattr(rr, "_MODULE_DIR", str(tmp_path))
    return tmp_path, config, weights


def _rewrite_config(directory, **changes):
    path = directory / rr.SERVED_MODEL_CONFIG
    config = json.loads(path.read_text(encoding="utf-8"))
    for key, value in changes.items():
        if value is None:
            config.pop(key, None)
        else:
            config[key] = value
    path.write_text(json.dumps(config), encoding="utf-8")


def test_served_model_bundled_first(bundled):
    directory, config, weights = bundled
    model = rr.load_served_model()
    assert model.version == config["version"]
    assert model.training_spec_version == reef_audio.SPEC_VERSION
    assert model.idx_to_label == config["idx_to_label"]
    assert np.array_equal(model.weights["w1"], weights["w1"])
    assert set(model.weights) == set(rr.REQUIRED_WEIGHT_KEYS)


def test_served_model_falls_back_to_the_repo_directory(tmp_path, monkeypatch):
    # No bundled files next to the module: the repo model directory is used.
    repo_dir = tmp_path / "repo-model"
    write_served_model(repo_dir, version="from-repo")
    monkeypatch.setattr(rr, "_MODULE_DIR", str(tmp_path / "empty"))
    monkeypatch.setattr(rr, "REPO_MODEL_DIR", str(repo_dir))
    assert rr.load_served_model().version == "from-repo"


def test_served_model_missing_files_is_reference_data_error(tmp_path, monkeypatch):
    monkeypatch.setattr(rr, "_MODULE_DIR", str(tmp_path / "empty"))
    monkeypatch.setattr(rr, "REPO_MODEL_DIR", str(tmp_path / "nowhere"))
    with pytest.raises(rr.ReferenceDataError):
        rr.load_served_model()


def test_served_model_sha_mismatch_rejected(bundled):
    directory, _, _ = bundled
    _rewrite_config(directory, weights_sha256="0" * 64)
    with pytest.raises(rr.ReferenceDataError, match="sha256"):
        rr.load_served_model()


@pytest.mark.parametrize("missing", ["weights_sha256", "preprocessing_spec_version"])
def test_served_model_requires_spec_version(bundled, missing):
    directory, _, _ = bundled
    _rewrite_config(directory, **{missing: None})
    with pytest.raises(rr.ReferenceDataError, match=missing):
        rr.load_served_model()


def test_served_model_accepts_nested_training_spec_version(bundled):
    directory, _, _ = bundled
    _rewrite_config(
        directory,
        preprocessing_spec_version=None,
        training={"preprocessing_spec_version": reef_audio.SPEC_VERSION},
    )
    assert rr.load_served_model().training_spec_version == reef_audio.SPEC_VERSION


def test_served_model_shape_mismatch_rejected(bundled):
    directory, _, _ = bundled
    _rewrite_config(directory, num_classes=4)
    with pytest.raises(rr.ReferenceDataError):
        rr.load_served_model()


def test_served_model_label_map_mismatch_rejected(bundled):
    directory, _, _ = bundled
    _rewrite_config(directory, idx_to_label={"0": "degraded", "1": "healthy"})
    with pytest.raises(rr.ReferenceDataError):
        rr.load_served_model()


def test_served_model_no_pickle(bundled):
    """An npz holding a pickled object array is refused, never unpickled."""
    directory, _, _ = bundled
    buf = io.BytesIO()
    np.savez(buf, w1=np.array([{"x": 1}], dtype=object), b1=np.zeros(1), w2=np.zeros((1, 1)),
             b2=np.zeros(1), w3=np.zeros((1, 3)), b3=np.zeros(3))
    raw = buf.getvalue()
    (directory / rr.SERVED_MODEL_WEIGHTS).write_bytes(raw)
    _rewrite_config(directory, weights_sha256=hashlib.sha256(raw).hexdigest())
    with pytest.raises(rr.ReferenceDataError):
        rr.load_served_model()


def test_validate_model_arrays_accepts_the_published_interim_model():
    base = Path(__file__).resolve().parents[3] / "models" / "interim-real-only"
    config = json.loads((base / "model_config.json").read_text(encoding="utf-8"))
    with np.load(base / "reef_classifier_weights.npz", allow_pickle=False) as npz:
        weights = {k: npz[k] for k in npz.files}
    rr.validate_model_arrays(weights, config)


def test_validate_model_arrays_rejects_missing_label_map(bundled):
    _, config, weights = bundled
    config = {k: v for k, v in config.items() if k != "idx_to_label"}
    with pytest.raises(ValueError):
        rr.validate_model_arrays(weights, config)
