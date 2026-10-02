---
phase: 03-platform-upgrade-stack-consolidation
plan: 11
subsystem: ui
tags: [observable-plot, d3, charts, accessibility, plot-figure, dependency-gate, plat-02, feature-module]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: 03-10 Leaflet removal (MapLibre is the only map engine), REMOVED_PACKAGES gate in stack-consolidation.test.ts
provides:
  - recharts and wavesurfer.js removed from package.json, the lockfile and src (zero import sites, no chart pixels moved)
  - "@observablehq/plot 0.6.17 plus d3-scale 4.0.2, d3-array 3.2.4, d3-shape 3.2.0, d3-format 3.1.2 pinned exactly (no d3 bundle), with the four @types as devDependencies"
  - src/features/charts: PlotFigure (accessible render-into-ref wrapper), probabilityBars and seriesLine encodings, barrel with the next/dynamic note
  - Gate: every runtime dependency (other than next, react, react-dom) is imported under src; no second chart library declared; no bare d3; Plot imported only from features/charts
  - CAP-86 Phase 3 closure note (dependencies and Streamlit only)
affects: [03-15, 04-kit, 07-bench, 09-results, 14-time-features]

actuals:
  tokens: 7300
  tasks: 2
  commits: 2

tech-stack:
  added: ["@observablehq/plot 0.6.17", "d3-scale 4.0.2", "d3-array 3.2.4", "d3-shape 3.2.0", "d3-format 3.1.2", "@types/d3-scale 4.0.9", "@types/d3-array 3.2.2", "@types/d3-shape 3.2.0", "@types/d3-format 3.0.4"]
  removed: [recharts, wavesurfer.js]
  patterns:
    - "Figure spec = { caption, ariaLabel, ariaDescription, table, build(width) }: every encoding returns a complete accessible figure, PlotFigure just renders it"
    - "Probability axes: domain [0, 1] from zero, d3-format '.0%' ticks, labels only from toIntegerPercentages computed over all categories before any cutoff"
    - "Plot loaded only through next/dynamic (ssr false) by consumers; build function must be memoised"

key-files:
  created:
    - dashboard-next/src/features/charts/PlotFigure.tsx
    - dashboard-next/src/features/charts/encodings.ts
    - dashboard-next/src/features/charts/index.ts
    - dashboard-next/tests/unit/plot-figure.test.tsx
  modified:
    - dashboard-next/package.json
    - dashboard-next/package-lock.json
    - dashboard-next/tests/unit/stack-consolidation.test.ts
    - .planning/audit/CAPABILITY-MATRIX.md

key-decisions:
  - "Bar length is the probability normalised by its own sum (so the axis stays [0, 1] even for a legacy multiplied payload); the label is the integer percentage from toIntegerPercentages; neither is re-rounded in the chart"
  - "Truncation computes percentages over all categories first, so the shown rows keep their true values and the caption states 'Showing the top N of M'"
  - "probabilityBars accepts any string keys (STATUS_COLORS lookup with the existing 'unknown' colour as fallback) so a future top-N of sites reuses it without a new hue"
  - "Line charts draw only dots when there is one point (no degenerate path); the y domain always includes zero"
  - "PLAT-02 marked complete: all four claims verified explicitly (see Verification)"

patterns-established:
  - "Single-chart-engine gate: Plot imported only under features/charts, other chart libraries banned by name pattern"
  - "Used-dependency gate: a new runtime dependency fails CI until some file under src imports it"

requirements-completed: [PLAT-02]

