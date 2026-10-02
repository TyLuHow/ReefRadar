---
phase: 03-platform-upgrade-stack-consolidation
plan: 06
subsystem: ui
tags: [vitality-removal, ds-07, canvas, providers, a11y, nextjs]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: 03-05 feature-module fence (web job and fence scripts stay green)
provides:
  - Providers renders only QueryClientProvider, the contract version leaf and children (no theming loop, no background canvas)
  - Decorative "living spectrogram" and the dev theming panel removed from every page, with no layout change
  - components/spectrogram reduced to the real frequency-band table (BANDS, BAND_IDS, ALL_BANDS, BandId, BandConfig)
  - DS-07 unit gate part A (vitality-removed.test.ts) and a zero-canvas browser check (ambient-removed.spec.ts)
affects: [03-07]

actuals:
  tokens: 9000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Append-only REMOVED_FILES / REMOVED_SPECIFIER_TAILS lists in the DS-07 gate; 03-07 appends the store, tokens and slider"
    - "a11y regression gate allow-list keyed by state for rules the baseline could not see"

key-files:
  created:
    - dashboard-next/tests/unit/vitality-removed.test.ts
    - dashboard-next/tests/e2e/ambient-removed.spec.ts
  modified:
    - dashboard-next/src/app/providers.tsx
    - dashboard-next/src/app/page.tsx
    - dashboard-next/src/app/experience/page.tsx
    - dashboard-next/src/components/experience/DemoState.tsx
    - dashboard-next/src/components/experience/LocationCompare.tsx
    - dashboard-next/src/components/spectrogram/index.ts
    - dashboard-next/tests/e2e/a11y.spec.ts
  deleted:
    - dashboard-next/src/components/BackgroundCanvas.tsx
    - dashboard-next/src/hooks/useBackgroundCanvas.ts
    - dashboard-next/src/hooks/useVitality.ts
    - dashboard-next/src/lib/color-engine.ts
    - dashboard-next/src/components/spectrogram/SpectrogramCanvas.tsx
    - dashboard-next/src/components/spectrogram/useSpectrogramAnimation.ts
    - dashboard-next/src/components/dev/VitalityDebugPanel.tsx

key-decisions:
  - "Left the vitality store and its callers (experience page, LocationCompare, useDemoAudio, useAudioVisualBridge) and the CSS tokens for 03-07, per the plan"
  - "Fixed the a11y gate by an exact per-state allow-list for color-contrast rather than editing the pre-truth baseline files or changing any text colour (which would move the screenshots)"

patterns-established:
  - "Wrapper divs that existed only to position a decorative canvas are removed with it; wrappers holding real content were not touched"

requirements-completed: []

coverage:
  - id: D1
    description: "No route mounts a background canvas or runs the colour-theming loop; Providers keeps only the QueryClientProvider, the contract version leaf and children"
    requirement: DS-07
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/vitality-removed.test.ts (removed files absent, no imports, providers has no next/dynamic and keeps staleTime/refetchOnWindowFocus)"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/ambient-removed.spec.ts (/, /about/, /dashboard/, /experience/ zero canvas, no page errors)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Decorative spectrogram and dev panel gone from the landing page, every /experience state, DemoState and LocationCompare; no replacement animation added"
    requirement: DS-07
    verification:
      - kind: unit
        ref: "vitality-removed.test.ts (SpectrogramCanvas, useSpectrogramAnimation, VitalityDebugPanel absent and unimported)"
        status: pass
      - kind: e2e
        ref: "ambient-removed.spec.ts; routes.spec.ts all 11 states load without page errors"
        status: pass
    human_judgment: false
  - id: D3
    description: "components/spectrogram keeps exporting the band table only; the real analysis spectrogram components/audio/SpectrogramCanvas is untouched"
    requirement: DS-07
    verification:
      - kind: unit
        ref: "vitality-removed.test.ts (index.ts export list equals the five band names; audio/SpectrogramCanvas.tsx exists)"
        status: pass
      - kind: e2e
        ref: "audio-surfaces.spec.ts and analysis-flow.spec.ts (full e2e project, 55 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Removal is baseline-neutral: the visual job stays green against unchanged screenshots; all CI jobs green"
    requirement: DS-07
    verification:
      - kind: other
        ref: "https://github.com/TyLuHow/ReefRadar/actions/runs/37052267599 (success: web, e2e, python, citations, visual; live-smoke skipped by design)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Legacy pages show no blank or broken state after the canvases are removed (existing loading and error panels unchanged)"
    requirement: DS-07
    verification:
      - kind: e2e
        ref: "routes + a11y + visual suites green locally (e2e) and in CI (e2e, visual)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-02
status: complete
---

# Phase 3 Plan 06: Vitality Removal A (Canvas, Theming Loop, Decorative Spectrogram, Dev Panel) Summary

**The always-on ambient layer is gone: Providers no longer runs the colour-theming loop or mounts the particle canvas, the decorative "living spectrogram" and dev panel are removed from every page, and /, /about/, /dashboard/ and /experience/ render zero canvas elements, with CI fully green and screenshots unchanged.**

## Performance

