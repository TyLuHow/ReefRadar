---
phase: 04-design-system-instrument-primitives
plan: 04
subsystem: ui
tags: [design-tokens, contrast, cvd, culori, status-palette, status-mark, observable-plot, semantic-tokens]

requires:
  - phase: 04-design-system-instrument-primitives
    provides: tokens.css direction blocks and the postcss token parsers (04-02)
provides:
  - status-palette.test.ts, the DS-02 palette gate (CVD, lightness order, hue order, accent separation, 3:1 marks) for atlas, nocturne and poster
  - token-contrast.test.ts, the UI-SPEC contrast pair table (17 text pairs at 4.5, 8 non-text pairs at 3) per direction
  - semantic-tokens.test.ts with the exported findRawValues scanner over the design-system folders
  - features/ui status-shapes.ts, the one status geometry module (React marks, Plot symbols), and StatusMark
affects: [04-05, 04-06, 04-07, 04-08, 04-09, 04-10, design-system, instrument-primitives]

actuals:
  tokens: 10400
  tasks: 3
  commits: 4

tech-stack:
  added: [culori 4.0.2 (dev), "@types/culori 4.0.1 (dev)"]
  patterns:
    - "Palette and contrast gates parse the real tokens.css; no TypeScript copy of a colour value"
    - "One geometry table drives both the SVG path strings and the Plot symbol draw calls"
    - "Status marks are token-only: fill and stroke are var(--dir-*) references, never a hex"

key-files:
  created:
    - dashboard-next/tests/unit/status-palette.test.ts
    - dashboard-next/tests/unit/token-contrast.test.ts
    - dashboard-next/tests/unit/semantic-tokens.test.ts
    - dashboard-next/tests/unit/status-mark.test.tsx
    - dashboard-next/src/features/ui/status-shapes.ts
    - dashboard-next/src/features/ui/StatusMark.tsx
  modified:
    - dashboard-next/package.json
    - dashboard-next/package-lock.json
    - dashboard-next/src/features/ui/index.ts
    - dashboard-next/src/features/ui/tokens.ts
    - dashboard-next/src/styles/tokens.css

key-decisions:
  - "Fill-on-hover is measured and printed, not gated: restored_early (2.88 atlas, 2.80 poster) and unknown (2.93, 2.85) fall under 3:1 on panel-hover; the mark-outline carries the 3:1 boundary there"
  - "In nocturne the mark-outline equals the ground colour, so the boundary gate falls back to the fill (every fill is at least 4.81:1 on all four nocturne grounds); light directions must pass on the outline"
  - "Nocturne accent and focus move #a5b4fc to #96a9ff and poster accent moves #c2005f to #bd0047, the nearest values that pass accent separation; status palettes and every threshold are unchanged"
  - "The RESEARCH fallback palette was not needed: the contract palette passes every gate it is held to"

patterns-established:
  - "findRawValues(text, file) blanks comments, then applies raw-value and direction rules with per-file exemptions that each carry a reason"
  - "Status marks use presentation attributes with var() (fill, stroke, stroke-width), vector-effect non-scaling-stroke"

requirements-completed: []
requirements-advanced: [DS-01, DS-02]

coverage:
  - id: D1
    description: "Every direction's text pairs reach 4.5:1 and its focus, rule-strong, well-rule and accent-block focus pairs reach 3:1, checked over the parsed tokens.css"
    requirement: DS-01
    verification:
      - kind: unit
        ref: "tests/unit/token-contrast.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Five status tones stay at least 15 CIEDE2000 apart under normal, protanopia, deuteranopia and tritanopia, adjacent L* at least 9, warm before cool, unknown neutral and at least 15 from every tone, every fill 3:1 on ground and panel"
    requirement: DS-02
    verification:
      - kind: unit
        ref: "tests/unit/status-palette.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every status mark boundary reaches 3:1 on ground, panel, panel-hover and selected, and the accent is at least 10 CIEDE2000 from every status tone in every simulation and is never a status colour"
    requirement: DS-02
    verification:
      - kind: unit
        ref: "tests/unit/status-palette.test.ts#mark boundary, #accent"
        status: pass
    human_judgment: false
  - id: D4
    description: "No file under features/ui, features/instrument, features/fixtures or app/dev names a raw hex, rgb(), font family, pixel radius or a direction branch"
    requirement: DS-01
    verification:
      - kind: unit
        ref: "tests/unit/semantic-tokens.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "One geometry module defines the five status shapes for React marks and Plot symbols; StatusMark renders them aria-hidden at 12/16/20/24 with token colours"
    requirement: DS-02
    verification:
      - kind: unit
        ref: "tests/unit/status-mark.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "The marks look right and distinct by shape in all three directions in a browser"
    requirement: DS-02
    human_judgment: true
    rationale: "Visual judgement of the rendered marks belongs to the fixtures route and owner review (plans 04-09/04-10); this plan has unit proof of geometry and token wiring only"

