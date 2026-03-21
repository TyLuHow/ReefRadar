# Requirements: ReefRadar Bioluminescent UI

**Defined:** 2026-03-20
**Core Value:** The visual gap between degraded and healthy reef states must be so striking that users FEEL something about reef conservation without reading a single word.

## v1 Requirements

### Core State

- [x] **CORE-01**: Vitality score (0.0-1.0) drives all visual properties across the application
- [x] **CORE-02**: Vitality score transitions are lerped/eased over 300ms+ (never instant jumps)
- [x] **CORE-03**: Vitality score accepts multiple input sources (crossfader, ML classification, audio energy)
- [x] **CORE-04**: VitalityProvider React Context exposes score and derived colors to all pages

### Color System

- [x] **COLR-01**: Bioluminescent palette defined (teal, magenta, blue, gold) for healthy state (vitality=1.0)
- [x] **COLR-02**: Degraded palette defined (charcoal-brown, muted grays, warm ochre) for vitality=0.0
- [x] **COLR-03**: HSL interpolation between degraded and healthy endpoints keyed to vitality score
- [x] **COLR-04**: CSS custom properties (--reef-primary, --reef-accent, --reef-bg, etc.) updated via CSSVariableWriter
- [x] **COLR-05**: Tailwind config extended with CSS variable references for reef-* color tokens
- [x] **COLR-06**: Non-linear staggered transitions -- shrimp indicators at 0.2, fish at 0.4, complex at 0.7

### Particle System

- [x] **PART-01**: Particle count scales with vitality (5 sparse at 0.0 -> 150 dense at 1.0)
- [x] **PART-02**: Particle color shifts from muted brown to teal/magenta based on vitality
- [x] **PART-03**: Particle speed and opacity modulated by vitality score
- [x] **PART-04**: Object pool pattern prevents GC pressure at high particle counts

### Audio Analysis

- [x] **AUDI-01**: Frequency band decomposition from AnalyserNode FFT data (shrimp 2-20kHz, fish 200-2000Hz, grazing 1-4kHz, ambient <200Hz)
- [x] **AUDI-02**: Per-band RMS energy values emitted at ~30fps
- [x] **AUDI-03**: Band energy drives real-time micro-animations (particle bursts, caustic shimmer)
- [x] **AUDI-04**: Band filter toggles illuminate/dim corresponding visual layers

### Caustic Effects

- [x] **CAUS-01**: Procedural caustic light pattern rendered on Canvas 2D background layer
- [x] **CAUS-02**: Caustic intensity modulated by vitality score (invisible at 0, full at 1)
- [x] **CAUS-03**: Caustics composited with particle canvas via globalCompositeOperation

### Page Integration

- [ ] **PAGE-01**: Compare page crossfader position drives vitality score
- [ ] **PAGE-02**: Crossfader has gradient track, glowing thumb, transitioning labels
- [ ] **PAGE-03**: Experience page audio playback + ML result drive vitality score
- [ ] **PAGE-04**: Gallery sample cards show static vitality hints (teal glow healthy, muted degraded)

### Performance & Accessibility

- [x] **PERF-01**: Visual updates run at 60fps via requestAnimationFrame (not React render cycle)
- [x] **PERF-02**: Animation state stored in refs, not React state
- [x] **PERF-03**: CSS variable updates batched at 30fps in rAF callback
- [x] **PERF-04**: All canvas/audio components use dynamic import with { ssr: false }
- [ ] **PERF-05**: `prefers-reduced-motion` respected -- disable particles and caustics, instant color changes
- [ ] **PERF-06**: Nav bar and data labels use fixed high-contrast colors (not interpolated)

### Mobile

- [ ] **MOBL-01**: Particle count reduced to max 50 on viewports < 768px
- [ ] **MOBL-02**: Caustic effects disabled on viewports < 768px
- [ ] **MOBL-03**: Touch-friendly crossfader with touch-action: none

## v2 Requirements

### Advanced Visuals

- **ADV-01**: Spectrogram color mapping influenced by vitality score
- **ADV-02**: Page transition animations themed by current vitality state
- **ADV-03**: Loading states with vitality-appropriate skeleton colors

### Extended Pages

- **EXT-01**: Dashboard/analyze results page vitality treatment
- **EXT-02**: About page with static showcase of vitality range

## Out of Scope

| Feature | Reason |
|---------|--------|
| WebGL/3D particle effects | Canvas 2D sufficient for <=150 particles; WebGL adds complexity |
| Map view bioluminescence | deck.gl has separate rendering pipeline |
| Audio synthesis | Playback only, no generation |
| Theme toggle (dark/light) | Continuous transformation, not binary toggle |
| Full-screen immersive mode | Experience page already serves this role |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 1 | Complete |
| CORE-02 | Phase 1 | Complete |
| CORE-03 | Phase 1 | Complete |
| CORE-04 | Phase 1 | Complete |
| COLR-01 | Phase 1 | Complete |
| COLR-02 | Phase 1 | Complete |
| COLR-03 | Phase 1 | Complete |
| COLR-04 | Phase 1 | Complete |
| COLR-05 | Phase 1 | Complete |
| COLR-06 | Phase 1 | Complete |
| PERF-01 | Phase 1 | Complete |
| PERF-02 | Phase 1 | Complete |
| PERF-03 | Phase 1 | Complete |
| PERF-04 | Phase 1 | Complete |
| PART-01 | Phase 2 | Complete |
| PART-02 | Phase 2 | Complete |
| PART-03 | Phase 2 | Complete |
| PART-04 | Phase 2 | Complete |
| CAUS-01 | Phase 2 | Complete |
| CAUS-02 | Phase 2 | Complete |
| CAUS-03 | Phase 2 | Complete |
| AUDI-01 | Phase 3 | Complete |
| AUDI-02 | Phase 3 | Complete |
| AUDI-03 | Phase 3 | Complete |
| AUDI-04 | Phase 3 | Complete |
| PAGE-01 | Phase 4 | Pending |
| PAGE-02 | Phase 4 | Pending |
| PAGE-03 | Phase 4 | Pending |
| PAGE-04 | Phase 4 | Pending |
| PERF-05 | Phase 4 | Pending |
| PERF-06 | Phase 4 | Pending |
| MOBL-01 | Phase 4 | Pending |
| MOBL-02 | Phase 4 | Pending |
| MOBL-03 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after roadmap creation*
