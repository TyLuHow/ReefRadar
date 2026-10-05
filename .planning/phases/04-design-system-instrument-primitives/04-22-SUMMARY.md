---
phase: 04-design-system-instrument-primitives
plan: 22
subsystem: testing
tags: [e2e, playwright, a11y, axe, keyboard, touch-targets, reduced-motion, legacy-isolation, state-manifest, fixtures]
status: complete

requires:
  - phase: 04-design-system-instrument-primitives
    provides: the whole kit (04-02 to 04-21), the /dev/fixtures route, registry and slugs
provides:
  - "tests/e2e/support/fixtures.ts: openSection, liveCell, stateCell, surface, tabTo, startTabbing, focusIsInside"
  - "FIXTURE_STATE_MANIFEST (src/features/fixtures/state-manifest.ts): section slug to the data-fixture-state ids the UI-SPEC tables require"
  - "fixtures-keyboard, fixtures-a11y, fixtures-targets, reduced-motion, legacy-isolation and fixtures-state-manifest specs (263 tests)"
affects: [04-23, 04-24, phase-5, phase-6, phase-16]

requirements: [DS-04, DS-06, DS-08, DS-01]
requirements-completed: []

actuals:
  tokens: 19200
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "A section page is only measured once settled: every manifest cell mounted, no -loading placeholder, network idle, no aria-busy outside the loading cells, every well data-ready (otherwise every nothing-is-wrong assertion passes vacuously on a half-mounted page)"
    - "A hit area is probed, not trusted: the painted box plus a measured ::before/::after expansion, verified with document.elementFromPoint at its four extremes (and 6 px outside a data-hit-expanded control)"
    - "Every gate carries a self-check that proves its probe can fail (a low-contrast token override, a legacy route still at 150 ms, a playing Transport that does call requestAnimationFrame, a motion-allowed page that does find transitions)"

key-files:
  created:
    - dashboard-next/src/features/fixtures/state-manifest.ts
    - dashboard-next/tests/e2e/support/fixtures.ts
    - dashboard-next/tests/e2e/fixtures-keyboard.spec.ts
    - dashboard-next/tests/e2e/fixtures-a11y.spec.ts
    - dashboard-next/tests/e2e/fixtures-targets.spec.ts
    - dashboard-next/tests/e2e/reduced-motion.spec.ts
    - dashboard-next/tests/e2e/legacy-isolation.spec.ts
    - dashboard-next/tests/e2e/fixtures-state-manifest.spec.ts
  modified:
    - dashboard-next/src/features/ui/Table.tsx
    - dashboard-next/src/features/instrument/InstrumentHeader.tsx
    - dashboard-next/src/features/instrument/WhyPanel.tsx
    - dashboard-next/src/features/fixtures/sections/CompositionInspector.tsx
    - dashboard-next/src/features/fixtures/sections/MotionSection.tsx
    - dashboard-next/src/styles/tokens.css
    - dashboard-next/tests/e2e/fixtures-route.spec.ts

key-decisions:
  - "The manifest is written from the UI-SPEC state tables, not read back from the page, so a state a plan forgot to draw fails; every deliberate difference (n/a rows, states that are interactions on a live cell, CONTEXT's no-abstain WindowStrip) is commented where it applies"
  - "WindowStrip cells and StatusBand segments keep the 44 px height rule but not the 44 px width rule in the touch spec, because their width is data or time geometry; they have a stated floor and are listed below as an open design question"
  - "A link inside a sentence is exempt from the size rule (WCAG 2.5.8 inline exception); a link that stands alone on its line is a full 44 px target"
  - "openSection waits on state (manifest cells, network idle, no stray aria-busy, data-ready), never a fixed delay; the only fixed windows are the two requestAnimationFrame absence checks, which are absence assertions by nature"

patterns-established:
  - "New browser gates use openSection from support/fixtures.ts and scope every locator to a section or a cell"

completed: 2026-10-05
---

# Phase 4 Plan 22: Browser gates for the whole kit Summary

**263 new Playwright tests prove, in Chromium, that the kit meets its keyboard contract, is axe-clean (wcag2a, wcag2aa, wcag22aa, colour-contrast on) on all 32 fixtures pages in atlas, nocturne and poster, has 44 x 44 px hit areas under coarse-pointer emulation, animates nothing under reduced motion, does not leak into or from the legacy routes, and renders every state the UI-SPEC tables name; the gates found and fixed five touch-target defects in earlier plans' components.**

## Accomplishments

