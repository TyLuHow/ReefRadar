---
phase: 03-platform-upgrade-stack-consolidation
plan: 10
subsystem: ui
tags: [maplibre, react-map-gl, minimap, leaflet-removal, osm-raster, webgl2-fallback, plat-02, feature-module]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: 03-09 WorldMap/SiteMarker on MapLibre, style.ts (MINI_MAP_STYLE, MINI_MAP_ATTRIBUTION) and the declared visual-red window
provides:
  - Analysis-result "Most Similar Reference Sites" mini map on MapLibre (features/map/MiniMap.tsx), every existing panel and badge preserved
  - Compact WebGL fallback variant in MapShell (icon and the single line, fits the 200px panel)
  - Leaflet removed: leaflet, react-leaflet and @types/leaflet gone from package.json, the lockfile and src; the react-leaflet overrides block deleted; npm ls shows (empty)
  - globals.css without the Leaflet import, .leaflet-* rules and .custom-marker rule; src/components/maps deleted
  - visual.spec.ts hides "canvas, .maplibregl-map" only; stack-consolidation test gates all of the above
affects: [03-11, 03-15]

actuals:
  tokens: 10300
  tasks: 2
  commits: 2

tech-stack:
  added: []
  removed: [leaflet, react-leaflet, "@types/leaflet"]
  patterns:
    - "Fit-bounds side effect lives in an effect keyed on [ready, resolved sites] and fires after the map's onLoad (the Leaflet version ran it inside useMemo)"
    - "MapShell compactFallback prop gives small maps an icon plus one line instead of the full explanatory paragraph"
    - "Touch rotation is disabled through map.touchZoomRotate.disableRotation() so pinch zooms but never rotates"

key-files:
  created:
    - dashboard-next/src/features/map/MiniMap.tsx
  modified:
    - dashboard-next/src/features/map/MapShell.tsx
    - dashboard-next/src/features/map/index.ts
    - dashboard-next/src/components/AnalysisResults.tsx
    - dashboard-next/src/components/index.ts
    - dashboard-next/src/app/globals.css
    - dashboard-next/src/types/index.ts
    - dashboard-next/package.json
    - dashboard-next/package-lock.json
    - dashboard-next/tests/unit/site-index.test.tsx
    - dashboard-next/tests/unit/stack-consolidation.test.ts
    - dashboard-next/tests/e2e/maps.spec.ts
    - dashboard-next/tests/e2e/visual.spec.ts
  deleted:
    - dashboard-next/src/components/maps/MiniMap.tsx
    - dashboard-next/src/components/maps/SiteMarker.tsx
    - dashboard-next/src/components/maps/index.ts

key-decisions:
  - "MiniMap reuses the 03-09 SiteMarker (keyboard-operable button plus popup) instead of a second marker implementation"
  - "fitBounds is instant (duration 0): the mini map is framed before the user sees it, same effective behaviour as the old initial fit"
  - "Rank badges moved inside MapShell's framed container (z-10, top-left) so they sit inside the rounded map frame; text, colours and position unchanged"
  - "Compact fallback is a MapShell prop, not a MiniMap-specific copy of the fallback markup"

patterns-established:
  - "Mini map region is named 'Map of similar reference sites' (role=region) for assistive tech and e2e queries"
  - "Removed-package gate: REMOVED_PACKAGES append plus explicit override, directory and CSS assertions"

requirements-completed: []

