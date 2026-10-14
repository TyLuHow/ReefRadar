#!/usr/bin/env python3
"""
Build the out-of-distribution (OOD) reference sidecar (Phase 5, ML-03 / ML-06).

The OOD flag reports how far a recording's windows are from the training
recordings: k=1 cosine distance to the nearest training window. "Outside" means
the distance is greater than a threshold. The threshold is calibrated leave one
site out: for every one of the 100 training windows, the distance is
1 - (the largest cosine to a window of any OTHER site), so a window never finds
its own site as a neighbour, and the threshold is the 95th percentile of those
100 distances (numpy.percentile, linear interpolation). This mirrors the
question the flag answers at serve time (a recording from a site the model has
not seen), and the leave-one-site-out numbers are frozen in the sidecar.

The reference rows are the 100 training windows re-embedded through reef_audio
(plan 05-11); the same bytes are published as `v2/ood_reference.f32`. The sidecar
is written in the contract's canonical JSON form and validates against
contracts/schema/ood-reference.schema.json.

The flag lives in the embedding space of served windows. It cannot detect
whether the classifier matches that space (05-RESEARCH Pitfall 8); the sidecar's
embedding_space_note says so.

Usage:
    py -3.12 scripts/build_ood_reference.py            # write the sidecar
    py -3.12 scripts/build_ood_reference.py --check    # recompute, exit 1 on any difference
"""

import argparse
import hashlib
import json
import pathlib
import sys

import numpy as np

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
for _p in (SCRIPTS_DIR, REPO_ROOT / "lambdas" / "shared"):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import contract_lib  # noqa: E402
import reef_audio  # noqa: E402

INPUTS_DIR = REPO_ROOT / "models" / "interim-real-only" / "evaluation" / "inputs"
DEFAULT_EMBEDDINGS = INPUTS_DIR / "reembedded.f32"
DEFAULT_ROWS = INPUTS_DIR / "reembedded.json"
DEFAULT_OUT = REPO_ROOT / "models" / "interim-real-only-2026.10.1" / "ood_reference.json"

OOD_VERSION = "ood-2026.10.1-nn1-cosine"
EMBEDDINGS_URI = "v2/ood_reference.f32"
EMBEDDING_DIM = 1280
PERCENTILE = 95
CHECK_TOLERANCE = 1e-12

EMBEDDING_SPACE_NOTE = (
    "The reference rows are the 100 training windows (first 5 s window of each "
    "training file) embedded through reef_audio by the deployed SurfPerch "
    "container, the same space as served windows. The distance measures how far "
    "a recording's windows are from the training recordings: 1 minus the largest "
    "cosine to any training window. The threshold is the 95th percentile of "
    "leave-one-site-out distances, so it describes how far an unseen site's "
    "windows typically are from the other sites. It cannot detect whether the "
    "classifier matches its embedding space (05-RESEARCH Pitfall 8), and it never "
    "changes a class probability."
)


# --------------------------------------------------------------------------
# Calibration
# --------------------------------------------------------------------------

def normalise_rows(matrix):
    matrix = np.asarray(matrix, dtype=np.float64)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    if np.any(norms == 0):
        raise ValueError("a reference row has zero norm; cosine distance is undefined")
    return matrix / norms


def nearest_distance(vector, reference_rows):
    """k=1 cosine distance from `vector` to the nearest row of `reference_rows`."""
    unit = normalise_rows(np.asarray(vector, dtype=np.float64).reshape(1, -1))[0]
    return float(1.0 - (normalise_rows(reference_rows) @ unit).max())


def calibrate(matrix, site_ids):
    """Leave-one-site-out nearest-neighbour distances for every row.

    Returns {"threshold", "pooled_n", "per_site": [...], "distances"}. Computed in
    float64 on row-normalised vectors. Needs at least two sites.
    """
    unit = normalise_rows(matrix)
    sites = np.asarray(site_ids)
    if len(sites) != len(unit):
        raise ValueError("site_ids and matrix disagree in length")
    if len(set(site_ids)) < 2:
        raise ValueError("leave-one-site-out calibration needs at least two sites")
    cosines = unit @ unit.T
    distances = np.empty(len(unit), dtype=np.float64)
    for i in range(len(unit)):
        distances[i] = 1.0 - cosines[i][sites != sites[i]].max()
    per_site = []
    for site in sorted(set(site_ids)):
        d = distances[sites == site]
        per_site.append({
            "site_id": site,
            "n": int(d.size),
            "p50": float(np.percentile(d, 50)),
            "p95": float(np.percentile(d, 95)),
            "max": float(d.max()),
        })
    return {
        "threshold": float(np.percentile(distances, PERCENTILE)),
        "pooled_n": int(distances.size),
        "per_site": per_site,
        "distances": distances,
    }


# --------------------------------------------------------------------------
# Sidecar
# --------------------------------------------------------------------------

def _repo_relative(path):
    resolved = pathlib.Path(path).resolve()
    try:
        return resolved.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return pathlib.Path(path).as_posix()


