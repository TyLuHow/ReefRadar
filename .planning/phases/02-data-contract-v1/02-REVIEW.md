---
phase: 02-data-contract-v1
reviewed: 2026-10-02T00:00:00Z
depth: standard
iteration: 2
files_reviewed: 24
files_reviewed_list:
  - .github/workflows/ci.yml
  - contracts/README.md
  - dashboard-next/src/components/AnalysisResults.tsx
  - dashboard-next/src/components/experience/ControlsPanel.tsx
  - dashboard-next/src/features/contract/ContractStampLine.tsx
  - dashboard-next/src/features/contract/client.ts
  - dashboard-next/src/features/contract/hooks.ts
  - dashboard-next/src/features/contract/index.ts
  - dashboard-next/src/features/contract/published.ts
  - dashboard-next/src/features/contract/stamp.ts
  - dashboard-next/src/types/index.ts
  - dashboard-next/tests/unit/contract-flip.test.tsx
  - dashboard-next/tests/unit/contract-published.test.ts
  - dashboard-next/tests/unit/results-components.test.tsx
  - lambdas/classifier/handler.py
  - lambdas/classifier/tests/test_handler.py
  - lambdas/router/handler.py
  - lambdas/router/tests/test_visualize_stamp.py
  - scripts/check_contract.py
  - scripts/publish_contract.py
  - scripts/tests/test_contract_fixtures.py
  - scripts/tests/test_publish_contract.py
  - scripts/tests/test_verify_contract_live.py
  - scripts/verify_contract_live.py
findings:
  critical: 0
  warning: 0
  info: 8
  total: 8
status: clean
---

# Phase 2: Code Review Report (iteration 2, re-review of the fix commits)

**Reviewed:** 2026-10-02
**Depth:** standard
**Files Reviewed:** 24 (the fix-commit range `ae0c130..HEAD`, six commits c37dd07..b94e0a3)
**Status:** clean (no Critical, no Warning; Info items carried forward and added)

## Summary

All six iteration-1 findings (CR-01, WR-01..WR-05) are genuinely resolved, and the fix commits introduce no
Critical or Warning regressions. Evidence gathered independently of the fix report:

- Full Python suite passes (`pytest -p no:warnings`, 100%), `vitest run` 20 files / 252 tests pass, `tsc --noEmit` is clean.
- `check_contract.py --check --additive`, `--published-history`, `--published-base-ref HEAD~6` and `build_api_fixtures.py --check` all pass.
- Published contract v1 is untouched: `git diff --stat ae0c130..HEAD -- contracts/bucket contracts/PUBLISHED.json contracts/schema`
  is empty. The only `contracts/` change is the README. The bundled hash in `published.ts`
  (`c9d520ad...`) equals `PUBLISHED.json` and `latest-v1.json`.
- Repository is not shallow (`--is-shallow-repository` false), and the history check passes on the real history.

### Per-finding verification

- **CR-01 resolved.** `stampState` (stamp.ts) separates stamped / uncovered / unavailable / pre-contract. A null
  `contract_version` with a non-empty `model_version` can no longer render "pre-contract"; the running model's version is
  shown; uncovered/unavailable make no contract request (test asserts `handle.requests` is empty). Classifier
  `result_version_stamp` always reports the running model's own `model_version`, adds `stamp_status`, and emits one EMF
  line for the two non-stamped outcomes. Legacy rows (no stamp fields at all) still read "pre-contract"; the e2e
  expectations for that label use fixtures with no top-level `model_version` (verified: the `model_version` hits in the
  other fixtures are nested inside `classification`).
- **WR-01 resolved.** `splitErrors` demotes an error to `refreshError` only when the same query holds real
  (non-placeholder) data; a failed load of a new version after a flip (placeholder data) and an initial pointer failure
  (manifest disabled, no data) still surface as `error`. New test covers the garbage-pointer refresh.
- **WR-02 resolved.** Pinned and stamp-resolved manifests are verified against the bundled hash for known versions; a
  pointer/bundle disagreement throws `ContractIntegrityError`; unknown (newer) versions are served but `verified:false`,
  keyed `[..., 'unverified']` so they cannot satisfy the verified path; a parity test ties `published.ts` to
  `PUBLISHED.json`. The tamper test (changed served bytes rejected) is non-vacuous.
