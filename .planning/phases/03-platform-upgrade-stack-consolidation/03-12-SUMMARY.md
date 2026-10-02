---
phase: 03-platform-upgrade-stack-consolidation
plan: 12
subsystem: monitoring
tags: [error-reporting, route-handler, scrubbing, rate-limit, vercel-runtime-logs, plat-09, security]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: 03-01 fetch allowlist (features/monitoring/report.ts), 03-05 feature fence, Providers leaf pattern from 02-08
provides:
  - src/features/monitoring: scrub (shared client/server), strict zod schema, token-bucket rate limiter, silent client reporter with caps, ClientErrorReporter leaf, server handler, client-safe barrel
  - POST /api/client-error/ (Node, force-dynamic): Origin, content-type, 4 KB, strict-schema and rate checks, second scrub, one stderr line, 204
  - ClientErrorReporter mounted once in Providers (window error and unhandledrejection), no visible UI
  - Unit tests (scrub, route, report) and a real-browser e2e that proves thrown error -> scrubbed POST -> 204
affects: [03-13, 03-15, 10-upload]

actuals:
  tokens: 11900
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One scrub module imported by both sides; every function idempotent so the server's second pass is a no-op on honest clients"
    - "Server handler is a plain (Request) => Response function in features/monitoring/server.ts; route.ts only re-exports POST, so the whole security surface is unit-testable in the node environment"
    - "Rejections are empty-bodied status codes; nothing request-derived is echoed or logged on failure paths"

key-files:
  created:
    - dashboard-next/src/features/monitoring/scrub.ts
    - dashboard-next/src/features/monitoring/schema.ts
    - dashboard-next/src/features/monitoring/rate-limit.ts
    - dashboard-next/src/features/monitoring/report.ts
    - dashboard-next/src/features/monitoring/ClientErrorReporter.tsx
    - dashboard-next/src/features/monitoring/server.ts
    - dashboard-next/src/features/monitoring/index.ts
    - dashboard-next/src/app/api/client-error/route.ts
    - dashboard-next/tests/unit/monitoring-scrub.test.ts
    - dashboard-next/tests/unit/monitoring-route.test.ts
    - dashboard-next/tests/unit/monitoring-report.test.ts
    - dashboard-next/tests/e2e/monitoring.spec.ts
  modified:
    - dashboard-next/src/app/providers.tsx

key-decisions:
  - "Check order in the handler: Origin (403), content type (415), size (413), JSON and strict schema (400), rate limit (429). Origin goes first so a cross-site request does no body work; the limiter token is spent only on well-formed reports so garbage cannot starve real ones"
  - "Body cap is enforced on the stream (cancelled past 4096 bytes) as well as on content-length, because a string-bodied or chunked request carries no content-length header"
  - "Route is validated as a bare pathname by the schema (no whitespace, query or fragment) and scrubbed again on the server, so an id-like segment becomes [token]"
  - "Dedupe fingerprint is name plus first stack frame; a report with no frame (string rejection) falls back to its message so different string rejections are not collapsed"
  - "Server logs U+2028/2029 as escaped sequences so no log pipeline can split the one entry into two"

patterns-established:
  - "Test strings that look like secrets are obviously fake (example.com, X-Amz-Signature=abc123...)"

requirements-completed: []

