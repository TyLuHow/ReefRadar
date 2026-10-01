---
phase: 02-data-contract-v1
plan: 04
subsystem: data-contract
tags: [publisher, s3, conditional-writes, immutability, rollback, budget-gate, live-verifier, moto]

requires:
  - phase: 02-data-contract-v1
    provides: deterministic v1 bundle, check_contract, PUBLISHED.json immutability guard (02-01, 02-03); contract bucket, CloudFront distribution and budget alarm (02-02)
provides:
  - scripts/publish_contract.py - immutable, verified, pointer-last contract publisher with --set-latest rollback, preflight, forward-only rule and budget gate
  - scripts/verify_contract_live.py - public unauthenticated verifier of a published contract (headers, hashes, CORS, privacy)
  - 30 moto tests for the publisher and 24 fake-session tests for the verifier
affects: [02-06, 02-12, 08, 11, 12]

actuals:
  tokens: 16800
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Immutability enforced by S3 itself: put_object with IfNoneMatch '*'; a 412 is resolved by comparing the existing object's sha256 (identical = idempotent re-run, different = abort), never by an unconditional retry"
    - "A read-only preflight (inspect_bucket) finds conflicts before the first write, and the conditional write still guards the race between preflight and write"
    - "The pointer is the only mutable object: created with IfNoneMatch or replaced with IfMatch on the ETag read before the publish, re-downloaded and verified, and always the last write"
    - "Exit codes: 0 ok, 1 refused or failed (PublishError), 2 blocked by the budget gate"

key-files:
  created:
    - scripts/publish_contract.py
    - scripts/verify_contract_live.py
    - scripts/tests/test_publish_contract.py
    - scripts/tests/test_verify_contract_live.py
  modified: []

key-decisions:
  - "Publisher reuses check_contract.check_manifest for the version being published (plus its own explicit fixture, CRLF and PUBLISHED checks) rather than the whole check(), which also walks fixtures and the parity corpus and needs a full contracts/ copy"
  - "copy-equals-source for the bundled schema copies is only required while the version is not in PUBLISHED.json (consistent with the 02-03 freeze rule), so a re-run of an already published version still works after additive schema growth"
  - "A clean-tree requirement applies to --version --confirm only; --set-latest verifies the bucket against PUBLISHED.json and the bucket's own manifest, so an emergency rollback is not blocked by an uncommitted PUBLISHED.json"
  - "--dry-run (and a run without --confirm) reads the real bucket and the budget best-effort and labels each key would_create / exists_identical / conflict / unchecked; an unreadable bucket or missing credentials degrade to 'unchecked', never to a write"

patterns-established:
  - "One verifier per published surface: unauthenticated GETs with an Origin header, one PASS/FAIL line per check, hashes and status codes only"

requirements-completed: []

coverage:
  - id: D1
    description: "A committed bundle is published in one verified pass: every artifact then contract/vN.json with If-None-Match and immutable caching, all re-downloaded and hashed, contract/latest.json (max-age 60) written last"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "scripts/tests/test_publish_contract.py#test_manifest_follows_every_artifact_and_the_pointer_is_the_last_write"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_publish_contract.py#test_publish_writes_every_artifact_with_immutable_headers"
        status: pass
    human_judgment: false
  - id: D2
    description: "A published object is never overwritten: differing bytes abort before the pointer moves, identical bytes make a re-run idempotent, a concurrent writer is caught by the 412"
    requirement: "CONTRACT-04"
    verification:
      - kind: unit
        ref: "scripts/tests/test_publish_contract.py#test_an_existing_object_with_different_bytes_is_never_overwritten"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_publish_contract.py#test_an_object_that_appears_between_check_and_write_is_not_overwritten"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_publish_contract.py#test_a_rerun_after_a_partial_publish_is_idempotent"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fixtures, CRLF, failing bundles, a changed published manifest, an uncommitted contracts/ tree and a missing budget alarm are each refused before any write"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "scripts/tests/test_publish_contract.py#test_a_fixture_manifest_is_refused_before_any_write"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_publish_contract.py#test_uncommitted_changes_under_contracts_refuse_confirm_but_not_dry_run"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_publish_contract.py#test_confirm_is_blocked_without_the_budget_alarm_and_its_notifications"
        status: pass
    human_judgment: false
  - id: D4
    description: "Safe rollback: --set-latest verifies the bucket manifest and every artifact against PUBLISHED.json and flips with If-Match, aborting when the pointer changed in between; publishing is forward-only"
    requirement: "CONTRACT-04"
    verification:
      - kind: unit
        ref: "scripts/tests/test_publish_contract.py#test_set_latest_aborts_when_the_pointer_changes_between_read_and_write"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_publish_contract.py#test_publish_refuses_to_move_the_pointer_back"
        status: pass
    human_judgment: false
  - id: D5
    description: "One public command proves a published contract is served correctly: pointer and manifest headers, hashes, every artifact, byte equality with the committed manifest, private S3, no listing"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "scripts/tests/test_verify_contract_live.py#test_every_check_passes_against_a_correct_deployment"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_verify_contract_live.py#test_a_defect_fails_the_named_check"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-10-01
