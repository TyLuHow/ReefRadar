---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 12
subsystem: ml-model
tags: [interim-successor, retrain, ood-reference, leave-one-site-out, s3-archive, moto]
status: complete

requires:
  - phase: 05-04
    provides: "LOSO harness, rows.json, original.f32 (the original recipe is reproduced bit for bit from them)"
  - phase: 05-06
    provides: "ood-reference schema, model-version schema"
  - phase: 05-11
    provides: "reembedded.f32 + reembedded.json (100 training windows through reef_audio, drift probe)"
provides:
  - "models/interim-real-only-2026.10.1/: the interim successor (config, weights, training report), trained by the unchanged recipe and seed 42 on the re-embedded rows"
  - "models/interim-real-only-2026.10.1/ood_reference.json: the OOD sidecar (k=1 cosine distance, leave-one-site-out p95 threshold), schema-valid, every input sha256 pinned"
  - "scripts/build_ood_reference.py with --check (recompute and compare)"
  - "scripts/train_interim_real_only.py successor mode (--embeddings-f32/--rows-json/--version/--preprocessing-spec-version/--predecessor-version/--predecessor-reason)"
  - "scripts/publish_model.py --archive-version DIR (create-only archive under models/archive/<version>/, never the live keys)"
affects: [05-13, 05-14, 05-15, 05-16, 05-17]

key-files:
  created:
    - models/interim-real-only-2026.10.1/model_config.json
    - models/interim-real-only-2026.10.1/reef_classifier_weights.npz
    - models/interim-real-only-2026.10.1/TRAINING-REPORT.md
    - models/interim-real-only-2026.10.1/ood_reference.json
    - scripts/build_ood_reference.py
    - scripts/tests/test_train_successor.py
    - scripts/tests/test_build_ood_reference.py
    - scripts/tests/test_publish_model_archive.py
  modified:
    - scripts/train_interim_real_only.py
    - scripts/publish_model.py

key-decisions:
  - "No hyperparameter or split was changed: same outer stratified 15% split, train_mlp, seed 42, rows in rows.json order. Run on the ORIGINAL embeddings in the same order, this code reproduces the committed original weights byte for byte (sha256 ab9e3830...dedcf4), so 'exact recipe' is a measured fact, not a claim."
  - "The training report and the config's evaluation_note both say the successor is an interim model with no evidence of generalising to new sites, cite the 05-04 LOSO result on the original embeddings (balanced accuracy 6.25 percent, interval 0 to 17.5 percent, chance 33.3 percent), and name Phase 12 as the real retrain."
  - "The OOD sidecar's third source input is reembedded.json's source_rows entry (rows.json), so all three training inputs are pinned in both the model config and the OOD sidecar."
  - "The archive mode takes MODELS_ROOT as a module constant so the 'DIR must be inside models/' guard is testable under moto without writing into the repo."

requirements-completed: [ML-03, ML-06]

completed: 2026-10-14
actuals:
  tokens: 18000
  tasks: 3
  commits: 6
---

# Phase 5 Plan 12: Interim successor model, OOD reference and create-only archive Summary

**The interim 3-class MLP was retrained with the exact recipe and seed 42 on the 100 reef_audio re-embedded windows (successor `interim-real-only-2026.10.1`, weights sha256 `cdc169fab304d8c0f20e8f88eb2bbb6d520813c2ea1de64ed5d072f3a934ce80`), the OOD reference was frozen with a leave-one-site-out p95 threshold of 0.351904229467, and `publish_model.py --archive-version` can archive a version under `models/archive/` create-only without touching the live model keys.**

## What was built

### Task 1 (tracer): successor model

