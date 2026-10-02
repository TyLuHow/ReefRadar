---
phase: 02-data-contract-v1
reviewed: 2026-10-02T00:00:00Z
depth: standard
files_reviewed: 107
files_reviewed_list:
  - .gitattributes
  - .github/workflows/ci.yml
  - contracts/CHANGELOG.md
  - contracts/PUBLISHED.json
  - contracts/README.md
  - contracts/bucket/contract/v1.json
  - contracts/bucket/v1/model_version.json
  - contracts/bucket/v1/preprocessing_spec.json
  - contracts/bucket/v1/projection.json
  - contracts/bucket/v1/schema/analysis-result.schema.json
  - contracts/bucket/v1/schema/contract-manifest.schema.json
  - contracts/bucket/v1/schema/contract-pointer.schema.json
  - contracts/bucket/v1/schema/model-version.schema.json
  - contracts/bucket/v1/schema/preprocessing-spec.schema.json
  - contracts/bucket/v1/schema/projection.schema.json
  - contracts/bucket/v1/schema/site.schema.json
  - contracts/bucket/v1/sites.json
  - contracts/bucket/v1/stamp.json
  - contracts/fixtures/bucket/contract/v2.json
  - contracts/fixtures/latest-v1.json
  - contracts/fixtures/latest-v2.json
  - contracts/fixtures/legacy-site-coordinates.json
  - contracts/schema/analysis-result.schema.json
  - contracts/schema/contract-manifest.schema.json
  - contracts/schema/contract-pointer.schema.json
  - contracts/schema/model-version.schema.json
  - contracts/schema/preprocessing-spec.schema.json
  - contracts/schema/projection.schema.json
  - contracts/schema/site.schema.json
  - dashboard-next/.eslintrc.json
  - dashboard-next/package-lock.json
  - dashboard-next/package.json
  - dashboard-next/src/app/about/page.tsx
  - dashboard-next/src/app/dashboard/map/page.tsx
  - dashboard-next/src/app/dashboard/page.tsx
  - dashboard-next/src/app/page.tsx
  - dashboard-next/src/app/providers.tsx
  - dashboard-next/src/app/sites/page.tsx
  - dashboard-next/src/components/AnalysisResults.tsx
  - dashboard-next/src/components/SiteCard.tsx
  - dashboard-next/src/components/experience/ControlsPanel.tsx
  - dashboard-next/src/components/maps/MiniMap.tsx
  - dashboard-next/src/components/maps/SiteMarker.tsx
  - dashboard-next/src/components/maps/WorldMap.tsx
  - dashboard-next/src/features/contract/ContractStampLine.tsx
  - dashboard-next/src/features/contract/ContractVersionSync.tsx
  - dashboard-next/src/features/contract/client.ts
  - dashboard-next/src/features/contract/config.ts
  - dashboard-next/src/features/contract/errors.ts
  - dashboard-next/src/features/contract/hooks.ts
  - dashboard-next/src/features/contract/index.ts
  - dashboard-next/src/features/contract/legacy.ts
  - dashboard-next/src/features/contract/schema.ts
  - dashboard-next/src/features/contract/stamp.ts
  - dashboard-next/src/features/contract/version.ts
  - dashboard-next/src/lib/api.ts
  - dashboard-next/src/types/index.ts
  - dashboard-next/tests/e2e/analysis-flow.spec.ts
  - dashboard-next/tests/e2e/contract-cdn-cors-live.spec.ts
  - dashboard-next/tests/e2e/contract-dashboard.spec.ts
  - dashboard-next/tests/e2e/contract-flip.spec.ts
  - dashboard-next/tests/e2e/contract-live.spec.ts
  - dashboard-next/tests/e2e/contract-pin.spec.ts
  - dashboard-next/tests/e2e/support/mock-api.ts
  - dashboard-next/tests/fixtures/api/visualize-3class-stamped.json
  - dashboard-next/tests/unit/contract-client.test.ts
  - dashboard-next/tests/unit/contract-fence.test.ts
  - dashboard-next/tests/unit/contract-flip.test.tsx
  - dashboard-next/tests/unit/contract-legacy-adapter.test.ts
  - dashboard-next/tests/unit/contract-no-preflight.test.ts
  - dashboard-next/tests/unit/contract-pin.test.tsx
  - dashboard-next/tests/unit/contract-schema-parity.test.ts
  - dashboard-next/tests/unit/results-components.test.tsx
  - dashboard-next/tests/unit/site-index.test.tsx
  - dashboard-next/tests/unit/sites-page.test.tsx
  - dashboard-next/tests/unit/support/contract-fetch.ts
  - docs/deploy/DEPLOY-LOG.md
  - docs/deploy/PHASE-2-EXIT.md
  - infrastructure/deployed-state.json
  - infrastructure/lambda-packages/classifier.json
  - infrastructure/resources.json
  - lambdas/classifier/handler.py
  - lambdas/classifier/tests/test_handler.py
  - lambdas/router/handler.py
  - lambdas/router/tests/test_visualize_stamp.py
  - lambdas/shared/contract_stamp.py
  - lambdas/shared/tests/test_contract_stamp.py
  - requirements-dev.txt
  - scripts/build_contract.py
  - scripts/check-citations.mjs
  - scripts/check-contract-fence.mjs
  - scripts/check_contract.py
  - scripts/contract_lib.py
  - scripts/publish_contract.py
  - scripts/setup_contract_infra.py
  - scripts/tests/test_contract_bundle.py
  - scripts/tests/test_contract_fixtures.py
  - scripts/tests/test_contract_model.py
  - scripts/tests/test_contract_projection.py
  - scripts/tests/test_contract_sites.py
  - scripts/tests/test_lambda_packaging.py
  - scripts/tests/test_publish_contract.py
  - scripts/tests/test_publish_tools.py
  - scripts/tests/test_setup_contract_infra.py
  - scripts/tests/test_verify_contract_live.py
  - scripts/verify_contract_live.py
  - scripts/verify_live_truth.py
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-10-02
**Depth:** standard
**Files Reviewed:** 107
**Status:** issues_found

