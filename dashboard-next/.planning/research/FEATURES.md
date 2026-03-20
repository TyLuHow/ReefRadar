# Features Research: Audio-Reactive Bioluminescent UI

## Table Stakes (Must have or the effect falls flat)

### Vitality Score State System
- **Complexity:** Low
- Central 0.0–1.0 float driving all visual properties
- Sources: crossfader position, ML classification result, audio energy level
- Must be smooth (lerped/eased), not jumpy
- **Dependencies:** None — foundational

### Color Palette Interpolation
- **Complexity:** Medium
- Two endpoint palettes: degraded (warm ochre/charcoal) ↔ healthy (teal/magenta/blue bioluminescence)
- HSL interpolation between endpoints keyed to vitality score
- Applied via CSS custom properties (--color-primary, --color-accent, --color-bg, etc.)
- **Dependencies:** Vitality score system

### Particle System Vitality Response
- **Complexity:** Medium
- Particle count scales with vitality (5 sparse → 150 dense)
- Particle color shifts from muted brown → teal/magenta
- Particle speed and opacity modulated by vitality
- **Dependencies:** Vitality score system, color palette

### Crossfader Visual Enhancement
- **Complexity:** Low
- Gradient track reflecting current position
- Thumb glow color matching vitality state
- Labels transitioning ("Degraded" ↔ "Healthy")
- **Dependencies:** Vitality score system, color palette

### Mobile Optimization
- **Complexity:** Low
- Reduced particle count (<768px → max 50)
- Disable caustics on mobile
- Touch-friendly crossfader
- **Dependencies:** All visual features must have mobile fallbacks

## Differentiators (What makes this special)

### Frequency Band Signature Colors
- **Complexity:** High
- Each frequency band gets a signature color (shrimp=teal, fish=magenta, grazing=gold, noise=red-brown)
- Band filter toggles illuminate/dim corresponding visual layers
- Per-band RMS energy modulates visual intensity in real time
- **Dependencies:** Audio analysis pipeline, vitality score, color palette

### Procedural Caustic Light Effects
- **Complexity:** Medium
- Underwater light caustic pattern on background
- Intensity modulated by vitality score (invisible at 0, full at 1)
- Procedurally generated via overlapping sine waves on Canvas 2D
- **Dependencies:** Vitality score system

### Audio-Reactive Real-Time Modulation
- **Complexity:** High
- Live audio energy drives micro-animations (particle bursts on transients, caustic shimmer on sustained sounds)
- Per-band analysis maps to specific visual properties
- Smooth interpolation prevents visual noise
- **Dependencies:** Audio analysis pipeline, particle system, caustic system

### Non-Linear Staggered Transitions
- **Complexity:** Medium
- Biologically accurate: shrimp indicators appear first (vitality 0.2), then fish (0.4), then complex behaviors (0.7)
- Creates perception of ecosystem "waking up" as vitality increases
- **Dependencies:** Vitality score system, frequency band system

### Gallery Card Static Vitality Hints
- **Complexity:** Low
- Sample cards show category-appropriate glow (teal border for healthy, muted for degraded)
- Subtle, not animated — just color treatment
- **Dependencies:** Color palette

## Anti-Features (Do NOT build)

| Feature | Why Not |
|---------|---------|
| WebGL/3D effects | Complexity explosion for marginal visual gain over Canvas 2D |
| Audio synthesis | We play recordings, not generate sound |
| Theme toggle (dark/light) | This is continuous transformation, not binary toggle |
| Map view bioluminescence | deck.gl has its own rendering pipeline — different project |
| Full-screen immersive mode | Scope creep — experience page already serves this role |
| Preset "scenes" | The data drives the visuals, not user-selected presets |
