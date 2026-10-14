---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 15
subsystem: classifier-packaging-and-live-verification
tags: [classifier-package, contract-v2, binary-members, package-as-deployed, verify-live-truth, verify-live-embeddings]
status: complete

requires:
  - phase: 05-01
    provides: "binary-safe packager (.f32/.npz byte for byte, JSON LF-normalised)"
  - phase: 05-09
    provides: "per-window classifier, bundled served model loader, ReferenceDataError"
  - phase: 05-10
    provides: "bundle names contract_manifest.json, reference_*, ood_reference.*; all-site similarity, projection, OOD blocks"
  - phase: 05-11
    provides: "recorded excerpt embedding fixture (excerpt_embeddings.f32/json)"
  - phase: 05-12
    provides: "successor model interim-real-only-2026.10.1 (weights and config)"
  - phase: 05-14
    provides: "contract v2 bundle on disk (manifest, stamp, OOD reference)"
provides:
  - "classifier.json: the 14-member deployable package (v2 stamp and manifest, v1 embeddings/sites/projection, v2 OOD reference, successor model)"
  - "contract_stamp and reef_reference repo defaults on contract v2"
  - "test_bundled_e2e.py: the package unpacked as Lambda runs it produces a v2-stamped full result"
  - "verify_live_truth.py: DEFAULT_STAMP v2, --model-version, check_v2_result"
  - "verify_live_embeddings.py: live stored embeddings vs the recorded fixture"
affects: [05-16, 05-17]

key-files:
  created:
    - lambdas/classifier/tests/test_bundled_e2e.py
    - scripts/verify_live_embeddings.py
    - scripts/tests/test_verify_live_embeddings.py
  modified:
    - infrastructure/lambda-packages/classifier.json
    - lambdas/shared/contract_stamp.py
    - lambdas/shared/reef_reference.py
    - lambdas/shared/tests/test_contract_stamp.py
    - lambdas/shared/tests/test_reef_reference.py
    - lambdas/classifier/tests/test_handler.py
    - lambdas/classifier/tests/test_window_context.py
    - lambdas/router/tests/test_visualize_stamp.py
    - scripts/tests/test_lambda_packaging.py
    - scripts/verify_live_truth.py
    - scripts/tests/test_publish_tools.py

key-decisions:
  - "site_provenance.py and site_label_provenance.json are dropped from the classifier package: the handler no longer imports site_provenance (label provenance comes from the contract site records), so shipping them was dead weight. The router package still carries them."
  - "--model-version replaces --model-card in verify_live_truth.py. The published contracts/bucket/v2/model_version.json has the same classes and model_version keys, so the live check no longer depends on the dashboard model-card.json."
  - "check_v2_result takes its expectations from build_v2_expectations (the manifest the stamp names and the artifacts it points to) and the window count from reef_audio over the excerpt bytes, so nothing is hand-typed."
  - "verify_live_embeddings without --confirm runs only the offline checks (fixture integrity, excerpt sha256, analysis-id format), prints NOT VERIFIED and exits 0, following the repo's no-confirm convention (record_embedding_fixture.py)."

requirements-completed: [ML-01, ML-02, ML-06, ML-08]

completed: 2026-10-14
actuals:
  tokens: 18000
  tasks: 3
  commits: 3
---

# Phase 5 Plan 15: Classifier package on contract v2, proven as deployed, with live verifiers Summary

**The classifier zip now carries the v2 stamp and manifest, the reference embeddings, sites and projection, the v2 OOD reference and the successor model (every binary member byte-identical to its source), and a subprocess test unpacks it the way /var/task would and gets a contract-v2-stamped full result; verify_live_truth.py and the new verify_live_embeddings.py let 05-17 check the legacy shape, the new fields and embedding parity live.**

## What was built

### Task 1 (tracer): the package as Lambda unpacks it (commit f8ec88e)

