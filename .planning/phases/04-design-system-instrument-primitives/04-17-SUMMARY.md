---
phase: 04-design-system-instrument-primitives
plan: 17
subsystem: ui
tags: [probability-bar, abstain, legend, status-band, countby, integrity, react-aria]
status: complete

requires:
  - phase: 04-design-system-instrument-primitives
    provides: StatusMark, status-shapes and the status palette (04-04), RLabel (04-08), state primitives LoadingState, EmptyState, ErrorState and Skeleton (04-08), toIntegerPercentages (Phase 1)
provides:
  - "ProbabilityBar, ProbabilityBarProps and related types (features/instrument/ProbabilityBar.tsx)"
  - "countBy (features/ui/count-by.ts, exported from @/features/ui)"
  - "Legend, LegendEvidence (features/instrument/Legend.tsx)"
  - "StatusBand (features/instrument/StatusBand.tsx)"
affects: [04-18, 04-21, 04-22, phase-6, phase-7, phase-12]

actuals:
  tokens: 14000
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Controlled toggle groups: RAC ToggleButtonGroup is given selectedKeys and an onSelectionChange that reports the status whose state changed, because a ToggleButton inside a group reads the group state and ignores its own isSelected"
    - "Container-width layout through Tailwind v4 container queries (@container and @min-[40rem]) so a 390 px container shows the phone layout on a wide page"
    - "Sentences are computed from data (plural, list and verdict helpers) and never typed with a number in them"

key-files:
  created:
    - dashboard-next/src/features/instrument/ProbabilityBar.tsx
    - dashboard-next/src/features/instrument/Legend.tsx
    - dashboard-next/src/features/instrument/StatusBand.tsx
    - dashboard-next/src/features/ui/count-by.ts
    - dashboard-next/tests/unit/probability-bar.test.tsx
    - dashboard-next/tests/unit/legend.test.tsx
    - dashboard-next/tests/unit/status-band.test.tsx
  modified:
    - dashboard-next/src/features/instrument/index.ts
    - dashboard-next/src/features/ui/index.ts

key-decisions:
  - "ProbabilityBar draws only the classes that are both in the model card's classes and present in the reading, computes the integer percentages over exactly those, and never renders a zero row for a class the model does not have"
  - "In the abstain state the comparison and verdict sentences and the class marks are not drawn: there is no highest probability to compare, and a class mark would carry a class colour. The heading ring is the neutral unknown mark. The reference-label line and the limits stay"
  - "The limits sentence 'It has not been tested on recordings from new sites.' is printed only when evaluation is null; with an evaluation present the component makes no claim about testing"
  - "An interactive Legend row with a zero count is disabled unless it is selected, so a filter that empties a selected status can always be undone"
  - "StatusBand uses the aligned label layout only at 640 px container width and up and only when every segment holds at least 8% of the sites; otherwise the labels use the grid, so a label never has to sit under a segment too narrow for it"

patterns-established:
  - "Abstain threshold is a probability from 0 to 1 on the prop and is shown as a rounded percentage, printed only when given"

requirements-completed: []

duration: 55 min
completed: 2026-10-04
---

# Phase 4 Plan 17: ProbabilityBar, Legend and StatusBand Summary

**ProbabilityBar shows the model's probabilities as returned (integer percentages from `toIntegerPercentages`, a computed disagreement or match sentence, the model card's limits, and an explicit abstain), and the Legend and StatusBand compute every count from the data with `countBy`, asserted against the 54 published contract sites.**

## Accomplishments

- `ProbabilityBar`: rows in raw-probability order for the model's own classes, a 12 px bar over a track with a 1 px strong baseline (a zero draws no fill, any non-zero value at least 2 px), the header `RLabel kind="model"`, "Reference label: X, assigned by Y." and "Model's highest probability: X n%." lines, the computed verdict ("differs from the reference label" or "matches the reference label"), the limits line ("trained on 100 windows from 5 sites in Indonesia and Kenya", singular and list wording computed), the model-classes note, an optional source note, and a text summary linked with `aria-describedby`. Loading (three skeletons), empty and error states use the shared primitives with the UI-SPEC copy.
- Abstain: "Can't tell" beside a hollow ring, hatched bars with no habitat-status fill and no class mark, the withheld-reading sentence, and "No class reached the n% abstain threshold." only when a threshold is passed.
- `countBy`: a `Map` with a key per status in `HABITAT_STATUSES` order, zeros included.
- `Legend`: static (zero statuses omitted) and interactive (every status present in the full data as a toggle button showing its filtered count; zero-count rows disabled and still reading "Healthy 0"; group named "Filter by habitat status"; rows at least 44 px), "{n} sites shown" with the singular, the unknown explainer, and the optional Evidence group from `reference_role`.
- `StatusBand`: segments with `flex-grow` equal to their count (min 4 px), label row (mark 16, count 24, label 14) whose layout follows the container width, interactive toggle segments with the selected and hover treatments and a tooltip, loading and empty states.
- The published counts are asserted from disk: 15 degraded, 6 restored early, 8 restored mid, 16 healthy, 9 unknown (54 sites), by `countBy` and by both components.

