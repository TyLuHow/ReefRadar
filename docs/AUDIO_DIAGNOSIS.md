# Audio Diagnosis Report

Date: 2026-02-24

## Problem Statement

Two issues reported on the ReefRadar Experience page (`/experience?mode=demo`):

1. **Healthy and degraded demo audio sound too similar** -- both have a crackling quality, no clear perceptual difference.
2. **Frequency band filter toggles do not produce a noticeable difference** -- toggling Low/Mid/High buttons has no audible effect.

---

## 1. Filter Architecture

### 1.1 Two Separate Audio Systems

The dashboard has **two independent audio systems** that do NOT share filter logic:

| System | File | Used By | Has Filters? |
|--------|------|---------|--------------|
| `useAudioPlayback` | `src/components/experience/useAudioPlayback.ts` | Standalone playback (not demo) | YES -- BiquadFilterNodes |
| `useDemoAudio` | `src/components/experience/useDemoAudio.ts` | Demo mode (`DemoState.tsx`) | **NO** -- no filters at all |

**This is the root cause of Issue #2.** The demo page uses `useDemoAudio`, which has zero filter nodes. The `useAudioPlayback` hook with its BiquadFilterNodes is never used on the demo page.

### 1.2 DemoState.tsx Band Toggles Are Cosmetic Only

In `DemoState.tsx` (lines 33-39), the `toggleBand()` function modifies a local React state `activeBands`, but this state is **only passed to `SpectrogramCanvas`** for visual rendering -- it is never connected to any audio processing:

```typescript
// DemoState.tsx line 33-39
function toggleBand(band: BandId) {
  setActiveBands((prev) => {
    const next = new Set(prev);
    if (next.has(band)) next.delete(band);
    else next.add(band);
    return next;
  });
}
```

The `activeBands` state flows to:
- `SpectrogramCanvas` component (visual only, line 48)

It does NOT flow to:
- `useDemoAudio` (which has no filter API)
- Any audio graph nodes

### 1.3 Audio Graph in useDemoAudio (Demo Mode)

The actual signal path in demo mode has NO filters:

```
healthyBufferSource ---> healthyGain ---> analyserNode ---> destination
                                              ^
degradedBufferSource ---> degradedGain --------+
```

The crossfade slider works correctly (equal-power crossfade via `Math.cos`/`Math.sin`), but there is simply no filter infrastructure in this hook.

### 1.4 Audio Graph in useAudioPlayback (NOT used in demo)

The standalone hook `useAudioPlayback.ts` does have a proper parallel filter architecture:

```
                    +---> lowpass(1000Hz) ---> lowGain --+
                    |                                     |
bufferSource -------+---> bandpass(2500Hz,Q=1) ---> midGain ---+---> masterGain ---> analyser ---> destination
                    |                                     |
                    +---> highpass(4000Hz) ---> highGain --+
```

**This architecture is correctly parallel.** The source fans out to three parallel filter branches, each with its own gain node, merging into a master gain. Toggling a band sets its gain to 0 or 1 (lines 207-230).

However, this hook is **never used by the demo page**.

### 1.5 Filter Implementation Quality (useAudioPlayback)

Even though it is not used in demo mode, the filter implementation has issues:

| Property | Value | Assessment |
|----------|-------|------------|
| Low filter type | `lowpass` at 1000 Hz | OK |
| Mid filter type | `bandpass` at 2500 Hz, Q=1 | **Q too low** -- bandwidth is 2500 Hz (range ~1250-3750), very wide and overlapping with low/high |
| High filter type | `highpass` at 4000 Hz | OK |
| Overlap | Significant between bands | Low bleeds into mid, mid bleeds into high |
| Gap coverage | None, but with overlap this is acceptable | -- |

The bandpass Q of 1 means the -3dB bandwidth equals the center frequency (2500 Hz). This creates a filter from roughly 1250-3750 Hz, which overlaps significantly with both the lowpass (which rolls off above 1000 Hz but still passes energy up to ~2000 Hz) and the highpass (which starts passing above 4000 Hz but has energy from ~2000 Hz).

The overlapping filter design means toggling a single band removes less energy than expected -- the same frequencies are partially passed by adjacent bands.

### 1.6 AudioCompare.tsx (Separate Component)

