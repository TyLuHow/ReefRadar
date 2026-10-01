---
phase: 02-data-contract-v1
plan: 01
subsystem: data-contract
tags: [json-schema, jsonschema, contract, provenance, sha256, deterministic-build]

requires:
  - phase: 01-truth-and-hygiene
    provides: shared provenance overlay (site_provenance), citations.json, data/snapshots/api-sites.json, the interim real-only model and its model card
provides:
  - JSON Schemas (draft 2020-12) for Site, ContractManifest, ContractPointer, ModelVersion, PreprocessingSpec and the AnalysisResult version stamp
  - Deterministic contract v1 bundle under contracts/bucket (54 Site records with provenance, manifest with coverage flags, model, preprocessing spec, stamp, schema copies)
  - scripts/contract_lib.py, scripts/build_contract.py, scripts/check_contract.py
  - Frozen legacy coordinate table (contracts/fixtures/legacy-site-coordinates.json) for adapter parity tests
affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-09]

actuals:
  tokens: 43000
  tasks: 3
  commits: 5

tech-stack:
  added: [jsonschema==4.26.0 (dev/test only)]
  patterns:
    - "Canonical JSON (sorted keys, indent 2, LF, trailing newline) so the same inputs always give the same bytes and hashes"
    - "Hashes over LF-normalised text inputs; binary inputs never normalised; .gitattributes pins eol=lf for contract JSON"
    - "Counts computed from records, never copied from headers; nulls published with the source's stated reason"
    - "Schemas forward-compatible: no additionalProperties false, no format keyword, urn: $ids, pattern regexes"

