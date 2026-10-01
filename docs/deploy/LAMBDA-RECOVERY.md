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
