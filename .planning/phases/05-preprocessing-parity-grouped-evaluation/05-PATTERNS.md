# Phase 5: Preprocessing Parity & Grouped Evaluation - Pattern Map

**Mapped:** 2026-10-12
**Files analyzed:** 36 new/modified
**Analogs found:** 33 / 36 (3 have only partial analogs; RESEARCH.md code examples cover them)

Line numbers below were read this session at the current HEAD. Where an excerpt is quoted it is verbatim.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `lambdas/shared/reef_audio.py` (new) | utility (shared lib) | transform | `lambdas/shared/contract_stamp.py` | role-match (module pattern); algorithms from RESEARCH Code Examples |
| `lambdas/shared/reef_reference.py` (new) | utility (bundled-data loader) | file-I/O | `lambdas/shared/contract_stamp.py` `load_stamp` | exact (dual-path load) |
| `lambdas/shared/contract_stamp.py` (mod: `stamp_for_model` + `SPEC_VERSION` check, v2 repo path) | utility | transform | itself | exact |
| `lambdas/shared/tests/test_reef_audio.py`, `test_reef_reference.py` (new) | test | transform | `lambdas/shared/tests/test_contract_stamp.py` | exact |
| `lambdas/shared/tests/test_contract_stamp.py` (mod) | test | transform | itself | exact |
| `lambdas/preprocessor/handler.py` (mod: thin, S3 in/out) | handler | event-driven / file-I/O | itself + RESEARCH parity outline | exact |
| `lambdas/preprocessor/tests/` (new dir: handler, parity, embedding fixture, live fixture) | test | request-response (moto) | `lambdas/classifier/tests/test_handler.py` | role-match |
| `lambdas/classifier/handler.py` (mod: per-window, binary reader, bundled refs, ood, projection) | handler | event-driven batch | itself (`convert_floats`, `result_version_stamp`) | exact |
| `lambdas/classifier/tests/test_handler.py` (mod/extend) | test | moto integration | itself | exact |
| `lambdas/router/handler.py` (mod: `/visualize` whitelist) | handler | request-response | itself, lines 512-526 | exact |
| `lambdas/router/tests/test_visualize_stamp.py` (extend) | test | request-response | itself | exact |
| `scripts/lambda_packaging.py` + `scripts/deploy-lambdas.py` (mod: binary-safe readers) | utility | file-I/O | itself (lines 86-92 / 101) | exact |
| `scripts/tests/test_lambda_packaging.py`, `test_deploy_lambdas.py` (extend) | test | file-I/O | itself | exact |
| `infrastructure/lambda-packages/{classifier,preprocessor}.json` (mod) | config | n/a | `classifier.json` | exact |
| `scripts/evaluate_loso.py` (new) | script | batch | `scripts/train_interim_real_only.py` | role-match (reuses its functions) |
| `scripts/reembed_training.py` (new) | script | batch / file-I/O (HTTP range) | `scripts/extract_marrs_excerpts.py` + `download_marrs_samples.py` | role-match |
| `scripts/build_ood_reference.py` (new) | script | batch / transform | `scripts/train_interim_real_only.py` (`file_sha256`, report writer) | partial |
| `scripts/train_interim_real_only.py` (mod/successor retrain invocation) | script | batch | itself | exact |
| `scripts/tests/test_loso_eval.py`, `test_build_ood_reference.py`, `test_build_contract_v2.py` (new) | test | batch | `scripts/tests/test_train_interim_real_only.py`, `test_contract_fixtures.py` | role-match |
| `scripts/build_contract.py` (mod: v2 recipe, sentinel fixture) | script | batch / transform | itself (lines 503-621, 631-800) | exact |
| `scripts/check_contract.py` (mod: spec equality, sentinel, corpus) | script | validation | itself (251-252, 727-761) | exact |
| `scripts/publish_contract.py` (use as-is, no edit) | script | file-I/O | itself | exact |
| `contracts/schema/{evaluation-report,ood-reference}.schema.json`, `analysis-result.schema.json` (add) | config (schema) | n/a | `contracts/schema/*.schema.json` | exact |
| `contracts/bucket/v2/*`, `PUBLISHED.json`, `contracts/fixtures/*` (renumber to sentinel) | data/config | n/a | `contracts/bucket/v1/*` | exact |
| `dashboard-next/src/features/contract/schema.ts` (Zod mirror) | model | transform | itself (`AnalysisResultStampBase` 330-335, `ModelTrainingBase` 228-235) | exact |
| `dashboard-next/tests/unit/contract-schema-parity.test.ts` (PAIRS rows) | test | validation | itself (lines 121-144) | exact |
| `dashboard-next/src/features/contract/published.ts` + `contract-published.test.ts` | config | n/a | itself | exact |
| nine web test/support files re-keyed off v2 (see Q8 list) | test | n/a | `tests/e2e/support/mock-api.ts:63-70` | exact |
| `scripts/verify_live_truth.py`, `scripts/smoke_live.py` (extend) | script | request-response | themselves | exact |
| `models/interim-real-only/evaluation/*` and successor model dir | data | n/a | `models/interim-real-only/` | role-match |
| `requirements-dev.txt` (+ `scipy==1.13.1`) | config | n/a | existing pins | exact |
| `.github/workflows/ci.yml` (+ `build_contract.py --version 2 --check`) | config | n/a | python job lines | exact |

