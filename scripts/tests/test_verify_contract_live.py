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


SIMPLE_SAFE_HEADERS = {
    "origin",
    "accept",
    "accept-language",
    "content-language",
    "user-agent",
    "accept-encoding",
    "connection",
    "host",
}


class FakeSession:
    """Serves contracts/bucket like the CDN.

    cors_mode "policy" (default) behaves like the fixed distribution: Access-Control-Allow-Origin
    on every request carrying an Origin, and OPTIONS answered 204 with the CORS headers.
    cors_mode "simple" reproduces Managed-SimpleCORS: the header only on simple CORS requests
    (every request header safelisted or transport-level), and OPTIONS refused with 403.

    An override is keyed by URL and applies to GET requests unless it names "method": "OPTIONS".
    It may carry "when", a callable taking the request header dict, to target one profile.
    """

    def __init__(self, overrides=None, cors_mode="policy"):
        self.overrides = overrides or {}
        self.cors_mode = cors_mode
        self.requests = []

    def get(self, url, headers=None, timeout=None, allow_redirects=None, **kwargs):
        sent = dict(headers or {})
        self.requests.append({"method": "GET", "url": url, "headers": sent, "timeout": timeout, "kwargs": kwargs})
        return self._apply(url, "GET", sent, self._serve(url, sent))

    def options(self, url, headers=None, timeout=None, allow_redirects=None, **kwargs):
        sent = dict(headers or {})
        self.requests.append({"method": "OPTIONS", "url": url, "headers": sent, "timeout": timeout, "kwargs": kwargs})
        return self._apply(url, "OPTIONS", sent, self._preflight(sent))

    def _apply(self, url, method, request_headers, resp):
        override = self.overrides.get(url)
        if override is None or override.get("method", "GET") != method:
            return resp
        when = override.get("when")
        if when is not None and not when(request_headers):
            return resp
        if "status" in override:
            resp.status_code = override["status"]
        if "content" in override:
            resp.content = override["content"]
        resp.headers.update(override.get("headers", {}))
        for name in override.get("drop", []):
            resp.headers.pop(name, None)
        return resp

    def _cors_for_get(self, request_headers):
        if "Origin" not in request_headers:
            return {}
        if self.cors_mode == "simple" and any(k.lower() not in SIMPLE_SAFE_HEADERS for k in request_headers):
            return {}
        return {"Access-Control-Allow-Origin": "*"}

    def _preflight(self, request_headers):
        refused = "Origin" not in request_headers or "Access-Control-Request-Method" not in request_headers
        if self.cors_mode == "simple" or refused:
            return Resp(403, {}, b"<Error><Code>AccessDenied</Code></Error>")
        return Resp(
            204,
            {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "600",
            },
            b"",
        )

    def _serve(self, url, request_headers):
        if url.startswith(S3_URL):
            return Resp(403, {}, b"<Error><Code>AccessDenied</Code></Error>")
        assert url.startswith(BASE), url
        path = url[len(BASE):]
        cors = self._cors_for_get(request_headers)
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
    assert out.count("PASS") >= 52
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
        assert request["method"] in ("GET", "OPTIONS")
        assert not request["kwargs"].get("data") and not request["kwargs"].get("json")  # no body
    assert {r["method"] for r in session.requests} == {"GET", "OPTIONS"}


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


# ---- browser-realistic CORS probes (plan 02-13) ----

BROWSER_NAMES = ("pointer", "manifest", "artifact sites")
PROFILES = ("priority", "no-cache", "chrome")


def out_lines(capsys, prefix):
    return [line for line in capsys.readouterr().out.splitlines() if line.startswith(prefix)]


def browser_check_names():
    names = []
    for name in BROWSER_NAMES:
        names.extend(f"{name}: browser CORS ({profile}) allows any origin" for profile in PROFILES)
        names.append(f"{name}: CORS preflight answered")
    return names


def test_a_fixed_deployment_passes_all_twelve_browser_checks(capsys):
    assert run(FakeSession()) == 0

    out = capsys.readouterr().out.splitlines()
    assert len(browser_check_names()) == 12
    for name in browser_check_names():
        assert any(line.startswith("PASS") and name in line for line in out), name


def test_a_managed_simple_cors_cdn_fails_exactly_the_twelve_browser_checks(capsys):
    assert run(FakeSession(cors_mode="simple")) == 1

    out = capsys.readouterr().out.splitlines()
    fails = [line for line in out if line.startswith("FAIL") and "FAILED" not in line]
    assert len(fails) == 12, fails
    for name in browser_check_names():
        assert any(name in line for line in fails), name
    # The blind spot that let the defect through: an Origin-only GET is still answered.
    assert any(line.startswith("PASS") and "pointer: CORS allows any origin" in line for line in out)
    assert any(line.startswith("PASS") and "manifest: CORS allows any origin" in line for line in out)


def test_dropping_cors_only_when_cache_control_is_present_fails_only_no_cache(capsys):
    overrides = {
        u(path): {"drop": ["Access-Control-Allow-Origin"], "when": lambda h: "Cache-Control" in h}
        for path in ("contract/latest.json", "contract/v1.json", "v1/sites.json")
    }
    assert run(FakeSession(overrides)) == 1

    fails = [line for line in out_lines(capsys, "FAIL") if "FAILED" not in line]
    assert len(fails) == 3, fails
    assert all("browser CORS (no-cache)" in line for line in fails)


