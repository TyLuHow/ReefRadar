# Leave-one-site-out evaluation `loso-2026.10.1`

This file is generated from `report.json` by `scripts/evaluate_loso.py report`; every number below is in that file. Do not edit it by hand.

## What was measured

Each fold holds out every window of one site and trains the interim recipe on the other sites, then tests on the held-out site. This asks the question the service cares about: does the model work at a site it has never heard. The model served is `interim-real-only-2026.10.1`; `interim-real-only` is the earlier model and is not served.

## Plain reading

- `interim-real-only` (not served): Balanced accuracy on held-out sites is 0.0625 (95% interval [0.0000, 0.1750], 4 sites, 80 windows). Chance for the 2 evaluable classes is 0.5000. The whole interval lies below chance: this result is below chance, which means systematic mislabelling and not noise. The model identified sites, not reef health.
- `interim-real-only-2026.10.1` (served): Balanced accuracy on held-out sites is 0.4375 (95% interval [0.3000, 0.5833], 4 sites, 80 windows). Chance for the 2 evaluable classes is 0.5000. The interval contains that line (the point estimate sits under it), so the result cannot be told apart from chance and gives no evidence that the model recognises reef health at a new site.

Both models are interim and have no evidence of generalising to new sites. The result is reported with its intervals and the few-site caveats below; it is not a reef-health accuracy.

## Model `interim-real-only` (not served, kept for comparison)

Embedding space: original embeddings (earlier training pipeline); preprocessing `preproc-2026.10.0-as-deployed`. Numbers below are in this embedding space only.

Balanced accuracy on held-out sites is 0.0625 (95% interval [0.0000, 0.1750], 4 sites, 80 windows). Chance for the 2 evaluable classes is 0.5000. The whole interval lies below chance: this result is below chance, which means systematic mislabelling and not noise. The model identified sites, not reef health.

| Metric | Value | 95% interval | Sites | Windows | Defined fraction |
|---|---|---|---|---|---|
| degraded recall | 0.0250 | [0.0000, 0.1000] | 2 | 40 | 0.9340 |
| healthy recall | 0.1000 | [0.0000, 0.3000] | 2 | 40 | 0.9408 |
| restored_early recall | restored_early not evaluable: class absent from the training fold | | | | |
| balanced accuracy | 0.0625 | [0.0000, 0.1750] | 4 | 80 | 0.8748 |
| Indonesia accuracy | 0.0167 | [0.0000, 0.0667] | 3 | 60 | 1.0000 |
| Kenya accuracy | 0.2000 | CI not estimable (1 site) | 1 | 20 | 1.0000 |
| baseline: training majority (balanced) | 0.0000 | no interval | 4 | 80 | |
| baseline: uniform random (balanced) | 0.3333 | no interval | 4 | 80 | |

### Folds

| Held-out site | Country | True class | Correct | Predicted labels |
|---|---|---|---|---|
| ind_D2 | Indonesia | degraded | 1/20 | healthy 18, degraded 1, restored_early 1 |
| ind_D3 | Indonesia | degraded | 0/20 | restored_early 19, healthy 1 |
| ind_H4 | Indonesia | healthy | 0/20 | degraded 20 |
| ind_N1 | Indonesia | restored_early | not evaluable | degraded 20 |
| ken_H1 | Kenya | healthy | 4/20 | degraded 16, healthy 4 |

ind_N1 is the only restored_early site, so this fold has no restored_early in training. Result: restored_early not evaluable: class absent from the training fold. Predicted labels for its 20 windows: degraded 20; shown for completeness and excluded from every average.

## Model `interim-real-only-2026.10.1` (served)

Embedding space: re-embedded rows (reef_audio, the pipeline the service uses); preprocessing `preproc-2026.10.1-reef-audio`. Numbers below are in this embedding space only.

Balanced accuracy on held-out sites is 0.4375 (95% interval [0.3000, 0.5833], 4 sites, 80 windows). Chance for the 2 evaluable classes is 0.5000. The interval contains that line (the point estimate sits under it), so the result cannot be told apart from chance and gives no evidence that the model recognises reef health at a new site.

| Metric | Value | 95% interval | Sites | Windows | Defined fraction |
|---|---|---|---|---|---|
| degraded recall | 0.2500 | [0.0500, 0.4500] | 2 | 40 | 0.9340 |
| healthy recall | 0.6250 | [0.4181, 0.8000] | 2 | 40 | 0.9408 |
| restored_early recall | restored_early not evaluable: class absent from the training fold | | | | |
| balanced accuracy | 0.4375 | [0.3000, 0.5833] | 4 | 80 | 0.8748 |
| Indonesia accuracy | 0.4000 | [0.1500, 0.6833] | 3 | 60 | 1.0000 |
| Kenya accuracy | 0.5500 | CI not estimable (1 site) | 1 | 20 | 1.0000 |
| baseline: training majority (balanced) | 0.0000 | no interval | 4 | 80 | |
| baseline: uniform random (balanced) | 0.3333 | no interval | 4 | 80 | |

### Folds

