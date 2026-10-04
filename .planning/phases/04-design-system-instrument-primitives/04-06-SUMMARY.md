---
phase: 04-design-system-instrument-primitives
plan: 06
subsystem: ui
tags: [dev-fixtures, next-font, build-flag, dead-code-elimination, ci-gate, query-allowlist, noindex]

requires:
  - phase: 04-design-system-instrument-primitives
    provides: tokens.css direction blocks, semantic utilities and font variable names (04-02); primitives (04-05)
provides:
  - "/dev/fixtures route that exists only in builds made with NEXT_PUBLIC_DEV_FIXTURES=1 (404 and no fixture code otherwise)"
  - "nested /dev layout that calls the four instrument typefaces, so legacy routes download none of them"
  - "FixturesApp: the instrument surface root driven by ?direction, ?reduced and ?tok through a closed allowlist"
  - "scripts/check-dev-fixtures-excluded.mjs, wired into the CI web job after the flag-less build"
affects: [04-07, 04-08, 04-09, 04-10, fixtures, design-system]

actuals:
  tokens: 7600
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "A dev-only feature is gated by a build-time flag around a dynamic import, and next.config.js always defines the flag so the bundler can eliminate the dead branch"
    - "Query parameters are parsed through closed allowlists; token values reach the DOM only through style.setProperty"
    - "next/font calls live in a nested layout, so only that route subtree loads and preloads the fonts"
    - "A unique marker string rendered only by the dev-only module lets CI prove its absence from a production build"

key-files:
  created:
    - dashboard-next/src/app/dev/layout.tsx
    - dashboard-next/src/app/dev/fixtures/page.tsx
    - dashboard-next/src/features/fixtures/index.ts
    - dashboard-next/src/features/fixtures/marker.ts
    - dashboard-next/src/features/fixtures/query.ts
    - dashboard-next/src/features/fixtures/FixturesApp.tsx
    - scripts/check-dev-fixtures-excluded.mjs
    - dashboard-next/tests/unit/fixtures-query.test.ts
    - dashboard-next/tests/e2e/fixtures-route.spec.ts
  modified:
    - dashboard-next/src/components/layout/ConditionalShell.tsx
    - dashboard-next/next.config.js
    - .github/workflows/ci.yml
    - dashboard-next/playwright.config.ts
    - dashboard-next/vercel.json
    - dashboard-next/README.md

key-decisions:
  - "next.config.js always defines NEXT_PUBLIC_DEV_FIXTURES ('1' only when the build env is exactly '1', otherwise '0'): Next substitutes a NEXT_PUBLIC_ variable only when it is defined, so with the flag unset the gated dynamic import was not eliminated and the fixtures chunk and marker shipped in a production build"
  - "Suspense fallback of FixturesApp is the same surface with atlas defaults, so the prerendered HTML carries data-surface and the atlas ground paints from the first frame"
  - "The exclusion script runs next's own entry point with the current node binary (no shell, no .cmd shim), and still taskkills the tree on Windows or kills the process group on POSIX"

patterns-established:
  - "Negative-test a gate before trusting it: the exclusion script was run against a flagged build first and failed with the two marker files named"
  - "Poll for computed colours on the instrument surface: the legacy global rule transitions background-color over 150 ms"

requirements-completed: []
requirements-advanced: [DS-08, DS-01]

coverage:
  - id: D1
    description: "A build without NEXT_PUBLIC_DEV_FIXTURES=1 contains no fixture code and answers 404 on /dev/fixtures/ and /dev/fixtures/tokens/; CI checks both after the flag-less build"
    requirement: DS-08
    verification:
      - kind: command
        ref: "node ../scripts/check-dev-fixtures-excluded.mjs (after flag-less npm run build): marker absent from 284 files, two 404s"
        status: pass
    human_judgment: false
  - id: D2
    description: "A flagged build serves /dev/fixtures/ with noindex and without the legacy Navbar and Footer"
    requirement: DS-08
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#serves 200, is noindex and has no legacy shell"
        status: pass
    human_judgment: false
  - id: D3
    description: "?direction and ?reduced set data-direction and data-reduced-motion on the surface root; unknown values fall back to atlas and off"
    requirement: DS-08
    verification:
      - kind: unit
        ref: "tests/unit/fixtures-query.test.ts#parseFixtureQuery direction, #parseFixtureQuery reduced"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#direction defaults to atlas..., #?reduced=1 sets data-reduced-motion..."
        status: pass
    human_judgment: false
  - id: D4
    description: "?tok=--dir-<name>:%23RRGGBB applies a hex-only override on the surface root; any other name or value is ignored; at most 8 are kept"
    requirement: DS-08
    verification:
      - kind: unit
        ref: "tests/unit/fixtures-query.test.ts#parseFixtureQuery token overrides"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#?tok= applies a hex --dir-* override and ignores anything else"
        status: pass
    human_judgment: false
  - id: D5
    description: "Legacy routes load none of the new fonts; on /dev/fixtures with atlas no Archivo Black face leaves the unloaded state"
    requirement: DS-01
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#font scoping"
        status: pass
    human_judgment: false
  - id: D6
    description: "Body background equals the computed --dir-ground for atlas, nocturne and poster on the fixtures route"
    requirement: DS-01
    verification:
      - kind: e2e
        ref: "tests/e2e/fixtures-route.spec.ts#body background equals --dir-ground for <direction>"
        status: pass
    human_judgment: false
  - id: D7
    description: "Newsreader italic, Hanken Grotesk and Spline Sans Mono are preloaded on /dev routes only, and Newsreader roman and Archivo Black are not preloaded"
    requirement: DS-01
    human_judgment: true
    rationale: "preload is set by next/font (preload: false on two faces) and was confirmed only through source (grep prints 2) and the unloaded Archivo state; the emitted <link rel=preload> set was not enumerated in the built HTML, so the exact preload list is left for the verifier or the fixtures review"