- `scripts/train_interim_real_only.py` has a second input mode: `--embeddings-f32` plus `--rows-json` (mutually exclusive with `--training`), with `--version`, `--preprocessing-spec-version`, `--predecessor-version` and `--predecessor-reason`. The original `--training` path is unchanged: same split, same `train_mlp`, same config keys (a test pins that none of the new keys appear), same byte-identical npz for the same seed. `main` now takes `argv`.
- The loader refuses inputs whose pins disagree: `reembedded.f32` sha256 must equal `reembedded.json`'s `embeddings_sha256`, `rows.json` (LF bytes) must equal its `source_rows.sha256`, the file size must be count x 1280 x 4, and both files must list the same file ids in the same order.
- Successor config adds `preprocessing_spec_version` (`preproc-2026.10.1-reef-audio`), `weights_sha256`, `training_inputs` (three paths with sha256), `predecessor` (`interim-real-only` and the reason) and an `evaluation_note` that names `models/interim-real-only/evaluation/REPORT.md` and Phase 12.
- `reef_reference.load_served_model` accepts the written pair (test). Retraining from the committed inputs gives the same argmax for all 100 rows and probabilities within 1e-3 of the committed weights (test; on this host the retrained npz is in fact byte-identical, see below).

Numbers to record:

| Item | Value |
|---|---|
| Version | `interim-real-only-2026.10.1` |
| Weights sha256 | `cdc169fab304d8c0f20e8f88eb2bbb6d520813c2ea1de64ed5d072f3a934ce80` |
| Weights size | 1,379,754 bytes (1280 -> 256 -> 64 -> 3) |
| Config sha256 (LF bytes, the git blob) | `348b20a2b41b323f354fe4094087b2d81fa98585ac292fe94aee44338f52ffbd` |
| Split accuracy (held-out 15%) | 100.0 percent (15 windows). **Caveat:** a random per-window split; windows of the same site are in train and test, so this is not an estimate of performance on new sites. The 05-04 LOSO of the same recipe on the original embeddings is 6.25 percent balanced accuracy. |
| Second run on this host | byte-identical npz (same sha256), run into a scratch directory and compared |
| Original recipe on original.f32 in rows.json order | byte-identical to the committed `models/interim-real-only/reef_classifier_weights.npz` (`ab9e383043ef1bd9e693facf43fdcdac76a640e693b2f834f4fa567561dedcf4`) |

Input sha256 values (also in the config): `reembedded.f32` `74123a44555181c7fb8cbe3a1340d72dc65df8ad4abdbafe0aedf64a5d5712e2`; `reembedded.json` and `rows.json` are hashed over LF bytes (values in `model_config.json` `training_inputs`; `rows.json` is `dc939d955d69a9f0e9d483c6f37a3770666d1cc88e8d8cedcc846f2e34dfb392`). Label source: `training/training_test_20.json` sha256 `e18c133ef1d640014fc77d4083d66f9cafe0773f509c738fe953a4d5e346ca7a`.

The TRAINING-REPORT states the drift probe as measured (cosine mean 0.2066, median 0.2125, min -0.0861, max 0.4961 over 100 pairs), says the successor exists because of the preprocessing mismatch and not because the model improved, states plainly that it is interim with no evidence of generalising to new sites, and names Phase 12 as the real retrain. The CLASSES-dropped line (`restored_mid`) and the per-site table are kept.

### Task 2: OOD reference

`scripts/build_ood_reference.py` computes, in float64 on row-normalised vectors, for each of the 100 windows `1 - max cosine to windows of the other four sites`, and sets the threshold to `numpy.percentile(all 100, 95)`.

| Site | n | p50 | p95 | max |
|---|---|---|---|---|
| ind_D2 | 20 | 0.124078 | 0.322890 | 0.372453 |
| ind_D3 | 20 | 0.186613 | 0.382865 | 0.412901 |
| ind_H4 | 20 | 0.164824 | 0.346847 | 0.351280 |
| ind_N1 | 20 | 0.116859 | 0.198133 | 0.248742 |
| ken_H1 | 20 | 0.212311 | 0.301920 | 0.370150 |

