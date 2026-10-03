---
phase: 03-platform-upgrade-stack-consolidation
plan: 13
subsystem: monitoring
tags: [error-pages, speed-insights, web-vitals, vercel, docs, plat-09]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: 03-12 reportClientError, ClientErrorReporter and POST /api/client-error/
provides:
  - app/error.tsx (route-level) and app/global-error.tsx (root-layout) pages from the UI-SPEC, focused, recoverable, reporting once
  - "@vercel/speed-insights 2.0.0 rendered once in the root layout; mockApi() stubs /_vercel/speed-insights/*"
  - docs/MONITORING.md owner guide (where, filters, line shape, scrubbing, caps, retention, test probe, Sentry deferral)
affects: [03-15]

actuals:
  tokens: 14200
  tasks: 2
  commits: 3

tech-stack:
  added: ["@vercel/speed-insights@2.0.0 (exact pin)"]
  patterns:
    - "Error pages show only the digest; error.message and stack are never rendered"
    - "Next 16.3 stable retry prop drives 'Try again'; reset is accepted but unused"

key-files:
  created:
    - dashboard-next/src/app/error.tsx
    - dashboard-next/src/app/global-error.tsx
    - dashboard-next/tests/unit/error-pages.test.tsx
    - docs/MONITORING.md
  modified:
    - dashboard-next/package.json
    - dashboard-next/package-lock.json
    - dashboard-next/src/app/layout.tsx
    - dashboard-next/tests/e2e/support/mock-api.ts
    - dashboard-next/tests/e2e/monitoring.spec.ts

key-decisions:
  - "'Try again' calls retry() (documented in the installed Next 16.3.8 docs and types as the primary recovery prop, stable since 16.3.0); reset() is accepted in the props but not used"
  - "global-error carries one <style> element for :focus-visible (2px solid #cd853f, offset 2px) because an inline style attribute cannot express a focus-only ring; everything else is inline, no className"
  - "PLAT-09 left unchecked: the Vercel preview proof (Task 3) was blocked by the permission system, so the reporting path is unproven on Vercel"

requirements-completed: []

coverage:
  - id: C1
    description: "error.tsx: UI-SPEC copy and layout, h1 focused on mount, Try again calls retry, Back to home links to /, digest line only when present, message/URL/stack never rendered, one report with source error-boundary and the digest, no motion"
    requirement: PLAT-09
    verification:
      - kind: unit
        ref: "tests/unit/error-pages.test.tsx (route-level: 5 tests)"
        status: pass
    human_judgment: false
  - id: C2
    description: "global-error.tsx: own html lang en and body, inline styles only (no class attribute), inline SVG glyph, root-failure copy, Reload page calls window.location.reload, h1 focused, one report with source global-error, no link"
    requirement: PLAT-09
    verification:
      - kind: unit
        ref: "tests/unit/error-pages.test.tsx (renderToStaticMarkup markup test plus 2 behaviour tests)"
        status: pass
    human_judgment: false
  - id: C3
    description: "A 300-character digest wraps (overflow-wrap anywhere) inside a panel constrained to max-width 560px and width 100%, so there is no horizontal scroll at 390 px"
    requirement: PLAT-09
    verification:
      - kind: unit
        ref: "error-pages.test.tsx 'wraps a very long digest inside a panel that cannot exceed the viewport' (style assertions; backstop, no committed baseline)"
        status: pass
    human_judgment: false
  - id: C4
    description: "Speed Insights is in the root layout, adds no visible DOM, and the local e2e mock keeps routes.spec green"
    requirement: PLAT-09
    verification:
      - kind: e2e
        ref: "tests/e2e/monitoring.spec.ts 'requests its script from /_vercel/speed-insights/ and changes nothing visible' (page text and alert/status counts equal to a load with the route aborted); routes.spec 11 passed"
        status: pass
    human_judgment: false
  - id: C5
    description: "docs/MONITORING.md says where both signals live, the Hobby 1-hour retention accepted 2026-10-02, free-tier limits, Vercel-only data, scrubbing, per-instance best-effort rate limit, Sentry deferral"
    requirement: PLAT-09
    verification:
      - kind: command
        ref: "node scripts/check-citations.mjs --scope docs and --scope all exit 0; grep finds '1 hour' and '/api/client-error/'"
        status: pass
    human_judgment: false
  - id: C6
    description: "A Vercel preview of this branch builds on Vercel's Node, answers POST /api/client-error/ with 204, serves the Speed Insights script, and logs the probe line"
    requirement: PLAT-09
    verification:
      - kind: other
        ref: "Initially NOT RUN (denied by the permission system); run by the orchestrator on 2026-10-03 after owner approval: preview Ready, POST /api/client-error/ 204, speed-insights script 200, probe log line seen, malformed probe 400. See Checkpoint (resolved)"
        status: pass
    human_judgment: true
  - id: C7
    description: "No regression: full unit, typecheck, lint, build, full e2e, CI"
    requirement: PLAT-09
    verification:
      - kind: other
        ref: "Local: unit 36 files / 486 tests, typecheck clean, lint 0 errors (19 pre-existing warnings), build OK (/api/client-error dynamic), e2e 67 passed and 1 failed on the first full run (the new Speed Insights spec, test bug fixed), then monitoring plus routes re-run 13/13. CI run 37069500680 (https://github.com/TyLuHow/ReefRadar/actions/runs/37069500680) at 2057eb3: web, python, citations, e2e success; visual failed only experience-compare @ 390 (declared), 32 passed"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-10-02
