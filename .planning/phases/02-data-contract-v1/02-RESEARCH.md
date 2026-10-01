# Phase 2: Data Contract v1 - Research

**Researched:** 2026-10-01
**Domain:** Versioned immutable static data contract (S3 + CloudFront), JSON Schema <-> Zod mirroring, TanStack Query consumption in Next 14 App Router, classifier version stamping, offline fixtures
**Confidence:** HIGH for repo facts, AWS state and ESLint/Next/Playwright mechanics (all read or run this session); MEDIUM for CloudFront create-distribution idempotency details and CloudFront error-caching defaults (not exercised, AWS writes are out of scope for research)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Hosting and publishing
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

#### Schema and versioning
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

#### App integration
- New `dashboard-next/src/features/contract/` module. It is the only code that fetches contract artifacts, and it exposes typed hooks: `useContract(version?)`, `useReferenceSites()`, `useModelVersion()` and `useCoverage()`. They use TanStack Query, keyed by version, with `staleTime: Infinity` for versioned artifacts and a short refetch for `latest.json`. The contract base URL comes from an env var (`NEXT_PUBLIC_CONTRACT_BASE_URL`) with the CloudFront URL as default.
- Repoint the legacy pages that read site data (landing, sites, dashboard map, about, dashboard) from `api.getSites()` to the contract hooks this phase. The visible legacy UI must not change, so the existing Linux visual baselines and e2e tests stay green.
- Fetch fence: an ESLint `no-restricted-syntax`/`no-restricted-imports` rule plus a CI grep that fails any reference to contract URLs or `fetch` of contract artifacts outside `src/features/contract/`.
- Fixtures: committed fixture contracts `v1`, plus a `v2` identical except for one flipped coverage flag. Unit, e2e and visual tests run fully offline against these via the env-configured base URL; one test proves the flag flip is picked up without a rebuild.
- Backend `GET /sites` keeps working unchanged (Streamlit and legacy callers); it retires in Phase 17.

### Claude's Discretion
- Exact file layout under `contracts/` and `v{N}/`, CloudFront settings (OAC vs public bucket policy), Zod/JSON Schema tooling versions, and how the fixture server is wired into Playwright.

### Deferred Ideas (OUT OF SCOPE)
- Per-window AnalysisResult shape with abstain (Phase 5 and Phase 9).
- Spectrogram images, audio clips and diel/effort/detection aggregates as contract artifacts (Phase 11).
- Production frontend merge: held until the overhaul is launch-worthy (owner, 2026-10-01).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONTRACT-01 | Versioned immutable contract (dataset + model + preprocessing-spec versions + schemas) on CDN-served storage; only source of reference data for the web app | Hosting design (private S3 + OAC + CloudFront, section Architecture), publisher with `If-None-Match: *`, `features/contract` module, ESLint fence (verified by running ESLint 8.57.1) |
| CONTRACT-02 | Contract v1 freezes the 54-site data with full provenance (source, DOI, licence, label definition, acoustic-reference vs location-only) | v1 input inventory (live `/sites` == committed fixture, 0 diffs), Site schema, traps in `metadata_v6.json` (stale statuses, wrong Irma DOI, header says 44 embedded, real count 48), PCA findings |
| CONTRACT-03 | Schema declares coverage flags so time features ship dormant and activate on a later publish without a redeploy | Manifest `coverage` block, `latest.json` 60 s TTL, TanStack `refetchInterval` + Playwright `page.clock` flag-flip proof |
| CONTRACT-04 | Every result/export/URL pins dataset, model, preprocessing versions and resolves that exact version | `?cv=` handling (Suspense rules), classifier stamp design, router passthrough, "pre-contract" UI rule, pinned-resolution tests |
| CONTRACT-05 | UI development runs against contract fixtures; UI phases never blocked by ingestion | `contracts/bucket` mirror + `contracts/fixtures`, `mockContract()` routed inside `mockApi()`, vitest fake fetch, no ingestion dependency |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Both `./CLAUDE.md` and `./.claude/CLAUDE.md` were read. Actionable directives for this phase:

- **Deploys:** "No console edits; deploys only from a clean committed tree." All Lambda deploys go through `py -3.12 scripts/deploy-lambdas.py --function <fn> --confirm` after a `--dry-run`; rollback via `--ref <commit>`; verify with `py -3.12 scripts/drift-check.py --function all`.
- **GSD enforcement:** repo edits only through a GSD workflow.
- **Integrity (project core value):** no synthetic or unattributed audio; no displayed probability that is not a probability; every label shows who assigned it; licence attribution wherever audio or derived data appears. The contract must therefore carry `synthetic: false` as a constant and never invent a label, a version or a coordinate.
- **Legacy operability:** legacy routes keep working; `GET /sites` unchanged until Phase 17.
- **Budget:** owner ceiling $25/month; budget alarm required before large jobs (this phase creates the alarm).
- **Access:** AWS via `py -3.12 -m awscli` (CLI v1) or boto3 with profile `reefradar`; Vercel CLI and GitHub CLI installed. Never read CLI auth/token files; never print presigned URLs or credentials.
- **Tech stack:** Next 14.2.35 today (Phase 3 upgrades to 16 / React 19), so the contract module must not depend on Next-14-only APIs beyond `useSearchParams` + `Suspense` (same in 16).
- **Conventions:** Python snake_case with `--dry-run`/`--confirm` scripts, `main(argv, client=None)` injectable clients for moto tests; TS components `PascalCase`, lib modules kebab-case, `@/*` alias; defensive rendering (no crash on missing data).
- **CI:** `.github/workflows/ci.yml` has `concurrency: ci-${{ github.ref }}` with `cancel-in-progress: true`: do not push while a `workflow_dispatch` snapshot-update run is in flight.

## Summary

The contract is a small, fully static artifact set (~0.5 MB per version): `sites.json` (54 records), `embeddings.f32` (48 x 1280 float32 = 245,760 bytes), `projection.json` (2-D PCA plus mean and components so Phase 9 can project an upload), `model_version.json`, `preprocessing_spec.json`, the JSON Schemas, and a manifest `contract/v1.json`, with `contract/latest.json` as the only mutable pointer. Hosting recommendation: private bucket `reefradar-2477-contract` (all four public-access-block flags on), CloudFront with Origin Access Control (OAC), AWS managed cache policy `Managed-CachingOptimized` (honours origin `Cache-Control` between 1 s and 1 yr), AWS managed response-headers policy `Managed-SimpleCORS` (`Access-Control-Allow-Origin: *`, GET/HEAD/OPTIONS, no credentials). Wildcard CORS is correct here: the data is public, open-licensed and non-credentialed, and `*.vercel.app` preview hosts are unpredictable. The publisher uses S3 conditional writes (`IfNoneMatch='*'`, HTTP 412 on overwrite) so "refuse to overwrite an existing version" is enforced by S3, not by a racy check. All AWS state was read this session: no CloudFront distribution, no OAC, no SNS topic exists; the only budget is `reefradar-2477-budget` at $50/month with **zero notifications**, so no alarm exists today and a $25 budget with notifications must be created. The owner's alert email is a required input that is not configured anywhere.

The v1 inputs are consistent but contain four traps the plan must defend against: (1) `metadata_v6.json` and the live `/sites` header both say `sites_with_embeddings: 44`, but exactly 48 sites carry a 1280-d embedding; (2) `metadata_v6.json` still carries pre-truth statuses (Bora-Bora `healthy`/`degraded`) and a **banned** Irma DOI (`10.5061/dryad.sxksn0319`), so it may be used for embeddings only, never for status/DOI; (3) three Bora-Bora, one Irma and four SanctSound sites have no upstream health label, so `label_definition` is legitimately null for 6 sites and SanctSound has no collection DOI (`doi: null`); the success-criterion wording must be encoded as "present or explicitly null with `status_basis`"; (4) the contract Site must carry a `location_label` so the map popups keep today's text after `SITE_COORDINATES` (hard-coded reference data in `src/types/index.ts`) is retired. 2-D PCA on the 48 embeddings explains only 33.0% of variance (18.3% + 14.7%); the schema and UI copy must say so.

The app side is a thin module: a dependent query chain (`latest.json` -> `contract/v{N}.json` -> artifacts), `staleTime: Infinity` for versioned artifacts, a 60 s refetch for `latest.json`, a Zod-validated parse of every fetched JSON, a legacy adapter so the five pages receive a byte-identical `sites` array, and an ESLint fence that was verified this session to flag string literals, template literals, `process.env` access and deep imports outside `src/features/contract/`. Flag-flip pickup is proven with Playwright `page.clock.fastForward(60_000)` plus a `data-contract-version` attribute on `<html>` (no visual effect), and at hook level with vitest fake timers.

