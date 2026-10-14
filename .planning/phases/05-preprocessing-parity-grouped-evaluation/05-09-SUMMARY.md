---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 09
subsystem: classifier
tags: [per-window, classifier, served-model, parity, stamp, visualize, moto]
status: complete

requires:
  - phase: 05-05
    provides: segment transport (encode/decode_segments, sidecar), SPEC_VERSION
  - phase: 05-06
    provides: additive analysis-result keys (windows, input_audio) and their field names
provides:
  - per-window classifier (ranged binary reads, sha256 verified, alignment-checked embeddings)
  - reef_reference served-model loader (bundled-first, sha256 verified, no pickle)
  - stamp_for_model requiring reef_audio.SPEC_VERSION and the windows' spec
  - additive /visualize keys with integral numbers as ints
affects: [05-10, 05-15, 05-17]

actuals:
  tokens: 90000
  tasks: 3
  commits: 5

key-files:
  created:
    - lambdas/shared/reef_reference.py
    - lambdas/shared/tests/test_reef_reference.py
  modified:
    - lambdas/classifier/handler.py
    - lambdas/classifier/tests/test_handler.py
    - lambdas/shared/contract_stamp.py
    - lambdas/shared/tests/test_contract_stamp.py
    - lambdas/router/handler.py
    - lambdas/router/tests/test_visualize_stamp.py
    - lambdas/conftest.py
    - infrastructure/lambda-packages/classifier.json
    - scripts/tests/test_lambda_packaging.py
    - scripts/tests/test_train_interim_real_only.py

key-decisions:
  - "Legacy JSON segments are read and identified, then refused with PREPROCESSING_SPEC_MISMATCH (stage classification); nothing is classified under a mismatched spec"
  - "The served model is bundled with the classifier (served_model_config.json and served_model_weights.npz, sha256 checked) and never read from S3 models/"
  - "A training spec is read from config preprocessing_spec_version, or training.preprocessing_spec_version (05-06 schema name), whichever is present"
  - "Integral Decimals in the additive /visualize blocks become JSON integers, so start_s and window_s print as 5 rather than 5.0 (same JSON number)"

requirements-completed: [ML-02]
---

# Phase 5 Plan 09: Per-window classifier, served-model parity and additive /visualize Summary

**The classifier now embeds and classifies every 5 s window on its own, aggregates the recording as the mean of the window probability vectors into the unchanged legacy `classification`, serves a hash-verified model bundled with the code, and /visualize returns `windows` and `input_audio` additively while a legacy item keeps exactly its 13 keys.**

## What was built

- **Task 1 (tracer):** binary segments from the real 30 s MARRS excerpt (6 windows) run end to end under moto (stubbed inference Lambda): ranged GETs of at most 10 windows, one inference call per batch, per-window softmax (float64), `aggregate_classification` (column means, argmax label, max confidence, keys label/confidence/probabilities/model_version plus region), `windows` and `input_audio` blocks (both validated against the 05-06 `$defs`), and `processed/{id}/embeddings.f32` (6 x 1280 little-endian float32, equal to the stub's vectors). `embedding_summary.aggregation` is `mean_of_window_probabilities`. `convert_floats` converts NumPy types and raises ValueError on NaN or infinity. `find_similar_sites_with_status` takes the window matrix and scores by the mean of per-window cosines (still the S3 reference source; 05-10 moves it to bundled data). `load_classifier_model` and the S3 model hot reload are gone.
- **Task 2:** a segments object without `segments_format` is parsed as legacy JSON, identified as `preproc-2026.10.0-as-deployed` and refused before any inference (PREPROCESSING_SPEC_MISMATCH, suggestion telling the user to start the analysis again); the same refusal applies when a binary sidecar spec differs from the model's training spec. Byte length, sidecar count, per-range length and incremental sha256 are checked (SEGMENTS_INTEGRITY). Inference responses with the wrong count, a wrong row length or a non-finite value raise EMBEDDING_MISMATCH at stage inference, not retried. `stamp_for_model(model, stamp, windows_spec_version=None)` requires `reef_audio.SPEC_VERSION == stamp.preprocessing_spec_version` (and the windows' spec); the committed v1 stamp therefore reports `uncovered` and prints the UnstampedResults metric line.
- **Task 3:** `handle_visualize` keeps its body and appends `windows`, `site_similarities`, `projection`, `ood`, `input_audio` only when present, through `_plain_numbers`. `visualization` stays `{}`. classifier.json gains `reef_audio.py` and `reef_reference.py`.

