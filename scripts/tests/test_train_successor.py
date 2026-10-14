"""
Tests for the interim successor model (plan 05-12, ML-03 / ML-06).

The successor `interim-real-only-2026.10.1` is the exact interim recipe (same
outer 15% split, train_mlp, seed 42) re-run on the 100 training windows
re-embedded through reef_audio. These tests pin its config fields, check that
the classifier's loader accepts it, that it reproduces from the committed
inputs, and that the original recipe path (--training) is unchanged.
Offline: nothing here touches AWS.
"""

import hashlib
import json
import pathlib
import sys

import numpy as np
import pytest

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent.parent
REPO_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))
sys.path.insert(0, str(REPO_ROOT / "lambdas" / "shared"))
import reef_audio  # noqa: E402
import reef_reference  # noqa: E402
import train_interim_real_only as trainer  # noqa: E402

INPUTS = REPO_ROOT / "models" / "interim-real-only" / "evaluation" / "inputs"
REEMBEDDED_F32 = INPUTS / "reembedded.f32"
REEMBEDDED_JSON = INPUTS / "reembedded.json"
ROWS_JSON = INPUTS / "rows.json"
SUCCESSOR = REPO_ROOT / "models" / "interim-real-only-2026.10.1"
VERSION = "interim-real-only-2026.10.1"


def _sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def _lf_sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def _run_successor(out_dir):
    trainer.main([
        "--embeddings-f32", str(REEMBEDDED_F32),
        "--rows-json", str(ROWS_JSON),
        "--version", VERSION,
        "--preprocessing-spec-version", reef_audio.SPEC_VERSION,
        "--predecessor-version", "interim-real-only",
        "--predecessor-reason", "test run",
        "--out", str(out_dir),
    ])


def _config():
    return json.loads((SUCCESSOR / "model_config.json").read_text(encoding="utf-8"))


def test_successor_config_fields():
    config = _config()
    assert config["version"] == VERSION
    assert config["preprocessing_spec_version"] == reef_audio.SPEC_VERSION == "preproc-2026.10.1-reef-audio"
    assert config["weights_sha256"] == _sha256(SUCCESSOR / "reef_classifier_weights.npz")
    assert config["num_classes"] == 3
    assert config["idx_to_label"] == {"0": "degraded", "1": "healthy", "2": "restored_early"}
    assert config["training_samples"] == 100
    assert config["synthetic_rows_excluded"] == 0
    assert config["seed"] == 42
    assert config["input_dim"] == 1280

    sites = {s["site_id"]: s for s in config["training_sites"]}
    assert sorted(sites) == ["ind_D2", "ind_D3", "ind_H4", "ind_N1", "ken_H1"]
    for site in sites.values():
        assert site["latitude"] is not None and site["longitude"] is not None
        assert site["rows"] == 20

    inputs = {pathlib.PurePosixPath(i["path"]).name: i["sha256"] for i in config["training_inputs"]}
    assert set(inputs) == {"reembedded.f32", "reembedded.json", "rows.json"}
    assert inputs["reembedded.f32"] == _sha256(REEMBEDDED_F32)
    assert inputs["reembedded.json"] == _lf_sha256(REEMBEDDED_JSON)
    assert inputs["rows.json"] == _lf_sha256(ROWS_JSON)

    rows = json.loads(ROWS_JSON.read_text(encoding="utf-8"))
    assert config["source_training_files"] == [rows["source"]]
    assert config["source_training_files"][0]["key"] == "training/training_test_20.json"

    assert config["predecessor"]["model_version"] == "interim-real-only"
    assert config["predecessor"]["reason"]
    assert "models/interim-real-only/evaluation/REPORT.md" in config["evaluation_note"]
    assert "Phase 12" in config["evaluation_note"]


