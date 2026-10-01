---
phase: 01-truth-reproducibility
plan: 09
subsystem: infra
tags: [lambda, aws, drift-check, boto3, ecr, recovery, samples]

# Dependency graph
requires:
  - phase: 01-truth-reproducibility
    provides: "Deterministic Lambda packaging + live drift-check CLI (scripts/drift-check.py, scripts/lambda_packaging.py) from plan 01-05"
provides:
  - "Deployed router source (including the live /samples route) recovered into git"
  - "Confirmation that preprocessor, classifier, and inference were already byte-identical to git"
  - "infrastructure/deployed-state.json: per-function deployed configuration (no secret values)"
  - "docs/deploy/LAMBDA-RECOVERY.md: access check + per-function recovery report"
  - "Green drift-check baseline (--function all MATCH) as the starting point for all further backend work"
affects: [01-11, 01-12, 01-14, 01-20]

# Actuals (#2632)
actuals:
  tokens: 4360
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Deployed Lambda code downloaded to OS temp dir (never the repo), secret-scanned member-by-member, then diffed LF-normalized against git before any file is overwritten"
    - "Container-kind recovery (inference) reuses drift-check.py's existing ECR image-layer extraction path (manifest_from_layers) rather than a separate ad hoc Docker pull"

key-files:
  created:
    - infrastructure/deployed-state.json
    - docs/deploy/LAMBDA-RECOVERY.md
  modified:
    - lambdas/router/handler.py

key-decisions:
  - "Only router needed a code change; preprocessor, classifier, and inference were already byte-identical to git (confirmed via drift-check MATCH before touching any file), so infrastructure/lambda-packages/{preprocessor,classifier,inference}.json needed no spec edits"
  - "deployed-state.json records EnvironmentVariableNames only (sorted, no values) for all four functions, matching drift-check.py's existing build_config_summary() no-secrets contract"

requirements-completed: [TRUTH-02, TRUTH-01]

coverage:
  - id: D1
    description: "The code running in reefradar-2477-router (including the undocumented /samples route) is recovered into git and drift-check reports a match"
    requirement: TRUTH-02
    verification:
      - kind: other
        ref: "py -3.12 scripts/drift-check.py --function router (MATCH, exit 0)"
        status: pass
      - kind: other
        ref: "grep -c \"/samples\" lambdas/router/handler.py (1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All four reefradar-2477-* functions (router, preprocessor, classifier, inference) match git after recovery"
    requirement: TRUTH-02
    verification:
      - kind: other
        ref: "py -3.12 scripts/drift-check.py --function all --json (MATCH for all four, exit 0)"
        status: pass
      - kind: unit
        ref: "py -3.12 -m pytest lambdas scripts/tests -x (87 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Deployed function configuration is recorded without any secret values"
    requirement: TRUTH-01
    verification:
      - kind: other
        ref: "py -3.12 -c \"...assert all('Variables' not in json.dumps(f) ...)\" against infrastructure/deployed-state.json"
        status: pass
      - kind: other
        ref: "grep -cE \"AKIA|ASIA[A-Z0-9]{12}\" infrastructure/deployed-state.json docs/deploy/LAMBDA-RECOVERY.md (0 for both)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 09: Lambda Deployment Recovery (D-01) Summary

**Recovered the live `/samples` route (CURATED_SAMPLES static catalog + presigned-URL handler) into `lambdas/router/handler.py` from the deployed zip; confirmed preprocessor, classifier, and inference were already byte-identical to git; drift-check now reports MATCH for all four `reefradar-2477-*` functions.**

## Performance

- **Duration:** ~25 min (reading/context: ~17 min; AWS recovery work: ~8 min, 03:07:33–03:15:25 across the three task commits)
- **Started:** 2026-10-01T08:06:00Z (approx, session start)
- **Completed:** 2026-10-01T08:15:25Z
- **Tasks:** 3/3
- **Files modified:** 3 (`lambdas/router/handler.py`, `infrastructure/deployed-state.json` new, `docs/deploy/LAMBDA-RECOVERY.md` new)

## Accomplishments
- Confirmed read-only AWS access (profile `reefradar`, account `781978598306`) via `sts get-caller-identity`, `lambda get-function-configuration`, `s3 ls`, `ecr describe-images` — all passed, no auth gate needed
- Downloaded, secret-scanned (zero hits), and diffed the deployed zip for `reefradar-2477-router` against git: found and recovered the live `/samples` route, previously missing from git entirely (`CURATED_SAMPLES` static list of 8 samples, `SAMPLE_STORIES` groupings, `handle_get_samples()` presigned-URL handler)
- Confirmed `reefradar-2477-preprocessor`, `reefradar-2477-classifier` (zip), and `reefradar-2477-inference` (container, via ECR image-layer extraction) were **already byte-identical to git** — no recovery needed, no spec edits
- `infrastructure/deployed-state.json`: per-function runtime, handler, memory, timeout, layers, CodeSha256/image digest, and environment variable **names only** (never values) for all four functions
- `docs/deploy/LAMBDA-RECOVERY.md`: access check results plus a per-function recovery report (what was found, secret-scan result, diff summary)
- `py -3.12 scripts/drift-check.py --function all --json` — all four functions MATCH, exit 0
- `py -3.12 -m pytest lambdas scripts/tests -x` — 87 passed

