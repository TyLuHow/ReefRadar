"""
Per-analysis context for the classifier (plan 05-10): all-site similarity with
ranks, the unchanged legacy top-3, the PCA projection and the acoustic OOD flag,
all computed from contract data bundled with the classifier and verified by hash.

Everything runs under moto with the stubbed inference Lambda from
lambdas/conftest.py. The reference set is the committed contract v1 (repo mode);
tests that need an OOD reference write a tmp contract bucket beside it.
"""

import hashlib
import importlib.util
import json
from decimal import Decimal
from pathlib import Path

import boto3
import numpy as np
import pytest

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

import reef_audio  # noqa: E402
import reef_reference  # noqa: E402
import site_provenance  # noqa: E402

AUDIO_BUCKET = "reefradar-2477-audio"
EMBEDDINGS_BUCKET = "reefradar-2477-embeddings"
METADATA_TABLE = "reefradar-2477-metadata"

BUCKET = _REPO_ROOT / "contracts" / "bucket"
V1_MANIFEST = BUCKET / "contract" / "v1.json"
LOCATION_ONLY = ["ken_D3", "irma_eastern_sambo", "sanctsound_fk01", "sanctsound_fk02", "sanctsound_fk03", "sanctsound_fk04"]
LEGACY_ENTRY_KEYS = {"site_id", "similarity", "country", "status", "label_source", "label_source_name", "label_original"}


def _v1():
    manifest = json.loads(V1_MANIFEST.read_text(encoding="utf-8"))
    emb = manifest["artifacts"]["embeddings"]
    matrix = np.frombuffer((BUCKET / emb["uri"]).read_bytes(), dtype="<f4").reshape(emb["count"], emb["dim"])
    return manifest, emb["row_site_ids"], matrix.astype(np.float64)


@pytest.fixture(scope="module")
def excerpt():
    return prepare_excerpt()


@pytest.fixture
def stamp_file(tmp_path):
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
    directory = tmp_path / "bundle"
    config, weights = write_served_model(directory)
    monkeypatch.setattr(reef_reference, "_MODULE_DIR", str(directory))
    return directory, config, weights


