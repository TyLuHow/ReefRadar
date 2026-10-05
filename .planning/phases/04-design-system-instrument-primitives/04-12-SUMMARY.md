---
phase: 04-design-system-instrument-primitives
plan: 12
subsystem: ui
tags: [command-palette, provenance, why-panel, react-aria-components, autocomplete, popover, sheet, fixtures, dev-fixtures, keyboard, e2e, integrity]

requires:
  - phase: 04-design-system-instrument-primitives
    provides: overlays (SurfaceModalOverlay, Sheet, DialogSurface panel pieces), Listbox, state primitives, fixtures registry, chrome and sections pattern (04-07 to 04-11)
provides:
  - "CommandPalette, CommandPaletteSurface and the CommandPaletteGroup/Item types (features/ui/CommandPalette.tsx)"
  - "ProvenanceChip, provenanceChipText (features/instrument/ProvenanceChip.tsx)"
  - "WhyPanel, WhyPanelBody, WhyPanelContent, WhyPanelSurface, whyPanelDataFromSite, WhyPanelData (features/instrument/WhyPanel.tsx)"
  - "safeHttpsUrl, doiUrl (features/instrument/safe-url.ts)"
  - "allExcerpts() accessor on lib/audio-manifest"
  - "Fixtures sections command-palette and provenance, registered in UI-SPEC order"
affects: [04-13, 04-21, 04-22, 04-23, phase-15-global-shortcut, fixtures, design-system]

actuals:
  tokens: 27400
  tasks: 2
  commits: 6

tech-stack:
  added: []
  patterns:
    - "A virtual-focus list (Autocomplete plus ListBox) scrolls inside a container that becomes a focusable labelled region once it overflows, because axe cannot see focusable content when focus stays in the input"
    - "Escape is taken in a capture handler on the palette so it closes in one press instead of clearing the search field first"
    - "The same filter function drives the visible list and the polite result count, so what is announced is what is listed"
    - "A chip whose kind needs data it does not have reads Source not recorded rather than a partial claim; every panel row stays and says Not recorded with the stored reason"
    - "Popover content is portalled into the instrument surface by a SurfacePopover that looks the surface up when it opens, as SurfaceModalOverlay does"

key-files:
  created:
    - dashboard-next/src/features/ui/CommandPalette.tsx
    - dashboard-next/src/features/instrument/ProvenanceChip.tsx
    - dashboard-next/src/features/instrument/WhyPanel.tsx
    - dashboard-next/src/features/instrument/safe-url.ts
    - dashboard-next/src/features/fixtures/sections/CommandPaletteSection.tsx
    - dashboard-next/src/features/fixtures/sections/ProvenanceSection.tsx
    - dashboard-next/tests/unit/command-palette.test.tsx
    - dashboard-next/tests/unit/provenance.test.tsx
  modified:
    - dashboard-next/src/features/ui/index.ts
    - dashboard-next/src/features/instrument/index.ts
    - dashboard-next/src/features/fixtures/registry.tsx
    - dashboard-next/src/features/fixtures/slugs.ts
    - dashboard-next/src/lib/audio-manifest.ts
    - dashboard-next/tests/e2e/fixtures-route.spec.ts

key-decisions:
  - "The search input is a searchbox (SearchField), not a combobox: React Aria's SearchField renders type=search, and aria-activedescendant on it is valid; the tests and e2e address it as role searchbox"
  - "aria-haspopup=dialog is set on the chip explicitly: React Aria's DialogTrigger sets only aria-expanded and (open) aria-controls for a dialog"
  - "The Why panel shows the full term list for every chip kind, so a source chip with a null DOI still shows the DOI row as Not recorded plus doi_note; Status basis shows only when the status is unknown or a basis is stored"
  - "The palette results scroll in a container that becomes a focusable labelled region when it overflows (axe scrollable-region-focusable); one extra Tab stop, only while overflowing"
  - "Links open in a new tab with rel noopener noreferrer and an sr-only notice; the Methods and limits destination must be a path or an https URL, anything else is dropped"

patterns-established:
  - "Static open-state cells for an overlay primitive use a Surface twin (CommandPaletteSurface, WhyPanelSurface, SheetSurface) built from the same body component"

requirements-completed: []
requirements-advanced: [DS-04, DS-05, DS-08]

