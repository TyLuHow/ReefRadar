"""
Tests for scripts/drift-check.py (D-03 CLI).

Offline-only for this plan: a fixture-deployed zip (zip-kind functions)
or a fixture directory of gzip-tar layer blobs (the container-kind
inference function) stands in for a real `aws lambda get-function`
download. Plan 01-09 points the live mode at the real account.
"""

import io
import json
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

INFERENCE_SPEC = {
    "function_name": "reefradar-2477-inference",
    "kind": "container",
    "ecr_repository": "reefradar-2477-inference",
    "image_workdir": "var/task",
    "members": [
        {"source": "infrastructure/lambda_container/inference.py", "archive_path": "inference.py"},
    ],
}


@pytest.fixture
def drift_check(load_script):
    return load_script("drift-check")


@pytest.fixture
def router_repo(tmp_path, monkeypatch):
    (tmp_path / "lambdas" / "router").mkdir(parents=True)
    (tmp_path / "lambdas" / "router" / "handler.py").write_text(
        "def handler(event, context):\n    return {}\n"
    )
    pkg_dir = tmp_path / "infrastructure" / "lambda-packages"
    pkg_dir.mkdir(parents=True)
    (pkg_dir / "router.json").write_text(json.dumps(ROUTER_SPEC))
    monkeypatch.setattr(pkg, "PACKAGE_DIR", pkg_dir)
    return tmp_path


def test_cli_match_exits_zero(drift_check, router_repo, capsys):
    local_bytes = pkg.build_package(ROUTER_SPEC, router_repo)
    deployed_zip = router_repo / "deployed.zip"
    deployed_zip.write_bytes(local_bytes)

    code = drift_check.main(
        [
            "--function", "router",
            "--deployed-zip", str(deployed_zip),
            "--repo-root", str(router_repo),
        ]
    )
    assert code == 0
    assert "MATCH" in capsys.readouterr().out


def test_cli_drift_exits_one_and_names_changed_file(drift_check, router_repo, capsys):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("handler.py", "def handler(event, context):\n    return {'different': True}\n")
    deployed_zip = router_repo / "deployed.zip"
    deployed_zip.write_bytes(buf.getvalue())

    code = drift_check.main(
        [
            "--function", "router",
            "--deployed-zip", str(deployed_zip),
            "--repo-root", str(router_repo),
        ]
    )
    assert code == 1
    out = capsys.readouterr().out
    assert "handler.py" in out
    assert "changed" in out


def test_cli_drift_reports_missing_and_extra_files(drift_check, router_repo):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("extra_file.py", "x")
    deployed_zip = router_repo / "deployed.zip"
    deployed_zip.write_bytes(buf.getvalue())

    code = drift_check.main(
        [
            "--function", "router",
            "--deployed-zip", str(deployed_zip),
            "--repo-root", str(router_repo),
            "--json",
        ]
    )
    assert code == 1


def test_cli_unknown_function_exits_two(drift_check):
    with pytest.raises(SystemExit) as exc_info:
        drift_check.main(["--function", "nonexistent"])
    assert exc_info.value.code == 2


def test_cli_missing_deployed_zip_exits_two(drift_check, router_repo):
    code = drift_check.main(
        [
            "--function", "router",
            "--deployed-zip", str(router_repo / "does-not-exist.zip"),
            "--repo-root", str(router_repo),
        ]
    )
    assert code == 2


def test_cli_json_report_is_machine_readable(drift_check, router_repo, capsys):
    local_bytes = pkg.build_package(ROUTER_SPEC, router_repo)
    deployed_zip = router_repo / "deployed.zip"
    deployed_zip.write_bytes(local_bytes)

    code = drift_check.main(
        [
            "--function", "router",
            "--deployed-zip", str(deployed_zip),
            "--repo-root", str(router_repo),
            "--json",
        ]
    )
    assert code == 0
    out = capsys.readouterr().out.strip()
    payload = json.loads(out)
    assert payload["function"] == "router"
    assert payload["report"] == {"missing": [], "extra": [], "changed": []}


