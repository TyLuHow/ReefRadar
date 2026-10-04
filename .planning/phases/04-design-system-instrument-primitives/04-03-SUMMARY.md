---
phase: 04-design-system-instrument-primitives
plan: 03
subsystem: ui
tags: [dsp, stft, wav, spectrogram, magma, fft.js, d3-scale-chromatic, fixed-range-db]

requires:
  - phase: 04-design-system-instrument-primitives
    provides: Tailwind 4 CSS-first build and the feature fence (04-01), token source (04-02)
provides:
  - src/features/instrument/dsp: pure (no DOM) WAV parser, STFT with fixed-range dB quantisation, magma LUT and image builder, level helpers
  - SPECTROGRAM_SPEC, the one constant captions print (1024 Hann, hop 256, -120 to -50 dB re full scale, magma, uncalibrated)
  - fft.js 4.0.4 and d3-scale-chromatic 3.1.0 (+ @types) installed with exact pins and imported under src
affects: [04-04, 04-13, 04-24, wells, colourbar, window-strip, strip-plot]

actuals:
  tokens: 9000
  tasks: 2
  commits: 5

tech-stack:
  added: [fft.js 4.0.4, d3-scale-chromatic 3.1.0, "@types/d3-scale-chromatic 3.1.0 (dev)"]
  patterns:
    - "DSP as pure functions over Float32Array/Uint8Array with no DOM, so it can move into a Worker unchanged"
    - "One fixed shared dB range; levels are clamped and quantised to 0..255, never auto-scaled per clip"
    - "Tests parse the real committed excerpts from disk; synthesised signals are maths vectors that stay in tests"
    - "Golden statistics asserted within +/-1 level instead of checksums (Math.log10 last-bit differences)"

key-files:
  created:
    - dashboard-next/src/features/instrument/dsp/spec.ts
    - dashboard-next/src/features/instrument/dsp/wav.ts
    - dashboard-next/src/features/instrument/dsp/stft.ts
    - dashboard-next/src/features/instrument/dsp/fft-js.d.ts
    - dashboard-next/src/features/instrument/dsp/colormap.ts
    - dashboard-next/src/features/instrument/dsp/levels.ts
    - dashboard-next/src/features/instrument/dsp/index.ts
    - dashboard-next/tests/unit/wav.test.ts
    - dashboard-next/tests/unit/stft.test.ts
    - dashboard-next/tests/unit/colormap.test.ts
    - dashboard-next/tests/unit/levels.test.ts
    - dashboard-next/tests/unit/support/clips.ts
  modified:
    - dashboard-next/package.json
    - dashboard-next/package-lock.json

key-decisions:
  - "FFT size 1024 (periodic Hann, hop 256) per UI-SPEC A6; the range stays -120 to -50 dB. With these parameters at most 0.96 % of cells of any excerpt clamp to level 0 and at most 0.18 % to level 255 (table below), so the range loses almost nothing"
  - "The LUT parser accepts both #rrggbb (what interpolateMagma returns) and rgb(r, g, b)"
  - "frameMagnitudes reuses one Float64Array between callbacks (documented); levels and spectrogram share it so band means use exactly the spectrogram's normalisation"

patterns-established:
  - "tests/unit/support/clips.ts is the single route to the real excerpts and the manifest for DSP tests"

requirements-completed: []
requirements-advanced: [DS-03]

coverage:
  - id: D1
    description: "A pure WAV parser reads the real committed excerpts (16000 Hz mono, 480000 samples, samples in [-1, 1)) and throws WavFormatError for non-RIFF, float, 8-bit, oversized-chunk and no-data inputs"
    requirement: DS-03
    verification:
      - kind: unit
        ref: "tests/unit/wav.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The STFT matches a naive DFT, reads a full-scale bin-centred sine at 0 dB, gives 1872 x 513 for ind_H1, quantises the fixed -120 to -50 dB range to 0..255 without per-clip scaling, and reproduces recorded golden statistics"
    requirement: DS-03
    verification:
      - kind: unit
        ref: "tests/unit/stft.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "A 256-step magma LUT sampled from d3-scale-chromatic with its CC0 source credited in the file; the image builder puts 0 Hz on the bottom row and frame 0 in the left column"
    requirement: DS-03
    verification:
      - kind: unit
        ref: "tests/unit/colormap.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Whole-clip RMS of all nine parsed excerpts equals the manifest rms_dbfs within 0.1 dB; window levels and band means are finite and consistent"
    requirement: DS-03
    verification:
      - kind: unit
        ref: "tests/unit/levels.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Whether the fixed -120 to -50 dB magma range reads well to a person on screen (wells, colourbar) is judged when the primitives render it in later plans"
    requirement: DS-03
    human_judgment: true
    rationale: "No rendering exists in this plan; legibility of the scale is a visual judgement for the well/colourbar plans"

