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


# --- contract reference set (plan 05-10) ------------------------------------------

import shutil  # noqa: E402

_BUCKET = Path(__file__).resolve().parents[3] / "contracts" / "bucket"
_LOCATION_ONLY = ["ken_D3", "irma_eastern_sambo", "sanctsound_fk01", "sanctsound_fk02", "sanctsound_fk03", "sanctsound_fk04"]


def _copy_bucket(tmp_path):
    """A tmp copy of the committed contract bucket; returns (manifest path, manifest dict)."""
    dest = tmp_path / "bucket"
    shutil.copytree(_BUCKET, dest)
    path = dest / "contract" / "v1.json"
    return path, json.loads(path.read_text(encoding="utf-8"))


def test_reference_set_repo_mode_v1():
    ref = rr.load_reference_set()
    manifest = json.loads((_BUCKET / "contract" / "v1.json").read_text(encoding="utf-8"))
    assert ref.row_site_ids == manifest["artifacts"]["embeddings"]["row_site_ids"]
    assert len(ref.row_site_ids) == 48
    assert ref.matrix.shape == (48, 1280) and ref.matrix.dtype == np.float32
    assert ref.location_only_ids == _LOCATION_ONLY
    assert len(ref.sites) == 54
    assert ref.contract_version == manifest["contract_version"]
    assert ref.dataset_version == manifest["dataset_version"]
    assert ref.projection_mean.shape == (1280,)
    assert ref.projection_components.shape == (2, 1280)
    assert len(ref.explained_variance_ratio) == 2
    assert "33.0%" in ref.projection_note
    assert ref.projection_uri == "v1/projection.json"


def test_reference_set_bundled_mode(tmp_path, monkeypatch):
    shutil.copy(_BUCKET / "contract" / "v1.json", tmp_path / rr.CONTRACT_MANIFEST)
    shutil.copy(_BUCKET / "v1" / "embeddings.f32", tmp_path / rr.BUNDLED_ARTIFACT_FILES["embeddings"])
    shutil.copy(_BUCKET / "v1" / "sites.json", tmp_path / rr.BUNDLED_ARTIFACT_FILES["sites"])
    shutil.copy(_BUCKET / "v1" / "projection.json", tmp_path / rr.BUNDLED_ARTIFACT_FILES["projection"])
    monkeypatch.setattr(rr, "_MODULE_DIR", str(tmp_path))
    # Repo mode is pointed at nowhere: only the bundled files can satisfy the load.
    monkeypatch.setattr(rr, "REPO_CONTRACT_MANIFEST", str(tmp_path / "nowhere" / "v1.json"))
    ref = rr.load_reference_set()
    assert len(ref.row_site_ids) == 48
    assert ref.matrix.shape == (48, 1280)

    # a flipped byte in a bundled artifact is rejected against the bundled manifest
    path = tmp_path / rr.BUNDLED_ARTIFACT_FILES["embeddings"]
    raw = bytearray(path.read_bytes())
    raw[10] ^= 0xFF
    path.write_bytes(bytes(raw))
    with pytest.raises(rr.ReferenceDataError, match="sha256"):
        rr.load_reference_set()


