---
phase: 01-truth-reproducibility
reviewed: 2026-10-01T18:00:00Z
depth: standard
files_reviewed: 140
files_reviewed_list:
  - "(140 paths: Phase 1 SUMMARY key_files plus git diff f1c5692..HEAD, excluding .planning/, binaries, baselines and lockfiles)"
findings:
  critical: 3
  warning: 21
  info: 10
  total: 34
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-10-01
**Depth:** standard
**Files Reviewed:** 140
**Status:** issues_found

## Summary

The Phase 1 truth work is substantially sound: `adjust_classification` never scales probabilities, provenance overlay is centralised in `lambdas/shared/site_provenance.py`, the deploy/sync scripts are `--confirm`-gated, hash-verified and never print presigned URLs in their main paths, and the banned-claims gate is a good regression lock. Adversarial review nonetheless found three blockers: (1) the live analyze page still tells users that coordinates enable "confidence adjustment" (D-12 removed it); (2) a race in `LocationCompare` that plays audio not matching the displayed labels and leaves unstoppable orphaned audio; (3) the "deploys only from a clean committed tree / rollback is exact" guarantee has a hole because package specs are read from the working tree. Warnings cluster around router/classifier failure handling (failed analyses reported as "processing", silent 4-site `/sites` fallback, async-retry interplay, non-atomic model swap), region honesty (whole-country `INDONESIA` box), frontend robustness (polling aborts on one transient error, audio lifecycle bugs, the sites filter bug), and stale docs/copy contradicting production behaviour.

## Critical Issues

### CR-01: Analyze page still claims coordinates enable "confidence adjustment" (removed by D-12)

**File:** `dashboard-next/src/app/dashboard/analyze/page.tsx:352-355`
**Issue:** Copy reads "Providing coordinates enables geographic region detection and confidence adjustment." `adjust_classification()` now never adjusts anything (`lambdas/classifier/region_detection.py:285-319`, `confidence_adjusted` always False). This is a user-visible false statement about how probabilities are produced — exactly what the Core Value forbids — and `copy-claims.test.ts` doesn't catch it (it bans "confidence is reduced"/"confidence reduced", not "confidence adjustment"). The same claim survives in `dashboard/app.py:470` (legacy Streamlit) and docs (see WR-19).
**Fix:**
```tsx
<p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
  Coordinates let us report whether your recording is in a region the classifier
  was trained on. They do not change the probabilities.
</p>
```
and add `'confidence adjustment'`, `'adjusts confidence'` to `BANNED` in `tests/unit/copy-claims.test.ts`; fix `dashboard/app.py:470`.

### CR-02: LocationCompare state switch during playback races — orphaned looping audio and audio that doesn't match the labels

**File:** `dashboard-next/src/components/experience/useLocationAudio.ts:439-471` (with `LocationCompare.tsx:179-185`)
**Issue:** The state-button `onClick` calls `audio.setLeftTrack(audio.rightTrack); audio.setRightTrack(status);` from a single render closure. While playing, both setters capture stale `isPlaying === true`, stale `leftTrack` and stale `rightTrack`: the first starts `loadBuffers(loc, oldRight, oldRight)`, the second `loadBuffers(loc, oldLeft, status)`. Neither pair is `(oldRight, status)` (what the UI now labels). Whichever load finishes last wins `leftBufRef`/`rightBufRef`, and both `.then` handlers call `startPlayback()`, which never stops existing sources — the first pair's looping `BufferSource`s are orphaned (refs overwritten) and play forever with no way to stop them short of leaving the page. The user hears audio for sites other than those whose labels/descriptions are shown, violating "every sound is traceable and honestly labelled".
**Fix:** Make the swap a single atomic action and make `startPlayback` idempotent:
```ts
const setTracks = useCallback((left: HealthStatus, right: HealthStatus) => {
  const wasPlaying = isPlayingRef.current;          // ref, not closure state
  stopPlayback();
  setLeftTrackState(left); setRightTrackState(right);
  setLoadState('idle'); leftBufRef.current = rightBufRef.current = null;
  if (wasPlaying && selectedLocation) {
    const token = ++loadTokenRef.current;
    loadBuffers(selectedLocation, left, right).then(ok => { if (ok && token === loadTokenRef.current) startPlayback(); });
  }
}, [...]);
// in startPlayback(): stop & null any existing leftSourceRef/rightSourceRef first
```
and call `setTracks(audio.rightTrack, status)` from the button. The same stale-closure pattern exists in `useDemoAudio.initAudio` (`loadState` guard).

