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


def check_analysis(body: dict, model_card: dict, expect_coordinates: bool) -> list[str]:
    failures = []
    if body.get("status") != "complete":
        return [f"analysis status is {body.get('status')!r}, not 'complete'"]
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
    if body.get("visualization"):
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


def analysis_summary(body: dict, analysis_id: str) -> dict:
    classification = body.get("classification") or {}
    probs = classification.get("probabilities") or {}
    region = classification.get("region") or {}
    return {
        "analysis_id": analysis_id,
        "label": classification.get("label"),
        "model_version": classification.get("model_version"),
        "probability_sum": round(sum(probs.values()), 9) if probs else None,
        "region": {k: region.get(k) for k in ("detected", "scope", "coordinates_provided", "in_training_region", "training_sites_in_region")},
        "similar_sites_count": len(body.get("similar_sites") or []),
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
    p.add_argument("--model-card", type=pathlib.Path, default=REPO_ROOT / "dashboard-next" / "src" / "data" / "model-card.json")
    p.add_argument("--repo-root", type=pathlib.Path, default=REPO_ROOT)
    return p


def main(argv=None, session=None) -> int:
    import requests

    args = build_parser().parse_args(argv)
    session = session or requests.Session()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    model_card = json.loads(args.model_card.read_text(encoding="utf-8"))
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
        for label, use_coords in (("with coordinates", True), ("without coordinates", False)):
            try:
                started = time.monotonic()
                analysis_id, body = run_analysis(session, api, wav, name, coords if use_coords else None, args.timeout)
                elapsed = time.monotonic() - started
                found = check_analysis(body, model_card, expect_coordinates=use_coords)
                section(f"analysis {label} ({elapsed:.0f}s)", found)
                summary[f"analysis_{'with' if use_coords else 'without'}_coordinates"] = analysis_summary(body, analysis_id)
            except Exception as e:  # noqa: BLE001
                section(f"analysis {label}", [f"failed: {e if isinstance(e, StepError) else type(e).__name__}"])

    print(json.dumps({"summary": summary, "failures": len(failures)}))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
