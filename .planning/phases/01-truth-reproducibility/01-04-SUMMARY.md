---
phase: 01-truth-reproducibility
plan: 04
subsystem: testing
tags: [playwright, axe-core, accessibility, visual-regression, live-deployment]

# Dependency graph
requires:
  - phase: 01-01
    provides: playwright.live.config.ts (live-deployment test config, -live.spec.ts testMatch), @axe-core/playwright and @playwright/test installed
provides:
  - Pre-redesign visual + accessibility baseline (33 screenshots, 11 axe reports + summary) captured from the live production deployment, before any legacy-UI change
  - Capture manifest (routes.json) with provenance (captured_at, base_url, repo HEAD) per file
  - Baseline policy README establishing "referenced, never regenerated"
  - Per-route serious/critical axe rule summary consumed by the 01-08 CI a11y regression gate
affects: [01-08, 01-20, phase-03-redesign]

# Actuals (#2632)
actuals:
  tokens: 1166545
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: ["Live-deployment Playwright capture spec parameterized by STATES x WIDTHS tables, writing explicit screenshot paths rather than toHaveScreenshot (archive for human review, not pixel assertion)", "Inline redaction of presigned-S3 query strings from axe html/target fields before any report is written to disk"]

key-files:
  created:
    - dashboard-next/tests/e2e/baseline-live.spec.ts
    - dashboard-next/tests/baseline/README.md
    - dashboard-next/tests/baseline/pre-truth/routes.json
    - dashboard-next/tests/baseline/pre-truth/screenshots/ (33 JPEGs)
    - dashboard-next/tests/baseline/pre-truth/axe/ (11 reports + summary.json)
  modified: []

key-decisions:
  - "Captured from the live production deployment (https://dashboard-next-indol-nu.vercel.app), not a local build — repo HEAD cannot build until plan 01-07 restores the gallery source; the live deployment is exactly what users see today, matching D-20's intent"
  - "Built the full capture spec (all 11 states x 3 widths) from the start, then ran only the landing/1440 subset for the Task 1 tracer, and widened STATES/WIDTHS for Task 2's full-matrix run — one spec file serves both tasks without duplication"
  - "Redaction runs unconditionally on every axe JSON (not just gallery-adjacent states) — cheaper than tracking which states might embed presigned URls and eliminates any chance of missing one"
  - "Axe captured at 1440px only (per plan), one scan per state, not per width — 11 reports, not 33"

requirements-completed: [TRUTH-10]

