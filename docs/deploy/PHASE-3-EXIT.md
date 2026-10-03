# Phase 3 exit evidence: Platform Upgrade and Stack Consolidation

Recorded 2026-10-03 by plan 03-15 on branch `redesign/v2-discovery`. Evidence only: public URLs, command lines, exit
codes, run ids and hashes. No tokens, presigned URLs, bypass secrets or addresses appear here. Nothing was merged to
main and no Vercel production deploy was run.

Phase goal: the dashboard runs on a current, single-stack platform (Next.js 16, React 19, one map engine, one chart
approach, no vitality layer, no Streamlit dashboard) with new code in fenced feature modules, one API client, and error
and web-vitals reporting, while every legacy route keeps working.

History note: on 2026-10-03 the branch was rewritten to fix the commit author email (file trees identical). Commit hashes
in the 03-01..03-14 summaries are the old ones; `docs/history/2026-10-03-commit-hash-map.txt` maps them. The visual review
"before" ref is `b780b15c8d32da2f9e2d2a0047ebdd04904b5e61` (old `1c74f866ca1a31eb8fe1dd7c6ac6ba6882154fa1`).

## Final sweep (2026-10-03, head 4bd7da8 plus this plan's documentation commits)

| Command | Exit | Result |
|---|---|---|
| `npm --prefix dashboard-next run lint` | 0 | 0 errors, 19 warnings (pre-existing) |
| `node scripts/check-contract-fence.mjs` (from `dashboard-next`) | 0 | no contract access outside `src/features/contract` (98 files scanned) |
| `node scripts/check-feature-fence.mjs` (from `dashboard-next`) | 0 | no legacy component imports in `src/features` (32 files scanned) |
| `npm --prefix dashboard-next run typecheck` | 0 | clean |
| `npm --prefix dashboard-next test` | 0 | 38 files, 503 tests passed (includes copy-claims, stack-consolidation, vitality-removed, platform-versions, feature-fence, tailwind-content and the PLAT-10 tests) |
| `npm --prefix dashboard-next run build` | 0 | Next.js 16.3.8 (Turbopack); routes `/`, `/about`, `/dashboard`, `/dashboard/analyze`, `/dashboard/compare`, `/dashboard/map`, `/experience`, `/sites` static, `/api/client-error` dynamic |
| `npx playwright test --project=e2e` (from `dashboard-next`) | 0 | 68 passed (routes, axe, analysis flow, maps, monitoring, contract) |
| `node scripts/check-citations.mjs --scope all` | 0 | schema valid, no banned-pattern hits (434 files) |
| `npm --prefix dashboard-next ls wavesurfer.js @deck.gl/core @deck.gl/layers @deck.gl/react leaflet react-leaflet @types/leaflet recharts` | 0 | `(empty)` |
| `py -3.12 -m pytest -q -p no:warnings` | 0 | all passed (unchanged by this phase) |
| `node scripts/build-visual-review.mjs --check --causes docs/deploy/phase-3-visual-review/causes.json` | 0 | 33 rows match the committed review; every non-identical row has a cause |

CI on head 4bd7da8 (the last code and review-page head before the exit documents): run
https://github.com/TyLuHow/ReefRadar/actions/runs/37149219903, success for web, e2e, python, citations and visual
(review and live-smoke skipped on push, as designed). The final run for the exit commit is recorded in
`03-15-SUMMARY.md`.

## Success criterion 1: Next.js 16.3.8 / React 19.3.0; every legacy route passes; visual diffs reviewed and accepted

| Evidence | Result |
|---|---|
| Hop 1: Next 14.2.35 to 15.5.26 and React 18 to 19.3.0, one commit, zero source edits | 03-03; CI https://github.com/TyLuHow/ReefRadar/actions/runs/37046040097 success, visual 33/33 on unchanged baselines |
| Hop 2: Next 15.5.26 to 16.3.8 (Turbopack) with ESLint 9.39.5 flat config carrying the contract fence unchanged | 03-04; CI https://github.com/TyLuHow/ReefRadar/actions/runs/37048363940 success, visual 33/33 on unchanged baselines |
| Versions are pinned and guarded | `dashboard-next/tests/unit/platform-versions.test.ts`; `npm ls` shows `next@16.3.8`, `react@19.3.0`, `react-dom@19.3.0` |
| Every legacy route (`/`, `/about`, `/sites`, `/dashboard`, `/dashboard/analyze`, `/dashboard/compare`, `/dashboard/map`, `/experience` and its demo, compare and sample states) loads cleanly and has no new serious or critical axe violations | `dashboard-next/tests/e2e/routes.spec.ts` and `a11y.spec.ts`, fixture-mocked; 68 e2e passed locally and in CI |
| Visual diffs against the Phase 1/2 baselines (before ref `b780b15`) regenerated through the CI dispatch and reviewed | 33 states compared by sha256: 32 identical, 1 changed (`experience-compare` at 390: static ochre crossfader thumb on a plain track instead of the glowing green thumb, and the removed "moving background is decorative" sentence). Baseline commit `85823cb`, dispatch run https://github.com/TyLuHow/ReefRadar/actions/runs/37146845603; runs 37147961091 and 37148763051 regenerated the same 33 PNGs byte-identically |
| Owner decision | **Accepted 2026-10-03** for the changed row and all six unhidden captures: [PHASE-3-VISUAL-REVIEW.md](PHASE-3-VISUAL-REVIEW.md) |

