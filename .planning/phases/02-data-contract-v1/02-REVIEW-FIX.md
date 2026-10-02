---
phase: 02-data-contract-v1
fixed_at: 2026-10-02T00:00:00Z
review_path: .planning/phases/02-data-contract-v1/02-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
findings:
  CR-01: {status: fixed, commit: c37dd07}
  WR-01: {status: fixed, commit: c42a9de}
  WR-02: {status: fixed, commit: d053b8e}
  WR-03: {status: fixed, commit: 73aed26}
  WR-04: {status: fixed, commit: 6072d31}
  WR-05: {status: fixed, commit: b94e0a3}
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-10-02
**Source review:** .planning/phases/02-data-contract-v1/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, WR-01..WR-05; Info findings out of scope)
- Fixed: 6
- Skipped: 0

Edits were made in the main checkout (`workflow.use_worktrees` is `false`). No AWS call, deploy,
publish or push was made. No byte of `contracts/bucket/v1/**`, `contracts/bucket/contract/v1.json`,
`contracts/PUBLISHED.json` or `contracts/schema/**` changed (`git diff ae0c130 -- contracts/bucket
contracts/PUBLISHED.json contracts/schema` is empty), so contract v1 stays immutable and the
schemas are untouched (no `--format-schemas` run needed).

## Deploy required (orchestrator action)

CR-01 changes Lambda code. A **classifier** redeploy and a **router** redeploy are needed for the new
`stamp_status` field and the CloudWatch metric to go live:

```
py -3.12 scripts/deploy-lambdas.py --function classifier --function router --dry-run
py -3.12 scripts/deploy-lambdas.py --function classifier --function router --confirm
```

(clean committed tree required; serial live verification per the usual concurrency limit.) The web
changes are backward compatible with the old Lambdas: until they are redeployed, `/visualize` simply
returns no `stamp_status`, and the UI falls back to the model_version rule (a null contract_version
with a model_version is still shown as "Not covered by a published contract", never "pre-contract").
`scripts/verify_live_truth.py` was not changed; it still requires a stamped (non-null) result.

## Fixed Issues

### CR-01: A result not covered by the bundled stamp is shown as "pre-contract" and its real model version is hidden

