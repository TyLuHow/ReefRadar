---
phase: 01-truth-reproducibility
plan: 13
subsystem: ml
tags: [numpy, mlp, classifier, model-card, interim-model, truth]

# Dependency graph
requires:
  - phase: 01-truth-reproducibility
    provides: "docs/model/DEPLOYED-MODEL-AUDIT.md and docs/model/deployed-model.lock.json (plan 01-10) -- interim_required: true, interim_classes: [degraded, healthy, restored_early], training_sites"
provides:
  - "scripts/train_interim_real_only.py: dependency-free NumPy MLP trainer (Glorot init, Adam, mini-batch 32, early stopping) reproducing the deployed v2.0 architecture, with filter_real_rows() dropping any _synthetic_ file_id row"
  - "models/interim-real-only/{model_config.json,reef_classifier_weights.npz,TRAINING-REPORT.md}: a 3-class real-only model trained on the 100 real rows in training_test_20.json, versioned interim-real-only, with the random-split/site-leakage caveat disclosed in both files"
  - "dashboard-next/src/data/model-card.json: model facts (version, classes, training rows/sites/countries, evaluation caveat, synthetic-data history) for the legacy UI's model-related copy"
affects: ["01-14", "01-15", "01-19"]

# Actuals (#2632)
actuals:
  tokens: 8700
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Pure-NumPy MLP trainer with a shared forward_pass()/predict_proba() used both for training and for the parity test against the deployed classifier's own classify_embedding() -- the same function is never reimplemented a second way, so the parity proof can't silently drift from the trainer"
    - "load_lambda() (lambdas/conftest.py) loaded by path from scripts/tests/ via importlib, mirroring scripts/tests/conftest.py's own load_script() pattern, to reuse the project's existing hyphenated/duplicate-module-name loading convention across the lambdas/scripts boundary without adding lambdas to pytest's pythonpath"
    - "Classes dropped from a model are computed against the deployed model's full class set (docs/model/deployed-model.lock.json artifacts.idx_to_label), not against whatever labels happen to appear in the training file passed in -- a class with zero real rows anywhere would otherwise never appear in the training file at all and the drop would go undetected"

key-files:
  created:
    - scripts/train_interim_real_only.py
    - scripts/tests/test_train_interim_real_only.py
    - scripts/build_model_card.py
    - models/interim-real-only/model_config.json
    - models/interim-real-only/reef_classifier_weights.npz
    - models/interim-real-only/TRAINING-REPORT.md
    - dashboard-next/src/data/model-card.json
  modified: []

key-decisions:
  - "Followed the audit's own conclusion (DEPLOYED-MODEL-AUDIT.md section 4) and trained on only training_test_20.json's 100 real rows -- test_embeddings.json (the pre-existing 25-row held-out test split from the same 5 sites) was left out of training to avoid folding the original test set into the new training set"
  - "source_training_files' S3-style key is derived as training/<basename> (matching the lock file's key convention) since the trainer only has the local data/training/ path, not the original S3 key"
  - "model-card.json's synthetic_history field always points to docs/model/DEPLOYED-MODEL-AUDIT.md rather than repeating the full incident narrative, so the UI's one-sentence summary can't drift from the canonical audit document"

patterns-established:
  - "Interim/retrained models live under models/<version>/ (not the flat models/ directory the deployed model uses) so .gitignore's models/*.json and models/*.npz (anchored to direct children only) doesn't need touching and the new artifacts are tracked by git as the auditable, reproducible source of truth"

requirements-completed: [TRUTH-05]