`AudioCompare.tsx` (at `src/components/audio/AudioCompare.tsx`) is a separate component with its own audio system. It also has **no filter nodes** -- just crossfade between healthy and degraded with per-channel analyser nodes for separate spectrograms.

---

## 2. Current Audio Analysis

### 2.1 Demo WAV File Properties

| Property | healthy-reef.wav | degraded-reef.wav |
|----------|-----------------|-------------------|
| Source site | ind_H4 | ind_D2 |
| Sample rate | **16,000 Hz** | **16,000 Hz** |
| Duration | 15.00s | 15.00s |
| Nyquist frequency | 8,000 Hz | 8,000 Hz |
| Channels | Mono | Mono |
| File size | 480 KB | 480 KB |
| RMS power | 0.000919 | 0.000422 |
| Peak amplitude | 0.0428 | 0.0150 |
| Peak frequency | 453 Hz | 266 Hz |

### 2.2 Spectral Band Distribution

| Band | Healthy | Degraded | Delta |
|------|---------|----------|-------|
| Low (<1 kHz) | 40.5% | 44.4% | -3.9% |
| Mid (1-4 kHz) | 15.0% | 17.7% | -2.7% |
| High (>4 kHz) | 44.5% | 37.9% | +6.7% |

### 2.3 Absolute Power Comparison

| Metric | Healthy | Degraded | Ratio (H/D) |
|--------|---------|----------|-------------|
| RMS power | 0.000919 | 0.000422 | **2.18x** |
| Total power (sum) | 0.0140 | 0.0230 | **0.61x** |
| Fish (50-1kHz) | 8e-8 | 1.4e-7 | **0.54x** |
| Grazing (1-4kHz) | 3e-8 | 5e-8 | **0.49x** |
| Shrimp (2-8kHz) | 6e-8 | 1e-7 | **0.61x** |

### 2.4 Critical Finding: The "Degraded" File Has MORE Spectral Power

**The degraded file actually has MORE total spectral power than the healthy file across all ecological bands.** The healthy file has higher RMS but lower spectral density. This is the opposite of what we would expect: healthy reefs should have richer, louder bioacoustic activity, especially in the low-frequency fish call band.

Possible explanations:
1. The `prepare_demo_audio.py` script sources from `data/marrs_audio/` (not `data/marrs/samples/`), and may have picked arbitrary files without considering time-of-day or acoustic quality.
2. The ind_D2 recording may have been taken at a time with high abiotic noise (waves, boat noise) that inflates spectral power.
3. Both files were downsampled to 16 kHz from the original 32 kHz MARRS recordings, losing all content above 8 kHz.

### 2.5 Why They Sound Similar

The band distribution difference is only 3-7 percentage points between the two files. Both have:
- Similar spectral shape (dominant low-frequency energy)
- Very low absolute amplitude (both RMS < 0.001)
- The "crackling" quality is likely snapping shrimp clicks present in both, which dominate the perceptual experience
- No dramatic difference in any frequency band

For an audible "hear the difference" experience, we need at minimum a **3-5x power ratio** across key bands, ideally with the healthy file being louder and richer.

---

## 3. MARRS Sample Survey

### 3.1 Dataset Overview

- 219 total MARRS WAV files across 45 sites
- 80 healthy-site files (ind_H*, aus_H*, ken_H*, mal_H*, mex_H*)
- 69 degraded-site files (ind_D*, aus_D*, ken_D*, mal_D*, mex_D*)
- All files: 16,000 Hz sample rate, 60s duration, mono

### 3.2 Aggregate Statistics

| Metric | Healthy (n=80) | Degraded (n=68) | Ratio |
|--------|---------------|-----------------|-------|
| Mean RMS | 0.001256 | 0.000962 | 1.31x |
| Mean Total Power | 0.0147 | 0.0933 | 0.16x |
| Mean Low % | 62.1% | 59.3% | -- |
| Mean Mid % | 18.0% | 20.8% | -- |
| Mean High % | 19.9% | 19.9% | -- |

The aggregate statistics show surprisingly little difference between healthy and degraded sites in these downsampled 16 kHz files. The spectral distributions are nearly identical in proportional terms. This may indicate that the 16 kHz downsampling eliminates the most discriminative high-frequency content (snapping shrimp peaks at 2-8 kHz are partially preserved, but the sharp transients that make them perceptually distinctive may be smoothed).

