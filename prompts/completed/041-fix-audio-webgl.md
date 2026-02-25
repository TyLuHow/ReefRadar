<objective>
Fix two critical bugs in the ReefRadar dashboard: (1) audio demo/comparison only plays one clip instead of allowing crossfade between healthy and degraded reef audio, and (2) deck.gl/luma.gl WebGL crash on the map page. Diagnose first, then fix.

Read `./CLAUDE.md` for project context.
</objective>

<context>
The Next.js 14 dashboard is at `./dashboard-next/`. The Living Spectrogram Overhaul was just completed (prompts 036-040), which created a new Experience page with demo audio mode and adapted the deck.gl map to the Golden Hour palette.

**Issue 1 — Audio:** The `/experience?mode=demo` route should load BOTH `public/audio/healthy-reef.wav` and `public/audio/degraded-reef.wav`, play them simultaneously, and let the user crossfade between them. Currently it only plays one clip. Frequency band filtering (fish/grazing/shrimp isolation via BiquadFilterNodes) should also work.

**Issue 2 — WebGL:** The map page (`/dashboard/map`) crashes with:
```
TypeError: can't access property "maxTextureDimension2D", this.device.limits is undefined
```
This comes from `@luma.gl/core` when WebGL context initialization fails. May be a version mismatch between deck.gl v9 and luma.gl, or a Firefox-specific WebGL2 issue.

Audio-related files:
- `src/components/experience/useAudioPlayback.ts` — Main audio hook
- `src/components/experience/useDemoAudio.ts` — Demo mode audio logic
- `src/components/experience/DemoState.tsx` — Demo UI component
- `src/components/audio/AudioCompare.tsx` — Existing A/B comparison (separate from experience)
- `src/components/audio/ABCrossfader.tsx` — Existing crossfader component

Map-related files:
- `src/components/map/ReefMap.tsx` — deck.gl map component
- `src/app/dashboard/map/page.tsx` — Map page (uses dynamic import)
</context>

<diagnostic>
Before making ANY changes, answer these questions by reading the code:

1. **Audio buffers:** How many AudioBuffers are being created in `useDemoAudio.ts` and `useAudioPlayback.ts`? Should be 2 (healthy + degraded). Are both `/audio/healthy-reef.wav` and `/audio/degraded-reef.wav` being fetched?

2. **Crossfade logic:** Is there a crossfade slider in the DemoState UI? Are there two GainNodes controlling volume for each source? Is equal-power crossfade implemented?

3. **Audio graph:** What does the current audio node graph look like? Trace the connections from source → filters → gains → analyser → destination.

4. **deck.gl versions:** What versions of `@deck.gl/core`, `@deck.gl/react`, `@deck.gl/layers`, `@luma.gl/core`, `@luma.gl/webgl`, `react-map-gl`, and `maplibre-gl` are in `package.json` and `node_modules/`? Run `npm ls @luma.gl/core` to check for version conflicts.

5. **Map SSR:** Is ReefMap loaded with `dynamic(() => import(...), { ssr: false })`? Does it have WebGL error handling?

Report your findings before proceeding to fixes.
</diagnostic>

<requirements>

## Fix 1: Audio Demo Crossfade

The correct audio graph architecture:

```
healthyBuffer ──→ healthyGain ──┐
                                 ├──→ analyser ──→ destination
degradedBuffer ──→ degradedGain ─┘
```

With optional frequency band filtering per source:
```
source ──→ lowPass(1000Hz) ──┐
source ──→ bandPass(2500Hz) ─┤──→ gainNode
source ──→ highPass(4000Hz) ─┘
```

### Requirements:

1. **Load BOTH audio files** — `useDemoAudio.ts` must fetch and decode both WAVs into separate AudioBuffers
2. **Two simultaneous sources** — Both AudioBufferSourceNodes play at the same time
3. **Equal-power crossfade** — Two GainNodes, controlled by a slider:
   - Crossfade value 0 = 100% healthy, 0% degraded
   - Crossfade value 1 = 0% healthy, 100% degraded
   - Use equal-power: `healthyGain = cos(value * PI/2)`, `degradedGain = sin(value * PI/2)`