## Success criterion 2: only MapLibre renders maps; only Observable Plot + d3 modules for charts; Streamlit dashboard gone

| Evidence | Result |
|---|---|
| `npm ls` for wavesurfer.js, `@deck.gl/*`, leaflet, react-leaflet, `@types/leaflet`, recharts prints `(empty)` | final sweep above |
| Stack gate fails if any removed package or the Streamlit directory returns | `dashboard-next/tests/unit/stack-consolidation.test.ts` (03-02, extended in 03-08, 03-10, 03-11) |
| Streamlit `dashboard/` removed, docs describe only the Next.js dashboard | 03-02 |
| Maps: `/dashboard/map` ReefMap (03-08, maplibre-gl 6.11.2 with react-map-gl 8.1.3, one GeoJSON source, four circle layers), `/sites` WorldMap with keyboard-operable markers (03-09), analysis mini map (03-10) | runs https://github.com/TyLuHow/ReefRadar/actions/runs/37056271404, .../37062159576, .../37064006665 |
| Charts: Observable Plot 0.6.17 with d3-array, d3-format, d3-scale, d3-shape (exact pins, no d3 bundle), accessible `PlotFigure` | 03-11; run https://github.com/TyLuHow/ReefRadar/actions/runs/37065910328 |
| WebGL2 in the Linux Playwright image (assumption A1) | Confirmed: e2e `[maps.spec] WebGL2 available` in 03-08 with no launch-arg change; `meta.json` of the 03-15 review captures reports `webgl2: true` on all six pages in both trees |

## Success criterion 3: vitality store, colour engine, background canvas, caustics/particles, decorative spectrogram and dev panel gone; unhidden captures reviewed

| Evidence | Result |
|---|---|
| Ambient layer removed in two steps (canvas, theming loop, decorative spectrogram, dev panel in 03-06; store, audio-visual bridge, eight `--reef-*` tokens and Tailwind colours, static crossfader in 03-07) | runs https://github.com/TyLuHow/ReefRadar/actions/runs/37052267599 and .../37053836598 |
| DS-07 gate | `dashboard-next/tests/unit/vitality-removed.test.ts` fails if a removed file, import or token returns; the review captures show 0 canvases on landing, experience and experience-compare at the head versus 2 in the before tree |
| Capability matrix | CAP-25, 47, 76-80, 83, 84 read `retire` with the Q7 justification; CAP-81 and CAP-82 carried over as principles (03-07) |
| Unhidden before/after captures of landing, experience, experience-compare, sites, map and analyze reviewed | Owner accepted all six on 2026-10-03 ([PHASE-3-VISUAL-REVIEW.md](PHASE-3-VISUAL-REVIEW.md)); dispatch run https://github.com/TyLuHow/ReefRadar/actions/runs/37148763051 |

### Findings from the review captures (fixed in this plan)

| Finding | Fix |
|---|---|
| `tailwind.config.js` `content` did not list `src/features`, so classes used only there (`bottom-4`, `right-4` on the map legend) were never generated and the legends sat outside the map frame | `ff3cd64`; `tests/unit/tailwind-content.test.ts` fails when any className-bearing source directory is not covered (checked failing without the fix) |
| Map attribution text ("contributors") was light on a white pill and nearly unreadable | `99c3939`; dark grey colour on the pill |
| The first review capture answered the CARTO `style.json` with a PNG, so `/map` drew no markers or attribution | `ee487df` and `450260d`; the capture spec now stubs a valid empty style that carries the attribution text |

None of the fixes changed a gating baseline (maps and canvases are hidden there); the push CI visual job stayed green.

## Success criterion 4: feature modules fenced; one API client; React Query defaults and security headers asserted

| Evidence | Result |
|---|---|
| Fence layer 1: ESLint blocks on `@/components` imports under `src/features`; layer 2: `scripts/check-feature-fence.mjs` in the CI web job (relative paths and `require`) | 03-05, 30-case matrix in `tests/unit/feature-fence.test.ts`; sweep above; run https://github.com/TyLuHow/ReefRadar/actions/runs/37049926811 |
| One API client honours `NEXT_PUBLIC_API_URL` (CAP-09), no other fetch call sites | `tests/unit/api-client.test.ts` (03-01) |
| React Query defaults preserved (CAP-08) | `tests/unit/query-defaults.test.tsx` through the real Providers tree (03-01) |
| `vercel.json` security headers preserved (CAP-10) | `tests/unit/security-headers.test.ts` (03-01) |

## Success criterion 5: errors and web-vitals report to Vercel; MONITORING.md tells the owner where to look

