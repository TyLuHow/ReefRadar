---
phase: 03-platform-upgrade-stack-consolidation
verified: 2026-10-03T19:30:00Z
status: passed
score: 5/5 roadmap success criteria verified (0 gaps, 0 blockers)
behavior_unverified: 0
overrides_applied: 0
re_verification: false
gaps: []
deferred: []
human_verification:
  - test: "Map failure panel (review fix WR-02, 82aff9f). Open /dashboard/map on a preview, block the map style request (CARTO style.json) or the maplibre worker in DevTools, reload."
    expected: "The 'Map failed to initialize' panel appears. Blocking a single tile leaves the map in place."
    why_human: "REVIEW-FIX marks it 'fixed: requires human verification (error-classification logic)'. Unit tests (map-shell.test.tsx) cover the fatal/non-fatal split, but real MapLibre init/network failure was not exercised."
  - test: "Keyboard path on /dashboard/map (review fix WR-03, 1f22d3a). Tab onto the map page, use the hidden site list, press Enter on a site, press Escape."
    expected: "List panel appears on focus without clashing with the region select and legend at a narrow viewport. The popup dialog takes focus on Close, Escape closes it, focus returns to the list button."
    why_human: "REVIEW-FIX marks it 'requires human verification (keyboard UX)'. An e2e keyboard test exists and CI is green, but layout clash at narrow widths is a visual judgement."
  - test: "Owner login check of monitoring (docs/MONITORING.md 'Status of this check'). Within 1 hour of a probe, open Vercel > dashboard-next > Logs (Request Path /api/client-error/, Level Error) and the Speed Insights tab."
    expected: "The 'client-error {...}' probe line is visible in Logs and the Speed Insights tab exists."
    why_human: "Only the owner's Vercel login can confirm. Preview proof (204, script 200, log line seen via CLI) is recorded and accepted per the success criterion, so this is advisory, not a gap. Whether Speed Insights counts protected-preview visits is unchecked."
---

# Phase 3: Platform Upgrade and Stack Consolidation Verification Report

**Phase Goal:** The dashboard runs on a modern, single-engine stack with the bioluminescent vitality layer removed, while every legacy route keeps working.
**Verified:** 2026-10-03
**Status:** human_needed (all five success criteria verified in the codebase; three advisory human items remain, none a gap)
**Re-verification:** No (initial verification)