coverage:
  - id: D1
    description: "Playwright spec drives STATES x WIDTHS capture against the live deployment, saving full-page JPEG screenshots to tests/baseline/pre-truth/screenshots/"
    requirement: "TRUTH-10"
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/baseline-live.spec.ts (33 tests, `npx playwright test -c playwright.live.config.ts tests/e2e/baseline-live.spec.ts`)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Axe-core scan (WCAG2A/AA/21AA/22AA) per route at 1440px, with presigned-S3 query strings redacted from html/target before writing axe/<state>.json"
    requirement: "TRUTH-10"
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/baseline-live.spec.ts (axe/*.json acceptance: grep -rlc 'X-Amz-Security-Token|AWSAccessKeyId=' returns nothing)"
        status: pass
    human_judgment: false
  - id: D3
    description: "axe/summary.json aggregates serious/critical rule ids and node counts per route, for the 01-08 CI a11y regression gate"
    requirement: "TRUTH-10"
    verification:
      - kind: other
        ref: "node -e \"Object.keys(require('./dashboard-next/tests/baseline/pre-truth/axe/summary.json')).length===11\""
        status: pass
    human_judgment: false
  - id: D4
    description: "tests/baseline/README.md documents what/where/why-live, redaction applied, and the 'referenced, never regenerated' policy, plus the relationship to the separate post-truth CI pixel baseline from plan 01-20"
    requirement: "TRUTH-10"
    verification:
      - kind: other
        ref: "grep -c 'do not regenerate' dashboard-next/tests/baseline/README.md"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 04: Pre-Truth Baseline Capture Summary

**33 full-page JPEG screenshots (11 routes x 3 widths) plus 11 redacted axe-core accessibility reports and a serious/critical rule summary, captured from the live production deployment before any legacy-UI change this phase.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-01T06:35:33Z
- **Completed:** 2026-10-01T06:42:05Z
- **Tasks:** 2
- **Files modified:** 48 (1 spec file, 1 README, 1 manifest, 33 screenshots, 12 axe JSON files — 11 reports + summary)

## Accomplishments
- Built `tests/e2e/baseline-live.spec.ts`, a single parameterized Playwright spec (STATES x WIDTHS) that captures the live deployment, redacts presigned-S3 credential material from axe output inline, and appends a provenance entry (state, path, width, captured_at, base_url, repo_head) to `routes.json` for every file written.
- Captured all 11 route states reachable by URL (landing, about, sites, dashboard, analyze, compare, map, experience, experience-demo, experience-compare, experience-sample) at 1440/1024/390px — 33 screenshots, zero render failures, zero `render_note` entries.
- Ran axe-core (WCAG2A/AA/21AA/22AA) once per route at 1440px and aggregated serious/critical findings into `axe/summary.json` for the Phase 1 CI a11y gate (plan 01-08): `sites` has the most (aria-command-name x54 nodes, color-contrast x38, target-size x2); `experience` and `experience-sample` have zero.
- Wrote `tests/baseline/README.md` covering capture scope, live-vs-local rationale, redaction method, and the "referenced, never regenerated" policy, including how this pre-truth archive relates to the separate post-truth CI pixel-diff baseline plan 01-20 will commit later.
- Archive totals ~9 MB, well under the 30 MB budget in the plan's acceptance criteria.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — capture landing route baseline at 1440px** - `43c197b` (feat)
2. **Task 2: Capture full matrix, axe summary, and baseline README** - `78ebacf` (feat)

**Plan metadata:** (this commit, below)

## Files Created/Modified
- `dashboard-next/tests/e2e/baseline-live.spec.ts` - Parameterized live-deployment capture spec (screenshots + redacted axe scans + manifest writer)
- `dashboard-next/tests/baseline/README.md` - Baseline policy and provenance documentation
- `dashboard-next/tests/baseline/pre-truth/routes.json` - Capture manifest (33 entries)
- `dashboard-next/tests/baseline/pre-truth/screenshots/*.jpg` - 33 full-page JPEG screenshots
- `dashboard-next/tests/baseline/pre-truth/axe/*.json` - 11 redacted axe reports + `summary.json`

## Decisions Made
- Captured from the live production URL rather than a local build, since HEAD cannot build until 01-07 and the live app is the correct "before" artifact per D-20/D-02.
- Wrote the full STATES/WIDTHS tables once in the spec file, then scoped the Task 1 tracer run to a single state/width subset (`landing`/1440) before widening to the full matrix for Task 2 — avoids maintaining two separate spec files for one capture pipeline.
- Applied presigned-URL redaction unconditionally to every axe report rather than conditionally on gallery-adjacent routes, closing any gap in the T-01-04-01 mitigation.

## Deviations from Plan

None — plan executed exactly as written. The initial README draft used "never regenerated" without the exact acceptance-grep phrase "do not regenerate"; fixed before committing (not logged as a deviation since it was caught and corrected within Task 2 before any commit, not a post-hoc fix).

## Threat Flags

None — the single threat register entry (T-01-04-01, presigned-URL leakage) was the one anticipated and mitigated surface; no new security-relevant surface was introduced beyond what the plan's threat model already covered.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. Owner's standing approval for dev/test package installs and routine checkpoints was not needed; all dependencies (`@playwright/test`, `@axe-core/playwright`) were already installed by plan 01-01.

## Next Phase Readiness
- `axe/summary.json` is ready as direct input to plan 01-08's CI accessibility regression gate.
- `tests/baseline/pre-truth/` is frozen per its README; Phase 3 onward and plan 01-20's exit comparison can reference it directly.
- No blockers introduced for subsequent Phase 1 plans (01-05 onward: source recovery, model audit, backend truth fixes).

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All created files and both task commits verified present on disk / in git log:
- `dashboard-next/tests/e2e/baseline-live.spec.ts` — FOUND
- `dashboard-next/tests/baseline/README.md` — FOUND
- `dashboard-next/tests/baseline/pre-truth/routes.json` — FOUND
- `dashboard-next/tests/baseline/pre-truth/screenshots/landing-1440.jpg` — FOUND
- `dashboard-next/tests/baseline/pre-truth/axe/summary.json` — FOUND
- `dashboard-next/tests/baseline/pre-truth/axe/sites.json` — FOUND
- Commit `43c197b` — FOUND
- Commit `78ebacf` — FOUND
