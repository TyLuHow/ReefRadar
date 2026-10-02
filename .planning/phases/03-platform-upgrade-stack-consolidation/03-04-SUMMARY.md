---
phase: 03-platform-upgrade-stack-consolidation
plan: 04
subsystem: infra
tags: [nextjs-16, turbopack, eslint-9, flat-config, contract-fence, ci, baseline-neutral]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: 03-03 hop 1 (Next 15.5.26 / React 19.3.0) green on CI, unchanged visual baselines
provides:
  - dashboard-next on next 16.3.8 (Turbopack build), react/react-dom 19.3.0, eslint-config-next 16.3.8, eslint exactly 9.39.5
  - Flat ESLint config (eslint.config.mjs, script `eslint .`) carrying the Phase 2 contract fence unchanged; .eslintrc.json deleted
  - platform-versions.test.ts, a CI gate on exact pins, installed next, flat-config files and next.config keys
  - next.config.js with agentRules false; html data-scroll-behavior="smooth"; engines.node >=20.9.0
  - Hop-2 CI evidence on the unchanged Phase 1/2 visual baselines
affects: [03-05, 03-08, 03-10, 03-13, 03-15]

actuals:
  tokens: 3500
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Flat ESLint config with defineConfig/globalIgnores; regex selectors written with String.raw so backslashes survive the JSON-to-JS conversion"
    - "React Compiler rule family (set-state-in-effect, refs, immutability) is warn-only on the legacy tree and stays error for src/features and tests"
    - "Config-pin test (platform-versions.test.ts) reads files relative to __dirname, no network"

key-files:
  created:
    - dashboard-next/eslint.config.mjs
    - dashboard-next/tests/unit/platform-versions.test.ts
  modified:
    - dashboard-next/package.json
    - dashboard-next/package-lock.json
    - dashboard-next/next.config.js
    - dashboard-next/src/app/globals.css
    - dashboard-next/src/app/layout.tsx
    - dashboard-next/tsconfig.json
    - dashboard-next/tests/unit/contract-fence.test.ts
    - dashboard-next/tests/unit/query-defaults.test.tsx
    - scripts/check-contract-fence.mjs
  deleted:
    - dashboard-next/.eslintrc.json

key-decisions:
  - "Package-legitimacy gate (Task 1) satisfied by the owner's standing approval (.planning/research/DRIVING-QUESTIONS.md, Standing owner approvals 2026-10-01, relayed by the orchestrator) plus the matching registry evidence below"
  - "Codemod choices rejected by hand: eslint 10.11.0 (kept exactly 9.39.5), injected @types/react and @types/react-dom overrides, and `export const instant = false` Cache Components opt-outs in three layouts"
  - "PLAT-01 marked complete: Next 16.3.8 / React 19.3.0 with every legacy route passing e2e and CI fully green is the requirement end to end"

patterns-established:
  - "Hop gate: lint, fence script, typecheck, unit, build, full e2e locally, then push and require every CI job including visual before the next plan"

requirements-completed: [PLAT-01]

coverage:
  - id: D1
    description: "dashboard-next runs on next 16.3.8 (Turbopack), react/react-dom 19.3.0, eslint-config-next 16.3.8, eslint 9.39.5, typescript 5.9.3, tailwindcss 3.4.19"
    requirement: PLAT-01
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/platform-versions.test.ts (10 tests, includes installed next 16.3.8)"
        status: pass
      - kind: other
        ref: "npm ls next eslint eslint-config-next typescript react tailwindcss --depth=0 -> 16.3.8 / 9.39.5 / 16.3.8 / 5.9.3 / 19.3.0 / 3.4.19"
        status: pass
    human_judgment: false
  - id: D2
    description: "Linting runs through the ESLint CLI on a flat config; the contract fence is unchanged in meaning and still trips on planted violations"
    requirement: PLAT-01
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/contract-fence.test.ts (all cases, only the unused require-imports disable comment removed)"
        status: pass
      - kind: other
        ref: "node scripts/check-contract-fence.mjs -> OK, 90 files scanned; npm run lint -> 0 errors, 22 warnings"
        status: pass
    human_judgment: false
  - id: D3
    description: "next build passes under Turbopack (Leaflet @import first in globals.css) with trailingSlash, images.unoptimized and agentRules false"
    requirement: PLAT-01
    verification:
      - kind: unit
        ref: "platform-versions.test.ts next.config.js describe"
        status: pass
      - kind: other
        ref: "npm run build -> Next.js 16.3.8 (Turbopack), 11 static pages"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every legacy route passes routes, a11y and all fixture-mocked e2e specs; contract-driven legacy pages unchanged with the Phase 2 tests unmodified"
    requirement: PLAT-01
    verification:
      - kind: e2e
        ref: "npm run test:e2e -> 51 passed, locally (twice) and in CI"
        status: pass
    human_judgment: false
  - id: D5
    description: "Hop is baseline-neutral and CI is fully green on the pushed head"
    requirement: PLAT-01
    verification:
      - kind: other
        ref: "https://github.com/TyLuHow/ReefRadar/actions/runs/37048363940 (success: web, e2e, python, citations, visual; live-smoke skipped by design). visual 33 passed, Update snapshots skipped; git log 1c74f86..HEAD on visual snapshots -> 0 lines"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-02
