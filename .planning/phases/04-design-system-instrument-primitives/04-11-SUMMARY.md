---
phase: 04-design-system-instrument-primitives
plan: 11
subsystem: ui
tags: [slider, range-slider, table, data-table, react-aria-components, fixtures, dev-fixtures, keyboard, e2e]

requires:
  - phase: 04-design-system-instrument-primitives
    provides: the state primitives (04-08), the fixtures registry, chrome and sections pattern (04-07, 04-09), overlays and Listbox (04-10)
provides:
  - "Slider, RangeSlider (features/ui/Slider.tsx)"
  - "Table, TableHeader, Column, TableBody, Row, Cell (features/ui/Table.tsx)"
  - "DataTable, DataTableColumn (features/instrument/DataTable.tsx, exported through the instrument barrel)"
  - "Fixtures sections table, slider and data-table, registered in UI-SPEC order"
affects: [04-12, 04-21, 04-22, fixtures, design-system]

actuals:
  tokens: 25000
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "A primitive whose library output is wrong for the contract (aria-valuetext, thumb names, page size) fixes it in the wrapper: always controlled inside, a capture handler for the page keys, a per-render effect that writes the attributes React Aria filters or overrides"
    - "The scroll region is decided by measuring the container (ResizeObserver, under 640 px or overflowing), not the window, so a phone layout can be reviewed at 390 px inside a wide page"
    - "Pinned table cells stay opaque and repeat the row hover and selected fills through a named row group (group/row)"
    - "Fixture row states on a real table are forced through a rowAttributes callback and disabledIds, not a separate component"

key-files:
  created:
    - dashboard-next/src/features/ui/Slider.tsx
    - dashboard-next/src/features/ui/Table.tsx
    - dashboard-next/src/features/instrument/DataTable.tsx
    - dashboard-next/src/features/fixtures/sections/SliderSection.tsx
    - dashboard-next/src/features/fixtures/sections/TableSection.tsx
    - dashboard-next/src/features/fixtures/sections/DataTableSection.tsx
    - dashboard-next/tests/unit/slider.test.tsx
    - dashboard-next/tests/unit/data-table.test.tsx
  modified:
    - dashboard-next/src/features/ui/index.ts
    - dashboard-next/src/features/instrument/index.ts
    - dashboard-next/src/features/fixtures/registry.tsx
    - dashboard-next/src/features/fixtures/slugs.ts
    - dashboard-next/tests/e2e/fixtures-route.spec.ts

key-decisions:
  - "PageUp and PageDown move ten steps, as the UI-SPEC says; React Aria moves a tenth of the range (3 s on the 30 s clip, 800 Hz on the 8 kHz range), so the wrapper takes those two keys in a capture handler and sets the value itself"
  - "aria-valuetext, the per-thumb name and aria-invalid are written onto each thumb input after every render, because React Aria builds value text from an Intl number format (no m:ss), concatenates the group label onto a thumb's aria-label, and filters aria-invalid"
  - "DataTable caption count is the size of the whole set (total, else the rows given) and the footer is Showing k of n; a one-row filter therefore reads Showing 1 of {n}"
  - "The scroll region is measured on the container so the 390 px fixtures cells show the phone behaviour in a wide viewport"
  - "Disabled sliders keep the label and the value readout at full contrast; only the control parts grey out (axe flagged the greyed readout at 1.83:1)"

patterns-established:
  - "Barrel-level split: base Table in features/ui, DataTable in features/instrument composing it through '@/features/ui'"

requirements-completed: []
requirements-advanced: [DS-04, DS-05, DS-08]