duration: 25min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 06: /dev/fixtures Route, Scoped Fonts and Production Exclusion Summary

**A dev-only `/dev/fixtures` surface (direction, reduced motion and hex token probes from an allowlisted URL, instrument fonts scoped to `/dev`) that exists only when `NEXT_PUBLIC_DEV_FIXTURES=1`, with a CI script proving a production build has no fixture code and answers 404.**

## What was built

- **Task 1** (`06985b9`): `src/app/dev/layout.tsx` calls `Newsreader` (italic with `opsz`, roman with `preload: false`), `Hanken_Grotesk`, `Spline_Sans_Mono` and `Archivo_Black` (`preload: false`) with the exact variable names `tokens.css` reads, exports `robots: { index: false, follow: false }` and wraps children in a div carrying the five variable classes. The root layout still imports only Inter and JetBrains Mono. `ConditionalShell` now treats `/dev` like `/experience` (no Navbar or Footer).
- **Task 2** (RED `1ea2bc2`, GREEN `a390e3b`, fix `b41a1d2`): `parseFixtureQuery` (direction allowlist, `reduced` only for `1`, `tok` name `^--dir-[a-z0-9-]+$`, value `^#[0-9A-Fa-f]{6}$`, first-colon split, cap 8), `DEV_FIXTURES_MARKER`, `FixturesApp` (surface root with `data-surface`, `data-direction`, `data-reduced-motion`, `data-fixtures-marker`; overrides applied with `style.setProperty` in an effect that removes them on change) and the async `page.tsx` that imports `@/features/fixtures` only inside the flag check, else `notFound()`.
- **Task 3** (`a62c402`): `scripts/check-dev-fixtures-excluded.mjs` (marker scan over `.next/static` and `.next/server`, then `next start -p 3107` and two 404 checks, tree kill in `finally`, `--no-server` flag), CI step after `npm run build` in the `web` job, `NEXT_PUBLIC_DEV_FIXTURES: '1'` in the Playwright `webServer.env`, `X-Robots-Tag: noindex, nofollow` for `/dev/(.*)` in `vercel.json`, a README section, and `tests/e2e/fixtures-route.spec.ts` (9 tests).

## Result recorded for RESEARCH assumption A2