def _text_sha256(path):
    """sha256 of a committed text input as LF bytes (equal to its git blob on any checkout)."""
    return hashlib.sha256(pathlib.Path(path).read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def build_sidecar(embeddings_path, rows_path):
    raw = pathlib.Path(embeddings_path).read_bytes()
    rows_doc = json.loads(pathlib.Path(rows_path).read_text(encoding="utf-8"))
    rows = rows_doc["rows"]
    if rows_doc.get("dim") != EMBEDDING_DIM or len(raw) != len(rows) * EMBEDDING_DIM * 4:
        raise ValueError("embeddings file size does not match the rows file (count x 1280 float32)")
    embeddings_sha = hashlib.sha256(raw).hexdigest()
    if rows_doc.get("embeddings_sha256") != embeddings_sha:
        raise ValueError("embeddings sha256 does not match the rows file's embeddings_sha256")
    if rows_doc.get("spec_version") != reef_audio.SPEC_VERSION:
        raise ValueError("rows file spec_version is not the current reef_audio.SPEC_VERSION")

    matrix = np.frombuffer(raw, dtype="<f4").reshape(len(rows), EMBEDDING_DIM)
    site_ids = [r["site_id"] for r in rows]
    cal = calibrate(matrix, site_ids)

    source_inputs = [
        {"path": _repo_relative(embeddings_path), "sha256": embeddings_sha},
        {"path": _repo_relative(rows_path), "sha256": _text_sha256(rows_path)},
    ]
    rows_source = rows_doc.get("source_rows")
    if rows_source:
        source_inputs.append({"path": rows_source["path"], "sha256": rows_source["sha256"]})

    return {
        "schema_version": 1,
        "ood_version": OOD_VERSION,
        "metric": "cosine_distance",
        "k": 1,
        "threshold": cal["threshold"],
        "calibration": {
            "method": "leave_one_site_out_nearest_neighbour",
            "percentile": PERCENTILE,
            "pooled_n": cal["pooled_n"],
            "per_site": cal["per_site"],
        },
        "embeddings": {
            "uri": EMBEDDINGS_URI,
            "sha256": embeddings_sha,
            "dtype": "float32-le",
            "dim": EMBEDDING_DIM,
            "count": len(rows),
        },
        "row_site_ids": site_ids,
        "preprocessing_spec_version": reef_audio.SPEC_VERSION,
        "embedding_model": {"name": "surfperch", "version": "1.0", "dimension": EMBEDDING_DIM},
        "embedding_space_note": EMBEDDING_SPACE_NOTE,
        "source_inputs": source_inputs,
    }


def _differences(expected, actual, path="sidecar"):
    """Every difference between two JSON values; floats compare within CHECK_TOLERANCE."""
    if isinstance(expected, dict) and isinstance(actual, dict):
        out = []
        for key in sorted(set(expected) | set(actual)):
            if key not in expected:
                out.append(f"{path}.{key}: unexpected key in the committed sidecar")
            elif key not in actual:
                out.append(f"{path}.{key}: missing from the committed sidecar")
            else:
                out.extend(_differences(expected[key], actual[key], f"{path}.{key}"))
        return out
    if isinstance(expected, list) and isinstance(actual, list):
        if len(expected) != len(actual):
            return [f"{path}: length {len(actual)} committed, {len(expected)} recomputed"]
        out = []
        for i, (e, a) in enumerate(zip(expected, actual)):
            out.extend(_differences(e, a, f"{path}[{i}]"))
        return out
    numeric = (int, float)
    if (isinstance(expected, numeric) and not isinstance(expected, bool)
            and isinstance(actual, numeric) and not isinstance(actual, bool)):
        if isinstance(expected, float) or isinstance(actual, float):
            if abs(expected - actual) > CHECK_TOLERANCE:
                return [f"{path}: committed {actual!r}, recomputed {expected!r}"]
            return []
    if expected != actual:
        return [f"{path}: committed {actual!r}, recomputed {expected!r}"]
    return []


def check(out_path, embeddings_path, rows_path):
    """Recompute from the committed rows; return the list of differences."""
    out_path = pathlib.Path(out_path)
    if not out_path.exists():
        return [f"{out_path} does not exist"]
    committed = json.loads(out_path.read_text(encoding="utf-8"))
    expected = build_sidecar(embeddings_path, rows_path)
    problems = _differences(expected, committed)
    try:
        contract_lib.validate(committed, "ood-reference")
    except contract_lib.ContractError as exc:
        problems.append(str(exc))
    return problems


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--embeddings", default=str(DEFAULT_EMBEDDINGS),
                        help="re-embedded training windows (float32-le, count x 1280)")
    parser.add_argument("--rows", default=str(DEFAULT_ROWS),
                        help="reembedded.json (row order, site ids, pinned hashes)")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="the sidecar to write or check")
    parser.add_argument("--check", action="store_true",
                        help="recompute from the committed rows and exit 1 if the sidecar differs")
    args = parser.parse_args(argv)

    if args.check:
        problems = check(args.out, args.embeddings, args.rows)
        if problems:
            print("OOD reference check FAILED:")
            for line in problems:
                print(f"  - {line}")
            return 1
        sidecar = json.loads(pathlib.Path(args.out).read_text(encoding="utf-8"))
        print(f"OOD reference check passed: threshold {sidecar['threshold']:.12f}, "
              f"{sidecar['embeddings']['count']} windows, sha256 {sidecar['embeddings']['sha256']}")
        return 0

    sidecar = build_sidecar(args.embeddings, args.rows)
    contract_lib.validate(sidecar, "ood-reference")
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(contract_lib.canonical_json_bytes(sidecar))
    print(f"Wrote {out}")
    print(f"threshold (p{PERCENTILE} of leave-one-site-out nearest-neighbour cosine distance): "
          f"{sidecar['threshold']:.12f}")
    for site in sidecar["calibration"]["per_site"]:
        print(f"  {site['site_id']}: n={site['n']} p50={site['p50']:.6f} p95={site['p95']:.6f} max={site['max']:.6f}")
    print(f"embeddings sha256 {sidecar['embeddings']['sha256']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
