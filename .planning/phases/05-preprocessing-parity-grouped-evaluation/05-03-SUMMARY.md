---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 03
subsystem: testing
tags: [contract, fixtures, vitest, playwright, pytest, json-schema]
status: complete

requires:
  - phase: 02-data-contract-v1
    provides: published contract v1, flipped-flag fixture mechanism, check_contract and build_contract
provides:
  - flipped-flag test fixture renumbered from contract v2 to sentinel version 99, one constant per language
  - fixtures derived from committed v1 bytes (no rebuild of v1 from preprocessor or classifier source)
  - collision guard so a fixture version can never equal a real bucket manifest version
affects: [05-14 publish contract v2, 05-16 published manifest hashes, 05-07, 05-09]

actuals:
  tokens: 14400
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Test-only fixture version is a sentinel constant (Python and TypeScript mirror), never a real contract version"
    - "Fixtures derive from frozen committed bytes, not from a rebuild"

key-files:
  created:
    - contracts/fixtures/bucket/contract/v99.json
    - contracts/fixtures/latest-v99.json
    - dashboard-next/tests/shared/contract-fixture-version.ts
  modified:
    - scripts/contract_lib.py
    - scripts/build_contract.py
    - scripts/check_contract.py
    - scripts/tests/test_contract_fixtures.py
    - contracts/fixtures/parity-corpus.json
    - contracts/README.md
    - contracts/CHANGELOG.md
    - dashboard-next/tests/unit/support/contract-fetch.ts
    - dashboard-next/tests/unit/contract-client.test.ts
    - dashboard-next/tests/unit/contract-flip.test.tsx
    - dashboard-next/tests/unit/contract-pin.test.tsx
    - dashboard-next/tests/unit/contract-published.test.ts
    - dashboard-next/tests/unit/contract-schema-parity.test.ts
    - dashboard-next/tests/unit/results-components.test.tsx
    - dashboard-next/tests/e2e/support/mock-api.ts
    - dashboard-next/tests/e2e/analysis-flow.spec.ts
    - dashboard-next/tests/e2e/contract-flip.spec.ts
    - dashboard-next/tests/e2e/contract-pin.spec.ts
  removed:
    - contracts/fixtures/latest-v2.json
    - contracts/fixtures/bucket/contract/v2.json (renamed to v99.json)

key-decisions:
  - "FIXTURE_CONTRACT_VERSION = 99 and FIXTURE_BASE_VERSION = 1 live in scripts/contract_lib.py; TypeScript mirror in dashboard-next/tests/shared/contract-fixture-version.ts"
  - "build_contract --fixtures derives only from committed bucket/contract/v1.json, bucket/v1/sites.json and bucket/v1/stamp.json and never calls build_bundle"
  - "build_contract --check on a published version still skips the bundle rebuild but now compares every fixture file to the derivation (the old comparison was vacuous)"

requirements-completed: [ML-03, ML-08]

coverage:
  - id: D1
    description: "Fixture manifest is contract version 99 held in one Python and one TypeScript constant; no v2 fixture remains"
    requirement: ML-08
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_fixtures.py#test_fixture_version_is_the_sentinel_and_no_v2_fixture_remains"
        status: pass
  - id: D2
    description: "Fixtures derive from committed v1 bytes without rebuilding v1"
    requirement: ML-08
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_fixtures.py#test_fixtures_derive_from_committed_v1_without_rebuilding"
        status: pass
  - id: D3
    description: "check_contract reports a fixture whose version equals a real bucket manifest version, or is not the sentinel"
    requirement: ML-08
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_fixtures.py#test_fixture_version_never_collides_with_a_bucket_version"
        status: pass
  - id: D4
    description: "Unit and e2e tests flip latest between 1 and the fixture version and stay green"
    requirement: ML-03
    verification:
      - kind: e2e
        ref: "playwright --project=e2e --repeat-each=3 contract-flip, contract-pin, analysis-flow (45 passed)"
        status: pass
      - kind: unit
        ref: "npm test (91 files, 1589 tests)"
        status: pass
---

# Phase 5 Plan 03: Fixture renumber to sentinel version 99 Summary

