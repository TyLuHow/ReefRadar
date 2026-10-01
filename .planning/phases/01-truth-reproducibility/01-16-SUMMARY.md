---
phase: 01-truth-reproducibility
plan: 16
subsystem: ui
tags: [nextjs, react, playwright, vitest, polling, api-client]

# Dependency graph
requires:
  - phase: 01-truth-reproducibility
    provides: "lambdas/router/handler.py handle_status (01-07/01-08/01-11): real pipeline stages at GET /status/{id}"
provides:
  - "ApiClient.pollAnalysis rewritten to poll /status with backoff, abort, timeout and AnalysisError"
  - "Honest stage-label progress UI for both legacy analyze flows (/dashboard/analyze, /experience)"
  - "/experience routed through the shared API client instead of a hard-coded API_BASE + raw fetch"
  - "Acoustic Embedding Space scatter removed from legacy results"
  - "Fixture-driven analysis-flow.spec.ts e2e covering both flows, success and failure"
affects: [phase-2-contract, phase-9-ui, phase-3-redesign]

# Actuals (#2632)
actuals:
  tokens: 12748
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pollAnalysis(id, {onStage, signal, maxWaitMs}) replaces positional-callback polling API"
    - "AnalysisError class carries code/stage/message/suggestion/requestId for actionable error UI"
    - "mockApi custom-function overrides used for stateful sequenced fixtures (status-sequence.json)"

key-files:
  created:
    - dashboard-next/tests/unit/api-poll.test.ts
    - dashboard-next/tests/fixtures/api/status-sequence.json
    - dashboard-next/tests/e2e/analysis-flow.spec.ts
  modified:
    - dashboard-next/src/lib/api.ts
    - dashboard-next/src/types/index.ts
    - dashboard-next/src/components/AnalysisProgress.tsx
    - dashboard-next/src/app/dashboard/analyze/page.tsx
    - dashboard-next/src/components/experience/ProcessingOverlay.tsx
    - dashboard-next/src/app/experience/page.tsx
    - dashboard-next/src/components/index.ts
  deleted:
    - dashboard-next/src/components/EmbeddingChart.tsx

key-decisions:
  - "request_id for a failed analysis is read from GET /visualize's error payload, not /status's (the latter omits it per handle_status/handler.py) -- pollAnalysis makes one extra /visualize call on failure to enrich the AnalysisError"
  - "preprocessing always uses a fixed descriptive label; classifying always uses the API's own progress text (carries the real segment count); complete is resolved before onStage fires for that stage"
  - "On AnalysisError 'error' step, AnalysisProgress visually marks 'uploading' complete and 'analyzing' as the errored step (uploading succeeded in this flow before the poll ever starts)"

patterns-established:
  - "AbortController per poll, stored in a ref, aborted on unmount/reset so pollAnalysis's wait() rejects promptly instead of leaking a timer"

requirements-completed: [TRUTH-07]

