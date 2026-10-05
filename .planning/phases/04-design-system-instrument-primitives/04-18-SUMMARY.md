---
phase: 04-design-system-instrument-primitives
plan: 18
subsystem: ui
tags: [fixtures, probability-bar, legend, status-band, captured-analysis, integrity, e2e, axe]
status: complete

requires:
  - phase: 04-design-system-instrument-primitives
    provides: ProbabilityBar, Legend, StatusBand, countBy (04-17), fixtures registry and chrome (04-07), contract hooks useReferenceSites and useModelVersion
provides:
  - "tests/fixtures/api/visualize-ind_H1-captured.json: one-time read-only capture of the live ind_H1 analysis"
  - "FIXTURE_ANALYSIS and STAMPED_TEST_ANALYSIS (features/fixtures/data/analysis.ts)"
  - "probability-bar, legend and status-band fixtures sections registered in UI-SPEC order"
affects: [04-21, 04-22, 04-23, phase-5, phase-12]

actuals:
  tokens: 21000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Captured live data enters the repo as an allowlisted, URL-free, sorted-key JSON with a _capture provenance block, imported by relative path from the dev-only module (outside the contract fence)"
    - "A forced state is applied to real data and labelled (abstain on the real probabilities)"

key-files:
  created:
    - dashboard-next/tests/fixtures/api/visualize-ind_H1-captured.json
    - dashboard-next/src/features/fixtures/data/analysis.ts
    - dashboard-next/src/features/fixtures/sections/ProbabilityBarSection.tsx
    - dashboard-next/src/features/fixtures/sections/LegendSection.tsx
    - dashboard-next/src/features/fixtures/sections/StatusBandSection.tsx
  modified:
    - dashboard-next/src/features/fixtures/registry.tsx
    - dashboard-next/src/features/fixtures/slugs.ts
    - dashboard-next/src/features/instrument/StatusBand.tsx
    - dashboard-next/src/features/instrument/Legend.tsx
    - dashboard-next/tests/unit/legend.test.tsx
    - dashboard-next/tests/e2e/fixtures-route.spec.ts

key-decisions:
  - "The default ProbabilityBar fixture is the real captured analysis: degraded 0.955584, healthy 0.035958, restored_early 0.008458 shown as 95, 4 and 1 percent (largest-remainder integers, which sum to 100) beside ind_H1's reference label, Healthy. The plan's note of 'top class 0.956' is the same value; the integer is 95, not 96, because the percentages are renormalised to sum to 100"
  - "The agree cell uses the stamped test fixture against the label of its closest real contract site (ind_H4, healthy, from the fixture's own similar_sites), because the fixture names no assigner of its own"
  - "The Legend interactive cells filter to the first country in which a status present in the full data has no site (Australia: Restored (early) and Unknown read 0), chosen by code from the data, never named in the source"
  - "Sections are inserted in UI-SPEC order (probability-bar before data-table; legend and status-band after it) rather than appended at the end, because fixtures-registry.test.ts requires the registry to be a subsequence of the final order"

patterns-established:
  - "Fixture cells that draw no reading (loading, empty, error) hand the primitive an unused placeholder model card that is never rendered, and say 'No analysis is drawn in this state.'"

requirements-completed: []

duration: 60 min
completed: 2026-10-05
---

# Phase 4 Plan 18: ProbabilityBar, Legend and StatusBand fixtures Summary

**The three primitives are reviewable on real data: the default ProbabilityBar is the one-time captured ind_H1 reading (degraded 95 percent) disagreeing with its Healthy reference label, and the Legend and StatusBand cells compute every count from all 54 contract sites.**

## Accomplishments

