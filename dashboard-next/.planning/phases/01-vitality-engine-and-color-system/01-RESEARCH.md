# Phase 1: Vitality Engine and Color System - Research

**Researched:** 2026-03-20
**Domain:** HSL color interpolation, CSS custom properties, React performance patterns, rAF animation loops
**Confidence:** HIGH

## Summary

This phase builds the foundational state system that drives all visual properties across the application. The vitality score (0.0-1.0 float) flows through an HSL color interpolation engine into CSS custom properties, which Tailwind utility classes consume via `var()` references. The critical performance constraint is that continuous animation state (vitality value, interpolated colors) must live in refs and write directly to CSS custom properties via `document.documentElement.style.setProperty()`, never triggering React re-renders.

The codebase already has established patterns for this: `useSpectrogram` and `useAudioPlayback` both use ref-based AudioContext/rAF loops with proper cleanup. Zustand is already in use (`analysis-store.ts`), and the existing `Providers` wrapper in `layout.tsx` provides a natural injection point. The existing Golden Hour CSS variables in `globals.css` (lines 8-42) are the degraded palette endpoints -- all hex values have been converted to HSL for interpolation (documented below).

**Primary recommendation:** Use a zustand store for discrete vitality state (source, target value) combined with a `useVitalityAnimation` hook that runs the rAF lerp loop and writes CSS variables. This matches the project's existing state management pattern while keeping continuous animation off the React render cycle.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Degraded palette (vitality=0.0):** Current Golden Hour palette -- the existing CSS vars in globals.css (`--bg-abyss: #1a1714`, `--status-healthy: #cd853f`, `--text-primary: #e5e1db`, etc.) become the degraded baseline
- **Healthy palette (vitality=1.0):** Bioluminescent palette: teal ~HSL(175, 80%, 50%), magenta ~HSL(320, 75%, 55%), deep blue ~HSL(220, 70%, 45%), gold ~HSL(45, 85%, 60%), background shifts to deep ocean (#0a1520)
- **HSL interpolation** between endpoints (not RGB)
- **Page-specific single source** -- no mixing. Compare page: crossfader. Experience: audio/ML (Phase 3-4, just expose setter). Gallery: static per-card. Default: 0.0
- **VitalityProvider exposes `setVitality(value)` and `vitality` ref**
- **Ease-out cubic easing** for vitality lerp, 300ms minimum transition duration
- **Non-linear stagger:** shrimp-band colors at 0.2, fish-band at 0.4, complex at 0.7
- **Per-token effective vitality:** `clamp((rawVitality - threshold) / (1 - threshold), 0, 1)`
- **CSS variable naming:** `--reef-primary`, `--reef-accent`, `--reef-secondary`, `--reef-highlight`, `--reef-bg`, `--reef-surface`, `--reef-glow`, `--reef-text`
- **Tailwind extended with `reef-*` color tokens** pointing to CSS vars
- **CSSVariableWriter** updates `:root` via `document.documentElement.style.setProperty()`
- **Existing CSS variables remain untouched** in this phase (Phase 4 bridges them)

### Claude's Discretion
- Exact HSL values -- tune during implementation for visual quality
- Internal lerp implementation (linear interp or spring physics)
- Hook API design (single useVitality hook vs separate useVitalityColors)
- File organization within src/ (new hooks/ vs lib/ vs context/)
- Whether to use React Context or simpler ref-based approach for the provider

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CORE-01 | Vitality score (0.0-1.0) drives all visual properties | Zustand store + ref-based animation loop pattern; HSL interpolation math documented below |
| CORE-02 | Transitions lerped/eased over 300ms+ | Ease-out cubic easing function: `1 - Math.pow(1 - t, 3)`; rAF loop with delta-time accumulator |
| CORE-03 | Multiple input sources (crossfader, ML, audio energy) | `setVitality(value)` setter; page-specific single source pattern |
| CORE-04 | VitalityProvider exposes score and derived colors | Zustand store for discrete state + `useVitalityAnimation` hook for continuous rAF output |
| COLR-01 | Bioluminescent palette defined (teal, magenta, blue, gold) | Full HSL endpoints documented in Color Palette Endpoints section |
| COLR-02 | Degraded palette defined | Existing globals.css hex values converted to HSL (see table below) |
| COLR-03 | HSL interpolation between endpoints | Per-channel lerp with hue direction analysis; pitfalls documented |
| COLR-04 | CSS custom properties updated via CSSVariableWriter | Batched `setProperty()` in rAF at 30fps; 8 variables max |
| COLR-05 | Tailwind config extended with reef-* tokens | `var(--reef-*)` references in `tailwind.config.js` colors block |
| COLR-06 | Non-linear staggered transitions | Per-token threshold formula with clamped effective vitality |
| PERF-01 | 60fps via requestAnimationFrame | rAF loop pattern from `useSpectrogram`; CSS writes at 30fps (every other frame) |
| PERF-02 | Animation state in refs, not React state | Follow `audioCtxRef`/`analyserRef` pattern from existing hooks |
| PERF-03 | CSS variable updates batched at 30fps | Frame counter or timestamp check in rAF callback |
| PERF-04 | Dynamic import with { ssr: false } | Already established pattern in `page.tsx` with `SpectrogramCanvas` |

</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 14.2.5 | App Router, SSR/CSR | Already deployed, pinned |
| React | ^18.3.1 | Component framework | Already deployed |
| Tailwind CSS | ^3.4.7 | Utility-first styling | Already deployed |
| zustand | ^4.5 | Lightweight state management | Already in use (`analysis-store.ts`) |
| framer-motion | ^11.0 | Page transitions | Already in use (experience page) |

### Supporting (No New Dependencies)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Web Audio API | Native | Future audio-driven vitality | Not used in Phase 1 but architecture supports it |
| Canvas 2D | Native | Future particle rendering | Not used in Phase 1 |

### No New Dependencies Needed
This phase requires zero new npm packages. HSL interpolation is pure math (~20 lines). CSS variable writing is native DOM. The rAF animation loop is vanilla JS. Zustand is already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── stores/
│   ├── analysis-store.ts      # (existing)
│   └── vitality-store.ts      # NEW: zustand store for vitality state
├── lib/
│   ├── color-engine.ts        # NEW: pure HSL interpolation math
│   └── ...existing...
├── hooks/
│   ├── useVitality.ts         # NEW: main hook - animation loop + CSS writing
│   └── ...existing...
├── app/
│   ├── providers.tsx          # MODIFY: wrap with VitalityProvider
│   └── globals.css            # MODIFY: add --reef-* initial values
└── ...
```

### Pattern 1: Zustand Store for Discrete Vitality State

**What:** A zustand store holds the target vitality value and source identifier. This is the "what should the vitality be?" question -- discrete, settable, triggers no animation.

**When to use:** Any component that needs to set or read the target vitality.

**Example:**
```typescript
// src/stores/vitality-store.ts
import { create } from 'zustand';

type VitalitySource = 'crossfader' | 'audio' | 'ml' | 'static' | 'default';

interface VitalityStore {
  target: number;      // 0.0 - 1.0
  source: VitalitySource;
  setVitality: (value: number, source?: VitalitySource) => void;
}

export const useVitalityStore = create<VitalityStore>((set) => ({
  target: 0,
  source: 'default',
  setVitality: (value, source = 'default') =>
    set({ target: Math.max(0, Math.min(1, value)), source }),
}));
```

### Pattern 2: Ref-Based Animation Loop (from useSpectrogram)

**What:** A `useEffect` + `useRef` pattern that runs a rAF loop, reads the zustand target, lerps the current value toward it, computes colors, and writes CSS variables. The loop lives entirely outside React's render cycle.

**When to use:** For the continuous vitality animation that must run at 60fps without triggering React re-renders.

**Example:**
```typescript
// Inside useVitality hook
const currentRef = useRef(0);
const rafRef = useRef<number | null>(null);
const lastWriteRef = useRef(0);

useEffect(() => {
  const tick = (timestamp: number) => {
    const target = useVitalityStore.getState().target;

    // Ease-out cubic lerp
    const diff = target - currentRef.current;
    const speed = 0.08; // ~300ms to 95% convergence at 60fps
    currentRef.current += diff * speed;

    // Snap when close enough
    if (Math.abs(diff) < 0.001) currentRef.current = target;

    // Write CSS variables at 30fps (every ~33ms)
    if (timestamp - lastWriteRef.current > 33) {
      writeCSSVariables(currentRef.current);
      lastWriteRef.current = timestamp;
    }

    rafRef.current = requestAnimationFrame(tick);
  };

  rafRef.current = requestAnimationFrame(tick);
  return () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  };
}, []);
```

### Pattern 3: Pure Color Engine (No Side Effects)

**What:** A pure function module that takes a vitality score and returns an object of HSL color strings. Handles staggered thresholds, hue direction, and per-token effective vitality.

**When to use:** Called from the rAF loop to compute current colors. Zero DOM interaction.

**Example:**
```typescript
// src/lib/color-engine.ts
interface ReefColors {
  primary: string;    // --reef-primary
  accent: string;     // --reef-accent
  secondary: string;  // --reef-secondary
  highlight: string;  // --reef-highlight
  bg: string;         // --reef-bg
  surface: string;    // --reef-surface
  glow: string;       // --reef-glow
  text: string;       // --reef-text
}

