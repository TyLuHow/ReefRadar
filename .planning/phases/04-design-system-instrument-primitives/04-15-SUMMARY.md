---
phase: 04-design-system-instrument-primitives
plan: 15
subsystem: ui
tags: [transport, band-toggle, window-strip, react-aria, web-audio, focus-management, integrity, fixtures]
status: complete

requires:
  - phase: 04-design-system-instrument-primitives
    provides: ToggleGroup (04-05), Slider (04-11), Spectrogram and useClipSpectrogram (04-13), audio engine, playhead clock and useTransport (04-14)
provides:
  - "Transport, formatClock, formatScrubText, transportKeyAction (features/instrument/Transport.tsx)"
  - "BandToggle, isBandAboveLimit, bandLimitReason, formatBandRange (features/instrument/BandToggle.tsx)"
  - "WindowStrip, WindowCell, readingOpacity, energyOpacity, isDenseStrip, windowOptionName, windowLegend (features/instrument/WindowStrip.tsx)"
  - "/dev/fixtures sections transport, window-strip, band-toggle on the real ind_H1 clip"
affects: [04-16, 04-21, 04-22, phase-5, phase-6, phase-7]

actuals:
  tokens: 31700
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Controlled Transport over useTransport: the component renders status, position and duration and reports presses and keys; it never starts audio"
    - "Important-modifier utilities (size-14!, bg-control!) to override the icon Button variant's own size and colours without relying on cascade order"
    - "A disabled segment's tooltip hangs on a wrapper that takes the pointer; the reason is also in the segment's text for touch and assistive technology"
    - "Selecting the already-selected option is reported from a capture-phase handler, because React Aria reports nothing for it and stops Enter and Space at the option"
    - "A strip below a well is inset to the well's measured [data-plot] box so cell k lies under seconds 5k to 5k + 5"

key-files:
  created:
    - dashboard-next/src/features/instrument/Transport.tsx
    - dashboard-next/src/features/instrument/BandToggle.tsx
    - dashboard-next/src/features/instrument/WindowStrip.tsx
    - dashboard-next/src/features/fixtures/sections/TransportSection.tsx
    - dashboard-next/src/features/fixtures/sections/BandToggleSection.tsx
    - dashboard-next/src/features/fixtures/sections/WindowStripSection.tsx
    - dashboard-next/src/features/fixtures/parts/useFixtureClip.ts
    - dashboard-next/tests/unit/transport.test.tsx
    - dashboard-next/tests/unit/band-toggle.test.tsx
    - dashboard-next/tests/unit/window-strip.test.tsx
    - dashboard-next/tests/e2e/fixtures-transport.spec.ts
  modified:
    - dashboard-next/src/features/instrument/index.ts
    - dashboard-next/src/features/instrument/useTransport.ts
    - dashboard-next/src/features/fixtures/registry.tsx
    - dashboard-next/src/features/fixtures/slugs.ts

key-decisions:
  - "useTransport's return type is renamed TransportController so the component can be called Transport (the barrel exported a type of that name from 04-14)"
  - "Window numbers in names are one-based ('Window 4' covers 15 to 20 s) while the index prop is zero-based; fixture notes saying 'window 2' mean index 1 (5 to 10 s)"
  - "The Transport restores focus after the loading moment that follows a press: Chrome drops focus to the body, without a blur event, when the focused control becomes disabled, so a keyboard user could not pause with Space"
  - "WindowStrip legend lines are computed from what is on screen: model legend only when a cell has a reading, energy legend for energy cells, 'No model readings exist for these windows yet.' otherwise"
  - "Fixture BandToggle states that in this fixture the selection filters no audio, because the engine has no band filter yet; the UI-SPEC help text 'Playing the selected bands' is kept for the component"

patterns-established:
  - "Pointer events on a native disabled button are unreliable, so the button gets pointer-events-none and the wrapper owns hover"
  - "e2e: getByRole('group', { name, exact: true }) when a child slider group's name begins with the same words"

requirements-completed: [DS-05, DS-06, DS-08]

duration: about 3 h
completed: 2026-10-05
---

# Phase 4 Plan 15: Transport, BandToggle and WindowStrip Summary