### CR-03: "Deploys only from a clean committed tree / --ref rollback is exact" doesn't hold — package specs come from the working tree

**File:** `scripts/deploy-lambdas.py:190` (`pkg.load_spec`), `:192-212` (dirty check); `scripts/lambda_packaging.py:46-65`
**Issue:** `infrastructure/lambda-packages/*.json` (which files go into each zip and under what archive name) is always read from the working tree. The dirty-tree check only covers the member source paths (`git_status_porcelain(sorted(deploy_paths))`), not the spec file or `scripts/lambda_packaging.py`. So an uncommitted edit to a spec (adding/removing/redirecting a member) deploys a package HEAD does not describe, without refusal. With `--ref`, the dirty check is skipped entirely and the member list still comes from the working-tree spec — rollback is not "exactly what a past commit contained". `docs/deploy/DEPLOY-LOG.md` (attempt 1 rollback) documents this occurring: rollback packages "carry the old handlers plus the bundled provenance/manifest members the current spec lists", so CodeSha256 differed from the pre-deploy value. Rolling back to a commit that predates a spec member fails with a `git show` error; rolling back across a spec change silently builds a hybrid.
**Fix:** In the non-`--ref` path add `infrastructure/lambda-packages/<fn>.json` and `scripts/lambda_packaging.py` to `deploy_paths`. In the `--ref` path load the spec from the ref (`git show <ref>:infrastructure/lambda-packages/<fn>.json`) — add a `spec_text` arg to `load_spec` or have `git_show_reader` also serve the spec. Update the CLAUDE.md "exactly what a past commit contained" claim accordingly.

## Warnings

### WR-01: `/visualize` reports a failed analysis as "processing" forever once preprocessing succeeded

