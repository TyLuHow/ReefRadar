---
phase: 5
slug: preprocessing-parity-grouped-evaluation
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-12
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 05-RESEARCH.md "Validation Architecture", plus the 05-CONTEXT.md amendments after research (successor-model retrain, wrapper normalization, binary transport, binary-safe packaging).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.1 (Python, `-m "not live"` by default; `live` tests opt-in); Vitest 5 for the contract Zod mirror; Playwright only if a web contract test needs it |
| **Config file** | `pytest.ini` (`testpaths = lambdas scripts/tests`, `pythonpath = scripts lambdas/shared`); `dashboard-next/vitest.config.ts` |
| **Quick run command** | `py -3.12 -m pytest <touched test file> -x` (for example `lambdas/shared/tests/test_reef_audio.py`) |
| **Full suite command** | `py -3.12 -m pytest && py -3.12 scripts/build_contract.py --version 1 --check && py -3.12 scripts/build_contract.py --version 2 --check && py -3.12 scripts/check_contract.py --check --additive && py -3.12 scripts/check_contract.py --published-history`, then in `dashboard-next`: `npm test` |
| **Estimated runtime** | quick file 2 to 30 s (resampler tests use 30 s signals); full pytest about 90 s; LOSO reproduce test about 5 s; web unit suite about 60 s |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched module
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite green in CI (python, web, e2e, visual), then the live rollout checks
- **Max feedback latency:** 30 seconds per task (quick command)

---

## Per-Task Verification Map

