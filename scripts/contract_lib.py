"""
Shared helpers for the ReefRadar data contract tooling (Phase 2).

Used by scripts/build_contract.py, scripts/check_contract.py and the contract
tests. Standard library plus jsonschema/referencing only (both from
requirements-dev.txt; never bundled into a Lambda).

Design rules enforced here:
  - Every JSON file in the contract bundle is written in one canonical form
    (sorted keys, 2-space indent, UTF-8, LF line endings, one trailing
    newline) so the same inputs always produce the same bytes and the same
    sha256, on any operating system.
  - Hashes recorded for committed *text* inputs are taken over LF-normalised
    bytes, so a Windows checkout with core.autocrlf=true hashes the same as
    the git blob. Binary inputs (.npz, .f32) are never normalised.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
from typing import Any, Optional

from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

import lambda_packaging

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTRACTS_DIR = REPO_ROOT / "contracts"
SCHEMA_DIR = CONTRACTS_DIR / "schema"
BUCKET_DIR = CONTRACTS_DIR / "bucket"
FIXTURES_DIR = CONTRACTS_DIR / "fixtures"

SCHEMA_SUFFIX = ".schema.json"


class ContractError(RuntimeError):
    """A contract build, schema or integrity failure (message names every problem)."""


def canonical_json_bytes(obj: Any) -> bytes:
    """Deterministic JSON: sorted keys, indent 2, UTF-8, LF, one trailing newline."""
    text = json.dumps(obj, sort_keys=True, indent=2, ensure_ascii=False)
    return (text + "\n").encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_text_input_bytes(path: pathlib.Path) -> bytes:
    """Read a committed TEXT input as LF bytes (equal to its git blob on any checkout).

    Never call this on binary files.
    """
    return lambda_packaging.normalize_text_bytes(pathlib.Path(path).read_bytes())


def schema_path(stem: str, schema_dir: Optional[pathlib.Path] = None) -> pathlib.Path:
    return pathlib.Path(schema_dir or SCHEMA_DIR) / f"{stem}{SCHEMA_SUFFIX}"


def load_schema(stem: str, schema_dir: Optional[pathlib.Path] = None) -> dict:
    path = schema_path(stem, schema_dir)
    if not path.exists():
        raise ContractError(f"schema not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_registry(schema_dir: Optional[pathlib.Path] = None) -> Registry:
    """A referencing Registry holding every contracts/schema/*.schema.json keyed by $id."""
    directory = pathlib.Path(schema_dir or SCHEMA_DIR)
    registry: Registry = Registry()
    for path in sorted(directory.glob(f"*{SCHEMA_SUFFIX}")):
        schema = json.loads(path.read_text(encoding="utf-8"))
        schema_id = schema.get("$id")
        if not schema_id:
            raise ContractError(f"{path.name}: schema has no $id")
        registry = registry.with_resource(
            schema_id, Resource.from_contents(schema, default_specification=DRAFT202012)
        )
    return registry


def validation_errors(
    instance: Any, stem: str, schema_dir: Optional[pathlib.Path] = None
) -> list[str]:
    """Return one 'path: message' line per schema violation (empty list when valid)."""
    schema = load_schema(stem, schema_dir)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, registry=load_registry(schema_dir))
    errors = sorted(
        validator.iter_errors(instance),
        key=lambda e: [str(part) for part in e.absolute_path],
    )
    lines = []
    for err in errors:
        where = "/".join(str(part) for part in err.absolute_path) or "<root>"
        lines.append(f"{where}: {err.message}")
    return lines


def validate(instance: Any, stem: str, schema_dir: Optional[pathlib.Path] = None) -> None:
    """Validate `instance` against contracts/schema/<stem>.schema.json.

    Raises ContractError listing every error path.
    """
    lines = validation_errors(instance, stem, schema_dir)
    if lines:
        raise ContractError(f"{stem}: " + "; ".join(lines))