- One-time read-only capture of the live ind_H1 analysis, reduced to an allowlist with no URL, and a fixture analysis module that carries its source note ("One-time read-only capture of the live analysis, 2026-10-05.").
- `ProbabilityBarSection`: DEFAULT (captured reading against ind_H1's reference label, assigner and the contract model card), AGREE (stamped test fixture, labelled "Test fixture, not a real analysis."), ABSTAIN (forced on the real probabilities, "State forced for review", no threshold sentence), PARTIAL CLASSES, LOADING, EMPTY, ERROR.
- `LegendSection`: STATIC, INTERACTIVE (live), SELECTED, DISABLED ZERO ROW (computed notes naming the zero statuses), WITH EVIDENCE, LOADING, EMPTY. `StatusBandSection`: DEFAULT, SELECTED (live), HOVER (forced, with the tooltip drawn), PHONE (390 px container), LOADING, EMPTY.
- E2E block (21 tests): sections and forced markers, captured reading and verdict, test-fixture label, abstain with hatched bars and only the ring mark, computed legend counts in order, disabled zero row and toggles, 44 px rows, segment flex-grow equal to the counts, label layout flex at width and grid in the 390 px container, interactive band, and axe in atlas, nocturne and poster for all three sections.

## Live capture (exactly what was fetched)

- One request: `GET https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/visualize/d5e62ea6-d107-44a5-a54f-c8ee87a0d204`, made at 2026-10-05T02:48:14Z (UTC), HTTP 200, 1295 bytes, `status` complete, label `degraded`, model `interim-real-only`, three probabilities summing to 1.0. No other live call, no write.
- The response carried no contract stamp (the four stamp fields and `stamp_status` were null) and an empty `similar_sites`; they are kept as returned (nulls) or empty. The response body, `visualization`, `embedding_summary` and `caveats` were dropped by the allowlist. The committed file contains no `http` string (acceptance check run).
- Raw response is not committed; it stayed in the session scratchpad.

## Task Commits

1. Task 1: capture and fixture analysis module - `97db5db`
2. Task 2: the three sections, registry, slugs and e2e block - `2244c67`
3. Fix found while reviewing the cells: Legend unknown explainer only while unknown sites are shown (04-17 component) - `52fbd9e`

## Verification

- `npm test`: 75 files, 1362 tests passed; the three new unit files 52 tests, run 5 times in a row with no failure. `npm run lint`: 0 errors (20 pre-existing warnings, none in new files). `npm run typecheck`: clean. Flag-less `npm run build`: exit 0.
- `check-feature-fence.mjs`, `check-contract-fence.mjs` OK; `check-dev-fixtures-excluded.mjs` OK on the flag-less build (fixtures routes 404), and the analysis id is absent from `.next/static`.
- Playwright (track config on port 3201, flagged build, deleted afterwards): new block 105 passed at `--repeat-each=5`; whole `fixtures-route.spec.ts` 339 passed at `--repeat-each=3` (final code); whole e2e project 256 passed, axe included. Screenshots of the three sections were reviewed once by eye (not committed).
- Known-flaky unit tests (sites-page, monitoring-scrub) did not fail.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Legend explainer shown when no unknown site was shown**
- **Found during:** Task 2 (reviewing the rendered interactive cells)
- **Issue:** with an Australia filter the legend still printed "No health status is assigned to these sites" because unknown exists in the full data.
- **Fix:** the explainer is printed only when the shown count of unknown is above zero; unit test added.
- **Files modified:** dashboard-next/src/features/instrument/Legend.tsx, dashboard-next/tests/unit/legend.test.tsx
- **Commit:** `52fbd9e`

**2. [Rule 3 - Blocking] StatusBand needed a way to draw the forced hover**
- **Found during:** Task 2
- **Issue:** the HOVER (forced) cell needs the hover edge on real data; the component had no hook for it.
- **Fix:** an optional fixtures-only `forcedHover` prop sets `data-force-hover` on one segment (the same pattern as BandToggle's `forced`).
- **Files modified:** dashboard-next/src/features/instrument/StatusBand.tsx
- **Commit:** `2244c67`

### Interpretation notes (not rule deviations)

- `tests/e2e/fixtures-route.spec.ts` is not in the plan's `files_modified`; the e2e block was added because the track brief required e2e with axe for the new sections.
- `registry.tsx` and `slugs.ts` entries sit in UI-SPEC order, not at the file end (see key decisions); `slugs.ts` is a one-line array, so that edit changes the line.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` per the session's own attribution instruction.

**Total deviations:** 2 auto-fixed. **Impact:** none on scope.

## Known Stubs

None. The placeholder model card handed to the loading, empty and error ProbabilityBar cells is never rendered (documented in the file).

## Threat Flags

None. T-04-18-01 (information disclosure) mitigated: field allowlist, key-name filter, no http string in the file (checked), read-only GET. T-04-18-02 (provenance) mitigated: every reading cell states its source and the forced abstain is labelled.

## Next Phase Readiness

Ready for the later fixtures plans: the three sections are registered and green, and the abstain threshold stays unknown until Phase 12.

## Self-Check: PASSED

- Files exist: visualize-ind_H1-captured.json, analysis.ts, ProbabilityBarSection.tsx, LegendSection.tsx, StatusBandSection.tsx (checked on disk).
- Commits `97db5db`, `52fbd9e`, `2244c67` present in `git log`.
- All task acceptance criteria re-run and green.
