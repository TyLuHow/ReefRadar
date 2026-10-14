---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 01
subsystem: infra
tags: [lambda-packaging, deploy, drift-check, binary-safety, python]

requires:
  - phase: 01-foundations
    provides: deterministic Lambda packager (D-03) and scripted deploy path (D-04)
provides:
  - BINARY_SUFFIXES and normalize_member_bytes(source, data) in scripts/lambda_packaging.py
  - one binary rule shared by the working-tree reader, the git-show (--ref) reader and drift-check
affects: [05-classifier-bundling, 05-ood-reference, 05-successor-model, 05-15-packaging-test]

actuals:
  tokens: 9000
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Suffix-based binary allowlist decided in one helper shared by every package reader"

key-files:
  created: []
  modified:
    - scripts/lambda_packaging.py
    - scripts/deploy-lambdas.py
    - scripts/tests/test_lambda_packaging.py
    - scripts/tests/test_deploy_lambdas.py

key-decisions:
  - "Binary members are identified by suffix (.f32, .npz, .bin, case-insensitive) rather than by content sniffing, so the rule is explicit and identical on every reader"
  - "drift-check.py needs no code change; it uses build_package's default reader, and a test proves it"

patterns-established:
  - "A new binary member suffix must be added to BINARY_SUFFIXES; the byte-equality packaging test (05-15) covers the real members"

requirements-completed: [ML-01, ML-08]

coverage:
  - id: D1
    description: "Binary package members (.f32/.npz/.bin) containing CR LF are packaged byte for byte through the working-tree reader"
    requirement: "ML-01"
    verification:
      - kind: unit
        ref: "scripts/tests/test_lambda_packaging.py#test_binary_member_bytes_are_preserved"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_lambda_packaging.py#test_real_contract_embeddings_survive_packaging"
        status: pass
    human_judgment: false
  - id: D2
    description: "Text members are still CRLF-normalised so Windows and Linux builds stay byte-identical"
    requirement: "ML-08"
    verification:
      - kind: unit
        ref: "scripts/tests/test_lambda_packaging.py#test_text_member_is_still_crlf_normalised"
        status: pass
    human_judgment: false
  - id: D3
    description: "--ref rollback reader and drift-check apply the same binary rule"
    requirement: "ML-08"
    verification:
      - kind: unit
        ref: "scripts/tests/test_deploy_lambdas.py#test_ref_build_preserves_binary_member_bytes"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_deploy_lambdas.py#test_offline_drift_check_matches_a_zip_with_a_binary_member"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-10-13
status: complete
---

# Phase 5 Plan 01: Binary-safe Lambda packaging Summary

**Suffix-based binary allowlist (`.f32`, `.npz`, `.bin`) shared by every Lambda package reader, so contract embeddings, OOD reference rows and model weights are zipped byte for byte while text members keep CRLF normalisation.**

## Performance

- **Duration:** about 20 min
- **Tasks:** 2 of 2
- **Files modified:** 4

## Accomplishments

- Reproduced the bug first: the real `contracts/bucket/v1/embeddings.f32` (245,760 bytes) was corrupted by the old packager (CR LF rewritten to LF at byte 165017). The RED commit shows it failing.
- Added `BINARY_SUFFIXES` and `normalize_member_bytes(source, data)` to `scripts/lambda_packaging.py`; `_default_reader` uses it; docstrings no longer claim every member is text.
- `git_show_reader` in `scripts/deploy-lambdas.py` routes through the same helper, so `--ref` rollback builds match working-tree builds.
- `drift-check.py` is unchanged: it builds with the default reader. A test proves an offline deployed zip with a raw binary member reports no missing, extra or changed members.
- Old package specs contain no binary members, so earlier `--ref` rollback commits build exactly as before. The classifier dry run still reports 6 members (router 4, preprocessor 1).

## Task Commits

1. Task 1 RED: `e2da34f` test(05-01): add failing tests for binary package members
2. Task 1 GREEN: `e1a9583` feat(05-01): binary-safe Lambda packaging via normalize_member_bytes (also covers the git_show_reader change planned for Task 2)
3. Task 2 tests: `f4e76e0` test(05-01): --ref reader and drift-check share the binary packaging rule

## Deviations from Plan

### Ordering

**1. [Ordering] git_show_reader edit landed in the Task 1 GREEN commit**
- The one-line `git_show_reader` change was committed together with the packager change, because the two readers must agree. Task 2 therefore consists of its tests only.
- Because of this the Task 2 tests passed on first run; I verified they are sensitive by temporarily reverting the reader to `normalize_text_bytes`, which made `test_ref_build_preserves_binary_member_bytes` fail, then restored it (no residue; the committed file is the fixed one).

### Issues deferred

**2. Pre-existing failure, unrelated: `scripts/tests/test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent`**
- On this Windows checkout `data/audio-manifest.json` is CRLF in the working tree (autocrlf) while the generator writes LF, so the byte comparison fails. It does not touch the packager. Left alone (out of scope). The test run also regenerated `data/audio-manifest.json` and two `dashboard-next/tests/fixtures/api/*.json` files; I restored them with `git checkout --` on those specific files, so the tree is clean.

## Verification

- `py -3.12 -m pytest scripts/tests/test_lambda_packaging.py scripts/tests/test_deploy_lambdas.py scripts/tests/test_drift_check.py -q`: all pass (63 tests).
- `py -3.12 -m pytest -q` (whole suite, log at `$TEMP/full.log`): everything passes except the one pre-existing failure above.
- `py -3.12 scripts/deploy-lambdas.py --function classifier --function router --function preprocessor --dry-run`: exit 0, no AWS call, classifier 6 members.
- `grep -c "pkg.normalize_member_bytes(source, result.stdout)" scripts/deploy-lambdas.py` prints 1.

## Known Stubs

None.

## Threat Flags

None. T-05-01-01 through T-05-01-03 are mitigated by the tests above; T-05-01-04 accepted as planned.

## Self-Check: PASSED

- scripts/lambda_packaging.py has `BINARY_SUFFIXES = (".f32", ".npz", ".bin")` and `def normalize_member_bytes`
- Commits e2da34f, e1a9583, f4e76e0 exist on the branch
