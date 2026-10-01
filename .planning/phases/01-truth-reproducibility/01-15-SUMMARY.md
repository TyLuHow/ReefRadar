---
phase: 01-truth-reproducibility
plan: 15
subsystem: ui
tags: [dashboard-next, probabilities, region-warning, caveats, model-card, vitest, tdd]
status: complete

# Dependency graph
requires:
  - phase: 01-truth-reproducibility
    provides: "lambdas/classifier response contract (plan 01-11) -- region object fields (coordinates_provided, in_training_region, training_sites_in_region, training_countries, scope) and raw unmultiplied probabilities this plan's UI renders"
  - phase: 01-truth-reproducibility
    provides: "dashboard-next/src/data/model-card.json (plan 01-13) -- model_version, training_rows, training_sites_count, training_countries, evaluation_note consumed by RegionWarning/CaveatsFooter/CaveatsBanner"
provides:
  - "dashboard-next/src/lib/probabilities.ts: toIntegerPercentages (largest-remainder rounding, renormalised by input sum) and presentClasses (canonical order filtered to the response's own keys) -- the shared integer-percentage contract for every result view"
  - "Honest result components: ProbabilityBars/ProbabilityStackedBar, ComparisonPanel, ControlsPanel, AnalysisResults now render integer percentages for only the model's own classes, with 'Most similar to <Label> reference recordings' / '<n>% model probability' headline wording instead of a one-decimal diagnosis"
  - "RegionWarning: honest two-case copy (coordinates not provided / outside training region) naming the real training countries from model-card.json; renders nothing inside the training region; falls back cleanly for an old-shape API response"
  - "CaveatsFooter/CaveatsBanner: training-data statement built from model-card.json data instead of the broader 5-country MARRS reference-site footprint"
  - "Contract fixtures: tests/fixtures/api/visualize-3class-{no-coords,in-region}.json matching the 01-11 response contract and 01-13 model-card classes"
affects: [01-16, 01-19, 01-20]

# Actuals (#2632)
actuals:
  tokens: 11050
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Integer-percentage display is centralized in src/lib/probabilities.ts (toIntegerPercentages + presentClasses) -- every component that renders a probability imports this instead of computing (value * 100).toFixed(n) inline, so a future component can't reintroduce a non-integer or non-100-summing display"
    - "presentClasses(probabilities, canonicalOrder) is the one place that decides which classes to render; a class absent from the API response (restored_mid on the 3-class interim model) is simply not iterated, never rendered as an invented zero row"
    - "RegionInfo's new 01-11 fields (coordinates_provided, in_training_region, training_sites_in_region, training_countries, scope) are optional on the TypeScript type and every consumer (RegionWarning, ComparisonPanel) falls back to the legacy in_training_distribution/detected==='UNKNOWN' fields when they're absent, so an older API response still renders without a crash"
    - "model-card.json is imported directly as a JSON module (resolveJsonModule) into RegionWarning/CaveatsFooter/CaveatsBanner so training-country and model-version claims can never drift from the single model-card source of truth"

key-files:
  created:
    - dashboard-next/src/lib/probabilities.ts
    - dashboard-next/tests/unit/probabilities.test.ts
    - dashboard-next/tests/unit/results-components.test.tsx
    - dashboard-next/tests/fixtures/api/visualize-3class-no-coords.json
    - dashboard-next/tests/fixtures/api/visualize-3class-in-region.json
  modified:
    - dashboard-next/src/components/charts/ProbabilityBars.tsx
    - dashboard-next/src/components/experience/ComparisonPanel.tsx
    - dashboard-next/src/components/experience/ControlsPanel.tsx
    - dashboard-next/src/components/AnalysisResults.tsx
    - dashboard-next/src/components/dashboard/RegionWarning.tsx
    - dashboard-next/src/components/experience/CaveatsFooter.tsx
    - dashboard-next/src/components/dashboard/CaveatsBanner.tsx
    - dashboard-next/src/types/index.ts
    - dashboard-next/vitest.setup.ts

