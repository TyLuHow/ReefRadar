---
phase: 03-platform-upgrade-stack-consolidation
fixed_at: 2026-10-03T00:00:00Z
review_path: .planning/phases/03-platform-upgrade-stack-consolidation/03-REVIEW.md
iteration: 3
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
findings:
  - id: CR-01
    outcome: fixed
    commit: 6f6f47e
    follow_up_commit: fc0000e
  - id: WR-01
    outcome: fixed
    commit: 61d6816
    follow_up_commit: ba44795
  - id: WR-02
    outcome: "fixed: requires human verification"
    commit: 82aff9f
  - id: WR-03
    outcome: "fixed: requires human verification"
    commit: 1f22d3a
  - id: WR-04
    outcome: fixed
    commit: ab6a143
  - id: WR-05
    outcome: fixed
    commit: c264059
  - id: WR-06
    outcome: fixed
    commit: 3d7d64a
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-10-03
**Source review:** .planning/phases/03-platform-upgrade-stack-consolidation/03-REVIEW.md
**Iteration:** 3 (iteration 1 fixes plus the CR-01 follow-up fc0000e and the iteration 3 WR-01 regression fix ba44795; the re-review of iteration 1 found the regression)

**Summary:**
- Findings in scope: 7 (CR-01, WR-01 to WR-06; fix_scope critical_warning)
- Fixed: 7
- Skipped: 0

Info findings (IN-01 to IN-05) were out of scope and are untouched.

## Fixed Issues

### CR-01: Catastrophic (cubic) backtracking in `SLASH_QUERY_PATTERN`

**Files modified:** `dashboard-next/src/features/monitoring/scrub.ts`, `dashboard-next/tests/unit/monitoring-scrub.test.ts`
**Commit:** 6f6f47e
**Applied fix:** Replaced `SLASH_QUERY_PATTERN` and `FILE_QUERY_PATTERN` (cubic and quadratic) with one linear pass (`stripPathQueries`). It walks each whitespace-separated token once and cuts at the first `?` or `#` when the token contains a slash or the text before the marker ends in `name.ext`. The look-behind for the extension is a bounded 7-character slice. This also scrubs a second query later in the same token, which the old regex let through. `MAX_SCRUB_INPUT` lowered from 10,000 to 4,000. Added a timing regression suite with 9 adversarial inputs (4 KB and 10 KB slash runs, `a/` repeats, dot runs, `/?` repeats, email-safe runs, `a@` plus a dotted domain, a long token ending in `#`). Each runs `scrubText`, `scrubStack` and `scrubMessage` and must finish in under 50 ms. Semantic tests cover second queries, and punctuation and version strings that must not change. All pre-existing scrub, report and route tests stayed green.

**Follow-up (commit fc0000e), after CI run 37161517775 failed 4 timing tests on the GitHub runner:** the first commit fixed only the two path-query regexes. `EMAIL_PATTERN` was still quadratic: its unbounded `[A-Za-z0-9._%+-]+` in front of the `@` rescanned the whole run from every start position when no `@` followed. That is why the dot-run, dotted-token, email-safe-run and `@`-plus-dotted-domain cases failed (the slash cases passed). All quantifiers in `EMAIL_PATTERN` are now bounded (local part 256, label 63, at most 9 labels, TLD 63), so each start position costs O(1). The 50 ms wall-clock assertion was replaced by a CI-robust pair: a 500 ms ceiling for one 4 KB call, and a scaling check of per-character cost at 4000 against 250 characters (best of 5 rounds, ratio under 4; linear is about 1, quadratic about 10 to 16). It covers 14 adversarial shapes. Run against the pre-fix `scrub.ts`, 8 of them fail; against the fix, all pass.

Scrub time for `scrubText` alone, local, in ms per call (500 / 1000 / 2000 / 4000 characters):

| Input | Before (c264059) | After (fc0000e) |
|---|---|---|
| run of dots | 0.11 / 0.30 / 1.12 / 5.35 (about 4x per doubling, quadratic) | 0.18 / 0.35 / 0.71 / 1.44 |
| `a.` repeated | 0.09 / 0.32 / 1.21 / 5.99 | 0.18 / 0.37 / 0.79 / 1.77 |
| `a.b-c` repeated | 0.13 / 0.40 / 1.22 / 4.79 | 0.15 / 0.36 / 0.84 / 1.76 |
| `a@` plus dotted domain | 0.09 / 0.32 / 2.49 / 4.74 | 0.15 / 0.36 / 0.81 / 2.18 |
| run of slashes | 0.02 / 0.01 / 0.02 / 0.04 | 0.01 / 0.01 / 0.02 / 0.04 |