duration: 10min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 04: Palette and contrast gates, StatusMark Summary

**Palette, contrast and semantic-token rules are now CI gates over the parsed `tokens.css` (culori CIEDE2000 under Machado simulations), and `features/ui` has one status geometry module feeding `StatusMark` and Observable Plot symbols.**

## What was built

- **Task 1** (`83fb75f`): `culori` 4.0.2 and `@types/culori` 4.0.1 as exact dev dependencies (the package carries no types of its own; `npm view culori@4.0.2 types` is empty). `status-palette.test.ts` runs 21 checks per direction; `token-contrast.test.ts` runs the UI-SPEC pair table per direction. Atlas passed everything on the contract palette. Nocturne and poster failed only accent separation, so their accents moved (below).
- **Task 2** (`e002f18`): `semantic-tokens.test.ts` exports `findRawValues`. 16 planted violations trip it, 12 look-alikes (`href="#dialog"`, `id="tokens"`, `var(--dir-font-data)`, `var(--display-style)`, a regex for hex, a sort descriptor `direction ===`, `flexDirection`) do not. The real scan of the design-system folders is empty.
- **Task 3** (RED `dafa569`, GREEN `8e6abec`): `status-shapes.ts` holds a single geometry table that generates the SVG path strings and the Plot `draw(context, size)` calls (box side is the square root of the requested area, d3 convention). `StatusMark` is an `aria-hidden` 16-unit svg at sizes 12/16/20/24 with `var(--dir-hab-*)` fill and `var(--dir-mark-outline)` stroke; unknown is a hollow ring with a 2.5 stroke. Both are exported from `features/ui`.

## Palette outcomes

Fill contrast, printed by the gate (ratio on each ground):

| Direction | Tone | ground | panel | panel-hover = selected |
|-----------|------|--------|-------|------------------------|
| atlas | degraded | 6.79 | 6.07 | 5.60 |
| atlas | restored_early | 3.50 | 3.13 | **2.88** |
| atlas | restored_mid | 4.89 | 4.37 | 4.03 |
| atlas | healthy | 10.72 | 9.58 | 8.84 |
| atlas | unknown | 3.56 | 3.18 | **2.93** |
| nocturne | degraded / early / mid / healthy / unknown | 6.02 / 11.87 / 5.79 / 12.63 / 7.86 | 5.61 / 11.06 / 5.40 / 11.77 / 7.33 | 5.00 / 9.86 / 4.81 / 10.50 / 6.53 |
| poster | degraded | 6.79 | 6.07 | 5.44 |
| poster | restored_early | 3.50 | 3.13 | **2.80** |
| poster | restored_mid | 4.89 | 4.37 | 3.92 |
| poster | healthy | 10.72 | 9.58 | 8.59 |
| poster | unknown | 3.56 | 3.18 | **2.85** |

Bold cells are the hover-fill shortfalls the plan anticipated: on a light hovered row the fill of restored_early and unknown is under 3:1, so the 1 px (2 px poster) ink outline, which is at least 3:1 on every ground, carries the mark boundary. Nothing was lowered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Accent separation failed for nocturne and poster**
- **Found during:** Task 1 (the plan anticipated this for these two directions)
- **Issue:** nocturne accent `#A5B4FC` was 9.93 (protanopia) and 6.98 (deuteranopia) CIEDE2000 from `hab-healthy` `#95DAF7`; poster accent `#C2005F` was 5.29 (deuteranopia) from `hab-healthy` `#124068`. The gate needs 10.
- **Fix:** a grid search over lch65 for the nearest colour that is at least 10 CIEDE2000 from all five tones in all four simulations and reaches 4.5:1 on ground and panel. Nocturne `--dir-accent` and `--dir-focus` `#A5B4FC` to `#96A9FF` (minimum separation 10.55, 8.71:1 on ground, focus 3:1 on ground and panel still met); poster `--dir-accent` `#C2005F` to `#BD0047` (minimum 10.65, 6.45:1 on ground). Poster `--dir-focus` is ink and unchanged; nocturne `--dir-focus-on-well` stays `#A5B4FC` (wells hold no status marks). Status palettes untouched. Comments in `tokens.css` record the old values.
- **Files modified:** `dashboard-next/src/styles/tokens.css`
- **Commit:** 83fb75f
- **Note:** the nocturne margin is 0.55 CIEDE2000 over the floor. A value with 11.0 margin (`#89ACFF`) also exists if the owner wants more headroom; the UI-SPEC value for the two directions was never computed, only atlas.