## Pattern Assignments

### `lambdas/shared/reef_audio.py` (utility, transform)

**Analog:** `lambdas/shared/contract_stamp.py` for module shape only. The algorithms have no in-repo analog; copy them from RESEARCH.md "Code Examples" (normalise_window, design_filter, resample_poly_np) and Pitfall 6 (WAV edge cases).

**Module shape to copy** (`contract_stamp.py` 1-26): a docstring that names the requirement and says "Stdlib only", `from __future__ import annotations` (Python 3.11 compatible), `_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))`, UPPER_SNAKE constants (`SPEC_VERSION`, `TARGET_SAMPLE_RATE = 32000`, `WINDOW_SAMPLES = 160000`, `TARGET_PEAK = 0.25`). Note `SPEC_VERSION` must match `^[a-z0-9][a-z0-9.+-]*$` (hyphens only; e.g. `preproc-2026.10.1-reef-audio`), per the contract schema pattern.

**Conflict to resolve in the plan:** CONTEXT amendment says the filter design is frozen in `SPEC_VERSION`; RESEARCH Code Example uses `half_len_factor=10`, `beta=5.0`. Use those values and put both in the spec JSON.

**Existing code that `reef_audio` replaces** (do not copy bugs): `lambdas/preprocessor/handler.py:305-308` (int32 for all 32-bit, 8-bit scaling), `:127` (int16 wrap on overflow).

**Required behaviours checklist** (from RESEARCH Pitfall 6/11): format tags 1, 3, 0xFFFE; even-size chunk padding; truncated data trimmed to whole frames; reject `num_channels == 0`, rate outside 4000-192000, bits not in {8,16,24,32,64f}, declared duration > 600 s before allocating. Raise the existing typed codes (`INVALID_AUDIO_FORMAT`, `AUDIO_TOO_SHORT`, `AUDIO_TOO_LONG`).

---

### `lambdas/shared/reef_reference.py` (utility, file-I/O)

**Analog:** `lambdas/shared/contract_stamp.py:18-52` (dual-path load, no env var).

```python
_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
_BUNDLED_FILENAME = "contract_stamp.json"
_REPO_STAMP_RELATIVE = os.path.join("..", "..", "contracts", "bucket", "v1", "stamp.json")

def load_stamp(path: Optional[str] = None) -> dict:
    if path is None:
        bundled_path = os.path.join(_MODULE_DIR, _BUNDLED_FILENAME)
        if os.path.exists(bundled_path):
            path = bundled_path
        else:
            path = os.path.join(_MODULE_DIR, _REPO_STAMP_RELATIVE)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
```

Apply to: bundled `embeddings.f32` (`np.frombuffer(..., dtype="<f4")`), `row_site_ids`/`sites.json`, `projection.json`, OOD artifact. Add sha256 verification against constants (RESEARCH security table; `np.load(..., allow_pickle=False)` if any npz). Sites metadata (status, country, `label_source_name`, `label_original`, `embedding_row`) comes from `contracts/bucket/v1/sites.json` (RESEARCH Pitfall 10). Tests monkeypatch `_MODULE_DIR` exactly as `test_contract_stamp.py:47-60`.

---

### `lambdas/shared/contract_stamp.py` (utility, modify)

**Analog:** itself. Current `stamp_for_model` (lines 55-76) gates on `loaded_model_version == stamp.get("model_version")`. Extend `covered` with a second condition: `reef_audio.SPEC_VERSION == stamp.get("preprocessing_spec_version")`. Also change `_REPO_STAMP_RELATIVE` (line 26) to `v2` and mirror in `classifier.json` member `contracts/bucket/v1/stamp.json` -> v2 and in `verify_live_truth.py` `DEFAULT_STAMP`.

