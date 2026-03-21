# Phase 2: Visual Effects - Research

**Researched:** 2026-03-21
**Domain:** Canvas 2D particle systems, procedural caustic rendering, object pool patterns
**Confidence:** HIGH

## Summary

Phase 2 adds two visual layers to a single full-viewport background canvas: (1) a vitality-responsive particle system (5-150 rising bubble/plankton particles) and (2) procedural caustic light patterns using overlapping sine waves. Both read vitality from the existing Zustand store (`useVitalityStore.getState()`) in a shared rAF loop -- no React subscriptions, no re-renders.

The existing `useSpectrogramAnimation.ts` provides a near-complete template: Particle interface, life/maxLife decay, DPR-aware canvas sizing via ResizeObserver, rAF loop with cleanup. The key upgrade is replacing its `push/splice` particle management with a pre-allocated object pool (150 slots with `active` flags) to eliminate GC pressure, and adding the caustic layer rendered before particles using `globalCompositeOperation: 'screen'`.

**Primary recommendation:** Build a single `useBackgroundCanvas` hook that owns one full-viewport canvas, renders caustics then particles in one rAF loop, polls vitality via `getState()`, and uses an object pool. Mount the canvas component in `providers.tsx` (or as a sibling in layout) with `position: fixed; z-index: -1`. Use `next/dynamic` with `{ ssr: false }` for the component.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Gentle upward drift (like rising bubbles/plankton) with slight horizontal oscillation -- not random Brownian motion
- Spawn from bottom third of canvas, drift upward, fade out near top
- Life/maxLife decay pattern -- reuse approach from existing `useSpectrogramAnimation.ts`
- At vitality 0.0: 5 particles, muted brown (~ochre), slow drift, low opacity (0.2-0.4)
- At vitality 1.0: 150 particles, teal/magenta mix (from reef colors), faster drift, higher opacity (0.5-0.8)
- Particle size: 2-6px radius, slightly larger at higher vitality
- Speed scales linearly with vitality: 0.3px/frame (degraded) to 1.5px/frame (healthy)
- Soft organic overlapping sine waves for caustics -- not sharp Voronoi cells
- 3-4 overlapping sine patterns with different frequencies and phase offsets
- Color: teal-tinted white at high vitality, invisible at 0.0
- Rendered with low opacity (max 0.15 at vitality 1.0) and `globalCompositeOperation: 'screen'`
- Slow animation (phase shift ~0.5 deg/frame) for gentle underwater shimmer
- Pattern covers full canvas area but only visible when vitality > 0.3
- Single shared canvas behind all page content (z-index behind main content)
- Particles and caustics rendered on same canvas in single rAF loop: caustics first (background), particles on top
- Canvas sized to viewport (`100vw x 100vh`), fixed position
- DPR-aware sizing (follow existing pattern from `useSpectrogramAnimation.ts`)
- Semi-transparent so page content remains readable
- Pre-allocate array of 150 Particle objects at init
- `active` boolean flag per particle -- no array push/splice
- Reset particle properties on recycle instead of creating new objects
- Pool scan for next inactive slot on spawn

### Claude's Discretion
- Exact sine wave frequencies and phase offsets for caustics -- tune visually
- Particle horizontal oscillation amplitude and frequency
- Canvas opacity / blend mode fine-tuning
- Whether to use a single `useParticleCanvas` hook or split into `useParticles` + `useCaustics`
- Spawn rate distribution (uniform vs clustered)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PART-01 | Particle count scales with vitality (5 sparse at 0.0 -> 150 dense at 1.0) | Object pool with `active` flag; `targetCount = lerp(5, 150, vitality)` controls spawn/despawn rate |
| PART-02 | Particle color shifts from muted brown to teal/magenta based on vitality | Use `computeReefColors(vitality)` -- `.primary` (teal) and `.accent` (magenta) at high vitality; fixed HSL(30, 40%, 45%) at low vitality |
| PART-03 | Particle speed and opacity modulated by vitality score | Speed: `lerp(0.3, 1.5, vitality)` px/frame. Opacity: `lerp(0.2, 0.8, vitality)` as max alpha in life curve |
| PART-04 | Object pool pattern prevents GC pressure at high particle counts | Pre-allocated 150-slot array with `active` boolean; recycle by resetting properties, never `new`/`push`/`splice` |
| CAUS-01 | Procedural caustic light pattern rendered on Canvas 2D background layer | 3-4 overlapping sine waves with varying frequencies rendered via `ctx.fillRect` strips or `ctx.arc` patches with `screen` blend mode |
| CAUS-02 | Caustic intensity modulated by vitality score (invisible at 0, full at 1) | `causticAlpha = vitality > 0.3 ? (vitality - 0.3) / 0.7 * 0.15 : 0` -- ramps from 0.3 threshold to max 0.15 opacity |
| CAUS-03 | Caustics composited with particle canvas via globalCompositeOperation | Set `ctx.globalCompositeOperation = 'screen'` before caustic draw, reset to `'source-over'` before particles |
</phase_requirements>