coverage:
  - id: C1
    description: "recharts and wavesurfer.js are gone from package.json, the lockfile and src; Plot and the four d3 modules are installed at exact versions with no d3 bundle"
    requirement: PLAT-02
    verification:
      - kind: command
        ref: "npm ls recharts wavesurfer.js -> (empty); npm ls @observablehq/plot d3-scale d3-array d3-shape d3-format --depth=0 -> 0.6.17 / 4.0.2 / 3.2.4 / 3.2.0 / 3.1.2"
        status: pass
      - kind: unit
        ref: "stack-consolidation.test.ts (REMOVED_PACKAGES gains recharts and wavesurfer.js; exact pins; no bare d3)"
        status: pass
    human_judgment: false
  - id: C2
    description: "PlotFigure renders a figure with figcaption, root svg aria-label and aria-description, per-datum aria labels, hidden table matching the plotted values, cleanup on unmount, and no SVG for empty data"
    requirement: PLAT-02
    verification:
      - kind: unit
        ref: "plot-figure.test.tsx (figure/figcaption, aria-label, aria-description 'Degraded 62%, healthy 25%, restored (early) 13%', rect labels, sr-only table rows sum to 100, unmount removes svg, empty 'No data to plot.')"
        status: pass
    human_judgment: false
  - id: C3
    description: "Honest probability axis: domain [0, 1] from zero, percent ticks, STATUS_COLORS colour range, ordering by raw probability, labels from toIntegerPercentages, legacy multiplied payload still sums to 100"
    requirement: PLAT-02
    verification:
      - kind: unit
        ref: "plot-figure.test.tsx (x.domain [0,1], '0%' and '100%' ticks, color domain/range, descending order, legacy payload renormalised)"
        status: pass
    human_judgment: false
  - id: C4
    description: "Series line (zero-based nice y domain, d3-shape curve, d3-format ticks, labelled dots), one point renders one dot, empty renders the empty state, one category renders one bar, 30 categories with cutoff 10 render 10 bars and say so"
    requirement: PLAT-02
    verification:
      - kind: unit
        ref: "plot-figure.test.tsx 'empty, one and many' and 'series line' blocks (23 tests in the file)"
        status: pass
    human_judgment: false
  - id: C5
    description: "Every runtime dependency is imported under src and no competing chart library can be declared"
    requirement: PLAT-02
    verification:
      - kind: unit
        ref: "stack-consolidation.test.ts 'one chart engine and used dependencies' (6 tests)"
        status: pass
    human_judgment: false
  - id: C6
    description: "No regression: full unit, typecheck, lint, fences, production build, full e2e project, CI non-visual jobs"
    requirement: PLAT-02
    verification:
      - kind: other
        ref: "Local: unit 32 files / 431 tests, typecheck clean, lint 0 errors (19 pre-existing warnings), both fences OK, next build OK, e2e 66 passed. CI run 37065910328 (https://github.com/TyLuHow/ReefRadar/actions/runs/37065910328): web, e2e, python, citations success; visual failed only experience-compare @ 390 (declared), 32 passed"
        status: pass
    human_judgment: false
  - id: C7
    description: "PlotFigure has no consumer yet (UI-SPEC discretion: the hand-built ProbabilityBars/ProbabilityStackedBar stay until Phase 9); it is proven by its own tests, and the Plot chunk size when first loaded through next/dynamic is a later-phase concern"
    requirement: PLAT-02
    verification:
      - kind: other
        ref: "Open assumption below (flagged in the plan, unresolved)"
        status: pass
    human_judgment: true

duration: 35min
completed: 2026-10-02
status: complete
---

# Phase 3 Plan 11: Plot + d3 Chart Stack and Accessible PlotFigure Summary

**recharts and wavesurfer.js are removed (no import sites, no pixels moved), Observable Plot 0.6.17 with the individual d3 modules is the single chart approach, and `src/features/charts` provides an accessible, honest-axis PlotFigure (probability bars and a series line) guarded by a gate that keeps every runtime dependency in use.**

## Performance

- **Duration:** about 35 min (includes one full local e2e run, build, and the CI watch)
- **Tasks:** 2 (1 tracer, 1 auto TDD)
- **Commits:** 2 task commits (`be0e5a0`, `24c5bbb`) plus this summary commit
- **Files:** 4 created, 4 modified (lockfile counted among the modified)

## Package legitimacy evidence (T-03-11-SC)

Satisfied by the owner's standing approval (DRIVING-QUESTIONS.md, "Standing owner approvals (2026-10-01)", all new test/dev packages plus the research "Package Legitimacy Audit" OK verdicts) and the registry evidence below. `npm view <name>@<version> name version repository.url scripts.postinstall scripts.install scripts.preinstall` returned the exact requested version and a source repository for all nine packages, and no install-time script field for any of them (nothing printed for postinstall, install or preinstall).

| Package | Version | Repository |
|---|---|---|
| @observablehq/plot | 0.6.17 | github.com/observablehq/plot |
| d3-scale | 4.0.2 | github.com/d3/d3-scale |
| d3-array | 3.2.4 | github.com/d3/d3-array |
| d3-shape | 3.2.0 | github.com/d3/d3-shape |
| d3-format | 3.1.2 | github.com/d3/d3-format |
| @types/d3-scale | 4.0.9 | DefinitelyTyped |
| @types/d3-array | 3.2.2 | DefinitelyTyped |
| @types/d3-shape | 3.2.0 | DefinitelyTyped |
| @types/d3-format | 3.0.4 | DefinitelyTyped |

