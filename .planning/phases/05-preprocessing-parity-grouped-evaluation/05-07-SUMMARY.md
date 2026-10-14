---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 07
subsystem: ml-preprocessing
tags: [lambda, preprocessor, reef_audio, moto, parity, segment-transport]
status: complete

requires:
  - phase: 05-05
    provides: "reef_audio decode matrix, encode_segments, build_sidecar / parse_sidecar, pcm16_wav_bytes, typed errors with error_code"
provides:
  - "lambdas/preprocessor/handler.py: thin S3-in / S3-out wrapper around reef_audio (no copy of decode, resample or normalisation logic)"
  - "Per-analysis objects processed/{id}/segments.f32, preprocessing.json (sidecar) and audio.wav (clipped PCM16 playback copy)"
  - "Classifier Event payload with segments_format 'f32le' and preprocessing_key; PREPROCESSED item gains segments_format, preprocessing_key, spec_version"
  - "Moto parity test: live handler output is bit-identical to reef_audio.audio_to_windows on 9 committed excerpts and 5 generated encodings"
  - "infrastructure/lambda-packages/preprocessor.json bundles reef_audio.py flat next to handler.py"
affects: [05-09 classifier segment reader, 05-17 rollout (preprocessor deploys last, after the classifier that reads f32le), contract v2 preprocessing_spec]

tech-stack:
  added: []
  patterns: ["thin Lambda wrapper over one shared tested module", "reef_audio error_code maps straight to the ERROR item code", "tests package marker (tests/__init__.py) to allow duplicate test_handler.py basenames"]

key-files:
  created:
    - lambdas/preprocessor/tests/__init__.py
    - lambdas/preprocessor/tests/conftest.py
    - lambdas/preprocessor/tests/preproc_wavs.py
    - lambdas/preprocessor/tests/test_handler.py
    - lambdas/preprocessor/tests/test_parity.py
  modified:
    - lambdas/preprocessor/handler.py
    - infrastructure/lambda-packages/preprocessor.json
    - scripts/tests/test_contract_model.py

key-decisions:
  - "The handler maps errors by reef_audio.ReefAudioError.error_code (single except branch) and builds every ERROR item through one _error_item helper, keeping the existing item shapes (min_duration_required '5.0', max_duration_allowed '600.0') and the re-raise."
  - "The sidecar is written with sort_keys, compact separators and allow_nan=False, so the object is canonical and cannot carry NaN or Infinity."
  - "The v1 contract-model test reads the same constants from lambdas/shared/reef_audio.py; its returned dict keeps the v1 handler names so every assertion line is unchanged."

requirements-completed: [ML-01, ML-02]

completed: 2026-10-14
actuals:
  tokens: 15000
  tasks: 2
  commits: 4
---

# Phase 5 Plan 07: Preprocessor rewrite on reef_audio Summary

**The live preprocessor is now a 150-line S3 wrapper around reef_audio that writes binary float32 segments, a hash-bearing sidecar and a clipped PCM16 playback copy, and a moto test proves its output is bit-identical to the offline function on the 9 committed MARRS excerpts plus stereo, 44.1/48/96 kHz, 8/24-bit, float32 and 5-channel extensible WAVs.**

## What was built

- **Handler (Task 1, tracer):** reads the upload with `get_object`, calls `reef_audio.audio_to_windows`, then writes `audio.wav` (`pcm16_wav_bytes` of the pre-normalisation resampled signal, so overflow clips instead of wrapping), `segments.f32` (`encode_segments`, 3,840,000 bytes for the 30 s excerpt) and `preprocessing.json` (`build_sidecar`). The PREPROCESSED item keeps its keys and adds `segments_format`, `preprocessing_key` and `spec_version`. The classifier gets one `Event` invoke with `segments_key`, `num_segments`, `segments_format "f32le"` and `preprocessing_key`, plus latitude/longitude only when not None (zero is forwarded). `read_wav`, `write_wav`, `resample_linear` and all preprocessing constants are deleted.
- **Package spec:** `preprocessor.json` now lists `handler.py` and `reef_audio.py`; the dry run reports 2 members.
- **v1 spec test:** `_parse_handler_constants` reads TARGET_SAMPLE_RATE, WINDOW_S, WINDOW_SAMPLES, MIN_DURATION_S and MAX_DURATION_S from reef_audio, mapped back to the v1 names; no assertion value changed.
- **Parity and error tests (Task 2):** `test_parity_live_handler_equals_offline` (14 parametrised cases: 9 excerpts, 5 generated encodings; segments array_equal, raw bytes equal, sidecar levels and input equal, playback copy equal). Error tests: invalid format, too short (3 s, `min_duration_required "5.0"`), too long (a real 601 s file at 4 kHz 8-bit, 2.4 MB, `max_duration_allowed "600.0"`), unexpected failure (PROCESSING_FAILED), digital silence (2 windows, levels -120.0, silent true, finite zeros, classifier invoked). Each failure asserts a typed ERROR item, the re-raise, no segments object and no classifier invoke.

