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

import numpy as np
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

# The one upstream object the reference embeddings are taken from (read-only, embeddings
# only: its statuses, DOIs and citations are stale and are never copied). The sha256 was
# verified against the live object when contract v1 was built.
REFERENCE_METADATA_BUCKET = "reefradar-2477-embeddings"
REFERENCE_METADATA_KEY = "reference/metadata_v6.json"
REFERENCE_METADATA_SHA256 = "5adc487d3f25d1037fdb2145ca5c56474459d7b32ec3c914a00f2c47719ca2e3"
EMBEDDING_DIM = 1280
EMBEDDING_DTYPE = "float32-le"

# Tolerances used when the published PCA is recomputed from the published float32 rows.
PCA_COMPONENT_ATOL = 1e-8
PCA_COORDINATE_ATOL = 2e-6
PCA_RATIO_ATOL = 1e-6

PCA_SIGN_RULE = "each component is flipped so that its largest-magnitude loading is positive"


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


# ---------------------------------------------------------------------------
# Reference embeddings and the 2-D PCA projection
# ---------------------------------------------------------------------------

def pack_float32_rows(rows) -> bytes:
    """Row-major little-endian float32 bytes (the published embeddings.f32 layout)."""
    return np.ascontiguousarray(np.asarray(rows, dtype="<f4")).tobytes()


def unpack_float32_rows(data: bytes, dim: int) -> np.ndarray:
    """The published float32 rows as a float64 (n, dim) array. Rejects a truncated file."""
    if dim < 1 or len(data) == 0 or len(data) % (dim * 4) != 0:
        raise ContractError(
            f"embeddings data of {len(data)} bytes is not a whole number of {dim}-value float32 rows"
        )
    return np.frombuffer(data, dtype="<f4").reshape(-1, dim).astype(np.float64)


def pca_2d(rows):
    """Deterministic 2-D PCA of the published rows.

    rows: (n, d) array of the published float32 values, sorted by site_id. They are cast
    to float64, mean-centred and decomposed with numpy.linalg.svd. Returns
    (mean, components (2, d), coordinates (n, 2), explained_variance (2,),
    explained_variance_ratio (2,)). Components follow the sign rule in PCA_SIGN_RULE, so
    a 1e-9 numerical difference between numpy builds cannot flip an axis (the two
    largest loadings differ by far more than that).
    """
    matrix = np.asarray(rows, dtype=np.float64)
    if matrix.ndim != 2 or matrix.shape[0] < 3:
        raise ContractError("PCA needs a 2-D array with at least 3 rows")
    mean = matrix.mean(axis=0)
    centred = matrix - mean
    _, singular, vt = np.linalg.svd(centred, full_matrices=False)
    components = vt[:2].copy()
    for index in range(2):
        if components[index, int(np.argmax(np.abs(components[index])))] < 0:
            components[index] *= -1
    squared = singular ** 2
    ratio = squared / np.sum(squared)
    variance = squared / (matrix.shape[0] - 1)
    return mean, components, centred @ components.T, variance[:2], ratio[:2]


def projection_note(cumulative_ratio: float) -> str:
    """Plain-language qualification published inside projection.json itself."""
    return (
        "A 2-D linear (PCA) projection of the 1280-value reference embeddings. "
        f"This plane shows {cumulative_ratio * 100:.1f}% of the variance in the embeddings; "
        "the rest is not visible here, so plane distances are not embedding distances and "
        "must not be read as acoustic similarity: sites that are far apart in the embedding "
        "can look close on the plane."
    )
