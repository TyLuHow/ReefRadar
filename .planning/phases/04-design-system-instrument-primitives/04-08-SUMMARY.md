---
phase: 04-design-system-instrument-primitives
plan: 08
subsystem: ui
tags: [state-primitives, empty-error-loading, skeleton, r-label, stat, accent-block, band-section, instrument-barrel, accessibility]

requires:
  - phase: 04-design-system-instrument-primitives
    provides: Button and LinkButton (04-05), token utilities in tokens.css and the semantic-token scanner (04-02, 04-04), the dsp barrel (04-03), the fixtures chrome that later plans append sections to (04-07)
provides:
  - "Skeleton, EmptyState, ErrorState, LoadingState exported from '@/features/ui'"
  - "RLabel, Stat, AccentBlock, BandSection exported from '@/features/instrument', which also re-exports the dsp barrel"
  - "LONG_WAIT_MS and LONG_WAIT_LABEL exported so a fixtures cell or a caller does not retype the 8 s rule"
affects: [04-09, 04-10, 04-21, fixtures, design-system]

actuals:
  tokens: 9800
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "State primitives carry honest words, never a spinner, icon or red; the copy pattern is '{what is missing or failed}. {what to do next}.'"
    - "A runtime read of a direction token (--max-blocks via getComputedStyle on the nearest [data-screen] or instrument surface) replaces any branch on the direction name"
    - "A dev-only check is gated on NODE_ENV or NEXT_PUBLIC_DEV_FIXTURES and de-duplicated per surface with a WeakMap, so two blocks in one tree log one error"
    - "A clipboard write reports its outcome in a polite live region, including the refusal, so the primitive never claims a copy that did not happen"

key-files:
  created:
    - dashboard-next/src/features/ui/Skeleton.tsx
    - dashboard-next/src/features/ui/EmptyState.tsx
    - dashboard-next/src/features/ui/ErrorState.tsx
    - dashboard-next/src/features/ui/LoadingState.tsx
    - dashboard-next/src/features/instrument/RLabel.tsx
    - dashboard-next/src/features/instrument/Stat.tsx
    - dashboard-next/src/features/instrument/AccentBlock.tsx
    - dashboard-next/src/features/instrument/BandSection.tsx
    - dashboard-next/src/features/instrument/index.ts
    - dashboard-next/tests/unit/state-primitives.test.tsx
    - dashboard-next/tests/unit/layout-primitives.test.tsx
  modified:
    - dashboard-next/src/features/ui/index.ts

key-decisions:
  - "ErrorState says so when the clipboard refuses ('The request id could not be copied. Select it and copy it by hand.') instead of staying silent or showing Copied"
  - "Stat renders an en dash for a non-finite value, so a failed computation never looks like a measurement"
  - "AccentBlock does nothing when it has no [data-screen] or instrument surface to measure, or when --max-blocks is not an integer, rather than guessing an allowance"
  - "The heading elements are chosen by a headingLevel prop (ErrorState 2 to 4, BandSection 1 to 3) so a page outline stays honest; the plan only named a fixed heading"

patterns-established:
  - "A dynamic heading tag is a capitalised const (Heading = `h${level}`), not createElement, because the react-hooks/refs lint rule flags a ref passed through createElement"

requirements-completed: []
requirements-advanced: [DS-05, DS-04]

