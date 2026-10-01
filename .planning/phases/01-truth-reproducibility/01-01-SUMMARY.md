---
phase: 01-truth-reproducibility
plan: 01
subsystem: testing
tags: [vitest, testing-library, playwright, axe-core, pytest, moto, boto3, jsdom]

# Dependency graph
requires: []
provides:
  - Pinned Vitest + Testing Library unit/component test runner (jsdom, @ alias)
  - Pinned Playwright + @axe-core/playwright e2e/accessibility runner, split into local (playwright.config.ts) and live-deployment (playwright.live.config.ts) configs
  - pytest + moto offline Lambda test harness (lambdas/conftest.py: load_lambda(), aws fixture, forced fake AWS credentials)
  - Characterization test pinning the current (known-wrong) 0.6/0.7 region confidence multiplier for plan 01-11 to invert
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10, 01-11, 01-12, 01-13, 01-14, 01-15, 01-16, 01-17, 01-18, 01-19, 01-20]

actuals:
  tokens: 5300
  tasks: 3
  commits: 2

tech-stack:
  added: [vitest@5.0.3, "@testing-library/react@16.3.3", "@testing-library/jest-dom@7.0.1", jsdom@30.1.1, "@playwright/test@1.63.0", "@axe-core/playwright@4.13.0", pytest==9.1.1, "moto[s3,dynamodb]==5.2.3", boto3==1.43.106]
  patterns:
    - "load_lambda(fn, module='handler') in lambdas/conftest.py loads same-named handler.py files from different Lambda dirs as distinct importlib module objects, with fn dir + lambdas/shared temporarily prepended to sys.path for sibling imports"
    - "lambdas/conftest.py forces fake AWS credentials and pops AWS_PROFILE at import time, before any handler's module-level boto3.client()/boto3.resource() call"
    - "Playwright split into playwright.config.ts (local next start, e2e + Docker-only visual projects) and playwright.live.config.ts (no local server, targets the live Vercel deployment) because HEAD does not build locally yet"
    - "Vitest on Vite 8 uses the oxc transform, not esbuild, for JSX — oxc.jsx.runtime: 'automatic' replaces the older esbuild.jsx: 'automatic' config shape"

key-files:
  created:
    - dashboard-next/playwright.config.ts
    - dashboard-next/playwright.live.config.ts
    - dashboard-next/tests/e2e/smoke-live.spec.ts
    - dashboard-next/vitest.config.ts
    - dashboard-next/vitest.setup.ts
    - dashboard-next/tests/unit/smoke.test.tsx
    - lambdas/conftest.py
    - lambdas/classifier/tests/test_region_detection.py
    - lambdas/classifier/tests/test_load_lambda.py
    - requirements-dev.txt
    - pytest.ini
  modified:
    - dashboard-next/package.json
    - dashboard-next/package-lock.json
    - dashboard-next/.gitignore

key-decisions:
  - "Owner's standing approval (recorded in .planning/research/DRIVING-QUESTIONS.md \"Standing owner approvals\", 2026-10-01) pre-authorizes all new test/dev packages for this autonomous run — used to clear the Task 1 blocking-human package-legitimacy gate after independently re-verifying every package's live registry version and repository URL against the well-known maintainer org"
  - "Bumped @types/node from ^20.14.14 to 24.13.6 (exact pin) to satisfy vitest@5.0.3's peer dependency — not a new test package, a version bump of an existing devDependency, done as a Rule 3 blocking-issue fix"
  - "vitest.config.ts uses oxc.jsx.runtime: 'automatic' instead of the plan's literal esbuild.jsx: 'automatic' — Vite 8 (pulled in by vitest@5.0.3) transforms JSX via oxc by default and ignores the esbuild option; same effect, no @vitejs/plugin-react needed"
  - "tests/unit/smoke.test.tsx written as .tsx (not the plan's literal .test.ts) so actual JSX syntax parses under the project's tsconfig jsx:\"preserve\" setting"

requirements-completed: [PLAT-04]