@pytest.fixture
def classifier_handler(aws, served_dir, stamp_file, monkeypatch):
    # These tests are written against the contract v1 reference set (no OOD artifact); the repo
    # default moved to contract v2 in 05-15, and test_bundled_e2e.py covers the v2 package.
    monkeypatch.setattr(reef_reference, "REPO_CONTRACT_MANIFEST", str(V1_MANIFEST))
    s3 = boto3.client("s3", region_name="us-east-1")
    dynamodb_client = boto3.client("dynamodb", region_name="us-east-1")
    s3.create_bucket(Bucket=AUDIO_BUCKET)
    s3.create_bucket(Bucket=EMBEDDINGS_BUCKET)
    dynamodb_client.create_table(
        TableName=METADATA_TABLE,
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    module = load_lambda("classifier")
    module.lambda_client = FakeInferenceLambda(s3)
    module.get_contract_stamp = lambda: json.loads(stamp_file.read_text(encoding="utf-8"))
    return module


def _run(module, excerpt, analysis_id):
    s3 = boto3.client("s3", region_name="us-east-1")
    event = {"upload_id": f"upload-{analysis_id}", "analysis_id": analysis_id,
             "latitude": -4.93, "longitude": 119.32}
    event.update(put_binary_segments(s3, AUDIO_BUCKET, analysis_id, excerpt))
    assert module.handler(event, context=None)["statusCode"] == 200
    table = module.dynamodb.Table(METADATA_TABLE)
    return table.get_item(Key={"pk": f"ANALYSIS#{analysis_id}", "sk": "RESULT"})["Item"]


def _f(value):
    return float(value) if isinstance(value, Decimal) else value


def _window_embeddings(excerpt):
    return np.stack([fake_embedding(w) for w in excerpt.windows]).astype(np.float64)


def _cosines(E, R):
    En = E / np.linalg.norm(E, axis=1, keepdims=True)
    Rn = R / np.linalg.norm(R, axis=1, keepdims=True)
    return En @ Rn.T


# --- similarity to all acoustic-reference sites -------------------------------


def test_similarity_all_sites_in_row_order(classifier_handler, excerpt):
    manifest, row_ids, R = _v1()
    item = _run(classifier_handler, excerpt, "ctx-all")
    ss = item["site_similarities"]
    assert ss["metric"] == "cosine"
    assert ss["aggregation"] == "mean_of_window_cosines"
    assert int(ss["contract_version"]) == manifest["contract_version"]
    assert ss["dataset_version"] == manifest["dataset_version"]
    assert ss["site_order"] == row_ids
    assert len(ss["sites"]) == 54

    S = _cosines(_window_embeddings(excerpt), R)
    expected = S.mean(axis=0)
    acoustic = ss["sites"][:48]
    assert [s["site_id"] for s in acoustic] == row_ids
    assert all(s["has_embedding"] is True for s in acoustic)
    for i, entry in enumerate(acoustic):
        assert _f(entry["similarity"]) == pytest.approx(expected[i], abs=1e-8)

    # rank 1..48 by descending similarity, ties broken by row order
    order = sorted(range(48), key=lambda i: (-_f(acoustic[i]["similarity"]), i))
    for position, i in enumerate(order):
        assert int(acoustic[i]["rank"]) == position + 1
    assert sorted(int(s["rank"]) for s in acoustic) == list(range(1, 49))
    assert "earlier preprocessing" in ss["note"]


def test_similarity_location_only_listed_without_embedding(classifier_handler, excerpt):
    item = _run(classifier_handler, excerpt, "ctx-loc")
    tail = item["site_similarities"]["sites"][48:]
    assert [s["site_id"] for s in tail] == LOCATION_ONLY
    for entry in tail:
        assert entry["has_embedding"] is False
        assert entry["similarity"] is None
        assert entry["rank"] is None
    assert not set(LOCATION_ONLY) & set(item["site_similarities"]["site_order"])


def test_similarity_window_rows_and_nearest_site(classifier_handler, excerpt):
    _, row_ids, R = _v1()
    item = _run(classifier_handler, excerpt, "ctx-win")
    windows = item["windows"]
    S = _cosines(_window_embeddings(excerpt), R)
    n = excerpt.windows.shape[0]
    assert len(windows["similarities"]) == n
    for j in range(n):
        row = [_f(v) for v in windows["similarities"][j]]
        assert len(row) == 48
        assert row == pytest.approx(list(S[j]), abs=1e-8)
    assert windows["nearest_site"] == [row_ids[int(k)] for k in S.argmax(axis=1)]


def test_similarity_top3_legacy_shape_for_all_48_sites(classifier_handler, excerpt):
    ref = reef_reference.load_reference_set()
    prov = site_provenance.load_provenance()
    snapshot = {
        s["site_id"]: s
        for s in json.loads((_REPO_ROOT / "data" / "snapshots" / "api-sites.json").read_text(encoding="utf-8"))["sites"]
    }
    for i, site_id in enumerate(ref.row_site_ids):
        scores = np.zeros(48)
        scores[i] = 0.9
        entry = classifier_handler.top3_similar_sites(scores, ref)[0]
        labeled = site_provenance.apply_label_provenance(
            {"site_id": site_id, "status": snapshot[site_id]["status"]}, prov
        )
        assert set(entry) == LEGACY_ENTRY_KEYS
        assert entry["site_id"] == site_id
        assert entry["similarity"] == pytest.approx(0.9)
        assert entry["country"] == snapshot[site_id]["country"]
        assert entry["status"] == labeled["status"]
        assert entry["label_source"] == labeled["label_source"]
        assert entry["label_source_name"] == labeled["label_source_name"]
        assert entry["label_original"] == labeled["label_original"]

    # the stored top-3 are exactly the rank 1..3 sites, in the old entry shape
    item = _run(classifier_handler, excerpt, "ctx-top3")
    top = item["similar_sites"]
    assert len(top) == 3
    assert all(set(e) == LEGACY_ENTRY_KEYS for e in top)
    ranked = sorted(item["site_similarities"]["sites"][:48], key=lambda s: int(s["rank"]))
    assert [e["site_id"] for e in top] == [s["site_id"] for s in ranked[:3]]
    assert [_f(e["similarity"]) for e in top] == pytest.approx([_f(s["similarity"]) for s in ranked[:3]], abs=1e-8)
    assert "visualization" not in item
    assert "similar_sites_error" not in item


def test_similarity_unavailable_keeps_classification(classifier_handler, excerpt, monkeypatch, tmp_path):
    base = _run(classifier_handler, excerpt, "ctx-ok")
    assert base["similar_sites"]

    classifier_handler._reference_set = None
    monkeypatch.setattr(reef_reference, "REPO_CONTRACT_MANIFEST", str(tmp_path / "missing" / "v1.json"))
    item = _run(classifier_handler, excerpt, "ctx-gone")
    assert item["similar_sites"] == []
    assert "unavailable" in item["similar_sites_error"]
    assert "site_similarities" not in item
    assert "projection" not in item
    assert "similarities" not in item["windows"]
    assert "nearest_site" not in item["windows"]
    assert item["classification"]["label"] == base["classification"]["label"]
    assert item["classification"]["probabilities"] == base["classification"]["probabilities"]
    assert item["windows"]["probabilities"] == base["windows"]["probabilities"]


# --- projection ---------------------------------------------------------------------

import contract_lib  # noqa: E402

write_ood_contract = _lambdas_conftest.write_ood_contract
PCA_ATOL = 2e-6


def _plain(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    if isinstance(obj, dict):
        return {k: _plain(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_plain(v) for v in obj]
    return obj


def test_projection_block_and_reference_round_trip(classifier_handler, excerpt):
    ref = reef_reference.load_reference_set()
    projection_doc = json.loads((BUCKET / "v1" / "projection.json").read_text(encoding="utf-8"))

    # Projecting a reference site's own vector reproduces its published coordinates.
    for i, site_id in enumerate(ref.row_site_ids):
        block = classifier_handler.build_projection_block(ref.matrix[i:i + 1], ref)
        published = ref.sites[site_id]["projection"]
        x, y = block["windows"][0]
        assert abs(x - published["x"]) <= PCA_ATOL, site_id
        assert abs(y - published["y"]) <= PCA_ATOL, site_id

    item = _run(classifier_handler, excerpt, "ctx-proj")
    block = item["projection"]
    assert block["method"] == "pca"
    assert int(block["contract_version"]) == 1
    assert block["basis_uri"] == "v1/projection.json"
    assert [_f(v) for v in block["explained_variance_ratio"]] == pytest.approx(
        projection_doc["explained_variance_ratio"], abs=1e-9
    )
    assert block["note"] == projection_doc["note"]
    assert "33.0%" in block["note"]

    E = _window_embeddings(excerpt)
    mean = np.asarray(projection_doc["mean"], dtype=np.float64)
    components = np.asarray(projection_doc["components"], dtype=np.float64)
    expected = (E - mean) @ components.T
    got = np.array([[_f(v) for v in row] for row in block["windows"]])
    assert got.shape == (6, 2)
    assert got == pytest.approx(expected, abs=1e-8)
    assert [_f(v) for v in block["centroid"]] == pytest.approx(list(expected.mean(axis=0)), abs=1e-8)
    assert "visualization" not in item


# --- acoustic OOD ---------------------------------------------------------------------


def _ood_rows(excerpt, extra=97, seed=11):
    """Training rows holding the first three windows exactly, then deterministic random vectors."""
    E = np.stack([fake_embedding(w) for w in excerpt.windows])
    rng = np.random.RandomState(seed)
    return np.vstack([E[:3], rng.normal(size=(extra, 1280)).astype(np.float32)])


def _with_ood(monkeypatch, handler, tmp_path, rows, threshold=0.5):
    manifest = write_ood_contract(tmp_path, rows, threshold=threshold)
    handler._reference_set = None
    handler._ood_reference = None
    monkeypatch.setattr(reef_reference, "REPO_CONTRACT_MANIFEST", str(manifest))
    return manifest


def test_ood_distance_threshold_and_summary(classifier_handler, excerpt, monkeypatch, tmp_path):
    rows = _ood_rows(excerpt)
    _with_ood(monkeypatch, classifier_handler, tmp_path, rows, threshold=0.5)
    item = _run(classifier_handler, excerpt, "ctx-ood")
    ood = item["ood"]

    assert ood["metric"] == "cosine_distance_to_nearest_training_window"
    assert int(ood["k"]) == 1
    assert _f(ood["threshold"]) == 0.5
    assert ood["reference_version"] == "ood-test-nn1-cosine"

    assert ood["reference_sha256"] == hashlib.sha256(np.ascontiguousarray(rows, dtype="<f4").tobytes()).hexdigest()

    E = _window_embeddings(excerpt)
    cos = _cosines(E, rows.astype(np.float64))
    expected = np.maximum(0.0, 1.0 - cos.max(axis=1))
    distance = [_f(v) for v in ood["windows"]["distance"]]
    assert distance == pytest.approx(list(expected), abs=1e-8)
    assert ood["windows"]["status"] == ["inside"] * 3 + ["outside"] * 3
    assert ood["windows"]["status"] == ["outside" if d > 0.5 else "inside" for d in distance]
    assert int(ood["summary"]["windows_outside"]) == 3
    assert int(ood["summary"]["windows_total"]) == 6
    assert ood["summary"]["statement"] == "3 of 6 windows are outside the training data"
    assert "never changes or withholds" in ood["note"]
    assert "100 training windows" in ood["note"]


def test_ood_status_is_outside_only_when_distance_exceeds_the_threshold(classifier_handler):
    rng = np.random.RandomState(5)
    rows = rng.normal(size=(10, 1280)).astype(np.float32)
    windows = rng.normal(size=(4, 1280)).astype(np.float32)
    probe = classifier_handler.build_ood_block(
        windows, reef_reference.OodReference("v", 0.5, "cosine_distance", 1, rows, "0" * 64, ["s"] * 10)
    )
    distances = probe["windows"]["distance"]
    # A threshold equal to a window's own distance leaves that window inside (strictly greater is outside).
    block = classifier_handler.build_ood_block(
        windows, reef_reference.OodReference("v", distances[2], "cosine_distance", 1, rows, "0" * 64, ["s"] * 10)
    )
    assert block["windows"]["status"][2] == "inside"
    assert block["summary"]["windows_total"] == 4
    assert block["summary"]["windows_outside"] == block["windows"]["status"].count("outside")


def test_ood_unavailable_probabilities_identical(classifier_handler, excerpt, monkeypatch, tmp_path, capsys):
    # Without an OOD artifact (contract v1) the result simply omits the ood block ...
    without = _run(classifier_handler, excerpt, "ctx-no-ood")
    assert "ood" not in without
    out = capsys.readouterr().out
    assert '"ContextUnavailable": 1' in out and '"Block": "ood"' in out

    # ... and with it present, every probability and the similar sites are identical (D-12).
    _with_ood(monkeypatch, classifier_handler, tmp_path, _ood_rows(excerpt))
    with_ood = _run(classifier_handler, excerpt, "ctx-with-ood")
    assert "ood" in with_ood
    assert with_ood["classification"]["label"] == without["classification"]["label"]
    assert with_ood["classification"]["confidence"] == without["classification"]["confidence"]
    assert with_ood["classification"]["probabilities"] == without["classification"]["probabilities"]
    assert with_ood["windows"]["probabilities"] == without["windows"]["probabilities"]
    assert with_ood["windows"]["label"] == without["windows"]["label"]
    assert with_ood["similar_sites"] == without["similar_sites"]


def test_ood_reference_tampering_omits_the_block_and_keeps_the_analysis(
    classifier_handler, excerpt, monkeypatch, tmp_path
):
    manifest = _with_ood(monkeypatch, classifier_handler, tmp_path, _ood_rows(excerpt))
    matrix = manifest.parent.parent / "v2" / "ood_reference.f32"
    raw = bytearray(matrix.read_bytes())
    raw[7] ^= 0x01
    matrix.write_bytes(bytes(raw))
    item = _run(classifier_handler, excerpt, "ctx-ood-bad")
    assert "ood" not in item
    assert item["classification"]["probabilities"]
    assert item["site_similarities"]


# --- item size and schema ---------------------------------------------------------------


def _dynamo_number_size(value):
    d = Decimal(value)
    if d == 0:
        return 1
    digits = len(d.normalize().as_tuple().digits)
    return (digits + 1) // 2 + 1 + (1 if d < 0 else 0)


def dynamodb_value_size(value):
    """DynamoDB's documented item-size rules, as an estimate in bytes.

    Strings are their UTF-8 length; a number is about one byte per two significant digits
    plus one (and one more when negative); null and boolean are one byte; a list or map is
    three bytes plus one byte per element, plus the elements (a map's attribute names count).
    """
    if value is None or isinstance(value, bool):
        return 1
    if isinstance(value, str):
        return len(value.encode("utf-8"))
    if isinstance(value, (int, float, Decimal)):
        return _dynamo_number_size(value)
    if isinstance(value, list):
        return 3 + sum(1 + dynamodb_value_size(v) for v in value)
    if isinstance(value, dict):
        return 3 + sum(1 + len(k.encode("utf-8")) + dynamodb_value_size(v) for k, v in value.items())
    raise TypeError(type(value))


def dynamodb_item_size(item):
    return sum(len(k.encode("utf-8")) + dynamodb_value_size(v) for k, v in item.items())


def test_item_size_120_windows_under_limit(classifier_handler, served_dir):
    handler = classifier_handler
    n = 120  # the 600 s cap
    rng = np.random.RandomState(2)
    model = reef_reference.load_served_model()
    ref = reef_reference.load_reference_set()
    E = rng.normal(size=(n, 1280)).astype(np.float32)
    P = handler.classify_windows(E, model)
    sidecar = {"levels": {
        "peak_dbfs": [-float(v) for v in rng.uniform(1, 40, n)],
        "rms_dbfs": [-float(v) for v in rng.uniform(10, 60, n)],
        "silent": [bool(v) for v in rng.uniform(size=n) < 0.05],
    }}
    S = handler.window_similarities(E, ref)
    ood_ref = reef_reference.OodReference(
        "ood-x", 0.3, "cosine_distance", 1, rng.normal(size=(100, 1280)).astype(np.float32), "a" * 64, ["s"] * 100
    )
    classification = handler.aggregate_classification(P, model)
    item = {
        "pk": "ANALYSIS#0b5f8f0e-5c0a-4c1e-9d3e-123456789abc", "sk": "RESULT",
        "upload_id": "0b5f8f0e-5c0a-4c1e-9d3e-123456789abd",
        "analysis_id": "0b5f8f0e-5c0a-4c1e-9d3e-123456789abc", "status": "complete",
        "classification": {**classification, "region": {"name": "x" * 60, "caveat": "y" * 400}},
        "similar_sites": handler.top3_similar_sites(S.mean(axis=0), ref),
        "contract_version": 2, "dataset_version": "reefradar-reference-2026.10.0",
        "model_version": "interim-real-only-2026.10.1", "preprocessing_spec_version": reef_audio.SPEC_VERSION,
        "stamp_status": "stamped",
        "windows": handler.build_windows_block(
            P, model, sidecar, similarities=S, nearest_site=[ref.row_site_ids[int(j)] for j in S.argmax(axis=1)]
        ),
        "site_similarities": handler.build_site_similarities(S, ref),
        "projection": handler.build_projection_block(E, ref),
        "ood": handler.build_ood_block(E, ood_ref),
        "completed_at": "2026-10-14T12:00:00.000000", "caveats": "c" * 600,
    }
    stored = handler.convert_floats(item)
    size = dynamodb_item_size(stored)
    print(f"120-window RESULT item size: {size} bytes ({size / 1024:.1f} KiB; limit 400 KiB)")
    assert size < 400 * 1024
    assert size < 200 * 1024  # and with real headroom for later blocks


def test_full_result_validates_against_schema(classifier_handler, excerpt, monkeypatch, tmp_path):
    _with_ood(monkeypatch, classifier_handler, tmp_path, _ood_rows(excerpt))
    item = _run(classifier_handler, excerpt, "ctx-schema")
    for key in ("windows", "site_similarities", "projection", "ood", "input_audio"):
        assert key in item
    contract_lib.validate(_plain(item), "analysis-result")
