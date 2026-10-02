---
phase: 3
slug: platform-upgrade-stack-consolidation
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-02
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.3 (jsdom 30.1.1, Testing Library 16.3.3 + explicit @testing-library/dom 10.4.2 from 03-03); Playwright 1.63.0 with @axe-core/playwright 4.13.0; Node scripts for fences and the review page |
| **Config file** | `dashboard-next/vitest.config.ts`, `dashboard-next/playwright.config.ts` (projects `e2e`, `visual`), `dashboard-next/playwright.review.config.ts` (03-14), `dashboard-next/eslint.config.mjs` (03-04) |
| **Quick run command** | `npm --prefix dashboard-next test -- tests/unit/<file>` (plus `npm --prefix dashboard-next run typecheck`) |
| **Full suite command** | `npm --prefix dashboard-next run lint`; `node scripts/check-contract-fence.mjs`; `node scripts/check-feature-fence.mjs`; `npm --prefix dashboard-next run typecheck`; `npm --prefix dashboard-next test`; `npm --prefix dashboard-next run build`; `npm --prefix dashboard-next run test:e2e` (each run on its own; no `&&` chains) |
| **Estimated runtime** | quick ~15 s; full ~4 min locally (build ~1.5 min, e2e ~1.6 min); CI visual only in the Docker image |

---

## Sampling Rate

