#!/usr/bin/env python3
"""
Phase 2 (CONTRACT-01/02/04): build the deterministic ReefRadar data contract bundle.

Everything under contracts/bucket/ is produced from committed inputs only (no AWS
call, no ingestion job). The same inputs always give the same bytes, so the bundle
can be rebuilt and diffed in CI:

  contracts/bucket/contract/v<N>.json     the immutable manifest for version N
  contracts/bucket/v<N>/sites.json        every Site record with full provenance
  contracts/bucket/v<N>/schema/*.json     byte-for-byte copies of contracts/schema/*
  contracts/bucket/v<N>/model_version.json       honest ModelVersion (no accuracy figure)
  contracts/bucket/v<N>/preprocessing_spec.json  what production does today + known gaps
  contracts/bucket/v<N>/stamp.json               the version stamp bundled into the classifier
  contracts/bucket/v<N>/embeddings.f32           48 x 1280 float32 reference embeddings
  contracts/bucket/v<N>/projection.json          2-D PCA of those rows, with its explained variance

Test fixtures (--fixtures, never published; the publisher refuses fixture manifests):
  contracts/fixtures/bucket/contract/v<N+1>.json   v<N> manifest + fixture true + one flipped flag
  contracts/fixtures/latest-v<N>.json, latest-v<N+1>.json   pointers with the manifests' sha256
  contracts/fixtures/invalid/*.json                curated schema-invariant violations

Provenance rules (never relaxed):
  - Statuses and every label field come ONLY from
    lambdas/shared/site_provenance.apply_label_provenance (the shared overlay).
  - DOIs, licences and dataset URLs come ONLY from
    dashboard-next/src/data/citations.json, keyed by the overlay's dataset id.
  - Counts (48 embedded sites, 54 sites, 7 countries) are computed from the
    records, never copied from the stale snapshot header.
  - A value the source does not have is published as null together with the
    source's stated reason; nothing is invented.

Reference embeddings and projection:
  - v<N>/embeddings.f32 is taken once from reference/metadata_v6.json (key "embedding"
    only; its statuses, DOIs and citations are stale and ignored) after its sha256 matched
    the pinned value. Without --reference-metadata the committed file is reused, so CI
    rebuilds need no AWS access.
  - v<N>/projection.json is a mean-centred 2-D PCA of those rows. It is only recomputed
    with --recompute-projection, because numpy builds differ in the last bits and rounding
    could otherwise flip a digit and break the byte-level --check; check_contract.py
    verifies the committed projection numerically instead.

Usage:
    py -3.12 scripts/build_contract.py --version 1 --frozen-at 2026-10-01T22:00:00Z
    py -3.12 scripts/build_contract.py --version 1 --reference-metadata <local copy of metadata_v6.json> --recompute-projection
    py -3.12 scripts/build_contract.py --version 1            # rebuild, reuses the committed frozen_at
    py -3.12 scripts/build_contract.py --version 1 --fixtures # write the offline UI-test fixtures
    py -3.12 scripts/build_contract.py --version 1 --check    # exit 1 if any committed file differs
    py -3.12 scripts/build_contract.py --freeze-legacy-coordinates   # one-time
    py -3.12 scripts/build_contract.py --format-schemas              # canonicalise contracts/schema/*
"""

from __future__ import annotations

import argparse
import copy
import json
import pathlib
import re
import sys
from typing import Optional

import numpy as np

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
MODEL_DIR = REPO_ROOT / "models" / "interim-real-only"
MODEL_CONFIG_PATH = MODEL_DIR / "model_config.json"
MODEL_WEIGHTS_PATH = MODEL_DIR / "reef_classifier_weights.npz"
DEPLOYED_LOCK_PATH = REPO_ROOT / "docs" / "model" / "deployed-model.lock.json"
PREPROCESSOR_PATH = REPO_ROOT / "lambdas" / "preprocessor" / "handler.py"
CLASSIFIER_PATH = REPO_ROOT / "lambdas" / "classifier" / "handler.py"

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
    "projection": "projection",
    "site": "site",
}

JSON_CONTENT_TYPE = "application/json"
BINARY_CONTENT_TYPE = "application/octet-stream"


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