**File:** `lambdas/router/handler.py:415-438`
**Issue:** When there is no RESULT item, the PREPROCESSED check runs before the ERROR check, so classifier failures (which occur after PREPROCESSED exists) return `{"status":"processing"}` and never the error payload. `/status` (`:470-483`) correctly checks ERROR first. `pollAnalysis` falls back to `/visualize` for `request_id` after `/status` says failed — in the common failure case it gets no error object, so the "request id for support" feature of D-15 silently never works (and `api-poll.test.ts` mocks `/visualize` returning an error object, which the real backend doesn't do for classifier failures). The legacy Streamlit app (`dashboard/app.py:529-538`) polls `/visualize` only and spins until its own timeout.
**Fix:** Check ERROR before PREPROCESSED (mirror `handle_status`), and add a METADATA check so `/visualize` returns "processing" rather than 404 during early preprocessing.

### WR-02: `/sites` silently degrades to a hard-coded 4-site list with HTTP 200 on any exception — including provenance errors

**File:** `lambdas/router/handler.py:291`, `:294-295`, `:308-328`
**Issue:** The bare `except Exception` fallback returns 200 with 4 hard-coded sites. A single site whose `site_id` matches no provenance prefix makes `apply_label_provenance` raise `KeyError` (`site_provenance.py:62`) — or `AttributeError` for a missing `site_id` — turning the whole response into the 4-site fallback. `metadata.get('sites_with_embeddings', ...)` at `:295` is unguarded: for the legacy list-format metadata the code explicitly supports (`:256`), `list.get` raises `AttributeError` → same silent degradation. The frontend derives every count from `/sites` (`deriveSiteStats`), so it would show "4 sites" as truth; the only signal is `error_note`, which no UI surfaces. This violates the CLAUDE.md "never silently fall back" policy in spirit. The fallback path also calls `get_label_provenance()` inside the `except` — a missing provenance file crashes the Lambda.
**Fix:** Return 503 `SITES_UNAVAILABLE` (or 200 with an explicit `degraded: true` that the UI renders prominently) instead of fabricating data; guard `:295` with `isinstance(metadata, dict)`; validate provenance per-site and log-and-skip (or fail loudly) rather than falling back wholesale.

### WR-03: Classifier re-raises after writing a terminal ERROR — Lambda async retries fight the UI and the 10-concurrency limit

**File:** `lambdas/classifier/handler.py:148-174`, `:176-198`
**Issue:** The classifier is invoked with `InvocationType='Event'`; re-raising triggers Lambda's default 2 async retries. Each retry repeats up to 3 inference attempts per batch against the container (account concurrency limit 10). The first failure writes ERROR and `/status` immediately reports `failed`, so the frontend stops polling and shows an error — while a retry may later succeed (RESULT written) after the user gave up, or compound throttling. Duplicate/at-least-once deliveries also repeat S3 temp-batch uploads.
**Fix:** Set `MaximumRetryAttempts=0` on the classifier's event invoke config (or return normally after recording ERROR) so there is exactly one authoritative outcome; guard RESULT write with `attribute_not_exists` and clear any stale ERROR item.

### WR-04: Model swap is non-atomic and unvalidated; warm containers never refresh

**File:** `lambdas/classifier/handler.py:403-438`, `:461-472`; `scripts/publish_model.py:107-121`, `:183-184`
**Issue:** `publish_artifacts` overwrites `model_config.json` then the weights non-atomically. A cold start in that window caches (module global + `/tmp`) old weights with new config or vice versa for the container's lifetime. `classify_embedding` iterates `idx_to_label` only, so with a mismatched 4-class softmax and 3-class config it emits a subset whose probabilities sum < 1 — breaking the core "sums to 100%" truth. `classify_embedding` silently defaults `idx_to_label` to a 3-class dict if the key is missing. Neither `_model_weights` nor `/tmp` is ever invalidated, so a model-only publish or rollback (as done manually via `awscli s3 cp` in DEPLOY-LOG) is not picked up by warm containers until they recycle — mixed model versions are served. There is no scripted rollback mode in `publish_model.py`; the documented rollback was an ad-hoc CLI copy.
**Fix:** In `load_classifier_model` assert `weights['w3'].shape[1] == len(idx_to_label) == config['num_classes']` and raise otherwise; drop the default `idx_to_label`; verify `sum(probs) == 1` over mapped classes. Publish under versioned keys (`models/<version>/...`) with a tiny pointer object, or at least verify sha256 of both objects together at load time (config could carry `weights_sha256`); key the cache by ETag/version. Add `publish_model.py --rollback <archive-prefix>`.

### WR-05: Similar-site lookup uses a different (legacy) reference file than `/sites`, and failures become a silent empty list

**File:** `lambdas/classifier/handler.py:495`, `:508-509`, `:546`, `:562`; `lambdas/router/handler.py:242`
**Issue:** The router lists sites from `metadata_v6.json` → v5 → `metadata.json`; the classifier reads only `reference/metadata.json`. PHASE-1-EXIT.md records `similar_sites_count == 0` in both live analyses: the `len(ref_embedding) == len(embedding)` filter silently drops every non-matching reference, and `load_reference_embeddings` swallows all exceptions as `[]` (uncached). The UI hides the whole "Most Similar Reference Sites" section when the list is empty (`AnalysisResults.tsx:96`) with no message, so users can't distinguish "no neighbours exist" from "the lookup is broken".
**Fix:** Share one `load_reference_sites()` with the same v6→v5→legacy key order as the router; log and raise on dimension mismatch (or return `{"similar_sites": [], "similar_sites_error": "..."}`); surface "similarity unavailable" in the UI.

### WR-06: `invoke_inference_batch` loses the real error type for non-retryable errors

**File:** `lambdas/classifier/handler.py:356-379`
**Issue:** On `LAMBDA_NOT_FOUND` the loop `break`s and the trailing `raise` hard-codes `error_type='INFERENCE_FAILED'`, so the `LAMBDA_NOT_FOUND` suggestion in `get_error_suggestion` is unreachable. Classification is by substring match on exception text (a message containing "timeout" is `TIMEOUT`). The 1s/2s retry delays are shorter than a throttle window for `TooManyRequestsException`.
**Fix:** Carry `error_type` through the break (`raise InferenceError(..., error_type=error_type)`); match on `botocore.exceptions.ClientError.response['Error']['Code']` instead of substrings; use jittered, longer backoff for throttling.

### WR-07: `in_training_region` is true for the entire INDONESIA bounding box; caveat text false for broad regions containing training sites

**File:** `lambdas/classifier/region_detection.py:96-100`, `:257-271`; `dashboard-next/src/components/dashboard/RegionWarning.tsx:27-29`
**Issue:** The `INDONESIA` box (lat −11..6, lon 95..141) spans ~4,000 km; all 4 Indonesian training sites are within ~2 km of one reef (Spermonde, ≈ −4.93, 119.32). A recording from Raja Ampat, Bali or Aceh gets `in_training_region: true` and `RegionWarning` returns `null` — no warning at all. Conversely, for a broad box such as `INDO_PACIFIC_WEST` (e.g. Philippines) that contains the training sites, `in_training_region` is false because the box is "broad", and the caveat says "which has no real training data" — factually wrong (4 training sites are in that box).
**Fix:** Define in-training coverage by distance to a training site (e.g. haversine radius) or tight boxes around the actual training reefs; report `nearest_training_site_km`. Make the "outside" caveat for broad regions say "no training site close to this location". Have `RegionWarning` render a softer informational note instead of nothing when in-region, so absence of a warning isn't read as validation.

### WR-08: `verify_live_truth` probability-sum tolerance (1e-6) is tighter than the stored rounding error

**File:** `scripts/verify_live_truth.py:42`, `:109`; `lambdas/classifier/handler.py:27`
**Issue:** `convert_floats` rounds every probability to 6 decimals before storage (`round(obj, 6)`). For a 3-class model the summed rounding error is the sum of three uniform ±5e-7 errors, so |sum−1| > 1e-6 occurs in roughly 4% of analyses (≈8% for 4 classes). The Phase-1 exit gate is therefore flaky — it can fail a correct deployment, inviting careless loosening. The same rounding means the API's own probabilities don't sum to exactly 1.
**Fix:** Store at higher precision (`round(obj, 9)`) or set `PROBABILITY_TOLERANCE = 1e-5` with a documented rationale; better, renormalise the rounded values to sum to 1 exactly before storing.

### WR-09: Inference deploy is fire-and-forget with a fixed, unversioned S3 key

**File:** `scripts/deploy-lambdas.py:139-160`
**Issue:** Uploads to the single key `inference-source.zip` and starts CodeBuild, then returns. It does not wait, does not verify the resulting image digest, and prints `code_sha256` of the source zip (not what Lambda runs). Two overlapping deploys race on the key, so the "git sha" recorded may not be what CodeBuild builds. `--ref` rollback for inference produces an artifact CodeBuild picks up later with no linkage.
**Fix:** Upload to `inference-source/<git_sha>.zip` and pass `sourceLocationOverride` to `start_build`; poll the build to completion; resolve the new image digest and compare with `drift-check`.

### WR-10: `drift-check` conflates tool failure with drift and has no network timeouts

**File:** `scripts/drift-check.py:82-85`, `:187-221`
**Issue:** Only `pkg.SpecError` is caught; any boto `ClientError` (expired credentials), `urllib` error or `tarfile` error is an uncaught traceback → exit 1. The documented contract is "1 = drift, 2 = error", so CI/operators read an outage as drift (or the reverse). `urlopen` has no timeout (can hang). The container path assumes `imageManifest` has `layers`; an OCI index / multi-arch manifest yields an empty list and reports every file "missing" (false drift).
**Fix:** Catch `Exception` per function, print the type name only (no URL), set `had_error` → return 2; pass `timeout=` to `urlopen`; resolve index manifests to the linux/amd64 child before reading layers.

### WR-11: `check_audio_real.py --from-live-samples` can leak presigned URLs and trusts remote ids for file names

**File:** `scripts/check_audio_real.py:203-244`
**Issue:** `requests.get(audio_url)` / `raise_for_status()` raise exceptions whose message includes the full URL (including `ConnectionError`/`MaxRetryError` path and query string with `Signature=`). There is only `try/finally`, no `except`, so the traceback prints the bearer token — contradicting the file's own "never logged" comment (`verify_live_truth.py` correctly catches and prints only the type name). `sample_id` from the remote response is interpolated into a temp filename. The "real vs synthetic" gate also hard-codes sample rate 16000 as a realness indicator: any real recording at another rate is "flagged" while a 16 kHz synthetic clip with noise passes — a weak control (sha256 vs the manifest is the actual control).
**Fix:** Catch `requests.RequestException` and print `type(e).__name__` only; use `tempfile.NamedTemporaryFile` (or `check_file(io.BytesIO(r.content))`); document the rate heuristic as MARRS-specific.

### WR-12: `prepare_demo_audio.py` is stale and actively conflicts with D-07 and the generated attribution

**File:** `scripts/prepare_demo_audio.py:96-99`, `:137-173`, `:185-231`
**Issue:** It peak-normalises (`audio * (0.95/peak)`) — which D-07 forbids — and writes `dashboard-next/public/audio/ATTRIBUTION.md` with "Peak-normalized… dusk chorus" text. That file is the one `build_audio_consumers.py` generates and CI byte-compares (`--check`). Running this stale script makes CI fail with drift or, worse, regenerates the doc claiming processing that didn't happen. It also writes `healthy-reef.wav`/`degraded-reef.wav` cross-site pairs that the manifest no longer serves.
**Fix:** Delete the script (and `prepare_comparison_audio.py` if no longer used), or hard-exit with a message pointing to `extract_marrs_excerpts.py`.

### WR-13: `pollAnalysis` aborts on any single transient error; uploads fail for non-ASCII filenames

**File:** `dashboard-next/src/lib/api.ts:94`, `:218-238`, `:132-143`
**Issue:** `request()` calls `response.json()` unguarded; an API Gateway 502/503/504 (HTML or empty body — the DEPLOY-LOG shows this happens under the concurrency limit) throws `SyntaxError` with no `.status`. `pollAnalysis` only retries 404; anything else rethrows, so a 1-second API blip kills a multi-minute analysis the user waited for. 429/503 should be retried with backoff. Separately, `'X-Filename': file.name` throws `TypeError: … ByteString` for filenames with code points > 255 (e.g. Japanese/Chinese, non-Latin1 dashes), failing the upload with a cryptic error before any request is sent.
**Fix:** Parse the body defensively (`await response.json().catch(() => ({}))`); in `pollAnalysis` treat `status >= 500 || status === 429 || err instanceof TypeError` (network) as retryable up to N consecutive times; send `encodeURIComponent(file.name)` (and `decodeURIComponent` server-side) or sanitise to ASCII.

### WR-14: Sample audio players — unhandled `play()` rejection, state desync, leaked playback, side effect in render

**File:** `dashboard-next/src/components/gallery/SampleCard.tsx:50-76`, `:86`; `dashboard-next/src/app/experience/page.tsx:552-553`
**Issue:** `audioRef.current.play()` returns a promise; when it rejects (expired presigned URL after the 1-hour expiry, CORS with `crossOrigin='anonymous'`, autoplay policy) the rejection is unhandled and `onPlay(sample.id)`/`setIsPlaying(true)` still run — the card shows "Pause" for audio that isn't playing. `SampleCard` never pauses/cleans up its `Audio` element on unmount, so navigating away mid-playback leaves it playing (the experience page has cleanup; `SampleCard` doesn't). Lines 74-76 call `.pause()` during render (side effect in render — move to an effect). `badgeColor + '80'` appends hex alpha to a `var(--status-…)` string, producing invalid CSS (border colour silently dropped).
**Fix:** `audio.play().then(() => onPlay(id)).catch(() => { onPause(); setError(true); })`; add a cleanup `useEffect` that pauses and nulls the element; use `color-mix(in srgb, ${badgeColor} 50%, transparent)` for the border.

