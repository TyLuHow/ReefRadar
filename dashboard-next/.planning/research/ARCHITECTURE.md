# Architecture Research: Audio-Reactive Bioluminescent UI

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VitalityProvider (React Context)          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ vitality: 0.7│  │ bandEnergy:  │  │ colors:           │ │
│  │ source: audio│  │  shrimp: 0.8 │  │  primary: hsl()   │ │
│  │              │  │  fish: 0.5   │  │  accent: hsl()    │ │
│  │              │  │  grazing: 0.3│  │  bg: hsl()        │ │
│  └──────────────┘  └──────────────┘  └───────────────────┘ │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ CSS Variable │  │  Canvas Renderer  │  │  Component Props  │
│   Writer     │  │  (Particles +     │  │  (Gallery cards,  │
│  (--color-*) │  │   Caustics)       │  │   crossfader)     │
└─────────────┘  └──────────────────┘  └──────────────────┘
```

## Major Components

### 1. VitalityEngine (Core State)
- **What:** React Context + useReducer managing vitality score and derived visual state
- **Inputs:** Crossfader position, ML classification result, audio band energy
- **Outputs:** vitality (0-1), interpolated colors, band energy levels
- **Key pattern:** Lerp/ease vitality changes (never jump), compute colors via HSL math
- **Boundary:** Pure state — no rendering, no DOM/Canvas interaction

### 2. AudioAnalyzer (Audio Pipeline)
- **What:** Hook wrapping Web Audio API AnalyserNode for frequency band decomposition
- **Inputs:** HTMLAudioElement or MediaStream
- **Outputs:** Per-band RMS energy (shrimp, fish, grazing, ambient) at ~30fps
- **Key pattern:** useRef for AnalyserNode, rAF loop for continuous reads, cleanup on unmount
- **Boundary:** Audio only — emits numbers, doesn't know about visuals

### 3. ColorEngine (Interpolation)
- **What:** Pure function module mapping vitality score → HSL color values
- **Inputs:** vitality (0-1), band energy levels
- **Outputs:** Object with interpolated HSL values for all theme tokens
- **Key pattern:** HSL interpolation with non-linear staggering per token
- **Boundary:** Pure math — no side effects, no DOM access

### 4. CSSVariableWriter (DOM Bridge)
- **What:** Effect hook that writes computed colors to CSS custom properties on document.documentElement
- **Inputs:** Color object from ColorEngine
- **Outputs:** CSS custom properties (--reef-primary, --reef-accent, --reef-bg, etc.)
- **Key pattern:** Batched writes inside rAF callback, debounced to ~30fps
- **Boundary:** One-way write to DOM — components read via CSS var()

### 5. ParticleCanvas (Visual Layer)
- **What:** Canvas 2D component rendering particles + optional caustics
- **Inputs:** vitality score, band energy, colors from context
- **Outputs:** Visual overlay on page
- **Key pattern:** useRef for canvas, rAF render loop, object pool for particles
- **Boundary:** Self-contained canvas — doesn't affect DOM layout

### 6. Page Adapters (Per-Page Integration)
- **Compare page:** Crossfader position → vitality source
- **Experience page:** Audio playback + ML result → vitality source
- **Gallery page:** Static vitality per card (category-based, no animation)
- **Dashboard/Analyze:** ML result → vitality source

## Data Flow

```
Audio Source (HTMLAudioElement)
    │
    ▼
AudioAnalyzer ──────► bandEnergy { shrimp, fish, grazing, ambient }
    │
    ▼
VitalityEngine ◄──── Crossfader position (compare page)
    │               ◄──── ML classification result (experience/analyze)
    │
    ├──► vitality (0.0–1.0, lerped)
    │
    ▼
ColorEngine ──────► { primary, accent, bg, surface, glow, particle } as HSL
    │
    ├──► CSSVariableWriter ──► CSS custom properties on :root
    │
    └──► ParticleCanvas ──► Canvas 2D (particles + caustics)
```

## Suggested Build Order

1. **VitalityEngine + ColorEngine** — Core state + color math. No visuals yet, but everything depends on this.
2. **CSSVariableWriter + Tailwind integration** — Wire colors into existing UI. Immediate visual payoff.
3. **ParticleCanvas enhancement** — Upgrade existing particles with vitality response.
4. **AudioAnalyzer band decomposition** — Extend existing AnalyserNode for per-band energy.
5. **Caustic effect layer** — Add to ParticleCanvas.
6. **Page-specific adapters** — Wire vitality sources per page (crossfader, audio, ML result).
7. **Gallery card treatments** — Static vitality hints on sample cards.
8. **Mobile optimization** — Particle reduction, caustic disable, responsive thresholds.

## Integration Points with Existing Code

| Existing Component | Integration |
|-------------------|-------------|
| `experience/page.tsx` spectrogram | Shares AudioContext, reads same AnalyserNode |
| `experience/page.tsx` particle system | Replace/extend with VitalityEngine-driven particles |
| Compare page crossfader | Slider value becomes vitality source |
| `GlassPanel` / `GlassButton` components | Read CSS variables for background/border colors |
| `SampleCard` in gallery | Add static border-glow based on category |
| Tailwind config | Extend with CSS variable references for reef-* colors |
