---
phase: 02-data-contract-v1
plan: 05
subsystem: classifier-router-stamps
tags: [version-stamps, contract-04, classifier, router, dynamodb, lambda-packaging, moto]
status: complete

requires:
  - phase: 02-data-contract-v1
    provides: contracts/bucket/v1/stamp.json and analysis-result.schema.json from plan 02-01
provides:
  - lambdas/shared/contract_stamp.py (stdlib loader, bundled file first with repo fallback, and the stamp_for_model staleness guard)
  - Classifier writes contract_version, dataset_version, model_version and preprocessing_spec_version into every new RESULT item
  - Router GET /visualize/{id} and /results/{id} return the four keys (contract_version as integer 1, null for pre-contract items)
  - infrastructure/lambda-packages/classifier.json with 6 members (adds contract_stamp.py and contract_stamp.json)
affects: [02-10, 02-11]

actuals:
  tokens: 6000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Bundled-first loader (same shape as site_provenance.load_provenance): a JSON file packaged next to the module wins, the repo file is the checkout fallback, so tests and Lambdas share one code path"
    - "Staleness guard: model_version always comes from the running model config; the other three values are copied only when that version equals the bundled stamp's model_version, otherwise null"
    - "DynamoDB Decimal numbers are cast to int in the router before JSON encoding, because DecimalEncoder would emit 1.0"

key-files:
  created:
    - lambdas/shared/contract_stamp.py
    - lambdas/shared/tests/test_contract_stamp.py
    - lambdas/router/tests/test_visualize_stamp.py
  modified:
    - lambdas/classifier/handler.py
    - lambdas/classifier/tests/test_handler.py
    - lambdas/router/handler.py
    - infrastructure/lambda-packages/classifier.json
    - scripts/tests/test_lambda_packaging.py

key-decisions:
  - "A stamp that cannot be loaded writes all four keys as null and logs, rather than failing the analysis; only a successful load is cached so a transient problem retries on the next invocation"
  - "The live model_version is stamped even when the contract fields are guarded to null, so a result always names the model that produced it"
  - "A model config with no version is never treated as covered by the bundled stamp"

patterns-established:
  - "contract_version null means pre-contract everywhere: legacy RESULT items, mismatched models and unloadable stamps all return the same honest null"

requirements-completed: []

duration: 25min
completed: 2026-10-01
---

# Phase 2 Plan 05: Classifier and Router Result Version Stamps Summary

Every new analysis RESULT now pins the contract, dataset, model and preprocessing versions it was produced with, from a JSON bundled into the classifier package, and /visualize returns them (null for pre-contract results). Code and tests only: nothing was deployed.

## What was built

- **`lambdas/shared/contract_stamp.py`**: `load_stamp()` prefers `contract_stamp.json` next to the module and falls back to `contracts/bucket/v1/stamp.json`; `stamp_for_model(loaded_model_version, stamp)` implements the staleness guard (T-02-05-01).
- **Classifier**: `result_version_stamp()` merges the four keys into `result_item` beside `embedding_summary`. `classification['model_version']`, the conditional `put_item` and every other field are unchanged. `contract_version` stays a Python int.
- **Router `handle_visualize`**: returns the four keys; `contract_version` is cast with `int()` so the body contains `"contract_version": 1`, never `1.0`. `/results/{id}` is the same code path (asserted byte-identical by test).
- **Packaging**: `classifier.json` gains `contract_stamp.py` and `contract_stamp.json` (the committed stamp, LF-normalised by `lambda_packaging.py`).

## Tasks and commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 RED | 231e3ba | Failing tests: loader and moto end-to-end classifier -> router |
| 1 GREEN | 97aaafa | Loader, classifier stamping, router passthrough (tracer verified end to end, then expanded) |
| 2 RED | c762cd0 | Failing tests: guard, schema validation, six-member package, stale-model run |
| 2 GREEN | 1d28afa | Staleness guard, classifier.json members, package-members test update |

## Verification

- Full suite `py -3.12 -m pytest`: 381 passed, 1 deselected (live).
- `py -3.12 scripts/deploy-lambdas.py --function classifier --function router --dry-run` exit 0, no AWS call:
  - classifier: 6 member(s), code_sha256 `BPtnJNIFeWYJx3lq/08+HrmiDzeC3OI3dwWv0b98mxo=`
  - router: 4 member(s), code_sha256 `/YmvAjuu3+dtOkhbXpMJHNPBhFqosNm608d5+UiuJeE=`
  - git_sha at dry run: 1d28afa691d0baf58ddb3cac203f707da4edfbe0 (these hashes are of the tree at that commit; they change if later commits touch package members)
- Stamps validate against `analysis-result.schema.json` for the matching case, the mismatched-model case and the all-null case; a null contract_version with a dataset_version is rejected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated a second package-members test**
- **Found during:** Task 2 full-suite run
- **Issue:** `scripts/tests/test_lambda_packaging.py::test_load_spec_loads_real_classifier_spec_with_region_detection` pins the classifier member set and failed once the spec grew to six members. It was not in the plan's file list but the safety notes anticipated it.
- **Fix:** Updated the expected set to the six members.
- **Files modified:** scripts/tests/test_lambda_packaging.py
- **Commit:** 1d28afa

**2. Test-fixture note (not a code deviation)**
- The existing `classifier_handler` fixture's model config version is `interim-real-only-test`, which (correctly) does not match the bundled stamp's `interim-real-only`. The matching-model end-to-end test therefore builds its own moto stack with the model version taken from `stamp.json`, and the existing fixture is used for the stale-model guard test.

## Expected drift (Pitfall 12)

`scripts/drift-check.py` will report classifier (and router, which now carries the stamp passthrough) as DRIFT from these commits until plan 02-11 deploys them. This is expected. Between commit 97aaafa and 1d28afa, `classifier.json` did not yet bundle the new module; no deploy happened in that window and the final tree is consistent.

## Notes for downstream plans

- 02-10 (UI) should render `contract_version === null` as "pre-contract".
- 02-11 must deploy classifier and router, run the live verifier requiring non-null stamps on a fresh analysis, and confirm `model_version` in the deployed `models/model_config.json` equals `interim-real-only` (otherwise the guard will null the contract fields, by design).
- CONTRACT-04 is intentionally not marked complete: it completes after deploy, UI display and pinning.

## Known Stubs

None.

## Threat Flags

None. The only new surface is four additional response fields on existing routes.

## Self-Check: PASSED

- lambdas/shared/contract_stamp.py, lambdas/shared/tests/test_contract_stamp.py, lambdas/router/tests/test_visualize_stamp.py: present
- Commits 231e3ba, 97aaafa, c762cd0, 1d28afa: present in git log