## Verification

- Task 1 verify (`-k "window or served_model or validate or convert"`) and the whole classifier, shared and router test sets pass; acceptance greps: mean_of_window_probabilities 1, def load_classifier_model 0, allow_pickle=False 2, 'embedding_model': 'surfperch' 1, PREPROCESSING_SPEC_MISMATCH 4, EMBEDDING_MISMATCH 5, windows_spec_version in contract_stamp 3, input_audio in router at least 1, reef_reference.py in classifier.json 1.
- Task 3 verify (`pytest lambdas/router/tests scripts/tests/test_lambda_packaging.py lambdas/classifier/tests`): pass.
- Full `py -3.12 -m pytest` (log tail only): everything passes except the known CRLF-noise `test_regenerating_manifest_is_idempotent`, which I deselected on the final run; its side effects (`data/audio-manifest.json`, two dashboard fixtures) were restored with `git checkout --` and never committed.
- `py -3.12 scripts/deploy-lambdas.py --function classifier --function router --dry-run`: exit 0, no AWS call; classifier 8 members, router 4. The classifier package has no binary members yet (the contract data members arrive in 05-15, which owns the byte-equality test; 05-01's binary-safe packaging already covers them), so there was nothing binary to compare in this plan.

## Deviations from Plan

**1. [Ordering] One feat commit for Tasks 1 and 2.** The handler, loader, stamp guard and their tests are interleaved (the handler passes `windows_spec_version` to the stamp function), so a Task 1 only commit would not run. The single RED commit d2866af holds the tests for both, then 032ddfb is the combined GREEN.

**2. [Rule 3 - Blocking] Shared test helpers in `lambdas/conftest.py`** (served model writer, FakeInferenceLambda, real-excerpt segments writer) so the classifier and router tests share them; conftest.py is not in the plan's file list.

**3. [Rule 3 - Blocking] `scripts/tests/test_train_interim_real_only.py::test_forward_pass_matches_deployed_classifier`** set the removed `_model_weights` globals; it now passes the model explicitly and additionally checks `classify_windows` against the trainer (commit ce809b1).

**4. [Design] The S3 hot-reload test is gone** because the model now ships with the code (drift-checked, D-03); a model change is a deploy and rollback is `deploy-lambdas.py --ref`. It is replaced by the reef_reference tests (bundled-first, sha mismatch, missing spec version or hash, shape mismatch, no pickle) and a classifier test proving an S3 decoy model is ignored.

**5. [Design] `read_segment_info(event)` was added** next to `read_segment_batches(event, info=None)` so the spec check and sidecar verification happen before any inference call.

**6. `models/interim-real-only-2026.10.1/` does not exist yet** (the successor model is a later plan); `load_served_model` falls back to it and raises ReferenceDataError if it is absent, so a classifier deployed before the model is bundled fails loudly rather than serving something else. Tests use a tmp bundled model.

## Notes for later plans

- 120-window (600 s) timing in the 512 MB / 120 s classifier is a Phase 10 prerequisite (upload cap); Lambda memory, timeout and environment were not changed. Each 10-window batch stages about 30 MB of JSON; the memory use at the cap has not been measured.
- 05-15 must bundle the v2 stamp and the served model files, and add binary members to classifier.json (the v1 stamp no longer covers new results).
- The tests each take about 3 s because of the 6-window JSON batches.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register; T-05-09-01 to T-05-09-06 are mitigated and tested (segment hash and length, spec parity refusal, embedding alignment, DynamoDB-safe types, bundled weights sha256 with allow_pickle=False, /visualize whitelist).

## Self-Check: PASSED

- lambdas/shared/reef_reference.py, lambdas/shared/tests/test_reef_reference.py present
- commits d2866af, 032ddfb, 11738ed, ce809b1 present on the branch
