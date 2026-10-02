# Phase 2 exit evidence: Data Contract v1

Recorded 2026-10-02 by plan 02-12 on branch `redesign/v2-discovery`. Evidence only: public URLs, command lines, exit
codes, ids and hashes. No tokens, presigned URLs, account keys, env values or addresses appear here. Nothing was merged
to main and no Vercel production deploy was run.

Phase goal: the web app reads all reference data from one versioned, immutable contract, so UI phases build against
fixtures while the Data & ML track publishes later versions without blocking them.

Contract CDN: `https://d7dr1fzple2sg.cloudfront.net` (distribution `E1SD3UZ4FZ1GWL`). Published manifest
`contract/v1.json`: 7583 bytes, sha256 `c9d520addac040f4e7f2c74dce2678e4b3365779f176f8f90a004bf04db7bcb2`. Pointer
`contract/latest.json` names version 1 (155 bytes, sha256 `9ec73e4a2bab2746d9f0261f9dc162fbda28481ba1c1555899674054ae559b65`).

## Final sweep (2026-10-02, head 5fe5215 plus this plan's commits)

| Command | Exit | Result |
|---|---|---|
| `py -3.12 -m pytest -q` | 0 | all passed |
| `py -3.12 scripts/build_contract.py --version 1 --check` | 0 | v1 published; rebuild comparison skipped, bytes guarded by `contracts/PUBLISHED.json` |
| `py -3.12 scripts/check_contract.py --check --additive` | 0 | bundles, fixtures, schemas and parity corpus consistent |
| `node scripts/check-contract-fence.mjs` | 0 | no contract access outside `src/features/contract` (90 files scanned) |
| `node scripts/check-citations.mjs --scope all` | 0 | schema valid, no banned-pattern hits (395 files) |
| `py -3.12 scripts/verify_contract_live.py --expect-latest 1` | 0 | "OK: contract verified live" (run twice: precondition and after the sweep; 74 PASS, 3 WARN report-only preflight lines) |
| `py -3.12 scripts/verify_live_truth.py --no-analysis` | 0 | `/sites` provenance, `/samples` ids, `/samples` audio real and hash-matched; 0 failures. No new analyses were started |
| `py -3.12 scripts/drift-check.py --function all` | 0 | router, preprocessor, classifier, inference all MATCH git |
| `py -3.12 scripts/setup_contract_infra.py --step all --verify` | 0 | budget, storage and cors checks all ok |

## Success criterion 1: contract v1 on CDN storage; only the contract module fetches it; a lint fence enforces this

| Evidence | Result |
|---|---|
| Contract v1 published: 14 immutable objects then the pointer last, to private bucket `reefradar-2477-contract` behind CloudFront (origin access control, direct S3 returns 403) | `docs/deploy/DEPLOY-LOG.md` "Contract v1 publish"; `contracts/PUBLISHED.json` records version 1 |
| Live verification: pointer `public, max-age=60`; every other object `public, max-age=31536000, immutable`; sha256 of each served object equals the manifest; missing version 403; CDN root not a listing | `verify_contract_live.py --expect-latest 1` exit 0 |
| Fence layer 1: ESLint override (`no-restricted-syntax`, `no-restricted-imports`) on contract URLs, the contract env var, deep imports of module internals and fixtures imports | `npm run lint` in the CI web job; planted-violation tests in `dashboard-next/tests/unit/contract-fence.test.ts` (22 cases) |
| Fence layer 2: `scripts/check-contract-fence.mjs` also fails on the backend sites client call and the old hard-coded coordinate table | exit 0 locally; CI web job step |
| Legacy consumers repointed (sites page, cards, world map, markers, landing, about, dashboard map, mini map); `SITE_COORDINATES` and the client `getSites` deleted | 02-09: `grep -rn SITE_COORDINATES dashboard-next/src` and `grep -rn getSites dashboard-next/src` print 0 lines |
| Real browser, production build of this branch, no env override: `/sites/` renders 54 site cards, `html data-contract-version="1"` and `data-contract-pinned="false"`; `contract/latest.json`, `contract/v1.json`, `v1/sites.json` all 200 with `access-control-allow-origin: *`; no request to the backend `/sites` endpoint | `dashboard-next/tests/e2e/contract-live.spec.ts` case 1, 3 of 3 passed (below) |

Live browser run: `npm run build` (no `NEXT_PUBLIC_CONTRACT_BASE_URL`), `npm run start -- -p 3217`, then
`PW_LIVE_BASE_URL=http://localhost:3217 npx playwright test -c playwright.live.config.ts tests/e2e/contract-live.spec.ts --retries=0`:
3 passed in 6.3 s. The spec file is `-live` suffixed, so it is absent from the mocked `--project=e2e` list
(`npx playwright test --project=e2e --list | grep -c contract-live` prints 0) and never runs in CI.

### Resolved finding: the CDN was not browser-readable (found by this plan's tracer, fixed by 02-13)