All four @types versions existed as planned, so no substitution was needed. Installed with `--save-exact`; the evidence was unexpected in no way, so no checkpoint was raised.

## Task 1 (tracer): dependency swap and one honest, accessible probability figure

- `npm rm recharts wavesurfer.js`, then the exact-pinned Plot, four d3 modules and four @types (plain npm, no `--legacy-peer-deps`).
- `PlotFigure.tsx` ('use client'): `Plot.plot({...build(width), ariaLabel, ariaDescription})` appended into a ref in `useEffect`, node removed in cleanup, width from a `ResizeObserver` (skipped when the browser has none, default 640), no SVG on the server, no transitions. It always renders a `<figure>` with a `<figcaption>`; with rows it adds an `sr-only` table (headers plus string cells) of the plotted values; with no rows it renders the caption plus "No data to plot." and never calls Plot.
- `encodings.ts` `probabilityBars`: categories ordered by raw probability with d3-array `descending`; colour domain/range from `STATUS_COLORS`; x domain `[0, 1]` with explicit 0/25/50/75/100% ticks formatted by d3-format `.0%`; bar labels and per-datum aria labels ("Degraded: 62%") from `toIntegerPercentages`; frame rules and the on-bar value text `ariaHidden: 'true'`; root description "Degraded 62%, healthy 25%, restored (early) 13%".
- Tests first (10 under jsdom with the real Plot): figure/figcaption, svg aria-label and aria-description, bar order and labels, `[0, 1]` domain and "0%"/"100%" ticks, colour range, aria-hidden rules, hidden table (62/25/13, sums to 100), legacy multiplied payload still sums to 100, cleanup on unmount.
- Tracer gate (auto mode): the tracer's verify, typecheck, lint, both fences and `next build` were green before Task 2 started.

## Task 2: series encoding, empty/one/many, gate, CAP-86; push

