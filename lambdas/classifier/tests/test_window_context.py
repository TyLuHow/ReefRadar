"""
Per-analysis context for the classifier (plan 05-10): all-site similarity with
ranks, the unchanged legacy top-3, the PCA projection and the acoustic OOD flag,
all computed from contract data bundled with the classifier and verified by hash.

Everything runs under moto with the stubbed inference Lambda from
lambdas/conftest.py. The reference set is the committed contract v1 (repo mode);
tests that need an OOD reference write a tmp contract bucket beside it.
"""

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
def classifier_handler(aws, served_dir, stamp_file):
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
