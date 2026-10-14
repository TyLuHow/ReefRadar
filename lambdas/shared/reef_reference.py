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