status: complete
---

# Phase 3 Plan 04: Hop 2 (Next 16.3.8 and ESLint 9 flat config) Summary

**Next.js 15.5.26 to 16.3.8 (Turbopack) with ESLint pinned at 9.39.5 on a hand-cleaned flat config that carries the Phase 2 contract fence unchanged; two commits, CI fully green including the visual job on unchanged baselines.**

## Performance

- **Duration:** about 25 min (including the CI watch)
- **Tasks:** 3 (1 legitimacy checkpoint, 1 tracer, 1 TDD auto)
- **Commits:** 2 production commits (`097effd`, `8e668c7`)
- **Files:** 10 changed in the tracer commit, 4 in the second (lockfile included)

## Task 1: Package legitimacy gate

Approval basis: owner's standing approval (`.planning/research/DRIVING-QUESTIONS.md`, "Standing owner approvals (2026-10-01)") relayed by the orchestrator, plus the registry evidence below. Every check matched, so the plan did not stop.

| Package | Version | Published | Repository | postinstall |
|---|---|---|---|---|
| next | 16.3.8 | 2026-09-30 | github.com/vercel/next.js | none |
| eslint-config-next | 16.3.8 | 2026-09-30 | github.com/vercel/next.js | none |
| eslint | 9.39.5 (deliberately not the latest major) | 2026-07-10 | github.com/eslint/eslint | none |
| @next/codemod | 16.3.8 (runner, verified in 03-03) | n/a | github.com/vercel/next.js | none |

Peers: `eslint-config-next@16.3.8` requires `eslint >=9.0.0`, `typescript >=3.3.1`; `next@16.3.8` accepts `react ^19.0.0`.

## Task 2: Tracer

1. `npx @next/codemod@16.3.8 upgrade 16.3.8 --yes` bumped next, eslint-config-next and eslint (to 10.11.0), injected `@types/react`/`@types/react-dom` overrides, and added `export const instant = false;` (a Cache Components opt-out) to `src/app/layout.tsx`, `dashboard/layout.tsx` and `experience/layout.tsx`.
2. Hand corrections: eslint reset to exactly 9.39.5; the @types overrides removed (the 19.3.0 devDependency pins stay; the react-leaflet override stays); the three `instant` exports reverted (Cache Components is not enabled; build passes without them). Plain `npm install`, no legacy-peer-deps or force.
3. `npx @next/codemod@16.3.8 next-lint-to-eslint-cli . --force` changed the lint script to `eslint .` and produced a flat config, then reported it could not fully update it. The generated file was replaced by the cleaned `eslint.config.mjs`: `defineConfig`/`globalIgnores`, `nextVitals`, the contract-fence block (three `no-restricted-syntax` selectors with `String.raw`, plus the `no-restricted-imports` pattern), a block downgrading `react-hooks/set-state-in-effect`, `react-hooks/refs` and `react-hooks/immutability` to warn for `src/components`, `src/hooks`, `src/app`, and the global ignores. `.eslintrc.json` deleted.
4. `contract-fence.test.ts`: removed the now-unused `no-require-imports` disable comment (one comment existed, not two); no assertion changes. `scripts/check-contract-fence.mjs` comment now names `eslint.config.mjs`.
5. `globals.css`: Leaflet `@import` moved to line 1 above `@tailwind` (03-10 deletes it).
6. `next.config.js`: `agentRules: false` added, stale WSL2 comment replaced, `transpilePackages` for deck.gl kept until 03-08.
7. `tsconfig.json`: `jsx` set to `react-jsx` and `.next/dev/types/**/*.ts` added, both written by `next build`; kept as written.
8. One lint error surfaced on the new config: `tests/unit/query-defaults.test.tsx` (a 03-01 test) reassigned an outer variable during render (`react-hooks/globals`). Fixed at the source by capturing the defaults inside a `useEffect`; the assertions are unchanged.

Local gate on the commit: lint 0 errors (22 warnings, all legacy tree plus one unused disable directive in `contract-schema-parity.test.ts`), fence script OK (90 files), typecheck clean, 272 unit tests, `next build` (Next.js 16.3.8, Turbopack, 11 static pages), 51 e2e passed. The tracer gate (auto mode on) re-ran the build end to end before expansion: passed. No AGENTS.md or CLAUDE.md was generated in dashboard-next.

