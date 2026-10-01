# Phase 2: Data Contract v1 - Context

**Gathered:** 2026-10-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver contract v1: a versioned, immutable bundle (dataset, model and preprocessing-spec versions plus schemas, sites, embeddings and PCA projection) published to CDN-served storage, with a `latest.json` pointer. The web app obtains all site/reference data only through one contract module, which resolves either a pinned version or latest. Coverage flags (diel, detections, pre/post event, effort) are declared so time features can ship dormant. Analysis results are stamped with the versions they were produced with. The app runs end to end against committed contract fixtures.

Out of this phase: ingestion and batch embedding (Phases 8 and 11), retrain (Phase 12), the new instrument UI (Phases 4 and 6+), and the production frontend merge (held by owner decision until the overhaul is launch-worthy).

</domain>

<decisions>
## Implementation Decisions

### Hosting and publishing
- New S3 bucket `reefradar-2477-contract` fronted by CloudFront (us-east-1, account 781978598306). It is served to the browser (CORS for the dashboard origins and localhost) and is independent of app deploys, so a newly published version or a flipped `latest.json` is picked up without a redeploy (success criterion 3).
- Caching: everything under `v{N}/` and `contract/v{N}.json` is immutable (`Cache-Control: public, max-age=31536000, immutable`). `contract/latest.json` is the only mutable object, cached for 60 s (`max-age=60`).
- Publisher: `scripts/publish_contract.py` with `--dry-run` and `--confirm`, following the existing deploy/sync script pattern (boto3 Session profile `reefradar`; never prints presigned URLs or credentials).
  - It refuses to overwrite an existing version.
  - It writes all artifacts first, then `contract/v{N}.json`, then flips `contract/latest.json` last (atomic pointer).
  - It verifies the sha256 of every uploaded artifact by re-download.
  - A `--set-latest <N>` mode flips the pointer back for rollback.
- Before the first publish, an AWS Budget with an alarm at the owner's $25/month ceiling must exist (DRIVING-QUESTIONS Q10; owner standing approval covers this AWS change). New AWS resources are recorded in `infrastructure/resources.json`.
- v1 data source: freeze today's post-Phase-1 truth. Inputs:
  - the live `/sites` data (54 sites, matching the `data/snapshots/api-sites.json` shape);
  - `data/site-label-provenance.json`;
  - `dashboard-next/src/data/citations.json` (DOIs and licences);
  - the 48 reference embeddings from `s3://reefradar-2477-embeddings/reference/metadata_v6.json`, key `embedding`;
  - the live interim model identity from `docs/model/deployed-model.lock.json` and `models/interim-real-only/model_config.json`.

  Every artifact gets a sha256 in the manifest. No ingestion or ML job is a dependency.

### Schema and versioning
- Source of truth: JSON Schema files in a new top-level `contracts/schema/` covering ContractManifest, Site, PreprocessingSpec, ModelVersion and AnalysisResult version stamps. The app carries a hand-mirrored Zod schema; a CI test validates committed fixtures against both and fails if they disagree. Python validates with `jsonschema`. Schema changes are additive only.
- Site records carry the provenance the success criteria require:
  - source dataset, DOI, licence;
  - the label as the dataset assigned it (`label_original`), `label_definition` and `label_assigned_by`;
  - `status_basis`;
  - `reference_role`: `acoustic_reference` (has an embedding) or `location_only`.
- Projection: 2-D PCA over the 48 embedded sites (mean-centred), publishing `explained_variance_ratio` per axis. Non-embedded sites get no projection coordinates. No UMAP or t-SNE.
- Coverage flags in the manifest are `has_diel`, `has_detections`, `has_pre_post_event` and `has_effort`, all `false` in v1. Artifact entries for aggregates and detections exist with `present: false`.
- Version stamps: the classifier writes `contract_version`, `dataset_version`, `model_version` and `preprocessing_spec_version` into every new RESULT item and the `/visualize` payload. The values are bundled with the classifier package (a small committed JSON), not fetched at runtime. This needs one classifier deploy through `scripts/deploy-lambdas.py`, with serial live verification (concurrency limit 10 until the quota is granted). Results produced before this phase show "pre-contract" in the UI rather than an invented version.
- URL pinning: query param `?cv=<N>`; absent means latest. Analysis results and exports always carry their contract version, and a pinned version resolves exactly `contract/v{N}.json` even after a newer version becomes latest.

