#!/usr/bin/env python
"""
D-04: Single scripted Lambda deploy path.

Builds every function deterministically from the committed git tree (or,
with --ref, from a past commit -- the rollback path) and refuses to
deploy from a dirty working tree. The dirty check covers the member
sources, the package spec(s) and scripts/lambda_packaging.py; with --ref
both the members and the package spec are read from that commit (the
packaging code itself, scripts/lambda_packaging.py, is always the current
one). This is the only path allowed to touch
reefradar-2477-* Lambda code; no console edits (CLAUDE.md "Deployment").

Non-dry-run calls require --confirm; without it the script only prints
what it would do. subprocess is used, as an argument list, only for
`git status --porcelain -- <paths>`, `git rev-parse`, and
`git show <ref>:<path>` -- never through a shell interpreter.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

import lambda_packaging as pkg

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent

INFERENCE_SOURCE_MEMBERS = [
    "infrastructure/lambda_container/Dockerfile",
    "infrastructure/lambda_container/requirements.txt",
    "infrastructure/lambda_container/inference.py",
    "infrastructure/lambda_container/buildspec.yml",
]
CODEBUILD_BUCKET = "reefradar-2477-codebuild-artifacts"
CODEBUILD_KEY_PREFIX = "inference-source/"
CODEBUILD_PROJECT = "reefradar-2477-inference-build"
ECR_REPOSITORY = "reefradar-2477-inference"
INFERENCE_IMAGE_TAG = "latest"
BUILD_TERMINAL_STATES = {"SUCCEEDED", "FAILED", "FAULT", "STOPPED", "TIMED_OUT"}
BUILD_POLL_INTERVAL_S = 15
BUILD_TIMEOUT_S = 1800


class DeployError(RuntimeError):
    """Raised for any condition that must stop the deploy: dirty tree,
    bad --ref, git failure, or a post-deploy CodeSha256 mismatch."""


def _run_git(args, repo_root) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=str(repo_root), capture_output=True, text=True
    )


def is_clean(porcelain_text: str) -> bool:
    """True only when `git status --porcelain -- <paths>` output is empty."""
    return porcelain_text.strip() == ""


def git_status_porcelain(paths, repo_root) -> str:
    result = _run_git(["status", "--porcelain", "--", *paths], repo_root)
    if result.returncode != 0:
        raise DeployError(f"git status failed: {result.stderr.strip()}")
    return result.stdout


def resolve_ref(ref: str, repo_root) -> str:
    result = _run_git(["rev-parse", "--verify", f"{ref}^{{commit}}"], repo_root)
    if result.returncode != 0:
        raise DeployError(f"Invalid --ref {ref!r}: {result.stderr.strip()}")
    return result.stdout.strip()


def head_sha(repo_root) -> str:
    result = _run_git(["rev-parse", "HEAD"], repo_root)
    if result.returncode != 0:
        raise DeployError(f"git rev-parse HEAD failed: {result.stderr.strip()}")
    return result.stdout.strip()


def git_show_reader(ref: str):
    """A build_package-compatible reader backed by `git show <ref>:<path>`,
    so --ref builds read committed history instead of the working tree."""

    def reader(repo_root, source):
        result = subprocess.run(
            ["git", "show", f"{ref}:{source}"], cwd=str(repo_root), capture_output=True
        )
        if result.returncode != 0:
            raise DeployError(
                f"git show {ref}:{source} failed: "
                f"{result.stderr.decode(errors='replace').strip()}"
            )
        return pkg.normalize_text_bytes(result.stdout)

    return reader


def git_show_spec_text(ref: str, function_name: str, repo_root) -> str:
    """The package spec for `function_name` exactly as committed at `ref`.

    A --ref rollback must use the member list that commit actually shipped,
    not whatever the working-tree spec says today (REVIEW CR-03)."""
    spec_path = pkg.spec_repo_path(function_name)
    result = subprocess.run(
        ["git", "show", f"{ref}:{spec_path}"], cwd=str(repo_root), capture_output=True
    )
    if result.returncode != 0:
        raise DeployError(
            f"cannot read package spec {spec_path} at {ref}: "
            f"{result.stderr.decode(errors='replace').strip()} "
            "(this commit predates the scripted-deploy package specs; "
            "roll back with a ref that contains them)"
        )
    return result.stdout.decode("utf-8")


def build_inference_source_zip(repo_root, reader=None) -> bytes:
    """Deterministically zip the four CodeBuild source files, flattened to
    the archive root (matches the existing `zip -r ... Dockerfile
    requirements.txt inference.py buildspec.yml` layout CodeBuild expects)."""
    spec = {
        "kind": "zip",
        "members": [
            {"source": src, "archive_path": pathlib.Path(src).name}
            for src in INFERENCE_SOURCE_MEMBERS
        ],
    }
    return pkg.build_package(spec, repo_root, reader=reader)


def _client_factory(profile: str, region: str):
    import boto3  # local import: live/--confirm path only

    session = boto3.Session(profile_name=profile, region_name=region)
    return session.client


def deploy_zip_function(spec, repo_root, reader, factory, confirm, dry_run):
    local_bytes = pkg.build_package(spec, repo_root, reader=reader)
    local_sha = pkg.code_sha256(local_bytes)
    plan = {"function": spec["function_name"], "members": len(spec["members"]), "code_sha256": local_sha}

    if dry_run or not confirm:
        return plan, None

    lambda_client = factory("lambda")
    resp = lambda_client.update_function_code(
        FunctionName=spec["function_name"], ZipFile=local_bytes, Publish=False
    )
    waiter = lambda_client.get_waiter("function_updated")
    waiter.wait(FunctionName=spec["function_name"])

    deployed_sha = resp.get("CodeSha256")
    if deployed_sha != local_sha:
        raise DeployError(
            f"{spec['function_name']}: deployed CodeSha256 {deployed_sha!r} != local {local_sha!r}"
        )
    return plan, deployed_sha


def inference_source_key(git_sha: str) -> str:
    """Immutable, per-commit S3 key for the CodeBuild source zip.

    A single shared key let two overlapping deploys overwrite each other, so
    the commit recorded for a deploy might not be what CodeBuild built."""
    if not re.fullmatch(r"[0-9a-f]{7,64}", git_sha):
        raise DeployError(f"refusing to build an S3 key from a non-hex git sha: {git_sha!r}")
    return f"{CODEBUILD_KEY_PREFIX}{git_sha}.zip"


def wait_for_build(codebuild_client, build_id, poll_interval=BUILD_POLL_INTERVAL_S,
                   timeout_s=BUILD_TIMEOUT_S, sleep=time.sleep, clock=time.monotonic) -> str:
    """Poll the CodeBuild build to a terminal state; raise unless it SUCCEEDED."""
    deadline = clock() + timeout_s
    while True:
        builds = codebuild_client.batch_get_builds(ids=[build_id]).get("builds", [])
        status = builds[0].get("buildStatus") if builds else None
        if status in BUILD_TERMINAL_STATES:
            if status != "SUCCEEDED":
                raise DeployError(f"CodeBuild {build_id} finished with status {status}")
            return status
        if clock() >= deadline:
            raise DeployError(f"CodeBuild {build_id} did not finish within {timeout_s}s (last status {status})")
        sleep(poll_interval)


def resolve_inference_image(factory, function_name):
    """(ecr_digest, lambda_resolved_image_uri) after a build; raises on mismatch.

    The source-zip sha256 is NOT what Lambda runs -- the image digest is. This
    resolves the freshly pushed image and checks the inference function is
    actually running it."""
    ecr = factory("ecr")
    details = ecr.describe_images(
        repositoryName=ECR_REPOSITORY, imageIds=[{"imageTag": INFERENCE_IMAGE_TAG}]
    ).get("imageDetails", [])
    if not details:
        raise DeployError(f"ECR image {ECR_REPOSITORY}:{INFERENCE_IMAGE_TAG} not found after build")
    digest = details[0]["imageDigest"]
    resolved = factory("lambda").get_function(FunctionName=function_name)["Code"].get("ResolvedImageUri", "")
    if digest not in resolved:
        raise DeployError(
            f"{function_name} is running {resolved or 'an unknown image'}, not the freshly built {digest}"
        )
    return digest, resolved


def deploy_inference_function(spec, repo_root, reader, factory, confirm, dry_run,
                              git_sha=None, wait=True, poll_interval=BUILD_POLL_INTERVAL_S,
                              timeout_s=BUILD_TIMEOUT_S, sleep=time.sleep):
    source_bytes = build_inference_source_zip(repo_root, reader=reader)
    local_sha = pkg.code_sha256(source_bytes)
    key = inference_source_key(git_sha if git_sha is not None else head_sha(repo_root))
    plan = {
        "function": spec["function_name"],
        "members": len(INFERENCE_SOURCE_MEMBERS),
        "code_sha256": local_sha,
        "s3_key": f"s3://{CODEBUILD_BUCKET}/{key}",
        "codebuild_project": CODEBUILD_PROJECT,
    }

    if dry_run or not confirm:
        return plan, None

    s3_client = factory("s3")
    s3_client.put_object(Bucket=CODEBUILD_BUCKET, Key=key, Body=source_bytes)

    codebuild_client = factory("codebuild")
    build_resp = codebuild_client.start_build(
        projectName=CODEBUILD_PROJECT,
        sourceLocationOverride=f"{CODEBUILD_BUCKET}/{key}",
    )
    build_id = build_resp["build"]["id"]
    print(f"  started CodeBuild: {build_id}")
    if wait:
        wait_for_build(codebuild_client, build_id, poll_interval=poll_interval,
                       timeout_s=timeout_s, sleep=sleep)
        digest, _ = resolve_inference_image(factory, spec["function_name"])
        plan["image_digest"] = digest
        print(f"  build succeeded; image digest {digest}")
    return plan, build_id


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="D-04: Single scripted Lambda deploy path")
    parser.add_argument(
        "--function",
        action="append",
        choices=list(pkg.VALID_FUNCTIONS),
        dest="functions",
        required=True,
        help="Repeatable. One of router, preprocessor, classifier, inference.",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--no-wait", action="store_true",
        help="inference only: start the CodeBuild build and return without waiting for it / verifying the image digest",
    )
    parser.add_argument(
        "--ref", default=None, help="Deploy from this past commit instead of the working tree (rollback)"
    )
    parser.add_argument("--profile", default="reefradar")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--confirm", action="store_true", help="Required for any real AWS call")
    parser.add_argument("--repo-root", type=pathlib.Path, default=REPO_ROOT)
    return parser


def main(argv=None, client_factory=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    repo_root = args.repo_root

    try:
        if args.ref is not None:
            resolved_ref = resolve_ref(args.ref, repo_root)
            reader = git_show_reader(resolved_ref)
            git_sha = resolved_ref
            # Dirty-tree check intentionally skipped: --ref builds read committed
            # history via `git show`, never the working tree. That includes the
            # package spec (member list), which is read from the ref too (CR-03).
            specs = {
                fn: pkg.load_spec(fn, spec_text=git_show_spec_text(resolved_ref, fn, repo_root))
                for fn in args.functions
            }
        else:
            specs = {fn: pkg.load_spec(fn) for fn in args.functions}
            reader = None
            git_sha = head_sha(repo_root)
            if args.confirm and not args.dry_run:
                # The spec files and the packaging library decide what goes into
                # the zip, so they must be committed too (not just the members).
                deploy_paths = {"scripts/lambda_packaging.py"}
                deploy_paths.update(pkg.spec_repo_path(fn) for fn in args.functions)
                for spec in specs.values():
                    if spec["kind"] == "zip":
                        deploy_paths.update(m["source"] for m in spec["members"])
                    else:
                        deploy_paths.update(INFERENCE_SOURCE_MEMBERS)
                porcelain = git_status_porcelain(sorted(deploy_paths), repo_root)
                if not is_clean(porcelain):
                    print("error: working tree is dirty for deploy-relevant paths:", file=sys.stderr)
                    print(porcelain, file=sys.stderr)
                    return 2
    except pkg.SpecError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    except DeployError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    factory = None
    if not args.dry_run and args.confirm:
        factory = client_factory if client_factory is not None else _client_factory(args.profile, args.region)

    exit_code = 0
    for fn in args.functions:
        spec = specs[fn]
        try:
            if spec["kind"] == "zip":
                plan, result = deploy_zip_function(spec, repo_root, reader, factory, args.confirm, args.dry_run)
            else:
                plan, result = deploy_inference_function(
                    spec, repo_root, reader, factory, args.confirm, args.dry_run,
                    git_sha=git_sha, wait=not args.no_wait,
                )
        except DeployError as e:
            print(f"error: {e}", file=sys.stderr)
            exit_code = 1
            continue

        print(
            f"{plan['function']}: {plan['members']} member(s), "
            f"code_sha256={plan['code_sha256']}, git_sha={git_sha}"
        )

        if args.dry_run:
            print("  [dry-run] no AWS call made")
            continue
        if not args.confirm:
            print("  [no --confirm] would deploy; no AWS call made")
            continue

        record = {
            "function": plan["function"],
            "git_sha": git_sha,
            "code_sha256": plan["code_sha256"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if spec["kind"] == "container":
            record["codebuild_build_id"] = result
            record["source_s3_key"] = plan["s3_key"]
            if "image_digest" in plan:
                record["image_digest"] = plan["image_digest"]
        print(json.dumps(record))

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
