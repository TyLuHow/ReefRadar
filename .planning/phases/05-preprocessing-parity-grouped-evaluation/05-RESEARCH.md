# Phase 5: Preprocessing Parity & Grouped Evaluation - Research

**Researched:** 2026-10-12
**Domain:** Serverless audio preprocessing library (pure NumPy), per-window SurfPerch classification, offline grouped model evaluation, additive data-contract publish
**Confidence:** HIGH on code facts and measured numbers; MEDIUM on cross-host numerical determinism and on what the model's authors normalised at training time

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### reef_audio library and parity test
- Normalization matches what SurfPerch's own reference wrapper (perch-hoplite) does. Planning research must confirm whether it peak-normalises each window to a target peak. If it does not, apply no normalization beyond PCM full-scale scaling, identical for every bit depth and channel count. In both cases persist each window's pre-normalisation peak and RMS dBFS as descriptive fields (they feed the WindowStrip energy cells).
- Anti-aliased resampling is a pure-NumPy windowed-sinc (Kaiser) polyphase resampler inside `reef_audio`, unit-tested against `scipy.signal.resample_poly`. scipy is used in tests only, because the Lambdas have only the NumPy 1.26.4 layer.
- The library is a single stdlib+NumPy module, `lambdas/shared/reef_audio.py` (same pattern as `contract_stamp.py`). It covers WAV decode (fix float32 read as int32, add 24-bit, fix 8-bit scaling), mono mix, scaling, resample to 32 kHz, 5 s non-overlapping windows (trailing partial window dropped) and a `SPEC_VERSION` constant. It is bundled flat into the preprocessor and classifier zips. Offline scripts import it through `lambdas/shared`. The inference container is NOT rebuilt (its tensorflow-cpu pin is open-ended); it receives exact 160,000-sample windows, and the classifier asserts window count and length line up (inference silently skips short segments today).
- Parity: windows must be bit-identical in CI (NumPy 1.26.4 on both sides). Inputs are the 9 committed real MARRS excerpts plus generated edge cases (stereo, 44.1/48/96 kHz, 24-bit, float32), with the live handler run under moto against the offline function. Embeddings are compared against a recorded fixture (same windows through the live preprocessor→inference path and through the offline script) within tolerance: cosine ≥ 0.99999, max abs diff ≤ 1e-5. The fixture is committed with its sha256 and regenerated only by a `live`-marked test.

