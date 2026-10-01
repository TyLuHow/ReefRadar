---
status: testing
phase: 01-truth-reproducibility
source: [01-VERIFICATION.md]
started: 2026-10-01T20:05:00Z
updated: 2026-10-01T20:05:00Z
---

## Current Test

number: 1
name: Production frontend promotion (merge redesign/v2-discovery to main or promote the preview)
expected: |
  Landing, /sites, /about, /dashboard/analyze, /experience and the compare surfaces show only the 9 MARRS excerpts,
  'assigned by MARRS' labels, the canonical DOI, no 'AI-powered' / species / scripted-processing copy, and integer
  class percentages summing to 100.
awaiting: user response

## Tests

### 1. Production frontend promotion
expected: After merge/promotion, production shows only the 9 MARRS excerpts, 'assigned by MARRS' labels, the canonical DOI, no banned copy, and integer class percentages summing to 100.
result: [pending]

### 2. Visual baselines reviewed by eye
expected: Each of the 33 Linux PNGs in dashboard-next/tests/e2e/visual.spec.ts-snapshots/ and the pre-truth screenshots show a legible page (nav, titles, hero copy visible; no opaque canvas block).
result: [pending]

### 3. preview-truth-live.spec.ts against the protected Vercel preview
expected: With PW_VERCEL_BYPASS_SECRET set, 3/3 pass against the real preview URL.
result: [pending]

### 4. (Optional) AWS Lambda concurrency quota 10 -> 1000 granted
expected: Service Quotas request 4b8d23edbdcf43d9a9eee46fddc7b589IQUhYJr5 approved.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