@pytest.mark.parametrize("name,filename", [
    ("embeddings", "embeddings.f32"), ("sites", "sites.json"), ("projection", "projection.json"),
])
def test_reference_set_tampered_artifact_rejected(tmp_path, name, filename):
    manifest_path, manifest = _copy_bucket(tmp_path)
    assert rr.load_reference_set(str(manifest_path)).row_site_ids  # the untouched copy loads
    target = manifest_path.parent.parent / manifest["artifacts"][name]["uri"]
    raw = bytearray(target.read_bytes())
    raw[len(raw) // 2] ^= 0x01
    target.write_bytes(bytes(raw))
    with pytest.raises(rr.ReferenceDataError, match="sha256"):
        rr.load_reference_set(str(manifest_path))


def test_reference_set_byte_count_checked(tmp_path):
    manifest_path, manifest = _copy_bucket(tmp_path)
    manifest["artifacts"]["sites"]["bytes"] += 1
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(rr.ReferenceDataError, match="bytes"):
        rr.load_reference_set(str(manifest_path))


def test_reference_set_missing_manifest_is_reference_data_error(tmp_path):
    with pytest.raises(rr.ReferenceDataError):
        rr.load_reference_set(str(tmp_path / "none.json"))


# --- OOD reference (plan 05-10 task 2) ---------------------------------------------------

write_ood_contract = _lambdas_conftest.write_ood_contract


def _ood_rows(n=20, seed=3):
    return np.random.RandomState(seed).normal(size=(n, 1280)).astype(np.float32)


def test_ood_reference_loads_a_valid_manifest(tmp_path):
    rows = _ood_rows()
    manifest = write_ood_contract(tmp_path, rows, threshold=0.42)
    ood = rr.load_ood_reference(str(manifest))
    assert ood.metric == "cosine_distance" and ood.k == 1
    assert ood.threshold == pytest.approx(0.42)
    assert ood.matrix.shape == (20, 1280) and ood.matrix.dtype == np.float32
    assert np.array_equal(ood.matrix, rows)
    assert ood.sha256 == hashlib.sha256(rows.tobytes()).hexdigest()
    assert ood.version == "ood-test-nn1-cosine"
    assert len(ood.row_site_ids) == 20


def test_ood_reference_rejects_v1_manifest_and_tampering(tmp_path):
    # The committed v1 manifest names no OOD artifact.
    with pytest.raises(rr.ReferenceDataError, match="ood_reference"):
        rr.load_ood_reference()

    # A flipped byte in the matrix or in the sidecar fails the manifest's sha256 check.
    for filename in ("ood_reference.f32", "ood_reference.json"):
        sub = tmp_path / filename.replace(".", "_")
        manifest = write_ood_contract(sub, _ood_rows())
        target = manifest.parent.parent / "v2" / filename
        raw = bytearray(target.read_bytes())
        raw[len(raw) // 2] ^= 0x01
        target.write_bytes(bytes(raw))
        with pytest.raises(rr.ReferenceDataError, match="sha256"):
            rr.load_ood_reference(str(manifest))


def test_ood_reference_sidecar_must_name_the_matrix_it_ships_with(tmp_path):
    manifest = write_ood_contract(tmp_path, _ood_rows())
    sidecar_path = manifest.parent.parent / "v2" / "ood_reference.json"
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
    sidecar["embeddings"]["sha256"] = "0" * 64
    raw = json.dumps(sidecar).encode("utf-8")
    sidecar_path.write_bytes(raw)
    doc = json.loads(manifest.read_text(encoding="utf-8"))
    doc["artifacts"]["ood_reference"]["sha256"] = hashlib.sha256(raw).hexdigest()
    doc["artifacts"]["ood_reference"]["bytes"] = len(raw)
    manifest.write_text(json.dumps(doc), encoding="utf-8")
    with pytest.raises(rr.ReferenceDataError, match="embeddings.sha256"):
        rr.load_ood_reference(str(manifest))


@pytest.mark.parametrize("field,value", [("metric", "euclidean"), ("k", 2), ("threshold", -0.1)])
def test_ood_reference_requires_cosine_distance_k1_and_a_threshold(tmp_path, field, value):
    manifest = write_ood_contract(tmp_path, _ood_rows())
    sidecar_path = manifest.parent.parent / "v2" / "ood_reference.json"
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
    sidecar[field] = value
    raw = json.dumps(sidecar).encode("utf-8")
    sidecar_path.write_bytes(raw)
    doc = json.loads(manifest.read_text(encoding="utf-8"))
    doc["artifacts"]["ood_reference"]["sha256"] = hashlib.sha256(raw).hexdigest()
    doc["artifacts"]["ood_reference"]["bytes"] = len(raw)
    manifest.write_text(json.dumps(doc), encoding="utf-8")
    with pytest.raises(rr.ReferenceDataError):
        rr.load_ood_reference(str(manifest))


def test_ood_reference_bundled_mode(tmp_path, monkeypatch):
    manifest = write_ood_contract(tmp_path / "src", _ood_rows())
    package = tmp_path / "package"
    package.mkdir()
    shutil.copy(manifest, package / rr.CONTRACT_MANIFEST)
    bucket = manifest.parent.parent
    shutil.copy(bucket / "v2" / "ood_reference.json", package / rr.BUNDLED_ARTIFACT_FILES["ood_reference"])
    shutil.copy(bucket / "v2" / "ood_reference.f32", package / rr.BUNDLED_ARTIFACT_FILES["ood_embeddings"])
    monkeypatch.setattr(rr, "_MODULE_DIR", str(package))
    monkeypatch.setattr(rr, "REPO_CONTRACT_MANIFEST", str(tmp_path / "nowhere" / "v1.json"))
    assert rr.load_ood_reference().matrix.shape == (20, 1280)
