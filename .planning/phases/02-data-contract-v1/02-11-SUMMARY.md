---
phase: 02-data-contract-v1
plan: 11
subsystem: production-deploy-version-stamping
tags: [contract, stamp, deploy, live-verification, drift-check]

requires:
  - phase: 02-data-contract-v1
    provides: classifier stamping and router /visualize stamp fields (02-05), contract v1 live on CloudFront (02-06), result stamp line in the web app (02-10)
provides:
  - "scripts/verify_live_truth.py checks the contract version stamp on both live analyses against contracts/bucket/v1/stamp.json (--stamp option)"
  - "Production classifier and router run result version stamping; real analyses carry contract_version 1 (integer), dataset, model and preprocessing versions"
  - "All four reefradar-2477 Lambdas MATCH git (drift-check --function all)"
  - "DEPLOY-LOG.md 'Phase 2: contract stamp deploy' entry with per-function rollback refs; deployed-state.json refreshed"
affects: [02-12 exit gate, Phase 9 permalinks, future deploys]

actuals:
  tokens: 3500
  tasks: 2
  commits: 2

key-files:
  modified:
    - scripts/verify_live_truth.py
    - scripts/tests/test_publish_tools.py
    - infrastructure/deployed-state.json
    - docs/deploy/DEPLOY-LOG.md

key-decisions:
  - "check_stamp requires type(contract_version) is int, so JSON 1.0 and true both fail; check_analysis takes expected_stamp as an optional keyword so every existing caller and check is unchanged"
  - "Deployed one function per scripted call (classifier, then router), the allow-listed form, after dry-runs; rollback refs were proven by dry-running --ref and reproducing the live hash exactly before the deploy"

requirements-completed: []

status: complete
completed: 2026-10-02
---

# Phase 2 Plan 11: Stamp Deploy and Live Verification Summary

**Result version stamping is live in production: the classifier and router were deployed through the scripted path from a clean tree, and two serial live analyses returned contract_version 1 (integer) with dataset, model and preprocessing stamps equal to contracts/bucket/v1/stamp.json, with all four Lambdas matching git.**

## Commits

1. `c721554` feat(02-11): stamp-aware live verifier checks contract version stamps (tracer; 26 tests in `test_publish_tools.py` pass, including exact, null, float, bool, string, wrong and missing stamp cases)
2. `08f45fa` docs(02-11): record the contract stamp deploy, refresh deployed state

## Approval basis

Production deploys are covered by the owner's standing approval (`.planning/research/DRIVING-QUESTIONS.md`, "Standing owner approvals (2026-10-01)") and the Phase 2 discussion decision in `02-CONTEXT.md` that stamping requires one classifier deploy through the scripted path. No command was denied.

## Deploy evidence

- Deployed from `c7215544295a0fd3bd3ea6f5bf958a5e20f9a315` (clean tree). Preconditions: `verify_contract_live.py --expect-latest 1` exit 0; deployed `models/model_config.json` version `interim-real-only`; `/health` 200; one inference warm-up invoke (StatusCode 200).
- Dry-run: classifier 6 members, router 4 members.
- Pre-deploy drift: router `handler.py` changed, classifier `handler.py` changed plus `contract_stamp.json`/`contract_stamp.py` missing; preprocessor and inference MATCH.

| Function | CodeSha256 before | CodeSha256 after | Deployed (UTC) |
|---|---|---|---|
| classifier | `PTJpriO5u+Z6PKvVzJh+vBtuqKILBiD5+XBYJfd1LQg=` (git `6e2e962`) | `BPtnJNIFeWYJx3lq/08+HrmiDzeC3OI3dwWv0b98mxo=` | 2026-10-02 02:16:22 |
| router | `n8JWB5laVgPi5yvBIfpresn1a2o27Hy9zDgA/xCDugk=` (git `6aca641`) | `/YmvAjuu3+dtOkhbXpMJHNPBhFqosNm608d5+UiuJeE=` | 2026-10-02 02:16:32 |

## Live verification (first run, exit 0, no 5xx)

PASS /sites provenance, /samples ids, /samples audio real and hash-matched, analysis with coordinates (33 s), analysis without coordinates (14 s). Both stamp checks passed.

| Analysis | Id | Stamp |
|---|---|---|
| with coordinates | `de0f3271-587e-49f8-9e3a-f157561d21b5` | contract_version 1, `reefradar-reference-2026.10.0`, `interim-real-only`, `preproc-2026.10.0-as-deployed` |
| without coordinates | `762e1327-be27-475f-9c16-ea3cb3e79ea7` | the same four values |

Drift after the deploy: `drift-check.py --function all` reports router, preprocessor, classifier and inference all MATCH. `deployed-state.json` refreshed read-only (environment variable names only).

## Rollback refs (each reproduces the pre-deploy hash exactly, proven by `--ref ... --dry-run`)

```
py -3.12 scripts/deploy-lambdas.py --function classifier --ref 6e2e962 --confirm
py -3.12 scripts/deploy-lambdas.py --function router --ref 6aca641 --confirm
```

## Deviations from Plan

- **[Note] Router also shipped the CORS preflight fix state.** The router in production was already built from `6aca641` (deployed 2026-10-01 20:26Z outside the earlier DEPLOY-LOG entries); the only router change in this deploy is the stamp fields. Recorded in DEPLOY-LOG. No code change was needed.
- **[Process] Classifier and router deployed in two scripted calls** (one `--function` each, the allow-listed forms) rather than one call with both functions; the dry-run covered both together.
- **[Process] Tracer gate.** The tracer's gate is the verifier tests plus the live `verify_live_truth.py` run; it passed before Task 2, and the verifier needed to run at most once.
- `drift-check.py --function all` covers the plan's separate `--function classifier --function router` acceptance check (those two are included in `all` and both MATCH).

## Known Stubs

None.

## Threat Flags

None. T-02-11-01 to T-02-11-04 mitigated: scripted deploy from a clean tree after dry-runs, serial verification after a warm-up, contract v1 verified live before deploy and the stamp guard satisfied (deployed model `interim-real-only`), and acceptance greps for credentials in the log and state file print 0.

## Notes

- CONTRACT-04 intentionally not marked complete (it completes at phase verification).
- Account Lambda concurrency limit is still 10 (quota request pending); the deploy and verification stayed within it.

## Self-Check: PASSED

- Files present: scripts/verify_live_truth.py, scripts/tests/test_publish_tools.py, infrastructure/deployed-state.json, docs/deploy/DEPLOY-LOG.md
- Commits present: c721554, 08f45fa