## Task Commits

1. Task 1: ProbabilityBar - RED `4dbcd31` (test; 22 of 22 failed), GREEN `1fd3fda` (feat)
2. Task 2: countBy, Legend and StatusBand - RED `204bc77` (test; 26 of 29 failed, the three `countBy` tests already passed because the helper file existed uncommitted), GREEN `dcc042b` (feat)

## Verification

- `npx vitest run tests/unit/probability-bar.test.tsx tests/unit/legend.test.tsx tests/unit/status-band.test.tsx`: 51 passed, run 5 times in a row with no failure. With `semantic-tokens.test.ts` and `copy-claims.test.ts`: 60 and 61 passed.
- `npm test`: 75 files, 1361 tests passed. `npm run lint`: 0 errors (20 pre-existing warnings, none in the new files). `npm run typecheck`: clean. `npm run build` (flag-less): exit 0.
- `check-feature-fence.mjs`, `check-contract-fence.mjs` OK; `check-dev-fixtures-excluded.mjs` OK against the flag-less build.
- Playwright e2e not run for this plan: it adds no route or fixtures section (plan 04-18 adds the sections and runs the e2e project, including axe, against a build that contains this code). The visual layout of the label row (container queries) is therefore first exercised in plan 04-18.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree started from an older commit than the expected base**
- **Found during:** startup
- **Issue:** the isolated worktree branch pointed at `4165617` (an ancestor of the expected base `a7b84a9`, no commits of its own), so `.planning/` and the Phase 4 primitives were missing.
- **Fix:** `git merge --ff-only a7b84a9` (a pure fast-forward, no history rewritten).
- **Commit:** none (no new commit; HEAD moved to `a7b84a9`)

**2. [Rule 1 - Bug] ToggleButton inside a group ignores its own isSelected**
- **Found during:** Task 2 (reading React Aria's ToggleButton before writing the Legend)
- **Issue:** a first draft passed `isSelected` and `onChange` to each row; inside a `ToggleButtonGroup` those are replaced by the group state, so the parent could not control the selection.
- **Fix:** the group takes `selectedKeys` and an `onSelectionChange` that calls `onToggle` for each status whose state changed; covered by the "reports a toggle once per press" test.
- **Files modified:** dashboard-next/src/features/instrument/Legend.tsx, StatusBand.tsx
- **Commit:** `dcc042b`

### Interpretation notes (not rule deviations)

- The commit trailer is `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, the attribution the session's own instructions specify, not the Opus trailer named in the track brief (the brief's trailer does not name the model that wrote the code).
- A selected Legend row whose count falls to zero stays enabled (the plan says zero-count rows are disabled): otherwise a filter could not be undone.
- In the abstain state the comparison and verdict lines are not drawn (the plan's behaviour list does not cover the combination); the reference-label line and the limits line remain.
- `Legend` takes `filtered` (the items passing the current filter) as a separate prop rather than deriving it from `selected`: the parent owns the filtering, the component only counts.

**Total deviations:** 2 auto-fixed (1 environment, 1 design bug found before commit). **Impact:** none on scope.

## Known Stubs

None.

## Threat Flags

None. The components render numbers and sentences computed from props; no network, storage or URL surface was added. T-04-17-01 (repudiation of probabilities and counts) is mitigated as planned: probabilities go through `toIntegerPercentages` unchanged, counts come from `countBy` and are asserted against `contracts/bucket/v1/sites.json`, and the verdict and limits sentences are computed from the data.

## Next Phase Readiness

Ready for 04-18: the fixtures sections can render `ProbabilityBar` (default disagree, agree, abstain, partial, loading, empty, error), `Legend` (static, interactive with a computed zero row, selected, evidence group) and `StatusBand` (default, selected, hover through `data-force-hover`, a 390 px container, loading, empty).

## Self-Check: PASSED

- Files exist: ProbabilityBar.tsx, Legend.tsx, StatusBand.tsx, count-by.ts, probability-bar.test.tsx, legend.test.tsx, status-band.test.tsx (checked on disk).
- Commits `4dbcd31`, `1fd3fda`, `204bc77`, `dcc042b` present in `git log`.
- All task acceptance criteria re-run and green (vitest, lint, typecheck, build).