function lerpHSL(
  fromH: number, fromS: number, fromL: number,
  toH: number, toS: number, toL: number,
  t: number,
  hueDirection: 'cw' | 'ccw' | 'shortest'
): string {
  const s = fromS + (toS - fromS) * t;
  const l = fromL + (toL - fromL) * t;

  let h: number;
  if (hueDirection === 'cw') {
    const delta = ((toH - fromH) + 360) % 360;
    h = (fromH + delta * t) % 360;
  } else if (hueDirection === 'ccw') {
    const delta = ((fromH - toH) + 360) % 360;
    h = (fromH - delta * t + 360) % 360;
  } else {
    // shortest
    const cw = ((toH - fromH) + 360) % 360;
    const ccw = ((fromH - toH) + 360) % 360;
    if (cw <= ccw) {
      h = (fromH + cw * t) % 360;
    } else {
      h = (fromH - ccw * t + 360) % 360;
    }
  }

  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function effectiveVitality(raw: number, threshold: number): number {
  if (raw <= threshold) return 0;
  return Math.min((raw - threshold) / (1 - threshold), 1);
}

export function computeReefColors(vitality: number): ReefColors {
  // Each token has its own threshold and interpolation
  // ...implementation maps vitality through thresholds to lerpHSL calls
}
```

### Pattern 4: CSSVariableWriter (Batched DOM Writes)

**What:** A function that takes the computed `ReefColors` object and writes all `--reef-*` CSS variables to `:root` in a single batch.

**When to use:** Called from the rAF loop at 30fps (throttled via timestamp check).

**Example:**
```typescript
function writeCSSVariables(colors: ReefColors): void {
  const root = document.documentElement.style;
  root.setProperty('--reef-primary', colors.primary);
  root.setProperty('--reef-accent', colors.accent);
  root.setProperty('--reef-secondary', colors.secondary);
  root.setProperty('--reef-highlight', colors.highlight);
  root.setProperty('--reef-bg', colors.bg);
  root.setProperty('--reef-surface', colors.surface);
  root.setProperty('--reef-glow', colors.glow);
  root.setProperty('--reef-text', colors.text);
}
```

### Anti-Patterns to Avoid
- **Storing vitality or colors in React state:** Triggers re-renders on every frame. Use refs for animation values, zustand only for the discrete target.
- **Per-component CSS variable writing:** Each component calling `setProperty` independently causes N style recalcs instead of 1. Centralize all writes in one rAF callback.
- **RGB interpolation:** Produces muddy grays at midpoints. HSL preserves chromaticity.
- **Linear hue interpolation without direction control:** Can traverse ugly green/purple mid-states (see Pitfalls section).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State management | Custom pub/sub or event emitter | zustand store | Already in project, handles selectors/subscriptions correctly |
| Page transitions | Manual mount/unmount | framer-motion AnimatePresence | Already in use, handles exit animations |
| CSS class merging | String concatenation | clsx + tailwind-merge (already installed) | Handles conflicting Tailwind classes correctly |

**Key insight:** This phase genuinely needs no libraries. HSL math is 20 lines of arithmetic. The "engine" is a rAF loop and 8 `setProperty` calls. The complexity is in getting the architecture right (refs vs state, batching, cleanup), not in the code volume.

## Common Pitfalls

### Pitfall 1: Hue Interpolation Through Ugly Mid-States

**What goes wrong:** Linear HSL interpolation from warm brown (hue 30) to deep ocean (hue 210) passes through bright green (hue 120). From dusty rose (hue 359) to deep blue (hue 220) passes through purple (hue 308).

**Why it happens:** Shortest-arc hue interpolation doesn't consider what the intermediate hues look like visually.

**How to avoid:** Per-token hue direction choices based on analysis:

| Token | From (H) | To (H) | Direction | Midpoint Hue | Safe? |
|-------|----------|--------|-----------|--------------|-------|
| primary (ochre->teal) | 30 | 175 | CW (145deg) | 103 (green) | YES -- green is natural path to teal |
| accent (rose->magenta) | 359 | 320 | CCW (39deg) | 340 (pink) | YES -- stays in warm red/pink |
| bg (brown->ocean) | 30 | 210 | CW (180deg) | 120 (green) | SAFE -- at L=9%, S=13%, hue is invisible |
| secondary (bone->blue) | 36 | 220 | N/A | N/A | SKIP hue interp -- use late hue snap |
| highlight (amber->gold) | 43 | 45 | CW (2deg) | 44 | YES -- trivially safe |

**Warning signs:** Ugly green or purple tints at vitality 0.4-0.6. Test at 0.25, 0.50, 0.75.

### Pitfall 2: React Re-Renders From Vitality Updates

**What goes wrong:** Storing the continuously-changing vitality value or computed colors in React state triggers re-renders every frame across all consuming components.

**Why it happens:** React Context or useState triggers reconciliation on every value change.

**How to avoid:**
- Zustand store holds only the discrete *target* value (set by user action, not animation)
- The rAF loop reads the target via `useVitalityStore.getState()` (no subscription)
- Animation state (`currentRef`) and computed colors live in refs
- CSS variables handle propagation to components -- React never knows about intermediate values
- Use `zustand`'s `subscribe` for the rare component that needs to react to target changes

**Warning signs:** React DevTools showing constant re-renders on components that consume vitality.

### Pitfall 3: CSS Variable Cascade Performance

**What goes wrong:** Writing 8+ CSS custom properties to `:root` at 60fps causes long "Recalculate Style" blocks because every change to `:root` triggers a full-page style recalc.

**Why it happens:** CSS custom properties on `:root` are inherited by every element in the DOM. Each `setProperty` call schedules a style recalc.

**How to avoid:**
- Throttle CSS writes to 30fps (every ~33ms) -- visual difference from 60fps is imperceptible for color transitions
- Limit to 8 CSS variables (the `--reef-*` set)
- All 8 writes happen in a single synchronous batch within one rAF callback
- Components read via `var()` in Tailwind classes -- they don't re-render, CSS handles it

**Warning signs:** Long "Recalculate Style" blocks (>5ms) in Chrome DevTools Performance tab.

### Pitfall 4: Memory Leaks from Orphaned Animation Loops

**What goes wrong:** rAF callbacks not cancelled on unmount, or multiple animation loops spawned on re-mount.

**Why it happens:** React's StrictMode double-invokes effects in development, and hot module replacement can leave stale closures.

**How to avoid:**
- Store rAF ID in ref: `rafRef.current = requestAnimationFrame(tick)`
- Cancel in cleanup: `return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }`
- Guard against double-start: check if loop is already running before starting
- Follow exact pattern from `useSpectrogram.ts` (lines 74-82)

**Warning signs:** Frame rate degrading over time, multiple rAF callbacks visible in Performance tab.

### Pitfall 5: SSR Crash on document.documentElement

**What goes wrong:** `document.documentElement.style.setProperty()` crashes during Next.js server-side rendering.

**Why it happens:** `document` doesn't exist in Node.js.

**How to avoid:**
- All CSS variable writing happens inside `useEffect` (client-only)
- The `useVitality` hook itself is safe (refs initialize to null, effects only run client-side)
- The VitalityProvider component that starts the rAF loop should be wrapped in a client boundary (`'use client'` directive)
- If any component needs vitality for conditional rendering, it reads from the zustand store (which works server-side with initial value 0)

**Warning signs:** `ReferenceError: document is not defined` during `next build`.

### Pitfall 6: Secondary Token (Bone -> Blue) Hue Transition

**What goes wrong:** The secondary color goes from bone white HSL(36, 16%, 88%) to deep blue HSL(220, 70%, 45%). Any hue interpolation path (CW through green or CCW through purple) looks terrible at mid-saturation.

**Why it happens:** At 16% saturation the color is near-white (hue irrelevant). As saturation increases during interpolation, the intermediate hue becomes visible before it reaches the target blue.

**How to avoid:** Use a non-linear saturation ramp. Keep saturation low until vitality > 0.6, then ramp quickly. This creates a near-white-to-blue transition where the hue "snaps" to blue only when saturation is high enough to be visible. Alternatively, interpolate lightness and saturation independently from hue, with hue jumping to the target at a specific vitality threshold.

**Warning signs:** Visible green or purple tint in the secondary color at vitality 0.3-0.5.

## Code Examples

### Complete HSL Palette Endpoints (Verified)

**Degraded State (vitality=0.0) -- Existing Golden Hour Palette:**

| Token | CSS Variable | Hex | HSL |
|-------|-------------|-----|-----|
| bg | --reef-bg | #1a1714 | hsl(30, 13%, 9%) |
| surface | --reef-surface | #252220 | hsl(24, 7%, 14%) |
| primary | --reef-primary | #cd853f | hsl(30, 59%, 53%) |
| accent | --reef-accent | #c08081 | hsl(359, 34%, 63%) |
| secondary | --reef-secondary | #e9dcc9 | hsl(36, 42%, 85%) |
| highlight | --reef-highlight | #b8860b | hsl(43, 89%, 38%) |
| glow | --reef-glow | rgba(205, 133, 63, 0.4) | hsla(30, 59%, 53%, 0.4) |
| text | --reef-text | #e5e1db | hsl(36, 16%, 88%) |

**Healthy State (vitality=1.0) -- Bioluminescent Palette:**

| Token | CSS Variable | HSL | Visual |
|-------|-------------|-----|--------|
| bg | --reef-bg | hsl(210, 38%, 8%) | Deep ocean (#0a1520) |
| surface | --reef-surface | hsl(210, 30%, 12%) | Dark ocean panel |
| primary | --reef-primary | hsl(175, 80%, 50%) | Electric teal glow |
| accent | --reef-accent | hsl(320, 75%, 55%) | Coral fluorescence magenta |
| secondary | --reef-secondary | hsl(220, 70%, 45%) | Ocean depth blue |
| highlight | --reef-highlight | hsl(45, 85%, 60%) | Dinoflagellate gold |
| glow | --reef-glow | hsla(175, 80%, 50%, 0.4) | Teal glow with alpha |
| text | --reef-text | hsl(180, 20%, 92%) | Cool-tinted bright text |

### Stagger Threshold Mapping

```typescript
const TOKEN_THRESHOLDS: Record<string, number> = {
  primary:   0.2,  // Shrimp band -- first to return
  glow:      0.2,  // Follows primary
  accent:    0.4,  // Fish band -- mid restoration
  text:      0.3,  // Text shifts early for readability
  highlight: 0.7,  // Complex behaviors -- late
  secondary: 0.7,  // Complex behaviors -- late
  bg:        0.0,  // Background always interpolating (but subtle)
  surface:   0.0,  // Surface always interpolating (but subtle)
};