- `seriesLine`: y domain from d3-scale `scaleLinear().nice()` including zero (the nice bound for 0 to 62 is 65), `curveMonotoneX` from d3-shape passed as Plot's curve, x ticks via d3-format, every point a dot with an aria label ("Hour 2,000: 62"), rules `ariaHidden`, one point draws one dot and no line, hidden table of formatted values.
- `probabilityBars` cutoff (default 12): shows the top N, caption becomes "... Showing the top 10 of 30.", percentages stay computed over all categories. It now accepts any string keys (non-status keys use the existing `unknown` colour and a readable label).
- Gate in `stack-consolidation.test.ts`: `REMOVED_PACKAGES` gains `recharts` and `wavesurfer.js`; every `dependencies` key except next, react, react-dom must be imported (static, dynamic, side-effect or subpath) by a file under src; no recharts, chart.js, react-chartjs-2, victory, @nivo/*, @visx/*, highcharts or apexcharts in dependencies or devDependencies; no bare `d3`; exact pins; Plot imported only from `features/charts/`.
- CAP-86 note appended (`grep -c "Phase 3 (PLAT-02)"` prints 1). The unused hooks/components/stores stay, with the harvest notes for CAP-51 and CAP-36.
- Local gate: unit 32 files / 431 tests; typecheck clean; lint 0 errors (19 warnings, all pre-existing); feature and contract fences OK; `next build` OK; e2e project 66 passed.
- Pushed `e1b4e90..24c5bbb` (no workflow_dispatch run was in progress). CI run **37065910328**, https://github.com/TyLuHow/ReefRadar/actions/runs/37065910328:
  - web (lint, typecheck, unit, build): success; python (pytest): success; citations: success; e2e (routes + axe, fixture-mocked): success; live-smoke: skipped (manual only).
  - visual: failure, exactly one failing test: `tests/e2e/visual.spec.ts:51 experience-compare @ 390` (32 passed). That is the already-declared state, so there is no regression. Baselines were not regenerated (03-15 does that).

## PLAT-02 verification (explicit, after this plan)

| Claim | Evidence |
|---|---|
| MapLibre-only maps | `leaflet`, `react-leaflet`, `@types/leaflet`, `@deck.gl/*` absent from package.json and the lockfile; no import in src; `src/components/maps` gone; gate in stack-consolidation.test.ts |
| Plot + d3-only charts | recharts absent everywhere; Plot and the four d3 modules pinned; no other chart library declared (gate); Plot imported only from `features/charts`. The hand-built HTML `ProbabilityBars` and canvas spectrograms use no chart library (approved UI-SPEC discretion) |
| wavesurfer.js / recharts absent | `npm ls recharts wavesurfer.js` prints `(empty)`; gated by REMOVED_PACKAGES |
| deck.gl / Leaflet absent | as above; remaining text hits are historical comments and one e2e assertion that `.recharts-wrapper` is absent (not imports) |
| Streamlit absent | repo-root `dashboard/` does not exist (gate); no streamlit reference in any requirements file, CI workflow, script or source; only historical docs/prompts mention it |
| No unused runtime dependency | the new used-dependency gate passes for all ten non-framework dependencies |

## npm audit

4 vulnerabilities (1 low, 1 moderate, 2 high), down from 5 before this plan (removing recharts dropped lodash). The remaining packages are transitive dev tooling: baseline-browser-mapping, browserslist, picomatch, postcss-selector-parser. None are new packages from this plan; `npm audit fix` was not run (out of scope).

## Deviations from Plan

### Auto-fixed Issues

None. The plan was executed as written; the points below are interpretation notes.

### Plan interpretation notes

- **Generic categories:** `probabilityBars` takes `Partial<Record<string, number>>` (not only `ReefStatus`) so the "30 categories, cutoff 10" behaviour is testable and future top-N lists reuse it; non-status keys fall back to the existing `unknown` colour (no new hue).
- **nice() bound:** the plan's illustrative y domain is not fixed to a number; d3 gives `[0, 65]` for a maximum of 62, and the test asserts that.
- **Non-finite or negative values:** such entries are dropped from a probability figure rather than plotted (defensive; not in the plan text).
- **Task 1 without d3-scale/d3-shape imports:** those two modules are first imported in `seriesLine` (Task 2), as the plan sequences it; the used-dependency gate was added in the same task.

**Total deviations:** 0 auto-fixed. **Impact:** none.

## Issues Encountered

None blocking. The Windows CRLF notice appears on add and the auto-configured committer identity message on commit; git config was not changed. npm prints an install-script notice for `unrs-resolver` (a pre-existing transitive dev dependency, unrelated). No local server was started outside Playwright's own web server.

## Known Stubs

None. `PlotFigure` has no page consumer by design (see below); it is not a stub because it is fully implemented and tested.

## Open assumptions carried forward (flagged in the plan, unchanged)

- **No legacy consumer:** the hand-built `ProbabilityBars`/`ProbabilityStackedBar` stay as they are; Phase 9 rebuilds results and is the first real consumer of PlotFigure (via `next/dynamic`, since Plot's chunk is about 241 KB). Status in the plan: unresolved, flagged.
- **Visual baseline:** no shipped page renders a Plot chart yet, so there is nothing for the visual suite to diff; any later Plot chart must go through the baseline diff review.

## Threat Flags

None. T-03-11-SC closed (registry evidence above, exact pins, no install scripts, CI `npm ci` green). T-03-11-01 closed (axis `[0, 1]` from zero, labels only from `toIntegerPercentages`, unit-tested). T-03-11-02 closed (used-dependency and single-engine gate in CI). T-03-11-03 closed (Plot sets text nodes; the hidden table is React text).

## Next Phase Readiness

The dependency set is consolidated: one map engine (MapLibre), one chart approach (Observable Plot + d3), no unused dependencies, and a gate that prevents regressions. 03-15 regenerates baselines and records the phase exit evidence. Visual-red window unchanged: web, e2e, python and citations must stay green; visual may fail only on declared states.

## Self-Check: PASSED

- Created files present: `dashboard-next/src/features/charts/PlotFigure.tsx`, `encodings.ts`, `index.ts`, `dashboard-next/tests/unit/plot-figure.test.tsx`
- Commits `be0e5a0` and `24c5bbb` found in git log; CI run 37065910328 reviewed
- `grep -c "Phase 3 (PLAT-02)" .planning/audit/CAPABILITY-MATRIX.md` prints 1
- Acceptance commands re-run: unit (32 files, 431 tests), `npm ls` checks, build, full e2e (66 passed) all green