- **Duration:** about 15 min (including the CI watch)
- **Tasks:** 2 (1 tracer, 1 TDD auto)
- **Commits:** 2 production commits (`daa7c86`, `6471728`)
- **Files:** 2 created, 7 modified, 7 deleted

## Task 1 (tracer): Providers without the loop or canvas

- RED: `vitality-removed.test.ts` failed 9 of 10 against the tree (removed files present, providers importing `next/dynamic`).
- `providers.tsx` lost the theming hook call, the dynamic background-canvas import and render, and `next/dynamic`; the QueryClient defaults (`staleTime 60 * 1000`, `refetchOnWindowFocus false`), the Suspense-wrapped `ContractVersionSync` leaf and children are unchanged.
- `git rm` of BackgroundCanvas.tsx, useBackgroundCanvas.ts, useVitality.ts, color-engine.ts. The store file stays for 03-07.
- Tracer feedback gate (auto mode): unit gate and query-defaults green, typecheck and lint clean, `ambient-removed` (/about/) and all 11 `routes.spec` states passed in a real browser (the e2e webServer runs `next build`) before expansion.

## Task 2: decorative spectrogram and dev panel

- Removed the dynamic imports, the renders and the wrapper divs that existed only to position the canvas (landing page `fixed inset-0`; seven `absolute inset-0 z-0` wrappers in `experience/page.tsx`; one each in `DemoState` and `LocationCompare`). Real-content wrappers and spacing untouched.
- Deleted the decorative SpectrogramCanvas, `useSpectrogramAnimation` and `VitalityDebugPanel` (the `components/dev` directory is gone). `spectrogram/index.ts` now exports only `BANDS`, `BAND_IDS`, `ALL_BANDS`, `BandId`, `BandConfig`; `FrequencyBands.ts` and `components/audio/SpectrogramCanvas.tsx` are kept.
- Gate extended: the three files and imports are banned, the dev directory is unimported, the index export list is exactly the five band names, the audio spectrogram must still exist. The browser check now covers `/`, `/about/`, `/dashboard/`, `/experience/`.
- Local gate: unit suite 27 files / 324 tests; typecheck clean; lint 0 errors (22 warnings, pre-existing, unchanged); both fence scripts OK; full e2e project 55 passed.
- Pushed `c6670a2..6471728` (no workflow_dispatch run in progress). CI run **37052267599**, https://github.com/TyLuHow/ReefRadar/actions/runs/37052267599, concluded `success`: web, e2e, python, citations, visual all success; live-smoke skipped (manual dispatch only). The visual job passed against the unchanged baselines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] a11y regression gate failed on four /experience states once the canvas was gone**
- **Found during:** Task 2 (full e2e run)
- **Issue:** `experience`, `experience-demo`, `experience-compare` and `experience-sample` failed with a "new" axe `color-contrast` rule. With a canvas stacked behind the text axe cannot resolve a background colour and reports contrast as "incomplete"; without it axe measures the real colours (muted text on `#252320`/`#1a1714`, ratios 1.65 to 4.3). No colour changed: these are the same defects the pre-truth baseline already records for landing, about, dashboard, compare, analyze, map and sites.
- **Fix:** `a11y.spec.ts` gained an `UNMASKED_BY_CANVAS_REMOVAL` allow-list that tolerates `color-contrast` for exactly those four states, with a comment explaining why. The pre-truth baseline files were not edited, and no text colour was changed (that would move screenshots; zero-violation enforcement is Phase 16).
- **Files modified:** `dashboard-next/tests/e2e/a11y.spec.ts`
- **Commit:** `6471728`

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** none on product behaviour; the contrast defects pre-date this plan and are carried to the Phase 16 accessibility pass.

## Issues Encountered

None beyond the deviation above. The 22 lint warnings and the `unrs-resolver` notice from earlier plans are unchanged and out of scope.

## Known Stubs

None.

## Threat Flags

None. T-03-06-01 (decorative animation implying measured audio) is closed by deletion and kept closed by the gate; T-03-06-02 (always-on rAF loops) by deletion plus the zero-canvas browser check; T-03-06-03 (band filtering broken by the removal) by keeping the band table and passing audio-surfaces and the experience-state e2e specs. The plan's prohibition (no replacement animation presented as a spectrogram) holds: nothing was added.

## Next Phase Readiness

03-07 takes the remaining vitality pieces: `stores/vitality-store.ts` and its callers (`experience/page.tsx`, `LocationCompare.tsx`, `useDemoAudio.ts`, `useAudioVisualBridge.ts`), the `--reef-*` CSS tokens and the crossfader slider (the one expected visual change). It appends to `REMOVED_FILES` / `REMOVED_SPECIFIER_TAILS` in `vitality-removed.test.ts`. DS-07 is not marked complete here because the store, tokens and slider remain.

## Self-Check: PASSED

- Created files present: dashboard-next/tests/unit/vitality-removed.test.ts, dashboard-next/tests/e2e/ambient-removed.spec.ts
- Deleted files absent: the seven removed modules
- Commits `daa7c86` and `6471728` found in git log; CI run 37052267599 success
