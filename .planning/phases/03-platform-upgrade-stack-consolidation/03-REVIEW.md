---
phase: 03-platform-upgrade-stack-consolidation
reviewed: 2026-10-03T00:00:00Z
depth: standard
files_reviewed: 63
files_reviewed_list:
  - .github/workflows/ci.yml
  - dashboard-next/eslint.config.mjs
  - dashboard-next/next.config.js
  - dashboard-next/package.json
  - dashboard-next/playwright.config.ts
  - dashboard-next/scripts/copy-maplibre-worker.mjs
  - dashboard-next/tailwind.config.js
  - dashboard-next/src/app/api/client-error/route.ts
  - dashboard-next/src/app/dashboard/map/page.tsx
  - dashboard-next/src/app/error.tsx
  - dashboard-next/src/app/experience/page.tsx
  - dashboard-next/src/app/global-error.tsx
  - dashboard-next/src/app/globals.css
  - dashboard-next/src/app/layout.tsx
  - dashboard-next/src/app/page.tsx
  - dashboard-next/src/app/providers.tsx
  - dashboard-next/src/app/sites/page.tsx
  - dashboard-next/src/components/AnalysisResults.tsx
  - dashboard-next/src/components/Navbar.tsx
  - dashboard-next/src/components/experience/DemoState.tsx
  - dashboard-next/src/components/experience/LocationCompare.tsx
  - dashboard-next/src/components/experience/useDemoAudio.ts
  - dashboard-next/src/components/index.ts
  - dashboard-next/src/components/map/index.ts
  - dashboard-next/src/components/spectrogram/index.ts
  - dashboard-next/src/features/charts/PlotFigure.tsx
  - dashboard-next/src/features/charts/encodings.ts
  - dashboard-next/src/features/charts/index.ts
  - dashboard-next/src/features/map/MapShell.tsx
  - dashboard-next/src/features/map/MiniMap.tsx
  - dashboard-next/src/features/map/ReefMap.tsx
  - dashboard-next/src/features/map/SiteMarker.tsx
  - dashboard-next/src/features/map/SitePopup.tsx
  - dashboard-next/src/features/map/WorldMap.tsx
  - dashboard-next/src/features/map/index.ts
  - dashboard-next/src/features/map/layers.ts
  - dashboard-next/src/features/map/setup.ts
  - dashboard-next/src/features/map/style.ts
  - dashboard-next/src/features/monitoring/ClientErrorReporter.tsx
  - dashboard-next/src/features/monitoring/index.ts
  - dashboard-next/src/features/monitoring/rate-limit.ts
  - dashboard-next/src/features/monitoring/report.ts
  - dashboard-next/src/features/monitoring/schema.ts
  - dashboard-next/src/features/monitoring/scrub.ts
  - dashboard-next/src/features/monitoring/server.ts
  - dashboard-next/src/types/index.ts
  - dashboard-next/tests/e2e/a11y.spec.ts
  - dashboard-next/tests/e2e/maps.spec.ts
  - dashboard-next/tests/e2e/monitoring.spec.ts
  - dashboard-next/tests/e2e/review.spec.ts
  - dashboard-next/tests/unit/error-pages.test.tsx
  - dashboard-next/tests/unit/feature-fence.test.ts
  - dashboard-next/tests/unit/map-marker.test.tsx
  - dashboard-next/tests/unit/monitoring-report.test.ts
  - dashboard-next/tests/unit/monitoring-route.test.ts
  - dashboard-next/tests/unit/monitoring-scrub.test.ts
  - dashboard-next/tests/unit/platform-versions.test.ts
  - dashboard-next/tests/unit/stack-consolidation.test.ts
  - dashboard-next/tests/unit/tailwind-content.test.ts
  - docs/MONITORING.md
  - scripts/build-visual-review.mjs
  - scripts/check-feature-fence.mjs
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-10-03
**Depth:** standard
**Files Reviewed:** 63
**Status:** issues_found

## Summary

Reviewed the monitoring endpoint and reporter, error pages, MapLibre ports, Plot figure builders, the feature fence (ESLint and script), CI workflow, build scripts and the new/changed tests. No structural findings (fallow) were supplied.

