# Codebase Concerns

**Analysis Date:** 2026-09-30

## Tech Debt

**Streamlit dashboard kept alongside Next.js app:**
- Issue: `dashboard/app.py` (legacy Streamlit UI) remains in the repo and in docs/TO-DOS.md as a tracked migration target, while `dashboard-next/` is now described in `CLAUDE.md` as "primary." Both exist, with duplicated visualization logic (2D embedding scatter, probability bars) reimplemented in both.
- Files: `dashboard/app.py`, `dashboard-next/src/components/*`
- Impact: Confusing for new contributors about which UI is canonical; wasted maintenance surface; stale WSL2-networking workaround notes only apply to the Streamlit app but linger in top-level docs.
- Fix approach: Archive/delete `dashboard/` or clearly mark it deprecated-only-for-reference in README.md and CLAUDE.md.

**Redundant mapping/visualization libraries in dashboard-next:**
- Issue: `dashboard-next/package.json` depends on **three** separate mapping/geo stacks — `leaflet`/`react-leaflet`, `maplibre-gl`, and `@deck.gl/core`+`@deck.gl/layers`+`@deck.gl/react` — plus `recharts`, `wavesurfer.js`, and `framer-motion` all in the same app.
- Files: `dashboard-next/package.json`
- Impact: Significant bundle weight (3 map engines alone commonly add 400-700KB+ gzipped combined), slower cold TTI, duplicated WebGL contexts if more than one map renders on the same page, larger attack/maintenance surface for version upgrades.
- Fix approach: Standardize on one map library (maplibre-gl is the most modern/lightweight choice; deck.gl is only worth keeping if doing large-scale WebGL overlays). Audit actual usage of each before next release.

**Mean-embedding "visualization" is a placeholder 2D projection, not real dimensionality reduction:**
- Issue: `lambdas/classifier/handler.py:552-569` computes 2D coordinates by splitting the 1280-dim embedding vector in half and averaging each half (`np.mean(embedding[:mid])`, `np.mean(embedding[mid:])`) rather than using PCA/UMAP/t-SNE.
- Files: `lambdas/classifier/handler.py:484-513, 552-569`
- Impact: The scatter-plot visualization shown to users has no principled relationship to embedding similarity; two acoustically dissimilar samples could land at the same plotted point. Misleading for a "coral reef health" decision-support tool.
- Fix approach: Precompute a proper 2D projection (PCA fit once on reference embeddings, stored as a transform matrix) and apply it at inference time instead of ad hoc mean-splitting.

**Classification sometimes uses the mean embedding across segments rather than per-segment voting:**
- Files: `lambdas/classifier/handler.py:89` (`mean_embedding = embeddings.mean(axis=0)`)
- Impact: Averaging embeddings across multiple 5s audio segments before classification can wash out localized acoustic events (e.g., a brief snapping-shrimp burst indicating healthy reef) that per-segment classification + majority vote would have preserved.
- Fix approach: Evaluate per-segment classification with majority/confidence-weighted voting as an alternative to mean-embedding classification; compare accuracy.

**Duplicate Lambda handler naming (`handler.py` in 3 directories) with no shared base module:**
- Files: `lambdas/router/handler.py`, `lambdas/preprocessor/handler.py`, `lambdas/classifier/handler.py`
- Impact: Common logic (CORS headers, DynamoDB key schema access, S3 client construction, response formatting) appears to be copy-pasted per-Lambda rather than factored into a shared `lambdas/common/` module. Bug fixes (e.g., a CORS header change) must be applied in multiple places.
- Fix approach: Extract shared helpers (response builder, DynamoDB client, S3 client, error formatting) into a `lambdas/common/` package included via Lambda layer or packaging step.

## Known Bugs / Build-Breaking Issues

