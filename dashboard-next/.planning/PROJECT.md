# ReefRadar — Adaptive Bioluminescent UI System

## What This Is

An adaptive visual transformation system for the ReefRadar Next.js dashboard that makes the UI respond to reef health data in real time. The interface transitions between a muted, lifeless degraded state and a vibrant bioluminescent healthy state — driven by audio content, crossfader position, frequency band filters, and ML classification results. The UI doesn't illustrate the science — it IS the science.

## Core Value

The visual gap between degraded and healthy reef states must be so striking that users FEEL something about reef conservation without reading a single word. Drag the slider from degraded to healthy and elicit a "whoa."

## Requirements

### Validated

- ✓ Next.js 14 App Router dashboard with experience, compare, gallery, map pages — existing
- ✓ Sample Audio Gallery with curated reef recordings from S3 — existing
- ✓ Audio playback via HTML5 Audio and Web Audio API AnalyserNode — existing
- ✓ Crossfader slider on compare page between healthy/degraded — existing
- ✓ Spectrogram visualization (Canvas-based) — existing
- ✓ Particle system on experience page — existing
- ✓ ML classification pipeline (healthy/degraded/restored_early/restored_mid) — existing
- ✓ Golden Hour color palette (warm ochre, dusty rose, muted browns on dark charcoal) — existing

### Active

- [ ] Vitality score state system (0.0–1.0) driving all visual properties
- [ ] Bioluminescent color palette (teal, magenta, blue, gold) for healthy state
- [ ] Degraded color palette (charcoal-brown, muted grays) repurposing current Golden Hour
- [ ] HSL color interpolation between degraded and healthy endpoints
- [ ] Non-linear staggered transitions (shrimp first → fish → complex behaviors)
- [ ] Particle system responding to vitality score (5 sparse → 150 dense, color shift)
- [ ] Frequency band signature colors (shrimp=teal, fish=magenta, grazing=gold, noise=red-brown)
- [ ] Caustic light effect on background (procedural, vitality-modulated)
- [ ] Audio-reactive real-time modulation from per-band RMS energy
- [ ] Band filter ↔ visual layer coupling (toggle bands illuminate/dim visual layers)
- [ ] Crossfader slider visual enhancement (gradient track, thumb glow, transitioning labels)
- [ ] Sample gallery cards with static vitality hints (teal glow for healthy, muted for degraded)
- [ ] Mobile optimization (reduced particles, no caustics on <768px)

### Out of Scope

- Full bioluminescent treatment on deck.gl map view — complexity, different rendering pipeline
- Theme toggle / dark mode switch — this is continuous real-time transformation, not a toggle
- Audio synthesis or generation — playback only
- WebGL particle system — Canvas 2D sufficient for target particle counts
- 3D effects or WebXR — 2D canvas overlays only

## Context

- **Existing codebase:** Next.js 14 dashboard at `dashboard-next/` with Tailwind CSS, Framer Motion, dynamic imports
- **Current palette:** Golden Hour (warm ochre, dusty rose, muted browns) — becomes the degraded state
- **Audio infrastructure:** Web Audio API AnalyserNode already in use for spectrogram, can extend for band analysis
- **Inspiration:** UV/fluorescence reef photography where coral pigments glow (GFP green, red fluorescent protein, dinoflagellate bioluminescence)
- **Performance target:** 60fps visual updates via requestAnimationFrame, debounced audio analysis at ~30fps
- **Key pages:** Compare (crossfader), Experience (immersive spectrogram), Gallery (landing), Dashboard/Analyze (results)
- **CSS variables:** Already using custom properties for theming — extend for vitality-driven interpolation

## Constraints

- **Tech stack**: Next.js 14, React, Tailwind CSS, Canvas 2D — no WebGL required
- **Performance**: requestAnimationFrame for visuals, not React render cycle; Canvas for particles, not DOM
- **Accessibility**: Data labels and numbers must stay legible at all vitality levels; nav bar stays consistent
- **Mobile**: Reduce particle count and disable caustics on screens < 768px
- **Aesthetics**: Degraded state must be beautiful in its emptiness (Blade Runner 2049 desert), not "error state"

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Golden Hour palette = degraded state | Already looks lifeless; lean into it rather than creating a third state | — Pending |
| HSL interpolation over RGB | RGB creates muddy grays in middle transitions; HSL preserves chromaticity | — Pending |
| Canvas 2D for particles over WebGL | Sufficient for 150 particles; simpler, better browser support | — Pending |
| Procedural caustics over pre-rendered | More responsive to vitality score, lower bandwidth, single canvas layer | — Pending |
| Non-linear staggered transitions | Matches biology (shrimp return first, then fish, then complex behaviors) | — Pending |

---
*Last updated: 2026-03-07 after initialization*