## Task Commits

1. **Task 1: AWS access check gate (read-only)** — `c3482cd` (chore)
2. **Task 2 (tracer): Recover the router deployment (with /samples) into git and get a drift-check match** — `26b3e61` (chore)
3. **Task 3: Recover preprocessor, classifier and inference; record deployed configuration; drift-check all** — `eeba927` (chore)

Tracer feedback gate: ran immediately after Task 2's commit (autonomous run, `_auto_chain_active: true`) — `drift-check --function router` MATCH and `grep -c "/samples"` returned 1, so Task 3 proceeded without a checkpoint.

**Plan metadata:** this commit.

## Files Created/Modified
- `lambdas/router/handler.py` — replaced with the deployed version: adds `('GET', '/samples'): handle_get_samples` to the route table, `CURATED_SAMPLES` (static list), `SAMPLE_STORIES` (static dict), and `handle_get_samples(event)` (presigned S3 URLs per curated sample)
- `infrastructure/deployed-state.json` (new) — deployed configuration snapshot for all four `reefradar-2477-*` functions, captured 2026-10-01; no secret values
- `docs/deploy/LAMBDA-RECOVERY.md` (new) — access check table + per-function recovery report (CodeSha256/LastModified/members/secret-scan/diff summary for router; "no drift found" for preprocessor, classifier, inference)

No changes were needed to `infrastructure/lambda-packages/{router,preprocessor,classifier,inference}.json` — the router spec's existing single-member list already matched the deployed member list, and the other three specs needed no change since their deployed code already matched git.

## Decisions Made
- Confirmed via `drift-check.py` (not just a file diff) that preprocessor, classifier, and inference required zero code changes before committing anything for those functions — avoids a no-op commit and keeps the recovery report honest about which function actually drifted.
- Recorded `EnvironmentVariableNames` (sorted, names only) in `deployed-state.json`, mirroring `drift-check.py`'s existing `build_config_summary()` contract from plan 01-05, rather than inventing a second schema.

## Deviations from Plan
None — plan executed exactly as written. The plan's acceptance criteria anticipated recovery work might be needed for all four functions; in practice only router had actual drift, which the plan's Task 3 wording ("Repeat Task 2's procedure... for reefradar-2477-preprocessor and reefradar-2477-classifier") already accommodates by implication (no drift found = no commit needed for that function, confirmed by the drift-check tool itself).

## Issues Encountered
- The initial `diff -u` between the working-tree `lambdas/router/handler.py` (CRLF, Windows `core.autocrlf=true`) and the extracted deployed file (LF) showed every line as changed due to the line-ending mismatch, not real content differences. Resolved by LF-normalizing both sides before diffing (mirrors `lambda_packaging.py`'s `normalize_text_bytes()` approach from plan 01-05) — the real diff was a clean, minimal addition (one route + three new module-level definitions).
- `drift-check.py --function inference` exceeded the 120s foreground command timeout while downloading and extracting the container image's layers from ECR; moved to background and completed successfully (MATCH, exit 0) without further action.

## User Setup Required
None for this plan — the owner's standing AWS profile `reefradar` (pre-configured per `01-CONTEXT.md` user_setup) already had the required read-only permissions (`lambda:GetFunction`, `lambda:GetFunctionConfiguration`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`, `s3:ListBucket`, `s3:GetObject`); no new access request was needed.

## Next Phase Readiness
- D-01 is complete: git now equals deployed for every `reefradar-2477-*` Lambda. Git is the source of truth for all further backend changes in this phase (per `01-CONTEXT.md` D-23 ordering).
- The live `/samples` route (and its `CURATED_SAMPLES` catalog) is now visible in git — plans touching the router (01-11, 01-12) can see and modify it instead of risking silent deletion on redeploy.
- `infrastructure/deployed-state.json` is ready for plan 01-14 to update after any future scripted deploy, and for plan 01-20's final drift-check-green gate.
- No blockers for any dependent plan.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All 3 created/modified files found on disk (`lambdas/router/handler.py`, `infrastructure/deployed-state.json`, `docs/deploy/LAMBDA-RECOVERY.md`); all 3 commits (`c3482cd`, `26b3e61`, `eeba927`) found in git history.