Filled by the planner (2026-10-12). Task ID = `<plan>-T<n>`. "W0" means the test file is created by that task (no prior file); "extend" means an existing test file gains cases. Live rows run only in their live plans.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-T1 | 05-01 | 1 | ML-01, ML-08 | T-05-01-01 | binary package members byte-identical to source | unit | `py -3.12 -m pytest scripts/tests/test_lambda_packaging.py -x -q` | extend | ⬜ pending |
| 05-01-T2 | 05-01 | 1 | ML-01 | T-05-01-02, T-05-01-03 | --ref rollback and drift-check apply the same binary rule | unit | `py -3.12 -m pytest scripts/tests/test_deploy_lambdas.py scripts/tests/test_drift_check.py scripts/tests/test_lambda_packaging.py -x -q` | extend | ⬜ pending |
| 05-02-T1 | 05-02 | 1 | ML-01 | T-05-02-SC | scipy 1.13.1 legitimacy evidence and owner approval recorded before install | checkpoint (blocking-human) | n/a (PyPI and resolver evidence in SUMMARY) | n/a | ⬜ pending |
| 05-02-T2 | 05-02 | 1 | ML-01 | T-05-02-03 | silent window stays zeros, no NaN; stdlib+NumPy only | unit | `py -3.12 -m pytest lambdas/shared/tests/test_reef_audio.py -x -q -k "window or normalise or spec_version or imports"` | W0 | ⬜ pending |
| 05-02-T3 | 05-02 | 1 | ML-01 | T-05-02-01, T-05-02-02 | resampler bounded and streamed | unit | `py -3.12 -m pytest lambdas/shared/tests/test_reef_audio.py -x -q -k "resample or alias"` | W0 | ⬜ pending |
| 05-03-T1 | 05-03 | 1 | ML-03, ML-08 | T-05-03-01, T-05-03-02 | fixture version cannot collide with a real contract | unit + script | `py -3.12 -m pytest scripts/tests/test_contract_fixtures.py -x -q && py -3.12 scripts/build_contract.py --version 1 --check && py -3.12 scripts/check_contract.py --check --additive` | extend | ⬜ pending |
| 05-03-T2 | 05-03 | 1 | ML-03, ML-08 | T-05-03-01 | unit fetch harness serves the fixture only at version 99 | unit (web) | `cd dashboard-next && npx vitest run tests/unit/contract-client.test.ts tests/unit/contract-flip.test.tsx tests/unit/contract-pin.test.tsx tests/unit/contract-published.test.ts && npm run typecheck` | extend | ⬜ pending |
| 05-03-T3 | 05-03 | 1 | ML-03, ML-08 | T-05-03-01 | e2e mock serves real versions from the bucket | e2e | `cd dashboard-next && npx playwright test --project=e2e tests/e2e/contract-flip.spec.ts tests/e2e/contract-pin.spec.ts tests/e2e/analysis-flow.spec.ts` | extend | ⬜ pending |
| 05-04-T1 | 05-04 | 1 | ML-03 | T-05-04-01 | inputs refused on sha256 mismatch; folds never leak the held-out site | unit | `py -3.12 -m pytest scripts/tests/test_loso_eval.py -x -q -k fold` | W0 | ⬜ pending |
| 05-04-T2 | 05-04 | 1 | ML-03 | T-05-04-02 | seeded RandomState bootstrap; not-estimable rule | unit | `py -3.12 -m pytest scripts/tests/test_loso_eval.py -x -q -k bootstrap` | W0 | ⬜ pending |
| 05-05-T1 | 05-05 | 2 | ML-01, ML-02 | T-05-05-03 | malformed sidecars rejected; segments hash carried | unit | `py -3.12 -m pytest lambdas/shared/tests/test_reef_audio.py -x -q -k "transport or sidecar"` | extend | ⬜ pending |
| 05-05-T2 | 05-05 | 2 | ML-01 | T-05-05-01 | hostile headers refused before payload or filter work | unit | `py -3.12 -m pytest lambdas/shared/tests/test_reef_audio.py -x -q -k decode` | extend | ⬜ pending |
| 05-05-T3 | 05-05 | 2 | ML-01 | T-05-05-02, T-05-05-04 | no non-finite level; playback copy clips | unit | `py -3.12 -m pytest lambdas/shared/tests/test_reef_audio.py -x -q` | extend | ⬜ pending |
| 05-06-T1 | 05-06 | 2 | ML-02, ML-08 | T-05-06-01, T-05-06-03 | additive-only result schema, Zod verdict parity | unit + script + unit (web) | `py -3.12 -m pytest scripts/tests/test_contract_schemas_v2.py scripts/tests/test_contract_fixtures.py -x -q && py -3.12 scripts/check_contract.py --check --additive && cd dashboard-next && npx vitest run tests/unit/contract-schema-parity.test.ts` | W0 | ⬜ pending |
| 05-06-T2 | 05-06 | 2 | ML-03 | T-05-06-02 | contract refuses a model paired with a spec it was not trained under | unit + script | `py -3.12 -m pytest scripts/tests/test_contract_schemas_v2.py -x -q && py -3.12 scripts/check_contract.py --check --additive && py -3.12 scripts/check_contract.py --published-history` | extend | ⬜ pending |
| 05-06-T3 | 05-06 | 2 | ML-03, ML-06 | T-05-06-03 | report and OOD schemas mirrored with verdict parity | unit + unit (web) | `py -3.12 -m pytest -q && cd dashboard-next && npm test && npm run typecheck && npm run lint` | extend | ⬜ pending |
| 05-07-T1 | 05-07 | 3 | ML-01, ML-02 | T-05-07-02 | live handler writes binary segments with sha256 sidecar | integration (moto) | `py -3.12 -m pytest lambdas/preprocessor/tests/test_handler.py scripts/tests/test_contract_model.py -x -q` | W0 | ⬜ pending |
| 05-07-T2 | 05-07 | 3 | ML-01 | T-05-07-01, T-05-07-04 | live == offline bit-identical; typed ERROR items; no audio under public/ | integration (moto) | `py -3.12 -m pytest lambdas/preprocessor/tests -x -q` | W0 | ⬜ pending |
| 05-08-T1 | 05-08 | 3 | ML-01, ML-03 | T-05-08-01..05 | serial, identity-checked, alignment-checked client; no AWS without --confirm | unit (stubs) | `py -3.12 -m pytest scripts/tests/test_surfperch_client.py scripts/tests/test_reembed_training.py -x -q` | W0 | ⬜ pending |
| 05-08-T2 | 05-08 | 3 | ML-01 | T-05-08-02 | fixture check refuses changed windows | unit (stubs) | `py -3.12 -m pytest scripts/tests/test_reembed_training.py scripts/tests/test_surfperch_client.py -x -q` | extend | ⬜ pending |
| 05-09-T1 | 05-09 | 3 | ML-02 | T-05-09-04, T-05-09-05 | per-window probabilities, Dynamo-safe types, hash-verified bundled model | integration (moto) | `py -3.12 -m pytest lambdas/classifier/tests/test_handler.py lambdas/shared/tests/test_reef_reference.py -x -q -k "window or served_model or validate or convert"` | extend + W0 | ⬜ pending |
| 05-09-T2 | 05-09 | 3 | ML-02 | T-05-09-01..03 | legacy segments refused; integrity and alignment errors; stamp requires spec match | integration (moto) | `py -3.12 -m pytest lambdas/classifier/tests/test_handler.py lambdas/shared/tests/test_contract_stamp.py -x -q` | extend | ⬜ pending |
| 05-09-T3 | 05-09 | 3 | ML-02 | T-05-09-06 | /visualize legacy keys unchanged; additive keys only when present | integration (moto) | `py -3.12 -m pytest lambdas/router/tests scripts/tests/test_lambda_packaging.py lambdas/classifier/tests -x -q` | extend | ⬜ pending |
| 05-10-T1 | 05-10 | 4 | ML-08, ML-02 | T-05-10-01, T-05-10-03 | reference data hash-verified; top-3 legacy shape for all 48 sites | unit + integration | `py -3.12 -m pytest lambdas/classifier/tests lambdas/shared/tests/test_reef_reference.py -x -q -k "similarity or reference_set or window"` | W0 | ⬜ pending |
| 05-10-T2 | 05-10 | 4 | ML-06, ML-08 | T-05-10-02, T-05-10-04 | probabilities identical with and without OOD; 120-window item under 400 KB | unit + integration | `py -3.12 -m pytest lambdas/classifier/tests lambdas/shared/tests -x -q` | extend | ⬜ pending |
| 05-11-T1 | 05-11 | 4 | ML-03 | T-05-11-01, T-05-11-02 | account and budget checked; one serial invoke | live (manual script) | `py -3.12 scripts/reembed_training.py --limit 1 --confirm --out-dir data/training/reembed-tracer` then the plan's verify one-liner | n/a | ⬜ pending |
| 05-11-T2 | 05-11 | 4 | ML-03, ML-06 | T-05-11-03 | re-embedded rows pinned by sha256 | live + unit | `py -3.12 -m pytest scripts/tests/test_reembedded_inputs.py -x -q` | W0 | ⬜ pending |
| 05-11-T3 | 05-11 | 4 | ML-01 | T-05-11-03 | fixture tied to current windows; live tolerance met twice | unit + live | `py -3.12 -m pytest lambdas/preprocessor/tests/test_embedding_fixture.py -x -q && py -3.12 -m pytest -m live lambdas/preprocessor/tests/test_embedding_fixture_live.py -q` | W0 | ⬜ pending |
| 05-12-T1 | 05-12 | 5 | ML-03 | T-05-12-01, T-05-12-03 | successor reproducible from pinned inputs | unit | `py -3.12 -m pytest scripts/tests/test_train_successor.py scripts/tests/test_train_interim_real_only.py -x -q` | W0 | ⬜ pending |
| 05-12-T2 | 05-12 | 5 | ML-06 | T-05-12-04 | OOD threshold self-check from its own rows | unit + script | `py -3.12 -m pytest scripts/tests/test_build_ood_reference.py -x -q && py -3.12 scripts/build_ood_reference.py --check` | W0 | ⬜ pending |
| 05-12-T3 | 05-12 | 5 | ML-03 | T-05-12-02 | archive mode never touches live models/ keys | unit (moto) | `py -3.12 -m pytest scripts/tests/test_publish_model_archive.py scripts/tests/test_publish_tools.py -x -q` | W0 | ⬜ pending |
| 05-13-T1 | 05-13 | 6 | ML-03 | T-05-13-01, T-05-13-03 | report schema-valid, inputs pinned, reproducible | unit (slow) | `py -3.12 -m pytest scripts/tests/test_loso_eval.py -x -q -k "report or reproduces"` | extend | ⬜ pending |
| 05-13-T2 | 05-13 | 6 | ML-03 | T-05-13-02 | chance statements computed from intervals; withdrawn figures | unit + script | `py -3.12 -m pytest scripts/tests/test_loso_eval.py -x -q && node scripts/check-citations.mjs --scope docs` | extend | ⬜ pending |
| 05-14-T1 | 05-14 | 7 | ML-01, ML-03, ML-06, ML-08 | T-05-14-02, T-05-14-03 | v2 reuses v1 by uri; honest gap wording | unit + script | `py -3.12 -m pytest scripts/tests/test_build_contract_v2.py -x -q && py -3.12 scripts/build_contract.py --version 2 --check && py -3.12 scripts/build_contract.py --version 1 --check` | W0 | ⬜ pending |
| 05-14-T2 | 05-14 | 7 | ML-03, ML-06 | T-05-14-01 | cross-artifact links verified | unit + script | `py -3.12 -m pytest scripts/tests/test_build_contract_v2.py -x -q && py -3.12 scripts/check_contract.py --check --additive && py -3.12 scripts/check_contract.py --published-history` | extend | ⬜ pending |
| 05-14-T3 | 05-14 | 7 | ML-08 | T-05-14-01 | corpus on v2; CI rebuild check | unit + unit (web) | `py -3.12 -m pytest -q && py -3.12 scripts/check_contract.py --check --additive && cd dashboard-next && npx vitest run tests/unit/contract-schema-parity.test.ts tests/unit/contract-published.test.ts` | extend | ⬜ pending |
| 05-15-T1 | 05-15 | 8 | ML-01, ML-02, ML-06, ML-08 | T-05-15-01, T-05-15-02 | package as deployed yields a v2-stamped full result | integration (subprocess + moto) | `py -3.12 -m pytest lambdas/classifier/tests/test_bundled_e2e.py lambdas/shared/tests scripts/tests/test_lambda_packaging.py lambdas/classifier/tests/test_handler.py -x -q` | W0 | ⬜ pending |
| 05-15-T2 | 05-15 | 8 | ML-02, ML-08 | T-05-15-04 | live checks assert legacy shapes and new fields | unit | `py -3.12 -m pytest scripts/tests/test_publish_tools.py -x -q` | extend | ⬜ pending |
| 05-15-T3 | 05-15 | 8 | ML-01 | T-05-15-03 | live embeddings compared read-only, UUID-validated key | unit (moto) | `py -3.12 -m pytest scripts/tests/test_verify_live_embeddings.py -x -q && py -3.12 -m pytest -q` | W0 | ⬜ pending |
| 05-16-T1 | 05-16 | 9 | ML-03, ML-06, ML-08 | T-05-16-01 | one-way publish decided with the frozen content shown | checkpoint (decision) | n/a | n/a | ⬜ pending |
| 05-16-T2 | 05-16 | 9 | ML-03, ML-06, ML-08 | T-05-16-01, T-05-16-02, T-05-16-05 | create-only writes, pointer last, live keys unchanged | live | `py -3.12 scripts/verify_contract_live.py --expect-latest 2` | n/a | ⬜ pending |
| 05-16-T3 | 05-16 | 9 | ML-08 | T-05-16-03, T-05-16-04 | published.ts mirrors PUBLISHED.json; no credentials logged | unit (web) + script | `cd dashboard-next && npx vitest run tests/unit/contract-published.test.ts tests/unit/contract-schema-parity.test.ts && cd .. && py -3.12 scripts/check_contract.py --published-history` | extend | ⬜ pending |
| 05-17-T1 | 05-17 | 10 | ML-01, ML-02, ML-06, ML-08 | T-05-17-01..04 | CI-green clean deploy, ordered, proven rollback refs | live | `py -3.12 scripts/verify_live_truth.py` | n/a | ⬜ pending |
| 05-17-T2 | 05-17 | 10 | ML-01, ML-02 | T-05-17-01 | live embedding parity; legacy item unchanged; drift MATCH | live | `py -3.12 scripts/drift-check.py --function all` (plus verify_live_embeddings.py) | n/a | ⬜ pending |
| 05-17-T3 | 05-17 | 10 | ML-02 | T-05-17-05 | rollback documented; no credentials in logs | script | `grep -q "set-latest 1" docs/deploy/DEPLOY-LOG.md && py -3.12 -m pytest -q` | n/a | ⬜ pending |

