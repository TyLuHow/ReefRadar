---
phase: 02-data-contract-v1
plan: 12
subsystem: phase-exit-live-proof
tags: [contract, live-verification, chromium, cors, exit-evidence]

requires:
  - phase: 02-data-contract-v1
    provides: contract v1 live (02-06), legacy pages on the contract (02-09), result stamps and fence (02-10), stamp deploy (02-11), CDN browser CORS fix (02-13)
provides:
  - "dashboard-next/tests/e2e/contract-live.spec.ts: a real browser, production build and live CloudFront contract proof (unpinned, ?cv=1 pinned, ?cv=999999 not found); run via playwright.live.config.ts only"
  - "docs/deploy/PHASE-2-EXIT.md: evidence for success criteria 1-5 and CONTRACT-01..05, the resolved CORS finding, and owned residuals"
affects: [/gsd-verify-work for phase 2, Phase 3+ planners, future contract publishes]

estimate-vs-actual-note: "wall clock includes the pause while 02-13 fixed the CDN CORS defect this plan's tracer found"
actuals:
  tokens: 14000
  tasks: 2
  commits: 3

key-files:
  created:
    - dashboard-next/tests/e2e/contract-live.spec.ts
    - docs/deploy/PHASE-2-EXIT.md

key-decisions:
  - "Live proof runs against a local production build of the branch (the Vercel preview is behind Deployment Protection), reading the real CDN with no mocks and no env override"
  - "Run the live spec on a free port (3217) because something unrelated still answered on 3200"

requirements-completed: []

status: complete
completed: 2026-10-02
---

# Phase 2 Plan 12: Live Contract Proof and Phase Exit Summary

**A real headless Chromium, loading a production build of the branch with no environment override, reads latest.json, v1.json and v1/sites.json from the live CloudFront contract over CORS, renders 54 sites, honours `?cv=1` with zero latest.json requests and reports `?cv=999999` as not found; every sweep command is green and PHASE-2-EXIT.md maps all five success criteria and CONTRACT-01..05 to evidence.**

## Commits

| Commit | Message |
|---|---|
| `a14c2b2` | test(02-12): live contract browser spec (tracer; first run found the CDN CORS defect) |
| `badf419` | docs(02-12): Phase 2 exit evidence for success criteria 1-5 and CONTRACT-01..05 |
| (this summary and state) | docs(02-12): complete live contract proof and phase exit plan |

## The tracer found a real defect (and it was fixed)

First run (before the fix): 0 of 3 passed. Headless Chrome blocked `contract/latest.json` with "No 'Access-Control-Allow-Origin' header is present". Read-only probes showed the CDN dropped the header when a request carried `Priority`, `Cache-Control: no-cache`, `Pragma` or any extra header, which real Chrome sends; the existing verifier only sent `Origin`, so it passed. I halted at the tracer gate and returned a checkpoint; the owner approved gap-closure plan 02-13 (custom response headers policy `reefradar-2477-contract-cors`, verifier now probes browser header profiles). The preflight (OPTIONS) stays 403 by design (owner decision 2026-10-02), guarded by a unit test.

## Live spec result (after the fix)

Fresh `npm run build` (no `NEXT_PUBLIC_CONTRACT_BASE_URL`), `npm run start -- -p 3217`, then `PW_LIVE_BASE_URL=http://localhost:3217 npx playwright test -c playwright.live.config.ts tests/e2e/contract-live.spec.ts --retries=0`: **3 passed (6.3 s)**. `npx playwright test --project=e2e --list | grep -c contract-live` prints 0.

## Sweep results (all exit 0)

pytest; `build_contract.py --version 1 --check`; `check_contract.py --check --additive`; `check-contract-fence.mjs` (90 files); `check-citations.mjs --scope all` (395 files); `verify_contract_live.py --expect-latest 1` (OK, 74 PASS and 3 WARN report-only preflight lines); `verify_live_truth.py --no-analysis` (0 failures; no new analyses started); `drift-check.py --function all` (4 of 4 MATCH); `setup_contract_infra.py --step all --verify` (ran fine; budget, storage and cors ok). `verify_live_truth.py` was run once.

## Production safety

Branch `redesign/v2-discovery`. `git ls-remote origin refs/heads/main` before: `416561758b5970406c75e5c463747cbbc67df130`; after the push: see the Push section below. No merge to main, no Vercel deploy, no S3 or CloudFront write by this plan.

## Deviations from Plan

**1. [Rule 1 - Bug, found by the tracer] Live CDN not readable from a real browser.** Halted at the tracer gate, resolved by plan 02-13 (see above). No code change was needed in this plan's files after the fix.

**2. [Process] Two commands were denied on the first attempt** (`setup_contract_infra.py --step all --verify` and a port lookup with `netstat`). I did not route around them; the coordinator later confirmed the verify was allowed, and it ran fine. I could not stop the first local server myself, so the orchestrator stopped it.

**3. [Process] Port 3217 instead of 3200.** After the orchestrator stopped the first server, port 3200 still answered HTTP 200 (a process I did not start, or a second listener); I used 3217 to be sure the spec ran against my fresh build.

**4. [Note] CI run id for the exit document.** The exit document cites the CI run for head `5fe5215` (36979987656, success) because a document cannot contain the run id of the commit that adds it; the final-head run is recorded below.

## Known Stubs

None.

## Threat Flags

None. T-02-12-01 (branch only, no main merge, no Vercel deploy), T-02-12-02 (acceptance grep for addresses and credentials prints 0) and T-02-12-03 (no new analyses; CDN-only browser checks; at most one `verify_live_truth.py` run) mitigated.

## Residuals

Backend `/sites` still reports 44 embedded sites (Phase 17); legacy navigation drops `?cv` (Phase 6, PERSIST-01); country-order constant UI-only (Phase 6); first export must carry the stamp block (Phase 6/9); CDN preflight 403 by design and guarded; production frontend merge on hold (owner); Playwright on the protected preview needs the owner's bypass secret; Lambda concurrency quota 10 to 1000 request still pending; `restored_mid` and `similar_sites_count` (Phase 5/12). Full list with owners: `docs/deploy/PHASE-2-EXIT.md`.

## Notes

CONTRACT-01..05 intentionally not marked complete here (phase verification does that).

## Push and CI

Filled in after the push (see the final report).

## Self-Check: PASSED

- Files present: dashboard-next/tests/e2e/contract-live.spec.ts, docs/deploy/PHASE-2-EXIT.md
- Commits present: a14c2b2, badf419