**Missing committed files break a fresh clone build (CRITICAL):**
- Symptoms: `dashboard-next/src/app/page.tsx` imports `{ SampleGallery } from '@/components/gallery/SampleGallery'` and `dashboard-next/src/app/experience/page.tsx` imports `{ FALLBACK_SAMPLES } from '@/lib/samples'`, but neither `dashboard-next/src/components/gallery/SampleGallery.*` nor `dashboard-next/src/lib/samples.*` exist in the repository (confirmed via `git ls-files`, not gitignored).
- Files: `dashboard-next/src/app/page.tsx:5`, `dashboard-next/src/app/experience/page.tsx:18`
- Trigger: `git clone` the repo fresh, run `npm run build` or `npm run dev` inside `dashboard-next/` — the build fails immediately with "Module not found."
- Workaround: None currently committed. This is a release blocker for anyone other than the original author's local working tree (which presumably still has the untracked files locally).
- Fix approach: `git add` the missing component/lib files, or remove the imports if the feature was abandoned.

## Security Considerations

**`/upload` and `/analyze` endpoints have no authentication:**
- Risk: `lambdas/router/handler.py` routes `('POST', '/upload')` and `('POST', '/analyze')` directly to handlers with no API key, JWT, or IAM auth check anywhere in the routing table or handler bodies. Anyone with the API Gateway URL (published in `CLAUDE.md` and `README.md`) can upload arbitrary WAV-labeled binary blobs up to 50MB and trigger paid Lambda container inference (SurfPerch/TensorFlow, 3GB/300s) an unlimited number of times.
- Files: `lambdas/router/handler.py:31-45` (route table), `lambdas/router/handler.py:~75-142` (upload handler, size validation only)
- Current mitigation: Only a file-size ceiling (50MB, `lambdas/router/handler.py:101`) and a minimum-size (44-byte WAV header) check. No rate limiting, no auth, no CAPTCHA.
- Recommendations: Add an API Gateway usage plan + API key, or a simple request-signing/HMAC scheme; add AWS WAF rate-based rule; consider API Gateway throttling settings (currently unconfirmed in `infrastructure/resources.json`).

**Wide-open CORS (`Access-Control-Allow-Origin: '*'`):**
- Risk: `lambdas/router/handler.py:421-423` sets `'Access-Control-Allow-Origin': '*'` unconditionally on all responses (including the unauthenticated upload/analyze endpoints), so any origin can call the API directly from a browser.
- Files: `lambdas/router/handler.py:421-423`
- Current mitigation: None — this is intentional for a public demo API but compounds the lack of auth/rate-limiting above.
- Recommendations: If the API is meant to be embedded only by `dashboard-next`, restrict `Access-Control-Allow-Origin` to the known deployed origin(s); otherwise pair the open CORS policy with the auth/rate-limiting fix above.

**Unauthenticated 50MB upload endpoint invokes expensive ML inference:**
- Risk: Combines the two issues above — an anonymous actor can repeatedly POST up to 50MB files to `/upload` then call `/analyze`, each triggering the 3GB/300s container Lambda (`infrastructure/lambda_container/`). This is a direct cost-abuse / DoS vector against the AWS bill described in `COSTS.md` (~$2-3/month at demo volume could spike significantly under abuse).
- Files: `lambdas/router/handler.py`, `infrastructure/lambda_container/inference.py`
- Recommendations: Add Lambda concurrency limits per function, API Gateway throttling, and/or a per-IP rate limit via WAF; consider requiring a lightweight API key for `/upload` and `/analyze`.

**AWS credentials/config convention via `config/aws-env.sh` (gitignored, but process relies on local env export):**
- Risk: `config/aws-env.sh` exports `PROJECT_PREFIX`, `AWS_ACCOUNT_ID`, `ECR_URI`, `LAMBDA_ROLE_ARN`, `SAGEMAKER_ROLE_ARN` — no literal secrets observed in this file, and `.gitignore` excludes `.env`, `.aws/`, `*.pem`. No evidence of committed secrets found during this audit.
- Files: `config/aws-env.sh` (9 lines, account ID and role ARNs only — these are not secrets but do reveal the AWS account ID, which is sensitive operational metadata)
- Current mitigation: File is not committed to git (confirmed absent from `git ls-files`); deployment docs in `CLAUDE.md` assume the operator has this file locally.
- Recommendations: Continue excluding this file; consider documenting required variables in a `config/aws-env.sh.example` template so new contributors don't need to reverse-engineer the deploy scripts.