Sampling continuity: no three consecutive code tasks lack an automated command; the only command-less rows are the two checkpoints (05-02-T1, 05-16-T1).

### Requirement → test map (from research)

| Req | Behavior | Type | Command |
|-----|----------|------|---------|
| ML-01 | decode matrix (PCM 8/16/24/32, float32/64, mono/stereo/multichannel, WAVE_FORMAT_EXTENSIBLE, odd chunk padding, truncated data, bad rates rejected) | unit | `pytest lambdas/shared/tests/test_reef_audio.py -k decode` |
| ML-01 | polyphase resampler equals scipy float64 within 1e-12 and float32 within 2e-6 at 8/11.025/16/22.05/44.1/48/96 kHz; output length equals scipy's | unit | `-k resample` |
| ML-01 | anti-alias: 48 kHz 20 kHz tone ≤ -50 dBFS; 96 kHz 24 kHz tone ≤ -60 dBFS | unit | `-k alias` |
| ML-01 | wrapper normalization: per-window mean 0, peak 0.25, silent window stays zeros with no NaN, dBFS fields finite or null-plus-flag | unit | `-k normalise` |
| ML-01 | windows = floor(n/160000), trailing partial dropped, byte-deterministic across runs | unit | `-k window` |
| ML-01 | live preprocessor under moto equals the offline function bit for bit on the 9 excerpts plus generated edge WAVs (generated in `tmp_path`, never under `public/`) | integration | `pytest lambdas/preprocessor/tests/test_parity.py` |
| ML-01 | recorded embedding fixture: file sha256 and per-window sha256 equal fresh `reef_audio` windows | unit | `pytest lambdas/preprocessor/tests/test_embedding_fixture.py` |
| ML-01 | fixture regeneration via the live inference Lambda: cosine ≥ 0.99999, max abs ≤ 1e-5 | live | `pytest -m live lambdas/preprocessor/tests/test_embedding_fixture_live.py` |
| ML-01 | packaging: zips contain `reef_audio.py`; binary members (`embeddings.f32`, `.npz`, OOD artifact) byte-identical to source | unit | `pytest scripts/tests/test_lambda_packaging.py -k binary` |
| ML-02 | per-window probabilities sum to 1 within 1e-8; recording probabilities are their mean; label argmax; confidence max; `aggregation == 'mean_of_window_probabilities'` | integration (moto, stubbed inference) | `pytest lambdas/classifier/tests/test_handler.py -k window` |
| ML-02 | inference embedding-count mismatch raises a typed error | integration | `-k alignment` |
| ML-02 | binary `segments.f32` and legacy JSON segments both accepted; legacy input stamped `uncovered` | integration | `-k segment_format` |
| ML-02 | RESULT item at 120 windows under 400 KiB; NumPy scalars converted; stamp requires model and `reef_audio.SPEC_VERSION` match | unit/integration | `-k "stamp or item_size"`; `pytest lambdas/shared/tests/test_contract_stamp.py` |
| ML-02 | router `/visualize` returns new keys only when present; legacy-only items return exactly the legacy key set | integration | `pytest lambdas/router/tests/test_visualize_stamp.py` |
| ML-08 | `site_similarities` has 48 entries in contract row order, plus 6 location-only sites marked no-embedding; `similar_sites` top-3 keeps the old entry shape | unit | `-k similarity` |
| ML-08 | projection of each reference vector reproduces the published site x,y within 2e-6; explained variance equals `projection.json` | unit | `-k projection` |
| ML-06 | OOD distance = 1 - max cosine to reference windows; the threshold is returned with each distance; probabilities identical with and without OOD | unit | `-k ood` |
| ML-06 | OOD artifact self-check: stored threshold equals the recomputed LOSO 95th percentile; sha256 matches | unit | `pytest scripts/tests/test_build_ood_reference.py` |
| ML-03 | folds: held-out site never in training; ind_N1 flagged "class absent from the training fold"; seeded determinism; metrics recompute from stored predictions | unit | `pytest scripts/tests/test_loso_eval.py` |
| ML-03 | bootstrap: seeded repeatability (RandomState), interval brackets the point estimate on separable synthetic data, n_sites < 2 gives "not estimable", undefined-replicate fraction reported | unit | `-k bootstrap` |
| ML-03 | committed report validates against `evaluation-report.schema.json`; input sha256s match committed inputs; old split accuracy marked invalid; report covers both the original and the successor model | unit | `-k report` |
| ML-03 | committed report regenerates from committed inputs within tolerance | unit (slow) | `-k reproduces` |
| ML-03/ML-06 | successor model: retrained with the exact recipe and seed on the re-embedded rows; weights sha256 recorded; serves only with `reef_audio` | unit | `pytest scripts/tests/test_train_successor.py` |
| contract | v2 builds and checks, additive, parity corpus current, published history intact, fixture sentinel version not colliding | script | `build_contract.py --version 2 --check`; `check_contract.py --check --additive`; `--published-history` |
| contract | Zod mirror parity for the extended `analysis-result` and new schemas; `published.ts` mirrors PUBLISHED.json | unit (web) | `cd dashboard-next && npm test -- contract-schema-parity contract-published` |

