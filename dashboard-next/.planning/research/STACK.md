# Stack Research: Audio-Reactive Bioluminescent UI

## Core Stack (Already In Place)

| Technology | Version | Role | Confidence |
|-----------|---------|------|------------|
| Next.js | 14.x | App Router, SSR/CSR | HIGH — already deployed |
| React | 18.x | Component framework | HIGH — already deployed |
| Tailwind CSS | 3.x | Utility-first styling | HIGH — already deployed |
| Framer Motion | 11.x | Page transitions, animations | HIGH — already in use |
| Web Audio API | Native | Audio analysis (AnalyserNode) | HIGH — already in use for spectrogram |
| Canvas 2D | Native | Particle system, spectrogram | HIGH — already in use |

## Additions Needed

### Color Interpolation
- **No library needed.** HSL interpolation is straightforward math: interpolate H, S, L independently.
- CSS `color-mix()` has ~95% browser support (2025) but CSS custom properties + JS calculation gives more control.
- **Recommendation:** Pure JS HSL math + CSS custom properties. No library overhead. **Confidence: HIGH**

### Audio Frequency Band Analysis
- **No library needed.** Web Audio API `AnalyserNode.getByteFrequencyData()` returns FFT bins directly.
- Map bins to frequency bands: shrimp (2-20kHz), fish (200-2000Hz), grazing (1-4kHz), ambient noise (<200Hz).
- FFT size 2048 at 32kHz sample rate → ~15.6 Hz per bin. Sufficient resolution.
- **Recommendation:** Extend existing AnalyserNode setup. **Confidence: HIGH**

### Procedural Caustics
- **No library needed.** Classic Voronoi-distance or sine-wave overlay on Canvas 2D.
- Pattern: multiple overlapping sine waves with offset phases, modulated by vitality score.
- Performance: single canvas layer composited with `globalCompositeOperation: 'screen'`.
- **Recommendation:** Custom Canvas 2D implementation. ~50 lines of render code. **Confidence: HIGH**

### Particle System
- **No library needed.** Existing particle system on experience page can be extended.
- Scale particle count (5→150), color, speed, and opacity based on vitality score.
- Object pool pattern to avoid GC pressure at high particle counts.
- **Recommendation:** Extend existing Canvas 2D particle system. **Confidence: HIGH**

### requestAnimationFrame in React
- Pattern: `useRef` for animation frame ID, `useEffect` cleanup to cancel on unmount.
- Never drive animations through React state — use refs for mutable animation state, write directly to canvas/CSS variables.
- **Recommendation:** Custom `useAnimationFrame` hook wrapping rAF. **Confidence: HIGH**

## What NOT to Use

| Library | Why Not |
|---------|---------|
| Three.js / WebGL | Overkill for 2D particles + caustics. Adds ~500KB. Canvas 2D sufficient for ≤150 particles |
| Tone.js | Full audio synthesis library — we only need analysis, not generation |
| p5.js | Creative coding framework — unnecessary abstraction over Canvas 2D we already use |
| D3.js | Data viz library — wrong tool for real-time visual effects |
| GSAP | Animation library — Framer Motion already handles React animations; rAF handles canvas |
| chroma.js | Color manipulation — HSL math is trivial, no need for 15KB library |

## Performance Budget

- **Visual updates:** 60fps via requestAnimationFrame (~16.6ms per frame)
- **Audio analysis:** ~30fps (every other frame) — debounced AnalyserNode reads
- **CSS variable updates:** Batched with rAF, not per-component
- **Particle budget:** 150 max desktop, 50 max mobile (<768px)
- **Canvas layers:** Max 2 (particles + caustics), composited
