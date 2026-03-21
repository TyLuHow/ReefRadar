---
phase: 03-audio-reactive-system
verified: 2026-03-21T07:00:00Z
status: human_needed
score: 3/3 must-haves verified
re_verification: false
human_verification:
  - test: "Shrimp burst particles fire during playback"
    expected: "When playing healthy reef audio, sudden bright teal particle flashes appear across the canvas at irregular intervals. Threshold is RMS > 0.4 on the shrimp band. Cooldown is ~200ms so they cluster in bursts, not a constant stream."
    why_human: "Cannot verify real-time rAF canvas rendering or that the demo audio actually produces shrimp band RMS > 0.4 programmatically."
  - test: "Fish caustic shimmer speed changes with energy"
    expected: "During fish calls the caustic light pattern in the background shimmers visibly faster (up to 4x). Switching to degraded audio noticeably reduces shimmer rate. Toggling the Fish Calls band OFF nearly freezes caustics."
    why_human: "Caustic phase speed is a visual temporal property; the code is correct but actual perceptibility requires human observation."
  - test: "Grazing gold highlights appear"
    expected: "Occasional warm gold-colored (hue=45) short-lived particles drift upward from the mid-to-bottom screen area during playback. They are sparser than shrimp bursts (max 1 per 5 frames when grazing RMS > 0.2)."
    why_human: "Threshold depends on actual audio content; cannot verify grazing band reliably produces RMS > 0.2 without running the app."
  - test: "Ambient dimming applies murkiness overlay"
    expected: "When ambient noise is high (RMS > 0.5), a subtle dark overlay (max ~15% opacity) dims the background. More pronounced during degraded reef playback."
    why_human: "Ambient energy level depends on actual audio content at runtime."
  - test: "Band toggle visual response"
    expected: "Clicking 'Snapping Shrimp' toggle OFF causes shrimp-band particles to render at 20% opacity (ghost-like). Clicking 'Fish Calls' OFF causes caustic shimmer to near-freeze. Both respond within 1 rAF frame."
    why_human: "Requires interacting with the UI band toggle controls and observing visual response."
  - test: "Canvas cleanup on navigation"
    expected: "Navigating away from /experience resets bandEnergy to all zeros in the vitality store. Background canvas reverts to purely vitality-driven behavior with no stale audio-reactive state."
    why_human: "Requires testing navigation lifecycle in a running browser."
---

# Phase 3: Audio-Reactive System Verification Report

**Phase Goal:** Live audio playback drives real-time visual micro-animations through frequency band analysis
**Verified:** 2026-03-21T07:00:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Audio playback produces per-band RMS energy (shrimp 2-20kHz, fish 200-2000Hz, grazing 1-4kHz, ambient <200Hz) at ~30fps | VERIFIED | `useAudioVisualBridge.ts`: REEF_BANDS constant defines all 4 bands; `hzPerBin = audioCtx.sampleRate / analyser.fftSize`; `frameCountRef.current % 2 === 0` throttles to ~30fps; `setBandEnergy()` called each analysis frame |
| 2 | Band energy triggers visible micro-animations (shrimp bursts, caustic shimmer, gold highlights, ambient dimming) | VERIFIED (code) / UNCERTAIN (visual) | `useBackgroundCanvas.ts` L319-409: all 4 visual behaviors implemented with correct thresholds and band assignments. Visual confirmation requires human testing. |
| 3 | Toggling a frequency band filter illuminates or dims corresponding visual layer in real time | VERIFIED (code) / UNCERTAIN (visual) | `useDemoAudio.ts` L298-311 syncs 3-band toggles to 4-band reef biology in store; `drawParticles` L220-222 applies 0.2x alpha when `!activeBands.has(p.band)`; `drawCaustics` L167 uses `0.01` rate when `fishActive === false` |

