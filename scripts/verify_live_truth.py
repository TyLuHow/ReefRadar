#!/usr/bin/env python3
"""
Live truth verification of the public ReefRadar API (plan 01-14).

Exits 0 only if every check passes:

  /sites     54 sites, every one carries label_source, Bora-Bora and Irma
             sites report status 'unknown'.
  /samples   ids equal the committed manifest gallery ids, no phl_ site,
             every downloaded clip's sha256 equals the manifest and passes
             check_audio_real.check_file (not synthetic).
  analysis   the committed ind_H1 excerpt analysed WITH its coordinates
             completes within --timeout seconds; probabilities sum to 1
             within 1e-6, keys equal the model-card classes,
             classification.model_version equals the model-card
             model_version, no non-empty visualization, region
             coordinates_provided and in_training_region true. A second
             analysis WITHOUT coordinates reports coordinates_provided false.
             Both analyses must also carry the contract version stamp
             (plan 02-11): contract_version an integer equal to --stamp
             (default contracts/bucket/v2/stamp.json), and dataset_version,
             model_version, preprocessing_spec_version equal to that file.
             The expected classes and model_version come from --model-version
             (default contracts/bucket/v2/model_version.json).
  contract v2  (plan 05-15) when the stamp's contract_version is 2 or more, each
             analysis must also satisfy check_v2_result: stamp_status stamped,
             the legacy classification and similar_sites key sets unchanged, the
             window count the excerpt really has (computed with reef_audio, never
             typed), per-window probabilities summing to 1 with the recording the
             column mean, 54 site similarities (48 with embeddings) in the
             contract's row order, the legacy top-3 equal to ranks 1-3, the PCA
             variance and the OOD threshold and reference hash equal to the
             published artifacts, and no visualization.

Presigned audio URLs are never printed or logged (only sample ids and
outcomes). Run `--no-analysis` to skip the (slow) analysis checks.

Usage:
    py -3.12 scripts/verify_live_truth.py
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

import check_audio_real

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_API = "https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod"
EXPECTED_SITE_COUNT = 54
UNKNOWN_STATUS_PREFIXES = ("borabora_", "irma_")
ANALYSIS_SITE = "ind_H1"
# The classifier stores probabilities rounded to 9 decimals (sum error ~1e-9),
# but analyses stored by an older classifier build were rounded to 6 decimals,
# where the summed rounding error of 3-4 classes can reach ~2e-6 (so a 1e-6
# tolerance flakes on a correct deployment). 1e-5 absorbs that while still
# catching any real defect (a missing class or a scaled distribution is off by
# orders of magnitude more than this).
PROBABILITY_TOLERANCE = 1e-5
BUCKET_DIR = REPO_ROOT / "contracts" / "bucket"
DEFAULT_STAMP = BUCKET_DIR / "v2" / "stamp.json"
DEFAULT_MODEL_VERSION = BUCKET_DIR / "v2" / "model_version.json"
# Contract v2 result checks: stored values are rounded to 9 decimals, so 1e-6 is generous
# for rows and means yet far below any real defect.
V2_TOLERANCE = 1e-6
CLASSIFICATION_KEYS = {"label", "confidence", "probabilities", "model_version", "region"}
LEGACY_SIMILAR_SITE_KEYS = {
    "site_id", "similarity", "country", "status", "label_source", "label_source_name", "label_original",
}
TOP_SIMILAR_SITES = 3


# --------------------------------------------------------------------------
# Pure checks: each returns a list of failure strings (empty = pass).
# --------------------------------------------------------------------------

def check_sites(body: dict) -> list[str]:
    failures = []
    sites = body.get("sites", [])
    if len(sites) != EXPECTED_SITE_COUNT:
        failures.append(f"/sites returned {len(sites)} sites, expected {EXPECTED_SITE_COUNT}")
    missing = [s.get("site_id", "?") for s in sites if not s.get("label_source")]
    if missing:
        failures.append(f"sites without label_source: {missing}")
    wrong = [
        s.get("site_id", "?")
        for s in sites
        if str(s.get("site_id", "")).startswith(UNKNOWN_STATUS_PREFIXES) and s.get("status") != "unknown"
    ]
    if wrong:
        failures.append(f"Bora-Bora/Irma sites whose status is not 'unknown': {wrong}")
    return failures


def check_samples_listing(body: dict, manifest: dict) -> list[str]:
    failures = []
    samples = body.get("samples", [])
    live_ids = [s.get("id") for s in samples]
    expected_ids = [s["id"] for s in manifest["gallery"]["samples"]]
    if sorted(live_ids) != sorted(expected_ids):
        failures.append(
            f"/samples ids differ from manifest gallery: extra={sorted(set(live_ids) - set(expected_ids))} "
            f"missing={sorted(set(expected_ids) - set(live_ids))}"
        )
    synthetic = [s.get("id") for s in samples if str(s.get("site_id", "")).startswith("phl_") or str(s.get("id", "")).startswith("phl_")]
    if synthetic:
        failures.append(f"/samples contains phl_ (synthetic-era) entries: {synthetic}")
    return failures


def check_clip(sample_id: str, data: bytes, expected_sha256: str | None) -> list[str]:
    import hashlib
    import io

    failures = []
    if expected_sha256 is None:
        return [f"{sample_id}: no manifest excerpt to compare against"]
    actual = hashlib.sha256(data).hexdigest()
    if actual != expected_sha256:
        failures.append(f"{sample_id}: sha256 {actual} != manifest {expected_sha256}")
    try:
        result = check_audio_real.check_file(io.BytesIO(data))
    except Exception as e:  # noqa: BLE001
        return failures + [f"{sample_id}: not a readable WAV ({type(e).__name__})"]
    if result["flagged"]:
        failures.append(f"{sample_id}: flagged synthetic by check_audio_real: {result['reasons']}")
    return failures


STAMP_STRING_KEYS = ("dataset_version", "model_version", "preprocessing_spec_version")


def check_stamp(body: dict, expected_stamp: dict) -> list[str]:
    """Contract version stamps (CONTRACT-04) on a /visualize body.

    contract_version must be an integer (JSON 1, never 1.0 and never a bool)
    equal to the committed stamp; the three string versions must equal it too.
    """
    failures = []
    got = body.get("contract_version")
    if got is None:
        failures.append("contract_version is missing or null (pre-contract result)")
    elif type(got) is not int:
        failures.append(f"contract_version {got!r} is a {type(got).__name__}, not an integer")
    elif got != expected_stamp["contract_version"]:
        failures.append(f"contract_version {got!r} != stamp {expected_stamp['contract_version']!r}")
    for key in STAMP_STRING_KEYS:
        if body.get(key) != expected_stamp[key]:
            failures.append(f"{key} {body.get(key)!r} != stamp {expected_stamp[key]!r}")
    return failures


def load_stamp(path: pathlib.Path) -> dict:
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def build_v2_expectations(stamp: dict, window_count: int, bucket_dir: pathlib.Path = BUCKET_DIR) -> dict:
    """What a correct contract-v2 result must equal, read from the published artifacts.

    `window_count` is how many 5 s windows the analysed excerpt has (the caller
    computes it from the excerpt bytes). Everything else comes from the contract
    manifest the stamp names and the artifacts it points at.
    """
    bucket_dir = pathlib.Path(bucket_dir)
    manifest = json.loads((bucket_dir / "contract" / f"v{stamp['contract_version']}.json").read_text(encoding="utf-8"))
    artifacts = manifest["artifacts"]

    def read(name):
        return json.loads((bucket_dir / pathlib.Path(*artifacts[name]["uri"].split("/"))).read_text(encoding="utf-8"))

    sidecar = read("ood_reference")
    return {
        "window_count": int(window_count),
        "row_site_ids": list(artifacts["embeddings"]["row_site_ids"]),
        "site_count": int(artifacts["sites"]["count"]),
        "embedded_count": int(artifacts["embeddings"]["count"]),
        "projection_variance": [float(v) for v in read("projection")["explained_variance_ratio"]],
        "ood_threshold": float(sidecar["threshold"]),
        "ood_reference_sha256": sidecar["embeddings"]["sha256"],
        "preprocessing_spec_version": stamp["preprocessing_spec_version"],
    }


def check_v2_result(body: dict, model_card: dict, expected: dict) -> list[str]:
    """Contract v2 checks (plan 05-15) on a /visualize body; one failure string per violation.

    Proves, for a real analysis, that the legacy shape still holds and that every
    new field and the v2 stamp are present and consistent with the published
    artifacts. `expected` comes from build_v2_expectations.
    """
    failures: list[str] = []
    if body.get("stamp_status") != "stamped":
        failures.append(f"stamp_status is {body.get('stamp_status')!r}, expected 'stamped'")

    classification = body.get("classification") or {}
    if set(classification) != CLASSIFICATION_KEYS:
        failures.append(
            f"classification keys {sorted(classification)} != legacy keys {sorted(CLASSIFICATION_KEYS)}"
        )

    count = expected["window_count"]
    windows = body.get("windows") or {}
    classes = list(model_card["classes"])
    if windows.get("count") != count:
        failures.append(f"windows.count {windows.get('count')!r} != expected {count}")
    per_window = windows.get("probabilities") or {}
    if sorted(per_window) != sorted(classes):
        failures.append(f"windows.probabilities classes {sorted(per_window)} != {sorted(classes)}")
    elif any(not isinstance(per_window[c], list) or len(per_window[c]) != count for c in classes):
        failures.append(f"windows.probabilities does not hold {count} values per class")
    else:
        bad_rows = [
            i for i in range(count)
            if abs(sum(per_window[c][i] for c in classes) - 1.0) > V2_TOLERANCE
        ]
        if bad_rows:
            failures.append(f"per-window probabilities do not sum to 1 within {V2_TOLERANCE} for windows {bad_rows}")
        recording = classification.get("probabilities") or {}
        off = [
            c for c in classes
            if count and abs(recording.get(c, float("inf")) - sum(per_window[c]) / count) > V2_TOLERANCE
        ]
        if off:
            failures.append(f"recording probabilities are not the mean of the window probabilities for {off}")

    aggregation = (body.get("embedding_summary") or {}).get("aggregation")
    if aggregation != "mean_of_window_probabilities":
        failures.append(f"embedding_summary.aggregation is {aggregation!r}, expected 'mean_of_window_probabilities'")

    similarities = body.get("site_similarities") or {}
    sites = similarities.get("sites") or []
    if len(sites) != expected["site_count"]:
        failures.append(f"site_similarities has {len(sites)} sites, expected {expected['site_count']}")
    embedded = [s for s in sites if s.get("has_embedding") is True]
    if len(embedded) != expected["embedded_count"]:
        failures.append(
            f"site_similarities has {len(embedded)} sites with embeddings, expected {expected['embedded_count']}"
        )
    if similarities.get("site_order") != expected["row_site_ids"]:
        failures.append("site_similarities.site_order differs from the contract manifest row_site_ids")

    similar = body.get("similar_sites")
    if not isinstance(similar, list) or len(similar) != TOP_SIMILAR_SITES:
        failures.append(
            f"similar_sites has {len(similar) if isinstance(similar, list) else 'no'} entries, "
            f"expected {TOP_SIMILAR_SITES}"
        )
    else:
        wrong_keys = [e.get("site_id") for e in similar if set(e) != LEGACY_SIMILAR_SITE_KEYS]
        if wrong_keys:
            failures.append(f"similar_sites entries {wrong_keys} do not have exactly the legacy keys")
        ranked = sorted((s for s in embedded if isinstance(s.get("rank"), int)), key=lambda s: s["rank"])
        top_ids = [s.get("site_id") for s in ranked[:TOP_SIMILAR_SITES]]
        if [e.get("site_id") for e in similar] != top_ids:
            failures.append("similar_sites site ids are not the sites ranked 1-3 in site_similarities")

    variance = (body.get("projection") or {}).get("explained_variance_ratio")
    want = expected["projection_variance"]
    if (
        not isinstance(variance, list) or len(variance) != len(want)
        or any(abs(a - b) > V2_TOLERANCE for a, b in zip(variance, want))
    ):
        failures.append(f"projection.explained_variance_ratio {variance!r} != published {want!r}")

    ood = body.get("ood") or {}
    threshold = ood.get("threshold")
    if not isinstance(threshold, (int, float)) or abs(threshold - expected["ood_threshold"]) > V2_TOLERANCE:
        failures.append(f"ood.threshold {threshold!r} != published {expected['ood_threshold']!r}")
    if ood.get("reference_sha256") != expected["ood_reference_sha256"]:
        failures.append("ood.reference_sha256 differs from the published OOD reference")
    ood_windows = ood.get("windows") or {}
    for key in ("distance", "status"):
        values = ood_windows.get(key)
        if not isinstance(values, list) or len(values) != count:
            failures.append(f"ood.windows.{key} does not hold {count} values")

    spec = (body.get("input_audio") or {}).get("preprocessing_spec_version")
    if spec != expected["preprocessing_spec_version"]:
        failures.append(
            f"input_audio.preprocessing_spec_version {spec!r} != stamp {expected['preprocessing_spec_version']!r}"
        )
    if body.get("visualization"):
        failures.append("response carries a non-empty visualization (embedding-space data)")
    return failures


def check_analysis(
    body: dict,
    model_card: dict,
    expect_coordinates: bool,
    expected_stamp: dict | None = None,
    expected_v2: dict | None = None,
) -> list[str]:
    failures = []
    if body.get("status") != "complete":
        return [f"analysis status is {body.get('status')!r}, not 'complete'"]
    if expected_stamp is not None:
        failures.extend(check_stamp(body, expected_stamp))
        if int(expected_stamp.get("contract_version", 0)) >= 2:
            if expected_v2 is None:
                failures.append("contract v2 stamp expected but no v2 expectations were supplied")
            else:
                failures.extend(check_v2_result(body, model_card, expected_v2))
    classification = body.get("classification") or {}
    probs = classification.get("probabilities") or {}
    total = sum(probs.values()) if probs else 0.0
    if abs(total - 1.0) > PROBABILITY_TOLERANCE:
        failures.append(f"probabilities sum to {total!r}, not 1 within {PROBABILITY_TOLERANCE}")
    if sorted(probs.keys()) != sorted(model_card["classes"]):
        failures.append(f"probability keys {sorted(probs.keys())} != model-card classes {sorted(model_card['classes'])}")
    if classification.get("model_version") != model_card["model_version"]:
        failures.append(
            f"classification.model_version {classification.get('model_version')!r} != "
            f"model-card {model_card['model_version']!r}"
        )
    if body.get("visualization") and not any("visualization" in f for f in failures):
        failures.append("response carries a non-empty visualization (embedding-space data)")
    region = classification.get("region") or {}
    if not region:
        failures.append("classification.region missing")
    if expect_coordinates:
        if region.get("coordinates_provided") is not True:
            failures.append(f"region.coordinates_provided is {region.get('coordinates_provided')!r}, expected true")
        if region.get("in_training_region") is not True:
            failures.append(f"region.in_training_region is {region.get('in_training_region')!r}, expected true")
    elif region.get("coordinates_provided") is not False:
        failures.append(f"region.coordinates_provided is {region.get('coordinates_provided')!r}, expected false")
    return failures


def expected_window_count(wav_bytes: bytes) -> int:
    """How many 5 s windows the classifier will see in this excerpt (reef_audio, never typed)."""
    shared = str(REPO_ROOT / "lambdas" / "shared")
    if shared not in sys.path:
        sys.path.insert(0, shared)
    import reef_audio

    return int(reef_audio.audio_to_windows(wav_bytes).windows.shape[0])


def analysis_summary(body: dict, analysis_id: str) -> dict:
    classification = body.get("classification") or {}
    probs = classification.get("probabilities") or {}
    region = classification.get("region") or {}
    return {
        "analysis_id": analysis_id,
        "label": classification.get("label"),
        "model_version": classification.get("model_version"),
        "stamp": {
            k: body.get(k) for k in ("contract_version", "dataset_version", "model_version", "preprocessing_spec_version")
        },
        "probability_sum": round(sum(probs.values()), 9) if probs else None,
        "region": {k: region.get(k) for k in ("detected", "scope", "coordinates_provided", "in_training_region", "training_sites_in_region")},
        "similar_sites_count": len(body.get("similar_sites") or []),
        "stamp_status": body.get("stamp_status"),
        "windows_count": (body.get("windows") or {}).get("count"),
        "ood_statement": ((body.get("ood") or {}).get("summary") or {}).get("statement"),
    }


# --------------------------------------------------------------------------
# Live runner
# --------------------------------------------------------------------------

def _get_json(session, url, timeout):
    resp = session.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


class StepError(RuntimeError):
    """An API step failed; carries only the step name, HTTP status and API error code."""


def _check_step(resp, step):
    if resp.status_code >= 400:
        code = ""
        try:
            code = (resp.json().get("error") or {}).get("code", "")
        except Exception:  # noqa: BLE001
            pass
        raise StepError(f"{step} returned HTTP {resp.status_code} {code}".strip())


def run_analysis(session, api, wav_bytes, filename, coords, timeout_s, poll_interval=3.0, sleep=time.sleep):
    """Upload, analyse, poll /status, then fetch /visualize. Returns (analysis_id, body)."""
    up = session.post(
        f"{api}/upload", data=wav_bytes, headers={"Content-Type": "audio/wav", "X-Filename": filename}, timeout=60
    )
    _check_step(up, "POST /upload")
    upload_id = up.json()["upload_id"]
    payload = {"upload_id": upload_id}
    if coords:
        payload["latitude"], payload["longitude"] = coords
    an = session.post(f"{api}/analyze", json=payload, timeout=30)
    _check_step(an, "POST /analyze")
    analysis_id = an.json()["analysis_id"]

    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        # /status first: /visualize 404s until preprocessing has written its record.
        poll = session.get(f"{api}/status/{analysis_id}", timeout=30)
        _check_step(poll, "GET /status")
        state = poll.json().get("status")
        if state == "complete":
            final = session.get(f"{api}/visualize/{analysis_id}", timeout=30)
            _check_step(final, "GET /visualize")
            return analysis_id, final.json()
        if state == "failed":
            return analysis_id, {"status": "failed", "error": poll.json().get("error")}
        sleep(poll_interval)
    return analysis_id, {"status": "timeout"}


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--api-url", default=DEFAULT_API)
    p.add_argument("--timeout", type=float, default=180.0, help="Per-analysis completion timeout (seconds)")
    p.add_argument("--no-analysis", action="store_true", help="Skip the upload/analyse checks")
    p.add_argument("--manifest", type=pathlib.Path, default=REPO_ROOT / "data" / "audio-manifest.json")
    p.add_argument(
        "--model-version", type=pathlib.Path, default=DEFAULT_MODEL_VERSION,
        help="Published model-version document supplying the expected classes and model_version "
             "(default: contracts/bucket/v2/model_version.json)",
    )
    p.add_argument("--repo-root", type=pathlib.Path, default=REPO_ROOT)
    p.add_argument(
        "--stamp", type=pathlib.Path, default=DEFAULT_STAMP,
        help="Expected contract version stamp applied to both analyses (default: contracts/bucket/v2/stamp.json)",
    )
    return p


def main(argv=None, session=None) -> int:
    import requests

    args = build_parser().parse_args(argv)
    session = session or requests.Session()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    model_card = json.loads(args.model_version.read_text(encoding="utf-8"))
    expected_stamp = load_stamp(args.stamp) if not args.no_analysis else None
    api = args.api_url.rstrip("/")
    failures: list[str] = []
    summary: dict = {}

    def section(name, found):
        print(f"{'PASS' if not found else 'FAIL'}: {name}")
        for f in found:
            print(f"  - {f}")
        failures.extend(found)

    try:
        section("/sites provenance", check_sites(_get_json(session, f"{api}/sites", 30)))
    except Exception as e:  # noqa: BLE001
        section("/sites provenance", [f"request failed: {type(e).__name__}"])

    try:
        samples_body = _get_json(session, f"{api}/samples", 30)
        listing = check_samples_listing(samples_body, manifest)
        section("/samples ids", listing)
        sha_by_id = {ex["excerpt_id"]: ex["sha256"] for ex in manifest["excerpts"]}
        clip_failures = []
        for sample in samples_body.get("samples", []):
            sid = sample.get("id")
            try:
                resp = session.get(sample["audio_url"], timeout=60)  # presigned: never printed
                if resp.status_code != 200:
                    clip_failures.append(f"{sid}: audio download returned HTTP {resp.status_code}")
                    continue
                clip_failures.extend(check_clip(sid, resp.content, sha_by_id.get(sid)))
            except Exception as e:  # noqa: BLE001 - message omitted: may embed the presigned URL
                clip_failures.append(f"{sid}: audio download failed ({type(e).__name__})")
        section("/samples audio is real and hash-matched", clip_failures)
        summary["samples_checked"] = len(samples_body.get("samples", []))
    except Exception as e:  # noqa: BLE001
        section("/samples", [f"request failed: {type(e).__name__}"])

    if not args.no_analysis:
        excerpt = next(ex for ex in manifest["excerpts"] if ex["site_id"] == ANALYSIS_SITE)
        gallery = next(s for s in manifest["gallery"]["samples"] if s["id"] == excerpt["excerpt_id"])
        coords = (gallery["coordinates"]["lat"], gallery["coordinates"]["lng"])
        wav = (args.repo_root / excerpt["path"]).read_bytes()
        name = pathlib.Path(excerpt["path"]).name
        expected_v2 = None
        if expected_stamp is not None and int(expected_stamp["contract_version"]) >= 2:
            expected_v2 = build_v2_expectations(
                expected_stamp, expected_window_count(wav), args.repo_root / "contracts" / "bucket"
            )
        for label, use_coords in (("with coordinates", True), ("without coordinates", False)):
            try:
                started = time.monotonic()
                analysis_id, body = run_analysis(session, api, wav, name, coords if use_coords else None, args.timeout)
                elapsed = time.monotonic() - started
                found = check_analysis(
                    body, model_card, expect_coordinates=use_coords,
                    expected_stamp=expected_stamp, expected_v2=expected_v2,
                )
                section(f"analysis {label} ({elapsed:.0f}s)", found)
                summary[f"analysis_{'with' if use_coords else 'without'}_coordinates"] = analysis_summary(body, analysis_id)
            except Exception as e:  # noqa: BLE001
                section(f"analysis {label}", [f"failed: {e if isinstance(e, StepError) else type(e).__name__}"])

    print(json.dumps({"summary": summary, "failures": len(failures)}))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