**No evidence of S3 bucket public-access-block configuration in `infrastructure/resources.json`:**
- Risk: Could not confirm `PublicAccessBlockConfiguration` settings for `reefradar-2477-audio` or `reefradar-2477-embeddings` buckets from the repo alone (this requires live AWS inspection, not just source).
- Files: `infrastructure/resources.json`
- Recommendations: Verify directly in AWS console/CLI that both S3 buckets block public access and that only Lambda execution roles have read/write; this audit could not confirm bucket policy from static analysis.

## Performance Bottlenecks

**Cold starts on the inference Lambda container:**
- Problem: `infrastructure/lambda_container/` packages TensorFlow + SurfPerch (perch-hoplite) into a 3GB-memory, 300s-timeout container Lambda. Container-image Lambdas with ML frameworks commonly see multi-second-to-tens-of-seconds cold starts.
- Files: `infrastructure/lambda_container/Dockerfile`, `infrastructure/lambda_container/inference.py`
- Cause: Large container image + TensorFlow import + model load on every cold invocation; no provisioned concurrency configured in `infrastructure/resources.json`.
- Improvement path: Add provisioned concurrency for the inference Lambda if demo responsiveness matters, or accept cold starts for a low-traffic demo and document the expected latency in `docs/PROJECT_STATUS.md`.

**Polling-based async result retrieval:**
- Problem: `dashboard-next/src/lib/api.ts:106` implements `pollAnalysis(...)` — the client polls `/visualize/{id}` or `/status/{id}` repeatedly until the async pipeline (router → preprocessor → classifier → inference) completes, rather than using WebSockets/SSE or long-polling with backoff confirmed in code.
- Files: `dashboard-next/src/lib/api.ts:100-120`
- Cause: Pipeline is fully async (S3 + DynamoDB + 4 chained Lambdas), so the frontend has no choice but to poll given current architecture.
- Improvement path: Verify polling interval/backoff strategy avoids hammering API Gateway (e.g., exponential backoff, max attempts); consider WebSocket (API Gateway WebSocket API) or EventBridge-triggered push for a future iteration.

**Multiple independent `requestAnimationFrame` loops across dashboard-next:**
- Problem: 13+ files use `requestAnimationFrame` independently (spectrogram, waveform/audio playback, background canvas, scroll progress, animated counters, audio-visual bridge), each presumably running its own rAF loop rather than a shared animation ticker.
- Files: `dashboard-next/src/components/audio/AudioCompare.tsx`, `dashboard-next/src/components/audio/SpectrogramCanvas.tsx`, `dashboard-next/src/components/experience/useAudioPlayback.ts`, `useDemoAudio.ts`, `useLocationAudio.ts`, `dashboard-next/src/components/spectrogram/useSpectrogramAnimation.ts`, `dashboard-next/src/components/ui/AnimatedCounter.tsx`, `dashboard-next/src/hooks/useAudioPlayer.ts`, `useAudioVisualBridge.ts`, `useBackgroundCanvas.ts`, `useScrollProgress.ts`, `useSpectrogram.ts`, `useVitality.ts`
- Cause: Each hook/component manages its own `requestAnimationFrame` subscription; no shared rAF scheduler/ticker utility observed.
- Improvement path: If multiple of these run concurrently on the same page (e.g., the `/experience` route combining spectrogram + waveform + scroll-linked animation), consolidate into a single shared rAF loop (pub/sub ticker) to reduce redundant per-frame work and layout thrashing.