## Verification

- `py -3.12 -m pytest lambdas/preprocessor/tests scripts/tests/test_contract_model.py -q`: all pass (35 tests).
- New parity test, three consecutive runs: 14 passed each time (about 22 s).
- Full `py -3.12 -m pytest -q`: 0 failures, 1 pre-existing skip (log read for `F` and a clean progress block; the `-q` in `addopts` suppresses the summary line).
- `py -3.12 scripts/deploy-lambdas.py --function preprocessor --dry-run`: `2 member(s)`, "no AWS call made".
- Acceptance greps: `reef_audio.audio_to_windows` in handler 1; `def resample_linear` 0; `lambdas/shared/reef_audio.py` in preprocessor.json 1; `git status --porcelain dashboard-next/public` empty.
- The Windows CRLF noise in `test_build_gallery_manifest.py` rewrote `data/audio-manifest.json` and two dashboard fixtures during the full run; restored with `git checkout --` and not committed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Duplicate `test_handler.py` basename broke collection**
- **Found during:** Task 2 full-suite run (the focused runs passed).
- **Issue:** `lambdas/classifier/tests/test_handler.py` and the plan-mandated `lambdas/preprocessor/tests/test_handler.py` both import as `test_handler` (no package markers), so a repo-wide run failed with "import file mismatch".
- **Fix:** added `lambdas/preprocessor/tests/__init__.py` (module becomes `tests.test_handler`) and used relative imports for the WAV helpers. This was chosen over `--import-mode=importlib` in the shared `pytest.ini` to avoid touching a file the parallel plans may also edit. If another suite later adds its own `tests/__init__.py`, the package name `tests` would collide and that suite should use a different approach.
- **Commit:** cb97122

**2. [Process] WAV builders and moto fixtures split into `conftest.py` and `preproc_wavs.py`**
- The plan listed only test_handler.py and test_parity.py; both tests share the moto fixture and the generated-WAV builders, so they live in two small helper files in the same tests directory. Generated audio exists only in memory.

**3. [Process] TDD shape**
- Task 1 had a RED commit (a1e2fd8, tests failing with NoSuchKey because the old handler used `download_file`/`segments.json`) then GREEN (19d4f2b). Task 2's parity and error tests passed on first run because the handler already delegated everything (the plan said to change the handler only if a test exposed a defect; none did), so there is a single test commit for Task 2.

**4. Tracer gate:** auto mode is active (`workflow.auto_advance` true), so the tracer's verify was re-run end to end before Task 2 and passed.

## Rollout note

The classifier reader for `segments_format "f32le"` is plan 05-09. This preprocessor must deploy only after that classifier (05-17 orders it last). Deploying this handler alone against today's classifier would break analyses, since the classifier still expects `segments.json`.

## Known Stubs

None.

## Threat Flags

None. T-05-07-01 (crafted WAV DoS) rests on the reef_audio bounds from 05-05 and is exercised through the handler by the invalid-format, too-short and too-long tests; T-05-07-02 (segments tampering) is covered by the sidecar's `segments_sha256` and `segments_bytes` (verified by test, enforced by the classifier in 05-09); T-05-07-04 is checked by the clean `git status` of `dashboard-next/public`.

## Self-Check: PASSED

- Files present: handler.py, preprocessor.json, test_contract_model.py, and the five files under lambdas/preprocessor/tests.
- Commits a1e2fd8, 19d4f2b and cb97122 present in `git log`.