coverage:
  - id: D1
    description: "The command palette opens from its opener or Ctrl+K and Cmd+K on the fixtures page, filters as the user types, moves the active result with the arrows, runs it with Enter and closes; Escape closes in one press and focus returns to the opener"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/command-palette.test.tsx#CommandPalette: keyboard"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#Ctrl+K opens the palette, typing filters and counts, arrows move, Enter runs and closes, #the button opens it, Escape closes it in one press and focus returns to the button, #Cmd+K opens it too"
        status: pass
    human_judgment: false
  - id: D2
    description: "A polite live region announces the computed result count after each filter, an empty filter shows the no-results text with the query, and the loading and error states replace the list"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/command-palette.test.tsx#CommandPalette: filtering and the live region, #CommandPalette: states"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#a query with no match says so and announces 0 results, #the static cells show computed counts, the no-results text and the loading and error states"
        status: pass
    human_judgment: false
  - id: D3
    description: "The result list scrolls inside a panel capped at 70dvh, the active result stays in view under arrow keys, and the scroll container is a focusable labelled region (axe clean)"
    requirement: DS-08
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#the result list scrolls inside a panel capped at 70dvh, #the arrow keys keep the active result inside the scrolling list, #axe: command-palette has no serious or critical violation in atlas|nocturne|poster"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Why panel shows who assigned the label, its definition in quotes, dataset, DOI, licence, dataset version, model version and recorded time for ind_H1 from the real contract; a missing field shows Not recorded with the stored reason (doi_note, status_basis) and is never dropped"
    requirement: DS-05
    verification:
      - kind: unit
        ref: "tests/unit/provenance.test.tsx#ProvenanceChip: the Why panel, #whyPanelDataFromSite"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#the label chip opens the Why panel with the contract fields, and Escape returns focus to the chip, #a missing DOI keeps its row and shows Not recorded with the stored reason"
        status: pass
    human_judgment: false
  - id: D5
    description: "Links in the Why panel are https only (or a site path for Methods and limits); DOIs link to https://doi.org/{doi}; a javascript:, http: or relative value renders as text"
    requirement: DS-05
    verification:
      - kind: unit
        ref: "tests/unit/provenance.test.tsx#safeHttpsUrl and doiUrl, #renders an unsafe URL as text and never as a link"
        status: pass
    human_judgment: false
  - id: D6
    description: "Long definitions and site ids wrap (underscore break opportunities, anywhere) and are never truncated; the panel is a popover from 640 px and a bottom sheet below; chip is 28 px with a 44 px hit area; the heavy top rule follows the direction"
    requirement: DS-05
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#long definitions wrap inside the panel and are never cut with an ellipsis, #on a phone the panel opens as a bottom sheet, #the chip is 28 px high with a 44 px hit area, #the Why panel has a 1 px ink border and a heavy top rule in atlas|nocturne|poster"
        status: pass
    human_judgment: false
  - id: D7
    description: "Both sections are axe-clean (serious/critical) in all three directions on real contract data"
    requirement: DS-08
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#axe: command-palette|provenance has no serious or critical violation in atlas|nocturne|poster"
        status: pass
    human_judgment: false
  - id: D8
    description: "The palette rows, chip look and Why panel read well (row density, chip proportions, dashed missing chip, panel rhythm) in all three directions"
    requirement: DS-08
    human_judgment: true
    rationale: "Checked by DOM, class and computed-style assertions and axe only; no screenshots were taken. Docker-pinned visual baselines and the owner's side-by-side direction review are later plans."

duration: 3h (includes a stalled session and a long machine pause)
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 12: Command Palette, ProvenanceChip and Why Panel Summary

**A keyboard-first command palette (Autocomplete plus ListBox in a modal; computed live result count, one-press Escape, results scrolling in a focusable region) and a ProvenanceChip whose Why panel shows who assigned a label, what it means, dataset, DOI, licence and contract stamp straight from the real contract, with Not recorded plus the stored reason for any gap and https-only links; each with a fixtures section on real sites, clips and stamp, verified in a production build across three directions.**

## What was built

