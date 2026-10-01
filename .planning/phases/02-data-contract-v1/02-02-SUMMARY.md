---
phase: 02-data-contract-v1
plan: 02
subsystem: aws-infrastructure
tags: [aws-budgets, s3, cloudfront, origin-access-control, boto3, idempotent-setup]

requires:
  - phase: 02-data-contract-v1
    provides: contract v1 bundle layout (contract/, v1/ folders) that the bucket will serve in 02-06
provides:
  - Live 25 USD/month cost budget reefradar-2477-ceiling-25 with three email alerts (80% and 100% actual, 100% forecast); the alert-less 50 USD budget is gone
  - Live private bucket reefradar-2477-contract served only through CloudFront with origin access control
  - scripts/setup_contract_infra.py, one idempotent --dry-run/--confirm/--verify/--record-resources script for both
  - infrastructure/resources.json entries s3.buckets.contract, cloudfront.distributions.contract, budgets.ceiling
affects: [02-04, 02-06, 02-07, 02-12]

actuals:
  tokens: 21000
  tasks: 2
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Setup scripts discover resources by name/comment before creating, so a re-run (or a resume after a mid-run failure) changes nothing that already exists"
    - "Read-back before destructive follow-up: the legacy budget is deleted only after the new budget and its three notifications read back"
    - "Alert address passed on the command line only and printed redacted (first character plus domain suffix); never written to a file"
    - "resources.json is rewritten by a renderer that round-trips the committed file byte for byte, so recording produces additions-only diffs"

key-files:
  created:
    - scripts/setup_contract_infra.py
    - scripts/tests/test_setup_contract_infra.py
  modified:
    - infrastructure/resources.json
    - docs/deploy/DEPLOY-LOG.md

key-decisions:
  - "Wildcard CORS through the AWS managed Managed-SimpleCORS response-headers policy: the data is public, open-licensed and fetched without credentials, and *.vercel.app preview hosts cannot be listed in advance"
  - "Storage confirm refuses to run unless the budget alarm verifies first, turning the plan's precondition into an enforced gate"
  - "An existing resource with unexpected settings (budget limit, OAC, distribution) is reported and left alone rather than silently updated"
  - "--verify probes a guaranteed-missing key for the 403/404 check and accepts 200 for contract/latest.json (but never a bucket listing), so verification stays green after 02-06 publishes"

patterns-established:
  - "AWS writes go through one scripted, account-guarded (781978598306) path with a dry-run plan first"

requirements-completed: []

coverage:
  - id: D1
    description: "25 USD monthly cost budget with 80/100% actual and 100% forecast email alerts, legacy 50 USD budget deleted only after read-back"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "scripts/tests/test_setup_contract_infra.py#test_legacy_budget_deleted_only_after_readback_and_its_parameters_printed_first"
        status: pass
      - kind: command
        ref: "py -3.12 scripts/setup_contract_infra.py --step budget --verify"
        status: pass
    human_judgment: false
  - id: D2
    description: "Private bucket, OAC, CloudFront distribution and one-statement GetObject bucket policy, verified by public probes (direct S3 403, missing key 403, root not a listing)"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "scripts/tests/test_setup_contract_infra.py#test_storage_confirm_creates_oac_and_exact_distribution_config"
        status: pass
      - kind: command
        ref: "py -3.12 scripts/setup_contract_infra.py --step all --verify"
        status: pass
    human_judgment: false
  - id: D3
    description: "Idempotent re-run (second --confirm creates nothing, --dry-run lists no create or update) and secret hygiene (address redacted, none in committed files)"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "scripts/tests/test_setup_contract_infra.py#test_second_storage_confirm_creates_nothing"
        status: pass
      - kind: command
        ref: "py -3.12 scripts/setup_contract_infra.py --step all --dry-run"
        status: pass
    human_judgment: false
  - id: D4
    description: "The owner actually receives budget alert emails at the owner alert address (AWS Budgets confirms the subscriber but cannot prove delivery)"
    requirement: "CONTRACT-01"
    verification: []
    human_judgment: true
    rationale: "Delivery to the inbox only becomes observable when a threshold is crossed; the owner should expect AWS Budgets emails and check spam filtering"

duration: 20min
completed: 2026-10-01
status: complete
---

# Phase 2 Plan 02: Contract Infrastructure Summary

**The owner's 25 USD/month budget alarm (80% and 100% actual, 100% forecast, by email) replaced the alert-less 50 USD budget, and a private `reefradar-2477-contract` bucket now sits behind a CloudFront distribution with origin access control, managed CachingOptimized and SimpleCORS policies and a GetObject-only bucket policy, all created by one idempotent script and recorded in `infrastructure/resources.json`.**

## Performance

