# Phase 2: Data Contract v1 - Pattern Map

**Mapped:** 2026-10-01
**Files analyzed:** 22
**Analogs found:** 19 / 22 (3 partial or none)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `scripts/publish_contract.py` | script (publisher) | batch / file-I/O (S3) | `scripts/publish_model.py` | exact |
| `scripts/build_contract.py`, `scripts/contract_lib.py`, `scripts/check_contract.py` | script (builder/validator) | transform | `scripts/build_api_fixtures.py`, `scripts/publish_model.py` (hash helpers) | role-match |
| `scripts/setup_contract_infra.py` | script (AWS setup) | request-response | `scripts/publish_model.py` (`--dry-run`/`--confirm`, `_s3_client`) | partial |
| `scripts/tests/test_contract_*.py` | test | moto S3 | `scripts/tests/test_publish_tools.py` | exact |
| `lambdas/shared/contract_stamp.py` | utility | file-I/O (bundled JSON) | `lambdas/shared/site_provenance.py` | exact |
| `lambdas/classifier/handler.py` (modify) | service | CRUD (DynamoDB put) | itself, lines 176-198 | exact |
| `lambdas/router/handler.py` (modify `handle_visualize`) | controller | request-response | itself, lines 502-512 | exact |
| `infrastructure/lambda-packages/classifier.json` (modify) | config | n/a | itself | exact |
| `contracts/schema/*.schema.json`, `contracts/bucket/**`, `contracts/fixtures/**` | schema/data | n/a | `data/snapshots/api-sites.json`, `dashboard-next/tests/fixtures/api/sites.json` | partial |
| `dashboard-next/src/features/contract/{client,schema,hooks,legacy,version,index}.ts` | service/hook | request-response + cache | `src/lib/api.ts`, `src/lib/site-stats.ts`, `src/app/dashboard/page.tsx` (useQuery usage) | role-match |
| `dashboard-next/src/features/contract/ContractVersionSync.tsx` | provider | event-driven (URL state) | `src/app/providers.tsx`, zustand stores in `src/stores/` | partial |
| `dashboard-next/src/app/providers.tsx` (modify) | provider | n/a | itself | exact |
| 5 legacy pages (modify) | component | request-response | `src/app/dashboard/page.tsx` lines 11-17 | exact |
| `dashboard-next/.eslintrc.json` (modify), CI grep script | config | n/a | existing `.eslintrc.json`, `.github/workflows/ci.yml` | exact |
| `dashboard-next/tests/e2e/support/mock-api.ts` (extend with `mockContract`) | test support | request-response | itself | exact |
| `dashboard-next/tests/unit/contract-*.test.ts(x)` | test | transform | `tests/unit/site-stats.test.ts` | exact |
| `infrastructure/resources.json` (modify) | config | n/a | itself | exact |
| Contract version display in `AnalysisResults.tsx` | component | n/a | existing defensive-render pattern | role-match |

## Pattern Assignments

### `scripts/publish_contract.py` (script, batch S3 write)
**Analog:** `scripts/publish_model.py`

Copy these elements:
- Module docstring with `--dry-run` / `--confirm` semantics and "never prints presigned URLs or credentials" (lines 1-35).
- `from __future__ import annotations`, `REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent`, constants `DEFAULT_BUCKET` (line 46-47). Set `DEFAULT_BUCKET = "reefradar-2477-contract"`.
- Dedicated error class (lines 57-58): `class PublishError(RuntimeError)`; `main` catches it and returns 1 after `print(..., file=sys.stderr)` (lines 228-230).
- Hash helpers (lines 61-62, 78-81):
```python
def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
def verify_hash(label, body, expected):
    actual = sha256_hex(body)
    if actual != expected:
        raise PublishError(f"{label}: sha256 {actual} != expected {expected}")
```
- Publish-then-redownload-verify loop (lines 114-128): `put_object(..., Metadata={"sha256": digest})` followed by `verify_hash(..., _get_bytes(...), digest)`. Extend with `IfNoneMatch="*"`, `CacheControl="public, max-age=31536000, immutable"` for `v{N}/**` and `contract/v{N}.json`, and `CacheControl="public, max-age=60"` plus `IfMatch=<etag>` for the `latest.json` flip (last write).
- Parser and client (lines 146-166): `--dry-run`, `--confirm`, `--bucket`, `--profile` default `reefradar`, `--region us-east-1`; add `--set-latest N` (analogous to `--rollback`, lines 181-193, which verifies before writing).
- Injectable client for tests (lines 169-170): `def main(argv=None, s3_client=None) -> int`, `write = args.confirm and not args.dry_run`, and the dry-run messages at 220-222.
- Catch `botocore` `ClientError` code `PreconditionFailed` (412) and convert to `PublishError("version N already exists")`.