#### Analysis results and legacy /visualize compatibility
- `classification` keeps its exact shape. Probabilities = mean of the per-window probability vectors (still sums to 1), label = argmax, confidence = max. `embedding_summary.aggregation` becomes `mean_of_window_probabilities`. No mean-pooled embedding is ever classified.
- `similar_sites` stays top-3 with the same entry shape (production's legacy UI maps every entry). A new additive `site_similarities` lists all 48 acoustic-reference sites in contract row order with recording-level score (mean of per-window cosines) and rank. The 6 location-only sites are listed as having no embedding, never invented.
- A new `projection` key (per-window x/y, recording centroid, explained_variance_ratio, contract version and the ~33% explained-variance note) uses the contract v1 PCA bundled into the classifier zip. The legacy `visualization` key is never repopulated (production would redraw its scatter without the caveat; D-13).
- Per-window data live compactly, column-wise, in the RESULT item: site order stored once, ≤120 windows × 48 similarities ≈ 40–50 KB, under the 400 KB item limit at the 600 s cap. Each window record holds index, start_s, probabilities, nearest site, OOD fields and level. Per-window embeddings go to S3 `processed/{analysis_id}/embeddings.f32`. The router `/visualize` whitelist is extended additively.
- Acoustic OOD is a new top-level `ood` object: per-window status and distance plus a recording summary ("k of n windows outside"). It sits beside the unchanged geographic `classification.region` (D-12) and never alters or withholds probabilities. No abstain rule in Phase 5.

#### Grouped evaluation and OOD calibration
- Leave-one-site-out: 5 folds that retrain the exact interim recipe (`scripts/train_interim_real_only.py`, seed 42) on 4 sites and test the held-out site's 20 windows. The ind_N1 fold is reported as "restored_early not evaluable: class absent from the training fold", with its predicted distribution shown but excluded from macro or balanced averages. Regions are reported per country (Indonesia 4 sites, Kenya 1). The old 100% random-split figure is marked invalid in the report.
- Bootstrap: two-level cluster bootstrap (resample sites with replacement, then windows within each site), B = 10,000, fixed seed, percentile 95% intervals. An interval is reported only where a group has ≥2 sites; otherwise "CI not estimable (1 site)". Every metric carries n_sites and n_windows.
- Re-embed the 100 training files through `reef_audio` (figshare HTTP range fetch plus about 10 serial inference calls, under $1). Run LOSO on both the original and the re-embedded sets, and state which matches serving. The OOD reference set uses the re-embedded windows. Deployed weights stay unchanged (retrain is Phase 12). Spec v2 records the known gap "model trained on preproc v1 embeddings → Phase 12".
- OOD metric: cosine distance from each window to its nearest training window (k=1). The threshold is calibrated leave-one-site-out (each training site's nearest-neighbour distances to the other 4 sites, 95th percentile), frozen into a versioned OOD artifact with its sha256, bundled into the classifier zip. The threshold is returned with every distance.

#### Rollout, versioning and autonomy
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

### Deferred Ideas (OUT OF SCOPE)
- Retrain on re-embedded data and publish an `interim-real-only` successor (Phase 12).
- Abstain when windows are OOD (Phase 12, ML-05; Phase 9 may read `ood` for "can't tell").
- Leave-one-country-out as a secondary evaluation view.
- Rebuild the inference container with a pinned TensorFlow version (a later phase, before any embedding change).
- Re-embed the 54 reference sites through `reef_audio` and close F8d (Phase 11).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ML-01 | One shared audio-preprocessing library (anti-aliased resampling, consistent normalization, 5 s windowing) used by offline jobs and live Lambdas | Q1 (normalisation spec), Q5 (resampler parameters, measured tolerance vs scipy), binary-safe packaging fix, parity-test design, WAV decode edge cases |
| ML-02 | Live pipeline classifies each 5 s window individually and persists per-window probabilities and similarities | Per-window classifier math, column-wise DynamoDB layout and size budget (Q7), binary segment transport, alignment assertion, rollout compatibility |
| ML-03 | Grouped leave-one-site-out evaluation with bootstrap CIs per class and per region | Q6 outline, measured prototype results on the real 100 training windows, re-embedding feasibility (all 100 files verified on figshare) |
| ML-06 | OOD status from distance to training data, reported separately from class probabilities | LOSO-calibrated k=1 cosine NN design, measured distance distributions, artifact layout and publish path (Q8) |
| ML-08 | Similarity to all reference sites and projection coordinates with explained variance for every analysis | Bundled contract v1 embeddings/projection, all-48 cosine matrix, projection round-trip test against published site coordinates |
</phase_requirements>

## Summary

The eight priority questions all have evidence-backed answers (next section). Four findings change how this phase should be planned and are stated up front because the planner would not guess them from CONTEXT.md.

**1. Switching to `reef_audio` moves every embedding a long way, and the deployed MLP and the 48 reference vectors were built in the old space.** Measured with SurfPerch run locally on the 54 windows of the 9 committed excerpts: the same window embedded through the deployed serving path and through the new path (polyphase resample, perch-hoplite normalisation) has a mean cosine of only 0.23 to 0.26 (some negative). The deployed MLP then calls nearly every new-pipeline window `degraded`, and a recording's cosine to its own site's reference vector falls from 0.60 to 0.19. The training path (file peak-normalised to 1.0, linear interpolation) is itself 4 to 5 times hotter than the reference wrapper's 0.25 peak, and the resampler difference alone gives cosine 0.19. Phase 5 can still follow CONTEXT (it records this as a known gap, Phase 12 retrains), but the plan must (a) measure the shift on the actual 100 training files in the re-embedding step, (b) word F8a/F8c closure as "serving and offline now share one pipeline", not "train/serve skew closed", and (c) tell the owner that the legacy production UI's top-3 similarity percentages and class labels will visibly change.

**2. The honest LOSO result is far below chance.** Prototyped on the real `training_test_20.json`: over the four evaluable held-out sites, 5 of 80 windows are correct (degraded recall 1/40, healthy recall 4/40, balanced 6%). The model learned site identity, not reef health. The report and the Methods copy must be written for that outcome, not for a mildly disappointing one.

**3. The zip packager corrupts binary members.** `scripts/lambda_packaging.py:86-92` and `scripts/deploy-lambdas.py:101` pass every member through `normalize_text_bytes` (CRLF to LF). Bundling `embeddings.f32` (and any `.npz`/binary OOD file) into the classifier zip would silently corrupt it whenever the bytes contain 0x0D 0x0A. That must be fixed (suffix-based binary allowlist in both readers) before any binary member is added.

**4. The contract fixture collision is wider than `mock-api.ts:67-68`.** A real `contract/v2.json` collides with the fixture at `contracts/fixtures/bucket/contract/v2.json`, `fixtures/latest-v2.json`, the parity corpus, `check_contract.py` pointer resolution (bucket path wins), `contract-published.test.ts` ("a version unknown to this build" uses v2), nine web test and support files (four unit tests, one unit helper, three e2e specs, one e2e helper) and one Python test file. Also `check_contract.py:251-252` forces `model_version.preprocessing_spec_version == manifest.preprocessing_spec_version`, which is semantically wrong for v2 (the model was trained under the old spec). Both need planned changes (details in Q8).

**Primary recommendation:** Build `reef_audio` first with scipy-parity tests and a binary-safe packager, use perch-hoplite's per-window normalisation (DC removal, peak 0.25) and scipy's default Kaiser design (beta 5.0, half-length 10 x max(up, down)) frozen into `SPEC_VERSION`, move segments to binary float32 with ranged S3 reads, store per-window data column-wise (about 48 KiB at 120 windows), publish contract v2 by reusing v1's dataset artifacts by URI, and run the Wave 0 embedding-drift probe before anything is deployed.

## Priority Question Answers

### Q1. Does the reference wrapper peak-normalise each window? YES

`TaxonomyModelTF` (the class perch-hoplite uses for SurfPerch) has `target_peak` defaulting to 0.25, and `batch_embed` frames the audio, normalises every frame, and only then calls the SavedModel. [VERIFIED: github.com/google-research/perch-hoplite main @ 302319e (2026-07-08), fetched and read this session]

| Fact | Source (path:line) | Verbatim |
|------|-------------------|----------|
| default target peak | `perch_hoplite/zoo/taxonomy_model_tf.py:54` | `target_peak: float | None = 0.25` |
| SurfPerch loader sets it too | `taxonomy_model_tf.py:137` | `'target_peak': 0.25,` |
| applied per frame before the model | `taxonomy_model_tf.py:274` | `framed_audio = self.normalize_audio(framed_audio, self.target_peak)` |
| the SURFPERCH preset does not override it | `perch_hoplite/zoo/model_configs.py:223-233` | `elif preset_name == ModelConfigName.SURFPERCH:` (sets window 5.0, hop 5.0, sample_rate 32000, tfhub_version 1, tfhub_path; no `target_peak`, so the dataclass default 0.25 applies) |
| the normalisation itself | `perch_hoplite/zoo/zoo_interface.py:157-160` | `framed_audio -= np.mean(framed_audio, axis=-1, keepdims=True)` / `peak_norm = np.max(np.abs(framed_audio), axis=-1, keepdims=True)` / `framed_audio = np.divide(framed_audio, peak_norm, where=(peak_norm > 0.0))` / `framed_audio = framed_audio * target_peak` |
| framing | `zoo_interface.py:124-146` | `librosa.util.frame(... frame_length ... hop_length ...)`, audio shorter than a frame is `pad_center`ed; trailing partial frames are not produced |

**Policy for `reef_audio` (matches the locked decision, branch "it does normalise"):** per 5 s window at 32 kHz, subtract the window mean, divide by the window's max absolute value, multiply by 0.25; an all-zero window stays all zeros. Persist `peak_dbfs` and `rms_dbfs` of the window **before** this step (after resampling, before DC removal).

Evidence that it matters (local SurfPerch run, 54 windows, 9 excerpts) [VERIFIED: local experiment `exp1.py`, scratchpad]: the same polyphase-resampled windows embedded at file-peak 1.0 versus the wrapper normalisation have mean cosine 0.934 (min 0.83); legacy serving with and without the wrapper normalisation: 0.797 mean (min 0.44). SurfPerch is not gain/DC invariant.

Three traps:
- `np.divide(x, peak, where=peak > 0)` without `out=` leaves **uninitialised memory** in positions where the condition is false. A digital-silence window would get garbage. `reef_audio` must branch explicitly (zeros in, zeros out). [CITED: NumPy ufunc `where` semantics; the upstream line is verbatim above]
- The real MARRS files are AudioMoth recordings with peaks near 0.2 of full scale (`ken_H1_20230222_130800.WAV`: peak 6768 of 32768 = 0.207, header says "at low gain"). [VERIFIED: range-fetched from figshare this session] The training pipeline peak-normalised each whole 60 s file to 1.0 (`scripts/generate_training_embeddings.py` `preprocess_audio`: `samples = samples / max_val`), i.e. about 4.8 times louder than the wrapper's 0.25 for that file.
- Digital silence still yields a finite, plausible-looking embedding (all-zero window: finite, L2 norm 2.53). [VERIFIED: local SurfPerch run] The persisted `peak_dbfs` must therefore drive a `silent` flag, and -inf must never reach DynamoDB (see Pitfalls).

### Q2. `serving_default` output keys and shapes; is `flatten()[:1280]` the pooled embedding? YES (with a caveat)

Loaded `google/surfperch/tensorFlow2/1/1` with TF 2.21.0 [VERIFIED: local run; model exported with TF 2.16.0 per `m.tensorflow_version`]:

- Input: keyword `inputs`, `TensorSpec(shape=(None, 160000), dtype=tf.float32)`. A single positional tensor also works (`sig(tf.constant(...))` returned the dict), so `inference.py:155` is valid.
- Outputs (dict): `family (N,249)`, `fsd50k_label (N,200)`, `reef_label (N,38)`, **`embedding (N,1280)`**, `label (N,10932)`, `order (N,41)`, `genus (N,2333)`, `frontend (N,500,128)`.
- `inference.py:163` `for key in ['embeddings', 'embedding', 'output', 'output_0']:` finds `embedding` (the first key in the list that exists). `inference.py:176` `embedding = np.array(embedding).flatten()[:EMBEDDING_DIM]` is therefore the full pooled 1280 vector for a batch of one. It is correct only because the handler embeds one window per call; for a batch it would return only the first row. The fallback "first dict value" would have been `family` (249 values) but is never reached.
- The perch-hoplite wrapper reads the same key: `taxonomy_model_tf.py:289` `embeddings = outputs.pop('embedding')`.
- Consistency with the audit's observation (`DATA-MODEL.md`): per-element range about -0.20 to +0.30 earlier; the 54 new-pipeline windows have range [-0.21, 1.25], L2 about 3.5; legacy-path windows L2 about 2.6.

### Q3. kagglehub handle pinning

- Production uses `MODEL_HANDLE = 'google/surfperch/tensorFlow2/1'` (`infrastructure/lambda_container/inference.py:29`), tried first of `handles_to_try = [MODEL_HANDLE, 'google/surfperch/tensorFlow2', 'google/surfperch']` (`inference.py:46-50`). [VERIFIED: file read]
- With kagglehub 1.0.2: the 4-component handle resolves to `.../tensorFlow2/1/1` (variation "1", version "1"); the 5-component handle `google/surfperch/tensorFlow2/1/1` resolves to the same directory; the two fallbacks raise `ValueError: Invalid model handle`; `.../1/2` and `.../tensorFlow2/2` return 404. [VERIFIED: local kagglehub run, unauthenticated download of 92.5 MB variables works]
- So today the unversioned handle resolves to version 1 only because no version 2 exists. The pinned form is **`google/surfperch/tensorFlow2/1/1`**; the fallbacks are dead code.
- Integrity pins computed from the downloaded model [VERIFIED: local sha256]: `saved_model.pb` 3,859,615 bytes `22269626eef55b37526468fff2ca951847b3bf9547504490067bbb862def1ae2`; `variables/variables.data-00000-of-00001` 97,026,563 bytes `e2971549fa9747b027ff028a4a038034a84181d2fabc97ae8144936eadde65bc`; `variables/variables.index` 8,491 bytes `4720752f8deaf6694347ef09f024b8b2614495ee8390a5bc17421de581cb580f`.
- Because `inference.py` is a member of `infrastructure/lambda-packages/inference.json`, editing it creates drift until the container is rebuilt. Phase 5 does not rebuild it (locked), so **do not edit `inference.py` in Phase 5**; record the pinned handle and hashes in the preprocessing spec / DEPLOY-LOG and in a `live`-marked check, and carry the code change to the container-rebuild phase.
- The container's TF version is unpinned (`tensorflow-cpu>=2.18.0`, `requirements.txt`) and its resolved version is not recorded in the repo. [ASSUMED: it is whatever pip resolved at the last CodeBuild]

### Q4. TF CPU determinism and the embedding tolerance

Measured on one Windows desktop CPU, TF 2.21.0, 54 windows (poly + reference normalisation variant; the legacy variant gave the same numbers) [VERIFIED: local experiment]:

| Comparison against run "default" | min cosine | max (1 - cosine) | max abs diff |
|---|---|---|---|
| same config, second process | 0.999999881 | 1.2e-7 | 0 (bit-identical) |
| `TF_ENABLE_ONEDNN_OPTS=0` | 0.999999881 | 1.2e-7 | 0 |
| 1 intra-op thread | 0.999999821 | 1.8e-7 | 7.5e-7 |
| oneDNN off + 1 thread | 0.999999821 | 1.8e-7 | 7.5e-7 |
| batch of 6 versus six single calls | 0.99999994 | - | 1.0e-6 |

TensorFlow itself logs: "oneDNN custom operations are on. You may see slightly different numerical results due to floating-point round-off errors from different computation orders."

**Recommendation:** keep the locked tolerance (cosine ≥ 0.99999, max abs ≤ 1e-5). It has about 55x headroom on cosine and 13x on max abs against the largest difference seen across thread counts. A different CPU generation or TF build in the container is unmeasured here. [ASSUMED] that it stays within the same order of magnitude; the `live` regeneration test is where that gets checked (run it twice, cold and warm). The fixture should store the TF version it was recorded on if the inference response can expose it, otherwise record the date and image digest in DEPLOY-LOG.

Real consequence of the anchor design: windows are bit-identical (CI) and inference is deterministic to about 1e-6, so "same audio gives identical embeddings through both paths" reduces to those two facts plus a recorded fixture as a regression anchor.

### Q5. Pure-NumPy Kaiser polyphase resampler matching `scipy.signal.resample_poly`

**Exact design (scipy 1.13.1 defaults, reproduced and measured):**

- `g = gcd(32000, fs_in)`; `up = 32000 // g`; `down = fs_in // g`; if `up == down` return a copy.
- `max_rate = max(up, down)`; `half_len = 10 * max_rate`; `n_taps = 2 * half_len + 1`; cutoff `f_c = 1 / max_rate` (fraction of the Nyquist of the up-sampled rate, so the cutoff is the lower of the input and output Nyquist).
- `h = f_c * sinc(f_c * m)` for `m = arange(n_taps) - half_len`, times `np.kaiser(n_taps, 5.0)`, divided by `h.sum()` (unity DC gain), times `up`.
- Output length `ceil(n_in * up / down)`; output sample `m` is `sum_k h[k] * x_up[m*down + half_len - k]` with `x_up` the zero-stuffed input and zero padding at both ends (zero group delay).
- Polyphase evaluation: for output `m`, `t = m*down + half_len`, phase `r = t % up`, newest input index `t // up`, taps `h[r::up]`. Build the `(up, L)` phase bank once (zero-padded to `L = ceil(n_taps / up)`), gather in chunks (about 32,768 outputs), multiply and `sum(axis=1)` in float64. No BLAS call, so no host-dependent summation order.

| fs_in | up/down | taps | max abs diff vs scipy float64 | notes |
|---|---|---|---|---|
| 16000 | 2/1 | 41 | 8.9e-16 | MARRS excerpts |
| 22050 | 640/441 | 12801 | 1.6e-15 | |
| 44100 | 320/441 | 8821 | 1.1e-15 | |
| 48000 | 2/3 | 61 | 8.9e-16 | |
| 96000 | 1/3 | 61 | 8.9e-16 | |
| 8000 / 11025 | 4/1, 1280/441 | 81 / 25601 | 8.9e-16 / 1.3e-15 | |

[VERIFIED: local prototype `resample_proto.py` against scipy 1.13.1, 12.3 s noise-plus-tone signals]. Output lengths equal scipy's in all cases. scipy run on **float32** input returns float32 and differs from its own float64 result by about 4e-7, so the test must compare against scipy in float64 with tolerance 1e-12, and the float32 end-to-end path against scipy float32 with tolerance 2e-6 (observed 4.8e-7).

**Cost for 600 s of audio** (unchunked-input prototype, float64 whole signal): 16 kHz 8.6 s / 330 MB peak; 44.1 kHz 11.7 s / 608 MB; 48 kHz 11.1 s / 648 MB; 96 kHz 27.5 s / 1140 MB (over the preprocessor's 1024 MB). The shipped version must stream blocks (float32 input, float64 per block with `L` samples of overlap) so peak memory stays near input + output. [VERIFIED: tracemalloc runs]. The router caps uploads at 4 MiB today (`lambdas/router/handler.py:33`, `MAX_UPLOAD_BYTES = 4 * 1024 * 1024`), so the 600 s case is a Phase 10 concern, but the library should not need re-engineering then.

**Filter behaviour you are committing to** (it becomes part of `SPEC_VERSION`) [VERIFIED: local FFT measurements, 0.5-amplitude tones]:

| Case | Polyphase result | Legacy linear interpolation |
|---|---|---|
| 48 kHz, 20 kHz tone (aliases to 12 kHz) | -63.3 dBFS | -6.8 dBFS |
| 48 kHz, 18 kHz tone (aliases to 14 kHz) | -36.6 dBFS | -5.3 dBFS |
| 48 kHz, 17 kHz tone (aliases to 15 kHz) | -21.8 dBFS | -3.9 dBFS |
| 96 kHz, 24 kHz tone (aliases to 8 kHz) | -73.8 dBFS | +0.8 dBFS |
| 48 kHz, 15 kHz passband tone | -9.29 dBFS (input -6.02) | not measured |
| 16 -> 32 kHz, 7 kHz passband tone | -7.70 dBFS (input -6.02) | not measured |
| 16 -> 32 kHz, 7 kHz tone, image at 9 kHz | -38.0 dBFS | -15.3 dBFS |

Kaiser beta 5.0 gives about 54 dB stopband attenuation. The transition band is about 5.1 kHz wide when downsampling to 32 kHz (flat to about 13.4 kHz, stop from about 18.6 kHz) and about 2.6 kHz for 16 -> 32 kHz (flat to about 6.7 kHz, about 1.7 dB down at 7 kHz). Content between 17 and 18.6 kHz is only partly attenuated. Say this in the spec; do not call the result "perfect anti-aliasing".

**Sensitivity warning:** SurfPerch embeddings are sensitive to the filter design for 16 -> 32 kHz upsampling. Using the same 4 excerpts and wrapper normalisation, half-length factor 20 (beta 5.0) gives mean cosine 0.966 (min 0.924) to the scipy-default result, and half-length factor 40 with beta 8.6 gives 0.840 (min 0.643). [VERIFIED: local experiment `exp2.py`]. Keep scipy's defaults: they make "matches `resample_poly`" a one-line claim, and any other choice cannot be validated against the original training pipeline anyway. If a tighter filter is wanted later, scipy accepts explicit taps (`window=h`), so the unit test can still check the polyphase machinery; but the choice changes embeddings and therefore needs a new `SPEC_VERSION`.

**Bound the work.** `up`/`down` come from an untrusted header sample rate: a rate such as 7 Hz gives `up = 32000`, a 640,001-tap filter. Reject sample rates outside a documented range (suggest 4,000 to 192,000 Hz) as `INVALID_AUDIO_FORMAT` before building any filter, and cap taps.

### Q6. Two-level cluster bootstrap with 5 sites

**Outline (tested on the real 100 windows; B = 10,000 runs in 0.7 s in plain Python):**

1. For each fold, train with `train_interim_real_only.train_mlp(X_train, y_train, seed=42)` on all windows of the 4 other sites (80 rows; the function holds out its own stratified 15 percent for early stopping). Labels are the sorted classes present in the training fold (so the ind_N1 fold is a 2-class model). Note the committed model was trained on 85 rows after an outer 15 percent random split (`train_interim_real_only.py:434-438`), which a site-held-out fold does not replicate; say so in the report.
2. Keep per-window predictions (index, true label, predicted label, probability vector) for every fold; every metric is recomputed from these stored predictions.
3. Evaluable groups: classes `degraded` (ind_D2, ind_D3) and `healthy` (ind_H4, ken_H1); `restored_early` (ind_N1 only) is not evaluable because its training fold lacks the class. Regions by country: Indonesia (D2, D3, H4 evaluable; N1 reported but excluded from averages), Kenya (H1 only, so "CI not estimable (1 site)").
4. Replicate b: draw `n_sites` sites with replacement (`RandomState.randint`), then for each drawn site draw its windows with replacement; compute pooled per-class recall (sum correct over sum windows, over drawn sites that carry the class) and balanced accuracy over evaluable classes.
5. Percentile 2.5 / 97.5 over replicates in which the metric is defined; report the fraction of replicates in which it was defined.
6. Use `numpy.random.RandomState(seed)` (frozen legacy stream) or record `numpy.__version__` and `PCG64` in the report, since `default_rng` streams are not guaranteed stable across NumPy versions. [ASSUMED: NumPy compatibility policy]

**Prototype result on the original (legacy-space) embeddings** [VERIFIED: local run of the repo trainer, seed 42]:

| Held-out site | True class | Predicted distribution | Correct |
|---|---|---|---|
| ind_D2 | degraded | healthy 18, degraded 1, restored_early 1 | 1/20 |
| ind_D3 | degraded | restored_early 19, healthy 1 | 0/20 |
| ind_H4 | healthy | degraded 20 | 0/20 |
| ind_N1 | restored_early (class absent from training fold) | degraded 20 | not evaluable |
| ken_H1 | healthy | degraded 16, healthy 4 | 4/20 |

Degraded recall 1/40 = 2.5 percent, healthy recall 4/40 = 10 percent, balanced 6.25 percent. Two-level bootstrap (B = 10,000, seed 20261011): degraded 95 percent interval [0.000, 0.100], healthy [0.000, 0.300], balanced [0.000, 0.175]; each class is undefined in about 6 percent of replicates (both its sites missing from the draw). Also verified: `stratified_split(y, 0.15, 42)` followed by `train_mlp` reproduces the committed `reef_classifier_weights.npz` **bit for bit** on this machine, so the "exact recipe" claim is testable (use a tolerance on CI, because float32 BLAS is not guaranteed identical across hosts; [ASSUMED]).

**Caveats the report must carry:**
- 4 evaluable sites give only 35 distinct site multisets, so the bootstrap distribution is lumpy and the percentile interval is crude. Cameron, Gelbach and Miller (2008) show standard cluster-robust inference over-rejects with 5 to 30 clusters and needed bootstrap-t refinements; with 4 clusters a percentile bootstrap should be read as indicative only. [CITED: nber.org/papers/t0344]
- Resampling both levels double-counts within-cluster variance relative to cluster-only resampling, which Field and Welsh (2007) show is consistent under both transformation and random-effect models, so the locked two-level intervals are conservative (too wide), not too narrow. [CITED: JRSS-B 69(3):369-390]. Two-level is locked in CONTEXT; just state the direction of the bias.
- Sites are confounded with country, dataset recorder and class (all `degraded` sites are Indonesian; one `healthy` site is Kenyan); a held-out site fold measures site-shift, not reef-health generalisation.
- Predicting below chance (6 percent balanced against 50 percent for two evaluable classes) means systematic mislabelling, not noise: say "the model identified sites, not reef health".
- Add trivial baselines (uniform, training-majority) to the report so "below chance" is visible without argument.

### Q7. DynamoDB budget and binary segment transport

**Item size, column-wise layout at 120 windows** (estimated with AWS's documented rules: number about 1 byte per 2 significant digits plus 1; list/map 3 bytes plus 1 byte per element; attribute names counted) [CITED: docs.aws.amazon.com/amazondynamodb/latest/developerguide/CapacityUnitCalculations.html; 400 KB limit: .../Constraints.html]:

| Windows | 9-decimal values (current `convert_floats`) | 4-decimal similarities |
|---|---|---|
| 12 | 5.4 KiB | 3.8 KiB |
| 26 | 11.0 KiB | 7.4 KiB |
| 120 (600 s cap) | 48.3 KiB | 32.0 KiB |

Layout used: per-window columns for index, start_s, three probability columns, nearest-site index, peak and rms dBFS, ood distance, ood flag, 48-wide similarity rows, 2-wide projection rows, plus a 48-entry `site_order` once. The estimate uses my own implementation of the documented rule [VERIFIED: local script `ddb_size.py`], not DynamoDB's meter; assume plus or minus 15 percent. About 8 times under the limit, so there is no need to split the item or move similarities to S3.

**JSON segments versus memory (measured):** `samples[start:end].tolist()` plus `json.dumps` costs 21.9 bytes per sample; 12 windows give 42.1 MB of JSON and 61 MB of live Python floats. Extrapolated [VERIFIED: tracemalloc on 12 windows, linear extrapolation]:

| Case | JSON text | preprocessor peak (limit 1024 MB) | classifier peak (limit 512 MB) |
|---|---|---|---|
| 26 windows (4 MiB WAV at 16 kHz mono, today's reachable maximum) | about 91 MB | about 224-316 MB | about 316 MB |
| 120 windows (600 s) | about 421 MB | about 1036-1457 MB | about 1457 MB |

So JSON works today only because of the 4 MiB upload cap and fails at the 600 s cap (PLAT-05 and Phase 10 raise reachable size). Binary float32 is 76.8 MB at 120 windows (`120 * 160000 * 4`). Recommended transport:

- Preprocessor writes `processed/{analysis_id}/segments.f32` (little-endian float32, windows concatenated, **already normalised**) and a small sidecar `processed/{analysis_id}/preprocessing.json` (spec version, window count, per-window peak/rms dBFS, original rate, duration, sha256 of the `.f32`). The event to the classifier carries `segments_key`, `num_segments`, and `segments_format`.
- Classifier reads by ranged `GetObject` (`Range: bytes=start-end`) one inference batch (10 windows, 6.4 MB) at a time; moto supports ranged GET [VERIFIED: local moto 5.2.3 test]. It builds the JSON batch for the unchanged inference container with `ndarray.tolist()`; float32 to Python float to JSON to float32 round-trips exactly, so the binary and JSON paths give bit-identical inference input. [VERIFIED: reasoning from IEEE-754 repr; also covered by the parity test]
- Keep accepting the old `segments.json` (list-of-lists, no header) during rollout.
- Existing classifier tests use placeholder segments (`["seg-0", "seg-1"]`, `lambdas/classifier/tests/test_handler.py:103-106`); the new alignment assertion will force those fixtures to become real arrays.
- Per-window embeddings: `processed/{analysis_id}/embeddings.f32`, 120 x 1280 x 4 = 614 KB. IAM already allows it (`AmazonS3FullAccess` on the shared role, `infrastructure/resources.json`).

### Q8. Contract v2 publish path

Facts, with the code that enforces them (all read this session):

1. **Additive-only schemas.** `scripts/check_contract.py:605-658` (`additive_problems`) fails when a current schema drops a property name or enum value present in any bundled `v*/schema/*.schema.json` copy. New optional properties, new schema files and new manifest artifact keys are fine (`artifacts` has `additionalProperties: artifact_or_absent` in `contracts/schema/contract-manifest.schema.json`; its `required` list is the 10 existing keys). The existing `preprocessing-spec` schema already fits a v2 spec without edits: `amplitude_scaling` is a free object, `resampling` requires only `method` and `anti_alias_filter`, `serving.window_pooling` is a string, and `schema_version` is `const 1`. `model-version.evaluation` is `["object","null"]`. So the only schema work is: additive optional keys on `analysis-result` (`site_similarities`, `projection`, `ood`, `windows`, ...), the new `evaluation-report` schema, and an OOD-reference schema.
2. **Version-string pattern.** Every version field must match `^[a-z0-9][a-z0-9.+-]*$` (`contracts/schema/analysis-result.schema.json`, `"pattern": "^[a-z0-9][a-z0-9.+-]*$"`). `reef_audio.SPEC_VERSION` therefore cannot contain underscores or capitals (`preproc-2026.10.1-reef-audio` is valid; `reef_audio-v1` is not).
3. **Zod mirror and parity corpus.** `dashboard-next/src/features/contract/schema.ts` mirrors each schema with `z.looseObject`; `tests/unit/contract-schema-parity.test.ts` asserts (a) equal property-key and required sets for every entry of its `PAIRS` list (including `analysis result stamp` -> `AnalysisResultStampBase`), (b) equal regex text, and (c) equal verdicts over `contracts/fixtures/parity-corpus.json`. Adding properties to `analysis-result.schema.json` requires the same keys in `AnalysisResultStampBase` in the same commit, and nested new objects need their own `PAIRS` rows. The corpus builder (`check_contract.py:727-761`) only takes **the stamp artifact** as the representative `analysis-result` instance, so a full-result example fixture must be added to `_corpus_instances` or the new keys get no valid/invalid coverage. Regenerate with `py -3.12 scripts/check_contract.py --write-corpus`.
4. **Builder.** `scripts/build_contract.py` hard-codes `DATASET_VERSION = "reefradar-reference-2026.10.0"` and `PREPROCESSING_SPEC_VERSION = "preproc-2026.10.0-as-deployed"` (lines 631-632), and `build_preprocessing_spec()` regex-parses `SEGMENT_DURATION`, `TARGET_SAMPLE_RATE`, `SEGMENT_SAMPLES`, `MIN_AUDIO_DURATION`, `MAX_AUDIO_DURATION` out of `lambdas/preprocessor/handler.py` (`_parse_constant`, line 638-643). Once the preprocessor delegates to `reef_audio` those constants disappear and a v1 rebuild breaks. `build_contract.py --version 1 --check` is today a no-op (lines 915-924: published versions skip the rebuild), and CI runs only `--version 1 --check` (`.github/workflows/ci.yml` python job), so v2 needs its own recipe (spec read from `reef_audio` constants, not the handler) plus `build_contract.py --version 2 --check` added to CI while v2 is unpublished. The test `test_fixture_files_equal_a_fresh_build` (`scripts/tests/test_contract_fixtures.py:108-109`) is vacuous for the same reason.
5. **Reuse v1 dataset artifacts by URI.** The publisher uploads exactly the artifact URIs listed in the manifest (`publish_contract.py:161-166`) and `SAFE_URI = ^(contract|v[0-9]+)/...` (`check_contract.py:89`) allows any version prefix. The fixture manifests already do this ("v<N+1> reuses every v<N> artifact uri", `build_contract.py:588-592`). v2 can list `v1/sites.json`, `v1/embeddings.f32`, `v1/projection.json` unchanged (the dataset did not change, so `dataset_version` stays `reefradar-reference-2026.10.0`) and add only `v2/model_version.json`, `v2/preprocessing_spec.json`, `v2/stamp.json`, `v2/evaluation_report.json`, the OOD artifacts and `v2/schema/*`. The checker still requires `projection.input_uri == embeddings uri` (`check_contract.py:291`), which holds.
6. **Equality that is wrong for v2.** `check_contract.py:251-252`: `if model.get("preprocessing_spec_version") != manifest.get("preprocessing_spec_version")` -> "model_version artifact: preprocessing_spec_version differs from manifest". In v2 the manifest/stamp spec is the new one while the model was trained under the old one. Recommended: keep `model_version.json.preprocessing_spec_version` equal to the manifest value (serving spec the contract pairs it with), and add an optional `training.preprocessing_spec_version` = `preproc-2026.10.0-as-deployed` (additive; `training` has no `additionalProperties: false`, Zod mirror `ModelTrainingBase` must gain the key). The alternative (changing the equality check) edits the checker's contract and is riskier.
7. **Immutability and pointer order** (all unchanged Phase 2 rules): objects written with `If-None-Match: *`, byte-compared when they exist (`publish_contract.py:207-232`); re-download verify with Cache-Control (`:260-276`); pointer written last with `If-Match` on the ETag read before (`:292-324`); `PUBLISHED.json` updated only after success (`:539-540`); `--confirm` refuses a dirty `contracts/` tree (`:514-519`); budget gate requires `reefradar-2477-ceiling-25` with 3 notifications (`scripts/setup_contract_infra.py:79`; exists per `docs/deploy/DEPLOY-LOG.md`).
8. **Things that must change in the same wave as the manifest:**
   - Fixture renumber. The fixture manifest is served for `contract/v2.json` by `dashboard-next/tests/e2e/support/mock-api.ts:67-68` (`} else if (contractPath === 'contract/v2.json') {` / `file = path.join(CONTRACT_FIXTURES_DIR, 'bucket', 'contract', 'v2.json');`) and `tests/unit/support/contract-fetch.ts:44-45`. Also keyed to "2": `contracts/fixtures/bucket/contract/v2.json`, `contracts/fixtures/latest-v2.json`, `parity-corpus.json` (it records `fixture-manifest/v2`, and the corpus treats `latest-v2` as the representative pointer once `bucket/contract/v2.json` exists, `check_contract.py:736-738`), `check_contract.py:405-409` (a pointer's candidate manifests are searched in `bucket/` first, so `latest-v2.json` would resolve to the real v2 and fail its sha), `build_contract.py:503-621` (`version + 1`), and these tests: `scripts/tests/test_contract_fixtures.py`, `dashboard-next/tests/unit/{contract-client,contract-flip,contract-pin,contract-published}.test(.ts|.tsx)` (contract-published "a version unknown to this build" uses `useContract(2)`), `tests/e2e/{analysis-flow,contract-flip,contract-pin}.spec.ts`. Recommended: move the fixture to a high sentinel version (for example 99) held in one constant, so it never collides again, derive `build_fixture_files` from that constant, and update all of the above plus `contracts/README.md` and `CHANGELOG.md`.
   - `dashboard-next/src/features/contract/published.ts` (`PUBLISHED_MANIFEST_SHA256`) must gain `2:` and `contract-published.test.ts` fails if it differs from `contracts/PUBLISHED.json`. PUBLISHED.json only gains v2 when the publisher succeeds, so this is a post-publish commit.
   - `lambdas/shared/contract_stamp.py:26` `_REPO_STAMP_RELATIVE = os.path.join("..", "..", "contracts", "bucket", "v1", "stamp.json")` and `infrastructure/lambda-packages/classifier.json` (`contracts/bucket/v1/stamp.json` -> `contract_stamp.json`), `scripts/verify_live_truth.py` `DEFAULT_STAMP`, and the stamp tests move to v2.
   - Ordering with deploys: publish v2 (objects, then pointer) **before** deploying a classifier that stamps `contract_version: 2`, otherwise results reference a manifest that does not exist yet (CONTRACT-04).
   - Content type: `content_type_for` returns `application/octet-stream` for `.f32`, JSON for everything else (`publish_contract.py:80-81`). Publish only the JSON evaluation report in the contract and keep the Markdown copy in `models/interim-real-only/evaluation/` (otherwise teach `content_type_for` and the checker about `.md`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| WAV decode, mono mix, scaling, resample, window, normalise, dBFS stats | Shared library `lambdas/shared/reef_audio.py` | Preprocessor Lambda, offline scripts | One implementation so parity is structural, not tested-in |
| Upload validation (duration, sample-rate bounds, size) | Preprocessor Lambda (via `reef_audio` decode errors) | Router (4 MiB cap) | Untrusted bytes are parsed here; typed errors map to ERROR items |
| Segment hand-off | S3 audio bucket (`processed/{id}/segments.f32` + sidecar) | Classifier ranged reads | Removes the JSON memory ceiling |
| Window embedding | Inference container (unchanged) | - | Receives exact 160,000-sample normalised windows |
| Per-window MLP, similarity to 48 refs, PCA projection, OOD distance | Classifier Lambda | Bundled contract data (`embeddings.f32`, `projection.json`, OOD artifact) | Pure NumPy; pinned to the stamped dataset version |
| Result persistence | DynamoDB RESULT item (column-wise) + S3 `embeddings.f32` | - | 48 KiB item, 614 KB embeddings object |
| Response shape | Router `/visualize` whitelist | - | Additive keys only, legacy keys byte-compatible |
| Grouped evaluation, re-embedding, OOD calibration, report | Offline scripts (`scripts/`) | Committed `models/interim-real-only/evaluation/` | Needs figshare + live inference + minutes of CPU; not a Lambda job |
| Versioned artifacts and stamp | Contract bucket / CDN (v2) | `contracts/` in git, Zod mirror | Immutable, hash-pinned, pointer last |
| Consumption of new fields | Web (Phase 9) | - | No UI change in Phase 5 |

## Standard Stack

### Core (all already in the repo; nothing new ships to a Lambda)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python | 3.11 (Lambda zips), 3.12 (CI, local) | runtime | `infrastructure/resources.json` runtime `python3.11`; `ci.yml` python 3.12. Write 3.11-compatible code (`from __future__ import annotations`) |
| NumPy | 1.26.4 | all signal math, MLP forward pass, similarity | The only array dependency the Lambdas have (layer `reefradar-2477-numpy:1`); pinned in `requirements-dev.txt` |
| boto3 / moto | 1.43.106 / 5.2.3 | S3 and DynamoDB in tests | Existing handler tests use `moto.mock_aws` through `lambdas/conftest.py` |
| pytest | 9.1.1 | tests | `pytest.ini`: `pythonpath = scripts lambdas/shared`, `addopts = -q -m "not live"` |
| jsonschema | 4.26.0 | contract schemas | Existing contract tooling |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| scipy | **1.13.1** (dev only) | reference implementation for `resample_poly` parity tests | Tests only; never imported by a handler or by `reef_audio` |
| Python `wave`, `struct` (stdlib) | - | generate test WAVs (PCM 8/16/24/32 bit, float32 via manual header) | Edge-case fixtures built at test time under `tmp_path`, never committed under `public/audio` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-NumPy resampler | scipy / librosa in the Lambda | Not available in the layer; adds package size and a new dependency review. Locked out by CONTEXT |
| `numpy.random.default_rng` | `RandomState` | RandomState's stream is frozen; Generator streams may change across NumPy versions |
| Unpinned `pip install scipy` | pin 1.13.1 | Latest scipy (1.18.1) requires NumPy >= 2.0 and Python >= 3.12, which conflicts with the pinned `numpy==1.26.4`. [VERIFIED: PyPI metadata `requires_dist numpy<2.8,>=2.0.0`] |

**Installation (dev only):**
```bash
# requirements-dev.txt: add one line
scipy==1.13.1
py -3.12 -m pip install --user -r requirements-dev.txt
```

**Version verification:** `py -3.12 -m pip index versions scipy` lists 1.18.1 as latest; 1.13.1 (released 2024-05-23, 25 files on PyPI) is installed locally and was used for every comparison above. [VERIFIED: pip / PyPI JSON this session]

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| scipy (dev-only, pin 1.13.1) | PyPI | first upload 2010-07-27 | about 73M/week (pypistats `last_week` 72,951,636) | github.com/scipy/scipy (PyPI `project_urls.source`) | [SUS] from the seam (reasons `unknown-downloads`, `no-repository`; the seam judged only the latest release, published 2026-08-21) | Approved: false-positive pattern already recorded in STATE (04-05, "the legitimacy seam judges only the latest release"). The `checkpoint:human-verify` is satisfied by the owner's standing approval of "all new test/dev packages" (`.planning/research/DRIVING-QUESTIONS.md`, "Standing owner approvals (2026-10-01)"); executor records the decision in SUMMARY.md |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** scipy (see above; dev dependency only, never in a Lambda package)

No other package is introduced. `tensorflow-cpu` and `kagglehub` were installed in a throwaway venv only to measure the model; they must not be added to `requirements-dev.txt` (fixture regeneration uses the deployed inference Lambda).

## Architecture Patterns

### System Architecture Diagram

```
                      LIVE PATH (zip Lambdas, Python 3.11, NumPy 1.26.4 layer)
 upload (<= 4 MiB WAV)
       |
   [Router] /upload /analyze ---------------------------------------.
       | async invoke                                                |
       v                                                             |
 [Preprocessor]  reef_audio.decode_wav -> mono -> resample_poly_np -> 5 s windows (drop tail)
       |            -> per-window peak/rms dBFS (pre-norm) -> DC removal + peak 0.25
       |  S3 audio: processed/{id}/audio.wav (un-normalised playback copy, clipped int16)
       |            processed/{id}/segments.f32 (+ preprocessing.json sidecar)   [new]
       |            (legacy: processed/{id}/segments.json)                       [still accepted]
       | async invoke
       v
 [Classifier]  read segments (ranged, 10 windows) --JSON batch (S3 temp)--> [Inference container]
       |                                         <-- 10 x 1280 embeddings -------'
       |   assert len(embeddings) == len(windows)  (container skips short segments silently)
       |   per window: MLP -> probs ; cosine to 48 bundled refs ; PCA x/y ; OOD NN distance
       |   recording: mean of window probs -> classification (legacy shape) ;
       |              mean cosine -> site_similarities (48) and similar_sites (top 3) ; ood summary
       |   S3: processed/{id}/embeddings.f32 ;  DynamoDB RESULT (column-wise windows block)
       v
 [Router] GET /visualize/{id} --> legacy keys unchanged + additive keys when present

                      OFFLINE PATH (same reef_audio import via lambdas/shared)
 figshare zips --range fetch--> 100 training WAVs --reef_audio--> first window --> live inference
      --> re-embedded set --> LOSO (train_mlp x5) --> predictions --> two-level bootstrap
      --> evaluation report (JSON + MD) ; LOSO p95 NN distances --> OOD artifact
      --> build_contract v2 --> check_contract --> publish_contract --> deploy classifier
```

### Recommended Project Structure
```
lambdas/shared/
  reef_audio.py            # decode, resample, window, normalise, SPEC_VERSION  (stdlib + NumPy)
  reef_reference.py        # loads bundled embeddings.f32 / sites / projection / OOD with sha256 check (bundled name, else repo path, like contract_stamp.py)
  tests/test_reef_audio.py, tests/test_reef_reference.py
lambdas/preprocessor/handler.py          # thin: S3 in, reef_audio, S3 out, invoke classifier
lambdas/preprocessor/tests/              # new (none exist today): handler + parity tests
lambdas/classifier/handler.py            # per-window pipeline; legacy + binary segment readers
scripts/
  evaluate_loso.py         # folds, predictions, bootstrap, report JSON+MD (imports train_interim_real_only)
  reembed_training.py      # figshare range fetch -> reef_audio -> live inference (live)
  build_ood_reference.py   # LOSO NN calibration -> artifact
  tests/test_loso_eval.py, test_build_contract_v2.py ...
models/interim-real-only/evaluation/     # report.json, report.md, inputs/ (committed compact f32 sets)
contracts/schema/evaluation-report.schema.json, ood-reference.schema.json   # new, additive
contracts/bucket/v2/...                  # new version; dataset artifacts referenced from v1/
infrastructure/lambda-packages/{preprocessor,classifier}.json   # add reef_audio.py, reef_reference.py, data members
```

### Pattern 1: One decode-to-windows function, two callers
**What:** `reef_audio.audio_to_windows(wav_bytes) -> (windows[n,160000] float32, stats)` is the only place that decides decode, scaling, mix, resample, window and normalise. The handler and `scripts/` both call it; parity is then a test that both call sites hand the model the same bytes.
**When to use:** every new analysis, every offline embedding job.
**Example:** see Code Examples.

### Pattern 2: Dual-path data loading for bundled files
**What:** the `contract_stamp.py` / `site_provenance.py` idiom: prefer a flat file next to the module (Lambda zip layout), fall back to a path relative to the module in a checkout. Reuse it for `reef_reference.py`.
**Example:** `contract_stamp.py:25-26` `_BUNDLED_FILENAME = "contract_stamp.json"` and `_REPO_STAMP_RELATIVE`.

### Pattern 3: Backward-compatible readers first, writers second
Classifier and router deploy accept both segment formats and both result shapes; the preprocessor deploys last. Roll back with `--ref`.

The router's `/visualize` is an explicit whitelist: `lambdas/router/handler.py:513-526` returns exactly `analysis_id`, `status`, `contract_version`, `dataset_version`, `model_version`, `preprocessing_spec_version`, `stamp_status`, `classification` (`item.get('classification', {})`), `similar_sites`, `similar_sites_error`, `visualization` (`item.get('visualization', {})`), `embedding_summary`, `caveats`. Add the new keys (`site_similarities`, `projection`, `ood`, `windows`, input stats) only when the stored item has them, so old items return the identical legacy key set. `embedding_summary.aggregation` is not read anywhere in `dashboard-next/src` (grep: no match), so changing it to `mean_of_window_probabilities` is safe for the legacy UI. The API client does no runtime schema validation of `/visualize` (`src/lib/api.ts` has no zod/safeParse), so additive keys cannot break it. [VERIFIED: files read, greps run this session]

### Anti-Patterns to Avoid
- **Re-implementing decode/scale/resample in `scripts/`.** That is how the four F8 skews arose.
- **Importing scipy anywhere outside tests.** It is not in the layer.
- **Classifying a pooled embedding "just for the top-3".** CONTEXT: no mean-pooled embedding is ever classified; the top-3 uses mean of per-window cosines.
- **Filling `visualization`.** The legacy UI would redraw its scatter without the caveat (D-13).
- **Scaling probabilities by OOD.** `ood` is reported beside the probabilities and never changes them (D-12).
- **Editing `inference.py` or the Dockerfile in this phase.** It creates drift against a container that is not rebuilt.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resampler reference | A second, unverified resampler | `scipy.signal.resample_poly` in tests only | Gives a ground truth to 1e-15 |
| Float rounding for DynamoDB | New rounding code | existing `convert_floats` + `STORED_FLOAT_DECIMALS = 9` (`classifier/handler.py:29-43`), after converting numpy scalars to Python types | Probabilities sum to 1 within 1e-8 is a tested invariant |
| Contract immutability, pointer flip, budget gate | A new publish script | `scripts/publish_contract.py` | Already conditional-write safe and tested |
| Package determinism, rollback, drift | New zip logic | `scripts/lambda_packaging.py` + `deploy-lambdas.py` + `drift-check.py` (with the binary-safe fix) | D-03/D-04 discipline |
| Stamp coverage logic | New stamp code | extend `contract_stamp.stamp_for_model` | One tested function |
| MLP training recipe | New trainer | `scripts/train_interim_real_only.py` (`train_mlp`, `stratified_split`, `predict_proba`) | CONTEXT locks "the exact interim recipe"; reproduces the committed weights bit for bit locally |
| PCA | Re-fit | the bundled `projection.json` mean/components; `contract_lib.pca_2d` for tests | Published, verified to 1e-8 / 2e-6 |
| Cosine for 48 refs | Python loops | normalise rows once, one matmul | 120 x 1280 @ 1280 x 48 |

**Key insight:** the risky parts of this phase are not algorithms; they are the places where two copies of the same decision can diverge (decode, normalisation, stamp version, bundled data, fixture versions). Every task should remove a second copy rather than add a check for it.

## Runtime State Inventory

This phase replaces the preprocessing format of a running pipeline, so the runtime-state categories apply.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing RESULT items in `reefradar-2477-metadata` (legacy shape, some stamped v1, some unstamped) and `processed/*/segments.json` objects in the audio bucket | None for old data: `/visualize` must keep serving legacy items unchanged (new keys omitted when absent). No migration |
| Live service config | Lambda env vars and layer are in `infrastructure/resources.json`; no new env var is required if bundled data replaces the S3 reference read. Classifier 512 MB / 120 s, preprocessor 1024 MB / 180 s are not changed by `deploy-lambdas.py` (it only calls `update_function_code`, `deploy-lambdas.py:155`) | Decide whether any configuration change is needed (see Open Questions); none is expected for the 4 MiB cap |
| OS-registered state | None - verified: no scheduled tasks reference these functions | None |
| Secrets / env vars | None renamed. `KAGGLE_CONFIG_DIR=/tmp` stays on the inference function | None |
| Build artifacts | Warm Lambda containers cache `_reference_embeddings`, model weights, stamp at module level (`classifier/handler.py:60-67`); old reference S3 objects `reference/metadata_v6.json` remain and the router `/sites` still reads them | After deploy, cold-start behaviour covers cache; do not delete S3 reference objects (the router uses them) |

**In-flight mixing during rollout:** an analysis whose preprocessing finished under the old preprocessor can be classified by the new classifier. The classifier must read the format from the event/sidecar and stamp what actually produced the windows (see Pitfall 9).

## Common Pitfalls

### Pitfall 1: The packager corrupts binary files
**What goes wrong:** `embeddings.f32` (and a binary OOD file) bundled into the classifier zip silently changes wherever the bytes contain CR LF.
**Why:** `scripts/lambda_packaging.py:86-92` `_default_reader` ends `return normalize_text_bytes(data)`; `scripts/deploy-lambdas.py:101` `return pkg.normalize_text_bytes(result.stdout)`; the docstring states "Every member these specs ever reference is a text/source file ... never a binary asset". `.gitattributes` marks `contracts/**/*.f32 binary` but the readers ignore that.
**How to avoid:** decide by suffix (`.f32`, `.npz`, `.bin`) inside one shared helper used by `_default_reader`, `git_show_reader` and drift-check; old specs have no binary members so `--ref` rollback is unaffected.
**Warning signs:** a test that builds the classifier package and compares the member bytes to `contracts/bucket/v1/embeddings.f32` byte for byte (the 245,760-byte file has an expected 3 to 4 CR LF pairs by chance; assert on the actual file).

### Pitfall 2: Embedding drift is large and silent
See Summary item 1. Build the Wave 0 probe: embed the 54 excerpt windows through the legacy serving path and the new path, store both, and print per-window cosines. Make the numbers part of spec v2's known gaps and of the SUMMARY.

### Pitfall 3: Legacy UI numbers move
`similar_sites[*].similarity` is currently the cosine of the mean embedding to each reference (`find_similar_sites_with_status`, `classifier/handler.py:830-892`). The new top-3 comes from the recording-level mean of per-window cosines against references built by the old preprocessing; own-site cosine fell from 0.60 to 0.19 in the probe, and class labels collapse toward `degraded`. The production UI formats similarity as a percentage. The shape is unchanged but the values are not, and the owner should be told before deploy (the redesign merge to main is held, but the Lambdas are live for the production UI).

### Pitfall 4: DynamoDB rejects numpy types and non-finite numbers
`TypeSerializer().serialize(np.float32(0.5))`, `np.float64(0.5)` and `np.int64(3)` all raise `TypeError` [VERIFIED: local boto3 check]; `convert_floats` (`classifier/handler.py:35-43`) only converts `float` instances, so numpy float32 and ints pass through unconverted. Convert with `.tolist()`/`float()`/`int()` before building the item. `Decimal('-Infinity')` serialises client-side, but DynamoDB numbers cannot be infinite or NaN [ASSUMED: documented number range]; a silent window's `20*log10(0)` would crash the write. Store a floor (for example -120.0) plus a `silent` flag, or null.

### Pitfall 5: Inference silently drops short segments
`inference.py:253-259`: a segment of the wrong length goes through `preprocess_audio`, and if that returns nothing the segment is skipped, so `len(embeddings) < len(segments)`. Assert `len(embeddings) == n_windows_in_batch`, each of length 1280, finite, per batch; fail with `NO_EMBEDDINGS`-style error rather than mis-aligning windows to embeddings.

### Pitfall 6: WAV edge cases the current reader mishandles
`preprocessor/handler.py:305-306` reads any 32-bit file as `int32` (float32 WAV becomes garbage), `:307-308` 8-bit becomes `(u8 - 128)` then `/32768` (256 times too quiet), 24-bit is rejected, `audio_format` is read but ignored (so `WAVE_FORMAT_EXTENSIBLE` 0xFFFE is not understood), unknown chunks are skipped by `f.read(chunk_size)` with no even-size padding, and `data` size larger than the file is accepted silently. `reef_audio` must handle format tags 1, 3 and 0xFFFE, odd-sized chunk padding, truncated data (trim to whole frames), `num_channels == 0`, and float values outside [-1, 1] (clip when writing the playback `audio.wav`; `(samples * 32767).astype(np.int16)` at `preprocessor/handler.py:127` wraps on overflow).

### Pitfall 7: Fixture collisions (see Q8 item 8) and the checker's spec equality (Q8 item 6)

### Pitfall 8: The OOD gate cannot see the MLP/embedding mismatch
The OOD reference is the re-embedded training windows, i.e. the same space as serving windows, so windows will look in-distribution to `ood` while the MLP (trained in the legacy space) is the thing that is mismatched. Record in the artifact and the spec which embedding space each component lives in, and say so in the report.

### Pitfall 9: Mixed-version stamping during rollout
`result_version_stamp` stamps from the bundled stamp (`classifier/handler.py:797-827`); once the stamp says spec v2, a result built from legacy-format segments would claim v2. Carry the spec version in the segments sidecar (or event). For legacy-format input either stamp it as uncovered (`stamp_status: 'uncovered'`, null versions) or refuse. Extend `stamp_for_model` as CONTEXT says: it must also require `reef_audio.SPEC_VERSION == stamp["preprocessing_spec_version"]`.

### Pitfall 10: `status_map` is dead code, and sites need a source for status/country
`classifier/handler.py:854` defines `status_map = {'H': 'healthy', ...}` and `:863` uses it only if `ref.get('status')` is falsy, which never happens for the v6 objects. When switching to bundled data, take `status`, `country`, `label_source_name`, `label_original` from `contracts/bucket/v1/sites.json` (already provenance-overlaid, `embedding_row` gives the row) and unit-test the new top-3 entry dicts against the old `apply_label_provenance` output for all 48 sites so the legacy shape cannot drift. `label_source` is the dataset key (`dataset_id`) in sites.json; confirm equality in that test.

### Pitfall 11: Workload bounds from untrusted headers
Reject sample rates outside 4,000-192,000 Hz, channel counts above a small bound, `bits_per_sample` not in {8, 16, 24, 32, 64 float}, and declared duration over 600 s **before** decoding the payload or building a filter.

## Code Examples

### Reference normalisation (matches perch-hoplite `zoo_interface.py:157-160`)
```python
# Source: perch-hoplite zoo_interface.normalize_audio, with the where= hazard removed
TARGET_PEAK = 0.25

def normalise_window(x: np.ndarray) -> np.ndarray:
    x = x.astype(np.float64) - x.mean()          # DC removal
    peak = np.abs(x).max()
    if peak > 0.0:
        x = x * (TARGET_PEAK / peak)
    else:
        x = np.zeros_like(x)                      # np.divide(..., where=) would leave garbage here
    return x.astype(np.float32)
```

### Polyphase resampler core (matches scipy `resample_poly` default to 1e-15)
```python
# Source: prototype resample_proto.py / resample_proto2.py (scratchpad), verified against scipy 1.13.1
def design_filter(up, down, beta=5.0, half_len_factor=10):
    m_rate = max(up, down); half = half_len_factor * m_rate; n = 2 * half + 1
    f_c = 1.0 / m_rate
    k = np.arange(n, dtype=np.float64) - half
    h = f_c * np.sinc(f_c * k) * np.kaiser(n, beta)
    return (h / h.sum()) * up

def resample_poly_np(x, up, down, chunk=1 << 15):
    g = math.gcd(up, down); up //= g; down //= g
    if up == down: return np.asarray(x, np.float64).copy()
    h = design_filter(up, down); half = (len(h) - 1) // 2
    L = -(-len(h) // up)
    bank = np.zeros((up, L)); 
    for r in range(up):
        hp = h[r::up]; bank[r, :len(hp)] = hp
    pad = L + 2
    xp = np.concatenate([np.zeros(pad), np.asarray(x, np.float64), np.zeros(pad + 2)])
    n_out = (len(x) * up + down - 1) // down
    y = np.empty(n_out); taps = np.arange(L)
    for s in range(0, n_out, chunk):
        m = np.arange(s, min(s + chunk, n_out), dtype=np.int64)
        t = m * down + half; q = t // up + pad
        idx = np.clip(q[:, None] - taps[None, :], 0, len(xp) - 1)
        y[s:s + len(m)] = (xp[idx] * bank[t % up]).sum(axis=1)
    return y
# Production version must stream blocks of the input (keep float32, convert per block) to stay inside 1024 MB.
```

### Parity test shape (windows bit-identical, live handler under moto)
```python
# lambdas/preprocessor/tests/test_parity.py (outline)
windows_offline, stats = reef_audio.audio_to_windows(wav_bytes)          # offline function
s3.put_object(Bucket=AUDIO_BUCKET, Key=upload_key, Body=wav_bytes)
module = load_lambda("preprocessor"); module.lambda_client.invoke = lambda **kw: calls.append(kw)
module.handler({"upload_id": "u", "analysis_id": "a", "s3_key": upload_key}, None)
raw = s3.get_object(Bucket=AUDIO_BUCKET, Key="processed/a/segments.f32")["Body"].read()
live = np.frombuffer(raw, dtype="<f4").reshape(-1, 160000)
assert live.shape == windows_offline.shape and np.array_equal(live, windows_offline)   # exact
```

### Per-window classifier math (no mean pooling)
```python
# batch forward pass; same operations as classify_embedding (classifier/handler.py:639-649)
x = np.maximum(0, E @ W["w1"] + W["b1"]); x = np.maximum(0, x @ W["w2"] + W["b2"])
logits = (x @ W["w3"] + W["b3"]).astype(np.float64)
e = np.exp(logits - logits.max(axis=1, keepdims=True)); P = e / e.sum(axis=1, keepdims=True)   # (n, K), each row sums to 1
rec = P.mean(axis=0); label = idx_to_label[str(int(rec.argmax()))]; confidence = float(rec.max())
En = E / np.linalg.norm(E, axis=1, keepdims=True); Rn = REF / np.linalg.norm(REF, axis=1, keepdims=True)
S = En @ Rn.T                                   # (n, 48) per-window cosines, rows in contract row_site_ids order
score = S.mean(axis=0); rank = (-score).argsort().argsort() + 1
xy = (E - PROJ_MEAN) @ PROJ_COMPONENTS.T        # (n, 2); centroid = xy.mean(axis=0)
ood_d = 1.0 - (En @ OODn.T).max(axis=1)         # k=1 cosine distance to nearest training window
```
Test: projecting a reference site's own published vector must reproduce that site's `projection` x,y in `sites.json` to within `contract_lib.PCA_COORDINATE_ATOL = 2e-6`.

### Binary-safe member reading
```python
BINARY_SUFFIXES = (".f32", ".npz", ".bin")
def normalize_member_bytes(source: str, data: bytes) -> bytes:
    return data if source.endswith(BINARY_SUFFIXES) else normalize_text_bytes(data)
# use in lambda_packaging._default_reader and deploy-lambdas.git_show_reader
```

### Two-level cluster bootstrap
```python
rng = np.random.RandomState(SEED)
for b in range(B):
    sites_b = [eval_sites[i] for i in rng.randint(0, len(eval_sites), len(eval_sites))]
    win_b = [rng.randint(0, n_s, n_s) for n_s in (len(correct[s]) for s in sites_b)]
    # per-class recall = sum correct / sum windows over drawn sites that carry the class; NaN if none
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Linear interpolation, no anti-alias | Kaiser polyphase (scipy default design) | this phase | Removes aliasing and imaging; shifts embeddings strongly |
| Peak 1.0 per file (training), nothing (serving) | Per-window DC removal and peak 0.25 (reference wrapper) | this phase | Same function for offline and live |
| Mean-pooled embedding classified | Per-window classification, mean of probabilities | this phase | Matches how the model was trained (single windows) |
| JSON float-list segments | Binary float32 with ranged reads | this phase | Memory bound independent of duration |
| S3 `reference/metadata_v6.json` at runtime | Contract-bundled, hash-checked reference data | this phase | Similarity pinned to the stamped dataset |
| Random 15 percent split accuracy (100 percent) | Leave-one-site-out with cluster bootstrap | this phase | Honest, and poor, numbers |

**Deprecated/outdated:** the `status_map` fallback; the two dead kagglehub fallback handles; `resample_linear`; the 8-bit scaling path.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Inference stays within about 1e-6 cosine/abs difference across Lambda hosts and TF builds | Q4 | The locked tolerance (1e-5) could flake; the `live` fixture test would show it and the tolerance would be widened with evidence |
| A2 | The container's TF version is whatever pip resolved at the last build | Q3 | Drift in a rebuild changes embeddings; mitigated by not rebuilding in Phase 5 |
| A3 | SurfPerch's authors trained with the same 0.25 / DC-removed normalisation the wrapper applies | Q1 | If not, wrapper-normalised input is merely a defensible standard, not "the training distribution" |
| A4 | Float32 BLAS in the MLP trainer may differ across hosts, so the committed-weights reproduction should use a tolerance on CI | Q6 | If bit-exact everywhere, a stricter test is possible |
| A5 | `numpy.random.RandomState` streams are stable across NumPy releases | Q6 | The committed report might not reproduce bit for bit on a future NumPy |
| A6 | DynamoDB numbers cannot hold NaN/Infinity | Pitfall 4 | A guard would be unnecessary but harmless |
| A7 | Item-size estimate from the documented rule is within about 15 percent of DynamoDB's meter | Q7 | Still 8x under the limit |
| A8 | Re-embedding uses the first 5 s window of each 60 s file (matching how the training rows were made) | Open Questions | Using all 12 windows changes the row set and the label counts |
| A9 | Lambda per-window inference latency is about 0.4-0.7 s (measured 0.11 s multi-thread and 0.63 s single-thread on a desktop) | Environment | Timeouts at very long recordings (Phase 10) |
| A10 | Wording of F8a/F8c closure ("serving and offline share one pipeline") is acceptable to the owner | Summary | Over-claiming a closed train/serve gap would violate the Core Value |

## Open Questions

1. **Deploy with the old weights on the new embedding space?**
   - Known: probe shows mean cosine 0.23-0.26 between old and new embeddings of the same window; deployed MLP predicts almost all `degraded` on new windows; own-site reference cosine 0.60 -> 0.19.
   - Unclear: whether the owner accepts that visible shift in the live API before Phase 12.
   - Recommendation: follow CONTEXT (locked), but put the measured numbers in the spec's known gaps and the SUMMARY, run the Wave 0 probe on the 100 training files, and add a short decision note for the owner. If the re-embedded LOSO is much better than the original-space LOSO, say so; retraining remains Phase 12.
2. **Commit the LOSO inputs so CI can recompute the report?** `data/training/` is gitignored (`.gitignore:55`). Recommendation: commit compact float32 copies of both 100-row sets (about 512 KB each) plus row metadata under `models/interim-real-only/evaluation/inputs/` (mark binary in `.gitattributes`), so a unit test can regenerate the report within tolerance. The re-embedded set is the same data as the OOD reference artifact.
3. **Classifier timeout/memory:** 512 MB / 120 s are enough for the reachable cases (<= 26 windows). At the 600 s cap (Phase 10) 120 windows at 0.4-0.7 s may approach 120 s plus cold start. `deploy-lambdas.py` cannot change configuration. Recommendation: no change in Phase 5; record as a Phase 10 prerequisite.
4. **Legacy-format input stamping** (Pitfall 9): stamp as `uncovered` (recommended) or refuse.
5. **Should the Markdown report be published in the contract?** Recommendation: no (JSON only), avoids teaching the publisher a new content type.
6. **Fixture sentinel version** (Q8): recommend 99 from one constant.
7. **Which window for re-embedding the training files:** recommendation first window of each file (A8), keeping rows 1:1 with the originals for a paired comparison.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.12 (`py -3.12`) | all scripts and tests | yes | 3.12.10 | - |
| NumPy | library and tests | yes | 1.26.4 | - |
| scipy | resampler parity tests | yes locally; not in `requirements-dev.txt` | 1.13.1 | add pin (see Standard Stack) |
| moto / boto3 / pytest / jsonschema | tests | yes | 5.2.3 / 1.43.106 / 9.1.1 / 4.26.0 | - |
| Node + npm (`dashboard-next`) | Zod mirror, contract tests | yes (used by CI web job) | Node 22 in CI | - |
| AWS CLI v1 (`py -3.12 -m awscli`) | `sts get-caller-identity`, deploy, publish | not called in research | - | none; owner credentials required |
| figshare (range requests) | re-embedding 100 training files | yes: all 5 site zips listed, central directories read, 100/100 training files found, one 1,920,488-byte file fetched | zips 1.0-14.2 GB; about 192 MB of range data in total | - |
| Kaggle model download | optional local fixture check | yes, unauthenticated, 92.5 MB | - | not needed in CI |
| Live inference Lambda | embedding fixture, re-embedding | not called in research | concurrency limit 10 | serial calls, pre-warm first |
| Docker | container rebuild | not needed (container is not rebuilt) | - | - |

**Missing dependencies with no fallback:** none for planning. Live work needs the owner's AWS profile (`sts get-caller-identity` first).
**Missing dependencies with fallback:** scipy pin missing from `requirements-dev.txt` -> add it.

## Validation Architecture

Nyquist validation is enabled (`.planning/config.json` `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.1.1 (Python), Vitest 5 + Testing Library (web), Playwright 1.63 (e2e, fixture-mocked) |
| Config file | `pytest.ini` (`testpaths = lambdas scripts/tests`, `pythonpath = scripts lambdas/shared`, `addopts = -q -m "not live"`); `dashboard-next/vitest.config.ts` |
| Quick run command | `py -3.12 -m pytest lambdas/shared/tests/test_reef_audio.py -x` |
| Full suite command | `py -3.12 -m pytest` then `py -3.12 scripts/check_contract.py --check --additive` and (in `dashboard-next`) `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ML-01 | decode matrix: PCM 8/16/24/32, float32/64, mono/stereo/5-ch, EXTENSIBLE, odd chunk padding, truncated data, bad rates rejected | unit | `pytest lambdas/shared/tests/test_reef_audio.py -k decode` | Wave 0 |
| ML-01 | polyphase equals scipy float64 within 1e-12 and float32 within 2e-6 at 8/11.025/16/22.05/44.1/48/96 kHz; output length equals scipy's | unit | `pytest lambdas/shared/tests/test_reef_audio.py -k resample` | Wave 0 |
| ML-01 | anti-alias: 48 kHz 20 kHz tone <= -50 dBFS after resample; 96 kHz 24 kHz tone <= -60 dBFS | unit | same file `-k alias` | Wave 0 |
| ML-01 | normalisation: mean 0, peak 0.25, silent window stays zeros, no NaN, dBFS fields finite or null+flag | unit | `-k normalise` | Wave 0 |
| ML-01 | window count = floor(n/160000), trailing partial dropped, deterministic bytes across two runs | unit | `-k window` | Wave 0 |
| ML-01 | live preprocessor under moto == offline function, bit-identical, on the 9 excerpts and generated edge WAVs | integration | `pytest lambdas/preprocessor/tests/test_parity.py` | Wave 0 |
| ML-01 | recorded embedding fixture: sha256 of the fixture file; sha256 of each recorded window equals a fresh `reef_audio` window (proves the fixture still corresponds to current preprocessing) | unit | `pytest lambdas/preprocessor/tests/test_embedding_fixture.py` | Wave 0 |
| ML-01 | fixture regeneration through the live inference Lambda; cosine >= 0.99999, max abs <= 1e-5 against stored | live | `pytest -m live lambdas/preprocessor/tests/test_embedding_fixture_live.py` | Wave 0 |
| ML-01 | packaging: classifier/preprocessor zips contain `reef_audio.py`; `embeddings.f32` member bytes equal the source file byte for byte | unit | `pytest scripts/tests/test_lambda_packaging.py lambdas/classifier/tests/test_handler.py -k package` | extend |
| ML-02 | per-window probabilities each sum to 1 within 1e-8; recording probabilities = mean; label = argmax; confidence = max; `aggregation == 'mean_of_window_probabilities'` | integration (moto, stubbed inference) | `pytest lambdas/classifier/tests/test_handler.py -k window` | extend |
| ML-02 | embedding-count mismatch from inference raises a typed error (no silent misalignment) | integration | `-k alignment` | Wave 0 |
| ML-02 | both segment formats accepted; legacy-format input stamped `uncovered` | integration | `-k segment_format` | Wave 0 |
| ML-02 | RESULT item at 120 windows under 400 KiB (estimator), stamped with dataset/model/preprocessing versions, `stamp_for_model` requires `reef_audio.SPEC_VERSION` match | unit/integration | `pytest lambdas/shared/tests/test_contract_stamp.py lambdas/classifier/tests/test_handler.py -k "stamp or item_size"` | extend |
| ML-02 | router `/visualize` returns new keys only when present; legacy-only items return exactly the legacy key set | integration | `pytest lambdas/router/tests/test_visualize_stamp.py` | extend |
| ML-08 | `site_similarities` has 48 entries in contract row order, 6 location-only listed as no embedding; `similar_sites` top-3 entry dict equals the old shape for all 48 sites | unit | `pytest lambdas/classifier/tests/test_handler.py -k similarity` | Wave 0 |
| ML-08 | projection of each reference vector reproduces the published site x,y within 2e-6; explained variance equals `projection.json` | unit | `-k projection` | Wave 0 |
| ML-06 | OOD distance = 1 - max cosine to reference windows; threshold from the artifact is returned with each distance; probabilities identical with and without OOD data | unit | `-k ood` | Wave 0 |
| ML-06 | OOD artifact self-check: stored threshold equals the recomputed LOSO 95th percentile from its own rows; sha256 matches | unit | `pytest scripts/tests/test_build_ood_reference.py` | Wave 0 |
| ML-03 | fold construction (held-out site never in training; ind_N1 flagged "class absent"), seeded determinism, metrics recomputed from stored predictions equal reported | unit | `pytest scripts/tests/test_loso_eval.py` | Wave 0 |
| ML-03 | bootstrap: seeded repeatability, interval brackets the point estimate on synthetic separable data, `n_sites < 2` gives "not estimable", undefined-replicate fraction reported | unit | same file `-k bootstrap` | Wave 0 |
| ML-03 | committed report validates against `evaluation-report.schema.json`, input sha256s match committed inputs, old split accuracy marked invalid | unit | `pytest scripts/tests/test_loso_eval.py -k report` | Wave 0 |
| ML-03 | committed report regenerates from committed inputs within tolerance | unit (slow, about 5 s) | `-k reproduces` | Wave 0 |
| ML-03 | re-embedding the 100 training files via figshare + live inference | live (manual script) | `py -3.12 scripts/reembed_training.py --confirm` | Wave 0 |
| contract | v2 builds and checks; additive; parity corpus current; published history intact | script | `py -3.12 scripts/build_contract.py --version 2 --check`; `py -3.12 scripts/check_contract.py --check --additive`; `--published-history` | extend (CI adds v2 line) |
| contract | Zod mirror parity for the extended `analysis-result` and new schemas; `published.ts` mirrors PUBLISHED.json | unit (web) | `npm test -- contract-schema-parity contract-published` (in `dashboard-next`) | extend |
| rollout | dry-run each function; deploy; `verify_live_truth.py` with v2 stamp and new keys; drift-check MATCH | live/manual | `py -3.12 scripts/deploy-lambdas.py --function <f> --dry-run`; `py -3.12 scripts/verify_live_truth.py`; `py -3.12 scripts/drift-check.py --function all` | extend verify script |

### Sampling Rate
- **Per task commit:** the quick command for the touched module (under 30 s each; the polyphase tests at 600 s of audio are the only slow case and should use 30 s signals).
- **Per wave merge:** `py -3.12 -m pytest` and `py -3.12 scripts/check_contract.py --check --additive`.
- **Phase gate:** CI green (python, web, e2e, visual), then the live rollout checks, then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `lambdas/shared/tests/test_reef_audio.py` - ML-01 decode, resample, normalise, window
- [ ] `lambdas/shared/tests/test_reef_reference.py` - bundled data loading and hash check
- [ ] `lambdas/preprocessor/tests/` (directory does not exist) - handler, parity, embedding-fixture tests
- [ ] `lambdas/classifier/tests/` additions - per-window, alignment, formats, similarity, projection, OOD, item size
- [ ] `scripts/tests/test_loso_eval.py`, `test_build_ood_reference.py`, `test_build_contract_v2.py`
- [ ] Embedding fixture (about 54 x 1280 float32 plus window hashes, committed with sha256), produced by the Wave 0 probe via the live inference Lambda
- [ ] `requirements-dev.txt`: `scipy==1.13.1`
- [ ] Binary-safe packaging fix before any binary member is added

CI facts: the python job installs `requirements-dev.txt` only, runs `pytest`, then `build_contract.py --version 1 --check`, `check_contract.py --check --additive`, `--published-history`. `live` tests are deselected (`pytest.ini`; the only existing live marker is `scripts/tests/test_publish_tools.py:411`). Run one with `py -3.12 -m pytest -m live <path>` (the later `-m` overrides the addopts default). Generated edge-case WAVs belong in `tmp_path` so `check_audio_real` / `validate_audio_manifest` never see synthetic audio under `public/`.

## Security Domain

`security_enforcement` is enabled (ASVS level 1, block on high).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (public API, no accounts) | - |
| V3 Session Management | no | - |
| V4 Access Control | limited | IAM role unchanged; contract bucket stays private behind CloudFront; publisher keeps conditional writes |
| V5 Input Validation | yes | `reef_audio` is the parser of untrusted WAV bytes: bound sample rate, channels, bit depth, declared duration, chunk sizes before allocating; typed `INVALID_AUDIO_FORMAT` / `AUDIO_TOO_SHORT` / `AUDIO_TOO_LONG` errors (existing codes) |
| V6 Cryptography | yes (integrity) | `hashlib.sha256` for bundled artifacts and fixtures; never hand-rolled |
| V10 Malicious code / supply chain | yes | scipy pinned dev-only; no new Lambda dependency; `np.load(..., allow_pickle=False)` for any `.npz`; prefer `.f32` plus JSON; model download pinned by handle and hashes recorded |
| V12 Files and resources | yes | no path built from user input in S3 keys (keys derive from server-generated ids); memory and time bounded by the decode checks |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Crafted WAV: huge `data` size, 0 channels, rate 1-10 Hz producing a giant filter, bits/blockalign mismatch | DoS | Validate header fields against bounds before decoding or designing a filter; read at most the real payload; reject rates outside 4,000-192,000 Hz |
| Decompression-style amplification (long low-rate file resampled up) | DoS | Check declared duration (<= 600 s) and compute output samples from the header before allocating |
| Tampered bundled reference data or OOD artifact | Tampering | `reef_reference` verifies sha256 against constants shipped in the zip; `drift-check` MATCH after deploy |
| Binary member corrupted by text normalisation | Tampering (integrity) | Binary-safe packager plus a byte-equality packaging test |
| Stale or mixed-version stamp | Repudiation / integrity | Stamp from the actual preprocessing version; `stamp_for_model` requires spec equality |
| Presigned or request detail in logs | Information disclosure | Keep the existing practice: no presigned URLs or bodies printed; publisher prints codes only |
| NaN/Infinity or numpy scalars crashing the write | DoS (self) | Convert to Python types, floor dBFS, test the writer with silent audio |

## Project Constraints (from CLAUDE.md)

Extracted from `./CLAUDE.md` and `./.claude/CLAUDE.md`, plus owner memory notes; treat as locked.

- **Deploy discipline:** no console edits; deploy all four `reefradar-2477-*` Lambdas only through `scripts/deploy-lambdas.py`, always `--dry-run` first, `--confirm` to apply, from a clean committed tree; roll back with `--ref <commit>`; confirm with `scripts/drift-check.py --function all`. Package specs are `infrastructure/lambda-packages/*.json`; library is `scripts/lambda_packaging.py`.
- **Integrity (Core Value):** never present synthetic audio as real, an unvalidated model output as a diagnosis, or a number without provenance; no displayed probability that is not a probability; every label shows who assigned it.
- **Probabilities and region:** probabilities and confidence are never scaled or adjusted (D-12); `classification.region` stays descriptive; `visualization` is never repopulated (D-13).
- **Legacy operability:** production `main` serves the legacy UI against the live API; every API change must leave `classification.{label,confidence,probabilities}`, top-3 `similar_sites` and the absent `visualization` as the legacy UI expects.
- **Contract rules:** versions immutable once in `PUBLISHED.json`; schemas additive-only; publisher rules (immutability, budget-alarm gate, pointer last) unchanged.
- **Stack:** Python 3.11 Lambdas (zip, NumPy 1.26.4 layer) and 3.12 container; shared modules are stdlib + NumPy and listed explicitly in each zip spec; AWS CLI v1 via `py -3.12 -m awscli`; budget ceiling $25/month.
- **Web:** new web code lives in `dashboard-next/src/features/**` and may not import `@/components` (ESLint plus `scripts/check-feature-fence.mjs`); only `features/contract` may reach the contract CDN (`scripts/check-contract-fence.mjs`); Zod mirror edits must keep `tests/unit/contract-schema-parity.test.ts` green.
- **Tests:** `pytest -m "not live"` is the default; live tests are opt-in; CI runs web, e2e, python, citations, visual jobs.
- **GSD workflow:** file changes go through a GSD command (planned phase work via `/gsd-execute-phase`).
- **Owner memory:** commit as tylerlubyhoward@gmail.com (never the work address); the redesign branch is not merged to `main` until the overhaul is launch-worthy; keep showing bold design alternatives at UI gates (no UI in this phase).
- **Licensing/attribution** applies wherever audio or derived data appears; this phase adds no new audio surface.

## Sources

### Primary (HIGH confidence)
- perch-hoplite `perch_hoplite/zoo/taxonomy_model_tf.py`, `zoo_interface.py`, `model_configs.py`, `kaggle_hub.py` (main @ 302319e, 2026-07-08) - fetched with curl and read in full for the cited lines
- Local SurfPerch runs (TF 2.21.0, kagglehub 1.0.2, `google/surfperch/tensorFlow2/1/1`): signature, output keys, determinism, preprocessing sensitivity (scratchpad scripts `exp1.py`, `exp2.py`, `analyze1.py`, `analyze2.py`)
- Local prototypes against scipy 1.13.1: `resample_proto*.py`, `json_mem.py`, `ddb_size.py`, `loso_proto.py`, `boot_proto.py`
- Repository files read this session: `lambdas/preprocessor/handler.py`, `lambdas/classifier/handler.py`, `lambdas/router/handler.py` (380-611, 25-34), `infrastructure/lambda_container/inference.py`, `lambdas/shared/*.py`, `infrastructure/lambda-packages/*.json`, `infrastructure/resources.json`, `scripts/{lambda_packaging,deploy-lambdas,build_contract,check_contract,publish_contract,contract_lib,train_interim_real_only,generate_training_embeddings,extract_marrs_excerpts}.py`, `contracts/**`, `models/interim-real-only/**`, `dashboard-next/src/features/contract/{schema,published,stamp}.ts`, `dashboard-next/tests/e2e/support/mock-api.ts`, `.github/workflows/ci.yml`, `pytest.ini`, `.planning/**`
- figshare article 29958062 file listing and ZIP central directories (public API), one range-fetched training file header

### Secondary (MEDIUM confidence)
- AWS docs: DynamoDB item sizes and formats (https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/CapacityUnitCalculations.html); constraints (https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html)
- Field and Welsh (2007), Bootstrapping clustered data, JRSS-B 69(3):369-390 (https://ideas.repec.org/a/bla/jorssb/v69y2007i3p369-390.html)
- Cameron, Gelbach and Miller (2008), Bootstrap-based improvements for inference with clustered errors, REStat (https://www.nber.org/papers/t0344)
- PyPI JSON for scipy and pypistats recent downloads

### Tertiary (LOW confidence)
- None relied upon; unverified statements are tagged [ASSUMED] and listed in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - nothing new ships to a Lambda; scipy is dev-only and was used locally
- Architecture: HIGH - every integration point read in code; transport and layout sized by measurement
- Pitfalls: HIGH for packaging, fixtures, DynamoDB typing and WAV parsing (read or run); MEDIUM for cross-host determinism and for the interpretation of the embedding shift (measured on one machine, 54 windows)

**Research date:** 2026-10-12
**Valid until:** 2026-11-11 (the perch-hoplite wrapper and kagglehub behaviour are stable; re-check the Kaggle model version list before any container rebuild)
