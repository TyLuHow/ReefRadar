"""
End-to-end tests for lambdas/classifier/handler.py (plans 01-11 and 05-09).

Exercises handler.handler() against moto-mocked S3/DynamoDB. Segments are real
reef_audio windows from a 30 s MARRS excerpt written as segments.f32 plus the
sidecar, the served model is a tmp bundled model (served_model_config.json and
served_model_weights.npz, reef_reference._MODULE_DIR monkeypatched), reference
reference data is the committed contract v1 (repo mode), and the inference Lambda is replaced by
FakeInferenceLambda (the only thing moto cannot fake, since it calls a
*different* Lambda function). Confirms, end to end:

  - 05-09: every 5 s window is classified individually; the recording's
    probabilities are the mean of the per-window probability vectors; a mean
    embedding is never classified.
  - D-12/TRUTH-06: stored probabilities are the model's raw softmax output and
    classification.region is a separate, honest object.
  - D-13: the RESULT item never carries a "visualization" key.
  - D-17: similar_sites entries carry real label provenance.

A packaging test also confirms infrastructure/lambda-packages/classifier.json
bundles the shared members the handler imports.
"""

import importlib.util
import io
import json
import shutil
import zipfile
from decimal import Decimal
from pathlib import Path

import boto3
import numpy as np
import pytest

# Load lambdas/conftest.py by explicit file path (see test_load_lambda.py's own
# comment: a bare `import conftest` collides with scripts/tests/conftest.py's
# cached module name under pytest's collection order).
_LAMBDAS_DIR = Path(__file__).resolve().parent.parent.parent
_REPO_ROOT = _LAMBDAS_DIR.parent
_spec = importlib.util.spec_from_file_location("lambdas_conftest", _LAMBDAS_DIR / "conftest.py")
_lambdas_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_lambdas_conftest)
load_lambda = _lambdas_conftest.load_lambda
write_served_model = _lambdas_conftest.write_served_model
fake_embedding = _lambdas_conftest.fake_embedding
FakeInferenceLambda = _lambdas_conftest.FakeInferenceLambda
prepare_excerpt = _lambdas_conftest.prepare_excerpt
put_binary_segments = _lambdas_conftest.put_binary_segments
TEST_MODEL_VERSION = _lambdas_conftest.TEST_MODEL_VERSION
TEST_DATASET_VERSION = _lambdas_conftest.TEST_DATASET_VERSION
TEST_IDX_TO_LABEL = _lambdas_conftest.TEST_IDX_TO_LABEL

# pytest.ini's `pythonpath = scripts lambdas/shared` puts these on sys.path repo-wide.
import lambda_packaging as pkg  # noqa: E402
import reef_audio  # noqa: E402
import reef_reference  # noqa: E402
import contract_lib  # noqa: E402

AUDIO_BUCKET = "reefradar-2477-audio"
EMBEDDINGS_BUCKET = "reefradar-2477-embeddings"
METADATA_TABLE = "reefradar-2477-metadata"

EMBEDDING_DIM = 1280
IDX_TO_LABEL = TEST_IDX_TO_LABEL

# South Sulawesi, Indonesia -- inside the classifier's real training region.
TEST_LATITUDE = -4.93
TEST_LONGITUDE = 119.32

ANALYSIS_ID = "analysis-1"


@pytest.fixture(scope="module")
def excerpt():
    """The real 30 s MARRS excerpt as six normalised windows (prepared once)."""
    return prepare_excerpt()


def _setup_s3_fixtures(s3):
    s3.create_bucket(Bucket=AUDIO_BUCKET)
    s3.create_bucket(Bucket=EMBEDDINGS_BUCKET)


