---
phase: 03-platform-upgrade-stack-consolidation
plan: 03
subsystem: infra
tags: [nextjs-15, react-19, codemod, npm-overrides, ci, baseline-neutral]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: 03-01 PLAT-10 guard tests and 03-02 stack-consolidation gate, both green on CI before this hop
provides:
  - dashboard-next on next 15.5.26 and react/react-dom 19.3.0 (exact pins), proven by CI npm ci on Linux Node 22
  - "@types/react and @types/react-dom 19.3.0 and an explicit @testing-library/dom 10.4.2"
  - Temporary react-leaflet-only overrides entry bridging its React 18 peer (deleted in 03-10)
  - Hop-1 CI evidence on the unchanged Phase 1/2 visual baselines (hop 2 starts from this green head)
affects: [03-04, 03-10, 03-15]

actuals:
  tokens: 22000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Official codemod output is reviewed and corrected by hand (reject eslint 9, --turbopack dev script, injected @types overrides) before the lockfile is regenerated with a plain npm install"
    - "Peer conflict bridged by a scoped overrides entry naming only the offending package, never --legacy-peer-deps or --force"

key-files:
  created: []
  modified:
    - dashboard-next/package.json
    - dashboard-next/package-lock.json
    - dashboard-next/tsconfig.json

key-decisions:
  - "The checkpoint:human-verify package-legitimacy gate (Task 1) was satisfied by the owner's standing approval (DRIVING-QUESTIONS.md, Standing owner approvals 2026-10-01, relayed by the orchestrator) plus the registry evidence below; every check matched"
  - "The codemod's eslint 9.39.5 bump, --turbopack dev script and injected @types overrides were rejected; ESLint 8 and .eslintrc.json stay until the later lint migration"
  - "PLAT-01 is NOT marked complete: it covers Next 16 and React 19, and this plan delivers only hop 1 (Next 15.5.26 / React 19.3.0)"

patterns-established:
  - "Hop gate: typecheck, lint, unit, build and the full e2e project locally, then push and require every CI job incl. visual green before the next hop"

requirements-completed: []  # PLAT-01 spans Next 16; only hop 1 is delivered here

coverage:
  - id: D1
    description: "dashboard-next runs on next 15.5.26 with react, react-dom, @types/react and @types/react-dom at exactly 19.3.0 and @testing-library/dom 10.4.2, installed with a plain npm install"
    requirement: PLAT-01
    verification:
      - kind: command
        ref: "npm ls next react react-dom @types/react @types/react-dom @testing-library/dom --depth=0 -> 15.5.26 / 19.3.0 / 19.3.0 / 19.3.0 / 19.3.0 / 10.4.2"
        status: pass
    human_judgment: false
  - id: D2
    description: "Hop gate green locally and in CI: typecheck, lint (only the pre-existing exhaustive-deps warning), 272 unit tests, next build, 51 e2e specs; CI web, e2e, python, citations and visual all success"
    requirement: PLAT-01
    verification:
      - kind: ci
        ref: "https://github.com/TyLuHow/ReefRadar/actions/runs/37046040097 (conclusion success)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Hop is baseline-neutral: visual job 33/33 against unchanged committed baselines, zero snapshot commits since the Phase 2 baseline"
    requirement: PLAT-01
    verification:
      - kind: command
        ref: "git log --oneline 1c74f866ca1a31eb8fe1dd7c6ac6ba6882154fa1..HEAD -- dashboard-next/tests/e2e/visual.spec.ts-snapshots -> 0 lines; CI visual 33 passed, Update snapshots step skipped"
        status: pass
    human_judgment: false
  - id: D4
    description: "Contract-driven legacy pages (gallery, sites list with filters, dashboard counts) behave exactly as before on React 19 with the Phase 2 unit and e2e tests unmodified"
    requirement: PLAT-01
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e (51 passed locally and in CI, no test edits)"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-02
status: complete
---

# Phase 3 Plan 03: Hop 1 (Next 15.5.26 and React 19.3.0) Summary

**Next.js 14.2.35 to 15.5.26 and React 18 to 19.3.0 via the official @next/codemod, hand-corrected to exact pins, with a react-leaflet-scoped peer override; one commit, zero source edits, CI fully green including the visual job on unchanged baselines.**

## Performance

- **Duration:** about 20 min (including the CI watch)
- **Tasks:** 3 (1 legitimacy checkpoint, 1 tracer, 1 auto)
- **Commits:** 1 production commit (`022623b`)
- **Files modified:** 3 (package.json, package-lock.json, tsconfig.json)

## Task 1: Package legitimacy gate

Approval basis: owner's standing approval (`.planning/research/DRIVING-QUESTIONS.md`, "Standing owner approvals (2026-10-01)") relayed by the orchestrator, plus the registry evidence below. All checks matched, so the plan did not stop.

| Package | Version | Repository | postinstall |
|---|---|---|---|
| next | 15.5.26 | github.com/vercel/next.js | none |
| eslint-config-next | 15.5.26 | github.com/vercel/next.js | none |
| @next/codemod | 16.3.8 | github.com/vercel/next.js | none |
| react | 19.3.0 | github.com/react/react (see note) | none |
| react-dom | 19.3.0 | github.com/react/react (see note) | none |
| @types/react | 19.3.0 | github.com/DefinitelyTyped/DefinitelyTyped | none |
| @types/react-dom | 19.3.0 | github.com/DefinitelyTyped/DefinitelyTyped | none |
| @testing-library/dom | 10.4.2 | github.com/testing-library/dom-testing-library | none |
| codemod (React 19 runner) | 1.18.3 (latest) | github.com/codemod/codemod | none |