**2. [Rule 1 - Bug] The mark-boundary rule cannot hold on the outline for nocturne**
- **Found during:** Task 1 (analysis before running)
- **Issue:** the plan requires `mark-outline` at 3:1 on ground, panel, panel-hover and selected for every direction. Nocturne's outline is the ground colour `#0B0D12` by design (UI-SPEC: it separates overlapping marks), which is about 1:1 on the dark grounds and can never reach 3:1; no palette switch changes that.
- **Fix:** the gate asks each ground for a 3:1 boundary from the outline, and where the outline is not the carrier it requires every fill to reach 3:1 on that ground instead. Light directions pass on the outline; nocturne passes on the fills (4.81 to 12.63 across all four grounds).
- **Files modified:** `dashboard-next/tests/unit/status-palette.test.ts`
- **Commit:** 83fb75f

**3. [Rule 3 - Blocking] tokens.ts tripped the new scanner**
- **Found during:** Task 2
- **Issue:** `src/features/ui/tokens.ts` (04-02) spelled a literal `#1A2B3C` in an error message and names the `data-direction` attribute in its MutationObserver filter. Both are inside the scanned folders.
- **Fix:** the message now says "a # followed by six hex digits"; `tokens.ts` joins the direction-rule exemptions with a reason (it observes the attribute so it re-reads tokens, it never branches on the value). The file is outside this plan's `files_modified`; the change is one string literal.
- **Files modified:** `dashboard-next/src/features/ui/tokens.ts`, `dashboard-next/tests/unit/semantic-tokens.test.ts`
- **Commit:** e002f18

### Plan variations (judgement calls)

- **Square path form.** The square is traced as `M2 2L14 2L14 14L2 14Z` (generated from the same polygon table as the others) instead of `H`/`V` commands, so one generator produces every polygon; the geometry is identical.
- **Scanner details.** Comments are blanked before scanning (a comment may describe a value); the sort-descriptor case `sortDescriptor.direction === ...` is deliberately not a direction branch (only a bare variable named `direction`, or comparison with the direction names, is). `oklch`/`oklab`/`hwb` literals are caught along with `rgb`/`hsl`.
- **Fill and stroke as presentation attributes** (`fill="var(--dir-hab-...)"`), not inline style, so jsdom tests can read them and evergreen browsers resolve `var()` in presentation attributes. The browser render is for the fixtures route (04-09) to confirm.

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 3), 3 judgement calls. **Impact:** none on scope; two non-atlas accents changed by small amounts, no threshold was lowered, DS-02 palette values are the contract values.

## Verification run

- `npx vitest run tests/unit/status-palette.test.ts tests/unit/token-contrast.test.ts`: pass (all three directions).
- `node -e "process.exit(require('./package.json').devDependencies.culori==='4.0.2'?0:1)"`: exits 0.
- `npx vitest run tests/unit/semantic-tokens.test.ts tests/unit/status-mark.test.tsx`: 56 passed. `findRawValues` is exported.
- `npm test`: 49 files, 825 passed. `npm run lint`: 0 errors, 19 warnings (same count as before, none in this plan's files). `npm run typecheck`: clean. `node ../scripts/check-feature-fence.mjs`: OK, 44 files. `npm run build`: green.
- Package legitimacy: `culori` OK (3.58M weekly downloads, no postinstall, not deprecated); `@types/culori` OK (1.27M weekly, DefinitelyTyped). Owner standing approval covers installs.
- Not run here: the Playwright visual job (the 33 legacy baselines run in CI). Only `tokens.css` (instrument-scoped accent values) and one string in `tokens.ts` changed outside new files, so legacy output is unaffected.

## Known Stubs

None.

## Threat Flags

None. T-04-04-SC mitigated (legitimacy check above, exact pins, dev-only; culori is not imported by any `src/` file). T-04-04-01 mitigated: the palette and contrast gates fail CI on any regression and print the measured values.

## Self-Check: PASSED

- Created files exist: the four test files and `status-shapes.ts`, `StatusMark.tsx` (checked with `[ -f ]`).
- Commits `83fb75f`, `e002f18`, `dafa569`, `8e6abec` exist in `git log`.
- TDD gate: `test(04-04)` commit `dafa569` (failing import) precedes `feat(04-04)` commit `8e6abec`. Tasks 1 and 2 are gate-only tests over existing tokens, committed as `test(...)`.
