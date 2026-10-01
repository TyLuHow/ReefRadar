"""
Tests for scripts/lambda_packaging.py (D-03).

Proves the deterministic-zip-build and manifest-comparison strategy
offline, with fixture repos and fixture zips/layers only, before any
AWS access exists (plan 01-09 points this at the real account).
"""

import hashlib
import io
import tarfile
import zipfile

import pytest

import lambda_packaging as pkg


ROUTER_SPEC = {
    "function_name": "reefradar-2477-router",
    "kind": "zip",
    "members": [
        {"source": "lambdas/router/handler.py", "archive_path": "handler.py"},
    ],
}


@pytest.fixture
def fixture_repo(tmp_path):
    (tmp_path / "lambdas" / "router").mkdir(parents=True)
    (tmp_path / "lambdas" / "router" / "handler.py").write_text(
        "def handler(event, context):\n    return {}\n"
    )
    return tmp_path


# --- build_package: determinism -------------------------------------------


def test_build_package_is_deterministic(fixture_repo):
    a = pkg.build_package(ROUTER_SPEC, fixture_repo)
    b = pkg.build_package(ROUTER_SPEC, fixture_repo)
    assert a == b


def test_build_package_fixed_zipinfo_metadata(fixture_repo):
    data = pkg.build_package(ROUTER_SPEC, fixture_repo)
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        infos = zf.infolist()
        assert len(infos) == 1
        info = infos[0]
        assert info.date_time == (1980, 1, 1, 0, 0, 0)
        assert info.external_attr == (0o100644 << 16)
        assert info.compress_type == zipfile.ZIP_DEFLATED


def test_build_package_sorts_members_by_archive_path(tmp_path):
    (tmp_path / "a.py").write_text("a")
    (tmp_path / "b.py").write_text("b")
    spec = {
        "kind": "zip",
        "members": [
            {"source": "b.py", "archive_path": "zzz.py"},
            {"source": "a.py", "archive_path": "aaa.py"},
        ],
    }
    data = pkg.build_package(spec, tmp_path)
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = [i.filename for i in zf.infolist()]
    assert names == ["aaa.py", "zzz.py"]


def test_build_package_supports_custom_reader(tmp_path):
    """Members can come from a reader callable (e.g. `git show`) instead of the filesystem."""
    spec = {
        "kind": "zip",
        "members": [{"source": "handler.py", "archive_path": "handler.py"}],
    }

    def reader(repo_root, source):
        return b"from a reader, not the filesystem\n"

    data = pkg.build_package(spec, tmp_path, reader=reader)
    manifest = pkg.manifest_from_zip(data)
    assert manifest == {
        "handler.py": hashlib.sha256(b"from a reader, not the filesystem\n").hexdigest()
    }


# --- manifest_from_zip -----------------------------------------------------


def test_manifest_from_zip_ignores_dirs_pycache_and_pyc(tmp_path):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("handler.py", "x")
        zf.writestr("__pycache__/handler.cpython-312.pyc", "ignored")
        zf.writestr("handler.pyc", "ignored")
        zf.writestr("subdir/", "")
    manifest = pkg.manifest_from_zip(buf.getvalue())
    assert manifest == {"handler.py": hashlib.sha256(b"x").hexdigest()}