4. **Single AnalyserNode** — Both gain outputs connect to one analyser for SpectrogramCanvas visualization
5. **Crossfade slider in UI** — Prominent slider in DemoState.tsx with "Healthy" / "Degraded" labels
6. **AudioContext only on user interaction** — Create AudioContext inside the play button handler, never on mount
7. **Frequency band toggles** — Optional but if implemented: BiquadFilterNodes (lowpass 1000Hz, bandpass 2500Hz Q=1, highpass 4000Hz) that can be toggled per band
8. **Playback controls** — Play/Pause, time display, loop when audio ends
9. **Cleanup on unmount** — Close AudioContext, cancel any pending fetches

### Also fix the `/dashboard/compare` page AudioCompare component if it has the same issue:
- Read `src/components/audio/AudioCompare.tsx` and `ABCrossfader.tsx`
- If it also only plays one clip, apply the same dual-buffer + crossfade fix
- Both should use the same audio graph pattern

## Fix 2: WebGL/deck.gl Map Crash

### Requirements:

1. **Check version compatibility** — Run `npm ls @luma.gl/core @luma.gl/webgl` and check for conflicts. deck.gl v9 requires luma.gl v9+. If there's a mismatch, update packages.

2. **Add WebGL support detection** — Before rendering DeckGL, check if WebGL2 (or at minimum WebGL1) is available:
   ```typescript
   const canvas = document.createElement('canvas');
   const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
   if (!gl) { show fallback }
   ```

3. **Graceful fallback** — If WebGL init fails, show a glass panel with a message like "WebGL is required for the interactive map. Please try Chrome or Edge." instead of crashing.

4. **Verify SSR protection** — ReefMap MUST be loaded with `dynamic(() => import(...), { ssr: false })`. If it's not, add it.

5. **Error boundary** — Wrap the DeckGL component in a try-catch or error boundary so the whole page doesn't crash if WebGL fails.

6. **If versions are mismatched**, update:
   ```bash
   cd dashboard-next
   npm install @deck.gl/core@^9.0 @deck.gl/react@^9.0 @deck.gl/layers@^9.0 react-map-gl@^7.1 maplibre-gl@^4.0
   ```
   Only install `@luma.gl/*` explicitly if deck.gl doesn't bring compatible versions as transitive deps.

</requirements>

<constraints>
- AudioContext MUST only be created after user interaction (click handler) — never on page mount. This is a browser autoplay policy requirement.
- Do not break the existing `/dashboard/compare` page AudioCompare while fixing the experience demo
- Use the Golden Hour color palette for any new UI elements (ochre, dusty-rose, bone, etc.)
- Keep all audio files as WAV — do not convert to MP3 or other formats
- Do not downgrade deck.gl below v9 — fix forward, not backward
- Build must pass with zero errors after all changes
</constraints>

<verification>
After fixing both issues:

1. **Build check:**
   ```bash
   cd dashboard-next && npm run build
   ```
   Must pass with zero errors.

2. **Audio verification:**
   - Read the fixed `useDemoAudio.ts` and confirm both WAVs are fetched
   - Confirm two GainNodes exist with crossfade logic
   - Confirm AnalyserNode is connected for SpectrogramCanvas
   - Confirm AudioContext is created inside a click handler, not on mount
   - Confirm crossfade slider exists in DemoState.tsx UI

3. **WebGL verification:**
   - Run `npm ls @luma.gl/core` — no version conflicts
   - Read ReefMap.tsx — has WebGL support detection and fallback
   - Read map page — uses `dynamic(..., { ssr: false })`

4. **Forbidden color check:**
   ```bash
   grep -rn '#00FFFF\|#00E5FF\|#00FFA3\|#FF6B6B' dashboard-next/src/ --include='*.tsx' --include='*.ts'
   ```
   Should return zero results.
</verification>

<success_criteria>
- Both healthy-reef.wav and degraded-reef.wav load and play simultaneously in demo mode
- Crossfade slider smoothly blends between healthy and degraded audio
- SpectrogramCanvas visualizes the mixed audio in real-time
- Map page renders without WebGL crash (or shows graceful fallback)
- No version conflicts in npm dependency tree
- Build passes with zero errors
- AudioContext only created on user interaction
- No forbidden colors in new/modified code
</success_criteria>
