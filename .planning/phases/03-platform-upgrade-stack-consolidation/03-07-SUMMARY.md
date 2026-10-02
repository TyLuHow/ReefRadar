---
phase: 03-platform-upgrade-stack-consolidation
plan: 07
subsystem: ui
tags: [vitality-removal, ds-07, crossfader, css-tokens, tailwind, capability-matrix, q7]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: 03-06 removal of the canvas, theming loop, decorative spectrogram and dev panel; DS-07 gate part A
provides:
  - Static .crossfader-slider (flat track, plain thumb, no glow or animation) on /experience?mode=compare
  - LocationCompare drives audio only (audio.setCrossfade); nothing on the page reacts to crossfade position, a prediction or a sample category
  - Client store, audio-visual bridge and both prediction-driven effects deleted; the eight --reef-* custom properties and Tailwind colours deleted
  - Full DS-07 gate (vitality-removed.test.ts) and a crossfader behaviour test
  - CAPABILITY-MATRIX: CAP-25, 47, 76-80, 83, 84 retired with the Q7 justification; CAP-81/82 carried over as principles
affects: [03-08, 03-15]

actuals:
  tokens: 14000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "DS-07 token gate anchors on the eight --reef-NAME names (not the substring reef-), so LoadingReef's reef-pulse is unaffected"
    - "Static form controls use literal palette values from the UI-SPEC rather than theme variables"

key-files:
  created:
    - dashboard-next/tests/unit/location-compare.test.tsx
  modified:
    - dashboard-next/src/components/experience/LocationCompare.tsx
    - dashboard-next/src/app/globals.css
    - dashboard-next/src/app/experience/page.tsx
    - dashboard-next/src/components/experience/useDemoAudio.ts
    - dashboard-next/src/components/Navbar.tsx
    - dashboard-next/tailwind.config.js
    - dashboard-next/tests/unit/vitality-removed.test.ts
    - dashboard-next/tests/e2e/ambient-removed.spec.ts
    - .planning/audit/CAPABILITY-MATRIX.md
  deleted:
    - dashboard-next/src/stores/vitality-store.ts
    - dashboard-next/src/hooks/useAudioVisualBridge.ts

key-decisions:
  - "Removed the 'moving background is decorative' sentence from LocationCompare's help text: the background no longer exists, so the sentence had become false"
  - "DS-07 not marked complete in REQUIREMENTS.md: the code removal is finished, but the visual job is intentionally red until 03-15 regenerates baselines and the owner signs off"

patterns-established:
  - "Declared-visual-diff window: failing visual tests are checked against the plan's expected set from the CI log after each push"

requirements-completed: []

coverage:
  - id: D1
    description: "The A/B crossfader is a static control; moving it changes only the audio blend (audio.setCrossfade), with no store write"
    requirement: DS-07
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/location-compare.test.tsx (class crossfader-slider, value 0.3 before play, one setCrossfade(0.7) call, no @/stores import)"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/ambient-removed.spec.ts (slider visible, fill works, touch-action none, no page errors)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The store, the bridge and every caller are gone; no src file mentions the removed system; demo band toggles still filter real audio"
    requirement: DS-07
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/vitality-removed.test.ts (files absent, no imports, no mention under src)"
        status: pass
      - kind: e2e
        ref: "audio-surfaces.spec.ts, routes.spec.ts, analysis-flow.spec.ts (full e2e project, 56 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No --reef-NAME custom property or reef-NAME Tailwind colour remains; thumb-pulse keyframes and the gradient track are gone; reef-pulse in LoadingReef untouched"
    requirement: DS-07
    verification:
      - kind: unit
        ref: "vitality-removed.test.ts (token scanner over src, globals.css, tailwind.config.js; slider rule values; LoadingReef keeps reef-pulse)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Capability matrix records the Q7 retirements (9 rows retire, 2 rows carried over) with the arithmetic updated"
    requirement: DS-07
    verification:
      - kind: other
        ref: "grep -cE '^\\| CAP-(25|47|76|77|78|79|80|83|84) .*\\| retire \\|' prints 9; grep -c 'Q7 (Retire' prints 9"
        status: pass
    human_judgment: false
  - id: D5
    description: "Visual window: the only visual failure on the pushed head is a declared state (experience-compare); web, e2e, python, citations green"
    requirement: DS-07
    verification:
      - kind: other
        ref: "https://github.com/TyLuHow/ReefRadar/actions/runs/37053836598 (visual: 1 failed experience-compare @ 390, 32 passed)"
        status: pass
    human_judgment: true

duration: 15min
completed: 2026-10-02
status: complete
---

# Phase 3 Plan 07: Vitality Removal B (Store, Bridge, Tokens, Static Slider, Q7 Retirements) Summary

**The ambient system no longer exists anywhere in the app: the client store and audio-visual bridge are deleted, the eight `--reef-*` tokens and Tailwind colours are gone, and the A/B crossfader is a flat static slider that changes only the audio mix; the Q7 retirements are recorded in the capability matrix.**

## Performance

- **Duration:** about 15 min (including the CI watch)
- **Tasks:** 3 (1 tracer TDD, 1 auto TDD, 1 auto)
- **Commits:** 3 (`415d9df`, `7bf65af`, `63e17b0`) plus this summary commit
- **Files:** 1 created, 9 modified, 2 deleted

