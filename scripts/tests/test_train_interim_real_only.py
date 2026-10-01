"""
Tests for scripts/train_interim_real_only.py (D-11, TRUTH-05).

Confirms:
- filter_real_rows drops synthetic rows and counts them per label.
- train_mlp converges on well-separated toy data.
- The trainer's own forward pass is bit-identical (within 1e-6) to the
  deployed classifier's forward pass (lambdas/classifier/handler.py),
  proving the interim weights are servable by the existing code.
- Two training runs with the same seed produce byte-identical npz files.
"""

import importlib.util
import pathlib
import sys

import numpy as np
import pytest

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent.parent
REPO_ROOT = SCRIPTS_DIR.parent
LAMBDAS_DIR = REPO_ROOT / "lambdas"

sys.path.insert(0, str(SCRIPTS_DIR))
import train_interim_real_only as trainer  # noqa: E402


def _load_lambda_conftest():
    """Load lambdas/conftest.py directly for its load_lambda() helper.

    scripts/tests/ sits outside the lambdas/ directory tree, so pytest's
    conftest fixture discovery does not pick up lambdas/conftest.py's
    load_lambda fixture here. Loading the module by path (same pattern
    scripts/tests/conftest.py uses for load_script) gives us the same
    helper without a new dependency or a sys.path hack to lambdas/.
    """
    spec = importlib.util.spec_from_file_location("lambdas_conftest", LAMBDAS_DIR / "conftest.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_filter_real_rows_drops_synthetic_and_counts():
    samples = [
        {"file_id": "ind_D2_20220830_124200", "label": "degraded"},
        {"file_id": "ind_R1_synthetic_0001", "label": "restored_mid"},
        {"file_id": "ind_R1_synthetic_0002", "label": "restored_mid"},
        {"file_id": "ind_H4_20220830_155400", "label": "healthy"},
    ]
    real_samples, excluded_counts = trainer.filter_real_rows(samples)

    assert len(real_samples) == 2
    assert all("_synthetic_" not in s["file_id"] for s in real_samples)
    assert excluded_counts == {"restored_mid": 2}


def _toy_dataset(seed=0, n_per_class=60, input_dim=1280):
    """Three well-separated Gaussian clusters in a 1280-d space."""
    rng = np.random.default_rng(seed)
    centers = rng.normal(scale=15.0, size=(3, input_dim))
    X, y = [], []
    for label, center in enumerate(centers):
        X.append(rng.normal(loc=center, scale=0.5, size=(n_per_class, input_dim)))
        y.append(np.full(n_per_class, label))
    X = np.concatenate(X).astype(np.float32)
    y = np.concatenate(y).astype(np.int64)
    # Shuffle so classes aren't contiguous.
    order = rng.permutation(len(y))
    return X[order], y[order]


def test_train_mlp_toy_data_reaches_high_accuracy():
    X, y = _toy_dataset(seed=0)
    train_idx, test_idx = trainer.stratified_split(y, 0.2, seed=42)

    weights, info = trainer.train_mlp(X[train_idx], y[train_idx], seed=42)

    assert weights["w1"].shape == (1280, 256)
    assert weights["b1"].shape == (256,)
    assert weights["w2"].shape == (256, 64)
    assert weights["b2"].shape == (64,)
    assert weights["w3"].shape == (64, 3)
    assert weights["b3"].shape == (3,)

    test_probs = trainer.predict_proba(X[test_idx], weights)
    acc = trainer.accuracy(test_probs, y[test_idx])
    assert acc >= 0.9, f"expected >= 0.9 accuracy on well-separated toy data, got {acc}"


def test_forward_pass_matches_deployed_classifier():
    """The trainer's forward_pass must equal classify_embedding's math
    (lambdas/classifier/handler.py:441-479) for arbitrary weights/inputs.
    """
    lambdas_conftest = _load_lambda_conftest()
    classifier = lambdas_conftest.load_lambda("classifier")

    num_classes = 3
    weights = trainer.init_weights(1280, (256, 64), num_classes, seed=7)
    config = {
        "idx_to_label": {"0": "degraded", "1": "healthy", "2": "restored_early"},
        "version": "interim-real-only",
    }

    classifier._model_weights = weights
    classifier._model_config = config

    rng = np.random.default_rng(123)
    for _ in range(20):
        embedding = rng.normal(size=1280).astype(np.float32)

        result = classifier.classify_embedding(embedding.tolist())
        trainer_probs = trainer.predict_proba(embedding.reshape(1, -1), weights)[0]

        for idx_str, label in config["idx_to_label"].items():
            expected = float(trainer_probs[int(idx_str)])
            actual = result["probabilities"][label]
            assert abs(actual - expected) < 1e-6, (
                f"{label}: handler={actual} trainer={expected}"
            )

    # Reset module-level cache so this test doesn't leak into others.
    classifier._model_weights = None
    classifier._model_config = None


def test_same_seed_produces_byte_identical_npz(tmp_path):
    X, y = _toy_dataset(seed=1, n_per_class=20)

    weights_a, _ = trainer.train_mlp(X, y, seed=42)
    weights_b, _ = trainer.train_mlp(X, y, seed=42)

    path_a = tmp_path / "a.npz"
    path_b = tmp_path / "b.npz"
    np.savez(path_a, **{k: v.astype(np.float32) for k, v in weights_a.items()})
    np.savez(path_b, **{k: v.astype(np.float32) for k, v in weights_b.items()})

    assert path_a.read_bytes() == path_b.read_bytes()


def test_stratified_split_is_seeded_and_deterministic():
    y = np.array([0] * 10 + [1] * 10 + [2] * 5)
    a1, b1 = trainer.stratified_split(y, 0.2, seed=42)
    a2, b2 = trainer.stratified_split(y, 0.2, seed=42)

    assert np.array_equal(a1, a2)
    assert np.array_equal(b1, b2)
    assert set(a1.tolist()) & set(b1.tolist()) == set()