**Bundle weight from heavy visualization/animation stack:**
- Problem: `dashboard-next` ships deck.gl (3 packages), maplibre-gl, leaflet+react-leaflet, recharts, wavesurfer.js, and framer-motion simultaneously (see Tech Debt section above for file references).
- Files: `dashboard-next/package.json`
- Cause: Feature accretion without consolidation — likely each was added for a specific component without removing an earlier alternative.
- Improvement path: Run a bundle analyzer (`@next/bundle-analyzer`) and route-split heavy deps (dynamic `import()` for map/spectrogram components so they're not in the main bundle); pick one map library.

## Fragile Areas

**Pure-`struct`-module WAV parsing with no format validation beyond size:**
- Files: `lambdas/preprocessor/handler.py` (WAV parsing via `struct`, resampling, segmentation)
- Why fragile: Hand-rolled WAV parsing (no `scipy.io.wavfile` or `soundfile` library) is brittle against malformed headers, non-PCM WAV variants, odd sample rates/bit depths, or multi-chunk WAV files with metadata chunks before the `data` chunk.
- Safe modification: Add explicit format assertions (PCM, expected bit depth) and reject/clearly error on unsupported variants rather than attempting to parse them.
- Test coverage: No dedicated unit tests for the WAV parser were found; `scripts/test-all.sh` appears to be an integration/API smoke test rather than a parser unit test suite.

**Geographic region detection drives confidence multipliers but is a simple rule table:**
- Files: `lambdas/classifier/region_detection.py`
- Why fragile: Per `CLAUDE.md:132-137`, region confidence is a fixed multiplier table (Indo-Pacific: full confidence; Caribbean/Atlantic/Red Sea/Eastern Pacific: 60%; unknown: 70%) rather than a learned or geodesic-distance-based adjustment. Adding new regions/countries requires manually extending this table and keeping it in sync with `data/embeddings/metadata.json` site coverage.
- Safe modification: When reference-site coverage changes (e.g., the planned 6→45/54 site expansion), region boundaries and confidence multipliers must be revisited together; changing one without the other risks giving false confidence for newly-added-but-still-underrepresented regions.
- Test coverage: Not confirmed to have automated tests validating region classification against known coordinates.

## Scaling Limits

**Reference site count: documentation claims diverge (6 vs 45 vs 54) — see Stale Documentation below — meaning the actual deployed scientific baseline is uncertain:**
- Current capacity: Unclear; `docs/PROJECT_STATUS.md` (2026-02-03) says 6 sites, `CLAUDE.md` says 54 sites across 7 countries, `TO-DOS.md`'s most recent open item (2026-02-22) targets "45 sites across 5 countries." The true current count in `data/embeddings/metadata.json` was not independently re-verified in this pass beyond doc cross-referencing — code/doc inspection should confirm actual deployed site count before relying on any of these numbers.
- Limit: Classification quality and the region-detection confidence model both depend directly on reference-site count and geographic coverage; if the true count is still 6 (the earliest-dated, most detailed status doc), confidence in classifications outside those specific sites is low.
- Scaling path: Resolve which number is current (see Stale Documentation), then execute the already-planned `TO-DOS.md` "Real Audio Integration & Reference Site Expansion" item.

## Scientific-Validity Risks

**Training set size (~100 samples) is small for a 4-class MLP classifier on 1280-dim embeddings:**
- Files: `scripts/train_classifier.py`, `models/reef_classifier_weights.npz`, `models/model_config.json`, `docs/PROJECT_STATUS.md:31, 40-41`
- Risk: `docs/PROJECT_STATUS.md` states the MLP (1280→256→64→4 per `CLAUDE.md:127`) was trained on 100 samples with 90% held-out test accuracy. With only ~100 total examples across 4 classes (healthy, degraded, restored_early, restored_mid), the held-out test set is likely only ~15-20 samples — a 90% figure on that few samples has very wide confidence intervals (a single misclassification swings accuracy by ~5-7 points) and is not a statistically robust estimate of real-world performance.
- Impact: The "90% test accuracy" headline figure in `docs/PROJECT_STATUS.md`, `CLAUDE.md`, and likely `PORTFOLIO.md`/`README.md` overstates confidence; could mislead anyone citing this as a validated scientific result.
- Fix approach: Report accuracy with confidence intervals or cross-validation (k-fold) rather than a single train/test split; expand training data materially (the already-planned 45/54-site expansion helps) before any external/portfolio claims of accuracy.

**Indo-Pacific training bias with explicit but under-tested cross-region generalization:**
- Files: `lambdas/classifier/region_detection.py`, `CLAUDE.md:132-137`, training data sourced predominantly from MARRS (South Sulawesi, Great Barrier Reef, Mombasa, Maldives — all Indo-Pacific/Indian Ocean) per `CLAUDE.md:141-148`
- Risk: The system applies a flat 60% confidence multiplier for Caribbean/Atlantic/Red Sea/Eastern Pacific and 70% for unknown-location samples, acknowledging the bias — but this multiplier is a heuristic, not a calibrated out-of-distribution estimate. Acoustic signatures of reef health can differ by region (species composition, ambient noise profiles), so the classifier may silently produce wrong labels dressed up with a "reduced confidence" caveat rather than flagging genuine inapplicability.
- Impact: Users analyzing non-Indo-Pacific reef audio (e.g., Mexico/Caribbean and Florida/USA sites which ARE included per `CLAUDE.md:146-147`) may receive classifications that look authoritative (a confidence percentage) despite weak scientific grounding for cross-region acoustic transfer.
- Fix approach: Document in user-facing output (not just internal caveats) that cross-region results are exploratory; consider a hard "out of distribution — not scientifically validated for this region" banner rather than a soft confidence discount for regions with zero or near-zero training representation.

**Classification is built on mean-embedding comparison via cosine similarity, not a validated acoustic-health biomarker pipeline:**
- Files: `lambdas/classifier/handler.py:89` (mean embedding), reference comparison logic in the same file
- Risk: SurfPerch embeddings are a general-purpose bioacoustic representation (trained for species/soundscape tasks), not purpose-built or peer-reviewed specifically for coral reef health scoring. Averaging embeddings across audio segments before classification (rather than looking at per-segment acoustic events like snapping shrimp activity, fish chorus timing, etc., which are the actual literature-backed indicators of reef health) is a simplification; `docs/SCIENTIFIC_VALIDITY.md` exists and discusses PAM limitations, but these caveats are not surfaced in the product UI beyond generic caveat banners.
- Impact: The gap between "ML embedding similarity to labeled reference sites" and "validated bioacoustic health indicator" lives in `docs/SCIENTIFIC_VALIDITY.md` / `docs/MODEL_EVALUATION.md` but is invisible at the point where users read a classification.
- Fix approach: Surface methodology, training-set size, and limitations in-product (provenance/"why" panels next to results) and reconcile with `docs/SCIENTIFIC_VALIDITY.md`.

## Missing Critical Files / Build Blockers

**`dashboard-next` cannot build from a fresh clone — see "Known Bugs" above for full detail.**
- `@/components/gallery/SampleGallery` and `@/lib/samples` are imported but not present in git.
- This is the single highest-priority item in this document: it blocks CI, blocks onboarding, and blocks any deployment pipeline that does a clean checkout.

## Stale / Contradictory Documentation

**Audio processing parameters disagree between `docs/PROJECT_STATUS.md` and `CLAUDE.md`:**
- `docs/PROJECT_STATUS.md:51` (dated 2026-02-03): "16kHz resampling, 1.88s segments"
- `CLAUDE.md:116-117, 121`: "Resample to 32kHz (SurfPerch requirement)" and "Segment into 5.0-second windows (160,000 samples)"
- Impact: These are materially different preprocessing pipelines (16kHz/1.88s = ~30,080 samples vs. 32kHz/5.0s = 160,000 samples). Only one can match the actual deployed `lambdas/preprocessor/handler.py` logic. A reader trusting the wrong doc will misunderstand the system's actual audio requirements.
- Fix approach: Inspect `lambdas/preprocessor/handler.py` directly to determine ground truth, then update whichever doc is wrong (`docs/PROJECT_STATUS.md` is older — 2026-02-03 — and was very likely superseded by the 32kHz/5.0s pipeline now reflected in `CLAUDE.md`, which is the file explicitly positioned as the authoritative "AI Navigation Guide"). Delete or clearly timestamp-and-archive `docs/PROJECT_STATUS.md` as historical if it's no longer maintained.

**Reference site count disagrees across three documents:**
- `docs/PROJECT_STATUS.md:29, 54`: "6 validated reference sites" (as of 2026-02-03)
- `CLAUDE.md:37, 98, 141`: "54 sites with real... embeddings," "/sites — List 54 reference sites," "54 sites across 7 countries"
- `TO-DOS.md:22-24` (dated 2026-02-22, the most recently dated open TODO): targets expansion "from 8 to all 45 MARRS sites across 5 countries" — a third, different number and country count
- Impact: Three different site counts (6, 45, 54) and country counts (5 vs 7) across the three most important navigation/status docs in the repo. Anyone citing site coverage for portfolio/scientific credibility purposes risks citing an unverified number.
- Fix approach: Confirm actual site count by inspecting `data/embeddings/metadata.json` directly (ground truth), then reconcile all three docs to match and add a single source-of-truth reference (e.g., have `CLAUDE.md` and `README.md` point to generating the count from `metadata.json` rather than hardcoding it in prose).

**`TO-DOS.md` "Active Items" section is stale relative to `docs/PROJECT_STATUS.md` and `CLAUDE.md`:**
- `TO-DOS.md`'s active items (dated 2026-01-29, 2026-01-29, 2026-01-30, 2026-01-30) include "Custom UI Instead of Streamlit," "Enhanced Data Visualizations" (map viz, spectrograms, 3D embedding space), and "Create Research Documents" — but `CLAUDE.md` (presumably more recent, given it describes `dashboard-next` as primary, 54 sites, and region detection which postdate these TODOs) shows these features already exist: `dashboard-next/` is a full Next.js app (implying the "Custom UI" TODO is done but not marked complete), and `dashboard-next` has map components (leaflet/maplibre/deck.gl per package.json) and spectrogram components (implying "Enhanced Data Visualizations" is also substantially done).
- Impact: `TO-DOS.md`'s "Completed" section only lists 3 items (classifier training, MARRS pipeline, initial embeddings) while significant frontend work evidently happened afterward without `TO-DOS.md` being updated — the file is not a reliable source of current project state.
- Fix approach: Audit each "Active Item" against actual `dashboard-next/` contents and either move completed items to the "Completed" section with a completion date, or confirm they're still genuinely open and re-date them.

**`TO-DOS.md` still lists `docs/ML_RESEARCH.md` / `docs/SCIENTIFIC_VALIDITY.md` creation as open:**
- All three (`docs/ML_RESEARCH.md`, `docs/SCIENTIFIC_VALIDITY.md`, `docs/MODEL_EVALUATION.md`) are committed (verified with `git ls-files docs/`); `TO-DOS.md:14-16` is stale.
- Fix approach: Mark the item complete in `TO-DOS.md`.

## Test Coverage Gaps

**No unit tests found for core Lambda logic:**
- What's not tested: WAV parsing/resampling (`lambdas/preprocessor/handler.py`), classification logic including the mean-embedding projection math (`lambdas/classifier/handler.py`), region detection rules (`lambdas/classifier/region_detection.py`).
- Files: `lambdas/preprocessor/handler.py`, `lambdas/classifier/handler.py`, `lambdas/classifier/region_detection.py`
- Risk: `scripts/test-all.sh` (per `CLAUDE.md:54`) is described as a "Full API test suite" — this appears to be integration/smoke testing against the live deployed API rather than isolated unit tests with fixtures for edge cases (malformed WAV, boundary file sizes, unknown coordinates, etc.).
- Priority: High — these are the core scientific/data-processing paths where silent bugs would directly produce wrong reef-health classifications without any test catching a regression.

**No tests found for `dashboard-next` components:**
- What's not tested: No `*.test.tsx`/`*.spec.tsx` files or test runner config (Jest/Vitest/Playwright) were identified during exploration of `dashboard-next/`.
- Files: `dashboard-next/src/**`
- Risk: The missing-file build break (`SampleGallery`, `lib/samples`) would have been caught immediately by a CI build/test step; the absence of any CI test gate is part of why that issue reached this state.
- Priority: High — at minimum, a CI step that runs `npm run build` on every push would have caught the missing-import build break described above.

---

*Concerns audit: 2026-09-30*
