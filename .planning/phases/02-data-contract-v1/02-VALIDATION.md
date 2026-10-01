---
phase: 2
slug: data-contract-v1
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-01
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python: pytest 9.1.1 + moto 5.2.3 (+ jsonschema 4.26.0, installed in 02-01). Web: vitest 5.0.3 (jsdom; node env for the fence test), Playwright 1.63.0 (`e2e` and Docker-pinned `visual` projects; `playwright.live.config.ts` for `*-live.spec.ts`) |
| **Config file** | `pytest.ini` (testpaths `lambdas scripts/tests`, pythonpath `scripts lambdas/shared`), `dashboard-next/vitest.config.ts`, `dashboard-next/playwright.config.ts`, `dashboard-next/playwright.live.config.ts` |
| **Quick run command** | `py -3.12 -m pytest scripts/tests/test_contract_*.py scripts/tests/test_publish_contract.py lambdas/shared/tests lambdas/router/tests -q` and `cd dashboard-next && npx vitest run tests/unit/contract-*` |
| **Full suite command** | `py -3.12 -m pytest -q && py -3.12 scripts/build_contract.py --version 1 --check && py -3.12 scripts/check_contract.py --check --additive && node scripts/check-contract-fence.mjs && cd dashboard-next && npm run lint && npm run typecheck && npm test && npm run build && npx playwright test --project=e2e` (visual runs in CI only) |
| **Estimated runtime** | quick ~30 seconds; full ~8 minutes (Next build + e2e) |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command (each is the quick subset relevant to that task, under ~60 s except tasks that need `next build`)
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite plus CI (web, e2e, python, citations, visual) must be green; live checks `verify_contract_live.py`, `verify_live_truth.py` (serial), `drift-check.py --function all`
- **Max feedback latency:** ~60 seconds per task (Python and vitest subsets); Playwright e2e and visual are wave-level

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | CONTRACT-01 | T-02-01-SC | jsonschema pinned only after legitimacy check (checkpoint) | manual | `py -3.12 -m pip install --dry-run jsonschema==4.26.0` | n/a | ⬜ pending |
| 2-01-02 | 01 | 1 | CONTRACT-02 | T-02-01-01, T-02-01-03 | 54 sites with provenance from overlay/citations only; hashes match | unit | `py -3.12 scripts/build_contract.py --version 1 --check && py -3.12 -m pytest scripts/tests/test_contract_sites.py -q` | ❌ W0 (task creates) | ⬜ pending |
| 2-01-03 | 01 | 1 | CONTRACT-02, CONTRACT-04 | T-02-01-01, T-02-01-02, T-02-01-04 | checker rejects tamper, CRLF, fixture marker, escaping uri | unit | `py -3.12 scripts/check_contract.py --check && py -3.12 -m pytest scripts/tests/test_contract_model.py scripts/tests/test_contract_bundle.py -q` | ❌ W0 (task creates) | ⬜ pending |
| 2-02-01 | 02 | 1 | CONTRACT-01 | T-02-02-02, T-02-02-03, T-02-02-04 | budget alarm live; address redacted; account guard | unit + live | `py -3.12 -m pytest scripts/tests/test_setup_contract_infra.py -q && py -3.12 scripts/setup_contract_infra.py --step budget --verify` | ❌ W0 (task creates) | ⬜ pending |
| 2-02-02 | 02 | 1 | CONTRACT-01 | T-02-02-01, T-02-02-06 | private bucket, OAC-only GetObject, no listing, HTTPS | unit + live | `py -3.12 -m pytest scripts/tests/test_setup_contract_infra.py -q && py -3.12 scripts/setup_contract_infra.py --step all --verify` | ❌ W0 (task creates) | ⬜ pending |
| 2-03-01 | 03 | 2 | CONTRACT-02 | T-02-03-01 | embeddings source sha-pinned; PCA reproducible with explained variance | unit | `py -3.12 scripts/check_contract.py --check && py -3.12 -m pytest scripts/tests/test_contract_projection.py -q` | ❌ W0 (task creates) | ⬜ pending |
| 2-03-02 | 03 | 2 | CONTRACT-03, CONTRACT-05 | T-02-03-02, T-02-03-03, T-02-03-05 | fixture v2 one-flag diff; corpus fresh; additive and published-version guards | unit + CI | `py -3.12 scripts/check_contract.py --check --additive && py -3.12 -m pytest scripts/tests/test_contract_fixtures.py -q` | ❌ W0 (task creates) | ⬜ pending |
| 2-04-01 | 04 | 3 | CONTRACT-01 | T-02-04-03 | artifacts verified before pointer; pointer last | unit (moto) | `py -3.12 -m pytest scripts/tests/test_publish_contract.py -q` | ❌ W0 (task creates) | ⬜ pending |
| 2-04-02 | 04 | 3 | CONTRACT-01, CONTRACT-04 | T-02-04-01, T-02-04-02, T-02-04-04, T-02-04-05 | never overwrite; CAS rollback; fixture/dirty/budget refusals | unit (moto) | `py -3.12 -m pytest scripts/tests/test_publish_contract.py -q` | ❌ W0 (task creates) | ⬜ pending |
| 2-04-03 | 04 | 3 | CONTRACT-01 | T-02-04-06 | public verifier: headers, hashes, 403s, no listing | unit | `py -3.12 -m pytest scripts/tests/test_verify_contract_live.py -q` | ❌ W0 (task creates) | ⬜ pending |
| 2-05-01 | 05 | 2 | CONTRACT-04 | T-02-05-03 | stamp written to RESULT and returned as int by /visualize; legacy null | unit (moto) | `py -3.12 -m pytest lambdas/shared/tests/test_contract_stamp.py lambdas/router/tests/test_visualize_stamp.py lambdas/classifier/tests/test_handler.py -q` | ❌ W0 (task creates) | ⬜ pending |
| 2-05-02 | 05 | 2 | CONTRACT-04 | T-02-05-01, T-02-05-02 | model-mismatch guard; schema-valid stamps; package members | unit | `py -3.12 -m pytest lambdas/shared/tests/test_contract_stamp.py lambdas/classifier/tests/test_handler.py -q` | ✅ (extends) | ⬜ pending |
| 2-06-01 | 06 | 4 | CONTRACT-01 | T-02-06-01 | publish only after decision/standing approval and dry-run | manual | `py -3.12 scripts/publish_contract.py --version 1 --dry-run` | n/a | ⬜ pending |
| 2-06-02 | 06 | 4 | CONTRACT-01, CONTRACT-02, CONTRACT-03 | T-02-06-02 | live bytes equal git; caching/CORS headers correct | live | `py -3.12 scripts/verify_contract_live.py --expect-latest 1 && py -3.12 scripts/check_contract.py --check --additive` | ✅ (02-04) | ⬜ pending |
| 2-06-03 | 06 | 4 | CONTRACT-01 | T-02-06-04 | rollback rehearsed; log has no secrets | live dry-run | `py -3.12 scripts/publish_contract.py --set-latest 1 --dry-run` | ✅ (02-04) | ⬜ pending |
| 2-07-01 | 07 | 3 | CONTRACT-01 | T-02-07-SC | zod pinned only after legitimacy check (checkpoint) | manual | `npm view zod@4.4.3 version repository.url scripts.postinstall` | n/a | ⬜ pending |
| 2-07-02 | 07 | 3 | CONTRACT-01, CONTRACT-05 | T-02-07-01, T-02-07-02, T-02-07-04 | sha256-verified, Zod-parsed fetch; uri guard; adapter parity | unit + e2e | `cd dashboard-next && npx vitest run tests/unit/contract-legacy-adapter.test.ts tests/unit/contract-client.test.ts` | ❌ W0 (task creates) | ⬜ pending |
| 2-07-03 | 07 | 3 | CONTRACT-01 | T-02-07-05 | Zod verdicts equal Python verdicts; base URL synced | unit | `cd dashboard-next && npx vitest run tests/unit/contract-schema-parity.test.ts` | ❌ W0 (task creates) | ⬜ pending |
| 2-08-01 | 08 | 4 | CONTRACT-04 | T-02-08-01, T-02-08-02 | ?cv pins exactly; invalid/missing shown, no fallback | unit + e2e | `cd dashboard-next && npx vitest run tests/unit/contract-pin.test.tsx && npx playwright test --project=e2e contract-pin` | ❌ W0 (task creates) | ⬜ pending |
| 2-08-02 | 08 | 4 | CONTRACT-03 | T-02-08-03 | flipped latest picked up without reload/rebuild | unit + e2e | `cd dashboard-next && npx vitest run tests/unit/contract-flip.test.tsx && npx playwright test --project=e2e contract-flip` | ❌ W0 (task creates) | ⬜ pending |
| 2-09-01 | 09 | 5 | CONTRACT-01, CONTRACT-05 | T-02-09-01 | /sites reads only contract data | unit + e2e | `cd dashboard-next && npx vitest run tests/unit/sites-page.test.tsx && npx playwright test --project=e2e routes` | ✅ (rewrites) | ⬜ pending |
| 2-09-02 | 09 | 5 | CONTRACT-01 | — | every page/component repointed; no backend /sites calls | unit + e2e | `cd dashboard-next && npm test && npx playwright test --project=e2e` | ✅ | ⬜ pending |
| 2-09-03 | 09 | 5 | CONTRACT-05 | T-02-09-02, T-02-09-04 | only sites baselines change; 30 hash-identical | visual (CI) | `gh run list --branch redesign/v2-discovery --limit 1 --json conclusion --jq ".[0].conclusion"` | ✅ | ⬜ pending |
| 2-10-01 | 10 | 6 | CONTRACT-04 | T-02-10-01, T-02-10-02 | results show exact contract version or pre-contract | unit + e2e | `cd dashboard-next && npx vitest run tests/unit/results-components.test.tsx && npx playwright test --project=e2e analysis-flow` | ✅ (extends) | ⬜ pending |
| 2-10-02 | 10 | 6 | CONTRACT-01 | T-02-10-03 | lint + grep fence with planted-violation proof | unit + lint | `cd dashboard-next && npx vitest run tests/unit/contract-fence.test.ts && npm run lint && node ../scripts/check-contract-fence.mjs` | ❌ W0 (task creates) | ⬜ pending |
| 2-11-01 | 11 | 7 | CONTRACT-04 | T-02-11-01, T-02-11-02, T-02-11-03 | scripted deploy; serial live stamped analyses | unit + live | `py -3.12 -m pytest scripts/tests/test_publish_tools.py -q && py -3.12 scripts/verify_live_truth.py` | ✅ (extends) | ⬜ pending |
| 2-11-02 | 11 | 7 | CONTRACT-04 | T-02-11-04 | all four functions match git | live | `py -3.12 scripts/drift-check.py --function all` | ✅ | ⬜ pending |
| 2-12-01 | 12 | 8 | CONTRACT-01, CONTRACT-04, CONTRACT-05 | T-02-12-01 | real browser reads live CDN contract; pin and not-found | live e2e | `cd dashboard-next && PW_LIVE_BASE_URL=http://localhost:3200 npx playwright test -c playwright.live.config.ts tests/e2e/contract-live.spec.ts` | ❌ W0 (task creates) | ⬜ pending |
| 2-12-02 | 12 | 8 | CONTRACT-01..05 | T-02-12-02, T-02-12-03 | final sweep and exit evidence | live + CI | `py -3.12 scripts/check_contract.py --check --additive && py -3.12 scripts/verify_contract_live.py --expect-latest 1 && py -3.12 scripts/drift-check.py --function all` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test frameworks already exist (Phase 1). Each test file below is created by the task that needs it (tdd="true", tests first), not by a separate scaffold wave:

