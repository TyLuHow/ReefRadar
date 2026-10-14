#!/usr/bin/env python3
"""
Re-embed the 100 original training files through reef_audio and the deployed
inference Lambda (Phase 5, ML-01 / ML-03 / ML-06).

The original training embeddings were made by an older pipeline (file
peak-normalised, linear-interpolation resample). To evaluate the model on the
same preprocessing the deployed classifier now uses, each training file is
range-fetched from the MARRS figshare zips, decoded with
reef_audio.audio_to_windows, and only its FIRST 5 s window is embedded (05-RESEARCH
A8), so the output rows are 1:1 with the original rows. A drift probe reports the
cosine between each original row and the re-embedded row for the same file.

Outputs (default models/interim-real-only/evaluation/inputs):
    reembedded.f32    count x 1280 little-endian float32
    reembedded.json   schema 1; provenance, hashes and the drift probe

Safety:
    - Without --confirm this prints the per-site plan and does nothing else: no
      figshare request, no AWS call, no client is created.
    - With --confirm the AWS identity is checked against account 781978598306
      BEFORE any download, the function is warmed once, and batches run strictly
      serially. Output is counts, keys, status codes and hashes only.

Usage:
    py -3.12 scripts/reembed_training.py                      # plan only
    py -3.12 scripts/reembed_training.py --limit 1 --confirm  # live, one file
    py -3.12 scripts/reembed_training.py --confirm            # live, all 100
"""

import argparse
import datetime
import json
import pathlib
import statistics
import sys

import numpy as np

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
for _p in (SCRIPTS_DIR, REPO_ROOT / "lambdas" / "shared"):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import reef_audio  # noqa: E402
from download_marrs_samples import download_file_from_zip, get_zip_central_directory  # noqa: E402
from extract_marrs_excerpts import (  # noqa: E402
    FIGSHARE_DOI,
    build_figshare_lookup,
    list_figshare_files,
)
from surfperch_client import (  # noqa: E402
    BATCH_SIZE,
    DEFAULT_FUNCTION,
    DEFAULT_PROFILE,
    EMBEDDING_DIM,
    canonical_json,
    make_client,
    sha256_hex,
    window_sha256,
)

SCHEMA_VERSION = 1
FIGSHARE_ARTICLE = 29958062
DEFAULT_OUT_DIR = REPO_ROOT / "models" / "interim-real-only" / "evaluation" / "inputs"
DEFAULT_ROWS = DEFAULT_OUT_DIR / "rows.json"
DEFAULT_ORIGINAL = DEFAULT_OUT_DIR / "original.f32"
DEFAULT_CACHE_DIR = REPO_ROOT / "data" / "training" / "audio"  # gitignored (data/training/)
CONTAINER_NOTE = "inference container not rebuilt in Phase 5; its tensorflow-cpu version is unpinned and unrecorded"
DRIFT_NOTE = (
    "cosine between each original training row and the same file's first window "
    "re-embedded through reef_audio"
)


class ReembedError(RuntimeError):
    """A refusal or integrity failure in this job; message is safe to print."""


def _display_path(path):
    path = pathlib.Path(path).resolve()
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.name


def load_original(rows_path, embeddings_path):
    """Load the original rows and embeddings, verifying the pinned embeddings sha256."""
    rows_path = pathlib.Path(rows_path)
    doc = json.loads(rows_path.read_text(encoding="utf-8"))
    raw = pathlib.Path(embeddings_path).read_bytes()
    if sha256_hex(raw) != doc["embeddings_sha256"]:
        raise ReembedError("original embeddings sha256 does not match rows.json; refusing to continue")
    count, dim = int(doc["count"]), int(doc["dim"])
    X = np.frombuffer(raw, dtype="<f4")
    if dim != EMBEDDING_DIM or X.size != count * dim or len(doc["rows"]) != count:
        raise ReembedError("original inputs have an unexpected shape")
    return doc, X.reshape(count, dim), sha256_hex(rows_path.read_bytes())


def print_plan(rows):
    per_site = {}
    for r in rows:
        per_site.setdefault(r["site_id"], []).append(r["file_id"])
    print(f"plan: {len(rows)} file(s) across {len(per_site)} site(s); first 5 s window of each")
    for site, files in sorted(per_site.items()):
        print(f"  {site}: {len(files)} file(s) from {site}.zip")
    print("no AWS or figshare call made (pass --confirm to run live)")


def _entry_matches(entry_name, file_id):
    base = entry_name.replace("\\", "/").rsplit("/", 1)[-1]
    if base.startswith("._") or "__MACOSX" in entry_name:
        return False
    stem, dot, ext = base.rpartition(".")
    return bool(dot) and ext.lower() == "wav" and stem.lower() == file_id.lower()