**The Phase 2 flipped-flag test fixture moved from contract v2 to a test-only sentinel version 99 held in one constant per language, with fixtures derived from the committed v1 bytes and a collision guard, so the real contract v2 (plan 05-14) can be built and published.**

## Accomplishments

- Python side (tracer, commit 3eca884): `FIXTURE_CONTRACT_VERSION = 99` and `FIXTURE_BASE_VERSION = 1` in `scripts/contract_lib.py`; `build_fixture_files` writes `fixtures/bucket/contract/v99.json`, `latest-v1.json`, `latest-v99.json` and the invalid cases; new `committed_bundle_files` reads the frozen v1 bytes; `--fixtures` writes fixture files only and never calls `build_bundle`; `--check` on a published version compares every fixture file to a fresh derivation and returns 1 on any difference. `check_contract.py` `fixture_problems` reports "collides" when a fixture version equals a real bucket manifest version and a problem when it is not the sentinel. Fixtures and parity corpus regenerated; the v2 fixture files are gone.
- Unit tests (commit bdb667a): new `tests/shared/contract-fixture-version.ts` (no imports, shared by Vitest and Playwright support code); the fetch harness serves the fixture manifest from `FIXTURE_MANIFEST_PATH`; client, flip, pin, published, schema-parity and results tests use the constant; a new test asserts the fixture pointer names version 99 and 99 is not a key of `PUBLISHED_MANIFEST_SHA256`.
- E2E and docs (commit ac9615c): `mock-api.ts` and the three specs use the constant; `contracts/README.md` and `CHANGELOG.md` describe the test-only version 99 and why.

## Verification

- `py -3.12 -m pytest`: passes (see Deviations for one environment-dependent line-ending flake).
- `py -3.12 scripts/build_contract.py --version 1 --check`, `check_contract.py --check --additive`, `check_contract.py --published-history`: all exit 0.
- `npm run lint` (0 errors, 20 pre-existing warnings), `npm run typecheck`, `npm test` (91 files, 1589 tests): pass.
- Playwright (`--project=e2e --repeat-each=3`, analysis-flow, contract-flip, contract-pin, untracked local config on port 3221, removed afterwards): 45 passed.
- `node scripts/check-citations.mjs --scope docs`: OK.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two unit tests outside the plan's file list also used the fixture as version 2**
- **Found during:** Task 2
- **Issue:** `tests/unit/contract-schema-parity.test.ts` (`useCoverage(2)`) and `tests/unit/results-components.test.tsx` (`installContractFetch({ latest: 2 })`) depended on the removed v2 fixture; the first is named in the plan's own verify command.
- **Fix:** both now use `FIXTURE_CONTRACT_VERSION`.
- **Commit:** bdb667a

**2. [Environment, no code change] Line-ending flake in `test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent`**
- On the first full pytest run in this Windows worktree the checked-out `data/audio-manifest.json` was CRLF while the generator writes LF, so the test failed once and the run rewrote that file and two `dashboard-next/tests/fixtures/api/*.json` files to LF. A second full run passed. The three rewritten files were restored with `git checkout -- <file>`; nothing from that run was committed. Pre-existing, unrelated to this plan, not fixed (scope boundary).

**3. Acceptance grep note**
- The plan's `grep -c '"fixture-manifest/v99"'` expects a bare quoted case name, but corpus cases are named with a `valid:` prefix, so the literal quoted string never matches. The corpus does contain `valid:fixture-manifest/v99` and `valid:pointer/latest-v99`; a string-contains check passes (count 1 each).

### Other

- `FIXTURE_MANIFEST_PATH`'s directory component is derived with `path.basename` in the harness; the doc comment of `contract-fetch.ts` was updated accordingly.

## Known Stubs

None.

## Threat Flags

None. Mitigations T-05-03-01 (collision check), T-05-03-02 (fixtures derive from committed v1 bytes, never write a bucket file) and T-05-03-03 (`--check` now compares fixtures on a published version) are implemented and tested.

## Self-Check: PASSED

- contracts/fixtures/bucket/contract/v99.json, contracts/fixtures/latest-v99.json, dashboard-next/tests/shared/contract-fixture-version.ts: present
- contracts/fixtures/bucket/contract/v2.json and contracts/fixtures/latest-v2.json: absent
- commits 3eca884, bdb667a, ac9615c: present on the branch
