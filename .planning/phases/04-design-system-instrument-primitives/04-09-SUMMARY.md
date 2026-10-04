---
phase: 04-design-system-instrument-primitives
plan: 09
subsystem: ui
tags: [fixtures, dev-fixtures, button, toggle-group, tooltip, empty-error-loading, numerals, accent-block, band-section, e2e]

requires:
  - phase: 04-design-system-instrument-primitives
    provides: Button, ToggleGroup, Tooltip (04-05), the gated fixtures route and registry (04-06), the chrome, FixtureSection and StateCell (04-07), the state and layout primitives (04-08)
provides:
  - "Five fixtures sections registered in slug order: button, toggle-group, tooltip, states, numerals"
  - "A fixtures e2e block (04-09) covering the five sections, and a race-free swatch-label spec"
affects: [04-10, 04-21, fixtures, design-system]

actuals:
  tokens: 6300
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Forced states go through the data-force-hover, data-force-focus and data-force-pressed attributes the state variants answer to, and the StateCell says 'State forced for review'"
    - "A fixtures cell that needs contract data renders from the query state: data, then a loading cell, then an error cell with a Retry that refetches"
    - "An e2e poll reads every value it compares inside the poll callback and requires a non-empty match; an expected value captured once before polling can be empty forever"

key-files:
  created:
    - dashboard-next/src/features/fixtures/sections/ButtonSection.tsx
    - dashboard-next/src/features/fixtures/sections/ToggleGroupSection.tsx
    - dashboard-next/src/features/fixtures/sections/TooltipSection.tsx
    - dashboard-next/src/features/fixtures/sections/StatesSection.tsx
    - dashboard-next/src/features/fixtures/sections/NumeralsSection.tsx
  modified:
    - dashboard-next/src/features/fixtures/registry.tsx
    - dashboard-next/src/features/fixtures/slugs.ts
    - dashboard-next/tests/e2e/fixtures-route.spec.ts

key-decisions:
  - "No request-id error cell: nothing under tests/fixtures/api contains a request id, so the cell is omitted and the Data line says why; the request-id path stays covered by state-primitives.test.tsx"
  - "ToggleGroup cells are labelled 'Options, ...' (not 'Direction, ...') so the chrome's Direction switcher stays the only radiogroup matching that name"
  - "The live-tooltip e2e steps off and back onto the trigger after the first Tab, because a tooltip closes when its page scrolls and the first Tab onto an off-screen trigger scrolls right after it opens"

patterns-established:
  - "Section files hold one meta object and one component; registry.tsx and slugs.ts take one line each"

requirements-completed: []
requirements-advanced: [DS-08, DS-04, DS-05]

coverage:
  - id: D1
    description: "Button, ToggleGroup and Tooltip fixtures sections show every UI-SPEC state; hover, focus, pressed, disabled and invalid are applied to real options or labels and each forced cell reads 'State forced for review'"
    requirement: DS-08
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#forced hover, focus and pressed cells are labelled as forced"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#the live tooltip opens on keyboard focus and closes on Escape"
        status: pass
    human_judgment: false
  - id: D2
    description: "Empty, Error and Loading section: empty block and inline, error on load (status) and after action (alert), loading and forced long wait; no request-id cell without a committed real id"
    requirement: DS-08
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#the error cells show no request id and the long-wait cell says so"
        status: pass
    human_judgment: false
  - id: D3
    description: "Numerals section: the site and country Stats equal the committed contract's counts (computed by useReferenceSites, never typed); one AccentBlock per cell logs no per-screen error in any direction"
    requirement: DS-05
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#the numerals are computed from the contract sites, #one accent block per cell logs no error in atlas, nocturne and poster"
        status: pass
    human_judgment: false
  - id: D4
    description: "The five sections look right in all three directions and under reduced motion (rule weights, skeleton visibility, forced-state legibility, accent block and band contrast)"
    requirement: DS-08
    human_judgment: true
    rationale: "Checked by DOM and class assertions only; no screenshots were taken here. The Docker-pinned visual baselines and axe pass over these sections, and the owner's side-by-side review, are later plans."

duration: 55min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 09: Primitive Fixtures Sections Summary

**Five /dev/fixtures sections (Button, ToggleGroup, Tooltip, Empty/Error/Loading, Numerals with AccentBlock and BandSection) on real data with labelled forced states, site and country counts computed from the contract, and the CI-failing swatch e2e race fixed.**

## What was built

