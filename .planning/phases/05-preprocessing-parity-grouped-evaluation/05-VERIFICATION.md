---
phase: 05-preprocessing-parity-grouped-evaluation
verified: 2026-10-16T20:30:00Z
status: human_needed
score: 4/4 roadmap success criteria verified (plan must-haves for 05-01 to 05-17 also verified; 2 plan-deferred human checks open)
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Every offline embedding job uses reef_audio (the older generators scripts/generate_marrs_embeddings.py, generate_site_embeddings.py, generate_training_embeddings.py, expand_reference_sites.py and add_restored_mid_and_retrain.py still carry their own np.interp / file-peak preprocessing)"
    addressed_in: "Phase 11"
    evidence: "Phase 11 SC2: 'All ingested audio is windowed and embedded through `reef_audio` for each candidate embedding model'; F8d open in contracts/bucket/v2/preprocessing_spec.json"
  - truth: "Classifier memory (512 MB) and timeout (120 s) are sized for a 120-window (600 s) upload"
    addressed_in: "Phase 10"
    evidence: "Phase 10 SC3: 'server-enforced size and duration caps'; recorded in deferred-items.md"
  - truth: "Inference container pinned (tensorflow-cpu floor only; MODEL_HANDLE is the 4-component handle, not the pinned google/surfperch/tensorFlow2/1/1)"
    addressed_in: "Phase 11"
    evidence: "Gap F8-inference-container (owner Phase 11) in contracts/bucket/v2/preprocessing_spec.json; deferred-items.md"
human_verification:
  - test: "Open the production legacy UI (main branch) and analyse one gallery sample, or open a result from today's verify_live_truth analyses (e.g. 3f0b40c6-a455-461d-8a24-29a646296cc3)"
    expected: "The results view renders as before: label, percentages summing to 100, top-3 similar sites, region note, no embedding-space scatter; only the values differ"
    why_human: "The legacy production UI on main is not under this branch's automated visual tests; 05-17-SUMMARY records this check as open"
  - test: "Read models/interim-real-only/evaluation/REPORT.md top to bottom"
    expected: "A non-specialist can tell which model is served, how it performed on held-out sites with intervals, that restored_early and Kenya could not be assessed, and why the old 100% and 90% figures are withdrawn; nothing overstates the result"
    why_human: "Plain-language honesty and tone (05-13 plan human-check); the owner reviewed the numbers at the 05-16 publish checkpoint but no record shows the document read-through"
---

# Phase 5: Preprocessing Parity & Grouped Evaluation Verification Report

