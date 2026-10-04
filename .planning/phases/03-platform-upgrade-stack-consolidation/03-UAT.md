---
status: testing
phase: 03-platform-upgrade-stack-consolidation
source: [03-VERIFICATION.md]
started: 2026-10-04T00:00:00Z
updated: 2026-10-04T00:00:00Z
---

## Current Test

number: 1
name: Map failure panel on /dashboard/map (REVIEW-FIX WR-02)
expected: |
  Blocking the map style or worker shows "Map failed to initialize"; blocking a single tile leaves the map in place.
awaiting: user response

## Tests

### 1. Map failure panel on /dashboard/map (REVIEW-FIX WR-02)
expected: Blocking the style/worker shows the failure panel; a single blocked tile leaves the map in place.
result: [pending]

### 2. Keyboard path on /dashboard/map (REVIEW-FIX WR-03)
expected: Tab into the site list, Enter opens the popup, Escape closes it and returns focus; at narrow widths the list panel does not clash with the region select or legend.
result: [pending]

### 3. Vercel Logs and Speed Insights tabs (owner login)
expected: Within 1 hour of a probe POST, the Logs tab (path /api/client-error/) shows the client-error line and the Speed Insights tab exists.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