key-decisions:
  - "toIntegerPercentages renormalises by the input's own sum (not assumed to be 1) so a legacy multiplied payload ({a:0.42,b:0.21,c:0.07}, sum 0.7) renders identically to a fresh raw-softmax payload with the same relative weights -- backward compatible with pre-01-11 API responses per the plan's must-have truth"
  - "ComparisonPanel's own inline 'Region Detection' card (not itemized in Task 2's behaviour bullets, but still a probability-adjacent claim) was rewritten to drop 'confidence adjusted' wording while this file was already being edited -- in scope per the plan's TRUTH-07 must-have ('nothing claims confidence was reduced'), not left as a second contradicting region message alongside the new RegionWarning copy"
  - "Added an explicit afterEach(cleanup) to vitest.setup.ts (Rule 3, blocking issue): this project's vitest.config.ts has no test.globals:true, so Testing Library's automatic cleanup detection never fired and every multi-render component test in results-components.test.tsx was accumulating DOM across tests within the same file, producing false 'multiple elements found' failures unrelated to the code under test"
  - "RegionInfo's two legacy fields (in_training_distribution, confidence_adjusted) were made optional rather than left required, matching the plan's 'legacy fields stay optional' instruction and making the old-shape-region fallback path in RegionWarning type-check without a cast"

requirements-completed: [TRUTH-06, TRUTH-07]

coverage:
  - id: D1
    description: "Every probability display shows integer percentages that sum to exactly 100, only for classes present in the API response (no restored_mid bar for a 3-class model)"
    requirement: TRUTH-06
    verification:
      - kind: unit
        ref: "tests/unit/probabilities.test.ts (10 tests: largest-remainder rounding, legacy-sum renormalisation, tie-breaking, empty/all-zero edge cases, presentClasses filtering)"
        status: pass
      - kind: unit
        ref: "tests/unit/results-components.test.tsx::ProbabilityBars, ::ComparisonPanel (3-class fixture renders exactly three rows summing to 100, no restored_mid)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Result headlines say 'most similar to' with an integer model probability, not a one-decimal diagnosis"
    requirement: TRUTH-07
    verification:
      - kind: unit
        ref: "tests/unit/results-components.test.tsx::ControlsPanel headline, ::AnalysisResults headline"
        status: pass
      - kind: other
        ref: "grep -c 'Most similar to' ControlsPanel.tsx AnalysisResults.tsx -> 1 each"
        status: pass
    human_judgment: false
  - id: D3
    description: "Region status is a separate, honest note (not provided / outside training region, with real training countries); nothing claims confidence was reduced"
    requirement: TRUTH-07
    verification:
      - kind: unit
        ref: "tests/unit/results-components.test.tsx::RegionWarning (5 tests: not-provided case, outside-training-region case, renders-nothing-in-region case, old-shape-fallback case, no-reduction/no-wrong-countries case)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Caveat text states what the classifier was actually trained on (model-card.json), not the broader 5-country reference-site footprint"
    requirement: TRUTH-07
    verification:
      - kind: unit
        ref: "tests/unit/results-components.test.tsx::CaveatsFooter and CaveatsBanner"
        status: pass
      - kind: other
        ref: "grep -c model-card RegionWarning.tsx CaveatsFooter.tsx CaveatsBanner.tsx -> 1, 2, 2"
        status: pass
    human_judgment: false
  - id: D5
    description: "Old API responses (multiplied probabilities, old region fields) still render truthfully"
    requirement: TRUTH-06
    verification:
      - kind: unit
        ref: "tests/unit/probabilities.test.ts::renormalises a legacy multiplied input; tests/unit/results-components.test.tsx::RegionWarning old-shape fallback"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full verification chain (unit + typecheck + lint + build + e2e) stays green across all three tasks"
    verification:
      - kind: unit
        ref: "npx vitest run (21/21 pass across smoke/probabilities/results-components)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit; npm run lint (exit 0, one pre-existing unrelated warning in LocationCompare.tsx); npm run build (succeeds, 12/12 static pages); npx playwright test --project=e2e (22/22 pass)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-10-01
---

# Phase 01 Plan 15: Legacy results UI honesty (D-12 UI half) Summary

Rewrote every probability display, result headline, region note and training-data caveat in the legacy `/experience` and `/dashboard/analyze` UIs to show only what the deployed interim-real-only classifier actually output: integer percentages summing to 100 for its own 3 classes, "most similar to" wording instead of a diagnosis, and training-country claims sourced from `model-card.json`.

## What Was Built