### WR-15: `AudioCompare` crossfade slider and audible mix disagree after init; unattributed "Healthy/Degraded Reef" headings

**File:** `dashboard-next/src/components/audio/AudioCompare.tsx:95-101`, `:233-242`, `:340-366`
**Issue:** Gain nodes are created at (1, 0) in `initAudio`; the `[crossfade]` effect only reruns on slider change, so if the user moves the slider before first play (it's enabled while idle), audio starts at healthy while the slider shows degraded. The spectrogram headings "Healthy Reef"/"Degraded Reef" present dataset labels as facts about the reef with no assigning dataset (the crossfader captions attribute them; the headings next to the visuals don't).
**Fix:** After creating gains, apply the current `crossfade` (read from a ref); retitle headings e.g. `Label: "{label_original}" (MARRS)`.

### WR-16: Sites page shows every site when a filter matches none

**File:** `dashboard-next/src/app/sites/page.tsx:51`
**Issue:** `displaySites = filteredSites.length > 0 || sites.length === 0 ? filteredSites : sites`. When filters yield 0 results, `filteredSites` is `[]` so `displaySites` falls back to the full list; the "No sites match your filters" / "Clear filters" branch is unreachable and the "(N of M)" counter is wrong.
**Fix:** Track whether filtering is active (e.g. `useState<Site[] | null>(null)`), then `const displaySites = filteredSites ?? sites`.