```python
covered = (
    loaded_model_version is not None
    and loaded_model_version == stamp.get("model_version")
)
```

Pitfall 9: legacy-format segments must yield an uncovered stamp, so the classifier passes the segments sidecar's spec version (or None) into the check rather than reading only the module constant.

---

### `lambdas/shared/tests/test_reef_audio.py`, `test_reef_reference.py` (test)

**Analog:** `lambdas/shared/tests/test_contract_stamp.py`. Copy: module docstring noting `pythonpath = scripts lambdas/shared`, `REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent`, module-scoped fixture reading repo file, `monkeypatch.setattr(cs, "_MODULE_DIR", str(tmp_path))` for the bundled-vs-repo-file tests (lines 38-60). `import reef_audio` works directly (shared dir on pytest path). scipy is imported only here (`pytest.importorskip` is not needed once pinned). Generate edge-case WAVs under `tmp_path`, never under `public/audio`.

---

### `lambdas/preprocessor/handler.py` (handler, event-driven)

**Analog:** itself plus RESEARCH Q7 transport spec and the parity outline. Replace local decode/resample/segment with `reef_audio.audio_to_windows`; write `processed/{analysis_id}/segments.f32` plus sidecar `preprocessing.json` (spec version, window count, per-window peak/rms dBFS, rate, duration, sha256); keep the existing playback `audio.wav` write but clip before the int16 cast (current `handler.py:127` wraps). Keep the existing `lambda_client.invoke(..., InvocationType='Event')` hand-off and add `segments_key`, `num_segments`, `segments_format` to the event. Floor dBFS (e.g. -120.0) and add a `silent` flag; never emit -inf (Pitfall 4). Also remember to add `reef_audio.py` to `preprocessor.json`.

**Package spec pattern** (`infrastructure/lambda-packages/classifier.json`):

```json
{"source": "lambdas/shared/contract_stamp.py", "archive_path": "contract_stamp.py"},
{"source": "contracts/bucket/v1/stamp.json", "archive_path": "contract_stamp.json"}
```

`preprocessor.json` currently has only `handler.py`; add `{"source": "lambdas/shared/reef_audio.py", "archive_path": "reef_audio.py"}`. Classifier adds `reef_audio.py`, `reef_reference.py`, `contracts/bucket/v1/embeddings.f32`, `sites.json`, `projection.json`, the OOD artifact, and the successor model weights/config if bundled.

---

### `lambdas/preprocessor/tests/` (test, moto integration)

**Analog:** `lambdas/classifier/tests/test_handler.py` (lines 1-140): imports `boto3`, `numpy`, `moto.mock_aws`; loads `lambdas/conftest.py` by explicit path (the comment at lines 36-39 explains why a bare `import conftest` collides); uses `load_lambda("preprocessor")` from `lambdas/conftest.py:48-82`; bucket constants `AUDIO_BUCKET = "reefradar-2477-audio"`; a `_clear_tmp_cache`-style helper. `VALID_FUNCTIONS` in conftest already includes `preprocessor`. Stub the downstream invoke by assigning `module.lambda_client.invoke = lambda **kw: calls.append(kw)` (RESEARCH parity outline). Parity assertion is `np.array_equal(live, windows_offline)` on `np.frombuffer(raw, dtype="<f4").reshape(-1, 160000)`.

Embedding-fixture test: store `fixture.npz`/`.f32` plus a JSON of per-window sha256 and the file sha256; the unit test re-derives windows from the 9 files in `dashboard-next/public/audio/marrs/` and compares window hashes. The `live`-marked regeneration test follows the existing live marker at `scripts/tests/test_publish_tools.py:411`; `pytest.ini` has `addopts = -q -m "not live"`.

---

### `lambdas/classifier/handler.py` (handler, per-window batch)

**Analog:** itself.

**DynamoDB-safe conversion to reuse** (lines 25-43):

```python
STORED_FLOAT_DECIMALS = 9
def convert_floats(obj):
    if isinstance(obj, float):
        return Decimal(str(round(obj, STORED_FLOAT_DECIMALS)))
    elif isinstance(obj, dict): ...
    elif isinstance(obj, list): ...
    return obj
```

It only converts Python `float`; NumPy scalars pass through and break the write (Pitfall 4). Convert with `.tolist()`/`float()`/`int()` before calling it, or extend it to handle `np.generic`.

