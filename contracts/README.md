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
    contract/v2.json            manifest of version 2 (Phase 5; unpublished until plan 05-16)
    v2/model_version.json       the successor model, with its leave-one-site-out evaluation block
    v2/preprocessing_spec.json  the reef_audio spec, F8a/b/c closed with evidence, F8d and others open
    v2/stamp.json               the v2 version stamp (bundled into the classifier by 05-15)
    v2/evaluation_report.json   the grouped evaluation report (JSON only; the Markdown stays in models/)
    v2/ood_reference.json       the OOD sidecar (k=1 cosine distance, leave-one-site-out p95 threshold)
    v2/ood_reference.f32        the 100 x 1280 training-window rows the OOD distance is measured against
    v2/schema/*.schema.json     copies of contracts/schema/* when v2 was built
  fixtures/                     test-only; never published
    bucket/contract/v99.json    v1 manifest with fixture true and exactly one flipped flag (has_diel)
    latest-v1.json, latest-v99.json  pointers the UI tests flip between
    invalid/*.json              curated schema violations: {schema, instance, reason}
    parity-corpus.json          the Python schema verdict for every instance and generated mutant
    legacy-site-coordinates.json     the frozen pre-contract coordinate table (adapter parity tests)
  PUBLISHED.json                written by the publisher: version -> manifest sha256 (immutability guard)
  CHANGELOG.md
```

Contract v2 does not copy the reference dataset either: its `sites`, `embeddings` and `projection`
entries are the v1 entries (uris `v1/sites.json`, `v1/embeddings.f32`, `v1/projection.json`, identical
sha256 and bytes, `dataset_version` unchanged). It adds the successor model, the preprocessing spec read from
`lambdas/shared/reef_audio.py`, the stamp, the evaluation report and the OOD reference and its rows
(manifest keys `evaluation_report`, `ood_reference`, `ood_embeddings`). Its spec says "serving and
offline share one pipeline" where it closes F8a, F8b and F8c; it does not claim the model generalises, and
F8d (reference vectors built by earlier methods) stays open.

A fixture manifest reuses the v1 artifact uris, so a fixture is one small file, not a copy
of the data. The fixture manifest is the test-only version 99 (`FIXTURE_CONTRACT_VERSION` in
`scripts/contract_lib.py`, mirrored in `dashboard-next/tests/shared/contract-fixture-version.ts`),
a sentinel that can never be a real published version: a real v2 is published in Phase 5, and
`check_contract.py` fails if a fixture's version equals a manifest under `contracts/bucket/`. A manifest marked `"fixture": true` anywhere under `contracts/bucket/` fails
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
# Compare the committed files with a fresh build (a published version is frozen, so only its
# fixtures are compared, against a derivation from the committed v1 bytes)
py -3.12 scripts/build_contract.py --version 1 --check

# Build contract v2 on disk (first build needs --frozen-at; later runs reuse the committed one),
# then compare the committed files with a fresh build. Neither command calls AWS.
py -3.12 scripts/build_contract.py --version 2 --frozen-at 2026-10-14T16:07:00Z
py -3.12 scripts/build_contract.py --version 2 --check

# Verify every bundle, fixture, pointer, the corpus, the immutability guard and additivity
py -3.12 scripts/check_contract.py --check --additive

# Prove no published version was rewritten or dropped, even together with its own
# PUBLISHED.json entry (compares with every committed revision of PUBLISHED.json;
# needs full git history, CI checks out with fetch-depth 0). Or compare with one ref:
py -3.12 scripts/check_contract.py --published-history
py -3.12 scripts/check_contract.py --published-base-ref origin/main

# Regenerate the schema parity corpus after a schema or instance change
py -3.12 scripts/check_contract.py --write-corpus

# Write the offline fixtures (flipped-flag manifest v99, pointers, invalid cases); they are
# derived from the committed v1 bytes and never rebuild v1 from source
py -3.12 scripts/build_contract.py --version 1 --fixtures
```

CI runs the build checks (v1, then v2) and the verification on every push. Once v2 is published the
v2 check skips the rebuild comparison, as v1's does, and `check_contract.py` guards its bytes instead. `embeddings.f32` was built once from the reference
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

## Web app

The dashboard reads the contract only through `dashboard-next/src/features/contract/`
(import from `@/features/contract`). It follows `contract/latest.json`, then
`contract/v{N}.json`, then each artifact, checks the sha256 of every response against the
pointer or manifest, and parses it with the hand-mirrored Zod schemas. A hash mismatch, a
403/404 or a schema failure is a typed error, never silently accepted data.

- `NEXT_PUBLIC_CONTRACT_BASE_URL` overrides the base URL. The default is the CloudFront
  domain recorded in `infrastructure/resources.json`
  (`cloudfront.distributions.contract.domain_name`), and a unit test keeps the two equal.
  Only `https` URLs (or `http` on `localhost` / `127.0.0.1`) are accepted.
- Unit tests (`tests/unit/support/contract-fetch.ts`) and every Playwright spec
  (`mockContract()` in `tests/e2e/support/mock-api.ts`, installed by `mockApi()`) serve the
  contract from `contracts/bucket` and `contracts/fixtures` on disk. No test reaches a real
  CloudFront host.

## Known limitations

- The backend `/sites` response still carries an out-of-date embedded-site count in its
  header (44; the data has 48). The contract counts from the records. Cleaning the backend
  header is a Phase 17 task.
- Coverage flags (`has_diel`, `has_detections`, `has_pre_post_event`, `has_effort`) are all
  false in v1 and v2: those artifacts are present as `{"present": false}`. The test fixture
  (version 99, `FIXTURE_CONTRACT_VERSION`) flips one flag so the UI can be tested against "data
  arrived" without a rebuild; it is derived from the committed v1 bytes and a real v2 coexists with it.