## Standard Stack

### Core (already installed -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^18.3.1 | Component framework | Already in project |
| Next.js | 14.2.5 | SSR/routing framework | Already in project, dynamic import for canvas |
| Zustand | ^4.5 | Vitality store | Already in project, `getState()` for rAF polling |
| TypeScript | ^5.5.4 | Type safety | Already in project |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS | ^3.4.7 | Utility classes for canvas container | Container positioning only |

### No New Dependencies Required
This phase is pure Canvas 2D + vanilla math. No external particle/animation libraries needed. The existing `useSpectrogramAnimation.ts` pattern plus standard `Math.sin()` provides everything.

**Installation:** None needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
  hooks/
    useBackgroundCanvas.ts    # Single hook: rAF loop, object pool, caustics + particles
  components/
    BackgroundCanvas.tsx      # Thin wrapper: <canvas> element + hook invocation
  lib/
    color-engine.ts           # (existing) computeReefColors for particle colors
  stores/
    vitality-store.ts         # (existing) getState().target for rAF reads
```

### Pattern 1: Single Hook Architecture (Recommended)
**What:** One `useBackgroundCanvas` hook owns the entire rAF loop, object pool, caustic renderer, and particle renderer.
**When to use:** Always for this phase -- splitting into separate hooks adds complexity without benefit since both layers share the same canvas context and frame timing.
**Why not split:** Two hooks would need to coordinate clearing, blend modes, and frame timing. A single hook avoids this entirely.
**Example:**
```typescript
// useBackgroundCanvas.ts
export function useBackgroundCanvas(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  const poolRef = useRef<PoolParticle[]>(createPool(MAX_PARTICLES));
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;
    let width = 0, height = 0;

    // DPR-aware resize (same pattern as useSpectrogramAnimation)
    function resize(w: number, h: number) {
      const dpr = window.devicePixelRatio || 1;
      width = w; height = h;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const ro = new ResizeObserver(entries => {
      for (const e of entries) resize(e.contentRect.width, e.contentRect.height);
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    resize(window.innerWidth, window.innerHeight);

    function animate() {
      const vitality = useVitalityStore.getState().target;
      timeRef.current += 1;

      ctx!.clearRect(0, 0, width, height);

      // Layer 1: Caustics (screen blend)
      drawCaustics(ctx!, width, height, vitality, timeRef.current);

      // Layer 2: Particles (source-over)
      ctx!.globalCompositeOperation = 'source-over';
      updatePool(poolRef.current, vitality, width, height, timeRef.current);
      drawPool(ctx!, poolRef.current);

      rafId = requestAnimationFrame(animate);
    }

    rafId = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(rafId); ro.disconnect(); };
  }, [canvasRef]);
}
```

### Pattern 2: Object Pool with Active Flags
**What:** Pre-allocate a fixed-size typed array of particle objects. Use `active: boolean` to mark live vs available slots. Never allocate or deallocate during animation.
**When to use:** Always for this phase (PART-04 requirement).
**Example:**
```typescript
interface PoolParticle {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  alpha: number;
  maxAlpha: number;
  life: number;
  maxLife: number;
  hue: number;
  saturation: number;
  lightness: number;
}

const MAX_PARTICLES = 150;

function createPool(size: number): PoolParticle[] {
  return Array.from({ length: size }, () => ({
    active: false,
    x: 0, y: 0, vx: 0, vy: 0,
    size: 0, alpha: 0, maxAlpha: 0,
    life: 0, maxLife: 0,
    hue: 0, saturation: 0, lightness: 0,
  }));
}

