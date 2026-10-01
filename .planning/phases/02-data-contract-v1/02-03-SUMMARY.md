---
phase: 02-data-contract-v1
plan: 03
subsystem: data-contract
tags: [pca, embeddings, float32, json-schema, fixtures, parity-corpus, additive-schema, ci]

requires:
  - phase: 02-data-contract-v1
    provides: schemas, deterministic v1 bundle, builder and checker from plan 02-01
provides:
  - contracts/bucket/v1/embeddings.f32 (48 x 1280 float32 little-endian, 245,760 bytes) and projection.json (2-D PCA, 33.0% of variance, mean and components published)
  - embedding_row and projection on every acoustic_reference Site (null on the 6 location_only sites); projection.schema.json; manifest artifacts.embeddings and artifacts.projection
  - Offline fixtures: v2 manifest with one flipped flag, latest-v1/latest-v2 pointers, 8 curated invalid cases, 483-entry schema parity corpus
  - check_contract.py --additive, PUBLISHED.json immutability guard, fixture placement rules, numeric projection verification
  - CI python job steps for the builder reproducibility check and check_contract.py --check --additive
  - contracts/README.md and contracts/CHANGELOG.md
affects: [02-04, 02-05, 02-06, 02-07, 02-08, 02-09]

actuals:
  tokens: 236000
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Published numbers are verified by recomputation with explicit tolerances (PCA components 1e-8, coordinates 2e-6), never by hashing recomputed output, so a different numpy major version cannot break CI"
    - "Binary artifacts are hashed as-is; the source object (reference/metadata_v6.json) is hash-pinned and only its embedding key is read"
    - "A schema parity corpus (valid instances, mechanical mutants, curated invalid cases) is generated deterministically and compared in CI so a second validator (Zod, plan 02-07) can be held to the same verdicts"
    - "Schema evolution is additive: structural check on property names and enum values against the schema copies bundled with each version, behavioural check that every committed bundle still validates"

