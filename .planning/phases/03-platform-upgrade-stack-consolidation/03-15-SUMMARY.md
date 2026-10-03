---
phase: 03-platform-upgrade-stack-consolidation
plan: 15
subsystem: phase-exit
tags: [visual-baseline, owner-signoff, review-page, tailwind, docs, plat-01, plat-02, plat-03, plat-09, plat-10, ds-07]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: 03-14 review tooling (generator, review capture spec, snapshot dispatch review job)
provides:
  - one regenerated Linux baseline (experience-compare at 390) and a review page of 33 rows plus six unhidden before/after captures, accepted by the owner on 2026-10-03
  - a fix for a real regression the captures exposed (Tailwind never scanned src/features) with a guard test
  - docs/deploy/PHASE-3-EXIT.md with evidence for all five success criteria and the six requirements
  - live docs (README, CLAUDE.md, .claude/CLAUDE.md, ARCHITECTURE.md, dashboard-next/README.md) describing the real stack
affects: [phase-4]

actuals:
  tokens: 15700
  tasks: 3
  commits: 9

tech-stack:
  added: []
  patterns:
    - "tailwind.config.js content globs are guarded by a unit test that scans src for className-bearing directories"
    - "Review captures stub the CARTO style document with a valid empty style that carries the attribution text; tiles stay blocked"

key-files:
  created:
    - docs/deploy/PHASE-3-EXIT.md
    - docs/deploy/PHASE-3-VISUAL-REVIEW.md
    - docs/deploy/phase-3-visual-review/ (index.html, causes.json, before/, after/)
    - dashboard-next/tests/unit/tailwind-content.test.ts
  modified:
    - dashboard-next/tests/e2e/visual.spec.ts-snapshots/experience-compare-390-visual-linux.png
    - dashboard-next/tailwind.config.js
    - dashboard-next/src/app/globals.css
    - dashboard-next/tests/e2e/review.spec.ts
    - .github/workflows/ci.yml
    - scripts/build-visual-review.mjs
    - docs/MONITORING.md
    - README.md
    - CLAUDE.md
    - .claude/CLAUDE.md
    - ARCHITECTURE.md
    - dashboard-next/README.md
    - .planning/phases/03-platform-upgrade-stack-consolidation/03-13-SUMMARY.md

key-decisions:
  - "Three snapshot dispatches instead of one: the first exposed real defects, so two more were run to give the owner correct unhidden captures; every dispatch reproduced the same 33 baseline PNGs byte-identically"
  - "before_ref default moved to b780b15c8d32da2f9e2d2a0047ebdd04904b5e61, the post-rewrite hash of the old 1c74f86"
  - "Only the one changed baseline was copied in; the other 32 were verified sha256-identical"

requirements-completed: [PLAT-01, PLAT-02, PLAT-03, PLAT-09, PLAT-10, DS-07]

coverage:
  - id: C1
    description: "Success criterion 1: Next 16.3.8 / React 19.3.0, every legacy route passes e2e, axe and route checks; visual diffs regenerated through the CI dispatch, reviewed and accepted by the owner"
    requirement: PLAT-01
    verification:
      - kind: ci
        ref: "run 37159729175 at e13459d: web, e2e, python, citations, visual all success; owner decision 'accepted' 2026-10-03 recorded in docs/deploy/PHASE-3-VISUAL-REVIEW.md"
        status: pass
    human_judgment: true
  - id: C2
    description: "Only the declared state changed: 32 of 33 baselines byte-identical, experience-compare @ 390 changed with a stated cause"
    requirement: PLAT-01
    verification:
      - kind: command
        ref: "node scripts/build-visual-review.mjs --check --causes docs/deploy/phase-3-visual-review/causes.json exits 0; grep -c '| changed |' PHASE-3-VISUAL-REVIEW.md prints 1"
        status: pass
    human_judgment: false
  - id: C3
    description: "Success criterion 2: npm ls for the removed packages prints (empty); stack gate green; Streamlit gone"
    requirement: PLAT-02
    verification:
      - kind: command
        ref: "npm --prefix dashboard-next ls wavesurfer.js @deck.gl/core @deck.gl/layers @deck.gl/react leaflet react-leaflet @types/leaflet recharts prints (empty); stack-consolidation.test.ts passes"
        status: pass
    human_judgment: false
  - id: C4
    description: "Success criterion 3: vitality layer gone; unhidden before/after captures reviewed by the owner"
    requirement: DS-07
    verification:
      - kind: unit
        ref: "tests/unit/vitality-removed.test.ts passes (503 unit tests green)"
        status: pass
      - kind: other
        ref: "owner accepted all six captures 2026-10-03 (analyze, experience, experience-compare, landing, map, sites)"
        status: pass
    human_judgment: true
  - id: C5
    description: "Success criterion 4: fence, one API client, React Query defaults and security headers asserted"
    requirement: PLAT-03
    verification:
      - kind: command
        ref: "check-feature-fence.mjs exit 0 (32 files), check-contract-fence.mjs exit 0 (98 files); feature-fence, api-client, query-defaults and security-headers unit tests pass"
        status: pass
    human_judgment: false
  - id: C6
    description: "Success criterion 5: errors and web-vitals report to Vercel; MONITORING.md tells the owner where to look; preview proof run"
    requirement: PLAT-09
    verification:
      - kind: other
        ref: "owner-approved preview 2026-10-03: Ready, POST /api/client-error/ 204, speed-insights script 200, probe log line seen, malformed probe 400 (recorded in docs/MONITORING.md and PHASE-3-EXIT.md)"
        status: pass
    human_judgment: false
  - id: C7
    description: "Single API client with the configured base URL, React Query caching, security headers"
    requirement: PLAT-10
    verification:
      - kind: unit
        ref: "api-client.test.ts, query-defaults.test.tsx, security-headers.test.ts pass in the 503-test run"
        status: pass
    human_judgment: false
  - id: C8
    description: "Production safety: main unchanged, no production deployment, nothing merged"
    verification:
      - kind: command
        ref: "git ls-remote origin refs/heads/main prints 416561758b5970406c75e5c463747cbbc67df130 before and after"
        status: pass
    human_judgment: false