// Usage: effectiveVitality(rawVitality, TOKEN_THRESHOLDS['primary'])
// At raw=0.3, primary effective = clamp((0.3 - 0.2) / (1 - 0.2), 0, 1) = 0.125
// At raw=0.3, accent effective = clamp((0.3 - 0.4) / (1 - 0.4), 0, 1) = 0 (hasn't started)
```

### Tailwind Config Extension

```javascript
// Addition to tailwind.config.js colors block
colors: {
  // ...existing colors...
  'reef-primary': 'var(--reef-primary)',
  'reef-accent': 'var(--reef-accent)',
  'reef-secondary': 'var(--reef-secondary)',
  'reef-highlight': 'var(--reef-highlight)',
  'reef-bg': 'var(--reef-bg)',
  'reef-surface': 'var(--reef-surface)',
  'reef-glow': 'var(--reef-glow)',
  'reef-text': 'var(--reef-text)',
},
```

### CSS Variable Initial Values (globals.css addition)

```css
:root {
  /* ...existing vars... */

  /* Reef vitality color system -- initial values = degraded state */
  --reef-primary: hsl(30, 59%, 53%);
  --reef-accent: hsl(359, 34%, 63%);
  --reef-secondary: hsl(36, 42%, 85%);
  --reef-highlight: hsl(43, 89%, 38%);
  --reef-bg: hsl(30, 13%, 9%);
  --reef-surface: hsl(24, 7%, 14%);
  --reef-glow: hsla(30, 59%, 53%, 0.4);
  --reef-text: hsl(36, 16%, 88%);
}
```

### Ease-Out Cubic Lerp

```typescript
// Per-frame exponential approach (simpler, good enough)
// At 60fps, speed=0.08 gives ~300ms to 95% convergence
current += (target - current) * 0.08;

