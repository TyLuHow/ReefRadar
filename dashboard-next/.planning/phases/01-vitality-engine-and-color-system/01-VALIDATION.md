---
phase: 1
slug: vitality-engine-and-color-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (next build serves as type-check + SSR safety gate) |
| **Config file** | none — no test runner installed |
| **Quick run command** | `npx next build` |
| **Full suite command** | `npx next build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx next build`
- **After every plan wave:** Run `npx next build` + manual DevTools inspection
- **Before `/gsd:verify-work`:** Build succeeds + visual inspection at vitality 0.0, 0.25, 0.5, 0.75, 1.0
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | CORE-01 | manual | Visual inspection of CSS vars in DevTools | N/A | ⬜ pending |
| 01-01-02 | 01 | 1 | CORE-02 | manual | DevTools Performance tab | N/A | ⬜ pending |
| 01-01-03 | 01 | 1 | CORE-03 | build | `npx next build` (type-check verifies API) | Existing | ⬜ pending |
| 01-01-04 | 01 | 1 | CORE-04 | build | `npx next build` (type-check) | Existing | ⬜ pending |
| 01-01-05 | 01 | 1 | COLR-01 | build | Color engine exports healthy palette constants | Wave 0 | ⬜ pending |
| 01-01-06 | 01 | 1 | COLR-02 | build | Color engine exports degraded palette constants | Wave 0 | ⬜ pending |
| 01-01-07 | 01 | 1 | COLR-03 | build | `npx next build` (type-check HSL functions) | Existing | ⬜ pending |
| 01-01-08 | 01 | 1 | COLR-04 | manual | DevTools `:root` styles show --reef-* vars | N/A | ⬜ pending |
| 01-02-01 | 02 | 1 | COLR-05 | build | `npx next build` (Tailwind compiles reef-* tokens) | Existing | ⬜ pending |
| 01-02-02 | 02 | 1 | COLR-06 | build | effectiveVitality function with threshold params | Wave 0 | ⬜ pending |
| 01-02-03 | 02 | 1 | PERF-01 | manual | Chrome Performance tab shows 60fps | N/A | ⬜ pending |
| 01-02-04 | 02 | 1 | PERF-02 | manual | Code review — animation state in refs | N/A | ⬜ pending |
| 01-02-05 | 02 | 1 | PERF-03 | manual | DevTools — count setProperty calls per frame | N/A | ⬜ pending |
| 01-02-06 | 02 | 1 | PERF-04 | build | `npx next build` succeeds (SSR safety) | Existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing `npx next build` covers type-checking and SSR safety
- No test framework needed for Phase 1 — pure functions are testable but deferred

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 60fps visual updates | PERF-01 | Runtime performance, not testable statically | Open Chrome DevTools > Performance tab, record while changing vitality |
| Smooth transitions (300ms+) | CORE-02 | Visual quality assessment | Set vitality to 0, then 1, verify smooth easing (no instant jump) |
| CSS vars update in real time | COLR-04 | DOM side effect | Open DevTools Elements > :root, change vitality, observe --reef-* values update |
| Refs not state | PERF-02 | Code pattern verification | Review vitality engine — animation values must be useRef, not useState |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
