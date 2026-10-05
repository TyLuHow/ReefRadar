---
phase: 04-design-system-instrument-primitives
plan: 20
subsystem: ui
tags: [design-tokens, maplibre, observable-plot, token-bridge, e2e, setPaintProperty]
status: complete

requires:
  - phase: 04-design-system-instrument-primitives
    provides: readTokens and useTokens token bridge (04-02), fixtures route and ?tok= allowlist (04-06, 04-07), StripPlot and the contract sites (04-19)
provides:
  - "buildTokenMapStyle, statusColorExpression, probeGeoJson, PROBE_SOURCE_ID, PROBE_LAYER_ID, PROBE_BACKGROUND_ID (features/map/token-style.ts)"
  - "TokenProbeMap: a tile-free map that follows useTokens through setPaintProperty (features/map/TokenProbeMap.tsx)"
  - "token-probe fixtures section (swatches, map, strip plot from one token family)"
  - "tests/e2e/token-bridge.spec.ts: the proof of success criterion 1 across UI, Plot and map"
affects: [04-21, 04-22, 04-24, phase-6]

actuals:
  tokens: 9500
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "A map is styled once from the first token read; every later token change is setPaintProperty, never setStyle"
    - "Adjust-state-while-rendering (not an effect) freezes the initial style so a re-read can never reload it"
    - "Token proof by computed values: swatch background, Plot mark fill and map paint are each compared with the override inside a poll"

key-files:
  created:
    - dashboard-next/src/features/map/token-style.ts
    - dashboard-next/src/features/map/TokenProbeMap.tsx
    - dashboard-next/src/features/fixtures/sections/TokenProbeSection.tsx
    - dashboard-next/tests/unit/token-style.test.ts
    - dashboard-next/tests/e2e/token-bridge.spec.ts
  modified:
    - dashboard-next/src/features/map/index.ts
    - dashboard-next/src/features/fixtures/registry.tsx
    - dashboard-next/src/features/fixtures/slugs.ts

key-decisions:
  - "The probe map is not interactive (no pan, zoom or focusable canvas): the swatches and the strip plot carry the same information, so there is no keyboard trap or unlabelled control to audit"
  - "probeGeoJson is a small pure helper added beside the builders so the data path (longitude first, real coordinates) is unit tested without WebGL"
  - "Style-reset check uses a style.load listener (fires for setStyle, not for setPaintProperty) rather than a marker on the map instance, which setStyle would not remove"
  - "DS-01 is left pending: this plan proves the wiring (UI, map style and chart scales from one source) but DS-01 spans plans 04-01 through 04-24 and the plan does not say it completes the requirement"

patterns-established:
  - "WebGL2 specs follow maps.spec.ts: skip locally with the reason recorded, fail in CI"

requirements-completed: []

duration: 35 min
completed: 2026-10-05
---

# Phase 4 Plan 20: Token wiring probe (UI, Plot and MapLibre from one token source) Summary

**A tile-free MapLibre probe built from the resolved tokens, repainted with `setPaintProperty` on every token change, plus a three-way e2e proof that one `?tok=` change reaches a CSS swatch, an Observable Plot mark and the map's `circle-color` expression.**

## Accomplishments

- `statusColorExpression(tokens)` is exactly the `match` expression from the plan (four statuses, `hab-unknown` fallback); `buildTokenMapStyle` returns a version 8 style with no glyphs, no sprite, no tile source and no URL, a `probe-background` layer in `ground`, and a `probe-sites-circles` layer coloured by status with the `mark-outline` stroke.
- `TokenProbeMap` reads tokens through `useTokens`, builds its style once, and on every re-read calls `setPaintProperty` for `circle-color`, `circle-stroke-color` and `background-color`. `window.__tokenProbeMap` exists only under `NEXT_PUBLIC_E2E_HOOKS=1`. The wrapper carries `data-visual="skip"` and the plan's accessible label.
- `/dev/fixtures/token-probe`: five swatches (`data-probe-swatch`), the map over all contract sites (their real latitude and longitude), and a strip plot over the acoustic-reference sites.
- `token-bridge.spec.ts` (5 tests): the sentinel `#B00020` reaches the healthy swatch (`rgb(176, 0, 32)`), the first healthy Plot mark's computed fill and the map's `circle-color` (and only once, so no other status changed); a Nocturne switch repaints the background and circle paint to the Nocturne tokens with zero `style.load` events; a live inline override of `--dir-hab-degraded` is followed by all three; axe passes; the map makes no request to any external host.
- Legacy `STATUS_COLORS`, `ReefMap`, `layers.ts` and `probabilityBars` are untouched (`git diff` over those paths is empty).

## Task Commits

1. Task 1 RED: `a6575aa` test, GREEN: `3d922c8` token style builders and TokenProbeMap
2. Task 2: `2f766b3` token probe section, registry and slug, token-bridge e2e spec

## Verification

- `npm run lint` 0 errors, `npm run typecheck` clean, `npm test` 75 files / 1350 tests pass; `token-style.test.ts` run 5x without flake.
- `check-feature-fence.mjs`, `check-contract-fence.mjs` exit 0; flag-less `npm run build` exit 0; `check-dev-fixtures-excluded.mjs` OK.
- e2e on a private port (3202): `token-bridge.spec.ts --repeat-each=5` 25 passed; whole `fixtures-route.spec.ts --repeat-each=3` 294 passed.
- **WebGL2: available locally** (headless Chromium on this Windows machine reported "WebGL2 available" in every run), so the map half of the proof ran here, not only in CI. Nothing was weakened or skipped. In CI a missing WebGL2 fails the spec rather than skipping, as in `maps.spec.ts`.

## Deviations from Plan

None in behaviour. Small additions: the pure `probeGeoJson` helper (and its test), an axe test and a no-external-network test in the e2e spec, and a `style.load` counter to assert "no setStyle flash" directly.

## Known Stubs

None. The map, swatches and plot show real contract sites and the live resolved tokens.

## Threat Flags

None beyond the plan's threat model. T-04-20-01 mitigated: the hook is set only under `NEXT_PUBLIC_E2E_HOOKS === '1'` and removed on unmount. T-04-20-02 mitigated: `?tok=` is hex-only through the fixtures query allowlist and `readTokens` re-validates six-digit hex before any value reaches `setPaintProperty`.

## Self-Check: PASSED

token-style.ts, TokenProbeMap.tsx, TokenProbeSection.tsx, token-style.test.ts and token-bridge.spec.ts exist; commits a6575aa, 3d922c8 and 2f766b3 are in the branch history.