After the fix each doubling costs about 2x or less, so the scrubber is linear. Before, it was about 4x per doubling.

### WR-01: Scrubbing removes locating information from stacks; dedupe fingerprint collides

**Files modified:** `dashboard-next/src/features/monitoring/scrub.ts`, `dashboard-next/src/features/monitoring/report.ts`, `dashboard-next/tests/unit/monitoring-scrub.test.ts`, `dashboard-next/tests/unit/monitoring-report.test.ts`, `docs/MONITORING.md`
**Commit:** 61d6816
**Applied fix:**
- A same-site build-asset URL (`https://host/_next/...`) now keeps its path and the trailing `:line:col`, and drops origin, query and fragment. Every other URL is still `[url]`, so signed S3 URLs and uploaded file names stay scrubbed. The scope is limited to `/_next/` because the scrubber is shared with the server, which does not know the site's origin.
- Added `[ip]` scrubbing for dotted IPv4 and for IPv6 in full or `::` form. `line:col` pairs, `React 19.2` and similar text are unaffected, and tests assert that.
- The dedupe fingerprint is `name|frame` only when the frame carries `line:col`. Otherwise it also includes the scrubbed message, so unrelated errors with a bare minified frame (`at e`) no longer suppress each other.
- `docs/MONITORING.md` updated: IP scrubbing, the `/_next/` exception and the fingerprint rule.
- One existing test expected `[url]` inside a `/_next/` stack frame. It now asserts the kept path, which is the behaviour the finding asked for.

**Regression fix (iteration 3, commit ba44795):** the re-review found that the first WR-01 fix introduced a leak. `NEXT_ASSET_URL_PATTERN` excluded `:` from its path and query classes, so a query or fragment containing a colon only partly dropped. Examples: `?url=https://bkt.s3.amazonaws.com/uploads/me.wav?...` left the bucket host and upload file name, `?v=tok:SECRETSECRET` kept `:SECRETSECRET`, and `#frag:secret/foo.wav` kept `:secret/foo.wav`. The pattern now consumes the whole asset token to the next whitespace (`/_next/\S*`), and `keepAssetLocation` rebuilds it: trailing closing parentheses are kept, a trailing `:line` or `:line:col` is kept, and the path is cut at its first `?`, `#` or `:`. Everything else is dropped, including a second URL smuggled through a colon in the path. Regression tests assert none of `bkt`, `amazonaws`, `me.wav`, `SECRET`, `secret/foo` appear for the three reported inputs, and that `https://h/_next/static/chunks/a.js:1:23456` still becomes `/_next/static/chunks/a.js:1:23456`. Four asset-URL shapes were added to the linear-scaling suite (long colon tail, long run of closing parentheses, repeated URL starts with and without whitespace); all pass. `docs/MONITORING.md` now states exactly what is kept and notes that a digits-only tail such as `?v=1:23` can survive as `:23`, since it is indistinguishable from a line number.

### WR-02: `MapErrorBoundary` is effectively dead for map failures

**Files modified:** `dashboard-next/src/features/map/MapShell.tsx`, `ReefMap.tsx`, `WorldMap.tsx`, `MiniMap.tsx`, `dashboard-next/tests/unit/map-shell.test.tsx`
**Commit:** 82aff9f
**Status:** fixed: requires human verification (error-classification logic)
**Applied fix:**
- `MapShell` accepts a function child that receives `onMapError`. All three maps pass it as `<Map onError>`.
- `onMapError` reports every map error through `reportClientError(..., { source: 'error-boundary' })`. It swaps in the failure panel only for a fatal error: a missing map instance (`target: null`, which is how react-maplibre reports init failure, a blocked worker or a failed WebGL context), or a failure to fetch the style document (`ReefMap` passes `styleUrl`). Tile, sprite and glyph errors are reported but the map stays.
- `MapErrorBoundary.componentDidCatch` now also calls `reportClientError`.
- The failure panel keeps its heading ("Map failed to initialize", per UI-SPEC). The body no longer claims the WebGL context failed. It reads "The map could not be displayed. This can happen with a blocked network request, certain GPU drivers or browser configurations. ..."
- Unit tests cover the fatal and non-fatal split, the style-URL case and boundary reporting.

