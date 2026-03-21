# Phase 3: Audio-Reactive System - Research

**Researched:** 2026-03-21
**Domain:** Web Audio API frequency analysis, Canvas 2D audio-visual coupling
**Confidence:** HIGH

## Summary

Phase 3 wires frequency band decomposition from the existing `AnalyserNode` into the existing `useBackgroundCanvas` particle + caustic system. The core technical challenge is: (1) computing per-band RMS energy from FFT data at correct frequency-to-bin mappings, (2) bridging that energy data from a per-page audio hook into a global canvas component via the zustand store, and (3) modulating four distinct visual behaviors (particle bursts, caustic shimmer, gold highlights, ambient dimming) without breaking the existing 60fps render loop.

The existing codebase already has nearly all building blocks in place. `useDemoAudio` already creates an `AnalyserNode` with fftSize 2048, already has parallel BiquadFilter branches, and already reads `getByteFrequencyData()` in `useSpectrogramAnimation`. The `useBackgroundCanvas` hook already reads zustand store state via `getState()` each frame. The missing piece is a band energy extraction layer that reads FFT bins, computes 4-band RMS, writes to the store, and a visual modulation layer in `useBackgroundCanvas` that responds to those energy values.

**Primary recommendation:** Create a new `useAudioVisualBridge` hook that reads FFT data from the existing `AnalyserNode`, computes 4-band RMS energy at ~30fps, and writes to a new `bandEnergy` slice in the vitality store. Extend `useBackgroundCanvas` to read `bandEnergy` and `activeBands` from the store each frame.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Shrimp band (2-20kHz) energy spikes burst 5-10 extra teal particles from random positions when RMS exceeds threshold
- Fish band (200-2000Hz) energy increases caustic shimmer speed (phase shift rate) proportional to fish RMS
- Grazing band (1-4kHz) spawns brief gold-tinted highlight particles -- sparse, warm-colored, short life
- Ambient noise (<200Hz) at high levels causes subtle darkening/dimming of background -- visual "murkiness"
- When a band is toggled OFF: particles from that band's color range fade to 20% opacity (ghost-like, still present)
- When fish band is toggled OFF: caustic shimmer rate drops to near-zero (still visible but frozen/dim)
- Band toggles only on experience page where `useAudioPlayback` already has `activeBands` state
- Visual response to band toggle is instant (within 1 rAF frame) -- matches existing filter behavior

### Claude's Discretion
- Exact RMS thresholds for triggering particle bursts vs continuous modulation
- Shrimp burst particle count and lifetime
- Grazing highlight particle spawn rate and color warmth
- Ambient dimming intensity range
- Whether to create a new `useAudioVisualBridge` hook or extend `useBackgroundCanvas` directly

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUDI-01 | Frequency band decomposition from AnalyserNode FFT data (shrimp 2-20kHz, fish 200-2000Hz, grazing 1-4kHz, ambient <200Hz) | FFT bin mapping math verified with Web Audio API spec; bin indices computed for typical 44100/48000Hz context sample rates; see Architecture Patterns section |
| AUDI-02 | Per-band RMS energy values emitted at ~30fps | `getByteFrequencyData()` pattern already in `useSpectrogramAnimation`; throttle via frame counter (every-other-frame) in rAF loop; write to zustand store via `getState().setBandEnergy()` |
| AUDI-03 | Band energy drives real-time micro-animations (particle bursts, caustic shimmer) | Visual modulation patterns documented in Architecture Patterns; `useBackgroundCanvas` already reads store per frame; add conditional spawn/modulation logic per band |
| AUDI-04 | Band filter toggles illuminate/dim corresponding visual layers | `activeBands` already exists in `useDemoAudio`; write to store; `useBackgroundCanvas` reads and applies opacity/rate multipliers per band |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API (AnalyserNode) | Browser native | FFT frequency data extraction | Already in use; zero dependencies; getByteFrequencyData for performance |
| zustand | ^4.5 | Band energy state bridge between audio hook and canvas | Already the project store pattern; `getState()` for frame-rate reads |
| Canvas 2D | Browser native | Visual rendering of audio-driven effects | Already the rendering target in useBackgroundCanvas |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | All required infrastructure exists in the codebase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| zustand store bridge | Direct ref passing | Ref passing couples audio hook to canvas hook; store decouples them cleanly and allows any page to write band energy |
| getByteFrequencyData | getFloatFrequencyData | Float gives dB values (more precise) but byte is faster and maps 0-255 directly to normalized energy; byte is sufficient for visual modulation |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  hooks/
    useAudioVisualBridge.ts    # NEW: FFT -> band RMS -> store
    useBackgroundCanvas.ts     # MODIFY: read bandEnergy + activeBands from store
  stores/
    vitality-store.ts          # MODIFY: add bandEnergy + activeBands slices
  components/
    experience/
      useDemoAudio.ts          # MODIFY: call useAudioVisualBridge with analyserNode
    spectrogram/
      FrequencyBands.ts        # MODIFY: extend with 4 reef-biology band definitions
