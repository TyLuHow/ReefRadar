"""
Tests for scripts/deploy-lambdas.py (D-04).

A real temp git repo stands in for the project so is_clean()/dirty-tree
refusal and --ref history builds exercise real `git` subprocess calls.
AWS is mocked with moto where supported (Lambda, S3, CodeBuild) and a
stub client factory for the one controlled-mismatch case moto can't
naturally produce.
"""

import json
import re
import subprocess

import boto3
import pytest
from moto import mock_aws

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
def deploy_lambdas(load_script):
    return load_script("deploy-lambdas")


def _git(args, cwd):
    result = subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return result.stdout


@pytest.fixture
def git_repo(tmp_path, monkeypatch):
    repo = tmp_path
    _git(["init", "-q"], repo)
    _git(["config", "user.email", "test@example.com"], repo)
    _git(["config", "user.name", "Test"], repo)

    (repo / "lambdas" / "router").mkdir(parents=True)
    (repo / "lambdas" / "router" / "handler.py").write_text(
        "def handler(event, context):\n    return {}\n"
    )

    (repo / "infrastructure" / "lambda_container").mkdir(parents=True)
    (repo / "infrastructure" / "lambda_container" / "Dockerfile").write_text("FROM x\n")
    (repo / "infrastructure" / "lambda_container" / "requirements.txt").write_text("tensorflow-cpu\n")
    (repo / "infrastructure" / "lambda_container" / "inference.py").write_text("# inference\n")
    (repo / "infrastructure" / "lambda_container" / "buildspec.yml").write_text("version: 0.2\n")

    pkg_dir = repo / "infrastructure" / "lambda-packages"
    pkg_dir.mkdir(parents=True)
    (pkg_dir / "router.json").write_text(json.dumps(ROUTER_SPEC))
    (pkg_dir / "inference.json").write_text(json.dumps(INFERENCE_SPEC))
    monkeypatch.setattr(pkg, "PACKAGE_DIR", pkg_dir)

    _git(["add", "-A"], repo)
    _git(["commit", "-q", "-m", "initial"], repo)

    return repo


# --- is_clean ----------------------------------------------------------------


def test_is_clean_true_for_empty_output(deploy_lambdas):
    assert deploy_lambdas.is_clean("") is True
    assert deploy_lambdas.is_clean("   \n") is True


def test_is_clean_false_for_nonempty_output(deploy_lambdas):
    assert deploy_lambdas.is_clean(" M lambdas/router/handler.py\n") is False


# --- --dry-run: no AWS call, prints plan --------------------------------------


def test_dry_run_prints_plan_and_makes_no_aws_call(deploy_lambdas, git_repo, capsys, monkeypatch):
    def _boom(*a, **k):
        raise AssertionError("boto3 client factory must never be invoked in dry-run")

    monkeypatch.setattr(deploy_lambdas, "_client_factory", _boom)

    code = deploy_lambdas.main(["--function", "router", "--dry-run", "--repo-root", str(git_repo)])
    assert code == 0
    out = capsys.readouterr().out
    assert "reefradar-2477-router" in out
    match = re.search(r"code_sha256=([A-Za-z0-9+/=]{44})", out)
    assert match is not None, out


def test_no_confirm_prints_plan_and_exits_zero_without_aws_call(deploy_lambdas, git_repo, capsys):
    def factory(service):
        raise AssertionError("client factory must not be invoked without --confirm")

    code = deploy_lambdas.main(
        ["--function", "router", "--repo-root", str(git_repo)], client_factory=factory
    )
    assert code == 0
    assert "reefradar-2477-router" in capsys.readouterr().out


# --- dirty-tree refusal --------------------------------------------------------


def test_dirty_tree_refused_without_ref(deploy_lambdas, git_repo):
    (git_repo / "lambdas" / "router" / "handler.py").write_text(
        "def handler(event, context):\n    return {'dirty': True}\n"
    )

    def factory(service):
        raise AssertionError("client factory must not be invoked on a dirty-tree refusal")

    code = deploy_lambdas.main(
        ["--function", "router", "--confirm", "--repo-root", str(git_repo)],
        client_factory=factory,
    )
    assert code == 2


def test_clean_tree_with_confirm_but_no_matching_function_not_blocked_by_unrelated_changes(
    deploy_lambdas, git_repo
):
    # A change to an unrelated file (not a deploy-relevant member path) must not block deploy.
    (git_repo / "README.md").write_text("unrelated change\n")

    with mock_aws():
        iam = boto3.client("iam", region_name="us-east-1")
        role = iam.create_role(RoleName="test-role", AssumeRolePolicyDocument="{}")["Role"]["Arn"]
        lambda_client = boto3.client("lambda", region_name="us-east-1")
        router_spec = pkg.load_spec("router")
        seed_bytes = pkg.build_package(router_spec, git_repo)
        lambda_client.create_function(
            FunctionName="reefradar-2477-router",
            Runtime="python3.11",
            Role=role,
            Handler="handler.handler",
            Code={"ZipFile": seed_bytes},
        )

        def factory(service):
            assert service == "lambda"
            return lambda_client

        code = deploy_lambdas.main(
            ["--function", "router", "--confirm", "--repo-root", str(git_repo)],
            client_factory=factory,
        )
        assert code == 0