- **Duration:** about 20 min (22:17Z to 22:40Z, most of it in the CloudFront deployment wait and live verification)
- **Tasks:** 2 (one tracer, one auto)
- **Files created or modified:** 4 outside .planning
- **Commits:** 6 task commits

## Approval and authority

The AWS changes were made under the owner's standing approval for AWS changes within the 25 USD/month ceiling (DRIVING-QUESTIONS.md) and the owner's decision in 02-CONTEXT.md, "Owner decisions after research" (2026-10-01): replace the alert-less 50 USD budget with a single 25 USD/month budget that emails alerts at 80% and 100% of actual spend and 100% of forecast. The alert address was passed on the command line only. It is not in any committed file, log line, commit message or this summary; it is referred to as "the owner alert address".

## Accomplishments

- **Budget alarm live.** `reefradar-2477-ceiling-25` (COST, MONTHLY, 25 USD) has exactly three notifications (ACTUAL greater than 80%, ACTUAL greater than 100%, FORECASTED greater than 100%), each with one EMAIL subscriber. The new budget and all three notifications (with subscribers) were read back before `reefradar-2477-budget` (50 USD, no notifications) was deleted; its prior parameters and a recreate command are in DEPLOY-LOG.md. `describe-budgets` now lists only the new budget. Budget data lags by hours, so this is an alarm, not a spend stop.
- **Private contract storage live, empty until 02-06.**
  - Bucket `reefradar-2477-contract` (us-east-1): all four public-access-block flags on, BucketOwnerEnforced ownership, SSE-S3 (AES256), tag `Project=reefradar-2477`, no website hosting and no bucket CORS.
  - Origin access control `reefradar-2477-contract-oac` (`E3JD4NDX1VQA27`, sigv4, always, s3).
  - Distribution `E1SD3UZ4FZ1GWL`, domain **`d7dr1fzple2sg.cloudfront.net`**, comment `reefradar-2477-contract`: enabled, Deployed, pay-as-you-go, HTTPS redirect, GET/HEAD, compression, HTTP/2 and 3, IPv6, PriceClass_All, managed `Managed-CachingOptimized` and `Managed-SimpleCORS`, 403 and 404 cached for 10 s with no custom page.
  - Bucket policy: exactly one statement, `s3:GetObject` on the bucket's objects to `cloudfront.amazonaws.com` conditioned on this distribution's ARN. No `s3:ListBucket`, no wildcard principal (`get-bucket-policy | grep -c ListBucket` prints 0).
- **Public probes (unauthenticated HTTPS, status codes only):** direct S3 GET of `contract/latest.json` returned 403; CloudFront GET of a missing key returned 403; CloudFront `contract/latest.json` returned 403 (bucket empty); the CloudFront root returned 403 with no `ListBucketResult` body.
- **Idempotent.** A second `--step storage --confirm` created and changed nothing, and `--step all --dry-run` lists no create or update action.
- **Script and tests.** `scripts/setup_contract_infra.py` (`--dry-run`, `--confirm`, `--verify`, `--record-resources`, `--step budget|storage|all`, `--notify-email` or env `REEFRADAR_ALERT_EMAIL`) refuses to run unless the caller account is 781978598306. 47 tests cover plan output, BLOCKED email handling, redaction, account guard, idempotency, deletion ordering, the exact distribution config and policy statement, verify deviations and resources recording. The whole pytest suite (307 tests) passes.
- **Inventory.** `infrastructure/resources.json` now has `s3.buckets.contract`, `cloudfront.distributions.contract` and `budgets.ceiling` (plus `budgets.replaced`); the diff is additions only and contains no address or credential.

## Task Commits

1. **Task 1: Tracer, the owner's 25 USD budget alarm** - RED `11d93c4` (test), GREEN `e5a6fc6` (feat), live-run fix `155b40d` (fix), inventory and log `4e35b5d` (feat). Tracer feedback gate (auto mode): `--step budget --verify` re-run end to end after the commit and passed, then expanded.
2. **Task 2: Private contract bucket served through CloudFront** - `d3b63c4` (feat, script and tests), `9f54ecf` (feat, inventory, log and rollback commands)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Live command results

Run exactly in the documented form (the owner alert address supplied only where `--notify-email` is shown in DEPLOY-LOG.md):

| Command | Exit |
|---|---|
| `--step budget --dry-run --notify-email <owner alert address>` | 0 |
| `--step budget --confirm --notify-email <owner alert address>` (twice, see Deviations) | 1 then 0 |
| `--step budget --verify`, `--step budget --record-resources` | 0, 0 |
| `--step storage --dry-run`, `--step storage --confirm` | 0, 0 |
| `--step all --verify`, `--step all --record-resources` | 0, 0 |
| second `--step storage --confirm`, then `--step all --dry-run` | 0, 0 (nothing to do) |

