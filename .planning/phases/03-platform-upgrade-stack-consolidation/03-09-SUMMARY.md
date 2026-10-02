---
phase: 03-platform-upgrade-stack-consolidation
plan: 09
subsystem: ui
tags: [maplibre, react-map-gl, osm-raster, sites-map, keyboard-a11y, attribution, plat-02, feature-module]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: 03-08 src/features/map (setup, MapShell, worker script) and the declared visual-red window
provides:
  - /sites world map on MapLibre with an OpenStreetMap raster base (standard tile URL, tileSize 256, maxzoom 19, no subdomains)
  - Always-visible text attribution "(c) OpenStreetMap contributors" (AttributionControl compact false, bottom-right), kept clear of the legend
  - SiteMarker: a real labelled button per site ("ind_H1, Indonesia, Healthy"), popup opened by Enter, Space or click, Escape and the close button return focus to the marker
  - style.ts (OSM raster style plus the WorldMap and MiniMap attribution strings) ready for the 03-10 MiniMap
  - Leaflet WorldMap deleted (MiniMap and the Leaflet SiteMarker stay until 03-10)
affects: [03-10, 03-15]

actuals:
  tokens: 10000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "DOM marker = a native <button> inside react-map-gl Marker, so Enter/Space/Tab come from the browser instead of custom key handlers"
    - "Escape handled by a document keydown listener that exists only while the popup is open; focus returns through a ref"
    - "MapShell children own overlays (legend) so they sit inside the rounded, overflow-hidden map frame"

key-files:
  created:
    - dashboard-next/src/features/map/style.ts
    - dashboard-next/src/features/map/SiteMarker.tsx
    - dashboard-next/src/features/map/WorldMap.tsx
    - dashboard-next/tests/unit/map-marker.test.tsx
  modified:
    - dashboard-next/src/features/map/index.ts
    - dashboard-next/src/app/sites/page.tsx
    - dashboard-next/src/app/globals.css
    - dashboard-next/src/components/maps/index.ts
    - dashboard-next/tests/e2e/maps.spec.ts
    - dashboard-next/tests/unit/sites-page.test.tsx
  deleted:
    - dashboard-next/src/components/maps/WorldMap.tsx

key-decisions:
  - "The two files left untracked by the stalled previous executor (SiteMarker.tsx, style.ts) were reviewed line by line against the plan and UI-SPEC and kept unchanged; they were correct"
  - "Attribution control margin is overridden to 0 (flush to the corner, like the Leaflet one) so the legend at bottom 16px does not cover the licence text; an e2e hit-test proves the link is the topmost element"
  - "initial view computed once through a lazy useState initializer (not an effect, not a memo with disabled deps); later site changes refit instead of recentring"
  - "dragRotate disabled on WorldMap: Leaflet had no rotation, so the port should not add one"

patterns-established:
  - "e2e for OSM maps fulfils tile.openstreetmap.org requests with a transparent PNG; CI never reaches the tile server"
  - "Attribution is asserted as visible AND uncovered (elementFromPoint), not just present"

requirements-completed: []

coverage:
  - id: W1
    description: "/sites renders a MapLibre OSM raster map with visible OSM attribution and zoom buttons"
    requirement: PLAT-02
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/maps.spec.ts 'sites world map' (region name, canvas, attribution text and copyright link, attribution link not covered, Zoom in/out buttons, no page errors)"
        status: pass
      - kind: unit
        ref: "dashboard-next/tests/unit/map-marker.test.tsx 'OSM raster style' (tile URL, no {s}, tileSize 256, maxzoom 19, attribution strings)"
        status: pass
    human_judgment: false
  - id: W2
    description: "Markers are keyboard-operable: labelled button, Enter opens popup and focuses Close popup, Escape closes and returns focus to the same marker"
    requirement: PLAT-02
    verification:
      - kind: e2e
        ref: "maps.spec.ts 'renders the OSM map ... keyboard-operable markers' (real Enter and Escape key presses, focus assertions)"
        status: pass
      - kind: unit
        ref: "map-marker.test.tsx SiteMarker block (label, popup content, Escape focus, close-button focus, closeOnClick false, maxWidth 300px, null without coordinates, long location untruncated)"
        status: pass
    human_judgment: false
  - id: W3
    description: "Coordinates stay [lon, lat]; legend rows, counts and STATUS_COLORS dots; no-WebGL fallback; site list still renders"
    requirement: PLAT-02
    verification:
      - kind: unit
        ref: "map-marker.test.tsx (Indonesia lon about 119 / lat about -5 on the Marker; legend only non-zero rows; hidden with no sites; fallback when WebGL2 missing)"
        status: pass
      - kind: e2e
        ref: "maps.spec.ts 'without WebGL the fallback renders and the site list still renders'"
        status: pass
    human_judgment: false
  - id: W4
    description: "No a11y regression and no routing regression; CI green except declared visual states"
    requirement: PLAT-02
    verification:
      - kind: e2e
        ref: "a11y.spec.ts sites state and routes.spec.ts pass locally (22 of 22); full e2e project 64 passed"
        status: pass
      - kind: other
        ref: "https://github.com/TyLuHow/ReefRadar/actions/runs/37062159576 (web, e2e, python, citations success; visual 1 failed, experience-compare @ 390, 32 passed)"
        status: pass
    human_judgment: false
  - id: W5
    description: "Owner review of the unhidden light OSM map (the visual suite hides .maplibregl-map), and clustering deferral for dense sites"
    requirement: PLAT-02
    verification:
      - kind: other
        ref: "Open assumptions below; reviewed in 03-15 with regenerated baselines"
        status: pass
    human_judgment: true