coverage:
  - id: C1
    description: "An uncaught page error produces one silent same-origin POST to /api/client-error/ (trailing slash, keepalive, JSON), answered 204 with no redirect, with nothing shown to the visitor"
    requirement: PLAT-09
    verification:
      - kind: e2e
        ref: "tests/e2e/monitoring.spec.ts (real browser against next start: exactly one POST, 204, redirectedFrom null, same origin, no role alert/status, body text unchanged)"
        status: pass
      - kind: unit
        ref: "monitoring-report.test.ts 'posts to exactly /api/client-error/ with keepalive and a JSON content type'; 'shows nothing to the visitor'"
        status: pass
    human_judgment: false
  - id: C2
    description: "Scrubbing on both sides: URLs, query strings and fragments, emails, 24+ character tokens and X-Amz-* removed; message 300 characters, stack 8 lines of 200; only the eight schema fields are ever sent"
    requirement: PLAT-09
    verification:
      - kind: unit
        ref: "monitoring-scrub.test.ts (16 tests: URL schemes, relative path keeps path only, email, 40-char token, X-Amz, idempotence, caps, buildReport has no userAgent/cookies/extra keys)"
        status: pass
      - kind: unit
        ref: "monitoring-route.test.ts 'scrubs a raw URL, email and token again before logging (server second pass)'"
        status: pass
      - kind: e2e
        ref: "monitoring.spec.ts asserts the posted body contains [url] and [email] and none of amazonaws, X-Amz, abc123def456, example.com, visitor@, ://"
        status: pass
    human_judgment: false
  - id: C3
    description: "The route answers 204 and logs exactly one single-line 'client-error ' entry; rejects 415, 413 (declared, string and streamed), 403 (foreign and opaque Origin), 400 (unknown field, bad schema, malformed JSON) and 429 beyond 30 per minute per instance"
    requirement: PLAT-09
    verification:
      - kind: unit
        ref: "monitoring-route.test.ts (19 tests incl. forged multi-line message stays on one line; rejected requests log nothing; 31st request 429; rejected requests do not spend tokens) and createRateLimiter with an injected clock"
        status: pass
    human_judgment: false
  - id: C4
    description: "Client bounds: 5 reports per page load, 60 s dedupe, ResizeObserver loop and bare Script error. ignored, a non-Error rejection posts as UnhandledRejection with a string message, failures never throw and log at most one console.error"
    requirement: PLAT-09
    verification:
      - kind: unit
        ref: "monitoring-report.test.ts (12 tests, fake timers and stubbed fetch)"
        status: pass
    human_judgment: false
  - id: C5
    description: "Module placement and wiring: leaf mounted once in Providers, module behind the legacy-import fence, fetch on the 03-01 allowlist, /api/client-error is a dynamic route in the build table"
    requirement: PLAT-09
    verification:
      - kind: command
        ref: "node scripts/check-feature-fence.mjs OK (32 files); api-client.test.ts and copy-claims.test.ts pass; next build route table lists '/api/client-error' as dynamic"
        status: pass
    human_judgment: false
  - id: C6
    description: "No regression: full unit, typecheck, lint, fences, build, full e2e, CI"
    requirement: PLAT-09
    verification:
      - kind: other
        ref: "Local: unit 35 files / 478 tests, typecheck clean, lint 0 errors (19 pre-existing warnings), both fences OK, next build OK, e2e 67 passed. CI run 37068029774 (https://github.com/TyLuHow/ReefRadar/actions/runs/37068029774): web, e2e, python, citations success; visual failed only experience-compare @ 390 (declared), 32 passed"
        status: pass
    human_judgment: false
  - id: C7
    description: "Error reporter adds no DOM and no visual baseline moved because of it (UI-SPEC E6); the per-instance limiter is best effort on serverless"
    requirement: PLAT-09
    verification:
      - kind: other
        ref: "Open assumptions below; baselines re-checked in 03-15, limiter caveat documented by 03-13 in docs/MONITORING.md"
        status: pass
    human_judgment: true

duration: 40min
completed: 2026-10-02
status: complete
---

# Phase 3 Plan 12: Client Error Reporter and /api/client-error Route Summary

**A silent client reporter scrubs uncaught errors and unhandled rejections and POSTs them to a hardened same-origin Next route that re-validates, re-scrubs, caps and rate-limits them, then writes one `client-error {json}` line to Vercel runtime logs.**

## Performance

- **Duration:** about 40 min (includes a full local e2e run, build, and the CI watch)
- **Tasks:** 3 (1 tracer, 2 auto TDD)
- **Commits:** 3 task commits (`c4a65f4`, `96eb89d`, `5986643`) plus this summary commit
- **Files:** 12 created, 1 modified

## Task 1 (tracer): a thrown page error reaches the log stream as one scrubbed line

