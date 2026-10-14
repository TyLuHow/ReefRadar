---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 11
subsystem: ml-evaluation
tags: [surfperch, re-embedding, drift-probe, embedding-fixture, live-aws, marrs]
status: complete

requires:
  - phase: 05-04
    provides: "rows.json + original.f32 (100 original training rows, pinned sha256)"
  - phase: 05-07
    provides: "preprocessor tests layout (lambdas/preprocessor/tests)"
  - phase: 05-08
    provides: "reembed_training.py, record_embedding_fixture.py, surfperch_client.py"
provides:
  - "models/interim-real-only/evaluation/inputs/reembedded.{f32,json}: 100 x 1280 float32-le first-window embeddings of the same 100 training files through reef_audio, with per-row WAV and window sha256, inference details and the drift probe"
  - "lambdas/preprocessor/tests/fixtures/excerpt_embeddings.{f32,json}: 54 x 1280 excerpt-window embeddings with per-window sha256 and the locked tolerance"
  - "unit tests pinning both; live-marked regeneration and kaggle-pin tests"
affects: [05-12, 05-13, 05-14, 05-15]

key-files:
  created:
    - models/interim-real-only/evaluation/inputs/reembedded.f32
    - models/interim-real-only/evaluation/inputs/reembedded.json
    - scripts/tests/test_reembedded_inputs.py
    - lambdas/preprocessor/tests/fixtures/excerpt_embeddings.f32
    - lambdas/preprocessor/tests/fixtures/excerpt_embeddings.json
    - lambdas/preprocessor/tests/test_embedding_fixture.py
    - lambdas/preprocessor/tests/test_embedding_fixture_live.py
  modified: []

key-decisions:
  - "The drift probe is recorded exactly as measured (mean cosine 0.2066), not adjusted; it sits just below the 0.23-0.26 RESEARCH expectation."
  - "The 'record twice, cold then warm' step is realised as one record run plus two further live regenerations (--check once, then the live test's two runs); --check never rewrites, so the fixture is a single recording."

requirements-completed: [ML-01, ML-03, ML-06]

completed: 2026-10-14
actuals:
  tokens: 30000
  tasks: 3
  commits: 2
---

# Phase 5 Plan 11: Live re-embedding, drift probe and excerpt fixture Summary

**The 100 MARRS training files were re-embedded through reef_audio by the deployed inference Lambda (drift vs the original embeddings: mean cosine 0.2066, min -0.0861, max 0.4961), and the 54-window excerpt embedding fixture was recorded and reproduced bit-for-bit (min cosine 1.0, max abs 0) in three further live runs.**

## Live run log

Identity and budget (precondition): `sts get-caller-identity --profile reefradar` returned account 781978598306; `setup_contract_infra.py --step budget --verify` exited 0 (budget reefradar-2477-ceiling-25 exists, limit 25 USD monthly, three notifications, one email subscriber each, legacy budget absent). `reembed_training.py --dry-run` listed 5 site zips (ind_D2, ind_D3, ind_H4, ind_N1, ken_H1) and 100 file entries; the live runs then matched all 100 entries in the zip central directories.

| Step | Invocations of reefradar-2477-inference | Duration | Result |
|---|---|---|---|
| Task 1 tracer, `--limit 1 --confirm` (cold container) | 1 warm-up (status 200, 3.5 s) + 1 batch | 1 m 8 s wall | 1 row, 1280 finite values, window_sha256 recomputed from the cached WAV matches, drift cosine 0.0954 |
| Task 2, `--confirm` (all 100) | 1 warm-up (status 200, 3.1 s) + 10 serial batches of 10 | about 16 min wall (about 11 min of that is the 100 sequential figshare range fetches, about 2 min inference) | 100 rows, all attempt 1/3, no retries or throttling |
| Task 3 record, `record_embedding_fixture.py --confirm` | 1 warm-up (status 200, 0.6 s) + 6 batches | 1 m 24 s | 54 embeddings, embeddings sha256 f16834a840b6f256ff512a525f142e5945e9f80e3ac4c7b153978a5ad1ce3a82 |
| Task 3 `--check --confirm` (run 1) | 1 warm-up + 6 batches | about 1 min | min cosine 1.00000000, max abs 0.000e+00, PASS |
| Task 3 `-m live` test (runs 2 and 3, one warm-up shared) | 1 warm-up (0.5 s) + 12 batches | 3 m 2 s | run 2: min cosine 1.00000000, max abs 0.000e+00; run 3: min cosine 1.00000000, max abs 0.000e+00; 1 passed |

Total: 40 invocations of the inference Lambda (5 warm-ups, 35 batches), strictly serial. Nothing else in AWS was invoked or written.

The kaggle model pin test (`test_live_kaggle_model_files_match_pinned_sha256`) was skipped: kagglehub is not installed in this environment (by design, not added to requirements-dev.txt). The pin therefore has not yet been confirmed against a fresh download in this plan.