Production frontend merge is on hold by owner decision and is not a gap. `git ls-remote origin refs/heads/main` still returns `416561758b5970406c75e5c463747cbbc67df130`, the value recorded in PHASE-3-EXIT.md.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Next.js 16 / React 19; every legacy route works, passes e2e, visual diffs reviewed and accepted | VERIFIED | `npm ls`: next@16.3.8, react@19.3.0, react-dom@19.3.0 (pinned in package.json, guarded by `platform-versions.test.ts`). `next.config.js` keeps `trailingSlash: true`, `images.unoptimized`. CI run 37163223344 on HEAD 9f6d0ab: web, e2e (routes plus axe), visual, python, citations all success. `docs/deploy/PHASE-3-VISUAL-REVIEW.md`: 33 states compared, 32 identical, 1 changed (experience-compare at 390, cause stated), 6 unhidden captures, all marked accepted 2026-10-03. The owner's acceptance is recorded in the doc and given in the task brief. I did not independently witness it. |
| 2 | Only MapLibre renders maps; only Plot + d3 render charts; wavesurfer, deck.gl, Leaflet, recharts, Streamlit gone from deps and repo | VERIFIED | `npm ls wavesurfer.js @deck.gl/* leaflet react-leaflet @types/leaflet recharts` prints `(empty)`. `git grep` of the pre-phase tree (b780b15) shows recharts and wavesurfer never had a `src` import site, so "chart pixels" did not move. No import of any removed package in `dashboard-next/src` (only historical comments and the gate test). `maplibre-gl` / `react-map-gl` are imported only under `src/features/map`. `@observablehq/plot` and d3 modules are imported only in `src/features/charts/encodings.ts`. Repo-root `dashboard/` does not exist. Remaining "streamlit" hits are only historical docs, planning files and prompts. `stack-consolidation.test.ts` gates all of this and passes. |
| 3 | Vitality store, colour engine, background canvas, caustics/particles, decorative spectrogram, dev panel removed; legacy pages render cleanly | VERIFIED | `src/stores` holds only `analysis-store.ts`. `src/lib` has no `color-engine`. Grep of `src` for vitality, color-engine, BackgroundCanvas, caustic, particle, `--reef-`, useAudioVisualBridge: no code hits (two stale comments mention Leaflet). `providers.tsx` is only QueryClient, ContractVersionSync, ClientErrorReporter. `vitality-removed.test.ts` passes. Review captures show 0 canvases on landing/experience/experience-compare. `src/components/audio/SpectrogramCanvas.tsx` and `useSpectrogram` remain: these are the real analyzer spectrogram, not the decorative one. Capability rows retired per PHASE-3-EXIT. |
| 4 | Feature modules; lint fails on legacy-component imports; single API client honouring configured base URL; React Query caching and security headers preserved | VERIFIED | `src/features/{charts,contract,map,monitoring}` exist. `eslint.config.mjs` has `no-restricted-imports` (`@/components`, `@/components/**`) plus an `ImportExpression` selector for dynamic import under `src/features/**`. `node ../scripts/check-feature-fence.mjs` exit 0 (33 files), `check-contract-fence.mjs` exit 0 (99 files). `src/lib/api.ts` reads `NEXT_PUBLIC_API_URL` and is the only module building API URLs. Other `fetch(` sites are static audio assets (`url_path`, `/audio/compare/manifest.json`), the contract module's CloudFront client, and the monitoring POST, none of which hit the API. `providers.tsx` keeps `staleTime: 60 * 1000`, `refetchOnWindowFocus: false`. `vercel.json` keeps nosniff, DENY, strict-origin-when-cross-origin. Asserted by `api-client`, `query-defaults`, `security-headers` unit tests (all pass). |
| 5 | Production errors and web-vitals reported to an owner-openable destination | VERIFIED | `@vercel/speed-insights` 2.0.0 and `<SpeedInsights />` in `app/layout.tsx`. `ClientErrorReporter` mounted in `providers.tsx`. `app/api/client-error/route.ts` delegates to `features/monitoring/server`, `force-dynamic`, nodejs runtime. `app/error.tsx` uses `retry`, shows only the digest, reports with source `error-boundary`. `global-error.tsx` exists. `docs/MONITORING.md` documents Logs and Speed Insights locations, filters, log-line shape, scrubbing, caps, and the Hobby 1-hour retention. Preview proof (build Ready, script 200, probe 204, log line seen, malformed probe 400) is recorded, accepted by the success criterion. Unit tests `monitoring-*` and `error-pages` pass. |

**Score:** 5/5 verified.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `dashboard-next/package.json` | VERIFIED | Pins match the plan: next 16.3.8, react 19.3.0, maplibre-gl 6.11.2, react-map-gl 8.1.3, Plot 0.6.17, four d3 modules exact. |
| `dashboard-next/eslint.config.mjs` | VERIFIED | ESLint 9 flat config carrying contract fence and the feature fence. |
| `scripts/check-feature-fence.mjs` | VERIFIED | Exists, runs, wired into the CI web job. |
| `src/features/map/*` | VERIFIED | WorldMap, MiniMap, ReefMap, SiteMarker, MapShell on MapLibre. |
| `src/features/charts/{PlotFigure,encodings}` | VERIFIED, no consumer | See warning below. |
| `src/features/monitoring/*`, `app/api/client-error/route.ts`, `app/error.tsx`, `app/global-error.tsx` | VERIFIED | Wired through `providers.tsx`, layout and route. |
| `docs/MONITORING.md`, `docs/deploy/PHASE-3-EXIT.md`, `docs/deploy/PHASE-3-VISUAL-REVIEW.md` | VERIFIED | Present and consistent with the code. |

### Key Link Verification

| From | To | Status |
|------|----|--------|
| `layout.tsx` | `@vercel/speed-insights/next` | WIRED |
| `providers.tsx` | `ClientErrorReporter` to `reportClientError` to `POST /api/client-error/` to `handleClientErrorPost` | WIRED |
| `error.tsx` / `global-error.tsx` | `reportClientError` | WIRED |
| `eslint.config.mjs` | `src/features/**` legacy-import ban | WIRED (also second line in CI) |
| Pages to `src/features/map` maps | WIRED |
| `tailwind.config.js` content | includes `./src/features/**` | WIRED (fixes a real finding from the review captures) |