status: complete
---

# Phase 2 Plan 04: Contract Publisher and Live Verifier Summary

**`scripts/publish_contract.py` publishes a committed contract bundle with S3-enforced immutability (If-None-Match on every object, 412 resolved by byte comparison), re-downloads and hashes everything, and flips `contract/latest.json` last with If-Match on its ETag; it also provides forward-only publishing, a `--set-latest` rollback, refusals for fixtures/CRLF/dirty trees and a budget-alarm gate, while `scripts/verify_contract_live.py` proves the result from the public internet with unauthenticated GETs.**

## Performance

- **Duration:** about 40 min
- **Tasks:** 3 (one tracer, two auto), all TDD
- **Commits:** 4 task commits
- **Files:** 4 created (about 67 KB; the publisher is 27 KB, the tests 30 KB)

## Accomplishments

- **Publish flow (Task 1, tracer).** For `--version N` the publisher validates the bundle, then writes every manifest artifact (sorted by key, including the seven schema copies), then `contract/vN.json`, each with `IfNoneMatch="*"`, `Cache-Control: public, max-age=31536000, immutable`, a ContentType by extension (`.f32` is `application/octet-stream`) and `Metadata sha256`. Bodies are uploaded exactly as committed. It then re-downloads every object and compares sha256 and Cache-Control, writes the pointer (`public, max-age=60`) as the single last write, re-downloads it, and records `{manifest_sha256, published_at, git_sha, bucket}` in `contracts/PUBLISHED.json` as canonical LF JSON. A recording wrapper test proves the write order. No CloudFront invalidation is ever created.
- **Immutability (Task 2).** `inspect_bucket` is a read-only preflight: an existing object with different bytes, or identical bytes without the immutable Cache-Control, aborts before the first write ("exists with different content; versions are immutable"). The conditional write still covers the race between preflight and write: a test plants a different object just before the put and the publish aborts with the planted bytes intact and no pointer written. Identical existing objects are reported `exists_identical`, so a re-run after a partial publish completes, and a full second run changes nothing (`pointer_unchanged`, PUBLISHED.json untouched).
- **Refusals.** A manifest marked `fixture`, any CRLF in a JSON file, a bundle failing `check_contract.check_manifest`, a manifest whose hash differs from PUBLISHED.json ("published version N modified") and uncommitted changes under `contracts/` (`git status --porcelain`, injectable for tests) each stop `--confirm` before any put; `--dry-run` still reports (the tree line says `dirty`).
- **Budget gate.** `--confirm` (for both publish and `--set-latest`) exits 2 with `BLOCKED: budget alarm reefradar-2477-ceiling-25 missing (<detail>)` when `describe_budget` finds no budget or `describe_notifications_for_budget` returns fewer than three; the budget name is imported from `setup_contract_infra` so it has one source. `--dry-run` prints the same status and exits 0. Credential problems report the exception class only.
- **Forward-only and rollback.** `--version N` refuses to move a pointer that already names a newer version and points at `--set-latest N`. `--set-latest N` requires N in PUBLISHED.json, downloads the bucket's `contract/vN.json` and requires it to hash to the recorded value, re-downloads every artifact the bucket manifest lists, then flips with `IfMatch` on the current ETag (a pointer changed between read and write aborts, nothing is overwritten).
- **Live verifier (Task 3).** `verify_contract_live.py` sends only unauthenticated GETs with `Origin: http://localhost:3000` and a 30 s timeout and checks: pointer status, exact `public, max-age=60`, CORS `*`, schema validity and (`--expect-latest N`) version; manifest hash equals the pointer's, bytes equal the committed `contracts/bucket/contract/vN.json`, immutable caching and CORS; every artifact's status, sha256, byte count, immutable caching and CORS; the regional S3 URL answers 403; `contract/v999999.json` answers 403 or 404; the CDN root is never a `ListBucketResult`. `--version N` skips the pointer. Output has statuses, sizes and hashes only.
- **moto support.** moto 5.2.3 honours both `IfNoneMatch` and `IfMatch` on `put_object`, so every conditional path is tested end to end against moto; botocore's Stubber was not needed.

## Task Commits

1. **Task 1 (tracer): committed bundle to S3 with immutable writes, verification, pointer last** - RED `cab1663` (test), GREEN `ef95caf` (feat). Tracer feedback gate (auto mode): the tracer tests and the `--dry-run` plan were re-run end to end after the commit and passed before Task 2.
2. **Task 2: publisher guards and --set-latest rollback** - `ff90d9c` (feat)
3. **Task 3: public live verifier** - `a82faea` (feat)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Verification

