---
phase: 02-data-contract-v1
plan: 09
subsystem: web-legacy-pages-on-contract
tags: [contract, legacy-adapter, site-index, visual-baselines, ci-dispatch]

requires:
  - phase: 02-data-contract-v1
    provides: contract module with useLegacySitesResponse (02-07), ?cv pinning and setContractPin test helper (02-08)
provides:
  - "The sites page, cards, world map, markers, landing, about, dashboard map and the analysis mini map obtain site records, coordinates and location labels only from the contract module"
  - "useSiteIndex(): contract sites keyed by site_id (lat, lon, location) for id-based coordinate lookups"
  - "The hard-coded site-coordinate table (SITE_COORDINATES, SiteCoordinates) and the client getSites method are deleted; the e2e mock no longer serves GET /sites; backend GET /sites is untouched"
affects: [02-10, Phase 17 retirement of the backend /sites route]

actuals:
  tokens: 14000
  tasks: 3
  commits: 4

key-files:
  created:
    - dashboard-next/tests/unit/site-index.test.tsx
  modified:
    - dashboard-next/src/app/sites/page.tsx
    - dashboard-next/src/app/page.tsx
    - dashboard-next/src/app/about/page.tsx
    - dashboard-next/src/app/dashboard/map/page.tsx
    - dashboard-next/src/components/SiteCard.tsx
    - dashboard-next/src/components/maps/WorldMap.tsx
    - dashboard-next/src/components/maps/SiteMarker.tsx
    - dashboard-next/src/components/maps/MiniMap.tsx
    - dashboard-next/src/features/contract/legacy.ts
    - dashboard-next/src/features/contract/index.ts
    - dashboard-next/src/types/index.ts
    - dashboard-next/src/lib/api.ts
    - dashboard-next/tests/unit/sites-page.test.tsx
    - dashboard-next/tests/e2e/support/mock-api.ts
    - dashboard-next/tests/e2e/visual.spec.ts-snapshots/sites-390-visual-linux.png

requirements-completed: []

status: complete
completed: 2026-10-02
---

# Phase 2 Plan 09: Legacy Pages on the Contract Summary

**Every legacy consumer of site reference data (sites page, cards, world map, markers, landing, about, dashboard map, analysis mini map) now reads the contract module; the hard-coded coordinate table and the client /sites method are deleted; only the sites-390 visual baseline changed, by exactly one location row for irma_eastern_sambo, and CI is green on the pushed head.**

## Commits

1. `6a54a97` test(02-09): sites page driven through the contract fetch harness (RED, 6 of 6 failed before repointing)
2. `68c8c11` feat(02-09): sites page, SiteCard, WorldMap and SiteMarker read only contract data (tracer; `playwright test --project=e2e routes` 11 passed before expanding)
3. `db674ef` feat(02-09): landing, about, dashboard map and MiniMap repointed; `SITE_COORDINATES`, `SiteCoordinates` and the client `getSites` deleted; GET /sites removed from the e2e mock
4. `af0c528` test(02-09): regenerated sites-390 baseline

## Local verification

- `npm test`: 17 files, 200 tests passed (sites-page rewritten with 5 contract-driven cases plus the filter test; new site-index test with 3 cases)
- `npm run typecheck`: clean. `npm run lint`: only the pre-existing `LocationCompare.tsx` exhaustive-deps warning
- `npx playwright test --project=e2e` (includes `next build`): 49 passed, zero unhandled API calls with GET /sites removed from the mock
- `grep -rn SITE_COORDINATES dashboard-next/src` prints 0 lines; `grep -rn getSites dashboard-next/src` prints 0 lines

## Task 3: visual baselines through CI

- Push CI `36951486816` (https://github.com/TyLuHow/ReefRadar/actions/runs/36951486816): every job green except visual, which failed on exactly one state, `sites @ 390` (32 passed). `sites @ 1440` and `sites @ 1024` stayed within tolerance.
- Dispatch run `36951802796` (https://github.com/TyLuHow/ReefRadar/actions/runs/36951802796, `update_snapshots=true`, nothing pushed meanwhile): all jobs success; artifact `visual-snapshots` downloaded to the session scratchpad.
- sha256 comparison of all 33 regenerated PNGs against the committed ones: 32 identical (including sites-1440 and sites-1024, which regenerate byte-identical); only `sites-390-visual-linux.png` differs.
- Inspected change: the new sites-390 image is 390x14558 versus 390x14502 before, 56 px taller, which is one location row; the card list is otherwise the same. Cause: irma_eastern_sambo was missing from the old hard-coded table, so its card had no location; it now shows "Florida Keys, USA" and its coordinates. At 1440 and 1024 that card sits in a grid row whose height is set by siblings that already had a location row, so those images do not change.
- Only sites-390 was copied and committed (`af0c528`); only one of the three listed baselines needed regenerating.
- Push CI on the head `af0c528` (run `36952216966`, https://github.com/TyLuHow/ReefRadar/actions/runs/36952216966): success; web, python, citations, e2e and visual (all 33 states compared) green.

## Deviations from Plan

- **Push permission.** The first push was denied by the permission system; the owner then added allow rules and Task 3 resumed unchanged.
- **[Process] Task 2 tests were not written RED-first.** `site-index.test.tsx` was added after the implementation in the same commit and passes; the RED/GREEN split exists only for Task 1. The behaviours are covered either way (54-entry index, marker location, loading panel versus the empty state).
- **Map page error state unchanged.** `/dashboard/map` has no retry control (its message says to refresh), so `refetch` is not destructured there; markup untouched.
- **Country guess dropped.** The map page's `country || (id starts with ken ? Kenya : Indonesia)` fallback was removed with the coordinate enrichment (contract country is always set; guessing from the id would be a truth violation).
- **MiniMap loading panel is duplicated markup** of the AnalysisResults dynamic-import fallback (same classes and text) rather than a shared component, to stay inside the plan's file list.

## Known Stubs

None.

## Threat Flags

None. T-02-09-01 mitigated (React text only; the Google Maps href is built from numbers; a unit test asserts it). T-02-09-02 (only sites-390 changed, 32 PNGs hash-identical, diff inspected), -03 (nothing pushed while the dispatch ran) and -04 (branch only, no main merge, no Vercel deploy) are mitigated.

## Self-Check: PASSED

- Files present: dashboard-next/tests/unit/site-index.test.tsx, dashboard-next/tests/unit/sites-page.test.tsx
- Commits present: 6a54a97, 68c8c11, db674ef, af0c528
- CONTRACT-01 and CONTRACT-05 intentionally not marked complete (they complete at phase verification).
