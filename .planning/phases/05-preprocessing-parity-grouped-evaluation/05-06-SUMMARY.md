---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 06
subsystem: testing
tags: [contract, json-schema, zod, parity-corpus, evaluation, ood]
status: complete

requires:
  - phase: 02-data-contract-v1
    provides: additive-only schema rule, Zod mirror, PAIRS structural parity, parity corpus
  - phase: 05-preprocessing-parity-grouped-evaluation
    provides: 05-03 sentinel fixture version 99, 05-04 LOSO harness field names
provides:
  - additive analysis-result keys (stamp_status, windows, site_similarities, projection, ood, input_audio)
  - model-version training.preprocessing_spec_version, training.embedding_source, served_from
  - preprocessing-spec v2 detail fields (resampling filter, known_gaps evidence/closed_by, model_pin, supported_input, levels)
  - evaluation-report and ood-reference JSON Schemas with schema examples
  - checker rule: a model recording its training spec must have been trained under the spec the contract serves
  - Zod mirrors in structural and verdict parity, regenerated parity corpus with three examples and their mutants
affects: [05-07, 05-09, 05-10, 05-12, 05-13, 05-14, 05-16]

actuals:
  tokens: 70000
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - "Schema examples live in contracts/fixtures/examples/<schema>[-<variant>].json, are validated by --check and enter the parity corpus as representative instances"
    - "A new optional property is always paired with a Zod looseObject field and a PAIRS row in the same commit"

key-files:
  created:
    - contracts/schema/evaluation-report.schema.json
    - contracts/schema/ood-reference.schema.json
    - contracts/fixtures/examples/analysis-result-full.json
    - contracts/fixtures/examples/evaluation-report.json
    - contracts/fixtures/examples/ood-reference.json
    - scripts/tests/test_contract_schemas_v2.py
  modified:
    - contracts/schema/analysis-result.schema.json
    - contracts/schema/model-version.schema.json
    - contracts/schema/preprocessing-spec.schema.json
    - contracts/fixtures/parity-corpus.json
    - contracts/CHANGELOG.md
    - scripts/check_contract.py
    - scripts/tests/test_contract_fixtures.py
    - scripts/tests/test_publish_contract.py
    - dashboard-next/src/features/contract/schema.ts
    - dashboard-next/tests/unit/contract-schema-parity.test.ts

key-decisions:
  - "Field names for the per-window result, evaluation report and OOD reference are fixed as in the plan; they become permanent when contract v2 publishes (05-16)"
  - "When a model records training.preprocessing_spec_version the checker holds that value to the manifest's spec and no longer compares the top-level model spec; a model without it (v1) keeps the original top-level equality"
  - "Example files are matched to a schema by their longest name prefix that is a schema stem, so analysis-result-full is checked against analysis-result"
  - "The evaluation example describes two folds that are not evaluable (each held-out site's class is absent from training), so every metric is the explicit undefined form rather than an invented number"

requirements-completed: [ML-02, ML-03, ML-06, ML-08]

coverage:
  - id: D1
    description: "Additive per-window keys validate on a full example and reject the six named invalid shapes; stamp-only results stay valid"
    requirement: ML-08
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_schemas_v2.py#test_full_result_example_validates"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_contract_schemas_v2.py#test_full_result_rejections"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_contract_schemas_v2.py#test_stamp_only_results_still_validate"
        status: pass
  - id: D2
    description: "The checker refuses a model paired with a spec it was not trained under; the v1 rule is unchanged"
    requirement: ML-03
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_schemas_v2.py#test_parity_rule_rejects_training_spec_mismatch"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_contract_schemas_v2.py#test_v1_equality_rule_unchanged"
        status: pass
  - id: D3
    description: "Evaluation reports and OOD references have machine-checked schemas with valid examples"
    requirement: ML-02
    verification:
      - kind: unit
        ref: "scripts/tests/test_contract_schemas_v2.py#test_evaluation_report_example_validates"
        status: pass
      - kind: unit
        ref: "scripts/tests/test_contract_schemas_v2.py#test_ood_reference_rejects_k_not_one"
        status: pass
  - id: D4
    description: "Zod agrees with Python on property sets, required sets, regexes and every corpus verdict, including the three examples"
    requirement: ML-06
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/contract-schema-parity.test.ts (121 tests)"
        status: pass
      - kind: unit
        ref: "npm test (1658 tests)"
        status: pass
---

# Phase 5 Plan 06: Additive contract shapes for contract v2 Summary

**Every shape Phase 5 publishes is now an additive JSON Schema with a Zod mirror in structural and verdict parity: per-window analysis-result keys, a model's training preprocessing spec with a checker rule that refuses a mismatched serving spec, v2 preprocessing-spec details, and standalone evaluation-report and ood-reference schemas, each with a schema example in the parity corpus.**

## Accomplishments

