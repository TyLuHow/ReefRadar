---
phase: 04-design-system-instrument-primitives
plan: 10
subsystem: ui
tags: [dialog, alertdialog, sheet, listbox, react-aria-components, fixtures, dev-fixtures, keyboard, e2e]

requires:
  - phase: 04-design-system-instrument-primitives
    provides: Button, ToggleGroup, Tooltip (04-05), the state primitives (04-08), the fixtures registry, chrome and sections pattern (04-07, 04-09)
provides:
  - "Dialog, AlertDialog, DialogSurface (features/ui/Dialog.tsx)"
  - "Sheet, SheetSurface (features/ui/Sheet.tsx)"
  - "Listbox, ListboxItem, ListboxSection (features/ui/Listbox.tsx)"
  - "Fixtures sections dialog, sheet and listbox, registered in UI-SPEC order"
  - "The /dev/fixtures phone section list as a bottom Sheet opened from a Sections button"
affects: [04-11, 04-21, 04-22, fixtures, design-system]

actuals:
  tokens: 52000
  tasks: 3
  commits: 11

tech-stack:
  added: []
  patterns:
    - "Open-state cells draw the panel statically (DialogSurface, SheetSurface) beside a live trigger cell; the live cells are what the browser keyboard and axe specs open"
    - "Overlays portal into the instrument surface root, looked up when the overlay opens (SurfaceModalOverlay), never at first render"
    - "A disabled list row explains itself in its own text (screen reader) and in a fixed-position tooltip after 300 ms of mouse hover; Escape dismisses it"
    - "A browser spec that presses a control waits for the client-only chrome first (the Direction radiogroup), because the Suspense fallback prerenders the same buttons without handlers"

key-files:
  created:
    - dashboard-next/src/features/ui/Dialog.tsx
    - dashboard-next/src/features/ui/Sheet.tsx
    - dashboard-next/src/features/ui/Listbox.tsx
    - dashboard-next/src/features/fixtures/sections/DialogSection.tsx
    - dashboard-next/src/features/fixtures/sections/SheetSection.tsx
    - dashboard-next/src/features/fixtures/sections/ListboxSection.tsx
    - dashboard-next/tests/unit/dialog.test.tsx
    - dashboard-next/tests/unit/sheet.test.tsx
    - dashboard-next/tests/unit/listbox.test.tsx
  modified:
    - dashboard-next/src/features/ui/index.ts
    - dashboard-next/src/features/fixtures/FixturesApp.tsx
    - dashboard-next/src/features/fixtures/registry.tsx
    - dashboard-next/src/features/fixtures/slugs.ts
    - dashboard-next/tests/e2e/fixtures-route.spec.ts

key-decisions:
  - "Overlays portal into the surface root (not document.body) so the next/font variables, reset rules and reduced-motion attribute that live on that subtree reach them; the root is resolved when the overlay opens because the prerendered fallback surface is discarded by the client"
  - "Dialog long-content cell shows each real site's own label definition (longest first), not the longest definition repeated under other sites' names, to keep attribution true"
  - "Listbox rows speak the status word in sr-only text, so the decorative StatusMark is never the only carrier of the status"
  - "The Listbox disabled-reason tooltip is hover-only and hand-placed (fixed position), because RAC's Tooltip needs a focusable trigger and a disabled option cannot take focus; the reason is also in the row text"

patterns-established:
  - "Shared overlay pieces (PanelLayout, CloseButton, OverlayBody, OVERLAY_SCRIM, SurfaceModalOverlay) live in Dialog.tsx and are imported by Sheet.tsx, not exported from the barrel"

requirements-completed: []
requirements-advanced: [DS-04, DS-08]

coverage:
  - id: D1
    description: "Dialog traps focus (Tab and Shift+Tab cycle), closes on Escape and returns focus to its trigger; the alertdialog starts on the safe action, ignores a scrim press and is cancelled by Escape"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/dialog.test.tsx"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#the live dialog traps focus, closes on Escape and returns focus to its trigger, #the alertdialog starts on the safe action and ignores a scrim press"
        status: pass
    human_judgment: false
  - id: D2
    description: "Sheet opens from the right or bottom with the dialog focus contract and dismisses by close button, scrim press and Escape; below 1024 px the fixtures section list opens from a Sections button in a bottom Sheet"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/sheet.test.tsx"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#a live sheet closes on Escape and on a scrim press, #below 1024 px the section list opens from a Sections button in a Sheet"
        status: pass
    human_judgment: false
  - id: D3
    description: "Listbox: arrow keys, Home, End, PageDown, typeahead, Enter in single and Space in multiple selection, 44 px rows, disabled item skipped with its reason, loading/empty/error states"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/listbox.test.tsx"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#the listbox moves with arrows, Home, End, PageDown and typeahead, and Enter selects"
        status: pass
    human_judgment: false
  - id: D4
    description: "Each primitive shows every UI-SPEC state on /dev/fixtures, axe-clean (serious/critical) in all three directions, and zero-length transitions under reduced motion"
    requirement: DS-08
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#axe: dialog|sheet|listbox has no serious or critical violation in atlas|nocturne|poster, #under reduced motion the overlay transitions are zero length"
        status: pass
    human_judgment: false
  - id: D5
    description: "The three new sections look right (rule weight, scrim, panel proportions, phone width, row density) in all three directions"
    requirement: DS-08
    human_judgment: true
    rationale: "Checked by DOM, class and computed-style assertions and axe only; no screenshots were taken. Docker-pinned visual baselines and the owner's side-by-side direction review are later plans."

