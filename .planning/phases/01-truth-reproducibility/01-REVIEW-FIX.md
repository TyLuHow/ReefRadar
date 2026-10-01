---
phase: 01-truth-reproducibility
fixed_at: 2026-10-01T22:00:00Z
review_path: .planning/phases/01-truth-reproducibility/01-REVIEW.md
iteration: 2
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 1: Code Review Fix Report (iteration 2)

**Fixed at:** 2026-10-01
**Source review:** .planning/phases/01-truth-reproducibility/01-REVIEW.md
**Iteration:** 2

**Note:** Iteration 1 fixed CR-01..03 and WR-01..21 (24 findings) in 24 commits. The iteration 2 re-review confirmed all of them resolved and raised two new Warnings (WR-01, WR-02 in the iteration 2 numbering), fixed below. One Info item (IN-02) was also fixed at the caller's request.

**Summary:**
- Findings in scope: 2 (Warnings), plus IN-02 (Info) fixed on request
- Fixed: 2 (+ IN-02)
- Skipped: 0

## Fixed Issues

### WR-01: Classifier idempotency guard treats any pre-existing ERROR as terminal

**Files modified:** `lambdas/classifier/handler.py`, `lambdas/classifier/tests/test_handler.py`
**Commit:** 4a040ee
**Status:** fixed: requires human verification (idempotency/conditional-write logic)
**Applied fix:**
- `_terminal_outcome_exists` now returns true only for a RESULT item or for an ERROR item whose `stage` is `inference` or `classification` (classifier-authored). The preprocessor's stage-less, retryable ERROR no longer blocks classification; the existing best-effort stale-ERROR delete clears it when a RESULT is written.
- The guard moved inside the handler's `try`, so a DynamoDB read failure is recorded as `CLASSIFICATION_FAILED` instead of leaving the analysis stuck in "classifying".
- Beyond the review's suggestion: `_record_failure`'s conditional put is now `attribute_not_exists(pk) OR attribute_not_exists(#stage)`, so a classifier ERROR can supersede a stale preprocessor ERROR while still keeping the first classifier terminal outcome (otherwise the classifier's real failure reason would be silently dropped when a stale preprocessor ERROR existed).
- Tests added: stale preprocessor ERROR does not block a RESULT (and is cleared); classifier ERROR supersedes a stale preprocessor ERROR but a second classifier ERROR does not overwrite the first; guard read failure is recorded, not raised.

### WR-02: Similar-site rows say "label source not reported" for sites whose source IS reported

**Files modified:** `dashboard-next/src/lib/label-source.ts`, `dashboard-next/tests/unit/results-components.test.tsx`
**Commit:** 4c4a0ca
**Applied fix:** `similarSiteLabelText` returns null only when there is no provenance at all; when a source is known but `label_original` is absent it returns `no health label assigned by <source>`. `AnalysisResults` already falls back to "(label source not reported)" only on null, so no component change was needed, and `ComparisonPanel` now renders the same text for those sites (the two surfaces agree). Tests: Irma row (name from citation short form), SanctSound row (API-supplied `label_source_name`), and a legacy no-provenance row that still shows "label source not reported".

### IN-02: `.claude/CLAUDE.md` still describes the removed confidence multiplier

**Files modified:** `.claude/CLAUDE.md`
**Commit:** e25b91b
**Applied fix:** Rewrote the two factual lines (component table row for Region detection; "Region confidence is a static lookup table" constraint) to state that region detection is descriptive only and never scales probabilities or confidence (D-12). GSD sections and commands untouched. Not done: adding `.claude/CLAUDE.md` to the docs gate's file list, and fixing a generator source (the line 197 "region adjustment" wording in the Classifier row is also still present, as it was outside the cited lines).

## Skipped Issues

None.

## Verification

Run in the main checkout (`workflow.use_worktrees` is `false`, so no isolated worktree was created), after all three commits:

- `py -3.12 -m pytest -q` (repo root): all pass (220 tests, 0 failures)
- `npx vitest run` (dashboard-next): 11 files, 71 tests, all pass
- `npx tsc --noEmit`: clean
- `npm run lint`: 0 errors; 1 pre-existing warning (`react-hooks/exhaustive-deps` for `audio.crossfade` at `LocationCompare.tsx:91`)

No AWS calls were made; nothing was pushed.

---

_Fixed: 2026-10-01T22:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
