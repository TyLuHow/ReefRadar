---
phase: 04-design-system-instrument-primitives
plan: 02
subsystem: ui
tags: [tailwind-4, design-tokens, css-first, theme-inline, directions, reduced-motion, token-bridge]

requires:
  - phase: 04-design-system-instrument-primitives
    provides: Tailwind 4 CSS-first build, legacy-neutral migration, fingerprint tooling (04-01)
provides:
  - src/styles/legacy.css (legacy dark CSS carried over verbatim; compiled output proven identical)
  - src/styles/tokens.css, the one token source: atlas, nocturne and poster direction blocks, @theme inline aliases, state variants, utilities, motion tokens, scoped legacy-leak resets
  - src/features/ui tokens bridge: JS_TOKEN_KEYS, readTokens, findSurfaceRoot, useTokens, TokenError
  - tests/unit/support/tokens-css.ts postcss parsers and the tokens.test.ts / tokens-bridge.test.ts gates
affects: [04-03, 04-04, 04-05, 04-06, 04-07, design-system, instrument-primitives]

actuals:
  tokens: 15700
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Raw per-direction --dir-* variables selected by data-direction on [data-surface='instrument']; Tailwind sees them only through @theme inline"
    - "Every token JavaScript reads is a six-digit sRGB hex; readTokens throws TokenError otherwise"
    - "Every new CSS rule is scoped to [data-surface='instrument'] (or html:has of it); a test enforces it"
    - "Token gates parse the real CSS with postcss; no TypeScript copy of a token value"

key-files:
  created:
    - dashboard-next/src/styles/legacy.css
    - dashboard-next/src/styles/tokens.css
    - dashboard-next/scripts/compile-css.mjs
    - dashboard-next/src/features/ui/tokens.ts
    - dashboard-next/src/features/ui/index.ts
    - dashboard-next/tests/unit/tokens.test.ts
    - dashboard-next/tests/unit/tokens-bridge.test.ts
    - dashboard-next/tests/unit/support/tokens-css.ts
  modified:
    - dashboard-next/src/app/globals.css
    - dashboard-next/tests/unit/vitality-removed.test.ts
    - dashboard-next/tests/unit/stack-consolidation.test.ts

key-decisions:
  - "Direction gutter at 1280 px is carried by --dir-gutter-wide inside each direction block and applied through one shared media rule, so the direction blocks keep one identical key set and nested directions still resolve per root"
  - "Font variables use var(--font-x, <generic>) so an undefined next/font variable (for example on <html>) falls back instead of invalidating the whole declaration"
  - "Motion tokens and view-transition resets are also set on html:has(surface) (additive) so ::view-transition-* rules and a later ViewTransition CSS can read --duration-view"
  - "Each focus-ring utility is a complete outline declaration (width, colour, offset) so utility ordering cannot change the result; apply one per element"

patterns-established:
  - "Legacy CSS lives only in src/styles/legacy.css; globals.css is the entry (tailwind, legacy, tokens, @source lines)"
  - "scripts/compile-css.mjs --normalize --out compares compiled legacy CSS before and after any CSS refactor"

requirements-completed: []
requirements-advanced: [DS-01, DS-06]

coverage:
  - id: D1
    description: "tokens.css defines every colour, type, radius, rule, focus, space and motion token with an identical key set for atlas, nocturne and poster, selected only by data-direction on the instrument surface"
    requirement: DS-01
    verification:
      - kind: unit
        ref: "tests/unit/tokens.test.ts#direction blocks"
        status: pass
    human_judgment: false
  - id: D2
    description: "Tailwind utilities for the tokens are @theme inline aliases of --dir-*; no new name collides with a legacy name, a legacy :root variable or a Tailwind default"
    requirement: DS-01
    verification:
      - kind: unit
        ref: "tests/unit/tokens.test.ts#@theme inline aliases, #no collision with a legacy name"
        status: pass
    human_judgment: false
  - id: D3
    description: "readTokens/useTokens give JavaScript hex tokens and throw TokenError on anything else; useTokens re-reads on data-direction, style and data-reduced-motion changes"
    requirement: DS-01
    verification:
      - kind: unit
        ref: "tests/unit/tokens-bridge.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "All four motion durations compute to 0ms under prefers-reduced-motion and data-reduced-motion='true' (CSS value; computed-style proof in a browser belongs to plan 04-03)"
    requirement: DS-06
    verification:
      - kind: unit
        ref: "tests/unit/tokens.test.ts#motion"
        status: pass
    human_judgment: false
  - id: D5
    description: "Relocating the legacy CSS leaves compiled legacy CSS identical, and adding tokens.css only adds lines scoped to the instrument surface"
    requirement: DS-01
    verification:
      - kind: other
        ref: "node scripts/compile-css.mjs --normalize before/after diff (identical); raw legacy vs raw with tokens: 0 removed lines"
        status: pass
      - kind: unit
        ref: "tests/unit/tokens.test.ts#scoping, tests/unit/legacy-baselines.test.ts"
        status: pass
      - kind: other
        ref: "CI visual job on the pushed commits"
        status: unknown
    human_judgment: false