### `scripts/build_contract.py` / `contract_lib.py` / `check_contract.py` (transform)
**Analog:** `scripts/publish_model.py` hash/`local_artifacts` helpers (lines 89-93) for reading local artifacts as bytes; `scripts/build_api_fixtures.py` for the deterministic fixture-builder style and `lambdas/shared/site_provenance.py` for the overlay (use `load_provenance` + `apply_label_provenance`; see below). Do not apply `lambda_packaging.normalize_text_bytes` to `embeddings.f32`. Use sorted keys and LF line endings in JSON output.

### `scripts/tests/test_contract_*.py` (test)
**Analog:** `scripts/tests/test_publish_tools.py` (lines 1-25): moto `mock_aws`, `import publish_model` by bare module name (tests run with `scripts/` on path via `pytest.ini`/`conftest.py`), `boto3` clients created inside `mock_aws`, call `main(argv, s3_client=client)`. Assert second publish of the same version fails with 412 and that `latest.json` is written last.

### `lambdas/shared/contract_stamp.py` (utility, bundled-JSON loader)
**Analog:** `lambdas/shared/site_provenance.py`

Copy the dual-path loader (lines 26-54): module-level `_MODULE_DIR`, a `_BUNDLED_FILENAME` (use `contract_stamp.json`, underscore name), prefer the bundled file next to the module and fall back to the repo path (`contracts/bucket/v1/stamp.json`, resolved via `../../`). Stdlib only, `from __future__ import annotations`.
```python
def load_provenance(path: Optional[str] = None) -> dict:
    if path is None:
        bundled_path = os.path.join(_MODULE_DIR, _BUNDLED_FILENAME)
        if os.path.exists(bundled_path):
            path = bundled_path
        else:
            path = os.path.join(_MODULE_DIR, "..", "..", "data", "site-label-provenance.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
```
`apply_label_provenance` (lines 68-123) is also the field source for the Site records: `label_source`, `label_source_name`, `label_assigned_by`, `label_original`, `label_definition`, `status_basis`, `period`, `label_note`. Never mutates input; returns a new dict.

### `lambdas/classifier/handler.py` (modify RESULT write)
**Analog:** itself, lines 176-198. Add the four stamp keys inside `result_item`, loaded once at module level (warm-Lambda cache convention: underscore prefix, e.g. `_contract_stamp`), next to the existing import at line 21 (`from site_provenance import load_provenance, apply_label_provenance`):
```python
result_item = {
    'pk': f'ANALYSIS#{analysis_id}', 'sk': 'RESULT', ...
    'embedding_summary': {...},
    'completed_at': ..., 'caveats': ...,
    # add: 'contract_version', 'dataset_version', 'model_version', 'preprocessing_spec_version'
}
table.put_item(Item=convert_floats(result_item), ConditionExpression='attribute_not_exists(pk)')
```
Keep the conditional write (lines 202-212) unchanged. Existing `classification['model_version']` is a different field; do not overload it.

