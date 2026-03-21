---
phase: 2
slug: visual-effects
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (next build + visual inspection via VitalityDebugPanel) |
| **Config file** | none — no test runner installed |
| **Quick run command** | `npx next build` |
| **Full suite command** | `npx next build` + visual sweep at 0.0, 0.3, 0.5, 0.7, 1.0 |
| **Estimated runtime** | ~30 seconds (build) + manual sweep |

---

## Sampling Rate

- **After every task commit:** Visual inspection via VitalityDebugPanel slider
- **After every plan wave:** Full vitality sweep 0.0 → 1.0 confirming particle + caustic behavior
- **Before `/gsd:verify-work`:** `next build` succeeds + visual sweep at 0.0, 0.3, 0.5, 0.7, 1.0
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | PART-01, PART-02, PART-03, PART-04 | build + visual | `npx next build` + slider sweep | Existing | ⬜ pending |
| 02-01-02 | 01 | 1 | PART-01 | build | `npx next build` | Existing | ⬜ pending |
| 02-02-01 | 02 | 2 | CAUS-01, CAUS-02, CAUS-03 | build + visual | `npx next build` + slider sweep | Existing | ⬜ pending |
| 02-02-02 | 02 | 2 | CAUS-01, CAUS-03 | manual | Visual inspection in browser | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing `npx next build` covers type-checking and SSR safety
- VitalityDebugPanel (from Phase 1) provides interactive vitality slider for visual verification
- No test framework needed — visual canvas effects verified by inspection

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Particle count visually scales 5→150 | PART-01 | Canvas render output, not testable statically | Drag vitality slider 0→1, count approximate particles |
| Particle color shifts brown→teal/magenta | PART-02 | Visual color assessment | Compare particle hues at vitality 0.0 vs 1.0 |
| Caustic pattern renders correctly | CAUS-01 | Aesthetic underwater light effect | At vitality 1.0, verify shimming light caustic pattern on background |
| Caustics invisible below 0.3 | CAUS-02 | Threshold behavior | Set vitality to 0.2, verify no caustic patterns visible |
| Caustics behind particles (screen blend) | CAUS-03 | Compositing order | At vitality 1.0, verify particles render crisply on top of caustic glow |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
