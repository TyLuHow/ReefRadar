---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 13
subsystem: ml-evaluation
tags: [loso, evaluation-report, cluster-bootstrap, model-card, withdrawn-claims]
status: complete

requires:
  - phase: 05-04
    provides: "LOSO harness (run_loso, metrics, two_level_bootstrap, baselines) and the original rows"
  - phase: 05-06
    provides: "evaluation-report.schema.json"
  - phase: 05-11
    provides: "reembedded.f32/json and the drift probe"
  - phase: 05-12
    provides: "the served successor interim-real-only-2026.10.1 and its recipe"
provides:
  - "models/interim-real-only/evaluation/report.json (loso-2026.10.1): schema-valid, input-pinned LOSO report for both model families, served model named"
  - "models/interim-real-only/evaluation/REPORT.md: plain-language report rendered from report.json only"
  - "scripts/evaluate_loso.py report subcommand, build_report, render_markdown, chance_statement"
  - "docs/MODEL_EVALUATION.md rewritten: the 2026-02-03 90.0% random-split figures withdrawn, pointer to the report"
affects: [05-14, 05-15, 05-16, 05-17]

key-files:
  created:
    - models/interim-real-only/evaluation/report.json
    - models/interim-real-only/evaluation/REPORT.md
  modified:
    - scripts/evaluate_loso.py
    - scripts/tests/test_loso_eval.py
    - docs/MODEL_EVALUATION.md
    - .gitattributes

key-decisions:
  - "generated_by.git_sha is the last commit touching scripts/evaluate_loso.py (not HEAD), so re-running the report after it is committed is byte-identical."
  - "Baselines are stored as one balanced-accuracy metric each (the schema's baselines are single metrics), with no interval (ci_status undefined)."
  - "The 'below chance' and 'the model identified sites, not reef health' sentences are produced only when the whole balanced-accuracy interval lies under 1/k (0.5 for the two evaluable classes); otherwise the text states where the interval sits."
  - "Per-window probabilities are stored rounded to 6 decimals; labels and metrics are from unrounded argmax and are recomputed exactly from the stored predictions."

requirements-completed: [ML-03]

completed: 2026-10-14
actuals:
  tokens: 60000
  tasks: 2
  commits: 4
---

# Phase 5 Plan 13: Grouped evaluation report and withdrawn accuracy page Summary

**Leave-one-site-out report `loso-2026.10.1` for both the original model and the served successor `interim-real-only-2026.10.1`, schema-valid, sha256-pinned and byte-reproducible, with a plain-language REPORT.md and a rewritten docs page that withdraws the 90.0% and 100% random-split figures.**

## Headline numbers (all from report.json; B = 10,000, seed 20261011, two-level, percentile 95, NumPy 1.26.4)

Each number lives in its own embedding space; the two are not a measure of one model improving on the other (drift probe over 100 pairs: cosine mean 0.2066, median 0.2125, min -0.0861, max 0.4961).

| Metric (4 evaluable sites, 80 windows) | `interim-real-only` (original embeddings, not served) | `interim-real-only-2026.10.1` (re-embedded, **served**) |
|---|---|---|
| balanced accuracy | 0.0625 [0.0000, 0.1750] | 0.4375 [0.3000, 0.5833] |
| degraded recall (2 sites, 40 windows) | 0.0250 [0.0000, 0.1000] | 0.2500 [0.0500, 0.4500] |
| healthy recall (2 sites, 40 windows) | 0.1000 [0.0000, 0.3000] | 0.6250 [0.4181, 0.8000] |
| Indonesia accuracy (3 sites, 60 windows) | 0.0167 [0.0000, 0.0667] | 0.4000 [0.1500, 0.6833] |
| Kenya accuracy (1 site, 20 windows) | 0.2000, CI not estimable (1 site) | 0.5500, CI not estimable (1 site) |
| baseline training majority (balanced) | 0.0000 | 0.0000 |
| baseline uniform random (balanced) | 0.3333 | 0.3333 |
| restored_early | not evaluable: class absent from the training fold | same |

Reading, as the Markdown states it: the original model's interval lies entirely under the 0.5 chance line for the two evaluable classes (below chance; the model identified sites, not reef health). The served successor's interval [0.3000, 0.5833] contains 0.5 and 0.3333: its result cannot be told apart from chance and is not evidence that it recognises reef health at a new site. Neither model is shown to generalise; the successor's higher point estimate is not claimed as an improvement (different embedding space, four evaluable sites, intervals wide). ind_N1 (the only restored_early site) predictions: original degraded 20; successor degraded 18, healthy 2.

## What was built