**Stamp pattern to keep** (`result_version_stamp`, lines 797-827): try/except around `stamp_for_model(loaded_model_version, get_contract_stamp())`, `_emit_stamp_metric(...)`, `stamp_status` in `'stamped' | 'uncovered' | 'load_failed'`. Extend with the segments' spec version for Pitfall 9.

**Per-window math:** copy RESEARCH "Per-window classifier math" (batched MLP forward matching `classify_embedding` at ~639-649, softmax, mean of rows, `En @ Rn.T`, `(E - mean) @ components.T`, `1 - (En @ OODn.T).max(axis=1)`).

**Error handling:** keep `InferenceError(message, error_type, retry_count, request_id)` and `RETRY_DELAYS`; add a typed alignment error when `len(embeddings) != n_windows_in_batch` or any row is not length 1280 / finite (Pitfall 5).

**Replace:** lines 160-166 mean pooling; 179-202 RESULT item; 676-737 S3 reference read; 830-892 similarity, including the dead `status_map` (line 854). Top-3 entries must keep the old dict shape (unit-test against old `apply_label_provenance` output for all 48 sites).

---

### `lambdas/classifier/tests/test_handler.py` (test, extend)

**Analog:** itself. Lines 100-140 show `_setup_s3_fixtures`; the `segments_payload = {"segments": ["seg-0","seg-1"], ...}` placeholder fixture must become real 160,000-sample arrays (alignment assertion). Packaging test at the file bottom (uses `import lambda_packaging as pkg`) should assert `embeddings.f32` member bytes equal the source file byte for byte. Weights fixture helper `_build_weights_npz()` (lines 82-95) is reusable for per-window tests.

---

### `lambdas/router/handler.py` (handler, `/visualize` whitelist)

**Analog:** itself lines 513-526 (shown above). Add keys additively:

```python
body = {...existing keys unchanged...}
for key in ('site_similarities', 'projection', 'ood', 'windows', 'input_stats'):
    if key in item:
        body[key] = item[key]
return response(200, body)
```

Legacy items must return the identical legacy key set. Extend `lambdas/router/tests/test_visualize_stamp.py` for both cases.

---

### `scripts/lambda_packaging.py` and `scripts/deploy-lambdas.py` (binary-safe readers)

**Analog:** itself. Current code to change:

`lambda_packaging.py:80-87`
```python
def _default_reader(repo_root, source):
    path = pathlib.Path(repo_root) / source
    try:
        data = path.read_bytes()
    except OSError as e:
        raise SpecError(...) from e
    return normalize_text_bytes(data)
```
`deploy-lambdas.py:101`: `return pkg.normalize_text_bytes(result.stdout)`

Fix per RESEARCH "Binary-safe member reading": add `BINARY_SUFFIXES = (".f32", ".npz", ".bin")` and `normalize_member_bytes(source, data)` in `lambda_packaging.py`; call it from both readers. Also check `drift-check.py` for any separate reader. Update the `normalize_text_bytes` docstring that claims no binary members. Tests: extend `scripts/tests/test_lambda_packaging.py` (fixture_repo pattern, lines 18-40) with a `.f32` file containing `\r\n` bytes and assert byte equality; extend `test_deploy_lambdas.py` for `git_show_reader`. Do this first (CONTEXT: "must fix first").

---

### `scripts/evaluate_loso.py` (script, batch)

**Analog:** `scripts/train_interim_real_only.py`. Import its functions, do not copy them:

```python
import train_interim_real_only as trainer   # as in scripts/tests/test_train_interim_real_only.py:20-24
weights, info = trainer.train_mlp(X_train, y_train, seed=42)   # train_interim_real_only.py:228
probs = trainer.predict_proba(X_test, weights)                 # :151
sha = trainer.file_sha256(path)                                # :99
```

Facts to preserve: `train_mlp` carves its own 15 percent validation split via `stratified_split(y, VALIDATION_FRACTION, seed)` (uses `np.random.default_rng`, lines 195-210); the committed model also had an outer `TEST_SIZE` split (`:434-438`), which LOSO does not replicate, and the report must say so. Labels per fold are `sorted(set(labels))` of the training fold (matches `:425-430`), so ind_N1's fold is a 2-class model. Argparse constants pattern: `DEFAULT_TRAINING`, `DEFAULT_LOCK`, `DEFAULT_OUT` at lines 43-45. Report writer analog: `write_training_report` (line 318). Bootstrap code: RESEARCH "Two-level cluster bootstrap" with `np.random.RandomState` (frozen stream) and record `numpy.__version__`.

