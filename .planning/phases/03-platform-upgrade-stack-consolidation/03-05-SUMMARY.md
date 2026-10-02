---
phase: 03-platform-upgrade-stack-consolidation
plan: 05
subsystem: infra
tags: [eslint-flat-config, feature-fence, ci, lint-fence, plat-03]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: 03-04 flat eslint.config.mjs carrying the Phase 2 contract fence
provides:
  - ESLint blocks that fail any static import, re-export or dynamic import of @/components(/**) from src/features/**, including src/features/contract/**
  - scripts/check-feature-fence.mjs, a Node built-ins CI fence that also catches relative paths into src/components/ and require()
  - CI web job step running the script next to the contract fence
  - feature-fence.test.ts, a 15-case ESLint matrix plus a 15-case script matrix proving blocked and allowed imports
affects: [03-08, 03-09, 03-10, 03-11, 03-12]

actuals:
  tokens: 17000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Per-block repetition of no-restricted-imports / no-restricted-syntax entries in flat config, because a later object for the same rule replaces rather than merges"
    - "Shared constants (CONTRACT_SELECTORS, CONTRACT_DEEP, LEGACY, LEGACY_DYNAMIC) at the top of eslint.config.mjs"
    - "Two-layer fence: ESLint for the alias, a grep script for relative paths, require() and files ESLint does not model"

key-files:
  created:
    - scripts/check-feature-fence.mjs
    - dashboard-next/tests/unit/feature-fence.test.ts
  modified:
    - dashboard-next/eslint.config.mjs
    - .github/workflows/ci.yml

key-decisions:
  - "LEGACY pattern is the narrow alias group ['@/components', '@/components/**'], not **/components/**, so a feature's own ./components/X is never blocked"
  - "Relative imports are fenced only by the script (resolved against the importing file and tested for landing inside <root>/components/); ESLint stays alias-only"
  - "Comments are blanked (newlines kept) before scanning so a quoted import in a comment is not a hit and line numbers stay accurate"

patterns-established:
  - "Fence tests plant violations through ESLint.lintText with a filePath under the guarded directory and through the script with --root on mkdtemp trees"

requirements-completed: [PLAT-03]

coverage:
  - id: D1
    description: "A static import, bare @/components import, export-from or dynamic import of @/components(/**) from src/features/** (and from src/features/contract/**) fails npm run lint"
    requirement: PLAT-03
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/feature-fence.test.ts (ESLint feature fence, 8 blocked cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The contract deep-import rule and contract selectors survive the features block replacement; the existing contract fence is unchanged and green"
    requirement: PLAT-03
    verification:
      - kind: unit
        ref: "feature-fence.test.ts deep contract import and contract URL cases; contract-fence.test.ts 22/22 unmodified"
        status: pass
    human_judgment: false
  - id: D3
    description: "A feature's own ./components/X, @/lib, @/types, the contract barrel and @/components from app/ or the legacy components stay allowed"
    requirement: PLAT-03
    verification:
      - kind: unit
        ref: "feature-fence.test.ts (7 ESLint allowed cases; script allowed local, app/components and comment cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "scripts/check-feature-fence.mjs fails with file:line on static, side-effect, export-from, dynamic, require, relative-into-src/components and multi-line imports, and passes on the real tree"
    requirement: PLAT-03
    verification:
      - kind: unit
        ref: "feature-fence.test.ts grep feature fence (8 planted, 5 allowed, real tree)"
        status: pass
      - kind: other
        ref: "node scripts/check-feature-fence.mjs -> OK, 12 file(s) scanned"
        status: pass
    human_judgment: false
  - id: D5
    description: "CI runs the script in the web job and the pushed head is fully green"
    requirement: PLAT-03
    verification:
      - kind: other
        ref: "https://github.com/TyLuHow/ReefRadar/actions/runs/37049926811 (success: web incl. 'Run node ../scripts/check-feature-fence.mjs' OK, e2e, python, citations, visual; live-smoke skipped by design)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-02
status: complete
---

# Phase 3 Plan 05: Feature-Module Legacy-Import Fence Summary

**Two-layer fence (ESLint flat-config blocks plus a Node grep script run in the CI web job) that fails any import of the legacy `@/components/**` tree from `src/features/**`, proven by a 30-case planted-violation and allowed-import matrix; CI fully green.**

## Performance

- **Duration:** about 15 min (including the CI watch)
- **Tasks:** 2 (1 tracer, 1 TDD auto)
- **Commits:** 2 production commits (`e39bee8`, `571895f`)
- **Files:** 4 touched (2 created, 2 modified)

## Task 1 (tracer): fence in both layers

- `eslint.config.mjs` now hoists `CONTRACT_SELECTORS`, `CONTRACT_DEEP`, `LEGACY` and `LEGACY_DYNAMIC` to constants and has four blocks: all `src/**` except the contract module (contract fence, unchanged meaning); `src/features/**` except the contract module (contract selectors + `LEGACY_DYNAMIC` for `no-restricted-syntax`; `CONTRACT_DEEP` + `LEGACY` for `no-restricted-imports`); `src/features/contract/**` (`LEGACY` and the dynamic selector only); and the React Compiler downgrade block. The repetition is deliberate: a later flat-config object replaces, not merges, an earlier one.
- `scripts/check-feature-fence.mjs` copies the contract fence's shape (Node built-ins, `--root DIR`, exit 0/1) but scans only `<root>/features/**`. It extracts specifiers from static import / export-from / side-effect import / `import()` / `require()`, blanks comments first, and fails on `^@/components(/|$)` or a relative specifier resolving into `<root>/components/`. Output is `rel:line: legacy component import`, then `FAIL: N hit(s) ...` (exit 1) or `OK: ... (N file(s) scanned).` (exit 0).
- `ci.yml` web job: `- run: node ../scripts/check-feature-fence.mjs` right after the contract fence step (`grep -c` prints 1).
- The tracer feedback gate (auto mode) was satisfied by the Task 1 verify (3 tests), lint, script, contract-fence tests (22/22) and typecheck before expansion.

Commit: `e39bee8` feat(03-05): legacy-import fence for src/features (tracer).

## Task 2: full matrix and push

`feature-fence.test.ts` (vitest node environment, ESLint Node API via `require`, no eslint-disable comments, mkdtemp trees removed in `afterAll`):

- ESLint blocked (8): static `@/components/Navbar`, bare `@/components`, export-from `@/components/map/HealthLegend`, dynamic `import('@/components/Navbar')`, static and dynamic imports inside `src/features/contract/`, a deep `@/features/contract/client` import from a non-contract feature, and a contract URL literal from a non-contract feature (the last two prove the block replacement did not drop contract rules, T-03-05-02).
- ESLint allowed (7): `./components/Local`, `@/lib/api`, `@/types`, the contract barrel, a dynamic feature-local import, and `@/components/Navbar` from `src/app` and `src/components`.
- Script planted (8, each asserting exit 1 and `file:line`): static, bare alias, side-effect, export-from, dynamic, require, relative `../../../components/Navbar` from `features/x/y/z.ts`, multi-line import (reported on the `from` line).
- Script allowed/other (6): feature-local `../../components/Local` resolving under `src/features`, `./components`, `@/lib`, `@/types` and contract barrel, `@/components` under `app/` and inside legacy components, imports only in comments, a tree with no `features/`, and the real repository tree.

Local gate: unit suite 26 files / 311 tests passed; `npm run lint` 0 errors (22 warnings, all pre-existing, unchanged); typecheck clean; both fence scripts OK. Pushed `3b7ec67..571895f` (no workflow_dispatch run in progress). CI run **37049926811**, https://github.com/TyLuHow/ReefRadar/actions/runs/37049926811, concluded `success`: web (the new step printed `OK: no legacy component imports in src/features (12 file(s) scanned).`), e2e, python, citations, visual all success; live-smoke skipped (manual dispatch only).

Commit: `571895f` test(03-05): full allow/block matrix for the legacy-import fence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's relative-path case does not resolve into src/components**
- **Found during:** Task 2 (designing the script matrix)
- **Issue:** The plan lists `../../components/Navbar` from `src/features/x/y/z.ts` as a blocked case. That resolves to `src/features/components/Navbar` (a feature-local directory), not `src/components`, so blocking it would contradict "a feature's own components stay allowed" and the script's own rule.
- **Fix:** The blocked case uses `../../../components/Navbar` (which does land in `src/components`); the `../../components/Local` form is covered as an allowed case. The script's behaviour is exactly as specified.
- **Files modified:** `dashboard-next/tests/unit/feature-fence.test.ts`
- **Commit:** `571895f`

**2. [Process] TDD RED not shown separately for Task 1**
- The tracer's tests plant violations against the very config and script being added, and the repo rule against `git stash` ruled out a before/after toggle, so tests and implementation landed in one commit. The proof that the tests are not vacuous is in the matrix: every blocked case asserts a specific rule id or exit 1 and file:line, and every allowed case asserts an empty list or exit 0.

**Total deviations:** 1 auto-fixed (Rule 1, a plan test-case typo), 1 process note. **Impact:** none on scope or behaviour.

## Issues Encountered

None. The 22 existing lint warnings and the carried-over `unrs-resolver` install-script notice from 03-03/03-04 are unchanged and out of scope.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register: T-03-05-01 mitigated by the `ImportExpression` selector and the script's relative-path resolution (both planted-case tested); T-03-05-02 by repeating the contract rules in the features block, with tests that a deep contract import and a contract URL literal from a feature still fail and `contract-fence.test.ts` unchanged at 22/22; T-03-05-03 by the narrow alias pattern with the `./components/Local` allowed case.

Known limits (accepted): ESLint does not see relative paths or `require()` (the script does); a template-literal `import(\`@/components/${x}\`)` is caught only by the script; the script is regex-based, so unusual formatting (an import statement split across a string concatenation) is out of scope.

## Next Phase Readiness

The fence is live before any feature module exists beyond `contract`. 03-08 onward (map, charts, monitoring) are built inside it: new code goes under `dashboard-next/src/features/<name>/`, may import `@/lib/*`, `@/types`, the contract barrel and its own `./components/*`, and must not import `@/components/**`.

## Self-Check: PASSED

- Created files present: scripts/check-feature-fence.mjs, dashboard-next/tests/unit/feature-fence.test.ts
- Commits `e39bee8` and `571895f` found in git log; CI run 37049926811 success