key-files:
  created:
    - contracts/bucket/v1/embeddings.f32
    - contracts/bucket/v1/projection.json
    - contracts/schema/projection.schema.json
    - contracts/fixtures/bucket/contract/v2.json
    - contracts/fixtures/latest-v1.json
    - contracts/fixtures/latest-v2.json
    - contracts/fixtures/invalid/ (8 cases)
    - contracts/fixtures/parity-corpus.json
    - contracts/README.md
    - contracts/CHANGELOG.md
    - scripts/tests/test_contract_projection.py
    - scripts/tests/test_contract_fixtures.py
  modified:
    - scripts/contract_lib.py
    - scripts/build_contract.py
    - scripts/check_contract.py
    - contracts/schema/site.schema.json
    - contracts/schema/contract-manifest.schema.json
    - contracts/bucket/contract/v1.json
    - contracts/bucket/v1/sites.json
    - contracts/bucket/v1/schema/*.schema.json
    - .github/workflows/ci.yml
    - scripts/check-citations.mjs

key-decisions:
  - "projection.json and embeddings.f32 are reused (not recomputed) unless --reference-metadata / --recompute-projection is passed, so CI rebuilds need no AWS access and no numpy-version-dependent bytes"
  - "Once a version is listed in contracts/PUBLISHED.json its bundled schema copies are frozen: the copy-equals-source check and the builder's rebuild comparison are skipped for it, and immutability is enforced by manifest sha256 plus the structural --additive check. Without this, the first additive schema change after publishing would break CI"
  - "The additive structural check compares property names and (owning property, enum value) pairs rather than JSON pointers, so inserting an allOf entry does not cause false failures"
  - "build_contract.py --fixtures writes only the fixtures (never touches a possibly published bundle); the invalid cases are generated from committed valid instances by the builder so they stay in step with the schemas"
  - "The parity corpus includes mutants of the latest bucket manifest and the base pointer as well as of one site per dataset x reference_role, the model, preprocessing spec, stamp and a truncated projection copy"

patterns-established:
  - "check_contract.py is the single gate: --check (bundle, fixtures, corpus, immutability) and --additive (schema growth) run on every push"

requirements-completed: []

coverage:
  - id: D1
    description: "48 real reference embeddings published as float32 with an honest, reproducible 2-D PCA projection (explained variance 0.1831 and 0.1468, 33.0% shown, mean and components included, note that plane distances are not embedding distances)"
    requirement: "CONTRACT-02"
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_projection.py#test_projection_matches_a_recomputation_from_the_published_rows"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_contract_projection.py#test_projection_states_how_little_variance_the_plane_shows"
        status: pass
    human_judgment: false
  - id: D2
    description: "Builder aborts on a different metadata sha256, a wrong embedding length or an embedded-id set that differs from the acoustic_reference sites"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_projection.py#test_builder_aborts_when_the_metadata_sha256_differs"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fixture v2 differs from v1 in exactly contract_version, fixture and coverage.has_diel; pointers hash their manifests; fixtures live only under contracts/fixtures"
    requirement: "CONTRACT-03"
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_fixtures.py#test_fixture_v2_differs_from_v1_in_exactly_three_paths"
        status: pass
    human_judgment: false
  - id: D4
    description: "Complete offline fixture set (invalid cases, parity corpus) for UI work with no ingestion dependency"
    requirement: "CONTRACT-05"
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_fixtures.py#test_every_corpus_verdict_matches_the_python_validator"
        status: pass
    human_judgment: false
  - id: D5
    description: "CI blocks drift, a non-additive schema change and an edit to a published version"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_fixtures.py#test_a_different_published_sha256_fails"
        status: pass
      - kind: command
        ref: "py -3.12 scripts/check_contract.py --check --additive"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-10-01
status: complete
---

# Phase 2 Plan 03: Reference Embeddings, Projection and Offline Fixtures Summary

**Contract v1 now carries the 48 real SurfPerch reference embeddings as a 245,760-byte float32 file and an honest 2-D PCA projection (explained variance 0.1831 and 0.1468, so the plane shows only 33.0% of the variance, with the mean and components published), plus a complete offline fixture set (flipped-flag v2 manifest, pointers, curated invalid cases and a 483-entry schema parity corpus) guarded in CI against drift, non-additive schema changes and edits to published versions.**

## Performance

- **Duration:** about 45 min (read-only S3 pull, TDD tracer, fixtures and guards, one full-suite fix cycle)
- **Tasks:** 2 (one tracer, one auto)
- **Commits:** 3 task commits
- **Files:** 31 changed outside .planning, 8,197 insertions, 46 deletions (most of the volume is generated data: the parity corpus and projection.json)

## Accomplishments

- **Embeddings.** One read-only `GET` of `reference/metadata_v6.json` to the session scratchpad (never into the repo). Its sha256 matched the pinned `5adc487d...ca2e3` before use. Only each site's `embedding` key was read; its statuses, DOIs and citations were ignored. The 48 sites carrying a 1280-value embedding are exactly the 48 `acoustic_reference` sites. Rows are sorted by `site_id` and packed little-endian float32: `embeddings.f32` is 245,760 bytes.
- **Projection (CONTRACT-02).** Mean-centred PCA from the published float32 rows (cast to float64, `numpy.linalg.svd`, sign rule "largest-magnitude loading positive"). **Explained variance ratio 0.18310361 and 0.14682953, cumulative 0.32993314 (33.0%).** `projection.json` publishes `mean` (1280), `components` (2 x 1280), `explained_variance`, `explained_variance_ratio`, `coordinates` for all 48 sites and a plain-language `note`: "...This plane shows 33.0% of the variance in the embeddings; the rest is not visible here, so plane distances are not embedding distances and must not be read as acoustic similarity...". The checker enforces that the note states the recomputed percentage and that sentence.
- **Numpy independence verified.** The same recomputation under numpy 1.26.4 (CI and the local user-site install) and numpy 2.5.3 (system install, run with `-s`) agrees with the committed file to 5e-10 on mean and components, 4e-9 on the ratios and 5e-7 on the coordinates (all rounding), well inside the checked tolerances (1e-8, 1e-6, 2e-6).
- **Sites and manifest.** Every acoustic reference site has an integer `embedding_row` and `projection {x, y}` equal to `projection.json`; the six location-only sites carry null for both; `site.schema.json` enforces both directions with `if/then`. The manifest requires `artifacts.embeddings` (dtype float32-le, dim 1280, count 48, row_site_ids) and `artifacts.projection`, and records `sources.reference_metadata` with the pinned hash. `stamp.json`, `model_version.json` and `preprocessing_spec.json` are byte-identical to 02-01 (asserted by hash in a test).
- **Fixtures (CONTRACT-03, CONTRACT-05).** `contracts/fixtures/bucket/contract/v2.json` differs from the v1 manifest in exactly `contract_version`, `fixture` and `coverage.has_diel` and reuses the `v1/` artifact uris (no second copy of the data); `latest-v1.json` and `latest-v2.json` hash their manifests; eight curated invalid cases each break one invariant; `parity-corpus.json` records the Python verdict for 483 instances (14 valid, 469 invalid) across all seven schemas.
- **Guards.** `check_contract.py --check` now also verifies fixture placement and pointers, the invalid cases, corpus freshness, `PUBLISHED.json` immutability ("published version N modified") and the numeric projection; `--additive` runs behavioural and structural checks. CI's python job runs `build_contract.py --version 1 --check` and `check_contract.py --check --additive` after pytest.

## Task Commits

1. **Task 1 (tracer): S3 reference embeddings to float32 artifact to honest PCA projection** - RED `28bb454` (test), GREEN `298e92c` (feat). Tracer feedback gate (auto mode): the tracer `<verify>` chain was re-run end to end after the commit and passed, then the plan expanded to Task 2.
2. **Task 2: Offline fixtures, parity corpus, additive and immutability checks, CI and docs** - `f5eea45` (feat)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Verification

- `py -3.12 scripts/build_contract.py --version 1 --check`: OK (14 bundle files and 11 fixture files match a fresh build)
- `py -3.12 scripts/check_contract.py --check --additive`: OK
- `py -3.12 -m pytest` (whole suite): 362 passed, 1 deselected (live)
- `npm test` in `dashboard-next` (vitest): 71 passed
- `node scripts/check-citations.mjs --scope docs`: OK (250 files); `--scope all`: OK (360 files); `--check-md`: OK
- Acceptance checks: `embeddings.f32` size 245760; projection prints `48 0.33`; `grep -c "check_contract.py --check --additive" ci.yml` prints 1; `grep -c "'.f32'" check-citations.mjs` prints 1; `ls contracts/bucket/contract/` lists only `v1.json`; every `git status --porcelain` path was under `contracts/`, `scripts/` or `.github/`; no `metadata_v6.json` or banned citation text in the repository.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `.f32` added to check-citations BINARY_EXTENSIONS in Task 1, not Task 2**
- **Found during:** Task 1 staging
- **Issue:** The plan adds the extension in Task 2, but the Task 1 commit already tracks `embeddings.f32`; without the change `check-citations --scope docs` would scan the binary as text and Task 1's commit would not be CI-green.
- **Fix:** Made the one-line change in the Task 1 commit (`298e92c`).

**2. [Rule 1 - Bug in plan design] Schema copies must stop being compared with the source once a version is published**
- **Found during:** Task 2, writing the additive tests
- **Issue:** The existing check requires each bundled schema copy to equal its `contracts/schema` source, and `build_contract.py --check` rebuilds copies from the source. After a version is published, any additive schema change (the whole point of the additive policy) would make both fail, breaking CI for no real defect.
- **Fix:** For a version listed in `contracts/PUBLISHED.json`, `check_contract.py --check` skips the copy-equals-source comparison, `--additive` never requires it, and `build_contract.py --check` reports "published; skipping the rebuild comparison" (immutability is then guarded by the manifest sha256 and the structural additive check). Two tests cover published and unpublished behaviour.
- **Commit:** `f5eea45`

**3. [Rule 1 - Bug] Checker crashed instead of reporting a missing artifact**
- **Found during:** full-suite run (an earlier plan's `test_a_missing_artifact_file_fails` failed)
- **Issue:** Corpus regeneration read artifacts that a tampered copy no longer had and raised `FileNotFoundError` before the checker printed its normal problem lines.
- **Fix:** `corpus_problems` reports a regeneration failure as one problem line, and validators are cached per schema directory (the whole suite dropped from 3.5 min to 1.6 min).
- **Commit:** `f5eea45`

### Plan wording adjusted

- **No separate RED commit for Task 2.** The checker and fixtures were written before their tests, so Task 2 has a single feat commit; the tests (including negative cases for every guard) were written against the behaviour list and fail when the behaviour is broken. Task 1 followed RED then GREEN.
- **Corpus size.** The plan's mutant recipe over one site per dataset x role plus the manifest and pointer yields 483 entries (about 665 KB, one entry per line). It is generated, deterministic and compared in CI.
- **Parity corpus mutants also cover the latest bucket manifest and base pointer**, not only sites, models and specs, because the Zod mirror (02-07) must parse manifests and pointers too.

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 3) plus 3 wording adjustments. No impact on delivered state; every must-have truth holds.

## Authentication Gates

None. The `reefradar` profile read the one metadata object; no credential, token file or presigned URL was read or printed. No AWS write was made.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model: T-02-03-01 (hash-pinned source, id-set equality), -02 (PUBLISHED guard, tested), -03 (fixture placement rules, tested), -04 (metadata kept in the scratchpad only; citations scans pass) and -05 (`--additive` in CI) are all mitigated.

## Issues Encountered

- The first heredoc-based edit scripts failed on quoting; the edits were redone through files. No repository impact.
- The local machine's user-site numpy 1.26.4 shadows the system numpy 2.5.3 (see 02-01); it was left alone. All tests pass under 1.26.4 (what CI uses) and the PCA equivalence under 2.5.3 was checked separately.

## Next Phase Readiness

- 02-04 (publisher) can read `contracts/bucket` as-is and must write `contracts/PUBLISHED.json` as `{ "<version>": {"manifest_sha256": ..., ...} }`; the guard also accepts a bare hash string. It must refuse any manifest with `"fixture": true`.
- 02-07 (Zod mirror) should treat `sites.json` as `{schema_version, sites}`, use loose objects, and assert `safeParse(instance).success === (verdict === "valid")` for every entry of `contracts/fixtures/parity-corpus.json`; the test fetch can serve `contracts/bucket/**` and `contracts/fixtures/**` from disk.
- 02-08 (flip and pin tests) can switch between `contracts/fixtures/latest-v1.json` and `latest-v2.json`; v2 differs only by `coverage.has_diel`.
- CONTRACT-01, -02, -03 and -05 are intentionally not marked complete: they complete after the live publish and app wiring in later plans (phase verification marks them).

## Self-Check: PASSED

- Files present: contracts/bucket/v1/embeddings.f32, projection.json, contracts/schema/projection.schema.json, contracts/fixtures/{bucket/contract/v2.json, latest-v1.json, latest-v2.json, parity-corpus.json}, 8 files under contracts/fixtures/invalid/, contracts/README.md, contracts/CHANGELOG.md, scripts/tests/test_contract_projection.py, scripts/tests/test_contract_fixtures.py
- Commits present: 28bb454, 298e92c, f5eea45