# --- --ref: builds from git history, skips dirty-tree check --------------------


def test_ref_build_skips_dirty_check_and_uses_resolved_commit(deploy_lambdas, git_repo, capsys):
    head = _git(["rev-parse", "HEAD"], git_repo).strip()
    (git_repo / "lambdas" / "router" / "handler.py").write_text(
        "def handler(event, context):\n    return {'dirty': True}\n"
    )

    code = deploy_lambdas.main(
        ["--function", "router", "--dry-run", "--ref", head, "--repo-root", str(git_repo)]
    )
    assert code == 0
    assert head in capsys.readouterr().out


def test_ref_build_uses_committed_content_not_working_tree(deploy_lambdas, git_repo):
    head = _git(["rev-parse", "HEAD"], git_repo).strip()
    committed_bytes = pkg.build_package(pkg.load_spec("router"), git_repo)

    (git_repo / "lambdas" / "router" / "handler.py").write_text(
        "def handler(event, context):\n    return {'dirty': True}\n"
    )

    with mock_aws():
        iam = boto3.client("iam", region_name="us-east-1")
        role = iam.create_role(RoleName="test-role", AssumeRolePolicyDocument="{}")["Role"]["Arn"]
        lambda_client = boto3.client("lambda", region_name="us-east-1")
        lambda_client.create_function(
            FunctionName="reefradar-2477-router",
            Runtime="python3.11",
            Role=role,
            Handler="handler.handler",
            Code={"ZipFile": committed_bytes},
        )

        def factory(service):
            return lambda_client

        code = deploy_lambdas.main(
            ["--function", "router", "--confirm", "--ref", head, "--repo-root", str(git_repo)],
            client_factory=factory,
        )
        assert code == 0
        updated = lambda_client.get_function(FunctionName="reefradar-2477-router")
        assert updated["Configuration"]["CodeSha256"] == pkg.code_sha256(committed_bytes)


def test_invalid_ref_exits_two(deploy_lambdas, git_repo):
    code = deploy_lambdas.main(
        ["--function", "router", "--dry-run", "--ref", "not-a-real-ref", "--repo-root", str(git_repo)]
    )
    assert code == 2


# --- confirmed zip deploy: update_function_code + waiter + CodeSha256 check ----


def test_confirmed_deploy_updates_function_and_verifies_sha(deploy_lambdas, git_repo):
    router_spec = pkg.load_spec("router")
    seed_bytes = pkg.build_package(router_spec, git_repo)
    seed_sha = pkg.code_sha256(seed_bytes)

    with mock_aws():
        iam = boto3.client("iam", region_name="us-east-1")
        role = iam.create_role(RoleName="test-role", AssumeRolePolicyDocument="{}")["Role"]["Arn"]
        lambda_client = boto3.client("lambda", region_name="us-east-1")
        lambda_client.create_function(
            FunctionName="reefradar-2477-router",
            Runtime="python3.11",
            Role=role,
            Handler="handler.handler",
            Code={"ZipFile": seed_bytes},
        )

        def factory(service):
            assert service == "lambda"
            return lambda_client

        code = deploy_lambdas.main(
            ["--function", "router", "--confirm", "--repo-root", str(git_repo)],
            client_factory=factory,
        )
        assert code == 0

        updated = lambda_client.get_function(FunctionName="reefradar-2477-router")
        assert updated["Configuration"]["CodeSha256"] == seed_sha


def test_mismatched_deployed_sha_exits_one(deploy_lambdas, git_repo):
    class _FakeWaiter:
        def wait(self, **kwargs):
            pass

    class _FakeLambdaClient:
        def update_function_code(self, **kwargs):
            return {"CodeSha256": "not-the-real-hash"}

        def get_waiter(self, name):
            return _FakeWaiter()

    def factory(service):
        assert service == "lambda"
        return _FakeLambdaClient()

    code = deploy_lambdas.main(
        ["--function", "router", "--confirm", "--repo-root", str(git_repo)],
        client_factory=factory,
    )
    assert code == 1