```

### Pattern 1: Band Energy Extraction via FFT Bin Slicing

**What:** Read `getByteFrequencyData()` from the existing AnalyserNode, slice into 4 frequency bands using correct bin indices, compute RMS energy per band, normalize to 0-1 range.

**When to use:** Every ~30fps while audio is playing (throttle via frame counter).

**Critical math -- bin index calculation:**

The AnalyserNode FFT produces `fftSize / 2` frequency bins, linearly spaced from 0 Hz to `sampleRate / 2` Hz. Each bin covers `sampleRate / fftSize` Hz.

```
binIndex = Math.round(frequencyHz * fftSize / sampleRate)
```

**CRITICAL:** `decodeAudioData()` resamples to the AudioContext's sample rate (typically 44100 or 48000 Hz, device-dependent), NOT the file's original sample rate (16kHz for demo WAVs). The bin calculation must use `audioContext.sampleRate`, not the file sample rate.

For `fftSize = 2048` and `sampleRate = 48000`:
- Hz per bin: `48000 / 2048 = 23.4375 Hz`
- Total bins: 1024
- Ambient (<200Hz): bins 0-8
- Fish (200-2000Hz): bins 9-85
- Grazing (1-4kHz): bins 43-171
- Shrimp (2-20kHz): bins 85-853

For `fftSize = 2048` and `sampleRate = 44100`:
- Hz per bin: `44100 / 2048 = 21.533 Hz`
- Total bins: 1024
- Ambient (<200Hz): bins 0-9
- Fish (200-2000Hz): bins 9-93
- Grazing (1-4kHz): bins 46-186
- Shrimp (2-20kHz): bins 93-928

**Note:** Fish and grazing bands overlap (grazing 1-4kHz overlaps with fish 200-2000Hz at 1-2kHz). This is intentional -- reef biology bands are not mutually exclusive.

**Example:**
```typescript
// Bin calculation must use audioContext.sampleRate, not file sample rate
const hzPerBin = audioContext.sampleRate / analyser.fftSize;

function binForHz(hz: number): number {
  return Math.round(hz / hzPerBin);
}

// Band definitions
const REEF_BANDS = {
  ambient:  { lo: 0,    hi: 200,   label: 'Ambient' },
  fish:     { lo: 200,  hi: 2000,  label: 'Fish Calls' },
  grazing:  { lo: 1000, hi: 4000,  label: 'Grazing' },
  shrimp:   { lo: 2000, hi: 20000, label: 'Snapping Shrimp' },
} as const;

// RMS from byte frequency data (0-255 range)
function bandRMS(data: Uint8Array, startBin: number, endBin: number): number {
  let sumSq = 0;
  const count = endBin - startBin;
  if (count <= 0) return 0;
  for (let i = startBin; i < endBin; i++) {
    const normalized = data[i] / 255;  // 0-1
    sumSq += normalized * normalized;
  }
  return Math.sqrt(sumSq / count);  // 0-1
}
```

### Pattern 2: Store-Based Audio-Visual Bridge

**What:** The `useAudioVisualBridge` hook writes band energy to the zustand store. The `useBackgroundCanvas` reads it via `getState()` each frame. No React re-renders involved.

**When to use:** This is the recommended approach (Claude's discretion item). Creating a dedicated bridge hook is better than extending `useBackgroundCanvas` directly because:
1. Separation of concerns: audio analysis vs visual rendering
2. The bridge hook can be called from any page (demo, sample playback, upload results)
3. `useBackgroundCanvas` is global (mounted in providers.tsx); audio hooks are per-page

**Example store extension:**
```typescript
type ReefBandId = 'ambient' | 'fish' | 'grazing' | 'shrimp';

interface BandEnergy {
  ambient: number;   // 0-1
  fish: number;      // 0-1
  grazing: number;   // 0-1
  shrimp: number;    // 0-1
}

