---
phase: 01-truth-reproducibility
plan: 05
subsystem: infra
tags: [lambda, deployment, drift-detection, zipfile, boto3, moto, ecr, codebuild, pytest]

# Dependency graph
requires:
  - phase: 01-truth-reproducibility
    provides: pytest + moto offline Lambda test harness (lambdas/conftest.py, pytest.ini) from plan 01-01
provides:
  - Four per-function Lambda package specs (infrastructure/lambda-packages/*.json)
  - Deterministic zip-package builder + manifest-based drift comparison library (scripts/lambda_packaging.py)
  - Offline-proven drift check CLI for zip and container functions (scripts/drift-check.py, D-03)
  - Single scripted deploy path with dirty-tree refusal and CodeSha256 verification (scripts/deploy-lambdas.py, D-04)
  - CLAUDE.md "Deployment" section rewritten to the scripted path
affects: [01-09, 01-14, 01-20]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 16733
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "lambda_packaging.py: build_package() pins ZipInfo date_time/external_attr/create_system so two builds of identical source are byte-identical regardless of host OS or local git checkout line-ending style"
    - "normalize_text_bytes() (CRLF->LF) applied in every reader that touches a working-tree or git-history file, so Windows core.autocrlf checkouts and `git show`-read git blobs always produce identical packaging bytes"
    - "Manifest-based drift comparison (per-file content sha256) instead of whole-zip-blob hashing, since plain `zip -r` embeds non-deterministic mtimes/permission bits"
    - "Hyphenated CLI scripts (drift-check.py, deploy-lambdas.py) loaded in tests via importlib file-path spec (scripts/tests/conftest.py::load_script), mirroring lambdas/conftest.py::load_lambda's existing pattern"
    - "deploy-lambdas.py's AWS calls go through an injectable client_factory parameter — moto-backed in most tests, a hand-written stub client for the one controlled-mismatch case moto can't naturally produce"

key-files:
  created:
    - infrastructure/lambda-packages/router.json
    - infrastructure/lambda-packages/preprocessor.json
    - infrastructure/lambda-packages/classifier.json
    - infrastructure/lambda-packages/inference.json
    - scripts/lambda_packaging.py
    - scripts/drift-check.py
    - scripts/deploy-lambdas.py
    - scripts/tests/conftest.py
    - scripts/tests/test_lambda_packaging.py
    - scripts/tests/test_drift_check.py
    - scripts/tests/test_deploy_lambdas.py
  modified:
    - CLAUDE.md
    - lambdas/classifier/tests/test_load_lambda.py

key-decisions:
  - "Added normalize_text_bytes() (CRLF->LF) to every file reader in lambda_packaging.py/deploy-lambdas.py after discovering the real repo's working-tree copy of lambdas/router/handler.py (CRLF, Windows core.autocrlf=true) differs byte-for-byte from the committed git blob (LF, what `git show` and a fresh Linux clone both return) — without this fix, a normal deploy and a --ref rollback of the identical commit would have produced non-identical zips, directly contradicting the plan's must_haves truth"
  - "Fixed lambdas/classifier/tests/test_load_lambda.py's fragile `from conftest import load_lambda` (bare sys.modules-name caching) to load lambdas/conftest.py via explicit importlib path, after adding a second conftest.py (scripts/tests/conftest.py) surfaced the latent bare-name collision when running the whole pytest suite together"
  - "Task 3's manifest_from_layers/check_offline_layers/build_config_summary were implemented during Task 1's GREEN commit (shared-file cohesion with the zip-kind support already in the same files); confirmed via grep this was genuine prior implementation, not a test-logic bug, before proceeding per the TDD fail-fast rule, then added Task 3's dedicated --layers-dir CLI and no_env_values test coverage"

requirements-completed: [TRUTH-02]

coverage:
  - id: D1
    description: "build_package() produces byte-identical zips across repeated builds and across git checkout line-ending styles (Windows CRLF working tree vs. LF git blob)"
    requirement: TRUTH-02
    verification:
      - kind: unit
        ref: "scripts/tests/test_lambda_packaging.py#test_build_package_is_deterministic"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_deploy_lambdas.py#test_ref_build_uses_committed_content_not_working_tree"
        status: pass
    human_judgment: false
  - id: D2
    description: "Manifest-based drift comparison matches on identical content despite different timestamps/permission bits, and correctly names missing/extra/changed files on drift"
    requirement: TRUTH-02
    verification:
      - kind: unit
        ref: "scripts/tests/test_lambda_packaging.py#test_fixture_zip_different_timestamps_and_perms_same_content_matches"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_drift_check.py#test_cli_drift_exits_one_and_names_changed_file"
        status: pass
    human_judgment: false
  - id: D3
    description: "drift-check.py CLI: exit 0 match, 1 drift, 2 error (unknown function, unreadable input), offline for both zip (--deployed-zip) and container (--layers-dir) kinds"
    requirement: TRUTH-02
    verification:
      - kind: unit
        ref: "scripts/tests/test_drift_check.py#test_cli_match_exits_zero"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_drift_check.py#test_cli_unknown_function_exits_two"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_drift_check.py#test_cli_container_drift_via_layers_dir"
        status: pass
    human_judgment: false
  - id: D4
    description: "Container drift: manifest_from_layers applies gzip-tar image layers in order (later overrides earlier) and honors OCI whiteout files"
    requirement: TRUTH-02
    verification:
      - kind: unit
        ref: "scripts/tests/test_lambda_packaging.py#test_manifest_from_layers_later_layer_overrides_earlier"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_lambda_packaging.py#test_manifest_from_layers_honors_whiteout_files"
        status: pass
    human_judgment: false
  - id: D5
    description: "deploy-lambdas.py refuses a dirty tree for a real (non --ref) deploy, but --ref builds from committed history regardless of working-tree state and skip the dirty check"
    requirement: TRUTH-02
    verification:
      - kind: unit
        ref: "scripts/tests/test_deploy_lambdas.py#test_dirty_tree_refused_without_ref"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_deploy_lambdas.py#test_ref_build_skips_dirty_check_and_uses_resolved_commit"
        status: pass
    human_judgment: false
  - id: D6
    description: "Confirmed zip deploy calls update_function_code, waits for function_updated, and verifies the returned CodeSha256 against the local build (exits 1 on mismatch)"
    requirement: TRUTH-02
    verification:
      - kind: unit
        ref: "scripts/tests/test_deploy_lambdas.py#test_confirmed_deploy_updates_function_and_verifies_sha"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_deploy_lambdas.py#test_mismatched_deployed_sha_exits_one"
        status: pass
    human_judgment: false
  - id: D7
    description: "Inference (container) deploy zips Dockerfile/requirements.txt/inference.py/buildspec.yml deterministically, uploads to S3, and starts the CodeBuild project; dry-run makes no AWS call"
    requirement: TRUTH-02
    verification:
      - kind: unit
        ref: "scripts/tests/test_deploy_lambdas.py#test_confirmed_inference_deploy_uploads_source_and_starts_build"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_deploy_lambdas.py#test_dry_run_prints_plan_and_makes_no_aws_call"
        status: pass
    human_judgment: false
  - id: D8
    description: "Drift reports never leak environment variable values, only names, in --json config_summary output"
    requirement: TRUTH-02
    verification:
      - kind: unit
        ref: "scripts/tests/test_drift_check.py#test_build_config_summary_no_env_values"
        status: pass
    human_judgment: false
  - id: D9
    description: "No shell=True anywhere in lambda_packaging.py, drift-check.py, or deploy-lambdas.py; scripts accept only the four known function names"
    requirement: TRUTH-02
    verification:
      - kind: other
        ref: "grep -c shell=True scripts/lambda_packaging.py scripts/drift-check.py scripts/deploy-lambdas.py == 0 for all three"
        status: pass
    human_judgment: false
  - id: D10
    description: "Whole-repo pytest suite (lambdas + scripts/tests) passes together, not just in isolation"
    verification:
      - kind: other
        ref: "py -3.12 -m pytest (61 passed)"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 05: Lambda Packaging, Offline Drift Check, Scripted Deploy (D-03/D-04) Summary

**Deterministic Lambda packaging + manifest-based drift detection (zip and container) and a single scripted deploy path with dirty-tree refusal and CodeSha256 verification — all proven offline with moto and fixture archives before any AWS account access exists.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-10-01T06:48:11Z
- **Completed:** 2026-10-01T07:02:26Z
- **Tasks:** 3 (tracer + 2 auto, all `tdd="true"`)
- **Files modified:** 15

## Accomplishments
- Four package specs (`infrastructure/lambda-packages/{router,preprocessor,classifier,inference}.json`) describing exactly what CLAUDE.md's old manual deploy commands built, now machine-readable
- `scripts/lambda_packaging.py`: deterministic zip builder (fixed `ZipInfo` metadata, sorted members, CRLF→LF content normalization) proven to produce byte-identical output across repeated builds, across Windows/Linux checkouts, and across `--ref` (git-history) vs. working-tree reads of the same commit
- `scripts/drift-check.py` (D-03): offline-proven for both zip-kind (`--deployed-zip` fixture) and container-kind (`--layers-dir` fixture gzip-tar layers, honoring OCI whiteouts) functions; exit 0/1/2; `--json` reports never leak environment variable values
- `scripts/deploy-lambdas.py` (D-04): single scripted path for all four functions — `--dry-run` (no AWS call), no `--confirm` (plan-only), dirty-tree refusal scoped to deploy-relevant paths, `--ref COMMIT` rollback (skips dirty check, builds from `git show`), zip deploy + `function_updated` waiter + post-deploy `CodeSha256` verification, and inference's CodeBuild-via-S3 path
- CLAUDE.md "Deployment" section rewritten to the scripted path; the two `curl` smoke checks preserved unchanged
- 42 new tests (61 total across the repo) all offline — no AWS credentials used or required

## Task Commits

Each task was committed atomically (RED then GREEN, since all three tasks carry `tdd="true"`):

1. **Task 1: Tracer — router spec to deterministic zip to manifest drift report** — `1815f3d` (test, RED) → `b0e28b3` (feat, GREEN); tracer feedback gate re-ran `<verify>` immediately after GREEN (22/22 passed) before expanding to Task 2
2. **Task 2: Single scripted deploy path (D-04)** — `ac3848e` (test, RED) → `afba5c6` (feat, GREEN)
3. **Task 3: Container drift check — ECR image layers** — `7e6f3eb` (test); functions were already genuinely implemented in Task 1's GREEN commit (shared-file cohesion), confirmed via grep before proceeding per the TDD fail-fast rule, so Task 3 adds the dedicated `--layers-dir` CLI and `no_env_values` test coverage rather than a fresh RED→GREEN pair

Plus one out-of-task-boundary fix required to keep the whole-repo suite green:
- `58ceb45` (fix) — resolved a `conftest.py` bare-module-name collision between the new `scripts/tests/conftest.py` and a prior plan's `lambdas/classifier/tests/test_load_lambda.py`

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `infrastructure/lambda-packages/router.json` / `preprocessor.json` / `classifier.json` / `inference.json` — package specs (function name, kind, members, and for inference: `ecr_repository`, `image_workdir`)
- `scripts/lambda_packaging.py` — `load_spec`, `build_package` (deterministic), `code_sha256`, `manifest_from_zip`, `manifest_from_spec`, `compare_manifests`, `manifest_matches`, `manifest_from_layers`, `normalize_text_bytes`
- `scripts/drift-check.py` — D-03 CLI: `--function`, `--deployed-zip`, `--layers-dir`, `--profile`, `--region`, `--json`; `check_offline_zip`, `check_offline_layers`, `check_live` (zip fast-path + ECR layer download for 01-09), `build_config_summary`
- `scripts/deploy-lambdas.py` — D-04 CLI: `--function` (repeatable), `--dry-run`, `--ref`, `--confirm`, `--profile`, `--region`; `is_clean`, `git_status_porcelain`, `resolve_ref`, `head_sha`, `git_show_reader`, `build_inference_source_zip`, `deploy_zip_function`, `deploy_inference_function`
- `scripts/tests/conftest.py` — `load_script()` fixture for importing hyphenated CLI scripts by file path
- `scripts/tests/test_lambda_packaging.py` — 20 tests (determinism, fixed metadata, sorting, custom reader, manifest ignore rules, timestamp/permission-invariant match, compare_manifests, load_spec validation against the real specs, code_sha256 format, manifest_from_layers override/whiteout/filter)
- `scripts/tests/test_drift_check.py` — 15 tests (CLI match/drift/missing-input/unknown-function exit codes, JSON report, container `--layers-dir` match/drift/missing-dir, zip-kind rejecting `--layers-dir`, `build_config_summary` no-env-values)
- `scripts/tests/test_deploy_lambdas.py` — 15 tests (`is_clean`, dry-run no-AWS-call, no-confirm plan-only, dirty-tree refusal scoped to relevant paths, unrelated-file-change not blocking, `--ref` rollback skipping dirty check and using committed content, invalid `--ref`, confirmed zip deploy + waiter + sha verification via moto, stub-client mismatch exit 1, per-deploy JSON log line, inference dry-run and confirmed S3+CodeBuild path via moto, deterministic flat inference source zip)
- `CLAUDE.md` — "Deployment" section replaced with the scripted path; curl smoke checks unchanged
- `lambdas/classifier/tests/test_load_lambda.py` — fixed fragile `from conftest import load_lambda` to an explicit `importlib` file-path load (see Deviations)

## Decisions Made
- **CRLF→LF normalization in every file reader** (`normalize_text_bytes`): the real repo's Windows working-tree copy of `lambdas/router/handler.py` has CRLF endings (`core.autocrlf=true`) while the committed git blob is LF — without normalizing, `build_package()`'s "byte-identical across builds" guarantee would silently fail to hold across platforms/checkouts, and a `--ref` rollback of the current commit would produce different bytes than a normal deploy of the same commit. Applied uniformly since every member these specs reference is a text/source file.
- **conftest.py collision fix**: loading `lambdas/conftest.py` via `importlib.util.spec_from_file_location` instead of a bare `from conftest import load_lambda`, which was silently relying on there being only one file named `conftest.py` in the whole collected test tree.
- **Task 3 TDD gate**: investigated (not silently accepted) why Task 3's tests passed immediately — confirmed via `grep` that `manifest_from_layers`/`check_offline_layers`/`build_config_summary` were genuinely already implemented in Task 1's GREEN commit (both zip and container support were built together in the same shared files), not a test-logic false pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CRLF/LF checkout mismatch broke cross-platform build determinism**
- **Found during:** Task 2, while writing the `--ref` rollback test (`test_ref_build_uses_committed_content_not_working_tree`)
- **Issue:** `pathlib.Path.write_text()`/working-tree checkouts on this Windows machine (`core.autocrlf=true`) produce CRLF line endings, while `git show <ref>:<path>` (and a fresh Linux clone) return the LF-stored git blob. A build from the working tree and a `--ref` build of the identical commit therefore produced different zip bytes — directly contradicting the plan's must_haves truth that "building a Lambda package from git twice yields byte-identical zips."
- **Fix:** Added `normalize_text_bytes()` (CRLF→LF) to `lambda_packaging.py`'s default reader and to `deploy-lambdas.py`'s `git_show_reader`.
- **Files modified:** `scripts/lambda_packaging.py`, `scripts/deploy-lambdas.py`, `scripts/tests/test_lambda_packaging.py` (one existing test updated to construct its "deployed" fixture from normalized content)
- **Verification:** Full `scripts/tests` suite green (37 tests at that point); `test_ref_build_uses_committed_content_not_working_tree` passes, proving working-tree and `--ref` builds of the same commit now match.
- **Committed in:** `afba5c6` (Task 2 GREEN commit)

**2. [Rule 1 - Bug] `shell=True` literal substring in docstrings tripped the acceptance grep**
- **Found during:** Task 2 acceptance check
- **Issue:** `grep -c "shell=True" scripts/deploy-lambdas.py` returned 1 — not from actual `subprocess` usage, but from the module docstring's own prose explaining that `shell=True` is never used.
- **Fix:** Reworded the docstring to describe the same guarantee without the literal substring.
- **Files modified:** `scripts/deploy-lambdas.py`
- **Verification:** `grep -c "shell=True"` returns 0 for all three new scripts.
- **Committed in:** `afba5c6` (Task 2 GREEN commit)

**3. [Rule 1 - Bug] `conftest.py` bare-module-name collision broke the whole-repo pytest suite**
- **Found during:** Post-Task-3 full verification (`py -3.12 -m pytest`, no path filter)
- **Issue:** Adding `scripts/tests/conftest.py` (needed for this plan's hyphenated-script test loading) surfaced a latent bug in plan 01-01's `lambdas/classifier/tests/test_load_lambda.py`: its `from conftest import load_lambda` is a bare Python import cached in `sys.modules` by literal filename, not pytest's fixture-injection mechanism. With two files now named `conftest.py` in the collected tree, whichever pytest imported last silently won the `sys.modules["conftest"]` slot, breaking the import for the other. `scripts/tests -x` and `lambdas -x` each passed individually; only the combined whole-repo run (`pytest.ini`'s actual `testpaths = lambdas scripts/tests`) failed.
- **Fix:** Loaded `lambdas/conftest.py` via an explicit `importlib.util.spec_from_file_location` path instead of the bare import, matching the robust pattern already used by `lambdas/conftest.py`'s own `load_lambda()` and this plan's `load_script()`.
- **Files modified:** `lambdas/classifier/tests/test_load_lambda.py`
- **Verification:** `py -3.12 -m pytest` (whole repo, no path filter) — 61/61 passed.
- **Committed in:** `58ceb45`

---

**Total deviations:** 3 auto-fixed (2 Task 2 correctness bugs, 1 cross-plan test-collision fix)
**Impact on plan:** All three were necessary for the plan's must_haves truths and acceptance criteria to actually hold (determinism across platforms, clean grep, whole-suite green). No scope creep — the conftest fix touched one line-equivalent of logic in a file outside this plan's stated scope, but only because this plan's own new file caused the regression.

## Issues Encountered
- Task 3's tests passed immediately on first run rather than failing (the expected RED state) because `manifest_from_layers`, `check_offline_layers`, and `build_config_summary` were already implemented during Task 1's GREEN commit — Task 1 and Task 3 share the same two files (`lambda_packaging.py`, `drift-check.py`), and the zip-kind and container-kind code paths were naturally written together for architectural cohesion. Per the TDD fail-fast rule, investigated this before proceeding (confirmed via `grep` the functions were genuinely implemented, not a test bug) rather than silently accepting the unexpected pass.

## User Setup Required
None — no external service configuration required. All AWS-touching code is exercised via moto or a stub client factory; no real AWS credentials were used or required. `--profile reefradar` is the documented default for when plan 01-09 points live mode at the real account.

## Next Phase Readiness
- D-03 and D-04 tooling is complete and offline-proven; plan 01-09 only needs to point `drift-check.py`'s live mode and `deploy-lambdas.py --confirm` at the real `reefradar` AWS profile — no new code should be needed, only real-account verification.
- Plan 01-14 (scripted deploys behind a blocking-human checkpoint) can consume `deploy-lambdas.py`'s per-deploy JSON log line (`function`, `git_sha`, `code_sha256`, `timestamp`) directly.
- Plan 01-20 can run `drift-check.py --function all` as the phase's final drift-check-green gate once the four functions are actually deployed from git (01-09/01-14).
- No blockers for any dependent plan.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All 15 created/modified files found on disk; all 6 commits (`1815f3d`, `b0e28b3`, `ac3848e`, `afba5c6`, `7e6f3eb`, `58ceb45`) found in git history.
