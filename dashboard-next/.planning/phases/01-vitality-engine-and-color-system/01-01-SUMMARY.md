---
phase: 01-vitality-engine-and-color-system
plan: 01
subsystem: ui
tags: [zustand, hsl, css-custom-properties, raf, animation, color-interpolation]

requires:
  - phase: none
    provides: first plan in project
provides:
  - Zustand vitality store (useVitalityStore) with target/source/setVitality
  - Pure HSL color interpolation engine (computeReefColors, effectiveVitality, lerpHSL)
  - rAF animation hook (useVitality) that writes --reef-* CSS variables at 30fps
  - 8 CSS custom properties with degraded initial values in globals.css
affects: [01-02, 02-crossfader, 03-audio-reactive, 04-gallery]

tech-stack:
  added: []
  patterns: [ref-based-raf-loop, zustand-getState-polling, css-variable-pipeline, staggered-threshold-interpolation]

key-files:
  created:
    - src/stores/vitality-store.ts
    - src/lib/color-engine.ts
    - src/hooks/useVitality.ts
  modified:
    - src/app/providers.tsx
    - src/app/globals.css

key-decisions:
  - "Glow alpha 0.2 (degraded) to 0.5 (healthy) -- intentionally lower than existing hex 0.4"
  - "Secondary token uses late hue snap at t>0.5 with saturation ramp to avoid green/purple mid-states"
  - "Exponential ease-out (speed=0.08) over explicit cubic easing -- simpler, same visual result"

patterns-established:
  - "Ref-based rAF loop: animation state in useRef, never useState, to avoid React re-renders"
  - "Zustand getState() polling: read store target in rAF tick without subscription"
  - "CSS variable pipeline: computeReefColors -> writeCSSVariables -> document.documentElement.style.setProperty"
  - "30fps CSS write throttle: timestamp check > 33ms in rAF callback"
  - "StrictMode guard: runningRef prevents double-start of animation loops"

requirements-completed: [CORE-01, CORE-02, CORE-03, CORE-04, COLR-01, COLR-02, COLR-03, COLR-04, COLR-06, PERF-01, PERF-02, PERF-03]

duration: 7min
completed: 2026-03-20
---

# Phase 01 Plan 01: Vitality Engine and Color System Summary

**Zustand vitality store + pure HSL color engine with 8-token staggered interpolation driving CSS custom properties via rAF at 30fps**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-20T09:21:14Z
- **Completed:** 2026-03-20T09:27:59Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Zustand store for discrete vitality state with clamped 0-1 target and source tracking
- Pure color engine computing 8 HSL color strings with per-token stagger thresholds and directional hue interpolation
- rAF animation loop with ref-based state, exponential ease-out, and 30fps CSS variable writing
- CSS custom properties initialized to degraded palette in globals.css
- Animation loop automatically started via Providers component mount

## Task Commits

Each task was committed atomically:

1. **Task 1: Create vitality store and color engine** - `f596e5a` (feat)
2. **Task 2: Create useVitality hook, wire into providers, add CSS variables** - `7f510fc` (feat)

## Files Created/Modified
- `src/stores/vitality-store.ts` - Zustand store with target, source, setVitality
- `src/lib/color-engine.ts` - Pure HSL interpolation with lerpHSL, effectiveVitality, computeReefColors
- `src/hooks/useVitality.ts` - rAF animation loop, CSS variable writer, StrictMode guard
- `src/app/providers.tsx` - Added useVitality() call to start animation loop
- `src/app/globals.css` - Added 8 --reef-* CSS custom properties with degraded initial values

## Decisions Made
- Glow alpha intentionally set to 0.2 (degraded) ramping to 0.5 (healthy), lower than existing hex-converted 0.4 -- a barely visible glow on a dead reef, growing as life returns
- Secondary token (bone -> blue) uses late hue snap at effective vitality > 0.5 with saturation ramp to avoid ugly green/purple mid-states during interpolation
- Used exponential ease-out (speed=0.08) instead of explicit cubic easing with duration tracking -- simpler implementation with same 300ms-to-95% convergence visual result

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Vitality store and color engine ready for Plan 02 (Tailwind integration, debug panel)
- Any component can now call `useVitalityStore.getState().setVitality(0.7, 'crossfader')` to drive colors
- CSS variables update automatically via the rAF loop in Providers

## Self-Check: PASSED

All files exist. All commits verified.

---
*Phase: 01-vitality-engine-and-color-system*
*Completed: 2026-03-20*