def test_deploy_prints_json_line_with_function_git_sha_code_sha256_timestamp(
    deploy_lambdas, git_repo, capsys
):
    router_spec = pkg.load_spec("router")
    seed_bytes = pkg.build_package(router_spec, git_repo)

    with mock_aws():
        iam = boto3.client("iam", region_name="us-east-1")
        role = iam.create_role(RoleName="test-role", AssumeRolePolicyDocument="{}")["Role"]["Arn"]
        lambda_client = boto3.client("lambda", region_name="us-east-1")
        lambda_client.create_function(
            FunctionName="reefradar-2477-router",
            Runtime="python3.11",
            Role=role,
            Handler="handler.handler",
            Code={"ZipFile": seed_bytes},
        )

        def factory(service):
            return lambda_client

        code = deploy_lambdas.main(
            ["--function", "router", "--confirm", "--repo-root", str(git_repo)],
            client_factory=factory,
        )
        assert code == 0

    out = capsys.readouterr().out
    json_lines = [line for line in out.splitlines() if line.strip().startswith("{")]
    assert len(json_lines) == 1
    record = json.loads(json_lines[0])
    assert record["function"] == "reefradar-2477-router"
    assert set(("git_sha", "code_sha256", "timestamp")) <= set(record)


# --- inference (container): zip source bundle, upload to S3, start CodeBuild ---


def test_inference_dry_run_plans_codebuild_upload(deploy_lambdas, git_repo, capsys):
    code = deploy_lambdas.main(["--function", "inference", "--dry-run", "--repo-root", str(git_repo)])
    assert code == 0
    out = capsys.readouterr().out
    assert "reefradar-2477-inference" in out


def test_confirmed_inference_deploy_uploads_source_and_starts_build(deploy_lambdas, git_repo):
    with mock_aws():
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="reefradar-2477-codebuild-artifacts")

        iam = boto3.client("iam", region_name="us-east-1")
        role = iam.create_role(RoleName="cb-role", AssumeRolePolicyDocument="{}")["Role"]["Arn"]

        codebuild = boto3.client("codebuild", region_name="us-east-1")
        codebuild.create_project(
            name="reefradar-2477-inference-build",
            source={"type": "S3", "location": "reefradar-2477-codebuild-artifacts/inference-source.zip"},
            artifacts={"type": "NO_ARTIFACTS"},
            environment={
                "type": "LINUX_CONTAINER",
                "image": "x",
                "computeType": "BUILD_GENERAL1_SMALL",
            },
            serviceRole=role,
        )

        def factory(service):
            return {"s3": s3, "codebuild": codebuild}[service]

        code = deploy_lambdas.main(
            ["--function", "inference", "--confirm", "--repo-root", str(git_repo)],
            client_factory=factory,
        )
        assert code == 0

        obj = s3.get_object(Bucket="reefradar-2477-codebuild-artifacts", Key="inference-source.zip")
        assert len(obj["Body"].read()) > 0


# --- build_inference_source_zip: deterministic, flat member names --------------


def test_build_inference_source_zip_is_deterministic_and_flat(deploy_lambdas, git_repo):
    a = deploy_lambdas.build_inference_source_zip(git_repo)
    b = deploy_lambdas.build_inference_source_zip(git_repo)
    assert a == b
    manifest = pkg.manifest_from_zip(a)
    assert set(manifest) == {"Dockerfile", "requirements.txt", "inference.py", "buildspec.yml"}


# --- CR-03: package spec is part of the "clean committed tree" -----------------


def test_dirty_package_spec_refused_without_ref(deploy_lambdas, git_repo):
    spec_path = git_repo / "infrastructure" / "lambda-packages" / "router.json"
    spec = json.loads(spec_path.read_text())
    spec["members"].append({"source": "lambdas/router/handler.py", "archive_path": "extra.py"})
    spec_path.write_text(json.dumps(spec))

    def factory(service):
        raise AssertionError("client factory must not be invoked on a dirty-spec refusal")

    code = deploy_lambdas.main(
        ["--function", "router", "--confirm", "--repo-root", str(git_repo)],
        client_factory=factory,
    )
    assert code == 2


def test_ref_build_reads_package_spec_from_ref_not_working_tree(deploy_lambdas, git_repo, capsys):
    head = _git(["rev-parse", "HEAD"], git_repo).strip()
    committed_sha = pkg.code_sha256(pkg.build_package(pkg.load_spec("router"), git_repo))

    # Working-tree spec now lists a member that does not exist at the ref.
    spec_path = git_repo / "infrastructure" / "lambda-packages" / "router.json"
    spec = json.loads(spec_path.read_text())
    spec["members"].append({"source": "lambdas/router/new_member.json", "archive_path": "new_member.json"})
    spec_path.write_text(json.dumps(spec))

    code = deploy_lambdas.main(
        ["--function", "router", "--dry-run", "--ref", head, "--repo-root", str(git_repo)]
    )
    assert code == 0
    out = capsys.readouterr().out
    assert "1 member(s)" in out
    assert committed_sha in out


def test_ref_without_package_spec_exits_two(deploy_lambdas, git_repo):
    _git(["rm", "-q", "infrastructure/lambda-packages/router.json"], git_repo)
    _git(["commit", "-q", "-m", "drop spec"], git_repo)
    code = deploy_lambdas.main(
        ["--function", "router", "--dry-run", "--ref", "HEAD", "--repo-root", str(git_repo)]
    )
    assert code == 2