- `support/fixtures.ts`: `openSection` (mocked API, goto, chrome hydrated, fonts ready, manifest cells mounted, no `-loading` placeholder, network idle, no stray `aria-busy`, wells `data-ready`), `liveCell`, `stateCell`, `surface`, and the Tab helpers `startTabbing` and `tabTo` so keyboard contracts are reached through real Tab presses.
- `fixtures-keyboard.spec.ts` (18 tests): Dialog and AlertDialog (trap, hidden background, Escape, focus return, initial focus on "Keep comparison"), Sheet right and bottom, Listbox single (arrows, typeahead of the last contract site, Enter) and multiple (Space), Table and DataTable (one tab stop, ArrowDown and ArrowUp, header sort on Enter and Space, row action, selection), Slider and RangeSlider (names, words for values, the lower thumb stops at the upper), ToggleGroup, BandToggle (one band always on), Tooltip (opens on keyboard focus, Escape, focus stays), CommandPalette (Control+K, live count equals visible results, `aria-activedescendant` moves, Enter runs, Escape returns focus), Transport (ArrowRight 5 s, Home, Space), WindowStrip (one tab stop, End, Enter, 3 px ink outline), crossfader ("45% A, 55% B").
- `fixtures-a11y.spec.ts` (109 tests): all 32 `FIXTURE_SLUGS` x 3 directions, plus Dialog, Sheet, CommandPalette and Why panel open in each direction (all four assert the overlay is inside the instrument surface, so axe really sees it), plus a self-check that a near-ground `--dir-muted` override is reported as `color-contrast`. Only exclusion: `[data-visual="skip"]` (the WebGL map canvas).
- `fixtures-targets.spec.ts` (36 tests): per section at 390 px with `hasTouch` and `isMobile`, every `button, a[href], [role=slider], [role=option], [role=row], [role=switch]` has a probed 44 x 44 px hit area; the Button focus ring in each direction at 1440 is solid, equals the resolved `--dir-focus`, is not the legacy ochre, and has no box-shadow.
- `reduced-motion.spec.ts` (40 tests): all 32 sections under the OS preference and four (`motion`, `transport`, `compare`, `sheet`) under `?reduced=1`: `document.getAnimations().length === 0` and every element in the surface computes only `0s` transition durations; no rAF call in an idle second; under reduced motion a playing live Transport steps the playhead transform and the readout with zero rAF calls; two self-checks (a motion-allowed page does find transitions; a motion-allowed playing Transport does call rAF).
- `legacy-isolation.spec.ts` (12 tests): on `/dev/fixtures/tokens/` the body paints `--dir-ground`, `scroll-behavior` is `auto`, a keyboard-focused control rings in `--dir-focus`, a plain text element computes `transition: none` with no reduced-motion preference; on eight legacy routes (`/`, `/about/`, `/sites/`, `/dashboard/`, `/dashboard/analyze/`, `/dashboard/compare/`, `/dashboard/map/`, `/experience/`) the body is `rgb(26, 23, 20)`, `scroll-behavior` is `smooth` and no Newsreader, Hanken, Spline or Archivo face is in `document.fonts`; and the legacy 150 ms rule is confirmed still in force on `/about/`.
- `state-manifest.ts` and `fixtures-state-manifest.spec.ts` (48 tests): every manifest slug is registered, every registered slug has an entry, no duplicates, every listed cell is rendered, and the empty, loading and error states of the thirteen primitives named by the success criterion are listed independently of the manifest (so shrinking it cannot drop one).

## Task Commits

1. Helpers and keyboard spec: `4d3b6c1`
2. Component fixes found by the touch-target gate: `d28042d`
3. axe, touch target and focus ring specs, helper hardening, manifest: `31542c7`
4. Reduced motion, legacy isolation and state manifest specs: `828824e`

## Verification

- Specs written here, each `--repeat-each=5`: keyboard 90 of 90, targets 180 of 180, axe 545 of 545 (run per direction), reduced-motion plus legacy-isolation plus state-manifest 500 of 500.
- Full e2e project through an untracked local config (fresh server on port 3205, never reused, deleted before the final commit), in three shards, twice: 597 of 597 passed both times (215 + 217 + 165). The four heavy specs (axe, targets, reduced motion, keyboard) at `--workers=8`: 203 of 203.
- `npm test` 85 files, 1493 tests pass. `npm run lint` 0 errors (the 20 pre-existing warnings); `npm run typecheck` clean; `check-feature-fence.mjs` and `check-contract-fence.mjs` OK.
- Flag-less `npm run build` exit 0; `check-dev-fixtures-excluded.mjs` OK (marker absent from 486 files; both fixtures routes 404).
- `check-citations.mjs` reports `docs/CITATIONS.md` out of date only because of Windows CRLF (autocrlf); nothing here touches citations. CI is the judge for it and for the 33 legacy screenshot baselines (none of the files changed here is used by a legacy route).
- The new specs use `mockApi` and `expectNoUnhandledApiCalls` throughout, and depend on no port or local config, so they run under the repo `playwright.config.ts` in the CI `e2e` job unchanged.

## Deviations from Plan

### Auto-fixed Issues (component defects found by the new gates)

**1. [Rule 1 - Bug] Table column headers were 42.5 px high**
- **Found during:** Task 2 (touch targets, `table` and `data-table`)
- **Issue:** the sort headers (and so the header row) were `py-3` around a 12 px eyebrow line, 42.5 px: under the 44 px target.
- **Fix:** `h-11` on the column header (`features/ui/Table.tsx`).
- **Commit:** d28042d