interface VitalityStore {
  target: number;
  source: VitalitySource;
  bandEnergy: BandEnergy;
  activeBands: Set<ReefBandId>;
  setVitality: (value: number, source?: VitalitySource) => void;
  setBandEnergy: (energy: BandEnergy) => void;
  setActiveBands: (bands: Set<ReefBandId>) => void;
}
```

### Pattern 3: Visual Modulation in useBackgroundCanvas

**What:** Each frame, `useBackgroundCanvas` reads `bandEnergy` and `activeBands` from the store and modulates particles + caustics accordingly.

**Mapping decisions per band:**

1. **Shrimp (burst particles):** When `shrimp > threshold` (~0.4), spawn 5-10 extra teal particles from random positions. These should be fast (short life ~40-60 frames), bright (high maxAlpha), and appear as sudden "flashes."

2. **Fish (caustic shimmer):** Multiply the caustic phase increment by `1 + fishEnergy * 3`. At fish=0, phase crawls at base rate. At fish=1, phase runs 4x faster. The existing `time * 0.00873` becomes `time * (0.00873 * (1 + fishRMS * 3))`.

3. **Grazing (gold highlights):** When `grazing > 0.2`, spawn occasional gold-tinted particles: hue=45, saturation=80, lightness=60, short life (~60-90 frames), low spawn rate (1 per 5 frames max).

4. **Ambient (dimming):** When `ambient > 0.5`, darken the canvas clear color. Instead of `clearRect`, fill with `rgba(0, 0, 0, ambientDim)` where `ambientDim = (ambient - 0.5) * 0.3` (max ~0.15 opacity darkening).

### Pattern 4: Band Toggle Visual Response

**What:** When `activeBands` changes, visual layers respond instantly.

**Implementation:**
- Each spawned particle gets tagged with its source band (new field on `PoolParticle`: `band: ReefBandId | null`)
- On draw, check `activeBands.has(particle.band)`: if false, draw at 20% of computed alpha
- For caustics: check `activeBands.has('fish')`: if false, use near-zero phase increment (0.0001 instead of computed rate)
- The existing `activeBands` in `useDemoAudio` uses `BandId` ('low' | 'mid' | 'high') -- this needs mapping to the 4-band reef biology system

### Band ID Mapping: Existing 3-Band to New 4-Band

The existing system uses 3 bands (`low`, `mid`, `high`) for audio filtering. The new system uses 4 biology bands (`ambient`, `fish`, `grazing`, `shrimp`) for visual modulation. These are conceptually different:

- **3-band system (audio filtering):** Controls what the user HEARS. Stays as-is.
- **4-band system (visual modulation):** Controls what the user SEES. New addition.

The visual band toggles on the experience page should toggle the 4-band system. The existing audio filter toggles can remain separate or be unified. Recommendation: extend the toggle UI to show 4 reef biology bands, and map them to both audio filters (approximate, since BiquadFilters use different cutoffs) and visual layers.

However, per CONTEXT.md: "Band toggles only on experience page where `useAudioPlayback` already has `activeBands` state." This suggests reusing the existing toggle mechanism. The simplest approach: the visual system derives 4-band active state from the existing 3-band toggles:

| 3-Band Toggle | Visual Bands Affected |
|---------------|----------------------|
| `low` OFF | ambient + fish fade to 20% |
| `mid` OFF | grazing fades to 20% |
| `high` OFF | shrimp fades to 20% |

This is an imperfect mapping but stays within the existing UI. Alternatively, the 4-band toggle can be added as a new visual-only control. This is a Claude's discretion area.

### Anti-Patterns to Avoid
- **Creating a new AnalyserNode:** The existing one in `useDemoAudio` already captures the full-spectrum signal post-crossfade. Reuse it.
- **Allocating Uint8Array per frame:** Allocate once, reuse via `getByteFrequencyData(existingArray)`.
- **Using `frequencyData.slice()` for sub-bands:** `slice()` allocates a new array. Use loop indices instead.
- **React state for energy values:** These update at 30-60fps. Writing to React state would cause mass re-renders. Use zustand's `getState()`/`setState()` (no React subscription needed for the canvas).
- **Running FFT analysis at 60fps:** Overkill for visual modulation. Throttle to 30fps (every other frame).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Frequency band isolation | Custom DSP in JS | AnalyserNode FFT bin slicing | AnalyserNode runs natively in audio thread; JS just reads the result |
| Audio filtering for playback | Manual FFT manipulation | BiquadFilterNode (already exists) | Hardware-accelerated, zero-latency; already wired in useDemoAudio |
| Cross-component state bridge | Custom event emitter / postMessage | zustand store | Already the project pattern; getState() is synchronous and allocation-free |

**Key insight:** The Web Audio API's AnalyserNode does all the heavy FFT computation natively. The JS layer only reads the result array and does simple math (bin slicing + RMS). There is no DSP to implement.

## Common Pitfalls

### Pitfall 1: Wrong Sample Rate for Bin Calculation
**What goes wrong:** Using the source file's sample rate (16kHz for demo WAVs) instead of `audioContext.sampleRate` (44100/48000 Hz) for bin frequency mapping. Since `decodeAudioData()` resamples to context rate, bins correspond to the context rate.
**Why it happens:** The PITFALLS.md mentions 32kHz sample rate, which is the ReefRadar backend's rate but NOT the browser AudioContext rate. The browser uses its device's native rate.
**How to avoid:** Always compute bins from `audioContext.sampleRate`, never from a hardcoded value. Read the actual sampleRate at init time.
**Warning signs:** Shrimp band showing zero energy (bins calculated too high for actual Nyquist), or bands responding to wrong frequencies.

### Pitfall 2: Global Canvas vs Per-Page Audio
**What goes wrong:** `useBackgroundCanvas` runs globally (mounted in `providers.tsx`), but audio hooks run only on the experience page. If the bridge hook writes band energy to the store on the experience page but doesn't clean up on unmount, stale energy values persist when navigating away.
**Why it happens:** The store is global; the audio source is not.
**How to avoid:** On `useAudioVisualBridge` unmount, reset `bandEnergy` to `{ ambient: 0, fish: 0, grazing: 0, shrimp: 0 }`. The canvas will gracefully stop modulating (all multipliers go to 0/1 base state).
**Warning signs:** Particles still bursting after navigating away from experience page.

### Pitfall 3: FFT Data is 0 When Audio Not Playing
**What goes wrong:** Reading `getByteFrequencyData()` when no audio is playing returns all zeros. If the visual modulation doesn't handle this gracefully, it could cause divide-by-zero or meaningless values.
**Why it happens:** AnalyserNode only has data when audio signal is flowing through it.
**How to avoid:** Check `isPlaying` before reading FFT data. When not playing, leave band energy at 0 (visuals fall back to base state).
**Warning signs:** NaN values in energy calculations.

### Pitfall 4: Overlapping Band Energy Double-Counting
**What goes wrong:** Fish (200-2000Hz) and grazing (1-4kHz) overlap at 1-2kHz. If both bands trigger visual effects for the same frequency content, the overlap region gets doubled visual response.
**Why it happens:** Reef biology bands are intentionally overlapping (parrotfish grazing and fish calls share frequencies).
**How to avoid:** This is actually fine for visual effects -- the overlap creates a richer visual response in the 1-2kHz region. No correction needed. But be aware that toggling off fish won't fully dim the 1-2kHz visual response if grazing is still active.
**Warning signs:** Not a bug -- but worth documenting so it doesn't get "fixed."

### Pitfall 5: Particle Pool Exhaustion From Burst Spawns
**What goes wrong:** Shrimp bursts spawn 5-10 extra particles per trigger. If the shrimp band is constantly above threshold (common in healthy reef recordings), burst particles accumulate and exhaust the 150-particle pool, starving the vitality-based baseline particles.
**Why it happens:** Healthy reef recordings have near-continuous shrimp activity.
**How to avoid:** Reserve pool slots: e.g., first 120 for vitality particles, last 30 for audio-reactive bursts. Or use a cooldown: after a shrimp burst, wait 10-15 frames before allowing another. Or expand pool to 200 (still well within Canvas 2D budget).
**Warning signs:** Vitality particles disappearing when audio plays, choppy particle density.

### Pitfall 6: Band Toggle State Desync Between Audio and Visual
**What goes wrong:** `useDemoAudio.activeBands` uses `BandId` ('low'|'mid'|'high') while the visual system needs `ReefBandId` ('ambient'|'fish'|'grazing'|'shrimp'). If these get out of sync, toggling a band mutes the audio but visuals keep going (or vice versa).
**Why it happens:** Two different band taxonomies coexist.
**How to avoid:** Single source of truth: either extend `useDemoAudio` to track 4-band state, or derive 4-band visual state from 3-band audio state using a deterministic mapping function. Don't maintain two independent toggle states.
**Warning signs:** Muted audio still producing visual bursts.

## Code Examples

### Band RMS Extraction (verified pattern from existing codebase + Web Audio API spec)
```typescript
// Source: Web Audio API spec + existing useSpectrogramAnimation pattern
// Pre-allocate once
const freqData = new Uint8Array(analyser.frequencyBinCount);
const hzPerBin = audioContext.sampleRate / analyser.fftSize;

