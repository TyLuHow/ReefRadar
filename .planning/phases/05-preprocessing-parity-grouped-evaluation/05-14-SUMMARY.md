---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 14
subsystem: data-contract
tags: [contract-v2, preprocessing-spec, reef-audio, ood-reference, evaluation-report, checker]
status: complete

requires:
  - phase: 05-03
    provides: "fixture sentinel version 99 (a real v2 can coexist with the test fixture)"
  - phase: 05-05
    provides: "lambdas/shared/reef_audio.py spec_summary(), SPEC_VERSION, model pin constants"
  - phase: 05-06
    provides: "evaluation-report and ood-reference schemas, model-version training.preprocessing_spec_version rule"
  - phase: 05-12
    provides: "successor model interim-real-only-2026.10.1 and its OOD sidecar"
  - phase: 05-13
    provides: "report.json (loso-2026.10.1)"
provides:
  - "contracts/bucket/contract/v2.json and contracts/bucket/v2/*: the contract v2 bundle on disk (not published)"
  - "build_contract.py build_bundle_v2 (reads reef_audio, never handler source) and --version 2 --check"
  - "check_contract.py _v2_link_problems: cross-artifact links of the report, OOD reference, model and spec"
  - "v2 as the latest bundle in the parity corpus; CI rebuild check; deferred-items.md"
affects: [05-15, 05-16, 05-17]

key-files:
  created:
    - contracts/bucket/contract/v2.json
    - contracts/bucket/v2/model_version.json
    - contracts/bucket/v2/preprocessing_spec.json
    - contracts/bucket/v2/stamp.json
    - contracts/bucket/v2/evaluation_report.json
    - contracts/bucket/v2/ood_reference.json
    - contracts/bucket/v2/ood_reference.f32
    - contracts/bucket/v2/schema/ (9 schema copies)
    - scripts/tests/test_build_contract_v2.py
    - .planning/phases/05-preprocessing-parity-grouped-evaluation/deferred-items.md
  modified:
    - scripts/build_contract.py
    - scripts/check_contract.py
    - scripts/tests/test_contract_fixtures.py
    - lambdas/conftest.py
    - contracts/fixtures/parity-corpus.json
    - contracts/CHANGELOG.md
    - contracts/README.md
    - .github/workflows/ci.yml

key-decisions:
  - "v2 reuses v1's sites, embeddings and projection entries verbatim (same uri, sha256, bytes), so dataset_version is unchanged and no v1 file is rewritten or re-uploaded."
  - "F8a, F8b and F8c are closed with the wording 'serving and offline share one pipeline' and named test evidence; F8c states the measured filter (about 54 dB stopband, partial attenuation between 17 and 18.6 kHz). F8d stays open (Phase 11); two new open gaps record the served model's evidence (Phase 12) and the unrebuilt inference container (Phase 11)."
  - "model_version.evaluation_note is generated from the report: the interval 0.3000 to 0.5833 contains chance, so the note says the result cannot be told apart from chance, and that the predecessor's number is not an improvement claim."
  - "The full evaluation report is a valid-only corpus entry; the OOD reference is a representative entry with mutants. examples/evaluation-report.json already supplies the schema's representative instance and mutants, and mutating an 80 KB report would add megabytes."

requirements-completed: [ML-01, ML-03, ML-06, ML-08]

completed: 2026-10-14
actuals:
  tokens: 60000
  tasks: 3
  commits: 3
---

# Phase 5 Plan 14: Contract v2 on disk Summary

**Contract v2 is built, checked and CI-guarded on disk (not published): it reuses the v1 reference dataset by uri and adds the `preproc-2026.10.1-reef-audio` spec read from `reef_audio`, the successor model `interim-real-only-2026.10.1` with its leave-one-site-out evaluation, the grouped evaluation report, the OOD reference and its rows, and rebuilds byte for byte.**

## The v2 manifest

