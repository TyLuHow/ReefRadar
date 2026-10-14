#!/usr/bin/env python3
"""
Record and check the excerpt embedding fixture (Phase 5, ML-01 / ML-06).

The 9 committed MARRS excerpts (dashboard-next/public/audio/marrs, 6 windows each,
54 in all) are decoded with reef_audio.audio_to_windows and every window is embedded
through the deployed inference Lambda. The result is the parity fixture that later
tests and the live gate compare against:

    excerpt_embeddings.f32    54 x 1280 little-endian float32
    excerpt_embeddings.json   each excerpt's path and sha256, per window index, row and
                              window_sha256, embeddings_sha256, spec_version, recorded_at,
                              inference details and the tolerance

Modes:
    (default)  record: embed every window and write both files.
    --check    never writes. First recompute every excerpt sha256 and window sha256 and
               compare them with the committed json; if anything differs, exit 1 BEFORE
               inference (the fixture is stale, regenerate it deliberately). Then re-embed
               and require every row to meet cosine >= 0.99999 and max abs <= 1e-5
               (05-RESEARCH Q4: run the live regeneration twice, cold and warm).

Safety: without --confirm nothing touches AWS (record prints a plan; --check runs only
the offline hash comparison). With --confirm the account 781978598306 is verified first.
Output is counts, hashes and tolerances only.

Usage:
    py -3.12 scripts/record_embedding_fixture.py                    # plan only
    py -3.12 scripts/record_embedding_fixture.py --confirm          # live record
    py -3.12 scripts/record_embedding_fixture.py --check --confirm  # live tolerance check
"""

import argparse
import datetime
import json
import pathlib
import sys

import numpy as np

SCRIPTS_DIR = pathlib.Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
for _p in (SCRIPTS_DIR, REPO_ROOT / "lambdas" / "shared"):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import reef_audio  # noqa: E402
from surfperch_client import (  # noqa: E402
    BATCH_SIZE,
    COSINE_MIN,
    DEFAULT_FUNCTION,
    DEFAULT_PROFILE,
    EMBEDDING_DIM,
    MAX_ABS,
    canonical_json,
    compare_embeddings,
    make_client,
    sha256_hex,
    window_sha256,
)

SCHEMA_VERSION = 1
DEFAULT_EXCERPTS_DIR = REPO_ROOT / "dashboard-next" / "public" / "audio" / "marrs"
DEFAULT_OUT_DIR = REPO_ROOT / "lambdas" / "preprocessor" / "tests" / "fixtures"
EMB_NAME = "excerpt_embeddings.f32"
JSON_NAME = "excerpt_embeddings.json"
CONTAINER_NOTE = "inference container not rebuilt in Phase 5; its tensorflow-cpu version is unpinned and unrecorded"


class FixtureError(RuntimeError):
    """A refusal or integrity failure; the message is safe to print."""


def _display_path(path):
    path = pathlib.Path(path).resolve()
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.name


def prepare(excerpts_dir):
    """Decode the sorted excerpts. Returns (entries, windows) with windows (n, 160000)."""
    files = sorted((p for p in pathlib.Path(excerpts_dir).iterdir() if p.suffix.lower() == ".wav"),
                   key=lambda p: p.name)
    if not files:
        raise FixtureError(f"no .wav excerpts found in {_display_path(excerpts_dir)}")
    entries, chunks, row = [], [], 0
    for path in files:
        data = path.read_bytes()
        prepared = reef_audio.audio_to_windows(data)
        windows = []
        for i, w in enumerate(prepared.windows):
            windows.append({"index": i, "row": row, "window_sha256": window_sha256(w)})
            row += 1
        entries.append({
            "path": path.name,
            "sha256": sha256_hex(data),
            "wav_bytes": len(data),
            "windows": windows,
        })
        chunks.append(prepared.windows)
    return entries, np.concatenate(chunks, axis=0)


def verify_inputs(doc, entries):
    """Compare recomputed excerpt and window hashes with the committed fixture json."""
    problems = []
    if doc.get("spec_version") != reef_audio.SPEC_VERSION:
        problems.append(f"spec_version {doc.get('spec_version')} != {reef_audio.SPEC_VERSION}")
    recorded = {e["path"]: e for e in doc.get("excerpts", [])}
    current = {e["path"]: e for e in entries}
    for name in sorted(set(recorded) - set(current)):
        problems.append(f"{name}: recorded but missing from the excerpts directory")
    for name in sorted(set(current) - set(recorded)):
        problems.append(f"{name}: present but not in the fixture")
    for name in sorted(set(recorded) & set(current)):
        r, c = recorded[name], current[name]
        if r.get("sha256") != c["sha256"]:
            problems.append(f"{name}: excerpt sha256 changed")
        if r.get("windows") != c["windows"]:
            problems.append(f"{name}: window hashes or rows changed")
    return problems


