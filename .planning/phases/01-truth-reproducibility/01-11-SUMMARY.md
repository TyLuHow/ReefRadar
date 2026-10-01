---
phase: 01-truth-reproducibility
plan: 11
subsystem: ml
tags: [classifier, region-detection, lambda, moto, boto3, numpy, label-provenance, tdd]

# Dependency graph
requires:
  - phase: 01-truth-reproducibility
    provides: "docs/model/deployed-model.lock.json training_sites (plan 01-10 audit) -- the real Indonesia/Kenya training sites this plan's region detection keys on"
  - phase: 01-truth-reproducibility
    provides: "lambdas/shared/site_provenance.py and data/site-label-provenance.json (plan 01-06) -- apply_label_provenance() this plan wires into the classifier"
provides:
  - "lambdas/classifier/region_detection.py: detect_region(lat, lon, training_sites=None)/adjust_classification() with no confidence/probability multiplier -- raw softmax passthrough plus a separate, honest region object"
  - "lambdas/classifier/handler.py: region detection wired to the loaded model's training sites; generate_visualization() removed; similar_sites carry label_source/label_original"
  - "infrastructure/lambda-packages/classifier.json: bundles lambdas/shared/site_provenance.py and data/site-label-provenance.json so the deployed Lambda can resolve the import"
  - "lambdas/classifier/tests/test_handler.py: first end-to-end moto test for the classifier handler (segments -> stubbed inference -> classify -> region -> similar_sites -> DynamoDB RESULT item)"
affects: [01-14, 01-15, 01-16, 01-19]

# Actuals (#2632)
actuals:
  tokens: 12935
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Region bounding boxes carry a geographic-granularity `scope` ('specific'/'broad') separate from training coverage; `in_training_region` is computed by intersecting the matched region's box against a caller-supplied `training_sites` list, never hardcoded per region"
    - "detect_region()/adjust_classification() split: the former computes facts (region, scope, training coverage, caveat text), the latter only attaches those facts to a classification -- it never mutates label/confidence/probabilities, despite the historical function name"
    - "find_similar_sites() routes every reference-site match through the shared apply_label_provenance() (same function the router and fixtures use) before building its response dict, so label_source/label_original can never drift from the single source of truth"
    - "First moto end-to-end Lambda handler test in the repo: S3 segments/weights/config/reference fixtures + a real DynamoDB table + invoke_inference_with_retry monkeypatched (the only true external call) -- a template for 01-14+'s own handler tests"

key-files:
  created:
    - lambdas/classifier/tests/test_handler.py
  modified:
    - lambdas/classifier/region_detection.py
    - lambdas/classifier/handler.py
    - lambdas/classifier/tests/test_region_detection.py
    - infrastructure/lambda-packages/classifier.json
    - scripts/tests/test_lambda_packaging.py

key-decisions:
  - "training_countries is computed once from the full training_sites list (not scoped to the matched region) -- it answers 'what countries did this classifier actually train on', a constant fact useful regardless of where the recording is from, matching the plan's example (['Indonesia', 'Kenya'] for every tested coordinate)"
  - "in_training_region requires BOTH scope=='specific' AND at least one real training site inside the matched box -- a broad ocean-basin match (e.g. Philippines -> Western Indo-Pacific) can never claim training coverage even though training sites technically fall inside that huge box too"
  - "Kept adjust_classification()'s name for call-site compatibility even though it now adjusts nothing -- docstring states this explicitly to prevent future confusion"
  - "model_config.get('training_sites') falls back to DEFAULT_TRAINING_SITES (mirrored from the 01-10 lock file) since the real deployed model_config.json has no training_sites key -- matches the plan's exact call-site text"

requirements-completed: [TRUTH-06, TRUTH-07, TRUTH-09]