coverage:
  - id: M1
    description: "The analysis result mini map renders with MapLibre: 200px, zoom 5, fitBounds padding 30 / maxZoom 8 in an effect, scroll zoom off, no zoom control, drag pan and touch zoom on, rotation off, shorter OSM attribution, rank badges unchanged"
    requirement: PLAT-02
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/site-index.test.tsx (map config props, fitBounds [[w,s],[e,n]] with padding 30 / maxZoom 8, disableRotation, no NavigationControl, AttributionControl compact false, MINI_MAP_STYLE, rank badge text)"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/maps.spec.ts 'analysis result mini map (MapLibre) shows the similar sites with rank badges and visible OSM attribution' (canvas, ind_H4 badge and 91%, OpenStreetMap attribution, no Zoom in button, 200px height, no page errors)"
        status: pass
    human_judgment: false
  - id: M2
    description: "Loading, empty and no-WebGL states: 'Loading map...' while the contract index loads, 'No location data available' with no resolvable site, 200px fallback with icon and the single line without WebGL2"
    requirement: PLAT-02
    verification:
      - kind: unit
        ref: "site-index.test.tsx loading panel, empty panel and WebGL2-unavailable tests"
        status: pass
      - kind: e2e
        ref: "maps.spec.ts 'without WebGL the 200px fallback shows its single line'"
        status: pass
    human_judgment: false
  - id: M3
    description: "Coordinates come only from the contract site index (useSiteIndex via the contract barrel), in [lon, lat] order"
    requirement: PLAT-02
    verification:
      - kind: unit
        ref: "site-index.test.tsx 'places similar sites from the index' and the [lon, lat] marker test (ind_H1 lon 119.316922, irma_eastern_sambo lon -81.6625); contract fence script OK"
        status: pass
    human_judgment: false
  - id: M4
    description: "Leaflet is gone from packages, lockfile, override, stylesheet, source tree and the visual hide rule"
    requirement: PLAT-02
    verification:
      - kind: unit
        ref: "tests/unit/stack-consolidation.test.ts (three packages absent from package.json, lockfile and src imports; no react-leaflet override; src/components/maps absent; globals.css has no 'leaflet' substring or .custom-marker; visual hide rule)"
        status: pass
      - kind: command
        ref: "npm --prefix dashboard-next ls leaflet react-leaflet @types/leaflet -> (empty); grep -c -i leaflet package-lock.json -> 0"
        status: pass
    human_judgment: false
  - id: M5
    description: "No regression: full unit, typecheck, lint, both fences, production build, full e2e project (including a11y and analysis-flow) and CI non-visual jobs"
    requirement: PLAT-02
    verification:
      - kind: other
        ref: "Local: unit 31 files / 400 tests, typecheck clean, lint 0 errors (19 pre-existing warnings), feature and contract fences OK, next build OK, e2e project 66 passed. CI run https://github.com/TyLuHow/ReefRadar/actions/runs/37064006665: web, e2e, python, citations success; visual failed only experience-compare @ 390 (declared); 32 visual passed"
        status: pass
    human_judgment: false
  - id: M6
    description: "Owner review of the unhidden light OSM mini map (the visual suite hides .maplibregl-map) and of the overlap behaviour of markers at identical coordinates"
    requirement: PLAT-02
    verification:
      - kind: other
        ref: "Open assumption below; reviewed in 03-15 with regenerated baselines and the review-only unhidden captures"
        status: pass
    human_judgment: true

duration: 45min
completed: 2026-10-02
status: complete
---

# Phase 3 Plan 10: MiniMap Port and Leaflet Removal Summary

**The analysis-result mini map now runs on MapLibre with a 200px frame, zoom 5, fit-bounds in an effect (padding 30, maxZoom 8), scroll zoom off and no zoom control, and Leaflet, react-leaflet, @types/leaflet, the react-leaflet override, the Leaflet CSS and the legacy `components/maps` directory are gone, leaving MapLibre as the only map engine.**

## Performance

- **Duration:** about 45 min (includes two full local e2e/build runs and the CI watch)
- **Tasks:** 2 (1 tracer, 1 auto TDD)
- **Commits:** 2 task commits (`59bd00d`, `476bf6d`) plus this summary commit
- **Files:** 1 created, 12 modified, 3 deleted (lockfile counted among the modified)

## Task 1 (tracer): MapLibre mini map for analysis results

- `features/map/MiniMap.tsx` keeps the old props (`similarSites`, `highlightCount` default 3, `className`). Coordinates and location come from `useSiteIndex` (contract barrel); the three panels keep their copy: "Loading map..." while the index loads, "No location data available" with nothing resolvable, and the rank badges (top-left, status-coloured number, site id, rounded percentage) are unchanged.
- Map settings: `MINI_MAP_STYLE` (shorter OSM attribution), `AttributionControl compact={false}` bottom-right, initial zoom 5 at the bbox midpoint, `scrollZoom={false}`, `dragPan`, `touchZoomRotate`, `dragRotate={false}`, no NavigationControl. On load, `touchZoomRotate.disableRotation()` stops pinch rotation. `fitBounds([[w,s],[e,n]], { padding: 30, maxZoom: 8, duration: 0 })` runs in a `useEffect` keyed on the map being ready and the resolved sites, fixing the latent Leaflet bug where the fit ran inside `useMemo`.
- `MapShell` gained an optional `compactFallback` prop: the 200px no-WebGL panel shows the icon and the single line "WebGL is required for the interactive map" (no explanatory paragraph), as UI-SPEC requires. Default behaviour for the other maps is unchanged.
- `AnalysisResults.tsx` now dynamic-imports `MiniMap` from `@/features/map` with its glass-panel loading fallback and `ssr: false`.
- Tests first: `site-index.test.tsx` mocks `react-map-gl/maplibre`, `setup` and `SiteMarker` (the real maplibre-gl is never imported) and covers map props, fit-bounds, `[lon, lat]` order, highlight flag, loading, empty and WebGL fallback states. New e2e cases in `maps.spec.ts` run a mocked analysis and assert canvas, rank badge, attribution, no zoom button, 200px height, no page errors, plus the no-WebGL fallback.
- Tracer gate (auto mode): unit, typecheck, lint, both fences and `maps.spec.ts` plus `analysis-flow.spec.ts` (16 passed, WebGL2 branch executed locally) were green before Task 2 started.