- `infrastructure/lambda-packages/classifier.json` lists 14 members: `handler.py`, `region_detection.py`, `reef_audio.py`, `reef_reference.py`, `contract_stamp.py`, `contract_stamp.json` (from `contracts/bucket/v2/stamp.json`), `contract_manifest.json` (`contract/v2.json`), `reference_embeddings.f32`, `reference_sites.json`, `reference_projection.json` (the v1 artifacts, as the v2 manifest names them), `ood_reference.json`, `ood_reference.f32` (v2), `served_model_config.json` and `served_model_weights.npz` (`models/interim-real-only-2026.10.1/`).
- `contract_stamp._REPO_STAMP_RELATIVE` and `reef_reference.REPO_CONTRACT_MANIFEST` now default to v2 in repo mode.
- `lambdas/classifier/tests/test_bundled_e2e.py`:
  - `test_package_members_and_binary_bytes`: the member set is exact; each `.f32` and `.npz` member equals its source byte for byte; JSON and code members equal their LF-normalised sources.
  - `test_packaged_data_matches_the_v2_manifest`: every data member's sha256 and byte count equal the bundled manifest's entries; stamp, manifest and model config agree on the versions.
  - `test_package_as_deployed_produces_v2_stamped_full_result`: the zip is extracted; a subprocess whose `sys.path` starts with the extracted directory (cwd elsewhere, no `PYTHONPATH`) imports `handler`, asserts every flat module and `reef_reference._MODULE_DIR` resolve inside the package, then runs the handler under moto on binary segments of the ind_H1 excerpt. The stubbed inference Lambda first checks each window's sha256 against the one the fixture was recorded from, then returns the 6 recorded embeddings. The RESULT has `stamp_status` stamped, contract 2, dataset `reefradar-reference-2026.10.0`, model `interim-real-only-2026.10.1`, spec `preproc-2026.10.1-reef-audio`, 54 site similarities (48 with embeddings) in the manifest's row order, top-3 equal to ranks 1-3 in the exact legacy key set, projection variance equal to v1's, OOD threshold, version and reference hash equal to the v2 artifact, no `visualization`, and validates against `analysis-result.schema.json`. The stored `embeddings.f32` equals the fixture rows.
- The two pinned member-set tests (`test_handler.py`, `test_lambda_packaging.py`) and the stamp tests moved to the new set and to v2.

Tracer gate (auto mode): the tracer's verify was re-run end to end and passed, so expansion proceeded.

### Task 2: `verify_live_truth.py` on contract v2 (commit a7fc759)

- `DEFAULT_STAMP` is `contracts/bucket/v2/stamp.json`; `--model-version` (default `contracts/bucket/v2/model_version.json`) supplies the expected classes and model version.
- `check_v2_result(body, model_card, expected)` returns one failure string per violated condition (stamp status, exact `classification` and `similar_sites` key sets, window count, per-window rows summing to 1 within 1e-6, recording equals column means, aggregation, 54/48 site similarities, `site_order` equals manifest `row_site_ids`, top-3 equals ranks 1-3, projection variance, OOD threshold, reference hash and per-window lengths, preprocessing spec, empty visualization). `check_analysis` calls it when the stamp's `contract_version` is 2 or more; a v1 stamp runs the old checks only.
- `main` computes the expected window count from the excerpt bytes with `reef_audio` and passes it into `build_v2_expectations`; `analysis_summary` adds `stamp_status`, `windows_count` and the OOD statement. Presigned URLs are still never printed.
- 23 parametrised violation cases plus pass, v1-unchanged, default-stamp, expectation-source and two `main` wiring tests.

### Task 3: `verify_live_embeddings.py` (commit b41183e)

`--analysis-id`, `--excerpt`, `--fixture-dir`, `--bucket`, `--profile`, `--confirm`. With `--confirm` it asserts account 781978598306, reads only `processed/<id>/embeddings.f32` (read-only), takes the excerpt's fixture rows in window order and compares with `surfperch_client.compare_embeddings` at the fixture's stored tolerance (cosine >= 0.99999, max abs <= 1e-5), printing min cosine, max abs difference and row counts. Exit 1 on row-count mismatch, any row outside tolerance, excerpt sha256 not equal to the fixture json, a damaged fixture, a non-UUID analysis id, a truncated, non-finite or missing object, or a wrong account. Without `--confirm` no AWS client or session is created. Output never carries object bodies or URLs. 24 moto-backed tests.

## Verification

