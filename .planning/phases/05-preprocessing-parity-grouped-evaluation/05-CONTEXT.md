# Phase 5: Preprocessing Parity & Grouped Evaluation - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning
**Mode:** Autonomous smart discuss (owner accepted all recommended answers in 4 areas)

<domain>
## Phase Boundary

Offline jobs and the live analysis path share one preprocessing library (`reef_audio`). The live pipeline classifies every 5 s window individually and returns full similarity, projection and acoustic out-of-distribution context. The current interim model gets honest leave-one-site-out metrics with bootstrap intervals, published as a versioned artifact. Requirements ML-01, ML-02, ML-03, ML-06, ML-08.

Out of scope: retraining or replacing the model (Phase 12, ML-04/05/07), abstain logic (Phase 12), batch re-embedding of the 54 reference sites and closing the reference-vector gap F8d (Phase 11), any new UI (Phase 9 consumes the new fields), and rebuilding the inference container.

</domain>

<decisions>
## Implementation Decisions

### reef_audio library and parity test
- Normalization matches what SurfPerch's own reference wrapper (perch-hoplite) does. Planning research must confirm whether it peak-normalises each window to a target peak. If it does not, apply no normalization beyond PCM full-scale scaling, identical for every bit depth and channel count. In both cases persist each window's pre-normalisation peak and RMS dBFS as descriptive fields (they feed the WindowStrip energy cells).
- Anti-aliased resampling is a pure-NumPy windowed-sinc (Kaiser) polyphase resampler inside `reef_audio`, unit-tested against `scipy.signal.resample_poly`. scipy is used in tests only, because the Lambdas have only the NumPy 1.26.4 layer.
- The library is a single stdlib+NumPy module, `lambdas/shared/reef_audio.py` (same pattern as `contract_stamp.py`). It covers WAV decode (fix float32 read as int32, add 24-bit, fix 8-bit scaling), mono mix, scaling, resample to 32 kHz, 5 s non-overlapping windows (trailing partial window dropped) and a `SPEC_VERSION` constant. It is bundled flat into the preprocessor and classifier zips. Offline scripts import it through `lambdas/shared`. The inference container is NOT rebuilt (its tensorflow-cpu pin is open-ended); it receives exact 160,000-sample windows, and the classifier asserts window count and length line up (inference silently skips short segments today).
- Parity: windows must be bit-identical in CI (NumPy 1.26.4 on both sides). Inputs are the 9 committed real MARRS excerpts plus generated edge cases (stereo, 44.1/48/96 kHz, 24-bit, float32), with the live handler run under moto against the offline function. Embeddings are compared against a recorded fixture (same windows through the live preprocessor→inference path and through the offline script) within tolerance: cosine ≥ 0.99999, max abs diff ≤ 1e-5. The fixture is committed with its sha256 and regenerated only by a `live`-marked test.