### WR-17: Result page shows similar-site labels without who assigned them (inconsistent with ComparisonPanel)

**File:** `dashboard-next/src/components/AnalysisResults.tsx:158-160`
**Issue:** Rows render `{site.country} - {formatStatus(site.status)}` with no `label_source`/`label_original`, although the API returns both and `ComparisonPanel.tsx:130-134` shows them. The `/dashboard/analyze` results therefore display "Healthy"/"Degraded" as bare facts, against the "every label shows who assigned it" principle.
**Fix:** Reuse the ComparisonPanel rendering (and `label_source_name` instead of its hard-coded `labelSourceName` switch, which falls through to raw ids like "irma").

### WR-18: Overclaiming or inaccurate user-facing copy not caught by the banned-claims gate

**File:** `dashboard-next/src/app/about/page.tsx:77-88`; `dashboard-next/src/app/dashboard/analyze/page.tsx:496-498`, `:540`; `dashboard-next/src/app/experience/page.tsx:216`; `lambdas/router/handler.py:121-128`
**Issue:** About: "reference sites of known health status" and "rapid, scalable reef monitoring without the need for physical surveys" — contradicts the same page's "complementary to visual surveys"/"not definitive health diagnosis"; Bora-Bora/Irma/SanctSound sites have unknown status. Analyze: "Trained classifier determines reef health status". The UI promises a 50 MB maximum and the router validates 50 MB, but synchronous Lambda invocation payloads are limited to 6 MB and API Gateway HTTP APIs to 10 MB, and base64 adds ~33% — so uploads ≳4.5 MB are likely rejected by the platform before reaching the check, with a non-JSON error. Verify the real limit and state it.
**Fix:** Rewrite to "labelled by the datasets' researchers" / "most similar to … reference recordings"; show the true size limit; add the phrases ("known health status", "without the need for physical surveys", "determines reef health") to `BANNED`.

