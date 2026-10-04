---
phase: 04-design-system-instrument-primitives
plan: 01
subsystem: ui
tags: [tailwind, tailwind-4, css-first, postcss, playwright, visual-regression, computed-style]

requires:
  - phase: 03-platform-upgrade
    provides: Next 16 / React 19 baseline, 33 Linux visual baselines, feature fence
provides:
  - Tailwind CSS 4.3.3 through @tailwindcss/postcss, CSS-first (@theme in src/app/globals.css), no tailwind.config.js, no autoprefixer
  - sha256 guard over the 33 legacy Linux baselines
  - computed-style fingerprint tooling and a zero-unexplained-difference proof for the 11 legacy states at 1440 and 390 px
  - v4 @source coverage test and a legacy hover probe
affects: [04-02, 04-03, design-system, legacy-routes]

actuals:
  tokens: 22600
  tasks: 3
  commits: 5

tech-stack:
  added: ["tailwindcss 4.3.3 (exact pin)", "@tailwindcss/postcss 4.3.3 (exact pin)"]
  removed: ["autoprefixer", "tailwind.config.js"]
  patterns:
    - "Single Tailwind entry: @import 'tailwindcss' source(none) plus four explicit @source lines"
    - "Legacy globals in @layer base; component-like legacy classes (.glass-panel, .glass-button, .heading, .hero-text, .mono) stay unlayered"
    - "Stock palette colours the legacy routes use are pinned to their Tailwind 3 hex values in @theme"

key-files:
  created:
    - dashboard-next/tests/unit/legacy-baselines.test.ts
    - dashboard-next/tests/unit/tailwind-v4-sources.test.ts
    - dashboard-next/playwright.fingerprint.config.ts
    - dashboard-next/tests/e2e/style-fingerprint.spec.ts
    - dashboard-next/tests/e2e/legacy-hover.spec.ts
    - dashboard-next/scripts/style-fingerprint-diff.mjs
    - .planning/phases/04-design-system-instrument-primitives/deferred-items.md
  modified:
    - dashboard-next/src/app/globals.css
    - dashboard-next/package.json
    - dashboard-next/package-lock.json
    - dashboard-next/postcss.config.js
    - dashboard-next/playwright.config.ts
    - dashboard-next/tests/unit/platform-versions.test.ts
    - dashboard-next/tests/unit/vitality-removed.test.ts
    - .claude/CLAUDE.md
  deleted:
    - dashboard-next/tailwind.config.js
    - dashboard-next/tests/unit/tailwind-content.test.ts

key-decisions:
  - "Stock amber, sky and gray colours used by legacy code are pinned to Tailwind 3 hex values; the RESEARCH claim that only serialisation differs was wrong for amber-200/400/500/900"
  - "SampleCard hover border gets the important marker so the unlayered .glass-panel does not swallow the hover variant"
  - "Restore Tailwind 3 browser-default behaviour for option padding, input/select/textarea background and ::placeholder inside @layer base"
  - "transition-colors and transition-transform now list outline-color, --tw-gradient-* and translate/scale/rotate (v4 utility definitions); accepted and recorded, not overridden"

patterns-established:
  - "Legacy-neutral proof = hash guard over baselines + computed-style fingerprint of both builds + hover probe; CI visual job is the final authority"

requirements-completed: [DS-01]

coverage:
  - id: D1
    description: "dashboard-next builds and tests on Tailwind 4.3.3 via @tailwindcss/postcss with no tailwind.config.js and no autoprefixer"
    requirement: DS-01
    verification:
      - kind: unit
        ref: "tests/unit/platform-versions.test.ts, tests/unit/tailwind-v4-sources.test.ts"
        status: pass
      - kind: other
        ref: "npm run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "33 legacy Linux baselines byte-identical and guarded by a hash test"
    requirement: DS-01
    verification:
      - kind: unit
        ref: "tests/unit/legacy-baselines.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Computed-style fingerprint of the 11 legacy states at 1440 and 390 px shows zero unexplained differences between the Tailwind 3 and Tailwind 4 builds"
    requirement: DS-01
    verification:
      - kind: other
        ref: "node scripts/style-fingerprint-diff.mjs fp-before fp-after (exit 0, 6624 elements, 24 files)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Legacy SiteCard and SampleCard hover borders unchanged; CI visual job passes the 33 baselines untouched"
    requirement: DS-01
    verification:
      - kind: e2e
        ref: "tests/e2e/legacy-hover.spec.ts"
        status: pass
      - kind: other
        ref: "CI visual job on the pushed commits"
        status: unknown
    human_judgment: false

duration: 90min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 01: Tailwind 3 to 4, legacy-neutral Summary

**Tailwind CSS 4.3.3 CSS-first build with legacy globals in @layer base, Tailwind 3 palette and preflight defaults pinned, and a computed-style fingerprint showing zero unexplained differences against the Tailwind 3 build across 6,624 elements.**

## What was built