# --- container drift (--layers-dir), Task 3 -----------------------------------


@pytest.fixture
def inference_repo(tmp_path, monkeypatch):
    (tmp_path / "infrastructure" / "lambda_container").mkdir(parents=True)
    (tmp_path / "infrastructure" / "lambda_container" / "inference.py").write_text(
        "# inference handler\n"
    )
    pkg_dir = tmp_path / "infrastructure" / "lambda-packages"
    pkg_dir.mkdir(parents=True)
    (pkg_dir / "inference.json").write_text(json.dumps(INFERENCE_SPEC))
    monkeypatch.setattr(pkg, "PACKAGE_DIR", pkg_dir)
    return tmp_path


def _make_layer_tar(files: dict) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        for name, content in files.items():
            data = content.encode()
            info = tarfile.TarInfo(name=name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))
    return buf.getvalue()


def test_cli_container_match_via_layers_dir(drift_check, inference_repo, tmp_path):
    layers_dir = tmp_path / "layers"
    layers_dir.mkdir()
    content = (inference_repo / "infrastructure" / "lambda_container" / "inference.py").read_text()
    (layers_dir / "layer1.tar.gz").write_bytes(_make_layer_tar({"var/task/inference.py": content}))

    code = drift_check.main(
        [
            "--function", "inference",
            "--layers-dir", str(layers_dir),
            "--repo-root", str(inference_repo),
        ]
    )
    assert code == 0


def test_cli_container_drift_via_layers_dir(drift_check, inference_repo, tmp_path):
    layers_dir = tmp_path / "layers"
    layers_dir.mkdir()
    (layers_dir / "layer1.tar.gz").write_bytes(
        _make_layer_tar({"var/task/inference.py": "# totally different content\n"})
    )

    code = drift_check.main(
        [
            "--function", "inference",
            "--layers-dir", str(layers_dir),
            "--repo-root", str(inference_repo),
        ]
    )
    assert code == 1


def test_cli_container_missing_layers_dir_exits_two(drift_check, inference_repo, tmp_path):
    code = drift_check.main(
        [
            "--function", "inference",
            "--layers-dir", str(tmp_path / "does-not-exist"),
            "--repo-root", str(inference_repo),
        ]
    )
    assert code == 2


def test_cli_zip_kind_rejects_layers_dir_mismatch(drift_check, router_repo, tmp_path):
    """A zip-kind function with --layers-dir (wrong offline mode) is an error, not drift."""
    layers_dir = tmp_path / "layers"
    layers_dir.mkdir()
    (layers_dir / "layer1.tar.gz").write_bytes(_make_layer_tar({"var/task/handler.py": "x"}))

    code = drift_check.main(
        [
            "--function", "router",
            "--layers-dir", str(layers_dir),
            "--repo-root", str(router_repo),
        ]
    )
    assert code == 2


# --- build_config_summary: names only, never values (Task 3) ------------------


def test_build_config_summary_no_env_values(drift_check):
    configuration = {
        "Runtime": "python3.12",
        "Handler": "inference.handler",
        "MemorySize": 3008,
        "Timeout": 300,
        "PackageType": "Image",
        "Layers": [{"Arn": "arn:aws:lambda:us-east-1:781978598306:layer:reefradar-2477-numpy:1"}],
        "Environment": {
            "Variables": {
                "KAGGLE_CONFIG_DIR": "/tmp",
                "SECRET_API_KEY": "sk-super-secret-do-not-leak",
            }
        },
    }

    summary = drift_check.build_config_summary(configuration)
    serialized = json.dumps(summary)

    assert "KAGGLE_CONFIG_DIR" in summary["EnvironmentVariableNames"]
    assert "SECRET_API_KEY" in summary["EnvironmentVariableNames"]
    assert "/tmp" not in serialized
    assert "sk-super-secret-do-not-leak" not in serialized
