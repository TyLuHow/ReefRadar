#!/usr/bin/env python3
"""
Phase 2 (CONTRACT-01/02/04): build the deterministic ReefRadar data contract bundle.

Everything under contracts/bucket/ is produced from committed inputs only (no AWS
call, no ingestion job). The same inputs always give the same bytes, so the bundle
can be rebuilt and diffed in CI:

  contracts/bucket/contract/v<N>.json     the immutable manifest for version N
  contracts/bucket/v<N>/sites.json        every Site record with full provenance
  contracts/bucket/v<N>/schema/*.json     byte-for-byte copies of contracts/schema/*
  (model_version.json, preprocessing_spec.json and stamp.json are added by the
   same builder; see the functions below)

Provenance rules (never relaxed):
  - Statuses and every label field come ONLY from
    lambdas/shared/site_provenance.apply_label_provenance (the shared overlay).
  - DOIs, licences and dataset URLs come ONLY from
    dashboard-next/src/data/citations.json, keyed by the overlay's dataset id.
  - Counts (48 embedded sites, 54 sites, 7 countries) are computed from the
    records, never copied from the stale snapshot header.
  - A value the source does not have is published as null together with the
    source's stated reason; nothing is invented.

Usage:
    py -3.12 scripts/build_contract.py --version 1 --frozen-at 2026-10-01T22:00:00Z
    py -3.12 scripts/build_contract.py --version 1            # rebuild, reuses the committed frozen_at
    py -3.12 scripts/build_contract.py --version 1 --check    # exit 1 if any committed file differs
    py -3.12 scripts/build_contract.py --freeze-legacy-coordinates   # one-time
    py -3.12 scripts/build_contract.py --format-schemas              # canonicalise contracts/schema/*
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
from typing import Optional

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "lambdas" / "shared"))
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import contract_lib  # noqa: E402
import site_provenance as sp  # noqa: E402
from contract_lib import ContractError  # noqa: E402

SNAPSHOT_PATH = REPO_ROOT / "data" / "snapshots" / "api-sites.json"
PROVENANCE_PATH = REPO_ROOT / "data" / "site-label-provenance.json"
CITATIONS_PATH = REPO_ROOT / "dashboard-next" / "src" / "data" / "citations.json"
LEGACY_TYPES_PATH = REPO_ROOT / "dashboard-next" / "src" / "types" / "index.ts"

# The legacy UI shows these three Bora-Bora points as "Bora-Bora, French Polynesia",
# not "<region>, <country>" (region is "Society Islands"). Keep that text so the
# map popups do not change when the UI reads the contract instead of its own table.
LOCATION_LABEL_OVERRIDES = {
    "borabora_undisturbed": "Bora-Bora, French Polynesia",
    "borabora_tourist": "Bora-Bora, French Polynesia",
    "borabora_boat_traffic": "Bora-Bora, French Polynesia",
}

SCHEMA_STEM_TO_KEY = {
    "analysis-result": "analysis_result",
    "contract-manifest": "contract_manifest",
    "contract-pointer": "contract_pointer",
    "model-version": "model_version",
    "preprocessing-spec": "preprocessing_spec",
    "site": "site",
}

JSON_CONTENT_TYPE = "application/json"


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------

def _load_text_json(path: pathlib.Path):
    """Parse a committed text JSON input and return (data, LF-normalised sha256)."""
    raw = contract_lib.read_text_input_bytes(path)
    return json.loads(raw.decode("utf-8")), contract_lib.sha256_hex(raw)


def _repo_rel(path: pathlib.Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def load_inputs() -> dict:
    snapshot, snapshot_sha = _load_text_json(SNAPSHOT_PATH)
    provenance, provenance_sha = _load_text_json(PROVENANCE_PATH)
    citations_doc, citations_sha = _load_text_json(CITATIONS_PATH)
    return {
        "snapshot": snapshot,
        "snapshot_sha": snapshot_sha,
        "provenance": provenance,
        "provenance_sha": provenance_sha,
        "citations_doc": citations_doc,
        "citations": citations_doc["citations"],
        "citations_sha": citations_sha,
    }


# ---------------------------------------------------------------------------
# Sites
# ---------------------------------------------------------------------------

def build_sites(snapshot: dict, provenance: dict, citations: dict) -> list[dict]:
    """One Site record per snapshot site, in snapshot order."""
    records = []
    for raw in snapshot["sites"]:
        site_id = raw["site_id"]
        if raw.get("synthetic") is not False:
            raise ContractError(f"{site_id}: snapshot site is not marked synthetic=false")
        overlaid = sp.apply_label_provenance(raw, provenance)
        dataset_id = overlaid["label_source"]
        cite = citations.get(dataset_id)
        if cite is None or cite.get("kind") != "dataset":
            raise ContractError(f"{site_id}: dataset {dataset_id!r} has no dataset citation")
        doi = cite["doi"]
        doi_note = None
        if doi is None:
            doi_note = cite.get("verification_note")
            if not doi_note:
                raise ContractError(
                    f"{site_id}: dataset {dataset_id!r} has no DOI and no stated reason; "
                    "refusing to publish an unexplained null"
                )
        records.append(
            {
                "site_id": site_id,
                "country": raw["country"],
                "region": raw["region"],
                "location_label": LOCATION_LABEL_OVERRIDES.get(
                    site_id, f"{raw['region']}, {raw['country']}"
                ),
                "latitude": raw["latitude"],
                "longitude": raw["longitude"],
                "status": overlaid["status"],
                "reference_role": "acoustic_reference" if raw["has_embedding"] else "location_only",
                "dataset_id": dataset_id,
                "dataset_name": raw["source"],
                "doi": doi,
                "doi_note": doi_note,
                "dataset_url": cite["url"],
                "licence": cite["licence"],
                "licence_url": cite["licence_url"],
                "label_source_name": overlaid["label_source_name"],
                "label_assigned_by": overlaid["label_assigned_by"],
                "label_original": overlaid["label_original"],
                "label_definition": overlaid["label_definition"],
                "status_basis": overlaid["status_basis"],
                "period": overlaid["period"],
                "label_note": overlaid["label_note"],
                "synthetic": False,
            }
        )
    return records


def build_datasets(provenance: dict, citations: dict) -> list[dict]:
    """Datasets in provenance-source order (marrs, coralsoundexplorer, irma, sanctsound)."""
    datasets = []
    for dataset_id, source in provenance["sources"].items():
        cite = citations.get(dataset_id)
        if cite is None or cite.get("kind") != "dataset":
            continue
        doi = cite["doi"]
        datasets.append(
            {
                "id": dataset_id,
                "name": source["display_name"],
                "title": cite["title"],
                "doi": doi,
                "doi_note": cite.get("verification_note") if doi is None else None,
                "url": cite["url"],
                "licence": cite["licence"],
                "licence_url": cite["licence_url"],
            }
        )
    return datasets


def compute_coverage(sites: list[dict]) -> dict:
    return {
        "has_diel": False,
        "has_detections": False,
        "has_pre_post_event": False,
        "has_effort": False,
        "total_sites": len(sites),
        "sites_with_embeddings": sum(1 for s in sites if s["reference_role"] == "acoustic_reference"),
        "countries": len({s["country"] for s in sites}),
    }


# ---------------------------------------------------------------------------
# Bundle assembly
# ---------------------------------------------------------------------------

def artifact_entry(uri: str, data: bytes, content_type: str = JSON_CONTENT_TYPE, **extra) -> dict:
    entry = {
        "uri": uri,
        "sha256": contract_lib.sha256_hex(data),
        "bytes": len(data),
        "content_type": content_type,
    }
    entry.update(extra)
    return entry


def _schema_sources(schema_dir: pathlib.Path) -> dict[str, bytes]:
    """stem -> LF bytes of each contracts/schema file; each must already be canonical JSON."""
    sources = {}
    for path in sorted(schema_dir.glob(f"*{contract_lib.SCHEMA_SUFFIX}")):
        stem = path.name[: -len(contract_lib.SCHEMA_SUFFIX)]
        data = contract_lib.read_text_input_bytes(path)
        parsed = json.loads(data.decode("utf-8"))
        if contract_lib.canonical_json_bytes(parsed) != data:
            raise ContractError(
                f"{path.name} is not in canonical form; run "
                "`py -3.12 scripts/build_contract.py --format-schemas`"
            )
        sources[stem] = data
    return sources


def build_bundle(version: int, frozen_at: str, contracts_dir: pathlib.Path) -> dict[str, bytes]:
    """Return {path relative to contracts/ (posix): file bytes} for contract version `version`."""
    inputs = load_inputs()
    sites = build_sites(inputs["snapshot"], inputs["provenance"], inputs["citations"])
    prefix = f"v{version}"
    files: dict[str, bytes] = {}

    sites_bytes = contract_lib.canonical_json_bytes({"schema_version": 1, "sites": sites})
    files[f"bucket/{prefix}/sites.json"] = sites_bytes

    schema_entries = {}
    for stem, data in _schema_sources(contracts_dir / "schema").items():
        uri = f"{prefix}/schema/{stem}{contract_lib.SCHEMA_SUFFIX}"
        files[f"bucket/{uri}"] = data
        schema_entries[SCHEMA_STEM_TO_KEY.get(stem, stem.replace("-", "_"))] = artifact_entry(uri, data)

    artifacts = {
        "sites": artifact_entry(f"{prefix}/sites.json", sites_bytes, count=len(sites)),
        "schemas": schema_entries,
        "aggregates_diel": {"present": False},
        "aggregates_effort": {"present": False},
        "detections": {"present": False},
    }

    manifest = {
        "schema_version": 1,
        "contract_version": version,
        "frozen_at": frozen_at,
        "coverage": compute_coverage(sites),
        "artifacts": artifacts,
        "datasets": build_datasets(inputs["provenance"], inputs["citations"]),
        "sources": {
            "snapshot": {
                "path": _repo_rel(SNAPSHOT_PATH),
                "sha256": inputs["snapshot_sha"],
                "version": inputs["snapshot"]["version"],
                "snapshot_at": inputs["snapshot"]["snapshot_at"],
            },
            "provenance": {
                "path": _repo_rel(PROVENANCE_PATH),
                "sha256": inputs["provenance_sha"],
                "schema_version": inputs["provenance"]["schema_version"],
            },
            "citations": {
                "path": _repo_rel(CITATIONS_PATH),
                "sha256": inputs["citations_sha"],
                "schema_version": inputs["citations_doc"]["schema_version"],
                "verified_at": inputs["citations_doc"]["verified_at"],
            },
        },
    }
    manifest.update(version_fields(inputs))
    contract_lib.validate(manifest, "contract-manifest", contracts_dir / "schema")
    files[f"bucket/contract/v{version}.json"] = contract_lib.canonical_json_bytes(manifest)
    return files


# Fixed once for contract v1 and reused by every later plan (Claude's discretion
# per CONTEXT). model_version is not fixed here: it is read from the live config.
DATASET_VERSION = "reefradar-reference-2026.10.0"
PREPROCESSING_SPEC_VERSION = "preproc-2026.10.0-as-deployed"
MODEL_VERSION_PLACEHOLDER = "interim-real-only"


def version_fields(inputs: dict) -> dict:
    return {
        "dataset_version": DATASET_VERSION,
        "model_version": MODEL_VERSION_PLACEHOLDER,
        "preprocessing_spec_version": PREPROCESSING_SPEC_VERSION,
    }


# ---------------------------------------------------------------------------
# One-time legacy coordinate freeze
# ---------------------------------------------------------------------------

def parse_legacy_site_coordinates(text: str) -> dict:
    """Parse the exported SITE_COORDINATES constant from dashboard-next/src/types/index.ts."""
    start = text.find("export const SITE_COORDINATES")
    if start < 0:
        raise ContractError("SITE_COORDINATES constant not found in src/types/index.ts")
    end = text.find("\n};", start)
    if end < 0:
        raise ContractError("end of SITE_COORDINATES constant not found")
    block = text[start:end]
    entry = re.compile(
        r"^\s*([A-Za-z0-9_]+):\s*\{\s*lat:\s*(-?\d+(?:\.\d+)?),\s*"
        r"lon:\s*(-?\d+(?:\.\d+)?),\s*location:\s*'([^']*)'\s*\},?\s*$",
        re.MULTILINE,
    )
    table = {}
    for site_id, lat, lon, location in entry.findall(block):
        table[site_id] = {"lat": float(lat), "lon": float(lon), "location": location}
    expected = len(re.findall(r"\blat:", block))
    if not table or len(table) != expected:
        raise ContractError(
            f"parsed {len(table)} SITE_COORDINATES entries but the block has {expected}; "
            "refusing to freeze a partial table"
        )
    return table


def freeze_legacy_coordinates(contracts_dir: pathlib.Path) -> int:
    target = contracts_dir / "fixtures" / "legacy-site-coordinates.json"
    if target.exists():
        print(f"FAIL {target} already exists; the legacy table is frozen once and never overwritten")
        return 1
    table = parse_legacy_site_coordinates(LEGACY_TYPES_PATH.read_text(encoding="utf-8"))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(contract_lib.canonical_json_bytes(table))
    print(f"OK: froze {len(table)} legacy coordinates to {target}")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _published_versions(contracts_dir: pathlib.Path) -> set[str]:
    path = contracts_dir / "PUBLISHED.json"
    if not path.exists():
        return set()
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        return {str(k) for k in data}
    return {str(v) for v in data}


def format_schemas(contracts_dir: pathlib.Path) -> int:
    changed = 0
    for path in sorted((contracts_dir / "schema").glob(f"*{contract_lib.SCHEMA_SUFFIX}")):
        data = contract_lib.read_text_input_bytes(path)
        canonical = contract_lib.canonical_json_bytes(json.loads(data.decode("utf-8")))
        if canonical != path.read_bytes():
            path.write_bytes(canonical)
            changed += 1
    print(f"OK: canonicalised {changed} schema file(s)")
    return 0


def _resolve_frozen_at(version: int, requested: Optional[str], contracts_dir: pathlib.Path) -> str:
    manifest_path = contracts_dir / "bucket" / "contract" / f"v{version}.json"
    if manifest_path.exists():
        committed = json.loads(manifest_path.read_text(encoding="utf-8"))["frozen_at"]
        if requested and requested != committed:
            raise ContractError(
                f"v{version} was frozen at {committed}; refusing a different --frozen-at {requested}"
            )
        return committed
    if not requested:
        raise ContractError(f"--frozen-at is required the first time v{version} is built")
    return requested


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--version", type=int, help="contract version N to build")
    parser.add_argument("--frozen-at", help="UTC second, e.g. 2026-10-01T22:00:00Z (first build only)")
    parser.add_argument("--check", action="store_true", help="rebuild in memory; exit 1 if any committed file differs")
    parser.add_argument("--freeze-legacy-coordinates", action="store_true")
    parser.add_argument("--format-schemas", action="store_true")
    args = parser.parse_args(argv)

    contracts_dir = pathlib.Path(contract_lib.CONTRACTS_DIR)

    try:
        if args.freeze_legacy_coordinates:
            return freeze_legacy_coordinates(contracts_dir)
        if args.format_schemas:
            return format_schemas(contracts_dir)
        if args.version is None or args.version < 1:
            parser.error("--version N (N >= 1) is required")

        version = args.version
        frozen_at = _resolve_frozen_at(version, args.frozen_at, contracts_dir)
        files = build_bundle(version, frozen_at, contracts_dir)

        if args.check:
            problems = []
            for rel, data in sorted(files.items()):
                path = contracts_dir / rel
                if not path.exists():
                    problems.append(f"{rel}: missing")
                elif path.read_bytes() != data:
                    problems.append(f"{rel}: differs from a fresh build")
            for line in problems:
                print(f"FAIL {line}")
            if problems:
                return 1
            print(f"OK: contract v{version} ({len(files)} files) matches a fresh build")
            return 0

        if str(version) in _published_versions(contracts_dir):
            raise ContractError(f"v{version} is listed in contracts/PUBLISHED.json; published versions are immutable")
        for rel, data in sorted(files.items()):
            path = contracts_dir / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        print(f"OK: wrote contract v{version} ({len(files)} files) under {contracts_dir / 'bucket'}")
        return 0
    except ContractError as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
