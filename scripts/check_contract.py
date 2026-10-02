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
    spec, projection and stamp validate against their schemas; the stamp equals the
    version fields of the manifest; the coverage counts equal counts recomputed from
    sites.json; each schema copy equals its contracts/schema source;
  - embeddings.f32 is exactly rows x dim x 4 bytes with row_site_ids equal to the sorted
    acoustic_reference ids, and the committed projection.json equals a PCA recomputed from
    those float32 rows (components 1e-8, coordinates 2e-6, explained variance 1e-6), so a
    different numpy build cannot break the check, while an edited number does;
  - every site's embedding_row and projection equal the row and projection coordinates
    published for it.

`--check` also verifies the offline fixtures and the immutability guard:

  - contracts/fixtures/bucket/contract/v*.json are marked "fixture": true, resolve their
    artifacts against contracts/bucket, and nothing else lives under fixtures/bucket;
    a manifest marked fixture anywhere under contracts/bucket fails;
  - contracts/fixtures/latest-v*.json validate against the pointer schema and their
    manifest_sha256 equals the sha256 of the manifest bytes they name;
  - every contracts/fixtures/invalid/*.json case ({schema, instance, reason}) is rejected
    by the schema it names;
  - contracts/fixtures/parity-corpus.json equals a fresh regeneration (see --write-corpus);
  - when contracts/PUBLISHED.json lists a version, that version's manifest bytes still hash
    to the recorded manifest_sha256 ("published version N modified" otherwise).

`--published-base-ref REF` and `--published-history` close the same-commit loophole in that
guard (a commit that edits a published bundle AND its PUBLISHED.json entry together passes the
check above). They compare against PUBLISHED.json as it was committed earlier:

  - `--published-base-ref REF` reads contracts/PUBLISHED.json at git ref REF (CI passes the
    pull-request base, or the push's previous commit) and fails when any version recorded
    there is missing now or records a different manifest_sha256;
  - `--published-history` does the same against EVERY committed revision of PUBLISHED.json
    (needs full history: fetch-depth 0), so a version can never be rewritten or dropped
    whichever commit is the merge base.
  Both also require the current manifest bytes and artifact files of those versions to still
  hash to what was recorded, and fail closed when the ref is unknown or the clone is shallow.

`--additive` guards schema evolution:

  - behavioural: every manifest in contracts/bucket and contracts/fixtures, and every
    artifact they name, still validates against the CURRENT contracts/schema/*;
  - structural: every property name and enum value found in the schema copies bundled
    under contracts/bucket/v*/schema still exists in the current schema of the same name.

`--write-corpus` regenerates contracts/fixtures/parity-corpus.json: the Python jsonschema
verdict for every committed instance and for mechanically generated invalid mutants. The
Zod mirror (plan 02-07) must reach the same verdict for every entry.

Exit 0 when everything passes; exit 1 with one line per failure otherwise.

Usage:
    py -3.12 scripts/check_contract.py --check
    py -3.12 scripts/check_contract.py --check --additive
    py -3.12 scripts/check_contract.py --published-history
    py -3.12 scripts/check_contract.py --published-base-ref origin/main
    py -3.12 scripts/check_contract.py --write-corpus
    py -3.12 scripts/check_contract.py --check --contracts-dir <copy of contracts/>
