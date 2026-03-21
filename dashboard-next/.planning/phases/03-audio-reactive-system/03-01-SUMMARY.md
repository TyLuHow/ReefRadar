---
phase: 03-audio-reactive-system
plan: 01
subsystem: audio
tags: [web-audio-api, fft, zustand, rms, frequency-bands, analysernode]

# Dependency graph
requires:
  - phase: 02-visual-effects
    provides: useBackgroundCanvas particle/caustic system, vitality store
provides:
  - BandEnergy and activeBands slices in vitality store
  - useAudioVisualBridge hook (FFT bin slicing, 4-band RMS at ~30fps)
  - 3-band to 4-band reef biology toggle sync in useDemoAudio
affects: [03-02-PLAN, 04-page-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [store-based audio-visual bridge, FFT bin slicing with runtime sample rate, rAF throttle to 30fps]

key-files:
  created:
    - src/hooks/useAudioVisualBridge.ts
  modified:
    - src/stores/vitality-store.ts
    - src/components/experience/useDemoAudio.ts

key-decisions:
  - "Uint8Array<ArrayBuffer> generic type required for strict TypeScript AnalyserNode.getByteFrequencyData compatibility"
  - "Bin boundaries cached in ref at init (not recomputed per frame) for zero per-frame allocation"
  - "isPlaying tracked via ref inside rAF loop to avoid effect dependency churn"

patterns-established:
  - "Store-based bridge: audio hook writes to zustand store, canvas hook reads via getState() -- no React re-renders"
  - "FFT bin calculation: always use audioContext.sampleRate (never hardcoded) with Nyquist clamping for shrimp band"
  - "3-band to 4-band mapping: low->ambient+fish, mid->grazing, high->shrimp"

requirements-completed: [AUDI-01, AUDI-02]

# Metrics
duration: 3min
completed: 2026-03-21
---

# Phase 03 Plan 01: Band Energy Extraction Pipeline Summary

**4-band reef biology RMS extraction from AnalyserNode FFT data via useAudioVisualBridge hook writing to zustand store at ~30fps**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-21T06:31:15Z
- **Completed:** 2026-03-21T06:34:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Extended vitality store with bandEnergy (4-band 0-1 values) and activeBands (Set of ReefBandId) slices
- Created useAudioVisualBridge hook that reads FFT data, computes per-band RMS energy, and writes to store at ~30fps
- Wired bridge into useDemoAudio with 3-band to 4-band reef biology toggle sync

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend vitality store with bandEnergy and activeBands slices** - `958c21f` (feat)
2. **Task 2: Create useAudioVisualBridge hook and wire into useDemoAudio** - `e610053` (feat)

## Files Created/Modified
- `src/stores/vitality-store.ts` - Added ReefBandId type, BandEnergy interface, bandEnergy/activeBands slices with setters
- `src/hooks/useAudioVisualBridge.ts` - NEW: FFT bin slicing, 4-band RMS extraction, store writer at ~30fps with unmount cleanup
- `src/components/experience/useDemoAudio.ts` - Calls useAudioVisualBridge, syncs 3-band toggles to 4-band reef biology

## Decisions Made
- Used `Uint8Array<ArrayBuffer>` generic type annotation to satisfy strict TypeScript with AnalyserNode.getByteFrequencyData
- Cached bin boundaries in a ref at init rather than recomputing each frame (zero per-frame allocation)
- Tracked isPlaying via a ref inside the rAF loop to avoid tearing the effect dependency array on each play/pause toggle

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Uint8Array generic type for strict TypeScript**
- **Found during:** Task 2 (useAudioVisualBridge creation)
- **Issue:** `Uint8Array` without generic `<ArrayBuffer>` fails strict TS check when passed to `getByteFrequencyData()`
- **Fix:** Changed type annotation to `Uint8Array<ArrayBuffer>` in both the ref and the bandRMS function parameter
- **Files modified:** src/hooks/useAudioVisualBridge.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** e610053 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal -- type annotation fix required for compilation. No scope creep.

## Issues Encountered
None beyond the TypeScript type annotation fix documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- bandEnergy and activeBands are now available in the vitality store for Plan 02 to read in useBackgroundCanvas
- Plan 02 will read `useVitalityStore.getState().bandEnergy` and `activeBands` each frame to modulate particles and caustics
- No blockers

## Self-Check: PASSED

- FOUND: src/hooks/useAudioVisualBridge.ts
- FOUND: src/stores/vitality-store.ts (modified)
- FOUND: src/components/experience/useDemoAudio.ts (modified)
- FOUND: .planning/phases/03-audio-reactive-system/03-01-SUMMARY.md
- FOUND: commit 958c21f (Task 1)
- FOUND: commit e610053 (Task 2)

---
*Phase: 03-audio-reactive-system*
*Completed: 2026-03-21*
