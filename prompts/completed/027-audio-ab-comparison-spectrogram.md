<objective>
Build the Audio A/B Comparison feature and Live Spectrogram Visualizer for ReefRadar. This is the emotional core of the experience — letting visitors HEAR the difference between healthy and degraded coral reefs through interactive audio with real-time spectrograms.

You are enhancing an EXISTING working Next.js 14 dashboard at `dashboard-next/`. The foundation (design system, hooks, UI primitives) was installed in the previous prompt. Do NOT modify backend code.
</objective>

<context>
Read the project's CLAUDE.md for architecture context.

The previous prompt (026) installed:
- Dependencies: wavesurfer.js, framer-motion, zustand, deck.gl, maplibre-gl, react-map-gl
- Design system CSS variables in globals.css (ocean depth palette, glow colors, spectrogram thermal)
- Custom hooks: useAudioPlayer.ts, useSpectrogram.ts, useAnimateOnScroll.ts, useScrollProgress.ts
- UI primitives: AnimatedCounter, GlowCard, WaveBackground, LoadingReef, ScrollProgress
- Dashboard components: CaveatsBanner, RegionWarning
- Zustand store: analysis-store.ts

API base URL: https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod
SurfPerch specs: 32kHz sample rate, 5.0s windows, 1280-dim embeddings
</context>

<research>
Before making changes, read these files:
- `dashboard-next/src/hooks/useSpectrogram.ts` — the spectrogram hook from prompt 026
- `dashboard-next/src/hooks/useAudioPlayer.ts` — the audio player hook
- `dashboard-next/src/app/globals.css` — for spectrogram color variables
- `dashboard-next/src/types/index.ts` — existing types
- `dashboard-next/src/components/analysis/UploadForm.tsx` — current upload form
- `dashboard-next/src/components/analysis/AnalysisResults.tsx` — current results display
</research>

<requirements>

## 1. Synthetic Audio Generator

Create `dashboard-next/src/components/audio/SyntheticAudioGenerator.tsx`:

This generates demo audio when real reef recordings aren't available. It creates audio using Web Audio API OscillatorNodes and noise generators.

```typescript
// Exported functions (not a visual component):
export function generateHealthyReef(audioContext: AudioContext, duration: number): AudioBuffer
export function generateDegradedReef(audioContext: AudioContext, duration: number): AudioBuffer
```

**Healthy reef audio characteristics:**
- Pink noise base (moderate amplitude)
- Random exponential clicks simulating snapping shrimp (2-10kHz, ~15 per second, Poisson distribution)
- Periodic low-frequency tones simulating fish grunts (200-800Hz, every 3-8 seconds)
- Broadband high-frequency crackle (biophony)
- Duration: 15 seconds default

**Degraded reef audio characteristics:**
- Low-amplitude brown noise only (mostly below 500Hz)
- Occasional distant low rumble (boat-like, 50-200Hz)
- Very sparse — mostly quiet
- Duration: 15 seconds default

## 2. Spectrogram Canvas

Create `dashboard-next/src/components/audio/SpectrogramCanvas.tsx`:

Real-time waterfall spectrogram visualization rendered to a canvas element.

**Props:**
```typescript
interface SpectrogramProps {
  analyser: AnalyserNode | null;
  width?: number;    // Default: container width
  height?: number;   // Default: 200
  colorPalette?: 'ocean' | 'thermal' | 'grayscale'; // Default: 'ocean'
  showFrequencyLabels?: boolean; // Default: true
  className?: string;
}
```

**Rendering:**
- Waterfall display: new frequency column drawn on right, shifts left each frame
- Uses `getFloatFrequencyData()` from AnalyserNode
- Color mapping using CSS variables:
  - ocean: --spec-cold (low dB) through --spec-cool, --spec-warm, --spec-hot, --spec-fire (high dB)
  - thermal: blue → cyan → yellow → red
  - grayscale: black → white
- Y-axis: frequency (0 → Nyquist, log scale)
- Frequency band labels on the right edge if `showFrequencyLabels` is true
- Smooth animation using requestAnimationFrame
- Handles resize via ResizeObserver
- Cleans up animation frame and observer on unmount

## 3. Frequency Band Labels

Create `dashboard-next/src/components/audio/FrequencyBandLabels.tsx`:

Overlay component showing annotated frequency bands alongside a spectrogram.

```typescript
const FREQUENCY_BANDS = [
  { name: 'Boat/Vessel Noise', minHz: 0, maxHz: 500, color: '#ff6b6b' },
  { name: 'Fish Vocalizations', minHz: 50, maxHz: 1000, color: '#00ffa3' },
  { name: 'Snapping Shrimp', minHz: 2000, maxHz: 16000, color: '#00e5ff' },
];
```

- Renders colored range bars on the left side of the spectrogram
- Labels positioned at the midpoint of each band
- Semi-transparent background so spectrogram shows through
- Responsive — hides labels on very small widths

## 4. A/B Crossfader

Create `dashboard-next/src/components/audio/ABCrossfader.tsx`:

The central crossfade slider that blends between healthy and degraded audio.

**Props:**
```typescript
interface ABCrossfaderProps {
  value: number; // 0 = fully healthy, 1 = fully degraded
  onChange: (value: number) => void;
  className?: string;
}
```