Verify by hand: block `/dashboard/map` style or worker requests in DevTools and confirm the panel appears. A blocked single tile should leave the map in place.

### WR-03: `ReefMap` has no keyboard path; popup has no focus handling

**Files modified:** `dashboard-next/src/features/map/SiteList.tsx` (new), `ReefMap.tsx`, `SitePopup.tsx`, `dashboard-next/tests/unit/map-shell.test.tsx`, `dashboard-next/tests/e2e/maps.spec.ts`
**Commit:** 1f22d3a
**Status:** fixed: requires human verification (keyboard UX)
**Applied fix:**
- New `SiteList`: a `role="group"` named "Monitoring sites" with one `<button type="button">` per site. It uses the same label as the `/sites` markers (`siteMarkerLabel`) and `aria-pressed` for the selected site. It is visually hidden (1px clip, still focusable and in the accessibility tree). While keyboard focus is inside it, it becomes a visible, scrollable panel at the map's top-left. Choosing a site selects it exactly as a circle click does and eases the map there (instant under reduced motion).
- `SitePopup` now has `role="dialog"` and `aria-label="Site details: {id}"`. It moves focus to its close button on open and closes on Escape. The close button has `type="button"`. `ReefMap` returns focus to the list button that opened the popup.
- Added unit tests and an e2e keyboard test: focus a list button, press Enter, the dialog opens with focus on Close, Escape closes it, and focus returns to the list button.
- **Visual baselines: no change declared, none regenerated.** The list is clipped to 1px at rest, so resting pixels are identical, and the visual project already hides `canvas, .maplibregl-map`. The popup is not part of any snapshot.

Verify by hand: tab onto `/dashboard/map` and confirm the list panel placement does not clash with the region select and legend on a narrow viewport.

### WR-04: `seriesLine` draws an unsorted series in input order

**Files modified:** `dashboard-next/src/features/charts/encodings.ts`, `dashboard-next/tests/unit/plot-figure.test.tsx`
**Commit:** ab6a143
**Applied fix:** The filtered copy is sorted by `x` before the figure and the table are built, and the caller's array is not mutated. A test covers an unsorted input. `curveMonotoneX` was kept: an existing test asserts the d3-shape curve as a deliberate choice, and monotone interpolation does not overshoot.

### WR-05: CI `concurrency` lets a push and a dispatch cancel each other

**Files modified:** `.github/workflows/ci.yml`
**Commit:** c264059
**Applied fix:** `group: ci-${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}` with `cancel-in-progress: true` kept. A push run and a `workflow_dispatch` run on one ref no longer cancel each other, and two quick pushes still cancel the older run.

### WR-06: Real-render map tests skip silently when WebGL2 is missing

**Files modified:** `dashboard-next/tests/e2e/maps.spec.ts`, `.github/workflows/ci.yml`
**Commit:** 3d7d64a
**Applied fix:** New `requireWebGL2(page, reason)` helper replaces all six `test.skip(!webgl2, ...)` sites. When `process.env.CI` is set it asserts WebGL2 is available, so a missing WebGL2 fails the job. Otherwise it skips as before. The `e2e` job now sets `CI: "true"` explicitly (GitHub also sets it inside the Playwright container).

## Verification

Run in the **main checkout** (`workflow.use_worktrees` is `false`, so no worktree was created). Results are reproducible from this tree (fixes through `c264059`, CR-01 follow-up at `fc0000e`, WR-01 regression fix at `ba44795`).

| Gate | Result |
|------|--------|
| `npx vitest run` | 38 files, 536 tests, all passed (re-run after ba44795; the e2e, build and fence rows below were run at c264059 and the follow-up touches only `scrub.ts` and its unit test) |
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors; 19 warnings, all in untouched legacy files (`analyze/page.tsx`, `AudioCompare`, `SpectrogramCanvas`, `ProbabilityBars`, `useAudioPlayer`, `useSpectrogram`, `contract-schema-parity.test.ts`) |
| `check-contract-fence.mjs` | OK (99 files) |
| `check-feature-fence.mjs` | OK (33 files) |
| `npm run build` | passed (exit 0) |
| `npx playwright test --project=e2e` (port 3100, free) | 69 passed, 0 skipped. WebGL2 was available locally, so the real-render map tests, including the new keyboard test, ran. |

Not run: the `visual` project (Docker-pinned, CI only), and any Vercel or AWS action. The open Windows-ledger items (preview proof, Vercel bypass) are unchanged.

---

_Fixed: 2026-10-03_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