- **Task 1** (RED `86f3422`, GREEN `cb9ad4b`): `CommandPalette` on React Aria `Autocomplete`, `SearchField`/`Input` and `ListBox` inside `SurfaceModalOverlay` and `Modal` (panel `bg-ground`, heavy top rule, `min(640px, 100% - 32px)`, 15vh from the top and 16 px on phones, `max-h-[70dvh]`). Rows: a status mark for sites, else a lucide kind icon (never a plain glyph), a semibold title, a muted second line, a mono kind label at the end. Groups are eyebrow-headed sections; a group with no match is not drawn. The filter is title-contains (case and accent insensitive); the same function counts results for the polite live region ("7 results", "1 result", "0 results") and the empty state reads "No results for “zzz”.". `state` loading and error replace the list. The footer hint hides on coarse pointers. The primitive registers no shortcut. `CommandPaletteSurface` draws the same panel in place for the static cells. `CommandPaletteSection` builds groups from every contract site, every committed audio excerpt (recorder-clock time) and the four method page names, registers Ctrl+K and Cmd+K on `window` for this section only (removed on unmount), and shows cells closed (live), open empty query, results ("ind"), no results ("zzz"), loading and error.
- **Task 2** (RED `85a9640`, GREEN `7b3d6e9`): `safeHttpsUrl` (absolute https, no credentials) and `doiUrl` (segments encoded, slashes kept); `WhyPanel`, `WhyPanelBody`, `WhyPanelContent`, `WhyPanelSurface` and `whyPanelDataFromSite`; `ProvenanceChip` (kinds source, label, model, missing; hover `panel-hover`, pressed `selected`, open `control`; dashed border and a 12 px unknown ring for missing; skeleton chip while loading; 28 px high with an invisible 44 px hit area and `data-hit-expanded`) opening a Popover from 640 px and a bottom Sheet below. `ProvenanceSection` is built from ind_H1's contract site, the contract manifest's `dataset_version`, `useModelVersion` and ind_H1's excerpt time; MISSING is the first null-DOI site (its real `doi_note`), LONG TEXT the site with the longest real definition; cells default, hover, focus, pressed (forced), active open, missing, loading, empty, error, long text and phone (390 px bottom sheet).
- **Browser coverage and a fix** (`77dbd21`, `c56aa02`): a 04-12 block in `fixtures-route.spec.ts` (23 specs: markers, Ctrl+K and Cmd+K, filter and count, arrows and Enter, one-press Escape and focus return, 70dvh cap, active result stays in view, static cells, Why panel fields and links, chip size and hit area, heavy rule per direction, missing DOI, dashed empty chip, wrapping, phone sheet, axe per section per direction). Axe flagged the scrolling list; see deviation 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The scrolling result list failed axe scrollable-region-focusable**
- **Found during:** Task 2 verification (first browser run of the 04-12 block; the two overflowing static palette cells, one failure per direction).
- **Issue:** focus stays in the search input and React Aria moves a virtual focus through the options, so axe finds no focusable content in the scroll container (`tabindex=-1` on the list or on the options was tried and does not satisfy it; only a tabbable element does).
- **Fix:** the list sits in a container that becomes a focusable, labelled region ("Results, scrollable", `role="region"`, `tabindex=0`) once it overflows, as the Dialog body already does; React Aria's `scrollIntoView` reaches the container, and an e2e spec proves the active result stays in view after 40 arrow presses. Costs one extra Tab stop, only while the list overflows.
- **Files modified:** `src/features/ui/CommandPalette.tsx`, `tests/unit/command-palette.test.tsx`, `tests/e2e/fixtures-route.spec.ts`
- **Commit:** `77dbd21`

**2. [Rule 1 - Bug] aria-haspopup and the input role did not match my first assumptions**
- **Found during:** Task 2 and Task 1 unit runs.
- **Issue:** `DialogTrigger` sets `aria-expanded` and `aria-controls` but not `aria-haspopup` for a dialog; the SearchField input is `type=search`, role searchbox, not combobox.
- **Fix:** the chip sets `aria-haspopup="dialog"` itself; the tests and e2e address the input as a searchbox.
- **Commits:** `cb9ad4b`, `7b3d6e9`

**3. [Rule 3 - Blocking] The audio manifest module had no accessor for every excerpt**
- **Found during:** Task 1 (the Clips group needs all excerpts; `compareLocations()` keeps one per status per location and would drop some).
- **Fix:** added `allExcerpts()` to `src/lib/audio-manifest.ts` (a file outside `files_modified`; five lines, read-only).
- **Commit:** `cb9ad4b`

**4. [Rule 1 - Bug] My scrolling-list e2e spec lost its first arrow press**
- **Found during:** full e2e project run (1 failure, then 11 of 12 repeats after an interim edit): a key pressed before React Aria wires the list to the input is dropped.
- **Fix:** each press repeats inside a poll until the active result moves, then the next; 12 of 12 and then the whole block at `--repeat-each=5` pass.
- **Commit:** `c56aa02`

### Plan variations (judgement calls)

