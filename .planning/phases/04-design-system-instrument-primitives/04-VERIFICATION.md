---
phase: 04-design-system-instrument-primitives
verified: 2026-10-05T12:00:00Z
status: human_needed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
gaps: []
deferred: []
human_verification:
  - test: "Play, pause, step, crossfade and level match by ear on a real device (desktop and tablet)"
    expected: "Audio starts and stops with the Transport; step moves 5 s; the A/B crossfader changes which recording is louder; level match attenuates the louder clip and never boosts; the playhead stays with the sound"
    why_human: "Web Audio output cannot be asserted headlessly. The clock, gain maths and state transitions are unit tested (playhead-clock, audio-engine, compare-math, crossfader, transport); the audible result is not."
  - test: "Playhead frame pacing on a tablet while a spectrogram plays"
    expected: "No visible stutter; the playhead tracks the AudioContext clock"
    why_human: "The loop runs on requestAnimationFrame on the main thread; real-device frame timing is not measurable in CI (the budget is Phase 16)."
  - test: "Safari 16.4 or later (desktop and iPhone/iPad) across Atlas, Nocturne and Poster and the Transport"
    expected: "Tailwind v4 output renders correctly: tokens, @property-free colour use, focus rings, the fixtures route"
    why_human: "CI runs Chromium only."
  - test: "Token probe map by eye in each direction"
    expected: "Map circle colours and background match the swatch table beside the map in Atlas, Nocturne and Poster"
    why_human: "WebGL raster is masked in the screenshots because it is not reproducible. The paint property values are asserted by token-bridge.spec.ts; the picture is not."
  - test: "Darker status palette against the mockup"
    expected: "Owner accepts the final hex values (#914615, #B47F24, #1D77AD, #124068, #85888D)"
    why_human: "The values are gate-verified (3:1, CVD separation) but the owner recorded 'not formally signed off'. The values are darker than the mockup because 3:1 on white forces it."
---

# Phase 4: Design System & Instrument Primitives Verification Report

**Phase Goal:** A light scientific-editorial design system and an accessible, data-shaped instrument component kit exist and can be reviewed in every state before any instrument screen is built.
**Verified:** 2026-10-05
**Status:** human_needed (no code gaps; five device and judgement checks remain with the owner, as recorded in `docs/deploy/PHASE-4-VISUAL-REVIEW.md`)
**Re-verification:** No, initial verification

## Goal Achievement

The goal is achieved in the code. Every success criterion has implementation, wiring and a mechanical gate that I re-ran or confirmed in CI. Nothing in the SUMMARY claims was contradicted. The remaining items need a person on a device and are listed as human verification, not gaps.

### Evidence I produced myself (not SUMMARY narration)

