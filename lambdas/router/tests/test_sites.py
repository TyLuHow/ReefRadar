"""
End-to-end test for lambdas/router/handler.py's GET /sites route (plan 01-12,
Task 1 -- D-17).

Exercises handler.handler() against moto-mocked S3 with a
reference/metadata_v6.json fixture built from the real
data/snapshots/api-sites.json 54-site snapshot (no embeddings needed --
/sites never returns them). Confirms, end to end through the real route
table and handle_get_sites():

  - Every site in the response carries label_source, label_original,
    label_definition, label_assigned_by, status_basis and (where
    relevant) period/label_note -- D-17/TRUTH-09.
  - Bora-Bora disturbance-context sites (CoralSoundExplorer) and
    Hurricane Irma sites are served with status "unknown"; MARRS
    statuses are unchanged -- TRUTH-03/TRUTH-04 neighbouring truth.
  - The ?has_embedding filter and all top-level count fields behave
    exactly as before this plan's change.
  - When S3 is unavailable, the hard-coded fallback list is returned
    with the same label provenance overlay and its error_note unchanged.
"""

import importlib.util
import json
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

# Load lambdas/conftest.py by explicit file path (see lambdas/classifier/
# tests/test_handler.py's identical comment: a bare `import conftest`
# collides with scripts/tests/conftest.py's cached module name under
# pytest's collection order).
_LAMBDAS_DIR = Path(__file__).resolve().parent.parent.parent
_REPO_ROOT = _LAMBDAS_DIR.parent
_spec = importlib.util.spec_from_file_location("lambdas_conftest", _LAMBDAS_DIR / "conftest.py")
_lambdas_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_lambdas_conftest)
load_lambda = _lambdas_conftest.load_lambda

EMBEDDINGS_BUCKET = "reefradar-2477-embeddings"
AUDIO_BUCKET = "reefradar-2477-audio"

_SNAPSHOT_PATH = _REPO_ROOT / "data" / "snapshots" / "api-sites.json"


def _load_snapshot():
    with open(_SNAPSHOT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _setup_s3_fixture(s3):
    s3.create_bucket(Bucket=EMBEDDINGS_BUCKET)
    s3.create_bucket(Bucket=AUDIO_BUCKET)
    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key="reference/metadata_v6.json",
        Body=json.dumps(_load_snapshot()),
        ContentType="application/json",
    )


@pytest.fixture
def router_handler(aws):
    s3 = boto3.client("s3", region_name="us-east-1")
    _setup_s3_fixture(s3)
    return load_lambda("router")


def _get_sites(module, query_params=None):
    event = {
        "requestContext": {"http": {"method": "GET"}, "stage": ""},
        "rawPath": "/sites",
    }
    if query_params is not None:
        event["queryStringParameters"] = query_params
    result = module.handler(event, context=None)
    body = json.loads(result["body"])
    return result, body


def _by_id(sites):
    return {s["site_id"]: s for s in sites}


def test_sites_returns_all_54_with_label_provenance(router_handler):
    result, body = _get_sites(router_handler)
    assert result["statusCode"] == 200
    assert body["total_sites"] == 54
    assert len(body["sites"]) == 54

    for site in body["sites"]:
        assert "label_source" in site
        assert "label_original" in site
        assert "label_definition" in site
        assert "label_assigned_by" in site
        assert "status_basis" in site


def test_borabora_disturbance_sites_are_unknown_with_label_original(router_handler):
    _, body = _get_sites(router_handler)
    by_id = _by_id(body["sites"])

    tourist = by_id["borabora_tourist"]
    assert tourist["status"] == "unknown"
    assert tourist["label_source"] == "coralsoundexplorer"
    assert tourist["label_original"] == "tourist"

    boat_traffic = by_id["borabora_boat_traffic"]
    assert boat_traffic["status"] == "unknown"
    assert boat_traffic["label_source"] == "coralsoundexplorer"
    assert boat_traffic["label_original"] == "boat traffic"


def test_irma_sites_are_unknown_with_period_where_applicable(router_handler):
    _, body = _get_sites(router_handler)
    by_id = _by_id(body["sites"])

    western = by_id["irma_western_dry_rocks"]
    assert western["status"] == "unknown"
    assert western["label_source"] == "irma"
    assert western["period"] is not None

    eastern = by_id["irma_eastern_sambo"]
    assert eastern["status"] == "unknown"
    assert eastern["label_source"] == "irma"


def test_marrs_statuses_are_unchanged(router_handler):
    snapshot = _load_snapshot()
    marrs_expected = {
        s["site_id"]: s["status"] for s in snapshot["sites"] if s["source"] == "MARRS"
    }

    _, body = _get_sites(router_handler)
    by_id = _by_id(body["sites"])

    for site_id, expected_status in marrs_expected.items():
        assert by_id[site_id]["status"] == expected_status
        assert by_id[site_id]["label_source"] == "marrs"


def test_has_embedding_filter_unchanged(router_handler):
    _, body_true = _get_sites(router_handler, query_params={"has_embedding": "true"})
    _, body_false = _get_sites(router_handler, query_params={"has_embedding": "false"})

    assert all(s["has_embedding"] is True for s in body_true["sites"])
    assert all(s["has_embedding"] is False for s in body_false["sites"])
    assert len(body_true["sites"]) + len(body_false["sites"]) == 54
    # Top-level counts stay tied to the full 54-site dataset regardless of filter.
    assert body_true["total_all_sites"] == 54
    assert body_false["total_all_sites"] == 54


def test_s3_failure_fallback_carries_provenance_and_error_note(aws):
    # No S3 buckets created -- handle_get_sites's S3 read raises, falling
    # back to the hard-coded minimal list.
    module = load_lambda("router")
    result, body = _get_sites(module)

    assert result["statusCode"] == 200
    assert "error_note" in body
    assert body["error_note"].startswith("Loaded from fallback:")

    by_id = _by_id(body["sites"])
    assert by_id["ind_H4"]["status"] == "healthy"
    assert by_id["ind_H4"]["label_source"] == "marrs"
    assert by_id["ken_H1"]["label_source"] == "marrs"