**Files modified:** `dashboard-next/src/features/contract/stamp.ts`,
`dashboard-next/src/features/contract/ContractStampLine.tsx`,
`dashboard-next/src/features/contract/index.ts`, `dashboard-next/src/types/index.ts`,
`dashboard-next/src/components/AnalysisResults.tsx`,
`dashboard-next/src/components/experience/ControlsPanel.tsx`, `lambdas/classifier/handler.py`,
`lambdas/router/handler.py`, `dashboard-next/tests/unit/results-components.test.tsx`,
`lambdas/classifier/tests/test_handler.py`, `lambdas/router/tests/test_visualize_stamp.py`
**Commit:** c37dd07
**Applied fix:**
- Web: four distinct states (`stampState`): stamped (`Contract vN`), uncovered ("Not covered by a
  published contract · <model_version>"), unavailable ("Version stamp unavailable · <model_version>")
  and pre-contract (only a result with no stamp fields at all). Uncovered/unavailable make no contract
  request and never say "pre-contract".
- Classifier: `result_version_stamp` now adds `stamp_status` (`stamped` | `uncovered` | `load_failed`) to
  the RESULT item, still without failing the analysis. On a stamp-load failure `model_version` is now
  the running model's own version (it does not depend on the stamp file) instead of null, and an
  embedded-metric-format log line (namespace `ReefRadar/Classifier`, metric `UnstampedResults`,
  dimension `Status`) is emitted for both `uncovered` and `load_failed` so CloudWatch can graph/alarm.
- Router: `/visualize` returns `stamp_status` (null for legacy results written before it existed).
- Schema deliberately untouched: `stamp_status` sits beside the stamp block (the stamp schema allows
  additional properties), so the published v1 schema copies stay byte-identical.
- Tests added: uncovered/unavailable/pre-contract formatting and rendering, no contract request for
  them, `stamp_status` on classifier items and router `/visualize` (legacy -> null), EMF metric emission.
**Status note:** logic change (state classification); recommend a human glance at the wording of the
two new labels.

### WR-01: A failed background pointer refresh replaces already-verified data with an error

**Files modified:** `dashboard-next/src/features/contract/hooks.ts`,
`dashboard-next/tests/unit/contract-flip.test.tsx`
**Commit:** c42a9de
**Applied fix:** an error from a query that already holds its own real (non-placeholder) data is no
longer returned as `error`; hooks expose it as a new `refreshError`. A pointer failure is an `error`
only while there is no manifest to show. A failed load of a new version (placeholder data) still
surfaces as `error`. New unit test: after v1 sites load, a garbage pointer refresh leaves
`data` intact, `error` null and `refreshError` set. Map and sites pages needed no change.
**Status note:** logic change (error-precedence rule).

### WR-02: Pinned manifests are accepted without any integrity check, and the cache key lets an unverified manifest serve the verified path

**Files modified:** `dashboard-next/src/features/contract/published.ts` (new),
`dashboard-next/src/features/contract/client.ts`, `dashboard-next/src/features/contract/hooks.ts`,
`dashboard-next/src/features/contract/ContractStampLine.tsx`,
`dashboard-next/tests/unit/contract-published.test.ts` (new)
**Commit:** d053b8e
**Applied fix:**
- `published.ts` bundles the manifest sha256 of each published version (v1 today); a parity test
  fails if it disagrees with `contracts/PUBLISHED.json` (so publishing v2 means adding a line there).
- `loadManifest` verifies a pinned or stamp-resolved manifest against the bundled hash when the
  version is known; a pointer hash that disagrees with the bundled hash is a `ContractIntegrityError`.
- A version newer than this build is still served but `verified: false` (new field on every contract
  hook result), cached under `[..., 'unverified']` keys so it can never satisfy the verified path, and
  the result stamp line appends "manifest not independently verified".
- Existing key shape `['contract', N, 'manifest' | 'sites']` is unchanged for verified data.
**Status note:** partial surface of "unverified" in UI is limited to the stamp line; page-level
indicators for `?cv=N` on an unknown version were not added (the flag is on the hook result for later use).

### WR-03: Immutability of published versions is only enforced against a file in the same commit

**Files modified:** `scripts/check_contract.py`, `scripts/tests/test_contract_fixtures.py`,
`.github/workflows/ci.yml`, `contracts/README.md`
**Commit:** 73aed26
**Applied fix:** new `check_contract.py --published-history` (every committed revision of
`contracts/PUBLISHED.json`) and `--published-base-ref REF`. A version recorded in an earlier revision
must still be present with the same `manifest_sha256`, and its current manifest bytes and every artifact
file must still hash to what that revision recorded, so editing `bucket/v1/**` + the manifest +
`PUBLISHED.json` in one commit now fails. Fails closed on an unknown ref, a shallow clone, or outside a
git work tree; a base with no `PUBLISHED.json` imposes nothing; new versions are allowed. CI `python` job
now checks out with `fetch-depth: 0` and runs `python scripts/check_contract.py --published-history`.
Nine tests use temporary git repos (same-commit rewrite passes the old in-tree check but fails the new
one; drop; artifact edit; unchanged; history catches an already-committed rewrite; new version allowed;
no-base; unknown ref; not a git repo). Verified locally against the real history (passes).

### WR-04: `put_immutable` handles only HTTP 412, so a concurrent-write 409 aborts with a raw traceback

**Files modified:** `scripts/publish_contract.py`, `scripts/tests/test_publish_contract.py`
**Commit:** 6072d31
**Applied fix:** `put_immutable` treats `ConditionalRequestConflict`/`409` like `412`: the byte-compare
decides, with one short retry (`CONFLICT_RETRY_SECONDS`) when the racing writer's object is not readable
yet, then a clear "being written by another publisher" `PublishError`. `main()` reports any other
`ClientError` as its AWS code only (no traceback, no message body). Four tests: identical racing writer
-> success, key never appears -> exit 1 with no pointer move, different bytes -> refused, `AccessDenied`
-> code only.

### WR-05: The live verifier crashes instead of reporting FAIL when the served manifest is malformed

**Files modified:** `scripts/verify_contract_live.py`, `scripts/tests/test_verify_contract_live.py`
**Commit:** b94e0a3
**Applied fix:** the served manifest is validated against the `contract-manifest` schema and reported as
`manifest: valid contract manifest`; a non-object `artifacts`, a non-dict entry or an entry without a
string `uri` yields FAIL lines instead of `AttributeError`/`KeyError`; `--expect-latest` together with
`--version` is rejected by the parser (exit 2). Seven new tests (six malformed shapes, schema PASS line,
flag conflict).

## Verification (run in the main checkout, `C:\Users\TylerLubyHoward\reefradar`; not an isolated worktree)

| Command | Result |
|---|---|
| `py -3.12 -m pytest -q` (repo root) | pass (exit 0, all tests) |
| `npx vitest run` (dashboard-next) | 20 files, 252 tests passed |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (one pre-existing `react-hooks/exhaustive-deps` warning in `LocationCompare.tsx`, untouched) |
| `node scripts/check-contract-fence.mjs` | OK, 90 files scanned |
| `py -3.12 scripts/build_contract.py --version 1 --check` | OK (v1 published, rebuild comparison skipped by design) |
| `py -3.12 scripts/check_contract.py --check --additive` | OK |
| `py -3.12 scripts/check_contract.py --published-history` | OK |

`contract-no-preflight` guard passes (part of vitest; no custom fetch headers were added; `verified`
checks are client-side hash comparisons only). Playwright e2e and the Linux visual baselines were not run
locally (they are Docker/CI-pinned). Results surfaces are not in the baselines, and the only on-screen
change is the stamp line text for non-pre-contract results; the existing e2e assertions for
"pre-contract" use fixtures with no top-level `model_version`, so they still hold.

## Not in scope (Info, not attempted)

IN-01..IN-04 were outside `fix_scope: critical_warning`. Note that IN-04 (adjacent "Model:" lines in the
results banner and stale CHANGELOG heading) is still open; the CR-01 change does not alter that layout.

---

_Fixed: 2026-10-02_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