| Held-out site | Country | True class | Correct | Predicted labels |
|---|---|---|---|---|
| ind_D2 | Indonesia | degraded | 3/20 | healthy 9, restored_early 8, degraded 3 |
| ind_D3 | Indonesia | degraded | 7/20 | healthy 10, degraded 7, restored_early 3 |
| ind_H4 | Indonesia | healthy | 14/20 | healthy 14, degraded 3, restored_early 3 |
| ind_N1 | Indonesia | restored_early | not evaluable | degraded 18, healthy 2 |
| ken_H1 | Kenya | healthy | 11/20 | healthy 11, degraded 9 |

ind_N1 is the only restored_early site, so this fold has no restored_early in training. Result: restored_early not evaluable: class absent from the training fold. Predicted labels for its 20 windows: degraded 18, healthy 2; shown for completeness and excluded from every average.

## Embedding drift between the two spaces

Over 100 pairs (the same file embedded both ways), cosine similarity has mean 0.2066, median 0.2125, minimum -0.0861 and maximum 0.4961. How it was measured: cosine between each original training row and the same file's first window re-embedded through reef_audio. The two spaces are far apart, so the original model's numbers say nothing about the service's embeddings, and the two models' scores must not be read as one improving on the other.

## Figures withdrawn

- **split_accuracy**: 1.0 (100% on the held-out 15% split). Source: models/interim-real-only/model_config.json (split_accuracy) and models/interim-real-only-2026.10.1/model_config.json. Measured on a random per-window split. Windows from the same site fall in both train and test, so the score reflects site identity leaking across the split and is not an estimate of performance on a new site. The leave-one-site-out result in this report supersedes it.
- **overall_accuracy**: 90.0% (model version 1.0, generated 2026-02-03). Source: docs/MODEL_EVALUATION.md (as generated 2026-02-03). Measured on a random split with a few windows per class and the same site leakage, so it is not an estimate of performance on a new site. It is withdrawn; the leave-one-site-out result in this report supersedes it.

## Caveats

- Only four sites are evaluable, so the bootstrap can draw only 35 distinct multisets of sites and its distribution is lumpy; the percentile interval is indicative only (Cameron, Gelbach and Miller 2008, 'Bootstrap-based improvements for inference with clustered errors', Review of Economics and Statistics, show that cluster inference with few clusters misleads).
- Resampling both sites and windows counts within-site variance twice relative to resampling sites alone (Field and Welsh 2007, 'Bootstrapping clustered data', Journal of the Royal Statistical Society Series B), so these intervals are conservative (too wide), not too narrow. Even so they are wide, and with five sites no interval here supports a claim of good performance.
- Sites are confounded with country, recorder and class: every degraded site is in Indonesia and one of the two healthy sites is in Kenya. A held-out site therefore measures site shift, not reef-health generalisation.
- restored_early has one site (ind_N1); the fold that holds it out has no restored_early in training, so that class has no recall and is excluded from every average. Kenya has one site (ken_H1), so its accuracy has no interval.
- Each fold retrains the interim recipe (train_mlp, seed 42) on all windows of the other four sites with its own 15% validation split; the committed models also used an outer random 15% test split that a site-held-out fold does not replicate. The fold models are not the served weights.
- Each of the 100 rows is one 5 s window (the first) of a distinct 60 s file, 20 windows per site; windows from the same site are strongly correlated, which is why the site, not the window, is the unit of resampling.
- The original model and the reference vectors come from the earlier training pipeline (file peak-normalised to 1.0, linear interpolation); the successor's embeddings come from the reef_audio pipeline served in production. The two models' numbers live in different embedding spaces and are not a measure of improvement.
- The successor exists because of the preprocessing mismatch, not because the model improved: it was trained with the same recipe and seed on the same 100 files re-embedded.
- Both models are interim and have no evidence of generalising to new sites; the real retrain and model selection are Phase 12.

## Reproduction

Bootstrap: 2 levels (sites with replacement, then windows within each drawn site), B = 10000, seed 20261011, `numpy.random.RandomState`, NumPy 1.26.4, percentile 95 interval, no interval for a group with fewer than 2 sites. Trainer `scripts/train_interim_real_only.py` at `ba9ce0137d326e52bfebc6ab449759454e968741`, seed 42. Report generated by `scripts/evaluate_loso.py` at `936a9f5701a5f8ae28bd7bc7cdf8d98571dbd4b6`.

| Input | Path | Rows | sha256 |
|---|---|---|---|
| rows | `models/interim-real-only/evaluation/inputs/rows.json` | 100 | `dc939d955d69a9f0e9d483c6f37a3770666d1cc88e8d8cedcc846f2e34dfb392` |
| original_embeddings | `models/interim-real-only/evaluation/inputs/original.f32` | 100 | `72b71b70e3732c125f0d144c3e3de101c5a80eed840a7b253e3a11cfed45ea0f` |
| reembedded_rows | `models/interim-real-only/evaluation/inputs/reembedded.json` | 100 | `d5f75b9d264455548cad7bcf523a7cfab8003837fbea9da127491b77a2eeeb31` |
| reembedded_embeddings | `models/interim-real-only/evaluation/inputs/reembedded.f32` | 100 | `74123a44555181c7fb8cbe3a1340d72dc65df8ad4abdbafe0aedf64a5d5712e2` |
| training_file | `training/training_test_20.json` | 100 | `e18c133ef1d640014fc77d4083d66f9cafe0773f509c738fe953a4d5e346ca7a` |
