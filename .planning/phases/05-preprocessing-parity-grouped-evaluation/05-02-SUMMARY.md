---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 02
subsystem: ml-preprocessing
tags: [audio, resampling, kaiser, polyphase, surfperch, numpy, scipy-oracle]
status: complete

requires:
  - phase: 02-data-contract
    provides: "contract version pattern ^[a-z0-9][a-z0-9.+-]*$ and the lambdas/shared module pattern (contract_stamp.py)"
provides:
  - "lambdas/shared/reef_audio.py: audio_to_windows(wav_bytes) -> PreparedAudio, SPEC_VERSION preproc-2026.10.1-reef-audio"
  - "Pure-NumPy block-streamed polyphase Kaiser resampler equal to scipy.signal.resample_poly defaults"
  - "perch-hoplite wrapper normalisation (DC removal, peak 0.25, explicit silent branch) plus pre-normalisation peak/RMS dBFS"
  - "Embedding model identity constants (handle and SavedModel sha256s) for the preprocessing spec"
  - "scipy==1.13.1 test-only pin"
affects: [05-05 full WAV decode and segment transport, 05-03 05-04 preprocessor and classifier wiring, contract v2 preprocessing_spec build recipe, offline re-embedding]

tech-stack:
  added: ["scipy==1.13.1 (test-only, requirements-dev.txt)"]
  patterns: ["stdlib+NumPy shared module bundled flat into zips", "tap-ordered float64 accumulation so results are block-size and BLAS independent"]

key-files:
  created:
    - lambdas/shared/reef_audio.py
    - lambdas/shared/tests/test_reef_audio.py
  modified:
    - requirements-dev.txt

key-decisions:
  - "Resampler accumulates taps in a fixed-order loop (acc += x[q-k] * bank[k][r]) rather than building a (block, L) gather and calling sum(axis=1): same float64 result to 1e-15, no BLAS, bit-identical across block sizes, and peak memory stays at output size plus a few block-sized vectors."
  - "audio_to_windows passes the mono float32 decoded samples straight to the resampler (a float32 view, exact in float64) and only calls mix_to_mono (float64) for multi-channel input, so a mono upload never gets a whole-signal float64 copy."
  - "decode_wav already enforces the 4-192 kHz header rate bound (T-05-02-01); resample_poly enforces it again so the filter can never be designed for an unbounded rate."

requirements-completed: [ML-01]

duration: ~35min
completed: 2026-10-13
actuals:
  tokens: 7200
  tasks: 2
  commits: 2
---

# Phase 5 Plan 02: reef_audio Shared Preprocessing Summary

**One tested function, reef_audio.audio_to_windows, turns a WAV upload into SurfPerch-ready 5 s / 32 kHz windows (perch-hoplite DC removal plus peak 0.25) using a pure-NumPy Kaiser polyphase resampler proven equal to scipy.signal.resample_poly to 2.7e-15.**

## What was built

- `lambdas/shared/reef_audio.py` (stdlib + NumPy only, checked by an AST test): constants frozen under `SPEC_VERSION = "preproc-2026.10.1-reef-audio"`, error classes carrying `error_code`, `DecodedAudio` / `PreparedAudio`, `decode_wav` (RIFF chunk walk, 16-bit PCM path), `mix_to_mono`, `design_kaiser_filter`, `resample_poly`, `frame_windows`, `window_levels`, `normalise_windows`, `audio_to_windows`. The module docstring states the committed filter behaviour honestly (about 54 dB stopband, 5.1 kHz transition band to 32 kHz, 2.6 kHz for 16 to 32 kHz, 17 to 18.6 kHz only partly attenuated).
- `lambdas/shared/tests/test_reef_audio.py`: 44 tests. End-to-end oracle on all 9 committed MARRS excerpts (each gives 6 windows of 160000 float32, within 2e-6 of an independent stdlib-`wave` + scipy oracle), normalisation, silent window, levels, trailing partial window, determinism, SPEC_VERSION pattern, import purity, and Task 3's resampler parity at 8, 11.025, 16, 22.05, 44.1, 48 and 96 kHz (float64 at 1e-12, float32 at 2e-6), block-size invariance (4096 / 32768 / larger than output), identity at 32 kHz, alias suppression, passband level, streamed memory, rate bounds and a filter-design check against `scipy.signal.firwin`.
- `requirements-dev.txt`: `scipy==1.13.1` with a comment.

## Verification