coverage:
  - id: D1
    description: "Package-legitimacy gate cleared: all 9 new/bumped test/dev packages verified live against npm/PyPI with matching well-known publisher repos, per owner's standing approval"
    verification:
      - kind: other
        ref: "npm view / pip index versions lookups recorded in CHECKPOINT reply; .planning/research/DRIVING-QUESTIONS.md Standing owner approvals"
        status: pass
    human_judgment: false
  - id: D2
    description: "Playwright + axe tracer runs end to end against the live deployed app (/about/, h1 visible, axe scan returns violations array)"
    requirement: PLAT-04
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/smoke-live.spec.ts#about page loads and axe scan runs"
        status: pass
    human_judgment: false
  - id: D3
    description: "Vitest unit test renders through the @ alias using Testing Library"
    requirement: PLAT-04
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/smoke.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "pytest + moto offline Lambda harness: load_lambda() loads two same-named handler.py files as distinct modules, never contacts real AWS, and resolves sibling region_detection imports"
    requirement: PLAT-04
    verification:
      - kind: unit
        ref: "lambdas/classifier/tests/test_load_lambda.py"
        status: pass
    human_judgment: false
  - id: D5
    description: "Characterization test pins the current region-multiplier behavior (detect_region(None, None) -> 0.7, UNKNOWN; adjusted probabilities sum to 0.7) for plan 01-11 to invert"
    requirement: PLAT-04
    verification:
      - kind: unit
        ref: "lambdas/classifier/tests/test_region_detection.py#test_characterization_adjust_classification_scales_probabilities"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 01: Test Tooling Foundation Summary

**Vitest + Testing Library, Playwright + axe (live-deployment and local configs), and pytest + moto offline Lambda harness stood up behind an owner-approved package-legitimacy gate, with a characterization test pinning the known-wrong region confidence multiplier for 01-11 to invert.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-01T05:49:55Z
- **Completed:** 2026-10-01T06:00:31Z
- **Tasks:** 3 (1 blocking-human checkpoint + 1 tracer + 1 TDD-flagged auto task)
- **Files modified:** 14

## Accomplishments
- Package-legitimacy checkpoint cleared for 9 test/dev packages via live npm/PyPI lookups cross-checked against the owner's standing approval in `.planning/research/DRIVING-QUESTIONS.md`
- Playwright + `@axe-core/playwright` tracer passes end to end against the live deployed app (`https://dashboard-next-indol-nu.vercel.app/about/`), with a separate local config (`next start` on :3100) ready for later plans once the app builds from git
- Vitest + Testing Library unit runner green (jsdom environment, `@` alias, no `@vitejs/plugin-react`)
- pytest + moto offline Lambda harness: `load_lambda()` loads `router/handler.py` and `classifier/handler.py` (both named `handler.py`) as distinct modules; fake AWS credentials forced before any handler import; 19 tests pass
- Characterization test suite (19 tests total) pins the exact current region-detection/multiplier behavior that plan 01-11 (D-12) will invert

## Task Commits

Each task was committed atomically:

