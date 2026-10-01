"""
Tests for scripts/audit_deployed_model.py (D-10 deployed-model audit).

Fixtures stand in for the deployed S3 artifacts: a model_config.json, a
reef_classifier_weights.npz, and training/*.json files following the same
schema as scripts/train_classifier.py's `samples` list
({embedding, label, site_id, country, file_id?}).

A row is synthetic when its file_id contains "_synthetic_" (the marker
scripts/add_restored_mid_and_retrain.py:252 writes) or when its site_id/
label pair matches the synthetic generator's known targets
(ind_R1/ind_R2 x restored_mid, scripts/add_restored_mid_and_retrain.py:44-59)
with no file_id at all.
"""

import io
import json

import numpy as np
import pytest

import audit_deployed_model as audit


def make_weights_bytes(input_dim=4, hidden=(3, 2), num_classes=3, seed=0):
    rng = np.random.RandomState(seed)
    w1 = rng.randn(input_dim, hidden[0]).astype(np.float32)
    b1 = rng.randn(hidden[0]).astype(np.float32)
    w2 = rng.randn(hidden[0], hidden[1]).astype(np.float32)
    b2 = rng.randn(hidden[1]).astype(np.float32)
    w3 = rng.randn(hidden[1], num_classes).astype(np.float32)
    b3 = rng.randn(num_classes).astype(np.float32)
    buf = io.BytesIO()
    np.savez(buf, w1=w1, b1=b1, w2=w2, b2=b2, w3=w3, b3=b3)
    return buf.getvalue()


def make_embedding(dim=4, seed=0):
    rng = np.random.RandomState(seed)
    return rng.randn(dim).astype(np.float32).tolist()


@pytest.fixture
def config_dict():
    return {
        "version": "2.0",
        "created": "2026-01-01T00:00:00",
        "input_dim": 4,
        "hidden_dims": [3, 2],
        "num_classes": 3,
        "label_to_idx": {"degraded": 0, "healthy": 1, "restored_mid": 2},
        "idx_to_label": {"0": "degraded", "1": "healthy", "2": "restored_mid"},
        "training_samples": 6,
        "test_accuracy": 0.9,
    }


@pytest.fixture
def weights_bytes():
    return make_weights_bytes(input_dim=4, hidden=(3, 2), num_classes=3)


@pytest.fixture
def weights_dict(weights_bytes):
    return audit.load_npz_bytes(weights_bytes)


@pytest.fixture
def sites_lookup():
    return {
        "ind_D2": {"country": "Indonesia", "latitude": -4.9, "longitude": 119.3},
        "ind_H4": {"country": "Indonesia", "latitude": -4.91, "longitude": 119.31},
        "ind_R1": {"country": "Indonesia", "latitude": -4.922214, "longitude": 119.317036},
        "ind_R2": {"country": "Indonesia", "latitude": -4.926557, "longitude": 119.316267},
    }


@pytest.fixture
def training_samples():
    # Real rows: ind_D2 (degraded, has file_id with no synthetic marker),
    # ind_H4 (healthy, has file_id with no synthetic marker).
    # Synthetic rows: ind_R1 (file_id contains "_synthetic_"),
    # ind_R2 (no file_id at all, but site_id/label matches the generator's target).
    return [
        {
            "embedding": make_embedding(seed=1),
            "label": "degraded",
            "site_id": "ind_D2",
            "country": "indonesia",
            "file_id": "ind_D2_0001",
        },
        {
            "embedding": make_embedding(seed=2),
            "label": "healthy",
            "site_id": "ind_H4",
            "country": "indonesia",
            "file_id": "ind_H4_0001",
        },
        {
            "embedding": make_embedding(seed=3),
            "label": "restored_mid",
            "site_id": "ind_R1",
            "country": "indonesia",
            "file_id": "ind_R1_synthetic_0000",
        },
        {
            "embedding": make_embedding(seed=4),
            "label": "restored_mid",
            "site_id": "ind_R2",
            "country": "indonesia",
        },
    ]