function spawn(pool: PoolParticle[], vitality: number, width: number, height: number): void {
  const targetCount = Math.round(lerp(5, MAX_PARTICLES, vitality));
  const activeCount = pool.filter(p => p.active).length;
  if (activeCount >= targetCount) return;

  // Find first inactive slot
  for (const p of pool) {
    if (!p.active) {
      resetParticle(p, vitality, width, height);
      return;
    }
  }
}

function resetParticle(p: PoolParticle, vitality: number, w: number, h: number): void {
  p.active = true;
  p.x = Math.random() * w;
  p.y = h * (0.7 + Math.random() * 0.3); // bottom third
  p.vy = -(lerp(0.3, 1.5, vitality));
  p.vx = (Math.random() - 0.5) * 0.3;
  p.size = lerp(2, 6, vitality * Math.random());
  p.maxAlpha = lerp(0.2, 0.8, vitality);
  p.alpha = 0;
  p.life = 0;
  p.maxLife = 120 + Math.random() * 180; // 2-5 sec at 60fps
  // Color: brown at low vitality, teal/magenta mix at high
  if (vitality < 0.3) {
    p.hue = 30; p.saturation = 40; p.lightness = 45;
  } else {
    p.hue = Math.random() < 0.6 ? 175 : 320; // teal or magenta
    p.saturation = lerp(40, 80, vitality);
    p.lightness = lerp(45, 55, vitality);
  }
}
```

### Pattern 3: Caustic Rendering via Overlapping Sine Waves
**What:** 3-4 sine wave patterns with different frequencies and phase offsets create organic light patches. Rendered as semi-transparent bright stripes/circles using `globalCompositeOperation: 'screen'`.
**When to use:** CAUS-01, CAUS-02, CAUS-03.
**Example:**
```typescript
function drawCaustics(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  vitality: number,
  time: number
): void {
  if (vitality <= 0.3) return; // invisible below threshold

  const intensity = (vitality - 0.3) / 0.7; // 0..1 above threshold
  const maxAlpha = 0.15 * intensity;

  ctx.globalCompositeOperation = 'screen';

  // Teal-tinted white: hsl(180, 30%, 80%)
  const cellSize = 40;
  const cols = Math.ceil(w / cellSize);
  const rows = Math.ceil(h / cellSize);

  // Phase shift ~0.5 deg/frame = ~0.00873 rad/frame
  const phase = time * 0.00873;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * cellSize + cellSize / 2;
      const cy = row * cellSize + cellSize / 2;

      // 3 overlapping sine waves with different frequencies
      const v1 = Math.sin(cx * 0.02 + cy * 0.015 + phase);
      const v2 = Math.sin(cx * 0.013 - cy * 0.01 + phase * 1.3);
      const v3 = Math.sin(cx * 0.009 + cy * 0.022 + phase * 0.7);
      const combined = (v1 + v2 + v3) / 3; // -1..1
      const brightness = (combined + 1) / 2; // 0..1

      if (brightness > 0.5) {
        const alpha = (brightness - 0.5) * 2 * maxAlpha;
        ctx.fillStyle = `hsla(180, 30%, 80%, ${alpha})`;
        ctx.fillRect(cx - cellSize / 2, cy - cellSize / 2, cellSize, cellSize);
      }
    }
  }
}
```

### Pattern 4: Canvas Component Mounting
**What:** Mount BackgroundCanvas in the providers/layout level, behind all content.
**When to use:** Always -- it's a global background effect.
**Example:**
```typescript
// BackgroundCanvas.tsx
'use client';

import { useRef } from 'react';
import { useBackgroundCanvas } from '@/hooks/useBackgroundCanvas';