def fetch_wavs(rows, cache_dir):
    """Yield (row, wav_bytes, zip_name, entry_name) in row order; zips read one directory each."""
    cache_dir = pathlib.Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    lookup = build_figshare_lookup(list_figshare_files())
    directories = {}
    for row in rows:
        site = row["site_id"]
        if site not in lookup:
            raise ReembedError(f"no figshare zip found for site {site}")
        if site not in directories:
            info = lookup[site]
            directories[site] = get_zip_central_directory(info["download_url"], info["size"])
        matches = [e for e in directories[site] if _entry_matches(e["filename"], row["file_id"])]
        if len(matches) != 1:
            raise ReembedError(f"{row['file_id']}: {len(matches)} matching entries in {site}.zip (expected 1)")
        entry = matches[0]
        cached = cache_dir / f"{row['file_id']}.WAV"
        if cached.exists() and cached.stat().st_size == entry["uncomp_size"]:
            data = cached.read_bytes()
        else:
            data = download_file_from_zip(lookup[site]["download_url"], entry)
            if len(data) != entry["uncomp_size"]:
                raise ReembedError(
                    f"{row['file_id']}: decoded {len(data)} bytes but the zip directory says "
                    f"{entry['uncomp_size']}; refusing"
                )
            cached.write_bytes(data)
        yield row, data, f"{site}.zip", entry["filename"]


def drift_probe(original, reembedded):
    cos = []
    for a, b in zip(original.astype(np.float64), reembedded.astype(np.float64)):
        na, nb = np.linalg.norm(a), np.linalg.norm(b)
        cos.append(float(a @ b / (na * nb)) if na > 0 and nb > 0 else 0.0)
    return {
        "pairs": len(cos),
        "cosine": {
            "mean": float(statistics.fmean(cos)),
            "median": float(statistics.median(cos)),
            "min": float(min(cos)),
            "max": float(max(cos)),
        },
        "note": DRIFT_NOTE,
    }


def run(args):
    doc, X, rows_sha = load_original(args.rows, args.original_embeddings)
    rows = doc["rows"]
    if args.limit is not None:
        rows = rows[: args.limit]
    X = X[: len(rows)]

    print_plan(rows)
    if args.dry_run or not args.confirm:
        return 0

    # Identity first: nothing is downloaded or invoked in the wrong account.
    client = make_client(args.profile)

    meta, windows = [], []
    for row, data, zip_name, entry_name in fetch_wavs(rows, args.cache_dir):
        prepared = reef_audio.audio_to_windows(data)
        window = prepared.windows[0]
        windows.append(window)
        meta.append({
            "row": row["row"],
            "file_id": row["file_id"],
            "site_id": row["site_id"],
            "label": row["label"],
            "zip_name": zip_name,
            "entry_name": entry_name,
            "wav_bytes": len(data),
            "wav_sha256": sha256_hex(data),
            "window_index": 0,
            "window_sha256": window_sha256(window),
            "peak_dbfs": prepared.peak_dbfs[0],
            "rms_dbfs": prepared.rms_dbfs[0],
            "silent": bool(prepared.silent[0]),
        })
        print(f"decoded {len(meta)}/{len(rows)} {row['file_id']}")

    client.warm()
    embedded = client.embed(np.stack(windows))
    if embedded.shape != (len(rows), EMBEDDING_DIM):
        raise ReembedError(f"unexpected embedding shape {embedded.shape}")
    raw = np.ascontiguousarray(embedded, dtype="<f4").tobytes()

    out = {
        "schema_version": SCHEMA_VERSION,
        "spec_version": reef_audio.SPEC_VERSION,
        "source_rows": {"path": _display_path(args.rows), "sha256": rows_sha},
        "dataset": {"doi": FIGSHARE_DOI, "figshare_article": FIGSHARE_ARTICLE, "licence": "CC BY 4.0"},
        "rows": meta,
        "embeddings_file": "reembedded.f32",
        "embeddings_sha256": sha256_hex(raw),
        "dtype": "float32-le",
        "dim": EMBEDDING_DIM,
        "count": len(meta),
        "inference": {
            "function_name": DEFAULT_FUNCTION,
            "invoked_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "batch_size": BATCH_SIZE,
            "kaggle_handle_pin": reef_audio.KAGGLE_MODEL_HANDLE,
            "container_note": CONTAINER_NOTE,
        },
        "drift_probe": drift_probe(X, embedded),
    }
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "reembedded.f32").write_bytes(raw)
    with open(out_dir / "reembedded.json", "w", encoding="utf-8", newline="\n") as f:
        f.write(canonical_json(out))
    cos = out["drift_probe"]["cosine"]
    print(
        f"wrote {len(meta)} re-embedded row(s); drift cosine mean {cos['mean']:.4f} "
        f"min {cos['min']:.4f} max {cos['max']:.4f}"
    )
    return 0


def build_parser():
    p = argparse.ArgumentParser(
        description="Re-embed the original training files through reef_audio and the inference Lambda."
    )
    p.add_argument("--rows", default=str(DEFAULT_ROWS), help="original rows.json (from evaluate_loso export-original)")
    p.add_argument("--original-embeddings", default=str(DEFAULT_ORIGINAL), help="original.f32 matching --rows")
    p.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    p.add_argument("--cache-dir", default=str(DEFAULT_CACHE_DIR), help="WAV cache (gitignored)")
    p.add_argument("--limit", type=int, default=None, help="only the first N rows")
    p.add_argument("--dry-run", action="store_true", help="print the plan only, even with --confirm")
    p.add_argument("--confirm", action="store_true", help="run live: figshare downloads and AWS inference")
    p.add_argument("--profile", default=DEFAULT_PROFILE)
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        return run(args)
    except (ReembedError, reef_audio.ReefAudioError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