class TestSynthetic:
    def test_file_id_marker_is_synthetic(self):
        row = {"site_id": "ind_X", "label": "degraded", "file_id": "ind_X_synthetic_0001"}
        assert audit.is_synthetic_row(row) is True

    def test_generator_target_with_no_file_id_is_synthetic(self):
        row = {"site_id": "ind_R1", "label": "restored_mid"}
        assert audit.is_synthetic_row(row) is True

    def test_generator_target_with_real_file_id_is_not_synthetic(self):
        # A real file_id (no "_synthetic_" marker) overrides the site/label
        # heuristic -- real evidence of a real recording.
        row = {"site_id": "ind_R1", "label": "restored_mid", "file_id": "ind_R1_real_0001"}
        assert audit.is_synthetic_row(row) is False

    def test_normal_row_is_real(self):
        row = {"site_id": "ind_D2", "label": "degraded", "file_id": "ind_D2_0001"}
        assert audit.is_synthetic_row(row) is False


class TestAnalyzeTrainingData:
    def test_counts_rows_by_label_and_site(self, training_samples):
        result = audit.analyze_training_data(training_samples)
        assert result["rows"] == 4
        assert result["real_rows"] == 2
        assert result["synthetic_rows"] == 2
        assert result["by_label"]["degraded"] == {"real": 1, "synthetic": 0}
        assert result["by_label"]["healthy"] == {"real": 1, "synthetic": 0}
        assert result["by_label"]["restored_mid"] == {"real": 0, "synthetic": 2}
        assert result["by_site"]["ind_D2"]["real"] == 1
        assert result["by_site"]["ind_R1"]["synthetic"] == 1
        assert result["by_site"]["ind_R2"]["synthetic"] == 1


class TestArtifactSummary:
    def test_reads_identity_from_artifacts(self, config_dict, weights_bytes, weights_dict):
        config_bytes = json.dumps(config_dict).encode()
        summary = audit.build_artifact_summary(config_bytes, weights_bytes, config_dict, weights_dict)
        assert summary["config_sha256"] == audit.sha256_bytes(config_bytes)
        assert summary["weights_sha256"] == audit.sha256_bytes(weights_bytes)
        assert summary["version"] == "2.0"
        assert summary["created"] == "2026-01-01T00:00:00"
        assert summary["idx_to_label"] == config_dict["idx_to_label"]
        # num_classes comes from w3.shape[1], not the config's claimed value.
        assert summary["num_classes"] == 3
        assert summary["weight_shapes"]["w3"] == [2, 3]
        assert summary["claimed_training_samples"] == 6
        assert summary["claimed_test_accuracy"] == 0.9


class TestDecision:
    def test_detects_synthetic_class_and_computes_interim(self, training_samples, config_dict):
        file_result = audit.analyze_training_data(training_samples)
        aggregated = audit.aggregate_training_files([file_result])
        classes_ordered = audit.classes_in_order(config_dict["idx_to_label"])
        classes_without_real_rows = audit.compute_classes_without_real_rows(
            classes_ordered, aggregated["total_by_label"]
        )
        assert classes_without_real_rows == ["restored_mid"]

        decision = audit.compute_decision(classes_without_real_rows, classes_ordered)
        assert decision["synthetic_class_detected"] is True
        assert decision["interim_required"] is True
        assert decision["interim_num_classes"] == 2
        assert decision["interim_classes"] == ["degraded", "healthy"]

    def test_no_missing_classes_means_no_interim(self):
        classes_ordered = ["degraded", "healthy"]
        total_by_label = {
            "degraded": {"real": 5, "synthetic": 0},
            "healthy": {"real": 5, "synthetic": 0},
        }
        classes_without_real_rows = audit.compute_classes_without_real_rows(
            classes_ordered, total_by_label
        )
        assert classes_without_real_rows == []
        decision = audit.compute_decision(classes_without_real_rows, classes_ordered)
        assert decision["synthetic_class_detected"] is False
        assert decision["interim_required"] is False
        assert decision["interim_num_classes"] == 2
        assert decision["interim_classes"] == ["degraded", "healthy"]

    def test_no_training_files_at_all_means_every_class_is_missing(self, config_dict):
        aggregated = audit.aggregate_training_files([])
        classes_ordered = audit.classes_in_order(config_dict["idx_to_label"])
        classes_without_real_rows = audit.compute_classes_without_real_rows(
            classes_ordered, aggregated["total_by_label"]
        )
        assert set(classes_without_real_rows) == set(classes_ordered)
        decision = audit.compute_decision(classes_without_real_rows, classes_ordered)
        assert decision["synthetic_class_detected"] is True
        assert decision["interim_required"] is True
        assert decision["interim_num_classes"] == 0
        assert decision["interim_classes"] == []