| Check | Result |
|---|---|
| `npx vitest run` (full unit suite, HEAD) | 87 files, 1506 tests passed |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint src tests` | 0 errors, 20 warnings (19 in legacy files, 1 in `features/instrument/useTransport.ts:104`, an unnecessary `useMemo` dependency) |
| `check-feature-fence.mjs`, `check-contract-fence.mjs` | OK (142 and 211 files) |
| Playwright e2e (flagged build): `reduced-motion`, `fixtures-keyboard`, `fixtures-route`, `legacy-isolation`, `fixtures-targets` | 225 passed (4.5 min) |
| CI run 37299160592 on f90a828 | web, citations, python, visual (Docker-pinned), e2e all `success`; live-smoke and review captures skipped by design |
| Commits after f90a828 | Docs only (ROADMAP, STATE, 04-24-SUMMARY, PHASE-4-VISUAL-REVIEW). CI on f3300fa was still running when I checked; no code changed, so f90a828 is the evidence |
| LFS baselines | 184 fixtures baselines tracked in LFS, 33 legacy baselines present, guarded by `fixtures-baselines.test.ts` and `legacy-baselines.test.ts` |

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | One Tailwind v4 CSS-first token source defines typography, spacing, surfaces, rules, radii, elevation and focus, and the same tokens drive UI components, the map style and chart scales | VERIFIED (elevation note below) | `dashboard-next/src/styles/tokens.css` (528 lines): three direction token sets (atlas, nocturne, poster) selected by `data-direction`, `@theme inline` aliases, fluid display type, `--space-block`, `--gutter`, `--rule-w`, `--dir-radius-*`, `--focus-w` plus focus-ring utilities, motion durations. `package.json` has `tailwindcss` and `@tailwindcss/postcss` 4.3.3; `globals.css` is `@import 'tailwindcss' source(none)` plus `@source` lines; no `tailwind.config.js`. UI reads utilities from `@theme inline`; JS consumers read via `readTokens`/`useTokens` (`features/ui/tokens.ts`, hex-only, throws otherwise); the map style is built from tokens in `features/map/token-style.ts`; charts read `var(--dir-*)` through `features/charts/plot-theme.ts`. Proof that one change moves all three: `tests/e2e/token-bridge.spec.ts` sets `--dir-hab-healthy` to `#B00020` and asserts the swatch background, the Plot mark fill and the MapLibre `circle-color` paint all change, that only that status changes, that a direction switch updates map paint with zero `style.load` events, and that a live inline override propagates. CI makes missing WebGL2 a failure, not a skip. Unit gates: `tokens.test.ts` (three identical key sets, hex-only JS tokens, no legacy name collision, durations zeroed), `tokens-bridge.test.ts`, `token-style.test.ts`, `semantic-tokens.test.ts` (no raw hex, font family, px radius or direction branch in `src/features`). |
| 2 | Ordinal status palette (degraded, restored_early, restored_mid, healthy, plus distinct neutral unknown) passes CVD simulation, is always paired with shape or text and never used as accent; spectrograms and waveforms render in dark wells with a documented perceptually uniform scale and dB colourbar | VERIFIED | `tests/unit/status-palette.test.ts`, per direction: fills reach 3:1 on ground and panel; mark outline 3:1 on four grounds; min pairwise CIEDE2000 at least 15 under normal, protanopia, deuteranopia and tritanopia (Machado, severity 1); adjacent tones at least 9 L*; warm precedes cool by hue; unknown is a neutral and at least 15 from every tone; accent at least 10 from every tone in every simulation and never equals a status hex. Shapes in `features/ui/status-shapes.ts` (down triangle, diamond, square, circle, hollow ring) with `StatusMark.tsx`; shape and text label are asserted in `status-mark.test.tsx`. `bg-hab-*` appears only in the single status mapping in `status-shapes.ts`; no `text-hab`, `border-hab`, `ring-hab` or `outline-hab` use anywhere in `src`. Wells: `--dir-well` family in every direction; `features/instrument/dsp/spec.ts` pins `-120 to -50 dB re full scale`, 1024 Hann, hop 256, uncalibrated; `dsp/colormap.ts` builds a 256-step magma LUT (CC0 source documented in the file); `ColourBar.tsx` draws the dB strip from the same LUT with `DB_TICKS`, accessible name and an uncalibrated note; documented on the `spectrogram-scale` fixtures section. Waveform and Spectrogram exist and are used in the Spectrogram section. |
| 3 | React Aria primitives (dialog, sheet, listbox, table, range/dual-range slider, toggle group, tooltip, command palette) are fully keyboard-operable and pass axe checks | VERIFIED | All eight exist in `features/ui/` on `react-aria-components` 1.21.1 (`Dialog`, `Sheet`, `Listbox`, `Table`, `Slider` and `RangeSlider`, `ToggleGroup`, `Tooltip`, `CommandPalette`). `tests/e2e/fixtures-keyboard.spec.ts` covers each: focus trap, hidden background, Escape and focus return for Dialog, AlertDialog and Sheet (right and bottom); Listbox arrows, type-ahead, Enter and Space multi-select; Table and DataTable arrows, Enter-to-sort, Space-select; Slider arrows, PageUp, Home, End; RangeSlider thumbs cannot cross and speak Hz; ToggleGroup arrows and Space; Tooltip on focus with Escape; CommandPalette Ctrl+K, filter, live-region count, Enter, Escape. `tests/e2e/fixtures-a11y.spec.ts` runs axe (wcag2a, wcag2aa, wcag22aa, serious and critical fail) on every section page in all three directions plus live open Dialog, Sheet and CommandPalette, with a self-test that a low-contrast token override is caught. I re-ran `fixtures-keyboard` and the per-direction axe tests in `fixtures-route`: all passed. |
| 4 | A dev-only fixtures route renders every instrument primitive in every state from contract fixtures, under screenshot visual regression and visual review | VERIFIED | `src/app/dev/fixtures/[section]/page.tsx` (flag-gated dynamic import, `dynamicParams = false`); `registry.tsx` registers 32 sections covering Transport, Spectrogram (four variants), WindowStrip, BandToggle, CompareRow and CompareDeck, ProvenanceChip and Why panel, StripPlot (strip, paired, scatter), ProbabilityBar (abstain included), DataTable, Legend, StatusBand, Empty/Error/Loading (`states`), plus the DS-04 primitives and four compositions. `state-manifest.ts` lists the states from the UI-SPEC tables, and `fixtures-state-manifest.spec.ts` asserts a rendered cell for each, with an independent list for the empty/loading/error states of 13 primitives. Dev-only: build flag is always defined in `next.config.js`, `check-dev-fixtures-excluded.mjs` runs in the CI `web` job after the flag-less build (marker scan plus two 404 checks), `X-Robots-Tag` on `/dev/*`, no nav link. Visual regression: `fixtures.spec.ts` in the `fixtures-shots` project, 184 baselines (Atlas at 4 widths for every section, Nocturne and Poster representative set at 2 widths), fail-closed in CI when the directory is empty, set guarded by `fixtures-baselines.test.ts`; CI visual job 217/217. Visual review: `docs/deploy/PHASE-4-VISUAL-REVIEW.md` records the owner decision `keep-atlas` (2026-10-05). Data is real: contract fixtures and a captured live `ind_H1` analysis (`fixtures/data/analysis.ts`); `Legend` and `StatusBand` counts come from `countBy` over the data shown. |
| 5 | Motion is limited to continuity (selection, layout morph, playhead, view transitions) and with reduced motion enabled no primitive animates | VERIFIED | Durations are tokens that compute to `0ms` under `prefers-reduced-motion` and `[data-reduced-motion='true']`; view-transition pseudo-elements get `animation-duration: 0s !important` under both. Every component transition uses a `--duration-*` token (Button, ToggleGroup, Listbox, Table, Legend, StatusBand, Slider, Dialog, Sheet, Tooltip, ProvenanceChip, CommandPalette), matching the UI-SPEC Motion table (selection, overlay in/out, morph, view, playhead, crossfade). No spinner, shimmer or ambient animation in `features/ui` or `features/instrument` (`LoadingState` and `Skeleton` state this). `playhead-clock.ts`: rAF loop only while started and visible, 1 Hz `setInterval` step with no rAF under reduced motion, stops on `visibilitychange`. `tests/e2e/reduced-motion.spec.ts` (re-run, passed): for every fixtures section under the OS preference `document.getAnimations().length === 0` and every element in the surface computes a `0s` transition-duration; the toggle path is checked on four sections; a probe self-test shows non-zero transitions with motion allowed; no rAF call while idle; rAF counted while playing with motion allowed and zero while playing with reduced motion. Unit: `reduced-motion-hook.test.ts`, `playhead-clock.test.ts`, `playhead.test.ts`. |