First run of `contract-live.spec.ts` (2026-10-02, before the fix): 0 of 3 passed. Headless Chrome reported "blocked by CORS
policy: No 'Access-Control-Allow-Origin' header is present" for `contract/latest.json`, and the page showed "The contract
could not be reached." Cause: with Managed-SimpleCORS, the CDN omitted the header for requests carrying browser headers
such as `Priority`, `Cache-Control: no-cache` or `Pragma`. The older verifier probed with only an `Origin` header, so
`pointer: CORS allows any origin` passed while real Chrome failed.

Fix (plan 02-13, owner-approved 2026-10-01): custom response headers policy `reefradar-2477-contract-cors`
(`837522dc-5a65-4b60-9c61-40d7e84e9741`) attached to `E1SD3UZ4FZ1GWL`; AllowedMethods GET, HEAD, OPTIONS (cached GET, HEAD).
`verify_contract_live.py` now probes browser header profiles (priority, no-cache, chrome); a real-Chromium cross-origin spec
(`contract-cdn-cors-live.spec.ts`) passes in four cache modes. Rollback: `py -3.12 scripts/setup_contract_infra.py --step cors-rollback --confirm`
(dry-run first); details in `DEPLOY-LOG.md`.

Owner decision 2026-10-02 (preflight): OPTIONS preflights still return 403 by design (the CDN relays OPTIONS to S3, which
has no bucket CORS). The verifier's preflight probe is report-only (the 3 WARN lines), and
`dashboard-next/tests/unit/contract-no-preflight.test.ts` guards that the contract client never sends custom headers or a
non-simple request, so it can never need a preflight. Any future client change that adds a header fails that test.

## Success criterion 2: all 54 sites carry full provenance; 48 embedded sites have honest PCA coordinates

| Evidence | Result |
|---|---|
| Contract v1 `v1/sites.json`: 54 Site records, each with source, DOI, licence, label definition, label assigner and acoustic-reference vs location-only status, validated against the Site JSON Schema | 02-01; `check_contract.py --check` exit 0; served bytes hash-equal the manifest |
| Embeddings: 48 real SurfPerch reference embeddings, 245,760-byte float32 file (sha256 `f73ab3a45422d43227ba0006d229fd801a541b3c36138012b42ccb40517816ec`) | 02-03; live verifier artifact `embeddings` PASS |
| Projection: 2-D PCA, explained variance 0.1831 and 0.1468 (33.0% of variance shown), mean and components published | 02-03; artifact `projection` (sha256 `da2ab7cc4142e36e3ff2dccfd10e135d3328f2a10635e63cd77d7046ea026c14`) PASS |
| Browser shows 54 sites from the contract | `contract-live.spec.ts` case 1 (54 cards) and `contract-dashboard.spec.ts` in CI |
| Baseline change from moving to contract data (02-09) | Only `sites-390-visual-linux.png` changed: 56 px taller, exactly one location row for `irma_eastern_sambo`, which the old hard-coded table lacked. The other 32 of 33 PNGs are byte-identical. Regenerated in CI dispatch run 36951802796 |

## Success criterion 3: coverage flags declared; a flag flip is picked up by the running app without a redeploy

| Evidence | Result |
|---|---|
| Manifest `coverage` declares `has_diel`, `has_detections`, `has_pre_post_event`, `has_effort` (all false in v1) | contract schema (02-01); `html data-contract-coverage` lists the true flags |
| Fixture v2 differs from v1 by exactly one flag; fixtures, pointers and a 483-entry schema parity corpus are committed and CI-guarded | 02-03; `check_contract.py --check --additive` exit 0 |
| Unit: one mounted tree shows `has_diel` false on v1, then true on v2 after the 60 s pointer refetch | `dashboard-next/tests/unit/contract-flip.test.tsx` |
| Browser: a running `/dashboard` picks up v2 and `has_diel` without reloading or rebuilding | `dashboard-next/tests/e2e/contract-flip.spec.ts`, in CI e2e job |

The live CDN still serves v1 only; no fixture contract was published (fixture markers are refused by the publisher).

## Success criterion 4: pinned versions resolve exactly; result schema carries version stamps