def test_successor_report_states_why_and_limits():
    text = (SUCCESSOR / "TRAINING-REPORT.md").read_text(encoding="utf-8")
    assert "Phase 12" in text
    assert "interim" in text.lower()
    assert "new sites" in text
    drift = json.loads(REEMBEDDED_JSON.read_text(encoding="utf-8"))["drift_probe"]["cosine"]
    assert f"{drift['mean']:.4f}" in text


def test_successor_loads_as_served_model():
    served = reef_reference.load_served_model(
        str(SUCCESSOR / "model_config.json"), str(SUCCESSOR / "reef_classifier_weights.npz")
    )
    assert served.version == VERSION
    assert served.training_spec_version == reef_audio.SPEC_VERSION
    assert served.weights["w1"].shape == (1280, 256)
    assert served.weights["w3"].shape == (64, 3)


def test_successor_reproduces_from_committed_inputs(tmp_path):
    _run_successor(tmp_path)
    committed = np.load(SUCCESSOR / "reef_classifier_weights.npz", allow_pickle=False)
    fresh = np.load(tmp_path / "reef_classifier_weights.npz", allow_pickle=False)
    X = np.frombuffer(REEMBEDDED_F32.read_bytes(), dtype="<f4").reshape(100, 1280)
    committed_probs = trainer.predict_proba(X, {k: committed[k] for k in committed.files})
    fresh_probs = trainer.predict_proba(X, {k: fresh[k] for k in fresh.files})
    assert np.array_equal(np.argmax(committed_probs, axis=1), np.argmax(fresh_probs, axis=1))
    assert np.max(np.abs(committed_probs - fresh_probs)) < 1e-3
    fresh_config = json.loads((tmp_path / "model_config.json").read_text(encoding="utf-8"))
    assert fresh_config["weights_sha256"] == _sha256(tmp_path / "reef_classifier_weights.npz")


def _synthetic_training_json(path, dim=24, per_class=10):
    rng = np.random.default_rng(3)
    centers = rng.normal(scale=6.0, size=(3, dim))
    samples = []
    for ci, label in enumerate(["degraded", "healthy", "restored_early"]):
        for i in range(per_class):
            samples.append({
                "file_id": f"site{ci}_2022010{i % 9}_{i:06d}",
                "label": label,
                "site_id": f"site{ci}",
                "embedding": rng.normal(loc=centers[ci], scale=0.5).tolist(),
            })
    path.write_text(json.dumps({"samples": samples}), encoding="utf-8")


def _tiny_lock(path):
    path.write_text(json.dumps({
        "interim_classes": ["degraded", "healthy", "restored_early"],
        "artifacts": {"idx_to_label": {"0": "degraded", "1": "healthy", "2": "restored_early", "3": "restored_mid"}},
        "training_sites": [],
    }), encoding="utf-8")


def test_original_recipe_path_unchanged(tmp_path):
    training = tmp_path / "training.json"
    lock = tmp_path / "lock.json"
    _synthetic_training_json(training)
    _tiny_lock(lock)
    out_a, out_b = tmp_path / "a", tmp_path / "b"
    for out in (out_a, out_b):
        trainer.main(["--training", str(training), "--lock", str(lock), "--out", str(out), "--seed", "42"])
    assert (out_a / "reef_classifier_weights.npz").read_bytes() == (out_b / "reef_classifier_weights.npz").read_bytes()

    config = json.loads((out_a / "model_config.json").read_text(encoding="utf-8"))
    assert config["version"] == "interim-real-only"
    for key in ("preprocessing_spec_version", "weights_sha256", "training_inputs", "predecessor"):
        assert key not in config
    assert config["evaluation_note"] == trainer.EVALUATION_NOTE
    report = (out_a / "TRAINING-REPORT.md").read_text(encoding="utf-8")
    assert "trained on the real rows only" in report or "retrained on the real rows only" in report


def test_input_modes_are_mutually_exclusive(tmp_path):
    with pytest.raises(SystemExit):
        trainer.main([
            "--training", "x.json", "--embeddings-f32", str(REEMBEDDED_F32),
            "--rows-json", str(ROWS_JSON), "--out", str(tmp_path),
        ])
