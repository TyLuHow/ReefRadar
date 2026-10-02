---
phase: 02-data-contract-v1
plan: 10
subsystem: web-result-stamps-and-contract-fence
tags: [contract, stamp, pre-contract, eslint-fence, ci-grep-fence]

requires:
  - phase: 02-data-contract-v1
    provides: router stamps on /visualize (02-05), contract module and useContract(version) explicit-version rule (02-07, 02-08), legacy pages on the contract (02-09)
provides:
  - "Every analysis result on /dashboard/analyze and /experience states the contract version it was produced with (Contract vN with dataset, model and preprocessing versions, resolved through useContract(N) even while a newer version is latest), or says pre-contract and makes no contract request"
  - "A stamped result whose version cannot be found reads 'Contract vN (not found)'; a stamp that disagrees with the resolved manifest says which of dataset, model or preprocessing differs"
  - "ESLint override (no-restricted-syntax, no-restricted-imports) that fails next lint on contract URLs, the contract env var, deep imports of src/features/contract internals and contracts/fixtures imports anywhere under src/ outside the module"
  - "scripts/check-contract-fence.mjs, run in the CI web job, also fails on the backend sites client call and the old hard-coded coordinate table"
affects: [02-11, Phase 9 permalinks, Phase 17 retirement of legacy routes]

actuals:
  tokens: 21000
  tasks: 2
  commits: 2

key-files:
  created:
    - dashboard-next/src/features/contract/stamp.ts
    - dashboard-next/src/features/contract/ContractStampLine.tsx
    - dashboard-next/tests/fixtures/api/visualize-3class-stamped.json
    - dashboard-next/tests/unit/contract-fence.test.ts
    - scripts/check-contract-fence.mjs
  modified:
    - dashboard-next/src/types/index.ts
    - dashboard-next/src/features/contract/index.ts
    - dashboard-next/src/components/AnalysisResults.tsx
    - dashboard-next/src/components/experience/ControlsPanel.tsx
    - dashboard-next/tests/unit/results-components.test.tsx
    - dashboard-next/tests/e2e/analysis-flow.spec.ts
    - dashboard-next/.eslintrc.json
    - .github/workflows/ci.yml

key-decisions:
  - "ContractStampLine splits into PreContractLine and StampedLine so the useContract hook is only ever called for a numeric stamp; an unstamped result cannot trigger the latest.json pointer request"
  - "A stamp field that is null or absent is not compared against the manifest (nothing was claimed); only a present, differing value raises the mismatch note"
  - "contract-fence.test.ts types the ESLint Node API locally instead of adding @types/eslint (no new package)"

requirements-completed: []

status: complete
completed: 2026-10-02
---

# Phase 2 Plan 10: Result Stamps and Contract Fence Summary

**Every analysis result now shows its exact contract version (resolved explicitly, never via latest) or the honest label pre-contract, and a two-layer fence (ESLint override plus a CI grep, both with planted-violation tests) keeps contract access inside src/features/contract.**

## Commits

1. `a000b81` feat(02-10): result stamp line on both results surfaces (tracer): AnalysisResult stamp fields, `formatContractStamp`, `ContractStampLine`, stamped fixture, unit and e2e coverage
2. `8567a45` feat(02-10): ESLint override, `scripts/check-contract-fence.mjs`, `contract-fence.test.ts`, CI step after `npm run lint`

## Verification

- Local: `npm test` 18 files, 228 tests passed (results-components gained 6 stamp cases, contract-fence has 22); `npm run typecheck` clean; `npm run lint` only the pre-existing `LocationCompare.tsx` exhaustive-deps warning; `npm run build` ok; `node scripts/check-contract-fence.mjs` ok (90 files scanned); `npx playwright test --project=e2e` 51 passed (analysis-flow now has 6 tests: stamped and pre-contract on both surfaces).
- Tracer gate (auto mode): the tracer's unit and `analysis-flow` e2e verification passed before the fence task began.
- Push CI run `36953569830` (https://github.com/TyLuHow/ReefRadar/actions/runs/36953569830) on head `8567a45`: success. python, web (including the new fence step), citations, e2e and visual all green; live-smoke skipped as designed.
- No visual baseline changed: the visual job compared all states against the committed baselines without a diff, and no regeneration dispatch was needed.

## Deviations from Plan

- **[Process] TDD order.** The stamp unit tests were written in the same commit as the implementation rather than RED-first (the plan lists one task commit; behaviours are all asserted).
- **Test-only typing.** `@types/eslint` is not installed, so `contract-fence.test.ts` declares the three ESLint Node-API types it uses and loads ESLint with `require`, instead of installing a package.
- **Stamp fixture id.** `visualize-3class-stamped.json` uses analysis_id `fixture-3class-stamped` (a copy of the no-coords fixture plus the four values from `contracts/bucket/v1/stamp.json`).
- **e2e assertion adjusted.** The stamped analyze test first asserted that latest.json was never requested; the page shell legitimately follows latest, so it now asserts that `contract/v1.json` was requested while the page also followed v2 and the result line still showed v1.

## Known Stubs

None.

## Threat Flags

None. T-02-10-01 (null stamp renders pre-contract, mismatch and not-found shown), T-02-10-02 (only an integer from the typed payload reaches the 02-07 client), T-02-10-03 (both fences, each with planted-violation tests) and T-02-10-04 (React text rendering only) are mitigated.

## Notes for later plans

- Results from the currently deployed classifier carry no stamps, so live results render "pre-contract" until 02-11 deploys stamping.
- CONTRACT-01 and CONTRACT-04 intentionally not marked complete (they complete at phase verification).

## Self-Check: PASSED

- Files present: stamp.ts, ContractStampLine.tsx, visualize-3class-stamped.json, contract-fence.test.ts, scripts/check-contract-fence.mjs
- Commits present: a000b81, 8567a45