- **Escape closes in one press**, taken in a capture handler: a SearchField would clear its text on the first Escape and close on the second.
- **`CommandPaletteSurface`, `WhyPanelBody`, `WhyPanelContent`, `whyPanelDataFromSite`, `provenanceChipText`, `SurfacePopover`, `overlayContainer` (barrel export)** are extra exports the plan's artifact list omits; the static cells, the phone sheet and the fixtures need them.
- **The Why panel shows the full term list for every kind** (spec table, "never silently dropped"), so the model chip's panel also shows Assigned by as Not recorded when no assigner is given; the fixtures pass the whole ind_H1 record to every chip.
- **Recorded** is shown from the committed audio excerpt of the site (ind_H1 has one); for a site with no committed excerpt it reads "Not recorded".
- **`wrap-anywhere`** is the Tailwind class used where the plan says `overflow-wrap:anywhere`.
- **Tab stop**: the palette gains one Tab stop (the results region) only while its list overflows.
- **Added e2e coverage** the plan's `files_modified` omits (`fixtures-route.spec.ts`), as in 04-09 to 04-11.
- **Not modified:** the plan's second-order groups Clusters and Questions are not drawn (no real data), as the plan states.

**Total deviations:** 4 auto-fixed (3 Rule 1, 1 Rule 3), 7 judgement calls. **Impact:** none on scope beyond the added e2e block, five extra optional exports and the one-line manifest accessor.

## Verification run

- Task acceptance: `command-palette` (22), `provenance` (29), `semantic-tokens`, `fixtures-registry` and `copy-claims` all pass; `grep -c safeHttpsUrl WhyPanel.tsx` is 4; `NEXT_PUBLIC_DEV_FIXTURES=1 npm run build` exits 0.
- Plan level: `npm test` 64 files, 1120 passed (a load-sensitive timing check in `monitoring-scrub.test.ts` failed once during a concurrent run and passed alone and on the full rerun); `npm run lint` 0 errors, 19 warnings (unchanged); `npm run typecheck` clean; `check-feature-fence` OK (90 files), `check-contract-fence` OK (159 files); flag-less `npm run build` then `check-dev-fixtures-excluded.mjs`: marker absent from 384 built files, `/dev/fixtures/` and `/dev/fixtures/tokens/` both 404.
- Flake discipline: `command-palette.test.tsx` and `provenance.test.tsx` 5 of 5 repeats green; the 04-12 e2e block 115 passed at `--repeat-each=5` on the final tree; the whole `fixtures-route.spec.ts` 460 passed at `--repeat-each=5` before the last test-only edit and 276 passed at `--repeat-each=3` after it; the whole fixture-mocked e2e project 163 passed (axe included) on the final tree. One earlier full-project run failed `axe: data-table ... nocturne` with a 30 s test timeout inside axe under 8-worker load (04-11 spec, unchanged by this plan); it passed 9 of 9 on rerun and in every later full run.
- Process note: a background e2e run reported "2.8h" and most specs not run (the machine paused); it was discarded and rerun in the foreground.

## Known Stubs

None. The `onAction` and `onRetry` handlers in the static review cells do nothing on purpose; the live palette cell echoes the result it ran.

## Threat Flags

None. T-04-12-01 (mitigate): every href in the Why panel passes `safeHttpsUrl` (https only, parsed with `URL`, no credentials) or, for Methods and limits, a same-site path check; DOIs are built with `doiUrl`; contract text is rendered only as React children; unit tests plant `javascript:` and `http:` values and assert no link. T-04-12-02 (mitigate): the Ctrl+K and Cmd+K listener is registered by `CommandPaletteSection` only and removed on unmount; the palette primitive registers nothing global (a unit test presses both chords and nothing opens).

## Next Phase Readiness

Ready for 04-13. Later consumers (Inspector, listen and compare compositions, the global shortcut in Phase 15) import `CommandPalette` from `@/features/ui` and `ProvenanceChip`, `WhyPanel`, `whyPanelDataFromSite` and `safeHttpsUrl` from `@/features/instrument`. A caller that has a contract site builds the panel with `whyPanelDataFromSite(site, { datasetVersion, modelVersion, recordedAt })`; anything it cannot supply stays null and reads "Not recorded". Browser specs that press a palette key must wait for the first option and repeat the press until the active result moves.

## Self-Check: PASSED

- Created files exist on disk; commits `86f3422`, `cb9ad4b`, `85a9640`, `7b3d6e9`, `77dbd21`, `c56aa02` exist in `git log`.
- Acceptance criteria and plan-level verification were re-run after the last code commit (see Verification run).