**Phase Goal:** Offline jobs and the live analysis path share one preprocessing library, the live pipeline reads every 5 s window honestly with full similarity and OOD context, and the current model has honest grouped metrics.
**Verified:** 2026-10-16 (HEAD `d40ceb1`, branch `redesign/v2-discovery`)
**Status:** human_needed
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | One shared `reef_audio` library (anti-aliased resampling, consistent normalisation, 5 s windowing) is imported by the live Preprocessor/Classifier Lambdas and offline jobs, and a parity test shows identical windows and embeddings through both paths | ✓ VERIFIED | `lambdas/shared/reef_audio.py` (704 lines): scipy-default Kaiser polyphase resampler, per-window DC removal + peak 0.25, 5 s / 160,000-sample windows, `SPEC_VERSION = "preproc-2026.10.1-reef-audio"`. Imported by `lambdas/preprocessor/handler.py` (no local DSP left; it calls `reef_audio.audio_to_windows`), `lambdas/classifier/handler.py`, `contract_stamp.py`, and offline `scripts/reembed_training.py`, `record_embedding_fixture.py`, `build_ood_reference.py`, `build_contract.py`. Bundled flat in both zip specs (`infrastructure/lambda-packages/preprocessor.json`, `classifier.json`). Windows: `lambdas/preprocessor/tests/test_parity.py` runs the live handler under moto on 9 real excerpts + 5 generated encodings and asserts `np.array_equal` and byte-equal segments (passed). Embeddings: `test_embedding_fixture.py` (fixture windows equal current reef_audio, passed); independently, the live result `3f0b40c6` per-window probabilities, similarities and OOD distances recompute from the offline fixture rows to 6.7e-8 / 5.0e-10 / 4.9e-10 (run by the verifier), consistent with DEPLOY-LOG's recorded `verify_live_embeddings.py` min cosine 1.0, max abs 0.0 |
| 2 | Every new analysis classifies each 5 s window individually (never a mean-pooled embedding) and persists per-window probabilities and similarities, stamped with pinned dataset, model and preprocessing versions | ✓ VERIFIED | `classify_windows` (batched forward pass over n windows) + `aggregate_classification` (mean of per-window probability vectors), `embedding_summary.aggregation = mean_of_window_probabilities`; `build_windows_block` stores per-window probabilities, labels, levels, similarities, nearest_site in the RESULT item; embeddings to `processed/{id}/embeddings.f32`. Stamp via `stamp_for_model`, which now also requires `reef_audio.SPEC_VERSION` and the windows' spec to equal the stamp. Tests passed: `test_window_no_mean_pooled_embedding_is_classified`, `test_window_probabilities_and_recording_mean`, `test_stamp_covered_requires_spec_match`, `test_segment_format_legacy_json_refused`, packaged-as-deployed `test_package_as_deployed_produces_v2_stamped_full_result`. Live GET of `3f0b40c6`: 6 windows, row sums 1.0, column mean equals `classification.probabilities`, stamp v2 / `reefradar-reference-2026.10.0` / `interim-real-only-2026.10.1` / `preproc-2026.10.1-reef-audio`, `stamp_status: stamped` |
| 3 | Every analysis returns similarity to all reference sites (not only top-3), projection coordinates with explained variance, and an OOD status from distance to training data reported separately from class probabilities | ✓ VERIFIED | `build_site_similarities` (48 scored sites in contract row order + 6 location-only with `has_embedding: false`), `top3_similar_sites` (legacy shape, derived from the same scores), `build_projection_block` (contract PCA basis, `explained_variance_ratio`, per-window points, centroid, note), `build_ood_block` (k=1 cosine distance to 100 re-embedded training windows, threshold 0.3519 returned with every result, "k of n windows outside"). Computed after classification; never fed back (`test_ood_unavailable_probabilities_identical` passed). Reference/OOD data bundled and sha256-verified against the v2 manifest (`reef_reference.py`); S3 `metadata_v6.json` read and `status_map` gone (grep: 0 hits). Router `/visualize` whitelist `NEW_RESULT_KEYS` is additive; legacy items keep 13 keys. Live GET: 54 sites (48 with embedding), top-3 equals ranks 1-3, EVR [0.1831, 0.1468], OOD "0 of 6 windows are outside the training data"; legacy `8ebcf44d` returns its 13 keys only |
| 4 | A leave-one-site-out harness reports per-class and per-region metrics with bootstrap CIs, stored as a versioned artifact for the model card | ✓ VERIFIED | `scripts/evaluate_loso.py`; `models/interim-real-only/evaluation/report.json` (`loso-2026.10.1`) + rendered `REPORT.md`: per-class recall (degraded, healthy; restored_early "not evaluable"), per-country accuracy (Indonesia CI, Kenya "CI not estimable (1 site)"), balanced accuracy, two-level cluster bootstrap B=10,000, seed 20261011, RandomState, inputs pinned by sha256, for both the original and served model; withdrawn 100% / 90% figures. Published byte-identical as `v2/evaluation_report.json` (sha256 `bc0482ba...` both locally and in DEPLOY-LOG) and referenced from `v2/model_version.json` `evaluation.report_sha256`. the LOSO tests in `scripts/tests/test_loso_eval.py` (24 test functions, some parametrised) passed, including `test_report_reproduces_metrics_from_predictions` and `test_bootstrap_committed_inputs_full_b` |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