duration: 150min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 10: Dialog, Sheet and Listbox Summary

**Dialog, AlertDialog, Sheet and Listbox on React Aria Components, token-only, each with a fixtures section on real contract sites, plus the Sheet-based phone section list; keyboard and axe verified in a production build across all three directions.**

## What was built

- **Task 1** (RED `3c2c5c1`, GREEN `d785a6a`): `Dialog` (RAC `DialogTrigger`, `ModalOverlay`, `Modal`, `Dialog`, `Heading`; no-blur scrim, heavy top rule, numeral-face roman title, 44 px Close, body that scrolls under fixed title and action rows, loading and error body states), `AlertDialog` (`role="alertdialog"`, safe action autofocused, scrim press ignored, Escape cancels, no Close button) and `DialogSurface` (same layout as a plain element). Dialog section: closed (live trigger), open, scrolling long content (real sites), loading, error, phone (358 px) and alertdialog (live trigger plus static surface with the UI-SPEC discard copy).
- **Task 2** (RED `820cc04`, GREEN `ad9bc52`): `Sheet` (right `min(420px,100%)`, bottom `max 85dvh`, heavy rule on the leading edge, 24 px translate plus fade over `--duration-base`, no handle) and `SheetSurface`. Sheet section: closed (two live triggers), open right, open bottom, long content (real sites with status words), loading, error. `FixturesApp` below 1024 px shows a secondary "Sections" Button that opens the same links in a bottom Sheet; a link press closes it.
- **Task 3** (RED `e1953ca`, GREEN `9f448ef`): `Listbox`, `ListboxItem`, `ListboxSection` (eyebrow `Header`), single and multiple selection (16 px square checkbox), 44 px rows with rule, inset focus ring, selected fill plus 3 px ink bar, optional status mark, description and trailing count, disabled item with reason, `state` loading (6 skeleton rows), empty and error. Listbox section on `useReferenceSites`: default (all sites, scrolling), hover and focus (forced), selected, multiple, disabled item (forced), loading, empty, error.
- **Tests**: `dialog.test.tsx` (26), `sheet.test.tsx` (15), `listbox.test.tsx` (24) with user-event keyboard contracts, and a 04-10 block in `fixtures-route.spec.ts` (21 specs: live dialog/alertdialog/sheet contracts, listbox keys and typeahead, Sections sheet at 800 and 1280 px, three directions, reduced motion, axe per section and per direction, axe with an overlay open).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Overlays never appeared in production builds**
- **Found during:** Task 3 verification (first run of the new e2e block against a production build; unit tests and `next dev` were green).
- **Issue:** the plan portals overlays to `document.body`; I portalled into the surface root so tokens, fonts and resets reach them, and resolved it in render. The prerendered page carries a fallback surface that the client discards, so the first-render lookup captured a node about to be removed; `aria-expanded` went true and nothing mounted. Bisected by dropping the container (worked), then logging the lookups (all three ran before the swap).
- **Fix:** `SurfaceModalOverlay` resolves the surface when the overlay opens (reads `OverlayTriggerStateContext`), holds it, and re-resolves if it is disconnected. Three unit tests pin the portal target, including a "surface replaced before open" case that fails on the old code.
- **Files modified:** `src/features/ui/Dialog.tsx`, `src/features/ui/Sheet.tsx`, `tests/unit/dialog.test.tsx`
- **Commit:** `bf577b7`

**2. [Rule 1 - Bug] Flaky focus assertions in my own unit and e2e tests**
- **Issue:** React Aria restores focus on the next frame after unmount, and after a scrim press it returns focus inside an alertdialog on the next frame; reads taken straight away were racy (3 of 5 repeats failed for the alertdialog spec).
- **Fix:** unit tests poll with `waitFor`; the e2e polls that focus is inside the dialog before pressing Escape. Specs re-run at `--repeat-each=10` (210 passed).
- **Commits:** `e132e90`, `5bc6def`