- **Task 1** (`15a7468`): `ButtonSection` (12 cells: default, forced hover/focus/pressed, disabled, pending, long label, icon only, inverse on an accent surface, secondary, quiet, link button), `ToggleGroupSection` (10 cells over the real options Atlas, Nocturne, Poster: default, forced states, selected, disabled segment, loading, empty, invalid with "Choose at least one option.", well variant) and `TooltipSection` (live closed trigger, forced open-on-hover and open-on-focus drawn with `TooltipSurface`). Registered in `registry.tsx` and `slugs.ts`.
- **Task 2** (`1dc4c7d`): `StatesSection` (empty block and inline, error on load and after action, loading, forced long wait via `elapsedMs`) and `NumeralsSection` (two Stats from `useReferenceSites`, an AccentBlock with the Listen copy and an inverse "Place a recording" LinkButton, a BandSection), with loading and error cells following the contract query. Registered after `tooltip`, in UI-SPEC order.
- **Tests** (`23a7167`, `5846523`): the swatch-label race fix, and a `04-09` e2e block for the new sections.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CI e2e failure on cb42a64: swatch label spec compared against a value captured once**
- **Found during:** coordinator report of the 04-08 CI run (89/90 e2e passed); fixed here before any push.
- **Issue:** `tests/e2e/fixtures-route.spec.ts` "surface swatch labels are the live --dir-* values and follow the direction" evaluated `ground()` once as the argument to `.toBe(...)` before `expect.poll` started. When the surface had not resolved `--dir-ground` yet, the expected value was `""` and the poll could never match (Expected `""`, Received `"#fff"`). A test race, not a product bug.
- **Fix:** `ground` and the label are both read inside one poll callback that returns `g !== '' && l === g`, for the initial assertion and again after the Nocturne switch (which also requires `ground` to have changed). The rest of the spec was checked for the same pattern: the only other computed-once value is `before` in the status-palette spec, which is a real baseline read after `toContainText(' : 1')` and is compared with `.not.toBe`, so it cannot be empty-forever. The new 04-09 specs compute their expected values from committed files, not from the page.
- **Files modified:** `dashboard-next/tests/e2e/fixtures-route.spec.ts`
- **Verification:** `npx playwright test --project=e2e tests/e2e/fixtures-route.spec.ts --repeat-each=5` 135 passed (27 tests x 5); then the whole e2e project 98 passed.
- **Commit:** `23a7167`

**2. [Rule 1 - Bug] ToggleGroup cells' accessible names collided with the chrome's Direction switcher**
- **Found during:** Task 2 (first fixtures e2e run: 25 failures, strict-mode violations "resolved to 8 elements").
- **Issue:** the new ToggleGroup cells were labelled "Direction, default" and so on; `getByRole('radiogroup', { name: 'Direction' })` matches by substring, so the existing chrome specs matched all of them.
- **Fix:** the cells are labelled "Options, ..." (their options are the direction names, but the groups are not the switcher).
- **Files modified:** `dashboard-next/src/features/fixtures/sections/ToggleGroupSection.tsx`
- **Commit:** `1dc4c7d`

**3. [Rule 1 - Bug] Own new e2e specs were wrong in three places, fixed before commit**
- **Found during:** Task 2 e2e runs. The numerals spec read the cell's eyebrow `p` instead of the Stat (`p.flex`); the tooltip spec expected a tooltip to open on programmatic focus (React Aria opens one only after keyboard focus) and then lost it to the page scrolling (a tooltip closes on scroll; the spec now steps off and back onto the trigger once the page has settled).
- **Commit:** `5846523`

### Plan variations (judgement calls)

- **Added e2e coverage the plan did not list.** The plan runs the existing fixtures-route spec; a new `04-09` block was added to it (Rule 2: a section with no test is not covered by the later browser gates it was built for). `fixtures-route.spec.ts` is outside the plan's `files_modified`, which the CI fix required in any case.
- **No request-id error cell**, as the plan allows: `grep -rli "request_id\|requestId\|request-id" tests/fixtures ../data/snapshots` finds nothing.
- **The default loading cell flips to the long-wait label after 8 s**, because the primitive's own timer is real; the cell's note says so and the forced long-wait cell is separate.
- **The error-after-action cell does not set `focusOnMount`** so the review page keeps its own focus; the note says so.
- **The Numerals "Stats" cell is a note-bearing cell** printing the computed counts and contract version beneath the numerals, so a reviewer can see where the numbers come from.

**Total deviations:** 3 auto-fixed (Rule 1), 5 judgement calls. **Impact:** none on scope beyond the added e2e block and the one CI-driven spec fix.

## Verification run

- Task 1: `npx vitest run tests/unit/fixtures-registry.test.ts tests/unit/semantic-tokens.test.ts tests/unit/copy-claims.test.ts` 49 passed; `npm run typecheck` clean.
- Task 2 acceptance: the same three unit files 49 passed; `grep -c useReferenceSites src/features/fixtures/sections/NumeralsSection.tsx` is 4; the flagged build ran through Playwright's webServer (`NEXT_PUBLIC_DEV_FIXTURES=1 npm run build`) and the fixtures-route spec passed.
- Plan level: `npm test` 954 passed; `npm run lint` 0 errors, 19 warnings (unchanged); `npm run typecheck` clean; `check-feature-fence` OK (72 files) and `check-contract-fence` OK (141 files); flag-less `npm run build` then `check-dev-fixtures-excluded.mjs`: marker absent from 336 files, `/dev/fixtures/` and `/dev/fixtures/tokens/` both 404; fixtures-route spec `--repeat-each=5` 135 passed; whole fixture-mocked e2e project 98 passed.

## Known Stubs

None. The Retry and Clear filters actions in the states section do nothing on purpose (a review page has nothing to retry or clear) and say so in the section comment; they are not wired to placeholder data.

## Threat Flags

None. T-04-09-01 (mitigate): the counts come from `useReferenceSites` (asserted equal to `contracts/bucket/v1/sites.json` in the e2e), the request-id cell is omitted because no committed fixture has one, and every forced cell carries "State forced for review".

## Next Phase Readiness

Ready for 04-10. The fixtures route now shows every primitive built so far (Button, ToggleGroup, Tooltip, Empty/Error/Loading, Numerals/AccentBlock/BandSection). Later primitive plans append a section file, one line in `registry.tsx` and one in `slugs.ts`. When adding ToggleGroups or other radiogroups to the route, avoid accessible names that contain "Direction".

## Self-Check: PASSED

- Created files exist on disk; commits `15a7468`, `23a7167`, `1dc4c7d`, `5846523` exist in `git log`.
- Both tasks' acceptance criteria and the plan-level verification were re-run after the last code commit (see Verification run).