Plan-level must-haves (05-01 to 05-17) were checked against code and tests and hold: binary-safe packaging (`BINARY_SUFFIXES` in `lambda_packaging.py`), sentinel fixture v99, contract v2 schemas + Zod mirror (`check_contract.py --check --additive` OK), successor model with `training.preprocessing_spec_version`, OOD calibration, contract v2 published (`verify_contract_live.py --expect-latest 2` exit 0, 95 PASS, 3 known report-only CORS WARN), and production deploy (`drift-check.py --function all` all MATCH against HEAD).

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Legacy offline embedding generators still use their own np.interp / file-peak preprocessing (not reef_audio) | Phase 11 | SC2 "All ingested audio is windowed and embedded through `reef_audio`"; gap F8d |
| 2 | Classifier memory/timeout for 120-window uploads | Phase 10 | SC3 server-enforced caps; deferred-items.md |
| 3 | Inference container unpinned (TF floor, 4-component handle, dead fallbacks) | Phase 11 | gap F8-inference-container |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lambdas/shared/reef_audio.py` | shared preprocessing | ✓ VERIFIED | 704 lines, stdlib+NumPy, imported by both Lambdas and 5 offline scripts |
| `lambdas/shared/reef_reference.py` | bundled, hash-verified reference/model/OOD loader | ✓ VERIFIED | used by classifier `get_served_model`, `get_reference_set`, `get_ood_reference` |
| `lambdas/preprocessor/handler.py` | thin reef_audio wrapper, binary segments + sidecar | ✓ VERIFIED | 158 lines |
| `lambdas/classifier/handler.py` | per-window classification, similarity, projection, OOD | ✓ VERIFIED | wired in `handler()` lines 174-263 |
| `lambdas/router/handler.py` | additive `/visualize` whitelist | ✓ VERIFIED | `NEW_RESULT_KEYS` loop |
| `models/interim-real-only-2026.10.1/*` | successor model trained on reef_audio windows | ✓ VERIFIED | bundled in classifier zip; archived to S3 per DEPLOY-LOG |
| `models/interim-real-only/evaluation/{report.json,REPORT.md,inputs/}` | versioned LOSO report | ✓ VERIFIED | sha256 equals published `v2/evaluation_report.json` |
| `contracts/bucket/v2/*`, `contracts/bucket/contract/v2.json` | contract v2 | ✓ VERIFIED | published (PUBLISHED.json v2, live verification exit 0) |
| `infrastructure/lambda-packages/{classifier,preprocessor}.json` | reef_audio + data bundled | ✓ VERIFIED | 14 and 2 members |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| preprocessor | reef_audio | `reef_audio.audio_to_windows`, `encode_segments`, `build_sidecar` | WIRED | parity test under moto |
| preprocessor | classifier | async invoke with `segments_key`, `segments_format: f32le`, `preprocessing_key` | WIRED | `read_segment_info` verifies sidecar, count, sha256 |
| classifier | served model | `reef_reference.load_served_model` (weights sha256 vs config) | WIRED | spec mismatch refused before inference |
| classifier | reference set / OOD | `load_reference_set`, `load_ood_reference` against bundled v2 manifest | WIRED | tamper tests omit the block, keep the analysis |
| classifier RESULT | router `/visualize` | DynamoDB item, `NEW_RESULT_KEYS` | WIRED | live GET returns all five new keys |
| stamp | contract v2 | bundled `contract_stamp.json` = `v2/stamp.json` | WIRED | live `stamp_status: stamped` |
| model_version.json | evaluation report | `evaluation.report_sha256` | WIRED | hashes equal |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| RESULT `windows.probabilities` | `window_probs` | SurfPerch embeddings from inference Lambda -> served MLP | Yes (live recomputation matches to 6.7e-8) | ✓ FLOWING |
| RESULT `site_similarities` / `windows.similarities` | `S` | bundled v1 `embeddings.f32` | Yes (matches to 5e-10) | ✓ FLOWING |
| RESULT `ood` | `distance` | bundled `ood_reference.f32` (100 re-embedded training windows) | Yes (matches to 4.9e-10) | ✓ FLOWING |
| RESULT `projection` | `points` | bundled `projection.json` basis | Yes (EVR [0.1831, 0.1468]) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full Python suite | `py -3.12 -m pytest` (once, `-m "not live"`) | completed, no failures recorded (lastfailed cache untouched) | ✓ PASS |
| Parity, per-window, stamp, router tests | `pytest test_parity.py test_embedding_fixture.py test_bundled_e2e.py test_window_context.py test_contract_stamp.py test_visualize_stamp.py` | 60 passed | ✓ PASS |
| reef_audio, LOSO, packaging, OOD tests | `pytest test_reef_audio.py test_loso_eval.py test_lambda_packaging.py test_build_ood_reference.py` | 163 passed | ✓ PASS |
| Contract consistency | `check_contract.py --check --additive`; `--published-history`; `build_contract.py --version 1/2 --check` | all OK | ✓ PASS |
| Contract live | `verify_contract_live.py --expect-latest 2` | exit 0, 95 PASS, 3 known WARN | ✓ PASS |
| Deployed code = HEAD | `drift-check.py --function all` | router, preprocessor, classifier, inference MATCH, exit 0 | ✓ PASS |
| Live result shape (read-only GET) | `GET /visualize/3f0b40c6-...`, `GET /visualize/8ebcf44d-...` | new keys + v2 stamp; legacy item 13 keys | ✓ PASS |
| CI | `gh run view 38954731500`; latest run on `d40ceb1` | success (python, web, e2e, visual, citations) | ✓ PASS |

### Probe Execution

Step 7c: no `scripts/*/tests/probe-*.sh` exist and no plan declares one. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ML-01 | 05-02, 05-05, 05-07, 05-08, 05-11, 05-15 | shared preprocessing library, train/serve parity | ✓ SATISFIED | SC1 |
| ML-02 | 05-09, 05-15, 05-17 | per-window classification, persisted per-window data | ✓ SATISFIED | SC2 |
| ML-03 | 05-04, 05-13 | LOSO with bootstrap CIs per class and region | ✓ SATISFIED | SC4 |
| ML-06 | 05-10, 05-12 | OOD from distance to training data, separate from probabilities | ✓ SATISFIED | SC3 |
| ML-08 | 05-10 | similarity to all sites + projection with explained variance | ✓ SATISFIED | SC3 |

No orphaned requirements. Bookkeeping: `.planning/REQUIREMENTS.md` still lists ML-01/02/03/06/08 as `[ ]` / Pending; update when the phase is closed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| phase-modified lambdas and scripts | - | TBD / FIXME / XXX | none found | - |
| `lambdas/classifier/handler.py` | 261, 378 | `datetime.utcnow()` (DeprecationWarning) | ℹ️ Info | pre-existing style, no effect on Python 3.11/3.12 |

### Human Verification Required

### 1. Legacy production UI renders the new results unchanged

**Test:** Open the production legacy UI (main branch) and analyse one gallery sample, or open a result from today's analyses (e.g. `3f0b40c6-a455-461d-8a24-29a646296cc3`).
**Expected:** Label, percentages summing to 100, top-3 similar sites, region note, no embedding-space scatter; only the values differ from before.
**Why human:** The legacy UI on `main` is outside this branch's visual tests; 05-17-SUMMARY lists the check as open. The API-level shape was verified (legacy keys present, `visualization` empty).

### 2. Evaluation report reads honestly to a non-specialist

**Test:** Read `models/interim-real-only/evaluation/REPORT.md` top to bottom.
**Expected:** The served model, its held-out result with intervals, the non-evaluable restored_early and Kenya cases and the withdrawn 100% / 90% figures are all clear, and nothing overstates the result.
**Why human:** Tone and plain-language honesty (05-13 plan human-check). The verifier's reading found it accurate and plainly worded (it states the served model "cannot be told apart from chance"), but the plan reserves this judgment for the owner.

### Gaps Summary

No gaps. All four roadmap success criteria and the five requirement IDs are met in code, tests, the published contract and production. Deployed code matches HEAD, and a live result reproduces from the offline fixture embeddings. Two plan-deferred human checks remain open (the legacy production UI and the report read-through), so the status is human_needed.

Notes for the owner, not gaps:
- The live ind_H1 excerpt (a healthy reference site) is classified `degraded` at 0.93 with 0 of 6 windows out of distribution. This matches the published LOSO result: balanced accuracy 0.44, with an interval that includes chance. The phase goal is honest metrics, not a better model; Phase 12 owns model quality.
- The legacy UI's model-card copy still names the predecessor model; that is deferred to Phase 13 (deferred-items.md).

---

_Verified: 2026-10-16_
_Verifier: Claude (gsd-verifier)_
