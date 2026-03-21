---
phase: 04-page-integration-and-polish
plan: 02
subsystem: ui
tags: [prefers-reduced-motion, mobile-optimization, accessibility, canvas, particles, caustics]

# Dependency graph
requires:
  - phase: 02-canvas-system
    provides: particle pool and caustic rendering in useBackgroundCanvas
  - phase: 01-foundation
    provides: vitality store and color engine with CSS variable pipeline
  - phase: 04-page-integration-and-polish-01
    provides: crossfader vitality wiring and vitality-slider CSS with touch-action
provides:
  - Canvas reduced-motion gate (skip all rAF rendering)
  - Mobile particle cap (50) and caustic disable
  - Vitality instant color jump for reduced-motion users
  - Navbar PERF-06 fixed-contrast intent lock
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [matchMedia prefers-reduced-motion gate at init, viewport-width mobile detection at init, maxCap parameter for particle budget]

key-files:
  created: []
  modified:
    - src/hooks/useBackgroundCanvas.ts
    - src/hooks/useVitality.ts
    - src/components/Navbar.tsx

key-decisions:
  - "matchMedia checked once at init (not refs) per locked decision -- only read at mount"
  - "Canvas completely skipped for reduced-motion (not just fewer particles) -- particles and caustics are pure motion"
  - "Vitality CSS variable writes preserved for reduced-motion users -- color state is not motion"

patterns-established:
  - "prefersReducedMotion + isMobile as local const at useEffect init for performance gating"
  - "maxCap parameter threading through updateParticles -> spawnParticles for mobile budget"

requirements-completed: [PERF-05, PERF-06, MOBL-01, MOBL-02, MOBL-03]

# Metrics
duration: 7min
completed: 2026-03-21
---

# Phase 04 Plan 02: Mobile/A11y Performance Summary

**Canvas reduced-motion gate skips all rAF rendering; mobile caps particles at 50 with caustics disabled; vitality preserves instant color changes for all users**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-21T07:05:45Z
- **Completed:** 2026-03-21T07:12:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Canvas system completely skips rAF loop when prefers-reduced-motion is active (no particles, no caustics, no GPU work)
- Mobile viewports (<768px) cap particle count at 50 and disable caustic grid rendering for battery/GPU savings
- Vitality hook writes instant color jumps (no lerp animation) for reduced-motion users while preserving CSS variable updates
- Navbar verified as using only fixed high-contrast colors with PERF-06 intent comment to prevent regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Mobile and reduced-motion gates in canvas and vitality hooks** - `0946e37` (feat)
2. **Task 2: Verify navbar fixed high-contrast and MOBL-03 touch-action** - `b5d9170` (chore)

## Files Created/Modified
- `src/hooks/useBackgroundCanvas.ts` - Added prefersReducedMotion guard (skip rAF), isMobile guard (cap particles 50, disable caustics), maxCap parameter threading
- `src/hooks/useVitality.ts` - Added prefersReducedMotion check for instant color jump (no lerp), CSS writes preserved
- `src/components/Navbar.tsx` - Added PERF-06 intent comment; verified no --reef-* or reef-* Tailwind token references

## Decisions Made
- matchMedia checked once at init (not refs/listeners) -- only needs init-time read per locked decision from research
- Canvas completely skipped for reduced-motion (not just fewer particles) -- particles and caustics are pure motion, not state
- Vitality CSS variable writes preserved for reduced-motion users -- color palette changes represent data state, not motion

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All phase 04 plans complete
- Mobile performance gating and accessibility gates in place
- Crossfader, ML results, gallery cards, and canvas system fully wired to vitality

## Self-Check: PASSED

- FOUND: 04-02-SUMMARY.md
- FOUND: 0946e37 (Task 1 commit)
- FOUND: b5d9170 (Task 2 commit)

---
*Phase: 04-page-integration-and-polish*
*Completed: 2026-03-21*