Report JSON gets its own `contracts/schema/evaluation-report.schema.json` (additive) validated with jsonschema in a test, and inputs pinned by sha256 including the trainer git sha.

---

### `scripts/reembed_training.py` (script, batch + HTTP range fetch)

**Analog:** `scripts/extract_marrs_excerpts.py` and `scripts/download_marrs_samples.py`.

Imports pattern (`extract_marrs_excerpts.py:38-44`):
```python
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))
from download_marrs_samples import get_zip_central_directory, download_file_from_zip  # noqa: E402
```
Add `lambdas/shared` to `sys.path` the same way for `import reef_audio`.

Listing: `list_figshare_files()` (lines 60-72) paginates `FIGSHARE_API_URL = "https://api.figshare.com/v2/articles/29958062/files"`; `build_figshare_lookup` (75). Range fetch: `get_zip_central_directory(url, file_size)` (`download_marrs_samples.py:106`) and `download_file_from_zip(url, entry)` (`:211`) both use `requests` with `Range` headers and `timeout=30`. Take the first window of each file (RESEARCH A8) so rows stay 1:1 with the originals. Serial live inference calls only (concurrency 10; `--confirm` flag like the deploy scripts). Verify AWS identity first.

---

### `scripts/build_ood_reference.py` (script, batch)

**Analog:** partial. Use `train_interim_real_only.file_sha256` and the report-writing style; artifact layout is `.f32` plus a JSON sidecar (threshold, k=1, metric, source sha256, embedding-space note per Pitfall 8) validated by `ood-reference.schema.json`. Algorithm in RESEARCH Q6/Code Examples: LOSO 95th percentile of each site's nearest-neighbour cosine distance to the other four sites. Test self-check: recompute threshold from the artifact's own rows.

---

### `scripts/build_contract.py`, `scripts/check_contract.py` (contract v2)

**Analog:** themselves.

- Constants to parameterise (`build_contract.py:631-632`): `DATASET_VERSION = "reefradar-reference-2026.10.0"`, `PREPROCESSING_SPEC_VERSION = "preproc-2026.10.0-as-deployed"`. v2 recipe must read `reef_audio` constants instead of `_parse_constant(source, "SEGMENT_DURATION")` over the preprocessor handler (`build_preprocessing_spec`, line 709+). Keep `gap(...)` helper structure (`owner_phase`, `status`, `reference`) for the gaps list: close F8a/F8b/F8c with evidence, F8d stays open, and add the "serving and offline share one pipeline" wording.
- `build_stamp(version, model)` (788-795) returns the four keys; reuse with the new spec version.
- Fixture flip: `build_fixture_files` (588-600) sets `flipped["contract_version"] = version + 1`. Replace with a single `FIXTURE_VERSION = 99` constant and derive filenames from it (`contracts/fixtures/bucket/contract/v99.json`, `latest-v99.json`).
- Checker rule to change (`check_contract.py:251-252`): keep `model_version.preprocessing_spec_version == manifest` and add optional `training.preprocessing_spec_version` instead (Zod `ModelTrainingBase` at `schema.ts:228-235` gains the optional key; `model-version.schema.json` has no `additionalProperties: false` on training).
- `additive_problems` at `check_contract.py:631`; corpus builder `_corpus_instances` at 727: add a full-result analysis-result example, then `py -3.12 scripts/check_contract.py --write-corpus`.
- Reuse v1 dataset artifacts by URI (`build_contract.py:588-592` comment; `SAFE_URI` allows any `v[0-9]+` prefix).
- CI: add `py -3.12 scripts/build_contract.py --version 2 --check` next to the existing `--version 1 --check` line in `.github/workflows/ci.yml` python job.

`scripts/publish_contract.py` is used unchanged (If-None-Match writes, pointer last with If-Match, `--confirm`, budget gate). Commit the post-publish `PUBLISHED.json` and `published.ts`.

---

### Zod mirror and web tests

**Analog:** `dashboard-next/src/features/contract/schema.ts`.

```ts
export const AnalysisResultStampBase = z.looseObject({
  contract_version: positiveInt.nullable(),
  dataset_version: versionString.nullable(),
  model_version: versionString.nullable(),
  preprocessing_spec_version: versionString.nullable(),
});
```
Add the new optional keys (`site_similarities`, `projection`, `ood`, `windows`, ...) here in the same commit as the JSON schema, and nested objects as separate bases with their own `PAIRS` row. `contract-schema-parity.test.ts:121-144` holds `PAIRS: Pair[]` with rows like `{ name: 'analysis result stamp', base: schema.AnalysisResultStampBase, file: 'analysis-result', json: (r) => r }`; add `evaluation-report` and `ood-reference` rows copying an existing row.

