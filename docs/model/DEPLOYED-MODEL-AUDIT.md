# Deployed Model Audit (D-10)

**Audited:** 2026-10-01T08:22:28Z (UTC)
**Re-run with:** `py -3.12 scripts/audit_deployed_model.py --s3` (profile `reefradar`, read-only) — writes `docs/model/deployed-model.lock.json`, the machine-readable companion to this document. This document and the lock file must agree on `interim_required`; if they diverge, re-run the script and update this file.

## 1. Identity

The live classifier Lambda (`reefradar-2477-classifier`) loads two S3 objects at cold start (`lambdas/classifier/handler.py:393-434`, `load_classifier_model`):

| Object | S3 key | sha256 |
|---|---|---|
| Config | `models/model_config.json` | `dfe29cb23b2a587bd70ae3aee3613f3f8db7b8c907d63036131d0b6ef5a5a07f` |
| Weights | `models/reef_classifier_weights.npz` | `172d56ced02ed402652c6c710c409b77bfddb136859c54037ed091d50bb77faf` |

From the config and weight shapes themselves (not from any doc that might drift):

- **Version:** `2.0`
- **Created:** `2026-02-05T04:21:19.979618`
- **Architecture:** `1280 → 256 → 64 → 4`, ReLU/ReLU/softmax (`w1` `[1280, 256]`, `w2` `[256, 64]`, `w3` `[64, 4]`), matching the forward pass in `handler.py:437-475` (`classify_embedding`).
- **Classes (index order, from `idx_to_label`):** `0: degraded`, `1: healthy`, `2: restored_early`, `3: restored_mid`
- **Claimed `training_samples`:** `140`
- **Claimed `test_accuracy`:** `0.9047619047619048` (90.5%)

The weights file was loaded with `allow_pickle=False` and hashed from its raw bytes before parsing (per the `T-01-10-01` mitigation) — it is a plain array container, not a pickle.

## 2. Training data actually available in S3

`scripts/audit_deployed_model.py --s3` listed every key under `models/` and `training/` in `reefradar-2477-embeddings` and downloaded and parsed each `training/*.json` file:

| Key | Size | Rows | Real | Synthetic |
|---|---|---|---|---|
| `training/metadata.json` | 370 B | 0 | 0 | 0 |
| `training/test_embeddings.json` | 704,650 B | 25 | 25 | 0 |
| `training/training_test_20.json` | 2,816,332 B | 100 | 100 | 0 |

(`training/metadata.json` is a small sidecar with no `samples` array — not a row-bearing training file.)

Per-class real-row counts, summed across both row-bearing files:

| Class | Real rows | Synthetic rows | Sites | Has real training data? |
|---|---|---|---|---|
| `degraded` | 50 (40 + 10) | 0 | `ind_D2`, `ind_D3` | **Yes** |
| `healthy` | 50 (40 + 10) | 0 | `ind_H4`, `ken_H1` | **Yes** |
| `restored_early` | 25 (20 + 5) | 0 | `ind_N1` | **Yes** |
| `restored_mid` | **0** | **0** | — | **No** |

`restored_mid` does not appear in a single S3 training file — not as a real row and not as a synthetic row. The config nonetheless reports `num_classes: 4` with `restored_mid` at index 3, and `training_samples: 140` where `100 (training_test_20.json) + 40 = 140` — the 40 unaccounted-for rows are not present anywhere in S3.

## 3. Evidence

| # | Source | Statement |
|---|---|---|
| 1 | `lambdas/classifier/handler.py:393-475` | The deployed classifier downloads `models/reef_classifier_weights.npz` and `models/model_config.json` from S3, reads `idx_to_label` from the config, and runs a pure-NumPy forward pass (`w1` → ReLU → `w2` → ReLU → `w3` → softmax). |
| 2 | `scripts/train_classifier.py:39-83` | Training data is loaded from `training/training_test_20.json`; each sample has `embedding`, `label` and `site_id` fields. |
| 3 | `scripts/add_restored_mid_and_retrain.py:44-59` | `RESTORED_MID_SITES` hardcodes the only two `site_id`/`label` targets the synthetic generator ever produces: `ind_R1` and `ind_R2`, both labelled `restored_mid`. |
| 4 | `scripts/add_restored_mid_and_retrain.py:144-177` | `generate_synthetic_audio()` builds sine tones at fixed frequencies (250/400/600 Hz, 1200/2000/3000 Hz) plus exponential-decay "snapping shrimp" clicks and Gaussian background noise — no real recording is read to produce these rows. |
| 5 | `scripts/add_restored_mid_and_retrain.py:225-261` | `generate_embeddings_for_site()` writes `file_id` as `"{site_id}_synthetic_{i:04d}"` for every synthetic row it generates, and invokes the real inference Lambda only to embed this synthetic audio — the *embedding* is real SurfPerch output, but its *source audio* is synthetic. |
| 6 | `scripts/add_restored_mid_and_retrain.py:333-345` | `train_classifier()` sets `config['version'] = '2.0'` and `training_samples = len(X)`, i.e. the existing 100 real rows plus up to 40 newly generated synthetic `restored_mid` rows — matching the deployed config's claimed `140`. |
| 7 | `scripts/add_restored_mid_and_retrain.py:348-366` | `save_and_upload()` writes the merged training file to `data/training/training_with_restored_mid.json` **on local disk only**. It uploads `models/reef_classifier_weights.npz` and `models/model_config.json` to S3, but never uploads the training file that would contain the synthetic `restored_mid` rows. This is confirmed by §2: no `training/*.json` key in S3 contains a `restored_mid` row at all. |
| 8 | `.planning/audit/DATA-MODEL.md`, finding F2 / §6 | Independently derived the same conclusion before this audit ran against live S3: "100 real + 40 synthetic = 140… No later retrain script exists." This audit confirms F2 directly from the artifacts rather than from inference. |
| 9 | `docs/REFERENCE_SITE_EXPANSION_PLAN.md:17-20` | Records "Model Version: 2.0 (4-class), Training Samples: 140 total, Test Accuracy: 90.5%, Classes: healthy (35), degraded (35), restored_early (35), restored_mid (35)" — the per-class split it claims (35/35/35/35) does not match either the real training rows found here (50/50/25/0) or `add_restored_mid_and_retrain.py`'s actual class-balance behaviour (it does not rebalance to equal counts); this document was itself a planning estimate, not a measurement. |
| 10 | `docs/MODEL_EVALUATION.md` | Documents model **v1.0** (3-class: `degraded`, `healthy`, `restored_early`; 90.0% accuracy, n=10 test windows) — the model version that preceded today's deployed v2.0 and is consistent with the 3 classes this audit finds real training data for. |