duration: 14min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 02: Token source and bridge Summary

**One token file (`src/styles/tokens.css`) now defines atlas, nocturne and poster as `--dir-*` sets selected by `data-direction`, aliased to Tailwind through `@theme inline`, with zeroing motion durations, scoped legacy-leak resets and a hex-only `readTokens`/`useTokens` bridge, while the legacy CSS moved to `legacy.css` with byte-identical compiled output.**

## What was built

- **Task 1** (`e6d32d1`): `scripts/compile-css.mjs` compiles the single Tailwind entry with PostCSS and `@tailwindcss/postcss` (`--normalize`, `--out`). Every legacy rule moved verbatim and in order to `src/styles/legacy.css` under a "do not edit" header; `globals.css` is now `@import 'tailwindcss' source(none)`, the legacy import, and the four `@source` lines. Normalised compiled CSS before and after: `diff` prints nothing.
- **Task 2** (`3a2a2d9`): `src/styles/tokens.css` (the plan's seven items): three direction blocks from the UI-SPEC table (43 colours, 4 fonts, 17 shape/type/space keys each, plus the added `playhead`, `inverse`, `on-inverse`, `band-control-*`, `block-alt`, `on-block-alt`, `--max-blocks`), gutter steps 16/24/32/direction, motion tokens and both reduced-motion forms, the full `@theme inline` block, the three `*-state` custom variants, nine utilities, and the scoped resets (surface `transition: none`, focus ring, scrollbar, unlayered `scroll-behavior: auto` and ground/ink on `html:has(...)`, view transitions cut to 0s). `globals.css` imports it after `legacy.css`. `npm run build` is green.
- **Task 3** (TDD: RED `c9a294e`, GREEN `4e89b5a`): `tests/unit/support/tokens-css.ts` (`parseDirectionTokens`, `parseThemeInline`, `parseThemeKeys`, `parseThemeKeysOf`, `parseLegacyNames`, `HEX6`), `tokens.test.ts` (26 tests, `// @vitest-environment node`) and `tokens-bridge.test.ts` (9 tests, jsdom); then `src/features/ui/tokens.ts` and the barrel. Mutation check: breaking one hex, one oklch value and one duration made five tests fail, then the file was restored.

## Verification run

- `npx vitest run tests/unit/tailwind-v4-sources.test.ts tests/unit/legacy-baselines.test.ts`: pass.
- `npx vitest run tests/unit/tokens.test.ts tests/unit/tokens-bridge.test.ts`: 35 passed.
- `npm test`: 41 files, 575 passed, 0 failed (540 before, 35 new).
- `npm run lint`: 0 errors, 19 warnings (same count as 04-01; none in files from this plan).
- `npm run typecheck`: clean. `node ../scripts/check-feature-fence.mjs`: OK, 35 files.
- `npm run build`: green, route table unchanged.
- Legacy neutrality: raw compiled CSS without and with `tokens.css`, `diff | grep -c '^<'` prints 0 (nothing removed or changed); the added lines are the direction, gutter, motion and reset rules, all scoped to `[data-surface='instrument']` or `html:has(...)`, plus one inert `.tabular` utility (see below).
- Acceptance greps: each direction string present (2 occurrences each), `@theme inline` present, `grep -c "@import '../styles/tokens.css'"` prints 1, `grep -c "@import" globals.css` prints 2 before the tokens import was added (task 1 gate) and `@source` prints 4, `grep -c "export function readTokens"` prints 1.
- Not run here: the Playwright visual job (33 Linux baselines run in CI only) and a browser computed-style test; the plan did not call for either.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two legacy guard tests silently lost coverage after the CSS move**
- **Found during:** Task 1
- **Issue:** `vitality-removed.test.ts` (crossfader rules, no thumb-pulse, no `--reef-*`) and `stack-consolidation.test.ts` (no Leaflet rules) read `src/app/globals.css`. After the move that file is nearly empty, so the crossfader assertions would have failed and the others would have passed vacuously.
- **Fix:** both now read `app/globals.css` and `styles/legacy.css` together.
- **Files modified:** `dashboard-next/tests/unit/vitality-removed.test.ts`, `dashboard-next/tests/unit/stack-consolidation.test.ts` (outside this plan's `files_modified`; required by the move)
- **Commit:** e6d32d1

**2. [Rule 1 - Bug] Typecheck error in the new gate test**
- **Found during:** Task 3 GREEN verification
- **Issue:** postcss walk callbacks returned a `Map`/`Set` from an arrow function (`false | void` expected).
- **Fix:** braces around the three callbacks.
- **Files modified:** `dashboard-next/tests/unit/tokens.test.ts`
- **Commit:** 4e89b5a

### Plan variations (judgement calls, within the file's purpose)

- **Gutter wiring.** The plan said the 640/1024/1280 gutter steps use media blocks "with the same selectors" as the directions. The 1280 value is stored per direction as `--dir-gutter-wide` and applied by one shared media rule (`--gutter: var(--dir-gutter-wide)`). Same computed result, and the three direction blocks keep one identical key set (a gate requirement). `--dir-gutter-wide` is an extra key beyond the plan's list.
- **Font fallbacks.** `--dir-font-*` are `var(--font-x, <generic>), <generic>, <family>` rather than `var(--font-x), <generic>`, so an undefined next/font variable cannot invalidate the whole declaration (the `html:has(...)` form of each block is evaluated on `<html>`, where those variables are usually absent).
- **Motion on html.** The motion tokens and the reduced-motion resets also match `html:has([data-surface='instrument'])` so view-transition CSS on the root can read `--duration-view`. The view-transition resets are scoped to instrument pages (the plan's reduced-motion form was unscoped).
- **Focus-ring utilities** are full outline declarations each, instead of `focus-ring-well` and `focus-ring-accent` only overriding colour, so utility sort order cannot decide the colour. Apply one per element.
- **useTokens** reads from the surface root (found through `closest`), not the ref element, and throws a `TokenError` during render (error boundary) when validation fails instead of throwing inside the observer callback.
- **Collision gate** also compares against Tailwind's own default theme keys (`node_modules/tailwindcss/theme.css`), which the plan did not list, because overriding a default would restyle legacy.

**Total deviations:** 2 auto-fixed (2 Rule 1), 6 recorded judgement calls. **Impact:** none on scope; the two test edits restore guard coverage the plan's move would otherwise have weakened.

## Known notes (not stubs)

- A single `.tabular` utility rule is emitted into the compiled CSS because the word appears in a comment in `src/features/charts/encodings.ts` and Tailwind's scanner treats it as a candidate. No legacy element has the class `tabular`, so it matches nothing; it is the only addition outside the instrument scope.
- DS-01 stays pending (the plan completes only the token source; the requirement still waits on the later token plans). DS-06 is groundwork only (CSS durations and reset values); the Playwright reduced-motion computed-style test is plan 04-03 or later. Neither was marked complete in REQUIREMENTS.md.
- The `next/font` calls that define `--font-newsreader-*`, `--font-hanken`, `--font-spline-mono` and `--font-archivo-black` do not exist yet (plan 04-06); until then the generic fallbacks apply.

## Known Stubs

None.

## Threat Flags

None. T-04-02-01 mitigated by hex-only validation in `readTokens` plus the gate over every direction; T-04-02-02 mitigated by scoping every new rule to the instrument surface (enforced by `tokens.test.ts#scoping`), identical compiled legacy CSS after the move, and the unchanged baseline hash test. CI `visual` job (33 baselines) is the final authority and has not yet run on these commits.

## Self-Check: PASSED

- Created files exist: `src/styles/legacy.css`, `src/styles/tokens.css`, `scripts/compile-css.mjs`, `src/features/ui/tokens.ts`, `src/features/ui/index.ts`, `tests/unit/tokens.test.ts`, `tests/unit/tokens-bridge.test.ts`, `tests/unit/support/tokens-css.ts` (checked with `[ -f ]`).
- Commits `e6d32d1`, `3a2a2d9`, `c9a294e`, `4e89b5a` exist in `git log`.
- TDD gate: `test(04-02)` commit `c9a294e` precedes `feat(04-02)` commit `4e89b5a`.
- All task acceptance criteria and the plan-level verification re-run green (see Verification run).
