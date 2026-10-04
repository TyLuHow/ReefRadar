---
phase: 04-design-system-instrument-primitives
plan: 05
subsystem: ui
tags: [react-aria-components, button, toggle-group, tooltip, a11y, keyboard, semantic-tokens, user-event]

requires:
  - phase: 04-design-system-instrument-primitives
    provides: tokens.css semantic utilities, state variants and focus-ring utilities (04-02); semantic-token scanner (04-04)
provides:
  - react-aria-components 1.21.1 and @testing-library/user-event 14.6.7 installed with exact pins
  - Button and LinkButton (primary, secondary, quiet, inverse, icon; tone light, well, accent; pending state)
  - ToggleGroup, ToggleGroupItem and a standalone ToggleButton (light and well tones, invalid helper text)
  - Tooltip (hover delay, immediate keyboard open) and TooltipSurface (static box)
affects: [04-06, 04-07, 04-08, 04-09, 04-10, design-system, instrument-primitives, fixtures]

actuals:
  tokens: 10900
  tasks: 3
  commits: 6

tech-stack:
  added: ["react-aria-components 1.21.1", "@testing-library/user-event 14.6.7 (dev)"]
  patterns:
    - "Primitives wrap RAC elements and style them with semantic-token utilities and the hover-state:, focus-state:, pressed-state: variants"
    - "Classes are joined with clsx, never cn: tailwind-merge 2.x drops Tailwind 4 custom text utilities"
    - "Attributes React Aria filters out of DOM props (aria-busy, aria-invalid) are set on the node through a ref effect"
    - "Utility class strings are written out in full so Tailwind source scanning finds them"

key-files:
  created:
    - dashboard-next/src/features/ui/Button.tsx
    - dashboard-next/src/features/ui/ToggleGroup.tsx
    - dashboard-next/src/features/ui/Tooltip.tsx
    - dashboard-next/tests/unit/button.test.tsx
    - dashboard-next/tests/unit/toggle-group.test.tsx
    - dashboard-next/tests/unit/tooltip.test.tsx
  modified:
    - dashboard-next/package.json
    - dashboard-next/package-lock.json
    - dashboard-next/src/features/ui/index.ts

key-decisions:
  - "react-aria-components pinned at 1.21.1: the package-legitimacy seam only judges the latest release, so no older version can pass its age check and the plan's fallback applies"
  - "Button, ToggleGroup and Tooltip join classes with clsx, not cn, because tailwind-merge 2.6.1 treats text-body and text-on-control as two text colours and removes one"
  - "aria-busy (Button) and aria-invalid (ToggleGroup) are set through a ref effect because RAC's filterDOMProps does not forward them"
  - "Well-tone toggle segments force an inset outline offset (important) since tokens.css has no inset well-ring utility"

patterns-established:
  - "Tooltip hover tests start cold: open and close one tooltip, wait out RAC's 500 ms module-level cooldown in real time, then use fake timers for toFake setTimeout only"
  - "Vitest fake timers need a jest.advanceTimersByTime global stub for Testing Library's async wrapper"

requirements-completed: []
requirements-advanced: [DS-04]