### `lambdas/router/handler.py` (modify `handle_visualize`)
**Analog:** itself, lines 502-512. Pass through with `item.get(...)`; absent for old results means null (UI renders "pre-contract"):
```python
item = result['Item']
return response(200, {
    'analysis_id': analysis_id, 'status': 'complete',
    'classification': item.get('classification', {}), ...
    'caveats': item.get('caveats', '')
    # add: 'contract_version': item.get('contract_version'), ... (None when absent)
})
```
Router and the `/results/{id}` alias (line ~524 reads the same RESULT) should stay consistent. `response()` uses the Decimal JSON encoder, so numeric versions are safe.

### `infrastructure/lambda-packages/classifier.json` (modify)
**Analog:** itself. Add a member in the existing form:
```json
{"source": "contracts/bucket/v1/stamp.json", "archive_path": "contract_stamp.json"},
{"source": "lambdas/shared/contract_stamp.py", "archive_path": "contract_stamp.py"}
```
Deploy via `py -3.12 scripts/deploy-lambdas.py --function classifier --dry-run` then `--confirm`, then `scripts/drift-check.py`.

### `dashboard-next/src/features/contract/*` (hooks and client)
**Analogs:** `src/app/dashboard/page.tsx` lines 11-17 (current query), `src/lib/site-stats.ts` (pure derive functions with typed `SitesResponse` input), `src/lib/api.ts` (singleton typed client with private `request<T>()`, `NEXT_PUBLIC_API_URL` env fallback at line 13).

Existing consumer pattern to replace:
```tsx
const { data: sitesData } = useQuery({
  queryKey: ['sites'],
  queryFn: () => api.getSites(),
  staleTime: 60_000,
});
const stats = deriveSiteStats(sitesData);
```
Replacement per page: `const { data: sitesData } = useLegacySitesResponse();` (one-line change; `legacy.ts` adapts contract Sites to the `SitesResponse` shape in `src/types/index.ts` so `deriveSiteStats` and pages are untouched). Keep `queryKey` conventions `['contract', N, ...]` per RESEARCH Pattern 1. Imports use the `@/` alias; lib files are kebab-case. Zod schemas use `z.looseObject()` for fetched artifacts. Provide an `index.ts` barrel as the only import surface for pages.

### `dashboard-next/src/features/contract/ContractVersionSync.tsx` and `providers.tsx`
**Analog:** `src/app/providers.tsx` (lines 13-35). Mount the leaf component inside `<Suspense fallback={null}>` within `QueryClientProvider`:
```tsx
<QueryClientProvider client={queryClient}>
  <BackgroundCanvas />
  {children}
</QueryClientProvider>
```
Note the QueryClient defaults (`staleTime: 60 * 1000`, `refetchOnWindowFocus: false`): contract hooks must override per query (`staleTime: Infinity` for versioned, `refetchInterval: 60_000` for latest). Store: plain zustand `create<T>((set) => ({...}))` as in `src/stores/*`. Do not call `useSearchParams` in `Providers` directly.

### `dashboard-next/.eslintrc.json` and CI grep (fence)
**Analog:** existing `.eslintrc.json` (extends `next/core-web-vitals`; read it before editing) and `.github/workflows/ci.yml` web job. Add `overrides` with `no-restricted-syntax`/`no-restricted-imports` for `src/**` excluding `src/features/contract/**`; add a grep step (script under `scripts/`) failing on contract host/`NEXT_PUBLIC_CONTRACT_BASE_URL` references outside the module and on any import of `contracts/fixtures` from `src/`.

### `dashboard-next/tests/e2e/support/mock-api.ts` (add `mockContract`)
**Analog:** itself.
- Host regex pattern, as at line 38: `const API_HOST_PATTERN = /https:\/\/[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com\/prod\/.*/;` add `CONTRACT_HOST_PATTERN = /^https:\/\/[a-z0-9]+\.cloudfront\.net\/.*/`.
- Unhandled recording (lines 21-36, 126-130): push to the same `UNHANDLED` WeakMap, `route.abort('failed')`, and let `expectNoUnhandledApiCalls` fail in `afterEach`.
- Fulfil pattern (lines 87-91): `route.fulfill({status: 200, contentType: ..., body})`, plus `access-control-allow-origin: *` and the production Cache-Control. Serve binary `embeddings.f32` as a Buffer from `contracts/bucket/`.
- Install from inside `mockApi()` (line 101-102) so all existing specs inherit it; use `FIXTURES_DIR` path style (`path.join(__dirname, '..', '..', ...)`). Flag-flip test: `page.clock` fast-forward 60 s after switching the `latest` override.