coverage:
  - id: D1
    description: "Slider and RangeSlider change by step on arrow keys, by ten steps on PageUp and PageDown, jump with Home and End, name every thumb, and RangeSlider thumbs cannot cross; the value text is words with units, never a bare number"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/slider.test.tsx"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#the slider moves by step and by ten steps, jumps to the ends and the range thumbs cannot cross"
        status: pass
    human_judgment: false
  - id: D2
    description: "Table keyboard: one tab stop, arrows between rows, Enter or Space on a sortable header toggles aria-sort, Space toggles row selection, Enter runs the row action"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/data-table.test.tsx#DataTable: keyboard, #DataTable: sorting"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#the base table is one tab stop, rows move with the arrows, Space selects and a header sorts, #the data table runs the row action on Enter, selects on Space and sorts on the Site header"
        status: pass
    human_judgment: false
  - id: D3
    description: "DataTable lists every contract reference site with caption and footer counts computed from the rows; one row reads Showing 1 of n; empty, error and loading states replace the grid"
    requirement: DS-05
    verification:
      - kind: unit
        ref: "tests/unit/data-table.test.tsx#DataTable: counts are computed, #DataTable: states"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#the data table lists every contract site with computed counts"
        status: pass
    human_judgment: false
  - id: D4
    description: "On a phone-width container the DataTable sits in a focusable labelled horizontal scroll region with a sticky first column; table cells wrap and never truncate with an ellipsis"
    requirement: DS-05
    verification:
      - kind: unit
        ref: "tests/unit/data-table.test.tsx#DataTable: the phone scroll region, #DataTable: text and layout"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#on a phone-width container the table is a focusable labelled region with a pinned first column, #long text wraps inside its cell and is never cut with an ellipsis, #a wide data table has no scroll region"
        status: pass
    human_judgment: false
  - id: D5
    description: "The three sections show every UI-SPEC state on real data, axe-clean (serious/critical) in all three directions, zero-length slider transitions under reduced motion"
    requirement: DS-08
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#axe: table|slider|data-table has no serious or critical violation in atlas|nocturne|poster, #under reduced motion the slider thumb transition is zero length"
        status: pass
    human_judgment: false
  - id: D6
    description: "The slider thumb, the table row states and the DataTable look right (thumb proportions and ring, rule weights, sticky column edge, row density) in all three directions"
    requirement: DS-08
    human_judgment: true
    rationale: "Checked by DOM, class and computed-style assertions and axe only; no screenshots were taken. Docker-pinned visual baselines and the owner's side-by-side direction review are later plans."

duration: 55min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 11: Slider, Table and DataTable Summary

**Slider and dual-thumb RangeSlider (ten-step pages, human value text, thumbs that cannot cross), the styled base Table, and a DataTable with computed counts, two-state sorting, single selection, row action, loading/empty/error states and a phone scroll region with a pinned first column; each with a fixtures section on real contract and audio-manifest data, keyboard and axe verified in a production build across all three directions.**

## What was built

