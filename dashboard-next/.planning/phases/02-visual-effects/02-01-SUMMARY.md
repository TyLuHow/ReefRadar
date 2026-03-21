---
phase: 02-visual-effects
plan: 01
subsystem: ui
tags: [canvas, particles, animation, rAF, object-pool, zustand]

# Dependency graph
requires:
  - phase: 01-vitality-engine
    provides: "useVitalityStore with target value, useVitality rAF pattern"
provides:
  - "useBackgroundCanvas hook with 150-slot object pool particle system"
  - "BackgroundCanvas component mounted globally in Providers"
  - "Vitality-driven particle count, color, speed, and opacity"
affects: [02-02-caustics, 03-audio-reactive, 04-page-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [object-pool-particles, DPR-aware-canvas, dynamic-import-ssr-false]

key-files:
  created:
    - src/hooks/useBackgroundCanvas.ts
    - src/components/BackgroundCanvas.tsx
  modified:
    - src/app/providers.tsx

key-decisions:
  - "Direct HSL values in particle system instead of computeReefColors (avoids computing 8 tokens per frame)"
  - "Alpha bucketed to nearest 0.05 to reduce unique gradient color strings"
  - "3 spawns per frame cap for smooth particle ramp-up instead of instant batch"

patterns-established:
  - "Object pool pattern: pre-allocate array, toggle active flags, no push/splice"
  - "Background canvas mount: dynamic import in providers.tsx with ssr:false, fixed inset-0 z-index -1"

requirements-completed: [PART-01, PART-02, PART-03, PART-04]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 02 Plan 01: Background Particle System Summary

**Object pool particle system (150 slots, zero GC) with vitality-driven count/color/speed on full-viewport background canvas**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T03:58:07Z
- **Completed:** 2026-03-21T04:01:07Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Pre-allocated 150-particle object pool with active flag toggling (no push/splice) for zero GC pressure
- Vitality-driven particle behavior: count 5-150, speed 0.3-1.5, opacity 0.2-0.8, color ochre-brown to teal/magenta
- Full-viewport background canvas mounted globally via dynamic import in Providers
- DPR-aware sizing, ResizeObserver, rAF loop with StrictMode guard, proper cleanup

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useBackgroundCanvas hook with object pool particle system** - `0c30742` (feat)
2. **Task 2: Create BackgroundCanvas component and mount in providers** - `fb7fae0` (feat)

## Files Created/Modified
- `src/hooks/useBackgroundCanvas.ts` - rAF-driven particle system with object pool, vitality interpolation, DPR canvas
- `src/components/BackgroundCanvas.tsx` - Full-viewport fixed canvas component with useBackgroundCanvas
- `src/app/providers.tsx` - Added dynamic import of BackgroundCanvas with ssr:false

## Decisions Made
- Used direct HSL hue values (175 teal, 320 magenta, 30 ochre) instead of calling computeReefColors -- avoids computing all 8 color tokens every frame when only particle colors are needed
- Bucketed alpha to nearest 0.05 (20 levels) to reduce unique gradient color string creation per frame
- Capped spawns at 3 per frame for smooth visual ramp-up rather than instant batch appearance

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Particle layer renders and responds to vitality slider (VitalityDebugPanel from phase 01)
- `// CAUSTIC LAYER: will be added in Plan 02` comment marks the insertion point for 02-02 caustics
- Background canvas is ready for caustic compositing in Plan 02-02

## Self-Check: PASSED

- FOUND: src/hooks/useBackgroundCanvas.ts
- FOUND: src/components/BackgroundCanvas.tsx
- FOUND: commit 0c30742 (Task 1)
- FOUND: commit fb7fae0 (Task 2)

---
*Phase: 02-visual-effects*
*Completed: 2026-03-21*