coverage:
  - id: D1
    description: "pollAnalysis polls /status with real-stage callbacks, exponential backoff, 404 retry limit, abort support, timeout, and AnalysisError on failure"
    requirement: TRUTH-07
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/api-poll.test.ts (6 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "/dashboard/analyze shows real /status stages (no percentage) and renders suggestion/request id on failure"
    requirement: TRUTH-07
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/analysis-flow.spec.ts > /dashboard/analyze -- real /status stages (D-15)"
        status: pass
    human_judgment: false
  - id: D3
    description: "/experience routes upload/analyze/poll through the shared API client and shows real stages, no scripted rotation"
    requirement: TRUTH-07
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/analysis-flow.spec.ts > /experience -- shared API client, real stages (D-15)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Acoustic Embedding Space scatter removed from legacy results, no replacement added"
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/analysis-flow.spec.ts > asserts no 'acoustic embedding space' text and no .recharts-wrapper"
        status: pass
      - kind: other
        ref: "npm run build (dashboard-next) -- compiles clean with EmbeddingChart.tsx deleted"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-10-01
status: complete
---

# Phase 1 Plan 16: Honest Processing Stages & Scatter Removal Summary

**Rewrote pollAnalysis to drive both legacy analyze flows off the real GET /status/{id} pipeline stages (no scripted messages, no fake percentages), routed /experience through the shared API client, and deleted the meaningless "Acoustic Embedding Space" scatter.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-10-01T04:05:00Z
- **Completed:** 2026-10-01T05:15:00Z
- **Tasks:** 3
- **Files modified:** 11 (3 created, 7 modified, 1 deleted)

## Accomplishments
- `ApiClient.pollAnalysis` now polls `/status/{id}` with onStage callbacks, exponential backoff (2000ms x1.5, capped 8000ms), up to 5 consecutive 404 retries, AbortSignal support, a 180s timeout, and a single `/visualize/{id}` call on completion; failures throw `AnalysisError` carrying code/stage/message/suggestion/request_id.
- `/dashboard/analyze` shows the real stage label (no numeric percentage) and renders the API's suggestion + request id on failure; fixed a pre-existing dead-code bug in `AnalysisProgress` where the error branch never matched any step id.
- `/experience` now uses `api.uploadAudio`/`api.startAnalysis`/`api.pollAnalysis` instead of a duplicated hard-coded `API_BASE` and raw `fetch` calls; `ProcessingOverlay` renders the real stage label instead of a 3-second rotating script.
- Deleted `EmbeddingChart.tsx` (the "Acoustic Embedding Space" half-vector scatter) and its export/import/render sites; no replacement chart added (honest projection is Phase 2/9).
- Added `tests/unit/api-poll.test.ts` (6 tests, TDD RED->GREEN) and extended `tests/e2e/analysis-flow.spec.ts` with 4 fixture-driven e2e tests covering both flows' success and failure paths.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer, TDD): pollAnalysis /status polling + /dashboard/analyze wiring**
   - `090973c` test(01-16): add failing pollAnalysis /status tests (RED)
   - `55f6a7a` feat(01-16): pollAnalysis polls /status with real stages and backoff (GREEN)
   - `4783e1f` feat(01-16): wire /dashboard/analyze to real /status stages (tracer)
2. **Task 2: /experience shared API client + real stages** - `16bbca9`
3. **Task 3: remove Acoustic Embedding Space scatter** - `a4de7c9`

**Plan metadata:** (this commit)

_Note: Task 1 carried `tdd="true"` and is also the plan's tracer task — RED/GREEN were committed separately, then the wiring into `/dashboard/analyze` and the e2e proof were committed as a third commit within the same task before the tracer feedback gate (full `vitest` + `playwright --project=e2e` re-run, both green) cleared it for Tasks 2-3._

## Files Created/Modified
- `dashboard-next/src/lib/api.ts` - `pollAnalysis` rewrite, `AnalysisError` class, `PollAnalysisOptions`/status-aware `request()`
- `dashboard-next/src/types/index.ts` - `AnalysisResult.error` extended with `stage`/`request_id`/`retry_count`; new `StageInfo` type
- `dashboard-next/src/components/AnalysisProgress.tsx` - stage-label prop replaces numeric progress; fixed dead error-branch bug; renders suggestion/request id
- `dashboard-next/src/app/dashboard/analyze/page.tsx` - `onStage`/`AbortController` wiring, `AnalysisError` handling, `EmbeddingChart` removed
- `dashboard-next/src/components/experience/ProcessingOverlay.tsx` - `{stageLabel, detail?}` props replace `STATUS_MESSAGES` rotation
- `dashboard-next/src/app/experience/page.tsx` - `UploadingState`/`ProcessingState` use `api.uploadAudio`/`startAnalysis`/`pollAnalysis`; `API_BASE` constant removed; `ErrorState` shows suggestion
- `dashboard-next/src/components/index.ts` - `EmbeddingChart` export removed
- `dashboard-next/src/components/EmbeddingChart.tsx` - deleted
- `dashboard-next/tests/unit/api-poll.test.ts` - 6 tests for pollAnalysis (stages, labels, failure, 404 retry limit, abort, timeout)
- `dashboard-next/tests/fixtures/api/status-sequence.json` - 404 -> preprocessing -> classifying -> complete sequence
- `dashboard-next/tests/e2e/analysis-flow.spec.ts` - 4 e2e tests: both flows x (success, failure)

## Decisions Made
- `/status`'s failed-analysis error payload omits `request_id` (confirmed in `lambdas/router/handler.py: handle_status`); `pollAnalysis` makes one extra `GET /visualize/{id}` call on failure specifically to read `request_id` from that endpoint's richer error object, per the plan's explicit instruction.
- `preprocessing`'s label is a fixed, more-specific description rather than the API's generic "Processing audio file" progress text; `classifying` always uses the API's own text since it carries the real segment count — matches the plan's action text verbatim.
- Error-state step highlighting in `AnalysisProgress` treats `uploading` as complete and `analyzing` as the errored step when `step==='error'`, since in both flows the error always surfaces during/after polling (upload succeeded by then).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed dead error-display code in AnalysisProgress**
- **Found during:** Task 1, first e2e run of the failed-analysis case
- **Issue:** `isActive = s.id === step` and `isError = step === 'error' && isActive` never matched, because `step` can be `'error'` but no step `id` in the `steps` array is `'error'` — the entire error/suggestion/request-id rendering path was unreachable dead code, predating this plan.
- **Fix:** When `step === 'error'`, mark `uploading` complete and `analyzing` as the active/errored step so the message/suggestion/request-id block renders.
- **Files modified:** `dashboard-next/src/components/AnalysisProgress.tsx`
- **Verification:** `tests/e2e/analysis-flow.spec.ts` failed-analysis cases for both flows pass.
- **Committed in:** `4783e1f` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary to satisfy this plan's own acceptance criteria ("on failure, render suggestion and request id next to the message"); no scope creep beyond that.

## Issues Encountered
- Initial e2e failure-case assertions hit Playwright strict-mode violations because `toast.error(message)` renders the same message text as a separate DOM node; scoped assertions to `page.getByRole('main')` to disambiguate from the toast region. No production code change required.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- D-15 (both flows) and D-13's UI half are done; TRUTH-07's processing-copy claims are removed.
- Honest PCA/embedding projection remains deferred to Phase 2 (contract) / Phase 9 (UI) per the phase CONTEXT.
- Full verification chain (`npx vitest run`, `npx playwright test --project=e2e`, `npm run build`) all green at completion; 26/26 e2e tests pass including pre-existing routes/a11y suites (no regressions).

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All 11 created/modified key files found on disk; `EmbeddingChart.tsx` confirmed deleted; all 5 task commits (`090973c`, `55f6a7a`, `4783e1f`, `16bbca9`, `a4de7c9`) found in git log.