def test_a_profile_answered_with_another_origin_fails(capsys):
    overrides = {
        u("v1/sites.json"): {
            "headers": {"Access-Control-Allow-Origin": "https://example.org"},
            "when": lambda h: "Priority" in h and "Sec-Fetch-Mode" not in h,
        }
    }
    assert run(FakeSession(overrides)) == 1

    fails = [line for line in out_lines(capsys, "FAIL") if "FAILED" not in line]
    assert len(fails) == 1 and "artifact sites: browser CORS (priority)" in fails[0], fails


def preflight_override(**kwargs):
    return {u("contract/latest.json"): {"method": "OPTIONS", **kwargs}}


@pytest.mark.parametrize(
    "override",
    [
        pytest.param({"status": 403}, id="status-403"),
        pytest.param({"drop": ["Access-Control-Allow-Headers"]}, id="no-allow-headers"),
        pytest.param({"headers": {"Access-Control-Allow-Headers": "priority"}}, id="only-priority"),
        pytest.param({"headers": {"Access-Control-Allow-Headers": "cache-control"}}, id="only-cache-control"),
        pytest.param({"headers": {"Access-Control-Allow-Methods": "HEAD, OPTIONS"}}, id="no-get-method"),
        pytest.param({"drop": ["Access-Control-Allow-Methods"]}, id="no-allow-methods"),
        pytest.param({"drop": ["Access-Control-Allow-Origin"]}, id="no-allow-origin"),
        pytest.param({"headers": {"Access-Control-Allow-Origin": "https://example.org"}}, id="origin-not-star"),
    ],
)
def test_a_bad_preflight_fails_only_the_preflight_check(override, capsys):
    assert run(FakeSession(preflight_override(**override))) == 1

    fails = [line for line in out_lines(capsys, "FAIL") if "FAILED" not in line]
    assert len(fails) == 1 and "pointer: CORS preflight answered" in fails[0], fails


@pytest.mark.parametrize(
    "allow_headers",
    ["*", "priority, cache-control", "Cache-Control,Priority,Pragma", "PRIORITY , CACHE-CONTROL"],
)
def test_a_preflight_listing_both_headers_passes(allow_headers, capsys):
    overrides = preflight_override(headers={"Access-Control-Allow-Headers": allow_headers})
    assert run(FakeSession(overrides)) == 0
    assert "FAIL" not in capsys.readouterr().out


def test_the_preflight_asks_for_get_with_priority_and_cache_control():
    session = FakeSession()
    assert run(session) == 0

    preflights = [r for r in session.requests if r["method"] == "OPTIONS"]
    assert [r["url"] for r in preflights] == [u("contract/latest.json"), u("contract/v1.json"), u("v1/sites.json")]
    for request in preflights:
        assert request["headers"]["Access-Control-Request-Method"] == "GET"
        assert request["headers"]["Access-Control-Request-Headers"] == "priority,cache-control"


def test_the_browser_profiles_carry_the_headers_chrome_adds():
    session = FakeSession()
    assert run(session) == 0

    gets = [r["headers"] for r in session.requests if r["method"] == "GET" and r["url"] == u("contract/v1.json")]
    assert any(h.get("Priority") == "u=1, i" and "Cache-Control" not in h for h in gets)
    assert any(h.get("Cache-Control") == "no-cache" and h.get("Pragma") == "no-cache" for h in gets)
    assert any(h.get("Sec-Fetch-Mode") == "cors" and h.get("Sec-Fetch-Site") == "cross-site" for h in gets)
    assert all(h.get("Origin") == "http://localhost:3000" for h in gets)


def test_a_manifest_without_a_sites_artifact_fails_the_browser_check(capsys):
    manifest = json.loads(MANIFEST_BYTES)
    manifest["artifacts"]["sites"] = {"present": False}
    body = json.dumps(manifest).encode("utf-8")
    assert run(FakeSession({u("contract/v1.json"): {"content": body}}), "--version", "1") == 1

    assert any("browser CORS: manifest lists no sites artifact" in line for line in out_lines(capsys, "FAIL"))


def test_version_mode_runs_the_browser_checks_for_manifest_and_sites_but_not_the_pointer(capsys):
    session = FakeSession()
    assert run(session, "--version", "1") == 0

    out = capsys.readouterr().out
    assert "manifest: CORS preflight answered" in out and "artifact sites: CORS preflight answered" in out
    assert "pointer: CORS preflight answered" not in out
    assert all(r["url"] != u("contract/latest.json") for r in session.requests)


def test_a_preflight_transport_error_is_reported_without_the_url(capsys):
    class NoOptions(FakeSession):
        def options(self, url, **kwargs):
            raise ConnectionError(f"could not reach {url}?X-Amz-Signature=secret")

    assert run(NoOptions()) == 1

    out = capsys.readouterr().out
    assert "ConnectionError" in out and "X-Amz-Signature" not in out and "secret" not in out