No AWS write command was denied by the permission system, so no checkpoint was needed.

## Package and test-tool notes

No new package was installed. Test mocks: moto 5.2.3 for S3 and CloudFront; an in-memory Budgets fake because moto does not implement `describe_subscribers_for_notification`, which the read-back requires. botocore Stubber was not needed. moto's `get_distribution_config` drops `OriginAccessControlId` and `S3OriginConfig` (real CloudFront returns them), so the test CloudFront wrapper overlays the origins that were sent at create time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Real Budgets API omits ThresholdType when it is the default**
- **Found during:** Task 1 live `--confirm`
- **Issue:** `describe_notifications_for_budget` returns no `ThresholdType` for PERCENTAGE notifications, so the read-back raised `KeyError` after the budget was created. The legacy budget was not deleted (the crash happened before the deletion step). The run also printed the legacy deletion as "done" before it happened.
- **Fix:** Notification keys default `ThresholdType` to PERCENTAGE; the test fake now mirrors the real API; create, delete and subscriber actions are reported only after the AWS call returns. The re-run resumed cleanly: it created nothing, read back 3 notifications, then deleted the legacy budget.
- **Files modified:** scripts/setup_contract_infra.py, scripts/tests/test_setup_contract_infra.py
- **Commit:** 155b40d

**2. [Rule 1 - Bug] Record tests depended on the live inventory state**
- **Found during:** Task 2, after recording the real inventory
- **Issue:** Tests that used the committed `resources.json` as their starting point failed once the real `cloudfront` section existed.
- **Fix:** Tests start from a pristine copy with the recorded sections removed; the round-trip test still runs against the live file.
- **Commit:** 9f54ecf

**3. [Rule 2 - Missing critical functionality] Budget alarm enforced as a gate for storage**
- **Issue:** The plan states the budget must exist before storage; nothing enforced it.
- **Fix:** `--step storage --confirm` refuses (exit 1, nothing created) unless the budget verifies; a test covers it.
- **Commit:** d3b63c4

### Plan wording adjusted

- **Verify probes.** The plan probes `contract/latest.json` expecting 403 or 404 "because the bucket is empty". That would fail after 02-06 publishes. The script probes a guaranteed-missing key for the 403/404 check and accepts 200 for `latest.json` provided it is not a bucket listing. Before publish the observed results match the plan exactly (403).
- **TDD ordering.** Task 1 followed RED then GREEN with separate commits. For Task 2 the storage implementation was written before its tests, so there is no separate RED commit; the tests were written against the behaviour list and fail when the behaviour is broken (for example the widened-policy, public-principal and missing-block cases).
- **`--step`.** Defaults to `all`, which runs budget first and then storage.

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 2) plus 3 wording adjustments. **Impact:** none on the delivered state; the live state matches every must-have truth.

## Authentication Gates

None. The `reefradar` profile worked throughout; no credential, token file or presigned URL was read or printed.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. The CloudFront domain is the intended public read path (T-02-02-01 mitigated and probed).

## Issues Encountered

- A one-off `KeyError` during the first live `--confirm` (deviation 1). No resource was left in a bad state.
- Greps for the alert address over the six commits of this plan find only a test assertion that the string `gmail.com` is absent from the script source; the address itself appears nowhere.

## Next Phase Readiness

- Ready for plan 02-04: the budget constant `reefradar-2477-ceiling-25` and the verified alarm exist; the publisher can gate on them.
- The CloudFront domain `d7dr1fzple2sg.cloudfront.net` is recorded for 02-07's default `NEXT_PUBLIC_CONTRACT_BASE_URL` and 02-04's verify default.
- CONTRACT-01 is intentionally not marked complete: it completes after the live publish in 02-06 and the app repoint.
- Owner follow-up (not blocking): the owner should expect AWS Budgets email from the alert address and check spam filtering; delivery is only observable when a threshold is crossed.

## Self-Check: PASSED

- Created files exist: scripts/setup_contract_infra.py, scripts/tests/test_setup_contract_infra.py (FOUND); infrastructure/resources.json and docs/deploy/DEPLOY-LOG.md updated (FOUND).
- Commits exist: 11d93c4, e5a6fc6, 155b40d, 4e35b5d, d3b63c4, 9f54ecf (all FOUND).
- Acceptance criteria re-run: pytest 47 passed; `--step all --verify` exit 0; 3 notifications on the new budget; `describe-budgets` prints only `reefradar-2477-ceiling-25`; resources.json domain ends `.cloudfront.net`; all four public-access-block flags true; bucket policy ListBucket count 0; `--step all --dry-run` lists no create or update; `gmail.com` count 0 in resources.json, DEPLOY-LOG.md and the script; `AKIA|ASIA...|X-Amz-Signature` count 0 in the script and DEPLOY-LOG.md.