coverage:
  - id: D1
    description: "react-aria-components is installed at an exact pin that supports React 19.3, with the legitimacy verdict recorded"
    requirement: DS-04
    verification:
      - kind: command
        ref: "node -e \"process.exit(/^\\d+\\.\\d+\\.\\d+$/.test(require('./package.json').dependencies['react-aria-components'])?0:1)\""
        status: pass
      - kind: unit
        ref: "tests/unit/stack-consolidation.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Button: Enter, Space and click press once; pending keeps the label, appends an ellipsis, sets aria-busy, ignores presses and has no spinner; disabled does not press; variants carry the token classes; icon requires aria-label"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/button.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "LinkButton renders an anchor with the given href and the same variant classes"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/button.test.tsx#LinkButton"
        status: pass
    human_judgment: false
  - id: D4
    description: "ToggleGroup: one Tab stop, arrow keys move between segments, Space toggles, disallowEmptySelection keeps the last segment, light and well tone classes, isInvalid sets aria-invalid with linked helper text; ToggleButton toggles aria-pressed on Space and click"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/toggle-group.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "Tooltip: keyboard focus opens it at once, Escape and blur close it with focus kept on the trigger, hover opens after 300 ms, box is control tokens capped at 280 px; TooltipSurface is the same box without overlay behaviour"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/tooltip.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "Primitives use semantic tokens only (no raw hex, font family, pixel radius or direction branch) and focus is an outline, never a box-shadow"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/semantic-tokens.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "The three primitives look right in every state and direction (hover, focus, pressed, selected, disabled; atlas, nocturne, poster), wrap long text to two lines at 44 px, and 44 px targets hold in a real browser"
    requirement: DS-04
    human_judgment: true
    rationale: "jsdom has no layout: the unit tests pin the token classes (min-h-11, whitespace-normal, max-w-[280px]) and the compiled CSS was confirmed to contain them, but pixel size, wrapping and per-direction appearance belong to the fixtures route and its visual and bounding-box tests (04-07, 04-09, 04-10)"
  - id: D8
    description: "i18n: primitives use logical start and end properties so a right-to-left pass is cheap"
    requirement: DS-04
    verification:
      - kind: unit
        ref: "tests/unit/button.test.tsx#uses logical properties only; tests/unit/toggle-group.test.tsx#segments keep 44 px"
        status: pass
    human_judgment: false

duration: 17min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 05: React Aria install, Button, ToggleGroup, Tooltip Summary

**React Aria Components 1.21.1 is installed and wrapped as three token-only, keyboard-tested primitives: Button and LinkButton with a ruled pending state, ToggleGroup and ToggleButton with light and well tones, and a Tooltip with a static twin for fixture cells.**

## What was built

- **Task 1** (RED `d944329`, GREEN `0339df0`): `react-aria-components` 1.21.1 and `@testing-library/user-event` 14.6.7, exact pins, no install scripts in the nine packages added to the lockfile. `Button` takes `variant` (`primary`, `secondary`, `quiet`, `inverse`, `icon`) and `tone` (`light`, `well`, `accent`, which picks `focus-ring`, `focus-ring-well` or `focus-ring-accent` through `focus-state:`). Pending keeps the label, appends a trailing ellipsis, sets `aria-busy` and drops press handlers (RAC does this with `isPending`; the child is wrapped with `composeRenderProps` so render-prop children still work). The icon variant is a discriminated union that requires `aria-label`; a `@ts-expect-error` line in the test proves it. `LinkButton` wraps RAC `Link` with the same class builder.
- **Task 2** (RED `bb73a37`, GREEN `aefbaff`): `ToggleGroup` wraps `ToggleButtonGroup`, `ToggleGroupItem` wraps `ToggleButton` and reads the group's tone from a context, `ToggleButton` is the standalone control. Segments share edges (`-ms-px first:ms-0`), take pill ends from `first:rounded-s-control last:rounded-e-control`, and use an inset focus outline. `isInvalid` sets `aria-invalid` on the group; `helperText` renders under it and is linked with `aria-describedby`.
- **Task 3** (RED `02ccaae`, GREEN `fa3e399`): `Tooltip` wraps `TooltipTrigger` (delay 300, placement top, offset 8, controlled or default open) and RAC `Tooltip` with the control-token box, a 280 px cap, wrapping text and opacity keyed to `data-entering` and `data-exiting` on `--duration-base`. `TooltipSurface` is the same box as a plain `div role="tooltip"`.

## ARIA pattern React Aria emits for ToggleGroup (recorded as the plan asked)

- `selectionMode="single"`: group `role="radiogroup"`, segments `role="radio"` with `aria-checked`; `aria-pressed` is removed.
- `selectionMode="multiple"`: group `role="toolbar"`, segments are buttons with `aria-pressed`.
- The group is one Tab stop (Tab from the element before lands on the first segment, the next Tab leaves the group); ArrowRight and ArrowLeft move focus; Space toggles. Asserted exactly in `toggle-group.test.tsx`.

## Package legitimacy verdict (T-04-05-SC)

`gsd-tools query package-legitimacy check --ecosystem npm react-aria-components @testing-library/user-event`:

```json
[{"name":"react-aria-components","verdict":"SUS","signals":{"exists":true,"publishedAt":"2026-09-04T19:21:09.575Z","weeklyDownloads":5822863,"repoUrl":"git+https://github.com/adobe/react-spectrum.git","deprecated":false,"postinstall":null,"ecosystem":"npm"},"reasons":["too-new"]},
 {"name":"@testing-library/user-event","verdict":"OK","signals":{"exists":true,"publishedAt":"2026-09-02T01:56:32.109Z","weeklyDownloads":68336451,"repoUrl":"git+https://github.com/testing-library/user-event.git","deprecated":false,"postinstall":null,"ecosystem":"npm"},"reasons":[]}]
```

- **Chosen version: `react-aria-components` 1.21.1.** The seam judges only a package's latest release; asking it about `react-aria-components@1.20.0` or `@1.21.0` returns SLOP / `does-not-exist`, so no earlier version could be put through the age check. Per the plan, none passes, so 1.21.1 is pinned. Registry cross-check: `dist-tags.latest` is 1.21.1, licence Apache-2.0, repository `adobe/react-spectrum`, no `postinstall` or `install` script, peers `react ^16.8 || ^17 || ^18 || ^19.0.0-rc.1` (covers React 19.3.0), dependencies `react-aria` 3.52.1 and `react-stately` 3.50.0. 1.21.1 was published 30 days before this run; the previous release 1.20.0 is 65 days old. The `too-new` flag is a recency artefact on a 5.8M-weekly-download Adobe monorepo package, covered by the owner's standing approval (DRIVING-QUESTIONS.md).
- `@testing-library/user-event` 14.6.7: OK, MIT, 68M weekly downloads, no postinstall.
- The nine new lockfile entries (`react-aria-components`, `react-aria`, `react-stately`, `@react-types/shared`, `@internationalized/date|number|string`, `aria-hidden`, `@testing-library/user-event`) have no `hasInstallScript`. The `unrs-resolver` allow-scripts npm warning is pre-existing and unrelated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] cn() would have silently dropped classes**
- **Found during:** Task 1 (checked before writing)
- **Issue:** the plan names `cn` (clsx + tailwind-merge) for class composition. tailwind-merge 2.6.1 predates Tailwind 4 custom names: `twMerge('text-body font-semibold text-on-control bg-control text-small')` returns `font-semibold bg-control text-small`, losing `text-body` and `text-on-control` because it reads every `text-*` as a colour.
- **Fix:** all three files join classes with `clsx`; a comment in each file says why. Consumer `className` is appended last.
- **Files modified:** `Button.tsx`, `ToggleGroup.tsx`, `Tooltip.tsx`
- **Commit:** 0339df0, aefbaff, fa3e399

**2. [Rule 1 - Bug] RAC does not forward aria-busy or aria-invalid**
- **Found during:** Task 1 (aria-busy test failed after the first implementation); Task 2 (same cause, designed in)
- **Issue:** `filterDOMProps` keeps only id, `aria-label`, `aria-labelledby`, `aria-describedby`, `aria-details` and `data-*`, so `aria-busy` on Button and `aria-invalid` on the group never reached the DOM. RAC sets `aria-disabled` and `data-pending` for a pending button but not `aria-busy`.
- **Fix:** each component keeps a ref and sets or removes the attribute in an effect. A server render of an already-pending button therefore gains `aria-busy` only on hydration, which is acceptable because pending states are interaction results.
- **Files modified:** `Button.tsx`, `ToggleGroup.tsx`
- **Commit:** 0339df0, aefbaff

**3. [Rule 1 - Bug] Interpolated Tailwind classes would never be generated**
- **Found during:** Task 2 (first draft built the disabled colour with a template literal)
- **Issue:** Tailwind finds classes by scanning source text, so `text-[${MIX}]` produces no CSS.
- **Fix:** the disabled classes are written out in full. After `npm run build` the compiled CSS was grepped for the unusual utilities (`data-disabled:data-selected`, `max-w-[280px]`, `data-entering:opacity-0`, `first:rounded-s-control`, `data-selected:hover-state`, `-outline-offset-2!`, `color-mix(in srgb,var(--dir-rule-strong)`): all present.
- **Files modified:** `ToggleGroup.tsx`
- **Commit:** aefbaff

