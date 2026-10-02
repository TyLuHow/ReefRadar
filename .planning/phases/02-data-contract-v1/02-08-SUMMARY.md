---
phase: 02-data-contract-v1
plan: 08
subsystem: web-contract-version-resolution
tags: [url-pinning, zustand, suspense, tanstack-query, playwright-clock, keepPreviousData]

requires:
  - phase: 02-data-contract-v1
    provides: web contract module with version-keyed hooks, mockContract controller, offline fetch harness (02-07); published contract v1 (02-06)
provides:
  - "?cv=N pins exactly contract vN (no pointer request) with a visible alert for a missing or malformed version; never a fallback to latest"
  - "html data-contract-version, data-contract-pinned and data-contract-coverage, kept current while a page follows latest.json"
  - "Hooks gated on a resolved version store; an explicit version argument still wins (for 02-10 result stamps)"
  - "A running unpinned page picks up a flipped latest.json and coverage flag within one 60 s refetch, no reload, no rebuild, proven in unit and browser tests"
affects: [02-09, 02-10, 02-12, Phase 6 PERSIST-01 URL state, every later UI phase]

actuals:
  tokens: 9800
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "The URL is read in exactly one Suspense-wrapped leaf (ContractVersionSync); it writes a zustand store and every contract hook waits for store.resolved, so useSearchParams never forces a route off static prerender"
    - "The ?cv= string is parsed with /^[1-9]\\d{0,5}$/; only the parsed integer reaches a URL path; echoed text in the alert is truncated to 40 characters"
    - "While following latest, placeholderData: keepPreviousData keeps the previous version on screen until the next one loads; pinned results never do, and version reports the version of the data actually returned"

key-files:
  created:
    - dashboard-next/src/features/contract/version.ts
    - dashboard-next/src/features/contract/ContractVersionSync.tsx
    - dashboard-next/tests/unit/contract-pin.test.tsx
    - dashboard-next/tests/unit/contract-flip.test.tsx
    - dashboard-next/tests/e2e/contract-pin.spec.ts
    - dashboard-next/tests/e2e/contract-flip.spec.ts
  modified:
    - dashboard-next/src/features/contract/hooks.ts
    - dashboard-next/src/features/contract/errors.ts
    - dashboard-next/src/features/contract/index.ts
    - dashboard-next/src/app/providers.tsx
    - dashboard-next/tests/unit/support/contract-fetch.ts
    - dashboard-next/tests/unit/contract-client.test.ts
    - dashboard-next/tests/unit/contract-schema-parity.test.ts

key-decisions:
  - "A pinned version that is missing or malformed is surfaced as a fixed, role=alert glass-panel notice (it does not affect layout) and as a typed error (ContractNotFoundError, new ContractVersionParamError); it is never replaced by latest (CONTRACT-04 prohibition)."
  - "Unpinned fetch failures (a network error, an unpublished latest) stay silent as before; the alert is only for versions the visitor explicitly asked for, as the plan specified."
  - "keepPreviousData only while following latest, so a flip does not blank /dashboard (plan: visible content unchanged by the flip) but a pinned or explicit version can never show another version's data."

patterns-established:
  - "Unit tests of an unversioned hook call setContractPin() first and resetContractStore() after"
  - "e2e specs that assert on the version alert must exclude Next's route announcer, which is also role=alert (#__next-route-announcer__)"

requirements-completed: []