- `py -3.12 -m pytest scripts/tests/test_publish_contract.py scripts/tests/test_verify_contract_live.py -q`: 54 passed (30 publisher, 24 verifier)
- `py -3.12 -m pytest` (whole suite): 436 passed
- `py -3.12 scripts/check_contract.py --check --additive`: OK
- `grep -c IfNoneMatch scripts/publish_contract.py` prints 2; `grep -c create_invalidation` prints 0; `grep -cE "AKIA|X-Amz-Signature|generate_presigned_url"` prints 0
- `py -3.12 scripts/verify_contract_live.py --help` exits 0 and shows `--expect-latest` and `--version`

### Dry run against the real account (read-only, nothing written)

`py -3.12 scripts/publish_contract.py --version 1 --dry-run` exited 0 and printed: the plan (14 objects, then `contract/latest.json`), `tree: clean`, `budget gate: ok (reefradar-2477-ceiling-25, 3 notifications)`, 15 JSON lines (13 artifacts including 7 schema copies, `contract/v1.json`, the pointer; 245,760-byte `v1/embeddings.f32` first) each `would_create` because the live bucket is empty, and `[dry-run] no S3 write made`. The manifest hash is `c9d520ad...04bcb2` and the pointer is 155 bytes.

The verifier was also pointed at the real CDN once (public GETs only): `FAIL: pointer: HTTP 200 (status 403)`, the expected result before the 02-06 publish.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `verify_objects` leaked a raw botocore error for a missing artifact**
- **Found during:** Task 2 test run (`test_set_latest_refuses_when_an_artifact_is_missing_from_the_bucket`)
- **Issue:** A `NoSuchKey` during re-download propagated as an unhandled exception instead of a refusal.
- **Fix:** Converted to a `PublishError` naming the key and error code.
- **Commit:** `ff90d9c`

### Additions beyond the plan text

- **Read-only preflight (`inspect_bucket`).** The plan relies on the 412 path alone; the preflight finds conflicts (and a wrong Cache-Control on an identical existing object, or a pointer that is newer or unreadable) before anything is written, so a conflict cannot leave a half-published version. The 412 path remains and is tested separately.
- **`--set-latest` verifies every artifact**, not only `contract/vN.json`, so a rollback cannot point at a version with a missing file.
- **`--dry-run` inspects the real bucket and budget** (reads only) so it shows `would_create`/`exists_identical`/`conflict`.
- **Cache-Control is verified on re-download**, because an existing identical object published with other headers could not be repaired without overwriting.

### Plan wording adjusted

- **No separate RED commit for Task 2.** Its tests were written together with the guards (negative cases for every behaviour bullet; they fail when the guard is removed). Task 1 followed RED then GREEN. Task 3 likewise has a single commit.
- **Bundle check scope.** The plan says "any bundle that fails check_contract"; the publisher runs `check_manifest` for the version being published (artifacts, hashes, schemas, projection, stamp), not the whole-tree `check()`, which also needs fixtures and the parity corpus and runs in CI anyway.

**Total deviations:** 1 auto-fixed bug, 4 additions, 2 wording adjustments. No impact on the must-have truths.

## Authentication Gates

None. The `reefradar` profile was used only for read calls (S3 `GetObject` on an empty bucket and Budgets `Describe*`) in the dry run. No credential, token file or presigned URL was read or printed. No write was made to the production bucket and `--confirm` was never run against `reefradar-2477-contract`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model: T-02-04-01 (conditional writes, 412 byte comparison, tested), -02 (If-Match, forward-only, tested), -03 (pointer last after verification, tested), -04 (fixture/CRLF/check_contract/clean-tree refusals, tested), -05 (budget gate, tested) and -06 (profile only, JSON lines of key/bytes/sha256, acceptance grep) are mitigated.

## Issues Encountered

- The first multi-line Python patch via a shell heredoc failed on quoting; the edits were redone with the editor tools. No repository impact.
- The verifier stops after the pointer check when the pointer itself cannot be fetched, so the privacy checks (direct S3, missing version, root listing) do not run in that state. Acceptable: it is the "nothing published yet" state, and the privacy checks run in every real verification after 02-06.

## Next Phase Readiness

- 02-06 can publish for real: `py -3.12 scripts/publish_contract.py --version 1 --dry-run`, then `--confirm` from a clean committed tree (the budget gate is already satisfied), commit the resulting `contracts/PUBLISHED.json`, then `py -3.12 scripts/verify_contract_live.py --expect-latest 1`. Rollback is `--set-latest N --confirm`.
- After the live publish, the 02-03 guards start to apply to v1 (manifest sha256 frozen by PUBLISHED.json, schema copies frozen, `--additive` structural check).
- CONTRACT-01 and CONTRACT-04 are intentionally not marked complete here: they complete after the live publish and verification in later plans (phase verification marks them).

## Self-Check: PASSED

- Files present: scripts/publish_contract.py, scripts/verify_contract_live.py, scripts/tests/test_publish_contract.py, scripts/tests/test_verify_contract_live.py
- Commits present: cab1663, ef95caf, ff90d9c, a82faea
