# Phase 3: Audio-Reactive System - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire audio frequency band analysis into the visual effects from Phase 2. Decompose AnalyserNode FFT data into 4 reef-biology bands (shrimp, fish, grazing, ambient). Per-band RMS energy drives micro-animations: shrimp bursts particles, fish modulates caustic shimmer, grazing spawns gold highlights, ambient dims background. Band filter toggles on the experience page illuminate/dim corresponding visual layers. No new pages, no crossfader wiring — just the audio→visual coupling pipeline.

</domain>

<decisions>
## Implementation Decisions

### Band-to-Visual Mapping
- Shrimp band (2-20kHz) energy spikes burst 5-10 extra teal particles from random positions when RMS exceeds threshold
- Fish band (200-2000Hz) energy increases caustic shimmer speed (phase shift rate) proportional to fish RMS
- Grazing band (1-4kHz) spawns brief gold-tinted highlight particles — sparse, warm-colored, short life
- Ambient noise (<200Hz) at high levels causes subtle darkening/dimming of background — visual "murkiness"

### Band Filter Toggle Behavior
- When a band is toggled OFF: particles from that band's color range fade to 20% opacity (ghost-like, still present)
- When fish band is toggled OFF: caustic shimmer rate drops to near-zero (still visible but frozen/dim)
- Band toggles only on experience page where `useAudioPlayback` already has `activeBands` state
- Visual response to band toggle is instant (within 1 rAF frame) — matches existing filter behavior

### Claude's Discretion
- Exact RMS thresholds for triggering particle bursts vs continuous modulation
- Shrimp burst particle count and lifetime
- Grazing highlight particle spawn rate and color warmth
- Ambient dimming intensity range
- Whether to create a new `useAudioVisualBridge` hook or extend `useBackgroundCanvas` directly

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audio Infrastructure
- `src/components/experience/useAudioPlayback.ts` — Existing band filtering with low/mid/high BiquadFilterNodes, `activeBands` Set, `toggleBand()`. This is the audio source for band energy.
- `src/hooks/useSpectrogram.ts` — AnalyserNode setup with fftSize 2048, 32kHz sample rate. Bin frequency = binIndex * sampleRate / fftSize.

### Visual System (Phase 2 outputs)
- `src/hooks/useBackgroundCanvas.ts` — Particle system + caustic layer. This is what the audio analysis feeds into.
- `src/stores/vitality-store.ts` — Vitality store. Audio energy could modulate vitality or drive visual layers directly.

### Research
- `.planning/research/ARCHITECTURE.md` — AudioAnalyzer component architecture, data flow from audio→visuals
- `.planning/research/PITFALLS.md` — AnalyserNode FFT bin mapping errors (#3)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useAudioPlayback.ts`: Already has AnalyserNode, BiquadFilterNodes for low/mid/high, `activeBands` Set — extend for 4-band reef biology decomposition
- `useSpectrogram.ts`: `getByteFrequencyData()` call in rAF loop — pattern for reading FFT data
- `useBackgroundCanvas.ts`: Particle spawn and caustic draw functions — add band energy parameters

### Established Patterns
- Band filtering via BiquadFilterNodes with gain nodes per band
- `getByteFrequencyData()` into Uint8Array, average across bin range for RMS
- rAF loop reading store state via `getState()` — add band energy reads same way

### Integration Points
- `useAudioPlayback` exposes `analyser` AnalyserNode — new hook reads FFT from this
- `useBackgroundCanvas` needs to accept band energy as input (via store or direct ref)
- Experience page already has `activeBands` — wire to visual layer opacity

</code_context>

<specifics>
## Specific Ideas

- Particle bursts on shrimp snaps should feel like sudden bioluminescent flashes — not gradual
- Caustic shimmer responding to fish calls should feel organic — the ocean "breathing" with the sound
- The ambient murkiness effect makes degraded recordings feel visually oppressive
- Band toggles should give the user agency: "turn off the shrimp layer and watch the fish layer"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-audio-reactive-system*
*Context gathered: 2026-03-21*