| Evidence | Result |
|---|---|
| Client reporter scrubs uncaught errors and unhandled rejections and POSTs to `/api/client-error/`, which re-validates, re-scrubs, caps and rate-limits, then writes one `client-error {json}` line to Vercel runtime logs | 03-12; unit tests `monitoring-report`, `monitoring-route`, `monitoring-scrub`; run https://github.com/TyLuHow/ReefRadar/actions/runs/37068029774 |
| `error.tsx` and `global-error.tsx` show only the digest, focus the heading and report once; `@vercel/speed-insights` 2.0.0 in the root layout | 03-13; `tests/unit/error-pages.test.tsx`, `tests/e2e/monitoring.spec.ts`; run https://github.com/TyLuHow/ReefRadar/actions/runs/37069500680 |
| Owner guide: where each signal lives, filters, log line shape, scrubbing, caps, retention table | [docs/MONITORING.md](../MONITORING.md) |
| Preview proof (owner-approved preview deploy, 2026-10-03, no `--prod`): build Ready on Next.js 16.3.8; `GET /_vercel/speed-insights/script.js` 200; `POST /api/client-error/` with the MONITORING.md probe 204; `vercel logs` showed the `client-error` line (message "phase-3 monitoring probe") at 13:00:33; a malformed probe (`stack: null`) returned 400 and logged nothing | preview https://dashboard-next-pr1pqiwil-tyluhows-projects.vercel.app (Deployment Protection on, probed through `vercel curl`); built from commit `4a2721a` (old hash `5bfe91d`); recorded in MONITORING.md "Status of this check" |

## Requirements

| Requirement | Evidence |
|---|---|
| PLAT-01 Next.js 16 / React 19 with legacy routes functional | Criterion 1: both hops green in CI, route and axe e2e, visual diffs accepted by the owner |
| PLAT-02 one map engine, one chart approach, no unused dependencies, Streamlit gone | Criterion 2: `npm ls` `(empty)`, stack gate test, MapLibre ports, Plot + d3 |
| PLAT-03 feature modules with a lint fence against legacy imports | Criterion 4: ESLint blocks plus `check-feature-fence.mjs` in CI, 30-case test matrix |
| PLAT-09 error monitoring and web-vitals reporting | Criterion 5: reporter, route, error pages, Speed Insights, MONITORING.md, preview proof (204, script 200, log line seen) |
| PLAT-10 single API client with the configured base URL, React Query caching, security headers | Criterion 4: `api-client`, `query-defaults` and `security-headers` unit tests |
| DS-07 vitality system removed | Criterion 3: `vitality-removed` gate, 0 canvases in the head captures, owner acceptance of the before/after review |

## Production safety (T-03-15-03)

`git branch --show-current` is `redesign/v2-discovery`. `git ls-remote origin refs/heads/main` printed
`416561758b5970406c75e5c463747cbbc67df130` before this plan's work and again after the owner decision; the final value is
recorded in `03-15-SUMMARY.md`. No `vercel deploy --prod`, `vercel promote` or merge to main was run. The only Vercel
deployment was the owner-approved preview described above. The production frontend merge remains on hold by owner
decision.

## Residuals (known, owned by a later phase or the owner)

| Residual | Owner |
|---|---|
| ReefMap keeps its dark CARTO style; switching to a light OpenStreetMap raster style, and clustering dense markers (the world map shows overlapping markers), are not done | Phase 6 |
| The `/sites` world-map legend has no Unknown row (nine sites are Unknown); on `/sites` the legend partly covers one marker and sits just above the attribution pill, so a marker can be occluded | Phase 4 / Phase 6 |
| CAP-86 unused symbols (hooks, components, stores no longer imported) stay until their harvest notes (CAP-51, CAP-36) are consumed | later phases per CAP-86 note |
| The client-error rate limit is per server instance and best-effort | accepted (docs/MONITORING.md) |
| Hobby plan keeps error logs for 1 hour; a longer history or alerts need Sentry or another service, deferred | Owner (docs/MONITORING.md "Deferred") |
| The owner has not yet looked at the Vercel Logs tab and the Speed Insights tab with their own login; whether Speed Insights counts visits to a protected preview was not checked | Owner (docs/MONITORING.md "Status of this check") |
| `npm ci` on Vercel reported 11 vulnerabilities (1 low, 1 moderate, 9 high) against 4 locally for the same lockfile; `npm audit fix` was deliberately not run | Owner decision / a dependency-hygiene pass |
| `dashboard-next/scripts/record-bundle-sizes.mjs` is frozen: it reads `.next/app-build-manifest.json`, which Next.js 16 no longer writes, so no new bundle baseline was recorded in Phase 3 | Phase 16 (performance budgets, PLAT-08) |
| Historical documents (test reports, `PROJECT_STATUS.md`, `.planning/codebase`) still describe the old stack | not rewritten; live docs are current |
| The review page and `docs/deploy/phase-3-visual-review/` stay in the repository as the record of the accepted visual change | Owner may archive |
| Production still shows the pre-Phase-3 frontend until the owner approves the redesign merge | Owner |
| Tailwind remains 3.4.7 (the project constraints name a Tailwind v4 baseline for Safari 16.4); the move is not part of Phase 3 | Owner / a later design-system phase |