The monitoring route is largely well built. It checks Origin, content type, a streamed body cap, a strict schema, rate-limits only valid reports, and re-scrubs on the server. Log injection is handled: `JSON.stringify` plus U+2028/2029 escaping keeps each entry to one line. The CI workflow uses `inputs.before_ref` only as an `actions/checkout` `ref:`, so there is no shell interpolation. `build-visual-review.mjs` uses `execFileSync` with an argument array, validates the ref, and HTML-escapes every interpolation. The feature fence has no hole that matters for the documented rule.

One defect is serious. The scrubber's documented "bounded work on hostile input" guarantee is false: one regex is cubic, and it runs on a public endpoint and on the visitor's main thread. The remaining findings are quality and robustness issues: the map error fallback is largely dead code, `ReefMap` has no keyboard path, scrubbed stacks lose their locating information and collide in the dedupe key, and some CI and test gaps.

## Critical Issues

### CR-01: Catastrophic (cubic) backtracking in `SLASH_QUERY_PATTERN` defeats the "bounded work" guarantee

**File:** `dashboard-next/src/features/monitoring/scrub.ts:46` (applied at `:57`); reachable from `dashboard-next/src/features/monitoring/server.ts:30` and `:125`, and from `report.ts:50`

**Issue:** `/(\S*\/\S*?)[?#]\S*/g` is O(n^3) on a long run of non-whitespace characters that contains `/` but no `?` or `#`. For each start position, `\S*` runs to the end of the token and backtracks to each `/`. For each of those, the lazy `\S*?` scans to the end looking for `[?#]`. The `MAX_SCRUB_INPUT = 10_000` cut comment says it bounds the work, but 10,000 characters is itself unusable here.

Measured on Node 24:

- 1,600 slashes took about 355 ms (`scrubStack('/'.repeat(1600))`).
- 800 slashes took 46 ms and 400 took 6 ms, which is cubic scaling.
- Extrapolated, a 10,000-character token would take about 90 s.

Impact:

1. **Server (public, unauthenticated endpoint).** The stack schema limit is 1608 characters, and a single-line 1600-slash stack passes the strict schema and the 4 KB body cap. Each such request blocks the Node event loop for about 350 ms in `scrubStack`. The rate limiter allows 30 valid requests a minute per instance, so an attacker can keep an instance about 18% busy, plus whatever extra instances they reach. The cost is CPU, and it also stalls the other requests on that instance.
2. **Client.** `reportClientError` scrubs the raw message and stack (up to 10k characters) synchronously inside the `error` and `unhandledrejection` handlers. An error message that contains a long slash-bearing token with no whitespace and no `?` or `#` freezes the tab. A base64 blob or long path in an error message is enough, and the error reporter becomes the incident.

No test covers hostile input timing.

**Fix:** Replace the regex with a linear token pass that strips the query and fragment only when the part before it contains a slash:

```ts
function stripPathQueries(text: string): string {
  return text.replace(/\S+/g, (token) => {
    const cut = token.search(/[?#]/);
    return cut > 0 && token.lastIndexOf('/', cut) !== -1 ? token.slice(0, cut) : token;
  });
}
// in scrubText: .replace(SLASH_QUERY_PATTERN, '$1')  ->  stripPathQueries(...)
```

Also lower `MAX_SCRUB_INPUT` to a few thousand characters, since the schema caps are well under 2 KB. Add a regression test that scrubs `'/'.repeat(10_000)` and `'a/'.repeat(5_000)` and asserts completion in under 50 ms. Check `FILE_QUERY_PATTERN` the same way: it is quadratic on long dot runs.

## Warnings

### WR-01: Scrubbing removes all locating information from stacks, and the dedupe fingerprint then collides

**File:** `dashboard-next/src/features/monitoring/scrub.ts:41,54` and `dashboard-next/src/features/monitoring/report.ts:36-40`

**Issue:** `URL_PATTERN` uses `\S+`. A normal browser frame like `at e (https://site/_next/static/chunks/app/page-1a2b.js:1:23456)` becomes `at e ([url]`. The file, line and column are gone, so a production stack (minified and without source maps) tells the owner nothing. Verified:

```
TypeError: Cannot read properties of undefined (reading 'x')
    at e ([url]
    at t ([url]
```