- e2e written first: on `/about/` a `setTimeout` throws an error whose message contains a fake presigned URL and an example.com address. The spec waits for the POST to `/api/client-error/`, asserts one request only, JSON content type, a body of exactly `digest, message, name, route, source, stack, ts, v` with route `/about/`, message containing `[url]` and `[email]` and none of `amazonaws`, `X-Amz`, `abc123def456`, `example.com`, `visitor@`, `://`, status 204 with `redirectedFrom()` null, and no `role=alert` or `role=status` element (Next's route announcer excluded) and unchanged body text.
- Real server line produced by that run (captured from the Playwright web server's stderr): `client-error {"evt":"client-error","v":1,"source":"window-error","name":"Error","message":"probe [url] [email]","stack":"Error: probe [url] [email]\n    at eval (...)","route":"/about/","digest":null,"ts":...,"build":null}`.
- `scrub.ts`, `schema.ts` (zod 4 `strictObject`, exactly eight fields), `report.ts`, `ClientErrorReporter.tsx`, `server.ts`, `index.ts`, `route.ts` (`dynamic = 'force-dynamic'`, `runtime = 'nodejs'`) and the `Providers` mount (a leaf beside the `ContractVersionSync` Suspense, reading no search params).
- Tracer gate (auto mode): the tracer verify, routes.spec (11 passed), build route table (`/api/client-error` dynamic), lint, typecheck, both fences, api-client and copy-claims tests were green before Task 2 started.

## Task 2: server-side caps, rejections and rate limit

- `rate-limit.ts`: `createRateLimiter({ capacity, refillPerMinute, now })`, starts full, refills continuously, never above capacity, tolerates a clock moving backwards.
- `server.ts` check order: Origin host must equal Host (403; `null` or unparseable also 403), content type `application/json` (415), size (413, declared content-length and the actual stream, cancelled past 4096 bytes), JSON and strict schema (400), limiter 30 per minute (429), second scrub, one `console.error` line, 204. Every rejection has an empty body and logs nothing; an unexpected exception answers an empty 500.
- Tests written first (scrub 16, route 19 including the limiter, 35 in the two files); all pass.

## Task 3: client caps, dedupe and noise filters; push

- `report.ts`: 5 reports per page load (spent only on sent reports), 60 s dedupe by name plus first stack frame (message when there is no frame), `ResizeObserver loop` and bare `Script error.` ignored, failures swallowed with a single fixed-text `console.error` per page load (never request-derived text), `resetReporterForTests` export.
- 12 tests with fake timers and a stubbed fetch pass.
- Pushed `456b9fd..5986643` (no workflow_dispatch run was in progress). CI run **37068029774**, https://github.com/TyLuHow/ReefRadar/actions/runs/37068029774:
  - web (lint, typecheck, unit, build): success; python (pytest): success; citations: success; e2e (routes + axe, fixture-mocked): success; live-smoke: skipped (manual only).
  - visual: failure, exactly one failing test: `tests/e2e/visual.spec.ts:51 experience-compare @ 390` (32 passed). That is the already-declared state, so there is no regression. Baselines were not regenerated.

## Security evidence (ASVS L1, T-03-12-01 to 05)

| Threat | Evidence |
|---|---|
| T-03-12-01 PII, presigned URLs, tokens in logs | Same scrubber on client and server; strict eight-field schema; route is a validated bare pathname; fake `X-Amz-Signature`, email, 40-character token and `https://...?X-Amz-Signature=` samples asserted absent from the e2e POST body, from `buildReport` output, from the client fetch body and from the server's logged line (forged payload test: name, message, stack, route and digest all scrubbed) |
| T-03-12-02 log injection | One `JSON.stringify` line behind the fixed `client-error ` prefix with `evt`; forged newline, CRLF, U+2028 and a fake `client-error {...}` inside a message stay inside the one entry's message string; unknown fields give 400 |
| T-03-12-03 flooding | 413 at 4 KB (declared, string and streamed bodies), 429 on the 31st report in a minute from a fresh module, client cap 5 per page load and 60 s dedupe |
| T-03-12-04 cross-site forgery | Foreign and opaque Origin give 403; JSON content type forces a preflight cross-origin; no CORS headers added |
| T-03-12-05 repudiation | No UI: e2e asserts no alert or status element and unchanged text; copy-claims gate passes on src |

## Deviations from Plan

### Auto-fixed Issues

None. Interpretation notes:

- **Origin check first.** The plan lists content type, size, then Origin; I check Origin first so a cross-site request does no body work. Observable behaviour for each single violation is identical.
- **Streamed cap.** The plan says "content-length header and the actual body length"; the body is read through a capped stream reader (cancelled past 4096 bytes) instead of `request.text()`, so an unbounded chunked body is never fully buffered. Added streamed and declared-length tests.
- **Limiter token only for valid reports.** Rate limiting runs after validation (as the plan orders it), and a test pins that rejected requests do not spend tokens.
- **Failure console line.** The single client `console.error` is a fixed sentence, so it can never carry request-derived text.
- **Tooling note.** The editor wrote a literal U+2028 where an escape was typed, which broke a regex literal; the source now builds those characters from escaped strings or code points (no non-ASCII characters in the new files).

**Total deviations:** 0 auto-fixed. **Impact:** none.

## Issues Encountered

None blocking. The Windows CRLF notice appears on add; git config was not changed. No local server was started outside Playwright's own web server (port 3100 left free). The legacy `useSpectrogram` and other warnings in lint are the 19 pre-existing React Compiler warnings.

## Known Stubs

None.

## Open assumptions carried forward (flagged in the plan, unchanged)

- **Reporter adds no DOM (UI-SPEC E6):** verified in the e2e and unit tests here; 03-15 must still confirm no visual baseline moved because of it. Status: unresolved, flagged.
- **Per-instance limiter:** each warm serverless instance has its own bucket, so 30 per minute is a best-effort cap, not a global quota; 03-13 states this in docs/MONITORING.md. Status: unresolved, flagged.
- **Vercel runtime-log retention:** Hobby keeps 1 hour (research Pitfall 13); the live route has not been exercised on a Vercel deployment from this plan (no deploys were permitted). 03-13 documents where to look.

## Threat Flags

None beyond the planned threat model. The new public unauthenticated endpoint `/api/client-error/` is exactly the surface T-03-12-01 to 05 cover.

## Requirement status

PLAT-09 is not marked complete: error pages, Speed Insights and docs/MONITORING.md arrive in 03-13.

## Next Phase Readiness

03-13 can call `reportClientError(error, { source: 'error-boundary' | 'global-error', digest })` from the error pages (exported from `@/features/monitoring`) and document the route, log filter and retention. Visual-red window unchanged: web, e2e, python and citations must stay green; visual may fail only on declared states.

## Self-Check: PASSED

- Created files present (12 under dashboard-next/src and tests, listed in key-files)
- Commits `c4a65f4`, `96eb89d`, `5986643` found in git log; CI run 37068029774 reviewed
- Acceptance commands re-run: unit (35 files, 478 tests), typecheck, lint, both fences, build, full e2e (67 passed) all green