- [ ] `jsonschema==4.26.0` in `requirements-dev.txt` (02-01 Task 1-2, after legitimacy checkpoint) — CONTRACT-01/02
- [ ] `zod@4.4.3` in `dashboard-next/package.json` (02-07 Task 1-2, after legitimacy checkpoint) — CONTRACT-01
- [ ] `scripts/tests/test_contract_{sites,model,bundle}.py` (02-01), `test_contract_{projection,fixtures}.py` (02-03), `test_setup_contract_infra.py` (02-02), `test_publish_contract.py`, `test_verify_contract_live.py` (02-04)
- [ ] `lambdas/shared/tests/test_contract_stamp.py`, `lambdas/router/tests/test_visualize_stamp.py` (02-05)
- [ ] `dashboard-next/tests/unit/support/contract-fetch.ts`, `contract-{legacy-adapter,client,schema-parity}.test.ts` (02-07), `contract-{pin,flip}.test.tsx` (02-08), `contract-fence.test.ts` (02-10)
- [ ] `dashboard-next/tests/e2e/contract-{pin,flip}.spec.ts` (02-08), `contract-live.spec.ts` (02-12); `mockContract()` in `tests/e2e/support/mock-api.ts` (02-07)
- [ ] CI steps: `build_contract.py --check` and `check_contract.py --check --additive` (02-03), `check-contract-fence.mjs` (02-10)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Package legitimacy for jsonschema and zod | CONTRACT-01 | Blocking human-verify gate (SUS seam verdicts); satisfied by the owner standing approval plus registry cross-check | 02-01 Task 1, 02-07 Task 1: run the npm/PyPI checks, record the approval basis in SUMMARY |
| Approve the one-way v1 publish | CONTRACT-01 | Published bytes are permanent | 02-06 Task 1: show dry-run output; record decision or standing approval |
| Budget alert email actually arrives | CONTRACT-01 (budget precondition) | AWS sends alerts only when a threshold is crossed; no test-send API | Owner confirms receipt the first time an alert fires; automated check covers budget, thresholds and EMAIL subscriber existence (`setup_contract_infra.py --step budget --verify`) |
| Visual diff of the sites baselines is only the irma_eastern_sambo location row | CONTRACT-05 | Image judgement | 02-09 Task 3: inspect the CI diff and the regenerated PNGs; the other 30 baselines are hash-compared automatically |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (the three checkpoint tasks are manual by design and each is followed by an automated task)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (each test file is created by the task that needs it)
- [x] No watch-mode flags (`vitest run`, `playwright test`, `pytest`)
- [ ] Feedback latency < 60s per task (Python and vitest subsets; tasks that need `next build`/Playwright are wave-level) — confirm during execution
- [ ] `nyquist_compliant: true` set in frontmatter (set by validate-phase after execution)

**Approval:** {pending / approved YYYY-MM-DD}