duration: long (three CI dispatches, owner review)
completed: 2026-10-03
status: complete
---

# Phase 3 Plan 15: Exit, Owner Sign-off and Stack Docs Summary

**The Phase 3 baselines were regenerated from CI (one PNG changed, 32 byte-identical), the review exposed and fixed a real Tailwind content bug that had hidden the map legends, the owner accepted every changed row and capture on 2026-10-03, and PHASE-3-EXIT.md plus accurate stack docs close the phase with CI fully green.**

## Task 1 (tracer): dispatch, baselines, review page

- Pre-step: the `before_ref` default in `.github/workflows/ci.yml` and `scripts/build-visual-review.mjs` was still the pre-rewrite `1c74f86…`. Updated to the post-rewrite hash `b780b15c8d32da2f9e2d2a0047ebdd04904b5e61` (from `docs/history/2026-10-03-commit-hash-map.txt`); commit `ea451ef`. I waited for that push's CI to finish before dispatching, so nothing was cancelled.
- Dispatch 1: https://github.com/TyLuHow/ReefRadar/actions/runs/37146845603 at `ea451ef857f7125a085502871c22d653497429ee`, all jobs success including visual (update mode) and review. Changed set: exactly one PNG, `experience-compare-390-visual-linux.png`, old sha256 `e20d3630e23201f67cb7b885ca311fa577b78e19f5266f0327efd5da0a1804c3`, new `aa4507d757df133e7c4fee8bafedfa54cd51edc7f5aa4df4dcc51a74ea8b92e5`. I viewed both: the crossfader thumb is now static ochre on a plain track instead of a glowing green thumb on a gradient, and the "moving background is decorative" sentence is gone (page 1319 to 1259 px). The other 32 were sha256-identical, so only that file was copied in; commit `85823cb`.
- WebGL2 (assumption A1): true on all six pages in both trees, with the SwiftShader flags. Head: maplibre on sites, map and analyze; none elsewhere; 0 canvases on landing, experience, experience-compare. Before tree: leaflet on sites and analyze, maplibre plus deck.gl overlays on map (3 canvases), 2 canvases on landing, experience and experience-compare. No fallback panels in either tree.
- Dispatches 2 and 3 (https://github.com/TyLuHow/ReefRadar/actions/runs/37147961091 at `ee487df`, https://github.com/TyLuHow/ReefRadar/actions/runs/37148763051 at `450260d`) regenerated the same 33 PNGs byte-identically and gave corrected captures; the review page cites run 3. Review page commit `4bd7da8`; `--check` exit 0, `git status` clean; push CI https://github.com/TyLuHow/ReefRadar/actions/runs/37149219903 all green.

## Task 2: owner sign-off

Checkpoint returned to the orchestrator with the review page path, the changed state and cause, the WebGL2 result and the run URLs. Owner decision, 2026-10-03: "accepted" for the changed baseline (experience-compare at 390) and all six unhidden captures. The review page was published at https://claude.ai/artifact/WscnJ7u4xU5HJSCTmUdX3E. No rejections.

## Task 3: decisions, docs, exit

- `PHASE-3-VISUAL-REVIEW.md` now carries `accepted` for the changed row and all six captures plus the dated sign-off paragraph; the generator was re-run so the HTML matches and `--check` exits 0.
- `docs/MONITORING.md` "Status of this check" records the preview proof; `03-13-SUMMARY.md` marks its checkpoint resolved (A2 and A6 resolved, A3 still unchecked); PLAT-09 marked complete.
- Live docs: Next.js 16 (React 19), MapLibre, Observable Plot + d3, no vitality layer, no Streamlit, `src/features` behind the legacy-import fence, error pages and `/api/client-error/` to Vercel logs with a pointer to MONITORING.md, current test tooling (Vitest 5, Playwright with axe), ESLint 9 flat config, Node >= 20.9. The Developer Profile section and historical reports were left untouched.
- `PHASE-3-EXIT.md` written in the PHASE-2-EXIT.md structure. Full local gate green: lint (0 errors), both fence scripts, typecheck, 503 unit tests, build, 68 e2e, `check-citations --scope all` (434 files), `npm ls` `(empty)`, pytest. Commit `e13459d`; CI https://github.com/TyLuHow/ReefRadar/actions/runs/37159729175 success for web, e2e, python, citations and visual.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tailwind never scanned `src/features/**`**
- **Found during:** Task 1 (viewing the first dispatch's review captures)
- **Issue:** `tailwind.config.js` `content` listed pages, components and app only. Classes used only under `src/features/map` (`bottom-4`, `right-4`) were never generated, so the `/sites` world-map "Reef Status" legend fell below the map frame and the `/map` legends were misplaced. Reproduced locally and confirmed in the generated CSS.
- **Fix:** added `./src/features/**/*.{js,ts,jsx,tsx,mdx}` and `tests/unit/tailwind-content.test.ts` (fails without the fix, checked).
- **Files modified:** dashboard-next/tailwind.config.js, dashboard-next/tests/unit/tailwind-content.test.ts
- **Verification:** unit 503/503, lint 0 errors, typecheck clean, e2e 68/68; push CI visual stayed green (no baseline changed)
- **Commit:** ff3cd64

**2. [Rule 1 - Bug] Map attribution text unreadable**
- **Found during:** Task 1 (local capture after the Tailwind fix)
- **Issue:** the plain-text "contributors" part of the attribution inherited the light page colour on the white pill; OSM attribution was effectively invisible.
- **Fix:** dark grey colour on the `.maplibregl-ctrl-attrib` pill in `globals.css`.
- **Commit:** 99c3939

**3. [Rule 3 - Blocking, capture tooling] Review capture broke the CARTO style**
- **Found during:** Task 1 (dispatch 1 `/map` capture showed no markers or attribution)
- **Issue:** `review.spec.ts` fulfilled `style.json` with a PNG, so the style was invalid and the map never loaded.
- **Fix:** stub a valid empty style (with the real attribution text); tiles stay blocked.
- **Files modified:** dashboard-next/tests/e2e/review.spec.ts
- **Commits:** ee487df, 450260d

### Interpretation notes

- **Three dispatches, not one.** The plan allows fix, push and re-dispatch after a regression; dispatches 2 and 3 only refreshed the unhidden captures after fixes 1 to 3. Nothing was pushed while a dispatch ran.
- **`before_ref` default** updated for the history rewrite (see Task 1).
- **03-13 checkpoint resolution** edited into 03-13-SUMMARY.md as the coordinator instructed; the Vercel `npm ci` audit counts (11 vs 4 locally) are a residual in PHASE-3-EXIT.md, not acted on.

**Total deviations:** 3 auto-fixed, 3 interpretation notes. **Impact:** the Tailwind fix repairs the visible map legends; no gating baseline changed.

## Known Stubs

None.

## Residuals

Carried in PHASE-3-EXIT.md: CARTO vs OSM style and marker clustering (Phase 6); legend has no Unknown row and, on `/sites`, partly covers one marker (Phase 4/6); CAP-86 unused symbols pending harvest; per-instance best-effort rate limit; Hobby 1-hour log retention and Sentry deferred; the owner's Logs-tab and Speed Insights-tab check; Vercel vs local audit counts; bundle-size script frozen (Next 16 has no app-build-manifest); historical docs still mention the old stack; Tailwind stays 3.4.7.

## Threat Flags

None. T-03-15-01 to 04 mitigated: one changed PNG inspected with a stated cause and owner sign-off; no push during any dispatch; main stayed `416561758b5970406c75e5c463747cbbc67df130` with no production deploy; evidence limited to public URLs, run ids, SHAs and hashes.

## Self-Check: PASSED

- Created files present: PHASE-3-EXIT.md, PHASE-3-VISUAL-REVIEW.md, phase-3-visual-review/index.html and causes.json, tailwind-content.test.ts
- Commits `ea451ef`, `85823cb`, `ff3cd64`, `ee487df`, `99c3939`, `450260d`, `4bd7da8`, `e13459d` in git log; CI runs 37149219903 and 37159729175 success
- Acceptance: `grep -c accepted` on the review markdown is 9; PHASE-3-EXIT.md mentions all six requirement ids; `grep -c "Next.js 16" CLAUDE.md` is 2; main unchanged
