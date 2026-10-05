---
phase: 04-design-system-instrument-primitives
plan: 19
subsystem: ui
tags: [observable-plot, strip-plot, dumbbell, scatter, projection, status-shapes, a11y, contract-hook]
status: complete

requires:
  - phase: 04-design-system-instrument-primitives
    provides: status-shapes plotSymbol and statusColorVar (04-04), token surface and fixtures route (04-02, 04-07), dsp bandMeanDb and useClipSpectrogram (04-03, 04-13)
provides:
  - "useProjection (features/contract/hooks.ts), exported with type Projection from the contract barrel"
  - "PLOT_TOKEN_STYLE, RULE, INK, ACCENT and label constants (features/charts/plot-theme.ts)"
  - "stripSpec, pairedSpec, scatterSpec, projectionCaveat and StripPlotSpec (features/charts/strip-plot-specs.ts)"
  - "StripPlot component with Show as table disclosure and loading, empty and error states (features/charts/StripPlot.tsx)"
  - "strip-plot fixtures section on real projection, sites and WAV data"
affects: [04-20, 04-21, 04-22, 04-23, phase-6, phase-7]

actuals:
  tokens: 17600
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - "Plot marks are painted with var(--dir-*) strings through identity colour and radius scales, so a token change restyles a drawn plot with no rebuild"
    - "One layer per status with the geometry module's symbol object; ring and forced hover label reuse the same dodgeY over the same data so they land exactly on their mark"
    - "The Plot svg is one role=img figure; Plot's role-less aria-label groups are stripped (axe aria-prohibited-attr)"
    - "A draw that throws becomes the error state with the table, never a broken page"

key-files:
  created:
    - dashboard-next/src/features/charts/plot-theme.ts
    - dashboard-next/src/features/charts/strip-plot-specs.ts
    - dashboard-next/src/features/charts/StripPlot.tsx
    - dashboard-next/src/features/fixtures/sections/StripPlotSection.tsx
    - dashboard-next/tests/unit/contract-projection.test.tsx
    - dashboard-next/tests/unit/strip-plot.test.tsx
  modified:
    - dashboard-next/src/features/contract/hooks.ts
    - dashboard-next/src/features/contract/index.ts
    - dashboard-next/src/features/charts/index.ts
    - dashboard-next/src/features/fixtures/registry.tsx
    - dashboard-next/src/features/fixtures/slugs.ts
    - dashboard-next/tests/e2e/fixtures-route.spec.ts

key-decisions:
  - "StripPlot draws its own figure instead of wrapping PlotFigure: PlotFigure always renders a screen-reader-only table, and the spec requires a visible Show as table disclosure, so using it would have produced two tables"
  - "Selection on the strip is the mark's outline (size 24, 2 px ink ring layer from the same dodge) and, when onSelect is given, a Select button on every table row; a click on a mark is a pointer convenience that reads the id from the mark's native tooltip title"
  - "The forced hover is a Plot.text label placed by the same dodge, not Plot.tip: a tip filtered to one site would be re-dodged to a different position"
  - "The unknown status keeps the StatusMark convention in Plot too: a neutral fill with the unknown tone as a 2.5 px stroke"
  - "The scatter uses aspectRatio 1 so plane distances are not distorted (the plot is as tall as it is wide); the caveat still says the plane is a partial view"
  - "Paired footnote uses the shorter of the two manifest durations so it can never overstate"

patterns-established:
  - "Scoped fixtures e2e: wait for each figure's svg inside its own cell, poll computed expectations (table row count against the caption's own n)"

requirements-completed: [DS-05, DS-02, DS-08]

duration: 75 min
completed: 2026-10-05
---

# Phase 4 Plan 19: StripPlot (strip, paired, scatter) and useProjection Summary

**Three Observable Plot variants on the status shapes (strip by status, a paired dumbbell of band levels computed from two real WAVs, and a site scatter on the contract projection with its computed caveat), a verified `useProjection` hook, and a fixtures section on real data.**

## Accomplishments