coverage:
  - id: D1
    description: "EmptyState (block, inline, optional action), ErrorState (ERROR eyebrow, alert or status role, focus on the heading, request id with Copy and a polite Copied or refusal message, Retry, link) and Skeleton render with no icon, no red and no animation"
    requirement: DS-05
    verification:
      - kind: unit
        ref: "tests/unit/state-primitives.test.tsx#Skeleton, #EmptyState, #ErrorState"
        status: pass
    human_judgment: false
  - id: D2
    description: "LoadingState is a status region with aria-busy, skeleton children and a visible label; the label becomes 'This is taking longer than usual.' at 8000 ms (fake timers) or when elapsedMs is 8000 or more; its one timer is cleared on unmount"
    requirement: DS-05
    verification:
      - kind: unit
        ref: "tests/unit/state-primitives.test.tsx#LoadingState"
        status: pass
    human_judgment: false
  - id: D3
    description: "RLabel marks a reference label with a solid ink rule and REFERENCE LABEL and a model reading with a dashed ink rule and MODEL READING, with the same colour on both"
    requirement: DS-05
    verification:
      - kind: unit
        ref: "tests/unit/layout-primitives.test.tsx#RLabel"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stat takes a number and renders it in the numeral face and size; AccentBlock logs once with the count when a surface holds more blocks than --max-blocks allows (dev or flagged build only, silent in plain production); BandSection renders the band, eyebrow and display-xl headline"
    requirement: DS-05
    verification:
      - kind: unit
        ref: "tests/unit/layout-primitives.test.tsx#Stat, #AccentBlock, #BandSection, #instrument barrel"
        status: pass
      - kind: unit
        ref: "tests/unit/semantic-tokens.test.ts (scans src/features/ui and src/features/instrument: no hex literal, font family, px radius or direction branch)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The state and layout primitives look right (rule weights, the bar, the numeral size, band and accent contrast, skeleton visibility on each surface) in all three directions"
    requirement: DS-05
    human_judgment: true
    rationale: "Checked by class and DOM assertions only; no screenshots were taken. The fixtures sections for these primitives, and the Docker-pinned visual baselines and axe pass over them, are plan 04-09 and later, where the owner reviews the directions side by side."

duration: 8min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 08: State and Layout Primitives Summary

**Skeleton, EmptyState, ErrorState and LoadingState (no icon, no red, no spinner; an 8 s long-wait label; a request id that announces the real outcome of the copy) plus RLabel, Stat, AccentBlock (dev-only per-screen count against `--max-blocks`) and BandSection, with the instrument barrel re-exporting the DSP core.**

## What was built

