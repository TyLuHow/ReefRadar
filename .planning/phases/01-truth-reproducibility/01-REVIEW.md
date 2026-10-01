---
phase: 01-truth-reproducibility
reviewed: 2026-10-01T23:00:00Z
depth: standard
iteration: 3
files_reviewed: 11
files_reviewed_list:
  - .claude/CLAUDE.md
  - dashboard-next/src/lib/label-source.ts
  - dashboard-next/tests/unit/results-components.test.tsx
  - lambdas/classifier/handler.py
  - lambdas/classifier/tests/test_handler.py
  - dashboard-next/src/components/AnalysisResults.tsx
  - dashboard-next/src/components/experience/ComparisonPanel.tsx
  - lambdas/preprocessor/handler.py
  - lambdas/router/handler.py
  - lambdas/shared/site_provenance.py
  - lambdas/classifier/region_detection.py
findings:
  critical: 0
  warning: 0
  info: 12
  total: 12
status: clean
---

# Phase 1: Code Review Report (iteration 3, re-review of the iteration-2 fixes)

**Reviewed:** 2026-10-01
**Depth:** standard
**Files Reviewed:** 11 (the 5 fix-touched files, plus the preprocessor and router handlers, `site_provenance.py`, `region_detection.py` and the two components that consume `similarSiteLabelText`, to confirm the contracts the fixes depend on)
**Status:** clean (zero Critical, zero Warning; Info items only)

## Summary

Iteration-2 WR-01 and WR-02 are genuinely resolved, IN-02 is resolved apart from one residual phrase, and the three fix commits (4a040ee, 4c4a0ca, e25b91b) introduce no new Critical or Warning issue. I re-ran `py -3.12 -m pytest lambdas/classifier -q` (green) and `vitest run tests/unit/results-components.test.tsx` (14 passed). The classifier tests run against moto, so the new `ConditionExpression` with `ExpressionAttributeNames` is actually evaluated, not stubbed.

Because the classifier is about to be redeployed, I traced every DynamoDB path against the real writers of `ANALYSIS#<id>/ERROR` and `/RESULT` (preprocessor, router `/analyze`, classifier) and the readers (`/status`, `/visualize`):

- **Who writes ERROR, and with what `stage`:** the preprocessor writes four ERROR variants (`lambdas/preprocessor/handler.py:197-245`), none with a `stage` attribute, and re-raises each time. The router writes `PIPELINE_START_FAILED` with `stage: 'preprocessing'` (`lambdas/router/handler.py:256-266`) only when it could not start the pipeline. The classifier writes `stage` of `inference` or `classification`. So the `attribute_not_exists(#stage)` condition matches exactly the retryable preprocessor ERRORs.
- **Retry-recovered pipeline (the iteration-2 WR-01 scenario):** preprocessor ERROR (no stage), async retry succeeds, classifier invoked. `_terminal_outcome_exists` returns false (stage missing). Success path writes RESULT (conditional `attribute_not_exists(pk)`, per full `(pk, sk)` key) and deletes the stale ERROR. Failure path overwrites the stale ERROR with the classifier's own ERROR (condition true because `stage` is absent), so the real failure reason is shown. Both verified by moto tests. No wedge.
- **Duplicate delivery after a terminal outcome:** RESULT present, or ERROR with a classifier stage present, so the guard returns 200 `duplicate_delivery_ignored` without redoing inference. A second classifier failure hits `ConditionalCheckFailedException` (stage present), which is swallowed so the first terminal reason is kept. The test asserts this.
- **Failure lost?** `_record_failure` checks RESULT first (never contradicts a stored result), then writes the ERROR; the only swallowed exception is the expected conditional failure. Any other DynamoDB error propagates out of the `except` block, so Lambda's async retry re-runs the classification (the guard is false because no outcome was written), which is the safe direction.
- **Double write?** RESULT is conditional, so a concurrent duplicate cannot overwrite it. The only residual interleaving is covered in IN-09.
- **Raise on valid input?** The condition expression is valid DynamoDB syntax, the attribute-name alias is used and declared, `err.get('stage')` is safe on a `get_item` item, `bool(err) and ...` returns a bool, and `ConditionalCheckFailedException` is reached through `table.meta.client.exceptions` (correct for the resource API). `/status` and `/visualize` both check RESULT before ERROR (`router/handler.py:462-468`, `:515-525`), so a stale ERROR whose best-effort delete failed still cannot make a completed analysis look failed.
- **IAM:** the shared role has full DynamoDB access (`infrastructure/resources.json:134`), so the extra `GetItem`/`DeleteItem` calls need no new grant.