**Score:** 3/3 truths pass automated checks. 6 items flagged for human visual verification.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/stores/vitality-store.ts` | BandEnergy + activeBands slices with setBandEnergy/setActiveBands actions | VERIFIED | Exports `ReefBandId`, `BandEnergy`, `useVitalityStore`. Store has `bandEnergy: { ambient:0, fish:0, grazing:0, shrimp:0 }`, `activeBands: new Set([all 4])`, `setBandEnergy`, `setActiveBands`. Existing `target`/`source`/`setVitality` unchanged. |
| `src/hooks/useAudioVisualBridge.ts` | FFT bin slicing, 4-band RMS extraction, store writer at ~30fps | VERIFIED | 133 lines. Exports `useAudioVisualBridge`. Pre-allocates `Uint8Array<ArrayBuffer>` via `useRef`. Computes bins via `audioCtx.sampleRate / analyser.fftSize`. Throttles via `frameCountRef % 2`. Calls `useVitalityStore.getState().setBandEnergy()`. Clamps shrimp to Nyquist. Resets to zeros on unmount. |
| `src/hooks/useBackgroundCanvas.ts` | Audio-reactive particle bursts, caustic modulation, gold highlights, ambient dimming, band toggle visual response (min 200 lines) | VERIFIED | 426 lines (exceeds 200 min). `MAX_PARTICLES = 200`. `PoolParticle.band: ReefBandId \| null`. Reads `bandEnergy` and `activeBands` via single `getState()` call per frame. All 4 visual behaviors implemented. |
| `src/components/experience/useDemoAudio.ts` | Calls useAudioVisualBridge with analyserNode and audioContext | VERIFIED | Line 295: `useAudioVisualBridge(analyserRef, audioCtxRef, isPlaying)`. Lines 298-311: syncs 3-band toggles to 4-band reef biology via mapping. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `useAudioVisualBridge.ts` | `vitality-store.ts` | `useVitalityStore.getState().setBandEnergy()` | WIRED | L110: `useVitalityStore.getState().setBandEnergy(energy)` — direct store mutation each analysis frame. L125-130: reset to zeros on unmount. |
| `useDemoAudio.ts` | `useAudioVisualBridge.ts` | `useAudioVisualBridge(analyserRef, audioCtxRef, isPlaying)` | WIRED | L6: import. L295: call site passes `analyserRef`, `audioCtxRef`, `isPlaying` — correct refs from the audio graph setup at L43/L158. |
| `useBackgroundCanvas.ts` | `vitality-store.ts` | `useVitalityStore.getState()` reading `bandEnergy` and `activeBands` | WIRED | L312: `const { target: vitality, bandEnergy, activeBands } = useVitalityStore.getState()` — single call reads all three store values per frame. |
| `useBackgroundCanvas.ts` | `useAudioVisualBridge.ts` | Indirect via store (bridge writes, canvas reads) | WIRED | Store is the shared bus. Bridge writes via `setBandEnergy`; canvas reads via `getState().bandEnergy`. Decoupled as designed. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUDI-01 | 03-01-PLAN.md | Frequency band decomposition from AnalyserNode FFT data (shrimp 2-20kHz, fish 200-2000Hz, grazing 1-4kHz, ambient <200Hz) | SATISFIED | `useAudioVisualBridge.ts` REEF_BANDS constant defines all 4 bands with correct Hz ranges; bin indices computed from runtime sampleRate; Nyquist clamping for shrimp hi |
| AUDI-02 | 03-01-PLAN.md | Per-band RMS energy values emitted at ~30fps | SATISFIED | `bandRMS()` pure function; `frameCountRef % 2` throttle; rAF loop at 60fps yields ~30 analysis frames/sec; `setBandEnergy()` writes each processed frame |
| AUDI-03 | 03-02-PLAN.md | Band energy drives real-time micro-animations (particle bursts, caustic shimmer) | SATISFIED (code) | shrimp > 0.4: 5-10 teal burst particles; fish energy: caustic `fishRate = 1 + fishEnergy * 3`; grazing > 0.2: gold hue=45 particles; ambient > 0.5: dark dimming overlay |
| AUDI-04 | 03-02-PLAN.md | Band filter toggles illuminate/dim corresponding visual layers | SATISFIED (code) | `drawParticles` applies `bucketedAlpha * 0.2` for particles where `!activeBands.has(p.band)`; `drawCaustics` uses `fishRate = 0.01` when `!fishActive`; `useDemoAudio` syncs toggles to store |

All 4 requirements claimed by Phase 3 plans are accounted for. No orphaned requirements detected.

---

### Anti-Patterns Found

No blockers or warnings found. All implementations are substantive:

- No TODO/FIXME/placeholder comments in phase 3 files
- No `return null` / empty stub patterns
- No hardcoded sample rate (correctly uses `audioCtx.sampleRate`)
- No per-frame allocation (Uint8Array pre-allocated via `useRef`, bin bounds cached)
- No React state writes from rAF loop (all store writes via `getState()`)

---

### Human Verification Required

#### 1. Shrimp Burst Particles Fire During Playback

**Test:** Navigate to `http://localhost:3000/experience?mode=demo`, click Play on the healthy reef demo track. Observe the canvas background.
**Expected:** Sudden bright teal particle flashes appear at irregular intervals across the full canvas — more frequent and intense during high-frequency snapping shrimp activity.
**Why human:** Cannot verify that demo audio produces shrimp band RMS > 0.4 without running the app, and cannot observe rAF canvas rendering programmatically.

