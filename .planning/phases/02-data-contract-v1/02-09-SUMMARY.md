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
  tasks: 2
  commits: 3

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

requirements-completed: []

status: partial
completed: 2026-10-02
---

# Phase 2 Plan 09: Legacy Pages on the Contract Summary (PARTIAL: Task 3 blocked)

**Every legacy consumer of site reference data now reads the contract module and the hard-coded coordinate table and client /sites method are gone (Tasks 1 and 2 done and green locally); Task 3 (push, CI, regenerate the three sites baselines) did not run because the permission system denied `git push`.**

## Status

- Task 1 (tracer) and Task 2: complete, committed locally, verified locally.
- Task 3: NOT done. The first `git push origin redesign/v2-discovery` was denied by the auto-mode classifier ("Blind Apply"); a following local status/lint call was also denied ("Git Destructive"). No workaround was attempted. Nothing has been pushed, no workflow was dispatched, no baseline was changed.

## Commits (local, unpushed)

1. `6a54a97` test(02-09): sites page driven through the contract fetch harness (RED; failed 6 of 6 before the page was repointed)
2. `68c8c11` feat(02-09): sites page, cards and world map read only contract data (tracer; `playwright test --project=e2e routes` 11 passed before expanding)
3. `db674ef` feat(02-09): repoint landing, about, map and mini map; delete the hard-coded site table and the client getSites

## Local verification

- `npm test`: 17 files, 200 tests passed (sites-page rewritten with 5 contract-driven cases plus the filter test; new site-index test with 3 cases)
- `npm run typecheck`: clean. `npm run lint`: only the pre-existing `LocationCompare.tsx` exhaustive-deps warning (the final lint re-run after the last comment-only edit was denied; typecheck was re-run clean after it)
- `npx playwright test --project=e2e` (includes `next build`): 49 passed, zero unhandled API calls with GET /sites removed from the mock
- `grep -rn SITE_COORDINATES dashboard-next/src` prints 0 lines; `grep -rn getSites dashboard-next/src` prints 0 lines

## What Task 3 still needs (for the owner or a re-run with push permission)

1. `git push origin redesign/v2-discovery` (never main); wait for the push CI (`gh run watch <id> --exit-status`). Expected: the visual job fails only on sites-1440, sites-1024 and/or sites-390 (irma_eastern_sambo gains its location row).
2. Confirm in the playwright-report that only those three states fail and the diff is only that card (plus layout shift below it at narrow widths).
3. `gh workflow run CI --ref redesign/v2-discovery -f update_snapshots=true`; wait for it to finish before any push; `gh run download <id> -n visual-snapshots -D <scratch>`; verify the other 30 PNGs are sha256-identical to the committed ones; view the three new PNGs; copy only sites-1440/1024/390; commit; push; wait for a fully green CI run.

## Deviations from Plan

- **[Process] Task 2 tests were not written RED-first.** `site-index.test.tsx` was added after the implementation in the same commit and passes; the RED/GREEN split exists only for Task 1. The behaviours are covered either way (54-entry index, marker location, loading panel versus the empty state).
- **Map page error state unchanged.** `/dashboard/map` has no retry control (its message says to refresh), so `refetch` is not destructured there; markup untouched.
- **Country guess dropped.** The map page's `country || (id starts with ken ? Kenya : Indonesia)` fallback was removed with the coordinate enrichment (contract country is always set; guessing from the id would be a truth violation).
- **MiniMap loading panel is duplicated markup** of the AnalysisResults dynamic-import fallback (same classes and text) rather than a shared component, to stay inside the plan's file list.

## Known Stubs

None.

## Threat Flags

None. T-02-09-01 mitigated (React text only; the Google Maps href is built from numbers; a unit test asserts it). T-02-09-02 to -04 are Task 3 mitigations and are untouched because Task 3 did not run.

## Self-Check

- Files present: dashboard-next/tests/unit/site-index.test.tsx, dashboard-next/tests/unit/sites-page.test.tsx
- Commits present: 6a54a97, 68c8c11, db674ef
- Plan NOT complete: Task 3 outstanding; STATE.md, ROADMAP.md and requirements intentionally not advanced.
