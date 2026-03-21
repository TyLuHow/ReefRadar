# Roadmap: ReefRadar Bioluminescent UI

## Overview

Transform the ReefRadar dashboard from a static Golden Hour palette into a living, breathing interface where every visual property responds to a vitality score (0.0-1.0). Phase 1 builds the core engine and color interpolation system. Phase 2 adds particle and caustic visual effects. Phase 3 wires audio analysis to drive real-time micro-animations. Phase 4 integrates everything into actual pages with mobile and accessibility polish.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Vitality Engine and Color System** - Core state management, HSL color interpolation, CSS variable pipeline, and performance architecture
- [ ] **Phase 2: Visual Effects** - Particle system vitality response and procedural caustic light patterns
- [ ] **Phase 3: Audio-Reactive System** - Frequency band decomposition driving real-time visual modulation
- [ ] **Phase 4: Page Integration and Polish** - Wire vitality into all pages, mobile optimization, accessibility

## Phase Details

### Phase 1: Vitality Engine and Color System
**Goal**: Users see the entire UI smoothly transition between degraded and healthy color states driven by a single vitality score
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, COLR-01, COLR-02, COLR-03, COLR-04, COLR-05, COLR-06, PERF-01, PERF-02, PERF-03, PERF-04
**Success Criteria** (what must be TRUE):
  1. Setting vitality to 0.0 renders the degraded palette (charcoal-brown, muted grays, warm ochre) and setting to 1.0 renders the bioluminescent palette (teal, magenta, blue, gold) with smooth HSL interpolation at any value between
  2. Color transitions stagger non-linearly -- shrimp-band indicators appear at 0.2, fish at 0.4, complex ecosystem colors at 0.7
  3. CSS custom properties (--reef-primary, --reef-accent, --reef-bg, etc.) update in real time and Tailwind reef-* tokens resolve to them
  4. All animation state lives in refs with rAF-driven updates (no React re-renders), CSS variable writes batched at 30fps, and canvas/audio components use dynamic import with ssr: false
**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md -- Vitality store, color engine, useVitality hook, CSS variable pipeline
- [x] 01-02-PLAN.md -- Tailwind reef-* token integration and visual verification checkpoint

### Phase 2: Visual Effects
**Goal**: Users see vitality-responsive particles and underwater caustic light patterns that make the healthy state visually alive
**Depends on**: Phase 1
**Requirements**: PART-01, PART-02, PART-03, PART-04, CAUS-01, CAUS-02, CAUS-03
**Success Criteria** (what must be TRUE):
  1. Particle count scales from 5 sparse muted-brown particles at vitality 0.0 to 150 dense teal/magenta particles at vitality 1.0, with speed and opacity also modulated
  2. Procedural caustic light patterns appear on the background canvas, invisible at vitality 0.0 and fully visible at 1.0, composited with the particle layer
  3. Particle system maintains 60fps with no GC pauses (object pool pattern) at maximum particle count
**Plans:** 2 plans

Plans:
- [x] 02-01-PLAN.md -- Object pool particle system with vitality-driven count, color, speed, opacity on background canvas
- [x] 02-02-PLAN.md -- Procedural caustic sine-wave layer composited behind particles with screen blend

### Phase 3: Audio-Reactive System
**Goal**: Live audio playback drives real-time visual micro-animations through frequency band analysis
**Depends on**: Phase 2
**Requirements**: AUDI-01, AUDI-02, AUDI-03, AUDI-04
**Success Criteria** (what must be TRUE):
  1. Audio playback produces per-band RMS energy values (shrimp 2-20kHz, fish 200-2000Hz, grazing 1-4kHz, ambient <200Hz) at ~30fps
  2. Band energy triggers visible micro-animations -- particle bursts on shrimp snaps, caustic shimmer on fish calls
  3. Toggling a frequency band filter on/off illuminates or dims the corresponding visual layer in real time
**Plans:** 1/2 plans executed

Plans:
- [x] 03-01-PLAN.md -- Band energy extraction pipeline: store extension, FFT bin slicing, useAudioVisualBridge hook
- [ ] 03-02-PLAN.md -- Visual modulation: shrimp bursts, fish caustic shimmer, grazing highlights, ambient dimming, band toggle response

### Phase 4: Page Integration and Polish
**Goal**: Every page uses vitality-driven visuals with its appropriate input source, and the experience works on mobile
**Depends on**: Phase 3
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04, PERF-05, PERF-06, MOBL-01, MOBL-02, MOBL-03
**Success Criteria** (what must be TRUE):
  1. Compare page crossfader position drives vitality score with a gradient track, glowing thumb, and transitioning labels
  2. Experience page audio playback and ML classification results drive vitality score
  3. Gallery sample cards show static vitality hints (teal glow for healthy recordings, muted treatment for degraded)
  4. On viewports under 768px, particle count caps at 50, caustics are disabled, and crossfader is touch-friendly
  5. Users with prefers-reduced-motion see instant color changes with no particles or caustics; nav bar and data labels maintain fixed high-contrast colors at all vitality levels

**Plans**: TBD

Plans:
- [ ] 04-01: Page adapters (crossfader, experience, gallery) and crossfader enhancement
- [ ] 04-02: Mobile optimization and accessibility

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Vitality Engine and Color System | 2/2 | Complete | 2026-03-20 |
| 2. Visual Effects | 2/2 | Complete | 2026-03-21 |
| 3. Audio-Reactive System | 1/2 | In Progress|  |
| 4. Page Integration and Polish | 0/2 | Not started | - |