**Visual design:**
- Horizontal slider with gradient track (green on left, red on right)
- Custom thumb styled as a circular handle
- Labels: "Healthy" on left, "Degraded" on right
- Below slider: dynamic text description that changes based on position:
  - 0-0.2: "Rich biodiversity — snapping shrimp, fish calls, coral sounds"
  - 0.2-0.4: "Abundant life with some reduced activity"
  - 0.4-0.6: "Mixed signals — transitional reef state"
  - 0.6-0.8: "Reduced biological activity, some anthropogenic noise"
  - 0.8-1.0: "Near silence — a degraded reef with minimal life"

## 5. Audio Compare (Main Component)

Create `dashboard-next/src/components/audio/AudioCompare.tsx`:

The complete A/B audio comparison experience. This is the centerpiece — reusable on both the landing page and the `/dashboard/compare` route.

**Props:**
```typescript
interface AudioCompareProps {
  compact?: boolean; // For embedding in landing page (smaller layout)
  className?: string;
}
```

**Architecture:**
- Creates a single AudioContext (shared between both audio sources)
- Two audio sources: healthy and degraded
- Each source connects through a GainNode for independent volume control
- Both connect through respective AnalyserNodes for spectrogram data
- ABCrossfader controls the gain balance

**Layout (full mode):**
```
┌─────────────────────────────────────────────────────┐
│  "The Sound of a Reef"                              │
│                                                      │
│  ┌──────────────┐  ←── Slider ──→  ┌──────────────┐ │
│  │  Healthy      │                  │  Degraded     │ │
│  │  [▶ Play]     │                  │  [▶ Play]     │ │
│  │  ▁▂▃▅▇▅▃▂▁   │                  │  ▁▁▁▁▁▁▁▁▁   │ │
│  └──────────────┘                  └──────────────┘ │
│                                                      │
│  ┌────────────── Spectrogram ──────────────────────┐ │
│  │  [waterfall visualization]                       │ │
│  │  Fish ──┤                                        │ │
│  │  Shrimp ┤                                        │ │
│  └──────────────────────────────────────────────────┘ │
│                                                      │
│  "Demo audio — upload real reef recordings for       │
│   actual analysis"                                   │
└─────────────────────────────────────────────────────┘
```

**Layout (compact mode for landing page):**
- Stacked vertically
- Smaller spectrograms
- No separate play buttons — just the crossfader
- "Compare them yourself" CTA link to full compare page

**Implementation details:**
- On mount: generate synthetic audio using SyntheticAudioGenerator (15s each)
- Play both audio sources simultaneously, looping
- Crossfade slider adjusts GainNode values: healthy = (1 - value), degraded = value
- Each source feeds its own AnalyserNode for independent spectrograms
- "Play / Pause" toggle button starts/stops both sources together
- Banner: "Demo audio generated synthetically — upload real reef recordings for actual analysis"

## 6. Compare Page

Create `dashboard-next/src/app/dashboard/compare/page.tsx`:

A dedicated page for the full A/B audio comparison experience.

- Uses `AudioCompare` component in full mode
- Dark background using ocean depth palette
- Includes CaveatsBanner at bottom
- Page title: "Audio Comparison"
- Brief explanation text about reef acoustics

## 7. Enhanced Analyze Page with Spectrogram

Create `dashboard-next/src/app/dashboard/analyze/page.tsx`:

An enhanced version of the analysis page that includes a live spectrogram during file upload preview.

- Read the EXISTING `dashboard-next/src/app/page.tsx` (current analyze page) as the base
- Move the analyze functionality to `/dashboard/analyze`
- Add: When a user uploads a WAV file and before submitting for analysis, show a live spectrogram preview of the audio
- Add: After analysis completes, show RegionWarning component if applicable
- Add: After analysis completes, show CaveatsBanner
- The spectrogram uses SpectrogramCanvas component
- Keep all existing upload and analysis functionality working

</requirements>

<constraints>
- Do NOT modify backend code or Lambda functions
- All components must be 'use client' since they use Web Audio API
- AudioContext must be created ONLY after user interaction (browser autoplay policy)
- Handle cases where Web Audio API is not available (SSR, old browsers)
- Synthetic audio generation should happen asynchronously — show loading state
- Clean up all AudioContext, AnalyserNode, GainNode resources on unmount
- Ensure `npm run build` passes after all changes
</constraints>

<verification>
After completing all changes:

1. Run `cd dashboard-next && npm run build` — must succeed with no errors
2. Verify all new files exist:
   - src/components/audio/SyntheticAudioGenerator.tsx (or .ts)
   - src/components/audio/SpectrogramCanvas.tsx
   - src/components/audio/FrequencyBandLabels.tsx
   - src/components/audio/ABCrossfader.tsx
   - src/components/audio/AudioCompare.tsx
   - src/app/dashboard/compare/page.tsx
   - src/app/dashboard/analyze/page.tsx
3. Start dev server (`npm run dev -- -H 0.0.0.0`) and verify:
   - /dashboard/compare loads without console errors
   - /dashboard/analyze loads without console errors
4. Verify no regressions on existing /sites and /about pages
</verification>

<success_criteria>
- Synthetic audio generator creates distinguishable healthy vs degraded reef sounds
- SpectrogramCanvas renders real-time waterfall display from AnalyserNode data
- ABCrossfader smoothly controls volume blend between two sources
- AudioCompare combines all components into a cohesive A/B experience
- Compare page (/dashboard/compare) renders the full AudioCompare component
- Enhanced analyze page (/dashboard/analyze) shows spectrogram preview for uploaded files
- RegionWarning and CaveatsBanner appear in analyze results
- All Web Audio resources properly cleaned up on unmount
- `npm run build` passes with zero errors
</success_criteria>
