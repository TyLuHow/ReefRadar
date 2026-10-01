#!/usr/bin/env python3
"""Live-API smoke test (01-08, D-22).

Hits the deployed ReefRadar API directly (never mocked) to prove the live
backend is healthy and shaped as the frontend expects. Run manually, or via
the CI `live-smoke` job on `workflow_dispatch` with `live_smoke: true` —
never on a normal push/PR.

Never prints audio_url values: they are presigned S3 URLs and must not be
logged (T-01-08-03). Only shape/presence is checked.

Usage: python scripts/smoke_live.py
Exit code: 0 if all checks pass, 1 on any failure.
"""

import sys

import requests

API_URL = "https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod"
TIMEOUT_SECONDS = 30
EXPECTED_SITE_COUNT = 54

FAILURES: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        FAILURES.append(message)
        print(f"FAIL: {message}")
    else:
        print(f"PASS: {message}")


def check_health() -> None:
    resp = requests.get(f"{API_URL}/health", timeout=TIMEOUT_SECONDS)
    check(resp.status_code == 200, f"GET /health returns 200 (got {resp.status_code})")
    if resp.status_code != 200:
        return
    body = resp.json()
    check(body.get("status") == "healthy", f"/health status is 'healthy' (got {body.get('status')!r})")


def check_sites() -> None:
    resp = requests.get(f"{API_URL}/sites", timeout=TIMEOUT_SECONDS)
    check(resp.status_code == 200, f"GET /sites returns 200 (got {resp.status_code})")
    if resp.status_code != 200:
        return
    body = resp.json()
    sites = body.get("sites", [])
    check(
        len(sites) == EXPECTED_SITE_COUNT,
        f"/sites returns {EXPECTED_SITE_COUNT} sites (got {len(sites)})",
    )
    missing_fields = [
        s.get("site_id", "<unknown>")
        for s in sites
        if "site_id" not in s or "status" not in s
    ]
    check(
        not missing_fields,
        f"every site has site_id and status (missing on: {missing_fields})",
    )


def check_samples() -> None:
    resp = requests.get(f"{API_URL}/samples", timeout=TIMEOUT_SECONDS)
    check(resp.status_code == 200, f"GET /samples returns 200 (got {resp.status_code})")
    if resp.status_code != 200:
        return
    body = resp.json()
    samples = body.get("samples", [])
    check(len(samples) > 0, "/samples returns a non-empty samples array")
    missing_fields = [
        s.get("id", "<unknown>")
        for s in samples
        if "id" not in s or "site_id" not in s or "audio_url" not in s
    ]
    # Deliberately never print the audio_url values themselves (presigned).
    check(
        not missing_fields,
        f"every sample has id, site_id and audio_url (missing on: {missing_fields})",
    )


def main() -> int:
    check_health()
    check_sites()
    check_samples()

    if FAILURES:
        print(f"\n{len(FAILURES)} smoke check(s) failed.")
        return 1

    print("\nAll live-API smoke checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