coverage:
  - id: D1
    description: "Classifier stores raw softmax probabilities (sum to 1) and confidence equal to the largest raw probability, for every tested coordinate including the former 0.6/0.7-multiplier cases"
    requirement: TRUTH-06
    verification:
      - kind: unit
        ref: "lambdas/classifier/tests/test_region_detection.py (37 tests, incl. test_old_multiplier_behaviour_is_removed)"
        status: pass
      - kind: integration
        ref: "lambdas/classifier/tests/test_handler.py::test_handler_end_to_end_stores_raw_probabilities_and_honest_region, ::test_handler_end_to_end_no_coordinates"
        status: pass
    human_judgment: false
  - id: D2
    description: "Region object is separate from the classification, computed from the classifier's real (audited) training sites -- Indonesia/Kenya only, not the broader 5-country MARRS reference footprint"
    requirement: TRUTH-06
    verification:
      - kind: unit
        ref: "lambdas/classifier/tests/test_region_detection.py::test_south_sulawesi_in_training_region, ::test_kenya_in_training_region, ::test_philippines_resolves_to_broad_region_and_is_outside_training, ::test_caveat_training_countries_are_only_indonesia_and_kenya"
        status: pass
    human_judgment: false
  - id: D3
    description: "The classifier no longer computes or returns the half-vector-mean 'embedding space' coordinates; RESULT item has no visualization key"
    requirement: TRUTH-07
    verification:
      - kind: unit
        ref: "lambdas/classifier/tests/test_handler.py::test_handler_no_visualization_and_similar_sites_carry_label_provenance (asserts 'visualization' not in item and generate_visualization no longer exists on the module)"
        status: pass
    human_judgment: false
  - id: D4
    description: "similar_sites carry dataset label provenance -- no invented health label for non-MARRS sites"
    requirement: TRUTH-09
    verification:
      - kind: unit
        ref: "lambdas/classifier/tests/test_handler.py::test_handler_no_visualization_and_similar_sites_carry_label_provenance (MARRS ind_H4 keeps status healthy/label_source marrs; CoralSoundExplorer borabora_tourist becomes status unknown/label_source coralsoundexplorer/label_original tourist)"
        status: pass
    human_judgment: false
  - id: D5
    description: "classifier.json package spec bundles the shared label-provenance members the handler now imports, ready for 01-14 deploy"
    verification:
      - kind: unit
        ref: "lambdas/classifier/tests/test_handler.py::test_classifier_package_includes_shared_members"
        status: pass
      - kind: other
        ref: "py -3.12 scripts/deploy-lambdas.py --function classifier --dry-run (4-member build succeeds); py -3.12 scripts/drift-check.py --function classifier (exits 1, local now intentionally differs from the still-deployed pre-fix Lambda until 01-14)"
        status: pass
    human_judgment: false

duration: 50min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 11: Classifier Truth Fixes Summary

**Removed the classifier's 0.6/0.7 region confidence multiplier (raw softmax probabilities now pass through unmodified), replaced it with a separate honest region object computed from the real Indonesia/Kenya training sites, deleted the meaningless half-vector "embedding space" visualization, and overlaid real dataset label provenance on similar-site matches.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-10-01 (this session)
- **Completed:** 2026-10-01
- **Tasks:** 2/2
- **Files modified:** 6 (`lambdas/classifier/region_detection.py`, `lambdas/classifier/handler.py`, `lambdas/classifier/tests/test_region_detection.py`, `lambdas/classifier/tests/test_handler.py` [new], `infrastructure/lambda-packages/classifier.json`, `scripts/tests/test_lambda_packaging.py`)

## Accomplishments
- `region_detection.py` rewritten: no `confidence_multiplier` concept anywhere; `DEFAULT_TRAINING_SITES` mirrors the 01-10 audit's 5 real sites (4 Indonesia, 1 Kenya); every `REGION_BOUNDS` entry carries a `scope` ('specific'/'broad') instead of a hardcoded `in_distribution` flag; new specific `INDONESIA` box; `in_training_region` is computed by intersecting the matched region against the actual `training_sites` argument
- `handler.py` wired to call `detect_region(latitude, longitude, training_sites=model_config.get('training_sites') or DEFAULT_TRAINING_SITES)`, matching the plan's response contract
- `test_region_detection.py` fully rewritten (37 tests): inverts the pre-fix 01-01 characterization tests, covers all 7 named coordinate cases plus no-coordinates and invalid/out-of-range inputs (T-01-11-01), and keeps one test (`test_old_multiplier_behaviour_is_removed`) proving the old behaviour is gone
- First end-to-end moto test for the classifier handler (`test_handler.py`): real S3 segments/weights(1280-256-64-3)/config/reference fixtures, a real DynamoDB table, `invoke_inference_with_retry` monkeypatched -- proves `classification.probabilities` sum to 1 and `classification.region` is honest, through the real `handler.handler()` code path
- `generate_visualization()` deleted entirely; RESULT item no longer writes a `visualization` key (legacy UI already renders "No visualization data available" when absent -- confirmed by reading `EmbeddingChart.tsx` and `types/index.ts` before making the change)
- `find_similar_sites()` now routes every match through the shared `apply_label_provenance()`; added `get_label_provenance()` module-level cache mirroring the existing `_reference_embeddings` caching idiom
- `infrastructure/lambda-packages/classifier.json` bundles `lambdas/shared/site_provenance.py` and `data/site-label-provenance.json` as `site_provenance.py`/`site_label_provenance.json`
- Verified against the real deployed Lambda: `scripts/deploy-lambdas.py --function classifier --dry-run` builds a clean 4-member package; `scripts/drift-check.py --function classifier` (live, profile `reefradar`) exits 1 as expected -- local code now intentionally differs from the still-deployed pre-fix classifier until plan 01-14 deploys it

## Task Commits

