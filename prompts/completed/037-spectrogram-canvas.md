<objective>
Build the SpectrogramCanvas — a full-viewport HTML5 canvas component that renders animated frequency band lines and a particle system. This is the visual centerpiece of the Living Spectrogram experience. It should run at 60fps and optionally react to real audio data via Web Audio API's AnalyserNode.

Read `./CLAUDE.md` for project context.
</objective>

<context>
This is prompt 2 of 5 in the Living Spectrogram Overhaul. Prompt 036 established the Golden Hour design system (globals.css, tailwind.config, glass components). This prompt creates the canvas animation system that will be used by the Experience page (prompt 038) and as a subtle background on the landing page.

The dashboard is at `./dashboard-next/`. Dependencies already include `framer-motion` and `react` 18.3.

Color palette (from globals.css after prompt 036):
- Ochre (#cd853f) — Fish Calls, low frequency
- Dusty Rose (#c08081) — Grazing Sounds, mid frequency
- Pale Gold (#e9dcc9) — Snapping Shrimp, high frequency
- Background: #1a1714 (--bg-abyss)
</context>

<requirements>

## 1. SpectrogramCanvas Component

Create `./dashboard-next/src/components/spectrogram/SpectrogramCanvas.tsx`

**Props:**
```typescript
interface SpectrogramCanvasProps {
  state: 'idle' | 'playing' | 'analyzing';
  activeBands?: Set<'low' | 'mid' | 'high'>;
  audioAnalyser?: AnalyserNode | null;
  className?: string;
  opacity?: number; // For use as subtle background (0.3 on landing)
}
```

**Must use 'use client' directive.**

**Canvas setup:**
- Full parent container size (width/height 100%)
- Use ResizeObserver to track container dimensions and set canvas size
- Use `requestAnimationFrame` for animation loop
- Clean up on unmount (cancel RAF, disconnect observer)
- Render on a 2D canvas context

**Three Frequency Band Lines:**

Each band is a horizontal sine wave that scrolls and undulates:

```
Band: low
  Label: 'Fish Calls'
  Range: '50-1000 Hz'
  Color: #cd853f (Ochre)
  Y Position: 60% from top
  Base amplitude: 30px (idle), 80px (playing)
  Frequency: 0.002 (wavelength)
  Speed: 0.5 (scroll rate)

Band: mid
  Label: 'Grazing Sounds'
  Range: '1-4 kHz'
  Color: #c08081 (Dusty Rose)
  Y Position: 50% from top
  Base amplitude: 20px (idle), 60px (playing)
  Frequency: 0.004
  Speed: 0.8

Band: high
  Label: 'Snapping Shrimp'
  Range: '4-20 kHz'
  Color: #e9dcc9 (Pale Gold)
  Y Position: 40% from top
  Base amplitude: 15px (idle), 50px (playing)
  Frequency: 0.008
  Speed: 1.2
```

Each line should:
- Draw as a smooth path (ctx.beginPath, moveTo, lineTo across canvas width)
- Use `sin(x * frequency + time * speed)` for the wave shape
- Add a second harmonic at half amplitude for organic feel
- Apply line glow: draw the line twice — once thick (4px) at low opacity for glow, once thin (2px) at full opacity
- Smoothly interpolate amplitude between idle/playing states using lerp
- When a band is NOT in `activeBands`, draw at 20% opacity

**Rendering the wave:**
```
For each x from 0 to canvas.width:
  y = centerY + amplitude * (sin(x * freq + time * speed) + 0.5 * sin(x * freq * 2.1 + time * speed * 1.3))
```

## 2. Particle System

Embedded in the same canvas, render "bioluminescent plankton" particles:

```typescript
interface Particle {
  x: number;
  y: number;
  size: number;       // 1-4px radius
  color: string;      // Random from band colors
  alpha: number;      // 0-1, fades in/out
  vx: number;         // Horizontal drift
  vy: number;         // Upward float speed (negative)
  life: number;       // 0-1, current life stage
  maxLife: number;    // Total life in frames
}
```

**Behavior:**
- **idle**: 30-50 particles, slow drift upward, sparse spawning
- **playing**: 60-100 particles, faster movement, frequent spawning
- **analyzing**: 40-70 particles, swirl pattern (add sinusoidal vx based on time)
- Particles spawn at random x, bottom 30% of canvas
- Float upward (vy: -0.2 to -0.8)
- Slight horizontal drift (vx: -0.3 to 0.3)
- Fade in during first 20% of life, fade out during last 30%
- Remove when life >= maxLife or y < 0
- Draw as filled circle with radial gradient (bright center, transparent edge)

## 3. Audio Reactivity

When `audioAnalyser` prop is provided and state is 'playing':

```typescript
const frequencyData = new Uint8Array(audioAnalyser.frequencyBinCount);
audioAnalyser.getByteFrequencyData(frequencyData);

// Map frequency bins to band energy (0-255 range)
const lowEnergy = average(frequencyData.slice(0, 50)) / 128;     // ~0-2
const midEnergy = average(frequencyData.slice(50, 200)) / 128;
const highEnergy = average(frequencyData.slice(200, 500)) / 128;

// Drive amplitudes from real audio
targetAmplitude.low = lowEnergy * bands.low.playingAmplitude;
targetAmplitude.mid = midEnergy * bands.mid.playingAmplitude;
targetAmplitude.high = highEnergy * bands.high.playingAmplitude;
```

Use lerp (factor 0.1) to smooth the transition between current and target amplitude each frame.

When no analyser is provided, use the preset idle/playing amplitudes based on state.

## 4. useSpectrogramAnimation Hook

Create `./dashboard-next/src/components/spectrogram/useSpectrogramAnimation.ts`

Extract the animation logic into a custom hook:

```typescript
function useSpectrogramAnimation(
  canvasRef: RefObject<HTMLCanvasElement>,
  state: 'idle' | 'playing' | 'analyzing',
  activeBands: Set<'low' | 'mid' | 'high'>,
  audioAnalyser?: AnalyserNode | null
): void
```

This hook:
- Manages the RAF loop
- Manages particle array (spawn, update, remove)
- Manages band amplitude interpolation
- Handles ResizeObserver
- Cleans up everything on unmount

## 5. Frequency Band Types

Create `./dashboard-next/src/components/spectrogram/FrequencyBands.ts`

Export the band configuration as constants:

```typescript
export type BandId = 'low' | 'mid' | 'high';

export interface BandConfig {
  id: BandId;
  label: string;
  range: string;
  color: string;
  baseAmplitude: number;
  playingAmplitude: number;
  frequency: number;
  speed: number;
  yPosition: number;
}

export const BANDS: Record<BandId, BandConfig> = { ... };
```

## 6. Barrel Export

Create `./dashboard-next/src/components/spectrogram/index.ts` exporting:
- SpectrogramCanvas (default and named)
- BANDS, BandId, BandConfig from FrequencyBands
- useSpectrogramAnimation

</requirements>

<constraints>
- Must use 'use client' directive on all .tsx files
- Must NOT import any external animation libraries (no GSAP, no three.js) — pure Canvas 2D API
- Must run at 60fps on modern hardware (keep particle count under 100, avoid expensive operations per frame)
- Must handle window resize gracefully
- Must clean up all resources on unmount (RAF, ResizeObserver, particle array)
- Canvas background should be transparent (parent element provides the --bg-abyss background)
- Do NOT modify any existing components or pages
</constraints>

<verification>
After completing:

1. Run `cd dashboard-next && npm run build` — must pass with zero errors
2. Verify all files exist:
   - `src/components/spectrogram/SpectrogramCanvas.tsx`
   - `src/components/spectrogram/useSpectrogramAnimation.ts`
   - `src/components/spectrogram/FrequencyBands.ts`
   - `src/components/spectrogram/index.ts`
3. Verify no external animation library imports
4. Verify 'use client' directive on .tsx files
5. Verify ResizeObserver and RAF cleanup in useEffect return
</verification>

<success_criteria>
- SpectrogramCanvas renders 3 animated wave lines in ochre/rose/gold
- Particle system spawns and animates floating particles
- State transitions (idle/playing/analyzing) change amplitude and particle density
- Audio reactivity drives wave amplitudes from real AnalyserNode data when provided
- Build passes with zero TypeScript errors
- All resources cleaned up on unmount
</success_criteria>