def _setup_dynamodb_fixture(dynamodb_client):
    dynamodb_client.create_table(
        TableName=METADATA_TABLE,
        KeySchema=[
            {"AttributeName": "pk", "KeyType": "HASH"},
            {"AttributeName": "sk", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


@pytest.fixture
def stamp_file(tmp_path):
    """A tmp version stamp covering the test model and reef_audio.SPEC_VERSION."""
    path = tmp_path / "stamp.json"
    path.write_text(json.dumps({
        "contract_version": 2,
        "dataset_version": TEST_DATASET_VERSION,
        "model_version": TEST_MODEL_VERSION,
        "preprocessing_spec_version": reef_audio.SPEC_VERSION,
    }), encoding="utf-8")
    return path


@pytest.fixture
def served_dir(tmp_path, monkeypatch):
    """Bundled served model for the test; reef_reference reads it instead of the repo model."""
    directory = tmp_path / "bundle"
    config, weights = write_served_model(directory)
    monkeypatch.setattr(reef_reference, "_MODULE_DIR", str(directory))
    return directory, config, weights


@pytest.fixture
def classifier_handler(aws, served_dir, stamp_file):
    s3 = boto3.client("s3", region_name="us-east-1")
    dynamodb_client = boto3.client("dynamodb", region_name="us-east-1")
    _setup_s3_fixtures(s3)
    _setup_dynamodb_fixture(dynamodb_client)

    module = load_lambda("classifier")
    module.lambda_client = FakeInferenceLambda(s3)
    module.get_contract_stamp = lambda: json.loads(stamp_file.read_text(encoding="utf-8"))
    return module


def _put_segments(analysis_id, excerpt, **kwargs):
    s3 = boto3.client("s3", region_name="us-east-1")
    return put_binary_segments(s3, AUDIO_BUCKET, analysis_id, excerpt, **kwargs)


def _event(excerpt, analysis_id=ANALYSIS_ID, upload_id="upload-1", coords=True, **kwargs):
    event = {"upload_id": upload_id, "analysis_id": analysis_id}
    event.update(_put_segments(analysis_id, excerpt, **kwargs))
    if coords:
        event.update({"latitude": TEST_LATITUDE, "longitude": TEST_LONGITUDE})
    return event


def _get_result_item(module, analysis_id):
    table = module.dynamodb.Table(METADATA_TABLE)
    resp = table.get_item(Key={"pk": f"ANALYSIS#{analysis_id}", "sk": "RESULT"})
    return resp["Item"]


def _get_item(module, analysis_id, sk):
    table = module.dynamodb.Table(METADATA_TABLE)
    return table.get_item(Key={"pk": f"ANALYSIS#{analysis_id}", "sk": sk}).get("Item")


def _to_float(value):
    return float(value) if isinstance(value, Decimal) else value


def _expected_window_probabilities(excerpt, weights, idx_to_label):
    """Reference implementation of the per-window forward pass (float64 softmax)."""
    E = np.stack([fake_embedding(w) for w in excerpt.windows])
    h = np.maximum(0, E @ weights["w1"] + weights["b1"])
    h = np.maximum(0, h @ weights["w2"] + weights["b2"])
    logits = (h @ weights["w3"] + weights["b3"]).astype(np.float64)
    e = np.exp(logits - logits.max(axis=1, keepdims=True))
    P = e / e.sum(axis=1, keepdims=True)
    classes = [idx_to_label[str(i)] for i in range(P.shape[1])]
    return E, P, classes


# --- 05-09: per-window pipeline ----------------------------------------------


def test_window_probabilities_and_recording_mean(classifier_handler, served_dir, excerpt):
    _, config, weights = served_dir
    result = classifier_handler.handler(_event(excerpt), context=None)
    assert result["statusCode"] == 200

    item = _get_result_item(classifier_handler, ANALYSIS_ID)
    assert item["status"] == "complete"
    _, P, classes = _expected_window_probabilities(excerpt, weights, config["idx_to_label"])
    assert P.shape == (6, 3)

    windows = item["windows"]
    for k, cls in enumerate(classes):
        stored = np.array([_to_float(v) for v in windows["probabilities"][cls]])
        assert np.allclose(stored, P[:, k], atol=1e-8)
    # Each stored per-window vector sums to 1 within the storage rounding.
    columns = np.array([[_to_float(v) for v in windows["probabilities"][cls]] for cls in classes])
    assert np.allclose(columns.sum(axis=0), 1.0, atol=1e-8)

    classification = item["classification"]
    assert set(classification) == {"label", "confidence", "probabilities", "model_version", "region"}
    means = P.mean(axis=0)
    for k, cls in enumerate(classes):
        assert _to_float(classification["probabilities"][cls]) == pytest.approx(means[k], abs=1e-9)
    assert sum(_to_float(v) for v in classification["probabilities"].values()) == pytest.approx(1.0, abs=1e-8)
    assert classification["label"] == classes[int(np.argmax(means))]
    assert _to_float(classification["confidence"]) == pytest.approx(means.max(), abs=1e-9)
    assert classification["model_version"] == TEST_MODEL_VERSION

    summary = item["embedding_summary"]
    assert summary["aggregation"] == "mean_of_window_probabilities"
    assert summary["num_segments"] == 6
    assert summary["embedding_model"] == "surfperch"
    assert summary["embedding_version"] == "1.0"
    assert summary["synthetic"] is False

    region = classification["region"]
    assert region["coordinates_provided"] is True
    assert region["in_training_region"] is True
    assert region["training_countries"] == ["Indonesia", "Kenya"]
    assert region["in_training_distribution"] == region["in_training_region"]
    assert region["confidence_adjusted"] is False


def test_window_inference_is_called_in_batches_of_at_most_ten(classifier_handler, excerpt):
    classifier_handler.handler(_event(excerpt), context=None)
    assert classifier_handler.lambda_client.batch_sizes == [6]
    assert classifier_handler.BATCH_SIZE == 10


def test_window_no_mean_pooled_embedding_is_classified(classifier_handler, excerpt, monkeypatch):
    seen = []
    original = classifier_handler.classify_windows

    def spy(E, model):
        seen.append(np.asarray(E).shape)
        return original(E, model)

    monkeypatch.setattr(classifier_handler, "classify_windows", spy)
    classifier_handler.handler(_event(excerpt), context=None)
    assert seen == [(6, EMBEDDING_DIM)]


def test_window_block_and_input_audio_validate(classifier_handler, excerpt):
    classifier_handler.handler(_event(excerpt), context=None)
    item = _get_result_item(classifier_handler, ANALYSIS_ID)

    windows = item["windows"]
    assert int(windows["count"]) == 6
    assert _to_float(windows["window_s"]) == 5.0
    assert [int(i) for i in windows["index"]] == list(range(6))
    assert [_to_float(v) for v in windows["start_s"]] == [0.0, 5.0, 10.0, 15.0, 20.0, 25.0]
    assert windows["classes"] == ["degraded", "healthy", "restored_early"]
    assert len(windows["label"]) == 6
    assert all(label in windows["classes"] for label in windows["label"])
    assert [_to_float(v) for v in windows["peak_dbfs"]] == pytest.approx(excerpt.peak_dbfs, abs=1e-8)
    assert [_to_float(v) for v in windows["rms_dbfs"]] == pytest.approx(excerpt.rms_dbfs, abs=1e-8)
    assert windows["silent"] == list(excerpt.silent)

    input_audio = item["input_audio"]
    assert int(input_audio["sample_rate_hz"]) == 16000
    assert int(input_audio["channels"]) == 1
    assert int(input_audio["bits_per_sample"]) == 16
    assert input_audio["encoding"] == "pcm"
    assert _to_float(input_audio["duration_s"]) == 30.0
    assert int(input_audio["windows"]) == 6
    assert _to_float(input_audio["dropped_tail_s"]) == 0.0
    assert input_audio["preprocessing_spec_version"] == reef_audio.SPEC_VERSION

    # Both blocks validate against the 05-06 analysis-result $defs (JSON-plain numbers).
    def plain(obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj == obj.to_integral_value() else float(obj)
        if isinstance(obj, dict):
            return {k: plain(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [plain(v) for v in obj]
        return obj

    contract_lib.validate(
        {
            "contract_version": None, "dataset_version": None,
            "model_version": plain(item["model_version"]), "preprocessing_spec_version": None,
            "windows": plain(windows), "input_audio": plain(input_audio),
        },
        "analysis-result",
    )


def test_window_embeddings_written_to_s3(classifier_handler, excerpt):
    classifier_handler.handler(_event(excerpt), context=None)
    s3 = boto3.client("s3", region_name="us-east-1")
    raw = s3.get_object(Bucket=AUDIO_BUCKET, Key=f"processed/{ANALYSIS_ID}/embeddings.f32")["Body"].read()
    assert len(raw) == 6 * EMBEDDING_DIM * 4
    stored = np.frombuffer(raw, dtype="<f4").reshape(6, EMBEDDING_DIM)
    expected = np.stack([fake_embedding(w) for w in excerpt.windows])
    assert np.array_equal(stored, expected)


def _assert_dynamo_safe(obj, path="item"):
    assert not isinstance(obj, (np.generic, np.ndarray)), f"NumPy value at {path}"
    assert not isinstance(obj, float), f"raw float at {path}"
    if isinstance(obj, Decimal):
        assert obj.is_finite(), f"non-finite Decimal at {path}"
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _assert_dynamo_safe(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _assert_dynamo_safe(v, f"{path}[{i}]")


def test_window_stored_types_are_dynamo_safe(classifier_handler, excerpt):
    classifier_handler.handler(_event(excerpt), context=None)
    _assert_dynamo_safe(_get_result_item(classifier_handler, ANALYSIS_ID))


def test_window_aggregation_label_and_confidence(classifier_handler, served_dir):
    """aggregate_classification: label = argmax of the column means, confidence = their max."""
    _, config, weights = served_dir
    model = reef_reference.load_served_model()
    P = np.array([[0.7, 0.2, 0.1], [0.1, 0.2, 0.7], [0.2, 0.5, 0.3]])
    out = classifier_handler.aggregate_classification(P, model)
    means = P.mean(axis=0)
    # Column means are [0.333, 0.300, 0.367]: the label is the argmax of the MEAN
    # (window 0 alone would say degraded, window 2 alone healthy).
    assert out["label"] == "restored_early"
    assert out["confidence"] == pytest.approx(means.max())
    assert out["probabilities"] == {
        "degraded": pytest.approx(means[0]), "healthy": pytest.approx(means[1]),
        "restored_early": pytest.approx(means[2]),
    }
    assert sum(out["probabilities"].values()) == pytest.approx(1.0)
    assert out["model_version"] == TEST_MODEL_VERSION


def test_window_classify_matches_single_vector_forward_pass(classifier_handler, served_dir):
    model = reef_reference.load_served_model()
    rng = np.random.RandomState(5)
    E = rng.normal(size=(4, EMBEDDING_DIM)).astype(np.float32)
    P = classifier_handler.classify_windows(E, model)
    assert P.shape == (4, 3) and P.dtype == np.float64
    assert np.allclose(P.sum(axis=1), 1.0, atol=1e-12)
    single = classifier_handler.classify_embedding(E[2], model=(model.weights, model.config))
    for k, cls in enumerate(["degraded", "healthy", "restored_early"]):
        assert single["probabilities"][cls] == pytest.approx(P[2, k], abs=1e-6)


def test_window_convert_floats_converts_numpy_and_rejects_non_finite(classifier_handler):
    out = classifier_handler.convert_floats({
        "a": np.float32(0.5), "b": np.int64(3), "c": np.bool_(True), "d": np.array([1.5, 2.5]),
    })
    assert out == {"a": Decimal("0.5"), "b": 3, "c": True, "d": [Decimal("1.5"), Decimal("2.5")]}
    assert type(out["b"]) is int and type(out["c"]) is bool
    for bad in (float("nan"), float("inf"), np.float64("-inf"), [1.0, float("nan")]):
        with pytest.raises(ValueError):
            classifier_handler.convert_floats({"x": bad})


def test_convert_floats_keeps_nine_decimals(classifier_handler):
    assert classifier_handler.convert_floats(0.123456789123) == Decimal("0.123456789")


# --- the served model is bundled, never read from S3 ---------------------------


def test_window_served_model_is_not_read_from_s3(classifier_handler, excerpt):
    """A decoy model in the S3 models/ keys (what the old classifier hot-reloaded) is ignored."""
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.put_object(Bucket=EMBEDDINGS_BUCKET, Key="models/model_config.json",
                  Body=json.dumps({"version": "decoy", "idx_to_label": IDX_TO_LABEL}))
    classifier_handler.handler(_event(excerpt), context=None)
    item = _get_result_item(classifier_handler, ANALYSIS_ID)
    assert item["model_version"] == TEST_MODEL_VERSION
    assert not hasattr(classifier_handler, "load_classifier_model")


@pytest.mark.parametrize("model_dir", ["models/interim-real-only", "models"])
def test_validate_model_accepts_published_and_archived_models(classifier_handler, model_dir):
    base = _REPO_ROOT / model_dir
    if not (base / "model_config.json").exists():
        pytest.skip(f"{model_dir}/model_config.json not present in this checkout")
    config = json.loads((base / "model_config.json").read_text(encoding="utf-8"))
    with np.load(base / "reef_classifier_weights.npz") as npz:
        weights = {k: npz[k] for k in npz.files}
    classifier_handler.validate_model(weights, config)


def test_validate_model_rejects_class_count_mismatch(classifier_handler, served_dir):
    _, config, weights = served_dir
    config = dict(config)
    config["idx_to_label"] = {"0": "degraded", "1": "healthy", "2": "restored_early", "3": "restored_mid"}
    config["num_classes"] = 4
    with pytest.raises(ValueError):
        classifier_handler.validate_model(weights, config)


def test_validate_model_rejects_missing_label_map(classifier_handler, served_dir):
    _, config, weights = served_dir
    config = {k: v for k, v in config.items() if k != "idx_to_label"}
    with pytest.raises(ValueError):
        classifier_handler.validate_model(weights, config)


# --- end to end behaviour kept from earlier plans -----------------------------


def test_handler_end_to_end_no_coordinates(classifier_handler, excerpt):
    result = classifier_handler.handler(_event(excerpt, analysis_id="analysis-2", coords=False), context=None)
    assert result["statusCode"] == 200
    item = _get_result_item(classifier_handler, "analysis-2")
    probabilities = {k: _to_float(v) for k, v in item["classification"]["probabilities"].items()}
    assert sum(probabilities.values()) == pytest.approx(1.0, abs=1e-8)
    region = item["classification"]["region"]
    assert region["coordinates_provided"] is False
    assert region["in_training_region"] is False


def test_handler_no_visualization_and_similar_sites_carry_label_provenance(classifier_handler, excerpt):
    result = classifier_handler.handler(_event(excerpt, analysis_id="analysis-3"), context=None)
    assert result["statusCode"] == 200
    item = _get_result_item(classifier_handler, "analysis-3")

    # D-13: the half-vector-mean "embedding space" projection is gone.
    assert "visualization" not in item
    assert not hasattr(classifier_handler, "generate_visualization")

    # D-17: every similar_sites entry states who assigned its label, from the contract sites.
    contract_sites = json.loads(
        (_REPO_ROOT / "contracts" / "bucket" / "v1" / "sites.json").read_text(encoding="utf-8")
    )["sites"]
    by_id = {s["site_id"]: s for s in contract_sites}
    assert len(item["similar_sites"]) == 3
    for entry in item["similar_sites"]:
        site = by_id[entry["site_id"]]
        assert entry["label_source"] == site["dataset_id"]
        assert entry["label_source_name"] == site["label_source_name"]
        assert entry["label_original"] == site["label_original"]
        assert entry["status"] == site["status"]


# --- Packaging: classifier.json bundles the shared members -------------------


def test_classifier_package_includes_shared_members():
    spec = pkg.load_spec("classifier")
    zip_bytes = pkg.build_package(spec, _REPO_ROOT)
    manifest = pkg.manifest_from_zip(zip_bytes)
    assert set(manifest) == {
        "handler.py",
        "region_detection.py",
        "contract_stamp.py",
        "contract_stamp.json",
        "contract_manifest.json",
        "reef_audio.py",
        "reef_reference.py",
        "reference_embeddings.f32",
        "reference_sites.json",
        "reference_projection.json",
        "ood_reference.json",
        "ood_reference.f32",
        "served_model_config.json",
        "served_model_weights.npz",
    }
    # CONTRACT-04: the packaged stamp is the committed contracts/bucket/v2/stamp.json
    # (LF-normalised, so the package is identical on Windows and Linux checkouts).
    # The byte-level checks of every bundled member live in test_bundled_e2e.py.
    committed = (_REPO_ROOT / "contracts" / "bucket" / "v2" / "stamp.json").read_bytes()
    committed = committed.replace(b"\r\n", b"\n")
    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    assert zf.read("contract_stamp.json") == committed


# --- stamping (CONTRACT-04, extended in 05-09) --------------------------------


def test_stamp_covered_requires_spec_match(classifier_handler, excerpt):
    result = classifier_handler.handler(_event(excerpt, analysis_id="analysis-st"), context=None)
    assert result["statusCode"] == 200
    item = _get_result_item(classifier_handler, "analysis-st")
    assert item["stamp_status"] == "stamped"
    assert int(item["contract_version"]) == 2
    assert item["dataset_version"] == TEST_DATASET_VERSION
    assert item["model_version"] == TEST_MODEL_VERSION
    assert item["preprocessing_spec_version"] == reef_audio.SPEC_VERSION


def test_stamp_for_another_model_is_nulled_but_keeps_the_running_model(classifier_handler, excerpt, stamp_file):
    stamp = json.loads(stamp_file.read_text(encoding="utf-8"))
    stamp["model_version"] = "some-other-model"
    classifier_handler.get_contract_stamp = lambda: stamp
    classifier_handler.handler(_event(excerpt, analysis_id="analysis-s1"), context=None)
    item = _get_result_item(classifier_handler, "analysis-s1")
    assert item["model_version"] == TEST_MODEL_VERSION
    assert item["contract_version"] is None
    assert item["dataset_version"] is None
    assert item["preprocessing_spec_version"] is None
    assert item["stamp_status"] == "uncovered"


def test_stamp_v1_stamp_no_longer_covers_new_results(classifier_handler, excerpt, capsys):
    """The committed v1 stamp names the as-deployed preprocessing spec, so a result
    produced by reef_audio is 'uncovered' (05-15 bundles the v2 stamp)."""
    v1 = json.loads((_REPO_ROOT / "contracts" / "bucket" / "v1" / "stamp.json").read_text(encoding="utf-8"))
    classifier_handler.get_contract_stamp = lambda: v1
    out = classifier_handler.result_version_stamp(v1["model_version"], reef_audio.SPEC_VERSION)
    assert out["stamp_status"] == "uncovered"
    assert out["contract_version"] is None
    assert out["model_version"] == v1["model_version"]
    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.startswith("{")]
    assert lines and lines[-1]["UnstampedResults"] == 1 and lines[-1]["Status"] == "uncovered"


def test_unloadable_stamp_writes_nulls_and_does_not_fail_the_analysis(classifier_handler, excerpt):
    def _broken():
        raise FileNotFoundError("contract_stamp.json missing")

    classifier_handler.get_contract_stamp = _broken
    result = classifier_handler.handler(_event(excerpt, analysis_id="analysis-s2"), context=None)
    assert result["statusCode"] == 200
    item = _get_result_item(classifier_handler, "analysis-s2")
    for key in ("contract_version", "dataset_version", "preprocessing_spec_version"):
        assert item[key] is None
    assert item["model_version"] == TEST_MODEL_VERSION
    assert item["stamp_status"] == "load_failed"


def test_unstamped_outcomes_emit_a_cloudwatch_metric(classifier_handler, capsys):
    def _broken():
        raise FileNotFoundError("contract_stamp.json missing")

    classifier_handler.get_contract_stamp = _broken
    out = classifier_handler.result_version_stamp("some-model")
    assert out["stamp_status"] == "load_failed"
    assert out["model_version"] == "some-model"
    emitted = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.startswith("{")]
    assert emitted and emitted[0]["Status"] == "load_failed"
    assert emitted[0]["_aws"]["CloudWatchMetrics"][0]["Metrics"][0]["Name"] == "UnstampedResults"


# --- 05-09 Task 2: legacy refusal, integrity, alignment ------------------------


def _put_legacy_segments(analysis_id, n=2):
    s3 = boto3.client("s3", region_name="us-east-1")
    key = f"segments/{analysis_id}.json"
    rows = [[0.0] * reef_audio.WINDOW_SAMPLES for _ in range(n)]
    s3.put_object(Bucket=AUDIO_BUCKET, Key=key, Body=json.dumps({"segments": rows, "sample_rate": 32000}))
    return key


def test_segment_format_legacy_json_refused(classifier_handler):
    key = _put_legacy_segments("analysis-leg")
    calls = []
    classifier_handler.lambda_client = type("L", (), {"invoke": lambda self, **k: calls.append(k)})()
    event = {"upload_id": "upload-leg", "analysis_id": "analysis-leg", "segments_key": key, "num_segments": 2}
    info = classifier_handler.read_segment_info(event)
    assert info["spec_version"] == classifier_handler.LEGACY_PREPROCESSING_SPEC_VERSION
    assert info["spec_version"] == "preproc-2026.10.0-as-deployed"

    result = classifier_handler.handler(event, context=None)
    assert result["statusCode"] == 500
    assert calls == []  # no inference call
    err = _get_item(classifier_handler, "analysis-leg", "ERROR")
    assert err["error_code"] == "PREPROCESSING_SPEC_MISMATCH"
    assert err["stage"] == "classification"
    assert "start the analysis again" in err["suggestion"]
    assert _get_item(classifier_handler, "analysis-leg", "RESULT") is None


def test_segment_format_spec_mismatch_refused(classifier_handler, excerpt, served_dir, monkeypatch):
    directory, _, _ = served_dir
    write_served_model(directory, spec_version="preproc-trained-elsewhere")
    result = classifier_handler.handler(_event(excerpt, analysis_id="analysis-sm"), context=None)
    assert result["statusCode"] == 500
    assert classifier_handler.lambda_client.batch_sizes == []
    err = _get_item(classifier_handler, "analysis-sm", "ERROR")
    assert err["error_code"] == "PREPROCESSING_SPEC_MISMATCH"
    assert _get_item(classifier_handler, "analysis-sm", "RESULT") is None


@pytest.mark.parametrize("tamper", ["flip", "truncate"])
def test_segment_format_integrity_errors(classifier_handler, excerpt, tamper):
    event = _event(excerpt, analysis_id=f"analysis-i-{tamper}", tamper=tamper)
    result = classifier_handler.handler(event, context=None)
    assert result["statusCode"] == 500
    err = _get_item(classifier_handler, f"analysis-i-{tamper}", "ERROR")
    assert err["error_code"] == "SEGMENTS_INTEGRITY"
    assert err["stage"] == "classification"
    assert _get_item(classifier_handler, f"analysis-i-{tamper}", "RESULT") is None


def test_segment_format_event_count_must_match_the_sidecar(classifier_handler, excerpt):
    event = _event(excerpt, analysis_id="analysis-cnt")
    event["num_segments"] = 5
    assert classifier_handler.handler(event, context=None)["statusCode"] == 500
    assert _get_item(classifier_handler, "analysis-cnt", "ERROR")["error_code"] == "SEGMENTS_INTEGRITY"


def test_segment_batches_are_ranged_reads_of_at_most_ten_windows(classifier_handler, excerpt):
    """read_segment_batches yields (start, float32 array) and equals the source windows."""
    event = _event(excerpt, analysis_id="analysis-rng")
    batches = list(classifier_handler.read_segment_batches(event))
    assert [start for start, _ in batches] == [0]
    assert np.array_equal(np.concatenate([b for _, b in batches]), excerpt.windows)

    classifier_handler.BATCH_SIZE = 4
    batches = list(classifier_handler.read_segment_batches(event))
    assert [(start, b.shape[0]) for start, b in batches] == [(0, 4), (4, 2)]
    assert all(b.dtype == np.float32 for _, b in batches)


@pytest.mark.parametrize("mode", ["short", "long", "wrong_length", "nan"])
def test_alignment_short_long_nonfinite_batches(classifier_handler, excerpt, mode):
    s3 = boto3.client("s3", region_name="us-east-1")
    classifier_handler.lambda_client = FakeInferenceLambda(s3, mode=mode)
    aid = f"analysis-al-{mode}"
    result = classifier_handler.handler(_event(excerpt, analysis_id=aid), context=None)
    assert result["statusCode"] == 500
    err = _get_item(classifier_handler, aid, "ERROR")
    assert err["error_code"] == "EMBEDDING_MISMATCH"
    assert err["stage"] == "inference"
    assert _get_item(classifier_handler, aid, "RESULT") is None
    assert classifier_handler.get_error_suggestion("EMBEDDING_MISMATCH") != \
        classifier_handler.get_error_suggestion("SOMETHING_UNKNOWN")


def test_alignment_mismatch_is_not_retried(classifier_handler, excerpt):
    s3 = boto3.client("s3", region_name="us-east-1")
    fake = FakeInferenceLambda(s3, mode="short")
    classifier_handler.lambda_client = fake
    classifier_handler.handler(_event(excerpt, analysis_id="analysis-nr"), context=None)
    assert len(fake.batch_sizes) == 1


# --- WR-03: one authoritative outcome, no async-retry fighting the UI ---------


def test_inference_failure_records_error_and_returns_normally(classifier_handler, excerpt):
    def _failing(*args, **kwargs):
        raise classifier_handler.InferenceError(
            "boom", error_type="TIMEOUT", retry_count=3, request_id="req-1"
        )

    classifier_handler.invoke_inference_batch = _failing
    result = classifier_handler.handler(_event(excerpt, analysis_id="analysis-f1"), context=None)
    # Must NOT raise: raising would trigger Lambda's async retries.
    assert result["statusCode"] == 500

    err = _get_item(classifier_handler, "analysis-f1", "ERROR")
    assert err["error_code"] == "TIMEOUT"
    assert err["stage"] == "inference"
    assert err["request_id"] == "req-1"
    assert _get_item(classifier_handler, "analysis-f1", "RESULT") is None


def test_unexpected_failure_records_error_and_returns_normally(classifier_handler):
    event = {
        "upload_id": "upload-f2",
        "analysis_id": "analysis-f2",
        "segments_key": "segments/does-not-exist.f32",
        "num_segments": 2,
        "segments_format": "f32le",
        "preprocessing_key": "segments/does-not-exist.json",
    }
    result = classifier_handler.handler(event, context=None)
    assert result["statusCode"] == 500
    err = _get_item(classifier_handler, "analysis-f2", "ERROR")
    assert err["error_code"] == "CLASSIFICATION_FAILED"
    assert err["stage"] == "classification"


def test_duplicate_delivery_does_not_redo_work_or_overwrite_result(classifier_handler, excerpt):
    event = _event(excerpt, analysis_id="analysis-d1")
    assert classifier_handler.handler(event, context=None)["statusCode"] == 200
    first = _get_item(classifier_handler, "analysis-d1", "RESULT")

    class _MustNotRun:
        def invoke(self, **kwargs):
            raise AssertionError("inference must not run for a duplicate delivery")

    classifier_handler.lambda_client = _MustNotRun()
    result = classifier_handler.handler(event, context=None)
    assert result["statusCode"] == 200
    assert _get_item(classifier_handler, "analysis-d1", "RESULT") == first
    assert _get_item(classifier_handler, "analysis-d1", "ERROR") is None


def test_stale_preprocessor_error_does_not_block_classification(classifier_handler, excerpt):
    """REVIEW iter-2 WR-01: a preprocessor ERROR (no 'stage') from a failed first
    attempt that a Lambda async retry then recovered must not wedge the analysis."""
    table = classifier_handler.dynamodb.Table(METADATA_TABLE)
    table.put_item(Item={
        "pk": "ANALYSIS#analysis-s1", "sk": "ERROR",
        "error_code": "PROCESSING_FAILED", "status": "failed",
    })
    assert classifier_handler.handler(_event(excerpt, analysis_id="analysis-s1"), context=None)["statusCode"] == 200
    assert _get_item(classifier_handler, "analysis-s1", "RESULT") is not None
    assert _get_item(classifier_handler, "analysis-s1", "ERROR") is None


def test_classifier_error_supersedes_stale_preprocessor_error(classifier_handler):
    table = classifier_handler.dynamodb.Table(METADATA_TABLE)
    table.put_item(Item={
        "pk": "ANALYSIS#analysis-s2", "sk": "ERROR",
        "error_code": "PROCESSING_FAILED", "status": "failed",
    })
    classifier_handler._record_failure(
        table, "analysis-s2", "upload-s2",
        {"error_code": "TIMEOUT", "error": "boom", "stage": "inference"},
    )
    err = _get_item(classifier_handler, "analysis-s2", "ERROR")
    assert err["error_code"] == "TIMEOUT"
    assert err["stage"] == "inference"
    # ... and a second classifier failure keeps the first terminal outcome.
    classifier_handler._record_failure(
        table, "analysis-s2", "upload-s2",
        {"error_code": "OTHER", "error": "later", "stage": "classification"},
    )
    assert _get_item(classifier_handler, "analysis-s2", "ERROR")["error_code"] == "TIMEOUT"


def test_idempotency_guard_read_failure_is_recorded_not_raised(classifier_handler, monkeypatch, excerpt):
    def _boom(table, analysis_id):
        raise RuntimeError("dynamodb unavailable")

    monkeypatch.setattr(classifier_handler, "_terminal_outcome_exists", _boom)
    result = classifier_handler.handler(_event(excerpt, analysis_id="analysis-s3"), context=None)
    assert result["statusCode"] == 500
    err = _get_item(classifier_handler, "analysis-s3", "ERROR")
    assert err["error_code"] == "CLASSIFICATION_FAILED"


def test_late_failure_never_contradicts_stored_result(classifier_handler):
    table = classifier_handler.dynamodb.Table(METADATA_TABLE)
    table.put_item(Item={"pk": "ANALYSIS#analysis-l1", "sk": "RESULT", "status": "complete"})
    out = classifier_handler._record_failure(
        table, "analysis-l1", "upload-l1", {"error_code": "X", "error": "late", "stage": "inference"}
    )
    assert out["statusCode"] == 200
    assert _get_item(classifier_handler, "analysis-l1", "ERROR") is None


# --- WR-05: similar-site lookup is honest about failure ----------------------


def test_similar_sites_reports_reason_when_reference_cannot_load(classifier_handler, monkeypatch, tmp_path):
    monkeypatch.setattr(reef_reference, "REPO_CONTRACT_MANIFEST", str(tmp_path / "missing" / "v1.json"))
    out = classifier_handler.compute_similarity_context(np.ones((2, EMBEDDING_DIM)))
    assert out["similar_sites"] == []
    assert "could not be loaded" in out["similar_sites_error"]
    assert out["site_similarities"] is None


def test_similar_sites_reports_reason_when_reference_is_tampered(classifier_handler, monkeypatch, tmp_path):
    bucket = tmp_path / "bucket"
    shutil.copytree(_REPO_ROOT / "contracts" / "bucket", bucket)
    target = bucket / "v1" / "embeddings.f32"
    raw = bytearray(target.read_bytes())
    raw[100] ^= 0x01
    target.write_bytes(bytes(raw))
    monkeypatch.setattr(reef_reference, "REPO_CONTRACT_MANIFEST", str(bucket / "contract" / "v1.json"))
    out = classifier_handler.compute_similarity_context(np.ones((2, EMBEDDING_DIM)))
    assert out["similar_sites"] == []
    assert "unavailable" in out["similar_sites_error"]


def test_similar_sites_compare_every_window_without_pooling(classifier_handler):
    out = classifier_handler.compute_similarity_context(np.ones((3, EMBEDDING_DIM)))
    assert out["similar_sites_error"] is None
    assert len(out["similar_sites"]) == 3
    assert out["window_similarities"].shape == (3, 48)


def test_handler_does_not_read_reference_data_from_s3(classifier_handler, excerpt):
    # The classifier bucket holds no reference objects at all; the analysis still gets its context.
    s3 = boto3.client("s3", region_name="us-east-1")
    assert "Contents" not in s3.list_objects_v2(Bucket=EMBEDDINGS_BUCKET, Prefix="reference/")
    assert classifier_handler.handler(_event(excerpt, analysis_id="analysis-s1"), context=None)["statusCode"] == 200
    item = _get_result_item(classifier_handler, "analysis-s1")
    assert len(item["similar_sites"]) == 3
    assert "similar_sites_error" not in item


def test_handler_stores_similar_sites_error_note(classifier_handler, excerpt, monkeypatch, tmp_path):
    monkeypatch.setattr(reef_reference, "REPO_CONTRACT_MANIFEST", str(tmp_path / "missing" / "v1.json"))
    assert classifier_handler.handler(_event(excerpt, analysis_id="analysis-s2"), context=None)["statusCode"] == 200
    item = _get_result_item(classifier_handler, "analysis-s2")
    assert item["similar_sites"] == []
    assert "unavailable" in item["similar_sites_error"]


# --- WR-06: structured inference error types ---------------------------------


class _FakeLambdaClient:
    def __init__(self, exc):
        self.exc = exc
        self.calls = 0

    def invoke(self, **kwargs):
        self.calls += 1
        raise self.exc


def _client_error(code):
    from botocore.exceptions import ClientError
    return ClientError({"Error": {"Code": code, "Message": "x"}}, "Invoke")


def _run_batch(module, exc, monkeypatch):
    fake = _FakeLambdaClient(exc)
    module.lambda_client = fake
    sleeps = []
    monkeypatch.setattr(module.time, "sleep", lambda d: sleeps.append(d))
    with pytest.raises(module.InferenceError) as info:
        module.invoke_inference_batch("b", "k", 0, 1, "req")
    return info.value, fake, sleeps


def test_lambda_not_found_keeps_its_error_type_and_is_not_retried(classifier_handler, monkeypatch):
    err, fake, sleeps = _run_batch(classifier_handler, _client_error("ResourceNotFoundException"), monkeypatch)
    assert err.error_type == "LAMBDA_NOT_FOUND"
    assert fake.calls == 1
    assert sleeps == []
    assert "not deployed" in classifier_handler.get_error_suggestion(err.error_type)


def test_throttling_retries_with_longer_backoff(classifier_handler, monkeypatch):
    err, fake, sleeps = _run_batch(classifier_handler, _client_error("TooManyRequestsException"), monkeypatch)
    assert err.error_type == "THROTTLED"
    assert fake.calls == classifier_handler.MAX_RETRIES
    assert len(sleeps) == classifier_handler.MAX_RETRIES - 1
    assert all(d >= classifier_handler.THROTTLE_RETRY_DELAYS[i] for i, d in enumerate(sleeps))


def test_message_text_does_not_decide_the_error_type(classifier_handler, monkeypatch):
    err, _, _ = _run_batch(classifier_handler, RuntimeError("the word timeout appears here"), monkeypatch)
    assert err.error_type == "INFERENCE_FAILED"


def test_read_timeout_is_classified_as_timeout(classifier_handler, monkeypatch):
    from botocore.exceptions import ReadTimeoutError
    exc = ReadTimeoutError(endpoint_url="https://lambda.example")
    err, _, _ = _run_batch(classifier_handler, exc, monkeypatch)
    assert err.error_type == "TIMEOUT"


# --- WR-08: stored probabilities keep the "sums to 1" property ----------------


def test_stored_probabilities_sum_to_one_within_1e8(classifier_handler, excerpt):
    assert classifier_handler.handler(_event(excerpt, analysis_id="analysis-p1"), context=None)["statusCode"] == 200
    item = _get_result_item(classifier_handler, "analysis-p1")
    probs = [_to_float(v) for v in item["classification"]["probabilities"].values()]
    assert sum(probs) == pytest.approx(1.0, abs=1e-8)