### 3.3 Top Healthy Dawn/Dusk Candidates

Best candidates ranked by low-frequency richness + total power:

| Rank | File | Hour | Low% | Total Power | Fish Power | Notes |
|------|------|------|------|-------------|------------|-------|
| 1 | `mex_H1_20230627_171200.WAV` | 17 | 81.0% | 0.0632 | 2.8e-7 | Strongest low-freq, dusk chorus |
| 2 | `aus_H1_20230302_170400.WAV` | 17 | 87.9% | 0.0239 | 1.4e-7 | Very high low-freq ratio |
| 3 | `mex_H2_20230529_070400.WAV` | 07 | 50.3% | 0.0443 | 9e-8 | Best balanced spectrum |
| 4 | `ind_H3_20220918_053800.WAV` | 05 | 72.0% | 0.0173 | 5e-8 | Indonesian dawn, same region as current |
| 5 | `ind_H5_20220902_051000.WAV` | 05 | 48.4% | 0.0146 | 3e-8 | Good band diversity |

### 3.4 Top Degraded Midday Candidates

Best candidates ranked by lowest total power (quietest, most lifeless):

| Rank | File | Hour | Low% | Total Power | Fish Power | Notes |
|------|------|------|------|-------------|------------|-------|
| 1 | `mal_D2_20211115_110800.WAV` | 11 | 57.9% | **0.0012** | ~0 | Quietest file, Malaysia |
| 2 | `ind_D6_20220920_143000.WAV` | 14 | 26.5% | 0.0018 | ~0 | Very quiet, high-mid dominant |
| 3 | `ind_D4_20220913_111000.WAV` | 11 | 69.1% | 0.0022 | ~0 | Quiet, Indonesian |
| 4 | `ind_D1_20220915_113800.WAV` | 11 | 47.0% | 0.0025 | ~0 | Very quiet |
| 5 | `ind_D3_20220901_100000.WAV` | 10 | 58.7% | 0.0114 | 3e-8 | Moderate |

### 3.5 Maximum Contrast Pair

| | Current Demo | Recommended Replacement |
|-|-------------|------------------------|
| Healthy | `ind_H4` first 15s (Power: 0.014) | `mex_H1_20230627_171200.WAV` (Power: 0.063) |
| Degraded | `ind_D2` first 15s (Power: 0.023) | `mal_D2_20211115_110800.WAV` (Power: 0.0012) |
| **Power contrast** | **0.61x (inverted!)** | **53x** |

The recommended pair has a **53x power contrast** compared to the current pair which is actually inverted (degraded is louder than healthy).

---

## 4. Filter Frequency Recommendations

### 4.1 Sample Rate vs Filter Cutoffs

| Parameter | Value |
|-----------|-------|
| Demo WAV sample rate | 16,000 Hz |
| WAV Nyquist frequency | 8,000 Hz |
| Browser AudioContext sample rate | Typically 44,100 or 48,000 Hz |
| Browser resamples WAV? | **Yes** -- browsers always resample to AudioContext.sampleRate |

When the browser decodes a 16 kHz WAV into its 44.1 kHz AudioContext, it upsamples the audio. However, **no new frequency content is created above 8 kHz**. The upsampled audio has zero energy above 8 kHz because that content was never in the source file.

### 4.2 Filter Cutoff Assessment

| Filter | Cutoff | Usable Range (16kHz source) | Assessment |
|--------|--------|-----------------------------|------------|
| Lowpass | 1000 Hz | 0-1000 Hz | OK -- captures fish calls |
| Bandpass | 2500 Hz (Q=1) | ~1250-3750 Hz | OK -- captures grazing sounds |
| Highpass | 4000 Hz | 4000-8000 Hz | **Marginal** -- only captures 4-8 kHz of the original content |

The highpass filter at 4000 Hz with a 16 kHz source file means the "Snapping Shrimp" band only captures content from 4-8 kHz. In the original 32 kHz MARRS recordings, snapping shrimp energy extends to 16 kHz. We are losing half the shrimp band due to the 16 kHz sample rate.

### 4.3 Recommended Filter Adjustments

If the demo WAVs remain at 16 kHz:

