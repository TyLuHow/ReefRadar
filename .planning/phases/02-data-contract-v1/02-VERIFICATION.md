---
phase: 02-data-contract-v1
verified: 2026-10-02T09:30:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
gaps: []
deferred: []
human_verification: []
advisories:
  - "Housekeeping only: .planning/REQUIREMENTS.md still shows CONTRACT-03 and CONTRACT-05 as unchecked and 'Pending' (traceability rows lines 228 and 230); ROADMAP.md line 61 still shows the Phase 2 checkbox unchecked. Implementation evidence satisfies both requirements; update the bookkeeping when the phase is closed."
  - "Owner-decision context, not a gap: the deployed production frontend (and the Vercel preview) does not read the contract yet. The production frontend merge is on hold by owner decision; the contract-reading UI exists on branch redesign/v2-discovery and was proven in a local production build."
  - "Owner decision 2026-10-02 honoured: CORS OPTIONS preflight returns 403 by design; verifier reports it as 3 WARN lines; contract-no-preflight.test.ts guards that the client never sends custom headers."
  - "6 of 54 sites (4 SanctSound, 2 Hurricane Irma) have label_definition null and status 'unknown' because the upstream dataset assigns no health label; the Site schema forces a non-empty status_basis explaining why, and label_assigned_by is populated for all 54."
---

# Phase 2: Data Contract v1 Verification Report

**Phase Goal:** The web app reads all reference data from one versioned, immutable contract, so UI phases build against fixtures while the Data & ML track publishes later versions without blocking them.
**Verified:** 2026-10-02
**Status:** passed
**Re-verification:** No, initial verification
**Branch / head:** `redesign/v2-discovery` at `ebec22f` (working tree clean). CI run 36985662946 on this head: success.

Stance: SUMMARY and PHASE-2-EXIT claims were treated as unproven. Each success criterion was re-checked against the live CDN, the live API, the committed code and freshly executed local checks.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Contract v1 (dataset, model, preprocessing-spec versions plus schemas) is published to CDN-served storage; the app gets site/reference data only from it; a lint fence fails any module other than the contract module that fetches contract artifacts | VERIFIED | Live: `verify_contract_live.py --expect-latest 1` exit 0, "OK: contract verified live". Pointer `contract/latest.json` names v1 (curl). Manifest v1 served with `dataset_version reefradar-reference-2026.10.0`, `model_version interim-real-only`, `preprocessing_spec_version preproc-2026.10.0-as-deployed`; every artifact and the 7 schemas sha256-equal the manifest, `public, max-age=31536000, immutable`; pointer `max-age=60`; direct S3 403; nonexistent version 403; CDN root not a listing. Fence: `.eslintrc.json` override (`no-restricted-syntax` on contract URL / env var, `no-restricted-imports` on deep imports and fixtures) excluding only `src/features/contract/**`; `check-contract-fence.mjs` exit 0 (90 files); `contract-fence.test.ts` plants violations and proves they fail outside and pass inside; CI web job runs `npm run lint` and the fence script. Grep of `src/` outside the contract module finds no cloudfront / CONTRACT_BASE_URL / `contract/latest` / `SITE_COORDINATES` / `getSites`. |
| 2 | All 54 sites carry source, DOI, licence, label definition, label assigner, acoustic-reference vs location-only; the 48 embedded sites carry honest PCA coordinates with explained variance | VERIFIED | Live `v1/sites.json`: 54 sites, 0 synthetic; every site has `dataset_id`/source name, `licence`, `label_assigned_by`, `reference_role` (48 `acoustic_reference`, 6 `location_only`). DOI present for 50; the 4 SanctSound sites have `doi: null` plus `url https://sanctsound.ioos.us/` plus a stated `doi_note` (owner decision: satisfies criterion). Label definition present for 48; for the 6 with none upstream (4 SanctSound, 2 Irma) `site.schema.json` forces `status: unknown` and a non-empty `status_basis` (an if/then rule), so absence is stated, not hidden. Projection: live `v1/projection.json` method `pca`, `explained_variance_ratio [0.18310361, 0.14682953]`, cumulative 0.32993314 (33.0%), 48 coordinates, mean (1280) and components published, and a note that plane distance is not embedding distance. `embedding_row`/`projection` populated for exactly 48 sites; `coverage.sites_with_embeddings 48`. Embeddings file 245,760 bytes (48 x 1280 x 4) hash-equal. |
| 3 | Schema declares coverage flags (diel, detections, pre/post event, effort); publishing a fixture contract version with a flag changed is picked up by the running app without a redeploy | VERIFIED | Live manifest `coverage` has `has_diel`, `has_detections`, `has_pre_post_event`, `has_effort` (all false in v1). `contracts/fixtures/latest-v1.json`, `latest-v2.json` and `fixtures/bucket` committed; `check_contract.py --check --additive` exit 0. `hooks.ts` follows `latest.json` with a 60 s refetch (`POINTER_REFRESH_MS`) and keeps the previous version on screen until the next has loaded. `contract-flip.test.tsx` (vitest, in the 252 passing tests) mounts one tree and shows `has_diel` false on v1 then true on v2 after the pointer refetch; `contract-flip.spec.ts` does the same in a running browser without reload (CI e2e job green). Behavior-dependent truth: behavioral tests exist and pass, so VERIFIED rather than presence-only. Live CDN intentionally still serves v1 only (fixture markers are refused by the publisher). |
| 4 | A URL or result pinned to a contract version resolves exactly that version even after a newer version is latest; analysis-result schema carries dataset, model and preprocessing stamps | VERIFIED | `version.ts`/`hooks.ts`: explicit `version` argument wins; `?cv=N` serves exactly N and never requests the pointer; invalid or missing pin is an error, never a fallback to latest. Covered by `contract-pin.test.tsx` (passing) and `contract-pin.spec.ts` (CI); live browser cases `contract-live.spec.ts` 2 and 3 recorded in PHASE-2-EXIT. `contracts/schema/analysis-result.schema.json` is served by the CDN (hash-equal). Live API: GET `/visualize/de0f3271-587e-49f8-9e3a-f157561d21b5` returns `status complete`, `contract_version 1` (integer), `dataset_version reefradar-reference-2026.10.0`, `model_version interim-real-only`, `preprocessing_spec_version preproc-2026.10.0-as-deployed` (this older analysis predates the `stamp_status` field, which the owner reports as "stamped" on the post-review analyses). Lambda code: `lambdas/shared/contract_stamp.py`, classifier `handler.py:822`, router `handler.py:510-515` (int, not 1.0, with a unit test). `drift-check.py --function all`: router, preprocessor, classifier, inference all MATCH git. |
| 5 | The app runs end to end against committed contract fixtures with no dependency on ingestion or ML jobs | VERIFIED | `mockContract()` (installed by `mockApi()`) serves `contracts/bucket` and `contracts/fixtures` from disk to every e2e and visual spec; live specs are `-live` suffixed and excluded from the mocked e2e project. Local: vitest 20 files / 252 tests passed; `tsc --noEmit` exit 0; pytest all passed; `npm run lint` 0 errors (one pre-existing `react-hooks/exhaustive-deps` warning in `LocationCompare.tsx`, unrelated). CI on `ebec22f` (run 36985662946) success. No Data and ML job is referenced by the web contract module. |