**Score:** 5/5 truths verified, 0 present but behavior-unverified.

The state-transition truths (playhead clock start, stop, step and visibility pause; reduced-motion gating; crossfade and level-match maths) are exercised by named passing tests, so none is left at presence-only. The audible output on a device is the only part nobody can assert in CI, and it is carried as a human item below.

### Requirements Coverage

Every ID in the phase assignment appears in at least one PLAN `requirements:` frontmatter (the 24 plans declare DS-01 through DS-06 and DS-08; DS-07 is Phase 3, already `[x]`). REQUIREMENTS.md maps no further Phase 4 ID, so there are no orphans.

| Requirement | Source plans (examples) | Status | Evidence |
|---|---|---|---|
| DS-01 single token source (Tailwind v4 CSS-first) consumed by UI, map style and chart scales | 04-01, 04-02, 04-19, 04-20 | SATISFIED | Truth 1. `tokens.css`, token bridge, `token-bridge.spec.ts`, `tokens.test.ts`, `semantic-tokens.test.ts`, `tailwind-v4-sources.test.ts`. 33 legacy baselines unchanged. |
| DS-02 CVD-validated ordinal palette, distinct unknown, never UI accent, shape or text always | 04-04, 04-17, 04-18 | SATISFIED | Truth 2. `status-palette.test.ts`, `token-contrast.test.ts`, `status-shapes.ts`, `StatusMark.tsx`. |
| DS-03 dark wells, documented perceptually uniform scale, dB colourbar | 04-03, 04-13 | SATISFIED | Truth 2. `dsp/spec.ts`, `dsp/colormap.ts`, `ColourBar.tsx`, `Spectrogram.tsx`, `Waveform.tsx`, `stft.test.ts`, `colormap.test.ts`, `levels.test.ts`, `spectrogram.test.tsx`, `fixtures-spectrogram.spec.ts`. |
| DS-04 React Aria primitives, accessible | 04-05, 04-10, 04-11, 04-12 | SATISFIED | Truth 3. `fixtures-keyboard.spec.ts`, `fixtures-a11y.spec.ts`, per-primitive unit tests (`dialog`, `sheet`, `listbox`, `slider`, `toggle-group`, `tooltip`, `command-palette`, `data-table`). |
| DS-05 instrument components as reusable primitives | 04-08, 04-12, 04-13, 04-15 to 04-19 | SATISFIED | Truth 4. All named components exist under `features/instrument` and `features/charts`; none is a stub (ProbabilityBar abstain state and model-card limits line, Legend `countBy`, WhyPanel, StripPlot variants, CompareDeck shared scale). |
| DS-06 motion limited to continuity, reduced-motion respected | 04-14, 04-21, 04-22 | SATISFIED | Truth 5. `reduced-motion.spec.ts` and unit tests. |
| DS-08 dev-only fixtures route, every primitive in every state | 04-06, 04-07, 04-09, 04-22 to 04-24 | SATISFIED | Truth 4. Exclusion script, state manifest spec, 184 baselines, review record. |