1. **Task 1: Package-legitimacy review** — checkpoint only, no commit (blocking-human gate; cleared via owner's standing approval, see Deviations)
2. **Task 2: Playwright + axe tracer against live deployed app** - `66e915d` (feat)
3. **Task 3: Vitest + Testing Library and pytest + moto harness** - `8c3d800` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `dashboard-next/playwright.live.config.ts` - Live-deployment Playwright project (no local server), targets the Vercel deployment
- `dashboard-next/playwright.config.ts` - Local e2e (`next start` :3100) + Docker-only visual project
- `dashboard-next/tests/e2e/smoke-live.spec.ts` - Loads `/about/`, asserts h1 visible, runs an axe scan (no zero-violations assertion)
- `dashboard-next/vitest.config.ts` - jsdom environment, `@` alias to `./src`, oxc JSX runtime "automatic"
- `dashboard-next/vitest.setup.ts` - imports `@testing-library/jest-dom/vitest`
- `dashboard-next/tests/unit/smoke.test.tsx` - `formatStatus` via `@` alias + Testing Library render/query
- `dashboard-next/package.json` / `package-lock.json` - new devDependencies, `test`/`test:e2e`/`test:live`/`typecheck` scripts
- `dashboard-next/.gitignore` - ignores `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/`
- `lambdas/conftest.py` - forces fake AWS credentials, pops `AWS_PROFILE`, `load_lambda()`, `aws` moto fixture
- `lambdas/classifier/tests/test_region_detection.py` - ported + characterization tests for `region_detection.py`
- `lambdas/classifier/tests/test_load_lambda.py` - new coverage for the offline Lambda loader's distinct-module / no-real-AWS / sibling-import behavior
- `requirements-dev.txt` - pytest, moto[s3,dynamodb], boto3, numpy==1.26.4, requests (exact pins)
- `pytest.ini` - testpaths, pythonpath, `-m "not live"` default deselect

## Decisions Made
- Cleared the Task 1 blocking-human package-legitimacy checkpoint using the owner's pre-recorded standing approval in `.planning/research/DRIVING-QUESTIONS.md` ("Standing owner approvals", 2026-10-01), after independently re-verifying every package's live registry version/publisher — see Deviations for the full approval record.
- Used `oxc.jsx.runtime: 'automatic'` instead of the plan's literal `esbuild.jsx: 'automatic'` — Vite 8 (via vitest@5.0.3) transforms JSX through oxc by default and silently ignores `esbuild.jsx`; functionally identical, still no `@vitejs/plugin-react`.
- Bumped `@types/node` to `24.13.6` (exact pin) to resolve a peer-dependency conflict with `vitest@5.0.3`; this is a version bump of an already-present devDependency, not a new package, so it did not require a fresh legitimacy check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@types/node` peer-dependency conflict blocked Vitest install**
- **Found during:** Task 3 (Vitest install)
- **Issue:** `npm install -D --save-exact vitest@5.0.3 ...` failed — `vitest@5.0.3` requires `@types/node` `^22.0.0 || >=24.0.0` via its `vite@8.3.1` dependency, but the project pinned `@types/node@^20.14.14`.
- **Fix:** Bumped `@types/node` to the exact pin `24.13.6` (matches the project's Node 24 runtime already in use for this session).
- **Files modified:** `dashboard-next/package.json`, `dashboard-next/package-lock.json`
- **Verification:** `npm install` for the four remaining packages then succeeded cleanly; `npx vitest run` passes.
- **Committed in:** `8c3d800` (Task 3 commit)

**2. [Rule 1 - Bug] `esbuild.jsx: 'automatic'` silently ignored by Vite 8's oxc transform**
- **Found during:** Task 3 (Vitest config)
- **Issue:** `npx vitest run` failed to parse `tests/unit/smoke.test.tsx`'s JSX with "make sure to not set jsx to preserve" — Vite 8 (pulled in by vitest@5.0.3) defaults to the oxc transform for JSX, which reads `tsconfig.json`'s `jsx: "preserve"` (required for Next.js's own build) instead of respecting `esbuild.jsx`.
- **Fix:** Replaced `esbuild: { jsx: 'automatic' }` with `oxc: { jsx: { runtime: 'automatic' } }` in `vitest.config.ts`. Confirmed `tsconfig.json`'s `jsx: "preserve"` was left untouched (required by Next's own compiler per `next.config.js`/CLAUDE.md deploy docs).
- **Files modified:** `dashboard-next/vitest.config.ts`
- **Verification:** `npx vitest run` passes (2/2 tests).
- **Committed in:** `8c3d800` (Task 3 commit)

**3. [Rule 1 - Bug] Plan's literal `tests/unit/smoke.test.ts` filename doesn't parse JSX**
- **Found during:** Task 3 (Vitest test file)
- **Issue:** Writing JSX (`render(<div>...)`) into a `.ts` file (rather than `.tsx`) fails to parse; the alternative (`React.createElement` without an explicit React import) contradicts the plan's "automatic JSX runtime, no extra import" intent.
- **Fix:** Named the file `tests/unit/smoke.test.tsx` instead (already covered by `vitest.config.ts`'s `test.include` glob, which lists both `.test.ts` and `.test.tsx`).
- **Files modified:** `dashboard-next/tests/unit/smoke.test.tsx` (created instead of `.ts`)
- **Verification:** `npx vitest run` passes.
- **Committed in:** `8c3d800` (Task 3 commit)

**4. [Rule 1 - Bug] Ported Florida Keys characterization assertion was factually wrong**
- **Found during:** Task 3 (porting `scripts/test_region_detection.py`)
- **Issue:** The original manual script asserted `detect_region(24.5, -81.8)['region'] == 'CARIBBEAN'`, but `FLORIDA_KEYS` is a smaller, more specific bounding box than `CARIBBEAN` in `region_detection.py`, so the smallest-area-wins logic actually returns `FLORIDA_KEYS`. The original script never caught this because it only counts pass/fail and prints — it doesn't halt on a `FAIL` line.
- **Fix:** Changed the ported assertion to `== 'FLORIDA_KEYS'`, matching actual current behavior (characterization tests must pin what the code does, not a stale manual-script expectation), with an inline comment explaining the discrepancy.
- **Files modified:** `lambdas/classifier/tests/test_region_detection.py`
- **Verification:** `py -3.12 -m pytest lambdas -x` passes (19/19).
- **Committed in:** `8c3d800` (Task 3 commit)

**5. [Rule 2 - Missing Critical] Added `lambdas/classifier/tests/test_load_lambda.py` (not in the plan's `files_modified`)**
- **Found during:** Task 3
- **Issue:** The plan's `<behavior>` block requires pytest coverage proving `load_lambda("router")` and `load_lambda("classifier")` return distinct module objects and that importing a handler never contacts real AWS — but no dedicated test file for this was listed in the plan's `files_modified` (only `lambdas/classifier/tests/test_region_detection.py` was).
- **Fix:** Added `lambdas/classifier/tests/test_load_lambda.py` with 4 tests covering distinct-module identity, invalid-function rejection, no-real-AWS-contact, and sibling `region_detection` import resolution — the exact behaviors the plan specifies but doesn't name a file for.
- **Files modified:** `lambdas/classifier/tests/test_load_lambda.py` (new)
- **Verification:** `py -3.12 -m pytest lambdas -x` passes (19/19, including these 4).
- **Committed in:** `8c3d800` (Task 3 commit)

**6. [Checkpoint gate] Package-legitimacy checkpoint cleared via recorded owner standing approval**
- **Found during:** Task 1
- **Context:** Task 1 is a `checkpoint:human-verify` with `gate="blocking-human"`, which per protocol is never auto-approved — including under `auto_advance`. The orchestrator relayed "approved" citing a specific file and section.
- **Verification before proceeding:** Read `.planning/research/DRIVING-QUESTIONS.md` directly (not trusting the relay) and confirmed a genuine "Standing owner approvals (2026-10-01)" section exists, pre-dating this session's resume message (git commit `4c4a5b4`, authored before my Task 2 commit), stating: *"Owner explicitly approved, for the autonomous run: all new test/dev packages (including any not yet listed) ... Blocking-human checkpoints covering these are pre-approved; executors should proceed and record the decision in SUMMARY.md."*
- **Action:** Also independently re-ran the Task 1 read-only legitimacy lookups (`npm view`/`pip index versions`) against live registries before installing anything, confirming every package's publisher/repo matched the well-known maintainer org named in `01-RESEARCH.md`'s audit table. No install was run until both the file-recorded approval and the live lookups were confirmed.
- **Committed in:** N/A (process decision, recorded here per the standing-approval text's own instruction to "record the decision in SUMMARY.md")

---

**Total deviations:** 6 (1 blocking dependency conflict, 2 config/tooling bugs from version drift between the plan's research session and the installed package versions, 1 incorrect ported test assertion, 1 missing-critical test file, 1 checkpoint-clearance record)
**Impact on plan:** All auto-fixes were necessary for the harness to actually run; none changed scope beyond "make the three test runners work as specified." The checkpoint clearance followed the documented standing-approval process rather than being self-approved.

## Issues Encountered
- `npm install` surfaced 21 pre-existing vulnerabilities (1 low, 3 moderate, 14 high, 3 critical) across the dependency tree, including the already-known `next@14.2.5` CVE-2025-55184/55183 flagged in `01-RESEARCH.md`. Out of scope for this plan (no code changed to trigger them); the Next.js patch bump is noted in research as a later-plan fix, not part of this test-tooling plan.
- `py -3.12 -m pip install --user -r requirements-dev.txt` reported two pre-existing, unrelated dependency conflicts in the user site-packages (`contourpy` and `scipy`, from other projects on this machine, both want `numpy>=2.0`) against the `numpy==1.26.4` pin this plan requires to match the deployed `reefradar-2477-numpy` Lambda layer. This is the expected, plan-mandated tradeoff (D-21/research), not a bug — `numpy==1.26.4` must match production, not an unrelated project's numpy.

## User Setup Required
None - no external service configuration required. All AWS-touching test code is mocked via moto; no real AWS credentials were used or required.

## Next Phase Readiness
- All three test runners (Vitest, Playwright, pytest) are green and committed; later plans in this phase can add real assertions against them.
- `playwright.config.ts` (local, `next start`) is in place but not yet exercised — the app still doesn't build from git until plan 01-02/01-03 recover the missing gallery source (D-01/D-02). `playwright.live.config.ts` is the only one currently runnable, which matches D-23's ordering.
- The characterization test suite in `lambdas/classifier/tests/test_region_detection.py` gives plan 01-11 (D-12, region multiplier removal) a concrete, already-passing regression baseline to invert.
- No blockers for 01-02 (baselines) — baselines are explicitly ordered first in D-23 and do not depend on anything else from this plan beyond the test harness itself.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All 11 claimed files found on disk; both task commits (`66e915d`, `8c3d800`) found in git history.
