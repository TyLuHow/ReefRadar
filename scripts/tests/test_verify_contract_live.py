"""
Tests for scripts/verify_contract_live.py (plan 02-04).

A fake requests-style session serves the committed contracts/bucket with production headers,
so every check is exercised with no network access.
"""

import hashlib
import json
import pathlib

import pytest

import publish_contract
import verify_contract_live

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BUNDLE = REPO_ROOT / "contracts" / "bucket"
BASE = "https://cdn.example.test/"
S3_URL = "https://bucket.example.test/"
IMMUTABLE = "public, max-age=31536000, immutable"
POINTER_CACHE = "public, max-age=60"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Resp:
    def __init__(self, status=200, headers=None, content=b""):
        self.status_code = status
        self.headers = dict(headers or {})
        self.content = content

    @property
    def text(self):
        return self.content.decode("utf-8", "replace")


class FakeSession:
    """Serves contracts/bucket like the CDN: CORS only when the request carries an Origin."""

    def __init__(self, overrides=None):
        self.overrides = overrides or {}
        self.requests = []

    def get(self, url, headers=None, timeout=None, allow_redirects=None, **kwargs):
        self.requests.append({"url": url, "headers": dict(headers or {}), "timeout": timeout, "kwargs": kwargs})
        resp = self._serve(url, headers or {})
        override = self.overrides.get(url)
        if override is not None:
            if "status" in override:
                resp.status_code = override["status"]
            if "content" in override:
                resp.content = override["content"]
            resp.headers.update(override.get("headers", {}))
            for name in override.get("drop", []):
                resp.headers.pop(name, None)
        return resp

    def _serve(self, url, request_headers):
        if url.startswith(S3_URL):
            return Resp(403, {}, b"<Error><Code>AccessDenied</Code></Error>")
        assert url.startswith(BASE), url
        path = url[len(BASE):]
        cors = {"Access-Control-Allow-Origin": "*"} if "Origin" in request_headers else {}
        if path == "contract/latest.json":
            manifest = (BUNDLE / "contract" / "v1.json").read_bytes()
            body = publish_contract.pointer_bytes(1, sha(manifest), REPO_ROOT / "contracts" / "schema")
            return Resp(200, {"Cache-Control": POINTER_CACHE, **cors}, body)
        target = BUNDLE / path
        if path and target.is_file():
            return Resp(200, {"Cache-Control": IMMUTABLE, **cors}, target.read_bytes())
        return Resp(403, {}, b"<Error><Code>AccessDenied</Code></Error>")


def run(session, *extra):
    return verify_contract_live.main(["--base-url", BASE, "--bucket-url", S3_URL, *extra], session=session)


def u(path: str) -> str:
    return BASE + path


def test_every_check_passes_against_a_correct_deployment(capsys):
    assert run(FakeSession()) == 0

    out = capsys.readouterr().out
    assert "FAIL" not in out
    assert out.count("PASS") >= 40
    assert "OK: contract verified live" in out


def test_every_request_is_an_unauthenticated_get_with_an_origin_and_a_timeout():
    session = FakeSession()
    assert run(session) == 0

    assert session.requests
    for request in session.requests:
        assert request["headers"].get("Origin") == "http://localhost:3000"
        assert not {k.lower() for k in request["headers"]} & {"authorization", "x-amz-security-token", "cookie"}
        assert request["timeout"] == 30
        assert "?" not in request["url"]  # no signed query strings


def test_output_has_no_response_bodies(capsys):
    assert run(FakeSession()) == 0

    out = capsys.readouterr().out
    assert '"site_id"' not in out and "ListBucketResult" not in out
    assert "X-Amz-Signature" not in out


MANIFEST_BYTES = (BUNDLE / "contract" / "v1.json").read_bytes()
ALTERED_MANIFEST = MANIFEST_BYTES.replace(b'"total_sites": 54', b'"total_sites": 55')
assert ALTERED_MANIFEST != MANIFEST_BYTES

