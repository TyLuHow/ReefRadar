"""
Tests for scripts/drift-check.py (D-03 CLI).

Offline-only for this plan: a fixture-deployed zip stands in for a real
`aws lambda get-function` download. Plan 01-09 points the live mode at
the real account.
"""

import io
import json
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