def load_reference_rows(
    metadata_path: pathlib.Path,
    acoustic_ids: list[str],
    expected_sha256: str = contract_lib.REFERENCE_METADATA_SHA256,
) -> np.ndarray:
    """Float32 rows (one per acoustic_reference site, sorted by site_id) from metadata_v6.

    The raw bytes are hashed exactly as downloaded (never text-normalised) and must match
    the pinned sha256. Only each site's "embedding" key is read: the statuses, DOIs,
    citations and counts in that object are stale and are ignored. The set of ids that
    carry an embedding must equal the acoustic_reference set, and every embedding must
    have 1280 finite values.
    """
    raw = pathlib.Path(metadata_path).read_bytes()
    digest = contract_lib.sha256_hex(raw)
    if digest != expected_sha256:
        raise ContractError(
            f"reference metadata sha256 {digest} != pinned {expected_sha256}; "
            "refusing to build embeddings from an unverified source"
        )
    document = json.loads(raw.decode("utf-8"))
    entries = document.get("sites") if isinstance(document, dict) else None
    if not isinstance(entries, list):
        raise ContractError("reference metadata has no sites list")
    embeddings: dict[str, list] = {}
    for entry in entries:
        vector = entry.get("embedding") if isinstance(entry, dict) else None
        if vector is None:
            continue
        site_id = entry.get("site_id")
        if site_id in embeddings:
            raise ContractError(f"reference metadata lists {site_id} twice")
        if not isinstance(vector, list) or len(vector) != contract_lib.EMBEDDING_DIM:
            raise ContractError(
                f"{site_id}: embedding must be a list of {contract_lib.EMBEDDING_DIM} values"
            )
        embeddings[site_id] = vector
    expected = sorted(acoustic_ids)
    if sorted(embeddings) != expected:
        extra = sorted(set(embeddings) - set(expected))
        missing = sorted(set(expected) - set(embeddings))
        raise ContractError(
            "sites carrying an embedding differ from the acoustic_reference sites: "
            f"extra {extra}, missing {missing}"
        )
    rows = np.asarray([embeddings[site_id] for site_id in expected], dtype=np.float32)
    if not np.all(np.isfinite(rows)):
        raise ContractError("reference embeddings contain a non-finite value")
    return rows


def build_projection(embeddings_bytes: bytes, row_site_ids: list[str], prefix: str) -> dict:
    """The projection.json document, computed from the published float32 rows."""
    rows = contract_lib.unpack_float32_rows(embeddings_bytes, contract_lib.EMBEDDING_DIM)
    if rows.shape[0] != len(row_site_ids):
        raise ContractError(f"{rows.shape[0]} embedding rows for {len(row_site_ids)} sites")
    mean, components, coords, variance, ratio = contract_lib.pca_2d(rows)
    cumulative = float(np.sum(ratio))
    return {
        "schema_version": 1,
        "method": "pca",
        "input_uri": f"{prefix}/embeddings.f32",
        "site_ids": list(row_site_ids),
        "mean": [round(float(v), 9) for v in mean],
        "components": [[round(float(v), 9) for v in row] for row in components],
        "explained_variance": [round(float(v), 8) for v in variance],
        "explained_variance_ratio": [round(float(v), 8) for v in ratio],
        "cumulative_explained_variance_ratio": round(cumulative, 8),
        "coordinates": [
            {"site_id": site_id, "x": round(float(x), 6), "y": round(float(y), 6)}
            for site_id, (x, y) in zip(row_site_ids, coords)
        ],
        "sign_rule": contract_lib.PCA_SIGN_RULE,
        "note": contract_lib.projection_note(cumulative),
    }


def attach_projection(sites: list[dict], row_site_ids: list[str], projection: dict) -> None:
    """Set embedding_row and projection on every site (null for location_only sites)."""
    coords = {c["site_id"]: {"x": c["x"], "y": c["y"]} for c in projection["coordinates"]}
    for site in sites:
        site_id = site["site_id"]
        if site["reference_role"] == "acoustic_reference":
            site["embedding_row"] = row_site_ids.index(site_id)
            site["projection"] = dict(coords[site_id])
        else:
            site["embedding_row"] = None
            site["projection"] = None


