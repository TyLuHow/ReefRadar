---
phase: 3
slug: audio-reactive-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (next build + visual/audio inspection) |
| **Config file** | none |
| **Quick run command** | `npx next build` |
| **Full suite command** | `npx next build` + audio playback with visual verification |
| **Estimated runtime** | ~30 seconds (build) + manual audio test |

---

## Sampling Rate

- **After every task commit:** `npx next build`
- **After every plan wave:** Build + play audio sample with VitalityDebugPanel
- **Before `/gsd:verify-work`:** Build + play reef audio, verify band-visual coupling
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | AUDI-01, AUDI-02 | build | `npx next build` | Existing | ⬜ pending |
| 03-01-02 | 01 | 1 | AUDI-01 | build | `npx next build` | Existing | ⬜ pending |
| 03-02-01 | 02 | 2 | AUDI-03, AUDI-04 | build + visual | `npx next build` + audio playback | Existing | ⬜ pending |
| 03-02-02 | 02 | 2 | AUDI-03 | manual | Play audio, verify visual micro-animations | N/A | ⬜ pending |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Shrimp bursts teal particles on snaps | AUDI-03 | Audio-reactive visual, needs live playback | Play healthy reef audio, observe teal particle bursts on snapping shrimp sounds |
| Fish energy modulates caustic shimmer | AUDI-03 | Audio-reactive visual | Play audio with fish calls, verify caustic shimmer speeds up |
| Band toggle dims visual layers | AUDI-04 | Interactive toggle behavior | Toggle off shrimp band, verify particles ghost to 20% opacity |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