WR-02 is verified in code and in the UI. `AnalysisResults.tsx:161-163` and `ComparisonPanel.tsx:120-124` now render the same `similarSiteLabelText` output. All nine Irma, SanctSound and Bora-Bora reference ids have a provenance override, so the "no health label assigned by <source>" text is true for every current site. "label source not reported" now appears only when the API response has no provenance at all.

## Resolution of iteration-2 findings

| ID | Verdict | Evidence |
|----|---------|----------|
| WR-01 | Resolved | Guard allowlists classifier stages only (`handler.py:265-279`); guard now inside the `try` (`:133-142`); `_record_failure` condition supersedes stage-less ERRORs (`:301-310`); three moto tests (`test_handler.py:368-424`). |
| WR-02 | Resolved | `label-source.ts:22-30` distinguishes "no provenance" from "no label"; three unit tests added; both surfaces agree. |
| IN-02 | Resolved, one residual phrase | The two cited lines are corrected and accurate against `region_detection.py`. `.claude/CLAUDE.md:197` still reads "runs MLP, region adjustment, similarity" (the module's `adjust_classification` is kept only as a historical name and never adjusts anything). The docs gate still does not scan this file. Cosmetic; folded into IN-10. |
| IN-01, IN-03..IN-07 | Still open | No fix-touched file addresses them; carried forward below. |

## Narrative Findings (AI reviewer)

No Critical or Warning findings.

## Info

### IN-08: Guard allowlist and write condition use different notions of "classifier ERROR"

**File:** `lambdas/classifier/handler.py:268`, `:306`
**Issue:** The read guard treats an ERROR as terminal only when `stage in ('inference', 'classification')`, but the write condition lets a new ERROR replace only items with no `stage` at all. An ERROR with any other stage value is "not terminal" to the guard (classification proceeds) yet "not supersedable" to the write. The one real producer is the router's `PIPELINE_START_FAILED` (`stage: 'preprocessing'`), written when the preprocessor `invoke` raises client-side. If that error was a read timeout after the request was in fact accepted, the pipeline runs anyway. On success the RESULT wins and the ERROR is deleted (correct). On a classifier failure the classifier's real ERROR is silently dropped by the condition and the user sees the misleading `PIPELINE_START_FAILED`; the upload is still marked failed, so the outcome is correct but the reason is wrong. Narrow and self-limiting, hence Info.
**Fix:** Make both sites use one definition, for example `ConditionExpression='attribute_not_exists(pk) OR NOT (#stage IN (:s1, :s2))'` with `:s1='inference'`, `:s2='classification'`, built from `_CLASSIFIER_ERROR_STAGES`. Add a test with a `stage: 'preprocessing'` ERROR.

### IN-09: Concurrent duplicate deliveries can briefly leave ERROR beside RESULT and upload status 'failed'; guard reads are eventually consistent

**File:** `lambdas/classifier/handler.py:276-278`, `:296-317`
**Issue:** `_terminal_outcome_exists` and the RESULT check in `_record_failure` use default eventually consistent `get_item`. If delivery A fails while a concurrent delivery B succeeds, interleaving "A checks RESULT (absent), B writes RESULT and deletes ERROR, A writes ERROR, A sets upload to failed" leaves both items and an upload record that says `failed`. `/status` and `/visualize` check RESULT first, so users see the correct result, and the window needs two overlapping deliveries of one event plus a failure in one of them. No analysis is wedged or lost.
**Fix:** Pass `ConsistentRead=True` on the three guard/RESULT reads (cheap). Optionally, in the RESULT success path, also set the upload status after the ERROR delete, which it already does last, so the common ordering converges on `complete`.

### IN-10: Residual stale wording and an unscanned assistant-facing file

**File:** `.claude/CLAUDE.md:197`
**Issue:** See IN-02 row above: "region adjustment" remains in the Classifier row, and the banned-claims docs gate does not scan `.claude/CLAUDE.md`, so the next regeneration can reintroduce "confidence multiplier".
**Fix:** Change to "region description" and add the file to the docs gate's list.

### IN-11: Transient guard-read failure now becomes a terminal CLASSIFICATION_FAILED when the follow-up write succeeds

**File:** `lambdas/classifier/handler.py:133-142`, `:253-262`
**Issue:** Moving the guard inside the `try` (the WR-01 fix) means a transient DynamoDB read error is recorded as a permanent classifier ERROR instead of raising and letting Lambda's async retry re-run the work. In practice the follow-up `get_item` in `_record_failure` usually fails on the same outage and re-raises (so the retry still happens), but if only the first read failed the user gets a terminal failure for something a retry would have healed. This is consistent with the "one terminal ERROR, no retries" policy of the other transient failures (S3 read, inference), so it is a design trade-off, not a defect.
**Fix:** Optional: treat `ClientError` codes `ProvisionedThroughputExceededException`/`ThrottlingException`/`InternalServerError` from the guard as re-raise (let Lambda retry); keep recording everything else.

### IN-12: Raw exception text is stored in the public ERROR item (pre-existing)

**File:** `lambdas/classifier/handler.py:247`, `:258`; surfaced by `lambdas/router/handler.py:471-482`
**Issue:** `'error': str(e)` is persisted and returned verbatim by `/visualize` and `/status`. botocore messages can contain bucket/key names, role ARNs and account ids (for example an AccessDenied or NoSuchKey on the model object). Not introduced by the iteration-2 commits and not exploitable on its own, but it is user-visible internal detail on a public endpoint.
**Fix:** Store the raw text in a separate `internal_error` attribute (or only log it) and return `get_error_suggestion(...)`/a generic message in `error`.

### IN-13: `datetime.utcnow()` is deprecated

**File:** `lambdas/classifier/handler.py:196`, `:291`
**Issue:** Emits `DeprecationWarning` on Python 3.12 (tests) and is slated for removal. Runtime is 3.11 so it is harmless today; the stored string also has no `Z`/offset.
**Fix:** `datetime.now(timezone.utc).isoformat()` (keep the format stable if consumers parse it).

### Carried forward from iteration 2 (unchanged, still open)

- **IN-01** `lambdas/classifier/handler.py:588-622`: a failed model refresh (half-published pair) fails that analysis even though a validated cached model exists. Fix: on reload failure with a warm cache, log a warning and return the cached pair.
- **IN-03** `scripts/deploy-lambdas.py:233-240`: inference deploy relies on an unverified CodeBuild IAM grant for `inference-source/*`, leaves per-commit objects with no lifecycle rule, and `resolve_inference_image` can race the buildspec's swallowed `function-updated` wait. Router and classifier deploys are unaffected.
- **IN-04** `scripts/publish_model.py:131-143`, `:181-193`: `--rollback` verifies against the audited v2.0 hashes only; a missing archive prefix gives a raw botocore traceback.
- **IN-05** `lambdas/router/handler.py:346-350`; `scripts/verify_live_truth.py:139-150`: `skipped_sites` is not surfaced by any UI, and the live gate does not fail on empty `similar_sites` or print `similar_sites_error`.
- **IN-06** `lambdas/classifier/handler.py:235-259`: handled classifier failures no longer register in the Lambda `Errors` metric (they return a normal dict); add a log metric filter on `ERROR analysis` and perform the pending `MaximumRetryAttempts=0` operator step, noting that with retries at 0 an async-delivery duplicate becomes rarer but a classifier timeout is no longer retried.
- **IN-07** `dashboard-next/src/components/gallery/SampleCard.tsx:75-79`: `onPause` clears another card's playing state on a rejected `play()`; the 4 MiB upload ceiling is a tracked product regression pending presigned uploads.

---

_Reviewed: 2026-10-01T23:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
