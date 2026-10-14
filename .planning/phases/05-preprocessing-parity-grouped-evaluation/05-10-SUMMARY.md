---
phase: 05-preprocessing-parity-grouped-evaluation
plan: 10
subsystem: classifier
tags: [similarity, projection, ood, contract, reference-set, moto]
status: complete

requires:
  - phase: 05-06
    provides: analysis-result $defs (site_similarities, result_projection, ood), ood-reference schema
  - phase: 05-09
    provides: per-window classifier, reef_reference served-model loader, additive /visualize keys
provides:
  - load_reference_set / ReferenceSet (manifest-verified embeddings, sites, projection; bundled-first)
  - load_ood_reference / OodReference (sidecar plus training-window matrix, manifest-verified)
  - site_similarities (all 48 acoustic sites with ranks, 6 location-only listed without embedding), windows.similarities and windows.nearest_site
  - projection block (per-window PCA x/y, centroid, explained variance, note)
  - ood block (k=1 cosine distance per window, threshold, status, "k of n windows" summary)
affects: [05-15, 05-17, phase-9]

actuals:
  tokens: 20000
  tasks: 2
  commits: 3

key-files:
  created:
    - lambdas/classifier/tests/test_window_context.py
  modified:
    - lambdas/classifier/handler.py
    - lambdas/classifier/tests/test_handler.py
    - lambdas/shared/reef_reference.py
    - lambdas/shared/tests/test_reef_reference.py
    - lambdas/conftest.py
    - lambdas/router/tests/test_visualize_stamp.py

key-decisions:
  - "Repo mode resolves manifest artifact uris under the manifest's own contracts/bucket and is anchored on reef_reference's real file location, not the monkeypatchable _MODULE_DIR, so tests that fake the bundle directory still read the committed contract"
  - "The legacy top-3 is built from the bundled contract site records (status and label fields were built by apply_label_provenance in build_contract), so the classifier no longer imports site_provenance; the package members are unchanged until 05-15"
  - "Every context block fails soft: an unloadable reference set omits similarity and projection, an unavailable OOD reference omits ood, each with a ContextUnavailable EMF line; classification is never touched"
  - "OOD reference_sha256 is the sha256 of the training-window matrix (the ood_embeddings artifact), which the sidecar's embeddings.sha256 must equal"

requirements-completed: [ML-02, ML-06, ML-08]
---

# Phase 5 Plan 10: All-site similarity, projection and acoustic OOD Summary

**Every analysis now carries similarity to all 48 acoustic-reference sites (mean of per-window cosines, ranked), the unchanged legacy top-3, per-window PCA coordinates with explained variance, and a k=1 acoustic OOD status, all read from contract data that is verified by sha256 and byte count, with the runtime S3 reference read gone and the probabilities untouched.**

## What was built