`contracts/bucket/contract/v2.json` (sha256 `70c3c500544a881fd389a9971c53e16860337f19c9e88810cf6aefd0d96f787d`), `contract_version` 2, `frozen_at` 2026-10-14T16:07:00Z, `dataset_version` `reefradar-reference-2026.10.0`, `model_version` `interim-real-only-2026.10.1`, `preprocessing_spec_version` `preproc-2026.10.1-reef-audio`. Coverage, datasets and sources are the v1 values.

| Artifact | uri | sha256 | bytes | Origin |
|---|---|---|---|---|
| sites | `v1/sites.json` | `26325470e84fc51dd1a6cabd43c9a0100bb0358bf386ede855f8cf8902352661` | 59,384 | reused from v1 |
| embeddings | `v1/embeddings.f32` | `f73ab3a45422d43227ba0006d229fd801a541b3c36138012b42ccb40517816ec` | 245,760 | reused from v1 |
| projection | `v1/projection.json` | `da2ab7cc4142e36e3ff2dccfd10e135d3328f2a10635e63cd77d7046ea026c14` | 77,509 | reused from v1 |
| model_version | `v2/model_version.json` | `71fe1be8e76d30554eae535ce9ff3065848474e94f1d8808d992e5b6bc3575e6` | 3,129 | new |
| preprocessing_spec | `v2/preprocessing_spec.json` | `fb5c35912ab436aae98abb42565e1c2791fbe7f688b1c9936bb07088942c9f6b` | 8,276 | new |
| stamp | `v2/stamp.json` | `f038120874d70145fba73f2817266962cd276b2c5a09e5c7c7b1d08bc3866f1f` | 196 | new |
| evaluation_report | `v2/evaluation_report.json` | `bc0482baf6f56f043c6e9e273b9fbfdf6ad75565278eedaa36187945ba89f20b` | 79,150 | bytes of `models/interim-real-only/evaluation/report.json` |
| ood_reference | `v2/ood_reference.json` | `d25adfff4929dd0e38b9dd8d8402b55db0ba706b39cebf2e1e80b3ccde7665c3` | 4,101 | bytes of the successor's sidecar |
| ood_embeddings | `v2/ood_reference.f32` | `74123a44555181c7fb8cbe3a1340d72dc65df8ad4abdbafe0aedf64a5d5712e2` | 512,000 | bytes of `reembedded.f32` (100 x 1280 float32) |
| schemas | `v2/schema/*.schema.json` | (9 entries) | | copies of the current `contracts/schema/*` |

Not in v2: no v1 file is rewritten (no `v2/sites.json`, `v2/embeddings.f32` or `v2/projection.json`).

## What was built

### Task 1 (tracer): the v2 recipe and the bundle