**Transport plays the real ind_H1 clip through useTransport in three sizes with a keyboard contract, BandToggle disables bands above the recording limit and always keeps one on, and WindowStrip draws 5 s windows as unclassified or measured-energy cells only, so no model output is invented.**

## Accomplishments

- `Transport` (compact 44, medium 56 or 64, large 96/80/72): previous window, play or pause or replay, next window, a `00:12.4 / 00:30.0` readout with the muted denominator, optional scrub slider ("Playback position", "0:12 of 0:30") and hint line hidden on coarse pointers. Space, Left and Right (one 5 s window), Home and End work inside the group; a focused button keeps its own Space and the slider keeps the arrows. All states carry the UI-SPEC copy (disabled, loading, empty, error with Retry, unsupported with no buttons).
- `BandToggle` on the kit ToggleGroup (multiple, `disallowEmptySelection`): label plus range ("0 to 2.7 kHz"); a band whose `lowHz` is at or above the Nyquist is disabled with "Above this recording's 8 kHz limit." in its text and a hover tooltip; a disabled band is never reported as selected; loading, empty and error states.
- `WindowStrip` on a horizontal RAC ListBox: four cell kinds (reading, abstain, empty, energy), option names such as "Window 4, 0:15 to 0:20, healthy, 58%", tooltips on hover and keyboard focus, selected, playing bar, dense mode below 16 px measured with a ResizeObserver, computed legend and summary, disabled/loading/empty/error states.
- Three fixtures sections. The Transport live cell and a WindowStrip live cell (spectrogram, strip and Transport wired through `useTransport`: choosing a window seeks to its start) use the committed ind_H1 excerpt. No fixture cell shows a model reading or an abstain (T-04-15-01): the page has zero `reading` and zero `abstain` cells, asserted in e2e.

## Task Commits

1. Task 1: Transport and the transport section - `d8d1e6b` (feat; RED confirmed first, 31 of 31 failed before the component existed)
2. Task 2: BandToggle and WindowStrip with their sections - `a7037e7` (feat; includes the focus-restore fix and the e2e spec)

## Verification

- Unit: `npm test` 72 files, 1310 tests passed. transport (35), band-toggle (17), window-strip (34) each run 5 times in a row with no failure. `semantic-tokens`, `fixtures-registry` and `copy-claims` pass.
- `npm run lint` 0 errors (20 pre-existing warnings, none new), `npm run typecheck` clean.
- Flagged build (`NEXT_PUBLIC_DEV_FIXTURES=1`, via the Playwright web server) exits 0. Flag-less `npm run build` exits 0; `check-dev-fixtures-excluded.mjs` OK against it (fixtures routes 404); contract-fence, feature-fence and citations scripts OK.
- Playwright e2e project, full: 235 passed (includes the new `fixtures-transport.spec.ts`, 40 tests, axe with zero serious or critical violations for transport, window-strip and band-toggle in atlas, nocturne and poster). New spec with `--repeat-each=5`: 200 of 200 passed. `fixtures-route.spec.ts` with `--repeat-each=3`: 276 of 276 passed.
- Live cell: in headless Chromium a click on Play moved the status to `playing` and the readout advanced from the AudioContext clock; Space paused from the focused button and from the scrub slider; the arrows, Home and End moved 5 s, to the start and to the end ("Replay"); under `?reduced=1` playback still started and the readout ran.
- Strip: first and last cell edges lie within 2 px of the plot's edges; dense cell has `data-dense="true"`, six 44 px high cells narrower than 16 px and no glyphs; wide strips are not dense.