- Task 1 (tracer, commits 5c4f52f test, 44c2f4f feat): `analysis-result.schema.json` gains optional `stamp_status`, `windows`, `site_similarities`, `projection`, `ood`, `input_audio` as `$defs` (windows, site_similarities, site_similarity with the has_embedding false implies null similarity and rank rule, result_projection, ood, ood_windows, ood_summary, input_audio). The four stamp keys remain the only required keys. `contracts/fixtures/examples/analysis-result-full.json` uses the 48 real row site ids and the 6 location-only ids; its numbers are illustrative and labelled as a schema example. `check_contract.py` validates and canonical-checks every file under `fixtures/examples` during `--check` and adds each as a representative corpus instance (so it gets mutants). Zod gains `ResultWindowsBase`, `SiteSimilarityBase`, `SiteSimilaritiesBase`, `ResultProjectionBase`, `OodWindowsBase`, `OodSummaryBase`, `OodBase`, `InputAudioBase`, the six optional keys on `AnalysisResultStampBase`, and the has_embedding rule in the `AnalysisResultStamp` superRefine. A targeted Vitest block checks that Zod rejects each of the seven nested rejections the corpus's top-level mutants cannot reach.
- Task 2 (commits 831c5ec test, 4cf7fef feat): `model-version` gains `training.preprocessing_spec_version`, `training.embedding_source`, `served_from`; `preprocessing-spec` gains `resampling.kaiser_beta/half_length_factor/cutoff/reference_implementation`, `known_gaps[].evidence/closed_by`, `model_pin` (`$defs/model_pin`, `model_pin_file`), `supported_input`, `levels`. `_semantic_problems` reports "trained under X but the contract serves Y" when a model records a training spec that differs from the manifest; without it the original top-level equality still applies.
- Task 3 (commits 9e6d544 test, c915eb9 feat): `evaluation-report.schema.json` and `ood-reference.schema.json` exactly as the plan's behaviour list defines them, two examples, 21 more PAIRS rows, `evaluation-report` and `ood-reference` in `VERDICT_SCHEMAS`, corpus regenerated (556 entries).
- Commit 977489a: CHANGELOG entry for the additive growth.

## Verification

- `py -3.12 -m pytest`: all pass except the known CRLF-dependent `test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent` (see Deviations).
- `py -3.12 scripts/build_contract.py --version 1 --check`, `check_contract.py --check --additive`, `check_contract.py --published-history`: all exit 0.
- `npm run lint` (0 errors, 20 pre-existing warnings), `npm run typecheck`, `npm test` (1658 tests): pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `test_without_a_published_record_the_check_passes` cannot pass once a schema grows**
- **Found during:** Task 1
- **Issue:** with `PUBLISHED.json` removed, v1 is treated as unpublished and its frozen schema copies must equal `contracts/schema`; any additive schema growth makes them differ, which is exactly the situation the published-copies rule exists for.
- **Fix:** the test now asserts that the only findings are "schema copy differs" lines.
- **Files modified:** scripts/tests/test_contract_fixtures.py
- **Commit:** 44c2f4f

**2. [Rule 3 - Blocking] `test_publish_contract.py` re-publishes v1 as if unpublished against the live schemas**
- **Found during:** Task 3 full pytest run (29 failures and errors)
- **Issue:** the `contracts` fixture copied the grown `contracts/schema`, so the publisher's pre-flight `check_contract` failed on schema-copy differences.
- **Fix:** the fixture's schema directory is now v1's own frozen copy (`contracts/bucket/v1/schema`), which is what an unpublished v1 would have been checked against. The publisher itself is unchanged.
- **Files modified:** scripts/tests/test_publish_contract.py
- **Commit:** c915eb9

**3. Acceptance grep note (plan defect)**
- `grep -c '"example/analysis-result-full"'` expects a bare quoted case name, but corpus cases carry a `valid:` / `mutant:` prefix, so the literal string with a leading quote never matches (0). The entry `valid:example/analysis-result-full` and its `mutant:example/analysis-result-full/...` entries exist (`example/analysis-result-full"` count 1). The evaluation-report and ood-reference criteria were checked the same way (1 each).

**4. [Environment, no code change] CRLF flake in `test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent`**
- Fails in this Windows worktree and rewrites `data/audio-manifest.json` and two `dashboard-next/tests/fixtures/api/*.json` files. Restored with `git checkout -- <file>` after each run; nothing from it is committed. Pre-existing and unrelated.

### Other

- The plan names a drift_probe `cosine {mean, median, min, max}`, `generated_by`, `trainer` and similar nested objects as inline nodes; they have their own Zod bases and PAIRS rows (`DriftProbeCosineBase`, `EvaluatedModelMetricsBase`, `EvaluatedModelBaselinesBase`, `OodSourceInputBase`, etc.) beyond the list in the plan, so every object node has structural parity.
- The corpus grew from 665 KB to about 959 KB because the examples' mutants embed whole example instances.
- `input_audio.windows` requires at least 1 and `ood.note` is required (the plan's list reads as required there).

## Known Stubs

None. The example files are schema examples with illustrative values, labelled as such inside the files; they are test fixtures under `contracts/fixtures/` and are not part of any published bundle.

## Threat Flags

None. Mitigations T-05-06-01 (only optional properties and new files; `--additive` and `--published-history` pass), T-05-06-02 (the "trained under" rule and its tests) and T-05-06-03 (PAIRS rows for every new node and corpus verdict parity including the three examples) are implemented.

## Self-Check: PASSED

- contracts/schema/evaluation-report.schema.json, contracts/schema/ood-reference.schema.json, contracts/fixtures/examples/{analysis-result-full,evaluation-report,ood-reference}.json, scripts/tests/test_contract_schemas_v2.py: present
- commits 5c4f52f, 44c2f4f, 831c5ec, 4cf7fef, 9e6d544, c915eb9, 977489a: present on the branch
