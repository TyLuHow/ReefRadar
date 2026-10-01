# Lambda Deployment Recovery (D-01)

Recovers the code actually running in every `reefradar-2477-*` Lambda into git, so
git becomes the source of truth for this project from this commit onward. Per
`01-CONTEXT.md` D-01/D-23: this plan only reads AWS (no deploys, no writes).

## Access check

Ran, in order, stopping at the first failure (none failed):

| Check | Command | Result |
|---|---|---|
| Account identity | `aws sts get-caller-identity --profile reefradar --region us-east-1` | Account `781978598306` confirmed. Caller: IAM user `reefradar-agent` (role/user name only; no access key id recorded here). |
| Lambda read | `aws lambda get-function-configuration --function-name reefradar-2477-router --profile reefradar --region us-east-1` | Succeeded — `CodeSha256`, `LastModified`, config readable. |
| S3 read | `aws s3 ls s3://reefradar-2477-embeddings/models/ --profile reefradar` | Succeeded — lists `model_config.json`, `reef_classifier_weights.npz`, `surfperch/`. |
| ECR read | `aws ecr describe-images --repository-name reefradar-2477-inference --max-items 1 --profile reefradar --region us-east-1` | Succeeded — one active image digest returned. |

Read access to account `781978598306` is confirmed. No access key ids, secret keys, or
env-var values appear in this document.

## Recovery summary (Tasks 2–3)

See per-function sections below. Full per-function config is recorded without secret
values in `infrastructure/deployed-state.json`.

### router (`reefradar-2477-router`)

- **CodeSha256:** `bfU0WTb89Oa/EKB0VOneG86u2ISzO4MzedRujHsjOxE=`
- **LastModified:** `2026-03-07T19:16:30.000+0000`
- **CodeSize:** 5777 bytes
- **Members:** `handler.py` only (single file, matches `infrastructure/lambda-packages/router.json` unchanged — no spec edit needed)
- **Secret scan:** no hits (AWS key id patterns, `aws_secret_access_key`, PEM private-key headers, `.env` filenames, hardcoded `Authorization`/token assignments) across the one zip member
- **Vendored packages:** none — single first-party `handler.py`, no `dist-info`/`site-packages` trees
- **Diff vs git (before this commit):** one route added to the dispatch table (`('GET', '/samples'): handle_get_samples`) and three new module-level additions near the end of the file:
  - `CURATED_SAMPLES` — a **static Python list** of 8 curated samples (id, site_id, name, country, category, description, duration, `s3_key`, frequency highlights, coordinates). This is the live `/samples` source referenced by `01-CONTEXT.md` D-02/D-09 — static metadata, not an S3-stored manifest.
  - `SAMPLE_STORIES` — a static dict of 3 curated story groupings (`healthy_vs_degraded`, `restoration_timeline`, `geographic_diversity`), each referencing `sample_ids` from `CURATED_SAMPLES`.
  - `handle_get_samples(event)` — for each `CURATED_SAMPLES` entry, calls `s3.generate_presigned_url('get_object', Params={'Bucket': AUDIO_BUCKET, 'Key': sample['s3_key']}, ExpiresIn=3600)` and returns `{samples: [...], stories: SAMPLE_STORIES}`. The audio bytes themselves live in S3 (`AUDIO_BUCKET`/`samples/*.wav`); only the catalog (name, description, coordinates, category) is static in code.
- **Result:** `py -3.12 scripts/drift-check.py --function router` → `MATCH` (exit 0). `grep -c "/samples" lambdas/router/handler.py` → 1. `py -3.12 -m pytest lambdas -x` → 28 passed. No `.zip` files left in the repo (downloaded to OS temp dir, outside the working tree).

### preprocessor (`reefradar-2477-preprocessor`)

- **CodeSha256:** `StVZQB8v8GAEkcEJkPERYuYDSCkiUkGkHBP1yDrklWk=`
- **LastModified:** `2026-02-20T18:19:15.000+0000`
- **CodeSize:** 13668 bytes
- **Members:** `handler.py` only — matches `infrastructure/lambda-packages/preprocessor.json`
- **Secret scan:** no hits
- **Vendored packages:** none
- **Diff vs git:** **none.** Deployed `handler.py` is byte-identical (after CRLF→LF normalization) to the committed git copy. `py -3.12 scripts/drift-check.py --function preprocessor` already reported `MATCH` before any file was touched — no commit was needed for this function.

### classifier (`reefradar-2477-classifier`)

- **CodeSha256:** `DpgOFTR156CbiBsnjM+8RLYI5Twr8e4FEUtbDU6qknw=`
- **LastModified:** `2026-02-27T19:40:05.000+0000`
- **CodeSize:** 8175 bytes
- **Members:** `handler.py`, `region_detection.py` — matches `infrastructure/lambda-packages/classifier.json`
- **Secret scan:** no hits (both members)
- **Vendored packages:** none
- **Diff vs git:** **none.** Both deployed members are byte-identical (after CRLF→LF normalization) to the committed git copies. `py -3.12 scripts/drift-check.py --function classifier` already reported `MATCH` — no commit was needed for this function.

### inference (`reefradar-2477-inference`, container)

- **ImageUri:** `781978598306.dkr.ecr.us-east-1.amazonaws.com/reefradar-2477-inference:latest`
- **ResolvedImageUri (digest):** `781978598306.dkr.ecr.us-east-1.amazonaws.com/reefradar-2477-inference@sha256:cd0e2729a277abcb25ad3ed9f7236f20c97aac03ec4f784350147b6e32a47bb7`
- **LastModified:** `2026-02-20T19:21:42.000+0000`
- **Extraction method:** `scripts/drift-check.py`'s live container path — resolves the image digest, calls `ecr:BatchGetImage` for the manifest, downloads each layer via `ecr:GetDownloadUrlForLayer`, and extracts `var/task/inference.py` from the assembled layers (applying OCI whiteouts) without ever writing a layer to the repo.
- **Diff vs git:** **none.** `infrastructure/lambda_container/inference.py` in git matches the file extracted from the deployed image layers. `py -3.12 scripts/drift-check.py --function inference` reported `MATCH` — no commit was needed for this function.

## Overall result

`py -3.12 scripts/drift-check.py --function all --json` — all four functions report
`{"missing": [], "extra": [], "changed": []}` (MATCH), exit 0.

`py -3.12 -m pytest lambdas scripts/tests -x` — 87 passed.

Of the four functions, only **router** had actual drift (the undocumented `/samples`
route); preprocessor, classifier, and inference were already byte-identical to git.
Per-function deployed configuration (runtime, handler, layers, memory, timeout,
CodeSha256/image digest, environment variable **names** only) is recorded in
`infrastructure/deployed-state.json`.