function extractBandEnergy(analyser: AnalyserNode): BandEnergy {
  analyser.getByteFrequencyData(freqData);

  const binCount = analyser.frequencyBinCount;
  const bin = (hz: number) => Math.min(Math.round(hz / hzPerBin), binCount - 1);

  return {
    ambient: bandRMS(freqData, 0, bin(200)),
    fish:    bandRMS(freqData, bin(200), bin(2000)),
    grazing: bandRMS(freqData, bin(1000), bin(4000)),
    shrimp:  bandRMS(freqData, bin(2000), bin(20000)),
  };
}

function bandRMS(data: Uint8Array, start: number, end: number): number {
  if (end <= start) return 0;
  let sumSq = 0;
  for (let i = start; i < end; i++) {
    const v = data[i] / 255;
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / (end - start));
}
```

### Store Extension Pattern
```typescript
// Source: existing vitality-store.ts pattern
export const useVitalityStore = create<VitalityStore>((set) => ({
  target: 0,
  source: 'default',
  bandEnergy: { ambient: 0, fish: 0, grazing: 0, shrimp: 0 },
  activeBands: new Set<ReefBandId>(['ambient', 'fish', 'grazing', 'shrimp']),
  setVitality: (value, source = 'default') =>
    set({ target: Math.max(0, Math.min(1, value)), source }),
  setBandEnergy: (energy) => set({ bandEnergy: energy }),
  setActiveBands: (bands) => set({ activeBands: bands }),
}));
```

### Shrimp Burst Spawn (in useBackgroundCanvas animate loop)
```typescript
// Source: existing spawnParticles pattern + CONTEXT.md decisions
const { bandEnergy, activeBands } = useVitalityStore.getState();
const shrimpActive = activeBands.has('shrimp');
const shrimpAlpha = shrimpActive ? 1.0 : 0.2;

