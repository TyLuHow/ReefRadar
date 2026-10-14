---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 04
subsystem: ml-evaluation
tags: [loso, grouped-evaluation, cluster-bootstrap, numpy, interim-model]
requires:
  - phase: 04
    provides: "scripts/train_interim_real_only.py trainer and models/interim-real-only"
provides:
  - "scripts/evaluate_loso.py (export-original, run; run_loso, metrics_from_predictions, two_level_bootstrap, baselines)"
  - "sha256-pinned original LOSO inputs (original.f32 + rows.json)"
  - ".gitattributes binary / eol=lf rules for this phase's float32 and pinned-JSON paths"
affects: [05-11, 05-13, 05-14]
tech-stack:
  added: []
  patterns: ["frozen numpy.random.RandomState stream for the bootstrap", "per-window predictions kept so every metric is recomputable"]
key-files:
  created:
    - scripts/evaluate_loso.py
    - scripts/tests/test_loso_eval.py
    - models/interim-real-only/evaluation/inputs/original.f32
    - models/interim-real-only/evaluation/inputs/rows.json
  modified:
    - .gitattributes
key-decisions:
  - "Fold labels are the sorted classes present in the training fold, so the ind_N1 fold is a 2-class model and is reported as not evaluable"
  - "Per-class and balanced intervals resample all 4 evaluable sites; per-region intervals resample sites within the region"
  - "Balanced accuracy is undefined in a replicate when any evaluable class has no drawn site"
status: complete
actuals:
  tokens: 12500
  tasks: 2
  commits: 1
---

# Phase 5 Plan 04: Leave-one-site-out evaluation harness Summary

Leave-one-site-out retraining of the exact interim recipe (seed 42) on the 100 original training windows shows the model is far below chance on unseen sites: balanced accuracy 6.25 percent (degraded recall 2.5 percent, healthy recall 10 percent), against 33.3 percent for a uniform guess. The model identified sites, not reef health.

## Fold table (original embeddings, seed 42)

| Held-out site | True class | Predicted distribution | Correct |
|---|---|---|---|
| ind_D2 | degraded | healthy 18, degraded 1, restored_early 1 | 1/20 |
| ind_D3 | degraded | restored_early 19, healthy 1 | 0/20 |
| ind_H4 | healthy | degraded 20 | 0/20 |
| ind_N1 | restored_early | degraded 20 | not evaluable: class absent from the training fold |
| ken_H1 | healthy | degraded 16, healthy 4 | 4/20 |

This matches the 05-RESEARCH Q6 prototype row for row (ind_D2 1/20, ind_D3 0/20, ind_H4 0/20, ken_H1 4/20); no host difference.

## Headline metrics (B = 10,000, seed 20261011, RandomState, NumPy 1.26.4, percentile 95)

| Metric | Value | 95% interval | n_sites | n_windows | defined fraction |
|---|---|---|---|---|---|
| degraded recall | 0.025 (1/40) | [0.000, 0.100] | 2 | 40 | 0.934 |
| healthy recall | 0.100 (4/40) | [0.000, 0.300] | 2 | 40 | 0.941 |
| balanced accuracy | 0.0625 | [0.000, 0.175] | 4 | 80 | 0.875 |
| Indonesia accuracy | 0.0167 (1/60) | [0.000, 0.067] | 3 | 60 | 1.0 |
| Kenya accuracy | 0.200 (4/20) | CI not estimable (1 site) | 1 | 20 | 1.0 |

Intervals reproduce the Q6 prototype ([0, 0.1], [0, 0.3], [0, 0.175]). restored_early has no evaluable fold, so it has no recall and is excluded from every average; the ind_N1 fold is reported with its predicted distribution (all 20 windows labelled degraded).

Baselines (same n_sites and n_windows): training-majority scores 0.0 on every metric (the training majority is the wrong class in all four evaluable folds); uniform random scores 1/3 (every evaluable fold model has 3 classes). Q6 text quotes 50 percent chance for two evaluable classes; against that figure the model is further below chance still, so the 1/3 figure is the one that matches the folds as trained.

Caveats carried in the module docstring for the model card (05-13): the committed model trained on 85 rows after a random 15 percent split and a fold trains on 80 rows of four sites; 4 evaluable sites give 35 distinct site multisets so the percentile interval is indicative only; two-level resampling is conservative (too wide); sites are confounded with country, recorder and class.

## Task commits

1. Tasks 1 and 2 - `734f661` feat(05-04): leave-one-site-out harness with pinned original inputs

## Deviations from Plan

**1. [Process] Tasks 1 and 2 share one commit.** I wrote `scripts/evaluate_loso.py` and its tests in one pass, so the bootstrap and baseline code and tests landed in the Task 1 commit. Task 2 needed no further changes after its verification passed. No behaviour differs from the plan.

**2. [Process] Tracer gate treated as autonomous.** This ran as an orchestrated, non-interactive executor, so after the tracer commit I re-ran its verification end to end (the `run` subcommand, all five folds) rather than stopping for a human-verify checkpoint. It passed.

Otherwise the plan was executed as written. Out-of-scope finding logged below.

## Deferred Issues

`scripts/tests/test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent` fails on this Windows checkout (the regenerated manifest has LF line endings while the working copy has CRLF under autocrlf). It does not touch this plan's files and the full suite otherwise passes. The test also rewrites `data/audio-manifest.json` and two dashboard fixture files in the working tree as a side effect; I reverted those with a targeted `git checkout` of the three files. Not fixed here.

## Verification

- `py -3.12 -m pytest scripts/tests/test_loso_eval.py -q`: 13 passed, run 3 times with identical results (seeded determinism); `-k fold` and `-k bootstrap` pass separately.
- original.f32 is 512,000 bytes; rows.json contains the `e18c133e...` source pin once; `git check-attr diff` reports `unset` for original.f32.
- `run` output contains "class absent from the training fold"; `run --bootstrap` output contains "not_estimable_1_site" and "numpy.random.RandomState".
- `py -3.12 -m pytest -q`: all pass except the pre-existing failure above.

## Known Stubs

None.

## Threat Flags

None. T-05-04-01 (tampering) is mitigated: export refuses any training file whose sha256 differs, and `load_inputs` verifies the embeddings sha256.

## Self-Check: PASSED

Files exist (scripts/evaluate_loso.py, scripts/tests/test_loso_eval.py, original.f32, rows.json) and commit 734f661 exists.