The reporter's fingerprint is `name|first frame`. After scrubbing, the first frame is only a minified function name (`e`, `t`, `n`), so distinct TypeErrors from unrelated places collide and the second is suppressed for 60 s. The message is not part of the key when a frame exists.

Separately, IPv4 addresses embedded in messages are not scrubbed (`192.168.1.20` passes through). The "no IP address" line in `docs/MONITORING.md` is true of request metadata but not of message content.

**Fix:**

- For same-origin asset URLs, keep the path and the `:line:col` (drop origin, query and fragment) instead of replacing the whole frame with `[url]`. Static `_next` paths are public and not secret.
- Include a short hash of the scrubbed message in `fingerprint` when frames are uninformative.
- Add an IPv4/IPv6 pattern to `scrubText`.

### WR-02: `MapErrorBoundary` is effectively dead for map failures, and map failures are never reported or shown

**File:** `dashboard-next/src/features/map/MapShell.tsx:93-154` (`ReefMap.tsx:158-179`, `WorldMap.tsx:133-156`, `MiniMap.tsx:113-140`)

**Issue:** `@vis.gl/react-maplibre` 8.1.3 (`components/map.js:42-53`) catches map initialisation failures in a promise `.catch`. It calls the `onError` prop or `console.error`, and never throws into React. Style-load and tile errors surface the same way, as MapLibre `error` events.

None of the three maps passes `onError`. A CARTO style outage, a blocked worker (`/maplibre/...` 404) or a context-creation failure therefore leaves a blank or empty map with no fallback, and the "Map failed to initialize" boundary never renders. The boundary only catches render-time exceptions.

Its message ("The WebGL context could not be created") is also wrong for most render errors. `componentDidCatch` only calls `console.error`, so boundary-caught errors never reach `reportClientError`, which defeats PLAT-09 for the one component most likely to fail.

**Fix:**

- Give `MapShell` an `onMapError` handler, passed as the `onError` prop of every `<Map>`. It sets a `failed` state that swaps in the fallback panel.
- In `componentDidCatch`, call `reportClientError(error, { source: 'error-boundary' })`.
- Make the copy generic ("The map could not be displayed").

### WR-03: The monitoring-network map (`ReefMap`) has no keyboard or screen-reader path to sites; its popup has no focus handling

**File:** `dashboard-next/src/features/map/ReefMap.tsx:129-197`, `dashboard-next/src/features/map/SitePopup.tsx:33-58`

**Issue:** `WorldMap` and `MiniMap` use real `<button>` markers with labels, Escape handling and focus return, and `maps.spec.ts` tests this. `ReefMap` renders sites as circle layers only. Selection is mouse-only (`onClick` on interactive layers), and `/dashboard/map` has no list or table alternative (WCAG 2.1.1 and 1.1.1).

The selected-site `SitePopup` is an absolutely positioned `div` with no `role="dialog"` or `role="region"` and no focus move on open. It has no Escape handler, and its close button has no `type`. Keyboard users cannot reach any site on the map that the page calls "Monitoring Network", and there is no e2e keyboard test for it.

**Fix:** Add a site list or table next to the map, or an accessible site `<select>`, that calls `onSiteSelect`. Give `SitePopup` `role="dialog"` with `aria-label`, focus its close button when it opens, and handle Escape. Add `type="button"` to the close button.

### WR-04: `seriesLine` smooths and draws an unsorted series in input order

**File:** `dashboard-next/src/features/charts/encodings.ts:207,230`

**Issue:** `Plot.line` does not sort, and `curveMonotoneX` assumes ascending x. Unsorted input produces a self-overlapping or wrong curve, and the hidden table lists rows in the same arbitrary order. For a figure type whose stated purpose is "honest axes", a misleading line is a correctness defect. `curveMonotoneX` also draws an interpolated curve between sparse samples. That implies values that were never measured, although each real point also has a dot.

**Fix:** Sort a copy by `x` before building both the figure and the table (`[...data].sort((a, b) => a.x - b.x)`). Consider `curveLinear` unless the smoothing is a deliberate, documented choice.

### WR-05: CI `concurrency` group lets a push and a snapshot-regeneration dispatch cancel each other

**File:** `.github/workflows/ci.yml:24-26`

