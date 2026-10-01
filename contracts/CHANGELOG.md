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
- Fixtures (test-only, not part of the contract): a v2 manifest with `has_diel` true,
  `latest-v1.json`, `latest-v2.json`, curated invalid cases and a schema parity corpus.