1. **Task 1 (tracer, TDD): region detection honest-region fix, end-to-end handler test** - `0811fee` (feat)
2. **Task 2: remove fake visualization, add label provenance, bundle shared package members** - `7b95cbe` (feat)

**Plan metadata:** this commit.

Tracer feedback gate: ran Task 1's full `<verify>` (`py -3.12 -m pytest lambdas/classifier -x`, 43 tests) plus all four acceptance-criteria greps immediately after committing Task 1 (autonomous run) -- all green, so Task 2 proceeded without a checkpoint.

## Files Created/Modified
- `lambdas/classifier/region_detection.py` - multiplier removed; `DEFAULT_TRAINING_SITES`, `scope`, `INDONESIA` box, three honest caveat templates, `detect_region(lat, lon, training_sites=None)`
- `lambdas/classifier/handler.py` - region detection wired to real training sites; `generate_visualization()` and the `visualization` result field deleted; `find_similar_sites()` overlays label provenance via `apply_label_provenance()`
- `lambdas/classifier/tests/test_region_detection.py` - full rewrite, 37 tests
- `lambdas/classifier/tests/test_handler.py` - new, 5 tests (2 end-to-end handler, 1 visualization/provenance, 1 packaging, plus fixtures)
- `infrastructure/lambda-packages/classifier.json` - 2 new bundled members
- `scripts/tests/test_lambda_packaging.py` - updated pre-existing real-spec assertion for the 2 new members

## Decisions Made
- `training_countries` is a global property of the `training_sites` list passed in, not scoped to the matched region -- matches the plan's stated example exactly and keeps the field meaningful even in the no-coordinates/outside-region cases
- `in_training_region` gates on `scope == 'specific'` in addition to site intersection, so a huge ocean-basin match can never falsely claim training coverage
- Kept `adjust_classification()`'s name (call-site compatibility with `handler.py`) despite it no longer adjusting anything; documented the no-op in its docstring

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated a pre-existing stale assertion in `scripts/tests/test_lambda_packaging.py`**
- **Found during:** Task 2 verify (`py -3.12 -m pytest lambdas/classifier scripts/tests -x`)
- **Issue:** `test_load_spec_loads_real_classifier_spec_with_region_detection` asserted the real `classifier.json`'s archive paths equal exactly `{"handler.py", "region_detection.py"}`. This plan's own Task 2 change (bundling `site_provenance.py`/`site_label_provenance.json`) made that assertion stale by design.
- **Fix:** Updated the assertion to the new 4-member set, with a comment explaining why.
- **Files modified:** `scripts/tests/test_lambda_packaging.py`
- **Verification:** `py -3.12 -m pytest lambdas/classifier scripts/tests -x` exits 0 (126 tests)
- **Committed in:** `7b95cbe` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug/correctness -- a pre-existing test made stale by this plan's own in-scope change)
**Impact on plan:** No scope creep; the fix is directly caused by this plan's Task 2 change to the classifier package spec.

## Issues Encountered
- Windows path resolution: `/tmp/reef_classifier_weights.npz` (handler.py's model cache path) resolves to `C:\tmp\...` on Windows, which doesn't exist by default. Handled in `test_handler.py`'s fixture by `os.makedirs("/tmp", exist_ok=True)` plus clearing any stale cache file before each test -- a test-environment concern only, no production code change.
- An early version of a region-detection test incorrectly asserted the detected-region *name* (e.g. "Maldives") could never appear in an out-of-training-region caveat; corrected to check the `training_countries` field directly, since naming the detected location in a "this is outside training coverage" caveat is the correct, intended behavior.

## User Setup Required
None - used the owner's standing AWS profile `reefradar` (read-only, already confirmed working in plan 01-09) for the live `drift-check.py` verification; no AWS mutations were made (dry-run only for deploy-lambdas.py).

## Next Phase Readiness
- **Plan 01-14** (deploy): `classifier.json` is ready to build and deploy exactly as specified by this plan's response contract; `drift-check.py` currently (correctly) reports drift until that deploy happens.
- **Plan 01-15** (UI): the region response contract (`region: {detected, name, scope, coordinates_provided, in_training_region, training_sites_in_region, training_countries, in_training_distribution, confidence_adjusted}`) and `similar_sites[].{label_source, label_original}` are stable and ready to consume; legacy `in_training_distribution`/`confidence_adjusted` fields are preserved for the current production frontend.
- No blockers for any dependent plan.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All 6 created/modified files found on disk (`lambdas/classifier/region_detection.py`, `lambdas/classifier/handler.py`, `lambdas/classifier/tests/test_region_detection.py`, `lambdas/classifier/tests/test_handler.py`, `infrastructure/lambda-packages/classifier.json`, `scripts/tests/test_lambda_packaging.py`); all 3 commits (`0811fee`, `7b95cbe`, `dc301d0`) found in git history.