**Issue:** `group: ci-${{ github.ref }}` with `cancel-in-progress: true` applies to `workflow_dispatch` runs too. A push to the branch while the `update_snapshots` dispatch (visual regen plus review captures, the slow path) is running cancels it. The reverse also happens: dispatching cancels the in-flight push CI on that ref, so a green push run can end up cancelled. It also happens on `pull_request` plus `push` of the same branch only if `github.ref` matches, so mixed-event cancellation is inconsistent.

**Fix:** Use `group: ci-${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}`, or set `cancel-in-progress: ${{ github.event_name != 'workflow_dispatch' }}`.

### WR-06: Real-render map tests skip silently when WebGL2 is missing, so CI can go green with no map coverage

**File:** `dashboard-next/tests/e2e/maps.spec.ts:84-87,128,182,205,251,342`

**Issue:** Every real-browser map assertion is guarded by `test.skip(!(await recordWebGL2(page)), ...)`. Nothing in CI fails if the Playwright image stops providing software WebGL2. The first test records an annotation, but a skipped test does not fail the job. The attribution, popup, fly-to and keyboard tests, which are the OSM/CARTO licence checks, could all vanish silently.

**Fix:** In CI (`process.env.CI`), turn the skip into a failing assertion (`expect(webgl2, 'CI image must provide WebGL2').toBe(true)`). Keep the skip for local runs.

## Info

### IN-01: Local `Map` import shadows the global; `SitePopup` has a dead ternary

**File:** `dashboard-next/src/features/map/ReefMap.tsx:5`, `MiniMap.tsx:4`, `WorldMap.tsx:4`, `SitePopup.tsx:25-30`

**Issue:** The three map modules import `Map` from `react-map-gl/maplibre`, shadowing the built-in `Map`. A later `new Map()` in the same file would silently break. `MiniMap` already aliases the lucide icon as `MapIcon`.

In `SitePopup`, the `countryName` ternary returns `site.country` or `'Unknown'` in every branch (the Indonesia and Kenya cases are identical to the fallback). It is dead logic.

**Fix:** `import { Map as MapGL, ... }`, and `const countryName = site.country || 'Unknown'`.

### IN-02: Popup contrast and marker target size

**File:** `dashboard-next/src/features/map/SiteMarker.tsx:90-122`, `:65-76`

**Issue:** The popup renders `text-gray-400` (#9ca3af, about 2.5:1) and `text-ochre` (#cd853f, about 2.9:1) on the white MapLibre popup, below the 4.5:1 WCAG AA minimum for small text. The marker button is 12 to 16 px, below the 24 px minimum target size (WCAG 2.5.8). Enlarge the hit area with padding or a transparent border without changing the dot.

### IN-03: The second `actions/checkout` persists credentials into a tree that then runs arbitrary-ref code

**File:** `.github/workflows/ci.yml:165-169`, `:189-198`

**Issue:** The `before` checkout leaves the token in `before/.git/config`, and then `npm ci` plus Playwright run from that tree. Only write-access users can dispatch and the token is `contents: read`, so the risk is low. It is still free to remove.

**Fix:** Add `persist-credentials: false` to the checkout with `ref: ${{ inputs.before_ref }}`.

### IN-04: `build-visual-review.mjs` does not escape state and capture names in the markdown

**File:** `scripts/build-visual-review.mjs:324,341`

**Issue:** `row.state` and `c.name` come from file names and are written unescaped into `| ... |` table rows, while causes and notes go through `mdEscape`. A name containing `|` corrupts the row, and `parseExisting` then drops the owner's decision on the next run. The HTML side is correctly escaped. Pass both through `mdEscape`, or reject names outside `[A-Za-z0-9_.-]`.

### IN-05: The documentation overstates the Origin check

**File:** `docs/MONITORING.md:72` (backed by `dashboard-next/src/features/monitoring/server.ts:48-50`)

**Issue:** "The route accepts only same-site JSON posts" is not what the code enforces. A request with no `Origin` header is accepted (the doc's own `curl` example sends none). The check blocks browser cross-site posts, not other clients. The real guards are the schema, the size cap and the per-instance rate limit. Reword to "rejects cross-site browser posts; other clients are bounded by the schema, size cap and best-effort rate limit".

---

_Reviewed: 2026-10-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
