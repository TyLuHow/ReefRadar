---
phase: 02-data-contract-v1
plan: 13
subsystem: contract-cdn-cors
tags: [contract, cloudfront, cors, response-headers-policy, live-verification, chromium, gap-closure]

requires:
  - phase: 02-data-contract-v1
    provides: contract CDN distribution E1SD3UZ4FZ1GWL and setup script (02-02), publisher and live verifier (02-04), contract v1 live (02-06), stamp-aware verifier (02-11)
provides:
  - "Live contract CDN answers real browser requests with Access-Control-Allow-Origin * (custom policy reefradar-2477-contract-cors replaces Managed-SimpleCORS; GET/HEAD/OPTIONS allowed, GET/HEAD cached)"
  - "scripts/verify_contract_live.py probes browser header profiles (priority, no-cache, chrome) for pointer, manifest and sites; the OPTIONS preflight probe is report-only"
  - "scripts/setup_contract_infra.py cors and cors-rollback steps (find-or-create policy, attach with IfMatch, wait Deployed, verify, record; one-command rollback)"
  - "dashboard-next/tests/e2e/contract-cdn-cors-live.spec.ts: real Chromium cross-origin fetch of the live contract in four cache modes"
  - "dashboard-next/tests/unit/contract-no-preflight.test.ts: guard that the contract client can never trigger a preflight"
affects: [02-12 resumes (precondition verifier exit 0 now holds), any future contract client change, future CDN changes]

estimate-vs-actual-note: "wall clock includes waiting for the owner's preflight decision; active work was about 110 minutes"
actuals:
  tokens: 24000
  tasks: 3
  commits: 10

key-files:
  created:
    - dashboard-next/tests/e2e/contract-cdn-cors-live.spec.ts
    - dashboard-next/tests/unit/contract-no-preflight.test.ts
  modified:
    - scripts/verify_contract_live.py
    - scripts/tests/test_verify_contract_live.py
    - scripts/setup_contract_infra.py
    - scripts/tests/test_setup_contract_infra.py
    - infrastructure/resources.json
    - docs/deploy/DEPLOY-LOG.md

key-decisions:
  - "Custom wildcard CORS policy (origins *, headers *, GET/HEAD/OPTIONS, no credentials, max age 600, origin override) instead of Managed-SimpleCORS, which answers only simple CORS requests; AllowedMethods GET/HEAD/OPTIONS with CachedMethods GET/HEAD; no invalidation (CloudFront applies response headers policies to cached responses too)"
  - "Owner decision 2026-10-02, option (a) accept + guard: the CDN relays OPTIONS to S3 (no bucket CORS) so preflights are answered 403; the verifier's preflight probe is report-only and a unit guard keeps the contract client from ever preflighting"
  - "The live Chromium spec serves its page origin from a real node:http server, not page.route(): interception makes Playwright answer preflights itself and disables the HTTP cache, which made the first preflight test vacuous"

requirements-completed: []

status: complete
completed: 2026-10-02
---

# Phase 2 Plan 13: CDN Browser CORS Fix Summary

**The live contract CDN now answers real browser requests with Access-Control-Allow-Origin * through a custom response headers policy attached by the idempotent setup script (owner-approved 2026-10-01), proven by a browser-realistic live verifier and a real headless Chromium cross-origin fetch in all four cache modes; the CORS preflight stays unanswered by design (owner decision 2026-10-02) and a unit guard stops the contract client from ever needing one.**

## Approvals

- 2026-10-01: the owner explicitly approved this fix ("Yes, fix it"), including the production CloudFront distribution update. Recorded in DEPLOY-LOG.md.
- 2026-10-02: the owner chose option (a) for the preflight gap, "Accept + guard".
- No command was denied. No S3, OAC or bucket-policy change was made, and no invalidation was requested.

## Commits

| Commit | Message |
|---|---|
| `6789dac` | test(02-13): failing browser-realistic CORS tests for the live verifier (RED) |
| `bdb9e7f` | feat(02-13): browser-realistic CORS probes in the live verifier and a real Chromium spec (tracer, GREEN) |
| `9df2b28` | test(02-13): failing tests for the cors and cors-rollback setup steps (RED) |
| `05cfdec` | feat(02-13): cors and cors-rollback steps for the contract CDN response headers policy (GREEN) |
| `adb9bdf` | fix(02-13): live CORS spec uses a real page origin so the preflight test is not vacuous |
| `5952051` | docs(02-13): record the contract CDN CORS policy, distribution change and rollback |
| `67153dc` | feat(02-13): make the verifier's CORS preflight probes report-only |
| `39bf741` | test(02-13): guard the contract client against ever triggering a preflight |
| `44a899e` | docs(02-13): record the owner decision to accept the CDN preflight limitation and guard against it |

(Plus the docs commit for this summary and the state update.)

## Tracer reproduction of the defect (before any AWS change, 2026-10-02)