On `/dev/fixtures/?direction=atlas`, the browser registered the Archivo Black faces and all stayed `unloaded` (never requested); only `Newsreader` and `Hanken Grotesk` reached `loaded` (6 font requests in total). `preload: false` therefore keeps Archivo Black off atlas, as assumed. The check identifies the font by its registered `FontFace` rather than by file name because `next/font` hashes the file names.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's gate left fixture code in a flag-less production build**
- **Found during:** Task 2 (first `npm run build` without the flag, then grepping `.next`)
- **Issue:** with `NEXT_PUBLIC_DEV_FIXTURES` unset, the marker was in `.next/static/chunks/*.js` and `.next/server/chunks/ssr/*FixturesApp*`. Next only substitutes a `NEXT_PUBLIC_` variable that is defined, so `process.env.NEXT_PUBLIC_DEV_FIXTURES === '1'` stayed a runtime read and the dynamic import was not eliminated. Setting the variable to `0` on the command line removed the chunk, which isolated the cause. The truth "contains no fixture code" and CI check could not hold otherwise.
- **Fix:** `next.config.js` (not in the plan's file list) gains `env: { NEXT_PUBLIC_DEV_FIXTURES: process.env.NEXT_PUBLIC_DEV_FIXTURES === '1' ? '1' : '0' }`, so the flag is always defined at build time. Verified: flag-less build has 0 marker files and `/dev/fixtures/` is a prerendered 404; flagged build has 3 marker files, a 200 route and `<meta name="robots" content="noindex, nofollow"/>`. The README documents the reason.
- **Files modified:** `dashboard-next/next.config.js`
- **Commit:** a390e3b

**2. [Rule 1 - Bug] Dark flash of the legacy body colour before the surface mounted**
- **Found during:** Task 3 (the three body-ground e2e tests read `rgb(26, 23, 20)`, the legacy abyss colour)
- **Issue:** the Suspense fallback was `null`, so the prerendered HTML had no `data-surface`; `html:has([data-surface])` only matched after client hydration and the body then transitioned from abyss to the ground over the legacy 150 ms rule.
- **Fix:** the fallback is the same surface with atlas defaults, so the first frame already carries the atlas ground. The e2e assertion also polls, because a direction change still passes through the 150 ms legacy transition.
- **Files modified:** `src/features/fixtures/FixturesApp.tsx`, `tests/e2e/fixtures-route.spec.ts`
- **Commit:** b41a1d2, a62c402

### Plan variations (judgement calls)

- **Exclusion script spawns `node next/dist/bin/next start`** instead of `node_modules/.bin/next` through a shell: no `.cmd` shim, one process; the Windows `taskkill /T /F` and POSIX process-group kill remain in `finally`. Confirmed no listener is left on 3107 afterwards.
- **Negative check of the gate:** the script was run once against a flagged build and failed with both marker files named, then passed on a flag-less build, before being committed.
- **`/dev/fixtures/tokens/` is not a real route yet** (sections arrive in 04-07); it answers 404 in every build today, so the second 404 check is meaningful only once 04-07 adds `[section]` and the flag-less build must still 404 it.
- **Font evidence for the Archivo check uses `FontFace.status`** rather than a request-by-file-name match (hashed names), and the e2e project's `document.fonts` also lists the fallback faces; the assertion covers every face whose family matches `archivo`.

**Total deviations:** 2 auto-fixed (Rule 3, Rule 1), 4 judgement calls. **Impact:** `next.config.js` was touched outside the planned file list; without it the plan's central truth was false.

## Verification run

- Task 1 criteria: `grep -c "preload: false"` prints 2, `index: false` prints 1, root layout import prints 1, `startsWith('/dev')` prints 1; `npm run typecheck` and `npm run lint` clean (0 errors, the same 19 warnings as before).
- Task 2: `npx vitest run tests/unit/fixtures-query.test.ts tests/unit/semantic-tokens.test.ts` passed (43 tests, RED run failed first on the missing module); `grep -c "await import('@/features/fixtures')"` prints 1; flag-less and `NEXT_PUBLIC_DEV_FIXTURES=1` `npm run build` both exit 0.
- Task 3: after a flag-less build, `node ../scripts/check-dev-fixtures-excluded.mjs` exits 0 ("marker absent from 284 built file(s)", `/dev/fixtures/` 404, `/dev/fixtures/tokens/` 404); `grep -c "NEXT_PUBLIC_DEV_FIXTURES: '1'" playwright.config.ts` prints 1; `grep -c "check-dev-fixtures-excluded" ../.github/workflows/ci.yml` prints 1; `npx playwright test --project=e2e tests/e2e/fixtures-route.spec.ts` 9 passed; `security-headers`, `semantic-tokens`, `copy-claims` and `fixtures-query` unit tests passed (51).
- Plan level: `npm test` 53 files, 889 passed (up from 878); `npm run lint` 0 errors; `npm run typecheck` clean; `check-feature-fence` OK (51 files) and `check-contract-fence` OK (119 files); the whole fixture-mocked e2e project passed (80 tests, including routes and the axe regression on every legacy route), with the flagged build, which confirms legacy routes are unaffected by the carve-out and flag. The Playwright visual job (33 legacy baselines) runs in CI only; no legacy file or CSS changed.

## Known Stubs

None. The surface renders a heading and one line by design; the chrome, navigation and sections are plan 04-07's scope.

## Threat Flags

None beyond the plan's register: T-04-06-01 (flag, dynamic import, CI script, noindex, no nav link), T-04-06-02 and -03 (closed allowlists, `setProperty` only) are mitigated and tested; T-04-06-04 accepted (`next/font` self-hosts).

## Next Phase Readiness

Ready for 04-07 (chrome, section registry, first two sections) on top of `FixturesApp`. 04-07 must keep the section routes behind the same flag (the page file under `/dev/fixtures/[section]` must use the same gated dynamic import) so the flag-less `/dev/fixtures/tokens/` stays 404 and fixture-free.

## Self-Check: PASSED

- Created files exist: `src/app/dev/layout.tsx`, `src/app/dev/fixtures/page.tsx`, `src/features/fixtures/{index,marker,query,FixturesApp}`, `scripts/check-dev-fixtures-excluded.mjs`, `tests/unit/fixtures-query.test.ts`, `tests/e2e/fixtures-route.spec.ts` (checked on disk).
- Commits `06985b9`, `1ea2bc2`, `a390e3b`, `b41a1d2`, `a62c402` exist in `git log`.
- Every task acceptance criterion and the plan-level verification were re-run after the last code commit (see Verification run).
