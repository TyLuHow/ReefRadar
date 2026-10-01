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

| Requirement | Plans (task) | Test Type | Automated Command | File Exists |
|-------------|--------------|-----------|-------------------|-------------|
| TRUTH-01 | 01-07 (T1, T3), 01-08 (T1) | smoke | `cd dashboard-next && npm ci && npm run lint && npx tsc --noEmit && npm run build` (CI job `web` on a clean clone) | ❌ W0 (01-07) |
| TRUTH-02 | 01-05 (T1-T3), 01-09 (T2-T3), 01-14 (T2-T3), 01-20 (T2) | script + unit | `py -3.12 -m pytest scripts/tests -x`; `py -3.12 scripts/drift-check.py --function all` (exit 0) | ❌ W0 (01-05) |
| TRUTH-03/04 | 01-03 (T1-T2), 01-06 (T2), 01-12 (T2), 01-17, 01-18 (T1), 01-14 (T2), 01-20 (T2) | unit + script | `py -3.12 -m pytest scripts/tests/test_audio_manifest.py scripts/tests/test_build_gallery_manifest.py`; `py -3.12 scripts/check_audio_real.py dashboard-next/public/audio`; `npx vitest run tests/unit/samples.test.ts` | ❌ W0 (01-03, 01-06) |
| TRUTH-05 | 01-10 (T1-T2), 01-13 (T1-T2), 01-14 (T2) | unit + manual | `py -3.12 -m pytest scripts/tests/test_audit_deployed_model.py scripts/tests/test_train_interim_real_only.py` + `docs/model/DEPLOYED-MODEL-AUDIT.md` review | ❌ W0 (01-10) |
| TRUTH-06 | 01-11 (T1), 01-15 (T1-T2) | unit + component | `py -3.12 -m pytest lambdas/classifier -x` (sum == 1, no multiplier); `npx vitest run tests/unit/probabilities.test.ts tests/unit/results-components.test.tsx` | ❌ W0 (01-11, 01-15) |
| TRUTH-07 | 01-15, 01-16, 01-17, 01-18, 01-19, 01-20 (T1) | unit + e2e | `npx vitest run tests/unit/copy-claims.test.ts`; `npx playwright test --project=e2e tests/e2e/audio-surfaces.spec.ts tests/e2e/analysis-flow.spec.ts` | ❌ W0 (01-20) |
| TRUTH-08 | 01-02 (T1-T3), 01-19 (T3) | script + unit | `node scripts/check-citations.mjs --check-md && node scripts/check-citations.mjs --scope all`; `npx vitest run tests/unit/citations.test.ts` | ❌ W0 (01-02, 01-19) |
| TRUTH-09 | 01-06 (T1), 01-11 (T2), 01-12 (T1), 01-18, 01-19 (T1) | unit + component | `py -3.12 -m pytest lambdas/shared lambdas/router -x`; `npx vitest run tests/unit/label-provenance.test.tsx` | ❌ W0 (01-06, 01-19) |
| TRUTH-10 | 01-04 (T1-T2), 01-07 (T2-T3), 01-20 (T3) | e2e/visual | `npx playwright test -c playwright.live.config.ts tests/e2e/baseline-live.spec.ts` (pre-truth archive, captured first); CI `visual` job (exit baseline) | ❌ W0 (01-04) |
| PLAT-04 | 01-01 (T1-T3), 01-08 (T1-T3), 01-20 (T1, T3) | CI | `.github/workflows/ci.yml` green on push (jobs web, e2e, visual, python, citations) | ❌ W0 (01-01, 01-08) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `dashboard-next/vitest.config.ts` + Testing Library setup (01-01 T3)
- [ ] `dashboard-next/playwright.config.ts` + `playwright.live.config.ts` (01-01 T2) + API fixtures in `dashboard-next/tests/fixtures/api/` (01-06 T3, 01-08)
- [ ] `lambdas/conftest.py`, `pytest.ini`, moto fixtures (01-01 T3)
- [ ] `scripts/drift-check.py` (01-05 T1)
- [ ] `.github/workflows/ci.yml` (01-08 T1)
- [ ] `dashboard-next/tests/baseline/` captured BEFORE any UI-touching task (01-04, wave 2; first UI change is 01-07, wave 3)

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