REQUIREMENTS.md still shows DS-01 to DS-06 and DS-08 as `[ ]` and `Pending`. On this evidence they can all be marked complete (DS-07 already is). The traceability table rows 258 to 265 need the same update.

### Required Artifacts and Key Links

| Artifact | Status | Details |
|---|---|---|
| `src/styles/tokens.css` | VERIFIED | Substantive, wired through `globals.css`, three direction sets with identical key sets |
| `src/features/ui/*` (14 primitives plus `tokens.ts`, `motion.ts`, `status-shapes.ts`, `count-by.ts`) | VERIFIED | Wired through `features/ui/index.ts` and consumed by instrument primitives and fixtures |
| `src/features/instrument/*` (Transport, Spectrogram, WindowStrip, BandToggle, CompareRow, CompareDeck, ClipCard, ProvenanceChip, WhyPanel, ProbabilityBar, Legend, StatusBand, ColourBar, Waveform, DSP, audio engine, playhead clock) | VERIFIED | Imported by fixtures sections; no `@/components` import (feature fence passes) |
| `src/features/charts/StripPlot.tsx`, `plot-theme.ts` | VERIFIED | PlotFigure's first consumer; token colours by `var()` |
| `src/features/map/token-style.ts`, `TokenProbeMap.tsx` | VERIFIED | Pure builders plus a tile-free probe; live maps deliberately untouched (see Notes) |
| `src/features/fixtures/*`, `src/app/dev/*` | VERIFIED | Flag-gated, excluded from production by script |
| Key link: token to UI, Plot and map | WIRED | `token-bridge.spec.ts` |
| Key link: fixtures route to production build exclusion | WIRED | `check-dev-fixtures-excluded.mjs` in CI `web` job |
| Key link: legacy isolation (new tokens scoped to `[data-surface='instrument']`) | WIRED | `legacy-isolation.spec.ts` (re-run, passed), 33 legacy baselines untouched |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|---|---|---|---|---|
| Legend, StatusBand counts | `countBy(items, statusOf)` | Contract sites (`contracts/bucket/v1`) via the contract client or fixtures | Yes, 54 sites (15, 6, 8, 16, 9) | FLOWING |
| Spectrogram wells | STFT of real WAV excerpts | `public` audio plus `audio-manifest.json`, parsed by the DSP core | Yes | FLOWING |
| ProbabilityBar | Probabilities and model card | Captured live `ind_H1` analysis (`fixtures/data/analysis.ts`), model card from the contract | Yes; the abstain state is forced by the fixture and labelled as forced | FLOWING |
| StripPlot | Site projection | `useProjection` on the contract projection; scatter prints the computed caveat | Yes | FLOWING |

### Anti-Patterns Found

None blocking. No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK` or "coming soon" in `src/features`, `src/styles`, new tests or scripts. The `return null` hits are guard clauses, not stubs.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/features/instrument/useTransport.ts` | 104 | `react-hooks/exhaustive-deps`: unnecessary `stableClips` dependency | Info | Lint warning only; CI lint passes |
| `src/features/ui` (tokens) | n/a | No elevation or shadow token exists | Info | See note 1 |

### Notes on items the owner left open

1. **Elevation (SC1 wording).** SC1 lists elevation among the tokens. There is no shadow or elevation variable; UI-SPEC deliberately chose "no elevation" for every direction (overlays use the `--dir-scrim` colour token and a heavy top rule instead, and `Dialog` and `Why panel` say "no shadow"). The token source therefore defines elevation as flat by design rather than as a scale. I treat this as satisfied by an explicit design decision, not a gap. If a strict reading is wanted, the cheapest record is an override:
   ```yaml
   overrides:
     - must_have: "One Tailwind v4 CSS-first token source defines ... elevation"
       reason: "UI-SPEC chooses flat surfaces with no elevation in all three directions; hierarchy comes from rules, panel fills and the scrim token"
       accepted_by: "owner"
       accepted_at: "<ISO timestamp>"
   ```
   Nothing here blocks Phase 6, which can add a shadow token if a screen needs one.
