# Deferred items (phase 02-data-contract-v1)

Out-of-scope discoveries logged by plan executors. Not fixed in this phase's plans.

## From 02-07

- **AnimatedCounter renders 0 on /dashboard (existing defect).**
  `dashboard-next/src/components/ui/AnimatedCounter.tsx`: the IntersectionObserver callback calls
  `setHasAnimated(true)` and starts the animation, but `hasAnimated` is in the effect's dependency
  list, so the effect cleanup runs on the next render and calls `cancelAnimationFrame` on the frame it
  just scheduled. The counter never advances from 0. The committed Linux visual baselines
  (`tests/e2e/visual.spec.ts-snapshots/dashboard-*-visual-linux.png`) already show "0 / 0 / 0" for the
  three stat counters, so this predates 02-07 and 02-07 does not change it (the baseline must stay
  green). Fix together with a baseline refresh in a later UI phase, not here.
