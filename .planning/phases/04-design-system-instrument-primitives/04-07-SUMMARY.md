---
phase: 04-design-system-instrument-primitives
plan: 07
subsystem: ui
tags: [dev-fixtures, section-registry, direction-switcher, reduced-motion, tokens, status-palette, culori, token-bridge]

requires:
  - phase: 04-design-system-instrument-primitives
    provides: gated /dev/fixtures route, FixturesApp surface root and query allowlist (04-06); StatusMark, status-shapes, ToggleGroup, Button (04-04, 04-05); tokens.css direction blocks and token bridge (04-02)
provides:
  - "/dev/fixtures/<section>/ single-section pages (static params, unknown slug 404), behind the same flag-gated dynamic import as the index"
  - "FIXTURE_SECTIONS registry, FIXTURE_SLUGS (import-free) and the section anatomy parts FixtureSection and StateCell that every later primitive plan appends to"
  - "page chrome: wordmark, dev-only tag, contract pin from useModelVersion, Direction switcher (Atlas, Nocturne, Poster), Reduced motion toggle, section list; both switches write ?direction and ?reduced with router.replace and survive a reload"
  - "useReducedMotion (media query or data-reduced-motion on the surface root), exported from the ui barrel"
  - "Tokens and Status palette sections computed from the live tokens"
affects: [04-08, 04-09, 04-10, 04-21, fixtures, design-system]

actuals:
  tokens: 14200
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "A section is a meta object (slug, group, kind, title, contract, data) plus a component; the registry builds its entry from the meta, so the nav and the section share one source"
    - "Section state that is not a prop (the current direction) travels in a small context provided by the chrome, so section files never read the data-direction attribute or compare against a direction name"
    - "Live readouts re-read getComputedStyle when useTokens' version changes (direction, ?tok= override, reduced-motion attribute) or the OS reduced-motion query flips"
    - "useSyncExternalStore for browser state that is not React state (the matchMedia query plus a MutationObserver; the URL hash)"

key-files:
  created:
    - dashboard-next/src/app/dev/fixtures/[section]/page.tsx
    - dashboard-next/src/features/fixtures/slugs.ts
    - dashboard-next/src/features/fixtures/registry.tsx
    - dashboard-next/src/features/fixtures/parts/FixtureSection.tsx
    - dashboard-next/src/features/fixtures/parts/StateCell.tsx
    - dashboard-next/src/features/fixtures/sections/TokensSection.tsx
    - dashboard-next/src/features/fixtures/sections/StatusPaletteSection.tsx
    - dashboard-next/src/features/ui/motion.ts
    - dashboard-next/tests/unit/fixtures-registry.test.ts
    - dashboard-next/tests/unit/reduced-motion-hook.test.ts
  modified:
    - dashboard-next/src/features/fixtures/FixturesApp.tsx
    - dashboard-next/src/features/ui/index.ts
    - dashboard-next/src/features/ui/tokens.ts
    - dashboard-next/tests/unit/tokens-bridge.test.ts
    - dashboard-next/tests/e2e/fixtures-route.spec.ts

key-decisions:
  - "readTokens expands a three-digit hex to six digits: the production CSS minifier writes #ffffff, #333333 and #000000 as #fff, #333 and #000 in custom properties, so the first real consumer of the token bridge crashed in a built app with a TokenError"
  - "Durations are shown in milliseconds by converting the minified computed value (0s, .2s) back to ms, so a reviewer reads 0ms under reduced motion as the spec says"
  - "FixtureChromeProvider and useFixtureChrome live in parts/FixtureSection.tsx (a file already in the plan) rather than a new context file"

patterns-established:
  - "Negative evidence first: the e2e run against the new section pages failed on the production-only hex minification before anything was committed, so the bug was found by the gate and not by the owner"

requirements-completed: []
requirements-advanced: [DS-08, DS-01, DS-02, DS-06]

