---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 16
subsystem: contract-publish
tags: [contract-v2, publish, immutable, model-archive, live-verification, rollback]
status: complete

requires:
  - phase: 05-12
    provides: "successor model interim-real-only-2026.10.1 and publish_model.py --archive-version"
  - phase: 05-14
    provides: "contract v2 bundle on disk (manifest sha256 70c3c500...787d)"
  - phase: 05-15
    provides: "classifier package wired to v2; v2 live verifiers"
provides:
  - "contract v2 published immutably on the CDN; contract/latest.json names version 2"
  - "successor weights and config archived at s3://reefradar-2477-embeddings/models/archive/interim-real-only-2026.10.1/"
  - "contracts/PUBLISHED.json and published.ts record v2's manifest sha256"
  - "DEPLOY-LOG 'Contract v2 publish (2026-10-16)' section with rollback"
affects: [05-17]

key-files:
  modified:
    - contracts/PUBLISHED.json
    - dashboard-next/src/features/contract/published.ts
    - docs/deploy/DEPLOY-LOG.md

key-decisions:
  - "Task 1 checkpoint: owner chose 'publish' (2026-10-16) after reviewing the served model's LOSO result (balanced accuracy 0.44, 95% CI 0.30-0.58, 4 evaluable sites), the original model's (0.06, 0-0.18), the drift probe (mean cosine 0.207), the OOD threshold (0.352), the spec gaps and the dry-run plan. Basis: 05-CONTEXT 'Publish contract v2' (locked) and the standing owner approvals (2026-10-01)."
  - "publish_model.py --dry-run does not print the live models/ hashes, so the live model_config.json and reef_classifier_weights.npz were downloaded and hashed before and after the archive write; both were unchanged."

requirements-completed: [ML-03, ML-06, ML-08]

completed: 2026-10-16
actuals:
  tasks: 3
  commits: 3
---

# 05-16 Summary: contract v2 published

Contract v2 is live and `latest` points at it. `verify_contract_live.py --expect-latest 2` exited 0 with 95 PASS lines. Its 3 WARN lines are all the known report-only CORS preflight 403 that the owner accepted on 2026-10-02.

## Sequence (all exit 0)

1. `check_contract.py --check --additive` and `build_contract.py --version 2 --check` passed (16 files and 11 fixtures match a fresh build).
2. The budget gate passed: `reefradar-2477-ceiling-25`, 3 notifications.
3. `verify_contract_live.py --expect-latest 1` confirmed the public state before the publish.
4. The successor model was archived (dry-run, then confirm). Both objects were created and verified:
   - `models/archive/interim-real-only-2026.10.1/model_config.json`: 3066 bytes, sha256 `348b20a2b41b323f354fe4094087b2d81fa98585ac292fe94aee44338f52ffbd`
   - `models/archive/interim-real-only-2026.10.1/reef_classifier_weights.npz`: 1379754 bytes, sha256 `cdc169fab304d8c0f20e8f88eb2bbb6d520813c2ea1de64ed5d072f3a934ce80`
   - Both match `config_sha256` and `weights_sha256` in `v2/model_version.json`.
   - The live `models/` keys were unchanged before and after (`9781d1ab...dbf658` and `ab9e3830...dedcf4`).
5. The publish dry-run reported 3 `exists_identical` (the v1 sites, embeddings and projection), 16 `would_create` and no conflict.
6. `publish_contract.py --version 2 --confirm` created 16 v2 objects plus `contract/v2.json` (8811 bytes, sha256 `70c3c500544a881fd389a9971c53e16860337f19c9e88810cf6aefd0d96f787d`), then flipped `contract/latest.json` (155 bytes, sha256 `4e1d2273...08dd0`). It published at 2026-10-16T18:47:08Z from git sha `60bdb1a`.
7. `verify_contract_live.py --expect-latest 2` passed.
8. The rollback rehearsal `publish_contract.py --set-latest 1 --dry-run` exited 0. It verified 14 v1 objects, reported `would_flip` and made no write.

DEPLOY-LOG lists every key with its bytes, sha256 and status.

## Verification

- `contracts/PUBLISHED.json` keys are `['1', '2']`.
- `check_contract.py --published-history` and `--check --additive` exit 0.
- `contract-published.test.ts` and `contract-schema-parity.test.ts` pass (127 tests). The full `npm test` run passes 1658 tests in 91 files.
- The DEPLOY-LOG credential-pattern grep finds 0 matches.

## Rollback

```
py -3.12 scripts/publish_contract.py --set-latest 1 --confirm
```

The command above moves the pointer back to v1. Published objects are never deleted; a bad v2 is superseded by publishing v3.