class TestTrainingSites:
    def test_lists_real_sites_with_country_and_coordinates(self, training_samples, sites_lookup):
        file_result = audit.analyze_training_data(training_samples)
        aggregated = audit.aggregate_training_files([file_result])
        training_sites = audit.build_training_sites(aggregated["total_by_site"], sites_lookup)
        by_id = {s["site_id"]: s for s in training_sites}

        # Only sites with at least one real row are listed.
        assert set(by_id.keys()) == {"ind_D2", "ind_H4"}
        assert by_id["ind_D2"]["country"] == "Indonesia"
        assert by_id["ind_D2"]["latitude"] == -4.9
        assert by_id["ind_D2"]["real_rows"] == 1
        for site in training_sites:
            assert site["country"]
            assert site["latitude"] is not None
            assert site["longitude"] is not None


class TestLoadNpzBytes:
    def test_round_trips_arrays_without_pickle(self, weights_bytes):
        weights = audit.load_npz_bytes(weights_bytes)
        assert set(weights.keys()) == {"w1", "b1", "w2", "b2", "w3", "b3"}
        assert weights["w3"].shape == (2, 3)


class TestShaBytes:
    def test_sha256_is_deterministic(self):
        data = b"hello world"
        assert audit.sha256_bytes(data) == audit.sha256_bytes(data)
        assert len(audit.sha256_bytes(data)) == 64


def test_run_audit_end_to_end_local(tmp_path, config_dict, weights_bytes, training_samples, sites_lookup):
    """Full local-mode run: fixture config/weights/training files on disk,
    audit produces a lock dict matching the plan's schema and the acceptance
    criterion that every training_sites entry has a truthy country and a
    non-None latitude.
    """
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    training_dir = tmp_path / "training"
    training_dir.mkdir()

    (models_dir / "model_config.json").write_text(json.dumps(config_dict))
    (models_dir / "reef_classifier_weights.npz").write_bytes(weights_bytes)
    (training_dir / "training_test_20.json").write_text(
        json.dumps({"samples": training_samples})
    )

    sites_path = tmp_path / "sites.json"
    sites_path.write_text(
        json.dumps(
            {
                "sites": [
                    {"site_id": sid, **info}
                    for sid, info in sites_lookup.items()
                ]
            }
        )
    )

    lock = audit.run_local_audit(tmp_path, sites_path=sites_path)

    assert lock["artifacts"]["num_classes"] == 3
    assert lock["artifacts"]["weights_sha256"]
    assert lock["interim_required"] is True
    assert lock["interim_num_classes"] == 2
    assert lock["classes_without_real_rows"] == ["restored_mid"]
    assert len(lock["training_files"]) == 1
    assert lock["training_files"][0]["rows"] == 4
    assert all(s["country"] and s["latitude"] is not None for s in lock["training_sites"])
    assert isinstance(lock["evidence"], list) and len(lock["evidence"]) > 0