---

## Wave 0 Requirements

- [ ] Binary-safe packaging fix (`scripts/lambda_packaging.py`, `scripts/deploy-lambdas.py`) before any binary member is added
- [ ] `lambdas/shared/tests/test_reef_audio.py`: ML-01 decode, resample, normalise, window
- [ ] `lambdas/shared/tests/test_reef_reference.py`: bundled data loading and hash check
- [ ] `lambdas/preprocessor/tests/` (new directory): handler, parity, embedding fixture
- [ ] `lambdas/classifier/tests/` additions: per-window, alignment, formats, similarity, projection, OOD, item size
- [ ] `scripts/tests/test_loso_eval.py`, `test_build_ood_reference.py`, `test_build_contract_v2.py`, `test_train_successor.py`
- [ ] Drift probe: old-vs-new embedding cosine on the 100 training files, recorded before any deploy
- [ ] Embedding fixture (about 54 × 1280 float32 plus window hashes, committed with sha256), produced via the live inference Lambda
- [ ] `requirements-dev.txt`: `scipy==1.13.1`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Re-embedding the 100 training files through `reef_audio` and the live inference Lambda | ML-03, ML-06 | Calls AWS and figshare; costs cents; run once | `py -3.12 scripts/reembed_training.py --confirm` (serial; inference pre-warmed) |
| Contract v2 publish | ML-02, ML-08 | Writes the public contract bucket; gated on the budget alarm | publisher `--dry-run`, then `--confirm` from a clean tree; then commit PUBLISHED.json and published.ts |
| Production rollout of the successor model and pipeline | ML-02, ML-06, ML-08 | Changes live production output | `deploy-lambdas.py --dry-run` per function → `--confirm` (classifier and router, then preprocessor) → pre-warm → `verify_live_truth.py` (legacy keys unchanged in shape, new keys and v2 stamp present) → `drift-check.py --function all` MATCH; rollback with `--ref` on any failure; DEPLOY-LOG entry |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
