---
phase: 02-data-contract-v1
plan: 06
subsystem: data-contract
tags: [publish, s3, cloudfront, immutability, rollback, budget-gate, live-verification]

requires:
  - phase: 02-data-contract-v1
    provides: committed v1 bundle and immutability guard (02-01, 02-03); contract bucket, CloudFront distribution and budget alarm (02-02); publisher and live verifier (02-04)
provides:
  - contract v1 live at s3://reefradar-2477-contract, served by CloudFront (d7dr1fzple2sg.cloudfront.net), byte-identical to contracts/bucket
  - contracts/PUBLISHED.json recording version 1 (turns on the CI immutability guard)
  - DEPLOY-LOG "Contract v1 publish" entry with evidence and rehearsed rollback
affects: [02-07, 02-11, 02-12]

actuals:
  tokens: 2500
  tasks: 3
  commits: 3

key-files:
  created:
    - contracts/PUBLISHED.json
  modified:
    - docs/deploy/DEPLOY-LOG.md

key-decisions:
  - "Task 1 (one-way publish) resolved as 'publish' under the owner's standing approval (DRIVING-QUESTIONS.md, 2026-10-01) and the 02-CONTEXT decision to freeze today's data as v1"

requirements-completed: []

coverage:
  - id: D1
    description: "Contract v1 (14 objects, pointer last) published and verified through CloudFront: pointer max-age=60 + CORS *, every object one-year immutable, hashes equal the manifest and the committed manifest, direct S3 403, missing version 403, CDN root not a listing"
    requirement: "CONTRACT-01"
    verification:
      - kind: command
        ref: "py -3.12 scripts/verify_contract_live.py --expect-latest 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "contracts/PUBLISHED.json records v1 and the CI immutability guard accepts the committed state"
    requirement: "CONTRACT-02"
    verification:
      - kind: command
        ref: "py -3.12 scripts/check_contract.py --check --additive"
        status: pass
    human_judgment: false
  - id: D3
    description: "Rollback path rehearsed as a dry run and documented with exact commands"
    requirement: "CONTRACT-03"
    verification:
      - kind: command
        ref: "py -3.12 scripts/publish_contract.py --set-latest 1 --dry-run"
        status: pass
    human_judgment: false
status: complete
---

# Phase 2 Plan 06: Publish Contract v1 Summary

Contract v1 (14 immutable objects plus the `contract/latest.json` pointer) is now published to the private contract bucket, served through CloudFront, verified publicly against the committed bytes, and recorded in `contracts/PUBLISHED.json`.

**Started:** 2026-10-01T23:55Z. **Published:** 2026-10-02T00:58:50Z. **Tasks:** 3 (1 decision, 1 tracer, 1 auto). **Files:** 2.

## Task 1: Decision (checkpoint:decision, one-way)

Resolved as "publish" under the owner's standing approval for production deployment decisions and S3 object changes within the 25 USD/month ceiling (`.planning/research/DRIVING-QUESTIONS.md`, "Standing owner approvals (2026-10-01)"), plus the Phase 2 decision in `02-CONTEXT.md` to freeze today's post-Phase-1 truth as v1. Pre-checks run and recorded before publishing:

- `git status --porcelain -- contracts/`: empty. HEAD `a4b2f81954a031e41f0f3c202d45f33ac56bd895` on `redesign/v2-discovery`.
- `check_contract.py --check --additive`: exit 0.
- `setup_contract_infra.py --step budget --verify`: exit 0 (budget `reefradar-2477-ceiling-25`, 25 USD, 3 notifications, legacy budget absent).
- `publish_contract.py --version 1 --dry-run`: exit 0, tree clean, budget gate ok, 14 objects then the pointer, all `would_create`, no S3 write. Keys, bytes and sha256 values were identical to the real publish (listed in `docs/deploy/DEPLOY-LOG.md`).

## Task 2: Tracer (publish, verify, record)

- Precondition `setup_contract_infra.py --step all --verify`: exit 0 (budget and storage checks ok; direct S3 403, CloudFront missing key 403, latest-not-a-listing 403, root not a listing 403).
- `publish_contract.py --version 1 --confirm`: 14 objects `created`, `contract/latest.json` `pointer_created` last, "published contract version 1; PUBLISHED.json up to date".
- Manifest `contract/v1.json`: 7583 bytes, sha256 `c9d520addac040f4e7f2c74dce2678e4b3365779f176f8f90a004bf04db7bcb2`. Pointer: 155 bytes, sha256 `9ec73e4a2bab2746d9f0261f9dc162fbda28481ba1c1555899674054ae559b65`.
- `verify_contract_live.py --expect-latest 1`: exit 0, "OK: contract verified live". Pointer HTTP 200, `Cache-Control: public, max-age=60`, `Access-Control-Allow-Origin: *`, names version 1. Manifest served bytes equal the committed file and the pointer's `manifest_sha256`. All 13 artifacts HTTP 200 with sha256 equal to the manifest, `public, max-age=31536000, immutable`, CORS `*`. Direct S3 403, nonexistent version 403, CDN root 403 (not a listing).
- `contracts/PUBLISHED.json` keys are `['1']` (git sha a4b2f81, bucket `reefradar-2477-contract`, published_at 2026-10-02T00:58:50Z). `check_contract.py --check --additive` exits 0 with it committed; `git status --porcelain -- contracts/` is empty after the commit.

## Task 3: Rollback rehearsal and log

`publish_contract.py --set-latest 1 --dry-run`: exit 0, verified 14 published objects against `PUBLISHED.json`, budget gate ok, `pointer_unchanged`, no S3 write. `docs/deploy/DEPLOY-LOG.md` gained a "Contract v1 publish" section (date, approving decision, git sha, CloudFront domain, every key with bytes and sha256, verification results, Rollback subsection). Acceptance greps: "Contract v1 publish" count 1; credential-pattern grep count 0.

## Commits

- `d776cf6`: feat(02-06): record contract v1 as published (contracts/PUBLISHED.json)
- `070e0a6`: docs(02-06): log contract v1 publish with verification evidence and rollback

## Deviations from Plan

None in the plan's scope. Execution notes:

- The first attempt was stopped by the permission classifier on `py -3.12 scripts/setup_contract_infra.py --step all --verify` (a read-only verify). The owner added allow rules; the same command then ran, once as a standalone call (a compound `git status && ...` form was still denied by the classifier and was not retried in that form). No command was routed around a denial.
- No published object was deleted or edited.

## Authentication Gates

None. The permission denial above was resolved by an owner-added allow rule.

## Known Stubs

None.

## Threat Flags

None. Only keys, sizes, hashes and status codes were logged; no signed URLs or credentials.

## Self-Check: PASSED

- `contracts/PUBLISHED.json` and `docs/deploy/DEPLOY-LOG.md` exist; commits `d776cf6` and `070e0a6` exist.
- Re-run of the plan verification: `verify_contract_live.py --expect-latest 1` exit 0 and `check_contract.py --check --additive` exit 0.
- Requirement IDs CONTRACT-01/02/03 intentionally not marked complete (phase verification does that).
