# Interim Real-Only Model Training Report

**Version:** `interim-real-only`  
**Created:** 2026-10-01T08:53:41.793280+00:00  
**Seed:** 42

## Why this model exists

The deployed v2.0 classifier's `restored_mid` class has zero real training rows (see docs/model/DEPLOYED-MODEL-AUDIT.md) -- it was trained entirely on synthetically generated audio (scripts/add_restored_mid_and_retrain.py). Per D-11, no class may be served without verifiable real training data, so this interim model is retrained on the real rows only.

**Classes dropped:** restored_mid (no real training rows).

## Classes (3)

| Class | Real rows |
|---|---|
| degraded | 40 |
| healthy | 40 |
| restored_early | 20 |

## Rows per training site

| Site | Country | Real rows |
|---|---|---|
| ind_D2 | Indonesia | 20 |
| ind_D3 | Indonesia | 20 |
| ind_H4 | Indonesia | 20 |
| ind_N1 | Indonesia | 20 |
| ken_H1 | Kenya | 20 |

## Synthetic rows excluded: 0

No `_synthetic_` file_id rows were present in the source training file(s) used here.

## Evaluation

**Split accuracy (held-out 15%):** 100.0%

**Caveat:** Accuracy is from a random per-window split; windows from the same site appear in train and test, so it is not an estimate of performance on new sites or regions. Grouped leave-one-site-out evaluation is Phase 5; retraining on more real data is Phase 12.

## Consequence for the UI

The model is 3-class. The UI must not render probabilities for restored_mid from this model -- those values would be meaningless, not merely uncertain.

## Source training files

| Key | sha256 |
|---|---|
| training/training_test_20.json | e18c133ef1d640014fc77d4083d66f9cafe0773f509c738fe953a4d5e346ca7a |

