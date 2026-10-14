---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 05
subsystem: ml-preprocessing
tags: [audio, wav-decode, segment-transport, sidecar, surfperch, numpy]
status: complete

requires:
  - phase: 05-02
    provides: "reef_audio core: audio_to_windows, polyphase Kaiser resampler, normalisation, levels"
provides:
  - "Full WAV decode matrix with header bounds (PCM 8/16/24/32, float 32/64, WAVE_FORMAT_EXTENSIBLE, 1-8 channels)"
  - "Binary segment transport: encode_segments / decode_segments (little-endian float32, C order) plus build_sidecar / parse_sidecar / SidecarError"
  - "pcm16_wav_bytes (clipped playback copy) and spec_summary (machine-readable spec for contract v2)"
  - "SPEC_VERSION preproc-2026.10.1-reef-audio frozen"
affects: [05-07 preprocessor writer, 05-08 offline embedding, 05-09 classifier reader, 05-11 re-embedding, contract v2 preprocessing_spec]

tech-stack:
  added: []
  patterns: ["validate every untrusted header field before payload conversion or filter design", "one shared transport helper pair used by writer, reader and offline scripts"]

key-files:
  created: []
  modified:
    - lambdas/shared/reef_audio.py
    - lambdas/shared/tests/test_reef_audio.py

key-decisions:
  - "Frames are limited to the bytes actually present, so a header that lies about its data size can neither inflate allocation nor trip AUDIO_TOO_LONG; the 600 s bound applies to the frames really in the file."
  - "DecodedAudio.format_tag is the effective encoding tag (1 or 3); for WAVE_FORMAT_EXTENSIBLE it is the SubFormat tag, not 0xFFFE."
  - "Float WAVs containing NaN, infinity or values that overflow float32 are rejected as INVALID_AUDIO_FORMAT rather than propagated (nothing non-finite can reach levels, windows or DynamoDB)."
  - "pcm16_wav_bytes rounds to nearest (not truncates) after clipping, maps +/-1.0 to +/-32767, and turns NaN into 0."

requirements-completed: [ML-01, ML-02]

completed: 2026-10-14
actuals:
  tokens: 21000
  tasks: 3
  commits: 6
---

# Phase 5 Plan 05: Complete reef_audio (decode matrix, bounds, transport) Summary

**reef_audio now decodes every supported WAV variant with identical full-scale scaling, refuses hostile headers with typed codes before any expensive work, and owns the segment transport (float32 windows plus a hash-bearing sidecar) and spec summary that the rest of Phase 5 builds on; SPEC_VERSION is frozen.**

## What was built

- **Tracer (Task 1):** a 12 s, 48 kHz, stereo, 24-bit upload travels decode_wav -> audio_to_windows (2 windows) -> encode_segments -> decode_segments (array_equal) -> build_sidecar -> parse_sidecar. `SEGMENTS_FORMAT = "f32le"`, `SIDECAR_SCHEMA_VERSION = 1`, `SEGMENT_BYTES_PER_WINDOW = 640000`, `SidecarError`. parse_sidecar rejects wrong schema version, wrong format, wrong window_samples, level lists of the wrong length, segments_bytes not equal to windows x 640000, bad spec_version, bad hash, missing keys, non-JSON, and NaN/Infinity constants. build_sidecar also checks the segments length.
- **Decode matrix and bounds (Task 2):** `MAX_CHANNELS = 8`, `SUPPORTED_FORMAT_TAGS = (1, 3, 0xFFFE)`. Explicit chunk loop with odd-chunk padding; fmt validated (tag, extensible SubFormat, channels, bit depth per encoding, block align, rate 4,000-192,000 Hz) and duration (600 s) checked from the frames actually present, all before `_convert_payload` runs. Error messages name the value ("Unsupported bit depth: 12-bit PCM"). Typed codes INVALID_AUDIO_FORMAT / AUDIO_TOO_SHORT / AUDIO_TOO_LONG.
- **Levels, playback copy, spec (Task 3):** levels/silence semantics from 05-02 confirmed with tests (digital silence, DC-only, full scale, 1e-9 floor, allow_nan=False). `pcm16_wav_bytes(samples, rate)` clips before the cast and writes a canonical 44-byte header. `spec_summary()` returns the JSON-serialisable description for contract v2 (resampling, scaling, levels, supported input, embedding model identity). A FROZEN comment sits above SPEC_VERSION.

## Verification

- `py -3.12 -m pytest lambdas/shared/tests/test_reef_audio.py -q`: 108 tests, passed on three consecutive runs.
- `-k "transport or sidecar"`, `-k decode`: pass. Acceptance greps: `SEGMENTS_FORMAT = "f32le"` 1, `def parse_sidecar` 1, `MAX_CHANNELS = 8` 1. The spec_summary one-liner prints `preproc-2026.10.1-reef-audio 5.0`.
- Full suite `py -3.12 -m pytest -q`: everything passes except `scripts/tests/test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent`, the known Windows CRLF noise in this worktree (it rewrites `data/audio-manifest.json` and two dashboard fixtures; they were restored with `git checkout --` and not committed).
- TDD gates: each task has a `test(05-05)` RED commit followed by a `feat(05-05)` GREEN commit (the Task 3 level/silence tests already held for the 05-02 code; only pcm16_wav_bytes and spec_summary were RED).

## Threat model status

- T-05-05-01 (header DoS): mitigated and tested (`test_decode_rejects_bad_headers`, `test_decode_sample_rate_bounds_rejected`, `test_decode_too_long_before_payload`, `test_decode_rejects_bad_channel_counts`).
- T-05-05-02 (non-finite to DynamoDB): mitigated (`test_window_sidecar_never_non_finite`, `test_normalise_*`).
- T-05-05-03 (segments tampering): sidecar carries sha256 and byte size; parse_sidecar validates size. The hash check itself is 05-09's job.
- T-05-05-04 (int16 wrap): mitigated (`test_window_playback_copy_clips`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Reject non-finite float samples**
- **Found during:** Task 2
- **Issue:** a float32/float64 WAV can hold NaN, infinity or float64 values that overflow float32; the plan's behaviour list did not cover them and they would reach the resampler, levels and the stored windows.
- **Fix:** `_convert_payload` raises InvalidAudioFormatError ("non-finite") if any decoded float sample is not finite.
- **Files modified:** lambdas/shared/reef_audio.py; test `test_decode_rejects_non_finite_float_samples`
- **Commit:** cd98229

**2. [Interpretation] Too-long check uses frames present, not the declared size**
- The plan says both "declared frames / rate exceed 600 s raises AudioTooLongError" and "frames limited to bytes actually present". The implementation applies the 600 s bound to min(declared, present) frames, so a lying header cannot cause allocation and a genuinely long file is refused before conversion. A header declaring 700 s with a few bytes present decodes just those bytes (`test_decode_header_lying_about_size_does_not_inflate_frames`).

None of the 05-02 behaviour (normalisation, resampler) was changed.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths or storage; transport helpers are pure functions.

## Self-Check: PASSED

- lambdas/shared/reef_audio.py and lambdas/shared/tests/test_reef_audio.py exist and are committed.
- Commits 90ad834, 48c64f3, 72da243, cd98229, 5217637, 5c0f2fb exist on this branch.