duration: 14min
completed: 2026-10-04
status: complete
---

# Phase 4 Plan 03: DSP core Summary

**Pure, DOM-free spectrogram pipeline: hand-written PCM16 WAV parser, 1024-point Hann STFT (fft.js, hop 256) quantised onto one fixed -120 to -50 dB re-full-scale range, a 256-step magma LUT sampled from d3-scale-chromatic with its CC0 source credited, and level helpers whose whole-clip RMS reproduces the manifest `rms_dbfs` of all nine real excerpts within 0.1 dB.**

## What was built

- **Packages** (`0baabbf`): `fft.js@4.0.4`, `d3-scale-chromatic@3.1.0`, `@types/d3-scale-chromatic@3.1.0 -D`, exact pins, lockfile committed (16 lines added; no new transitive packages beyond these three).
- **Task 1** (TDD: RED `b20bb98`, GREEN `132e8da`): `spec.ts` (`SPECTROGRAM_SPEC`, `DB_TICKS`, `SpectrogramSpec`), `fft-js.d.ts` (narrowed ambient types over the package's `any` declarations), `wav.ts` (RIFF chunk walker, every chunk size bounds-checked, PCM16 only, stereo averaged, `WavFormatError`), `stft.ts` (`computeSpectrogram`, `frameMagnitudes`, `frameCount`, `dbAt`, `binHz`, `SpectrogramMatrix`), `index.ts` barrel.
- **Task 2** (TDD: RED `743472c`, GREEN `aafe3d6`): `colormap.ts` (`MAGMA_LUT`, `lutColor`, `matrixToImageData`), `levels.ts` (`rmsDbfs`, `windowLevelsDb`, `bandMeanDb`), barrel extended.

## Package legitimacy

`gsd-tools query package-legitimacy check --ecosystem npm fft.js d3-scale-chromatic @types/d3-scale-chromatic`:

| Package | Verdict | Weekly downloads | postinstall | Licence (npm view) |
|---------|---------|------------------|-------------|--------------------|
| fft.js 4.0.4 | OK | ~886k | none | MIT |
| d3-scale-chromatic 3.1.0 | OK | ~28.7M | none | ISC |
| @types/d3-scale-chromatic 3.1.0 | OK | ~26.1M | none | MIT |

The exact versions and repository URLs were also cross-checked against the live registry with `npm view` before installing, consistent with the RESEARCH audit and the owner's standing approval. `npm install` printed an `allowScripts` notice for `unrs-resolver` (a pre-existing transitive package, not from this plan).

## Real-clip statistics (1024 Hann, hop 256, dB re full scale, exact values before clamping)

Percentiles are over every STFT cell of the clip. "At 0 / at 255" is the share of cells clamped to the range ends of -120 and -50 dB.

| Clip | p1 dB | p50 dB | p99.5 dB | at level 0 | at level 255 |
|------|-------|--------|----------|-----------|--------------|
| aus_D1 | -114.6 | -95.4 | -69.4 | 0.31 % | 0.001 % |
| aus_H1 | -110.7 | -89.7 | -54.9 | 0.12 % | 0.177 % |
| aus_H2 | -110.0 | -89.6 | -59.1 | 0.12 % | 0.066 % |
| aus_R1 | -117.6 | -98.2 | -63.5 | 0.60 % | 0.011 % |
| ind_D1 | -109.1 | -87.3 | -65.3 | 0.09 % | 0.009 % |
| ind_H1 | -113.5 | -93.9 | -70.9 | 0.24 % | 0.002 % |
| ind_N1 | -119.7 | -100.6 | -75.4 | 0.96 % | 0.000 % |
| ind_R1 | -113.5 | -93.4 | -66.6 | 0.24 % | 0.007 % |
| mex_R1 | -114.9 | -95.2 | -70.1 | 0.32 % | 0.006 % |

The fixed range holds every clip with under 1 % of cells clamped at the dark end and under 0.2 % at the bright end. The quietest clip (ind_N1) sits lowest and the loudest (aus_H1) highest, so cross-clip comparison by eye is meaningful, which is the reason nothing auto-scales.

Golden cells for ind_H1 (recorded in `stft.test.ts`, asserted within +/-1 level): mean quantised value 95.451; (frame, bin) = (100, 20) 127, (500, 64) 98, (900, 128) 85, (1300, 256) 90, (1800, 480) 89.

Manifest check: `rmsDbfs` of all nine parsed clips is within 0.1 dB of the manifest `rms_dbfs` (for example aus_D1 -61.9, aus_H1 -47.46, ind_N1 -67.11), which validates the parser and the level maths on real data.

## Verification run

- `npx vitest run tests/unit/wav.test.ts tests/unit/stft.test.ts`: pass (25 tests).
- `npx vitest run tests/unit/colormap.test.ts tests/unit/levels.test.ts tests/unit/stack-consolidation.test.ts`: pass (56 tests including the stack gate, which now sees both runtime packages imported).
- `npm test`: 45 files, 631 passed, 0 failed (575 before, 56 new).
- `npm run lint`: 0 errors, 19 warnings (same count as 04-02; none in this plan's files). `npm run typecheck`: clean. `npm run build`: green. `node ../scripts/check-feature-fence.mjs`: OK, 42 files.
- Acceptance greps: package pins check exits 0; `grep -c "dbMax: -50" spec.ts` prints 1; `grep -c "CC0" colormap.ts` prints 1 (a test also requires both designers' names in the file).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] LUT colour parser assumed `rgb(...)` strings**
- **Found during:** Task 2 GREEN
- **Issue:** `interpolateMagma` returns `#rrggbb`, so the first parser (digits in `rgb(...)`) threw at step 0.
- **Fix:** `parseColor` accepts hex and `rgb()` forms.
- **Files modified:** `dashboard-next/src/features/instrument/dsp/colormap.ts`
- **Commit:** aafe3d6

**2. [Rule 1 - Bug] Two of my own test assertions were wrong**
- **Found during:** Task 2 GREEN
- **Issue:** the band-mean sine test allowed +/-1.5 dB around 1/13 of the power, but a periodic Hann sine puts power 1 plus 0.25 in each neighbouring bin (1.5 total), so the correct value is 10 log10(1.5 / 13) = -9.38 dB; and the CC0 credit assertion required the two designer names on one line while the header wrapped them.
- **Fix:** the test now asserts the exact analytic value to one decimal; the header was reflowed so each name is on one line.
- **Files modified:** `dashboard-next/tests/unit/levels.test.ts`, `dashboard-next/src/features/instrument/dsp/colormap.ts`
- **Commit:** aafe3d6

### Plan variations (judgement calls)

- **Package install as its own commit** (`0baabbf`, `chore`), ahead of the RED commit, so the lockfile change is isolated.
- **Extra test helper** `tests/unit/support/clips.ts` (not in the plan's `files_modified`) gives the four DSP tests one route to the real excerpts and manifest instead of four copies.
- **Task 1 golden numbers** were recorded after the implementation existed and added in the GREEN commit (the numbers cannot be known at RED); the RED commit already covers the structure, range and normalisation behaviours.
- **Stack gate between commits.** The plan installs `d3-scale-chromatic` in Task 1 but it is first imported in Task 2, so `stack-consolidation.test.ts` ("every runtime dependency is imported under src") is red for the Task 1 commits and green again from `aafe3d6`. The gate was run at the end of Task 2 as the plan specifies.
- **fft.js types.** The plan asked for an ambient `declare module 'fft.js'`; the package does ship `fft.d.ts` but with `any` parameters, so the ambient declaration narrows it (it takes precedence in TypeScript).

**Total deviations:** 2 auto-fixed (both Rule 1, both in code or tests written in this plan), 5 recorded judgement calls. **Impact:** none on scope.

## Known notes (not stubs)

- DS-03 is advanced, not completed: it also covers dark wells, the dB colourbar and the waveforms, which plans 04-13 and 04-24 deliver on top of this core. It was not marked complete in REQUIREMENTS.md.
- Synthesised signals (a bin-centred sine, a Nyquist tone, a +/-0.5 square wave, a 16-point vector, hand-built malformed headers) exist only in `tests/unit` as maths vectors. They are never shipped, rendered or labelled as reef recordings.
- Nothing imports the dsp module from a route yet, so it adds no bundle weight until the well primitives use it; the build is unchanged.

## Known Stubs

None.

## Threat Flags

None. T-04-03-SC mitigated (legitimacy check recorded above, exact pins, lockfile committed, no postinstall scripts in the three packages). T-04-03-01 mitigated: the chunk walker bounds-checks every chunk size against the remaining buffer and throws `WavFormatError` instead of reading past the end (covered by a test with a declared size of 0x7fffffff and one with no data chunk).

## Self-Check: PASSED

- Created files exist: `spec.ts`, `wav.ts`, `stft.ts`, `fft-js.d.ts`, `colormap.ts`, `levels.ts`, `index.ts` under `dashboard-next/src/features/instrument/dsp/`; `wav.test.ts`, `stft.test.ts`, `colormap.test.ts`, `levels.test.ts`, `support/clips.ts` under `dashboard-next/tests/unit/` (checked with `[ -f ]`).
- Commits `0baabbf`, `b20bb98`, `132e8da`, `743472c`, `aafe3d6` exist in `git log`.
- TDD gate: `test(04-03)` commits `b20bb98` and `743472c` precede `feat(04-03)` commits `132e8da` and `aafe3d6`.
- All task acceptance criteria and the plan-level verification re-run green (see Verification run).