Commit: `097effd` feat(03-04): Next 16.3.8 with ESLint 9 flat config (hop 2).

## Task 3: Pins gate, scroll behaviour, engines, CI

- TDD RED: `platform-versions.test.ts` written first; 2 of 10 tests failed as expected (engines, data-scroll-behavior).
- GREEN: `data-scroll-behavior="smooth"` added to the `<html>` element in `layout.tsx` (existing `className` kept); `engines.node >=20.9.0` added to package.json; plain `npm install` brought the lockfile root entry into line. 10/10 pass; whole suite 25 files, 282 tests.
- Full gate again: lint 0 errors, fence OK, typecheck clean, build OK, 51 e2e passed.
- Pushed `a80a3a4..8e668c7` with `git push origin redesign/v2-discovery` (no workflow_dispatch run in progress).
- CI run **37048363940**, https://github.com/TyLuHow/ReefRadar/actions/runs/37048363940, concluded `success`: web (lint, typecheck, unit 282, build) success; e2e (51 passed) success; python (509 passed, 1 skipped) success; citations success; visual (33 passed, Update snapshots skipped) success; live-smoke skipped (manual dispatch only).
- Baseline-neutral: `git log --oneline 1c74f866ca1a31eb8fe1dd7c6ac6ba6882154fa1..HEAD -- dashboard-next/tests/e2e/visual.spec.ts-snapshots` prints 0 lines.

Commit: `8e668c7` test(03-04): platform pins gate; html scroll behaviour; node engines.

## npm audit (not fixed, no `npm audit fix`)

| | Total | Low | Moderate | High | Critical |
|---|---|---|---|---|---|
| Before (03-03 head, Next 15.5.26, ESLint 8.57.1) | 11 | 1 | 3 | 5 | 2 |
| After (this head, Next 16.3.8, ESLint 9.39.5) | 8 | 1 | 2 | 3 | 2 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reverted codemod-injected `export const instant = false` in three layouts**
- **Found during:** Task 2 (upgrade codemod)
- **Issue:** The Next 16 upgrade codemod added a Cache Components opt-out export to `src/app/layout.tsx`, `src/app/dashboard/layout.tsx` and `src/app/experience/layout.tsx`. Cache Components is not enabled, the plan did not list two of those files, and the research did not call for it.
- **Fix:** Reverted all three; build, typecheck and all 51 e2e pass without them.
- **Commit:** `097effd`

**2. [Rule 1 - Bug] `query-defaults.test.tsx` failed the new React Compiler lint rules**
- **Found during:** Task 2 (first `npm run lint` on the flat config)
- **Issue:** The 03-01 test reassigned a module-level variable during render, an error under `react-hooks/globals` in eslint-config-next 16 (this file is a test, so the legacy-path downgrade does not apply).
- **Fix:** Capture the defaults in a `useEffect`; assertions untouched; the test still passes.
- **Files modified:** `dashboard-next/tests/unit/query-defaults.test.tsx` (not in the plan's file list)
- **Commit:** `097effd`

**3. [Rule 3 - Blocking] `scripts/check-contract-fence.mjs` comment referenced the deleted `.eslintrc.json`**
- Comment-only change to name `eslint.config.mjs`. **Commit:** `097effd`

Otherwise the plan ran as written. Plan said "two" unused disable comments in `contract-fence.test.ts`; only one existed.

## Issues Encountered

- `npm install` still reports `unrs-resolver@1.12.2` install scripts not covered by `allowScripts` (carried over from 03-03, now a newer version). Nothing fails; not approved or changed here. Flagged for the owner.
- The tool commits with an auto-configured committer identity (git warns); git config deliberately not changed.
- 22 lint warnings remain, all by design (legacy-tree React Compiler rules warn-only; one exhaustive-deps; one unused disable directive in `contract-schema-parity.test.ts`). Legacy components were not edited to silence them.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register (T-03-04-SC mitigated by the evidence gate and exact pins; T-03-04-01 by the unchanged fence test and CI script; T-03-04-02 by platform-versions.test.ts; T-03-04-03 by `agentRules: false`; T-03-04-04 by engines, with the Vercel preview build proven in 03-13).

## Next Phase Readiness

03-05 can add the legacy-import fence blocks to `eslint.config.mjs`. 03-08 deletes `transpilePackages` with deck.gl. 03-10 deletes the react-leaflet override and the Leaflet `@import`. 03-13 must prove the Vercel preview build on Node >=20.9.

## Self-Check: PASSED

- Created files present: dashboard-next/eslint.config.mjs, dashboard-next/tests/unit/platform-versions.test.ts; dashboard-next/.eslintrc.json absent
- Commits `097effd` and `8e668c7` found in git log; CI run 37048363940 success