## Summary

Production-path code was read in full: the publisher, infra setup, live verifier, build/check tooling, the classifier and router
stamp passthrough, the whole `features/contract` module, the legacy page repoints, the ESLint and script fences, and CI. The
tooling is carefully built. Points that held up under scrutiny:

- Immutability on write: conditional PUT with `If-None-Match: *`, byte-compare on 412, pointer written last with `If-Match`
  on the ETag, forward-only guard, fixture refusal, CRLF refusal, dirty-tree refusal, budget gate.
- No credentials, presigned URLs or e-mail addresses were found in any reviewed file (grep for key ids, `X-Amz-*`, addresses,
  bearer tokens: only the redaction docstring and a test URL matched). The owner address is redacted in every output path.
- Pointer-to-manifest-to-artifact sha256 chain, `?cv=` parsing, no fallback to latest when pinned or invalid, URI traversal
  guard, and `credentials: 'omit'` with no custom headers (guarded by `contract-no-preflight.test.ts`).
- The published v1 bytes match `PUBLISHED.json` (manifest sha256 `c9d520ad...` re-hashed locally) and the committed schema
  copies under `v1/schema` are byte-identical to the current sources (additive policy intact).
- Tests skimmed for vacuity: none found; the only skips are a conditional `pytest.skip` for a missing model dir and
  environment-gated visual snapshots.

No finding endangers the already-published v1 objects. One finding (CR-01) misreports a result's version stamp on screen and
will become reachable as soon as the model is updated without a classifier redeploy. The remaining findings are robustness,
verification-strength and enforcement gaps.

## Critical Issues

### CR-01: A result not covered by the bundled stamp is shown as "pre-contract" and its real model version is hidden