duration: 55min
completed: 2026-10-02
status: complete
---

# Phase 3 Plan 09: WorldMap and Keyboard-Operable SiteMarker on MapLibre Summary

**The /sites world map now runs on MapLibre with the same OpenStreetMap raster tiles and an always-visible, uncovered "(c) OpenStreetMap contributors" attribution, and every site marker is a labelled button that opens its popup with Enter or Space and gives focus back to the marker on Escape or Close popup.**

## Performance

- **Duration:** about 55 min (includes reviewing the stalled attempt's leftovers and the CI watch)
- **Tasks:** 2 (1 tracer, 1 auto TDD)
- **Commits:** 2 task commits (`26dfb46`, `3133f62`) plus this summary commit
- **Files:** 4 created, 6 modified, 1 deleted

## Retry note

A previous executor stalled with no commits and left `features/map/SiteMarker.tsx` and `features/map/style.ts` untracked. Both were read first and checked against the plan and UI-SPEC (marker label format, dot sizes and borders, `closeOnClick={false}`, `maxWidth 300px`, Escape listener only while open, focus ref, tile URL, `tileSize 256`, `maxzoom 19`, both attribution strings). They were correct and are committed unchanged. Long commands (build plus Playwright) ran as polled background tasks; nothing was left in the foreground and ports 3002-3006 were not touched (the e2e server is port 3100 and nothing answered there before or after).

## Task 1 (tracer): MapLibre world map with keyboard-operable markers

- `WorldMap.tsx` composes `MapShell` (region "Map of reef recording sites", `height` default 400px, rounded frame, shared WebGL2 fallback), react-map-gl `Map` with `mapLib` from `setup.ts` and `WORLD_MAP_STYLE`, `attributionControl={false}` plus `AttributionControl compact={false}` bottom-right, `NavigationControl showCompass={false}` top-left, scroll zoom on, rotation off. Initial view zoom 2 at the bbox midpoint (or lat 0 / lon 80), converted once to lon/lat; `fitBounds` padding 50 / `maxZoom 10` after load and whenever `sites` change (first fit instant, later fits animated unless reduced motion).
- Legend moved verbatim (heading, rows, zero rows hidden, bottom-right 16px, surface style) with `z-10` and colours read from `STATUS_COLORS`; `MapLegend` is exported.
- `globals.css`: `.maplibregl-popup-content` (radius 12px, padding 12px 14px, shadow), close button sizing, the always-visible attribution look (rgba(255,255,255,0.8), 2px 6px, 4px radius, 10px) with margin 0 so it sits in the corner, and a `prefers-reduced-motion` guard that turns the marker pulse off. Leaflet rules stay for MiniMap until 03-10.
- `app/sites/page.tsx` now dynamic-imports `WorldMap` from `@/features/map`; `sites-page.test.tsx` mock path updated; `components/maps/WorldMap.tsx` and its barrel line deleted.
- Tracer gate (auto mode): the sites e2e plus routes and a11y ran green before the unit-test task started.

## Task 2: unit tests, full gate, push

- `map-marker.test.tsx` (19 tests, `react-map-gl/maplibre` and `setup` mocked, real maplibre-gl never imported): label (never "Marker"), longitude/latitude order on the Marker, dot sizes/borders/pulse class, popup content with Country, Region (first comma segment), 4 dp coordinates and "Similarity: 91.0%", `closeOnClick false`, no similarity block when absent, Escape and close-button focus return, other keys ignored, `onClick` called, null without coordinates, long location in full, legend rows/counts/colours/absence, region label, fallback without WebGL2, OSM raster style constants.
- Local gate: unit 31 files / 388 tests; typecheck clean; lint 0 errors (19 warnings, all pre-existing); both fence scripts OK; full e2e project 64 passed (WebGL2 available locally).
- Pushed `d631a29..3133f62` (no workflow_dispatch run was in progress). CI run **37062159576**, https://github.com/TyLuHow/ReefRadar/actions/runs/37062159576:
  - web: success; e2e: success; python: success; citations: success; live-smoke: skipped (manual only).
  - visual: failure, exactly one failing test: `tests/e2e/visual.spec.ts:51 experience-compare @ 390` (32 passed). That is a declared state (from 03-07). The sites states did not fail (the map container is hidden in the suite and the page chrome is unchanged), and no undeclared state failed, so there is no regression. Baselines were not regenerated (03-15 does that).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Legend could cover the attribution text**
- **Found during:** Task 1 (the e2e hit-test written for the OSM prohibition)
- **Issue:** MapLibre's default bottom-right control margin (10px) lifts the attribution to about 10-28px from the bottom, so the legend at bottom 16px would sit on top of the licence text. Leaflet's attribution was flush to the corner, which is why today's layout did not clash.
- **Fix:** attribution margin set to 0 (flush, as today) in `globals.css`; the e2e asserts via `elementFromPoint` that the attribution link is the topmost element. The legend keeps its 16px position per UI-SPEC.
- **Files modified:** `dashboard-next/src/app/globals.css`, `dashboard-next/tests/e2e/maps.spec.ts`
- **Commit:** `26dfb46`

**2. [Rule 1 - Bug, test only] e2e heading locator matched two elements**
- **Issue:** the site card in the page list has the same `h3` text as the popup, so a page-wide heading locator violated strict mode.
- **Fix:** scoped the locator to the "Map of reef recording sites" region.
- **Commit:** `26dfb46`

### Plan interpretation notes

- **Enter and Space in unit tests:** `@testing-library/user-event` is not a dependency (and no package was added), and jsdom does not turn Enter/Space into the click a browser dispatches for a native button. The unit test therefore asserts activation through the button click; the real Enter and Escape key presses are exercised in `maps.spec.ts`. Space is the same native-button path as Enter.
- **Rotation off:** `dragRotate={false}` was added because Leaflet had no rotation; not in the plan text, no visible change versus today.
- **Extra export:** `MapLegend` and `siteMarkerLabel` are exported from the barrel for tests and 03-10; no behaviour change.

**Total deviations:** 2 auto-fixed (1 Rule 2, 1 test-only Rule 1). **Impact:** none on the delivered behaviour beyond protecting the attribution.

## Issues Encountered

None blocking. `.next` was cleared before the first typecheck as the plan instructs. A Windows git notice about LF/CRLF appears on add; git config was not changed.

## Known Stubs

None.

## Open assumptions carried forward (flagged in the plan, unchanged)

- **Clustering deferred to Phase 6:** 54 sites, many in South Sulawesi, overlap at low zoom exactly as with Leaflet today (UI-SPEC overflow row, unresolved).
- **Legend has no Unknown row** although Bora-Bora sites are unknown; recorded for the Phase 4/6 data-driven legend, not fixed here.
- **Manual review (03-15):** the visual suite hides `.maplibregl-map`, so the light OSM map's pixels are verified here only through queries, unit tests and real-browser interaction; the owner reviews the unhidden capture with the regenerated baselines.

## Threat Flags

None. T-03-09-01 closed: attribution always visible as text, asserted by e2e (including not covered), standard tile URL only, no prefetch, tile requests stubbed in e2e, Referrer-Policy untouched. T-03-09-02 closed: site strings are rendered as React text only, the attribution HTML is a constant in `style.ts`. T-03-09-03 closed: Escape and close-button focus return, unit and e2e tested.

## Next Phase Readiness

PLAT-02 is NOT marked complete: MiniMap and the Leaflet SiteMarker are still on Leaflet (03-10), and Leaflet/react-leaflet removal and the visual.spec hide-rule update land there. `style.ts` already exports `MINI_MAP_STYLE` and `MINI_MAP_ATTRIBUTION`, and `SiteMarker` is reusable by the MiniMap. Visual-red rule for 03-10: web, e2e, python and citations stay green; visual may fail only on experience-compare, map and sites.

## Self-Check: PASSED

- Created files present: features/map/{style.ts,SiteMarker.tsx,WorldMap.tsx}, tests/unit/map-marker.test.tsx
- Deleted file absent: components/maps/WorldMap.tsx
- Commits `26dfb46` and `3133f62` found in git log; CI run 37062159576 reviewed