- `useProjection` loads `projection.json` through `loadArtifact` (sha256 verified against the manifest, Zod parsed), keyed `['contract', version, 'projection']`; a one-byte change is a `ContractIntegrityError`, never data.
- `stripSpec`: one row per present status in ordinal order with computed counts ("Degraded 14"), deterministic `dodgeY`, status shapes with the ink outline, selected mark at 24 px with a 2 px ink ring, "Axis starts at {min}, not zero." only when the nice domain excludes zero, and "One value: {site} {measure} {value}." for a single point.
- `pairedSpec`: per-band dumbbell, 24 px marks, 5 px ink bar over a 1 px rule, ticks every 5 dB, right column "{a} / {b} dB" with U+2212, and the footnote limiting the claim to two clips. Mismatched level counts throw rather than plotting a guess.
- `scatterSpec`: 20 px status marks at the real projection coordinates, axis labels and caveat computed from `explained_variance_ratio` and `cumulative_explained_variance_ratio` (18%, 15%, 33% for v1), country names at centroids in the display face with a 6 px panel halo, the selected site ringed in the accent (3 px, 44 px across) with its id at 24 px. The accent is used only for that ring.
- `StripPlot`: figure, caption, notes, Show as table disclosure (`aria-expanded`), loading, empty and error states (the table stays in error), marks not focusable.
- `/dev/fixtures/strip-plot`: default, hover (forced), selected (live, table Select buttons), paired, scatter, loading, empty, one value and error cells.

## Task Commits

1. Task 1 RED: `3968f25` test, GREEN: `a9bac1d` useProjection, token Plot theme, strip variant and StripPlot
2. Task 2 RED: `8d47538` test, GREEN: `3f292e8` paired and scatter variants
3. Fix: `67dcbfa` StripPlot svg as one role=img figure (axe aria-prohibited-attr)
4. Task 3: `e2bc731` fixtures section, registry and slug, e2e blocks

## Verification

- `npm run lint` 0 errors (existing warnings only), `npm run typecheck` clean.
- `npm test`: 74 files, 1343 tests pass. New files strip-plot.test.tsx (31) and contract-projection.test.tsx (3) were run 5x with no flake.
- `node ../scripts/check-feature-fence.mjs` and `check-contract-fence.mjs` exit 0; flag-less `npm run build` exit 0; `check-dev-fixtures-excluded.mjs` OK (fixtures marker absent, both routes 404).
- e2e (track config on port 3202): whole `fixtures-route.spec.ts` `--repeat-each=3` 276 passed (before the strip-plot block was added); the new StripPlot block `--repeat-each=5` 30 passed, including axe in atlas, nocturne and poster.
- Visually checked in atlas and nocturne with a screenshot: marks, row labels, dumbbell, scatter and the caveat all render.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plot's role-less aria-label groups failed axe (aria-prohibited-attr, 9 nodes)**
- **Found during:** Task 3 e2e axe run
- **Fix:** root svg gets `role="img"`; descendant `aria-label`s are removed (name and description stay on the root); unit test added
- **Commit:** 67dcbfa

**2. [Rule 3 - Blocking] Draw-failure state without synchronous setState in an effect**
- **Issue:** the react-hooks lint rule `set-state-in-effect` is an error in this repo
- **Fix:** the failed spec is recorded from a microtask (`queueMicrotask`); the error state keys on the spec identity
- **Commit:** a9bac1d

### Plan wording adapted (not behaviour changes)

- The plan's fixture "STRIP DEFAULT ... selected ind_H1" and "SELECTED" cells would have been identical; DEFAULT shows no selection and SELECTED is the live, selectable strip starting on ind_H1.
- HOVER is a forced Plot.text label, not `Plot.tip` (see key decisions). The same text is each mark's native tooltip on a pointer.
- The paired footnote follows the plan ("dB re full scale of each file (uncalibrated)"), not the UI-SPEC's older "relative to the loudest bin" wording.
- StripPlot does not wrap `PlotFigure` (see key decisions); `encodings.ts` and `PlotFigure.tsx` are untouched.

## Known Limits (recorded, not stubs)

- The paired cell computes six STFT passes (3 bands x 2 clips) on the main thread when the clips load, about 1.5 s of blocked main thread on a desktop. It is a fixtures-only cost; a Phase 5+ consumer should precompute levels.
- Scatter country labels and marks can overlap (Plot has no collision handling; labels are limited to country names and the selected id by design).
- Visual-regression baselines for this section need the Docker image in CI; they were not generated locally.

## Known Stubs

None. Every plotted value comes from the contract (`sites.json`, `projection.json`) or the two committed WAVs.

## Threat Flags

None beyond the plan's threat model (T-04-19-01 mitigated: the projection is read only through `loadArtifact`; T-04-19-02 mitigated: computed caveat, variance axis labels and the two-clips footnote).

## Self-Check: PASSED

Created files exist (plot-theme.ts, strip-plot-specs.ts, StripPlot.tsx, StripPlotSection.tsx, both new test files) and commits 3968f25, a9bac1d, 8d47538, 3f292e8, 67dcbfa and e2bc731 are in the branch history.