### `dashboard-next/tests/unit/contract-*.test.ts(x)`
**Analog:** `tests/unit/site-stats.test.ts` (lines 1-20): vitest imports, `@/` alias, fixture JSON import from `../fixtures/api/sites.json`, cast via `as unknown as SitesResponse`. The legacy adapter gate test deep-equals `adapter(contractSites).sites` to `tests/fixtures/api/sites.json` `.sites`. Setup file is `vitest.setup.ts`; config `vitest.config.ts`.

### `contracts/schema/*.schema.json` and fixtures
**Analogs:** `data/snapshots/api-sites.json` and `dashboard-next/tests/fixtures/api/sites.json` for the Site shape (54 records; fields listed in the provenance overlay above); `dashboard-next/src/data/citations.json` for DOI/licence/url; `docs/model/deployed-model.lock.json` and `models/interim-real-only/model_config.json` for ModelVersion. No existing JSON Schema files exist in the repo (greenfield).

## Shared Patterns

### `--dry-run` / `--confirm` write gate
**Source:** `scripts/publish_model.py` lines 146-160, 170-171, 220-222. Apply to `publish_contract.py` and `setup_contract_infra.py`.

### sha256 verify-by-redownload
**Source:** `scripts/publish_model.py` lines 61-81, 114-128. Apply to publisher; the browser-side equivalent is `crypto.subtle.digest('SHA-256')`.

### Fail loud, never synthesize (integrity)
**Source:** `lambdas/classifier/handler.py` header and line 176 comment ("synthetic is ALWAYS false"). Contract Site/Model artifacts carry `synthetic: false`; null stamps render "pre-contract", never an invented version; a missing pinned version renders an explicit not-found state.

### Single place for provenance
**Source:** `lambdas/shared/site_provenance.py`. Build Site records via `apply_label_provenance`; do not copy status/DOI from `metadata_v6.json` (embeddings only).

### Defensive rendering
**Source:** `AnalysisResults.tsx` (`if (!classification) return <div className="glass-panel p-6">...`). Apply to contract loading/error/not-found states and the version badge.

### Naming and tooling
Python `snake_case`, constants `UPPER_SNAKE`, module caches `_underscore`. TS: `PascalCase.tsx` components, kebab-case lib files, `@/*` alias. Python tests live in `scripts/tests/` (moto), TS unit tests in `dashboard-next/tests/unit/`, e2e in `dashboard-next/tests/e2e/` (do not name `*-live.spec.ts`).

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `contracts/schema/*.json` (JSON Schema + Zod mirror + parity corpus) | schema | No existing JSON Schema or Zod usage; follow RESEARCH Standard Stack (`zod@4.4.3`, `jsonschema==4.26.0`) |
| `scripts/setup_contract_infra.py` (CloudFront OAC/distribution, S3 bucket, AWS Budget) | infra script | No existing CloudFront/Budgets scripts; reuse only the `--dry-run`/`--confirm` and boto3 Session profile style, record results in `infrastructure/resources.json` |
| PCA projection builder | transform | No existing numeric build step; use `numpy.linalg.svd` per RESEARCH |

## Metadata

**Analog search scope:** `scripts/`, `scripts/tests/`, `lambdas/{classifier,router,shared}`, `infrastructure/lambda-packages/`, `dashboard-next/src/{app,lib}`, `dashboard-next/tests/{unit,e2e/support}`
**Files read:** 9 directly (plus targeted greps)
**Pattern extraction date:** 2026-10-01
