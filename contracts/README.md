# ReefRadar data contract

The contract is the one place the app reads reference data from: sites with their
provenance, the reference embeddings and their 2-D projection, the model and
preprocessing descriptions, and a manifest that says what exists. Everything is a
static, versioned file. Nothing here is generated at request time.

## Layout

```
contracts/
  schema/                       JSON Schema (draft 2020-12): the source of truth
  bucket/                       exactly what is published (the bucket's immutable content)
    contract/v1.json            manifest of version 1: artifact uris, sha256, coverage flags
    v1/sites.json               {schema_version, sites}: 54 Site records with provenance
    v1/embeddings.f32           48 x 1280 float32 little-endian reference embeddings
    v1/projection.json          2-D PCA of those rows, with explained variance, mean and components
    v1/model_version.json       the deployed classifier (no accuracy figure; see its evaluation note)
    v1/preprocessing_spec.json  what production does to audio today, with the open known gaps
    v1/stamp.json               the version stamp the classifier writes onto every result
    v1/schema/*.schema.json     byte-for-byte copies of contracts/schema/* at publish time
  fixtures/                     test-only; never published
    bucket/contract/v2.json     v1 manifest with fixture true and exactly one flipped flag (has_diel)
    latest-v1.json, latest-v2.json   pointers the UI tests flip between
    invalid/*.json              curated schema violations: {schema, instance, reason}
    parity-corpus.json          the Python schema verdict for every instance and generated mutant
    legacy-site-coordinates.json     the frozen pre-contract coordinate table (adapter parity tests)
  PUBLISHED.json                written by the publisher: version -> manifest sha256 (immutability guard)
  CHANGELOG.md
```

A fixture manifest reuses the v1 artifact uris, so a fixture is one small file, not a copy
of the data. A manifest marked `"fixture": true` anywhere under `contracts/bucket/` fails
the checker, and the publisher refuses to upload one.

## Schema policy

- JSON Schema is the source of truth. The TypeScript (Zod) mirror uses loose objects and is
  held to the same verdicts by `fixtures/parity-corpus.json`.
- Schemas are additive-only. A later version may add optional properties, new artifacts and
  new enum values; it may not remove or rename a property, remove an enum value, or newly
  require a key that an earlier version lacks. `check_contract.py --additive` enforces this
  against the schema copies bundled with every version and against every committed bundle.
- No `additionalProperties: false`, no `format` keyword; patterns are plain regular
  expressions shared with the Zod mirror.
- After editing a file in `schema/`, run `py -3.12 scripts/build_contract.py --format-schemas`
  (canonical key order) and rebuild.

## Honesty rules the data carries

- Every site record carries who assigned its label, what the label means, its dataset, DOI
  (or the dataset's stated reason for having none) and licence. Nothing is invented; an
  unexplained null is rejected by the schema.
- The 2-D projection is a linear PCA plane that shows about 33% of the variance in the
  embeddings (18.3% and 14.7% for the two axes). Plane distances are not embedding
  distances and must not be presented as acoustic similarity. The artifact states this in
  its own `note` field, and the explained variance is published next to the coordinates.
  The mean and both components are published so a later phase can place an uploaded
  recording on the same plane.

## Commands

```bash
# Rebuild v1 in memory and compare with the committed files (also checks the fixtures)
py -3.12 scripts/build_contract.py --version 1 --check

# Verify every bundle, fixture, pointer, the corpus, the immutability guard and additivity
py -3.12 scripts/check_contract.py --check --additive

# Regenerate the schema parity corpus after a schema or instance change
py -3.12 scripts/check_contract.py --write-corpus

# Write the offline fixtures (flipped-flag manifest v2, pointers, invalid cases)
py -3.12 scripts/build_contract.py --version 1 --fixtures
```

CI runs the first two on every push. `embeddings.f32` was built once from the reference
metadata object in the embeddings bucket (embedding values only; its sha256 is pinned in
`scripts/contract_lib.py`):

```bash
py -3.12 scripts/build_contract.py --version 1 --reference-metadata <local copy> --recompute-projection
```

The projection is recomputed only with `--recompute-projection`: numpy builds differ in the
last bits, so `check_contract.py` verifies the committed projection numerically against a
PCA of the committed float32 rows (components 1e-8, coordinates 2e-6) instead of by hash.

## Publishing, caching and rollback

Publishing is the job of `scripts/publish_contract.py` (plan 02-04):

```bash
py -3.12 scripts/publish_contract.py --version 1 --dry-run
py -3.12 scripts/publish_contract.py --version 1 --confirm      # upload, verify, then flip latest
py -3.12 scripts/publish_contract.py --set-latest 1 --confirm   # roll the pointer to a published version
```

- `v{N}/**` and `contract/v{N}.json` are immutable and cached for a year.
- `contract/latest.json` is the only mutable object and is cached for 60 seconds, so a
  flipped pointer reaches browsers in about two minutes. No CloudFront invalidation is
  ever needed.
- A published version is never edited. Once `PUBLISHED.json` lists a version, CI fails if
  that manifest's bytes change; fix forward with a new version.
- Rolling back means pointing `latest.json` at an earlier published version with
  `--set-latest`.

## Known limitations

- The backend `/sites` response still carries an out-of-date embedded-site count in its
  header (44; the data has 48). The contract counts from the records. Cleaning the backend
  header is a Phase 17 task.
- Coverage flags (`has_diel`, `has_detections`, `has_pre_post_event`, `has_effort`) are all
  false in v1: those artifacts are present as `{"present": false}`. The fixture v2 flips
  one flag so the UI can be tested against "data arrived" without a rebuild.
