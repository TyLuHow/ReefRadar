---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 08
subsystem: ml-evaluation
tags: [surfperch, inference-client, re-embedding, embedding-fixture, offline-tooling, moto]
status: complete

requires:
  - phase: 05-02
    provides: "reef_audio.audio_to_windows, SPEC_VERSION, KAGGLE_MODEL_HANDLE"
  - phase: 05-04
    provides: "original.f32 + rows.json (100 training rows, pinned sha256)"
  - phase: 05-05
    provides: "full WAV decode matrix used for figshare and excerpt WAVs"
provides:
  - "scripts/surfperch_client.py: InferenceClient(embed, warm), make_client, aws_session, assert_account, compare_embeddings, EmbeddingAlignmentError, InferenceCallFailed, shared hash/JSON helpers"
  - "scripts/reembed_training.py: figshare range fetch -> reef_audio window 0 -> inference -> reembedded.f32 + reembedded.json with drift probe"
  - "scripts/record_embedding_fixture.py: excerpt fixture recorder and --check tolerance mode"
affects: [05-11 live re-embedding and fixture recording, 05-13, 05-14]

tech-stack:
  added: []
  patterns: ["live paths gated behind --confirm; client factory (make_client) is the single AWS entry and is never called otherwise", "account identity checked before any download or invoke", "temp batch objects deleted in a finally block"]

key-files:
  created:
    - scripts/surfperch_client.py
    - scripts/reembed_training.py
    - scripts/record_embedding_fixture.py
    - scripts/tests/test_surfperch_client.py
    - scripts/tests/test_reembed_training.py
  modified: []

key-decisions:
  - "make_client lives in surfperch_client and is re-exported into both scripts as a module global, so tests (and 05-11) swap one name and the no-AWS-without---confirm guarantee is testable."
  - "Without --confirm both scripts are fully offline: reembed_training does not even list figshare. --dry-run beats --confirm."
  - "The AWS account check runs inside make_client, i.e. before the 192 MB of figshare range fetches, not after them as the plan's prose order implied."
  - "The Lambda client is built with read_timeout 330 s and botocore max_attempts 1; all retrying is in InferenceClient so two invocations of the container can never overlap."
  - "Alignment failures (count, length, non-finite) and HTTP-400 replies are never retried; throttling uses 3/8/15 s, other errors 1/2/4 s, three attempts."
  - "--check without --confirm still runs the offline excerpt and window hash comparison and exits 0 or 1; only the embedding comparison needs --confirm."

requirements-completed: [ML-01, ML-03, ML-06]

completed: 2026-10-14
actuals:
  tokens: 21000
  tasks: 2
  commits: 5
---

# Phase 5 Plan 08: Offline embedding tooling Summary

**Three unit-tested, serial, identity-checked and alignment-checked scripts (inference client, training re-embedder with drift probe, excerpt fixture recorder) so the live runs in 05-11 are one command each; nothing here touched AWS or figshare.**

## What was built

- **`scripts/surfperch_client.py`**: `InferenceClient` mirrors the classifier's S3 batch protocol (temp object under `temp/embedding_batches/offline_*`, `RequestResponse` invoke with `{s3_bucket, s3_key}`, `FunctionError` and statusCode handling, throttle backoff 3/8/15 s, other retries 1/2/4 s) without importing the classifier. Batches of 10 run strictly serially; every batch is checked for count, 1280-length and finiteness (`EmbeddingAlignmentError` naming the batch); the temp object is deleted on success and failure. `warm()` invokes once with `{}`. `assert_account` refuses any account other than 781978598306. `compare_embeddings` returns per-row cosine and max abs and passes only when every row meets cosine >= 0.99999 and max abs <= 1e-5. `make_client(profile)` builds the profile session, checks the account and returns a client. boto3 is imported only inside `aws_session`.
- **`scripts/reembed_training.py`**: reads rows.json and original.f32 (embeddings sha256 verified), lists figshare once, reads each site zip's central directory once, matches the entry whose basename stem equals the file id (case-insensitive), requires downloaded length == central-directory uncompressed size, caches under `data/training/audio` (gitignored), decodes with `reef_audio.audio_to_windows` and keeps window 0. Writes `reembedded.f32` and canonical `reembedded.json` with every key the plan lists (wav/window sha256, peak/rms dBFS, silent, dataset provenance, inference block with the container caveat) and a drift probe (pairs, cosine mean/median/min/max against the original row).
- **`scripts/record_embedding_fixture.py`**: records the 54 excerpt-window embeddings (9 excerpts x 6) to `excerpt_embeddings.f32` and `.json` (excerpt path and sha256, per-window index/row/window_sha256, embeddings_sha256, spec_version, recorded_at, inference, tolerance). `--check` never writes; it first recomputes excerpt and window hashes and refuses (exit 1) before inference on any change, added or missing excerpt or spec_version mismatch, then re-embeds and compares at the stored tolerance, printing min cosine and max abs only.