| Band | Current | Recommended | Rationale |
|------|---------|-------------|-----------|
| Low | lowpass 1000 Hz | lowpass 800 Hz | Tighter focus on fish calls (50-800 Hz) |
| Mid | bandpass 2500 Hz Q=1 | bandpass 2000 Hz Q=1.5 | Narrower band, less overlap, captures parrotfish grazing |
| High | highpass 4000 Hz | highpass 3000 Hz | Captures more shrimp content given 8 kHz Nyquist |

If demo WAVs are upgraded to 32 kHz (recommended):

| Band | Recommended | Rationale |
|------|-------------|-----------|
| Low | lowpass 1000 Hz | Standard fish call range |
| Mid | bandpass 2500 Hz Q=2 | Higher Q for tighter isolation |
| High | highpass 4000 Hz | Full shrimp range with 16 kHz Nyquist |

---

## 5. Recommended Fix Plan

### Priority 1: Connect Filters to Demo Audio (Critical)

**Bug:** `DemoState.tsx` uses `useDemoAudio` which has no filter nodes. Band toggle buttons modify only visual state.

**Fix:** Either:
- **Option A (simpler):** Add BiquadFilterNode infrastructure to `useDemoAudio.ts`, inserting parallel filter branches between gain nodes and the analyser. Expose `toggleBand()` from the hook.
- **Option B (refactor):** Merge `useAudioPlayback` and `useDemoAudio` into a single hook that supports both single-buffer and dual-buffer (crossfade) modes with shared filter infrastructure.

Option A is recommended for speed; Option B for long-term cleanliness.

### Priority 2: Replace Demo Audio Files (Critical)

**Bug:** Current healthy/degraded files have near-identical spectral content. The degraded file actually has more spectral power than the healthy file.

**Fix:**
1. Replace `healthy-reef.wav` with a 15-second excerpt from `mex_H1_20230627_171200.WAV` (dusk chorus, 53x more power than best degraded candidate)
2. Replace `degraded-reef.wav` with a 15-second excerpt from `mal_D2_20211115_110800.WAV` (quietest degraded recording)
3. Consider keeping files at original 32 kHz instead of downsampling to 16 kHz, to preserve high-frequency shrimp content (file size doubles from 480 KB to 960 KB -- still small for web)
4. Update `ATTRIBUTION.md` to reflect new source sites

### Priority 3: Fix Filter Parameters (Medium)

**Bug:** Bandpass Q=1 is too wide, causing excessive overlap between bands. Toggling mid band removes less energy than expected because the same frequencies pass through low and high filters.

**Fix:**
- Increase bandpass Q to 1.5-2.0
- Adjust highpass cutoff to 3000 Hz if keeping 16 kHz sample rate
- Consider 32 kHz WAVs so the original 4000 Hz highpass cutoff is appropriate

### Priority 4: Add Normalization / Gain Matching (Low)

**Issue:** Even with better source files, the overall volume of both tracks should be perceptually matched so the difference is in spectral content, not just loudness. Currently, the equal-power crossfade compensates for volume, but the source files themselves have very different amplitudes.

**Fix:** Normalize both WAV files to the same peak or RMS level before serving them. This forces listeners to hear the *spectral* difference rather than just a volume difference.

### Priority 5: Consider Visual Feedback for Active Bands (Low)

**Issue:** When band toggles are connected to audio, users should see the spectrogram update to reflect which bands are active. Currently the spectrogram uses `activeBands` for visual filtering, which is good, but should be synchronized with the audio graph state.

---

## Summary of Bugs Found

| # | Severity | Component | Bug |
|---|----------|-----------|-----|
| 1 | **Critical** | `DemoState.tsx` / `useDemoAudio.ts` | Band toggle buttons are purely cosmetic. No audio filters exist in the demo audio hook. |
| 2 | **Critical** | `healthy-reef.wav` / `degraded-reef.wav` | Files have nearly identical spectral content. Degraded has MORE power than healthy (inverted). |
| 3 | **Medium** | `useAudioPlayback.ts` | Bandpass Q=1 too wide -- excessive overlap reduces perceived filter effect (unused in demo, but still buggy). |
| 4 | **Low** | Both demo WAVs | 16 kHz sample rate loses half the snapping shrimp frequency range (8-16 kHz). |
| 5 | **Low** | `prepare_demo_audio.py` | Script picks arbitrary files from `ind_H4`/`ind_D2` without considering time-of-day or acoustic quality. |