Not verifiable here: audible output and Safari (headless Chromium has no listener, so the specs assert transport state and the clock-driven readout), and the 1 Hz reduced-motion playhead stepping (covered by 04-14's clock unit tests, not re-measured in the browser). Docker-pinned visual baselines are not part of this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pressing Play dropped keyboard focus to the page body**
- **Found during:** Task 2 (live e2e: Space did not pause after a click)
- **Issue:** After a press `useTransport` reports `loading` while the clip decodes; the disabled buttons (and the unmounted slider) lose focus, and Chrome gives no blur event, so the next Space went to the body.
- **Fix:** The Transport notes where focus was when its controls become unusable and restores it when they return (unless the person focused something else); the scrub slider stays mounted, disabled, during `loading`. Unit tests swallow blur and focusout to mimic Chrome; they fail without the fix and pass with it.
- **Files modified:** dashboard-next/src/features/instrument/Transport.tsx, dashboard-next/tests/unit/transport.test.tsx
- **Commit:** `a7037e7`

**2. [Rule 3 - Blocking] Name collision on `Transport`**
- **Found during:** Task 1
- **Issue:** The barrel already exported a type `Transport` (useTransport's return), which collides with the required component name.
- **Fix:** Renamed the type to `TransportController` (04-14 file, rename only, no other consumers).
- **Files modified:** dashboard-next/src/features/instrument/useTransport.ts, index.ts
- **Commit:** `d8d1e6b`

**3. [Rule 3 - Blocking] Selecting the already-selected window reported nothing**
- **Found during:** Task 2 (unit test)
- **Issue:** React Aria reports no change, and stops Enter and Space at the option, so the Transport could not return to a window's start.
- **Fix:** A capture-phase handler on the strip reports Enter, Space and click on the selected window; an unselected window still reports through the selection change, never twice.
- **Commit:** `a7037e7`

### Additions beyond files_modified (supporting files)

- `dashboard-next/src/features/fixtures/parts/useFixtureClip.ts`: one shared hook (manifest excerpt, caption, loading and error mapping) so the three sections do not triplicate it.
- `dashboard-next/tests/e2e/fixtures-transport.spec.ts`: the real-browser checks the plan's verification asks for (live playback, keys, alignment, dense mode, axe).
- `dashboard-next/src/features/instrument/useTransport.ts`: the type rename above.

### Interpretation notes (not rule deviations)

- The hatched abstain fill is a Tailwind arbitrary class rather than an inline style: jsdom drops a `repeating-linear-gradient` style value, and the class is also what the semantic-token scanner prefers.
- A disabled BandToggle segment uses a wrapper for its tooltip (a native disabled button swallows hover and focus) instead of wrapping the button in the RAC `Tooltip`; the reason is also in the segment's text.
- The plan's "window 2" fixtures use index 1 (5 to 10 s), matching the energy example name "Window 2, 0:05 to 0:10".
- The fixtures' selection in BandToggle filters no audio (no band filter in the engine yet); the section says so.
- The dense fixture cell's legend wraps in the 80 px container, because the legend belongs to the strip. Cosmetic, fixtures only.
- TDD: the Transport and WindowStrip/BandToggle tests were written before the components; RED was run and recorded for Transport and the focus fix. For BandToggle and WindowStrip the first run was after the components existed (all but two tests passed on the first run, and those two exposed the reselect and aria-disabled gaps fixed above).

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking). **Impact:** none on scope; the focus fix is a real usability improvement for every later Transport consumer.

## Known Stubs

None. Static fixture cells have no-op handlers by design, labelled as drawn for review.

## Threat Flags

None. T-04-15-01 (per-window readings must not be invented) is mitigated: fixtures render null readings and measured energy only, the legend states that no model readings exist, and the reading and abstain paths are reached only from unit-test inputs. No new network surface (the engine fetches nothing; the clip loads through the existing /audio/ allow-listed loader).

## Next Phase Readiness

Ready for 04-16 (CompareRow and CompareDeck): `Transport` takes `size="medium" medium="compare"` and `tone`, and `useTransport` already supports two synchronised clips and `setMix`. Open items for later phases: the cited band table and names (Phase 7), per-window model readings (Phase 5), real long uploads that may move the dense threshold (Phase 10), the band filter in the audio engine.

## Self-Check: PASSED

- Files exist: Transport.tsx, BandToggle.tsx, WindowStrip.tsx, the three sections, useFixtureClip.ts, the three unit tests and fixtures-transport.spec.ts (checked on disk).
- Commits `d8d1e6b` and `a7037e7` present in `git log`.
- All task acceptance criteria re-run and green (vitest, flagged build, flag-less build, lint, typecheck, fences, full e2e).