- **Task 1** (`e92dc9c`, `5df91d4`): `tests/unit/legacy-baselines.test.ts` pins the sha256 and exact name set of the 33 baselines; `playwright.fingerprint.config.ts` (port 3110), `tests/e2e/style-fingerprint.spec.ts` and `scripts/style-fingerprint-diff.mjs` dump and compare computed style (all properties, bounding box, own text, `::placeholder`) of the 11 states at 1440 and 390 px; the e2e project ignores the fingerprint spec.
- **Task 2** (`b857321`): ran `npx @tailwindcss/upgrade@4.3.3` on the clean v3 tree, pinned `tailwindcss` and `@tailwindcss/postcss` to 4.3.3, removed autoprefixer and `tailwind.config.js`, wrote `@import 'tailwindcss' source(none)` plus four `@source` lines, wrapped exactly the plan's legacy globals in `@layer base`, applied the literal default border colour `#e5e7eb`, button cursor rule, fixed rem line-heights, `bg-linear-to-br/srgb`, removed dead `scrollbar-thin`, replaced `tailwind-content.test.ts` with `tailwind-v4-sources.test.ts`, ported the version and vitality tests, updated `.claude/CLAUDE.md` facts.
- **Task 3** (`59cb4e0`, `3418880`): iterated `globals.css` against the fingerprint (below), added `legacy-hover.spec.ts`, ran lint, typecheck, unit, build and the local e2e suite.

Rewritten by the upgrade tool (25 files plus `globals.css`): `src/app/dashboard/analyze/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/experience/page.tsx`, `src/app/globals.css`, `src/app/sites/page.tsx`, `src/components/{AnalysisProgress,FileUpload,LoadingSpinner,SiteCard}.tsx`, `src/components/audio/AudioCompare.tsx`, `src/components/charts/ProbabilityBars.tsx`, `src/components/dashboard/{CaveatsBanner,RegionWarning}.tsx`, `src/components/experience/{ComparisonPanel,CoordinateModal,DemoState,LocationCompare}.tsx`, `src/components/gallery/SampleCard.tsx`, `src/components/map/{HealthLegend,MapControls}.tsx`, `src/components/sites/SiteFilters.tsx`, `src/components/ui/glass/{GlassButton,GlassInput}.tsx`, `src/features/map/{MiniMap,SitePopup,WorldMap}.tsx`. The tool did not touch `tests/baseline` or `.planning` on this run (checked with `git status` before committing, nothing to revert). PostCSS config kept its name `postcss.config.js`.

## Fingerprint result

Final diff (Tailwind 3.4.19 build at `5df91d4` in a throwaway worktree vs the Tailwind 4.3.3 tree; 22 states plus 2 hover probes; 6,624 elements; equal element counts): **exit 0, unexplained 0**.

| Category | Count | Meaning |
|---|---|---|
| serialisation-radius | 3088 | `9999px` vs `calc(infinity * 1px)` |
| space-side | 1920 | space-x/space-y margin moved to the other side; per-parent margin sums conserved, all boxes identical |
| transform-serialisation | 8 | `matrix()` vs `translate`/`rotate` with same geometry |
| sr-only-clip | 48 | `clip` vs `clip-path: inset(50%)` |
| colour-rounding | 126 | colour-mix/oklab rounding within 1/255 |
| gradient-serialisation | 2 | explicit `0%`/`100%` stops under `/srgb` |
| shadow-serialisation | 12 | v4 rings add empty layers |
| transition-list | 456 | v4 `transition-colors`/`transition-transform` also list outline-color, `--tw-gradient-*`, translate/scale/rotate |
| tw-internal-variable | 933990 | `--tw-*` and v4 theme tokens declared on `:root` |
| unexplained | 0 | |

What the iterations found beyond the RESEARCH table (all mitigated in `globals.css` or the source, then re-measured):

1. **Stock palette colours differ visibly**: v4 amber-200/400/500/900 are oklch values that paint differently (for example amber-400 `rgb(251,191,36)` became `rgb(255,185,0)`). Pinned amber, sky and gray values used by legacy code to their Tailwind 3 hex values in `@theme`.
2. **Preflight defaults**: v4 zeroes `option` padding (3 px lost in the native dropdown), makes `input`/`select`/`textarea` background transparent (the demo-mode input was white) and changes `::placeholder` colour. Restored inside `@layer base` (`option` padding, `background-color: revert`, `#9ca3af` placeholder). The placeholder is not reachable through an element's own computed style, so the fingerprint now samples `::placeholder` explicitly.
3. **Hover**: SampleCard (`GlassPanel` carrying `hover:border-(--glass-border-bright)`) would lose its hover border to the unlayered `.glass-panel`; the plan only named SiteCard. Added the important marker to that one class and a hover probe for it.
4. Earlier measured diff before the extra mitigations was dominated by `--tw-*`/theme variables (about 936,000 items) which the tool now classifies separately; the real property differences that remained were the items above plus the categories in the table.

Tool refinements made while iterating (tooling only, in `style-fingerprint-diff.mjs` and the spec): the diff gained the gradient, shadow, transition-list and tw-internal categories and a per-parent margin conservation check; the spec waits for stable text, scrolls once, records own text and hands rAF `performance.now()` so a legacy counter race does not make runs differ.