// Shrimp burst: sudden bioluminescent flash
if (bandEnergy.shrimp > 0.4 && burstCooldown <= 0) {
  const burstCount = Math.round(lerp(5, 10, bandEnergy.shrimp));
  for (let b = 0; b < burstCount; b++) {
    const p = findInactiveParticle(pool); // reuse pool slot
    if (!p) break;
    p.active = true;
    p.x = Math.random() * width;
    p.y = Math.random() * height;
    p.hue = 175;           // teal
    p.saturation = 80;
    p.lightness = 55;
    p.maxAlpha = 0.9 * shrimpAlpha;
    p.maxLife = 40 + Math.random() * 20; // short burst
    p.size = lerp(3, 7, Math.random());
    p.vy = -(1 + Math.random());
    p.vx = (Math.random() - 0.5) * 2;
    p.band = 'shrimp';
  }
  burstCooldown = 12; // ~200ms at 60fps
}
```

### Caustic Fish Modulation
```typescript
// Source: existing drawCaustics pattern + CONTEXT.md decisions
const fishActive = activeBands.has('fish');
const fishRate = fishActive ? (1 + bandEnergy.fish * 3) : 0.01;
const phase = time * 0.00873 * fishRate;
// ... rest of existing drawCaustics using modulated phase
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ScriptProcessorNode for audio analysis | AnalyserNode (already in codebase) | Deprecated years ago | ScriptProcessorNode runs on main thread; AnalyserNode is native |
| AudioWorklet for custom DSP | AnalyserNode FFT bin slicing | N/A | AudioWorklet is for custom DSP we don't need; AnalyserNode gives us FFT for free |
| React state for frame-rate data | zustand getState() (already in codebase) | Project pattern since Phase 1 | Avoids re-render cascade |

**Deprecated/outdated:**
- `ScriptProcessorNode`: Deprecated. Not relevant since we use `AnalyserNode`.
- `createScriptProcessor`: Same as above. Never use.

## Open Questions