- `verify_contract_live.py --expect-latest 1` exited 1 with exactly 12 FAIL lines: for pointer, manifest and `artifact sites`, the `priority`, `no-cache` and `chrome` profiles returned status 200 with no Access-Control-Allow-Origin, and the preflight returned 403 with no CORS headers. Every pre-existing check PASSed, including `pointer: CORS allows any origin` (the old blind spot).
- The Chromium spec failed both tests with `TypeError: Failed to fetch`.

## Production change

| Item | Before | After |
|---|---|---|
| Response headers policy | Managed-SimpleCORS `60669652-455b-4ae9-85a4-c4c02393f86c` | `reefradar-2477-contract-cors`, id `837522dc-5a65-4b60-9c61-40d7e84e9741` |
| Distribution E1SD3UZ4FZ1GWL AllowedMethods | GET, HEAD | GET, HEAD, OPTIONS (CachedMethods GET, HEAD, unchanged) |

Applied with `py -3.12 scripts/setup_contract_infra.py --step cors --confirm` (03:14:19 to 03:14:53 UTC on 2026-10-02): policy created, one `update_distribution` with IfMatch changing only those two fields, Deployed after about 35 s, read-back ok. `--step all --verify` exited 0; `--step all --record-resources` then `--step all --dry-run` exited 0 with no planned action; the rollback was rehearsed with `--step cors-rollback --dry-run` only.

Rollback: `py -3.12 scripts/setup_contract_infra.py --step cors-rollback --confirm` (dry-run first); details in DEPLOY-LOG.md.

## Final verification (2026-10-02)

- `verify_contract_live.py --expect-latest 1`: exit 0, "OK: contract verified live", 74 PASS, 3 WARN (the report-only preflight lines, status 403 with the policy's CORS headers). All 9 browser GET checks and every older check PASS.
- Chromium (`npm --prefix dashboard-next run test:live -- tests/e2e/contract-cdn-cors-live.spec.ts`): "pointer, manifest and sites are readable cross-origin" passes (pointer, manifest, 54 sites, cache modes default, no-cache, reload, no-store, every request with `origin: http://localhost:3999`); the preflight test is `test.fixme` with the recorded reason.
- `py -3.12 -m pytest -q` passes; `vitest run` 243 tests pass (19 files); `npm run typecheck` clean; `npm run lint` clean apart from one pre-existing `react-hooks/exhaustive-deps` warning in `LocationCompare.tsx`; `node scripts/check-contract-fence.mjs` OK.
- The guard was mutation-checked: adding `headers: { 'X-Probe': '1' }` to the real `client.ts` made it fail, then the change was reverted.
- The live spec is absent from the mocked `--project=e2e` list, so CI never touches the CDN (CONTRACT-05 preserved).

## Deviations from Plan

**1. [Rule 1 - Bug] The planned Chromium preflight test was vacuous.**
- **Found during:** Task 3 live run.
- **Issue:** the plan serves the page origin with `page.route()`. While interception is active, Playwright answers CORS preflights itself and disables the HTTP cache, so the "author header" test passed although the CDN answers a real preflight with 403.
- **Fix:** the spec now serves `http://localhost:3999` from a real `node:http` server started in `beforeAll` and closed in `afterAll`.
- **Files modified:** `dashboard-next/tests/e2e/contract-cdn-cors-live.spec.ts`. **Commit:** `adb9bdf`.

**2. [Decision gate] Preflight 403.** Every GET check passed and only the preflight probes failed, so the plan's gate applied: the policy stayed attached and the work stopped for an owner decision. The owner chose (a). Consequences (commits `67153dc`, `39bf741`): the preflight probes are report-only (PASS, or WARN with the reason, never FAIL; a GET without Access-Control-Allow-Origin still FAILs), the Chromium preflight test is `test.fixme`, and a unit guard was added.

**3. [Rule 3 - Blocker] The spec reads `resources.json` through `__dirname`** (the package is CommonJS, `import.meta` fails under Playwright).

**4. [Design] The cors step checks the distribution and refuses before creating the policy**, so a missing or deviating distribution leaves nothing written; a dry run of `--step all` on an empty account skips the cors step instead of failing. moto keeps `ResponseHeadersPolicyId` and `AllowedMethods` through `update_distribution`, so no overlay beyond the existing origin overlay was needed; response headers policies live in the in-memory recorder, validated against botocore's real input shapes.

**Total deviations:** 1 auto-fixed bug, 1 owner-decided gate, 2 small design/blocker notes. **Impact:** none on scope; the browser read path is proven and the preflight limitation is explicit and guarded.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (the wildcard origin is accepted for public, credential-free, immutable data; AllowedMethods widened only to OPTIONS and asserted by tests).

## Next

Plan 02-12 resumes from its paused Task 1; its precondition (`verify_contract_live.py --expect-latest 1` exits 0) holds. 02-12's files were not touched (`git log` for them still prints only `a14c2b2`). CONTRACT-* requirements were not marked complete here.

## Self-Check: PASSED

All created files exist and all nine task commits are present in git history.
