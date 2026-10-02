---
phase: 03-platform-upgrade-stack-consolidation
plan: 01
subsystem: testing
tags: [vitest, react-query, vercel, api-client, regression-guard]

requires:
  - phase: 02-data-contract-v1
    provides: contract fetch test harness (tests/unit/support/contract-fetch.ts) reused by the Providers test
provides:
  - Base-URL honour test and source fence for the single ApiClient (CAP-09)
  - React Query defaults and dedupe test through the real Providers tree (CAP-08)
  - vercel.json security-header assertion (CAP-10)
affects: [03-03, 03-04, 03-06, 03-12]

actuals:
  tokens: 3300
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "vi.stubEnv + vi.resetModules + dynamic import to test module-level env reads"
    - "Pure checker function exercised on a planted in-memory violation as a mutation proof for a source fence"
    - "Neutralise Providers collaborators via browser-API stubs (rAF, matchMedia, canvas getContext), never by module path"

key-files:
  created:
    - dashboard-next/tests/unit/api-client.test.ts
    - dashboard-next/tests/unit/query-defaults.test.tsx
    - dashboard-next/tests/unit/security-headers.test.ts
  modified: []

key-decisions:
  - "security-headers test asserts the three required headers with exact values but tolerates extra headers (a later CSP must not break it); duplicates are rejected"
  - "fetch call detection uses a lookbehind regex so refetch( and .fetch( are not flagged"

patterns-established:
  - "Allowlist as repo-relative POSIX paths, tolerant of entries that do not exist yet (03-12 monitoring reporter)"

requirements-completed: [PLAT-10]

coverage:
  - id: D1
    description: "Every api.* flow builds its URL from NEXT_PUBLIC_API_URL, falling back to the documented API Gateway URL"
    requirement: PLAT-10
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/api-client.test.ts#ApiClient base URL (CAP-09)"
        status: pass
    human_judgment: false
  - id: D2
    description: "API host and env var occur only in src/lib/api.ts; every fetch( call site is allowlisted; fence proven by a planted violation"
    requirement: PLAT-10
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/api-client.test.ts#API source fence (T-03-01-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Providers exposes staleTime 60000 / refetchOnWindowFocus false and shared query keys call queryFn once"
    requirement: PLAT-10
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/query-defaults.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "vercel.json applies the three security headers to /(.*) and installs with npm ci"
    requirement: PLAT-10
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/security-headers.test.ts"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-02
status: complete
---

# Phase 3 Plan 01: PLAT-10 Regression Guard Summary

**Three unit-test files lock the single API client (configured base URL plus a fetch call-site fence), React Query caching through the real Providers tree, and the vercel.json security headers, with no source change, ahead of both upgrade hops.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-10-02
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files created:** 3 (tests only)

## Accomplishments

- `api-client.test.ts` (9 tests): with `NEXT_PUBLIC_API_URL` stubbed to `https://example.test/prod`, one call each of getHealth, getSamples, uploadAudio, startAnalysis, getStatus, getAnalysisResult and pollAnalysis all request URLs under it; with the variable unset they request the documented `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/...`. Source fence: `execute-api` and `NEXT_PUBLIC_API_URL` appear only in `src/lib/api.ts`; no XMLHttpRequest or axios; every `fetch(` call site in src is on the six-entry reviewed allowlist; a planted `fetch(` in a non-allowlisted path is reported, and `refetch(` / `.fetch(` are not false positives.
- `query-defaults.test.tsx` (2 tests): the real `<Providers>` tree exposes staleTime 60000 and refetchOnWindowFocus false; two components sharing one key call the queryFn exactly once.
- `security-headers.test.ts` (2 tests): vercel.json source `/(.*)` carries nosniff, DENY and strict-origin-when-cross-origin with exact values; `installCommand` is `npm ci`.
- The audit finding held: the code already complied, so no file under `src` or `vercel.json` changed.

## Task Commits

1. **Task 1 (tracer): API base URL and fetch-site fence** - `a9ecd21` (test)
2. **Task 2: React Query defaults, dedupe and security headers** - `3ba6f02` (test)

Tracer gate (auto mode active): the tracer's verify was green before expansion, so `Tracer verified end-to-end - expanding`.

## Verification

- `npm --prefix dashboard-next test`: 23 files, 265 tests passed.
- `npm --prefix dashboard-next run typecheck`: exit 0.
- `npm --prefix dashboard-next run lint`: exit 0 (one pre-existing react-hooks/exhaustive-deps warning in `LocationCompare.tsx`, out of scope).
- CI result for the pushed head is recorded in the orchestrator report.

## Decisions Made

- The security-headers test uses `toMatchObject` for the three required headers (exact values) rather than demanding exactly three entries, so a later CSP addition is not a false failure; dropping or weakening any of the three still fails, and duplicate header names fail.
- The query-defaults test neutralises the decorative canvas and vitality loop with browser-API stubs (requestAnimationFrame, matchMedia, `HTMLCanvasElement.getContext`), so it needs no change when 03-06 removes them.

## Deviations from Plan

None - plan executed exactly as written. (Minor choice: the security-headers assertion allows extra headers, consistent with the plan's "no fewer" wording.)

## Issues Encountered

None. No auth gates, no package installs, no checkpoints.

## Known Stubs

None.

## Threat Flags

None. Tests use `https://example.test` and the already-public API Gateway URL only.

## Next Phase Readiness

Plans 03-03 and 03-04 (React 19, Next 15/16) now run under the PLAT-10 guard; 03-06 and 03-12 may edit Providers and add the monitoring reporter (already on the fetch allowlist) without losing the guard.

## Self-Check: PASSED

- FOUND: dashboard-next/tests/unit/api-client.test.ts
- FOUND: dashboard-next/tests/unit/query-defaults.test.tsx
- FOUND: dashboard-next/tests/unit/security-headers.test.ts
- FOUND commits: a9ecd21, 3ba6f02