- **WR-03 resolved.** Same-commit rewrite of `bucket/vN/**` + manifest + `PUBLISHED.json` now fails against any earlier
  `PUBLISHED.json` revision. Fails closed on unknown ref / shallow clone / not a work tree.
- **WR-04 resolved.** 409/`ConditionalRequestConflict` is routed through the same byte-compare as 412, with one bounded
  retry for a not-yet-readable key; unexpected `ClientError`s print only the AWS code.
- **WR-05 resolved.** Served manifest is schema-validated, non-object `artifacts`, non-dict entries and entries without a
  string `uri` give FAIL lines, and `--expect-latest` with `--version` is rejected by the parser.

### Production-risk assessment for the classifier and router redeploy

No Critical risk found.

- New RESULT field `stamp_status` is a plain string attribute; the router returns it as an extra JSON key
  (`item.get`, so `null` for legacy rows). The legacy frontend only reads typed fields and ignores unknown keys; the
  analysis-result schema has no `additionalProperties: false`, so contract validation is unaffected.
- `result_version_stamp` cannot raise on any input: the load/mapping step is inside `try/except Exception`, and
  `_emit_stamp_metric` swallows its own exceptions. `time` and `json` are imported in the classifier. A `None` model
  version serialises as JSON null and DynamoDB accepts `None`.
- EMF line is well formed (`_aws.Timestamp` in ms, `Dimensions: [['Status']]`, metric `UnstampedResults` present at the
  root with the `Status` dimension value). A malformed EMF line could at worst lose the metric in CloudWatch; it cannot
  affect the invocation. It is emitted only for non-stamped outcomes, so the normal path adds no log volume.
- The old classifier and router remain compatible with the new web code (documented fallback to the `model_version` rule).

### CI change (fetch-depth 0 + `--published-history`)

Cannot false-fail a legitimate v2 publish as the code stands: publishing v2 adds a `"2"` key to `PUBLISHED.json`, every
earlier revision only records `"1"`, v1 hash/manifest/artifacts are unchanged, and "new versions allowed" is covered by a
test. A base with no `PUBLISHED.json` imposes nothing. Only the `python` job needed full history and it has it. It will
(correctly, by design) fail if anyone edits, drops, or re-records a published version. See IN-06 for two brittleness points
that could produce a false failure if `PUBLISHED.json`'s format ever changes.

## Info

### IN-01 (carried, open): Pointer-to-manifest consistency is not expressed in the pointer schema

**File:** `contracts/schema/contract-pointer.schema.json`, `dashboard-next/src/features/contract/client.ts:104-112`
**Issue:** Unchanged. The schema permits `contract_version: 1` with `manifest_uri: "contract/v999.json"`; only the client and
publisher enforce equality.
**Fix:** Document the rule in the schema description and add an invalid-case fixture so the Zod parity corpus covers it.

### IN-02 (carried, open): Classifier stamp is hard-wired to v1

**File:** `infrastructure/lambda-packages/classifier.json`, `lambdas/shared/contract_stamp.py:26`
**Issue:** Unchanged. Publishing v2 does not change what the classifier stamps until the package spec and fallback path
are edited and the classifier redeployed. Add the same note for `dashboard-next/src/features/contract/published.ts`, which now
also needs one line per published version (its parity test fails first, which is good, but the release checklist should say so).
**Fix:** Add a release-checklist line in `contracts/README.md` listing `classifier.json`, the stamp fallback path and
`published.ts`; add a test that fails when the highest committed `contracts/bucket/v*/stamp.json` differs from the packaged one.

### IN-03 (carried, open): `MiniMap` shows "No location data available" when the contract failed to load

**File:** `dashboard-next/src/components/maps/MiniMap.tsx:55-58,118-129`
**Issue:** Unchanged; `useSiteIndex()` errors are ignored and a load failure is presented as a data fact.
**Fix:** Read `error` from `useSiteIndex()` and render "Locations could not be loaded" with a retry.

