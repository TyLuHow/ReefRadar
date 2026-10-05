---
phase: 04-design-system-instrument-primitives
plan: 24
subsystem: testing
tags: [playwright, visual-regression, fixtures, ci, git-lfs, review-page]
status: in-progress

requires:
  - phase: 04-design-system-instrument-primitives
    provides: fixtures-shots Playwright project, fixture-shots.ts expected names, build-fixtures-review.mjs (04-23)
provides:
  - "184 fixtures baselines committed from CI dispatch 37294867133, stored in Git LFS (Task 1, orchestrator)"
  - "fixtures.spec.ts gate that fails closed in CI and still skips locally"
  - "tests/unit/fixtures-baselines.test.ts: exact expected-set guard, by file name"
  - "docs/deploy/phase-4-fixtures-review/index.html: browsable review page of all 184 baselines"
  - "docs/deploy/PHASE-4-VISUAL-REVIEW.md: review record with manual checks and open questions, Owner decision left empty"
affects: [phase-6]

requirements: [DS-08, DS-01, DS-02, DS-03, DS-04, DS-05, DS-06]
requirements-completed: []

actuals:
  tokens: 9000
  tasks: 2
  commits: 1

key-files:
  created:
    - dashboard-next/tests/unit/fixtures-baselines.test.ts
    - docs/deploy/PHASE-4-VISUAL-REVIEW.md
    - docs/deploy/phase-4-fixtures-review/index.html
  modified:
    - dashboard-next/tests/e2e/fixtures.spec.ts

key-decisions:
  - "Baselines are in Git LFS, not plain history (owner decision); the guard test looks at file names only so it passes for pointer files and real PNGs alike"
  - "The review page links the baselines by relative path, so it renders from a checkout once git lfs pull has run"

completed: pending-owner-decision
---

# Phase 4 Plan 24: Fixtures baselines, fail-closed gate and owner review Summary

**184 fixtures baselines from CI dispatch 37294867133 (Git LFS) are now guarded by a name-exact unit test and a CI gate that fails instead of skipping; the review page and record are ready. Task 3, the owner visual review, is pending the owner decision.**

## Status

Task 1 done (orchestrator), Task 2 done (this executor), Task 3 pending: the owner has not yet decided, and the "Owner decision" section of `docs/deploy/PHASE-4-VISUAL-REVIEW.md` is intentionally empty.

## Task 1 (orchestrator, human-action)

- Dispatch run 37294867133 (`workflow_dispatch`, `update_snapshots=true`, on cf80002). Only the `fixtures-snapshots` artifact was downloaded: 184 files, all `-fixtures-shots-linux.png`.
- By owner decision the baselines are kept out of plain git history. They were losslessly recompressed (75.6 MB to 73.1 MB, decoded RGBA verified identical per file) and moved to Git LFS: `f582e54` tracks only `dashboard-next/tests/e2e/fixtures.spec.ts-snapshots/*.png` and makes the `visual` job install git and git-lfs, list the LFS objects, cache `.git/lfs` and run `git lfs pull`; `0adef04` commits the 184 PNGs as LFS pointers.
- Push CI on 0adef04 (run 37296999686) is green on every job; the `visual` job ran 217 tests, all passed (33 legacy plus 184 fixtures against the LFS baselines).
- The 33 legacy baselines are untouched and `legacy-baselines.test.ts` passes.

## Task 2 (this executor)

- `fixtures.spec.ts`: the empty-directory skip now matches `visual.spec.ts`. With `PW_VISUAL=1` in CI (`CI` is `true` or `1`) and no baselines, every test throws "PW_VISUAL=1 in CI but no fixtures baselines exist in tests/e2e/fixtures.spec.ts-snapshots. Regenerate them with the update_snapshots workflow input."; locally it still skips. The header comment was updated.
- `tests/unit/fixtures-baselines.test.ts` (node environment): builds the expected names from `expectedBaselineFiles()` in `tests/e2e/support/fixture-shots.ts` and asserts the snapshot directory holds exactly that set, only `.png`, with no missing and no unexpected names. File names only, so it passes whether the files are LFS pointers or real images.
- `node scripts/build-fixtures-review.mjs` wrote `docs/deploy/phase-4-fixtures-review/index.html` (184 images); `--check` passes. The page links the images with `../../../dashboard-next/tests/e2e/...` relative paths, so it renders when opened from a local checkout with the LFS objects present (the record says to run `git lfs pull` first).
- `docs/deploy/PHASE-4-VISUAL-REVIEW.md`: what is reviewed and where, the status palette note with hexes and contrast, the accent rule, the dispatch run id, file count, LFS storage and compression result, a manual-checks table (all pending), an "Open questions for the owner" section carrying the items from 04-04, 04-15, 04-16, 04-21 and 04-22, and one empty "Owner decision" heading.

## Verification

| Check | Result |
|---|---|
| `npx vitest run tests/unit/fixtures-baselines.test.ts tests/unit/legacy-baselines.test.ts` | pass (2 files, 5 tests) |
| `node scripts/build-fixtures-review.mjs --check` | OK, references all 184 baselines |
| `node scripts/check-citations.mjs --scope docs` | OK, no banned-pattern hits (392 files) |
| `npm run lint` | 0 errors (20 warnings, none in files touched by this plan) |
| `npm run typecheck` | pass |
| `npm test` | 87 files, 1506 tests passed |
| `grep -c "Owner decision" docs/deploy/PHASE-4-VISUAL-REVIEW.md` | 1 |

The CI-side check of the tightened gate (both screenshot projects passing) happens after the orchestrator pushes.

## Deviations from Plan

None to the plan's tasks. The worktree had no `node_modules`, so `npm ci` was run in `dashboard-next` to run the checks (untracked, gitignored).

## Known Stubs

None.

## Pending: Task 3 (owner decision)

Options: keep-atlas, nocturne, poster, changes. The decision, its date, palette acceptance and the manual-check results go under "Owner decision" in `docs/deploy/PHASE-4-VISUAL-REVIEW.md`. Not filled in yet.
