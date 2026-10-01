---
phase: 01-truth-reproducibility
plan: 14
subsystem: infra
tags: [aws-lambda, s3, deploy, rollback, live-verification, drift-check]

requires:
  - phase: 01-truth-reproducibility
    provides: truthful router (01-11), classifier (01-12), interim real-only model and audio manifest (01-10/01-13), scripted deploy path and drift check (01-09)
provides:
  - Production router and classifier serving the Phase 1 truth fixes, deployed from a clean commit via scripts/deploy-lambdas.py
  - Nine real MARRS excerpts under s3://reefradar-2477-audio/samples/marrs/, hash-verified; the eight synthetic clips archived to retired/synthetic-samples-20261001/
  - Interim real-only 3-class model live in s3://reefradar-2477-embeddings/models/ with v2.0 archived
  - scripts/sync_sample_audio.py, scripts/publish_model.py, scripts/verify_live_truth.py (+ tests)
  - docs/deploy/DEPLOY-LOG.md with both attempts, the established 503 root cause and a Rollback section
affects: [01-20 exit gate, Phase 5 (similar_sites observation), Phase 12 retrain release]

actuals:
  tokens: 45000
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - "Idempotent, hash-verified production writes (--dry-run / --confirm), archive-before-overwrite for models, retire-not-delete for audio"
    - "Warm the 3 GB inference container before any verification burst; run analyses serially while account concurrency is 10"

key-files:
  created:
    - scripts/sync_sample_audio.py
    - scripts/publish_model.py
    - scripts/verify_live_truth.py
    - scripts/tests/test_publish_tools.py
    - docs/deploy/DEPLOY-LOG.md
  modified:
    - infrastructure/deployed-state.json

key-decisions:
  - "Attempt 1 503 was account-level Lambda concurrency saturation (limit 10) triggered by cold inference container + async retries + a buggy verifier, not the new code; attempt 2 reran the same commit content successfully"
  - "Service Quotas request 4b8d23edbdcf43d9a9eee46fddc7b589IQUhYJr5 filed (10 -> 1000 concurrent executions), still PENDING"

patterns-established:
  - "Deploy retry protocol: pre-flight concurrency check, inference warm-up, serial verifier, immediate scripted rollback on contract failure"

requirements-completed: [TRUTH-02, TRUTH-03, TRUTH-05, TRUTH-06, TRUTH-09]

coverage:
  - id: D1
    description: "Live API serves only the nine real MARRS excerpts, bytes matching the committed manifest; synthetic clips no longer under samples/"
    requirement: "TRUTH-03"
    verification:
      - kind: other
        ref: "py -3.12 scripts/verify_live_truth.py (exit 0); aws s3 ls samples/ | grep -vc samples/marrs/ -> 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Live analysis returns probabilities summing to 1 for the live model's classes, live model version, honest region object, no embedding-space visualization"
    requirement: "TRUTH-02"
    verification:
      - kind: other
        ref: "py -3.12 scripts/verify_live_truth.py analyses with and without coordinates"
        status: pass
    human_judgment: false
  - id: D3
    description: "Router and classifier deployed only via the scripted path from a clean commit; drift-check reports all four functions MATCH"
    requirement: "TRUTH-09"
    verification:
      - kind: other
        ref: "py -3.12 scripts/drift-check.py --function all (exit 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Interim real-only model published, v2.0 archived (not destroyed); sha256 verified"
    requirement: "TRUTH-06"
    verification:
      - kind: unit
        ref: "scripts/tests/test_publish_tools.py (18 passed)"
        status: pass
    human_judgment: false

duration: 2 attempts (attempt 2: ~25min)
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 14: Production backend truth deploy Summary

**Router and classifier (jCDobm45..., QAN8peUH...) deployed from clean commit 1433f08 with the interim real-only model and nine real MARRS excerpts; live end-to-end verification and drift check pass, synthetic clips retired to retired/synthetic-samples-20261001/.**

## Performance