export function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useBackgroundCanvas(canvasRef);

  return (
    <div className="fixed inset-0" style={{ zIndex: -1 }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}

// In providers.tsx -- loaded via next/dynamic
import dynamic from 'next/dynamic';
const BackgroundCanvas = dynamic(
  () => import('@/components/BackgroundCanvas').then(m => m.BackgroundCanvas),
  { ssr: false }
);
// Render: <BackgroundCanvas /> as sibling of children
```

### Anti-Patterns to Avoid
- **Creating canvas context every frame:** Get `ctx` once in useEffect, reuse across frames
- **React state in animation loop:** Never `useState` for particle positions -- refs only
- **Subscribing to Zustand in rAF:** Use `getState()` polling, not `useStore()` subscription
- **Array push/splice in rAF:** Use object pool with active flags instead (PART-04)
- **Multiple canvases for layers:** Single canvas, render caustics then particles sequentially
- **Forgetting DPR scaling:** Without it, canvas appears blurry on retina displays
- **Missing cancelAnimationFrame cleanup:** Causes stacking rAF loops on hot reload

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HSL color math | Custom HSL interpolation | `computeReefColors()` from Phase 1 | Already built, tested, handles stagger thresholds |
| Vitality smoothing | Custom lerp loop | `useVitality()` hook from Phase 1 | Already lerps store target at 60fps with 0.08 speed |
| DPR-aware resize | Custom resize handler | Copy pattern from `useSpectrogramAnimation.ts` | ResizeObserver + `ctx.setTransform(dpr, ...)` already proven |

**Key insight:** Phase 1 built the entire state management and color engine. Phase 2 ONLY consumes `getState().target` and `computeReefColors()` -- it adds zero state management.

## Common Pitfalls

### Pitfall 1: Canvas Context Thrashing
**What goes wrong:** Creating new canvas contexts, or setting `globalCompositeOperation` without resetting it, causing unexpected blend behavior on subsequent frames.
**Why it happens:** Forgetting that canvas state is mutable and persistent across draw calls.
**How to avoid:** Get context once, explicitly set `globalCompositeOperation` before each layer, reset to `'source-over'` after caustics.
**Warning signs:** Particles appearing washed out or overly bright; canvas accumulating brightness over frames.

### Pitfall 2: GC Pauses from Particle Allocation
**What goes wrong:** Using `new Object()` or array `push/splice` in the rAF loop creates garbage. At 150 particles x 60fps, this triggers noticeable GC pauses.
**Why it happens:** Seemingly small allocations compound at animation frame rate.
**How to avoid:** Pre-allocate pool of 150 objects, use `active` flag, reset properties in-place.
**Warning signs:** Periodic frame drops (~100ms gaps) visible in Chrome Performance timeline as "Minor GC" events.

### Pitfall 3: Memory Leak from Stacking rAF Loops
**What goes wrong:** React StrictMode double-invokes useEffect, creating two rAF loops. Hot reload adds more. Over time, CPU usage climbs.
**Why it happens:** Not canceling previous rAF in cleanup, or race condition between setup/teardown.
**How to avoid:** Store `rafId` in local variable, cancel in cleanup return. The existing `useVitality()` hook uses a `runningRef` guard -- follow the same pattern.
**Warning signs:** FPS degrading over time, multiple `animate` calls per frame visible in Performance profiler.

### Pitfall 4: Blurry Canvas on Retina Displays
**What goes wrong:** Canvas renders at CSS pixel resolution, appearing blurry at 2x or 3x DPR.
**Why it happens:** Not scaling canvas buffer dimensions by `devicePixelRatio`.
**How to avoid:** Follow the exact pattern from `useSpectrogramAnimation.ts`: `canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);` -- draw in CSS pixels, buffer in device pixels.
**Warning signs:** Particles look like fuzzy blobs instead of crisp circles.

### Pitfall 5: String Allocation in Hot Loop
**What goes wrong:** Building HSL color strings (`hsla(${h}, ${s}%, ${l}%, ${a})`) 150+ times per frame creates temporary strings that become GC pressure.
**Why it happens:** Canvas 2D fillStyle/strokeStyle only accepts strings (no numeric API).
**How to avoid:** For particles, use a small color cache (e.g., 2-3 pre-computed strings per frame keyed to current vitality band: degraded-brown, teal, magenta). Update cache once per frame when vitality changes, not per-particle. For caustics, pre-compute the base color string once per frame.
**Warning signs:** Sawtooth memory pattern in Chrome Memory timeline.

### Pitfall 6: Caustic Grid Too Fine -> Performance
**What goes wrong:** Using a small cell size (e.g., 5px) for caustic rendering creates thousands of `fillRect` calls per frame.
**Why it happens:** Wanting fine-grained caustic patterns.
**How to avoid:** Use 30-50px cell size. The sine wave math creates smooth organic patterns even at coarser resolution because the frequency parameters control visual smoothness, not the grid resolution. At 1920x1080 with 40px cells, that's ~1300 cells -- well within budget.
**Warning signs:** Frame time exceeding 16ms (visible as <60fps in performance panel).

### Pitfall 7: SSR Crash from Canvas/Window Access
**What goes wrong:** `window.devicePixelRatio` or `document` accessed during SSR causes build failure.
**Why it happens:** Next.js pre-renders on server where browser APIs don't exist.
**How to avoid:** Use `next/dynamic` with `{ ssr: false }` for the BackgroundCanvas component (same pattern as SpectrogramCanvas in experience page). All canvas/window access must be inside `useEffect`.
**Warning signs:** `ReferenceError: window is not defined` during `next build`.

## Code Examples

### Particle Life Curve (from existing codebase)
```typescript
// Source: useSpectrogramAnimation.ts lines 155-163
// Fade in during first 20% of life, full alpha in middle, fade out in last 30%
const lifeProgress = p.life / p.maxLife;
if (lifeProgress < 0.2) {
  p.alpha = (lifeProgress / 0.2) * p.maxAlpha;
} else if (lifeProgress > 0.7) {
  p.alpha = ((1 - lifeProgress) / 0.3) * p.maxAlpha;
} else {
  p.alpha = p.maxAlpha;
}
```

### Horizontal Oscillation (Discretion: recommended values)
```typescript
// Gentle sine-based horizontal drift for organic feel
// Amplitude: 0.3px, frequency tied to particle's y position for variation
p.x += p.vx + Math.sin(time * 0.02 + p.y * 0.01) * 0.3;
```

### Color Selection Per Particle
```typescript
// Use computeReefColors for color-coherent particles
// Cache colors once per frame, sample per-particle
const colors = computeReefColors(vitality);
// At low vitality: all particles use degraded brown
// At high vitality: 60% primary (teal), 40% accent (magenta)
function pickParticleColor(vitality: number): { h: number; s: number; l: number } {
  if (vitality < 0.3) return { h: 30, s: 40, l: 45 }; // muted ochre-brown
  return Math.random() < 0.6
    ? { h: 175, s: lerp(40, 80, vitality), l: lerp(45, 55, vitality) }  // teal
    : { h: 320, s: lerp(40, 75, vitality), l: lerp(45, 55, vitality) }; // magenta
}
```

### Spawn Rate Control
```typescript
// Spawn rate: proportional to gap between active count and target count
// This creates smooth population changes without sudden bursts
const targetCount = Math.round(lerp(5, MAX_PARTICLES, vitality));
let activeCount = 0;
for (const p of pool) if (p.active) activeCount++;

