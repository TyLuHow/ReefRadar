---
phase: 01-truth-reproducibility
plan: 08
subsystem: ci-testing
tags: [playwright, github-actions, accessibility, visual-regression, pytest, citations]
dependency-graph:
  requires: ["01-04", "01-05", "01-06", "01-07"]
  provides: ["ci-pipeline", "e2e-fixture-harness", "a11y-regression-gate", "visual-regression-harness", "live-smoke-script"]
  affects: ["01-09", "01-10", "01-11", "01-12", "01-13", "01-14", "01-15", "01-16", "01-17", "01-18", "01-19", "01-20"]
tech-stack:
  added: ["@playwright/test container CI job", "@axe-core/playwright CI gate", "pytest CI job", "GitHub Actions workflow_dispatch inputs"]
  patterns:
    - "mockApi(page, overrides) routes the execute-api/prod host to committed fixtures; unmatched calls throw with method+path"
    - "KNOWN_DEFECTS array in routes.spec.ts: pre-existing legacy-UI defects ignored by path substring, each entry names the plan id that removes it"
    - "axe regression gate diffs against a frozen baseline (new serious/critical rule ids only), not zero-violation enforcement"
    - "visual.spec.ts self-skips per-test (not file-omitted) so `--project=visual` always reports a real skip count, not zero tests found"
key-files:
  created:
    - .github/workflows/ci.yml
    - dashboard-next/tests/e2e/support/mock-api.ts
    - dashboard-next/tests/e2e/support/states.ts
    - dashboard-next/tests/e2e/routes.spec.ts
    - dashboard-next/tests/e2e/a11y.spec.ts
    - dashboard-next/tests/e2e/visual.spec.ts
    - dashboard-next/tests/fixtures/api/health.json
    - dashboard-next/tests/fixtures/api/status-complete.json
    - dashboard-next/tests/fixtures/api/visualize-legacy-complete.json
    - scripts/smoke_live.py
  modified:
    - dashboard-next/playwright.config.ts
    - scripts/check-citations.mjs
    - docs/CITATIONS.md
decisions:
  - "e2e project's own testIgnore replaces (doesn't merge with) the top-level config's testIgnore, so -live specs and gallery-parity.spec.ts had to be re-excluded explicitly inside the project block, or they'd silently hit the live API/deployment in the fixture-mocked CI gate"
  - "routes.spec.ts h1 assertion dropped for /experience/?mode=demo, ?mode=compare and ?sample=... — those SPA sub-states render no page-level h1 by design, and asserting the landing-state h1 they transition from was racy against that transition"
  - "a11y.spec.ts waits 2s (matching the baseline capture's settle time) before running axe, since contrast checks against canvas/animated ambience are otherwise non-deterministic relative to the original baseline capture"
  - "check-citations.mjs --scope docs excludes dashboard-next/tests/baseline/ — it's a frozen D-20 capture of what was live at a point in time, not live documentation to hold to current citation standards"
metrics:
  duration: 55min
  completed: 2026-10-01
actuals:
  tokens: 7800
  tasks: 3
  commits: 4
status: complete
---

# Phase 01 Plan 08: CI pipeline for truth reproducibility — Summary

One GitHub Actions workflow (web, e2e, python, citations, visual, live-smoke) gates every push on redesign/v2-discovery, with a fixture-mocked Playwright e2e/axe suite that never touches the live API, a Docker-pinned screenshot suite that self-skips until plan 01-20 commits Linux snapshots, and a GET-only live smoke script restricted to manual dispatch.

## What was built

**Task 1 (tracer):** `mockApi(page, overrides)` in `dashboard-next/tests/e2e/support/mock-api.ts` routes every call to the execute-api/prod host (the host both `src/lib/api.ts`'s default `NEXT_PUBLIC_API_URL` and `experience/page.tsx`'s hard-coded `API_BASE` point at) to committed JSON fixtures; any unmatched call throws with the method and path rather than hitting the network. `support/states.ts` holds the same 11-state/3-width table the pre-truth baseline used. `routes.spec.ts` started with the `about` state only, proving the pipeline locally and in a pushed CI run (`.github/workflows/ci.yml`: `web` job — lint, typecheck, unit tests, clean-clone build; `e2e` job — `mcr.microsoft.com/playwright:v1.63.0-noble`, matching the locked `@playwright/test` version exactly).