coverage:
  - id: D1
    description: "?cv=N resolves exactly contract vN and never requests latest.json, including when N equals the current latest"
    requirement: "CONTRACT-04"
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/contract-pin.test.tsx#pinned 1 while latest is 2 returns manifest v1 and never requests latest.json"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/contract-pin.spec.ts#/dashboard/?cv=1 while v2 is latest resolves v1 and never requests latest.json"
        status: pass
    human_judgment: false
  - id: D2
    description: "A missing pinned version and an empty, zero, non-integer or path-like cv show a visible alert and never fall back to latest"
    requirement: "CONTRACT-04"
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/contract-pin.spec.ts#?cv=9 (not published) shows a visible not-found alert and does not fall back to latest"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/contract-pin.spec.ts#?cv=path-like shows a visible invalid alert and requests no contract"
        status: pass
      - kind: unit
        ref: "dashboard-next/tests/unit/contract-pin.test.tsx#parseContractVersionParam rejects '../x' as invalid"
        status: pass
    human_judgment: true
    rationale: "The alert wording and placement are a judgment call for the owner; the behaviour (visible, names the version, no substitution) is machine-checked"
  - id: D3
    description: "A running page without ?cv picks up a flipped latest.json and a changed coverage flag within one 60 s refetch, with no reload and no rebuild"
    requirement: "CONTRACT-03"
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/contract-flip.test.tsx#shows has_diel false on v1, then true on v2 after the 60 s pointer refetch, in one mounted tree"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/contract-flip.spec.ts#a running /dashboard picks up v2 and has_diel without reloading"
        status: pass
    human_judgment: false
  - id: D4
    description: "useSearchParams is read only in a Suspense-wrapped leaf, so next build still prerenders every route; routes without cv look the same"
    requirement: "CONTRACT-04"
    verification:
      - kind: command
        ref: "npm run build (run by every playwright webServer start) succeeded; grep -c Suspense src/app/providers.tsx prints 4"
        status: pass
      - kind: e2e
        ref: "npx playwright test --project=e2e (49 passed, including the unchanged route smoke and a11y specs)"
        status: pass
    human_judgment: true
    rationale: "The 33 Linux visual baselines can only be compared in the Playwright Docker image on CI; local Windows runs skip them. No markup changes when there is no error."

duration: 20min
completed: 2026-10-02
status: complete
---

# Phase 2 Plan 08: ?cv Pinning and Latest-Flip Pickup Summary

**`?cv=N` pins exactly contract vN with a visible alert (never a fallback to latest) for a missing or malformed version, and an unpinned running page picks up a flipped `latest.json` and its coverage flags within one 60 s refetch with no reload, all driven by one Suspense-wrapped leaf that writes a zustand store the contract hooks wait on.**

## Performance

- **Duration:** about 20 min
- **Tasks:** 2 (tracer, auto), both TDD
- **Commits:** 4 (RED and GREEN for each task)
- **Files:** 13 changed, 618 insertions, 19 deletions

## Accomplishments

- **Version store and parser (`version.ts`).** `parseContractVersionParam(raw)` returns `unpinned`, `pinned` with an integer, or `invalid` using `/^[1-9]\d{0,5}$/`; `""`, `0`, `01`, `abc`, `1.5`, `-1`, `+1`, `../x`, `1/../2`, `1234567` and a non-ASCII digit are all invalid. A plain zustand store holds `{resolved, pin}`; `resolved` is false until the URL is read.
- **ContractVersionSync leaf.** The only caller of `useSearchParams`, mounted in `Suspense fallback={null}` inside `QueryClientProvider` in `providers.tsx`. It writes the parsed pin, calls `useContract()`, and sets `html data-contract-version`, `data-contract-pinned` and `data-contract-coverage` (comma-joined true `has_*` flags, empty when none). It renders a fixed-position `role="alert"` glass panel only for an invalid pin or a pinned version that is not found; otherwise it renders nothing.
- **Hook gating.** Every contract query waits for `store.resolved`; a pin replaces latest resolution (no pointer query); an invalid pin is a `ContractVersionParamError` with zero requests; an explicit `version` argument always wins and does not need the store. A missing pinned version is the existing `ContractNotFoundError` (403 and 404 both map to it).
- **No blanked page on a flip.** While following latest, manifest, sites and model queries use `placeholderData: keepPreviousData`, and `version` reports the version of the data actually returned. A pinned or explicit version never receives another version's data.
- **Test support.** `setContractPin(pin?)` and `resetContractStore()` in `tests/unit/support/contract-fetch.ts`; the existing unversioned hook tests in `contract-client.test.ts` and `contract-schema-parity.test.ts` now resolve the store first.

## Task Commits

1. **Task 1 (tracer): ?cv pinning**: RED `e9f7b33` (test), GREEN `8de77b8` (feat). Tracer feedback gate (auto mode active): the tracer verify chain (unit files, typecheck, build via the Playwright web server, `contract-pin` e2e) was re-run green before expanding.
2. **Task 2: flip pickup**: RED `5c503da` (test; the e2e failed on the missing `data-contract-coverage`), GREEN `147ea45` (feat).

**Plan metadata:** recorded in the docs commit that follows this summary.

## Verification