**Primary recommendation:** Build `contracts/` (schemas, `bucket/` mirror, `fixtures/`) and `scripts/{build,check,publish}_contract.py` first, create the budget + bucket + OAC + distribution in a single idempotent `scripts/setup_contract_infra.py` (owner email as a required input), then ship `features/contract` + legacy adapter + fence + fixtures harness, then the classifier/router stamp deploy and the real v1 publish, in that order.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Contract assembly (build v1 bundle, PCA, hashes) | Offline script (Python, dev machine) | CI `--check` | Deterministic build from committed inputs plus one read-only S3 pull; Track A never talks to the app |
| Contract storage and immutability | Database / Storage (S3 private bucket) | — | `If-None-Match: *` enforces no-overwrite at S3 |
| Contract delivery, CORS, caching | CDN / Static (CloudFront + OAC) | — | Cache-Control per object, managed CORS policy; independent of Vercel deploys |
| Version resolution (latest vs `?cv=`), fetch, validate, cache | Browser / Client (`features/contract`, TanStack Query) | — | Only module allowed to fetch; Zod parse at the boundary |
| Legacy site shape adaptation | Browser / Client (`features/contract/legacy.ts`) | — | Keeps five pages visually identical; deleted when pages are rebuilt |
| Result version stamping | API / Backend (classifier Lambda) | Router passthrough | Stamp written at analysis time from a bundled JSON, never recomputed |
| Result stamp display ("Contract v1" / "pre-contract") | Browser / Client (`AnalysisResults.tsx` via contract helper) | — | UI renders null as "pre-contract", never invents |
| Schema source of truth | Repo (`contracts/schema/*.json`) | Python `jsonschema`, TS Zod mirror | Additive-only policy checked against published releases |
| Budget alarm | AWS Budgets (account level) | — | Required before any publish or later batch job |
| Fence enforcement | Build time (ESLint + grep script) | CI | Fails the build, not runtime |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` (npm) | pin `4.4.3` | Runtime parse + type inference for fetched contract JSON; hand-mirrored from JSON Schema | Locked by CONTEXT. Zod "is tested against TypeScript v5.5 and later" and requires `"strict": true` [CITED: zod.dev]; repo has TS 5.5.4 and `strict: true` [VERIFIED: dashboard-next/tsconfig.json, package.json]. `z.toJSONSchema()` exists (default target draft 2020-12; `z.object()` emits `additionalProperties: false` in output mode, `z.looseObject()` never does) [CITED: zod.dev/json-schema] |
| `jsonschema` (PyPI) | `4.26.0` | Python validation of every bundle artifact against `contracts/schema/*.json` | Locked by CONTEXT; `Draft202012Validator` + `referencing` registry for cross-schema `$ref` [CITED: python-jsonschema.readthedocs.io]. Not installed on this machine (`ModuleNotFoundError`), `pip install --dry-run` resolves cleanly for cp312-win (jsonschema 4.26.0, referencing 0.37.0, rpds-py 2026.6.3) [VERIFIED: pip dry-run] |
| `boto3` | 1.43.106 (already pinned) | S3, CloudFront, Budgets in setup + publish scripts | Already in `requirements-dev.txt`; `put_object` accepts `IfNoneMatch`, `IfMatch`, `ChecksumSHA256`, `CacheControl` and the `budgets` `create_budget` signature has `NotificationsWithSubscribers` [VERIFIED: botocore service model introspection] |
| `numpy` | local 2.5.3 / CI pinned 1.26.4 | Deterministic PCA via SVD | Already pinned for Lambda layer parity; no scikit-learn needed |
| `@tanstack/react-query` | 5.90.20 (installed) | Version-keyed caching, `staleTime: Infinity`, `refetchInterval` | Already the app's data layer [VERIFIED: node_modules] |
| `moto[s3,dynamodb]` | 5.2.3 (already pinned) | Publisher/stamp tests | Verified this session: moto 5.2.3 honours `IfNoneMatch='*'` (raises `PreconditionFailed`), and its `budgets` and `cloudfront` mocks respond [VERIFIED: local run] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ajv` (npm, dev) | 8.20.0, import `ajv/dist/2020` | Optional second JSON Schema engine inside vitest | Only if the committed-corpus approach (below) is rejected. Caveat: root `node_modules/ajv` is 6.12.6 (an ESLint 8 dependency); adding ajv 8 forces npm to nest ajv 6 under ESLint, so re-run `npm run lint` after installing |
| Playwright `page.clock` | built in (1.63.0) | Fast-forward 60 s so the `latest.json` refetch fires | Flag-flip e2e proof |
| vitest fake timers | built in (5.0.3) | Hook-level flip test | Unit proof |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Ajv in vitest for the JSON Schema side | **Python as the single JSON-Schema authority**: `scripts/check_contract.py` emits `contracts/fixtures/parity-corpus.json` (instances + verdict per schema, includes auto-mutated invalid cases); vitest asserts Zod gives the same verdict; Python CI job runs `--check` for freshness | Recommended: no new npm package, no ajv hoisting risk, still "validates fixtures against both and fails if they disagree" |
| Custom CloudFront response-headers policy with an origin allow-list | AWS managed `Managed-SimpleCORS` (`60669652-455b-4ae9-85a4-c4c02393f86c`) | Allow-listing gains nothing for public, credential-free GET data and breaks `*.vercel.app` previews |
| S3 public bucket policy + bucket CORS (no CDN) | CloudFront + OAC | Only as the fallback if CloudFront create is refused for account verification; the contract module is host-agnostic so only the base URL changes |
| OAI | OAC | OAC is AWS-recommended and supports all regions and SSE-KMS [CITED: docs.aws.amazon.com private-content-restricting-access-to-s3] |
| CloudFront flat-rate Free/Pro plans | Pay-as-you-go distribution (default for `create_distribution`) | The flat-rate Free and Pro plans list "no private origin support" [CITED: aws.amazon.com/cloudfront/pricing], which rules out OAC |

**Installation:**
```bash
# web (pinned, exact)
cd dashboard-next && npm install --save-exact zod@4.4.3
# python (add to requirements-dev.txt as jsonschema==4.26.0, then)
py -3.12 -m pip install --user jsonschema==4.26.0
```

**Version verification:** `npm view zod@4.4.3` exists (published 2026-05-04); latest `4.6.5` was published 2026-09-13 (18 days ago) which is why the legitimacy seam says "too-new" for the package name, so pin the older mature release. `npm view ajv@8.20.0` published 2026-04-24; its tarball contains `dist/2020.js` (the docs page text says `ajv/dist/2020-12`, the tarball lists `dist/2020.js`, use `ajv/dist/2020`) [VERIFIED: npm registry, npm pack --dry-run].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `zod` | npm | years (4.4.3 from 2026-05-04) | ~360M/wk | github.com/colinhacks/zod | SUS ("too-new": the latest version 4.6.5 was published within 30 days) | Flagged. Name is legitimate; pin `4.4.3`. Planner adds a `checkpoint:human-verify` (satisfied by the owner standing approval for new packages recorded in DRIVING-QUESTIONS.md; log the decision in SUMMARY.md) |
| `ajv` | npm | years (8.20.0 from 2026-04-24) | ~450M/wk | github.com/ajv-validator/ajv | OK | Optional only (see Alternatives) |
| `jsonschema` | PyPI | years (4.26.0 from 2026-01-07) | seam: unknown | github.com/python-jsonschema/jsonschema | SUS ("unknown-downloads": PyPI download stat unavailable to the seam) | Flagged. Name is the well-known python-jsonschema project; pin `4.26.0`. Same human-verify checkpoint/standing-approval treatment |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `zod` [WARNING: flagged as suspicious by the seam ("too-new" on latest only) - verify before using], `jsonschema` [WARNING: flagged as suspicious ("unknown-downloads") - verify before using]. Planner inserts a `checkpoint:human-verify` before each install. Both `zod` and `jsonschema` are named by CONTEXT.md (owner decision), and the registry lookups, publish dates and source repos were cross-checked this session.

`npm view <pkg> scripts.postinstall` was not needed: the seam reports `postinstall: null` for all three.

## Architecture Patterns

### System Architecture Diagram

```
 committed inputs (git)                       one-time read-only pull
 ┌─────────────────────────────┐              ┌────────────────────────────────────┐
 │ data/snapshots/api-sites.json│              │ s3://…-embeddings/reference/       │
 │ data/site-label-provenance   │              │   metadata_v6.json  (embeddings    │
 │ src/data/citations.json      │              │   ONLY; sha256 recorded)           │
 │ models/interim-real-only/*   │              └──────────────┬─────────────────────┘
 │ lambdas/preprocessor/handler │                             │
 └───────────────┬─────────────┘                             │
                 ▼                                            ▼
        scripts/build_contract.py  (deterministic: sorted keys, LF, sha256, PCA from published f32)
                 │ writes
                 ▼
   contracts/bucket/{contract/v1.json, v1/sites.json, v1/embeddings.f32, v1/projection.json,
                     v1/model_version.json, v1/preprocessing_spec.json, v1/stamp.json, v1/schema/*.json}
         │                         │                              │
         │ validate (jsonschema)   │ pytest/CI --check            │ bundled into classifier zip (stamp.json)
         ▼                         ▼                              ▼
 scripts/check_contract.py   CI python job              infrastructure/lambda-packages/classifier.json
         │
         ▼ (--confirm; PutObject IfNoneMatch='*' for every v1/ + contract/v1.json; latest.json LAST)
 ┌──────────────── S3 reefradar-2477-contract (private, OAC) ────────────────┐
 │ contract/latest.json (max-age=60, mutable)   v1/** + contract/v1.json      │
 │                                              (max-age=31536000, immutable) │
 └───────────────────────────────┬────────────────────────────────────────────┘
                                 ▼  CloudFront (CachingOptimized + SimpleCORS, https only)
 browser ── features/contract ── GET contract/latest.json (60 s) ─► N
        │        │            └ or ?cv=N: skip latest.json, GET contract/vN.json directly
        │        └─ GET contract/vN.json (manifest) ─► GET vN/sites.json …  (Zod parse + sha256 check)
        ▼
 legacy pages (5) via adapter ──► identical `sites` array as today
 analysis result ── classifier stamp {contract_version,…} ── /visualize ──► UI "Contract v1" | "pre-contract"
```

### Recommended Project Structure
```
contracts/
├── schema/                         # source of truth (JSON Schema 2020-12), additive-only
│   ├── contract-manifest.schema.json
│   ├── site.schema.json
│   ├── preprocessing-spec.schema.json
│   ├── model-version.schema.json
│   ├── projection.schema.json
│   └── analysis-result.schema.json # version-stamp block only (per-window shape is Phase 5/9)
├── bucket/                         # verbatim mirror of the bucket's IMMUTABLE content (publish source)
│   ├── contract/v1.json
│   └── v1/{sites.json,embeddings.f32,projection.json,model_version.json,preprocessing_spec.json,stamp.json,schema/*.json}
├── fixtures/                       # test-only, never published (publisher rejects manifests with "fixture": true)
│   ├── bucket/contract/v2.json     # v1 manifest + exactly one flipped coverage flag, same artifact URIs (reuse v1/ bytes)
│   ├── latest-v1.json  latest-v2.json
│   ├── invalid/*.json              # malformed cases for negative tests
│   └── parity-corpus.json          # generated by check_contract.py --write-corpus
├── PUBLISHED.json                  # written by publisher: {version: manifest sha256}; guards immutability in CI
├── CHANGELOG.md  README.md
scripts/{build_contract.py, check_contract.py, publish_contract.py, setup_contract_infra.py, contract_lib.py}
scripts/tests/test_contract_*.py          # pytest.ini testpaths already cover scripts/tests
lambdas/shared/contract_stamp.py          # stdlib-only loader, mirrors site_provenance.py
dashboard-next/src/features/contract/{index.ts, client.ts, schema.ts, hooks.ts, legacy.ts, version.ts, ContractVersionSync.tsx}
dashboard-next/tests/unit/contract-*.test.ts(x)
dashboard-next/tests/e2e/contract-*.spec.ts  # NOT named *-live.spec.ts
```
v2 reuses v1 artifacts by URI (immutable bytes are content-addressed by their path), so the fixture adds one ~2 KB manifest, not another 245 KB binary. The same `contracts/bucket/` bytes are what tests serve, what CI hashes and what the publisher uploads, so fixtures cannot drift from production.

### Pattern 1: Resolve then fetch (two-step, version in the query key)
**What:** `latest.json` is a tiny pointer `{contract_version, manifest_uri, manifest_sha256}`; manifests and artifacts are keyed `['contract', N, …]` with `staleTime: Infinity`; `latest` is `['contract','latest']` with `staleTime: 60_000, refetchInterval: 60_000, refetchOnWindowFocus: true` (the app's QueryClient default is `refetchOnWindowFocus: false` and `staleTime: 60 * 1000` [VERIFIED: src/app/providers.tsx], so override per query).
**When to use:** all contract reads. A pinned version (`?cv=N`) skips `latest.json` entirely.
```typescript
// Source: TanStack Query v5 API (already in repo) + project design
export function useContract(version?: number) {
  const pinned = version ?? usePinnedVersion();            // from ContractVersionSync store
  const latest = useQuery({
    queryKey: ['contract', 'latest'],
    queryFn: () => getLatest(),                           // Zod-parsed pointer
    enabled: pinned === null && versionResolved(),
    staleTime: 60_000, refetchInterval: 60_000, refetchOnWindowFocus: true,
  });
  const n = pinned ?? latest.data?.contract_version ?? null;
  return useQuery({
    queryKey: ['contract', n, 'manifest'],
    queryFn: () => getManifest(n!),
    enabled: n !== null,
    staleTime: Infinity, gcTime: Infinity,
  });
}
```

### Pattern 2: `?cv=` without breaking prerender (Next 14.2.35)
**What:** `useSearchParams` makes the client tree up to the nearest `Suspense` client-render during static prerender; with no `Suspense` the build errors ("Missing Suspense boundary with useSearchParams") [CITED: nextjs.org/docs/14/app/api-reference/functions/use-search-params, nextjs.org/docs/messages/missing-suspense-with-csr-bailout]. All five legacy pages are `'use client'` and prerendered, and `Providers` wraps every route, so do **not** call `useSearchParams` in `Providers`.
**Recommended:** a leaf `ContractVersionSync` client component rendering `null`, mounted once in `Providers` inside `<Suspense fallback={null}>`, which reads `?cv=`, validates it with `/^[1-9]\d{0,5}$/`, and writes `{resolved: true, pinned: number|null}` into a small zustand store (zustand ^4.5 is already a dependency). Hooks set `enabled: resolved` so the first (server-snapshot) render never fires a `latest.json` fetch for a pinned URL. Invalid `cv` (non-integer, `../x`) is a visible error state, never a silent fallback to latest.
**Limitation to record:** legacy `<Link>` navigation drops `?cv=`; per-view URL state arrives with PERSIST-01 (Phase 6). Each URL pinned at load resolves exactly that version.

### Pattern 3: Legacy adapter proves "no visible change"
`toLegacySitesResponse(contractSites)` maps the contract Site to today's `Site` (`src/types/index.ts:10-28`: `site_id, country, status, latitude, longitude, location, has_embedding, region, source, label_source, label_source_name, label_assigned_by, label_original, label_definition, status_basis, period, label_note`) and adds `count`. Mapping: `source = dataset_name`, `label_source = dataset_id`, `label_source_name` from the datasets list, `has_embedding = reference_role === 'acoustic_reference'`, `location = location_label`. **Gate test:** `adapter(fixtureSites).sites` deep-equals `tests/fixtures/api/sites.json` `.sites` (live `/sites` equals that fixture with 0 diffs, verified this session) except the dropped `synthetic` key, which the Site type does not declare. Pages call `useLegacySitesResponse()` (one-line change each); contract-native code uses `useReferenceSites()`.

### Pattern 4: Test-time contract serving by host interception
`mockApi()` already routes only the execute-api host and aborts+records unhandled calls [VERIFIED: tests/e2e/support/mock-api.ts]. Extend it to call `mockContract(page, {latest: 1})` by default (regex `^https://[a-z0-9]+\.cloudfront\.net/.*`), serving `contracts/bucket/**` and `contracts/fixtures/**` from disk with explicit `access-control-allow-origin: *` and the same Cache-Control as production, recording unhandled contract URLs in the same afterEach assertion. Every e2e spec except the `-live`/parity ones already calls `mockApi` [VERIFIED: grep -L], so no spec edits are needed and visual specs inherit it. This avoids `NEXT_PUBLIC_CONTRACT_BASE_URL` being baked at build time (it is inlined by Next, so it cannot be changed without a rebuild, and `FOO=bar cmd` webServer commands do not work in Windows `cmd`).

### Anti-Patterns to Avoid
- **Building site status/DOI from `metadata_v6.json`:** it holds stale statuses and a banned DOI (see Pitfalls). Use it for embeddings only.
- **Copying `sites_with_embeddings: 44`:** compute counts from data (48).
- **Silent fallback from a pinned version to latest:** a missing `vN` must render an explicit "contract version N not found" state (403 and 404 both mean "not found", see Pitfall 11).
- **Fixtures reachable from production code:** lint-fence `contracts/fixtures` imports out of `src/`.
- **Normalising CRLF in binary files:** `lambda_packaging.normalize_text_bytes` is safe only for text; never apply it to `embeddings.f32`.
- **`z.object()` for read schemas:** Zod 4 emits `additionalProperties: false`, which breaks the additive-only promise; use `z.looseObject()` for fetched artifacts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema validation | custom validators | `jsonschema.Draft202012Validator` (+ `referencing` registry) | `$ref` resolution, draft semantics |
| Atomic "never overwrite a version" | head-then-put | S3 `PutObject` with `IfNoneMatch='*'` (412 on exists; first writer wins) [CITED: docs.aws.amazon.com conditional-writes] | A check-then-put races between publishers |
| Pointer flip race | last-writer-wins | `IfMatch=<etag of current latest.json>` on the flip | Two publishers cannot silently clobber each other |
| Integrity | ad hoc checksums | `hashlib.sha256` (Python), `crypto.subtle.digest('SHA-256')` (browser; verified to work in vitest's jsdom env this session) | Never hand-roll crypto |
| CORS | custom header policy | CloudFront managed `Managed-SimpleCORS` | Verified config: origins `*`, no credentials, `OriginOverride: false` |
| Cache policy | custom TTLs | managed `Managed-CachingOptimized` (`658327ea-f89d-4fab-a63d-7e88639e58f6`: Min 1, Default 86400, Max 31536000, gzip+brotli on, no query/header in key) | Honours origin `Cache-Control: max-age=60` for `latest.json` and 1-year `immutable` for versions |
| PCA | scikit-learn dependency or ad hoc power iteration | `numpy.linalg.svd` on the mean-centred float64 matrix + deterministic sign rule | 15 lines; sklearn is not in the repo |
| Query caching / version-keyed cache | custom cache | TanStack Query keyed `['contract', N, …]` | Already the data layer |
| Module boundary enforcement | convention | ESLint `no-restricted-syntax` + `no-restricted-imports` (verified) + a CI grep script | Fails the build |
| Budget alarm | cron/lambda | AWS Budgets `create_budget` + notifications | Native |
| Fixture server | new Node server | `page.route` host interception | No env baking, no extra process |

**Key insight:** every "hard" property here (immutability, atomic pointer, integrity, fence, parity) has a native primitive (S3 conditional writes, sha256, ESLint selectors, JSON Schema validators). Custom code should only be the thin orchestration.

## Exact v1 Inputs (verified this session)

| Input | Facts (verified) | Contract use |
|-------|------------------|--------------|
| `data/snapshots/api-sites.json` | keys `countries, notes, sites, sites_with_embeddings, snapshot_at, source, total_all_sites, total_sites, version`; 54 sites; site keys `country, has_embedding, latitude, longitude, region, site_id, source, status, synthetic`; counts by (source, has_embedding): MARRS/true 44, MARRS/false 1 (ken_D3), CoralSoundExplorer/true 3, Hurricane Irma/true 1, Hurricane Irma/false 1, NOAA SanctSound/false 4 | Site base fields. Its header `sites_with_embeddings: 44` is wrong (48 sites have `has_embedding: true`) |
| `dashboard-next/tests/fixtures/api/sites.json` | `build_api_fixtures.py` output = snapshot + `apply_label_provenance()`; adds `label_source, label_source_name, label_assigned_by, label_original, label_definition, status_basis, period, label_note`. Live `GET /sites` equals it: 54 ids, **0 field diffs** (fetched live this session, public GET) | Canonical post-truth site records; adapter parity target. Live payload has no `count` key although `SitesResponse.count` is typed required |
| status distribution | healthy 19, degraded 17, restored_mid 8, restored_early 6, unknown 4 in the raw snapshot; after provenance overlay the 9 non-MARRS sites are `unknown` (fixture: marrs healthy 16 / degraded 14+1 / restored_mid 8 / restored_early 6; coralsoundexplorer 3, irma 2, sanctsound 4 all `unknown`) | `status` enum is exactly `'healthy' \| 'degraded' \| 'restored_early' \| 'restored_mid' \| 'unknown'` [VERIFIED: dashboard-next/src/types/index.ts:3] |
| `data/site-label-provenance.json` | keys `schema_version, decisions, sources, sites`; sources `marrs, coralsoundexplorer, irma, sanctsound` each with `display_name, assigned_by, site_id_prefixes` (+ `definitions`, `original_terms` for marrs); per-site overrides for `borabora_*, irma_*, sanctsound_fk01-04, ken_D3` | `label_*`, `status_basis`, `period`, `label_note` (via `lambdas/shared/site_provenance.py`, reuse `apply_label_provenance`, do not re-implement) |
| null-label sites | irma_eastern_sambo, irma_western_dry_rocks, sanctsound_fk01-04: `label_original` null, `label_definition` null, `status_basis` non-null, status `unknown`. Bora-Bora x3: original/definition/basis non-null, status `unknown` | Schema invariant: `label_definition === null` implies `status === 'unknown'` and `status_basis !== null` |
| `dashboard-next/src/data/citations.json` | datasets: `marrs` doi `10.5522/04/29958062` licence `CC BY 4.0`; `coralsoundexplorer` doi `10.5281/zenodo.14577064` `CC BY 4.0`; `irma` doi `10.5061/dryad.5tb2rbp38` `CC0 1.0 (Public Domain Dedication)`; `sanctsound` **doi null**, url `https://sanctsound.ioos.us/`, licence `Public domain (U.S. Government work)`; citation id equals `label_source` | Site `doi`, `licence`, `licence_url`, `dataset_id`; manifest `datasets[]`. `doi` is nullable (SanctSound), `url` is mandatory |
| `s3://reefradar-2477-embeddings/reference/metadata_v6.json` (read-only GET) | 1,359,432 bytes, sha256 `5adc487d3f25d1037fdb2145ca5c56474459d7b32ec3c914a00f2c47719ca2e3`, ETag `"8597636564738c5c184c4c290043d4b9"`; top keys `version '6.0'`, `embedding_model 'surfperch_v1'`, `embedding_dim 1280`, `total_sites 54`, `sites_with_embeddings 44` (wrong), `sites` is a **list** of 54 dicts; **48** have a 1280-float `embedding` (float64 JSON, no NaN, range -0.2138..0.3826, L2 norm 1.80..2.55); the 6 without are ken_D3, irma_eastern_sambo, sanctsound_fk01-04; `has_embedding` flag agrees with presence in all 54; ids/status/lat/lon equal the snapshot | Embeddings only |
| metadata_v6 traps | raw `status` for borabora_undisturbed `healthy`, borabora_tourist and boat_traffic `degraded`; Irma sites `doi: '10.5061/dryad.sxksn0319'` (matches `check-citations.mjs` BANNED pattern `dryad\.sxksn0319`); CSE sites carry `citation: 'Minier et al. 2025, PLOS Computational Biology'` | Never copy `status`, `doi`, `citation` from it |
| live model objects | `models/model_config.json` sha256 `9781d1ab16794402057b7ac405432952e2d8ce84bf2dfac6e752a8e78fdbf658` (1920 B), `models/reef_classifier_weights.npz` sha256 `ab9e383043ef1bd9e693facf43fdcdac76a640e693b2f834f4fa567561dedcf4` (1,379,754 B): both **equal the committed `models/interim-real-only/` files** (local `sha256sum` and S3 GET both read this session) | ModelVersion `weights_sha256`/`config_sha256` |
| `models/interim-real-only/model_config.json` | `"version": "interim-real-only"`, `"input_dim": 1280`, `"hidden_dims": [256, 64]`, `"num_classes": 3`, `idx_to_label` `{"0":"degraded","1":"healthy","2":"restored_early"}`, `"training_samples": 100`, `"training_countries": ["Indonesia","Kenya"]`, `"synthetic_rows_excluded": 0`, 5 training sites (ind_D2, ind_D3, ind_H4, ind_N1, ken_H1), `"seed": 42`; note: no `weights_sha256` key; its `evaluation_note` says the accuracy "is not an estimate of performance on new sites or regions" | ModelVersion: `classes: [degraded, healthy, restored_early]`, `synthetic_data: false`, **no accuracy number**, copy the evaluation note |
| `docs/model/deployed-model.lock.json` | v2.0 audit: `synthetic_class_detected: true`, `interim_required: true`, `interim_classes` degraded/healthy/restored_early | ModelVersion `predecessor` note (v2.0 had a synthetic-trained `restored_mid`, retired) |
| `dashboard-next/src/data/model-card.json` | `"model_version": "interim-real-only"`, `"num_classes": 3`, `"training_rows": 100` | Cross-check test: contract ModelVersion fields equal the model card |

### PreprocessingSpec v1: what production does today (read from `lambdas/preprocessor/handler.py`)

| Parameter | Value (verbatim source) | Notes for honest recording |
|-----------|--------------------------|----------------------------|
| sample rate | `TARGET_SAMPLE_RATE = 32000  # 32 kHz` (line 33) | |
| window | `SEGMENT_SAMPLES = 160000    # Exact: 32000 * 5.0 = 160,000 samples` (line 35); `SEGMENT_DURATION = 5.0` | |
| hop | segments cut as `start = i * SEGMENT_SAMPLES` with `num_segments = int(duration_seconds / SEGMENT_DURATION)` | hop = 5.0 s (no overlap); trailing partial window is dropped; minimum 5.0 s (`MIN_AUDIO_DURATION = 5.0`), maximum `MAX_AUDIO_DURATION = 600` (line 37) |
| channel mix | `audio_data = audio_data.mean(axis=1)` | mean of channels |
| amplitude scaling | `int16 -> /32768.0`, `int32 -> /2147483648.0`, `float32` unchanged, "else" (8-bit, `uint8 - 128` as int16) divided by `np.max(np.abs(audio_data))` | **No peak normalisation** for 16/32-bit PCM; only the 8-bit path peak-scales. 24-bit is rejected (`Unsupported bit depth`) |
| resampling | `def resample_linear(samples, orig_rate, target_rate): """Resample audio using linear interpolation."""` (line 353); applied only when `orig_sample_rate != TARGET_SAMPLE_RATE` | **No anti-alias low-pass filter**; record `{"method": "linear_interpolation", "anti_alias_filter": false}`. Do not claim the Phase 5 polyphase fix |
| embedding | classifier writes `'embedding_model': 'surfperch'`, `'embedding_version': '1.0'` (handler.py:191-192) | `dimension` 1280 |
| window aggregation before the MLP | `mean_embedding = embeddings.mean(axis=0)`; `'aggregation': 'mean'` (classifier handler.py:159, 189) | Record `serving.window_pooling: "mean"` truthfully. Training-vs-serving skew is documented in `.planning/audit/DATA-MODEL.md` F8 (peak-normalised training audio, mean-pooled serving, no anti-alias, mixed reference vector construction); record these as `known_gaps`, not as fixed |
| reference vector construction | differs per dataset (F8d) | `known_gaps` entry; Phase 5 owns the fix |

### Deterministic 2-D PCA (computed this session on the real 48 x 1280 matrix)
- Sort sites by `site_id`; build `X` from the **published float32** values cast to float64; `Xc = X - X.mean(0)`; `U,S,Vt = np.linalg.svd(Xc, full_matrices=False)`; components `Vt[:2]`; `explained_variance_ratio = S**2 / sum(S**2)`.
- Result: PC1 0.18310361, PC2 0.14682953, cumulative **0.3299 (33.0%)**; PC3 0.1130; singular-value gap s2/s3 = 1.14 (no near-degeneracy between PC1/PC2).
- Sign rule: flip each component so its largest-|loading| entry is positive (sklearn `svd_flip` v-based). Margin for the top-|loading| entries is 0.1375 vs 0.1405 (PC1) and 0.1299 vs 0.1396 (PC2), so a 1e-9 numerical difference cannot change the sign choice. Row-permutation changes components by 2.6e-16; SVD vs covariance-eigh agree to 3.1e-16; float32 vs float64 source changes them by 4.7e-9.
- Publish `mean` (1280), `components` (2 x 1280), `site_ids`, `coordinates` (rounded to 6 decimals), `explained_variance_ratio`, `explained_variance`, the sign rule and a plain-language `note` ("2-D linear projection; shows 33.0% of the variance; plane distances are not embedding distances") so Phase 9 can project an upload and Phase 6 can label the axes honestly.
- CI compares recomputed vs committed coordinates with `atol=2e-6` (numpy 2.5.3 local vs 1.26.4 in CI, rounding to 6 decimals); never compare file hashes of recomputed output.

## Hosting and Publishing Design

### Bucket + CloudFront (all values verified read-only this session unless tagged)
- Account `781978598306`, IAM user `reefradar-agent` has `AdministratorAccess` [VERIFIED: iam list-attached-user-policies]. No CloudFront distributions and no OACs exist; CloudFront API access works (`list-distributions` returns empty without error) [VERIFIED]. Existing buckets: `reefradar-2477-audio`, `reefradar-2477-codebuild-artifacts`, `reefradar-2477-embeddings`; both app buckets have all four public-access-block flags true; the audio bucket's CORS allows GET from `*` (precedent for wildcard CORS in this project) [VERIFIED]. No account-level public-access block is configured (`NoSuchPublicAccessBlockConfiguration`), so set the new bucket's block explicitly.
- Bucket: `reefradar-2477-contract`, us-east-1 (omit `LocationConstraint`), public-access-block all true, Object Ownership "bucket owner enforced" (required for OAC [CITED: docs.aws.amazon.com]), default SSE-S3 (OAC with SSE-KMS would need a key policy edit, avoid KMS), no website hosting.
- OAC: `create_origin_access_control` `{Name:'reefradar-2477-contract-oac', SigningProtocol:'sigv4', SigningBehavior:'always', OriginAccessControlOriginType:'s3'}`; find existing by name first (idempotency).
- Distribution: standard pay-as-you-go (not a flat-rate plan). Origin domain `reefradar-2477-contract.s3.us-east-1.amazonaws.com` (regional endpoint), `OriginAccessControlId`, `S3OriginConfig.OriginAccessIdentity: ""`; default behaviour `ViewerProtocolPolicy: redirect-to-https`, `AllowedMethods` GET/HEAD, `Compress: true`, `CachePolicyId 658327ea-f89d-4fab-a63d-7e88639e58f6`, `ResponseHeadersPolicyId 60669652-455b-4ae9-85a4-c4c02393f86c`, `HttpVersion http2and3`, `IsIPV6Enabled true`, `PriceClass_All` (audience spans Indonesia, Kenya, Australia, Mexico; cost difference is negligible at this volume) [ASSUMED]. Idempotency: stable `Comment: 'reefradar-2477-contract'` + tag `Project=reefradar-2477`, look up by comment before creating; use a stable `CallerReference` [ASSUMED: re-sending an identical create returns the existing distribution]. Wait with the `distribution_deployed` waiter (minutes).
- Bucket policy, **after** the distribution exists (needs its ARN): allow `s3:GetObject` on `arn:aws:s3:::reefradar-2477-contract/*` to principal `Service: cloudfront.amazonaws.com` with `Condition.StringEquals."AWS:SourceArn" = arn:aws:cloudfront::781978598306:distribution/<ID>` [CITED: docs.aws.amazon.com private-content-restricting-access-to-s3]. **Do not grant `s3:ListBucket`**: a `GET /` through CloudFront would then become a bucket listing; without ListBucket S3 answers 403 (not 404) for missing keys [ASSUMED: standard S3 behaviour], so the client treats 403 and 404 as "not found".
- CORS: no S3 bucket CORS needed (browser never talks to S3); the managed response-headers policy adds `Access-Control-Allow-Origin: *`. Request design: plain `GET`, no custom request headers, so there is no preflight. Do not pass `credentials`.
- Cache-Control set by the publisher at upload: `public, max-age=31536000, immutable` for `v{N}/**` and `contract/v{N}.json`; `public, max-age=60` for `contract/latest.json`. Worst-case pickup delay for a flipped pointer is about 60 s at the edge plus 60 s in the browser cache (about 2 minutes); acceptable and stated in docs.
- Fallback if CloudFront create is refused (new-account verification error): public-read bucket + bucket CORS `*`, base URL override via env; module unchanged. [ASSUMED risk, account is 8+ months old and list calls work]
- Cost: CloudFront always-free tier is 1 TB data transfer out and 10 M HTTP/HTTPS requests per month on pay-as-you-go [CITED: aws.amazon.com/cloudfront/pricing/pay-as-you-go via search result]. A full contract load is about 0.35 MB gzipped (sites+manifest+PCA) to 0.6 MB (with embeddings). S3 storage for a few MB is pennies; request costs round to zero. Hotlinking risk is bounded by the budget alarm.

### AWS Budget (current state read this session)
- Existing: `reefradar-2477-budget`, `BudgetLimit 50.0 USD`, `MONTHLY`, ActualSpend 10.557, ForecastedSpend 10.794; `describe-notifications-for-budget` returns `Notifications: []`. **No alarm exists today.** SNS: `list-topics` is empty.
- Create a second budget `reefradar-2477-ceiling-25` (do not mutate the owner's $50 budget): `BudgetType COST`, `TimeUnit MONTHLY`, `BudgetLimit {Amount:'25', Unit:'USD'}`, notifications `ACTUAL >= 80%`, `ACTUAL >= 100%`, `FORECASTED >= 100%` with `Subscribers [{SubscriptionType:'EMAIL', Address:<owner email>}]` (direct email subscribers, no SNS needed). Budget data lags 8-12 h [ASSUMED], so it is an alarm, not a stop; the automated stop action is Phase 8 (Q10).
- **Owner email is a required input and is not stored anywhere in the repo or AWS.** Accept it as `--notify-email` or env `REEFRADAR_ALERT_EMAIL`; never commit it, never hard-code it, and the setup script's dry-run must print `BLOCKED: owner alert email required` when absent. The planner should add a decision checkpoint for it (standing approval covers the AWS change, not the address).

### Publisher behaviours (extend the `publish_model.py` / `sync_sample_audio.py` pattern)
`main(argv=None, s3_client=None)` for moto injection; `--dry-run`, `--confirm`, `--bucket`, `--profile reefradar`, `--region us-east-1`, `--bundle contracts/bucket`, `--version N`, `--set-latest N`. Steps: (1) validate every bundle file against its schema and recompute sha256 vs manifest, reject any `"fixture": true` or `CRLF` in text files; (2) for each artifact `put_object(..., IfNoneMatch='*', CacheControl=immutable, ContentType, Metadata={'sha256':…})`, treating HTTP 412 as "exists": allowed only if the existing bytes' sha256 equals the local one (idempotent re-run after a partial publish), otherwise abort (never overwrite); (3) `contract/v{N}.json` the same way; (4) re-download every object and compare sha256; (5) only then write `contract/latest.json` with `IfMatch=<etag from head_object>` (first publish: `IfNoneMatch='*'`); (6) append to `contracts/PUBLISHED.json`. `--set-latest N` verifies `contract/vN.json` exists and its sha256 matches `PUBLISHED.json` before flipping. Output is JSON lines with keys, sizes, sha256; never presigned URLs or credentials. Cache invalidation is never required (versions are immutable; latest has a 60 s TTL); do not create CloudFront invalidations.

## Schema Policy, Mirroring and Drift Detection

- JSON Schema draft 2020-12, one `$id` per file (use `urn:` ids so refs do not depend on the not-yet-known CDN host), cross-file `$ref` resolved through a registry in Python.
- Read schemas are **forward-compatible**: no `additionalProperties: false` on any app-consumed object; every required property listed; nullable values explicit (`["string","null"]`). Zod mirror uses `z.looseObject()`.
- Avoid the `format` keyword (Ajv needs `ajv-formats`; Python needs a format checker; Zod `z.iso.datetime()` accepts a different set than the JSON Schema `date-time`). Use `pattern` regexes shared verbatim between the JSON Schema and the Zod mirror (for ISO timestamps, versions, hashes `^[0-9a-f]{64}$`).
- **Parity (CONTEXT: "validates fixtures against both and fails if they disagree"):** `scripts/check_contract.py --write-corpus` emits `contracts/fixtures/parity-corpus.json`: every committed artifact (verdict `valid`) plus mechanically generated mutants (drop each required key, wrong type, bad enum, bad pattern; verdict `invalid`), each tagged with the Python verdict. Vitest `contract-schema-parity.test.ts` asserts `zodSchema.safeParse(instance).success === verdict` for every entry, and compares `Object.keys(z.toJSONSchema(schema).properties)` and `required` against the JSON Schema for each object node. Python CI runs `--check` so a stale corpus fails. Optional second engine: Ajv (see Supporting).
- **Additive-only check (`check_contract.py --additive`):** (a) behavioural: every published bundle under `contracts/bucket/v*/` (manifests, sites, etc.) must validate against the **current** `contracts/schema/*.json` (catches newly required properties, tightened types/patterns/enums); (b) structural: every `properties` key and every enum value present in the schema copy published in `contracts/bucket/v*/schema/` still exists in the current schema. This needs no git history (CI checkouts are shallow).
- AnalysisResult stamp block: keys `contract_version` (integer or null), `dataset_version`, `model_version`, `preprocessing_spec_version` (strings or null), all four **required keys**; invariant `contract_version === null` implies `dataset_version === null` and `preprocessing_spec_version === null` (`if/then` in JSON Schema, `.refine` in Zod). Null means "pre-contract" and is what `/visualize` returns for old RESULT items.

## Classifier Version Stamping (design from reading the code)

- RESULT write: `result_item = {...}` at `lambdas/classifier/handler.py:177-197`; stored via conditional `put_item` after `convert_floats`. Add the four keys beside `embedding_summary`. `convert_floats` only touches floats, so an `int` `contract_version` is stored as a DynamoDB number.
- Source of values: a new `lambdas/shared/contract_stamp.py` (stdlib, mirrors `site_provenance.py`: prefer a bundled `contract_stamp.json` next to the module, fall back to the repo file) reading `contracts/bucket/v1/stamp.json` (the same bytes published at `v1/stamp.json`). Add two members to `infrastructure/lambda-packages/classifier.json` (currently 4 members: handler.py, region_detection.py, site_provenance.py, site_label_provenance.json [VERIFIED]): `lambdas/shared/contract_stamp.py -> contract_stamp.py` and `contracts/bucket/v1/stamp.json -> contract_stamp.json`. The existing test `test_classifier_package_includes_shared_members` (`lambdas/classifier/tests/test_handler.py:289`) must be updated; `drift-check.py` will report classifier DRIFT from the commit until the deploy, expected.
- **Staleness guard (the stamp is a bundled constant):** the runtime already holds the loaded model config. Stamp `model_version` from `config['version']` (truth), and emit the other three bundled values only when `config['version'] == stamp['model_version']`; otherwise `contract_version/dataset_version/preprocessing_spec_version = null` (honest "not covered by a published contract") instead of a stale lie. Optional second guard: compare the loaded reference metadata `version` ('6.0') to a stamp field.
- Router passthrough: `handle_visualize` returns an explicit dict (`lambdas/router/handler.py:503-511`), so add the four keys using `item.get(...)`; cast `contract_version` with `int(...)` because the router's `DecimalEncoder` returns `float(obj)` (line 17-22), which would serialise `1` as `1.0`; absent keys yield `null`.
- Frontend: add the four optional-nullable fields to `AnalysisResult` (`src/types/index.ts:~142`), and in `AnalysisResults.tsx` (it already renders `Model: {classification.model_version}` at line ~65) render a helper `formatContractStamp(result)` exported by the contract module: `Contract v1` or `pre-contract`. `useContract(result.contract_version)` resolves that exact version. Visual baselines cover only the 11 route initial states (no result view) [VERIFIED: tests/e2e/support/states.ts], so the added line does not touch them.
- Deploy: classifier + router only, via `py -3.12 scripts/deploy-lambdas.py --function classifier --function router --dry-run` then `--confirm` from a **clean committed tree**; warm the inference container first (`lambda invoke` of `reefradar-2477-inference` with `{}`), run `verify_live_truth.py` serially (extend it to assert the four keys on both analyses), then `drift-check.py --function all`, then refresh `infrastructure/deployed-state.json`. Account Lambda concurrency limit is 10 until Service Quotas request `4b8d23edbdcf43d9a9eee46fddc7b589IQUhYJr5` is granted; the classifier already has `MaximumRetryAttempts=0` [CITED: docs/deploy/DEPLOY-LOG.md]. Rollback: `--ref <previous commit> --confirm`.

## Frontend Details

- **Hooks:** `useContract(version?)`, `useReferenceSites()`, `useModelVersion()`, `useCoverage()` (+ internal `useLegacySitesResponse()`). Every fetch goes through one `fetchArtifact(path, schema)` in `client.ts` that Zod-parses, verifies sha256 against the manifest (`crypto.subtle`, secure contexts only: https and localhost), and throws typed errors (`ContractNotFoundError` for 403/404, `ContractIntegrityError`, `ContractSchemaError`). Sites JSON only; `embeddings.f32` and `projection.json` are published and verified but fetched only when a later phase adds a consumer (`useProjection()` is optional now).
- **Base URL:** `process.env.NEXT_PUBLIC_CONTRACT_BASE_URL` must be referenced literally (Next inlines only static property access), normalised to one trailing slash, default constant = the CloudFront domain created by the infra plan (so infra precedes this wiring). Optional: `<link rel="preconnect">` to that origin in `layout.tsx` to hide TLS setup for the 3 sequential requests.
- **`data-contract-version`:** the contract module sets `document.documentElement.dataset.contractVersion` and `contractPinned` after a manifest resolves. This is the observable for e2e and debugging; it has no visual effect.
- **Pages to repoint:** `src/app/page.tsx:21-23`, `src/app/dashboard/page.tsx:12-14`, `src/app/about/page.tsx:17-19`, `src/app/sites/page.tsx:48-51`, `src/app/dashboard/map/page.tsx:56-59` all use `queryKey: ['sites']` + `api.getSites()` [VERIFIED]. `sites/page` and `map/page` use `isLoading`, `error` and `refetch`, so `useLegacySitesResponse()` must return those. `deriveSiteStats` reads only `sites`.
- **Remaining hard-coded reference data (criterion 1 says "only from it"):** `SITE_COORDINATES` in `src/types/index.ts` (62 entries incl. 4 ids not in the 54) used by `map/page.tsx:65` (a `site.latitude ?? coords.lat` fallback that never triggers once contract sites carry coordinates) and `components/maps/MiniMap.tsx:27-56` (analysis result similar-site map; it genuinely depends on it). Move both to contract lookups: MiniMap via a `useSiteIndex()` hook. Its `location` strings equal `${region}, ${country}` for all sites **except Bora-Bora** (`'Bora-Bora, French Polynesia'` vs region `Society Islands`), hence the contract Site `location_label` field. `ALL_COUNTRIES` in `map/page.tsx:35` is a UI ordering constant and is left as is (deriving it would reorder the filter chips, a visual change); logged as an Open Question.
- **Tests to update:** `tests/unit/sites-page.test.tsx` mocks `@/lib/api` `getSites`; rewrite to stub `fetch` against the contract fixtures (a shared `tests/unit/support/contract-fetch.ts`). It is the only unit test referencing `getSites` [VERIFIED: grep].
- **ESLint fence (verified by running ESLint 8.57.1 against a scratch config):** in `.eslintrc.json` add an `overrides` block `files: ["src/**/*.{ts,tsx}"]`, `excludedFiles: ["src/features/contract/**"]` (this file currently only has `{"extends": "next/core-web-vitals"}`). Result of the run: deep import, string literal, template literal and `process.env.NEXT_PUBLIC_CONTRACT_BASE_URL` all errored in a non-contract path, and the same file placed under `src/features/contract/` produced zero errors. `next lint` lints `src` by default. Also add a CI script `scripts/check-contract-fence.mjs` (Node built-ins, same style as `check-citations.mjs`) grepping `dashboard-next/src` for `cloudfront.net`, `contract/latest.json`, `NEXT_PUBLIC_CONTRACT_BASE_URL`, `contracts/fixtures`, and any `getSites(` outside `src/lib/api.ts` and the contract module, with an ESLint-API unit test (`new ESLint({cwd}).lintText(code,{filePath})`) that proves a planted violation fails.

## Fixtures and "picked up without a redeploy"

- **Vitest:** stub `globalThis.fetch` with a function reading `contracts/bucket/**` and `contracts/fixtures/**`; unit tests run under jsdom. `crypto.subtle` works in this vitest jsdom environment [VERIFIED: temporary test passed, removed]. Hook flip test: render a probe component using `useCoverage()` with the shared `QueryClient`, assert `has_diel === false`; swap what the fake server returns for `latest.json` to v2; `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(60_000)`; assert `has_diel === true` with no module reload (the same running component and QueryClient = "no rebuild"). Fallback if timers misbehave: `queryClient.refetchQueries({queryKey:['contract','latest']})`.
- **Playwright (e2e project):** `mockContract()` inside `mockApi()`; test: `page.clock.install()` before `goto`, load `/sites/`, assert `html[data-contract-version="1"]`, switch the route handler to return `latest-v2.json`, `await page.clock.fastForward(60_000)` ("time flows naturally" after install; `fastForward` fires due timers once [CITED: playwright.dev/docs/clock]), then `await page.waitForRequest(/contract\/v2\.json/)` and assert `data-contract-version="2"` with the same page (no reload, same Next build). Pinned test: with latest = v2, `goto('/sites/?cv=1')`, assert **no request to `latest.json` was ever made**, `data-contract-version="1"` and `contractPinned="true"`.
- **Never** serve fixtures from `src/` or `public/`; `contracts/` is outside the Next build, so production bundles contain no fixture bytes.

## Common Pitfalls

### Pitfall 1: Embedded count says 44, truth is 48
**What goes wrong:** copying `sites_with_embeddings: 44` (in `metadata_v6.json`, the live `/sites` header and the committed fixture header) breaks success criterion 2 and the legacy page counts.
**How to avoid:** compute `sites_with_embeddings` from `reference_role`; add a test `coverage.sites_with_embeddings == 48 == #acoustic_reference`. The adapter returns the corrected number (no page reads the field). File the stale backend header as a Phase 17 cleanup note.

### Pitfall 2: Building from metadata_v6 statuses or DOIs
**What goes wrong:** Bora-Bora ships as `healthy`/`degraded` again and the Irma DOI regresses to the banned `dryad.sxksn0319`, which `scripts/check-citations.mjs --scope docs` would also flag in any tracked text file.
**How to avoid:** statuses and label fields come only from the provenance overlay; DOIs/licences only from `citations.json` by `dataset_id`; a test asserts no contract text contains a banned citation pattern. Also avoid writing "MARRS" and "2024" on the same line in new tracked text (banned pattern).

### Pitfall 3: Windows CRLF and binary corruption
**What goes wrong:** `git config core.autocrlf` is `true` on this box; no `.gitattributes` exists. A CRLF working tree hashes differently from the committed blob (this already forced `normalize_text_bytes` in `lambda_packaging.py`); but applying that normaliser to `embeddings.f32` would corrupt bytes.
**How to avoid:** add `.gitattributes` entries `contracts/**/*.json text eol=lf` and `contracts/**/*.f32 -text`; the builder writes with `newline='\n'`; the publisher normalises only `.json`; a pytest asserts every file's sha256 equals its manifest entry (fails on a CRLF checkout).

### Pitfall 4: CI concurrency cancel-in-progress
**What goes wrong:** pushing while a `workflow_dispatch` snapshot-regeneration run is active cancels it. Visual baselines must not change this phase, so no snapshot regeneration should be needed; if the adapter parity gate fails, fix the adapter, not the baselines.

### Pitfall 5: Credentials and URLs in logs
**What goes wrong:** printing presigned URLs, profile config or tokens. **How to avoid:** boto3 `Session(profile_name='reefradar')` only; never open `~/.aws/*`, `.vercel/auth*`, `gh` hosts files, or `dashboard-next/.vercel`; log keys, sizes, hashes, ETags only. The alert email address is also not logged in full.

### Pitfall 6: `NEXT_PUBLIC_*` is build-time
Setting the env var after `next build` has no effect; tests intercept the host instead. A wrong default URL requires a rebuild, so verify the CloudFront URL with `curl -I` before wiring it.

### Pitfall 7: `useSearchParams` without Suspense breaks `next build`
See Pattern 2. Wrap the smallest leaf in `Suspense`; do not set `missingSuspenseWithCSRBailout: false`.

### Pitfall 8: Zod `object` vs additive schemas
`z.object()` strips unknown keys on parse and `toJSONSchema` marks `additionalProperties: false`; a v2 manifest with a new field would still parse (stripped) but the parity check would disagree. Use `z.looseObject()` everywhere.

### Pitfall 9: Playwright project `testIgnore` replacement
The e2e project's `testIgnore` replaces the top-level one [VERIFIED: playwright.config.ts]: do not name new specs `*-live.spec.ts` and do not add them to the excluded set unless intended. Specs must call `expectNoUnhandledApiCalls` (extend it to contract calls).

### Pitfall 10: DecimalEncoder floats
`contract_version: 1` would be emitted as `1.0` by the router; cast to `int`.

### Pitfall 11: 403 vs 404 and CloudFront error caching
Without `s3:ListBucket`, a missing `contract/v9.json` is a 403. Treat both as `ContractNotFoundError`. CloudFront caches error responses for a short default period [ASSUMED: about 10 s], so check `ErrorCachingMinTTL` after creation and set it to 0-10 s; a version flipped live immediately after a failed probe may briefly appear missing.

### Pitfall 12: Lambda package drift and deploy cleanliness
Changing `classifier.json` makes `drift-check.py` fail until deployed. `deploy-lambdas.py` refuses a dirty tree: commit everything first, then deploy, then verify, then re-run drift-check. Do not run analyses in parallel (concurrency limit 10).

### Pitfall 13: Flat-rate CloudFront plan has no private origin
Create the distribution through the API (pay-as-you-go), not the console's plan picker, or OAC will not be available.

### Pitfall 14: Budget lag and email
Budgets refresh every few hours; the alarm is not a stop. Without an owner-supplied address the budget cannot be armed: make that an explicit blocking checkpoint before the first publish.

### Pitfall 15: Visual baseline drift from timing, not data
Pages now make three sequential requests (latest -> manifest -> sites). Playwright waits for `networkidle` before screenshots [VERIFIED: visual.spec.ts], so layout should match; if a baseline differs, check that `isLoading` still renders the same loading UI as before and that `mockContract` serves instantly.

## Code Examples

### PCA (verified output above)
```python
# scripts/contract_lib.py  (numpy only; Source: project design, verified on the 48x1280 matrix this session)
import numpy as np

def pca_2d(rows: np.ndarray):
    """rows: (n, d) float32 as published, sorted by site_id."""
    X = rows.astype(np.float64)
    mean = X.mean(axis=0)
    Xc = X - mean
    _, S, Vt = np.linalg.svd(Xc, full_matrices=False)
    comps = Vt[:2].copy()
    for i in range(2):                      # sign rule: largest |loading| is positive
        if comps[i, int(np.argmax(np.abs(comps[i])))] < 0:
            comps[i] *= -1
    evr = (S ** 2) / np.sum(S ** 2)
    return mean, comps, Xc @ comps.T, evr[:2]
```

### Publisher write with S3-enforced immutability
```python
# Source: AWS S3 conditional writes (412 PreconditionFailed when key exists) + boto3 1.43.106 PutObject params
from botocore.exceptions import ClientError

def put_immutable(s3, bucket, key, body, content_type, sha256_hex):
    try:
        s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type,
                      CacheControl="public, max-age=31536000, immutable",
                      Metadata={"sha256": sha256_hex}, IfNoneMatch="*")
        return "created"
    except ClientError as e:
        if e.response["Error"]["Code"] not in ("PreconditionFailed", "412"):
            raise
        existing = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        if hashlib.sha256(existing).hexdigest() != sha256_hex:
            raise PublishError(f"{key} exists with different content; versions are immutable")
        return "exists_identical"
```

### Pointer flip (last step)
```python
head = s3.head_object(Bucket=bucket, Key="contract/latest.json")   # NoSuchKey/404 on first publish -> use IfNoneMatch='*'
s3.put_object(Bucket=bucket, Key="contract/latest.json", Body=pointer_bytes,
              ContentType="application/json", CacheControl="public, max-age=60",
              IfMatch=head["ETag"])
```

### ESLint fence (verified by running ESLint 8.57.1)
```json
{
  "extends": "next/core-web-vitals",
  "overrides": [{
    "files": ["src/**/*.{ts,tsx}"],
    "excludedFiles": ["src/features/contract/**"],
    "rules": {
      "no-restricted-syntax": ["error",
        { "selector": "Literal[value=/NEXT_PUBLIC_CONTRACT_BASE_URL|cloudfront\\.net|contract\\/(latest|v\\d+)\\.json/]", "message": "Contract artifacts may only be fetched from src/features/contract." },
        { "selector": "TemplateElement[value.raw=/contract\\/(latest|v)|cloudfront\\.net/]", "message": "Contract artifacts may only be fetched from src/features/contract." },
        { "selector": "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/CONTRACT/]", "message": "Contract config is read only inside src/features/contract." }
      ],
      "no-restricted-imports": ["error", { "patterns": [{ "group": ["@/features/contract/*", "**/features/contract/*", "**/contracts/fixtures/**"], "message": "Import from '@/features/contract' only." }] }]
    }
  }]
}
```
(When writing this through a shell heredoc, backslashes are collapsed by the Bash tool; use the Write tool.)

### Zod mirror shape
```typescript
// Source: zod.dev (v4). looseObject keeps unknown keys, matching additive JSON Schemas.
import { z } from 'zod';
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
export const Coverage = z.looseObject({
  has_diel: z.boolean(), has_detections: z.boolean(),
  has_pre_post_event: z.boolean(), has_effort: z.boolean(),
  total_sites: z.number().int(), sites_with_embeddings: z.number().int(), countries: z.number().int(),
});
export const Site = z.looseObject({
  site_id: z.string(), reference_role: z.enum(['acoustic_reference', 'location_only']),
  status: z.enum(['healthy', 'degraded', 'restored_early', 'restored_mid', 'unknown']),
  doi: z.string().nullable(), licence: z.string(), label_assigned_by: z.string(),
  label_original: z.string().nullable(), label_definition: z.string().nullable(),
  status_basis: z.string().nullable(), synthetic: z.literal(false),
  projection: z.looseObject({ x: z.number(), y: z.number() }).nullable(),
});
```

### Proposed v1 manifest (abridged; field names are the recommendation)
```json
{
  "schema_version": 1, "contract_version": 1,
  "dataset_version": "reefradar-reference-v6.0",
  "model_version": "interim-real-only",
  "preprocessing_spec_version": "preproc-1.0.0-asdeployed",
  "published_at": "<fixed at build time and committed, so the bundle is reproducible>",
  "coverage": { "has_diel": false, "has_detections": false, "has_pre_post_event": false, "has_effort": false,
                "total_sites": 54, "sites_with_embeddings": 48, "countries": 7 },
  "artifacts": {
    "sites": {"uri":"v1/sites.json","sha256":"…","bytes":0,"count":54},
    "embeddings": {"uri":"v1/embeddings.f32","sha256":"…","dtype":"float32-le","dim":1280,"count":48,"row_site_ids":["aus_D1","…"]},
    "projection": {"uri":"v1/projection.json","sha256":"…","method":"pca","explained_variance_ratio":[0.18310361,0.14682953]},
    "model_version": {"uri":"v1/model_version.json","sha256":"…"},
    "preprocessing_spec": {"uri":"v1/preprocessing_spec.json","sha256":"…"},
    "stamp": {"uri":"v1/stamp.json","sha256":"…"},
    "schemas": {"contract_manifest":{"uri":"v1/schema/contract-manifest.schema.json","sha256":"…"}},
    "aggregates_diel": {"present": false}, "aggregates_effort": {"present": false}, "detections": {"present": false}
  },
  "datasets": [ { "id":"marrs","name":"MARRS","doi":"10.5522/04/29958062","licence":"CC BY 4.0","url":"https://doi.org/10.5522/04/29958062" } ],
  "sources": { "reference_metadata": {"key":"reference/metadata_v6.json","sha256":"5adc487d3f25d1037fdb2145ca5c56474459d7b32ec3c914a00f2c47719ca2e3"} }
}
```
Artifact `uri`s are **relative** to the contract base URL so the same bundle serves from CloudFront, fixtures, or a local server. Naming of `dataset_version` / `preprocessing_spec_version` is Claude's discretion; the invariant is that `model_version` equals the live config `version` (`interim-real-only`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Check-then-put for "no overwrite" | S3 conditional writes `If-None-Match: *` / `If-Match` | 2024 (GA) | Publisher immutability and pointer CAS are enforced by S3 |
| CloudFront OAI | OAC (SigV4, all regions, SSE-KMS) | 2022+ | Use OAC |
| CloudFront classic only | Flat-rate Free/Pro plans exist but exclude private origins | recent | Must use pay-as-you-go for OAC |
| Hand-maintained JSON Schema/Zod pairs | Zod 4 `z.toJSONSchema()` (draft 2020-12 default) | Zod 4 | Used only for the structural drift check; the JSON Schema stays the source of truth because Python must validate it too |
| `useSearchParams` freely | Requires `Suspense` for static prerender | Next 14.2 / 15 / 16 | Leaf client component pattern |

**Deprecated/outdated:** `RefResolver` in python-jsonschema (use `referencing`); `esbuild.jsx` in vitest 5 (repo already uses `oxc.jsx`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Re-sending an identical `CreateDistribution` with a stable `CallerReference` returns the existing distribution; lookup-by-Comment is the primary idempotency mechanism | Hosting | Duplicate distribution (cost nil, clutter); script must check by comment first regardless |
| A2 | Without `s3:ListBucket`, missing keys return 403 through OAC | Hosting / Pitfall 11 | Client treats 403 and 404 identically, so low impact |
| A3 | CloudFront default error-caching TTL is about 10 s | Pitfall 11 | Brief "version missing" blip after flip; set `ErrorCachingMinTTL` explicitly |
| A4 | `PriceClass_All` cost difference is negligible at this volume | Hosting | Trivial |
| A5 | AWS Budgets email subscribers need no confirmation and budget data lags 8-12 h | Budget | Alarm is slower or needs an SNS confirmation step |
| A6 | AWS Budgets charges nothing for a second plain cost budget | Budget | Cents per day at worst |
| A7 | `page.clock.install()` before `goto` does not stall Next hydration (time flows naturally) | Fixtures | Fall back to vitest-only flip proof plus a focus-event refetch |
| A8 | `latest.json` pickup delay of about 2 minutes (CDN 60 s + browser 60 s) is acceptable to the owner | Hosting | Could add `s-maxage` tuning; CONTEXT locks `max-age=60` |
| A9 | The owner is content with a second budget named `reefradar-2477-ceiling-25` rather than editing the $50 one | Budget | Owner may prefer to delete/replace the $50 budget |
| A10 | Zod 4.4.3 supports `looseObject`, `literal`, `toJSONSchema` identically to 4.6.x | Stack | Version bump needed; verify in Wave 0 by running the parity test |

## Open Questions

1. **Owner alert email for the budget.**
   - Known: no SNS topic, no budget notification, and the address is not in the repo.
   - Unclear: which address the owner wants.
   - Recommendation: blocking decision checkpoint before the infra plan's `--confirm`; pass via `--notify-email` / `REEFRADAR_ALERT_EMAIL`, never commit.

2. **SanctSound has no DOI.** Success criterion 2 literally says every site carries a DOI.
   - Recommendation: `doi: null` plus mandatory `url` and a `doi_note` ("no collection-level DOI; per-station DOIs at NCEI", per `citations.json`), and encode the criterion as "DOI present or explicitly null with a reason" in the verification. Do not invent a DOI.

3. **`status_basis` shape.** ARCHITECTURE section 3.4 proposed an enum (`upstream | reefradar-assigned`); Phase 1 data uses free text or null.
   - Recommendation: keep free text/null (matches shipped data) and add an optional enum field `status_origin` later if wanted (additive).

4. **Legacy navigation drops `?cv=`.** Recommendation: accept for Phase 2 (each URL resolves exactly its pin); PERSIST-01 (Phase 6) carries pins across navigation.

5. **`ALL_COUNTRIES` in `map/page.tsx` and other UI constants** are derived-from-reference-data in spirit but changing them alters filter-chip order. Recommendation: leave, note for Phase 6.

6. **Stale `sites_with_embeddings: 44` in the live `/sites` header.** Recommendation: leave the backend unchanged (retires in Phase 17), record it in docs, make the contract correct.

7. **Dataset staleness guard for the stamp** (loaded reference metadata version vs bundled stamp). Recommendation: implement the model guard (cheap, certain); implement the dataset guard only if the classifier already exposes the loaded metadata `version` without extra S3 reads.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | web build/tests | yes | 24.18.0 local, CI uses 22 | none needed |
| npm | installs | yes | 11.16.0 | — |
| Python | scripts/pytest | yes | 3.12.10 (`py -3.12`) | — |
| `jsonschema` | publisher, checks | **no** (ModuleNotFoundError) | pip resolves 4.26.0 | install in Wave 0 (+ add to `requirements-dev.txt` for CI) |
| numpy | PCA | yes | 2.5.3 local; CI 1.26.4 | tolerance-based compare |
| boto3 / moto | scripts/tests | yes | 1.43.106 / 5.2.3 | — |
| AWS CLI v1 | optional | yes | 1.46.1 (`py -3.12 -m awscli`) | boto3 scripts |
| AWS profile `reefradar` | all AWS calls | yes | user `reefradar-agent`, AdministratorAccess | — |
| CloudFront API access | infra | yes (list works, 0 distributions, 0 OACs) | — | public-bucket fallback |
| Playwright + Chromium | e2e | yes | 1.63.0, chromium 1217/1243 | CI Docker image |
| Docker | visual baselines locally | **no** | — | visual job runs in CI only (already the case) |
| Vercel CLI / gh | optional | yes | 62.0.0 / 2.102.0 | — |
| Owner alert email | budget | **no** | — | blocking decision (Open Question 1) |

**Missing dependencies with no fallback:** owner alert email (decision checkpoint).
**Missing dependencies with fallback:** `jsonschema` (install), Docker (CI covers visuals).

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework (web) | vitest 5.0.3 (jsdom, `include: tests/unit/**`), Playwright 1.63.0 (`e2e` + `visual` projects) |
| Framework (python) | pytest 9.1.1 + moto 5.2.3; `pytest.ini` `testpaths = lambdas scripts/tests`, `pythonpath = scripts lambdas/shared` |
| Config files | `dashboard-next/vitest.config.ts`, `dashboard-next/playwright.config.ts`, `/pytest.ini` |
| Quick run (web) | `cd dashboard-next && npx vitest run tests/unit/contract-*.test.ts` |
| Quick run (python) | `py -3.12 -m pytest scripts/tests/test_contract_*.py lambdas/classifier/tests lambdas/router/tests -q` |
| Full suite | `cd dashboard-next && npm run lint && npm run typecheck && npm test && npx playwright test --project=e2e`; `py -3.12 -m pytest`; `py -3.12 scripts/check_contract.py --all`; `node scripts/check-contract-fence.mjs` |

### Phase Requirements -> Test Map
| Req / criterion | Behavior | Test Type | Automated Command | File Exists? |
|-----------------|----------|-----------|-------------------|-------------|
| CONTRACT-01 / SC1 | Bundle files hash to manifest, validate against schemas, no `fixture: true`, no CRLF | pytest | `pytest scripts/tests/test_contract_bundle.py` | Wave 0 |
| CONTRACT-01 / SC1 | Publisher: dry-run no writes; refuses overwrite (412 + different bytes); latest flipped last; hashes re-verified; `--set-latest` | pytest + moto | `pytest scripts/tests/test_publish_contract.py` | Wave 0 |
| CONTRACT-01 / SC1 | Fence: planted violation fails ESLint; contract module passes; CI grep fails on violation | vitest + node | `npx vitest run tests/unit/contract-fence.test.ts`; `node scripts/check-contract-fence.mjs` | Wave 0 |
| CONTRACT-01 / SC1 | Live: `latest.json` 200 with `Cache-Control: public, max-age=60`, `Access-Control-Allow-Origin: *`; `v1/**` immutable; sha256 equals manifest; direct S3 URL returns 403 | live script | `py -3.12 scripts/verify_contract_live.py` (no secrets, public GETs) | Wave 0 |
| CONTRACT-02 / SC2 | 54 sites; every site has source, `dataset_id`, `doi` (null only for SanctSound with `url`), `licence`, `label_assigned_by`, `reference_role`; null label definition implies unknown + `status_basis`; 48 acoustic / 6 location-only; `doi`/`licence` equal `citations.json`; `synthetic` false | pytest | `pytest scripts/tests/test_contract_sites.py` | Wave 0 |
| CONTRACT-02 / SC2 | PCA recomputed from published f32 matches published coordinates (atol 2e-6), `explained_variance_ratio` sums to 0.3299 within 1e-6, only embedded sites carry `projection`, row order = sorted ids | pytest | `pytest scripts/tests/test_contract_projection.py` | Wave 0 |
| CONTRACT-02 / SC2 | Model/preprocessing artifacts equal sources: `model_version == "interim-real-only"`, hashes equal `models/interim-real-only/*`, equal `model-card.json`, no accuracy number, `synthetic_data` false | pytest | `pytest scripts/tests/test_contract_model.py` | Wave 0 |
| CONTRACT-03 / SC3 | Schema requires the four flags; fixture v2 differs from v1 manifest only in one flag (and version/uri fields) | pytest | `pytest scripts/tests/test_contract_fixtures.py` | Wave 0 |
| CONTRACT-03 / SC3 | Running app picks up flipped `latest.json`: hook level (fake timers) and browser level (`page.clock.fastForward`, `data-contract-version` 1 -> 2, no reload) | vitest + e2e | `npx vitest run tests/unit/contract-flip.test.tsx`; `npx playwright test --project=e2e contract-flip` | Wave 0 |
| CONTRACT-04 / SC4 | `?cv=1` with latest=v2 resolves v1, issues zero `latest.json` requests; invalid `cv` shows error, no fallback; `useContract(1)` from a result stamp | vitest + e2e | `npx vitest run tests/unit/contract-pin.test.tsx`; `npx playwright test --project=e2e contract-pin` | Wave 0 |
| CONTRACT-04 / SC4 | Classifier writes four stamp keys (and nulls on model mismatch); router `/visualize` returns them (`1` not `1.0`; old items -> null); schema invariant | pytest | `pytest lambdas/classifier/tests lambdas/router/tests lambdas/shared/tests -k stamp` | Wave 0 |
| CONTRACT-04 / SC4 | UI shows "Contract v1" or "pre-contract" | vitest | `npx vitest run tests/unit/results-components.test.tsx` (extend) | exists (extend) |
| CONTRACT-04 live | Two serial real analyses carry stamps equal to `v1/stamp.json`; drift-check MATCH | live script | `py -3.12 scripts/verify_live_truth.py` (extended), `py -3.12 scripts/drift-check.py --function all` | extend |
| CONTRACT-05 / SC5 | Whole e2e + axe + visual suites pass with contract fully mocked from `contracts/`; any real CloudFront/execute-api request fails the test | e2e | `npx playwright test --project=e2e`; CI `visual` job | extend mock-api |
| CONTRACT-05 / SC5 | Adapter parity: legacy `sites` array deep-equals `tests/fixtures/api/sites.json` `.sites` (visual-parity gate) | vitest | `npx vitest run tests/unit/contract-legacy-adapter.test.ts` | Wave 0 |
| Schema drift | Zod verdict == Python verdict for every corpus entry; property/required sets equal `z.toJSONSchema`; corpus fresh; additive-only vs published releases | vitest + pytest | `npx vitest run tests/unit/contract-schema-parity.test.ts`; `py -3.12 scripts/check_contract.py --check --additive` | Wave 0 |
| Infra | Setup script plan is read-only; ensure-functions idempotent against stubbed clients; resources.json updated | pytest | `pytest scripts/tests/test_setup_contract_infra.py`; live `py -3.12 scripts/setup_contract_infra.py --dry-run` | Wave 0 |

### Sampling Rate
- **Per task commit:** the two quick-run commands above (under 30 s).
- **Per wave merge:** full web suite + `pytest` + `check_contract.py --check --additive` + fence script.
- **Phase gate:** CI fully green (web, e2e, python, citations, visual), then live: `verify_contract_live.py`, serial `verify_live_truth.py`, `drift-check.py --function all`; `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `contracts/schema/*.json`, `contracts/bucket/**`, `contracts/fixtures/**` (generated by `build_contract.py`, needs one read-only S3 pull and the owner-free steps)
- [ ] `scripts/{contract_lib,build_contract,check_contract,publish_contract,setup_contract_infra,verify_contract_live}.py`, `scripts/check-contract-fence.mjs`
- [ ] `scripts/tests/test_contract_{bundle,sites,projection,model,fixtures}.py`, `test_publish_contract.py`, `test_setup_contract_infra.py`
- [ ] `dashboard-next/tests/unit/contract-*.test.ts(x)` + `tests/unit/support/contract-fetch.ts`; `tests/e2e/contract-flip.spec.ts`, `contract-pin.spec.ts`; `mockContract()` in `tests/e2e/support/mock-api.ts`
- [ ] Installs: `zod@4.4.3` (checkpoint), `jsonschema==4.26.0` (+ `requirements-dev.txt`), `.gitattributes`
- [ ] CI additions: python job `python scripts/check_contract.py --check --additive`; web job `node ../scripts/check-contract-fence.mjs` (or a new small job)

## Security Domain

> `security_enforcement` is enabled (absent/true) at ASVS level 1, block on high.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (public read-only data, no accounts) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | Private bucket, all public-access-block flags on; only the CloudFront distribution (`AWS:SourceArn`) may `GetObject`; no `ListBucket`; publisher uses the owner's IAM profile only |
| V5 Input Validation | yes | Zod-parse every fetched JSON at the boundary; `cv` validated `^[1-9]\d{0,5}$` before building a URL; only `https://` URLs from contract data are rendered as links (a Zod `.url()` does not block `javascript:`); React escapes strings, no `dangerouslySetInnerHTML` |
| V6 Cryptography | yes | `hashlib.sha256` / `crypto.subtle`; no custom crypto |
| V12 Files and Resources | yes | sha256 verification of every artifact (publisher and client); content types fixed by the publisher |
| V14 Configuration | yes | Wildcard CORS limited to credential-free public GET data; HTTPS-only viewer policy; secrets (owner email, profile) never committed or logged |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Overwriting a published version (tamper) | Tampering | `If-None-Match: *` on every versioned write; `PUBLISHED.json` guard; sha256 in manifest |
| Path injection via `?cv=` | Tampering | strict integer regex, bounded length, no string-to-path concatenation of user input |
| Stale or poisoned `latest.json` | Spoofing/Tampering | pointer carries `manifest_sha256`; client verifies the manifest hash; 60 s TTL |
| Hotlink bandwidth/cost abuse | Denial of service | $25 budget alarm (80/100/forecast), CloudFront free tier, tiny payloads |
| Bucket exposure via `ListBucket` or public policy | Information disclosure | no ListBucket grant, public-access-block on, OAC-only policy |
| Leaking presigned URLs / credentials / email in logs | Information disclosure | boto3 profile only, never print URLs/config, redact email |
| Malicious string rendered from contract (XSS) | Tampering | React escaping, link scheme allow-list |
| Dependency typosquat | Tampering | pinned exact versions, legitimacy audit above, human-verify checkpoint |

## Sources

### Primary (HIGH confidence, read or run this session)
- Repo files: `.planning/phases/02-data-contract-v1/02-CONTEXT.md`, `REQUIREMENTS.md`, `STATE.md`, `research/ARCHITECTURE.md`, `01-VERIFICATION.md`, `docs/deploy/DEPLOY-LOG.md`, `data/snapshots/api-sites.json`, `data/site-label-provenance.json`, `dashboard-next/src/data/citations.json`, `dashboard-next/src/data/model-card.json`, `docs/model/deployed-model.lock.json`, `models/interim-real-only/{model_config.json,TRAINING-REPORT.md}`, `lambdas/{classifier,preprocessor,router}/handler.py`, `lambdas/shared/site_provenance.py`, `scripts/{publish_model,sync_sample_audio,deploy-lambdas,lambda_packaging,build_api_fixtures,verify_live_truth,check-citations}`, `infrastructure/{resources.json,deployed-state.json,lambda-packages/*.json}`, `.github/workflows/ci.yml`, `dashboard-next/{package.json,tsconfig.json,vitest.config.ts,playwright.config.ts,.eslintrc.json,next.config.js,vercel.json}`, `src/{app,lib/api.ts,types/index.ts,lib/site-stats.ts}`, `tests/e2e/support/{mock-api,states}.ts`.
- AWS read-only calls (profile `reefradar`): `s3` list/get of `reference/metadata_v6.json` and `models/*`, `cloudfront list-distributions / list-origin-access-controls / list-cache-policies / list-origin-request-policies / list-response-headers-policies / get-cache-policy / get-response-headers-policy`, `budgets describe-budgets / describe-notifications-for-budget`, `sns list-topics`, `sts get-caller-identity`, `iam list-attached-user-policies`, `s3api get-public-access-block / get-bucket-cors`, `s3control get-public-access-block`. Public `GET /prod/sites`. No AWS writes were made.
- Local runs: PCA on the real matrix, ESLint 8.57.1 fence experiment, moto 5.2.3 `IfNoneMatch` experiment, vitest jsdom `crypto.subtle` test (temporary file removed), `npm pack --dry-run ajv@8.20.0`, `pip install --dry-run jsonschema==4.26.0`, gsd-tools `package-legitimacy check`.

### Secondary (MEDIUM confidence, official docs fetched)
- [Next.js 14 useSearchParams](https://nextjs.org/docs/14/app/api-reference/functions/use-search-params), [Missing Suspense boundary error](https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout)
- [Zod JSON Schema](https://zod.dev/json-schema), [Zod requirements](https://zod.dev/)
- [python-jsonschema validate guide](https://python-jsonschema.readthedocs.io/en/stable/validate/), [Ajv JSON Schema 2020-12](https://ajv.js.org/json-schema.html)
- [CloudFront restrict access to S3 (OAC)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html), [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html), [CloudFront pricing plans](https://aws.amazon.com/cloudfront/pricing/), [Playwright clock](https://playwright.dev/docs/clock)

### Tertiary (LOW confidence)
- [CloudFront pay-as-you-go always-free tier (search result summary)](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, versions and legitimacy checked against registry/seam, Zod/Ajv caveats noted
- Architecture: HIGH for contract shape and app side (verified by running experiments); MEDIUM for CloudFront create-distribution idempotency (not executed)
- Pitfalls: HIGH, each traced to a file, a run, or a documented source

**Research date:** 2026-10-01
**Valid until:** 2026-10-31 for repo/AWS state (the budget email, model objects and `/sites` can change as other phases land); stack versions 30 days