coverage:
  - id: D1
    description: "A dependency-free (no sklearn/torch) NumPy MLP trainer exists, matching the deployed architecture, whose output weights run through the deployed classifier's own forward pass with probabilities equal within 1e-6"
    requirement: TRUTH-05
    verification:
      - kind: unit
        ref: "scripts/tests/test_train_interim_real_only.py::test_forward_pass_matches_deployed_classifier"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_train_interim_real_only.py::test_train_mlp_toy_data_reaches_high_accuracy, ::test_same_seed_produces_byte_identical_npz, ::test_filter_real_rows_drops_synthetic_and_counts, ::test_stratified_split_is_seeded_and_deterministic"
        status: pass
    human_judgment: false
  - id: D2
    description: "The interim real-only model is trained on the audit's real rows only (3-class: degraded, healthy, restored_early), with restored_mid dropped and that drop disclosed, and its limited (leaky) evaluation disclosed in both model_config.json and TRAINING-REPORT.md"
    requirement: TRUTH-05
    verification:
      - kind: other
        ref: "py -3.12 scripts/train_interim_real_only.py --training data/training/training_test_20.json --lock docs/model/deployed-model.lock.json --out models/interim-real-only --seed 42 (produces model_config.json num_classes=3, synthetic_rows_excluded=0, split_accuracy=1.0 on 15-row held-out test; TRAINING-REPORT.md 'Consequence for the UI' names restored_mid as dropped)"
        status: pass
      - kind: other
        ref: "grep -c \"not an estimate of performance on new sites\" models/interim-real-only/TRAINING-REPORT.md models/interim-real-only/model_config.json (both 1, total 2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "dashboard-next/src/data/model-card.json states the live (soon-to-be-live) model's version, classes, training sites/countries, evaluation caveat and synthetic-data history for the legacy UI"
    requirement: TRUTH-05
    verification:
      - kind: other
        ref: "py -3.12 scripts/build_model_card.py && model-card.json model_version == 'interim-real-only' == bool(lock.interim_required)"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 13: Interim Real-Only Classifier + Model Card Summary

**Trained a 3-class interim-real-only MLP (degraded, healthy, restored_early) on the 100 real training rows the 01-10 audit verified, dropping the synthetic-only restored_mid class, using a new dependency-free NumPy trainer whose weights are proven byte-compatible with the deployed classifier's own forward pass; wrote the UI's model-card.json from it.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-10-01 (this session)
- **Completed:** 2026-10-01
- **Tasks:** 2/2
- **Files modified:** 7

## Accomplishments
- `scripts/train_interim_real_only.py`: a pure-NumPy MLP trainer (Glorot-uniform init, ReLU, Adam lr=0.001/beta1=0.9/beta2=0.999, mini-batch 32, L2 alpha=0.001, seeded stratified 15% validation split for early stopping with patience 15/tol 1e-4, max 200 epochs) reproducing exactly the sklearn `MLPClassifier` settings `scripts/add_restored_mid_and_retrain.py` used for v2.0 -- no new dependency, since scikit-learn/PyTorch are not installed and adding either would need a new legitimacy review
- `filter_real_rows()` drops any row whose `file_id` contains `_synthetic_` and reports excluded counts per label (0 excluded here -- the synthetic `restored_mid` rows were never uploaded to S3 or downloaded locally, per the audit)
- Parity proof: `classifier._model_weights`/`_model_config` patched with the trainer's own weights, then `lambdas/classifier/handler.py:classify_embedding()` compared against the trainer's `predict_proba()` for 20 random 1280-d inputs -- identical within 1e-6, proving the interim weights are servable by the existing, unmodified classifier code
- Trained the interim model on the real rows of `data/training/training_test_20.json` (100 rows, 5 sites: `ind_D2`, `ind_D3`, `ind_H4`, `ind_N1`, `ken_H1`; Indonesia + Kenya) per the audit's own conclusion -- 3 classes (`degraded` 40, `healthy` 40, `restored_early` 20), `split_accuracy: 1.0` on a 15-row held-out stratified split (seed 42), with the leakage caveat recorded verbatim in both `model_config.json.evaluation_note` and `TRAINING-REPORT.md`
- `models/interim-real-only/TRAINING-REPORT.md` documents why `restored_mid` was dropped, rows per class/site, the split accuracy with its caveat, and the UI consequence ("must not render probabilities for restored_mid from this model")
- `scripts/build_model_card.py` writes `dashboard-next/src/data/model-card.json` from the interim config (falls back to the deployed-model lock if no interim retrain were required) -- `model_version: "interim-real-only"`, 3 classes, 100 training rows, 5 sites, 2 countries, the evaluation caveat, and a one-sentence synthetic-data-history note pointing at `docs/model/DEPLOYED-MODEL-AUDIT.md`
- Confirmed `models/interim-real-only/*.json` and `*.npz` are tracked (not gitignored) -- `.gitignore`'s `models/*.json`/`models/*.npz` only anchors to direct children of `models/`, not the `interim-real-only/` subdirectory

## Task Commits

1. **Task 1 (tracer, TDD): NumPy MLP trainer with forward-pass parity to the deployed classifier** - `2c45943` (feat)
2. **Task 2: Train the interim real-only model and build the model-card data** - `ad45ceb` (feat, includes a Task-1 bug fix)

**Plan metadata:** this commit.

