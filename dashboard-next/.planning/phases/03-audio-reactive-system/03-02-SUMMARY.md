---
phase: 03-audio-reactive-system
plan: 02
subsystem: ui
tags: [canvas-2d, particles, caustics, audio-reactive, band-energy, zustand]

# Dependency graph
requires:
  - phase: 03-audio-reactive-system-01
    provides: bandEnergy and activeBands slices in vitality store, useAudioVisualBridge hook
  - phase: 02-visual-effects
    provides: useBackgroundCanvas particle/caustic system, vitality store
provides:
  - Audio-reactive particle bursts (shrimp teal flashes)
  - Fish-energy caustic shimmer speed modulation
  - Grazing gold highlight particles
  - Ambient noise background dimming
  - Band toggle visual response (20% opacity fade, caustic freeze)
affects: [04-page-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [band-tagged particles with pool slot preference, per-frame store read for bandEnergy + activeBands, fishRate caustic phase multiplier]

key-files:
  created: []
  modified:
    - src/hooks/useBackgroundCanvas.ts

key-decisions:
  - "Pool expanded to 200 (from 150) with slots 150-199 preferred for audio-reactive particles to avoid starving vitality particles"
  - "Shrimp burst cooldown of 12 frames (~200ms) prevents pool exhaustion from continuous high shrimp energy"
  - "Fish caustic rate uses 0.01 multiplier when OFF (near-frozen, not fully static) for subtle visual presence"
  - "Ambient dimming max alpha capped at ~0.15 to avoid obscuring particles"

patterns-established:
  - "Band-tagged particles: PoolParticle.band field tags source band for toggle-aware rendering"
  - "Audio slot preference: burst/highlight spawns search 150-199 first, fall back to 0-149"
  - "Single getState() call per frame for all store reads (vitality + bandEnergy + activeBands)"

requirements-completed: [AUDI-03, AUDI-04]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 03 Plan 02: Audio-Reactive Visual Modulation Summary

**4-band audio-reactive canvas with shrimp teal bursts, fish caustic shimmer, grazing gold highlights, ambient dimming, and band toggle opacity/freeze response**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-21T06:37:04Z
- **Completed:** 2026-03-21T06:39:25Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Wired bandEnergy and activeBands from vitality store into useBackgroundCanvas animate loop
- Implemented 4 distinct visual behaviors: shrimp burst particles (teal), fish caustic speed modulation, grazing gold highlights, ambient background dimming
- Added band toggle response: particles from toggled-off bands render at 20% opacity, fish toggle freezes caustic shimmer

## Task Commits

Each task was committed atomically:

1. **Task 1: Add audio-reactive visual modulation to useBackgroundCanvas** - `641b62d` (feat)
2. **Task 2: Verify audio-reactive visual system** - Auto-approved (checkpoint:human-verify in auto-mode)

## Files Created/Modified
- `src/hooks/useBackgroundCanvas.ts` - Added band field to PoolParticle, expanded pool to 200, shrimp burst spawning with cooldown, grazing gold highlights, ambient dimming overlay, fish caustic phase modulation, band toggle opacity dimming

## Decisions Made
- Pool expanded to 200 with 150-199 slots preferred for audio-reactive particles -- prevents vitality particle starvation (Pitfall 5 from research)
- Shrimp burst cooldown 12 frames to prevent pool exhaustion from continuous high-energy shrimp recordings
- Fish caustic rate 0.01 when OFF (not 0) so caustics remain subtly visible but appear frozen
- Ambient dimming applies after clearRect as an overlay, before particles/caustics, so it dims all layers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 audio-reactive visual behaviors are implemented and respond to store values
- Band toggle visual response is instant (within 1 rAF frame)
- When no audio plays, bandEnergy defaults to zeros and canvas behaves identically to pre-audio baseline
- Ready for Phase 04 page integration

## Self-Check: PASSED

- FOUND: src/hooks/useBackgroundCanvas.ts (modified)
- FOUND: .planning/phases/03-audio-reactive-system/03-02-SUMMARY.md
- FOUND: commit 641b62d (Task 1)

---
*Phase: 03-audio-reactive-system*
*Completed: 2026-03-21*