def test_fixture_zip_different_timestamps_and_perms_same_content_matches(fixture_repo):
    """A fixture zip with the same file contents but different timestamps and
    permission bits compares as a match (the whole point of manifest-based
    drift detection instead of hashing raw zip bytes)."""
    local = pkg.build_package(ROUTER_SPEC, fixture_repo)
    local_manifest = pkg.manifest_from_zip(local)

    # Same underlying text content as the local build (normalized the same way
    # build_package's default reader normalizes it -- see normalize_text_bytes),
    # packaged with different zip metadata, simulating an independently-built
    # deployed zip.
    content = pkg.normalize_text_bytes(
        (fixture_repo / "lambdas" / "router" / "handler.py").read_bytes()
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        info = zipfile.ZipInfo("handler.py", date_time=(2024, 6, 1, 12, 0, 0))
        info.external_attr = 0o100755 << 16
        zf.writestr(info, content)
    deployed_manifest = pkg.manifest_from_zip(buf.getvalue())

    report = pkg.compare_manifests(local_manifest, deployed_manifest)
    assert pkg.manifest_matches(report)


# --- compare_manifests ------------------------------------------------------


def test_compare_manifests_detects_missing_extra_changed():
    expected = {"a.py": "hash_a", "b.py": "hash_b", "c.py": "hash_c"}
    actual = {"a.py": "hash_a", "b.py": "DIFFERENT", "d.py": "hash_d"}
    report = pkg.compare_manifests(expected, actual)
    assert report["missing"] == ["c.py"]
    assert report["extra"] == ["d.py"]
    assert report["changed"] == ["b.py"]


def test_compare_manifests_empty_report_means_match():
    m = {"a.py": "x"}
    report = pkg.compare_manifests(m, dict(m))
    assert pkg.manifest_matches(report)
    assert report == {"missing": [], "extra": [], "changed": []}


# --- load_spec ---------------------------------------------------------------


def test_load_spec_rejects_unknown_function():
    with pytest.raises(pkg.SpecError):
        pkg.load_spec("nonexistent")


def test_load_spec_loads_real_router_spec():
    spec = pkg.load_spec("router")
    assert spec["function_name"] == "reefradar-2477-router"
    assert spec["kind"] == "zip"
    assert any(m["archive_path"] == "handler.py" for m in spec["members"])


def test_load_spec_loads_real_classifier_spec_with_region_detection():
    spec = pkg.load_spec("classifier")
    archive_paths = {m["archive_path"] for m in spec["members"]}
    # Plan 01-11 (D-17) adds the shared label-provenance members the
    # classifier handler now imports alongside region_detection.py.
    assert archive_paths == {
        "handler.py",
        "region_detection.py",
        "site_provenance.py",
        "site_label_provenance.json",
    }


def test_load_spec_loads_real_inference_container_spec():
    spec = pkg.load_spec("inference")
    assert spec["kind"] == "container"
    assert spec["ecr_repository"] == "reefradar-2477-inference"
    assert spec["members"] == [
        {"source": "infrastructure/lambda_container/inference.py", "archive_path": "inference.py"}
    ]


# --- code_sha256 --------------------------------------------------------------


def test_code_sha256_is_base64_of_raw_sha256_digest():
    import base64

    data = b"hello"
    expected = base64.b64encode(hashlib.sha256(data).digest()).decode("ascii")
    actual = pkg.code_sha256(data)
    assert actual == expected
    assert len(actual) == 44


# --- manifest_from_layers (D-03, container drift) -----------------------------


def _make_layer_tar(files: dict[str, str | None]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        for name, content in files.items():
            data = (content or "").encode()
            info = tarfile.TarInfo(name=name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def test_manifest_from_layers_later_layer_overrides_earlier():
    older = _make_layer_tar({"var/task/inference.py": "old content"})
    newer = _make_layer_tar({"var/task/inference.py": "new content"})

    manifest = pkg.manifest_from_layers([older, newer], workdir="var/task", wanted={"inference.py"})
    assert manifest == {"inference.py": hashlib.sha256(b"new content").hexdigest()}


def test_manifest_from_layers_honors_whiteout_files():
    base = _make_layer_tar({"var/task/inference.py": "content"})
    delete = _make_layer_tar({"var/task/.wh.inference.py": ""})

    manifest = pkg.manifest_from_layers([base, delete], workdir="var/task", wanted={"inference.py"})
    assert manifest == {}


def test_manifest_from_layers_filters_to_wanted_files_only():
    layer = _make_layer_tar(
        {"var/task/inference.py": "wanted", "var/task/requirements.txt": "unwanted"}
    )
    manifest = pkg.manifest_from_layers([layer], workdir="var/task", wanted={"inference.py"})
    assert manifest == {"inference.py": hashlib.sha256(b"wanted").hexdigest()}