- **`dashboard-next/src/lib/probabilities.ts`** -- `toIntegerPercentages()` (largest-remainder rounding, renormalised by the input's own sum so a legacy multiplied payload still renders correctly) and `presentClasses()` (canonical status order filtered down to the keys the API actually returned). Every component that renders a probability now imports this instead of computing `(value * 100).toFixed(1)` inline.
- **`ProbabilityBars` / `ProbabilityStackedBar`** -- integer percent labels everywhere (including compact mode and `title` attributes), rendering only the classes present in the response.
- **`ComparisonPanel`** -- class-probability loop replaced with `presentClasses` + `toIntegerPercentages`; heading renamed "Class probabilities (model output)"; similar-site rows show `label: <label_original> (<label_source>)` when present; its own region card no longer claims a confidence adjustment.
- **`ControlsPanel` / `AnalysisResults`** -- headline reads "Most similar to `<Label>` reference recordings" with "`<n>`% model probability"; `AnalysisResults` shows `classification.model_version` when present and no longer renders the confidence-adjusted chip or a duplicated inline region warning (that note now lives solely in `RegionWarning`).
- **`RegionWarning`** -- two honest cases (coordinates not provided / outside the training region), both naming the real training countries from `model-card.json`; renders nothing when `in_training_region` is true; falls back to `detected === 'UNKNOWN'` / `in_training_distribution` for an old-shape API response. Props unchanged, so the `/dashboard/analyze` call site needed no edit.
- **`CaveatsFooter` / `CaveatsBanner`** -- training-data statement built from `model-card.json` (model version, training rows, site count, real countries) plus its `evaluation_note`, replacing the old "5 countries / Indo-Pacific" claim; kept the genuine limitations (acoustic similarity is not a diagnosis, no species ID, recording conditions matter).
- **Two contract fixtures** (`visualize-3class-no-coords.json`, `visualize-3class-in-region.json`) matching the 01-11 classifier response contract and the 01-13 model-card's 3 classes, for this plan's tests and for 01-16/01-20 downstream.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] vitest.setup.ts had no `afterEach(cleanup)`, causing multi-render tests to leak DOM across tests in the same file**
- **Found during:** Task 2, writing `ControlsPanel`/`AnalysisResults` headline tests
- **Issue:** `dashboard-next/vitest.config.ts` has no `test.globals: true`, so Testing Library's automatic cleanup-detection (which relies on a global `afterEach`) never registered. Every `render()` call in `results-components.test.tsx` accumulated in `document.body`, so later tests' `getByText` queries matched leftover elements from earlier tests in the same file (e.g. two different "model probability" strings from `ControlsPanel` and `AnalysisResults`), throwing "multiple elements found" errors unrelated to the component code.
- **Fix:** Added an explicit `import { afterEach } from 'vitest'; import { cleanup } from '@testing-library/react'; afterEach(() => cleanup());` to `vitest.setup.ts`.
- **Files modified:** `dashboard-next/vitest.setup.ts`
- **Commit:** d2069af

**2. [Rule 2 - Missing critical functionality] ComparisonPanel's own inline region card still implied a confidence adjustment**
- **Found during:** Task 2, while already editing `ComparisonPanel.tsx` for the class-probabilities loop
- **Issue:** The plan's Task 2 behaviour bullets didn't itemize `ComparisonPanel`'s separate "Region Detection" card, but its copy ("Outside training distribution -- confidence adjusted") directly contradicts the plan's TRUTH-07 must-have ("nothing claims confidence was reduced") and would have left a second, contradicting region message next to the new honest `RegionWarning` copy from Task 3.
- **Fix:** Reworded to "The classifier has no training sites in this region -- probabilities are unmodified" / "The classifier has real training sites in this region", using `in_training_region` with a legacy `in_training_distribution` fallback.
- **Files modified:** `dashboard-next/src/components/experience/ComparisonPanel.tsx`
- **Commit:** d2069af

None of the three tasks required an architectural change (Rule 4) or hit an auth gate.

## Known Stubs

None -- all three tasks wired real data from the 01-11 response contract and the 01-13 model-card; no placeholder values or unwired components were introduced.

## Self-Check: PASSED

- `dashboard-next/src/lib/probabilities.ts` -- FOUND
- `dashboard-next/tests/unit/probabilities.test.ts` -- FOUND
- `dashboard-next/tests/unit/results-components.test.tsx` -- FOUND
- `dashboard-next/tests/fixtures/api/visualize-3class-no-coords.json` -- FOUND
- `dashboard-next/tests/fixtures/api/visualize-3class-in-region.json` -- FOUND
- `dashboard-next/src/components/dashboard/RegionWarning.tsx` -- FOUND
- commit `ea12786` -- FOUND
- commit `d2069af` -- FOUND
- commit `3fc0cbd` -- FOUND