- **Task 1 (tracer): window embeddings to all-site similarity and the legacy top-3.** `reef_reference.load_reference_set()` verifies `embeddings.f32`, `sites.json` and `projection.json` against the manifest's sha256 and byte count (bundled mode reads `contract_manifest.json` plus `reference_*` files next to the module; repo mode defaults to `contracts/bucket/contract/v1.json`). It also checks dim 1280, count against `row_site_ids`, the projection `input_uri`, and that each acoustic site's `embedding_row` equals its index. The handler computes `window_similarities` (rows normalised once, one matrix product, float64), `build_site_similarities` (mean of window cosines, rank with ties broken by row order, 6 location-only sites listed with `has_embedding` false and null similarity and rank, plus the F8d older-preprocessing note), and `top3_similar_sites` (exact old 7-key entry shape, `label_source` is the site's `dataset_id`). `windows.similarities` (n x 48) and `windows.nearest_site` are added. REFERENCE_KEYS, the S3 reference loader, the vector helper, the dead status fallback dictionary and the cosine helper are deleted.
- **Task 2: projection and OOD.** `build_projection_block` is `(e - mean) @ components.T` in float64 with the centroid of the window points and the contract's explained-variance ratio and note. Projecting each of the 48 reference rows reproduces its published x/y within 2e-6. `load_ood_reference` reads the `ood_reference` sidecar and `ood_embeddings` artifacts, verifies both hashes and that the sidecar's `embeddings.sha256` equals the matrix artifact's, and requires metric `cosine_distance` and k 1; contract v1 has no OOD artifact so it raises. `build_ood_block` gives distance = 1 - max cosine, `outside` exactly when distance is greater than the threshold, the "k of n windows are outside the training data" statement, and the note (100 training windows, never changes or withholds probabilities, cannot detect a classifier/embedding mismatch). Both blocks are computed after classification from separate code (D-12).

## Verification

- Tracer gate (autonomous run, `auto_advance` true): the tracer verify `-k "similarity or reference_set or window"` re-ran green after the commit; logged "Tracer verified end-to-end, expanding".
- `py -3.12 -m pytest lambdas -q`: pass (full output, exit 0).
- `py -3.12 -m pytest -q`: everything passes except the known CRLF noise `scripts/tests/test_build_gallery_manifest.py::test_regenerating_manifest_is_idempotent`; its side effects (`data/audio-manifest.json`, two dashboard fixtures) were restored with `git checkout --` and never committed.
- `test_window_context.py` run three times: exit 0 each time.
- Acceptance greps: `metadata_v6` 0, `status_map` 0, `mean_of_window_cosines` at least 1, `def build_ood_block` 1, `def load_ood_reference` 1.
- `py -3.12 scripts/deploy-lambdas.py --function classifier --dry-run`: exit 0, 8 members, no AWS call.
- **120-window item size (the 600 s cap): 57,315 bytes (56.0 KiB) by the DynamoDB-rules estimator, against the 400 KiB limit.** The item holds 120 x 48 similarity rows, projection, OOD, levels, classification and caveats, with 9-decimal numbers.

## Deviations from Plan

**1. [Ordering] Task 2 router test and conftest touched.** `lambdas/router/tests/test_visualize_stamp.py::test_visualize_new_item_additive_keys_with_ints` pinned the additive keys to `windows, input_audio`, noting that the others would arrive later; it now expects `windows, site_similarities, projection, input_audio` (no OOD artifact in v1) and also checks rank is an int and location-only entries have null similarity and rank. Its "no embeddings leave the API" check searched for the word "embeddings", which the projection note legitimately contains; it now looks for `embeddings.f32`, `processed/` and the JSON keys `"embedding"` / `"embeddings"`. Commits cefa2c2 and 8883925.

**2. [Rule 3 - Blocking] `write_ood_contract` helper in `lambdas/conftest.py`**, shared by the classifier and the reef_reference tests (tmp contract bucket: committed v1 artifacts plus an OOD sidecar and matrix). conftest.py is not in the plan's file list (same situation as 05-09).

**3. [Interpretation] `location_only_ids` is in `sites.json` order**, not alphabetical. The plan says "sorted" but lists `ken_D3, irma_eastern_sambo, sanctsound_fk01..04`, which is the file order; `sorted()` would put irma first. The enumerated order is what `site_similarities.sites` lists after the 48 scored sites.

**4. [Design] The OOD manifest artifact names are `ood_reference` and `ood_embeddings`** (each `{uri, sha256, bytes}`), as the plan states; no committed schema defines them yet, so 05-14 must write the v2 manifest with exactly these keys (the loader raises a ReferenceDataError naming the missing key otherwise).

**5. [Cleanup] The classifier no longer imports `site_provenance` or keeps `get_label_provenance`**; the contract sites already carry the provenance. `classifier.json` still lists `site_provenance.py` and `site_label_provenance.json` (a packaging test pins that set), so 05-15 decides whether to drop them.

## Notes for later plans

- **05-15 must bundle** `contract_manifest.json`, `reference_embeddings.f32`, `reference_sites.json`, `reference_projection.json`, `ood_reference.json` and `ood_reference.f32` (the `BUNDLED_ARTIFACT_FILES` names) in `classifier.json` and switch `REPO_CONTRACT_MANIFEST` to `contract/v2.json`. Until then a deployed classifier has no bundled manifest, would fall back to repo mode, fail to find `contracts/bucket`, and return an empty `similar_sites` with `similar_sites_error` and no new blocks (classification unaffected). Do not deploy this commit alone.
- Each `ContextUnavailable` EMF line has dimension `Block` with values `similarity`, `projection` or `ood`; 05-17 can alarm on it.
- Contract v1's reference vectors come from the earlier preprocessing; the site_similarities note says so (F8d, open until Phase 11).

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-05-10-01 (artifact tampering) is covered by `test_reference_set_tampered_artifact_rejected`, the bundled-mode tamper test and the OOD tamper tests; T-05-10-02 (OOD altering probabilities) by `test_ood_unavailable_probabilities_identical`; T-05-10-03 (legacy top-3 drift) by `test_similarity_top3_legacy_shape_for_all_48_sites` against `apply_label_provenance` and the `/sites` snapshot; T-05-10-04 (item size) by `test_item_size_120_windows_under_limit` (56.0 KiB).

## Self-Check: PASSED

- lambdas/classifier/tests/test_window_context.py present
- commits 9afcd29, cefa2c2, 8883925 present on the branch