#### 2. Fish Caustic Shimmer Speed Changes

**Test:** During playback, observe the background caustic light pattern. Switch crossfader between healthy (right) and degraded (left) tracks.
**Expected:** Caustic shimmer is noticeably faster (up to 4x) during fish-call-rich segments. Toggle the "Fish Calls" band OFF — shimmer nearly freezes (0.01x rate, subtly visible but not animating).
**Why human:** Phase speed modulation is a temporal visual property; correct code path is confirmed but perceptibility needs human assessment.

#### 3. Grazing Gold Highlights Appear

**Test:** During playback, look for occasional warm gold-colored particles drifting slowly upward from the lower half of the canvas.
**Expected:** At most 1 gold particle spawned per 5 frames when grazing RMS > 0.2. They are sparse — a few at a time, not a dense stream.
**Why human:** Grazing band (1-4kHz) energy level in demo audio files is not verifiable without running the app.

#### 4. Ambient Dimming Applies Murkiness

**Test:** Compare canvas background darkness between healthy and degraded audio tracks during playback.
**Expected:** Degraded track produces more high ambient noise energy (< 200Hz), causing a subtle dark overlay (max ~15% opacity) that makes the background appear murky.
**Why human:** Ambient energy depends on actual audio content at runtime.

#### 5. Band Toggle Visual Response (Critical AUDI-04 Check)

**Test:** Click the "Snapping Shrimp" band toggle OFF while audio is playing. Then click the "Fish Calls" toggle OFF.
**Expected:** Shrimp particles immediately dim to ghost-like 20% opacity. Fish caustic shimmer nearly freezes within 1 frame. Toggling back ON restores full opacity/speed.
**Why human:** Requires UI interaction and visual observation to confirm AUDI-04 is working end-to-end.

#### 6. Canvas Cleanup on Navigation Away

**Test:** Click Play on experience page, wait for audio to start, then navigate to a different page (e.g., /sites).
**Expected:** Background canvas returns to purely vitality-driven behavior. No stale shrimp burst particles from the audio session should persist.
**Why human:** Requires browser navigation lifecycle testing. Code path is confirmed (unmount resets bandEnergy to zeros) but cleanup relies on React component unmounting correctly.

---

## Implementation Quality Notes

The following implementation decisions match the plan and are well-executed:

1. **Zero per-frame allocation:** `Uint8Array` pre-allocated via `useRef`; bin boundaries cached at init; `bandRMS()` is pure with no allocation. Pool uses slot preference (150-199 for audio-reactive) to prevent vitality-particle starvation.

2. **Store-as-bus pattern:** `useAudioVisualBridge` writes to store via `getState().setBandEnergy()` (no React re-renders); `useBackgroundCanvas` reads via `getState()` in rAF (no subscription). Completely decoupled.

3. **isPlaying via ref:** `isPlayingRef.current = isPlaying` pattern correctly tracks play state inside the rAF loop without adding it to the effect dependency array — avoids tearing the effect on every play/pause.

4. **Nyquist clamping:** `shrimpHi = Math.min(20000, nyquist)` correctly handles devices with < 40kHz sample rates (e.g., 44.1kHz audio context has 22.05kHz Nyquist, so shrimp band clips to 22.05kHz — acceptable).

5. **3-band to 4-band mapping:** `useDemoAudio` useEffect correctly maps `low` -> `ambient + fish`, `mid` -> `grazing`, `high` -> `shrimp` in the vitality store, enabling `useBackgroundCanvas` to toggle visual layers based on the existing UI controls.

---

## Gaps Summary

None. All automated checks pass. The phase goal is implemented correctly in code. The only remaining work is human visual verification of the 6 items above, which require a running browser and cannot be confirmed programmatically.

---

_Verified: 2026-03-21T07:00:00Z_
_Verifier: Claude (gsd-verifier)_