Fixture renumber: `tests/e2e/support/mock-api.ts:63-70`:
```ts
} else if (contractPath === 'contract/v2.json') {
  file = path.join(CONTRACT_FIXTURES_DIR, 'bucket', 'contract', 'v2.json');
```
Replace literal `2` with the sentinel constant in this file, `tests/unit/support/contract-fetch.ts:44-45`, `contract-client`, `contract-flip`, `contract-pin`, `contract-published` unit tests (the last uses `useContract(2)` for "unknown to this build"), `analysis-flow`, `contract-flip`, `contract-pin` e2e specs, and `scripts/tests/test_contract_fixtures.py`. Update `contracts/README.md` and `CHANGELOG.md`.

---

### `scripts/verify_live_truth.py` and `scripts/smoke_live.py` (live checks)

**Analog:** themselves.

`verify_live_truth.py:116-133` `check_stamp(body, expected_stamp)` and `:140-170` `check_analysis(...)` return `list[str]` failures; `FAILURES`/`check()` pattern in `smoke_live.py:20-32`. Extend `check_analysis` with additive checks: `ood` present with threshold, `site_similarities` length 48, `projection.explained_variance_ratio`, `classification.probabilities` still sum to 1 (`PROBABILITY_TOLERANCE`), `body.get("visualization")` still falsy, `embedding_summary.aggregation == "mean_of_window_probabilities"`, top-3 `similar_sites` entry keys unchanged. Switch `DEFAULT_STAMP` to v2. Keep the injected `session`/`sleep` parameters (line 214, 259) so the new checks are unit-testable offline.

---

## Shared Patterns

### Shared-module bundling and loading
**Source:** `lambdas/shared/contract_stamp.py:18-52`, `infrastructure/lambda-packages/classifier.json`
**Apply to:** `reef_audio.py`, `reef_reference.py`, anything new in `lambdas/shared`. Flat in the zip, listed explicitly in each spec, prefer bundled file then repo-relative fallback, stdlib+NumPy only.

### Offline Lambda tests with moto
**Source:** `lambdas/conftest.py:1-82`, `lambdas/classifier/tests/test_handler.py:1-100`
**Apply to:** all new Lambda tests. Fake credentials forced at import; `load_lambda(fn)` loads same-named handlers distinctly; load conftest by explicit path in test modules; clear `/tmp` caches per test (`_clear_tmp_cache`).

### Live-only tests
**Source:** `pytest.ini` (`addopts = -q -m "not live"`), `scripts/tests/test_publish_tools.py:411`
**Apply to:** embedding-fixture regeneration, re-embedding. Run with `py -3.12 -m pytest -m live <path>`.

### Honest-numbers rules
**Source:** `.claude/CLAUDE.md` constraints; CONTEXT D-12/D-13
**Apply to:** classifier and router. Never scale probabilities by OOD or region; never repopulate `visualization`; every number carries provenance; report states below-chance LOSO plainly.

### DynamoDB write safety
**Source:** `classifier/handler.py:25-43`
**Apply to:** classifier RESULT item. NumPy scalars to Python types first; floor dBFS; no inf/NaN.

### Deploy discipline
**Source:** CLAUDE.md Deployment section; `scripts/deploy-lambdas.py`
**Apply to:** rollout tasks. `--dry-run`, then `--confirm` from a clean tree; classifier and router first, preprocessor last; publish contract v2 before a classifier stamping v2; `drift-check.py --function all` until MATCH; commit as tylerlubyhoward@gmail.com.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| polyphase resampler, WAV decoder inside `reef_audio.py` | utility | transform | Only the buggy inline versions in `preprocessor/handler.py`; use RESEARCH Code Examples and scipy as test oracle |
| two-level cluster bootstrap in `evaluate_loso.py` | utility | batch | No bootstrap code in repo; use RESEARCH Q6 snippet |
| binary segment transport (ranged S3 GET) | service | streaming | Existing path is JSON `segments.json`; no ranged reads yet; moto supports ranged GET (RESEARCH Q7) |

## Metadata

**Analog search scope:** `lambdas/**`, `scripts/**`, `scripts/tests`, `infrastructure/lambda-packages`, `dashboard-next/src/features/contract`, `dashboard-next/tests`
**Files scanned/read:** about 25
**Pattern extraction date:** 2026-10-12