**3. [Rule 1 - Bug] The 04-09 live-tooltip spec hard-coded two static tooltips**
- **Issue:** the Listbox disabled-item cell draws a `TooltipSurface`, so the page has three static tooltips.
- **Fix:** the spec counts the static tooltips first and expects that many plus one. `--repeat-each=5` passed.
- **Commit:** `85ec426`

### Plan variations (judgement calls)

- **Dialog long-content cell** shows each real site's own label definition, led by the site with the longest one, instead of "the longest definition repeated across real site rows": repeating one definition under other sites' ids would misattribute a label (Core Value). Recorded here as the reason.
- **Status word in the row text.** The plan lists a status mark on listbox rows; the mark is decorative, so rows also carry the status word as `sr-only` text.
- **Disabled-row tooltip is hand-placed.** RAC's `Tooltip` needs a focusable trigger (a standalone one reads the trigger context and would crash), and a disabled option cannot take focus. The reason is in the row text; the tooltip is a fixed-position `TooltipSurface` on mouse hover (300 ms, touch ignored, Escape dismisses). A static `TooltipSurface` in the disabled-item cell shows what hover shows.
- **Scroll body focus.** The dialog and sheet body become a focusable labelled region only when they overflow (axe `scrollable-region-focusable`).
- **Added e2e coverage** the plan did not list (the plan's files_modified omits `fixtures-route.spec.ts`), as in 04-09, because success criterion 3 needs the keyboard and axe behaviour proved in a real browser.
- **Overlay transition resets.** Because overlays now portal into the surface, the surface's `transition: none` reset reaches them; opacity and translate transitions come only from the component utilities and compute to 0s under reduced motion (asserted).
- **Listbox fixtures omit trailing counts**: no site carries a real per-row count; the unit test covers the count slot.

**Total deviations:** 3 auto-fixed (Rule 1), 6 judgement calls. **Impact:** none on scope beyond the added e2e block and the portal-target fix.

**Post-push (orchestrator):** CI on 4c0a33c failed the unit job on `dialog.test.tsx` "a scrim press does nothing when isDismissable is false, and Escape still closes it": the same next-frame focus-restore race as the e2e alertdialog spec, unfixed in the unit test. Fixed in d2190cc (wait for focus back inside the dialog before Escape); 5/5 local repeats green, CI green on d2190cc (all jobs, visual 33/33).

## Verification run

- Task acceptance: `npx vitest run` for dialog, sheet and listbox plus `semantic-tokens`, `fixtures-registry` and (Task 3) `copy-claims` all pass; `grep -c Sections src/features/fixtures/FixturesApp.tsx` is 7; the flagged build ran through Playwright's webServer (`NEXT_PUBLIC_DEV_FIXTURES=1 npm run build`) several times and exited 0.
- Plan level: `npm test` 60 files, 1019 passed; `npm run lint` 0 errors, 19 warnings (unchanged); `npm run typecheck` clean; `check-feature-fence` OK (78 files), `check-contract-fence` OK (147 files); flag-less `npm run build` then `check-dev-fixtures-excluded.mjs`: marker absent from 354 built files, `/dev/fixtures/` and `/dev/fixtures/tokens/` both 404.
- Browser: 04-10 e2e block 21 specs at `--repeat-each=10` 210 passed; whole `fixtures-route.spec.ts` at `--repeat-each=5` 237 passed on the run before the final alertdialog wait (the only 3 failures, since fixed and re-run at 10 repeats); whole fixture-mocked e2e project 119 passed on the final tree (axe included).

## Known Stubs

None. The Retry and Done actions in the review cells do nothing on purpose (a review page has nothing to retry), as in 04-09.

## Threat Flags

None. T-04-10-01 (mitigate): contract strings (site ids, locations, label definitions) are only React text children, no `dangerouslySetInnerHTML`. T-04-10-02 (mitigate): RAC manages focus containment and hiding; Escape closes a Dialog and Sheet and cancels an AlertDialog, covered by unit tests and the e2e specs above.

## Next Phase Readiness

Ready for 04-11. Later overlay primitives (CommandPalette, Popover, Why panel) should import `SurfaceModalOverlay` and the shared panel pieces from `Dialog.tsx`. Any browser spec that presses a fixtures control must wait for the Direction radiogroup first (the fallback prerenders handler-less buttons).

## Self-Check: PASSED

- Created files exist on disk; commits `3c2c5c1`, `d785a6a`, `820cc04`, `ad9bc52`, `e132e90`, `e1953ca`, `9f448ef`, `bf577b7`, `0181daf`, `85ec426`, `5bc6def` exist in `git log`.
- Acceptance criteria and plan-level verification were re-run after the last code commit (see Verification run).