**Threshold: 0.351904229467** (pooled n 100). The sidecar (`ood_version` `ood-2026.10.1-nn1-cosine`, metric `cosine_distance`, k 1) validates against `ood-reference.schema.json`; `embeddings` is `{uri v2/ood_reference.f32, sha256 74123a44..., float32-le, dim 1280, count 100}` (the same bytes as `reembedded.f32`), with `row_site_ids` in row order, the spec version, `embedding_model` surfperch 1.0 / 1280, three pinned `source_inputs` and an `embedding_space_note`. The note says the reference rows are in the same space as served windows, what the distance measures, and that it cannot detect whether the classifier matches its embedding space (05-RESEARCH Pitfall 8). The threshold is large (a recording whose windows are 0.35 cosine distance from every training window is still "inside"), which follows from only 5 sites and 100 windows; it describes this small training set, not the reef world.

`--check` recomputes the whole sidecar from the committed rows and exits 1 on any difference (floats within 1e-12, everything else exact), including schema validity; tampering with the threshold, the embeddings sha256 or a source-input sha256, and a missing sidecar, are each tested.

### Task 3: create-only archive mode

`publish_model.py --archive-version DIR` reads `DIR/model_config.json` (LF-normalised, so its sha256 equals the contract's `config_sha256`) and `DIR/reef_classifier_weights.npz`, takes the version from the config, and writes `models/archive/<version>/model_config.json` and `.../reef_classifier_weights.npz` with `IfNoneMatch "*"`, then re-downloads and verifies each sha256. It refuses a version failing `^[a-z0-9][a-z0-9.+-]*$`, a DIR outside `models/`, weights that do not hash to the config's `weights_sha256`, and a combination with `--rollback`. A re-run with identical bytes reports `exists_identical`; an existing object with different bytes aborts with exit 1 and is not overwritten. `--dry-run` (and a missing `--confirm`) prints the two target keys, byte counts and sha256 values and creates no client, so no AWS call. Under moto the live `models/model_config.json` and `models/reef_classifier_weights.npz` are asserted byte-identical before and after and the bucket holds exactly four keys. Existing modes are untouched (the diff is purely additive; `test_publish_tools.py` passes unchanged).

**Not run against real AWS** (per the plan hand-off): `--dry-run` against the real directory printed

```
models/archive/interim-real-only-2026.10.1/model_config.json  bytes=3066  sha256=348b20a2b41b323f354fe4094087b2d81fa98585ac292fe94aee44338f52ffbd
models/archive/interim-real-only-2026.10.1/reef_classifier_weights.npz  bytes=1379754  sha256=cdc169fab304d8c0f20e8f88eb2bbb6d520813c2ea1de64ed5d072f3a934ce80
```

The real `--confirm` is for 05-16.

## Verification

- `py -3.12 -m pytest scripts/tests/test_train_successor.py scripts/tests/test_train_interim_real_only.py -x -q`: all pass.
- `py -3.12 -m pytest scripts/tests/test_build_ood_reference.py -x -q` and `py -3.12 scripts/build_ood_reference.py --check`: pass, check prints `threshold 0.351904229467, 100 windows`.
- `py -3.12 -m pytest scripts/tests/test_publish_model_archive.py scripts/tests/test_publish_tools.py -x -q`: pass.
- Determinism: the four 05-12 test modules plus the original trainer tests (34 tests) were run three times in a row, 34 passed each time, and the OOD `--check` passed afterwards.
- Full suite `py -3.12 -m pytest -q` (log in the scratchpad): 808 passed, 1 skipped, 1 failed. The failure is the known Windows CRLF noise `scripts/tests/test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent`; it rewrote `data/audio-manifest.json` and two dashboard fixtures, which were restored with `git checkout --` and never committed. (This run's log has no final summary line, so the counts are tallied from the progress dots.)
- Acceptance: `model_config.json` prints `interim-real-only-2026.10.1 preproc-2026.10.1-reef-audio 3`; `git check-attr diff` on the npz is `unset`; `grep -c "Phase 12"` on the report is 2; the OOD sidecar prints `1 cosine_distance v2/ood_reference.f32 100`; `publish_model.py --help` lists `--archive-version`.
- No AWS call of any kind was made in this plan.

## Task commits

1. `90c8b65` test(05-12): failing tests for the interim successor model (RED)
2. `ba9ce01` feat(05-12): train interim successor model on re-embedded rows (tracer, GREEN)
3. `d03938a` test(05-12): failing tests for the OOD reference calibration (RED)
4. `3e7a295` feat(05-12): OOD reference with leave-one-site-out p95 threshold and --check
5. `eae9a41` test(05-12): failing tests for the create-only model archive mode (RED)
6. `3f9fd72` feat(05-12): create-only S3 archive mode for a model version

## Deviations from Plan

**1. [Tracer gate] No human checkpoint.** The tracer (Task 1) was committed and its `<verify>` re-run end to end before the expansion tasks (it passed); because this ran as a non-interactive worktree executor, no `checkpoint:human-verify` was returned.

**2. [Minor] Trainer and publish_model line endings.** `scripts/train_interim_real_only.py` was a CRLF working copy on this Windows checkout; it is now LF (the git index is LF, and the diff is 230 added, 34 removed lines, no whitespace noise). The trainer now writes `model_config.json` and `TRAINING-REPORT.md` with LF newlines in both modes (on Windows the original path would previously have written CRLF); the npz bytes and the config keys of the original path are unchanged.

**3. [Minor] Third OOD source input.** The sidecar pins three source inputs (`reembedded.f32`, `reembedded.json`, and `rows.json` via `reembedded.json`'s `source_rows`), not only the two the plan names, so the OOD reference and the model config pin the same set.

**4. [Design] `MODELS_ROOT` constant** in `publish_model.py` so the DIR-inside-`models/` refusal is testable with moto and a temporary directory.

**5. [Dangling pointer until 05-13]** The successor's `evaluation_note` and report name `models/interim-real-only/evaluation/REPORT.md`, which 05-13 creates. Until then the pointer does not resolve; 05-13 must write that file (it is in its plan's file list).

No auth gates, no architectural changes.

## Notes for downstream plans

- 05-14 (contract v2): `model_version` for the successor should take `config_sha256` = `348b20a2b41b323f354fe4094087b2d81fa98585ac292fe94aee44338f52ffbd` (LF bytes), `weights_sha256` above, `preprocessing_spec_version` `preproc-2026.10.1-reef-audio`, weights location `s3://reefradar-2477-embeddings/models/archive/interim-real-only-2026.10.1/reef_classifier_weights.npz` (only truthful after 05-16 archives it), and the OOD artifacts `ood_reference` (the sidecar) and `ood_embeddings` (the bytes of `reembedded.f32`, published as `v2/ood_reference.f32`).
- 05-16: run `py -3.12 scripts/publish_model.py --archive-version models/interim-real-only-2026.10.1 --dry-run`, then `--confirm`; the live `models/` keys are not written by this mode.
- 05-13: the LOSO on the re-embedded rows is the first grouped evidence for the successor; this plan makes no claim about it.

## Known Stubs

None.

## Threat Flags

None. T-05-12-01 (training inputs pinned by sha256 in the config; reproduction test), T-05-12-02 (archive writes only under `models/archive/<version>/` create-only; moto test asserts live keys unchanged), T-05-12-03 (weights are float32 arrays saved with `numpy.savez`; the loader uses `allow_pickle=False`), T-05-12-04 (`--check` and the self-check test recompute the threshold from the committed rows).

## Self-Check: PASSED

All created files exist (`models/interim-real-only-2026.10.1/{model_config.json,reef_classifier_weights.npz,TRAINING-REPORT.md,ood_reference.json}`, `scripts/build_ood_reference.py`, the three new test files), and the six commits above are present in `git log`.