// Spawn 1-3 particles per frame when under target
const deficit = targetCount - activeCount;
const spawnsThisFrame = Math.min(deficit, 3); // cap at 3 per frame for smooth ramp
for (let i = 0; i < spawnsThisFrame; i++) {
  spawnNext(pool, vitality, width, height);
}
```

### Dynamic Import Pattern
```typescript
// Source: experience/page.tsx line 21-24
// Use this exact pattern for BackgroundCanvas
const BackgroundCanvas = dynamic(
  () => import('@/components/BackgroundCanvas').then(m => m.BackgroundCanvas),
  { ssr: false }
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| DOM-element particles | Canvas 2D particles | N/A (Canvas always better at >50 elements) | 10-100x faster than animating DOM nodes |
| Array push/splice | Object pool with active flags | Standard pattern | Eliminates GC pauses in animation loops |
| React state for animation | useRef + rAF loop | React 18+ best practice | Prevents re-render cascade, 60fps achievable |
| Multiple canvas layers | Single canvas, sequential draw | Standard for <1000 elements | Avoids compositor overhead of stacking contexts |
| WebGL for 2D particles | Canvas 2D | N/A for <=150 particles | Canvas 2D is simpler, sufficient, no shader complexity |

**Deprecated/outdated:**
- `canvas.getContext('2d', { alpha: false })`: Only use if canvas is fully opaque. Our canvas must be transparent (content shows through), so DO NOT use this optimization.

## Open Questions

1. **Caustic visual quality vs performance tradeoff**
   - What we know: 40px cells at 1920x1080 = ~1300 fillRect calls/frame, well within budget
   - What's unclear: Whether the visual result looks sufficiently organic at 40px, or needs finer 20px cells (~5200 calls)
   - Recommendation: Start with 40px, tune down if it looks too blocky. Performance profiling will validate.

2. **Canvas stacking with existing SpectrogramCanvas**
   - What we know: SpectrogramCanvas is per-page (experience page only), BackgroundCanvas is global (all pages)
   - What's unclear: Whether both canvases on the experience page causes visual conflict or performance issues
   - Recommendation: BackgroundCanvas uses `z-index: -1` (behind everything), SpectrogramCanvas is already within page content flow. They won't overlap visually since SpectrogramCanvas has its own container. If conflict arises, conditionally hide BackgroundCanvas on `/experience` route.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None currently installed |
| Config file | None -- see Wave 0 |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PART-01 | Particle count scales 5-150 with vitality | unit | Test `spawn()` with vitality 0.0 vs 1.0, count active particles | No -- Wave 0 |
| PART-02 | Particle color shifts brown->teal/magenta | unit | Test `pickParticleColor()` at vitality 0.0, 0.5, 1.0 | No -- Wave 0 |
| PART-03 | Speed/opacity modulated by vitality | unit | Test `resetParticle()` output values at boundary vitalities | No -- Wave 0 |
| PART-04 | Object pool prevents GC | unit | Test pool never grows beyond 150, `active` flags toggle correctly | No -- Wave 0 |
| CAUS-01 | Procedural caustic pattern rendered | manual-only | Visual inspection in browser -- caustic patterns are aesthetic, not numerically verifiable | N/A |
| CAUS-02 | Caustic intensity modulated by vitality | unit | Test `causticAlpha` formula at vitality 0.0, 0.3, 0.5, 1.0 | No -- Wave 0 |
| CAUS-03 | Composited via globalCompositeOperation | manual-only | Visual inspection -- verify `screen` blend creates light-on-dark additive effect | N/A |

### Sampling Rate
- **Per task commit:** Visual inspection via VitalityDebugPanel slider (already exists)
- **Per wave merge:** Full vitality sweep 0.0 -> 1.0 confirming particle + caustic behavior
- **Phase gate:** `next build` succeeds (no SSR errors) + visual sweep at 0.0, 0.3, 0.5, 0.7, 1.0

### Wave 0 Gaps
- [ ] No test framework installed -- pure unit tests for pool logic and math functions would benefit from vitest or jest, but this project has none configured
- [ ] Given project mode (`yolo`, `coarse`), visual validation via the existing VitalityDebugPanel slider is the pragmatic verification method
- [ ] `next build` is the automated gate (catches SSR errors, TypeScript errors)

## Sources

### Primary (HIGH confidence)
- `useSpectrogramAnimation.ts` -- Existing particle system template with Particle interface, rAF loop, DPR handling, life/maxLife pattern
- `vitality-store.ts` -- Zustand store with `getState()` for rAF polling
- `color-engine.ts` -- `computeReefColors()` for particle colors
- `useVitality.ts` -- rAF loop pattern with StrictMode guard
- `providers.tsx` -- Mount point for global effects
- `experience/page.tsx` -- `next/dynamic` SSR-safe pattern for canvas components
- `PITFALLS.md` -- Canvas context thrashing, memory leak from rAF

### Secondary (MEDIUM confidence)
- Canvas 2D API -- Well-documented, stable browser API. `globalCompositeOperation: 'screen'` is universally supported.
- Object pool pattern -- Standard game dev pattern for GC-free particle systems.

### Tertiary (LOW confidence)
- Caustic sine wave frequencies -- The specific frequency/phase values are discretionary and need visual tuning. Starting values provided are reasonable estimates but will need adjustment.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies, all patterns proven in existing codebase
- Architecture: HIGH -- Direct extension of existing `useSpectrogramAnimation` pattern into a global background canvas
- Pitfalls: HIGH -- Drawn from existing PITFALLS.md research + established Canvas 2D best practices
- Caustic tuning: MEDIUM -- Sine wave parameters are educated guesses that need visual iteration

**Research date:** 2026-03-21
**Valid until:** Indefinite -- Canvas 2D API is stable, no fast-moving dependencies
