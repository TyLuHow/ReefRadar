# Contract changelog

Schema versions and contract versions are separate. A contract version is an immutable
bundle; the schema version is the shape of its files. Schemas only ever grow.

## Contract v1 (unpublished until plan 02-06)

Schema version 1. Frozen from committed inputs only; rebuilt byte for byte by
`scripts/build_contract.py --version 1 --check`.

- `sites.json`: 54 Site records (48 acoustic references, 6 location-only) across 7 countries,
  each with dataset, DOI (or the dataset's stated reason for none), licence, label,
  who assigned it and what it means, and status basis. Acoustic references carry
  `embedding_row` and `projection`; location-only sites carry null for both.
- `embeddings.f32`: 48 x 1280 float32 little-endian values, rows sorted by site id.
- `projection.json`: mean-centred 2-D PCA of those rows. Explained variance 18.3% and 14.7%
  (33.0% together); the mean and both components are published so an upload can be projected.
- `model_version.json`: the interim classifier trained on real recordings only, with no
  accuracy figure. `preprocessing_spec.json`: what production does today and the open gaps.
- `stamp.json`: the four-field version stamp the classifier will write onto results.
- `contract/v1.json`: manifest with coverage flags (all false), artifact hashes and sizes.
- Schemas: site, contract-manifest, contract-pointer, model-version, preprocessing-spec,
  projection, analysis-result (version stamp).
- Fixtures (test-only, not part of the contract): a manifest with `has_diel` true at the
  sentinel version 99 (`FIXTURE_CONTRACT_VERSION`, so a real v2 can be published later),
  `latest-v1.json`, `latest-v99.json`, curated invalid cases and a schema parity corpus.

## Schema growth for contract v2 (Phase 5, plan 05-06; unpublished until 05-16)

Additive only; the published v1 bundle and its frozen schema copies are untouched.

- `analysis-result`: optional `stamp_status`, `windows`, `site_similarities`, `projection`, `ood`,
  `input_audio`. The four stamp keys remain the only required keys.
- `model-version`: optional `training.preprocessing_spec_version`, `training.embedding_source`,
  `served_from`. `check_contract.py` requires a recorded training spec to equal the spec the contract serves.
- `preprocessing-spec`: optional resampling filter fields, `known_gaps[].evidence/closed_by`, `model_pin`,
  `supported_input`, `levels`.
- New schemas: `evaluation-report`, `ood-reference`.
- `fixtures/examples/`: schema examples (illustrative values, never real results) checked by `--check`
  and added, with mutants, to the parity corpus.

## Contract v2 (Phase 5, plan 05-14; built on disk, unpublished until plan 05-16)

Schema version 1 (no schema change in this plan). Built by `scripts/build_contract.py --version 2`
and rebuilt byte for byte by `--version 2 --check`. The published v1 bundle is untouched.

- Reuses v1's `sites.json`, `embeddings.f32` and `projection.json` by uri (`v1/...`, same sha256 and
  bytes); `dataset_version` stays `reefradar-reference-2026.10.0`. The v1 reference embeddings still
  come from the earlier pipeline (F8d, Phase 11).
- `preprocessing_spec.json`: spec `preproc-2026.10.1-reef-audio`, read from `lambdas/shared/reef_audio.py`
  (polyphase Kaiser resampler, per-window normalisation, 5 s windows, the pinned SurfPerch SavedModel file
  hashes). F8a, F8b and F8c are closed with evidence, worded "serving and offline share one pipeline".
  F8d, the served model's evidence (Phase 12) and the unrebuilt inference container stay open.
- `model_version.json`: `interim-real-only-2026.10.1`, trained under the v2 spec on the 100 re-embedded
  windows, with `evaluation` filled from the leave-one-site-out report and a plain note that its
  interval cannot be told apart from chance.
- `evaluation_report.json`: the grouped evaluation report `loso-2026.10.1` (both models, per-window
  predictions, bootstrap settings, withdrawn figures). `ood_reference.json` and `ood_reference.f32`: the
  OOD sidecar and its 100 training-window rows.
- `stamp.json`: contract 2, the unchanged dataset, the successor model and the new spec.
- Manifest keys added: `artifacts.evaluation_report`, `artifacts.ood_reference`, `artifacts.ood_embeddings`.
- Checker: `check_contract.py` validates the report and the OOD reference against their schemas and
  cross-checks their links to the model, the spec and the OOD rows.
- The test fixture stays at the sentinel version 99, so a real v2 can sit beside it.