- **Task 1** (RED `74b7c2b`, GREEN `ed317f7`, contrast fix `3505f50`): `Slider` and `RangeSlider` on React Aria `Slider`: eyebrow label and end-aligned data-face value, 4 px `rule-strong` track with a `control` fill (between the thumbs for the range), 20 x 20 `control` thumb with a 2 px ground inner ring and a 44 x 44 hit area, hover `control-hover`, drag or press `control-pressed`, focus ring around the thumb, min and max labels under the ends, `well` tone, and `state` loading (track skeleton, no thumbs), empty ("No range to choose.") and error (thumbs `aria-invalid`, linked helper text). Slider section: "Playback position" over the real clip length (30 s from the audio manifest) with "m:ss of m:ss" value text, and "Frequency range" 0 to the Nyquist frequency of the real excerpts (8,000 Hz, `sample_rate_hz / 2`) with "2,000 Hz" text; cells default, hover, focus, pressed (forced), disabled, loading, empty, error, well tone.
- **Task 2** (`7f07352`): `Table`, `TableHeader`, `Column`, `TableBody`, `Row`, `Cell` on React Aria `Table` (a grid): eyebrow header with a 1 px ink rule, 44 px rows with a 1 px rule, `panel-hover` hover, inset focus ring on the row, selected fill plus a 3 px ink bar on the first cell, greyed disabled row, a 16 px arrow reflecting sort state with its space reserved, wrapping cells (`wrap-anywhere`, no ellipsis), numeric cells, and `sticky` columns that stay opaque and follow the row fills. Table section over real sites (one per country): default, hover row, focus (forced), selected row, disabled row (forced), sorted column.
- **Task 3** (RED `8493b45`, GREEN `558acd3`): `DataTable` (caption title and computed count, toolbar slot, the Table, "Showing k of n" footer, two-state sorting, none or single selection, `onRowAction` on Enter or click, `disabledIds`, `rowAttributes` for forced states, loading with the header and 8 skeleton rows, empty with "Clear filters", error with "Retry", scroll region when the container is under 640 px or overflows). DataTable section: every one of the contract's reference sites (columns Site with `<wbr>` after underscores, Status mark plus word, Country, Dataset, Evidence from `reference_role`, Licence), cells default (live, with the row action echoed), hover, focus, selected, disabled row, sorted descending, loading, empty, one row, error, long text (390 px) and phone scroll (390 px).
- **Tests**: `slider.test.tsx` (25), `data-table.test.tsx` (25, covering the base Table behaviour DataTable composes), and a 04-11 block in `fixtures-route.spec.ts` (21 specs: markers and forced labels, computed counts over every contract site, slider keys in a real browser, base table and data table keyboard, phone region and pinned column, wide table without a region, wrapping, reduced motion, filled pinned column and thumbs per direction, axe per section per direction).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] React Aria's page size and value text did not match the contract**
- **Found during:** Task 1 (reading the installed React Aria Slider source before writing the wrapper).
- **Issue:** React Aria pages by a tenth of the range (3 s on the 30 s clip) while the UI-SPEC and the plan say ten steps; `aria-valuetext` comes from an Intl number format and cannot read "0:12 of 0:30"; a thumb with its own `aria-label` also gets the group label concatenated, so its name would not be "{label} minimum"; `aria-invalid` is filtered out.
- **Fix:** controlled-inside wrapper with a capture handler for PageUp and PageDown (clamped to the neighbouring thumb, rounded to the step), and a per-render effect that writes `aria-valuetext`, the thumb name (dropping the concatenating `aria-labelledby`) and `aria-invalid`. Unit and browser specs pin all four.
- **Files modified:** `src/features/ui/Slider.tsx`
- **Commit:** `ed317f7`

**2. [Rule 1 - Bug] Disabled slider value readout failed axe color-contrast**
- **Found during:** Task 3 verification (first browser run of the 04-11 block; three failures, one per direction).
- **Issue:** the disabled treatment greyed the label and the value readout (1.83:1); axe exempts disabled controls but not an `output`.
- **Fix:** label and value stay at full contrast, only the control parts (thumb, fill) grey out. Documented in the Slider comment.
- **Files modified:** `src/features/ui/Slider.tsx`
- **Commit:** `3505f50`

**3. [Rule 1 - Bug] My first keyboard specs assumed ArrowDown from a header lands on a row**
- **Issue:** React Aria's grid moves from a column header into the cell below it, not onto the row, so the "rows move with the arrows" assertions failed twice.
- **Fix:** the specs focus a row and assert that the arrow keys then move row to row; the header behaviour is left as the library has it.
- **Commit:** `558acd3`

### Plan variations (judgement calls)