- **Task 1** (`5927624`): `Skeleton` (static, `aria-hidden`, `rounded-surface`, `bg-track` / `bg-panel-hover` / `bg-well-raised` by `on`), `EmptyState` (block: dashed `border-rule-strong` box with `p-6`; inline: `border-t border-rule pt-4`; optional secondary Button or LinkButton action), `ErrorState` (start-edge `border-s-[3px] border-ink`, eyebrow ERROR, heading with `tabIndex={-1}` that takes focus when `focusOnMount`, `role` from `announce`, request id in `font-data`, Copy request id, Retry, optional quiet link), `LoadingState` (`role="status"`, `aria-busy="true"`, skeleton children, `text-small text-muted` label, one `setTimeout(8000)` cleared on unmount, `elapsedMs` shortcut). All four are exported from `features/ui/index.ts`, with `LONG_WAIT_MS` and `LONG_WAIT_LABEL`.
- **Task 2** (`90e34b2`): `RLabel` (`border-s border-ink ps-3`, `border-solid` or `border-dashed`, eyebrow per kind), `Stat` (`Intl.NumberFormat('en')` or `format`, `font-numeral text-numeral tabular`, label `max-w-[12ch]`), `AccentBlock` (`data-accent-block`, `bg-accent-block text-on-accent-block p-8`, lead `type-display text-h2`, dev check in an effect), `BandSection` (`w-full bg-band text-on-band`, eyebrow `type-eyebrow text-on-band-muted`, headline `type-display text-display-xl`), and `features/instrument/index.ts` (the four primitives plus `export * from './dsp'`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ErrorState heading ref tripped the `react-hooks/refs` lint rule**
- **Found during:** Task 1 (lint after the first green test run)
- **Issue:** the heading was built with `createElement(\`h${level}\`, { ref: headingRef, ... })`; React's compiler lint reads that as accessing a ref during render and reports an error.
- **Fix:** the tag is a capitalised const (`const Heading = \`h${headingLevel}\` as 'h2' | 'h3' | 'h4'`) and the ref is passed as a JSX prop. Behaviour is unchanged and the tests pass as before.
- **Files modified:** `dashboard-next/src/features/ui/ErrorState.tsx`
- **Commit:** 5927624 (fixed before the commit; the commit already carries the fix)

### Plan variations (judgement calls)

- **One commit per task, not RED then GREEN.** Task 1's tests were written first and run red (27 of 27 failing on the missing exports) before the components existed. Task 2's components and tests were written together and ran green on the first run, so its RED state was not observed. Neither task has a separate `test(...)` commit, to keep every commit green on the repo gates. Both tasks are `tdd="true"` inside a `type: execute` plan, so the plan-level TDD gate does not apply.
- **Added props the plan did not name:** `ErrorState.headingLevel` (2 to 4) and `BandSection.headingLevel` (1 to 3) so a consumer can keep a valid outline; `EmptyState` action also accepts `{ label, href }` (renders a LinkButton) next to `{ label, onPress }`; `className` on all primitives; `ErrorState` also reports a clipboard refusal (see key decisions).
- **No `outline-none` on the ErrorState heading.** The heading is focused by script after a user action, and the surface's `:focus-visible` rule gives it the direction's focus ring, which is the visible focus indicator a keyboard user needs.
- **No fixtures sections here.** The plan gives the primitives their fixtures sections in 04-09, so `registry.tsx` and `slugs.ts` are untouched and the flagged fixtures route was not re-run (only new exports were added to the ui barrel; nothing it renders changed).

**Total deviations:** 1 auto-fixed (Rule 1), 4 judgement calls. **Impact:** none on scope; all files are inside the plan's `files_modified` list.

## Verification run

- Task 1: `npx vitest run tests/unit/state-primitives.test.tsx tests/unit/semantic-tokens.test.ts tests/unit/copy-claims.test.ts` 65 passed.
- Task 2: `npx vitest run tests/unit/layout-primitives.test.tsx tests/unit/semantic-tokens.test.ts` 52 passed; `node ../scripts/check-feature-fence.mjs` OK (67 files); `npm run build` exit 0.
- Plan level: `npm test` 954 passed (up from 907); `npm run lint` 0 errors and the same 19 warnings as before; `npm run typecheck` clean; `check-feature-fence` OK and `check-contract-fence` OK (136 files); flag-less `npm run build` then `node ../scripts/check-dev-fixtures-excluded.mjs`: marker absent from 306 files, `/dev/fixtures/` and `/dev/fixtures/tokens/` both 404. The Playwright e2e project was not run: no fixtures section, legacy route or CSS changed.

## Known Stubs

None. Every primitive renders from its props; none is wired to placeholder data. The primitives have no consumer yet (their fixtures sections are 04-09), which is the plan's intent and not a stub.

## Threat Flags

None. T-04-08-01 (accepted): ErrorState writes only the id the caller passes, only on an explicit press, and renders no error message or stack (asserted in `state-primitives.test.tsx`).

## Next Phase Readiness

Ready for 04-09: the state and layout primitives are importable from `@/features/ui` and `@/features/instrument`, and `LONG_WAIT_MS` lets the LoadingState fixture cell show the long-wait label through `elapsedMs` without waiting 8 s. AccentBlock's check needs `data-screen` on the fixture cells (04-07's `StateCell` already sets it) and a `--max-blocks` token on the surface, which tokens.css defines per direction (1 in Atlas and Nocturne, 3 in Poster).

## Self-Check: PASSED

- Created files exist on disk (checked below with `[ -f ]`).
- Commits `5927624` and `90e34b2` exist in `git log`.
- Both tasks' acceptance criteria and the plan-level verification were re-run after the last code commit (see Verification run).