### App integration
- New `dashboard-next/src/features/contract/` module. It is the only code that fetches contract artifacts, and it exposes typed hooks: `useContract(version?)`, `useReferenceSites()`, `useModelVersion()` and `useCoverage()`. They use TanStack Query, keyed by version, with `staleTime: Infinity` for versioned artifacts and a short refetch for `latest.json`. The contract base URL comes from an env var (`NEXT_PUBLIC_CONTRACT_BASE_URL`) with the CloudFront URL as default.
- Repoint the legacy pages that read site data (landing, sites, dashboard map, about, dashboard) from `api.getSites()` to the contract hooks this phase. The visible legacy UI must not change, so the existing Linux visual baselines and e2e tests stay green.
- Fetch fence: an ESLint `no-restricted-syntax`/`no-restricted-imports` rule plus a CI grep that fails any reference to contract URLs or `fetch` of contract artifacts outside `src/features/contract/`.
- Fixtures: committed fixture contracts `v1`, plus a `v2` identical except for one flipped coverage flag. Unit, e2e and visual tests run fully offline against these via the env-configured base URL; one test proves the flag flip is picked up without a rebuild.
- Backend `GET /sites` keeps working unchanged (Streamlit and legacy callers); it retires in Phase 17.

### Owner decisions after research (2026-10-01)
- Budget: replace the existing alert-less `reefradar-2477-budget` ($50/month) with a single $25/month cost budget (name e.g. `reefradar-2477-ceiling-25`). It sends email alerts at 80% and 100% of actual spend and 100% of forecast to the owner's chosen alert address (passed only on the command line, never committed). It must exist before the first contract publish.
- SanctSound has no collection DOI. Success criterion 2 is satisfied by `doi: null` together with the dataset landing `url` and an explicit `doi_note` reason; this does not fabricate a DOI.
- The 48 embedded sites are counted from the data. The stale `sites_with_embeddings: 44` in the reference metadata and the live `/sites` header is not trusted.
- The 2-D PCA shows only about 33% of the variance. The contract publishes `explained_variance_ratio`, plus the mean and components so Phase 9 can project uploads, and any UI copy must state how little variance the plane shows.

### Claude's Discretion
- Exact file layout under `contracts/` and `v{N}/`, CloudFront settings (OAC vs public bucket policy), Zod/JSON Schema tooling versions, and how the fixture server is wired into Playwright.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/lambda_packaging.py`, `scripts/deploy-lambdas.py`, `scripts/sync_sample_audio.py`, `scripts/publish_model.py`: established `--dry-run`/`--confirm`, sha256-verified, profile-`reefradar` patterns to copy for `publish_contract.py`.
- `lambdas/shared/site_provenance.py` and `data/site-label-provenance.json`: label provenance overlay (`label_source`, `label_original`, `label_definition`, `label_assigned_by`, `status_basis`).
- `dashboard-next/src/data/citations.json` and `src/lib/citations.ts`: canonical DOIs and licences.
- `data/snapshots/api-sites.json` and `scripts/build_api_fixtures.py`: current `/sites` shape and fixture builder.
- `dashboard-next/src/lib/site-stats.ts` (`deriveSiteStats`): derived counts the legacy UI already uses.
- `dashboard-next/tests/e2e/support/mock-api.ts` and fixtures under `tests/fixtures/api/`: the mocked-API e2e pattern.

### Established Patterns
- TanStack Query is initialised in `app/providers.tsx`; pages call `useQuery({ queryFn: () => api.getSites() })`.
- `infrastructure/lambda-packages/*.json` package specs: new classifier bundle members (the contract version stamp JSON) are added there.
- CI (`.github/workflows/ci.yml`) runs web lint/typecheck/unit/build, pytest, citations, e2e+axe and Docker-pinned visual jobs. Concurrency cancels in-progress runs on the same ref, so don't push while a `workflow_dispatch` snapshot run is in flight.

### Integration Points
- Site-data consumers: `src/app/page.tsx`, `src/app/sites/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/map/page.tsx` and `src/app/about/page.tsx` (all `api.getSites()`).
- Classifier RESULT write in `lambdas/classifier/handler.py`; `/visualize` in `lambdas/router/handler.py` returns RESULT fields.

</code_context>

<specifics>
## Specific Ideas

- Follow `.planning/research/ARCHITECTURE.md` §2–3 (repo layout, ContractManifest/Site/PreprocessingSpec/ModelVersion/AnalysisResult shapes, anti-patterns 3 and 5) unless the decisions above say otherwise.
- PreprocessingSpec v1 records what production actually does today (32 kHz, 5 s windows, no overlap, current resampling and normalisation behaviour), without claiming the Phase 5 parity fixes.
- The interim model's ModelVersion records `classes: [degraded, healthy, restored_early]`, `synthetic_data: false`, and no grouped-evaluation numbers (Phase 5 adds them). It does not repeat the old "~90% accuracy" claim.

</specifics>

<deferred>
## Deferred Ideas

- Per-window AnalysisResult shape with abstain (Phase 5 and Phase 9).
- Spectrogram images, audio clips and diel/effort/detection aggregates as contract artifacts (Phase 11).
- Production frontend merge: held until the overhaul is launch-worthy (owner, 2026-10-01).

</deferred>