- `npm test` (vitest, whole unit suite): 16 files, 192 tests passed (the pin and flip files add 36)
- `npm run typecheck`: clean. `npm run lint`: no errors (the one existing `LocationCompare.tsx` `exhaustive-deps` warning, not touched)
- `npm run build`: succeeded (run by the Playwright web server on each of the e2e invocations)
- `npx playwright test --project=e2e`: 49 passed (40 prior specs plus 8 pin specs and 1 flip spec)
- `grep -c Suspense dashboard-next/src/app/providers.tsx` prints 4 (at least 1 required)
- The 33 Linux visual baselines were not run locally (they self-skip off Linux); CI is the check, see the CI line in the final report.

## Deviations from Plan

### Plan wording adjusted

- **`requests` stays a property.** The plan asked to extend the mock controller "with `requests()`". 02-07's controller already exposes `requests: string[]` (and `contract-dashboard.spec.ts` reads it), so no change was needed; the new specs read `contract.requests`.
- **Fake timers drove TanStack directly.** The plan allowed a fallback to `queryClient.refetchQueries` if fake timers did not drive `refetchInterval` in jsdom. They did, using `vi.useFakeTimers({ shouldAdvanceTime: true })` plus `advanceTimersByTimeAsync(60_000)`, so the unit test exercises the real timer path.
- **`page.clock` did not stall hydration** (research assumption A7 did not bite); no focus-event fallback was needed, and the e2e proof uses the timer path.
- **`index.ts` and `errors.ts` additions.** `ContractVersionParamError`, `ContractVersionSync`, `parseContractVersionParam`, `useContractVersionStore` and the `ContractPin` type are exported through the barrel. `ContractQueryResult` gained a `following: boolean` field (true when the result tracks latest.json) used to decide whether previous data may be kept.
- **keepPreviousData added.** Not named in the plan; without it `/dashboard` would show its loading state for the instant between the pointer flipping and the v2 manifest and sites loading, contradicting "the dashboard page's visible content is unchanged by the flip". The unit test asserts the probe is never loading again after its first data.
- **RED for Task 2.** The unit flip test passes on the Task 1 hooks (the flip behaviour is the 02-07 pointer refetch plus the placeholder data); the RED signal for Task 2 is the e2e, which fails on the missing `data-contract-coverage` attribute.

### Auto-fixed Issues

**1. [Rule 1 - Bug in my own test] Next's route announcer is also `role="alert"`**
- **Found during:** Task 1 e2e
- **Issue:** `getByRole('alert')` matched both the contract alert and `#__next-route-announcer__`, failing strict mode and the zero-count assertion.
- **Fix:** specs use a locator that excludes the route announcer; the component keeps `role="alert"` as the plan specified.
- **Commit:** `8de77b8`

**Total deviations:** 1 auto-fixed plus 6 wording adjustments. No impact on must-have truths.

## Authentication Gates

None. No AWS call, credential, token file or presigned URL was read or printed. No test reaches a real CloudFront host (all contract traffic is served from `contracts/` on disk).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-02-08-01 (strict integer regex, path-like values tested in unit and e2e), T-02-08-02 (alert plus `data-contract-pinned`, zero latest requests for a pin), T-02-08-03 (the 02-07 client still verifies the pointer's `manifest_sha256`) are mitigated; T-02-08-04 is accepted. The alert echoes at most 40 characters of the URL value as escaped React text.

## Issues Encountered

None beyond the route-announcer locator above.

## Next Phase Readiness

- 02-09 and 02-10 can call `useContract(version?)` unchanged; a result stamp's explicit version bypasses the URL and the store.
- Any new route or test that renders an unversioned contract hook outside `Providers` must set the store (`setContractPin`) or it will wait forever; in the app `Providers` always mounts the leaf.
- Phase 6 PERSIST-01 can reuse `parseContractVersionParam` and `useContractVersionStore` for URL state.
- CONTRACT-03, -04 and -05 are intentionally not marked complete here; they complete at phase verification.

## Self-Check: PASSED

- Files present: dashboard-next/src/features/contract/version.ts, dashboard-next/src/features/contract/ContractVersionSync.tsx, dashboard-next/tests/unit/contract-pin.test.tsx, dashboard-next/tests/unit/contract-flip.test.tsx, dashboard-next/tests/e2e/contract-pin.spec.ts, dashboard-next/tests/e2e/contract-flip.spec.ts
- Commits present: e9f7b33, 8de77b8, 5c503da, 147ea45