- **After every task commit:** the task's `<automated>` command (single unit file or one e2e spec) plus `npm --prefix dashboard-next run typecheck`.
- **After every plan (each plan is its own wave except wave 1):** the full suite command, then push and a CI run with web, e2e, python and citations green; visual green or failing only on the declared expected states (experience-compare from 03-07, map from 03-08, sites from 03-09) until 03-15 regenerates once.
- **Before `/gsd-verify-work`:** full suite green locally and in CI on the final head (all five jobs, visual against the regenerated baselines), owner sign-off recorded.
- **Max feedback latency:** ~15 s per task (unit), ~4 min per plan (full local suite).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | PLAT-10 | T-03-01-01 | API host and base-URL env only in lib/api.ts; fetch call sites on an allowlist | unit | `npm --prefix dashboard-next test -- tests/unit/api-client.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 3-01-02 | 01 | 1 | PLAT-10 | T-03-01-02 | vercel.json security headers asserted exactly | unit | `npm --prefix dashboard-next test -- tests/unit/query-defaults.test.tsx tests/unit/security-headers.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | PLAT-02 | T-03-02-01 | deletion limited to dashboard/ | unit | `npm --prefix dashboard-next test -- tests/unit/stack-consolidation.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | PLAT-02 | T-03-02-03 | docs pass copy-claims and citations | unit | `npm --prefix dashboard-next test -- tests/unit/copy-claims.test.ts tests/unit/stack-consolidation.test.ts` | ✅ | ⬜ pending |
| 3-03-01 | 03 | 2 | PLAT-01 | T-03-03-SC | registry evidence before install | manual (checkpoint) | registry `npm view` evidence recorded | n/a | ⬜ pending |
| 3-03-02 | 03 | 2 | PLAT-01 | T-03-03-01 | no legacy peer-deps; override scoped | build + e2e | `npm --prefix dashboard-next run build` | ✅ | ⬜ pending |
| 3-03-03 | 03 | 2 | PLAT-01 | T-03-03-03 | baseline-neutral hop proven in CI | unit + CI | `npm --prefix dashboard-next test` | ✅ | ⬜ pending |
| 3-04-01 | 04 | 3 | PLAT-01 | T-03-04-SC | registry evidence before install | manual (checkpoint) | registry `npm view` evidence recorded | n/a | ⬜ pending |
| 3-04-02 | 04 | 3 | PLAT-01 | T-03-04-01 | contract fence survives flat config | build + e2e | `npm --prefix dashboard-next run build` | ✅ | ⬜ pending |
| 3-04-03 | 04 | 3 | PLAT-01 | T-03-04-02 | pins asserted, no silent drift | unit + CI | `npm --prefix dashboard-next test -- tests/unit/platform-versions.test.ts` | ❌ W0 | ⬜ pending |
| 3-05-01 | 05 | 4 | PLAT-03 | T-03-05-01 | legacy import in a feature fails lint and script | unit | `npm --prefix dashboard-next test -- tests/unit/feature-fence.test.ts` | ❌ W0 | ⬜ pending |
| 3-05-02 | 05 | 4 | PLAT-03 | T-03-05-02 | contract deep-import rule kept in features block | unit | `npm --prefix dashboard-next test -- tests/unit/feature-fence.test.ts tests/unit/contract-fence.test.ts` | ✅ | ⬜ pending |
| 3-06-01 | 06 | 5 | DS-07 | T-03-06-02 | no always-on loops | unit + e2e | `npm --prefix dashboard-next test -- tests/unit/vitality-removed.test.ts tests/unit/query-defaults.test.tsx` | ❌ W0 | ⬜ pending |
| 3-06-02 | 06 | 5 | DS-07 | T-03-06-01 | no decorative pseudo-spectrogram | unit + e2e | `npm --prefix dashboard-next test -- tests/unit/vitality-removed.test.ts` | ✅ | ⬜ pending |
| 3-07-01 | 07 | 6 | DS-07 | T-03-07-04 | crossfader drives audio only; touch-action kept | unit + e2e | `npm --prefix dashboard-next test -- tests/unit/location-compare.test.tsx` | ❌ W0 | ⬜ pending |
| 3-07-02 | 07 | 6 | DS-07 | T-03-07-01 | no prediction-driven ambience | unit | `npm --prefix dashboard-next test -- tests/unit/vitality-removed.test.ts` | ✅ | ⬜ pending |
| 3-07-03 | 07 | 6 | DS-07 | T-03-07-03 | visual failures limited to declared set | doc grep + CI | `grep -cE "^\| CAP-(25\|47\|76\|77\|78\|79\|80\|83\|84) .*\| retire \|" .planning/audit/CAPABILITY-MATRIX.md` | ✅ | ⬜ pending |
| 3-08-01 | 08 | 7 | PLAT-02 | T-03-08-SC | registry evidence before install | manual (checkpoint) | registry `npm view` evidence recorded | n/a | ⬜ pending |
| 3-08-02 | 08 | 7 | PLAT-02 | T-03-08-01, T-03-08-03 | worker copied per build; attribution visible | e2e | `npm --prefix dashboard-next run test:e2e -- tests/e2e/maps.spec.ts` | ❌ W0 | ⬜ pending |
| 3-08-03 | 08 | 7 | PLAT-02 | T-03-08-02 | e2e hook only with NEXT_PUBLIC_E2E_HOOKS | unit + e2e + CI | `npm --prefix dashboard-next test -- tests/unit/map-layers.test.ts tests/unit/map-shell.test.tsx tests/unit/stack-consolidation.test.ts` | ❌ W0 | ⬜ pending |
| 3-09-01 | 09 | 8 | PLAT-02 | T-03-09-01 | OSM attribution and tile policy | e2e | `npm --prefix dashboard-next run test:e2e -- tests/e2e/maps.spec.ts` | ✅ | ⬜ pending |
| 3-09-02 | 09 | 8 | PLAT-02 | T-03-09-03 | Escape closes popup, focus returns | unit | `npm --prefix dashboard-next test -- tests/unit/map-marker.test.tsx` | ❌ W0 | ⬜ pending |
| 3-10-01 | 10 | 9 | PLAT-02 | T-03-10-01 | mini map attribution visible | unit + e2e | `npm --prefix dashboard-next test -- tests/unit/site-index.test.tsx` | ✅ | ⬜ pending |
| 3-10-02 | 10 | 9 | PLAT-02 | T-03-10-02 | Leaflet and override gone | unit | `npm --prefix dashboard-next test -- tests/unit/stack-consolidation.test.ts` | ✅ | ⬜ pending |
| 3-11-01 | 11 | 10 | PLAT-02 | T-03-11-SC, T-03-11-01 | honest probability axis | unit | `npm --prefix dashboard-next test -- tests/unit/plot-figure.test.tsx` | ❌ W0 | ⬜ pending |
| 3-11-02 | 11 | 10 | PLAT-02 | T-03-11-02 | no unused or competing chart deps | unit | `npm --prefix dashboard-next test -- tests/unit/plot-figure.test.tsx tests/unit/stack-consolidation.test.ts` | ✅ | ⬜ pending |
| 3-12-01 | 12 | 11 | PLAT-09 | T-03-12-01 | posted body scrubbed; same-origin route; 204 no redirect | e2e | `npm --prefix dashboard-next run test:e2e -- tests/e2e/monitoring.spec.ts` | ❌ W0 | ⬜ pending |
| 3-12-02 | 12 | 11 | PLAT-09 | T-03-12-02, T-03-12-03, T-03-12-04 | 415/413/403/400/429; one-line log | unit | `npm --prefix dashboard-next test -- tests/unit/monitoring-scrub.test.ts tests/unit/monitoring-route.test.ts` | ❌ W0 | ⬜ pending |
| 3-12-03 | 12 | 11 | PLAT-09 | T-03-12-03, T-03-12-05 | client caps, silent failures | unit | `npm --prefix dashboard-next test -- tests/unit/monitoring-report.test.ts` | ❌ W0 | ⬜ pending |
| 3-13-01 | 13 | 12 | PLAT-09 | T-03-13-01 | error.message never rendered | unit | `npm --prefix dashboard-next test -- tests/unit/error-pages.test.tsx tests/unit/copy-claims.test.ts` | ❌ W0 | ⬜ pending |
| 3-13-02 | 13 | 12 | PLAT-09 | T-03-13-SC | pinned SDK; no visible DOM | e2e | `npm --prefix dashboard-next run test:e2e -- tests/e2e/routes.spec.ts tests/e2e/monitoring.spec.ts` | ✅ | ⬜ pending |
| 3-13-03 | 13 | 12 | PLAT-09 | T-03-13-02, T-03-13-03 | preview only; no secrets in docs | doc check + human-check | `node scripts/check-citations.mjs --scope docs` | ✅ | ⬜ pending |
| 3-14-01 | 14 | 13 | PLAT-01, DS-07 | T-03-14-02, T-03-14-03 | escaped HTML; decisions preserved | unit | `npm --prefix dashboard-next test -- tests/unit/visual-review.test.ts` | ❌ W0 | ⬜ pending |
| 3-14-02 | 14 | 13 | PLAT-01, DS-07 | T-03-14-01 | dispatch input never in shell | e2e list + CI | `npm --prefix dashboard-next exec -- playwright test --project=e2e --list` | ✅ | ⬜ pending |
| 3-15-01 | 15 | 14 | PLAT-01, DS-07 | T-03-15-01, T-03-15-02 | only declared states regenerated | script check + CI | `node scripts/build-visual-review.mjs --check --causes docs/deploy/phase-3-visual-review/causes.json` | ❌ W0 (03-14) | ⬜ pending |
| 3-15-02 | 15 | 14 | PLAT-01, DS-07 | T-03-15-01 | owner accepts every changed row | manual (checkpoint) | owner decision recorded in PHASE-3-VISUAL-REVIEW.md | n/a | ⬜ pending |
| 3-15-03 | 15 | 14 | all six | T-03-15-03, T-03-15-04 | main unchanged; no secrets in exit docs | doc check + CI | `node scripts/check-citations.mjs --scope all` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test files are created inside the plan that needs them (red first, then green, in the same task), so no separate Wave 0 plan exists:

- [ ] `dashboard-next/tests/unit/api-client.test.ts`, `query-defaults.test.tsx`, `security-headers.test.ts` — PLAT-10 (03-01)
- [ ] `dashboard-next/tests/unit/stack-consolidation.test.ts` — PLAT-02, grows in 03-02, 03-08, 03-10, 03-11
- [ ] `dashboard-next/tests/unit/platform-versions.test.ts` — PLAT-01 (03-04)
- [ ] `dashboard-next/tests/unit/feature-fence.test.ts` + `scripts/check-feature-fence.mjs` — PLAT-03 (03-05)
- [ ] `dashboard-next/tests/unit/vitality-removed.test.ts`, `location-compare.test.tsx`, `tests/e2e/ambient-removed.spec.ts` — DS-07 (03-06, 03-07)
- [ ] `dashboard-next/tests/unit/map-layers.test.ts`, `map-shell.test.tsx`, `map-marker.test.tsx`, `tests/e2e/maps.spec.ts` — PLAT-02 maps (03-08..03-10); `site-index.test.tsx`, `sites-page.test.tsx`, `label-provenance.test.tsx` updated in the same commits as the ports
- [ ] `dashboard-next/tests/unit/plot-figure.test.tsx` — PLAT-02 charts (03-11)
- [ ] `dashboard-next/tests/unit/monitoring-scrub.test.ts`, `monitoring-route.test.ts`, `monitoring-report.test.ts`, `error-pages.test.tsx`, `tests/e2e/monitoring.spec.ts` — PLAT-09 (03-12, 03-13)
- [ ] `dashboard-next/tests/unit/visual-review.test.ts`, `tests/e2e/review.spec.ts`, `playwright.review.config.ts`, `scripts/build-visual-review.mjs` — review protocol (03-14)
- [x] Framework install: none needed (Vitest and Playwright present); `@testing-library/dom` made explicit in 03-03

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Before/after visual review and acceptance of every changed baseline and every unhidden capture | PLAT-01, DS-07 | Success criterion 1 requires owner review; canvases and maps are hidden in the gating baseline | 03-15 Task 2: open the published review page, toggle the difference view, record accepted/rejected per row |
| Client error line visible in Vercel runtime logs; Speed Insights tab present | PLAT-09 | Behind the owner's Vercel login; CLI log access not guaranteed (A6); Hobby keeps logs 1 hour | 03-13 Task 3 human-check: within an hour of the probe POST, Logs tab filtered by Request Path /api/client-error/ and level Error |
| Package legitimacy approvals for flagged majors | PLAT-01, PLAT-02 | Supply-chain gate needs a human/owner basis | 03-03/03-04/03-08 Task 1: registry evidence plus the owner's standing approval recorded |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoint tasks are the three manual rows above)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (each new test is created in its own task)
- [x] No watch-mode flags (`vitest run`, `playwright test`)
- [ ] Feedback latency < 3s (not achievable for build/e2e; per-task unit feedback ~15 s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
