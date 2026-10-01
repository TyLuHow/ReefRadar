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