### Analysis results and legacy /visualize compatibility
- `classification` keeps its exact shape. Probabilities = mean of the per-window probability vectors (still sums to 1), label = argmax, confidence = max. `embedding_summary.aggregation` becomes `mean_of_window_probabilities`. No mean-pooled embedding is ever classified.
- `similar_sites` stays top-3 with the same entry shape (production's legacy UI maps every entry). A new additive `site_similarities` lists all 48 acoustic-reference sites in contract row order with recording-level score (mean of per-window cosines) and rank. The 6 location-only sites are listed as having no embedding, never invented.
- A new `projection` key (per-window x/y, recording centroid, explained_variance_ratio, contract version and the ~33% explained-variance note) uses the contract v1 PCA bundled into the classifier zip. The legacy `visualization` key is never repopulated (production would redraw its scatter without the caveat; D-13).
- Per-window data live compactly, column-wise, in the RESULT item: site order stored once, ≤120 windows × 48 similarities ≈ 40–50 KB, under the 400 KB item limit at the 600 s cap. Each window record holds index, start_s, probabilities, nearest site, OOD fields and level. Per-window embeddings go to S3 `processed/{analysis_id}/embeddings.f32`. The router `/visualize` whitelist is extended additively.
- Acoustic OOD is a new top-level `ood` object: per-window status and distance plus a recording summary ("k of n windows outside"). It sits beside the unchanged geographic `classification.region` (D-12) and never alters or withholds probabilities. No abstain rule in Phase 5.

### Grouped evaluation and OOD calibration
- Leave-one-site-out: 5 folds that retrain the exact interim recipe (`scripts/train_interim_real_only.py`, seed 42) on 4 sites and test the held-out site's 20 windows. The ind_N1 fold is reported as "restored_early not evaluable: class absent from the training fold", with its predicted distribution shown but excluded from macro or balanced averages. Regions are reported per country (Indonesia 4 sites, Kenya 1). The old 100% random-split figure is marked invalid in the report.
- Bootstrap: two-level cluster bootstrap (resample sites with replacement, then windows within each site), B = 10,000, fixed seed, percentile 95% intervals. An interval is reported only where a group has ≥2 sites; otherwise "CI not estimable (1 site)". Every metric carries n_sites and n_windows.
- Re-embed the 100 training files through `reef_audio` (figshare HTTP range fetch plus about 10 serial inference calls, under $1). Run LOSO on both the original and the re-embedded sets, and state which matches serving. The OOD reference set uses the re-embedded windows. Deployed weights stay unchanged (retrain is Phase 12). Spec v2 records the known gap "model trained on preproc v1 embeddings → Phase 12".
- OOD metric: cosine distance from each window to its nearest training window (k=1). The threshold is calibrated leave-one-site-out (each training site's nearest-neighbour distances to the other 4 sites, 95th percentile), frozen into a versioned OOD artifact with its sha256, bundled into the classifier zip. The threshold is returned with every distance.

### Rollout, versioning and autonomy
- Autonomous execution deploys to production under the owner's standing approval (DRIVING-QUESTIONS.md), only through `scripts/deploy-lambdas.py` (D-04) and only after CI is green. Order:
  1. Dry-run every function.
  2. Deploy the classifier and router first. Both must accept the old and new segment formats.
  3. Deploy the preprocessor.
  4. Pre-warm inference.
  5. Run 1–2 serial live analyses of committed excerpts.
  6. Check the legacy fields are unchanged and the new fields and stamps are present.
  7. Roll back with `--ref` on any failure.
  8. Record in DEPLOY-LOG.
  9. Run drift-check until it reports MATCH.

  Verify the AWS profile with `sts get-caller-identity` first. Live work stays serial (account concurrency 10, quota request pending).
- Publish contract v2:
  - A new `preprocessing_spec.json` with a new spec_version. F8a, F8b and F8c are closed with evidence; F8d stays open (Phase 11).
  - `model_version.json` gets `evaluation` filled from LOSO.
  - An additive analysis-result schema for the new keys, plus its Zod mirror and parity corpus.
  - The OOD artifact and the stamp.
  - Extend `stamp_for_model` so it also requires `reef_audio.SPEC_VERSION` to equal the stamp's `preprocessing_spec_version`.
  - Renumber the flipped-flag test fixture that occupies `contract/v2.json` in the test mocks.
  - Publishing follows the Phase 2 publisher rules: immutability, the budget-alarm gate, and the pointer moved last.
- Reference similarity is pinned: bundle the contract's `embeddings.f32` and `row_site_ids` into the classifier zip, so similarity is computed against exactly the stamped dataset_version. This replaces the runtime S3 `reference/metadata_v6.json` read. Also fix the inert `status_map` bug.
- The evaluation report is JSON with a new additive `evaluation-report.schema.json`, inputs pinned by sha256 (training file, trainer git sha, seed, B), plus a rendered Markdown copy. It is committed under `models/interim-real-only/evaluation/` and published in contract v2, referenced from `model_version.evaluation`.

### Claude's Discretion
- Segment transport between preprocessor and classifier: JSON float lists likely OOM well before the 600 s cap. Planning may switch to binary float32 segments in S3, keeping backward compatibility during rollout.
- Exact field names inside `site_similarities`, `projection`, `ood` and the per-window columns, within the decisions above and Phase 2's additive-only schema rule.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lambdas/shared/contract_stamp.py` and `site_provenance.py`: the pattern for shared modules bundled flat into zip Lambdas. `stamp_for_model` is extended here.
- `scripts/train_interim_real_only.py` (seed 42): the recipe the LOSO folds reuse.
- `scripts/extract_marrs_excerpts.py` and `download_marrs_samples.py`: figshare HTTP range fetch for re-embedding.
- Contract publisher (Phase 2, 02-03/02-04), the Zod mirror and parity corpus (02-07), `projection.json` (mean, components, explained_variance_ratio [0.183, 0.147] over 48 rows), and `embeddings.f32` with `row_site_ids`.
- `scripts/deploy-lambdas.py`, `scripts/drift-check.py`, `scripts/lambda_packaging.py`, `infrastructure/lambda-packages/*.json`, `scripts/smoke_live.py`.
- The 9 committed real MARRS excerpts in `dashboard-next/public/audio/marrs/` (16 kHz mono, 54 windows).

### Established Patterns
- Shared modules are listed explicitly in each zip spec. The preprocessor spec currently has only `handler.py`.
- pytest with `lambdas/shared` on the path; `-m "not live"` is the default and live tests are opt-in.
- The deploy discipline: clean tree, dry run, confirm, rollback by `--ref`, drift check MATCH (D-03/D-04).
- Contract versions are immutable once in PUBLISHED.json, and schemas are additive-only.

### Integration Points
- `lambdas/preprocessor/handler.py` (decode, mono, resample, windowing: replaced by `reef_audio`). The preprocessor has no tests yet.
- `lambdas/classifier/handler.py`:
  - :160-166 mean pooling (replaced by per-window classification);
  - :179-202 RESULT item;
  - :676-737 S3 reference read (replaced by the bundled contract embeddings);
  - :830-892 similarity (`top_k=3`, `status_map` bug at :854).
- `lambdas/router/handler.py:512-526`, the `/visualize` whitelist (extended additively).
- `infrastructure/lambda_container/inference.py:253-259` silently skips short segments, so the classifier asserts alignment.
- Phase 4's WindowStrip expects `{index, startS, endS, reading, energyDb}`. Phase 9 consumes the new fields; no UI change in this phase.

</code_context>

<specifics>
## Specific Ideas

- The phase must state these honesty limits in its report:
  - With 5 sites, restored_early (1 site) and Kenya (1 site, 1 class) get no confidence intervals.
  - All-site similarity compares `reef_audio` windows with reference vectors made by the old preprocessing (F8d, open until Phase 11).
- Production `main` still serves the legacy UI against the live API. Every API change must leave `classification.{label,confidence,probabilities}`, top-3 `similar_sites` and the absent `visualization` exactly as the legacy UI expects.
- Research items for planning:
  - Does perch-hoplite's SurfPerch wrapper peak-normalise each window (target_peak)?
  - SurfPerch `serving_default` output keys and shape: is `flatten()[:1280]` the pooled embedding?
  - kagglehub handle pinning.
  - TF CPU determinism across Lambda hosts, to set the embedding tolerance.

</specifics>

<deferred>
## Deferred Ideas

- Retrain on re-embedded data and publish an `interim-real-only` successor (Phase 12).
- Abstain when windows are OOD (Phase 12, ML-05; Phase 9 may read `ood` for "can't tell").
- Leave-one-country-out as a secondary evaluation view.
- Rebuild the inference container with a pinned TensorFlow version (a later phase, before any embedding change).
- Re-embed the 54 reference sites through `reef_audio` and close F8d (Phase 11).

</deferred>