"""

from __future__ import annotations

import argparse
import copy
import json
import pathlib
import re
import subprocess
import sys

import numpy as np

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


def published_versions(contracts_dir: pathlib.Path) -> set[str]:
    """Versions listed in contracts/PUBLISHED.json (empty when the file does not exist)."""
    path = pathlib.Path(contracts_dir) / "PUBLISHED.json"
    if not path.is_file():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return set()
    return {str(key) for key in data} if isinstance(data, dict) else set()


def check_manifest(
    manifest_path: pathlib.Path,
    contracts_dir: pathlib.Path,
    fixture: bool = False,
    copies_must_match: bool = True,
) -> list[str]:
    """Check one manifest. A fixture manifest must say so, and artifacts always resolve in contracts/bucket.

    copies_must_match: each bundled schema copy must equal its contracts/schema source. That holds
    while a version is unpublished; once published the copy is frozen and the source may only grow
    (--additive checks that instead), so the equality is not required.
    """
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
    if fixture:
        if manifest.get("fixture") is not True:
            problems.append(f"{rel_manifest}: a fixture manifest must be marked fixture true")
    elif manifest.get("fixture") is True:
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
        if uri.endswith(".f32"):
            loaded[label] = data
        if uri.endswith(".json"):
            file_problems = _json_file_problems(uri, data)
            problems += file_problems
            if not file_problems:
                loaded[label] = json.loads(data.decode("utf-8"))
                if label.startswith("schemas."):
                    source = schema_dir / pathlib.PurePosixPath(uri).name
                    if copies_must_match and source.is_file() and contract_lib.read_text_input_bytes(source) != data:
                        problems.append(f"{uri}: schema copy differs from {source.relative_to(contracts_dir).as_posix()}")

    problems += _semantic_problems(manifest, artifacts, loaded, schema_dir, fixture)
    return problems


def _semantic_problems(
    manifest: dict, artifacts: dict, loaded: dict, schema_dir: pathlib.Path, fixture: bool = False
) -> list[str]:
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

    problems += _embedding_problems(manifest, artifacts, loaded)

    for label, stem in (
        ("model_version", "model-version"),
        ("preprocessing_spec", "preprocessing-spec"),
        ("projection", "projection"),
        ("stamp", "analysis-result"),
    ):
        if label in loaded:
            problems += _schema_problems(f"{label} artifact", loaded[label], stem, schema_dir)

    stamp = loaded.get("stamp")
    if isinstance(stamp, dict):
        for key in ("contract_version", "dataset_version", "model_version", "preprocessing_spec_version"):
            if fixture and key == "contract_version":
                continue  # a fixture reuses the base version's stamp bytes by design
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


def _embedding_problems(manifest: dict, artifacts: dict, loaded: dict) -> list[str]:
    """Length, row-order and numeric checks for embeddings.f32 and projection.json."""
    problems = []
    entry = artifacts.get("embeddings") if isinstance(artifacts.get("embeddings"), dict) else None
    data = loaded.get("embeddings")
    sites_doc = loaded.get("sites")
    sites = sites_doc.get("sites") if isinstance(sites_doc, dict) else None
    if entry is None or not isinstance(data, bytes):
        return problems
    dim = entry.get("dim")
    row_ids = entry.get("row_site_ids")
    if not isinstance(dim, int) or not isinstance(row_ids, list):
        return problems
    expected_size = len(row_ids) * dim * 4
    if len(data) != expected_size:
        problems.append(
            f"embeddings.f32: {len(data)} bytes != {len(row_ids)} rows x {dim} x 4 = {expected_size}"
        )
        return problems
    if entry.get("count") != len(row_ids):
        problems.append(f"embeddings.f32: manifest count {entry.get('count')} != {len(row_ids)} row_site_ids")
    if isinstance(sites, list):
        acoustic = sorted(s.get("site_id") for s in sites if s.get("reference_role") == "acoustic_reference")
        if row_ids != acoustic:
            problems.append("embeddings.f32: row_site_ids are not the sorted acoustic_reference site ids")

    projection = loaded.get("projection")
    if not isinstance(projection, dict):
        return problems
    if projection.get("site_ids") != row_ids:
        problems.append("projection.json: site_ids differ from the embeddings row_site_ids")
        return problems
    if projection.get("input_uri") != entry.get("uri"):
        problems.append(f"projection.json: input_uri {projection.get('input_uri')!r} is not {entry.get('uri')!r}")
    try:
        rows = contract_lib.unpack_float32_rows(data, dim)
        mean, components, coords, variance, ratio = contract_lib.pca_2d(rows)
    except contract_lib.ContractError as exc:
        return problems + [f"projection.json: cannot recompute from embeddings.f32 ({exc})"]

    def differs(name, committed, fresh, atol):
        try:
            array = np.array(committed, dtype=np.float64)
        except (TypeError, ValueError):
            return [f"projection.json: {name} is not numeric"]
        if array.shape != fresh.shape:
            return [f"projection.json: {name} has shape {array.shape}, a recomputation gives {fresh.shape}"]
        worst = float(np.max(np.abs(array - fresh))) if array.size else 0.0
        if not worst <= atol:
            return [f"projection.json: {name} differs from a PCA of embeddings.f32 by {worst:.3g} (tolerance {atol:g})"]
        return []

    problems += differs("mean", projection.get("mean"), mean, contract_lib.PCA_COMPONENT_ATOL)
    problems += differs("components", projection.get("components"), components, contract_lib.PCA_COMPONENT_ATOL)
    problems += differs(
        "explained_variance_ratio", projection.get("explained_variance_ratio"), ratio, contract_lib.PCA_RATIO_ATOL
    )
    problems += differs("explained_variance", projection.get("explained_variance"), variance, 1e-7)
    listed = projection.get("coordinates")
    coord_by_id = {}
    if isinstance(listed, list) and all(isinstance(c, dict) for c in listed):
        coord_by_id = {c.get("site_id"): c for c in listed}
        if [c.get("site_id") for c in listed] != row_ids:
            problems.append("projection.json: coordinates are not in embeddings row order")
        else:
            problems += differs(
                "coordinates",
                [[c.get("x"), c.get("y")] for c in listed],
                coords,
                contract_lib.PCA_COORDINATE_ATOL,
            )
    else:
        problems.append("projection.json: coordinates is not a list of objects")
    cumulative = projection.get("cumulative_explained_variance_ratio")
    if not isinstance(cumulative, (int, float)) or abs(cumulative - float(np.sum(ratio))) > contract_lib.PCA_RATIO_ATOL:
        problems.append("projection.json: cumulative_explained_variance_ratio is not the sum of the ratios")
    note = projection.get("note")
    percent = f"{float(np.sum(ratio)) * 100:.1f}%"
    if not isinstance(note, str) or percent not in note:
        problems.append(f"projection.json: note must state the variance shown ({percent})")
    elif "plane distances are not embedding distances" not in note:
        problems.append("projection.json: note must say that plane distances are not embedding distances")
    projection_entry = artifacts.get("projection") if isinstance(artifacts.get("projection"), dict) else {}
    if projection_entry.get("explained_variance_ratio") != projection.get("explained_variance_ratio"):
        problems.append("manifest projection.explained_variance_ratio differs from projection.json")

    if isinstance(sites, list):
        for site in sites:
            site_id = site.get("site_id")
            if site.get("reference_role") != "acoustic_reference":
                continue
            row = row_ids.index(site_id) if site_id in row_ids else None
            if site.get("embedding_row") != row:
                problems.append(f"sites.json[{site_id}]: embedding_row {site.get('embedding_row')!r} != {row!r}")
            published = coord_by_id.get(site_id)
            if published is None or site.get("projection") != {"x": published.get("x"), "y": published.get("y")}:
                problems.append(f"sites.json[{site_id}]: projection differs from projection.json")
    return problems


def _read_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _fixture_manifests(contracts_dir: pathlib.Path) -> list[pathlib.Path]:
    return sorted((contracts_dir / "fixtures" / "bucket" / "contract").glob("v*.json"))


def fixture_problems(contracts_dir: pathlib.Path) -> list[str]:
    """Placement, pointer, manifest and invalid-case checks for contracts/fixtures."""
    fixtures = contracts_dir / "fixtures"
    schema_dir = contracts_dir / "schema"
    problems: list[str] = []
    if not fixtures.is_dir():
        return [f"{fixtures}: fixtures directory is missing"]

    allowed = fixtures / "bucket" / "contract"
    for path in sorted((fixtures / "bucket").rglob("*")) if (fixtures / "bucket").is_dir() else []:
        if path.is_file() and path.parent != allowed:
            problems.append(
                f"{path.relative_to(contracts_dir).as_posix()}: fixtures/bucket may only hold contract/v*.json "
                "manifests (artifacts are reused from contracts/bucket)"
            )

    manifests = _fixture_manifests(contracts_dir)
    if not manifests:
        problems.append("contracts/fixtures/bucket/contract: no fixture manifest (v*.json) found")
    published = published_versions(contracts_dir)
    for path in manifests:
        problems += check_manifest(path, contracts_dir, fixture=True, copies_must_match=not published)

    pointers = sorted(fixtures.glob("latest-v*.json"))
    if not pointers:
        problems.append("contracts/fixtures: no latest-v*.json pointer found")
    for path in pointers:
        rel = path.relative_to(contracts_dir).as_posix()
        raw = path.read_bytes()
        file_problems = _json_file_problems(rel, raw)
        problems += file_problems
        if file_problems:
            continue
        pointer = json.loads(raw.decode("utf-8"))
        problems += _schema_problems(rel, pointer, "contract-pointer", schema_dir)
        uri = pointer.get("manifest_uri") if isinstance(pointer, dict) else None
        if not isinstance(uri, str) or not re.fullmatch(r"contract/v[0-9]+\.json", uri):
            continue
        candidates = [
            contracts_dir / "bucket" / uri,
            contracts_dir / "fixtures" / "bucket" / uri,
        ]
        target = next((c for c in candidates if c.is_file()), None)
        if target is None:
            problems.append(f"{rel}: manifest_uri {uri} names no committed manifest")
        elif contract_lib.sha256_hex(target.read_bytes()) != pointer.get("manifest_sha256"):
            problems.append(f"{rel}: manifest_sha256 differs from the sha256 of {uri}")

    invalid_dir = fixtures / "invalid"
    cases = sorted(invalid_dir.glob("*.json")) if invalid_dir.is_dir() else []
    if not cases:
        problems.append("contracts/fixtures/invalid: no invalid cases found")
    for path in cases:
        rel = path.relative_to(contracts_dir).as_posix()
        try:
            case = _read_json(path)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            problems.append(f"{rel}: not valid JSON ({exc})")
            continue
        if not isinstance(case, dict) or set(case) != {"schema", "instance", "reason"}:
            problems.append(f"{rel}: an invalid case must be exactly {{schema, instance, reason}}")
            continue
        if not case["reason"]:
            problems.append(f"{rel}: reason must say which invariant is broken")
        try:
            errors = contract_lib.validation_errors(case["instance"], case["schema"], schema_dir)
        except contract_lib.ContractError as exc:
            problems.append(f"{rel}: {exc}")
            continue
        if not errors:
            problems.append(f"{rel}: the instance is valid against {case['schema']} but must be rejected")
    return problems


def published_problems(contracts_dir: pathlib.Path) -> list[str]:
    """A version listed in contracts/PUBLISHED.json is immutable: its manifest bytes may not change."""
    path = contracts_dir / "PUBLISHED.json"
    if not path.exists():
        return []
    try:
        published = _read_json(path)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        return [f"PUBLISHED.json: not valid JSON ({exc})"]
    if not isinstance(published, dict):
        return ["PUBLISHED.json: expected an object mapping version to manifest sha256"]
    problems = []
    for version, record in sorted(published.items(), key=lambda kv: str(kv[0])):
        recorded = record.get("manifest_sha256") if isinstance(record, dict) else record
        manifest = contracts_dir / "bucket" / "contract" / f"v{version}.json"
        if not manifest.is_file():
            problems.append(f"published version {version} modified: {manifest.name} is missing from the bundle")
        elif contract_lib.sha256_hex(manifest.read_bytes()) != recorded:
            problems.append(f"published version {version} modified: manifest sha256 differs from PUBLISHED.json")
    return problems


# ---------------------------------------------------------------------------
# Published-version immutability against earlier commits (WR-03)
# ---------------------------------------------------------------------------

def _git(contracts_dir: pathlib.Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(contracts_dir), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )


def _published_records(published) -> dict[str, str]:
    """version -> manifest sha256 from a parsed PUBLISHED.json (either record form)."""
    out: dict[str, str] = {}
    if isinstance(published, dict):
        for version, record in published.items():
            sha = record.get("manifest_sha256") if isinstance(record, dict) else record
            out[str(version)] = sha
    return out


def published_base_problems(
    contracts_dir: pathlib.Path, base_records: dict[str, str], label: str
) -> list[str]:
    """Versions recorded in an earlier PUBLISHED.json must be unchanged now.

    `base_records` maps version -> manifest sha256 as recorded at `label` (a ref or
    commit). A version missing now, or recorded with another hash, was rewritten; and the
    manifest bytes plus every artifact file of a base version must still hash to what the
    base recorded, so editing bucket/vN/** together with PUBLISHED.json cannot pass.
    """
    problems: list[str] = []
    try:
        current = _published_records(_read_json(contracts_dir / "PUBLISHED.json"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        current = {}
    bucket = contracts_dir / "bucket"
    for version, recorded in sorted(base_records.items()):
        if version not in current:
            problems.append(f"published version {version} dropped: recorded in PUBLISHED.json at {label} but missing now")
            continue
        if current[version] != recorded:
            problems.append(
                f"published version {version} rewritten: PUBLISHED.json at {label} recorded manifest sha256 "
                f"{recorded}, now {current[version]}"
            )
            continue
        manifest_path = bucket / "contract" / f"v{version}.json"
        if not manifest_path.is_file():
            problems.append(f"published version {version} modified: {manifest_path.name} is missing from the bundle")
            continue
        raw = manifest_path.read_bytes()
        if contract_lib.sha256_hex(raw) != recorded:
            problems.append(
                f"published version {version} modified: manifest bytes differ from the sha256 recorded at {label}"
            )
            continue
        try:
            manifest = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
        artifacts = manifest.get("artifacts") if isinstance(manifest, dict) else None
        for _label, entry in _iter_artifacts(artifacts if isinstance(artifacts, dict) else {}):
            if not isinstance(entry, dict) or entry.get("present") is False:
                continue
            uri = entry.get("uri")
            if not isinstance(uri, str) or not SAFE_URI.match(uri) or ".." in uri:
                continue
            file = bucket / uri
            if not file.is_file() or contract_lib.sha256_hex(file.read_bytes()) != entry.get("sha256"):
                problems.append(
                    f"published version {version} modified: {uri} no longer matches the manifest recorded at {label}"
                )
    return problems


def _published_path_in_repo(contracts_dir: pathlib.Path) -> tuple[str | None, str | None]:
    """(path of PUBLISHED.json relative to the git toplevel, error)."""
    result = _git(contracts_dir, "rev-parse", "--show-prefix")
    if result.returncode != 0:
        return None, "not inside a git work tree, so published versions cannot be compared with earlier commits"
    return f"{result.stdout.strip()}PUBLISHED.json", None


def _published_at_ref(contracts_dir: pathlib.Path, rel: str, ref: str) -> tuple[dict[str, str] | None, str | None]:
    """(records at ref, error). An absent file at a valid ref is an empty record set."""
    if _git(contracts_dir, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}").returncode != 0:
        return None, f"cannot resolve git ref {ref!r}; fetch it (fetch-depth 0) so published versions can be compared"
    if _git(contracts_dir, "cat-file", "-e", f"{ref}:{rel}").returncode != 0:
        return {}, None
    shown = _git(contracts_dir, "show", f"{ref}:{rel}")
    if shown.returncode != 0:
        return None, f"cannot read {rel} at {ref}"
    try:
        return _published_records(json.loads(shown.stdout)), None
    except json.JSONDecodeError:
        return None, f"{rel} at {ref} is not valid JSON"


def published_base_ref_problems(contracts_dir: pathlib.Path, ref: str) -> list[str]:
    """Compare against PUBLISHED.json at one git ref (e.g. the merge base)."""
    rel, error = _published_path_in_repo(contracts_dir)
    if error:
        return [error]
    records, error = _published_at_ref(contracts_dir, rel, ref)
    if error:
        return [error]
    return published_base_problems(contracts_dir, records or {}, ref)


def published_history_problems(contracts_dir: pathlib.Path) -> list[str]:
    """Compare against every committed revision of PUBLISHED.json (full history required)."""
    rel, error = _published_path_in_repo(contracts_dir)
    if error:
        return [error]
    if _git(contracts_dir, "rev-parse", "--is-shallow-repository").stdout.strip() == "true":
        return ["shallow clone: published versions cannot be compared with history (checkout with fetch-depth 0)"]
    # git runs inside contracts_dir, so the pathspec is relative to it (unlike ref:path above).
    log = _git(contracts_dir, "log", "--format=%H", "--", "PUBLISHED.json")
    if log.returncode != 0:
        return [f"git log failed for {rel}"]
    problems: list[str] = []
    seen: set[str] = set()
    for commit in log.stdout.split():
        records, error = _published_at_ref(contracts_dir, rel, commit)
        if error:
            problems.append(error)
            continue
        for line in published_base_problems(contracts_dir, records or {}, commit[:12]):
            if line not in seen:
                seen.add(line)
                problems.append(line)
    return problems


# ---------------------------------------------------------------------------
# Additive-only schema evolution
# ---------------------------------------------------------------------------

def _schema_vocabulary(schema) -> tuple[set[str], set[tuple[str, str]]]:
    """(property names, (owning property, enum value) pairs) found anywhere in a schema."""
    names: set[str] = set()
    enums: set[tuple[str, str]] = set()

    def walk(node, owner: str) -> None:
        if isinstance(node, dict):
            properties = node.get("properties")
            if isinstance(properties, dict):
                for key, sub in properties.items():
                    names.add(key)
                    walk(sub, key)
            if isinstance(node.get("enum"), list):
                for value in node["enum"]:
                    enums.add((owner, json.dumps(value, sort_keys=True)))
            for key, sub in node.items():
                if key != "properties":
                    walk(sub, owner)
        elif isinstance(node, list):
            for sub in node:
                walk(sub, owner)

    walk(schema, "$")
    return names, enums


def additive_problems(contracts_dir: pathlib.Path) -> list[str]:
    """Behavioural and structural checks that the current schemas only ever grew."""
    problems: list[str] = []
    schema_dir = contracts_dir / "schema"
    manifests = sorted((contracts_dir / "bucket" / "contract").glob("v*.json"))
    manifests += _fixture_manifests(contracts_dir)
    for path in manifests:
        fixture = "fixtures" in path.relative_to(contracts_dir).parts
        problems += [
            f"additive (behavioural): {line}"
            for line in check_manifest(path, contracts_dir, fixture=fixture, copies_must_match=False)
        ]

    for copy_path in sorted((contracts_dir / "bucket").glob(f"v*/schema/*{contract_lib.SCHEMA_SUFFIX}")):
        rel = copy_path.relative_to(contracts_dir).as_posix()
        current = schema_dir / copy_path.name
        if not current.is_file():
            problems.append(f"additive (structural): {rel}: the current schema {copy_path.name} no longer exists")
            continue
        old_names, old_enums = _schema_vocabulary(_read_json(copy_path))
        new_names, new_enums = _schema_vocabulary(_read_json(current))
        for name in sorted(old_names - new_names):
            problems.append(f"additive (structural): {current.name} dropped property {name!r} present in {rel}")
        for owner, value in sorted(old_enums - new_enums):
            problems.append(
                f"additive (structural): {current.name} dropped enum value {value} of {owner!r} present in {rel}"
            )
    return problems


# ---------------------------------------------------------------------------
# Schema parity corpus
# ---------------------------------------------------------------------------

WRONG_TYPE_VALUES = (
    ("object", {"__wrong__": 1}),
    ("array", []),
    ("string", "__wrong__ #"),
    ("boolean", True),
    ("number", 12345.5),
    ("null", None),
)
PARITY_CORPUS_RELPATH = "fixtures/parity-corpus.json"


def _allowed_types(sub) -> set[str] | None:
    declared = sub.get("type") if isinstance(sub, dict) else None
    if declared is None:
        return None
    return {declared} if isinstance(declared, str) else set(declared)


def _mutants(instance: dict, schema: dict, verdict) -> dict[str, dict]:
    """Mechanical one-change mutants of `instance`; each must be rejected by the schema."""
    out: dict[str, dict] = {}
    properties = schema.get("properties", {})
    for key in schema.get("required", []):
        if key in instance:
            mutant = copy.deepcopy(instance)
            del mutant[key]
            out[f"drop:{key}"] = mutant
    for key, sub in sorted(properties.items()):
        if key not in instance:
            continue
        allowed = _allowed_types(sub)
        for type_name, value in WRONG_TYPE_VALUES:
            if allowed is not None and type_name in allowed:
                continue  # that JSON type is legal here, so it would not be a wrong-type mutant
            if instance[key] == value:
                continue
            mutant = copy.deepcopy(instance)
            mutant[key] = value
            if allowed is None and not verdict(mutant):
                continue  # untyped (const/ref) property: keep the first value it actually rejects
            out[f"type:{key}:{type_name}"] = mutant
            break
        if isinstance(sub, dict) and "enum" in sub:
            mutant = copy.deepcopy(instance)
            mutant[key] = "__not_in_enum__"
            out[f"enum:{key}"] = mutant
        if isinstance(sub, dict) and "pattern" in sub and instance[key] is not None:
            mutant = copy.deepcopy(instance)
            mutant[key] = "not a valid value #"
            out[f"pattern:{key}"] = mutant
    return out


def _truncated_projection(projection: dict) -> dict:
    """A projection copy with every long array cut to 3 items (valid: lengths are checked elsewhere)."""
    small = copy.deepcopy(projection)
    for key in ("mean", "explained_variance", "explained_variance_ratio", "site_ids", "coordinates"):
        small[key] = small[key][:3]
    small["components"] = [row[:3] for row in small["components"][:3]]
    return small


def _corpus_instances(contracts_dir: pathlib.Path) -> list[tuple[str, str, str, object]]:
    """(schema stem, case name, source tag, instance) for every committed valid instance."""
    items: list[tuple[str, str, str, object]] = []
    bucket_manifests = sorted((contracts_dir / "bucket" / "contract").glob("v*.json"))
    for path in bucket_manifests:
        source = "representative" if path == bucket_manifests[-1] else "manifest"
        items.append(("contract-manifest", f"manifest/{path.stem}", source, _read_json(path)))
    for path in _fixture_manifests(contracts_dir):
        items.append(("contract-manifest", f"fixture-manifest/{path.stem}", "fixture", _read_json(path)))
    for path in sorted((contracts_dir / "fixtures").glob("latest-v*.json")):
        base = bucket_manifests and path.stem == f"latest-{bucket_manifests[-1].stem}"
        items.append(("contract-pointer", f"pointer/{path.stem}", "representative" if base else "pointer", _read_json(path)))
    if not bucket_manifests:
        return items

    latest = _read_json(bucket_manifests[-1])
    bucket = contracts_dir / "bucket"
    sites = _read_json(bucket / latest["artifacts"]["sites"]["uri"])["sites"]
    seen = set()
    for site in sites:
        combo = (site["dataset_id"], site["reference_role"])
        if combo not in seen:
            seen.add(combo)
            items.append(("site", f"site/{combo[0]}/{combo[1]}", "representative", site))
    for artifact, stem in (
        ("model_version", "model-version"),
        ("preprocessing_spec", "preprocessing-spec"),
        ("stamp", "analysis-result"),
    ):
        items.append((stem, f"artifact/{artifact}", "representative", _read_json(bucket / latest["artifacts"][artifact]["uri"])))
    items.append(
        ("projection", "artifact/projection-truncated", "representative",
         _truncated_projection(_read_json(bucket / latest["artifacts"]["projection"]["uri"])))
    )
    return items


def build_corpus(contracts_dir: pathlib.Path) -> bytes:
    """Deterministic parity corpus: [{schema, case, verdict, instance}], sorted, one entry per line."""
    schema_dir = contracts_dir / "schema"
    validators: dict[str, object] = {}

    def verdict_for(stem: str, instance) -> str:
        if stem not in validators:
            validators[stem] = contract_lib.make_validator(stem, schema_dir)
        return "invalid" if validators[stem](instance) else "valid"

    entries = []
    for stem, case, source, instance in _corpus_instances(contracts_dir):
        if verdict_for(stem, instance) != "valid":
            raise contract_lib.ContractError(f"corpus: committed instance {case} is not valid against {stem}")
        entries.append({"schema": stem, "case": f"valid:{case}", "verdict": "valid", "instance": instance})
        if source == "representative":
            schema = contract_lib.load_schema(stem, schema_dir)
            for mutant_case, mutant in _mutants(instance, schema, lambda m, s=stem: verdict_for(s, m) == "invalid").items():
                if verdict_for(stem, mutant) != "invalid":
                    raise contract_lib.ContractError(f"corpus: mutant {case}/{mutant_case} is accepted by {stem}")
                entries.append(
                    {"schema": stem, "case": f"mutant:{case}/{mutant_case}", "verdict": "invalid", "instance": mutant}
                )
    invalid_dir = contracts_dir / "fixtures" / "invalid"
    for path in sorted(invalid_dir.glob("*.json")) if invalid_dir.is_dir() else []:
        case = _read_json(path)
        if verdict_for(case["schema"], case["instance"]) != "invalid":
            raise contract_lib.ContractError(f"corpus: curated case {path.name} is accepted by {case['schema']}")
        entries.append(
            {"schema": case["schema"], "case": f"curated:{path.stem}", "verdict": "invalid", "instance": case["instance"]}
        )
    entries.sort(key=lambda e: (e["schema"], e["case"]))
    lines = [json.dumps(e, sort_keys=True, separators=(",", ":"), ensure_ascii=False) for e in entries]
    return ("[\n" + ",\n".join(lines) + "\n]\n").encode("utf-8")


def corpus_problems(contracts_dir: pathlib.Path) -> list[str]:
    path = contracts_dir / PARITY_CORPUS_RELPATH
    if not path.is_file():
        return [f"{PARITY_CORPUS_RELPATH}: missing; run `py -3.12 scripts/check_contract.py --write-corpus`"]
    try:
        fresh = build_corpus(contracts_dir)
    except (contract_lib.ContractError, OSError, ValueError, KeyError, IndexError, TypeError) as exc:
        return [f"{PARITY_CORPUS_RELPATH}: cannot regenerate the corpus ({type(exc).__name__}: {exc})"]
    if path.read_bytes() != fresh:
        return [f"{PARITY_CORPUS_RELPATH}: stale; regenerate with `py -3.12 scripts/check_contract.py --write-corpus`"]
    return []


def write_corpus(contracts_dir: pathlib.Path) -> int:
    data = build_corpus(contracts_dir)
    target = contracts_dir / PARITY_CORPUS_RELPATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    count = len(json.loads(data.decode("utf-8")))
    print(f"OK: wrote {count} parity entries ({len(data)} bytes) to {target}")
    return 0


def check(contracts_dir: pathlib.Path) -> list[str]:
    contracts_dir = pathlib.Path(contracts_dir)
    manifests = sorted((contracts_dir / "bucket" / "contract").glob("v*.json"))
    if not manifests:
        return [f"{contracts_dir / 'bucket' / 'contract'}: no contract manifest (v*.json) found"]
    problems = []
    published = published_versions(contracts_dir)
    for manifest_path in manifests:
        version = manifest_path.stem[1:]
        problems += check_manifest(manifest_path, contracts_dir, copies_must_match=version not in published)
    problems += fixture_problems(contracts_dir)
    problems += published_problems(contracts_dir)
    problems += corpus_problems(contracts_dir)
    return problems


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--check", action="store_true", help="verify every committed bundle, fixture and the corpus")
    parser.add_argument("--additive", action="store_true", help="verify the schemas only ever grew")
    parser.add_argument("--write-corpus", action="store_true", help="regenerate contracts/fixtures/parity-corpus.json")
    parser.add_argument(
        "--published-base-ref",
        metavar="REF",
        help="fail when a version recorded in PUBLISHED.json at git REF is missing or changed now",
    )
    parser.add_argument(
        "--published-history",
        action="store_true",
        help="fail when any version ever recorded in PUBLISHED.json (full git history) is missing or changed now",
    )
    parser.add_argument("--contracts-dir", help="contracts directory to check (default: the repository's)")
    args = parser.parse_args(argv)
    if not (
        args.check or args.additive or args.write_corpus or args.published_base_ref or args.published_history
    ):
        parser.error(
            "one of --check, --additive, --write-corpus, --published-base-ref or --published-history is required"
        )

    contracts_dir = pathlib.Path(args.contracts_dir or contract_lib.CONTRACTS_DIR)
    try:
        if args.write_corpus:
            code = write_corpus(contracts_dir)
            if code or not (args.check or args.additive):
                return code
        problems = []
        if args.check:
            problems += check(contracts_dir)
        if args.additive:
            problems += additive_problems(contracts_dir)
        if args.published_base_ref:
            problems += published_base_ref_problems(contracts_dir, args.published_base_ref)
        if args.published_history:
            problems += published_history_problems(contracts_dir)
    except contract_lib.ContractError as exc:
        problems = [str(exc)]
    for line in problems:
        print(f"FAIL {line}")
    if problems:
        return 1
    modes = " and ".join(
        name
        for name, on in (
            ("--check", args.check),
            ("--additive", args.additive),
            ("--published-base-ref", bool(args.published_base_ref)),
            ("--published-history", args.published_history),
        )
        if on
    )
    print(f"OK: contract {modes} passed (bundles, fixtures, schemas and parity corpus are consistent)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
