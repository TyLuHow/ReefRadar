---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 17
subsystem: production-rollout
tags: [deploy, contract-v2, reef_audio, per-window, live-verification, drift, rollback]
status: complete

requires:
  - phase: 05-15
    provides: "classifier package on contract v2; verify_live_truth v2 checks; verify_live_embeddings"
  - phase: 05-16
    provides: "contract v2 published, latest -> 2"
provides:
  - "production classifier, router and preprocessor on the Phase 5 pipeline (git d96c58c)"
  - "DEPLOY-LOG 'Phase 5 deploy (2026-10-16)' with proven rollback refs"
  - "refreshed infrastructure/deployed-state.json"
affects: [phase-06, phase-11, phase-12, phase-13]

key-files:
  modified:
    - docs/deploy/DEPLOY-LOG.md
    - infrastructure/deployed-state.json
    - scripts/tests/test_build_contract_v2.py
    - scripts/tests/test_contract_fixtures.py

key-decisions:
  - "CI on fc545f2 (the 05-16 push) failed 2 contract tests that assumed v2 was unpublished. Fixed the tests, not the tool: build_contract --check skips the rebuild for a published version by design, so the recipe tests unpublish v2 in their temp copy and a new test pins the skip. Deployed only after CI was green on d96c58c."
  - "Preprocessor rollback ref: the live zip was hand-built on 2026-02-20 (before D-04), so no ref reproduces its zip hash. Its only member, handler.py, is identical to 066c253's, so --ref 066c253 is a content-exact rollback; a copy of the live zip was kept outside the repo."
  - "Owner said 'deploy', then 'keep continuing'. A fresh Vercel preview of the branch was made on request (production frontend on main is still on hold)."

requirements-completed: [ML-01, ML-02, ML-06, ML-08]

completed: 2026-10-16
actuals:
  tasks: 3
  commits: 3
---

# 05-17 Summary: Phase 5 in production

Production runs `reef_audio` preprocessing and per-window classification with `interim-real-only-2026.10.1`. Every new result is stamped with contract v2.

## Rollback refs (proven before deploy)

| Function | Ref | Dry-run code_sha256 | Live before |
|---|---|---|---|
| classifier | `066c253` | `BJgiVBnJ...I1u0=` | equal |
| router | `066c253` | `u92VjjqQ...l+Y=` | equal |
| preprocessor | `066c253` | `yxv5wkua...e/k=` | `StVZQB8v...lWk=` (hand-built zip; handler.py identical) |

## Deploy (each --confirm hash equals its dry-run)

| Function | After | Time (UTC) |
|---|---|---|
| classifier | `LzxelAMw...bmE=` | 19:41:31 |
| router | `/zCahCbf...fI=` | 19:41:48 |
| preprocessor | `EfDEOleF...uL0=` | 19:41:55 |

## Verification

- `verify_live_truth.py` exited 0. Analyses: `3f0b40c6-a455-461d-8a24-29a646296cc3` (with coordinates) and `b0a375aa-2865-4703-af0c-26cc1855ab75` (without). Both are stamped v2 with the successor model, 6 windows, and 0 of 6 windows out of distribution.
- `verify_live_embeddings.py --confirm` exited 0: min cosine 1.0, max abs difference 0.0.
- The pre-phase result `8ebcf44d-...` still returns exactly its 13 legacy keys.
- `drift-check.py --function all`: all four MATCH.

## Human check (open)

Open the production legacy UI and analyse a gallery sample. Expected: the layout is unchanged and only the values differ.