status: complete
---

# Phase 3 Plan 13: Error Pages, Speed Insights and Owner Monitoring Guide Summary

**Route and root-layout failures now land on specified, focused, honest error pages that report once through the 03-12 reporter; Vercel Speed Insights is in the root layout; docs/MONITORING.md tells the owner where to open both signals and how short the Hobby retention is. The Vercel preview proof was blocked and is carried as a checkpoint.**

## Task 1 (tracer): error pages

- Test written first (RED: module not found), then `error.tsx` and `global-error.tsx`.
- Installed Next 16.3.8 docs and `error-boundary.d.ts` confirm the props are `{ error, retry, reset }`; the button calls `retry()`. Neither page renders `error.message` or the stack (test uses a message containing a URL and `token=1` and asserts none of it appears in the DOM).
- Reporting: `reportClientError(error, { source, digest: digest ?? null })` once per error in a `useEffect`. The test mocks `@/features/monitoring` and rerenders to prove it is not repeated.
- global-error markup test uses `renderToStaticMarkup`; the behaviour tests render the component in the RTL container with `console.error` stubbed (React warns about html in a div) and `location.reload` stubbed. Both approaches work, so no fallback was needed.
- Tracer gate (auto mode): verify (error-pages + copy-claims, 14 tests), typecheck, lint, build all green before Task 2 started. Commit `edc57e1`.

## Task 2: Speed Insights

Package-legitimacy evidence (T-03-13-SC): owner standing approval (.planning/research/DRIVING-QUESTIONS.md 2026-10-01) plus registry evidence from `npm view @vercel/speed-insights@2.0.0`: name `@vercel/speed-insights`, version `2.0.0`, repository `git+https://github.com/vercel/speed-insights.git`, license Apache-2.0, `scripts.postinstall` empty, integrity `sha512-jwkNcrTeafWxjmWq4AHBaptSqZiJkYU5adLC9QBSqeim0GcqDMgN5Ievh8OG1rJ6W3A4l1oiP7qr9CWxGuzu3w==`. Installed with `--save-exact`; `npm ls` shows `@vercel/speed-insights@2.0.0`. The `npm install` audit line (4 vulnerabilities) and the `allowScripts` notice for `unrs-resolver` are pre-existing and unrelated to the new package; nothing was auto-fixed.

- `<SpeedInsights />` after `<Providers>` inside `<body>`.
- `mockSpeedInsights(page)` in mock-api.ts, called from `mockApi()`: `/_vercel/speed-insights/*` answers 200, `application/javascript`, empty body.
- New e2e: the script is requested and answered 200, and the visible text and alert/status counts equal those of a load with the route aborted. The first run failed on a genuine test bug (the /about status line shows a wall-clock "Last checked" time); the comparison now masks that one line. Commit `2057eb3`.

## Task 3: guide written; preview proof blocked