**Score:** 5/5 truths verified (0 behavior-unverified, 0 overrides).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `contracts/schema/*.schema.json` (7) | Site, projection, manifest, pointer, model, preprocessing, analysis-result schemas | VERIFIED | Served by CDN and hash-equal to manifest |
| `contracts/bucket/v1/*`, `contracts/PUBLISHED.json` | Immutable v1 bundle and published-hash guard | VERIFIED | PUBLISHED.json records v1 manifest sha256 `c9d520ad...`, equal to the live manifest |
| `contracts/fixtures/*` | v1/v2 pointers, fixture bucket, parity corpus, invalid cases | VERIFIED | `check_contract.py --check --additive` exit 0 |
| `scripts/{build,check,publish,verify_live}_contract.py`, `contract_lib.py`, `setup_contract_infra.py` | Builder, checker, publisher, live verifier, infra | VERIFIED | Run or exercised above; no debt markers |
| `dashboard-next/src/features/contract/*` (12 files, 1368 lines) | Verified client, hooks, schema, pinning, stamp line, legacy adapter | VERIFIED | Substantive and wired; consumed by repointed legacy pages |
| `scripts/check-contract-fence.mjs`, `.eslintrc.json` override | Lint fence | VERIFIED | Exit 0; planted-violation tests pass |
| `lambdas/shared/contract_stamp.py`, classifier and router stamping | Result stamp | VERIFIED | Deployed and drift MATCH; live analysis carries stamp |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Sites page, cards, maps, landing, about, dashboard | contract module | `useContract*` hooks / legacy adapter | WIRED | No `getSites` or `SITE_COORDINATES` left in `src/` |
| `ContractVersionSync` | version store, hooks | `?cv=` param | WIRED | Pin tests pass |
| Results surfaces | `ContractStampLine` | `useContract(N)` for stamp version | WIRED | Unit and `analysis-flow.spec.ts` |
| Router `/visualize` | DynamoDB stamp | classifier writes stamp, router returns int | WIRED | Live response confirmed |
| CI | fence, builder, checker, history guard | `ci.yml` lines 39, 40, 84, 85, 89 | WIRED | |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| `/sites` page | 54 site records | CDN `v1/sites.json` via verified client (sha256 checked against the manifest) | Yes, 54 real records, 0 synthetic | FLOWING |
| Stamp line | `contract_version`, dataset, model, preprocessing | Live `/visualize` -> manifest by version | Yes | FLOWING |
| Projection plane | 48 coordinates | `v1/projection.json` | Yes, 33.0% explained variance disclosed | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Contract served and immutable on CDN | `py -3.12 scripts/verify_contract_live.py --expect-latest 1` | exit 0, 3 report-only preflight WARN lines | PASS |
| Bundles, fixtures, schemas, parity corpus consistent | `check_contract.py --check --additive` | OK | PASS |
| v1 published, bytes guarded | `build_contract.py --version 1 --check` | OK | PASS |
| Fence | `node scripts/check-contract-fence.mjs` | OK, 90 files | PASS |
| Python suite | `py -3.12 -m pytest -q -p no:warnings` | all dots, 100% | PASS |
| Web unit suite | `npx vitest run` | 20 files, 252 tests passed | PASS |
| Types | `npx tsc --noEmit` | exit 0 | PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing warning | PASS |
| Deployed Lambdas equal git | `drift-check.py --function all` | 4 of 4 MATCH | PASS |
| Live stamped result | GET `/visualize/de0f3271-...` | contract_version 1 plus three version stamps | PASS |

