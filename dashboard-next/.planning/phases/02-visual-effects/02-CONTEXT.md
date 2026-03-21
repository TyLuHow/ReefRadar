# Phase 2: Visual Effects - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Add vitality-responsive Canvas 2D particles and procedural caustic light patterns. Particles scale from 5 sparse muted-brown at vitality 0.0 to 150 dense teal/magenta at 1.0. Caustics are invisible at 0.0 and fully visible at 1.0. Both composited on a single background canvas. Object pool pattern for GC-free particle management. No audio analysis, no page-specific wiring — just the visual layer consuming the vitality store from Phase 1.

</domain>

<decisions>
## Implementation Decisions

### Particle Behavior
- Gentle upward drift (like rising bubbles/plankton) with slight horizontal oscillation — not random Brownian motion
- Spawn from bottom third of canvas, drift upward, fade out near top
- Life/maxLife decay pattern — reuse approach from existing `useSpectrogramAnimation.ts`
- At vitality 0.0: 5 particles, muted brown (~ochre), slow drift, low opacity (0.2-0.4)
- At vitality 1.0: 150 particles, teal/magenta mix (from reef colors), faster drift, higher opacity (0.5-0.8)
- Particle size: 2-6px radius, slightly larger at higher vitality
- Speed scales linearly with vitality: 0.3px/frame (degraded) to 1.5px/frame (healthy)

### Caustic Light Style
- Soft organic overlapping sine waves — not sharp Voronoi cells
- 3-4 overlapping sine patterns with different frequencies and phase offsets
- Color: teal-tinted white at high vitality, invisible at 0.0
- Rendered with low opacity (max 0.15 at vitality 1.0) and `globalCompositeOperation: 'screen'`
- Slow animation (phase shift ~0.5 deg/frame) for gentle underwater shimmer
- Pattern covers full canvas area but only visible when vitality > 0.3

### Canvas Layering
- Single shared canvas behind all page content (z-index behind main content)
- Particles and caustics rendered on same canvas in single rAF loop: caustics first (background), particles on top
- Canvas sized to viewport (`100vw x 100vh`), fixed position
- DPR-aware sizing (follow existing pattern from `useSpectrogramAnimation.ts`)
- Semi-transparent so page content remains readable

### Object Pool
- Pre-allocate array of 150 Particle objects at init
- `active` boolean flag per particle — no array push/splice
- Reset particle properties on recycle instead of creating new objects
- Pool scan for next inactive slot on spawn

### Claude's Discretion
- Exact sine wave frequencies and phase offsets for caustics — tune visually
- Particle horizontal oscillation amplitude and frequency
- Canvas opacity / blend mode fine-tuning
- Whether to use a single `useParticleCanvas` hook or split into `useParticles` + `useCaustics`
- Spawn rate distribution (uniform vs clustered)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Particle System
- `src/components/spectrogram/useSpectrogramAnimation.ts` — Existing particle system with Particle interface, life/maxLife decay, DPR-aware canvas sizing, rAF loop. Direct template for Phase 2 particles.

### Vitality System (Phase 1 outputs)
- `src/stores/vitality-store.ts` — Zustand store with `target`, `source`, `setVitality`. Read via `getState()` in rAF loops.
- `src/lib/color-engine.ts` — `computeReefColors(vitality)` returns 8 HSL color strings. Use for particle colors.
- `src/hooks/useVitality.ts` — rAF animation loop pattern, 30fps CSS write throttle, ref-based state. Follow same conventions.

### Research
- `.planning/research/ARCHITECTURE.md` — ParticleCanvas component architecture, data flow diagram
- `.planning/research/PITFALLS.md` — Canvas context thrashing (#2), memory leaks from animation loops (#6)

### Project Spec
- `prompts/055-bioluminescent-ui-system.md` — Full bioluminescent UI spec with particle and caustic details

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useSpectrogramAnimation.ts`: Particle interface (`x, y, size, color, alpha, vx, vy, life, maxLife`), `lerp()` helper, DPR-aware canvas resize, rAF loop with `cancelAnimationFrame` cleanup — direct template
- `color-engine.ts`: `computeReefColors()` provides vitality-driven colors for particle tinting
- `vitality-store.ts`: `getState().target` for polling vitality in rAF without React subscriptions

### Established Patterns
- Ref-based animation state (particlesRef, timeRef, amplitudesRef) — Phase 1 reinforced this
- `useEffect` cleanup with `cancelAnimationFrame(rafId)` — mandatory
- DPR handling: `canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr)` — existing pattern
- Dynamic import with `{ ssr: false }` for canvas components — PERF-04 pattern from Phase 1

### Integration Points
- New canvas component mounts in layout or page wrapper — behind all content via CSS `position: fixed; z-index: -1`
- Reads vitality from store via `useVitalityStore.getState()` in rAF loop (no React subscription)
- Colors from `computeReefColors()` or directly from `--reef-*` CSS variables

</code_context>

<specifics>
## Specific Ideas

- Particles should feel like bioluminescent plankton rising through water — organic, not mechanical
- Caustics should evoke being underwater looking up at sunlight refracting through waves
- The effect at full vitality should be immersive but not distracting from content — subtle enough to read over
- At degraded state, the canvas should be nearly invisible (just 5 faint drifting specks)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-visual-effects*
*Context gathered: 2026-03-21*