1. **AudioContext sample rate variability**
   - What we know: Browser AudioContext typically uses 44100 or 48000 Hz (device-dependent). `decodeAudioData` resamples to this rate.
   - What's unclear: Whether all target browsers/devices will have 44100+ sample rate (ensuring 20kHz+ Nyquist for shrimp band).
   - Recommendation: Read `audioContext.sampleRate` at runtime, clamp shrimp band upper limit to `sampleRate / 2`. If sampleRate < 40000, shrimp band can only go to `sampleRate / 2`.

2. **3-band to 4-band toggle mapping UX**
   - What we know: Existing UI has 3 toggle buttons (low/mid/high). CONTEXT.md says band toggles are on experience page only.
   - What's unclear: Whether to extend UI to 4 reef-biology toggle buttons or keep 3 and derive 4-band state.
   - Recommendation: Extend UI to 4 biology-named buttons (Ambient, Fish, Grazing, Shrimp). Map each to both the closest BiquadFilter gain and the visual band. This gives users direct control over what they see AND hear per biology category.

3. **Particle pool sizing with audio bursts**
   - What we know: Current pool is 150. Shrimp bursts add 5-10 per trigger. Grazing adds occasional highlights.
   - What's unclear: Whether 150 is enough headroom for vitality particles + audio particles simultaneously.
   - Recommendation: Expand pool to 200. Reserve last 50 for audio-reactive particles (burst + grazing). This keeps vitality particles untouched while giving audio effects room.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected -- no test infrastructure exists |
| Config file | none -- see Wave 0 |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDI-01 | FFT bin mapping produces correct band indices for 44100/48000 Hz sample rates | unit | N/A | No -- Wave 0 |
| AUDI-02 | bandRMS returns 0-1 range for all inputs; returns 0 for silent input | unit | N/A | No -- Wave 0 |
| AUDI-03 | Visual modulation: shrimp burst triggers above threshold, caustic phase scales with fish energy | manual-only | Visual inspection during audio playback | N/A |
| AUDI-04 | Band toggle instantly changes particle opacity to 20% and freezes caustic shimmer | manual-only | Visual inspection of toggle behavior | N/A |

### Sampling Rate
- **Per task commit:** Manual visual inspection (play audio, observe canvas)
- **Per wave merge:** Full manual walkthrough: play healthy + degraded, toggle each band, verify all 4 visual behaviors
- **Phase gate:** All 4 visual behaviors observable during audio playback

### Wave 0 Gaps
- No test framework installed (Jest/Vitest). For pure math functions (bin mapping, bandRMS), unit tests would be valuable but require framework setup.
- Manual testing is acceptable for this phase since all requirements are visual/behavioral.
- If test framework is set up in a future phase, the `bandRMS` and `binForHz` functions are pure and trivially testable.

## Sources

### Primary (HIGH confidence)
- [MDN: AnalyserNode.getByteFrequencyData()](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteFrequencyData) -- frequency data format, bin count
- [MDN: AnalyserNode.frequencyBinCount](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/frequencyBinCount) -- half of fftSize
- [MDN: BaseAudioContext.decodeAudioData()](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData) -- resampling behavior
- [MDN: BaseAudioContext.sampleRate](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/sampleRate) -- runtime sample rate
- [Web Audio API Spec (W3C)](https://www.w3.org/TR/webaudio/) -- authoritative FFT bin layout
- Existing codebase: `useDemoAudio.ts`, `useSpectrogramAnimation.ts`, `useBackgroundCanvas.ts`, `vitality-store.ts` -- verified patterns

### Secondary (MEDIUM confidence)
- [AddPipe Blog: Understanding Audio Frequency Analysis](https://blog.addpipe.com/understanding-audio-frequency-analysis-in-javascript-a-guide-to-using-analysernode-and-getbytefrequencydata/) -- frequency bin mapping tutorial
- [Boris Smus: Web Audio API Book, Ch5](https://webaudioapi.com/book/Web_Audio_API_Boris_Smus_html/ch05.html) -- AnalyserNode usage patterns

### Tertiary (LOW confidence)
- None -- all findings verified with authoritative sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed; all APIs are browser-native and already used in codebase
- Architecture: HIGH -- clear bridge pattern (hook -> store -> canvas) follows existing project conventions
- Pitfalls: HIGH -- bin mapping math verified against Web Audio API spec; sample rate issue confirmed with MDN docs
- Visual modulation parameters: MEDIUM -- RMS thresholds, burst counts, and cooldowns are tuning values that will need iteration during implementation

**Research date:** 2026-03-21
**Valid until:** Indefinite (Web Audio API is stable; project architecture is settled)