FAILURES = {
    "pointer-cache": ({u("contract/latest.json"): {"headers": {"Cache-Control": "public, max-age=3600"}}}, "pointer: Cache-Control"),
    "pointer-missing": ({u("contract/latest.json"): {"status": 403}}, "pointer: HTTP 200"),
    "pointer-cors": ({u("contract/latest.json"): {"drop": ["Access-Control-Allow-Origin"]}}, "pointer: CORS"),
    "pointer-cors-not-star": (
        {u("contract/latest.json"): {"headers": {"Access-Control-Allow-Origin": "https://example.org"}}},
        "pointer: CORS",
    ),
    "manifest-differs-from-pointer": (
        {u("contract/v1.json"): {"content": ALTERED_MANIFEST}},
        "manifest: sha256 equals the pointer",
    ),
    "manifest-differs-from-committed": (
        {
            u("contract/v1.json"): {"content": ALTERED_MANIFEST},
            u("contract/latest.json"): {
                "content": publish_contract.pointer_bytes(1, sha(ALTERED_MANIFEST), REPO_ROOT / "contracts" / "schema")
            },
        },
        "manifest: bytes equal the committed manifest",
    ),
    "manifest-not-immutable": ({u("contract/v1.json"): {"headers": {"Cache-Control": "no-cache"}}}, "manifest: served immutable"),
    "artifact-hash": ({u("v1/sites.json"): {"content": b'{"sites": []}\n'}}, "artifact sites: sha256 equals the manifest"),
    "artifact-not-immutable": ({u("v1/stamp.json"): {"headers": {"Cache-Control": "max-age=60"}}}, "artifact stamp: served immutable"),
    "artifact-missing": ({u("v1/embeddings.f32"): {"status": 403}}, "artifact embeddings: HTTP 200"),
    "artifact-cors": ({u("v1/projection.json"): {"drop": ["Access-Control-Allow-Origin"]}}, "artifact projection: CORS"),
    "direct-s3-open": ({S3_URL + "contract/latest.json": {"status": 200}}, "direct S3 access is denied"),
    "missing-version-served": ({u("contract/v999999.json"): {"status": 200}}, "a version that does not exist"),
    "root-listing": (
        {BASE: {"status": 200, "content": b'<?xml version="1.0"?><ListBucketResult><Name>b</Name></ListBucketResult>'}},
        "the CDN root is not a bucket listing",
    ),
}


@pytest.mark.parametrize("overrides,expected", list(FAILURES.values()), ids=list(FAILURES))
def test_a_defect_fails_the_named_check(overrides, expected, capsys):
    assert run(FakeSession(overrides)) == 1

    fails = [line for line in capsys.readouterr().out.splitlines() if line.startswith("FAIL")]
    assert any(expected in line for line in fails), fails


def test_a_missing_version_that_answers_404_also_passes(capsys):
    assert run(FakeSession({u("contract/v999999.json"): {"status": 404}})) == 0
    assert "FAIL" not in capsys.readouterr().out


def test_expect_latest_fails_when_the_pointer_names_another_version(capsys):
    assert run(FakeSession(), "--expect-latest", "2") == 1
    out = capsys.readouterr().out
    assert any(line.startswith("FAIL") and "pointer: names version 2" in line for line in out.splitlines())

    assert run(FakeSession(), "--expect-latest", "1") == 0


def test_version_mode_verifies_the_manifest_without_reading_the_pointer(capsys):
    broken_pointer = {u("contract/latest.json"): {"status": 403}}
    session = FakeSession(broken_pointer)

    assert run(session, "--version", "1") == 0

    assert all(r["url"] != u("contract/latest.json") for r in session.requests)
    assert any(r["url"].endswith("contract/v1.json") for r in session.requests)


def test_version_mode_fails_for_a_version_with_no_committed_manifest(capsys):
    assert run(FakeSession(), "--version", "999999") == 1
    assert any(line.startswith("FAIL") for line in capsys.readouterr().out.splitlines())


def test_a_transport_error_is_reported_without_the_url(capsys):
    class Boom(FakeSession):
        def get(self, url, **kwargs):
            raise ConnectionError(f"could not reach {url}?X-Amz-Signature=secret")

    assert run(Boom()) == 1

    out = capsys.readouterr().out
    assert "FAIL" in out and "ConnectionError" in out
    assert "X-Amz-Signature" not in out and "secret" not in out


def test_help_lists_the_selectors(capsys):
    with pytest.raises(SystemExit) as stop:
        verify_contract_live.main(["--help"])
    assert stop.value.code == 0
    out = capsys.readouterr().out
    assert "--expect-latest" in out and "--version" in out


def test_the_default_base_url_is_the_recorded_contract_distribution():
    resources = json.loads((REPO_ROOT / "infrastructure" / "resources.json").read_text(encoding="utf-8"))
    domain = resources["cloudfront"]["distributions"]["contract"]["domain_name"]
    assert verify_contract_live.default_base_url() == f"https://{domain}/"