## Task 2: Remove Leaflet; push

- Stack test extended first (RED: 7 failing), then: `git rm src/components/maps`, removed the `./maps` re-export from `components/index.ts`, deleted the Leaflet `@import`, every `.leaflet-*` rule and `.custom-marker` from `globals.css` (MapLibre popup, attribution and marker-pulse rules kept), `npm rm leaflet react-leaflet @types/leaflet`, deleted the now-empty `overrides` block, plain `npm install` to refresh the lockfile, and changed the visual hide rule to `canvas, .maplibregl-map { visibility: hidden !important; }` (tile blocking untouched).
- Local gate: unit 31 files / 400 tests; typecheck clean; lint 0 errors (19 warnings, all pre-existing); feature and contract fence scripts OK; `next build` OK; full e2e project 66 passed (WebGL2 available locally, a11y shows no new serious/critical rule on analyze or any other state).
- `npm ls leaflet react-leaflet @types/leaflet` prints `(empty)`; the lockfile contains no "leaflet".
- **npm audit:** 5 vulnerabilities (1 low, 1 moderate, 3 high), all transitive dev tooling (browserslist, lodash, picomatch, postcss-selector-parser and one more). None involve Leaflet or a package this plan added; `npm audit fix` was not run (out of scope).
- Pushed `b00e354..476bf6d` (no workflow_dispatch run was in progress). CI run **37064006665**, https://github.com/TyLuHow/ReefRadar/actions/runs/37064006665:
  - python (pytest): success; citations: success; web (lint, typecheck, unit, build): success; e2e (routes + axe, fixture-mocked): success; live-smoke: skipped (manual only).
  - visual: failure, exactly one failing test: `tests/e2e/visual.spec.ts:51 experience-compare @ 390` (32 passed). That is a declared state (from 03-07). No undeclared state failed, so there is no regression. Baselines were not regenerated (03-15 does that).

## Deviations from Plan

### Auto-fixed Issues

None. The plan was executed as written; the points below are interpretation notes, not fixes.

### Plan interpretation notes

- **Compact fallback:** the plan says "MapShell with the 200px fallback variant" but MapShell had no variant, so a `compactFallback` prop was added (Rule 3: needed to complete the task; default behaviour unchanged).
- **Rotation off on touch:** `dragRotate={false}` alone leaves pinch rotation, so `touchZoomRotate.disableRotation()` is called on load (Leaflet had no rotation). Not visible in the plan text, no visible change versus today.
- **Whole `overrides` block removed:** the react-leaflet entry was the only one, so the empty `overrides` key was deleted rather than left behind.
- **Two comment cleanups:** `src/types/index.ts` ("hex colors for Leaflet" -> "hex colors") and one e2e comment, so the source tree no longer describes Leaflet as live. Three explanatory comments in `features/map` still mention Leaflet historically (not imports, not CSS).
- **requirements-completed left empty:** PLAT-02 also covers the chart approach (Observable Plot + d3) and removal of recharts and wavesurfer, which land in 03-11 and 03-15, so it is not marked complete here.

**Total deviations:** 0 auto-fixed. **Impact:** none.

## Issues Encountered

None blocking. The Windows git CRLF notice appears on add and the auto-configured committer identity message appears on commit; git config was not changed. Port 3100 was free before and after the Playwright runs (only TIME_WAIT sockets); ports 3002-3006 were not touched.

## Known Stubs

None.

## Open assumptions carried forward (flagged in the plan, unchanged)

- **No clustering at identical coordinates:** mini map markers that share coordinates overlap, exactly as today (deferred to Phase 6, unresolved).
- **Manual review (03-15):** the visual suite hides `.maplibregl-map`, so the light OSM mini map is verified here through queries, unit tests and real-browser checks only; the owner reviews the unhidden capture with the regenerated baselines.

## Threat Flags

None. T-03-10-01 closed: the mini map always shows the OSM attribution as text (`compact={false}`), asserted by e2e. T-03-10-02 closed: the react-leaflet override is deleted and the stack test asserts it stays gone. T-03-10-03 closed: plain `npm install` refreshed the lockfile and the CI web job (`npm ci`) passed.

## Next Phase Readiness

Every map in the app now renders through MapLibre. PLAT-02 stays Pending until the remaining dependency/chart consolidation (03-11 and the 03-15 proof) lands. Visual-red window unchanged for the next plans: web, e2e, python and citations must stay green; visual may fail only on declared states (experience-compare, map, sites) until 03-15 regenerates baselines.

## Self-Check: PASSED

- Created file present: `dashboard-next/src/features/map/MiniMap.tsx`; deleted directory absent: `dashboard-next/src/components/maps`
- Commits `59bd00d` and `476bf6d` found in git log; CI run 37064006665 reviewed
- Acceptance commands re-run: unit (31 files, 400 tests), `npm ls` (empty), build, full e2e (66 passed) all green
