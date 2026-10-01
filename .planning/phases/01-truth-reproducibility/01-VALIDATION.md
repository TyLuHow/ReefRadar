---
phase: 1
slug: truth-reproducibility
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-30
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + Testing Library (unit/component), Playwright + @axe-core/playwright (e2e/visual/a11y), pytest + moto (Lambdas) |
| **Config file** | none — Wave 0 installs (`dashboard-next/vitest.config.ts`, `dashboard-next/playwright.config.ts`, `lambdas/conftest.py`, `pytest.ini`) |
| **Quick run command** | `cd dashboard-next && npx vitest run` ; `py -3.12 -m pytest lambdas -x` |
| **Full suite command** | `cd dashboard-next && npm run lint && npx tsc --noEmit && npx vitest run && npx playwright test` ; `py -3.12 -m pytest lambdas` |
| **Estimated runtime** | ~180 seconds (full), ~20 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** Run quick commands for the touched side (frontend and/or Lambda)
- **After every plan wave:** Run full suite + `npm run build`
- **Before `/gsd-verify-work`:** Full suite green; drift check green against live AWS
- **Max feedback latency:** 30 seconds (quick)

---

## Per-Task Verification Map

Filled by the planner per task; requirement → command map:

| Requirement | Test Type | Automated Command | File Exists |
|-------------|-----------|-------------------|-------------|
| TRUTH-01 | smoke | clean-clone `npm ci && npm run build` (CI step) | ❌ W0 |
| TRUTH-02 | script | `py -3.12 scripts/drift-check.py` (exit 0) | ❌ W0 |
| TRUTH-03/04 | unit | `py -3.12 -m pytest tests/test_audio_manifest.py` | ❌ W0 |
| TRUTH-05 | unit + manual | `py -3.12 -m pytest lambdas/classifier/tests -k synthetic` + `docs/model/DEPLOYED-MODEL-AUDIT.md` review | ❌ W0 |
| TRUTH-06 | unit | `py -3.12 -m pytest lambdas/classifier/tests -k probabilities` (sum == 1, no multiplier) | ❌ W0 |
| TRUTH-07 | unit | `npx vitest run tests/unit/copy-claims.test.ts` (banned-claim scan) | ❌ W0 |
| TRUTH-08 | unit | `npx vitest run tests/unit/citations.test.ts` | ❌ W0 |
| TRUTH-09 | component | `npx vitest run tests/unit/label-provenance.test.tsx` | ❌ W0 |
| TRUTH-10 | e2e/visual | `npx playwright test tests/e2e/baseline.spec.ts` (baselines committed first) | ❌ W0 |
| PLAT-04 | CI | `.github/workflows/ci.yml` green on push | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `dashboard-next/vitest.config.ts` + Testing Library setup
- [ ] `dashboard-next/playwright.config.ts` (chromium + Docker-pinned screenshot project) + API fixtures in `dashboard-next/tests/fixtures/`
- [ ] `lambdas/conftest.py`, `pytest.ini`, moto fixtures
- [ ] `scripts/drift-check.py`
- [ ] `.github/workflows/ci.yml`
- [ ] `dashboard-next/tests/baseline/` captured BEFORE any UI-touching task

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deployed model provenance recorded | TRUTH-05 | Requires reading S3 artifacts and judging training-row provenance | Review `docs/model/DEPLOYED-MODEL-AUDIT.md` against S3 `models/` and training data |
| Excerpts are real reef recordings | TRUTH-03 | Listening/spectral sanity | Spot-check spectra of each excerpt (no pure tones; content ≤ 8 kHz for 16 kHz MARRS) via `scripts/check-audio-real.py` output + listen to 3 clips |
| Copy review across routes | TRUTH-07 | Semantic claims | Read every route; compare against banned-claim list |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