- **Duration:** attempt 1 (deploy, 503, rollback) plus attempt 2 (about 25 min, succeeded)
- **Completed:** 2026-10-01
- **Tasks:** 3 (Task 1 owner decision, Task 2 tracer deploy and verify, Task 3 retire/record)
- **Files modified:** 6

## Accomplishments

- Owner approved production changes explicitly (deploy-now) and, after the root cause was shown, approved attempt 2 ("Retry now + request quota").
- Attempt 1 (deployed from c4a5c77) was rolled back at 15:39Z after a 503; CloudWatch showed account Lambda concurrency limit (10) saturated by a cold inference container, async retries and a verifier bug. New code was not implicated. Root cause now recorded in DEPLOY-LOG.md.
- Attempt 2 (deployed from 1433f08, pre-flight idle, inference warmed first): sync and publish ran idempotently; classifier `jCDobm45tCUpCPAVxGfB0aCBCnWbV7xi2sodsA3uKMI=` (16:23:24Z) and router `QAN8peUHi+MGf/S/KtehybiadQPtC4+A6RW5iV/EOS4=` (16:23:32Z) deployed.
- `verify_live_truth.py` exit 0 before and after retirement: /sites provenance (54 sites), /samples ids, 9 clips real and sha256-matched, analysis with coordinates (INDONESIA, in_training_region true, model `interim-real-only`, probability sum 1.0), analysis without coordinates (UNKNOWN, coordinates_provided false).
- Eight synthetic clips copied to `retired/synthetic-samples-20261001/`, size-verified, then removed from `samples/`; nothing but `samples/marrs/` remains on the served prefix.
- `drift-check.py --function all`: router, preprocessor, classifier, inference all MATCH.
- `infrastructure/deployed-state.json` refreshed (env var names only); DEPLOY-LOG.md complete with a Rollback section.

## Task Commits

1. **Task 1: Owner approval** - recorded in DEPLOY-LOG.md (no code commit)
2. **Task 2: Tracer scripts + deploy** - `c4a5c77` (feat: sync, publish, verify scripts and tests), `9d055e1` (fix: verifier polls /status, serial analyses)
3. **Task 3: Retire, drift, record** - attempt 1 logs `d1a4473`, `1433f08`; final records in the plan metadata commit (deployed-state.json, DEPLOY-LOG.md, this SUMMARY)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Verifier hit /visualize before the analysis record existed**
- **Found during:** Task 2, attempt 1
- **Issue:** `GET /visualize` returns 404 until preprocessing writes its record; also ran analyses concurrently, contributing to concurrency saturation
- **Fix:** poll `/status` first, run analyses strictly one at a time, report the failing API step
- **Files modified:** scripts/verify_live_truth.py
- **Commit:** 9d055e1

### Other

- Warm-up invoke used AWS CLI v1 syntax (no `--cli-binary-format`; v1 rejects it). Response file written to the scratchpad, not committed.
- Plan said sync/publish upload newly; on attempt 2 both were already applied, and both scripts handled the pre-existing archive/objects idempotently with hash verification, so no script change was needed.
- Plan 01-14 required rollback on failure; attempt 1 executed it exactly as documented.

## Issues Encountered

- Account Lambda concurrency limit is 10; the Service Quotas increase (10 -> 1000) was still PENDING at completion. Mitigated operationally (warm inference first, serial analyses). Verification latency with a warm container was 13-29 s per analysis.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints or trust-boundary changes beyond those in the plan threat model; acceptance greps (`X-Amz`, `AWSAccessKeyId`, `AKIA`, `ASIA...`, `X-Amz-Signature`) return 0 for all scripts and docs.

## Self-Check: PASSED

- scripts/sync_sample_audio.py, scripts/publish_model.py, scripts/verify_live_truth.py, scripts/tests/test_publish_tools.py, docs/deploy/DEPLOY-LOG.md, infrastructure/deployed-state.json present.
- Commits c4a5c77, 9d055e1, d1a4473, 1433f08 present in git log.