// Or explicit ease-out cubic with duration tracking:
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// In rAF loop:
const elapsed = timestamp - transitionStartTime;
const t = Math.min(elapsed / TRANSITION_DURATION_MS, 1);
const eased = easeOutCubic(t);
current = startValue + (targetValue - startValue) * eased;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS `color-mix()` | JS HSL interpolation + CSS vars | CSS `color-mix()` is ~95% supported but lacks per-token stagger control | Full control over interpolation curve and timing per token |
| React Context for continuous values | Zustand + refs for animation | Established React performance pattern | Eliminates re-render cascade for 60fps animation |
| `prefers-color-scheme` toggle | Continuous vitality transformation | Design decision | Not a theme toggle -- continuous 0-1 transformation |

**Note on `color-mix()`:** While CSS `color-mix(in hsl, ...)` could handle some of this in pure CSS, it cannot implement per-token stagger thresholds, non-linear easing, or the 30fps batching requirement. JS computation + CSS variable output gives full control.

## Open Questions

1. **Glow token alpha channel**
   - What we know: The degraded glow uses `rgba()` with 0.4 alpha. HSL with alpha is `hsla()`.
   - What's unclear: Should the alpha itself interpolate with vitality? (0.4 degraded -> 0.6 healthy? or constant 0.4?)
   - Recommendation: Interpolate alpha from 0.2 (degraded, barely visible) to 0.5 (healthy, prominent). This enhances the "life returning" feel.