| Check | Result |
|-------|--------|
| `py -3.12 -m pytest` (full) | 902 passed, 1 skipped, 1 failed: `test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent`, the known Windows CRLF noise; the files it rewrote were restored with `git checkout --` and not committed |
| `deploy-lambdas.py --function classifier --function router --function preprocessor --dry-run` | exit 0, no AWS call |
| `build_contract.py --version 1 --check` | OK (v1 published; fixtures match) |
| `build_contract.py --version 2 --check` | OK (16 files, 11 fixtures match a fresh build) |
| `check_contract.py --check --additive` | OK |
| `check_contract.py --published-history` | OK |

Classifier package (dry-run on the committed tree, git_sha b41183e): **14 members, code_sha256 `LzxelAMwXRhqwkovEps9pwjXYwJolqTdKjgnc+SBmbE=`**, 2,053,272 bytes zipped (2.05 MB against the 50 MB limit) and 2,412,596 bytes unzipped (2.41 MB against the 250 MB limit). Router (4 members) `/zCahCbfgt79dJGoaLeyUoO3Z3NZ8gAHzZ148k1JHfI=`, preprocessor (2 members) `EfDEOleFX8I9VptWh7Wla5smJmuh0Q2hDizOGEG2uL0=`. The three code_sha256 values are for this tree; 05-17 deploys from a clean committed tree after the orchestrator merges, so re-run the dry-run there.

Largest members: `served_model_weights.npz` 1,379,754 bytes, `ood_reference.f32` 512,000, `reference_embeddings.f32` 245,760, `reference_projection.json` 77,509.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing tests assumed the repo default was contract v1**
- **Found during:** Task 1 (full run after switching the defaults)
- **Issue:** Switching `REPO_CONTRACT_MANIFEST` and `_REPO_STAMP_RELATIVE` to v2 broke six tests that relied on the v1 default: three in `test_window_context.py` (v1 reference set with no OOD artifact), `test_visualize_stamp.py::test_visualize_new_item_additive_keys_with_ints`, and two in `test_reef_reference.py`.
- **Fix:** The v1-specific tests now name the v1 manifest explicitly (the `test_window_context.py` fixture pins it with monkeypatch; the reef_reference tests pass the path). The router test now expects `ood` among the additive keys because v2 has an OOD artifact. Added `test_reference_set_repo_mode_default_is_v2` and `test_repo_default_is_the_v2_stamp`.
- **Files modified:** `lambdas/classifier/tests/test_window_context.py`, `lambdas/router/tests/test_visualize_stamp.py`, `lambdas/shared/tests/test_reef_reference.py`, `lambdas/shared/tests/test_contract_stamp.py`
- **Commit:** f8ec88e

**2. [Plan wording] site_provenance members dropped from the package**
- The plan's behaviour list says to keep them only if the handler still imports `site_provenance`. It does not (grep shows no import in `lambdas/classifier` or the shared modules the package ships), so they were removed; the e2e subprocess proves the handler runs without them.

**3. [Plan wording] `--model-version` replaces `--model-card`**
- The plan describes `--model-version` as supplying classes and model_version "replacing the dashboard model-card dependency for those two checks". The old `--model-card` option had no other use, so it was removed rather than left as a dead flag.

No architectural changes; no AWS calls were made (the live runs belong to 05-17).

## Known Stubs

None.

## Threat Flags

None. The two verifiers add no endpoints; `verify_live_embeddings.py` is read-only against one S3 key after an account assertion and a UUID check (T-05-15-03), and the byte-equality, v2-stamp and legacy-shape checks cover T-05-15-01, -02 and -04.

## Notes for 05-16 and 05-17

- Deploy order from the rollout plan still applies; the classifier package is now complete and self-contained. After deploying, run `verify_live_truth.py` (defaults are v2) and `verify_live_embeddings.py --analysis-id <id> --excerpt dashboard-next/public/audio/marrs/ind_H1_20220830_120000.wav --confirm`.
- `verify_live_truth.py` expects `/visualize` to pass the new keys (`windows`, `site_similarities`, `projection`, `ood`, `input_audio`, `stamp_status`) through; the router tests already assert this.

## Self-Check: PASSED

- Files found: `lambdas/classifier/tests/test_bundled_e2e.py`, `scripts/verify_live_embeddings.py`, `scripts/tests/test_verify_live_embeddings.py`, `infrastructure/lambda-packages/classifier.json`, `scripts/verify_live_truth.py`
- Commits found: f8ec88e, a7fc759, b41183e
