# Interim Real-Only Model Training Report

**Version:** `interim-real-only-2026.10.1`  
**Created:** 2026-10-14T15:20:22.407784+00:00  
**Seed:** 42

## Why this model exists

`interim-real-only-2026.10.1` is an **interim** model, the successor of `interim-real-only`. It exists because of a preprocessing mismatch, not because the model got better.

The deployed `interim-real-only` was trained on embeddings from the earlier pipeline (whole file peak-normalised to 1.0, linear interpolation; scripts/generate_training_embeddings.py). The live pipeline now prepares audio with `reef_audio` (`preproc-2026.10.1-reef-audio`: 5 s windows, 32 kHz, DC removed, peak-normalised to 0.25, polyphase resampling). Serving the predecessor with reef_audio windows would mismatch the space it was trained in. The drift probe measured this on the same 100 files (first 5 s window, original training row versus the row re-embedded through reef_audio, 100 pairs): cosine mean 0.2066, median 0.2125, min -0.0861, max 0.4961. The two are very different representations of the same audio.

So the same recipe (same outer 15% split, `train_mlp`, seed 42; no hyperparameter was changed or tuned) was re-run on the same 100 files re-embedded through reef_audio, in the same row order and with the same labels, so the model that serves reef_audio windows was trained on reef_audio windows.

**This model has no evidence of generalising to new sites.** It is trained on 100 windows from 5 sites in Indonesia and Kenya. The leave-one-site-out evaluation of the same recipe on the original embeddings (plan 05-04) gave a balanced accuracy of 6.25% (interval 0.0% to 17.5%) against 33.3% for a uniform guess: the recipe identified sites, not reef health. The grouped evaluation on these re-embedded rows is reported in models/interim-real-only/evaluation/REPORT.md. The real retrain on more real data, with model selection, is Phase 12.

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

**Caveat:** Accuracy is from a random per-window split; windows from the same site appear in train and test, so it is not an estimate of performance on new sites or regions. This is an interim model with no evidence that it generalises to new sites. The grouped leave-one-site-out evaluation is in models/interim-real-only/evaluation/REPORT.md; the real retrain and model selection are Phase 12.

## Consequence for the UI

The model is 3-class. The UI must not render probabilities for restored_mid from this model -- those values would be meaningless, not merely uncertain.

## Source training files

| Key | sha256 |
|---|---|
| training/training_test_20.json | e18c133ef1d640014fc77d4083d66f9cafe0773f509c738fe953a4d5e346ca7a |

## Training inputs (pinned)

| Path | sha256 |
|---|---|
| models/interim-real-only/evaluation/inputs/reembedded.f32 | 74123a44555181c7fb8cbe3a1340d72dc65df8ad4abdbafe0aedf64a5d5712e2 |
| models/interim-real-only/evaluation/inputs/reembedded.json | d5f75b9d264455548cad7bcf523a7cfab8003837fbea9da127491b77a2eeeb31 |
| models/interim-real-only/evaluation/inputs/rows.json | dc939d955d69a9f0e9d483c6f37a3770666d1cc88e8d8cedcc846f2e34dfb392 |

**Weights sha256:** `cdc169fab304d8c0f20e8f88eb2bbb6d520813c2ea1de64ed5d072f3a934ce80`  
**Preprocessing spec:** `preproc-2026.10.1-reef-audio`