## Verification

- `py -3.12 -m pytest scripts/tests/test_surfperch_client.py scripts/tests/test_reembed_training.py -q`: 18 passed (tracer verify re-run end to end after the Task 1 commit, then again after Task 2).
- Acceptance: `reembed_training.py --help` lists `--confirm`, `--limit`, `--dry-run`; `record_embedding_fixture.py --help` lists `--check` and `--confirm`; `grep -c "class InferenceClient"` = 1; `grep -c 781978598306` = 1.
- Full suite `py -3.12 -m pytest -q` (logged): everything passes except the known Windows CRLF noise `scripts/tests/test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent`; the three files it rewrites were restored with `git checkout --` and are not committed.
- Live-path check: every AWS path is behind `--confirm`. Tests assert the client factory is never called without it (`test_reembed_requires_confirm_for_aws`, `test_fixture_requires_confirm_for_aws`), and plan mode makes zero figshare calls. No `--confirm` run was executed against real services; `py -3.12 scripts/reembed_training.py --limit 3` (plan only) printed the per-site plan and "no AWS or figshare call made".
- S3 behaviour in the client tests runs against moto; the Lambda client is a fake. No network or credentials used.

## Task commits

1. Task 1 RED: `6e9126c` test(05-08) failing tests for the client and re-embedder
2. Task 1 GREEN: `9fef914` feat(05-08) serial inference client and training re-embedder
3. Task 2 RED: `ad84ef0` test(05-08) failing tests for the fixture recorder
4. Task 2 GREEN: `d3168fd` feat(05-08) fixture recorder with --check
5. SUMMARY commit (docs)

## Deviations from Plan

**1. [Ordering] Account check precedes the figshare fetch.** The plan text lists fetch/decode first, then `aws_session`, `assert_account`, warm. Doing the identity check first avoids downloading about 192 MB when the wrong profile is active (T-05-08-04 intent). Behaviour otherwise as specified.

**2. [Addition] Extra tests beyond the plan's named list.** `test_client_client_error_not_retried`, `test_reembed_refuses_wrong_size` (T-05-08-02), `test_reembed_refuses_tampered_original_embeddings`, `test_reembed_missing_zip_entry_is_an_error`, and `--help` flag tests. No behaviour difference.

**3. [Design choice] Lambda client configured for the long cold start.** `read_timeout=330`, botocore `max_attempts=1`, so botocore never re-invokes behind the client's back.

**4. [Process] Tracer gate treated as autonomous.** After the Task 1 GREEN commit the tracer's verify was re-run end to end and passed; expansion (Task 2) proceeded.

## Notes for 05-11 (live runs)

- Run `reembed_training.py --limit 1 --confirm` first, inspect `reembedded.json`, then run all 100. Inference function cold start is slow; the client warms once.
- Record the fixture twice (cold, then warm) and run `--check --confirm` after each, per 05-RESEARCH Q4. If a legitimate tolerance miss appears, regenerate deliberately; `--check` never rewrites.
- The inference container's tensorflow-cpu version is unpinned and unrecorded; this is written into both JSON outputs as `container_note`.
- Posting 10 windows per batch serialises about 30 MB of JSON to S3 per batch (same as the classifier); expect a few seconds per put.

## Known Stubs

None.

## Threat Flags

None. Threat register: T-05-08-01 (prints counts, keys, status codes, hashes only; profile session), T-05-08-02 (size check against the central directory plus recorded sha256s), T-05-08-03 (serial batches, warm-up, throttle backoff, no thread pool), T-05-08-04 (`assert_account` in `make_client`, before any download or invoke), T-05-08-05 (`EmbeddingAlignmentError`) are all implemented and tested.

## Self-Check: PASSED

- scripts/surfperch_client.py, scripts/reembed_training.py, scripts/record_embedding_fixture.py, scripts/tests/test_surfperch_client.py and scripts/tests/test_reembed_training.py exist and are committed.
- Commits 6e9126c, 9fef914, ad84ef0 and d3168fd are present in `git log`.