2. **Touch-target exemptions (WindowStrip cells 39 px on a 390 px phone and 13 px dense; StatusBand segments sized by count; inline footer links).** Not a roadmap success criterion. The 44 px rule is a CONTEXT constraint, and the gate (`fixtures-targets.spec.ts`) enforces 44 px height everywhere, 44 x 44 for all other controls, a 24 px width floor on non-dense WindowStrip cells (the WCAG 2.5.8 AA minimum), and the 2.5.8 inline exception for in-sentence links. One thing to carry to Phase 6: StatusBand segments have no width floor (the spec allows down to 4 px), so a very small segment could fall under the 24 px AA size unless spacing applies. That is a Phase 6 design decision on how segments are selected, not a Phase 4 blocker. WARNING, deferred by the owner.
3. **Composition visual concerns (scatter label overlap in the US, French Polynesia and Mexico cluster; Poster headline five lines at phone width; empty Listen grid cell; nav wrapping at 390 px).** The four compositions are review fixtures that prove the primitives can reach the expressive register; no success criterion depends on their layout. The scatter overlap is a StripPlot label-placement refinement for Phase 6 where real screens decide label strategy. Not a blocker.
4. **Accent values.** Nocturne `#96a9ff` and Poster `#bd0047` pass the mechanical 10 CIEDE2000 separation gate. The Nocturne margin is 0.55 above the floor by the owner's own record; the owner chose "no change requested", so the choice is settled, not open. Not a blocker.
5. **Live maps and legacy pages are not restyled.** SC1 says tokens drive "the map style". Phase 4 proves the wiring on a tile-free probe and unit-tested pure builders; `ReefMap`, `WorldMap` and `MiniMap` still use legacy colours. CONTEXT scopes this explicitly ("Restyling the live maps (Phase 6). Only the token-to-map-style wiring is proven here"), so it satisfies the criterion as written.
6. **Band selection filters no audio.** The BandToggle fixture section states this on the page ("In this fixture the selection does not filter any audio") and the bands are labelled fixture bands; band isolation is Phase 7. This honours the integrity rule and is not a gap.
7. **React Aria version.** 1.21.1 is pinned exactly under the owner's standing package approval after the age check flagged recency; recorded in the 04-05 summary.

### Behavioral Spot-Checks and Probes

| Behavior | Command | Result | Status |
|---|---|---|---|
| Unit suite | `npx vitest run` | 1506 passed | PASS |
| Type check | `npx tsc --noEmit` | exit 0 | PASS |
| Fences | `check-feature-fence.mjs`, `check-contract-fence.mjs` | OK | PASS |
| Keyboard, reduced motion, route axe, legacy isolation, touch targets | `playwright test --project=e2e` on five specs | 225 passed | PASS |
| Dev-only exclusion | `check-dev-fixtures-excluded.mjs` | Not re-run (needs a flag-less build; my `.next` is the flagged one). CI `web` job passed it on f90a828 | CI PASS |
| Visual regression (217) | Docker-pinned, CI only | CI `visual` success on f90a828 | CI PASS |

Step 7c: no probe scripts apply to this phase.

### Human Verification Required

1. **Audible playback on a real device.** Play, pause, step 5 s, crossfade between two recordings, level match, band selection (which filters no audio yet). Expected: the sound follows the controls, level match only attenuates, the playhead stays with the audio. Why human: Web Audio output.
2. **Playhead frame pacing on a tablet.** Expected: no stutter while a spectrogram plays. Why human: real-device timing; the budget is Phase 16.
3. **Safari 16.4 or later**, desktop and iPhone or iPad, across the three directions and the Transport. Why human: CI is Chromium only.
4. **Token probe map by eye** in Atlas, Nocturne and Poster. Why human: WebGL is masked in the screenshots.
5. **Darker status palette against the mockup.** Why human: gate-verified but not formally signed off by the owner.

These match the pending rows in `docs/deploy/PHASE-4-VISUAL-REVIEW.md`. None can be closed by changing code.

### Gaps Summary

No gaps. All five success criteria and all seven requirement IDs (DS-01 to DS-06, DS-08) are satisfied by implementation, wiring and mechanical gates that I re-ran locally or confirmed green in CI. The status is `human_needed` solely because five device and judgement checks are still pending with the owner. Two warnings carry to Phase 6: the StatusBand segment width floor, and the elevation wording (an explicit flat-by-design decision that may want an override or a shadow token later).

---

_Verified: 2026-10-05_
_Verifier: Claude (gsd-verifier)_
