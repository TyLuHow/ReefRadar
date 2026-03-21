---
phase: 4
slug: page-integration-and-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (next build + visual inspection) |
| **Config file** | none |
| **Quick run command** | `npx next build` |
| **Full suite command** | `npx next build` + multi-page visual verification |
| **Estimated runtime** | ~30 seconds (build) + manual page checks |

---

## Sampling Rate

- **After every task commit:** `npx next build`
- **After every plan wave:** Build + check crossfader, gallery, mobile, a11y
- **Before `/gsd:verify-work`:** Full multi-page sweep
- **Max feedback latency:** 30 seconds

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Crossfader drives vitality with gradient track | PAGE-01, PAGE-02 | Visual slider interaction | Drag crossfader on compare, verify UI transforms |
| Gallery cards show vitality glow | PAGE-04 | Visual card treatment | Check gallery, verify teal glow on healthy cards |
| Mobile particle cap at 50 | MOBL-01 | Viewport-dependent | Resize to <768px, verify fewer particles |
| Caustics disabled on mobile | MOBL-02 | Viewport-dependent | Resize to <768px, verify no caustic patterns |
| Reduced-motion disables particles | PERF-05 | OS setting | Enable prefers-reduced-motion, verify no particles |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