**2. [Rule 1 - Bug] The `hit-area` expansion fell 2 px short on a bordered chip**
- **Found during:** Task 2 (`provenance`)
- **Issue:** `::after { inset: -8px }` is measured from the padding box, so the 28 px ProvenanceChip (1 px border) got a 42 px hit area, not 44. The existing route test asserted the literal `-8px`, so it could not see this.
- **Fix:** `inset: -9px` with a comment saying why (`tokens.css`); the route test now expects `-9px`.
- **Commit:** d28042d

**3. [Rule 1 - Bug] "Listen" header link was 42 px wide**
- **Found during:** Task 2 (the four compositions at 390 px)
- **Fix:** `min-w-11 justify-center` on the header link (`InstrumentHeader.tsx`).
- **Commit:** d28042d

**4. [Rule 1 - Bug] Why panel and Inspector links were 18 to 22 px high**
- **Found during:** Task 2 (`provenance`, `composition-inspector`)
- **Issue:** dataset, DOI, licence and "Methods and limits" links stand alone on a line (definition-list values) and had no usable hit area.
- **Fix:** `inline-flex min-h-11 items-center` on those links (`WhyPanel.tsx`, `CompositionInspector.tsx`; the Inspector's Source list is `items-center` so its labels stay centred on the taller rows).
- **Commit:** d28042d

**5. [Rule 1 - Bug] Two adjacent provenance chips had hit areas overlapping by 4 px**
- **Found during:** Task 2 (`composition-inspector`, `motion`)
- **Issue:** chips 12 px apart each reach 8 px beyond their edge, so the first chip's right edge resolved to the second chip.
- **Fix:** `gap-4` between the chips (`CompositionInspector.tsx`, `MotionSection.tsx`).
- **Commit:** d28042d

### Gate defect found and fixed in my own first pass (Rule 1)

**6. The first `openSection` let a half-mounted page pass every check vacuously**
- **Found during:** Task 2. A window-strip touch run checked 8 controls instead of 62.
- **Issue:** the contract-backed WindowStrip, Transport and compare cells show a loading skeleton with no `data-ready` and no `-loading` state id, so "no `[data-ready=false]`" held trivially while the page was still mounting. The first full axe run (108 of 108 green) was therefore partly vacuous.
- **Fix:** `openSection` now waits for every manifest cell, then network idle, then no `aria-busy` outside loading cells, then `data-ready`. The axe, targets and every other run reported above were made after this fix (axe re-run: 109 of 109, then x5).
- **Commit:** 31542c7

### Plan wording adapted

- `FIXTURE_STATE_MANIFEST` is typed `Record<string, string[]>`: there is no `FixtureSlug` type (slugs.ts exports a `readonly string[]`), and the spec asserts the keys against `FIXTURE_SLUGS`.
- The plan says to run locally in the background and poll; run in the foreground with output to a log, per this worktree's rules. The tooling runs a fresh build and server once, and later runs start the server only (`SKIP_BUILD` in the untracked local config).

## Open design questions for the owner

1. **WindowStrip cell width on a phone.** A cell is one 5 s window aligned under the time axis, so six windows are 39 x 44 px at 390 px (UI-SPEC: 44 high, 1 px gap; "cell narrower than 16 px" dense mode is narrower still, 13 x 44). The touch spec holds these to 44 px height and a 24 px width floor (dense: height only). Options: let the strip scroll horizontally on phones, drop time-axis alignment on phones, or accept 39 px with Transport's previous and next buttons as the 44 px path.
2. **StatusBand segment width.** A segment is sized by its count (UI-SPEC: minimum 4 px), so the 6-site "Restored (early)" segment is 34 x 64 px on a phone. Making it 44 px wide would distort the proportions the band exists to show. The touch spec checks height only. Option: on coarse pointers make the labels grid under the band the 44 px toggle targets and leave the band decorative.
3. **Inline attribution links.** The footer's licence and DOI links sit inside a sentence and are exempt (WCAG 2.5.8 inline exception), at 18 to 39 px high. If the owner wants 44 px there too, the footer would need to list its links on their own lines.

## Edits to shared files

`tokens.css` (the `hit-area` utility, 9 px), `Table.tsx` (column header `h-11`), `InstrumentHeader.tsx` (link `min-w-11`), `WhyPanel.tsx` (`LINK` and `MethodsLink`), `CompositionInspector.tsx` (link class, dl alignment, chip gap), `MotionSection.tsx` (chip gap), `fixtures-route.spec.ts` (one literal, `-8px` to `-9px`). No shared planning file was touched (STATE.md and ROADMAP.md are the orchestrator's).

## Known Stubs

None.

## Threat Flags

None. The only test-time hook is the init script that wraps `requestAnimationFrame` in the page under test (T-04-22 trust boundary), and every spec routes API and contract calls through `mockApi` and asserts none went unhandled (T-04-22-02). Violations were fixed in primitives; nothing is suppressed beyond the map canvas exclusion (T-04-22-01).

## Self-Check: PASSED

Created files exist, commits 4d3b6c1, d28042d, 31542c7 and 828824e are on the branch, the untracked local Playwright config and the scratch dump spec were deleted, and the working tree is clean apart from this summary.
