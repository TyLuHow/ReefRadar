#!/usr/bin/env python
"""
D-04: Single scripted Lambda deploy path.

Builds every function deterministically from the committed git tree (or,
with --ref, from a past commit -- the rollback path) and refuses to
deploy from a dirty working tree. This is the only path allowed to touch
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
import subprocess
import sys
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
CODEBUILD_KEY = "inference-source.zip"
CODEBUILD_PROJECT = "reefradar-2477-inference-build"


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


def deploy_inference_function(spec, repo_root, reader, factory, confirm, dry_run):
    source_bytes = build_inference_source_zip(repo_root, reader=reader)
    local_sha = pkg.code_sha256(source_bytes)
    plan = {
        "function": spec["function_name"],
        "members": len(INFERENCE_SOURCE_MEMBERS),
        "code_sha256": local_sha,
        "s3_key": f"s3://{CODEBUILD_BUCKET}/{CODEBUILD_KEY}",
        "codebuild_project": CODEBUILD_PROJECT,
    }

    if dry_run or not confirm:
        return plan, None

    s3_client = factory("s3")
    s3_client.put_object(Bucket=CODEBUILD_BUCKET, Key=CODEBUILD_KEY, Body=source_bytes)

    codebuild_client = factory("codebuild")
    build_resp = codebuild_client.start_build(projectName=CODEBUILD_PROJECT)
    build_id = build_resp["build"]["id"]
    print(f"  started CodeBuild: {build_id}")
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
        specs = {fn: pkg.load_spec(fn) for fn in args.functions}

        if args.ref is not None:
            resolved_ref = resolve_ref(args.ref, repo_root)
            reader = git_show_reader(resolved_ref)
            git_sha = resolved_ref
            # Dirty-tree check intentionally skipped: --ref builds read committed
            # history via `git show`, never the working tree.
        else:
            reader = None
            git_sha = head_sha(repo_root)
            if args.confirm and not args.dry_run:
                deploy_paths = set()
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
                    spec, repo_root, reader, factory, args.confirm, args.dry_run
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
        print(json.dumps(record))

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