2. **Zustand subscription vs getState() in rAF**
   - What we know: `useVitalityStore.getState().target` reads outside React. `subscribe()` fires on change.
   - What's unclear: Whether to poll in every rAF tick or subscribe and cache.
   - Recommendation: Use `getState()` in every rAF tick. At 60fps the read is negligible, and it avoids subscription management complexity. Zustand's `getState()` is synchronous and O(1).

3. **VitalityProvider mount point**
   - What we know: The existing `Providers` component in `src/app/providers.tsx` wraps `QueryClientProvider`. Layout wraps `Providers`.
   - What's unclear: Whether to add VitalityProvider inside `Providers` or at a different level.
   - Recommendation: Add the `useVitality()` hook call inside `Providers` (since it's already `'use client'`). The hook starts the rAF loop when mounted, writes CSS vars. No wrapping Context needed -- zustand is global by nature.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None currently installed |
| Config file | none -- see Wave 0 |
| Quick run command | `npx next build` (type-check + build) |
| Full suite command | `npx next build` (no test runner configured) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CORE-01 | Vitality 0-1 drives visuals | manual | Visual inspection of CSS vars in DevTools | N/A |
| CORE-02 | 300ms+ eased transitions | manual | DevTools Performance tab, visual smoothness | N/A |
| CORE-03 | Multiple input sources accepted | unit | `npx next build` (type-check verifies API) | Wave 0 |
| CORE-04 | Provider exposes score/colors | unit | `npx next build` (type-check) | Wave 0 |
| COLR-01 | Healthy palette defined | unit | Color engine pure function tests | Wave 0 |
| COLR-02 | Degraded palette defined | unit | Color engine pure function tests | Wave 0 |
| COLR-03 | HSL interpolation works | unit | `computeReefColors(0)`, `computeReefColors(1)`, `computeReefColors(0.5)` | Wave 0 |
| COLR-04 | CSS vars updated by writer | manual | DevTools inspection of `:root` styles | N/A |
| COLR-05 | Tailwind reef-* tokens work | manual | `npx next build` (Tailwind compiles) | N/A |
| COLR-06 | Staggered thresholds | unit | `effectiveVitality()` unit tests | Wave 0 |
| PERF-01 | 60fps rAF | manual | Chrome Performance tab | N/A |
| PERF-02 | Refs not state | manual-only | Code review | N/A |
| PERF-03 | 30fps CSS batching | manual | Chrome Performance tab, count `setProperty` calls | N/A |
| PERF-04 | Dynamic import ssr:false | build | `npx next build` succeeds | Existing |

### Sampling Rate
- **Per task commit:** `npx next build` (catches type errors and SSR issues)
- **Per wave merge:** `npx next build` + manual DevTools inspection
- **Phase gate:** Build succeeds + visual inspection at vitality 0.0, 0.25, 0.5, 0.75, 1.0

### Wave 0 Gaps
- No test runner installed (vitest, jest, etc.)
- For this phase, `npx next build` serves as the primary automated validation (TypeScript type-checking + SSR safety)
- Pure functions (`computeReefColors`, `effectiveVitality`, `lerpHSL`) are highly testable but no test infrastructure exists
- Recommendation: Defer test framework setup; `next build` + manual inspection is sufficient for Phase 1's scope

## Sources

### Primary (HIGH confidence)
- `dashboard-next/src/app/globals.css` -- Existing CSS custom properties (degraded palette endpoints)
- `dashboard-next/tailwind.config.js` -- Current Tailwind color config and CSS var reference pattern
- `dashboard-next/src/hooks/useSpectrogram.ts` -- Established rAF + ref + cleanup pattern
- `dashboard-next/src/components/experience/useAudioPlayback.ts` -- Band filtering and AudioContext pattern
- `dashboard-next/src/stores/analysis-store.ts` -- Existing zustand store pattern
- `dashboard-next/src/app/providers.tsx` -- Existing provider wrapper pattern
- `dashboard-next/package.json` -- Verified dependency versions

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` -- Performance pitfalls catalog
- `.planning/research/ARCHITECTURE.md` -- Component architecture design
- `.planning/research/STACK.md` -- Stack recommendations (no new deps)
- `prompts/055-bioluminescent-ui-system.md` -- Full UI spec with color values

### Tertiary (LOW confidence)
- HSL hue interpolation direction analysis -- verified by manual computation (Node.js script), but visual quality at midpoints should be confirmed during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already installed and in use
- Architecture: HIGH -- patterns directly observed in existing codebase (`useSpectrogram`, zustand store, rAF cleanup)
- Color math: HIGH -- HSL conversions verified computationally, hue directions analyzed
- Pitfalls: HIGH -- drawn from both project-specific research (PITFALLS.md) and verified against codebase patterns
- Stagger thresholds: MEDIUM -- formula is correct per CONTEXT.md, but visual tuning needed during implementation

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable domain -- no fast-moving dependencies)