def build_bundle(
    version: int,
    frozen_at: str,
    contracts_dir: pathlib.Path,
    reference_metadata: Optional[pathlib.Path] = None,
    recompute_projection: bool = False,
) -> dict[str, bytes]:
    """Return {path relative to contracts/ (posix): file bytes} for contract version `version`."""
    inputs = load_inputs()
    sites = build_sites(inputs["snapshot"], inputs["provenance"], inputs["citations"])
    prefix = f"v{version}"
    files: dict[str, bytes] = {}
    schema_dir = contracts_dir / "schema"
    committed_dir = contracts_dir / "bucket" / prefix

    row_site_ids = sorted(s["site_id"] for s in sites if s["reference_role"] == "acoustic_reference")
    embeddings_path = committed_dir / "embeddings.f32"
    if reference_metadata is not None:
        embeddings_bytes = contract_lib.pack_float32_rows(
            load_reference_rows(reference_metadata, row_site_ids)
        )
        if (
            not recompute_projection
            and embeddings_path.exists()
            and embeddings_path.read_bytes() != embeddings_bytes
        ):
            raise ContractError(
                "the embeddings differ from the committed file; re-run with --recompute-projection"
            )
    elif embeddings_path.exists():
        embeddings_bytes = embeddings_path.read_bytes()  # binary: never normalised
    else:
        raise ContractError(
            f"{embeddings_path} is missing; pass --reference-metadata <local copy of "
            f"{contract_lib.REFERENCE_METADATA_KEY}> to create it"
        )
    expected_size = len(row_site_ids) * contract_lib.EMBEDDING_DIM * 4
    if len(embeddings_bytes) != expected_size:
        raise ContractError(
            f"embeddings.f32 is {len(embeddings_bytes)} bytes, expected {expected_size} "
            f"({len(row_site_ids)} rows x {contract_lib.EMBEDDING_DIM} float32)"
        )

    projection_path = committed_dir / "projection.json"
    if recompute_projection:
        projection = build_projection(embeddings_bytes, row_site_ids, prefix)
    elif projection_path.exists():
        projection = json.loads(projection_path.read_text(encoding="utf-8"))
        if projection.get("site_ids") != row_site_ids:
            raise ContractError("the committed projection.json lists different sites; use --recompute-projection")
    else:
        raise ContractError(f"{projection_path} is missing; use --recompute-projection to create it")
    contract_lib.validate(projection, "projection", schema_dir)
    projection_bytes = contract_lib.canonical_json_bytes(projection)
    files[f"bucket/{prefix}/embeddings.f32"] = embeddings_bytes
    files[f"bucket/{prefix}/projection.json"] = projection_bytes

    attach_projection(sites, row_site_ids, projection)
    sites_bytes = contract_lib.canonical_json_bytes({"schema_version": 1, "sites": sites})
    files[f"bucket/{prefix}/sites.json"] = sites_bytes

    model = build_model_version()
    spec = build_preprocessing_spec()
    stamp = build_stamp(version, model)
    contract_lib.validate(model, "model-version", schema_dir)
    contract_lib.validate(spec, "preprocessing-spec", schema_dir)
    contract_lib.validate(stamp, "analysis-result", schema_dir)
    model_bytes = contract_lib.canonical_json_bytes(model)
    spec_bytes = contract_lib.canonical_json_bytes(spec)
    stamp_bytes = contract_lib.canonical_json_bytes(stamp)
    files[f"bucket/{prefix}/model_version.json"] = model_bytes
    files[f"bucket/{prefix}/preprocessing_spec.json"] = spec_bytes
    files[f"bucket/{prefix}/stamp.json"] = stamp_bytes

    schema_entries = {}
    for stem, data in _schema_sources(schema_dir).items():
        uri = f"{prefix}/schema/{stem}{contract_lib.SCHEMA_SUFFIX}"
        files[f"bucket/{uri}"] = data
        schema_entries[SCHEMA_STEM_TO_KEY.get(stem, stem.replace("-", "_"))] = artifact_entry(uri, data)

    artifacts = {
        "sites": artifact_entry(f"{prefix}/sites.json", sites_bytes, count=len(sites)),
        "embeddings": artifact_entry(
            f"{prefix}/embeddings.f32",
            embeddings_bytes,
            content_type=BINARY_CONTENT_TYPE,
            dtype=contract_lib.EMBEDDING_DTYPE,
            dim=contract_lib.EMBEDDING_DIM,
            count=len(row_site_ids),
            row_site_ids=row_site_ids,
        ),
        "projection": artifact_entry(
            f"{prefix}/projection.json",
            projection_bytes,
            method=projection["method"],
            explained_variance_ratio=projection["explained_variance_ratio"],
        ),
        "model_version": artifact_entry(f"{prefix}/model_version.json", model_bytes),
        "preprocessing_spec": artifact_entry(f"{prefix}/preprocessing_spec.json", spec_bytes),
        "stamp": artifact_entry(f"{prefix}/stamp.json", stamp_bytes),
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
            "reference_metadata": {
                "bucket": contract_lib.REFERENCE_METADATA_BUCKET,
                "key": contract_lib.REFERENCE_METADATA_KEY,
                "sha256": contract_lib.REFERENCE_METADATA_SHA256,
            },
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
    manifest.update(
        {
            "dataset_version": stamp["dataset_version"],
            "model_version": stamp["model_version"],
            "preprocessing_spec_version": stamp["preprocessing_spec_version"],
        }
    )
    contract_lib.validate(manifest, "contract-manifest", schema_dir)
    files[f"bucket/contract/v{version}.json"] = contract_lib.canonical_json_bytes(manifest)
    return files


# ---------------------------------------------------------------------------
# Offline test fixtures (never published)
# ---------------------------------------------------------------------------

FIXTURE_FLIPPED_FLAG = "has_diel"


def _first_site(sites: list[dict], predicate) -> dict:
    return copy.deepcopy(next(site for site in sites if predicate(site)))


def build_invalid_cases(sites: list[dict], manifest: dict, stamp: dict, pointer: dict) -> dict[str, dict]:
    """Curated schema-invariant violations: {file stem: {schema, instance, reason}}.

    Each starts from a committed valid instance and breaks exactly one invariant, so a
    UI or schema-parity test can assert that the violation is rejected.
    """
    cases: dict[str, dict] = {}

    degraded = _first_site(
        sites,
        lambda s: s["status"] == "degraded" and s["label_definition"] is not None
        and s["reference_role"] == "acoustic_reference",
    )
    degraded["label_definition"] = None
    cases["site-null-label-definition-with-degraded-status"] = {
        "schema": "site",
        "instance": degraded,
        "reason": "A site whose dataset gives no label definition must have status unknown, not degraded.",
    }

    no_doi = _first_site(sites, lambda s: s["doi"] is None)
    no_doi["doi_note"] = None
    cases["site-null-doi-without-note"] = {
        "schema": "site",
        "instance": no_doi,
        "reason": "A null DOI must carry the dataset's own stated reason in doi_note.",
    }

    no_projection = _first_site(sites, lambda s: s["reference_role"] == "acoustic_reference")
    no_projection["projection"] = None
    cases["site-acoustic-reference-null-projection"] = {
        "schema": "site",
        "instance": no_projection,
        "reason": "An acoustic reference site must have a projection point.",
    }

    stray_row = _first_site(sites, lambda s: s["reference_role"] == "location_only")
    stray_row["embedding_row"] = 0
    cases["site-location-only-with-embedding-row"] = {
        "schema": "site",
        "instance": stray_row,
        "reason": "A location-only site has no embedding, so embedding_row must be null.",
    }

    pre_contract = copy.deepcopy(stamp)
    pre_contract["contract_version"] = None
    cases["stamp-null-contract-version-with-dataset-version"] = {
        "schema": "analysis-result",
        "instance": pre_contract,
        "reason": "A pre-contract stamp (contract_version null) must not claim a dataset version.",
    }

    no_effort = copy.deepcopy(manifest)
    del no_effort["coverage"]["has_effort"]
    cases["manifest-missing-coverage-has-effort"] = {
        "schema": "contract-manifest",
        "instance": no_effort,
        "reason": "Every coverage flag is required so a UI never guesses whether data exists.",
    }

    traversal = copy.deepcopy(pointer)
    traversal["manifest_uri"] = "contract/../v1.json"
    cases["pointer-manifest-uri-with-dot-dot"] = {
        "schema": "contract-pointer",
        "instance": traversal,
        "reason": "A pointer may only name contract/v<N>.json, never a path that climbs out of the bucket.",
    }

    absolute = copy.deepcopy(manifest)
    absolute["artifacts"]["sites"]["uri"] = "https://example.invalid/v1/sites.json"
    cases["manifest-artifact-uri-with-https-scheme"] = {
        "schema": "contract-manifest",
        "instance": absolute,
        "reason": "Artifact uris are relative bucket paths; an absolute URL would let a manifest redirect the app.",
    }
    return cases


def build_fixture_files(version: int, files: dict[str, bytes]) -> dict[str, bytes]:
    """Fixture files (paths relative to contracts/) derived from the built bundle of `version`.

    v<N+1> reuses every v<N> artifact uri (immutable bytes are addressed by path), so a
    fixture adds one small manifest, not another copy of the data.
    """
    base_bytes = files[f"bucket/contract/v{version}.json"]
    base = json.loads(base_bytes.decode("utf-8"))
    flipped = copy.deepcopy(base)
    flipped["contract_version"] = version + 1
    flipped["fixture"] = True
    if flipped["coverage"][FIXTURE_FLIPPED_FLAG] is not False:
        raise ContractError(f"v{version} already has coverage.{FIXTURE_FLIPPED_FLAG} true; nothing to flip")
    flipped["coverage"][FIXTURE_FLIPPED_FLAG] = True
    flipped_bytes = contract_lib.canonical_json_bytes(flipped)

    def pointer(n: int, data: bytes) -> dict:
        return {
            "contract_version": n,
            "manifest_uri": f"contract/v{n}.json",
            "manifest_sha256": contract_lib.sha256_hex(data),
        }

    base_pointer = pointer(version, base_bytes)
    out = {
        f"fixtures/bucket/contract/v{version + 1}.json": flipped_bytes,
        f"fixtures/latest-v{version}.json": contract_lib.canonical_json_bytes(base_pointer),
        f"fixtures/latest-v{version + 1}.json": contract_lib.canonical_json_bytes(pointer(version + 1, flipped_bytes)),
    }
    sites = json.loads(files[f"bucket/v{version}/sites.json"].decode("utf-8"))["sites"]
    stamp = json.loads(files[f"bucket/v{version}/stamp.json"].decode("utf-8"))
    for name, case in build_invalid_cases(sites, base, stamp, base_pointer).items():
        out[f"fixtures/invalid/{name}.json"] = contract_lib.canonical_json_bytes(case)
    return out


# ---------------------------------------------------------------------------
# Model, preprocessing spec and version stamp
# ---------------------------------------------------------------------------

# Fixed once for contract v1 and reused by every later plan (Claude's discretion
# per CONTEXT). The model version is never fixed here: it is the live config's
# own version string.
DATASET_VERSION = "reefradar-reference-2026.10.0"
PREPROCESSING_SPEC_VERSION = "preproc-2026.10.0-as-deployed"

WEIGHTS_LOCATION = "s3://reefradar-2477-embeddings/models/reef_classifier_weights.npz"
DATA_MODEL_REFERENCE = ".planning/audit/DATA-MODEL.md F8"


def _parse_constant(source: str, name: str):
    matches = re.findall(rf"^{name}\s*=\s*([0-9]+(?:\.[0-9]+)?)", source, re.MULTILINE)
    if len(matches) != 1:
        raise ContractError(f"expected exactly one {name} constant in lambdas/preprocessor/handler.py")
    text = matches[0]
    return float(text) if "." in text else int(text)


def _parse_classifier_string(source: str, key: str) -> str:
    matches = re.findall(rf"'{key}':\s*'([^']+)'", source)
    if len(matches) != 1:
        raise ContractError(f"expected exactly one {key!r} string in lambdas/classifier/handler.py")
    return matches[0]


def build_model_version() -> dict:
    """ModelVersion from the committed config and weights. Never carries an accuracy figure."""
    config_lf = contract_lib.read_text_input_bytes(MODEL_CONFIG_PATH)
    config = json.loads(config_lf.decode("utf-8"))
    weights = MODEL_WEIGHTS_PATH.read_bytes()  # binary: hashed as-is, never normalised
    lock = json.loads(contract_lib.read_text_input_bytes(DEPLOYED_LOCK_PATH).decode("utf-8"))
    classifier_source = contract_lib.read_text_input_bytes(CLASSIFIER_PATH).decode("utf-8")

    num_classes = config["num_classes"]
    classes = [config["idx_to_label"][str(i)] for i in range(num_classes)]
    if config.get("synthetic_rows_excluded") != 0:
        raise ContractError("model config reports excluded synthetic rows; review before publishing")
    retired = lock["classes_without_real_rows"]
    return {
        "schema_version": 1,
        "model_version": config["version"],
        "architecture": {
            "input_dim": config["input_dim"],
            "hidden_dims": config["hidden_dims"],
            "num_classes": num_classes,
        },
        "classes": classes,
        "embedding_model": {
            "name": _parse_classifier_string(classifier_source, "embedding_model"),
            "version": _parse_classifier_string(classifier_source, "embedding_version"),
            "dimension": config["input_dim"],
        },
        "preprocessing_spec_version": PREPROCESSING_SPEC_VERSION,
        "training": {
            "rows": config["training_samples"],
            "sites": [site["site_id"] for site in config["training_sites"]],
            "countries": config["training_countries"],
            "synthetic_data": False,
            "synthetic_rows_excluded": config["synthetic_rows_excluded"],
            "seed": config["seed"],
        },
        "evaluation": None,
        "evaluation_note": config["evaluation_note"],
        "config_sha256": contract_lib.sha256_hex(config_lf),
        # The config object in the embeddings bucket was uploaded from a Windows
        # checkout and has CRLF line endings (recorded in docs/deploy/DEPLOY-LOG.md);
        # it differs from the git blob only by line endings.
        "config_sha256_deployed": contract_lib.sha256_hex(config_lf.replace(b"\n", b"\r\n")),
        "weights_sha256": contract_lib.sha256_hex(weights),
        "weights_location": WEIGHTS_LOCATION,
        "predecessor": {
            "model_version": lock["artifacts"]["version"],
            "retired_reason": (
                f"Class {', '.join(retired)} had no real training rows: it was trained entirely on "
                "synthetically generated audio, so this model was retired and replaced by one "
                "trained on real recordings only (docs/model/DEPLOYED-MODEL-AUDIT.md)."
            ),
        },
    }


def build_preprocessing_spec() -> dict:
    """What production does today, read from the constants in lambdas/preprocessor/handler.py."""
    source = contract_lib.read_text_input_bytes(PREPROCESSOR_PATH).decode("utf-8")
    classifier_source = contract_lib.read_text_input_bytes(CLASSIFIER_PATH).decode("utf-8")
    config = json.loads(contract_lib.read_text_input_bytes(MODEL_CONFIG_PATH).decode("utf-8"))
    window_s = _parse_constant(source, "SEGMENT_DURATION")

    def gap(gap_id: str, summary: str) -> dict:
        return {
            "id": gap_id,
            "summary": summary,
            "owner_phase": "Phase 5",
            "status": "open",
            "reference": DATA_MODEL_REFERENCE,
        }

    return {
        "schema_version": 1,
        "spec_version": PREPROCESSING_SPEC_VERSION,
        "status": "as-deployed",
        "sample_rate_hz": _parse_constant(source, "TARGET_SAMPLE_RATE"),
        "window_s": window_s,
        "window_samples": _parse_constant(source, "SEGMENT_SAMPLES"),
        "hop_s": window_s,
        "min_duration_s": _parse_constant(source, "MIN_AUDIO_DURATION"),
        "max_duration_s": _parse_constant(source, "MAX_AUDIO_DURATION"),
        "trailing_partial_window": "dropped",
        "channel_mix": "mean",
        "amplitude_scaling": {
            "mono_pcm16": "divide by 32768",
            "mono_pcm32": "divide by 2147483648",
            "mono_pcm8": "unsigned 8-bit minus 128 held as int16, then divide by 32768",
            "multichannel": (
                "channels are averaged first, which yields float64; that falls through to the "
                "final branch, which divides by the peak absolute value"
            ),
            "peak_normalised_mono_pcm16_pcm32": False,
            "peak_normalised_multichannel": True,
            "unsupported": "24-bit PCM is rejected",
        },
        "resampling": {"method": "linear_interpolation", "anti_alias_filter": False},
        "embedding_model": {
            "name": _parse_classifier_string(classifier_source, "embedding_model"),
            "version": _parse_classifier_string(classifier_source, "embedding_version"),
            "dimension": config["input_dim"],
        },
        "serving": {"window_pooling": "mean"},
        "known_gaps": [
            gap(
                "F8a",
                "Training audio and reference-site audio were peak-normalised per file. Live uploads "
                "are peak-normalised only when they have more than one channel; mono 16-bit and "
                "32-bit PCM uploads are only scaled to the -1..1 range.",
            ),
            gap(
                "F8b",
                "The classifier was trained on single 5 s windows but is applied to the mean of all "
                "window embeddings of an upload.",
            ),
            gap(
                "F8c",
                "Resampling is linear interpolation with no anti-alias low-pass filter, so content "
                "above the 16 kHz Nyquist limit aliases when 44.1, 48 or 96 kHz uploads are "
                "downsampled to 32 kHz, while reference audio sampled at 16 kHz has no content "
                "above 8 kHz.",
            ),
            gap(
                "F8d",
                "Reference vectors were built differently per dataset (5-window means, about "
                "30-file means, or 10 random windows, with and without normalisation).",
            ),
        ],
        "source": (
            "lambdas/preprocessor/handler.py (constants, scaling, resampling); "
            "lambdas/classifier/handler.py (embedding identity, mean pooling)"
        ),
    }


def build_stamp(version: int, model: dict) -> dict:
    return {
        "contract_version": version,
        "dataset_version": DATASET_VERSION,
        "model_version": model["model_version"],
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
    parser.add_argument(
        "--reference-metadata",
        help="local copy of reference/metadata_v6.json; (re)writes embeddings.f32 after a sha256 check",
    )
    parser.add_argument(
        "--recompute-projection",
        action="store_true",
        help="recompute projection.json (otherwise the committed one is reused)",
    )
    parser.add_argument("--freeze-legacy-coordinates", action="store_true")
    parser.add_argument(
        "--fixtures",
        action="store_true",
        help="also write the offline test fixtures (flipped-flag manifest, pointers, invalid cases)",
    )
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
        if args.check and str(version) in _published_versions(contracts_dir):
            # A published version is frozen: its schema copies keep the schemas of the day while
            # contracts/schema may since have grown (additively). A rebuild would legitimately
            # differ, so immutability is enforced by check_contract.py (manifest sha256 vs
            # PUBLISHED.json) and the structural --additive check instead.
            print(
                f"OK: v{version} is published; skipping the rebuild comparison "
                "(check_contract.py guards its bytes against contracts/PUBLISHED.json)"
            )
            return 0
        frozen_at = _resolve_frozen_at(version, args.frozen_at, contracts_dir)
        files = build_bundle(
            version,
            frozen_at,
            contracts_dir,
            reference_metadata=pathlib.Path(args.reference_metadata) if args.reference_metadata else None,
            recompute_projection=args.recompute_projection,
        )

        fixture_files = build_fixture_files(version, files)
        if args.check:
            problems = []
            for rel, data in sorted({**files, **fixture_files}.items()):
                path = contracts_dir / rel
                if not path.exists():
                    problems.append(f"{rel}: missing")
                elif path.read_bytes() != data:
                    problems.append(f"{rel}: differs from a fresh build")
            for line in problems:
                print(f"FAIL {line}")
            if problems:
                return 1
            print(f"OK: contract v{version} ({len(files)} files) and {len(fixture_files)} fixture files match a fresh build")
            return 0

        if args.fixtures and not args.reference_metadata and not args.recompute_projection:
            to_write = fixture_files  # fixtures only: never touches a (possibly published) bundle
        else:
            if str(version) in _published_versions(contracts_dir):
                raise ContractError(
                    f"v{version} is listed in contracts/PUBLISHED.json; published versions are immutable"
                )
            to_write = {**files, **(fixture_files if args.fixtures else {})}
        for rel, data in sorted(to_write.items()):
            path = contracts_dir / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        print(f"OK: wrote {len(to_write)} file(s) for contract v{version} under {contracts_dir}")
        return 0
    except ContractError as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
