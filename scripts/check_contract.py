#!/usr/bin/env python3
"""
Phase 2 (CONTRACT-01): integrity and schema check of every committed contract bundle.

`--check` walks every contracts/bucket/contract/v*.json manifest and verifies:

  - the manifest validates against contracts/schema/contract-manifest.schema.json
    and is not marked "fixture": true (a fixture must never reach the bucket);
  - every artifact uri stays inside the bucket root (no "..", scheme or leading
    slash), the file exists, and its sha256 and byte length equal the manifest entry;
  - every JSON file is LF-only and equals the canonical serialisation of its own
    parsed value (so a CRLF checkout or a hand edit is caught);
  - sites.json items validate against site.schema.json; the model, preprocessing
    spec and stamp validate against their schemas; the stamp equals the version
    fields of the manifest; the coverage counts equal counts recomputed from
    sites.json; each schema copy equals its contracts/schema source.

Exit 0 when everything passes; exit 1 with one line per failure otherwise.

Usage:
    py -3.12 scripts/check_contract.py --check
    py -3.12 scripts/check_contract.py --check --contracts-dir <copy of contracts/>
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import contract_lib  # noqa: E402

SAFE_URI = re.compile(r"^(contract|v[0-9]+)/[A-Za-z0-9_./-]+$")


def _iter_artifacts(artifacts: dict):
    """Yield (label, entry) for every artifact entry, flattening the schemas group."""
    for name, entry in artifacts.items():
        if name == "schemas" and isinstance(entry, dict):
            for schema_name, schema_entry in entry.items():
                yield f"schemas.{schema_name}", schema_entry
        else:
            yield name, entry


def _json_file_problems(rel: str, raw: bytes) -> list[str]:
    problems = []
    if b"\r" in raw:
        problems.append(f"{rel}: contains CRLF line endings (contract JSON must be LF-only)")
        return problems
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return [f"{rel}: not valid UTF-8 JSON ({exc})"]
    if contract_lib.canonical_json_bytes(parsed) != raw:
        problems.append(f"{rel}: is not in canonical JSON form (sorted keys, indent 2, trailing newline)")
    return problems


def _schema_problems(rel: str, instance, stem: str, schema_dir: pathlib.Path) -> list[str]:
    return [f"{rel}: schema {stem}: {line}" for line in contract_lib.validation_errors(instance, stem, schema_dir)]


def check_manifest(manifest_path: pathlib.Path, contracts_dir: pathlib.Path) -> list[str]:
    bucket = contracts_dir / "bucket"
    schema_dir = contracts_dir / "schema"
    rel_manifest = manifest_path.relative_to(contracts_dir).as_posix()
    raw = manifest_path.read_bytes()
    problems = _json_file_problems(rel_manifest, raw)
    try:
        manifest = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return problems
    problems += _schema_problems(rel_manifest, manifest, "contract-manifest", schema_dir)
    if manifest.get("fixture") is True:
        problems.append(f"{rel_manifest}: manifest is marked fixture true and must never be in the bucket bundle")

    artifacts = manifest.get("artifacts") if isinstance(manifest.get("artifacts"), dict) else {}
    loaded: dict[str, object] = {}
    bucket_root = bucket.resolve()
    for label, entry in _iter_artifacts(artifacts):
        if not isinstance(entry, dict) or entry.get("present") is False:
            continue
        uri = entry.get("uri")
        if not isinstance(uri, str) or not SAFE_URI.match(uri) or ".." in uri:
            problems.append(f"{rel_manifest}: artifact {label} uri {uri!r} is not a safe relative bucket path")
            continue
        path = (bucket / uri).resolve()
        if bucket_root not in path.parents:
            problems.append(f"{rel_manifest}: artifact {label} uri {uri!r} escapes the bucket root")
            continue
        if not path.is_file():
            problems.append(f"{uri}: file missing (artifact {label})")
            continue
        data = path.read_bytes()
        if contract_lib.sha256_hex(data) != entry.get("sha256"):
            problems.append(f"{uri}: sha256 {contract_lib.sha256_hex(data)} != manifest {entry.get('sha256')}")
        if len(data) != entry.get("bytes"):
            problems.append(f"{uri}: {len(data)} bytes != manifest {entry.get('bytes')}")
        if uri.endswith(".json"):
            file_problems = _json_file_problems(uri, data)
            problems += file_problems
            if not file_problems:
                loaded[label] = json.loads(data.decode("utf-8"))
                if label.startswith("schemas."):
                    source = schema_dir / pathlib.PurePosixPath(uri).name
                    if source.is_file() and contract_lib.read_text_input_bytes(source) != data:
                        problems.append(f"{uri}: schema copy differs from {source.relative_to(contracts_dir).as_posix()}")

    problems += _semantic_problems(manifest, artifacts, loaded, schema_dir)
    return problems


def _semantic_problems(manifest: dict, artifacts: dict, loaded: dict, schema_dir: pathlib.Path) -> list[str]:
    problems = []

    sites_doc = loaded.get("sites")
    if sites_doc is not None:
        sites = sites_doc.get("sites") if isinstance(sites_doc, dict) else None
        if not isinstance(sites, list) or sites_doc.get("schema_version") != 1:
            problems.append("sites.json: expected an object with schema_version 1 and a sites array")
        else:
            for record in sites:
                site_id = record.get("site_id", "?") if isinstance(record, dict) else "?"
                problems += _schema_problems(f"sites.json[{site_id}]", record, "site", schema_dir)
            count = artifacts.get("sites", {}).get("count")
            if count is not None and count != len(sites):
                problems.append(f"sites.json: manifest count {count} != {len(sites)} records")
            coverage = manifest.get("coverage") if isinstance(manifest.get("coverage"), dict) else {}
            recomputed = {
                "total_sites": len(sites),
                "sites_with_embeddings": sum(1 for s in sites if s.get("reference_role") == "acoustic_reference"),
                "countries": len({s.get("country") for s in sites}),
            }
            for key, value in recomputed.items():
                if coverage.get(key) != value:
                    problems.append(
                        f"coverage.{key}: manifest says {coverage.get(key)!r}, sites.json has {value}"
                    )

    for label, stem in (
        ("model_version", "model-version"),
        ("preprocessing_spec", "preprocessing-spec"),
        ("stamp", "analysis-result"),
    ):
        if label in loaded:
            problems += _schema_problems(f"{label} artifact", loaded[label], stem, schema_dir)

    stamp = loaded.get("stamp")
    if isinstance(stamp, dict):
        for key in ("contract_version", "dataset_version", "model_version", "preprocessing_spec_version"):
            if stamp.get(key) != manifest.get(key):
                problems.append(
                    f"stamp.{key}: {stamp.get(key)!r} differs from manifest {manifest.get(key)!r}"
                )
    model = loaded.get("model_version")
    if isinstance(model, dict):
        if model.get("model_version") != manifest.get("model_version"):
            problems.append("model_version artifact: model_version differs from manifest")
        if model.get("preprocessing_spec_version") != manifest.get("preprocessing_spec_version"):
            problems.append("model_version artifact: preprocessing_spec_version differs from manifest")
    spec = loaded.get("preprocessing_spec")
    if isinstance(spec, dict) and spec.get("spec_version") != manifest.get("preprocessing_spec_version"):
        problems.append("preprocessing_spec artifact: spec_version differs from manifest preprocessing_spec_version")
    return problems


def check(contracts_dir: pathlib.Path) -> list[str]:
    contracts_dir = pathlib.Path(contracts_dir)
    manifests = sorted((contracts_dir / "bucket" / "contract").glob("v*.json"))
    if not manifests:
        return [f"{contracts_dir / 'bucket' / 'contract'}: no contract manifest (v*.json) found"]
    problems = []
    for manifest_path in manifests:
        problems += check_manifest(manifest_path, contracts_dir)
    return problems


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--check", action="store_true", help="verify every committed bundle")
    parser.add_argument("--contracts-dir", help="contracts directory to check (default: the repository's)")
    args = parser.parse_args(argv)
    if not args.check:
        parser.error("--check is required")

    contracts_dir = pathlib.Path(args.contracts_dir or contract_lib.CONTRACTS_DIR)
    try:
        problems = check(contracts_dir)
    except contract_lib.ContractError as exc:
        problems = [str(exc)]
    for line in problems:
        print(f"FAIL {line}")
    if problems:
        return 1
    print("OK: every committed contract bundle matches its schemas and manifest hashes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
