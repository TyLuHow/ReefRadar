# Phase 4 deferred items

Out-of-scope discoveries logged by executors. Not fixed in the plan that found them.

## 04-01

- **Legacy `AnimatedCounter` can stick at a partial or negative count** (`dashboard-next/src/components/ui/AnimatedCounter.tsx`, used by the stat row on `/dashboard`). It computes `elapsed` from `performance.now()` at start and the rAF timestamp on each frame; a first frame whose timestamp is older than `startTime` gives a negative eased value (`-0`, `-1`), and the animation effect restarts when `target` changes, which can leave the span at a random partial count (`0`, `1`). Seen at 390 px in the fingerprint runs, unrelated to Tailwind (present on the Tailwind 3 build). The fingerprint spec hands the app `performance.now()` for rAF and records these spans neutrally. Fix belongs with the legacy-route retirement or a later UI plan, not the styling migration.