def record(args):
    entries, windows = prepare(args.excerpts_dir)
    print(f"plan: record {len(entries)} excerpt(s), {windows.shape[0]} window(s) -> "
          f"{_display_path(args.out_dir)}/{{{EMB_NAME},{JSON_NAME}}}")
    if not args.confirm:
        print("no AWS call made (pass --confirm to record live)")
        return 0

    client = make_client(args.profile)
    client.warm()
    embedded = client.embed(windows)
    if embedded.shape != (windows.shape[0], EMBEDDING_DIM):
        raise FixtureError(f"unexpected embedding shape {embedded.shape}")
    raw = np.ascontiguousarray(embedded, dtype="<f4").tobytes()
    doc = {
        "schema_version": SCHEMA_VERSION,
        "spec_version": reef_audio.SPEC_VERSION,
        "recorded_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "excerpts_dir": _display_path(args.excerpts_dir),
        "excerpts": entries,
        "embeddings_file": EMB_NAME,
        "embeddings_sha256": sha256_hex(raw),
        "dtype": "float32-le",
        "dim": EMBEDDING_DIM,
        "count": int(windows.shape[0]),
        "tolerance": {"cosine_min": COSINE_MIN, "max_abs": MAX_ABS},
        "inference": {
            "function_name": DEFAULT_FUNCTION,
            "batch_size": BATCH_SIZE,
            "kaggle_handle_pin": reef_audio.KAGGLE_MODEL_HANDLE,
            "container_note": CONTAINER_NOTE,
        },
    }
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / EMB_NAME).write_bytes(raw)
    with open(out_dir / JSON_NAME, "w", encoding="utf-8", newline="\n") as f:
        f.write(canonical_json(doc))
    print(f"recorded {doc['count']} embedding(s); embeddings sha256 {doc['embeddings_sha256']}")
    return 0


def check(args):
    out_dir = pathlib.Path(args.out_dir)
    json_path, emb_path = out_dir / JSON_NAME, out_dir / EMB_NAME
    if not json_path.exists() or not emb_path.exists():
        raise FixtureError(f"fixture not found in {_display_path(out_dir)}; record it first")
    doc = json.loads(json_path.read_text(encoding="utf-8"))
    raw = emb_path.read_bytes()
    if sha256_hex(raw) != doc.get("embeddings_sha256"):
        raise FixtureError("stored embeddings sha256 does not match the fixture json")

    entries, windows = prepare(args.excerpts_dir)
    problems = verify_inputs(doc, entries)
    if problems:
        for problem in problems:
            print(f"stale fixture: {problem}")
        print("refusing to check: the fixture does not describe these excerpts; "
              "regenerate it deliberately (record mode)")
        return 1
    print(f"inputs match: {len(entries)} excerpt(s), {windows.shape[0]} window(s)")
    if not args.confirm:
        print("embedding comparison skipped; pass --confirm to re-embed live")
        return 0

    stored = np.frombuffer(raw, dtype="<f4").reshape(doc["count"], doc["dim"])
    client = make_client(args.profile)
    client.warm()
    fresh = client.embed(windows)
    tol = doc["tolerance"]
    result = compare_embeddings(stored, fresh, tol["cosine_min"], tol["max_abs"])
    print(f"min cosine {result['min_cosine']:.8f} (bound {tol['cosine_min']}), "
          f"max abs {result['max_abs_diff']:.3e} (bound {tol['max_abs']})")
    if not result["ok"]:
        bad = [r["row"] for r in result["rows"] if not r["ok"]]
        print(f"FAIL: {len(bad)} row(s) outside tolerance; first rows {bad[:5]}")
        return 1
    print("PASS: every row within tolerance")
    return 0


def build_parser():
    p = argparse.ArgumentParser(description="Record or check the excerpt embedding fixture.")
    p.add_argument("--excerpts-dir", default=str(DEFAULT_EXCERPTS_DIR))
    p.add_argument("--out-dir", default=str(DEFAULT_OUT_DIR))
    p.add_argument("--check", action="store_true", help="compare a fresh embedding with the stored fixture; never writes")
    p.add_argument("--confirm", action="store_true", help="run live against AWS")
    p.add_argument("--profile", default=DEFAULT_PROFILE)
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        return check(args) if args.check else record(args)
    except (FixtureError, reef_audio.ReefAudioError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