| Evidence | Result |
|---|---|
| `?cv=N` pins exactly vN and never requests `latest.json`, including when N is the current latest; a missing or malformed pin shows a visible alert and never falls back to latest | 02-08 unit and e2e (`contract-pin.test.tsx`, `contract-pin.spec.ts`) |
| Real browser, live CDN: `/sites/?cv=1` gives `data-contract-pinned="true"` and zero `latest.json` requests; `/sites/?cv=999999` shows "was not found" with zero `latest.json` requests and no site cards | `contract-live.spec.ts` cases 2 and 3, passed |
| Analysis-result schema carries `contract_version` plus dataset, model and preprocessing versions; stamp equals `contracts/bucket/v1/stamp.json` | 02-05 (router and classifier), schema `analysis_result` served by the CDN (sha256 `1c7810236fa4c5398e30f67d950e0946efca8d3a9979edbabc699e48acb1fa32`) |
| Production stamping live (classifier and router deployed from a clean tree, commit `c7215544295a0fd3bd3ea6f5bf958a5e20f9a315`) | 02-11; `drift-check.py --function all` all MATCH |
| Live analyses, serial: `de0f3271-587e-49f8-9e3a-f157561d21b5` (with coordinates) and `762e1327-be27-475f-9c16-ea3cb3e79ea7` (without) | Both returned `contract_version` 1 (integer), dataset `reefradar-reference-2026.10.0`, model `interim-real-only`, preprocessing `preproc-2026.10.0-as-deployed` |
| Web shows the stamp on both results surfaces, resolved with `useContract(N)` even while a newer version is latest; unstamped results read "pre-contract" and make no contract request | 02-10 (`ContractStampLine`), unit and `analysis-flow.spec.ts` |

## Success criterion 5: the app runs end to end on committed fixtures, with no dependency on ingestion or ML jobs

| Evidence | Result |
|---|---|
| `mockContract()` is installed by `mockApi()`: every e2e and visual spec is served the contract from `contracts/bucket` and `contracts/fixtures` on disk; no test reaches a real CloudFront host | 02-07; e2e project 51 passed (02-10) |
| The e2e project does not run the live specs | `--project=e2e --list` has 0 `contract-live` entries; `contract-cdn-cors-live` and `contract-live` are `-live` only |
| CI on head 5fe5215: web (lint, fence, typecheck, unit, build), e2e, python (pytest, contract build and check), citations, visual (33 compared) | https://github.com/TyLuHow/ReefRadar/actions/runs/36979987656 (success) |

The final push of this plan's documentation commits is recorded in `02-12-SUMMARY.md` with its run id.

## Requirements

| Requirement | Evidence |
|---|---|
| CONTRACT-01 versioned immutable contract on CDN storage, the only source for the web app | Criterion 1: publish and live verifier, 14 immutable objects, fence, `contract-live.spec.ts` (no backend `/sites` call) |
| CONTRACT-02 v1 freezes the 54-site data with full provenance | Criterion 2: Site schema, `check_contract.py`, live `sites` artifact hash equals the manifest |
| CONTRACT-03 coverage flags let time features ship dormant and activate on a later publish without a redeploy | Criterion 3: flip unit and e2e tests; fixture v2 one-flag diff |
| CONTRACT-04 results and URLs pin dataset, model and preprocessing versions and resolve that exact version | Criterion 4: `?cv` pin tests (unit, e2e, live browser), live stamped analyses, stamp line in the web app |
| CONTRACT-05 UI development runs on contract fixtures | Criterion 5: `mockContract()`, offline e2e and visual suites, CI green |

## Budget guard (CONTRACT infra, 02-02)

Budget `reefradar-2477-ceiling-25`: 25 USD per month cost budget, three notifications (80% actual, 100% actual, 100%
forecast), one email subscriber each (address deliberately not recorded here). The legacy `reefradar-2477-budget` is absent.
Confirmed by `setup_contract_infra.py --step all --verify` exit 0. The publisher refuses to write when the budget gate fails.

## Production safety (T-02-12-01)

`git branch --show-current` is `redesign/v2-discovery`. `git ls-remote origin refs/heads/main` printed
`416561758b5970406c75e5c463747cbbc67df130` before this plan's work; the same value is recorded after the push in
`02-12-SUMMARY.md`. No `vercel deploy --prod`, `vercel promote` or merge to main was run.

## Residuals (known, owned by a later phase)

| Residual | Owner |
|---|---|
| Backend `/sites` header still reports 44 embedded sites; the route stays until the legacy retirement | Phase 17 |
| Legacy in-app navigation drops `?cv` (PERSIST-01) | Phase 6 |
| The map page's country-order constant stays UI-only | Phase 6 |
| No export surface exists yet; the first export must carry the analysis-result stamp block | Phase 6 / Phase 9 |
| CORS preflight (OPTIONS) is answered 403 by design; any future contract client change that needs a custom header or non-simple request must first fix the CDN (S3 bucket CORS or an OPTIONS-capable origin) | Whoever changes the client; guarded by `contract-no-preflight.test.ts` |
| Production frontend merge is on hold by owner decision; the preview and production still show the pre-contract UI | Owner |
| Playwright against the protected Vercel preview needs the owner's bypass secret; the live specs ran against a local production build of the same commit | Owner |
| AWS Lambda concurrency quota increase (10 to 1000) still pending (request `4b8d23edbdcf43d9a9eee46fddc7b589IQUhYJr5`); all live verification was serial | Owner / Service Quotas |
| `restored_mid` not served and `similar_sites_count` 0 in live analyses (carried over from Phase 1) | Phase 5 / Phase 12 |