- **`overflow-wrap-anywhere` in the plan is not a Tailwind class**; the cells use `wrap-anywhere` (Tailwind 4.1+), which the unit test pins.
- **Scroll region measured on the container, not the window**: the plan says "below 640 px"; measuring the container satisfies that on a phone and also lets the 390 px fixtures cells show the behaviour inside a wide page. It also turns on when the table overflows sideways at a tablet width, so a scrollable table is never an unfocusable region (axe `scrollable-region-focusable`).
- **Long-text cell** leads with the real sites whose longest text (id, dataset or licence) is longest, not only the longest site id: the contract's site ids are all short, the long strings are dataset names.
- **Subsets are stated**: the hover, focus, selected, disabled and phone cells show six real sites spread evenly through the contract and the footer reads "Showing 6 of 54 sites"; only the default cell lists all 54.
- **Extra column option `numeric`** (and `nounSingular`, `rowAttributes`, `disabledIds`, `defaultSelectedId` on DataTable): needed for numeric cells, the one-row singular noun, forced fixture states and the Selected cell.
- **Error cell of the slider** holds a requested value outside the range at the end of the range (React Aria clamps) and marks it invalid, so "value outside the range" is shown by the helper text and `aria-invalid`, not by an impossible thumb position.
- **Added e2e coverage** the plan's `files_modified` omits (`fixtures-route.spec.ts`), as in 04-09 and 04-10, because the keyboard, region and axe behaviour must be proved in a real browser.
- The base Table's loading, empty and error states are drawn only in the DataTable section (the UI-SPEC says "details in DataTable").

**Total deviations:** 3 auto-fixed (Rule 1), 7 judgement calls. **Impact:** none on scope beyond the added e2e block and the extra optional props.

**Post-push (orchestrator):** CI on c2452ba failed the 04-09 live-tooltip e2e (3 tooltips after Escape, 2 expected): the page-wide `role=tooltip` count picked up an unrelated tooltip once 04-10/04-11 added a hover-opened Listbox tooltip and many more Tab stops. Fixed in ea7a718 by asserting on the positioned React Aria overlay with the live text and parking the pointer; 10/10 locally, full e2e 140 passed, CI green on ea7a718 (all jobs, visual 33/33).

## Verification run

- Task acceptance: `npx vitest run` for `slider`, `data-table`, `semantic-tokens`, `fixtures-registry` and `copy-claims` all pass; `npm run typecheck` exits 0; `NEXT_PUBLIC_DEV_FIXTURES=1 npm run build` exits 0 (also run by Playwright's webServer several times).
- Plan level: `npm test` 62 files, 1069 passed; `npm run lint` 0 errors, 19 warnings (unchanged); `npm run typecheck` clean; `check-feature-fence` OK (84 files), `check-contract-fence` OK (153 files); flag-less `npm run build` then `check-dev-fixtures-excluded.mjs`: marker absent from 372 built files, `/dev/fixtures/` and `/dev/fixtures/tokens/` both 404.
- Flake discipline: `slider.test.tsx` and `data-table.test.tsx` 5 of 5 repeats green; the 04-11 e2e block at `--repeat-each=5` 105 passed; whole fixture-mocked e2e project 140 passed (axe included) on the final tree.

## Known Stubs

None. The Retry, Clear filters and row-action handlers in the review cells that do nothing (hover, focus, disabled, empty, error) do so on purpose, as in 04-09 and 04-10; the default DataTable cell echoes its row action.

## Threat Flags

None. T-04-11-01 (mitigate): DataTable cells are React nodes built from contract strings by the caller; there is no `dangerouslySetInnerHTML` anywhere in the three primitives or sections. T-04-11-02 (mitigate): the caption and footer counts are computed from `rows` and `total`, never typed; unit tests change the rows and watch the counts follow, and the browser spec checks the live table against the contract's site count.

## Next Phase Readiness

Ready for 04-12. Later table consumers (the bench inspector, the evidence tables) import `DataTable` from `@/features/instrument` and the base pieces from `@/features/ui`. A new section that needs a phone layout can wrap its table in a `w-[390px] max-w-full` box and rely on the container measurement. Any browser spec that presses a fixtures control must still wait for the Direction radiogroup first.

## Self-Check: PASSED

- Created files exist on disk; commits `74b7c2b`, `ed317f7`, `7f07352`, `8493b45`, `3505f50`, `558acd3` exist in `git log`.
- Acceptance criteria and plan-level verification were re-run after the last code commit (see Verification run).