### WR-19: Docs and legacy copy contradict production behaviour

**File:** `README.md:101`, `:269-270`, `:277-281`, `:332`; `ARCHITECTURE.md:162-175`; `CLAUDE.md:24`, `:128`, `:135-136`; `docs/SCIENTIFIC_VALIDITY.md:33`, `:126`, `:159`, `:223`, `:241`; `docs/ML_RESEARCH.md:178`; `dashboard/app.py:470`
**Issue:** These still describe a 4-class model with "~90% test accuracy", per-region confidence multipliers (0.6/0.7), "confidence is adjusted", and "healthy: abundant snapping shrimp, diverse fish communities". The deployed model is 3-class interim (no `restored_mid`), probabilities are unscaled, and these claim lists are banned in the UI. CLAUDE.md steers future AI-assisted edits toward the removed behaviour. The banned-claims gate scans only `dashboard-next/src`.
**Fix:** Update the docs (or mark them "historical — pre-Phase 1"); extend the gate (or a docs variant) to cover README/ARCHITECTURE/CLAUDE.

### WR-20: Test-gate reliability

**File:** `dashboard-next/tests/e2e/visual.spec.ts:47-52`; `dashboard-next/tests/e2e/support/mock-api.ts:104-107`
**Issue:** If the snapshot directory is empty/missing and `PW_UPDATE` is unset, every visual test `skip`s — CI is green with zero visual verification, so a deleted baseline directory silently disables the gate. `mock-api` throws inside a `page.route` handler to "fail loudly"; exceptions in route handlers are not reliably propagated to the test, and the request may hang until the test times out.
**Fix:** In CI (`process.env.CI`) fail when `PW_VISUAL === '1'` and no snapshots exist; in mock-api record the offending call, `route.abort()`, and assert the list is empty in an `afterEach`.