All warm runs reproduced the fixture exactly (identical float32 values), well inside the locked tolerance (cosine >= 0.99999, max abs <= 1e-5). The only cold-start sample is the tracer (the fixture itself was recorded on an already-warm container, 0.6 s warm-up), so cold-versus-warm determinism for the excerpt windows is not separately measured; the 100-row run began on a container warmed by the tracer a few minutes earlier.

## Drift probe (original training embedding vs re-embedded, same file, first 5 s window)

Measured, not adjusted, on 100 pairs:

| Statistic | Cosine |
|---|---|
| mean | 0.2066 |
| median | 0.2125 |
| min | -0.0861 |
| max | 0.4961 |

Per site (mean / min / max): ind_D2 0.199 / 0.055 / 0.496; ind_D3 0.283 / 0.007 / 0.425; ind_H4 0.209 / 0.046 / 0.346; ind_N1 0.101 / -0.086 / 0.337; ken_H1 0.241 / 0.005 / 0.431. No file was flagged silent (peak between -44.6 and -11.3 dBFS). The mean is slightly below the 0.23-0.26 that RESEARCH expected from excerpt windows, and the one-row tracer (0.0954) is within the spread. The original training embeddings and the reef_audio embeddings are therefore very different representations of the same audio, so a model trained on the old embeddings cannot be assumed to transfer to reef_audio-preprocessed input; this is the measurement the successor model and the parity claim depend on.

Data provenance: audio is MARRS (Williams, Jones et al. 2025), DOI 10.5522/04/29958062 (figshare article 29958062), CC BY 4.0, recorded in `reembedded.json` under `dataset`. The WAV cache stays in `data/training/audio` (gitignored; `git status --porcelain data/training` prints nothing).

## Cleanup

- Temp S3 batch objects: the client deletes each `temp/embedding_batches/offline_*` object after use. After all runs `s3 ls s3://reefradar-2477-embeddings/temp/embedding_batches/offline_` returns nothing, so no leftover objects from this plan. (Older, unrelated objects with uuid prefixes from earlier sessions exist in the same folder; they are not ours and were left alone.)
- Tracer output `data/training/reembed-tracer/` is gitignored and left in the worktree.
- The CRLF noise test rewrote `data/audio-manifest.json` and two dashboard fixtures during the full suite run; they were restored with `git checkout --` and are not committed.
- No deploy, no writes to S3 `models/`, the contract bucket or DynamoDB.

## Verification

- `py -3.12 -m pytest scripts/tests/test_reembedded_inputs.py -x -q`: 5 passed.
- `py -3.12 -m pytest lambdas/preprocessor/tests/test_embedding_fixture.py -x -q`: 5 passed.
- `py -3.12 -m pytest -m live lambdas/preprocessor/tests/test_embedding_fixture_live.py`: 1 passed, 1 skipped (kagglehub missing).
- Default `py -3.12 -m pytest`: 754 passed, 1 skipped, 3 deselected, 1 failed. The failure is the known Windows CRLF noise `scripts/tests/test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent` (pre-existing, unrelated).
- Acceptance: reembedded.f32 is 512000 bytes; excerpt_embeddings.f32 is 276480 bytes; `git check-attr diff` reports `unset` for both f32 files; `grep -c "pytest.mark.live"` on the live test file prints 2.

## Task commits

1. Task 1 (tracer): no commit; output in gitignored `data/training/reembed-tracer/` and no script defect found.
2. Task 2: `4b7f12f` feat(05-11) commit 100 re-embedded training rows with drift probe
3. Task 3: `5a4f839` feat(05-11) record 54-window excerpt embedding fixture with unit and live tests
4. SUMMARY commit (docs)

## Deviations from Plan

**1. [Minor, no fix] Misleading plan banner under --confirm.** `reembed_training.py --confirm` prints "no AWS or figshare call made (pass --confirm to run live)" at the top of its plan output even though it then runs live (it appears after the plan listing and before the first "decoded" line). Cosmetic only; the live path ran correctly. Left unfixed to keep this live plan to data and tests; worth a one-line fix in a later plan.

**2. [Interpretation] "Record the fixture twice (cold, then warm)".** Implemented as one record, then three comparison runs (`--check --confirm`, then the two runs inside the live test) rather than two recordings, because `--check` is the specified comparison and a second recording would simply overwrite the first. The recorded container was already warm, so no cold excerpt sample exists (see above).

**3. [Process] Long run backgrounded by the harness.** The 100-file run exceeded the 590 s tool timeout and was moved to the background by the harness (not killed); it completed with exit 0 and all output is as above. No work-around was applied.

## Known Stubs

None.

## Threat Flags

None. T-05-11-01 (account asserted in make_client before any fetch or invoke; verified 781978598306), T-05-11-02 (serial, one warm-up per process, budget alarm verified first, 40 invocations in total), T-05-11-03 (sha256 pins and recomputing unit tests for both outputs), T-05-11-04 (only account id, status codes, counts, hashes and cosine statistics recorded here).

## Self-Check: PASSED

- All seven files in key-files.created exist and are committed.
- Commits 4b7f12f and 5a4f839 are present in `git log`.