## 4. Conclusion

**`synthetic_class_detected: true`.** The deployed model's `restored_mid` class (index 3) has zero real training rows in any training file present in S3 — it is backed entirely by audio generated by `generate_synthetic_audio()` (sine tones and synthetic clicks), and the only file that would have recorded those rows (`data/training/training_with_restored_mid.json`) was never uploaded.

**`interim_required: true`.** Per D-11, no class may be served without verifiable real training data. The deployed 4-class model must not be presented as having a working `restored_mid` class.

**`interim_num_classes: 3`.** An interim real-only model retrained on the rows actually verified above (`degraded`, `healthy`, `restored_early` — 100 real rows from `training_test_20.json`) would be 3-class. Until plan 01-13 trains and deploys that interim model, the UI must not render a `restored_mid` probability from the currently deployed model (its value for that class is meaningless by construction, not merely uncertain).

This matches `docs/model/deployed-model.lock.json`'s `interim_required: true` / `interim_num_classes: 3` / `interim_classes: ["degraded", "healthy", "restored_early"]`.

## 5. Real training sites and the consequence for region coverage

Only 5 real sites back any of the deployed model's classes, all drawn from the pre-existing 100-row `training_test_20.json` (the `test_embeddings.json` 25-row test split reuses the same 5 sites):

| Site ID | Country | Latitude | Longitude | Real rows (train + test files) |
|---|---|---|---|---|
| `ind_D2` | Indonesia | -4.9401 | 119.318815 | 25 |
| `ind_D3` | Indonesia | -4.930635 | 119.316119 | 25 |
| `ind_H4` | Indonesia | -4.929463 | 119.316792 | 25 |
| `ind_N1` | Indonesia | -4.9310799 | 119.3159127 | 25 |
| `ken_H1` | Kenya | -2.215614 | 41.013482 | 25 |

**Consequence:** the model's real training-region coverage is **Indonesia and Kenya only** — a single Indonesian cluster (South Sulawesi) plus one Kenyan site. The classifier has never seen a real training example from Australia, Mexico, or Maldives, despite those countries having reference sites in `/sites`. Plan 01-11's `in_training_region` check must be computed from exactly these 5 sites' countries (Indonesia, Kenya), not from the full list of countries with reference embeddings.

## 6. What the claimed 90.5% accuracy means (and does not mean)

`add_restored_mid_and_retrain.py:294-297` (`train_classifier`) splits the combined 140-row set **per window, at random** (`train_test_split(..., test_size=0.15, stratify=y, random_state=42)`), so the ~21-row test set and the ~119-row train set come from the *same 7 sites and the same deployments* — there is no held-out site, recorder, or region. Per `.planning/audit/DATA-MODEL.md` F3, a model evaluated this way is effectively measuring "which of a handful of hydrophones is this," not reef condition. The 90.5% figure:

- Is computed over roughly 21 windows (15% of 140), of which up to 6 are the trivially-separable synthetic `restored_mid` sines this audit found have no real counterpart.
- Does not estimate performance on a new site, a new region, a new recorder, or a new time of day.
- Has no confidence interval reported; a 95% CI on an n of ~21 is wide.

A proper grouped (leave-one-site-out) evaluation is out of scope for this plan — it lands in Phase 5, and the full retrain (adding upstream MARRS data at scale) lands in Phase 12.

## 7. Re-run instructions

```bash
py -3.12 -m pytest scripts/tests/test_audit_deployed_model.py -x
py -3.12 scripts/audit_deployed_model.py --s3
py -3.12 -c "import json;d=json.load(open('docs/model/deployed-model.lock.json'));print(d['interim_required'], d['interim_num_classes'])"
```

Offline rerun against a local snapshot (no AWS call) is available via `py -3.12 scripts/audit_deployed_model.py --local DIR`, where `DIR` contains `models/model_config.json`, `models/reef_classifier_weights.npz`, and a `training/` directory of `*.json` files in the same layout as the S3 prefixes.

This audit downloads artifacts to the repo's already-gitignored `models/` and `data/training/` directories and never uploads anything.