### WR-21: Router `/analyze` invokes the preprocessor before creating its records; client filename used unsanitised in the S3 key

**File:** `lambdas/router/handler.py:131-136`, `:201-216`
**Issue:** The async invoke happens before the ANALYSIS METADATA `put_item`; if `put_item` fails, a pipeline run exists with no record, the client gets 500, retries, and duplicate analyses are created. `x-filename` is client-controlled and used verbatim in `uploads/{id}/{filename}` and returned in JSON — S3 keys are flat so no traversal, but it permits arbitrary characters, very long keys, and `/` creating sub-prefixes that downstream code may `basename`.
**Fix:** Write records first, then invoke; sanitise the filename (`re.sub(r'[^A-Za-z0-9._-]', '_', os.path.basename(name))[:100]`).

## Info

### IN-01: `lambda_packaging` determinism/normalisation caveats

**File:** `scripts/lambda_packaging.py:77-92`, `:120-127`
**Issue:** CRLF→LF normalisation is applied to every member with no binary guard; adding a binary member (e.g. model weights) would be silently corrupted. Byte-identical zips across platforms aren't guaranteed (zlib implementations can differ at level 9) — the manifest comparison already covers this, but the docstring overstates it.
**Fix:** Allowlist text extensions for normalisation; soften the docstring.

### IN-02: Stale/duplicated site-coordinate table; null handling in popups

**File:** `dashboard-next/src/types/index.ts:204-269`; `dashboard-next/src/components/SiteCard.tsx:15`; `dashboard-next/src/components/map/SitePopup.tsx:21-25`, `:79-83`
**Issue:** `SITE_COORDINATES` lists `irma_western_dry_rocks_pre`, `irma_eastern_sambo_pre/_post` (not in `/sites`; real ids are `irma_western_dry_rocks`, `irma_eastern_sambo`); real API coordinates are ignored in favour of this table in `SiteCard`/`MiniMap`/the map page. "Mombasa Coast, Kenya" is attached to coordinates (−2.2, 41.0) near Lamu, ~200 km from Mombasa — verify against the MARRS KML. `SitePopup` guards `!== undefined` but the API returns `null` for missing coordinates (`null.toFixed` crash). The `countryName` ternary is a no-op.
**Fix:** Use API `latitude`/`longitude` first and fix guards (`!= null`); drop or regenerate the table from the snapshot; remove the dead ternary.

### IN-03: `audio-manifest.ts` — dead `compareLocations`, country-level grouping, hard-coded provenance