**Task 2:** `routes.spec.ts` expanded to all 11 baseline states with a `KNOWN_DEFECTS` array (currently one entry: `/audio/compare/` 404s, removed by plan 01-17 per PRODUCT-AUDIT.md §3.2) that's ignored rather than failing the suite. `a11y.spec.ts` runs axe (wcag2a/2aa/21aa/22aa) at 1440 for every state and fails only on serious/critical rule ids absent from `tests/baseline/pre-truth/axe/summary.json`. `status-complete.json` and `visualize-legacy-complete.json` fixtures reproduce today's actual `/status` and `/visualize` API shapes (4-class probabilities, still multiplied by the region confidence multiplier — confirmed against `lambdas/classifier/region_detection.py`'s current `adjust_classification`), proving the legacy UI still renders what the API actually returns pre-01-11. CI gained `python` (pytest) and `citations` (`check-citations.mjs --check-md` / `--scope docs`) jobs.

**Task 3:** `visual.spec.ts` self-skips unless `PW_VISUAL=1`, and further skips (with an explanatory reason) until snapshots exist or `PW_UPDATE=1`. Each test masks `canvas`/`.maplibregl-map`/`.leaflet-container` and blocks OpenStreetMap/CartoCDN tile requests with a 1x1 transparent PNG for determinism. `playwright.config.ts`'s `visual` project got a `snapshotPathTemplate`. CI's `visual` job runs inside the same pinned container; `update_snapshots` dispatch input switches it to `--update-snapshots` and uploads the result as a `visual-snapshots` artifact. `live-smoke` job runs only on `workflow_dispatch` with `live_smoke: true`, installing `requests` and running `scripts/smoke_live.py` (health/sites/samples shape checks, never logs `audio_url` — presigned).

## Verification performed

- Local `npx playwright test --project=e2e` (routes + a11y, 22 tests): green, run twice for determinism.
- Local `npx playwright test --project=visual` on Windows: 33 tests, all skipped, exit 0.
- Local `py -3.12 -m pytest -x`: 87 passed.
- Local `node scripts/check-citations.mjs --check-md` and `--scope docs`: both OK.
- Local `py -3.12 scripts/smoke_live.py`: all checks pass against the live API.
- Pushed CI run (commit 78fe7ae then f28b352) on `redesign/v2-discovery`: all of `web`, `e2e`, `python`, `citations`, `visual` conclude `success`; `live-smoke` correctly `skipped` on a normal push. CI run: https://github.com/TyLuHow/ReefRadar/actions/runs/36833284557
- Manual `gh workflow run CI --ref redesign/v2-discovery -f live_smoke=true`: `live-smoke` job runs and passes alongside all other jobs. CI run: https://github.com/TyLuHow/ReefRadar/actions/runs/36833670297

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `e2e` project's `testIgnore` silently overrode the top-level live-spec exclusion**
- **Found during:** Task 1, first pushed CI run (`e2e` job failed on `git rev-parse HEAD` "dubious ownership" inside the Playwright container, originating from `baseline-live.spec.ts`'s module-level `execSync` call).
- **Issue:** `playwright.config.ts`'s top-level `testIgnore: /.*-live\.spec\.ts/` is replaced (not merged) by the `e2e` project's own `testIgnore: /visual\.spec\.ts/`, so `baseline-live.spec.ts`, `smoke-live.spec.ts`, and the live-network `gallery-parity.spec.ts` were all silently included in the fixture-mocked `e2e` project — violating this plan's own must-have truth ("never the live API").
- **Fix:** Changed the `e2e` project's `testIgnore` to `/visual\.spec\.ts|-live\.spec\.ts|gallery-parity\.spec\.ts/`.
- **Files modified:** `dashboard-next/playwright.config.ts`
- **Commit:** 81abecc

**2. [Rule 1 - Bug] `routes.spec.ts` h1 assertion was flaky/wrong for 3 of 11 states**
- **Found during:** Task 2, local full-suite run.
- **Issue:** `/experience/?mode=demo`, `?mode=compare` and `?sample=...` all mount the `landing` state first, then an effect dispatches a transition to `DemoState`/`LocationCompare`/`SamplePlaybackState` — none of which render a page-level `<h1>` (confirmed against source). Asserting `<h1>` visibility there was racy against that unmount/mount transition (passed or failed depending on timing).
- **Fix:** Added `STATES_WITHOUT_H1` exemption set for those three states; `assertCleanLoad`'s error/bad-response checks still run for all 11.
- **Files modified:** `dashboard-next/tests/e2e/routes.spec.ts`
- **Commit:** 78fe7ae

**3. [Rule 3 - Blocking issue] axe color-contrast finding not reproducible against the frozen baseline timing**
- **Found during:** Task 2, local full-suite run (`experience-demo` reported a new "color-contrast" violation not in `tests/baseline/pre-truth/axe/summary.json`).
- **Issue:** The pre-truth baseline capture (`baseline-live.spec.ts`) waits an extra ~2s after `networkidle` before running axe (canvas/WebGL ambience settle time); `a11y.spec.ts` ran axe immediately after `networkidle`, producing a different (non-reproducible) contrast reading.
- **Fix:** Added a matching 2s `waitForTimeout` before the axe analysis in `a11y.spec.ts`. Re-ran twice locally: deterministic, no new violations.
- **Files modified:** `dashboard-next/tests/e2e/a11y.spec.ts`
- **Commit:** 78fe7ae

**4. [Rule 3 - Blocking issue] `check-citations.mjs --scope docs` flagged a frozen baseline artifact**
- **Found during:** Task 2, local citations check.
- **Issue:** `dashboard-next/tests/baseline/pre-truth/axe/compare.json` (a git-tracked, never-regenerated capture of the live deployment's DOM at baseline time, per D-20) contains a pre-existing citation-year error that was genuinely live in production at capture time. The scanner's `DOCS_SCOPE_EXCLUDE_DIRS` didn't exclude the baseline directory, so this frozen historical evidence failed a "live documentation" check it was never meant to satisfy.
- **Fix:** Added `dashboard-next/tests/baseline/` to `DOCS_SCOPE_EXCLUDE_DIRS` (same rationale as the existing `prompts/` exclusion), updated the explanatory comment in both the script header and the generated `docs/CITATIONS.md` text, and regenerated `docs/CITATIONS.md`.
- **Files modified:** `scripts/check-citations.mjs`, `docs/CITATIONS.md`
- **Commit:** 78fe7ae

### Standing approvals exercised

Per `.planning/research/DRIVING-QUESTIONS.md`, all dev/test package installs and the one `workflow_dispatch` live-smoke run against the production API (read-only GET checks, no secrets printed) are within the owner's standing approval and the $25/month AWS budget — no new spend incurred (no AWS resources touched; GitHub Actions minutes only).

## Known Stubs

None. All fixtures reproduce real current API response shapes (verified against `lambdas/classifier/handler.py` / `region_detection.py` source and the live `/sites`, `/samples`, `/health` responses).

## Self-Check: PASSED

- FOUND: `.github/workflows/ci.yml`
- FOUND: `dashboard-next/tests/e2e/support/mock-api.ts`
- FOUND: `dashboard-next/tests/e2e/support/states.ts`
- FOUND: `dashboard-next/tests/e2e/routes.spec.ts`
- FOUND: `dashboard-next/tests/e2e/a11y.spec.ts`
- FOUND: `dashboard-next/tests/e2e/visual.spec.ts`
- FOUND: `dashboard-next/tests/fixtures/api/health.json`
- FOUND: `dashboard-next/tests/fixtures/api/status-complete.json`
- FOUND: `dashboard-next/tests/fixtures/api/visualize-legacy-complete.json`
- FOUND: `scripts/smoke_live.py`
- FOUND commit 8b65b77 (Task 1 tracer)
- FOUND commit 81abecc (testIgnore fix)
- FOUND commit 78fe7ae (Task 2)
- FOUND commit f28b352 (Task 3)
- CI run 36833284557 (push): conclusion `success` — verified via `gh run view --json conclusion`
- CI run 36833670297 (workflow_dispatch, live_smoke=true): conclusion `success`, `live-smoke` job `success` — verified via `gh run view --json conclusion,jobs`
