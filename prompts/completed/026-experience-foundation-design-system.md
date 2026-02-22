<objective>
Set up the foundation for the ReefRadar Experience Layer: install new dependencies, implement the ocean-depth design system, create reusable UI primitives, custom hooks, and a Zustand state store. This is the base layer that all other Experience Layer features build upon.

You are enhancing an EXISTING working Next.js 14 dashboard at `dashboard-next/`. Do NOT break existing functionality. The backend API is working — do NOT modify anything outside `dashboard-next/`.
</objective>

<context>
Read the project's CLAUDE.md for overall architecture understanding.

The current dashboard-next/ is a working Next.js 14 app with:
- Tailwind CSS configured
- React Query for data fetching
- TypeScript throughout
- Working pages: / (analyze), /sites, /about
- API base URL: https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod

You are building the foundation for 5 major features:
1. Audio A/B Comparison (prompt 027)
2. Scrollytelling Landing Page (prompt 028)
3. Dashboard shell + deck.gl Map + Enhanced Results (prompt 029)
</context>

<research>
Before making changes, read these files to understand the existing codebase:
- `dashboard-next/package.json` — current dependencies
- `dashboard-next/tailwind.config.ts` — current Tailwind setup
- `dashboard-next/src/app/globals.css` — current styles
- `dashboard-next/src/types/index.ts` — current TypeScript types
- `dashboard-next/src/lib/utils.ts` — current utilities
- `dashboard-next/src/hooks/useAnalysis.ts` — current hooks
- `dashboard-next/src/app/layout.tsx` — root layout
- `dashboard-next/src/app/providers.tsx` — current providers
</research>

<requirements>

## 1. Install Dependencies

Add these to package.json and run npm install:
```
@deck.gl/core@^9.0
@deck.gl/layers@^9.0
@deck.gl/react@^9.0
react-map-gl@^7.1
maplibre-gl@^4.0
wavesurfer.js@^7.8
zustand@^4.5
framer-motion@^11.0
```

## 2. Design System — globals.css

Add these CSS custom properties to the existing globals.css (do NOT remove existing styles):

```css
:root {
  /* Ocean depth palette */
  --abyss: #030b1a;
  --deep: #061428;
  --mid: #0a2240;
  --surface: #0d3b66;

  /* Bioluminescent accents */
  --glow-cyan: #00e5ff;
  --glow-green: #00ffa3;
  --glow-coral: #ff6b6b;
  --glow-gold: #ffd700;

  /* Health classification */
  --healthy: #00ffa3;
  --degraded: #ff6b6b;
  --restored-early: #ffd700;
  --restored-mid: #00e5ff;

  /* Text hierarchy */
  --text-primary: #e0f0ff;
  --text-muted: #6b8aad;
  --text-dim: #3a5a7c;

  /* Spectrogram thermal */
  --spec-cold: #0a0a2e;
  --spec-cool: #1a3a8a;
  --spec-warm: #00e5ff;
  --spec-hot: #ffd700;
  --spec-fire: #ff6b6b;

  /* Region status */
  --in-distribution: var(--glow-green);
  --out-of-distribution: var(--glow-coral);
}
```

Also extend the Tailwind config to expose these as Tailwind utilities (e.g., `bg-abyss`, `text-glow-cyan`, etc.) by adding them to the `theme.extend.colors` section.

## 3. UI Primitive Components

Create these in `dashboard-next/src/components/ui/`:

### AnimatedCounter.tsx
- Client component that animates a number from 0 to target on scroll-into-view
- Props: `target: number`, `duration?: number` (ms, default 2000), `prefix?: string`, `suffix?: string`, `decimals?: number`
- Uses requestAnimationFrame with easing (ease-out-cubic)
- Uses IntersectionObserver to trigger only when visible
- Formats large numbers with commas

### GlowCard.tsx
- A card component with subtle glow effect on hover
- Props: `children`, `className?`, `glowColor?: string` (default: var(--glow-cyan))
- Dark background (var(--deep)), rounded corners, border that glows on hover
- Smooth transition for glow effect

### WaveBackground.tsx
- Full-width CSS-only animated wave pattern for section backgrounds
- Multiple overlapping sine waves with different speeds/amplitudes
- Uses CSS `@keyframes` and `clip-path` or SVG paths
- Supports `variant?: 'top' | 'bottom' | 'both'` for wave positioning
- Low performance impact (CSS transforms only, no JS animation)

### LoadingReef.tsx
- Animated loading indicator themed as coral/reef
- Pulsing circles in reef colors with wave motion
- Props: `size?: 'sm' | 'md' | 'lg'`, `text?: string`

### ScrollProgress.tsx
- Fixed top bar showing scroll progress through the page
- Thin gradient bar (--glow-cyan to --glow-green)
- Uses scroll event listener with requestAnimationFrame throttle

## 4. Custom Hooks

Create these in `dashboard-next/src/hooks/`:

### useAnimateOnScroll.ts
```typescript
import { useRef, useState, useEffect } from 'react';

export function useAnimateOnScroll(options?: { threshold?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        setProgress(entry.intersectionRatio);
      },
      { threshold: Array.from({ length: 20 }, (_, i) => i / 20), ...options }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible, progress };
}
```

### useScrollProgress.ts
- Returns a 0-1 value representing total page scroll progress
- Uses scroll event listener with requestAnimationFrame throttle
- Cleans up on unmount

### useSpectrogram.ts
- Hook wrapping Web Audio API AnalyserNode for spectrogram data
- Input: `audioElement: HTMLAudioElement | null`
- Returns: `{ frequencyData: Float32Array | null, analyser: AnalyserNode | null, isReady: boolean }`
- Creates AudioContext lazily (on first user interaction)
- fftSize: 2048, minDecibels: -90, maxDecibels: -10
- Handles cleanup of AudioContext

### useAudioPlayer.ts
- Simple audio player hook
- Input: `src: string`
- Returns: `{ play, pause, stop, isPlaying, currentTime, duration, audioElement }`
- Creates HTMLAudioElement and manages state
- Handles cleanup

## 5. Zustand Store

Create `dashboard-next/src/stores/analysis-store.ts`:

```typescript
import { create } from 'zustand';

interface AnalysisState {
  // Upload state
  uploadId: string | null;
  analysisId: string | null;

  // Processing state
  stage: 'idle' | 'uploading' | 'preprocessing' | 'embedding' | 'classifying' | 'complete' | 'failed';
  progress: string;
  error: string | null;

  // Results
  results: any | null; // VisualizeResponse type

  // Actions
  setUploadId: (id: string) => void;
  setAnalysisId: (id: string) => void;
  setStage: (stage: AnalysisState['stage']) => void;
  setProgress: (progress: string) => void;
  setError: (error: string) => void;
  setResults: (results: any) => void;
  reset: () => void;
}
```

## 6. Dashboard Components

Create these in `dashboard-next/src/components/dashboard/`:

### CaveatsBanner.tsx
Scientific caveats banner that MUST appear below analysis results, in landing page footer, in dashboard sidebar, and in map info panel.

Display these 5 caveats:
1. "Classification based on acoustic similarity to reference sites. Not a definitive health diagnosis."
2. "Passive acoustic monitoring complements but does not replace visual surveys."
3. "Models trained primarily on Indo-Pacific reefs (Indonesia, Kenya). Results for Caribbean, Red Sea, and other regions carry reduced confidence."
4. "Single audio recordings provide a snapshot. Reef health assessment requires temporal monitoring."
5. "Acoustic indices developed for terrestrial environments perform inconsistently underwater."

Styled with amber/warning aesthetic. Collapsible with "Scientific Caveats" header. Default expanded on first view.

### RegionWarning.tsx
Out-of-distribution warning component:
- Props: `region: { detected: string, name: string, in_training_distribution: boolean, confidence_adjusted: boolean }`
- Returns null if `in_training_distribution` is true
- Shows amber warning banner with AlertTriangle icon
- Explains that confidence was reduced by 40% for out-of-distribution regions
- Styled with `bg-amber-900/30 border border-amber-500/50`

</requirements>

<constraints>
- Do NOT break existing pages (/, /sites, /about must still work)
- Do NOT modify any backend code or Lambda functions
- All new components must be 'use client' if they use hooks/state/browser APIs
- Ensure the build succeeds after all changes: run `cd dashboard-next && npm run build`
- Use the existing Tailwind setup — extend it, don't replace it
- All TypeScript — no `any` types except where interfacing with external libraries that lack types
</constraints>

<verification>
After completing all changes:

1. Run `cd dashboard-next && npm run build` — must succeed with no errors
2. Verify all new files exist:
   - src/components/ui/AnimatedCounter.tsx
   - src/components/ui/GlowCard.tsx
   - src/components/ui/WaveBackground.tsx
   - src/components/ui/LoadingReef.tsx
   - src/components/ui/ScrollProgress.tsx
   - src/hooks/useAnimateOnScroll.ts
   - src/hooks/useScrollProgress.ts
   - src/hooks/useSpectrogram.ts
   - src/hooks/useAudioPlayer.ts
   - src/stores/analysis-store.ts
   - src/components/dashboard/CaveatsBanner.tsx
   - src/components/dashboard/RegionWarning.tsx
3. Verify CSS variables are in globals.css
4. Verify Tailwind config has new color utilities
5. Verify package.json has all new dependencies
</verification>

<success_criteria>
- All 8 new dependencies installed successfully
- Ocean depth design system CSS variables added to globals.css
- Tailwind config extended with custom colors
- 5 UI primitive components created and properly typed
- 4 custom hooks created with proper cleanup
- Zustand store created with analysis state management
- CaveatsBanner and RegionWarning dashboard components created
- `npm run build` passes with zero errors
- Existing pages still work (no regressions)
</success_criteria>