### IN-04 (carried, open): Stale changelog heading and adjacent duplicate "Model" lines

**File:** `contracts/CHANGELOG.md:6`, `dashboard-next/src/components/AnalysisResults.tsx:66-77`
**Issue:** Unchanged. "Contract v1 (unpublished until plan 02-06)" is stale, and the banner prints `Model: {classification.model_version}`
directly above the stamp line, which now (for uncovered results) also prints a model version from a different field.
**Fix:** Update the changelog heading; show a single model version, preferring the top-level stamp value.

### IN-05: Spreading a TanStack query result into `splitErrors` reads every tracked property

**File:** `dashboard-next/src/features/contract/hooks.ts:197,264` (`splitErrors([{ ...model, error: ... }])`, same for `sites`)
**Issue:** `useQuery` returns a tracked Proxy. Spreading it reads every property, including `promise`, which in
@tanstack/query-core 5.90 rejects the observer's pending thenable with "experimental_prefetchInRender feature flag is not
enabled" and also subscribes the component to every result field (extra re-renders). It is harmless today (the thenable's
rejection is pre-handled and nothing consumes `promise`; tests pass), but it is a fragile pattern that a library upgrade could turn
into a real failure.
**Fix:** Pass only what is needed:
```ts
splitErrors([{ error: model.error as Error | null, data: model.data, isPlaceholderData: model.isPlaceholderData }]);
```

### IN-06: `--published-history` summary text is misleading, and PUBLISHED.json parsing is format-brittle

**File:** `scripts/check_contract.py:858-896` (success message), `scripts/check_contract.py:476-484` (`_published_records`)
**Issue:** (a) With only `--published-history` or `--published-base-ref`, the success line still says "bundles, fixtures,
schemas and parity corpus are consistent", which were not checked in that run. (b) `_published_records` treats any top-level
non-dict value as a bare hash, so if `PUBLISHED.json` ever gains a metadata key (for example a `"$schema"` string or
`"updated"` timestamp) or is restructured (for example nested under `"versions"`), the history check reports a false
"dropped"/"rewritten" for versions that are fine. No such change is planned; the publisher writes only `{"N": {...}}`.
**Fix:** Print a mode-specific success line. In `_published_records`, only accept keys matching `^[0-9]+$` and a 64-hex
string or a dict with a string `manifest_sha256`; skip everything else.

### IN-07: `stamp_status` is undocumented in the contract and the schema description now contradicts the UI

**File:** `contracts/schema/analysis-result.schema.json` (description), `scripts/verify_live_truth.py:116-133`
**Issue:** The schema description says `contract_version: null` means "pre-contract (a result produced before any contract existed
or not covered by a published contract)", which is exactly the conflation CR-01 removed from the UI. `stamp_status` itself is not
mentioned in any contract document (additive and deliberately outside the frozen v1 bytes, but the source schema
`description` and README can still be updated additively). The post-deploy live check also does not assert
`stamp_status == "stamped"`, so a redeploy of the router/classifier that did not actually take effect would still pass
(old code returns the same four stamp keys).
**Fix:** Add a short "stamp_status" paragraph to `contracts/README.md` and reword the schema description (re-run the
additive check; published v1 copies stay frozen). In `check_stamp`, add `body.get("stamp_status") == "stamped"` once the
Lambdas are redeployed.

### IN-08: EMF helper docstring names a different metric than the code emits; no alarm exists

**File:** `lambdas/classifier/handler.py:771-796`
**Issue:** The docstring says metric `ContractStampStatus`; the code emits `UnstampedResults` (the fix report has the correct name).
The metric is created but nothing alarms on it (no alarm in `infrastructure/resources.json` or the deploy docs), so the
"observable in production" goal of CR-01 is only half met until an alarm on `UnstampedResults` (Namespace `ReefRadar/Classifier`,
Dimension `Status` = `load_failed`) is created.
**Fix:** Correct the docstring; add a CloudWatch alarm for `Status=load_failed` (and optionally `uncovered`) to the deploy checklist.

---

_Reviewed: 2026-10-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