- `py -3.12 -m pytest lambdas/shared/tests/test_reef_audio.py -q`: 44 passed, three consecutive runs, about 6 s each (deterministic).
- Acceptance greps: SPEC_VERSION line count 1, `54 dB` count 1, `^scipy==1.13.1` count 1. The plan's `audio_to_windows` one-liner prints `(6, 160000) float32 preproc-2026.10.1-reef-audio`.
- Measured margins: max difference vs scipy float64 is 2.2e-15 to 2.7e-15 (bound 1e-12); 60 s of 96 kHz float32 input peaks at 18.5 MB under tracemalloc (bound 46.1 MB).
- Whole suite `py -3.12 -m pytest`: 552 passed, 1 skipped, 1 failed (see Deferred Issues; unrelated to this plan).

## Task 1 package legitimacy gate (scipy==1.13.1) - evidence and approval

Task 1 was a blocking `checkpoint:human-verify`; it was resolved before this run and is recorded here as the plan requires.

- Owner approval: the owner replied "approved" on 2026-10-13. The approval citation is `.planning/research/DRIVING-QUESTIONS.md:32` ("Standing owner approvals (2026-10-01)", all new test/dev packages) plus the 05-CONTEXT amendment "scipy for tests only".
- Orchestrator verification of the three steps: PyPI scipy 1.13.1 exists (first upload 2024-05-23T03:19:01, BSD licence, source https://github.com/scipy/scipy); `py -3.12 -m pip install --dry-run scipy==1.13.1` resolves to scipy 1.13.1 only (numpy requirement `>=1.22.4,<2.3`, satisfied by numpy 1.26.4 already installed).
- Executor re-check in this worktree: `py -3.12 -m pip install --dry-run scipy==1.13.1` printed `Requirement already satisfied: scipy==1.13.1 ... (1.13.1)` and `Requirement already satisfied: numpy<2.3,>=1.22.4 ... (1.26.4)`. No package was installed by this run, and no transitive package appears.
- Test-only use is enforced by `test_module_imports_only_stdlib_and_numpy` (T-05-02-SC).

## Deviations from Plan

### Auto-fixed Issues

None required fixes. Two implementation choices differ in detail from the plan text:

**1. [Design choice] Tap-ordered accumulation instead of a gathered (block, L) product with `sum(axis=1)`**
- **Why:** the gathered form allocates several `block x L` temporaries; at 96 kHz (L = 61) that is about 64 MB of temporaries and would break the plan's own memory bound (below 8 bytes x input samples). The tap loop accumulates in float64 in fixed order, is elementwise (no BLAS), and keeps the result independent of block size.
- **Effect:** same maths, 2.7e-15 from scipy, output bit-identical across block sizes, peak memory 18.5 MB.

**2. [Design choice] `mix_to_mono` is skipped for mono input**
- `audio_to_windows` feeds the float32 mono view directly to the resampler (conversion to float64 is exact and happens per block). `mix_to_mono` keeps its specified float64 return and is used for multi-channel input. Window values are unchanged.

**3. [Process] Task 3's tests were written together with Task 2's**
- The resampler tests (task 3) were included in the RED commit and the block-streamed resampler was written in the GREEN commit, so Task 3's "adjust only where a test fails" step needed no change. Both commits therefore carry the combined work; there is no separate Task 3 commit.

## TDD Gate Compliance

RED commit `8e1b8ac` (tests fail at import: `ModuleNotFoundError: reef_audio`, confirmed by moving the module aside), GREEN commit `9f0b505`. No refactor commit.

## Deferred Issues (out of scope, not fixed)

- `scripts/tests/test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent` fails in this worktree: the regenerated manifest is written with LF while the working-tree copy is checked out as CRLF (git `autocrlf`), so the byte comparison fails. It also rewrites `dashboard-next/tests/fixtures/api/samples.json`, `dashboard-next/tests/fixtures/api/sites.json` and `data/audio-manifest.json` as side effects; I restored them with `git checkout -- <file>` so the tree is clean. This is unrelated to reef_audio.

## Known Stubs

None.

## Threat Flags

None. Threat register coverage: T-05-02-01 (header rate bound in `decode_wav` and `resample_poly`, tested by `test_resample_rejects_unbounded_rates`; the extended header-bounds tests land in 05-05), T-05-02-02 (`test_resample_memory_is_streamed`), T-05-02-03 (`test_normalise_silent_window_stays_zero`), T-05-02-SC (checkpoint evidence above).

## Notes for downstream plans

- 05-05 extends `decode_wav` to the full matrix (float32, 24-bit, 8-bit, extensible) and adds the segment transport helpers; `DecodedAudio.samples` is already float32 `(frames, channels)` and `resample_poly` accepts float32 or float64.
- Window levels are measured on the float64 resampled signal before DC removal, floored at `DBFS_FLOOR = -120.0`; `silent` is True when a window has no signal after DC removal.

## Self-Check: PASSED

- `lambdas/shared/reef_audio.py`, `lambdas/shared/tests/test_reef_audio.py`, `requirements-dev.txt` present.
- Commits `8e1b8ac` and `9f0b505` present in `git log`.