key-files:
  created:
    - contracts/schema/{site,contract-manifest,contract-pointer,model-version,preprocessing-spec,analysis-result}.schema.json
    - contracts/bucket/contract/v1.json
    - contracts/bucket/v1/{sites,model_version,preprocessing_spec,stamp}.json
    - contracts/bucket/v1/schema/*.schema.json
    - contracts/fixtures/legacy-site-coordinates.json
    - scripts/contract_lib.py
    - scripts/build_contract.py
    - scripts/check_contract.py
    - scripts/tests/test_contract_sites.py
    - scripts/tests/test_contract_model.py
    - scripts/tests/test_contract_bundle.py
    - .gitattributes
  modified:
    - requirements-dev.txt

key-decisions:
  - "sites.json is an object {schema_version: 1, sites: [...]} (not a bare array) so later versions can add top-level keys additively"
  - "config_sha256 is over LF bytes (the git blob, reproducible on any checkout); the deployed config object has CRLF endings, so its hash is recorded separately as config_sha256_deployed"
  - "Manifest datasets are listed in provenance-source order (marrs, coralsoundexplorer, irma, sanctsound); datasets[].name is the provenance display name, datasets[].title the citation title"
  - "Schema sources in contracts/schema are stored in canonical form (sorted keys) so the bundle copies are byte-for-byte and `build_contract.py --format-schemas` re-canonicalises after edits"
  - "Version identifiers fixed once: dataset_version reefradar-reference-2026.10.0, preprocessing_spec_version preproc-2026.10.0-as-deployed, model_version read from the live config (interim-real-only)"

patterns-established:
  - "check_contract.py --check is the single integrity gate for every bundle; later plans extend it with --additive and projection checks"
  - "Tests assert positive equality with citations.json / the API fixture instead of writing DOI or label literals"

requirements-completed: [CONTRACT-01, CONTRACT-02, CONTRACT-04]

coverage:
  - id: D1
    description: "54 Site records with dataset, DOI (null only for SanctSound with the citation's reason), licence, label and status basis, schema-validated"
    requirement: "CONTRACT-02"
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_sites.py"
        status: pass
    human_judgment: false
  - id: D2
    description: "Manifest with coverage flags (all false), 48 acoustic references counted from data, absent aggregates and detections"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_sites.py#test_manifest_coverage_and_artifacts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Honest ModelVersion (no accuracy), as-deployed PreprocessingSpec with open known gaps, and the version stamp"
    requirement: "CONTRACT-04"
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_model.py"
        status: pass
    human_judgment: false
  - id: D4
    description: "Bundle integrity checker rejecting byte, CRLF, fixture and path-traversal tampering"
    requirement: "CONTRACT-01"
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_bundle.py"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-10-01
status: complete
---

# Phase 2 Plan 01: Contract Schemas and v1 Bundle Summary

**Deterministic, schema-validated contract v1 on disk: six JSON Schemas plus 54 provenance-complete Site records, a coverage-flagged manifest, an honest no-accuracy ModelVersion, an as-deployed PreprocessingSpec with open train/serve gaps, and a version stamp, all hash-checked by one command.**

## Performance

- **Duration:** about 11 min of execution (after reading plan and research)
- **Started:** 2026-10-01T22:06:21Z
- **Completed:** 2026-10-01T22:17Z
- **Tasks:** 3 (one checkpoint satisfied by standing approval, one tracer, one auto)
- **Files created or modified:** 26 outside .planning

## Accomplishments

- `contracts/bucket/v1/sites.json`: 54 Site records in snapshot order, 48 `acoustic_reference` and 6 `location_only` counted from the data (the stale snapshot header value 44 is not used), every record validates and carries `synthetic: false`. DOIs and licences equal `citations.json`; DOI is null only for the four SanctSound sites, whose `doi_note` is the citation's own verification note. Sites with no label definition are `unknown` with a non-empty `status_basis`.
- `contracts/bucket/contract/v1.json`: contract_version 1, coverage `total_sites 54, sites_with_embeddings 48, countries 7`, all four `has_*` flags false, `aggregates_diel`, `aggregates_effort` and `detections` present as `{present: false}`, every artifact hash and byte count matching the committed bytes, datasets and source hashes recorded.
- `model_version.json` (interim-real-only, classes degraded/healthy/restored_early, real-only training of 100 rows from 5 sites, `evaluation: null` with the config's evaluation note verbatim, no accuracy figure) and `preprocessing_spec.json` (values parsed from `lambdas/preprocessor/handler.py`; F8a-F8d listed as open gaps owned by Phase 5), plus `stamp.json` (contract 1, dataset reefradar-reference-2026.10.0, model interim-real-only, spec preproc-2026.10.0-as-deployed).
- `scripts/check_contract.py --check` verifies manifest hashes and byte counts, LF-only canonical JSON, uri safety, per-artifact schemas, stamp vs manifest, and coverage vs recomputed counts; tests prove it fails on a one-byte change, CRLF, `"fixture": true` and a `..` uri.
- `scripts/build_contract.py --version 1 --check` proves a rebuild is byte-identical (frozen_at is reused from the committed manifest).

## Task Commits

1. **Task 1: Package legitimacy gate for jsonschema==4.26.0** - `c51e08a` (chore). Checkpoint resolved by standing approval (DRIVING-QUESTIONS.md 2026-10-01); evidence below.
2. **Task 2: Tracer, committed inputs to schema-validated v1 sites artifact and manifest** - RED `007f87c` (test), GREEN `6d63642` (feat). Tracer feedback gate (auto mode): `<verify>` re-run end to end after the commit, passed, expanded.
3. **Task 3: ModelVersion, PreprocessingSpec, stamp and bundle checker** - RED `7ee79b8` (test), GREEN `1a65576` (feat)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Package legitimacy evidence (Task 1)

Approval: standing approval (DRIVING-QUESTIONS.md 2026-10-01) covering all new test/dev packages.

- PyPI `jsonschema 4.26.0` exists (wheel and sdist uploaded 2026-01-07), licence MIT, `Source` and `Homepage` project URLs are github.com/python-jsonschema/jsonschema.
- Declared dependencies: attrs, jsonschema-specifications, referencing, rpds-py (the other entries are optional `format` extras and are not installed).
- `py -3.12 -m pip install --dry-run jsonschema==4.26.0` would install exactly: jsonschema 4.26.0, jsonschema-specifications 2025.9.1, referencing 0.37.0, rpds-py 2026.6.3 (attrs and typing-extensions already present). No unexpected packages.
- Dev/test only: recorded in `requirements-dev.txt`, never bundled into a Lambda.

## Decisions Made

See `key-decisions` above. The two that later plans must know: `sites.json` is a wrapped object (`{schema_version, sites}`), and `config_sha256` is the LF (git blob) hash while `config_sha256_deployed` is the CRLF hash of the object actually in the embeddings bucket.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in plan statement] Peak-normalisation wording in the preprocessing spec**
- **Found during:** Task 3 (reading `lambdas/preprocessor/handler.py` lines 95-108 before writing the spec)
- **Issue:** The plan (and research table) say there is "no peak normalisation for 16/32-bit PCM" and that only the 8-bit path peak-scales. The code does the opposite for two cases: a stereo or multi-channel file is averaged with `mean(axis=1)`, which yields float64, so it falls through to the final `else` branch and is divided by the peak absolute value; and a mono 8-bit file is held as int16, so it takes the int16 branch (`/32768`), not the peak branch.
- **Fix:** `amplitude_scaling` records what the code does: `mono_pcm16`, `mono_pcm32`, `mono_pcm8`, `multichannel`, `peak_normalised_mono_pcm16_pcm32: false`, `peak_normalised_multichannel: true`. Gap F8a states that live uploads are peak-normalised only when multi-channel. The plan's literal statement was not copied because it would have published an inaccurate record.
- **Files modified:** scripts/build_contract.py, scripts/tests/test_contract_model.py, contracts/bucket/v1/preprocessing_spec.json
- **Commit:** `1a65576`

**2. [Rule 2 - Missing critical functionality] Deployed config hash differs from the git blob hash**
- **Found during:** Task 3 (computing `config_sha256`)
- **Issue:** The working-tree `models/interim-real-only/model_config.json` has CRLF line endings on this machine (core.autocrlf=true); its raw sha256 `9781d1ab...` is what `docs/deploy/DEPLOY-LOG.md` records as the published (deployed) config, while the git blob (LF) hashes to `b38552d3...`. A single `config_sha256` would have been either non-reproducible across checkouts or unverifiable against the live object.
- **Fix:** `config_sha256` is over LF bytes (reproducible, equals the git blob); an additive optional `config_sha256_deployed` holds the CRLF variant hash. The test derives the CRLF hash from the LF bytes and asserts it equals the value recorded in DEPLOY-LOG.md. `weights_sha256` is the raw binary hash and equals both.
- **Files modified:** contracts/schema/model-version.schema.json, scripts/build_contract.py, scripts/tests/test_contract_model.py
- **Commit:** `1a65576`

**3. [Plan adjustment within the plan's own scope] Manifest schema requirements grew between tasks**
- Task 2's manifest schema required only `sites`, `schemas` and the three absent entries (the model, spec and stamp artifacts do not exist until Task 3); Task 3 added `model_version`, `preprocessing_spec` and `stamp` to the required artifact keys. The v1 bundle is unpublished, so this is within the additive-only policy.

**4. [Environment side effect] `pip install --user -r requirements-dev.txt` pinned numpy 1.26.4 in the user site**
- The plan-specified command installed the repo's pinned `numpy==1.26.4` into the user site, shadowing the system numpy 2.5.3 (pip then warned that scipy 1.18.1 and nlopt 2.11.0 want numpy 2.x). All repository tests pass (260 passed). I tried to restore the previous state with `pip uninstall numpy`, but the permission system denied it, so I left it alone. To restore: `py -3.12 -m pip uninstall numpy` (removes only the user-site 1.26.4). Nothing in this plan requires either version.

### Auth gates

None.

## Verification

- `py -3.12 scripts/build_contract.py --version 1 --check` OK (11 files match a fresh build)
- `py -3.12 scripts/check_contract.py --check` OK
- `py -3.12 -m pytest scripts/tests/test_contract_sites.py scripts/tests/test_contract_model.py scripts/tests/test_contract_bundle.py` 35 passed
- `py -3.12 -m pytest` whole suite: 260 passed, 1 deselected (live)
- `node scripts/check-citations.mjs --scope docs` exit 0 (234 files scanned, includes contracts/ and scripts/)
- `grep -c '"present": false' contracts/bucket/contract/v1.json` prints 3; coverage prints `48 54 7`; `git check-attr eol contracts/bucket/v1/sites.json` reports `eol: lf`
- Committed blob sha256 of sites.json, stamp.json and model_version.json equals the working-tree bytes (LF), so a CRLF checkout cannot change the manifest hashes.

## Notes for later plans

- `build_contract.py --check` also compares the recorded source hashes (snapshot, provenance, citations). If the CI `workflow_dispatch` snapshot job regenerates `data/snapshots/api-sites.json` (it rewrites `snapshot_at`), `--check` for the frozen v1 will fail until that is dealt with deliberately; do not regenerate v1, decide per change whether the contract needs a new version.
- 02-03 adds `embedding_row`/`projection` to Site (additive, required with if/then), `projection.schema.json`, and requires `artifacts.embeddings`/`projection` in the manifest; the schema sources must be re-canonicalised with `--format-schemas` after hand edits.
- The Zod mirror (02-07) should treat `sites.json` as `{schema_version, sites}`.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or trust boundary beyond the plan's threat model (T-02-01-01 to -04 and -SC are covered by `check_contract.py`, `.gitattributes`, the uri pattern and the package check).

## Self-Check: PASSED

- Files verified present: scripts/contract_lib.py, scripts/build_contract.py, scripts/check_contract.py, the three test files, .gitattributes, contracts/schema/*.schema.json (6), contracts/bucket/contract/v1.json, contracts/bucket/v1/{sites,model_version,preprocessing_spec,stamp}.json, contracts/bucket/v1/schema/*.schema.json (6), contracts/fixtures/legacy-site-coordinates.json
- Commits verified present: c51e08a, 007f87c, 6d63642, 7ee79b8, 1a65576
