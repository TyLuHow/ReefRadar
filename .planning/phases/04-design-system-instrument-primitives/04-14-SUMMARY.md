---
phase: 04-design-system-instrument-primitives
plan: 14
subsystem: ui
tags: [web-audio, audio-engine, equal-power, playhead-clock, reduced-motion, transport, use-transport, integrity]
status: complete

requires:
  - phase: 04-design-system-instrument-primitives
    provides: useReducedMotion (04-07), Spectrogram SpectrogramHandle.setPlayhead and useClipSpectrogram raw buffer (04-13)
provides:
  - "createAudioEngine, AudioEngine, equalPowerGains, UnequalLengthError, isAudioSupported (features/instrument/audio-engine.ts)"
  - "createPlayheadClock (features/instrument/playhead-clock.ts)"
  - "useTransport, STEP_SECONDS, TransportClip, TransportStatus (features/instrument/useTransport.ts)"
affects: [04-15, 04-16, 04-21, 04-22, phase-6, phase-7]

actuals:
  tokens: 11400
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One AudioContext is the clock; the playhead clock only decides how often to read it"
    - "Clock ticks write the playhead through SpectrogramHandle.setPlayhead refs; React state holds only the readout, changed at most once per whole second or at once on seek, pause and end"
    - "Engine and clock are plain factories with test seams (contextFactory, rAF and timers stubbed), so the hook is a thin glue layer"
    - "State is keyed by engine identity (derived view) instead of resetting state in an effect"

key-files:
  created:
    - dashboard-next/src/features/instrument/audio-engine.ts
    - dashboard-next/src/features/instrument/playhead-clock.ts
    - dashboard-next/src/features/instrument/useTransport.ts
    - dashboard-next/tests/unit/audio-engine.test.ts
    - dashboard-next/tests/unit/playhead-clock.test.ts
  modified:
    - dashboard-next/src/features/instrument/index.ts

key-decisions:
  - "The AudioContext is created and resumed synchronously at the top of play(), before any await, so the user gesture is still live; decoding happens after, at first play, from a private copy of the bytes load() was given"
  - "Reduced motion: the clock is a 1 Hz setInterval with no requestAnimationFrame at all (the 04-13 handoff note saying four times a second is wrong; the plan and CONTEXT say once per second)"
  - "Clips count as equal length within 10 ms (resampling rounding); beyond that play() rejects with UnequalLengthError after decoding and starts nothing"
  - "The clock stops when the document is hidden and when the observed container is off-screen; audio keeps playing, and the playhead jumps to the true position (tickNow) when the clock resumes"
  - "useTransport takes an optional observe ref for the IntersectionObserver because a SpectrogramHandle exposes only setPlayhead and has no DOM node to watch"

patterns-established:
  - "Hook tests import their dependencies statically; a dynamic import inside a test timed out at 5 s when the whole suite ran in parallel"

requirements-completed: [DS-06, DS-05]

duration: 40 min
completed: 2026-10-04
---

# Phase 4 Plan 14: Audio engine, playhead clock and useTransport Summary

**Web Audio engine with equal-power gains and equal-length enforcement, a playhead clock that runs rAF only while playing and visible (1 Hz under reduced motion), and the `useTransport` hook that drives every well through its imperative handle.**

## Accomplishments

- `createAudioEngine`: lazy AudioContext created and resumed inside the first press, several clips started from one `start(when, offset)` each through its own GainNode, `pause`, `seek` (restarts sources in place while playing), `position()` from context time, `setGains` smoothed with `setTargetAtTime(v, t, 0.015)`, `onEnded`, `dispose` (reusable afterwards, so React strict mode is safe).
- `equalPowerGains(x)`: cos and sin, exact at 0 and 1, a squared plus b squared equals 1 across the range. `UnequalLengthError` rejects unequal clips instead of stretching (T-04-14-02).
- `createPlayheadClock`: rAF loop only while started and the document is visible, none after `stop()`, stops on `visibilitychange` to hidden and resumes with a tick; 1 Hz interval and zero rAF calls under reduced motion; `tickNow` for seek and pause (T-04-14-01).
- `useTransport`: one engine per stable clip set, clock ticks write every well through `setPlayhead` (verified: ten frames cause zero React renders), readout state at most once a second, status `idle | playing | ended | loading | unsupported | error`, `playPause`, `step(±1)` (5 s), `seek`, `toStart`, `toEnd`, `setMix`; the clock is paused while the observed container is off-screen.
- No synthesised audio ships: the fake AudioContext and its length-encoding bytes live only in the tests.

## Task Commits

1. Task 1: Audio engine with equal-power gains - `54ac55d` (feat; RED confirmed first: 20 of 20 failed before the barrel export existed)
2. Task 2: Playhead clock and useTransport - `54dc6ff` (feat), `57fa5e3` (test: static imports for the hook tests)

## Verification

- `npx vitest run tests/unit/playhead-clock.test.ts tests/unit/audio-engine.test.ts`: 37 passed, run 5 times in a row with no failure.
- `npm test`: 69 files, 1224 tests passed. `npm run lint`: 0 errors (20 pre-existing warnings, none in the new files). `npm run typecheck`: clean. `npm run build` (flag-less): exit 0.
- Fence scripts (contract, feature, citations) OK; `check-dev-fixtures-excluded.mjs` OK against the flag-less build (fixtures routes 404).
- Playwright e2e not run: nothing rendered changed (no component, route or fixtures section touched).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hook tests timed out under the full suite**
- **Found during:** Task 2 (full `npm test`)
- **Issue:** The first version of the hook tests imported `@testing-library/react` and the instrument barrel dynamically inside the test; under parallel load the import exceeded 5 s, cascading into overlapping `act()` errors. They passed when run alone.
- **Fix:** Static imports at the top of the file.
- **Files modified:** dashboard-next/tests/unit/playhead-clock.test.ts
- **Commit:** `57fa5e3`

### Interpretation notes (not rule deviations)

- `load()` stores a private copy of the bytes and decoding happens at first `play()`, not inside `load()`: the plan requires no AudioContext before the first `play`, and `decodeAudioData` needs a context. `play()` resolves to a boolean (false when a pause cancelled it while decoding).
- `useTransport` gained an optional `observe` ref and the hook tests live in `playhead-clock.test.ts` (both listed files); no file outside `files_modified` was touched.
- Verification of playback in a real browser (audible output, Safari) is not covered by unit tests; the fake context proves the call sequence only. Plan 04-15 (Transport) exercises it in the fixtures page.

**Total deviations:** 1 auto-fixed (1 test bug). **Impact:** none on scope.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the AudioContext, created inside a user gesture (T-04-14 boundary); the engine fetches nothing, so the `fetch(` allowlist in `api-client.test.ts` is unaffected.

## Next Phase Readiness

Ready for 04-15: Transport, BandToggle and WindowStrip can call `useTransport({ clips, wells, observe })` with the `buffer` that `useClipSpectrogram` already keeps (the engine slices its own copy, so the shared buffer stays intact).

## Self-Check: PASSED

- Files exist: audio-engine.ts, playhead-clock.ts, useTransport.ts, audio-engine.test.ts, playhead-clock.test.ts (checked on disk).
- Commits `54ac55d`, `54dc6ff`, `57fa5e3` present in `git log`.
- All task acceptance criteria re-run and green (vitest 37/37, lint, typecheck, build).