### Plan variations (judgement calls)

- **Test regex fix.** The first no-box-shadow assertion in `button.test.tsx` matched `ring-` inside `focus-ring-well` and failed the well tone; it now matches whole class tokens (`shadow` or `ring` as a utility, with any variant prefixes).
- **Well-tone segments force the inset offset.** UI-SPEC asks for an inset ring on toggle segments but `tokens.css` has no inset well-ring utility and is outside this plan's files. Well segments use `focus-state:focus-ring-well focus-state:-outline-offset-2!` (the important flag makes the winner independent of utility order). A `focus-ring-well-inset` utility in `tokens.css` would replace it if wanted later.
- **Tooltip close delay left at the React Aria default (500 ms).** The plan sets only the 300 ms open delay; the default close delay keeps the box hoverable (WCAG 1.4.13).
- **Disabled and pressed styling for selected segments** (`data-disabled:data-selected:` overrides, `data-selected:hover-state:` and `data-selected:pressed-state:` fills) were added so a selected segment uses `control-hover` and `control-pressed` like a filled Button. Beyond the literal plan text, within the UI-SPEC common rules.
- **ToggleButton and ToggleGroup accept `tone` of `light` or `well` only** (the plan's artifact list), while Button also has `accent`.
- **Test-only workarounds for Tooltip hover** (documented in the file): RAC opens on hover only when the last interaction was the pointer, and keeps module-level warm-up state, so the hover test moves the pointer first and starts cold; Testing Library needs a `jest.advanceTimersByTime` global stub under vitest fake timers.

**Total deviations:** 3 auto-fixed (all Rule 1), 5 judgement calls. **Impact:** none on scope; behaviour matches every `must_haves` truth that jsdom can prove.

## Verification run

- Task 1: `npx vitest run tests/unit/button.test.tsx tests/unit/semantic-tokens.test.ts tests/unit/stack-consolidation.test.ts` passed (81 tests). Exact-pin command exits 0.
- Task 2: `npx vitest run tests/unit/toggle-group.test.tsx tests/unit/semantic-tokens.test.ts` passed (51 tests). `grep -c "export function ToggleButton" src/features/ui/ToggleGroup.tsx` prints 1.
- Task 3: `npx vitest run tests/unit/tooltip.test.tsx` passed (10 tests, three consecutive runs, no flake) and `npm run typecheck` is clean.
- Plan level: `npm test` 52 files, 878 passed (up from 825). `npm run lint` 0 errors, 19 warnings (the same 19 as before, none in `features/ui` or the new tests). `npm run typecheck` clean. `npm run build` green. `node scripts/check-feature-fence.mjs` OK (47 files) and `node scripts/check-contract-fence.mjs` OK (113 files), both run from the repo root.
- Used-dependency gate: `react-aria-components` is imported by the three primitives in the same commit that installs it (Task 1).
- Not run here: the Playwright visual job (33 legacy baselines run in CI). Nothing legacy imports `features/ui` (T-04-05-01), and no legacy file or global CSS changed, so legacy output is unaffected.

## Known Stubs

None. The primitives have no consumer yet; the fixtures route (04-07 onward) is where they are exercised in a browser.

## Threat Flags

None new. T-04-05-SC mitigated (legitimacy verdicts above, exact pins, lockfile committed, no install scripts, Adobe monorepo provenance). T-04-05-01 mitigated: named imports from `react-aria-components` only, all inside `src/features/ui`, no legacy route imports `features/ui`.

## Self-Check: PASSED

- Created files exist: `Button.tsx`, `ToggleGroup.tsx`, `Tooltip.tsx` and the three test files (checked with `[ -f ]`).
- Commits `d944329`, `0339df0`, `bb73a37`, `aefbaff`, `02ccaae`, `fa3e399` exist in `git log`.
- TDD gate: each task has a `test(04-05)` commit (failing) before its `feat(04-05)` commit.