Notes:
- react and react-dom list `github.com/react/react` rather than the plan's expected `facebook/react`. The GitHub API shows `facebook/react` now resolves to `react/react` (repository moved to the react org), the previous release 19.2.0 listed `facebook/react`, maintainers are unchanged (`fb`, `react-bot`) and 19.3.0 (published 2026-09-09) was released by `react-bot` via GitHub Actions OIDC. Treated as a matching official repository, not a mismatch.
- `codemod` (the React 19 recipe runner, previously [ASSUMED]) is confirmed: repository codemod/codemod, maintainers alexbit and codemod-release-bot at codemod.com, no postinstall. Run pinned as `codemod@1.18.3`.

## Task 2: Tracer (Next 15.5.26 and React 19.3.0)

1. Added the top-level `overrides` entry `react-leaflet: { react: "$react", "react-dom": "$react-dom" }` first.
2. Ran `npx @next/codemod@16.3.8 upgrade 15.5.26 --yes`. It ran npm install, reported the codemod set (request-geo-ip, async-request-api, runtime-config, turbo-to-turbopack, next-lint-to-eslint-cli), then stopped at its "Is your app deployed to Vercel?" prompt. No source files were changed by it.
3. Hand corrections to its package.json output: reset `eslint` from 9.39.5 to `^8.57.0`, restored the `dev` script from `next dev --turbopack` to `next dev`, dropped the injected `@types/react`/`@types/react-dom` overrides (the 19.3.0 devDependency pins stay), added `@testing-library/dom` 10.4.2. Kept typescript `^5.5.4`, the `next lint` script and `.eslintrc.json`.
4. Plain `npm install` (no legacy-peer-deps, no force) resolved cleanly.
5. `next lint` and `next build` rewrote `tsconfig.json` (target ES2017; array reformatting). Kept as written.

Installed versions: next 15.5.26, react 19.3.0, react-dom 19.3.0, @types/react 19.3.0, @types/react-dom 19.3.0, @testing-library/dom 10.4.2, eslint 8.57.1.

Local hop gate (all on this head):
- `npm run typecheck`: exit 0
- `npm run lint`: exit 0, only the pre-existing `exhaustive-deps` warning in `LocationCompare.tsx` (plus Next's `next lint` deprecation notice)
- `npm test`: 24 files, 272 tests passed (including the 03-01 PLAT-10 tests and 03-02 stack gate)
- `npm run build`: success, 12 static pages, all routes prerendered
- `npm run test:e2e`: 51 passed (routes, a11y, analysis flow, gallery, contract pin)
- Acceptance greps: eslint `^8` count 1, `@testing-library/dom` 10.4.2 count 1, `trailingSlash: true` count 1

Commit: `022623b` feat(03-03): Next 15.5.26 and React 19.3.0 via the official codemod (hop 1).

## Task 3: React 19 recipe, push, CI

- `npx codemod@1.18.3 react/19/migration-recipe --target src --no-interactive` ran non-interactively (sub-codemods: ReactDOM.render, string refs, act import, useFormState, PropTypes). Result: Modified 0, Unmodified 408. No commit needed.
- Audit grep of `dashboard-next/src` for `forwardRef`, `ReactDOM.render`, `propTypes`, `defaultProps`, argument-less `useRef()`, string `ref="`, `findDOMNode`, `react-dom/test-utils`, `useFormState`: zero hits.
- Pushed with `git push origin redesign/v2-discovery` (`f677855..022623b`); no workflow_dispatch run was in progress.
- CI run **37046040097**: https://github.com/TyLuHow/ReefRadar/actions/runs/37046040097 concluded `success`. Jobs: web (lint, typecheck, unit, build) success (272 tests); e2e (routes + axe, fixture-mocked) success (51 passed); python (pytest) success (509 passed, 1 skipped); citations success; visual (screenshot regression, Docker-pinned) success (33 passed, "Update snapshots" step skipped); live-smoke skipped (manual dispatch only, expected).
- Baseline-neutral: `git log --oneline 1c74f866ca1a31eb8fe1dd7c6ac6ba6882154fa1..HEAD -- dashboard-next/tests/e2e/visual.spec.ts-snapshots` prints 0 lines.

## Deviations from Plan

None - plan executed exactly as written. The hand corrections to the codemod's output (eslint, dev script, @types overrides) are the plan's explicit "reject any other codemod choice" instructions, not deviations. The only unexpected observation: the codemod stopped at an interactive Vercel prompt after `--yes` (no source edits resulted).

## Issues Encountered

- `npm install` now reports "1 package has install scripts not yet covered by allowScripts": `unrs-resolver@1.11.1` (a transitive dependency; npm 11 warns it is not covered by an allowScripts entry). Nothing failed (build, lint and CI all pass). Not approved or changed here; flagged for the owner/next plans in case a later npm or Node policy requires an `allowScripts` decision.
- `npm audit` reports 11 vulnerabilities (1 low, 3 moderate, 5 high, 2 critical). Not addressed (out of scope for this hop; no `npm audit fix --force`).
- The tool ran git commits with an auto-configured committer identity (git warned); git config was deliberately not changed.

## Known Stubs

None.

## Threat Flags

None. The new surface (two npx-run codemod runners and framework majors) is the plan's own T-03-03-SC register item and was mitigated by the registry-evidence gate and exact pins.

## Next Phase Readiness

Hop 2 (03-04) can start from this green, pushed head. The react-leaflet override in package.json must be deleted when react-leaflet is removed in 03-10. PLAT-01 stays open until Next 16 lands.

## Self-Check: PASSED

- Modified files present: dashboard-next/package.json, package-lock.json, tsconfig.json
- Commit `022623b` found in git log; CI run 37046040097 success
