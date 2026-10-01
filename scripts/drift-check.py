#!/usr/bin/env python
"""
D-03: Lambda deployment drift check.

Builds each function deterministically from git and compares it against
what's actually deployed -- offline (a fixture zip or a directory of
fixture container layer tarballs) or live (the real reefradar-2477-*
functions, used from plan 01-09 onward).

Exit codes: 0 = match, 1 = drift (missing/extra/changed files named on
stdout), 2 = error (unknown function name, unreadable/missing input, or ANY
tool/AWS/network failure -- an outage is reported as an error, never as
drift). Only the exception type name is printed for unexpected failures, so
a presigned URL carried in an exception message can never reach the log.

Never prints a presigned Code.Location URL and never includes an
environment variable's value (only its name) in a --json report.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import urllib.request

import lambda_packaging as pkg

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent


def build_config_summary(configuration: dict) -> dict:
    """Facts safe to report about a deployed function's configuration.

    Environment variable NAMES only -- never their values -- so a drift
    report can never leak a secret stashed in Lambda environment config.
    """
    env_vars = (configuration.get("Environment") or {}).get("Variables") or {}
    layers = configuration.get("Layers") or []
    return {
        "Runtime": configuration.get("Runtime"),
        "Handler": configuration.get("Handler"),
        "MemorySize": configuration.get("MemorySize"),
        "Timeout": configuration.get("Timeout"),
        "PackageType": configuration.get("PackageType"),
        "Layers": sorted(layer.get("Arn") for layer in layers if layer.get("Arn")),
        "EnvironmentVariableNames": sorted(env_vars.keys()),
    }


def check_offline_zip(function_name: str, deployed_zip_path, repo_root) -> dict:
    spec = pkg.load_spec(function_name)
    if spec.get("kind") != "zip":
        raise pkg.SpecError(f"{function_name} is not a zip-kind function; use --layers-dir")
    local_bytes = pkg.build_package(spec, repo_root)
    expected = pkg.manifest_from_zip(local_bytes)
    try:
        deployed_bytes = pathlib.Path(deployed_zip_path).read_bytes()
    except OSError as e:
        raise pkg.SpecError(f"Could not read --deployed-zip {deployed_zip_path}: {e}") from e
    actual = pkg.manifest_from_zip(deployed_bytes)
    return pkg.compare_manifests(expected, actual)


def check_offline_layers(function_name: str, layers_dir, repo_root) -> dict:
    spec = pkg.load_spec(function_name)
    if spec.get("kind") != "container":
        raise pkg.SpecError(f"{function_name} is not a container-kind function; use --deployed-zip")
    layers_dir = pathlib.Path(layers_dir)
    if not layers_dir.is_dir():
        raise pkg.SpecError(f"--layers-dir {layers_dir} is not a directory")
    layer_paths = sorted(layers_dir.glob("*.tar.gz")) + sorted(layers_dir.glob("*.tgz"))
    if not layer_paths:
        raise pkg.SpecError(f"No *.tar.gz / *.tgz layer fixtures found in {layers_dir}")
    layer_blobs = [p.read_bytes() for p in layer_paths]
    wanted = {m["archive_path"] for m in spec["members"]}
    actual = pkg.manifest_from_layers(
        layer_blobs, workdir=spec.get("image_workdir", "var/task"), wanted=wanted
    )
    expected = pkg.manifest_from_spec(spec, repo_root)
    return pkg.compare_manifests(expected, actual)


DOWNLOAD_TIMEOUT_S = 60


def _download(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT_S) as resp:
        return resp.read()


def _load_image_manifest(ecr_client, repo_name: str, digest: str) -> dict:
    """The single-image manifest (with `layers`) for `digest`.

    A multi-arch OCI index / Docker manifest list has `manifests`, not
    `layers`; resolve it to its linux/amd64 child first, otherwise every file
    would be reported "missing" (false drift)."""
    resp = ecr_client.batch_get_image(repositoryName=repo_name, imageIds=[{"imageDigest": digest}])
    if not resp.get("images"):
        raise pkg.SpecError(f"ECR image not found for digest {digest}")
    manifest = json.loads(resp["images"][0]["imageManifest"])

    if "layers" not in manifest and manifest.get("manifests"):
        child = next(
            (
                m for m in manifest["manifests"]
                if (m.get("platform") or {}).get("os") == "linux"
                and (m.get("platform") or {}).get("architecture") == "amd64"
            ),
            None,
        )
        if child is None:
            raise pkg.SpecError("image index has no linux/amd64 manifest")
        resp = ecr_client.batch_get_image(repositoryName=repo_name, imageIds=[{"imageDigest": child["digest"]}])
        if not resp.get("images"):
            raise pkg.SpecError(f"ECR child image not found for digest {child['digest']}")
        manifest = json.loads(resp["images"][0]["imageManifest"])

    if not manifest.get("layers"):
        raise pkg.SpecError("image manifest has no layers; cannot compare files")
    return manifest


def check_live(function_name: str, spec: dict, profile: str, region: str, repo_root):
    """Live mode (plan 01-09 onward). Fast path: compare Lambda's reported
    CodeSha256 against the local build's code_sha256 -- if they match, no
    download is needed at all. Only on a mismatch do we download the
    deployed artifact to produce a per-file manifest diff.
    """
    import boto3  # local import: keeps offline tests boto3-independent

    from botocore.config import Config  # local import, same reason as boto3

    client_config = Config(connect_timeout=10, read_timeout=60, retries={"max_attempts": 3})
    session = boto3.Session(profile_name=profile, region_name=region)
    lambda_client = session.client("lambda", config=client_config)
    resp = lambda_client.get_function(FunctionName=spec["function_name"])
    configuration = resp["Configuration"]
    config_summary = build_config_summary(configuration)

    if spec["kind"] == "zip":
        local_bytes = pkg.build_package(spec, repo_root)
        local_sha = pkg.code_sha256(local_bytes)
        if configuration.get("CodeSha256") == local_sha:
            return {"missing": [], "extra": [], "changed": []}, config_summary
        deployed_bytes = _download(resp["Code"]["Location"])
        expected = pkg.manifest_from_zip(local_bytes)
        actual = pkg.manifest_from_zip(deployed_bytes)
        return pkg.compare_manifests(expected, actual), config_summary

    if spec["kind"] == "container":
        ecr_client = session.client("ecr", config=client_config)
        image_uri = resp["Code"].get("ResolvedImageUri", "")
        if "@" not in image_uri:
            raise pkg.SpecError(f"No resolved image digest for {function_name}: {image_uri!r}")
        digest = image_uri.rsplit("@", 1)[-1]
        repo_name = spec["ecr_repository"]
        image_manifest = _load_image_manifest(ecr_client, repo_name, digest)
        layer_blobs = []
        for layer in image_manifest.get("layers", []):
            layer_resp = ecr_client.get_download_url_for_layer(
                repositoryName=repo_name, layerDigest=layer["digest"]
            )
            layer_blobs.append(_download(layer_resp["downloadUrl"]))
        wanted = {m["archive_path"] for m in spec["members"]}
        actual = pkg.manifest_from_layers(
            layer_blobs, workdir=spec.get("image_workdir", "var/task"), wanted=wanted
        )
        expected = pkg.manifest_from_spec(spec, repo_root)
        return pkg.compare_manifests(expected, actual), config_summary

    raise pkg.SpecError(f"Unknown spec kind {spec.get('kind')!r} for {function_name}")


def _print_report(function_name, report, as_json, config_summary=None):
    if as_json:
        payload = {"function": function_name, "report": report}
        if config_summary is not None:
            payload["config_summary"] = config_summary
        print(json.dumps(payload))
        return

    if pkg.manifest_matches(report):
        print(f"{function_name}: MATCH")
        return
    print(f"{function_name}: DRIFT")
    for path in report["missing"]:
        print(f"  missing: {path}")
    for path in report["extra"]:
        print(f"  extra: {path}")
    for path in report["changed"]:
        print(f"  changed: {path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="D-03: Lambda deployment drift check")
    parser.add_argument(
        "--function",
        default="all",
        choices=list(pkg.VALID_FUNCTIONS) + ["all"],
        help="router | preprocessor | classifier | inference | all (default)",
    )
    parser.add_argument(
        "--deployed-zip",
        type=pathlib.Path,
        default=None,
        help="Offline mode: compare against this already-downloaded zip (zip-kind functions only)",
    )
    parser.add_argument(
        "--layers-dir",
        type=pathlib.Path,
        default=None,
        help="Offline mode: compare against *.tar.gz layer blobs in this directory (container-kind functions only)",
    )
    parser.add_argument("--profile", default="reefradar")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--repo-root", type=pathlib.Path, default=REPO_ROOT)
    parser.add_argument("--json", action="store_true", dest="as_json", help="Machine-readable report")
    return parser


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    functions = list(pkg.VALID_FUNCTIONS) if args.function == "all" else [args.function]

    any_drift = False
    had_error = False
    for function_name in functions:
        try:
            spec = pkg.load_spec(function_name)
            if args.deployed_zip is not None:
                report = check_offline_zip(function_name, args.deployed_zip, args.repo_root)
                config_summary = None
            elif args.layers_dir is not None:
                report = check_offline_layers(function_name, args.layers_dir, args.repo_root)
                config_summary = None
            else:
                report, config_summary = check_live(
                    function_name, spec, args.profile, args.region, args.repo_root
                )
        except pkg.SpecError as e:
            print(f"error: {e}", file=sys.stderr)
            had_error = True
            continue
        except Exception as e:  # noqa: BLE001 -- tool/AWS/network failure is an error, not drift
            # Type name only: messages (botocore/urllib) can carry presigned URLs.
            print(f"error: {function_name}: check failed ({type(e).__name__})", file=sys.stderr)
            had_error = True
            continue

        _print_report(function_name, report, args.as_json, config_summary)
        if not pkg.manifest_matches(report):
            any_drift = True

    if had_error:
        return 2
    if any_drift:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