**File:** `dashboard-next/src/lib/audio-manifest.ts:107-114`, `:138-155`
**Issue:** `compareLocations()` is used only by tests and groups by `site_id.split('_')[0]` (a country prefix), so every Indonesian site is one "location" and same-status excerpts silently overwrite each other (`loc.excerpts[status] = excerpt`). `excerptCaption` hard-codes "assigned by MARRS" instead of using `label.label_assigned_by`.
**Fix:** Delete the dead function (or key it on the explicit compare-location ids from `build_audio_consumers.py`); use `excerpt.label.label_assigned_by`.

### IN-04: Dead `audioPlayback` branch

**File:** `dashboard-next/src/components/experience/ControlsPanel.tsx:13-27`, `:64-121`
**Issue:** `ResultsState` never passes `audioPlayback`, so the playback/band-toggle UI and its `AudioPlaybackControls` type are unreachable.
**Fix:** Remove.

### IN-05: Training/region helpers assume complete training-site coordinates

**File:** `lambdas/classifier/region_detection.py:257-261`; `scripts/train_interim_real_only.py:451-460`
**Issue:** A training site with `latitude: None` (the trainer emits `"unknown"`/None when a site is missing from the lock) makes `bounds['lat_min'] <= s['latitude']` raise `TypeError` → every analysis with coordinates fails as CLASSIFICATION_FAILED. If a rolled-back config lacks `training_sites` (as the v2.0 config does), `DEFAULT_TRAINING_SITES` (the interim set) is silently used for a different model. Trainer file I/O uses default encodings.
**Fix:** Skip sites without numeric coordinates in `detect_region`; fail the trainer when a site is missing from the lock; pass `encoding='utf-8'`.

### IN-06: `audit_deployed_model.py` — stale evidence references; `--s3` overwrites the local models directory

**File:** `scripts/audit_deployed_model.py:210-285`, `:411-437`
**Issue:** Hard-coded evidence line ranges (e.g. handler.py "393-475") no longer match the edited handler (now `397-479`). `--s3` silently overwrites `models/` and `data/training/` in the repo working directory and uses S3 key suffixes as filenames.
**Fix:** Generate line refs or drop them; download into a temp dir; reject keys containing `..`/`/` after the prefix.

### IN-07: `ProbabilityBars` normalises over all keys but renders only canonical classes

**File:** `dashboard-next/src/components/charts/ProbabilityBars.tsx:37-48`, `:62`, `:199`
**Issue:** `toIntegerPercentages` renormalises over every key (including a non-canonical one such as `unknown`) while only canonical classes render, so displayed integers can sum below 100. Bar widths use raw `probability * 100` whereas labels use normalised integers — they disagree for any legacy payload that doesn't sum to 1.
**Fix:** Pass only the presented classes into `toIntegerPercentages`, and use `percentage` for widths.

### IN-08: `sync_sample_audio` edge cases

**File:** `scripts/sync_sample_audio.py:71-79`, `:125-138`
**Issue:** Two excerpts with the same basename in different directories would collide on `samples/marrs/<name>`. Botocore `ClientError`s are not caught, so a mid-run failure prints a traceback and leaves partial state (idempotent re-run is fine but undocumented).
**Fix:** Assert unique basenames in `manifest_uploads`; catch `ClientError` and print the code only.

### IN-09: `deriveSiteStats` status keys

**File:** `dashboard-next/src/lib/site-stats.ts:36-42`
**Issue:** Sites with null/undefined `status` create `"null"`/`"undefined"` keys and inflate `labelCategories`.
**Fix:** Normalise `status ?? 'unknown'`.

### IN-10: About page "Last checked" shows render time

**File:** `dashboard-next/src/app/about/page.tsx:66-69`
**Issue:** `new Date().toLocaleTimeString()` is evaluated on every render, so it shows "now", not when `/health` was last fetched — overstates freshness.
**Fix:** Use the query's `dataUpdatedAt`.

---

_Reviewed: 2026-10-01T18:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