## Task 1 (tracer): static crossfader that drives audio only

- RED: `location-compare.test.tsx` failed 2 of 3 (class name, store import still present).
- `LocationCompare.tsx`: removed the store import, the label-to-scalar map and helper, the track-change and unmount effects, and the store call inside `onChange`, which now only calls `audio.setCrossfade`. The slider class is `crossfader-slider`. End-label colours and opacity are unchanged (they encode which recording is louder).
- `globals.css`: the four slider rules and the keyframes were replaced by `.crossfader-slider` (track 6px, radius 3px, `#6b6560`; thumb 20px circle `#cd853f` with `2px solid rgba(229,225,219,0.2)`, `margin-top: -7px`; input height 20px, `touch-action: none`; `-webkit-` and `-moz-` pairs; no box-shadow, no animation).
- Tracer gate (auto mode): unit test 3/3, typecheck clean, `ambient-removed` + `audio-surfaces` e2e 12/12 (real browser against a fresh build) before expansion.

## Task 2: store, bridge, tokens, Tailwind colours

- RED: the extended gate failed 5 of 22.
- `experience/page.tsx`: deleted the two store-writing effects (classification label, sample category), the label-to-value map and the import. `useDemoAudio.ts`: deleted the bridge import and call, the store import and the 3-to-4 band sync effect; the audio graph, analyser, `activeBands` and `toggleBand` are untouched. `Navbar.tsx` header comment reworded to the fixed-palette rule. `globals.css` lost the token block; `tailwind.config.js` lost the eight colour entries. `git rm` of `stores/vitality-store.ts` and `hooks/useAudioVisualBridge.ts`.
- Gate additions: removed files and import tails, no mention of the removed system (case-insensitive) under src and in globals.css, token scanner over src/globals.css/tailwind.config.js (with a self-test that `reef-pulse` is ignored), no thumb-pulse keyframes, no gradient in the slider rules, static slider values and `touch-action: none`, `LoadingReef` keeps `reef-pulse`, `components/audio/SpectrogramCanvas.tsx` reads no store.
- Local gate: unit 28 files / 336 tests; typecheck clean; lint 0 errors (20 warnings, pre-existing); contract and feature fence scripts OK; `next build` OK; full e2e project 56 passed.

## Task 3: Q7 retirements and CI

- CAP-25, 47, 76, 77, 78, 79, 80, 83, 84 now read `retire` with the Q7 justification prefixed to their existing notes; CAP-81 and CAP-82 carry over as principles for `components/audio/SpectrogramCanvas`. The checklist count is now 73 (82 minus 9) with the retired ids listed.
- Pushed `d217b54..63e17b0` (no workflow_dispatch run was in progress). CI run **37053836598**, https://github.com/TyLuHow/ReefRadar/actions/runs/37053836598:
  - web: success; e2e: success; python: success; citations: success; live-smoke: skipped (manual only).
  - visual: failure, exactly one failing test: `tests/e2e/visual.spec.ts:51 experience-compare @ 390` (32 passed). This is a declared state. The other two declared states (experience-compare @ 1440 and @ 1024) did NOT fail: the slider change stayed inside the screenshot comparison tolerance at those widths. No other state failed, so there is no regression. Baselines were not regenerated (03-15 does that once).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale help text claimed a decorative moving background**
- **Found during:** Task 1
- **Issue:** LocationCompare's help paragraph still said "The moving background is decorative, not a spectrogram or a visualisation of these bands." The background was removed in 03-06, so the sentence was false.
- **Fix:** Removed that sentence; the rest of the paragraph is unchanged. It only affects the experience-compare screenshots, which are in the declared expected set.
- **Files modified:** `dashboard-next/src/components/experience/LocationCompare.tsx`
- **Commit:** `415d9df`

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** none on behaviour.

## Issues Encountered

None. The unrelated 20 lint warnings are unchanged and out of scope. A Windows git notice about the commit identity (hostname-derived) appeared on commits; git config was not changed, per instructions.

## Known Stubs

None.

## Threat Flags

None. T-03-07-01 (ambience implying a diagnosis) is closed by deleting the store and both prediction-driven effects, kept closed by the DS-07 gate. T-03-07-02 (band filtering broken) closed by keeping `activeBands`/`toggleBand` and passing audio-surfaces and the experience-state e2e. T-03-07-03 closed by checking the CI log against the declared set. T-03-07-04 closed by the gate asserting `touch-action: none` and the e2e computed-style check. Both plan prohibitions hold: nothing is driven from a prediction, label or sample category, and the slider has no health gradient.

## Next Phase Readiness

DS-07 code removal is complete, but the requirement is NOT marked complete here: the visual job is deliberately red (experience-compare @ 390) until 03-15 regenerates baselines once and the owner signs off the changed states (03-14 and 03-15 also list DS-07). The remaining visual-red window rule for 03-08 onward: web, e2e, python and citations must stay green, and any visual failure beyond the declared experience-compare states is a regression.

## Self-Check: PASSED

- Created/modified files present: dashboard-next/tests/unit/location-compare.test.tsx and the files listed above
- Deleted files absent: stores/vitality-store.ts, hooks/useAudioVisualBridge.ts
- Commits `415d9df`, `7bf65af`, `63e17b0` found in git log; CI run 37053836598 reviewed
