"""
End-to-end test for lambdas/router/handler.py's GET /samples route (plan
01-12, Task 2 -- D-05/D-09).

Exercises handler.handler() against moto-mocked S3. The sample gallery is
no longer a static CURATED_SAMPLES Python list (recovered undocumented in
plan 01-09) -- it is read from the committed, git-tracked
data/audio-manifest.json "gallery" section (real MARRS excerpts only),
with only the audio URL swapped for a presigned GET under the
samples/marrs/ prefix. Confirms, end to end through the real route table
and handle_get_samples():

  - samples/stories equal the manifest gallery's samples/stories (ids,
    order, names, categories, descriptions, coordinates, attribution).
  - Every audio_url is a presigned GET for AUDIO_BUCKET at
    samples/marrs/<excerpt file name> -- never the old
    samples/<sample id>.wav keys.
  - No phl_ sample exists (phl_D1 was deleted per D-05); aus_R1's
    category is restored_mid (the old CURATED_SAMPLES mislabeled it
    restored_early).
  - No sample site_id falls outside data/snapshots/api-sites.json.
  - When the audio manifest is unavailable, the route returns 500
    SAMPLES_UNAVAILABLE rather than any hard-coded list.
"""

import importlib.util
import json
from pathlib import Path
from urllib.parse import urlparse

import boto3
import pytest
from moto import mock_aws

# See lambdas/router/tests/test_sites.py's identical comment: a bare
# `import conftest` collides with scripts/tests/conftest.py's cached
# module name under pytest's collection order.
_LAMBDAS_DIR = Path(__file__).resolve().parent.parent.parent
_REPO_ROOT = _LAMBDAS_DIR.parent
_spec = importlib.util.spec_from_file_location("lambdas_conftest", _LAMBDAS_DIR / "conftest.py")
_lambdas_conftest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_lambdas_conftest)
load_lambda = _lambdas_conftest.load_lambda

EMBEDDINGS_BUCKET = "reefradar-2477-embeddings"
AUDIO_BUCKET = "reefradar-2477-audio"

_MANIFEST_PATH = _REPO_ROOT / "data" / "audio-manifest.json"
_SITES_SNAPSHOT_PATH = _REPO_ROOT / "data" / "snapshots" / "api-sites.json"


def _load_manifest():
    with open(_MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_reference_site_ids():
    with open(_SITES_SNAPSHOT_PATH, "r", encoding="utf-8") as f:
        snapshot = json.load(f)
    return {s["site_id"] for s in snapshot["sites"]}


@pytest.fixture
def router_handler(aws):
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket=EMBEDDINGS_BUCKET)
    s3.create_bucket(Bucket=AUDIO_BUCKET)
    return load_lambda("router")


def _get_samples(module):
    event = {
        "requestContext": {"http": {"method": "GET"}, "stage": ""},
        "rawPath": "/samples",
    }
    result = module.handler(event, context=None)
    body = json.loads(result["body"])
    return result, body


def test_samples_match_manifest_gallery_ids_and_fields(router_handler):
    manifest = _load_manifest()
    expected = manifest["gallery"]["samples"]

    _, body = _get_samples(router_handler)
    actual = body["samples"]

    assert [s["id"] for s in actual] == [s["id"] for s in expected]
    for exp, act in zip(expected, actual):
        assert act["site_id"] == exp["site_id"]
        assert act["name"] == exp["name"]
        assert act["category"] == exp["category"]
        assert act["description"] == exp["description"]
        assert act["coordinates"] == exp["coordinates"]
        assert act["attribution"] == exp["attribution"]


def test_samples_stories_match_manifest_stories(router_handler):
    manifest = _load_manifest()
    _, body = _get_samples(router_handler)
    assert body["stories"] == manifest["gallery"]["stories"]


def test_sample_audio_urls_are_presigned_marrs_keys(router_handler):
    _, body = _get_samples(router_handler)
    assert len(body["samples"]) > 0

    for sample in body["samples"]:
        parsed = urlparse(sample["audio_url"])
        # moto/boto3 mint virtual-hosted-style URLs (bucket in the
        # netloc); accept that or the path-style equivalent.
        assert AUDIO_BUCKET in parsed.netloc or parsed.path.startswith(f"/{AUDIO_BUCKET}/")
        assert parsed.path.startswith("/samples/marrs/") or f"/{AUDIO_BUCKET}/samples/marrs/" in parsed.path
        assert parsed.path.endswith(".wav")
        # Never the old pre-01-09 static s3_key scheme.
        assert "samples/" + sample["id"] + ".wav" not in sample["audio_url"]


def test_no_phl_sample_in_gallery(router_handler):
    _, body = _get_samples(router_handler)
    assert not any(s["site_id"].startswith("phl_") for s in body["samples"])
    assert not any(s["country_code"] == "PHL" for s in body["samples"])


def test_aus_r1_category_is_restored_mid(router_handler):
    _, body = _get_samples(router_handler)
    by_site = {s["site_id"]: s for s in body["samples"]}
    assert by_site["aus_R1"]["category"] == "restored_mid"


def test_no_sample_site_id_outside_reference_dataset(router_handler):
    reference_site_ids = _load_reference_site_ids()
    _, body = _get_samples(router_handler)
    for sample in body["samples"]:
        assert sample["site_id"] in reference_site_ids


def test_samples_unavailable_when_manifest_missing(router_handler):
    def _raise():
        raise FileNotFoundError("data/audio-manifest.json not found")

    router_handler.get_audio_manifest = _raise

    result, body = _get_samples(router_handler)
    assert result["statusCode"] == 500
    assert body["error"]["code"] == "SAMPLES_UNAVAILABLE"