Tracer feedback gate: ran Task 1's full `<verify>` (`py -3.12 -m pytest scripts/tests/test_train_interim_real_only.py -x`, 5 tests) immediately after committing Task 1 (autonomous run, `_auto_chain_active: true`) -- all green, so Task 2 proceeded without a checkpoint.

## Files Created/Modified
- `scripts/train_interim_real_only.py` - NumPy MLP trainer: `filter_real_rows`, `glorot_init`/`init_weights`, `forward_pass`/`predict_proba`, `backward_pass`, Adam optimizer, `stratified_split`, `train_mlp`, CLI writing `model_config.json`/`reef_classifier_weights.npz`/`TRAINING-REPORT.md`
- `scripts/tests/test_train_interim_real_only.py` - 5 tests: synthetic-row filtering, toy-data convergence (>=0.9 acc), 20-input forward-pass parity vs the deployed classifier, byte-identical reruns, seeded-split determinism
- `scripts/build_model_card.py` - builds `dashboard-next/src/data/model-card.json` from the interim config or (fallback) the deployed-model lock
- `models/interim-real-only/model_config.json` - interim model config (version, classes, training sites/countries, synthetic_rows_excluded, split_accuracy, evaluation_note)
- `models/interim-real-only/reef_classifier_weights.npz` - interim model weights (sha256 `ab9e383043ef1bd9e693facf43fdcdac76a640e693b2f834f4fa567561dedcf4`)
- `models/interim-real-only/TRAINING-REPORT.md` - what the model was trained on, rows per class/site, split metrics with caveat, UI consequence
- `dashboard-next/src/data/model-card.json` - model facts for legacy UI copy (01-15, 01-19)

## Decisions Made
- Trained only on `training_test_20.json`'s 100 real rows (not merged with `test_embeddings.json`'s 25-row held-out split) -- matches the audit's own stated conclusion in `DEPLOYED-MODEL-AUDIT.md` section 4 and avoids folding the prior model's test set into the new training set
- `source_training_files[].key` is synthesized as `training/<basename>` to mirror the S3 key convention recorded in `docs/model/deployed-model.lock.json`, since the trainer only sees the local `data/training/` path

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] "Consequence for the UI" section wrongly reported no classes dropped**
- **Found during:** Task 2 (first trainer run)
- **Issue:** `dropped_classes` was computed as `set(labels in the --training file) - interim_classes`. Since the synthetic `restored_mid` rows were never uploaded to S3 or present in `training_test_20.json` at all, that file's label set was already exactly `{degraded, healthy, restored_early}` -- so the diff against `interim_classes` was always empty, and `TRAINING-REPORT.md`'s "Consequence for the UI" section said "No classes were dropped" when `restored_mid` plainly was.
- **Fix:** Compare against the *deployed* model's full class set (`docs/model/deployed-model.lock.json` `artifacts.idx_to_label`) instead of the training file's own labels.
- **Files modified:** `scripts/train_interim_real_only.py`
- **Verification:** Re-ran `scripts/tests/test_train_interim_real_only.py` (still 5/5 green, no regression); re-ran the trainer and confirmed `TRAINING-REPORT.md` now reads "The model is 3-class. The UI must not render probabilities for restored_mid from this model -- those values would be meaningless, not merely uncertain."
- **Committed in:** `ad45ceb` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for correctness -- without the fix, the training report would have made the same kind of overstated-quality claim D-11/T-01-13-03 exists to prevent. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no AWS access was needed for this plan; training ran against the local `data/training/training_test_20.json` file downloaded by plan 01-10.

## Next Phase Readiness
- **Plan 01-14** (deploy): `models/interim-real-only/reef_classifier_weights.npz` and `model_config.json` are ready to publish to S3 behind the owner's confirmation; their sha256 should be re-verified at publish time per threat T-01-13-01's mitigation plan.
- **Plans 01-15/01-19** (UI copy): `dashboard-next/src/data/model-card.json` is stable and ready to be read for model-related UI copy instead of hard-coded accuracy/class claims.
- No blockers for any dependent plan.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All 7 created files found on disk (`scripts/train_interim_real_only.py`, `scripts/tests/test_train_interim_real_only.py`, `scripts/build_model_card.py`, `models/interim-real-only/model_config.json`, `models/interim-real-only/reef_classifier_weights.npz`, `models/interim-real-only/TRAINING-REPORT.md`, `dashboard-next/src/data/model-card.json`); both commits (`2c45943`, `ad45ceb`) found in git history.