Hover values (raw computed `border-top-color`), measured on the Tailwind 3 build and asserted by `tests/e2e/legacy-hover.spec.ts` on the Tailwind 4 tree:

- SiteCard `/sites/` hovered: `rgba(229, 225, 219, 0.1)` (both builds; `hover:border-opacity-50` is a no-op in both)
- SampleCard `/` rest `rgba(229, 225, 219, 0.1)`, hovered `rgba(229, 225, 219, 0.2)` (both builds; the spec passes on the v3 worktree and the v4 tree)

No `update_snapshots` dispatch ran. No file under `tests/e2e/visual.spec.ts-snapshots` was touched (`legacy-baselines.test.ts` green).

## Verification run

- `npm run lint`: 0 errors, 19 warnings (react-hooks and unused-directive warnings in files outside this plan's scope, unchanged count)
- `npm run typecheck`: clean
- `npm test`: 39 files, 540 passed, 0 failed (final run). Two earlier full runs each showed one timing failure in `sites-page.test.tsx` and another file under parallel load; that file passes alone and the next two full runs were green, so it is a load-dependent flake, not a Tailwind effect (jsdom does not process CSS).
- `npm run build`: green, route table unchanged
- `npx playwright test --project=e2e`: 71 passed (includes the 2 hover probes)
- Python host `py -3.12` not needed; no Python touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stock palette colours changed visibly under Tailwind 4**
- **Found during:** Task 3 fingerprint diff
- **Issue:** the RESEARCH claim that only colour serialisation differs was wrong for amber-200/400/500/900 (visible hue/lightness shift on `/dashboard/compare` and the caveat banners)
- **Fix:** pin 17 stock amber/sky/gray values to their Tailwind 3 hex in the legacy `@theme`
- **Files modified:** `dashboard-next/src/app/globals.css`
- **Commit:** 59cb4e0

**2. [Rule 1 - Bug] Preflight default differences (option padding, input background, placeholder colour)**
- **Found during:** Task 3 fingerprint diff
- **Fix:** restoring rules inside the existing `@layer base` in `globals.css`
- **Commit:** 59cb4e0

**3. [Rule 1 - Bug] SampleCard hover border lost to unlayered `.glass-panel`**
- **Found during:** Task 2 review of the tool's rewrites (RESEARCH named only SiteCard)
- **Fix:** `hover:border-(--glass-border-bright)!` in `src/components/gallery/SampleCard.tsx`; second hover probe in `legacy-hover.spec.ts`
- **Commit:** b857321 (class), 3418880 (probe)

**4. [Rule 3 - Blocking] Fingerprint tooling needed to be deterministic and wider than the plan listed**
- **Found during:** Task 3 (nondeterministic legacy `AnimatedCounter`, clock text, `--tw-*` and theme variables enumerated by `getComputedStyle`, percentage translate, ring/gradient/transition serialisations)
- **Fix:** tooling changes described above; the Tailwind 3 "before" fingerprint was recaptured on a throwaway `git worktree` of the pre-migration commit (removed afterwards) with the final spec, so both sides use identical harness code
- **Files:** `dashboard-next/tests/e2e/style-fingerprint.spec.ts`, `dashboard-next/scripts/style-fingerprint-diff.mjs`, `dashboard-next/playwright.fingerprint.config.ts` (per-test timeout 150 s)
- **Commits:** 5df91d4, 3418880

### Notes (not deviations)

- The tool left `tests/baseline` and `.planning` untouched on this run; nothing needed reverting.
- The Tailwind palette pins are limited to the 17 stock colours the legacy routes use today; a new legacy class using another stock colour would show the v4 palette. The fingerprint covers only the 11 states at two widths and the two hover probes, not other pseudo-elements or interaction states; the CI `visual` job (33 baselines) remains the final authority.

## Accepted differences (recorded, not overridden)

- `transition-colors` and `transition-transform` utilities now also list `outline-color`, `--tw-gradient-*` and the individual `translate`/`scale`/`rotate` properties (456 elements). Visible only as a 150 ms outline-colour fade on focus-visible; no change at rest or in any baseline.

## Deferred Issues

Logged in `.planning/phases/04-design-system-instrument-primitives/deferred-items.md`: legacy `AnimatedCounter` can stick at a partial or negative count (present on the Tailwind 3 build).

## Orchestrator gate for CI

Push, then confirm the CI `visual` job passes with the 33 baselines untouched before 04-02 or 04-03 starts. Watch specifically for a failing state among `analyze` (gradient `/srgb`), `compare` and `experience-compare` (amber banners), `map`/`experience-*` (inputs, selects) and any state with `sr-only` checkboxes. Rollback path is in the plan objective; iterate only in `src/app/globals.css`.

## Known Stubs

None.

## Threat Flags

None (no new network surface). T-04-01-SC mitigated by exact pins and lockfile; T-04-01-02 by `legacy-baselines.test.ts`; T-04-01-03 not triggered (tool left `tests/baseline` alone); T-04-01-04 dumps stayed in the session scratchpad.

## Self-Check: PASSED
