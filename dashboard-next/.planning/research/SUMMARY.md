# Research Summary: Adaptive Bioluminescent UI System

## Key Findings

### Stack
- **Zero new dependencies required.** Everything builds on existing Next.js 14, React 18, Canvas 2D, Web Audio API, Tailwind CSS, Framer Motion.
- HSL color interpolation is pure math (~20 lines). No color library needed.
- Extend existing AnalyserNode for frequency band decomposition. No audio library needed.
- Procedural caustics via overlapping sine waves on Canvas 2D. ~50 lines of render code.
- Custom `useAnimationFrame` hook wraps rAF with proper cleanup.

### Table Stakes
- **Vitality score system** (0.0–1.0) is the foundation — everything else derives from it.
- **HSL color interpolation** between degraded/healthy palettes via CSS custom properties.
- **Particle system vitality response** — extend existing Canvas 2D particles.
- **Crossfader visual enhancement** — gradient track + glow thumb.
- **Mobile optimization** — reduced particles, no caustics on <768px.

### Differentiators
- **Frequency band signature colors** (shrimp=teal, fish=magenta, grazing=gold) — the "wow" factor.
- **Audio-reactive real-time modulation** — live audio drives micro-animations.
- **Non-linear staggered transitions** — biologically accurate "ecosystem waking up" sequence.
- **Procedural caustic effects** — underwater light patterns modulated by vitality.

### Critical Pitfalls
1. **React re-renders at 60fps** — use refs, not state, for animation values
2. **SSR conflicts** — dynamic imports with `{ ssr: false }` for all canvas/audio
3. **HSL hue direction** — test at 50% vitality to catch ugly intermediates
4. **Memory leaks** — cancel rAF and close AudioContext on unmount
5. **Accessibility** — lerp over 300ms+, respect `prefers-reduced-motion`, fixed contrast on text
6. **CSS variable batching** — limit to ~10 variables, update at 30fps max

### Recommended Build Order
1. VitalityEngine + ColorEngine (core state + math)
2. CSSVariableWriter + Tailwind integration (immediate visual payoff)
3. ParticleCanvas enhancement (vitality-driven particles)
4. AudioAnalyzer band decomposition (per-band energy)
5. Caustic effect layer
6. Page-specific adapters (crossfader, audio, ML)
7. Gallery card treatments
8. Mobile optimization + accessibility audit

### Architecture
- **VitalityProvider** — React Context exposing vitality score and derived colors
- **AudioAnalyzer** — Hook wrapping AnalyserNode for band decomposition
- **ColorEngine** — Pure function module: vitality → HSL colors
- **CSSVariableWriter** — Effect hook writing to :root custom properties
- **ParticleCanvas** — Canvas 2D overlay with particles + caustics
- **Page Adapters** — Per-page vitality source wiring

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Performance below 60fps | HIGH | Refs over state, batched CSS writes, rAF-only rendering |
| SSR crashes | HIGH | Dynamic imports, window guards — already established pattern |
| Ugly mid-transition colors | MEDIUM | HSL interpolation testing at 25/50/75% |
| Mobile unusable | MEDIUM | Feature detection, reduced particle budget |
| Accessibility violations | MEDIUM | prefers-reduced-motion, fixed contrast text |
| Scope creep into WebGL | LOW | Explicit constraint: Canvas 2D only |
