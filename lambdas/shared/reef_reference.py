"""
Bundled reference data the classifier serves (plan 05-09).

The served model ships inside the classifier zip as served_model_weights.npz and
served_model_config.json, drift-checked together with the code (D-03). That is
the train/serve parity rule: production serves the successor model only
together with reef_audio, never old weights on new preprocessing (and never new
weights on legacy windows, which is what an S3 model object swap would do).

Each file is integrity-checked on load and the loader is bundled-first, like
contract_stamp.py: a file next to this module (the Lambda package layout) wins,
otherwise the repository directory models/interim-real-only-2026.10.1/ is used
(tests, local runs). Stdlib plus NumPy; NumPy arrays are loaded with
allow_pickle=False so a tampered npz can never execute code.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

import numpy as np

_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))

SERVED_MODEL_CONFIG = "served_model_config.json"
SERVED_MODEL_WEIGHTS = "served_model_weights.npz"

# Repository directory of the served model, relative to this module in a checkout.
REPO_MODEL_DIR = os.path.join("..", "..", "models", "interim-real-only-2026.10.1")
# The files in the repository directory carry the training names.
_REPO_CONFIG = "model_config.json"
_REPO_WEIGHTS = "reef_classifier_weights.npz"

REQUIRED_WEIGHT_KEYS = ("w1", "b1", "w2", "b2", "w3", "b3")


class ReferenceDataError(RuntimeError):
    """A bundled reference file is missing, tampered with, or internally inconsistent."""


def validate_model_arrays(weights: Dict[str, Any], config: Dict[str, Any]) -> None:
    """Raise ValueError unless weights and config describe one consistent model.

    Guards the core "probabilities sum to 100%" truth: with a 4-class softmax
    and a 3-class label map, the classifier would emit a subset of the
    distribution (sum < 1). Accepts any class count K as long as the weight
    shapes, the label map and (when declared) `num_classes` all agree, so both
    the interim 3-class and the archived 4-class models load.
    """
    missing = [k for k in REQUIRED_WEIGHT_KEYS if k not in weights]
    if missing:
        raise ValueError(f"model weights missing arrays: {missing}")

    idx_to_label = config.get("idx_to_label")
    if not isinstance(idx_to_label, dict) or not idx_to_label:
        raise ValueError("model config has no idx_to_label mapping")
    try:
        indices = sorted(int(k) for k in idx_to_label)
    except (TypeError, ValueError):
        raise ValueError("model config idx_to_label keys must be integer strings")

    for key, ndim in (("w1", 2), ("w2", 2), ("w3", 2), ("b1", 1), ("b2", 1), ("b3", 1)):
        if np.ndim(weights[key]) != ndim:
            raise ValueError(f"model weight {key} must have {ndim} dimensions")
    if weights["w1"].shape[1] != weights["w2"].shape[0] or weights["w2"].shape[1] != weights["w3"].shape[0]:
        raise ValueError("model weight matrices do not chain (w1/w2/w3 shapes disagree)")
    if weights["b1"].shape[0] != weights["w1"].shape[1] or weights["b2"].shape[0] != weights["w2"].shape[1]:
        raise ValueError("model weights b1/b2 sizes disagree with w1/w2")

    num_out = int(weights["w3"].shape[1])
    if indices != list(range(num_out)):
        raise ValueError(
            f"model config idx_to_label covers classes {indices} but weights have {num_out} outputs"
        )
    if int(weights["b3"].shape[0]) != num_out:
        raise ValueError("model weights b3/w3 output sizes disagree")
    declared = config.get("num_classes")
    if declared is not None and int(declared) != num_out:
        raise ValueError(f"model config num_classes={declared} but weights have {num_out} outputs")
    input_dim = config.get("input_dim")
    if input_dim is not None and int(input_dim) != int(weights["w1"].shape[0]):
        raise ValueError("model config input_dim does not match weights")
    if len(set(idx_to_label.values())) != len(idx_to_label):
        raise ValueError("model config idx_to_label has duplicate labels")


@dataclass
class ServedModel:
    """The model the classifier serves, with the preprocessing it was trained under."""

    weights: Dict[str, np.ndarray]
    config: Dict[str, Any]
    version: str
    training_spec_version: str
    idx_to_label: Dict[str, str]


def _resolve_paths(config_path: Optional[str], weights_path: Optional[str]):
    if config_path is not None and weights_path is not None:
        return config_path, weights_path
    bundled_config = os.path.join(_MODULE_DIR, SERVED_MODEL_CONFIG)
    bundled_weights = os.path.join(_MODULE_DIR, SERVED_MODEL_WEIGHTS)
    if os.path.exists(bundled_config) and os.path.exists(bundled_weights):
        return (config_path or bundled_config), (weights_path or bundled_weights)
    repo_dir = os.path.join(_MODULE_DIR, REPO_MODEL_DIR)
    # Tests may point REPO_MODEL_DIR at a directory holding the bundled names.
    for cfg_name, w_name in ((SERVED_MODEL_CONFIG, SERVED_MODEL_WEIGHTS), (_REPO_CONFIG, _REPO_WEIGHTS)):
        cfg, wts = os.path.join(repo_dir, cfg_name), os.path.join(repo_dir, w_name)
        if os.path.exists(cfg) and os.path.exists(wts):
            return (config_path or cfg), (weights_path or wts)
    return (config_path or bundled_config), (weights_path or bundled_weights)


def _training_spec_version(config: Dict[str, Any]) -> Optional[str]:
    value = config.get("preprocessing_spec_version")
    if value is None and isinstance(config.get("training"), dict):
        value = config["training"].get("preprocessing_spec_version")
    return value


def load_served_model(config_path: Optional[str] = None, weights_path: Optional[str] = None) -> ServedModel:
    """Load, verify and validate the served model.

    Raises ReferenceDataError when a file is missing or unreadable, when the
    weights sha256 differs from the config's weights_sha256, when the config
    lacks weights_sha256 or the preprocessing spec the model was trained under,
    or when the arrays and the label map disagree.
    """
    config_path, weights_path = _resolve_paths(config_path, weights_path)
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        with open(weights_path, "rb") as f:
            raw = f.read()
    except (OSError, ValueError) as exc:
        raise ReferenceDataError(f"served model files could not be read: {exc}") from exc
    if not isinstance(config, dict):
        raise ReferenceDataError("served model config must be a JSON object")

    expected_sha = config.get("weights_sha256")
    if not expected_sha:
        raise ReferenceDataError("served model config is missing weights_sha256")
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ReferenceDataError("served model weights sha256 does not match its config")
    spec_version = _training_spec_version(config)
    if not spec_version:
        raise ReferenceDataError("served model config is missing preprocessing_spec_version")
    version = config.get("version")
    if not version:
        raise ReferenceDataError("served model config is missing version")

    try:
        with np.load(io.BytesIO(raw), allow_pickle=False) as npz:
            weights = {k: npz[k] for k in npz.files}
        validate_model_arrays(weights, config)
    except ReferenceDataError:
        raise
    except Exception as exc:  # ValueError from validation, npz parse errors, refused pickles
        raise ReferenceDataError(f"served model is invalid: {exc}") from exc

    return ServedModel(
        weights=weights,
        config=config,
        version=version,
        training_spec_version=spec_version,
        idx_to_label=dict(config["idx_to_label"]),
    )


# --- contract reference set: embeddings, sites, projection (plan 05-10) -------------
#
# Every similarity and projection value shown for an analysis comes from the
# contract's own files, pinned by the manifest's sha256 values: the 48 reference
# embeddings (embeddings.f32 with row_site_ids), the site records, and the PCA
# basis. In the Lambda package they sit next to this module under the
# BUNDLED_ARTIFACT_FILES names with the contract manifest as contract_manifest.json;
# in a checkout the artifact uris are resolved under contracts/bucket. Nothing is
# read from S3 at runtime.

CONTRACT_MANIFEST = "contract_manifest.json"
BUNDLED_ARTIFACT_FILES = {
    "embeddings": "reference_embeddings.f32",
    "sites": "reference_sites.json",
    "projection": "reference_projection.json",
    "ood_reference": "ood_reference.json",
    "ood_embeddings": "ood_reference.f32",
}

_REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
# Repo mode default manifest (switched to contract/v2.json when 05-15 bundles it).
REPO_CONTRACT_MANIFEST = os.path.join(_REPO_ROOT, "contracts", "bucket", "contract", "v1.json")

EMBEDDING_DIM = 1280


@dataclass
class ReferenceSet:
    """The acoustic reference embeddings, their site records and the PCA basis."""

    row_site_ids: list          # the acoustic-reference site ids in embedding row order
    matrix: np.ndarray          # float32 (len(row_site_ids), 1280)
    sites: Dict[str, Dict[str, Any]]   # every site record (acoustic and location-only) by id
    location_only_ids: list     # ids of the sites that have no embedding, in sites.json order
    projection_mean: np.ndarray        # float64 (1280,)
    projection_components: np.ndarray  # float64 (2, 1280)
    explained_variance_ratio: list
    projection_note: str
    projection_uri: str         # the manifest's uri for the projection (for example v1/projection.json)
    contract_version: int
    dataset_version: str


class _ArtifactSource:
    """Reads manifest artifacts from the bundled files or from the contract bucket, verified."""

    def __init__(self, manifest_path: Optional[str]):
        self.bundled = False
        self.bucket_dir = None
        if manifest_path is None:
            bundled = os.path.join(_MODULE_DIR, CONTRACT_MANIFEST)
            if os.path.exists(bundled):
                self.bundled = True
                manifest_path = bundled
            else:
                manifest_path = REPO_CONTRACT_MANIFEST
        if not self.bundled:
            # contracts/bucket/contract/vN.json -> contracts/bucket
            self.bucket_dir = os.path.dirname(os.path.dirname(os.path.abspath(manifest_path)))
        try:
            with open(manifest_path, "rb") as f:
                self.manifest = json.loads(f.read().decode("utf-8"))
        except (OSError, ValueError) as exc:
            raise ReferenceDataError(f"contract manifest could not be read: {exc}") from exc
        if not isinstance(self.manifest, dict) or not isinstance(self.manifest.get("artifacts"), dict):
            raise ReferenceDataError("contract manifest has no artifacts")

    def artifact(self, name: str) -> Dict[str, Any]:
        entry = self.manifest["artifacts"].get(name)
        if not isinstance(entry, dict) or entry.get("present") is False or not entry.get("sha256"):
            raise ReferenceDataError(f"contract manifest has no {name!r} artifact")
        return entry

    def read(self, name: str, entry: Optional[Dict[str, Any]] = None) -> bytes:
        entry = entry or self.artifact(name)
        if self.bundled:
            filename = BUNDLED_ARTIFACT_FILES.get(name)
            if filename is None:
                raise ReferenceDataError(f"no bundled file is defined for artifact {name!r}")
            path = os.path.join(_MODULE_DIR, filename)
        else:
            path = os.path.join(self.bucket_dir, *str(entry["uri"]).split("/"))
        try:
            with open(path, "rb") as f:
                raw = f.read()
        except OSError as exc:
            raise ReferenceDataError(f"artifact {name!r} could not be read: {exc}") from exc
        return _verify_artifact(name, entry, raw)


def _verify_artifact(name: str, entry: Dict[str, Any], raw: bytes) -> bytes:
    if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
        raise ReferenceDataError(f"artifact {name!r} sha256 does not match the contract manifest")
    declared = entry.get("bytes")
    if declared is not None and len(raw) != int(declared):
        raise ReferenceDataError(
            f"artifact {name!r} is {len(raw)} bytes but the contract manifest says {declared} bytes"
        )
    return raw


def _json_object(name: str, raw: bytes) -> Dict[str, Any]:
    try:
        data = json.loads(raw.decode("utf-8"))
    except ValueError as exc:
        raise ReferenceDataError(f"artifact {name!r} is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ReferenceDataError(f"artifact {name!r} must be a JSON object")
    return data


def _float32_matrix(name: str, raw: bytes, count: int, dim: int) -> np.ndarray:
    if len(raw) != count * dim * 4:
        raise ReferenceDataError(f"artifact {name!r} holds {len(raw)} bytes, expected {count * dim * 4}")
    matrix = np.frombuffer(raw, dtype="<f4").reshape(count, dim)
    if not np.isfinite(matrix).all():
        raise ReferenceDataError(f"artifact {name!r} contains NaN or infinity")
    return matrix.astype(np.float32)


def load_reference_set(manifest_path: Optional[str] = None) -> ReferenceSet:
    """Load and verify the contract's reference embeddings, sites and projection.

    Bundled mode (contract_manifest.json next to this module) reads the bundled
    files; otherwise the manifest at `manifest_path` (default REPO_CONTRACT_MANIFEST)
    is read and artifact uris resolve under its contracts/bucket. Every artifact is
    checked against the manifest's sha256 and byte count. Raises ReferenceDataError
    for any missing, tampered or inconsistent file.
    """
    src = _ArtifactSource(manifest_path)

    emb = src.artifact("embeddings")
    row_site_ids = emb.get("row_site_ids")
    if not isinstance(row_site_ids, list) or not row_site_ids or len(set(row_site_ids)) != len(row_site_ids):
        raise ReferenceDataError("embeddings artifact has no usable row_site_ids")
    if int(emb.get("dim", 0)) != EMBEDDING_DIM:
        raise ReferenceDataError(f"embeddings dim is {emb.get('dim')!r}, expected {EMBEDDING_DIM}")
    if int(emb.get("count", -1)) != len(row_site_ids):
        raise ReferenceDataError("embeddings count does not equal len(row_site_ids)")
    matrix = _float32_matrix("embeddings", src.read("embeddings"), len(row_site_ids), EMBEDDING_DIM)

    sites_doc = _json_object("sites", src.read("sites"))
    site_list = sites_doc.get("sites")
    if not isinstance(site_list, list):
        raise ReferenceDataError("sites artifact has no sites list")
    sites: Dict[str, Dict[str, Any]] = {}
    for site in site_list:
        if not isinstance(site, dict) or not site.get("site_id") or site["site_id"] in sites:
            raise ReferenceDataError("sites artifact has a site without a unique site_id")
        sites[site["site_id"]] = site
    row_index = {site_id: i for i, site_id in enumerate(row_site_ids)}
    location_only = []
    for site_id, site in sites.items():
        if site.get("reference_role") == "acoustic_reference":
            if row_index.get(site_id) is None or site.get("embedding_row") != row_index[site_id]:
                raise ReferenceDataError(
                    f"site {site_id!r} embedding_row {site.get('embedding_row')!r} does not match its "
                    "position in the embeddings row order"
                )
        else:
            if site_id in row_index or site.get("embedding_row") is not None:
                raise ReferenceDataError(f"site {site_id!r} is location-only but has an embedding row")
            location_only.append(site_id)
    missing = [site_id for site_id in row_site_ids if site_id not in sites]
    if missing:
        raise ReferenceDataError(f"embedding rows have no site record: {missing[:3]}")

    proj_entry = src.artifact("projection")
    projection = _json_object("projection", src.read("projection"))
    if projection.get("input_uri") != emb.get("uri"):
        raise ReferenceDataError("projection input_uri is not the manifest's embeddings uri")
    try:
        mean = np.asarray(projection["mean"], dtype=np.float64)
        components = np.asarray(projection["components"], dtype=np.float64)
        ratio = [float(v) for v in projection["explained_variance_ratio"]]
        note = projection["note"]
    except (KeyError, TypeError, ValueError) as exc:
        raise ReferenceDataError(f"projection artifact is incomplete: {exc}") from exc
    if mean.shape != (EMBEDDING_DIM,) or components.shape != (2, EMBEDDING_DIM) or len(ratio) != 2:
        raise ReferenceDataError("projection basis has the wrong shape")
    if not (np.isfinite(mean).all() and np.isfinite(components).all()):
        raise ReferenceDataError("projection basis contains NaN or infinity")
    if not isinstance(note, str) or not note:
        raise ReferenceDataError("projection artifact has no note")

    manifest = src.manifest
    return ReferenceSet(
        row_site_ids=list(row_site_ids),
        matrix=matrix,
        sites=sites,
        location_only_ids=location_only,
        projection_mean=mean,
        projection_components=components,
        explained_variance_ratio=ratio,
        projection_note=note,
        projection_uri=str(proj_entry["uri"]),
        contract_version=int(manifest["contract_version"]),
        dataset_version=str(manifest["dataset_version"]),
    )