- `build_bundle_v2(frozen_at, contracts_dir)` in `scripts/build_contract.py`, dispatched from `main` for `--version 2`. The v1 recipe is untouched. Constants: `SUCCESSOR_MODEL_DIR`, `ARCHIVE_WEIGHTS_LOCATION`, `SERVED_FROM`, `V2_DATASET_VERSION` (equal to v1's `DATASET_VERSION`).
- Spec (`build_preprocessing_spec_v2`): built from `reef_audio.spec_summary()` (sample rate, windows, durations, scaling, resampler fields, supported input, levels), plus `status "as-deployed"`, `serving.window_pooling` (each window classified on its own, recording result is the mean of the window probabilities), `model_pin` (handle `google/surfperch/tensorFlow2/1/1` and the three SavedModel files with sizes 3,859,615 / 97,026,563 / 8,491 and their sha256 from `reef_audio`) and the known gaps below.
- Known gaps: F8a, F8b, F8c `closed`, each with `closed_by`, evidence naming the parity test, the resampler tests (scipy oracle, alias suppression) and the per-window classifier tests, and the closure wording "serving and offline share one pipeline". F8c says what was measured and that it is not perfect anti-aliasing. Open: F8d (Phase 11; v1 reference embeddings reused unchanged), `F8-model-evidence` (Phase 12; balanced accuracy 0.4375, interval 0.3000 to 0.5833, cannot be told apart from chance), `F8-inference-container` (Phase 11; unpinned `tensorflow-cpu>=2.18.0`, 4-component handle in code).
- Model version: successor identity, `training.preprocessing_spec_version`, `training.embedding_source`, `evaluation` (method, report uri, sha256 and version, the served model's balanced-accuracy metric object), a generated plain note, `config_sha256` over LF bytes `348b20a2...`, `weights_sha256` `cdc169fa...`, `weights_location` the archive key (true only after 05-16 archives it), `served_from` (bundled in the classifier package), predecessor `interim-real-only` with the train/serve reason from the config.
- Every JSON is validated against its schema at build time; the report and the OOD sidecar must already be canonical JSON and are copied byte for byte; the OOD rows must hash to the sidecar's `embeddings.sha256`.
- Tests (`scripts/tests/test_build_contract_v2.py`): v1 reuse, spec from reef_audio with F8a/b/c closed and F8d open, model evaluation and training spec, stamp values, byte copies, reproducibility from a rebuild, `--check` fails on a changed file, v1 check unchanged.
- Tracer gate: autonomous executor; the tracer's verify (v2 tests, `--version 2 --check`, `--version 1 --check`) was re-run after the commit and passed before expansion.

### Task 2: checker rules

`check_contract._v2_link_problems`, called from `_semantic_problems` only when the artifacts it relates exist (v1 and the fixtures are checked exactly as before). `evaluation_report` and `ood_reference` now validate against their schemas. Seven tamperings in a tmp copy each produce a problem line: OOD rows of the wrong size, OOD rows whose hash differs from the sidecar, sidecar built under another spec, `report_sha256`, `report_uri`, a report whose served model is not the manifest's model, and a model trained under another spec (the 05-06 rule). Clean v1 and v2 produce no problems.

### Task 3: corpus, CI, docs, deferred items

v2 is the latest bundle in the parity corpus (the v2 `model_version`, `preprocessing_spec` and `stamp` are the representative instances; the v2 OOD reference is representative; the real evaluation report is a valid-only entry). The Zod verdict parity test passes. `ci.yml` runs `python scripts/build_contract.py --version 2 --check` right after the v1 check (a test pins the order). `contracts/README.md` and `CHANGELOG.md` describe v2, its v1 reuse and fixture version 99. `deferred-items.md` records the container rebuild with a pinned `tensorflow-cpu` and the 5-component handle `google/surfperch/tensorFlow2/1/1` (and removal of the two dead fallback handles), the legacy-UI model card copy (Phase 13), classifier memory and timeout for 120-window uploads (Phase 10), and re-embedding the reference sites for F8d (Phase 11).

## Verification

- `py -3.12 -m pytest`: 840 passed, 1 skipped, 3 deselected, 1 failed. The failure is the known Windows CRLF noise `test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent`; it rewrote `data/audio-manifest.json` and two dashboard fixtures, restored with `git checkout --` and not committed.
- `py -3.12 scripts/build_contract.py --version 1 --check`: OK (v1 is published; fixtures match a derivation of the committed v1 bytes).
- `py -3.12 scripts/build_contract.py --version 2 --check`: OK (16 files and 11 fixture files match a fresh build).
- `py -3.12 scripts/check_contract.py --check --additive`: OK. `--published-history`: OK.
- `cd dashboard-next && npm test`: 1658 passed (no web source changed; the corpus feeds the schema parity test). `node scripts/check-citations.mjs --scope docs`: OK.
- Acceptance: the manifest prints `2 v1/sites.json v1/embeddings.f32 v1/projection.json interim-real-only-2026.10.1 preproc-2026.10.1-reef-audio`; the wording grep prints 3; `cmp` of the OOD rows with `reembedded.f32` passes.
- No AWS call was made and the publisher was not run.

## Task commits

1. `264cc6e` feat(05-14): build contract v2 from reef_audio, the successor model, the LOSO report and the OOD reference (tracer)
2. `a89b48f` feat(05-14): checker rules for contract v2 cross-artifact links
3. `ed28f43` feat(05-14): v2 in the parity corpus, CI rebuild check, docs and deferred items

## Deviations from Plan

**1. [Rule 3 - Blocking] `lambdas/conftest.py` `write_ood_contract`.** It called `(dest / "v2").mkdir()` on a copy of `contracts/bucket`, which now has a real `v2/`, so 12 classifier and reef_reference OOD tests failed with FileExistsError. Changed to `mkdir(exist_ok=True)`; the tmp copy overwrites its own OOD files and the real bundle is untouched. File is CRLF; line endings preserved. Commit 264cc6e.

**2. [Rule 3 - Blocking] `scripts/tests/test_contract_fixtures.py`.** `test_fixtures_live_only_under_contracts_fixtures` now expects `v1.json` and `v2.json` in the bucket (plan item). `test_a_published_version_tolerates_an_additive_schema_change` published only v1, so the unpublished v2's schema copies legitimately differed after the schema edit; the helper `_publish_v1` became `_publish_all`, which records every committed manifest. Commits 264cc6e and ed28f43.

**3. [Design] Evaluation report is a valid-only corpus entry, not a mutated representative one.** The plan says "representative corpus instances". Mutants of the 79 KB report would add megabytes to a 1.3 MB corpus; the schema already has a representative instance with mutants (`examples/evaluation-report.json`). The OOD reference is representative.

**4. [Process] Tests and code split across commits.** Task 1's tests and recipe are in one commit (the bundle needed the recipe first); Task 2's seven checker tests were committed after being seen to fail (7 failed, 3 passed before the code), then pass.

**5. [Design] Gap ids `F8-model-evidence` and `F8-inference-container`.** The plan did not name them; they avoid colliding with DATA-MODEL.md numbering. Owner phases: model evidence Phase 12 (plan), container Phase 11 (CONTEXT: rebuild "before any embedding change").

**6. [Note] Spec `status` is `"as-deployed"` (plan) although v2 is only on disk.** It becomes true at the 05-17 rollout; the spec and the stamp are published (05-16) before the classifier that uses them is deployed.

No auth gates, no architectural changes.

## Notes for downstream plans

- 05-15: v2 stamp is `contracts/bucket/v2/stamp.json`, manifest `contracts/bucket/contract/v2.json`; OOD files `v2/ood_reference.json` and `v2/ood_reference.f32`; the bundle's served-model fields assume the weights and config are bundled as `served_model_weights.npz` and `served_model_config.json` (`served_from` says so).
- 05-16: publish v2 only after archiving the successor weights (`weights_location` names the archive key). v1-reused artifacts must report `exists_identical`. After publishing, `build_contract.py --version 2 --check` skips the rebuild comparison and `check_contract.py` guards the manifest bytes against `PUBLISHED.json`; add `2` to `published.ts`.
- Any rebuild of v2 before publish is deterministic; it changes only if `reef_audio.py`, the model files, the report, the OOD files, the schemas or the recipe change.

## Known Stubs

None.

## Threat Flags

None. T-05-14-01 (byte-copy tests, `_v2_link_problems`, `--version 2 --check` in CI), T-05-14-02 (closure wording fixed and asserted by test, F8d open, new open gaps, F8c states the measured filter), T-05-14-03 (v1 recipe and files untouched, v1 artifacts reused by uri with identical hashes, `--published-history` passes) are mitigated.

## Self-Check: PASSED

Created files exist (v2 manifest, `contracts/bucket/v2/*` including 9 schema copies, `test_build_contract_v2.py`, `deferred-items.md`), and commits 264cc6e, a89b48f and ed28f43 are in `git log`.