Playwright specs were not re-run here (they need a dev/production server); they are covered by CI green on the head commit and by PHASE-2-EXIT's recorded local production-build run (3 of 3 live specs). `verify_live_truth.py` with analyses was deliberately not run (Lambda concurrency).

### Probe Execution

No `probe-*.sh` declared by this phase; the live verifier above serves as the runnable probe. SKIPPED (none declared).

### Requirements Coverage

All five IDs appear in plan frontmatter (02-01 through 02-13) and in REQUIREMENTS.md; no orphans.

| Requirement | Source plans | Status | Evidence |
|-------------|--------------|--------|----------|
| CONTRACT-01 | 02-01, 02-02, 02-03, 02-04, 02-06, 02-07, 02-09, 02-10, 02-12, 02-13 | SATISFIED | Truth 1 |
| CONTRACT-02 | 02-01, 02-03, 02-06, 02-12 | SATISFIED | Truth 2 |
| CONTRACT-03 | 02-03, 02-06, 02-08, 02-12 | SATISFIED | Truth 3. REQUIREMENTS.md checkbox/status not updated (housekeeping) |
| CONTRACT-04 | 02-01, 02-04, 02-05, 02-08, 02-10, 02-11, 02-12 | SATISFIED | Truth 4 |
| CONTRACT-05 | 02-03, 02-07, 02-08, 02-09, 02-12, 02-13 | SATISFIED | Truth 5. REQUIREMENTS.md checkbox/status not updated (housekeeping) |

### Anti-Patterns Found

None blocking. No TBD/FIXME/XXX/TODO/HACK in the contract module, contract scripts, `lambdas/shared`, or the touched Lambda handlers. Deferred AnimatedCounter defect (02-07) is pre-existing and out of scope.

### Owner-Decision Context

- **Production frontend not reading the contract: by owner decision, not a gap.** The merge to main is on hold; the deployed production frontend and the (protected) Vercel preview still show the pre-contract UI. Contract-reading behavior was verified in code, CI, and a local production build against the live CDN. Backend stamping and the CDN are live.
- **CORS preflight 403:** accepted 2026-10-02; the guard test `contract-no-preflight.test.ts` passes.
- **Protected Vercel preview:** live browser specs ran against a local production build of the same commit.
- **SanctSound doi null:** accepted as satisfying criterion 2.

### Human Verification Required

None required for the goal. Optional once the owner lifts the merge hold: confirm the same `/sites/` render and `?cv=` pin behavior on the deployed production URL.

### Gaps Summary

No gaps. All five roadmap success criteria are backed by live-system evidence and freshly executed checks. Residuals already owned by later phases (backend `/sites` header 44 vs 48, `?cv` dropped on legacy navigation, `restored_mid`/`similar_sites_count` carried from Phase 1, Lambda concurrency quota request) do not affect the Phase 2 goal.

---

_Verified: 2026-10-02_
_Verifier: Claude (gsd-verifier)_