- Task 1 (tracer): `evaluate_loso.py report` (`--inputs-dir`, `--out`, `--md`, `--B`, `--bootstrap-seed`). `build_report` runs both input sets through `run_loso`, `two_level_bootstrap` and `baselines`, computes the drift probe from the two embedding files, pins the four inputs plus the training file by sha256 (JSON files over LF bytes), records trainer git sha (last commit touching `scripts/train_interim_real_only.py`, `ba9ce01...`), seed 42, B, RNG and NumPy version, lists the invalidated 1.0 split accuracy and the 90.0% overall accuracy with reasons, carries the Q6 caveats, validates with `contract_lib.validate` before writing and writes canonical JSON.
- Task 2: `render_markdown` (REPORT.md from the dict alone), `chance_statement`, rewritten `docs/MODEL_EVALUATION.md`, `.gitattributes` LF rule for REPORT.md.
- Tests added to `scripts/tests/test_loso_eval.py` (26 pass): schema, pins, both models and served flag, not-evaluable and not-estimable, invalidated figures, metrics and intervals recomputed exactly from stored predictions, refit within tolerance (labels equal except margin < 1e-3, probabilities within 1e-3), Markdown rendered from JSON byte for byte, chance wording parametrised (below, above, straddling and per model), and the docs page test.

## Task commits

1. `297ed1d` feat(05-13): evaluate_loso report subcommand with schema-valid two-model LOSO report
2. `13104cc` feat(05-13): commit loso-2026.10.1 evaluation report for the original and served models
3. `936a9f5` feat(05-13): render REPORT.md from report.json and withdraw the random-split accuracy page
4. `c6efb30` docs(05-13): publish rendered REPORT.md and refresh report.json generator sha

## Verification

- `py -3.12 -m pytest scripts/tests/test_loso_eval.py -x -q -k "report or reproduces"` and the whole file: pass.
- Schema check prints `interim-real-only-2026.10.1 ['interim-real-only', 'interim-real-only-2026.10.1']`; `not_estimable_1_site` appears 2 times, `class absent from the training fold` 2 times in report.json.
- `node scripts/check-citations.mjs --scope docs`: OK, no banned-pattern hits (437 files).
- After the final commit, `py -3.12 scripts/evaluate_loso.py report` rewrote report.json and REPORT.md with no change (`git status` clean); two back-to-back runs also compared equal with `cmp`.
- Full suite `py -3.12 -m pytest -q`: 821 passed, 1 skipped, 1 failed (counts tallied from the progress line; no summary line was captured). The failure is the known Windows CRLF noise `scripts/tests/test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent`; it rewrote `data/audio-manifest.json` and two dashboard fixtures, restored with `git checkout --` and not committed.
- No AWS call was made.

## Deviations from Plan

**1. [Process] Tests and code in the same commit.** The tracer's report tests and implementation landed together (and Task 2's likewise), so there is no separate RED commit; each test group was run against its implementation before committing.

**2. [Process] Tracer gate treated as autonomous.** As a non-interactive executor, I re-ran the tracer's verify end to end (regenerate, validate, tests) before expanding, rather than returning a human-verify checkpoint. It passed.

**3. [Design] generated_by.git_sha is the last commit touching the generator, not HEAD,** so the committed report regenerates byte-identically after it is committed. This also means report.json had to be regenerated (commit 4) after the Task 2 change to `evaluate_loso.py`.

**4. [Schema fit] Baselines are single balanced-accuracy metrics,** because the schema types each baseline as one metric; their ci_status is `undefined`. The harness status `not_estimable_undefined` is written as the contract's `undefined`.

**5. [Minor] `evaluate_loso.py` line endings.** The working copy was CRLF; it is now LF (the index is LF; diffs are content only).

**6. [Minor] Test placement.** The new report tests sit before `test_bootstrap_committed_inputs_full_b` in the existing file rather than at its end (edit-tool constraint on a CRLF file); no behavioural effect.

## Notes for downstream plans

- The pointer in `models/interim-real-only-2026.10.1` (`evaluation_note`) to `models/interim-real-only/evaluation/REPORT.md` now resolves.
- 05-14 (contract v2): publish `report.json` as the evaluation artifact; its sha256 is that of the committed file (LF bytes). The report's `trainer.git_sha` is `ba9ce0137d326e52bfebc6ab449759454e968741`, `generated_by.git_sha` is `936a9f5...` (full sha in the file).
- Any Methods or model-card copy should reuse REPORT.md's sentences, not paraphrase them upward; the successor result is "indistinguishable from chance on four sites", not an improvement.
- The numpy_version in the report is 1.26.4; a different NumPy would still give the same RandomState stream, but the recorded version would differ.

## Known Stubs

None.

## Threat Flags

None. T-05-13-01 (reproduction: stored predictions, pinned inputs, recorded shas, seed, B, RNG, NumPy version, reproduction tests), T-05-13-02 (Markdown rendered only from JSON; chance wording computed from intervals; old figures recorded as invalidated; docs page test), T-05-13-03 (report validated before writing and in tests) are mitigated.

## Self-Check: PASSED

report.json, REPORT.md, MODEL_EVALUATION.md, evaluate_loso.py and the test file exist; commits 297ed1d, 13104cc, 936a9f5 and c6efb30 are in `git log`.
