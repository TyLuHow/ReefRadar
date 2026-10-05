---
status: testing
phase: 04-design-system-instrument-primitives
source: [04-VERIFICATION.md]
started: 2026-10-05T00:00:00Z
updated: 2026-10-05T00:00:00Z
---

## Current Test

number: 1
name: Audible playback on a real device
expected: |
  On /dev/fixtures (NEXT_PUBLIC_DEV_FIXTURES=1), Transport play, pause, 5 s step and scrub work by ear; the CompareDeck crossfader moves smoothly between A and B with no click or level jump; the level-matched pair sounds level.
awaiting: user response

## Tests

### 1. Audible playback on a real device
expected: Play, pause, step, scrub, crossfade and level match behave correctly by ear (band selection filters no audio yet, by design).
result: [pending]

### 2. Playhead frame pacing on a tablet
expected: The playhead moves smoothly while playing; under reduced motion it steps once per second.
result: [pending]

### 3. Safari 16.4+ (desktop and iPhone/iPad)
expected: Fixtures sections render, overlays open and close, audio plays after a tap.
result: [pending]

### 4. Token probe map by eye in each direction
expected: The token-probe section's map, swatches and Plot marks visibly change together when the direction changes.
result: [pending]

### 5. Status palette sign-off
expected: The owner accepts the darker status palette (forced by 3:1 on white) against the mockup.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