### Behavioral Spot-Checks and Commands Run

| Check | Result | Status |
|-------|--------|--------|
| `npm test` (vitest) | 38 files, 536 tests passed | PASS |
| `npm run typecheck` | clean | PASS |
| `npm run lint` | 0 errors, 19 warnings (pre-existing React Compiler warnings on the legacy tree) | PASS |
| feature fence and contract fence | exit 0 each | PASS |
| `npm ls` for removed packages | `(empty)` | PASS |
| `gh run view 37163223344` | head 9f6d0ab, web/e2e/visual/python/citations success, live-smoke and review skipped as designed | PASS |
| `next build` and Playwright e2e | not re-run locally. Covered by the green CI run on the same HEAD (web job includes build, e2e job runs `--project=e2e`) | accepted via CI |

No behavior-dependent truth lacks a behavioral test: the monitoring scrub, rate limit, report dedupe, error-page and map-shell behaviours each have unit tests that I ran as part of the 536.

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|-------------|----------------|--------|----------|
| PLAT-01 | 03-03, 03-04, 03-14, 03-15 | SATISFIED | Truth 1 |
| PLAT-02 | 03-02, 03-08, 03-09, 03-10, 03-11, 03-15 | SATISFIED | Truth 2 |
| PLAT-03 | 03-05, 03-15 | SATISFIED | Truth 4 |
| PLAT-09 | 03-12, 03-13, 03-15 | SATISFIED | Truth 5 |
| PLAT-10 | 03-01, 03-15 | SATISFIED | Truth 4 |
| DS-07 | 03-06, 03-07, 03-14, 03-15 | SATISFIED | Truth 3 |

All six IDs are claimed by at least one plan and are marked Complete in REQUIREMENTS.md. No orphaned requirements.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| source and scripts | TBD / FIXME / XXX | none | Only binary PNG baselines matched the byte pattern. No marker in code. |
| `src/features/map/MiniMap.tsx:62,128`, `layers.ts:94` | stale "Leaflet" / "deck-style" comments | Info | Comments only. |
| `.planning/phases/03-.../03-REVIEW.md` | Internally inconsistent: frontmatter says iteration 3, status clean. The body is the iteration-2 re-review text (status issues_found) with open WR-01. | Info | The WR-01 defect it describes is fixed in code (`scrub.ts` now uses `/_next/\S*` plus `keepAssetLocation`; commit ba44795 and tests pass). Only the document is stale. |

### Warnings (non-blocking, none counted as gaps)

1. **PlotFigure has no consumer.** `src/features/charts` is exercised only by `plot-figure.test.tsx` and the stack gate. CONTEXT said "replace every recharts usage with Plot", but recharts had zero render sites at phase start (verified in git at b780b15), and the hand-built `ProbabilityBars` uses no chart library. Success criterion 2 holds: no other chart engine exists, and Plot + d3 is the only declared one. UI-SPEC approved this and defers adoption to Phase 9. This is an orphaned-by-design artifact, not a stub.
2. **Documented residuals (PHASE-3-EXIT), accepted and owned by later phases:** dark CARTO style and no marker clustering (Phase 6); `/sites` legend lacks an Unknown row and may occlude a marker (Phase 4/6); `record-bundle-sizes.mjs` frozen on Next 16 (Phase 16); Tailwind still v3.4.7 (Phase 4, per CONTEXT); 1-hour Hobby log retention (owner accepted); `npm ci` on Vercel reports more vulnerabilities than local (owner decision).

### Human Verification Required

See frontmatter. Items 1 and 2 come from REVIEW-FIX entries that explicitly request a human check. Item 3 is the owner-login check already named in MONITORING.md. None blocks the phase goal. Under the verifier decision tree any human item routes the status to `human_needed`, so proceed as "complete with advisory human checks" if the owner agrees.

### Gaps Summary

No gaps. All five roadmap success criteria and all six requirement IDs are backed by code, passing tests, fences, a green CI run on the exact HEAD, and the recorded owner acceptances. The remaining items are manual UX and owner-login confirmations.

---

_Verified: 2026-10-03_
_Verifier: Claude (gsd-verifier)_

## Human Verification Outcome

Owner accepted all three advisory items on 2026-10-04 (see 03-UAT.md).