coverage:
  - id: D1
    description: "A flagged build serves /dev/fixtures/ (all sections) and /dev/fixtures/<section>/ (one section); an unknown section slug answers 404; a flag-less build answers 404 on /dev/fixtures/ and /dev/fixtures/tokens/ and ships no fixture code"
    requirement: DS-08
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#a single-section page renders only that section and its nav keeps the direction, #an unknown section slug answers 404"
        status: pass
      - kind: command
        ref: "node ../scripts/check-dev-fixtures-excluded.mjs after flag-less npm run build: marker absent from 306 files, two 404s (tokens is a real prerendered route in that build)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Direction switcher (Atlas, Nocturne, Poster) and Reduced motion toggle update the URL and the surface attributes, keep other parameters, and a reload restores them; unknown values fall back to atlas and off"
    requirement: DS-08
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#the Direction switcher updates the URL..., #the Reduced motion toggle sets..., #switching keeps the other query parameters, #direction defaults to atlas..."
        status: pass
    human_judgment: false
  - id: D3
    description: "Tokens and Status palette render type, spacing, surfaces, rules, focus, motion, direction, marks, CVD rows and contrast numbers from the live tokens, never typed values"
    requirement: DS-01
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#surface swatch labels are the live --dir-* values..., #tokens section names the current direction..., #status palette marks, CVD rows and contrast follow a ?tok= override"
        status: pass
      - kind: unit
        ref: "tests/unit/semantic-tokens.test.ts (scans src/features/fixtures: no hex literal, font family, px radius or direction branch)"
        status: pass
    human_judgment: false
  - id: D4
    description: "useReducedMotion is true for the OS media query or data-reduced-motion=true on the surface root, follows both, and unsubscribes on unmount"
    requirement: DS-06
    verification:
      - kind: unit
        ref: "tests/unit/reduced-motion-hook.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every section follows one anatomy and every state cell carries data-fixture-primitive, data-fixture-state and data-screen; a forced hover, focus or pressed cell says (forced) and every forced cell says State forced for review"
    requirement: DS-08
    verification:
      - kind: unit
        ref: "tests/unit/fixtures-registry.test.ts#StateCell, #FixtureSection anatomy"
        status: pass
    human_judgment: false
  - id: D6
    description: "The Tokens and Status palette sections look right (layout, density, legibility) in all three directions at desktop, tablet and phone widths"
    requirement: DS-08
    human_judgment: true
    rationale: "Checked by DOM and computed-style assertions only; no screenshots were taken or reviewed this plan. The Docker-pinned visual baselines and the axe pass over every section are later plans (04-09, 04-10 and the fixtures spec), and the owner reviews directions side by side."

duration: 20min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 07: Fixtures Registry, Chrome, Motion Hook and the Foundation Sections Summary

**The `/dev/fixtures` route is now a review tool: a section registry and single-section pages behind the same build flag, a header with a Direction switcher and Reduced motion toggle that round-trip through the URL, `useReducedMotion`, and two Foundation sections (Tokens, Status palette) that read everything from the live tokens.**

## What was built

