---
status: complete
phase: 01-truth-reproducibility
source: [01-VERIFICATION.md]
started: 2026-10-01T20:05:00Z
updated: 2026-10-01T20:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Production frontend promotion
expected: After merge/promotion, production shows only the 9 MARRS excerpts, 'assigned by MARRS' labels, the canonical DOI, no banned copy, and integer class percentages summing to 100.
result: passed (owner approved 2026-10-01; merge to main follows owner preview of the redesign)

### 2. Visual baselines reviewed by eye
expected: Each of the 33 Linux PNGs in dashboard-next/tests/e2e/visual.spec.ts-snapshots/ and the pre-truth screenshots show a legible page (nav, titles, hero copy visible; no opaque canvas block).
result: passed (owner reviewed before/after screenshots)

### 3. preview-truth-live.spec.ts against the protected Vercel preview
expected: With PW_VERCEL_BYPASS_SECRET set, 3/3 pass against the real preview URL.
result: skipped (owner accepted; preview spec verified against a local build of the same commit)

### 4. (Optional) AWS Lambda concurrency quota 10 -> 1000 granted
expected: Service Quotas request 4b8d23edbdcf43d9a9eee46fddc7b589IQUhYJr5 approved.
result: skipped (external AWS review pending; no correctness impact)

## Summary

total: 4
passed: 2
issues: 0
pending: 0
skipped: 2
blocked: 0

## Gaps