**File:** `dashboard-next/src/features/contract/ContractStampLine.tsx:26-27,40-46` (with `lambdas/classifier/handler.py:769-779`,
`lambdas/shared/contract_stamp.py:55-76`)
**Issue:** The classifier honestly reports `model_version` (the running model's own version) and nulls the other three keys when
the loaded model differs from `stamp.json`'s model, or when the bundled stamp cannot be loaded (all four null). On the web,
`ContractStampLine` treats any result with a null `contract_version` as `PreContractLine`, which renders only the word
"pre-contract" and drops `model_version` entirely. Consequences:
1. A result analysed today by a newer model (model weights are published to S3 independently of a classifier deploy, so the
   classifier will load the new `models/model_config.json` while the packaged stamp still says `interim-real-only`) is labelled
   "pre-contract". That is false: it was produced after the contract existed. Its true model version, which the API did return,
   is thrown away, so the page presents a numbered model result with less provenance than the data holds.
2. The classifier's stamp-load-failure branch (`result_version_stamp`) writes four nulls, which the UI also shows as
   "pre-contract". The only detector is the manual `verify_live_truth.py` run; nothing alerts in production.
The router/classifier behaviour is documented as intended, but the label is a misreport of stamp state, which the phase's core
value forbids.
**Fix:** Distinguish three states in `stamp.ts` / `ContractStampLine`: stamped (`contract_version` set), pre-contract (all four
null or keys absent), and uncovered (`contract_version` null but `model_version` non-null, or a stamp-load failure). Show the
model version in the uncovered state with its own wording, never "pre-contract".
```tsx
if (version === null) {
  return props.model_version
    ? <p {...lineProps(props.onColor)} data-testid="contract-stamp">Not covered by a published contract · {props.model_version}</p>
    : <PreContractLine onColor={props.onColor} />;
}
```
Also emit a CloudWatch metric or a distinct `contract_stamp_status` field in the classifier when the stamp could not be loaded
so it is distinguishable from a legacy result, and add a unit test for the uncovered state.

## Warnings

### WR-01: A failed background pointer refresh replaces already-verified data with an error

**File:** `dashboard-next/src/features/contract/hooks.ts:108,142,181` and `dashboard-next/src/app/dashboard/map/page.tsx:136-147`
**Issue:** `error = paramError ?? manifest.error ?? pointer.error`. While following latest, the pointer query refetches every 60 s
and on window focus. A transient network failure (after the 2 retries) sets `pointer.error` even though the manifest and sites
for the current version are cached and valid. Every hook then returns `error` non-null alongside good `data`. Consumers that
branch on `error` first (the map page: `isLoading ? ... : error ? <failed> : <map>`) blank a working map and show "Failed to
load sites" until the next successful pointer fetch. The sites page shows an error panel on top of the cards. An offline blip of
a second removes data that was already verified and displayed.
**Fix:** Surface a pointer-refresh error only when there is no data to show, e.g. in `useContract`:
```ts
const error = (paramError ?? manifest.error ?? (manifest.data === undefined ? pointer.error : null) ?? null) as Error | null;
```
(and the same rule for the `sites`/`model` queries: ignore a refetch error when `data` exists, or expose it as a separate
`refreshError`).

### WR-02: Pinned manifests are accepted without any integrity check, and the cache key lets an unverified manifest serve the verified path

**File:** `dashboard-next/src/features/contract/client.ts:118-130`, `dashboard-next/src/features/contract/hooks.ts:97-107`
**Issue:** For `?cv=N` and for stamp lookups (`useContract(N)`), `loadManifest(N, null)` skips the sha256 check ("no pointer to
vouch for it"). Every artifact hash that follows is read from that unverified manifest, so for pinned views the "sha256-verified"
guarantee reduces to trusting TLS plus the CDN. Separately, the manifest query key is `['contract', N, 'manifest']` and does not
include whether it was verified. In one SPA session a pinned fetch of version N (unverified) populates the key with
`staleTime: Infinity`; if the pointer later names N, the following path reuses the cached manifest and never compares it to the
pointer's `manifest_sha256`. Result stamps (`ContractStampLine`) always take the unverified path.
**Fix:** Keep an in-bundle map of published manifest hashes (generated from `contracts/PUBLISHED.json` at build time) and verify
a pinned or stamp-resolved version against it when known; when the version is not in the map, mark the data `verified: false`
and surface that in the UI. At minimum, when the pointer's version equals a cached manifest's version, compare
`sha256(manifest bytes)` to `pointer.manifest_sha256` (or include the expected hash in the query key) so a manifest cached via
the unverified path cannot satisfy the verified path.

### WR-03: Immutability of published versions is only enforced against a file in the same commit

**File:** `scripts/check_contract.py:425-444`, `scripts/build_contract.py:915-924`, `.github/workflows/ci.yml:75-79`
**Issue:** CI proves "published version N unchanged" by comparing the manifest bytes with `contracts/PUBLISHED.json`, and
`build_contract.py --check` explicitly skips the rebuild comparison for published versions. A change that edits
`bucket/v1/*`, regenerates `contract/v1.json`, and updates the hash in `PUBLISHED.json` in the same commit passes every CI step,
and the next `publish_contract.py --version 1` would then fail only at upload time (S3 byte comparison), after the repo already
claims the new bytes. Nothing compares against the base branch or the live object in CI.
**Fix:** Add a CI step that fails when any `PUBLISHED.json` entry present at the merge base is absent or has a different
`manifest_sha256`:
```bash
git show origin/main:contracts/PUBLISHED.json > /tmp/base.json && python scripts/check_contract.py --published-base /tmp/base.json
```
and compare each recorded version's bucket files (`contracts/bucket/vN/**`) against their sha256s in the base manifest.

### WR-04: `put_immutable` handles only HTTP 412, so a concurrent-write 409 aborts with a raw traceback

**File:** `scripts/publish_contract.py:217-223` (and `main()` at 597-606)
**Issue:** `flip_pointer` treats `ConditionalRequestConflict`/409 as a lost race, but `put_immutable` re-raises any
`ClientError` whose code is not `PreconditionFailed`/`412`. S3 conditional writes can answer 409 `ConditionalRequestConflict`
when two writers race on the same key (for example two publishers, or a retried run overlapping a slow first run).
`main()` catches only `PublishError`, so the publish ends with an uncaught `ClientError` traceback in the middle of the object
sequence (the pointer is not moved, so the bucket stays consistent, but the operator gets no guidance and a stack trace).
**Fix:**
```python
except ClientError as exc:
    if _code(exc) not in ("PreconditionFailed", "412", "ConditionalRequestConflict", "409"):
        raise
```
(the byte-compare that follows already makes a re-run safe; for a 409 optionally retry the compare once after a short delay),
and wrap other `ClientError`s in `main()` as `PublishError`, printing only the error code.

### WR-05: The live verifier crashes instead of reporting FAIL when the served manifest is malformed

**File:** `scripts/verify_contract_live.py:257-272,205-233`
**Issue:** After parsing the served manifest, `artifacts = manifest["artifacts"]` is not type-checked, and the loop does
`entry["uri"]` / `entry.get("sha256")` on any dict that is not `present: false`. A served manifest whose `artifacts` is a
list, or with an entry lacking `uri`, raises `AttributeError`/`KeyError` and exits with a traceback rather than a FAIL line and
exit 1, which is the worst moment (a bad publish) to lose the structured report. Also `--expect-latest` is silently ignored when
`--version` is given.
**Fix:** Validate the manifest against the `contract-manifest` schema (already available via `contract_lib.validation_errors`)
before iterating, report FAIL on errors, use `entry.get("uri")` with a type check, and reject `--expect-latest` together with
`--version` in `build_parser`/`main`.

## Info

### IN-01: Pointer-to-manifest consistency is checked only by the client and publisher, not the pointer schema

**File:** `contracts/schema/contract-pointer.schema.json`, `dashboard-next/src/features/contract/client.ts:104-112`
**Issue:** The schema allows `contract_version: 1` with `manifest_uri: "contract/v999.json"`. The client re-checks the equality
(`loadLatestPointer`) and the publisher constructs it correctly, but fixtures and third-party consumers rely on the schema alone.
**Fix:** Document the equality rule in the schema `description`, and add an invalid-case fixture for the mismatch so the Zod
parity corpus covers it.

### IN-02: The classifier stamp is hard-wired to v1

**File:** `infrastructure/lambda-packages/classifier.json`, `lambdas/shared/contract_stamp.py:26`
**Issue:** The packaged stamp source and the checkout fallback path both name `contracts/bucket/v1/stamp.json`. Publishing v2
does not change what the classifier stamps until the package spec and fallback are edited and the classifier redeployed. This is
consistent with the staleness guard, but no doc or check says that bumping the contract requires editing these two places.
**Fix:** Add a line to `contracts/README.md` (release checklist) and a test that fails when the highest committed
`contracts/bucket/v*/stamp.json` differs from the packaged one.

### IN-03: `MiniMap` shows "No location data available" when the contract failed to load

**File:** `dashboard-next/src/components/maps/MiniMap.tsx:55-58,118-129`
**Issue:** `useSiteIndex()` errors are ignored; with `siteIndex` undefined the map falls through to the "no location data" panel,
which states a data fact that is really a load failure.
**Fix:** Read `error` from `useSiteIndex()` and render "Locations could not be loaded" with a retry.

### IN-04: Stale and duplicated documentation

**File:** `contracts/CHANGELOG.md:6`, `dashboard-next/src/components/AnalysisResults.tsx:66-77`
**Issue:** The changelog still says "Contract v1 (unpublished until plan 02-06)" although v1 was published on 2026-10-02. The
results banner prints `Model: {classification.model_version}` and then the stamp line prints the top-level `model_version`;
these are different fields that can disagree and are shown on adjacent lines with no explanation.
**Fix:** Update the changelog heading to the publish date and commit hash; show a single model version (the top-level stamp value
when present, the classification value only when the stamp is absent).

---

_Reviewed: 2026-10-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