- **Task 1** (RED `0d8002b`, GREEN `2dff740`): `slugs.ts` (no imports, so the section page never reaches the fixtures barrel outside the flag check), `registry.tsx` (`FixtureSectionDef`, `FIXTURE_SECTIONS`), `parts/FixtureSection.tsx` (eyebrow `{group} · {kind}`, h2, contract line, `Data:` line, state grid, plus the chrome context) and `parts/StateCell.tsx` (`data-fixture-primitive`, `data-fixture-state`, `data-screen`, eyebrow with `(forced)` for hover, focus and pressed, and "State forced for review"). `app/dev/fixtures/[section]/page.tsx` has `generateStaticParams` from `FIXTURE_SLUGS`, `dynamicParams = false`, `isFixtureSlug` then `notFound()`, and the same flag-gated dynamic import as the index.
- **Task 2** (RED `2605888`, GREEN `768b999`): `useReducedMotion(ref?)` on `useSyncExternalStore` (a `matchMedia` listener plus a `MutationObserver` on `data-reduced-motion` of the nearest, else first, `[data-surface="instrument"]`), exported from the ui barrel. `FixturesApp` chrome inside RAC `RouterProvider`: wordmark h1 "ReefRadar", tag "Fixtures · dev only", contract pin "Contract v{version} · {model_version}" from `useModelVersion()` ("Contract loading" until it resolves, "Contract unavailable" on error), `rule-top-heavy`, the Direction `ToggleGroup` (single, `disallowEmptySelection`) and the Reduced motion `ToggleButton`, both written back with `router.replace` keeping other parameters. One `nav` that is a sticky 200 px column from 1024 and an inline list below; index links are `#slug`, single-section links are `/dev/fixtures/{slug}/` keeping `?direction=` and `?reduced=`, with an "All sections" link and `aria-current`.
- **Task 3** (fix `f74b3ea`, feat `250ac24`): `TokensSection` (type scale with computed sizes, spacing bars with computed widths, ten surface swatches labelled with the live `--dir-*` value, three rules at their computed widths, forced focus on ground, well and accent block, motion durations in ms, the direction name and its rule, focus, gutter and radius tokens) and `StatusPaletteSection` (marks at 12, 16, 20 and 24 with label and live hex; four CVD rows from culori `filterDeficiencyDeuter/Prot/Trit(1)`; a contrast table against ground, panel and panel-hover with the ratio and "reaches 3:1" or "below 3:1"). Both recompute when the direction, a `?tok=` override or reduced motion changes. Both registered in `registry.tsx` and `slugs.ts`. `fixtures-route.spec.ts` extended (10 new tests).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The token bridge crashed in any production build**
- **Found during:** Task 3 (first e2e run against the new sections: 17 of 19 route tests failed, the page showed the error boundary, and the server log carried `TokenError: Token "ground" (--dir-ground) must be a six-digit hex ... got "#fff"`)
- **Issue:** the production CSS minifier rewrites `#ffffff`, `#333333` and `#000000` to `#fff`, `#333` and `#000` inside custom properties (checked in the built CSS: only those three forms and the 8-digit scrim values differ from six digits). `readTokens` from 04-02 required six digits and had only ever been exercised on raw CSS and a stub, so this was the first built app to call `useTokens`. The 04-06 body-background tests failed with it too, because the section crashed the whole surface.
- **Fix:** `readTokens` expands a three-digit hex to six digits (`#fff` to `#ffffff`); four-digit, eight-digit, rgb and oklch values still throw. `tokens-bridge.test.ts` gains the expansion test and its rejection list now uses `#ffff`. This changes the earlier documented rule "short hex throws"; the new rule is "any hex that expands to six digits".
- **Files modified:** `dashboard-next/src/features/ui/tokens.ts`, `dashboard-next/tests/unit/tokens-bridge.test.ts` (neither in the plan's file list)
- **Commit:** f74b3ea

**2. [Rule 1 - Bug] Durations read as `0s` in a built app**
- **Found during:** Task 3 (e2e: expected `--duration-fast 0ms`, received `0s`)
- **Issue:** the same minifier writes `0ms` as `0s` and `200ms` as `.2s` in custom properties, so the Motion cell would have shown units other than the spec's.
- **Fix:** the Motion cell converts the computed value back to milliseconds for display.
- **Files modified:** `dashboard-next/src/features/fixtures/sections/TokensSection.tsx`
- **Commit:** 250ac24

### Plan variations (judgement calls)

- **`tests/e2e/fixtures-route.spec.ts` existing assertions changed:** the 04-06 "no legacy shell" test asserted zero `nav` elements and h1 "ReefRadar fixtures". The chrome now has one `nav` (the section list) and the h1 is "ReefRadar" per the plan, so the test asserts exactly one `nav`, named "Fixture sections", and no footer.
- **Chrome context in `parts/FixtureSection.tsx`:** the plan's registry gives sections no props, and the semantic-token scanner forbids reading `data-direction` outside `FixturesApp`, so the direction and reduced state reach sections through a context exported from `FixtureSection.tsx`.
- **`StatusPaletteSection` cells use `display: contents`** so its cells sit in the section's own grid; state ids are `marks`, `cvd` and `contrast`.
- **The exclusion script was not extended**: it still requests `/dev/fixtures/` and `/dev/fixtures/tokens/` (as the plan says). `/dev/fixtures/tokens/` is now a real prerendered route in the flag-less build and answers 404, which is the check 04-06 said would become meaningful here. `/dev/fixtures/status-palette/` takes the same code path and was not requested separately.
- **`next start` logs `Internal: NoFallbackError`** once for the unknown-slug request (`dynamicParams = false`); the response is a clean 404 and the e2e asserts it. Known Next behaviour, not acted on.

**Total deviations:** 2 auto-fixed (Rule 1 twice), 5 judgement calls. **Impact:** `features/ui/tokens.ts` and its test were touched outside the planned file list; without the fix no section that uses `useTokens` could run in a built app, so every later primitive plan that reads tokens would have hit it.

## Verification run

- Task 1: `npx vitest run tests/unit/fixtures-registry.test.ts tests/unit/semantic-tokens.test.ts` passed; `grep -c "dynamicParams = false" "src/app/dev/fixtures/[section]/page.tsx"` prints 1 (a comment that repeated the phrase was reworded to get 1); `npm run typecheck` clean; a flag-less build listed `/dev/fixtures/[section]` as SSG (an empty param list built cleanly).
- Task 2: `npx vitest run tests/unit/reduced-motion-hook.test.ts tests/unit/semantic-tokens.test.ts` passed; `grep -c "Reduced motion" src/features/fixtures/FixturesApp.tsx` prints 2.
- Task 3: after a flag-less `npm run build`, `node ../scripts/check-dev-fixtures-excluded.mjs` exits 0 (marker absent from 306 files, `/dev/fixtures/` 404, `/dev/fixtures/tokens/` 404); `npx playwright test --project=e2e tests/e2e/fixtures-route.spec.ts` 19 passed after the two fixes (the first run failed 17, the second 1 on the `0s` display); `npx vitest run tests/unit/fixtures-registry.test.ts tests/unit/semantic-tokens.test.ts tests/unit/copy-claims.test.ts` 49 passed.
- Plan level: `npm test` 55 files, 907 passed (up from 889); `npm run lint` 0 errors and the same 19 warnings as before; `npm run typecheck` clean; `check-feature-fence` OK (58 files) and `check-contract-fence` OK (127 files); the whole fixture-mocked e2e project passed (90 tests, built with `NEXT_PUBLIC_DEV_FIXTURES=1` by the Playwright web server, which is the flagged build); the flag-less build ran twice, the last time on the final code. `sites-page.test.tsx` did not flake. The Docker-pinned visual job runs in CI only; no legacy file or CSS changed.

## Known Stubs

None. Both sections render computed data; the registry lists exactly the two sections this plan owns, and later plans append the rest.

## Threat Flags

None beyond the plan's register: T-04-07-01 (slug allowlist and `dynamicParams = false`, tested for 404) and T-04-07-02 (same gated dynamic import, flag-less build 404 and marker-free, checked by the CI script) are mitigated. Query writes go through `router.replace` from `URLSearchParams`; token overrides still reach the DOM only through `style.setProperty`.

## Next Phase Readiness

Ready for 04-08 and the later primitive plans: each adds a slug to `slugs.ts` and a `define(META, Component)` entry to `registry.tsx`, and builds its cells with `StateCell`. Two things to carry forward: (1) a built app sees minified custom-property text (`#fff`, `0s`, `.2s`), so any code or test that reads a computed `--*` value must not assume the authored spelling; (2) the Sections button and Sheet for the below-1024 list are 04-10's.

## Self-Check: PASSED

- Created files exist on disk: `src/app/dev/fixtures/[section]/page.tsx`, `src/features/fixtures/{slugs.ts,registry.tsx,parts/FixtureSection.tsx,parts/StateCell.tsx,sections/TokensSection.tsx,sections/StatusPaletteSection.tsx}`, `src/features/ui/motion.ts`, `tests/unit/{fixtures-registry,reduced-motion-hook}.test.ts` (checked below).
- Commits `0d8002b`, `2dff740`, `2605888`, `768b999`, `f74b3ea`, `250ac24` exist in `git log`.
- Every task acceptance criterion and the plan-level verification were re-run after the last code commit (see Verification run).