- `docs/MONITORING.md` (commit `129ddba`) covers every item in the plan's must-haves: Speed Insights tab and free-tier limits (Real Experience Score only, 10,000 events per rolling 30 days then paused), Logs tab filter (Request Path `/api/client-error/`, level Error, search `client-error`), the log line and its eight fields, scrubbing, client and server caps, the per-instance best-effort 30 per minute limit, the retention table (Hobby 1 hour as the owner's 2026-10-02 choice, Pro 1 day, Observability Plus 30 days, Enterprise 3 days), the probe request with a placeholder host, and the Sentry deferral. It states plainly that the probe has not yet been run on a Vercel deployment. `check-citations.mjs --scope docs` and `--scope all` exit 0.
- Preview: `vercel ls` (dashboard-next) shows one preview, about 1 day old, which predates this work; pushing the branch created no Git-integration preview. The only way to obtain one is `vercel deploy` from `dashboard-next` (no production flag). That command (`vercel deploy --yes`, run from `C:\Users\TylerLubyHoward\reefradar\dashboard-next`) was denied by the permission system. Per the safety rules I did not route around it and ran no other Vercel write. Nothing was deployed to production; `main` untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] e2e comparison tripped on a timestamp**
- **Found during:** Task 2 full e2e
- **Issue:** `/about` prints "Last checked: <time>", so two loads a second apart never matched
- **Fix:** the snapshot masks that line
- **Files modified:** dashboard-next/tests/e2e/monitoring.spec.ts
- **Commit:** 2057eb3

### Interpretation notes

- **Focus ring in global-error:** the UI-SPEC asks for an inline `outline: 2px solid #cd853f; outline-offset: 2px`. An inline style attribute applies always, which would draw a permanent ring around the button and heading. A single `<style>` element in the document `<head>` scopes the same declaration to `:focus-visible`. Still no className, no Tailwind, no globals.css.
- **`.mono` uppercase:** the global `.mono` class upper-cases text; the digest is case-sensitive, so the reference line overrides `text-transform` and `letter-spacing` inline.
- **Task 3 not completed:** see Checkpoint. All other Task 3 outputs (guide, citations, CI watch) are done.

**Total deviations:** 1 auto-fixed (test bug), 3 interpretation notes, 1 blocked step. **Impact:** PLAT-09 not marked complete.

## Checkpoint: owner decision needed for the preview proof (RESOLVED 2026-10-03)

**Resolved:** the orchestrator ran the owner-approved `vercel deploy --yes` from `dashboard-next` on 2026-10-03 (preview, no `--prod`). Build state Ready on Next.js 16.3.8 (A2 confirmed). `GET /_vercel/speed-insights/script.js` returned 200; `POST /api/client-error/` with the MONITORING.md probe returned 204; `vercel logs` showed the `client-error` line with the probe message and the build id; a malformed probe (`stack: null`) returned 400 and logged nothing (A6 confirmed). The result is recorded in docs/MONITORING.md "Status of this check" and PHASE-3-EXIT.md, and PLAT-09 is marked complete in 03-15. Whether Speed Insights counts protected-preview traffic (A3) was not checked. The original text of the checkpoint follows.

### Original checkpoint text

Needed command: `vercel deploy --yes` run from `dashboard-next` (a preview deployment of this branch, no `--prod`, no promote). Denied by the permission system, so it was not run. Options: the owner allows that one command and the proof is run (build state Ready, `POST /api/client-error/` answers 204, `/_vercel/speed-insights/script.js` status, `vercel logs` for the probe line), or the owner runs it themselves, or the steps in docs/MONITORING.md "How to test" become the phase's end-of-phase human-check. After a deployment exists, add three lines to docs/MONITORING.md under "Status of this check" (state, 204, script status) and mark PLAT-09 complete.

## Known Stubs

None.

## Open assumptions carried forward

- **A2 (Next 16 builds on Vercel's Node) and A6 (`vercel logs` shows the probe line):** resolved 2026-10-03 by the preview proof. **A3 (Speed Insights counts protected-preview traffic):** still unchecked; docs/MONITORING.md says so.
- **UI-SPEC E6 (reporter and Speed Insights change no visual baseline):** CI visual job on this head differs from the declared failure by nothing (experience-compare @ 390 only); 03-15 still does the manual baseline review.
- **Human-check (plan Task 3, end-of-phase):** within one hour of a probe POST, open the Vercel dashboard Logs tab (Request Path `/api/client-error/`, level Error) and confirm the `client-error` line; confirm the Speed Insights tab exists. Requires the owner's Vercel login.

## Threat Flags

None beyond the plan's threat model.

## Requirement status

PLAT-09 was left unchecked here while the preview proof was outstanding; the proof ran on 2026-10-03 and PLAT-09 is marked complete in 03-15. The owner's Logs-tab human-check remains an end-of-phase item.

## Self-Check: PASSED

- Created files present: error.tsx, global-error.tsx, error-pages.test.tsx, docs/MONITORING.md
- Commits `edc57e1`, `2057eb3`, `129ddba` in git log; CI run 37069500680 reviewed
- Acceptance commands: error-pages and copy-claims tests, full unit (486), typecheck, lint, build, e2e, citations docs/all all green
