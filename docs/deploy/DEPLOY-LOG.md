# Production Deploy Log

Record of production changes made by the Phase 1 backend truth deploy (plan 01-14).
No credentials, presigned URLs or Lambda environment values appear in this file.

## Attempt 1 (2026-10-01): ROLLED BACK after live verification failed

**Status:** production was returned to its pre-deploy behaviour (superseded: attempt 2 below succeeded).
The real MARRS excerpts under `samples/marrs/` and the model archive remain in S3 (additive, harmless).

### Approving decision

On 2026-10-01 the owner was shown, at commit `24939892` (repo HEAD at the time): the deploy-lambdas
dry-run for classifier and router, the S3 state (eight synthetic clips under
`s3://reefradar-2477-audio/samples/`: aus_degraded_reef, aus_healthy_gbr, aus_healthy_outer,
aus_restored_reef, idn_healthy_dawn, idn_restored_mid, mex_restored_carib, phl_degraded_reef; v2.0 model in
`s3://reefradar-2477-embeddings/models/` dated 2026-02-04), the five deploy steps and the transitional
frontend effects. The owner selected **deploy-now** (including retirement of the synthetic clips to
`retired/`, archived not destroyed) and re-confirmed "Deploy now".

### Commits

- Deployed from `c4a5c771e9deadae246b34540440545e39a7ddc9` (adds the sync/publish/verify scripts; clean tree).
- Rolled back to the code of `26b3e6103cca3227b5e1770381f59864345c58e1` (01-09 recovery commit; git == deployed at that point).
- Follow-up fix to the verifier only: `9d055e1` (no deployable file changed).

### Dry-run output captured before each confirm run

`py -3.12 scripts/deploy-lambdas.py --function classifier --function router --dry-run`

```
reefradar-2477-classifier: 4 member(s), code_sha256=jCDobm45tCUpCPAVxGfB0aCBCnWbV7xi2sodsA3uKMI=, git_sha=c4a5c771e9deadae246b34540440545e39a7ddc9
reefradar-2477-router: 4 member(s), code_sha256=QAN8peUHi+MGf/S/KtehybiadQPtC4+A6RW5iV/EOS4=, git_sha=c4a5c771e9deadae246b34540440545e39a7ddc9
```

`py -3.12 scripts/sync_sample_audio.py --dry-run`: 9 manifest excerpts to `samples/marrs/`, all `[new]`.

`py -3.12 scripts/publish_model.py --dry-run`: live config/weights sha256 equal the audited v2.0 lock
(`dfe29cb2...` / `172d56ce...`); action `archive_and_publish`.

### What changed in production

| Step | Result |
|---|---|
| Upload real audio | 9 objects under `s3://reefradar-2477-audio/samples/marrs/`, each re-downloaded and sha256-verified against `data/audio-manifest.json` |
| Archive v2.0 model | `s3://reefradar-2477-embeddings/models/archive/2.0-20261001/model_config.json` (sha256 `dfe29cb23b2a587bd70ae3aee3613f3f8db7b8c907d63036131d0b6ef5a5a07f`) and `reef_classifier_weights.npz` (sha256 `172d56ced02ed402652c6c710c409b77bfddb136859c54037ed091d50bb77faf`), both verified equal to the lock before overwrite |
| Publish interim model | `models/model_config.json` sha256 `9781d1ab16794402057b7ac405432952e2d8ce84bf2dfac6e752a8e78fdbf658`, `models/reef_classifier_weights.npz` sha256 `ab9e383043ef1bd9e693facf43fdcdac76a640e693b2f834f4fa567561dedcf4`, verified after upload |
| Deploy classifier | CodeSha256 before `DpgOFTR156CbiBsnjM+8RLYI5Twr8e4FEUtbDU6qknw=` -> after `jCDobm45tCUpCPAVxGfB0aCBCnWbV7xi2sodsA3uKMI=` (15:36:53Z) |
| Deploy router | CodeSha256 before `bfU0WTb89Oa/EKB0VOneG86u2ISzO4MzedRujHsjOxE=` -> after `QAN8peUHi+MGf/S/KtehybiadQPtC4+A6RW5iV/EOS4=` (15:37:04Z) |
| Retire synthetic clips | NOT run (verification failed first) |

### Verification outcome

`py -3.12 scripts/verify_live_truth.py` against the deployed code:

- `/sites` provenance: PASS (54 sites, all with label_source, Bora-Bora and Irma `unknown`).
- `/samples` ids: PASS. `/samples` audio real and hash-matched: PASS (9 clips, sha256 equal to the manifest, none flagged synthetic).
- Analysis checks: FAIL, for two different reasons.
  1. First two runs: `GET /visualize` returned 404 `ANALYSIS_NOT_FOUND` right after `POST /analyze`. This is a verifier bug (the legacy route 404s until preprocessing has written its record; the frontend polls `/status`). Fixed in `9d055e1`. `POST /upload` and `POST /analyze` (HTTP 202) succeeded under the new router.
  2. Third run: `GET /status` and `POST /upload` returned HTTP 503, and a plain `GET /health` returned 503 on every retry over ~10 seconds (whole API unavailable). No analysis result was ever obtained under the new code, so the probability/model/region checks were never evaluated.

### Rollback performed (15:39Z)

Per the plan's rule (live verification failed), executed immediately:

```
py -3.12 scripts/deploy-lambdas.py --function classifier --function router --ref 26b3e61 --confirm
py -3.12 -m awscli s3 cp s3://reefradar-2477-embeddings/models/archive/2.0-20261001/model_config.json s3://reefradar-2477-embeddings/models/model_config.json --profile reefradar
py -3.12 -m awscli s3 cp s3://reefradar-2477-embeddings/models/archive/2.0-20261001/reef_classifier_weights.npz s3://reefradar-2477-embeddings/models/reef_classifier_weights.npz --profile reefradar
```

Rollback deploy records: classifier `f5/YQCndbLXD3bNjWWgrcvFiK4sdZVdDRKU18l4Jfg8=` (15:39:36Z), router
`Cs98AU112N/HIcAhW5GE8qKw50xGxFZQThS57l/j8sU=` (15:39:43Z). These packages carry the old handlers plus the
bundled provenance/manifest members the current spec lists (unused by the old code), so their CodeSha256 differs
from the original pre-deploy values; behaviour is the pre-deploy code. After the rollback: `/health`, `/sites`
and `/samples` return 200, and `publish_model.py --dry-run` shows the live model hashes equal the v2.0 lock.

### Root cause of the 503 (established afterwards from CloudWatch)

Hypothesis 1 (account-level concurrency saturation) was confirmed; the new code was not implicated.

- The AWS account Lambda concurrent-executions limit is 10 (new-account default).
- At 15:37Z the first two analyses hit a cold inference container: the classifier logged
  `CodeArtifactUserPendingException` ("Lambda is initializing your function") 3 times and failed with `InferenceError`.
  Lambda's default asynchronous retries re-ran those classifier invocations, and the buggy verifier added more analyses.
- 15:38-15:39Z: account `ConcurrentExecutions` maximum reached 10; router Throttles = 5 + 3 (surfaced as API Gateway 503);
  inference Throttles = 25 ("Rate Exceeded"). No classifier errors other than inference-invoke failures.
- Mitigation: Service Quotas request `4b8d23edbdcf43d9a9eee46fddc7b589IQUhYJr5` was filed to raise Lambda concurrent
  executions from 10 to 1000 (still PENDING when attempt 2 ran). Attempt 2 relied on the serial verifier (about 3-4
  concurrent slots) plus a pre-warmed inference container.

## Attempt 2 (2026-10-01): SUCCEEDED, verified live

### Approving decision

After being shown the root cause above, the owner explicitly chose "Retry now + request quota" (the owner's
`deploy-now` decision of 2026-10-01 stands, including retirement of the synthetic clips to `retired/`).

### Procedure and results

1. Clean tree at `1433f0838c2c78b00cef49b5a1adabd4bb7fd808` (branch `redesign/v2-discovery`); deployed from that commit.
2. Pre-flight: `GET /health` 200; CloudWatch `ConcurrentExecutions` for the previous 4 minutes had no datapoints (idle).
3. Warm-up: one `lambda invoke` of `reefradar-2477-inference` with payload `{}` (StatusCode 200; response not recorded).
4. `sync_sample_audio.py --confirm`: 9 manifest excerpts already present under `samples/marrs/`; re-uploaded idempotently and
   re-downloaded sha256-verified (all `verified: true`).
5. `publish_model.py --confirm`: archive `models/archive/2.0-20261001/` already matched the v2.0 lock (sha256 re-verified);
   interim artifacts published and verified (config `9781d1ab...f658`, weights `ab9e3830...dedcf4`).
6. Deploy (scripted path, clean tree):

| Function | CodeSha256 before | CodeSha256 after | Time (UTC) |
|---|---|---|---|
| reefradar-2477-classifier | `f5/YQCndbLXD3bNjWWgrcvFiK4sdZVdDRKU18l4Jfg8=` (attempt-1 rollback build) | `jCDobm45tCUpCPAVxGfB0aCBCnWbV7xi2sodsA3uKMI=` | 16:23:24 |
| reefradar-2477-router | `Cs98AU112N/HIcAhW5GE8qKw50xGxFZQThS57l/j8sU=` (attempt-1 rollback build) | `QAN8peUHi+MGf/S/KtehybiadQPtC4+A6RW5iV/EOS4=` | 16:23:32 |

   Both records carry `git_sha=1433f0838c2c78b00cef49b5a1adabd4bb7fd808`.

7. `verify_live_truth.py` (first run, before retirement): exit 0. PASS /sites provenance; PASS /samples ids; PASS /samples
   audio real and hash-matched (9 clips); PASS analysis with coordinates (29 s, includes a cold path); PASS analysis without
   coordinates (13 s). No 503, no throttling, no inference-initialising errors.
8. Retirement: `sync_sample_audio.py --retire --confirm` moved eight synthetic clips from `samples/` to
   `s3://reefradar-2477-audio/retired/synthetic-samples-20261001/` (size verified, then original deleted):
   `aus_degraded_reef.wav`, `aus_healthy_gbr.wav`, `aus_healthy_outer.wav`, `aus_restored_reef.wav`,
   `idn_healthy_dawn.wav`, `idn_restored_mid.wav`, `mex_restored_carib.wav`, `phl_degraded_reef.wav`.
   `aws s3 ls s3://reefradar-2477-audio/samples/ --recursive | grep -vc "samples/marrs/"` now prints 0.
9. Re-ran `verify_live_truth.py` after retirement: exit 0, all five checks PASS (analysis 14 s and 13 s).
   `drift-check.py --function all`: router, preprocessor, classifier, inference all MATCH, exit 0.
10. `infrastructure/deployed-state.json` refreshed from a read-only boto3 query (environment variable names only).

### Verification evidence (post-retirement run)

| Check | Analysis id | Result |
|---|---|---|
| With coordinates (ind_H1 excerpt) | `d5e62ea6-d107-44a5-a54f-c8ee87a0d204` | label `degraded`, model_version `interim-real-only`, probability sum 1.0, region INDONESIA / specific / coordinates_provided true / in_training_region true / training_sites_in_region 4 |
| Without coordinates | `25e425f7-6c01-44b3-9e55-4b74a683e3e5` | label `degraded`, model_version `interim-real-only`, probability sum 1.0, region UNKNOWN / coordinates_provided false / in_training_region false |

Observation for Phase 5 only: `similar_sites` count is 0 for both analyses (the router/classifier no longer return
embedding-space similarity data; nothing is displayed from it).

(Earlier same-day run, before retirement: analyses `3986c78d-7451-4ca5-99df-24c9fb5cebfd` and
`bf4012a7-b1ba-4284-b47b-0b2553ae7a62`, same outcomes.)

### Deployed S3 state after attempt 2

- `s3://reefradar-2477-audio/samples/marrs/`: 9 real MARRS excerpts (sha256 equal to `data/audio-manifest.json`); nothing else under `samples/`.
- `s3://reefradar-2477-audio/retired/synthetic-samples-20261001/`: the 8 retired synthetic clips (archived, not destroyed).
- `s3://reefradar-2477-embeddings/models/`: interim real-only model; v2.0 archived at `models/archive/2.0-20261001/`.

### Follow-up

Lambda account concurrency is still 10 until the Service Quotas request is granted. Until then, avoid running several
analyses at once, and warm the inference container (one `lambda invoke` with payload `{}`) before a burst or a verification run.

## Post-review redeploy (2026-10-01): SUCCEEDED, verified live

### Approving decision

After the Phase 1 code review (`.planning/phases/01-truth-reproducibility/01-REVIEW.md`, 3 critical / 21 warning), the
owner chose "Fix all + redeploy": apply the critical and warning fixes (including Lambda code) and redeploy router and
classifier through `scripts/deploy-lambdas.py` with serial live verification. This included setting the classifier's
async `MaximumRetryAttempts` to 0 (review WR-03).

### What changed in production

| Function | CodeSha256 before | CodeSha256 after | Commit | Deployed (UTC) |
|---|---|---|---|---|
| classifier | `jCDobm45tCUpCPAVxGfB0aCBCnWbV7xi2sodsA3uKMI=` | `sgWyJBm6O7QhimTQnGiR73wB2KrFsZLbwct8EyqJJ10=` | `1efa3a1` | 19:06:54 |
| router | `QAN8peUHi+MGf/S/KtehybiadQPtC4+A6RW5iV/EOS4=` | `2PdfLkQ7cJgs8QTcxKEIdfWmcrhpdqDnazJstkOaul4=` | `1efa3a1` | 19:07:02 |
| classifier | `sgWyJBm6O7QhimTQnGiR73wB2KrFsZLbwct8EyqJJ10=` | `PTJpriO5u+Z6PKvVzJh+vBtuqKILBiD5+XBYJfd1LQg=` | `6e2e962` | 19:14:19 |

- Classifier event-invoke config: `MaximumRetryAttempts=0` (was the Lambda default, 2).
- No S3 or model changes.
- The second classifier deploy fixed a defect that the WR-05 change surfaced. The published reference objects store
  per-site vectors under `embedding`, but the classifier only read `mean_embedding`. As a result, similar-site matching
  had silently returned nothing in every production analysis to date. After the WR-05 fix, the result carried an
  honest `similar_sites_error` note instead of an empty list.

### Verification

- Pre-flight: `/health` 200. Account ConcurrentExecutions had no datapoints in the previous 5 minutes. One inference warm-up invoke returned StatusCode 200.
- `py -3.12 scripts/verify_live_truth.py` exited 0 after each deploy.
  - Final run, with coordinates: analysis `3f5375f1-da8b-4655-bb11-1d443277ba04`.
  - Final run, without coordinates: analysis `a23ed17e-acd2-4902-97e3-d9ffa75e4298`.
  - Both used model `interim-real-only`, had a probability sum of 0.999999999 and returned `similar_sites_count` 3.
- Similar sites for the `ind_H1` excerpt were `ind_H2` 0.823, `ind_R5` 0.799 and `ind_H1` 0.789, all MARRS-labelled.
- Observation for Phase 5/12: the interim model classifies this healthy-labelled excerpt as `degraded` (0.956). This is the honest interim model output, not a deploy defect.
- `py -3.12 scripts/drift-check.py --function all`: router, preprocessor, classifier and inference all MATCH, exit 0.

## Rollback

Exact commands, valid for any future deploy of this plan.

Since review fix CR-03, `--ref` builds the package from the ref's own spec, so a rollback deploys exactly what that
commit contained. To return to the attempt-2 code (before the review fixes), use `--ref 1433f08`. To restore the
classifier's previous async retry behaviour:
`py -3.12 -m awscli lambda put-function-event-invoke-config --function-name reefradar-2477-classifier --maximum-retry-attempts 2 --profile reefradar --region us-east-1`.
`scripts/publish_model.py --rollback <archive-prefix>` now restores an archived model through the scripted path, as an alternative to step 2 below.

1. Lambdas (restores the 01-09 recovery code; works with the working tree dirty):

   ```
   py -3.12 scripts/deploy-lambdas.py --function classifier --function router --ref 26b3e61 --confirm
   ```

2. Model, if it was replaced (archive prefix is printed by `publish_model.py`; example date 20261001):

   ```
   py -3.12 -m awscli s3 cp s3://reefradar-2477-embeddings/models/archive/2.0-20261001/model_config.json s3://reefradar-2477-embeddings/models/model_config.json --profile reefradar
   py -3.12 -m awscli s3 cp s3://reefradar-2477-embeddings/models/archive/2.0-20261001/reef_classifier_weights.npz s3://reefradar-2477-embeddings/models/reef_classifier_weights.npz --profile reefradar
   ```

3. Retired synthetic clips, if retirement had run (date stamp from the `retire` JSON line):

   ```
   py -3.12 -m awscli s3 cp s3://reefradar-2477-audio/retired/synthetic-samples-<YYYYMMDD>/ s3://reefradar-2477-audio/samples/ --recursive --profile reefradar
   ```

4. Confirm: `py -3.12 scripts/publish_model.py --dry-run` shows live hashes equal to
   `docs/model/deployed-model.lock.json`, and `GET /health` returns 200.

## Phase 2: contract infrastructure (2026-10-01)

Plan 02-02. AWS resources for the data contract, created through `scripts/setup_contract_infra.py` only (no console
edits). No credentials, presigned URLs or addresses appear in this section.

### Approving decision

- The owner's standing approval for AWS changes within the 25 USD/month ceiling (`DRIVING-QUESTIONS.md`).
- The owner's decision recorded in `02-CONTEXT.md`, "Owner decisions after research" (2026-10-01): replace the
  alert-less 50 USD budget with a single 25 USD/month budget that emails alerts at 80% and 100% of actual spend and at
  100% of forecast spend.

### Budget (created 2026-10-01, before any contract publish)

| Item | Value |
|---|---|
| Name | `reefradar-2477-ceiling-25` |
| Type, period, limit | COST, MONTHLY, 25 USD |
| Notification 1 | ACTUAL greater than 80% |
| Notification 2 | ACTUAL greater than 100% |
| Notification 3 | FORECASTED greater than 100% |
| Subscribers | one EMAIL subscriber per notification: the owner alert address per 02-CONTEXT.md |

The new budget and all three notifications (with their subscribers) were read back before the old budget was removed.
Budget data lags by several hours, so this is an alarm, not a spend stop.

### Legacy budget removed

`reefradar-2477-budget` had no notifications, so it never alerted. Prior parameters: COST, MONTHLY, limit 50.0 USD,
no cost filters, default cost types (tax, subscription, refund, credit, upfront, recurring, other subscription,
support and discount all included; blended and amortized off). Deleted after the read-back above.

To recreate it, save this as `legacy-budget.json` and run the command below:

```
{
  "BudgetName": "reefradar-2477-budget",
  "BudgetType": "COST",
  "TimeUnit": "MONTHLY",
  "BudgetLimit": {"Amount": "50.0", "Unit": "USD"},
  "CostFilters": {},
  "CostTypes": {"IncludeTax": true, "IncludeSubscription": true, "UseBlended": false, "IncludeRefund": true,
                "IncludeCredit": true, "IncludeUpfront": true, "IncludeRecurring": true,
                "IncludeOtherSubscription": true, "IncludeSupport": true, "IncludeDiscount": true,
                "UseAmortized": false}
}
```

```
py -3.12 -m awscli budgets create-budget --account-id 781978598306 --budget file://legacy-budget.json --profile reefradar
```

### Commands used

```
py -3.12 scripts/setup_contract_infra.py --step budget --dry-run --notify-email <owner alert address>
py -3.12 scripts/setup_contract_infra.py --step budget --confirm --notify-email <owner alert address>
py -3.12 scripts/setup_contract_infra.py --step budget --verify
py -3.12 scripts/setup_contract_infra.py --step budget --record-resources
```

The first `--confirm` created the budget and its notifications, then stopped at the read-back because the real Budgets API
omits `ThresholdType` when it is the default (PERCENTAGE). The script was fixed (`155b40d`) and `--confirm` was re-run: it
created nothing, read the budget back (3 notifications) and then deleted the legacy budget, which also demonstrates the
idempotent resume.

### Rollback (budget)

Delete the new budget with
`py -3.12 -m awscli budgets delete-budget --account-id 781978598306 --budget-name reefradar-2477-ceiling-25 --profile reefradar`
and recreate the legacy one with the command above. Do this only together with a replacement alarm: the contract publish
requires an armed budget.

### Contract storage (created 2026-10-01, after the budget alarm)

Nothing is published yet: the bucket is empty until plan 02-06. The same approving decision as above applies (standing
approval for AWS changes within the 25 USD/month ceiling).

| Item | Value |
|---|---|
| Bucket | `reefradar-2477-contract`, us-east-1, no website hosting, no bucket CORS, tag `Project=reefradar-2477` |
| Bucket settings | all four public-access-block flags on; object ownership BucketOwnerEnforced; default encryption SSE-S3 (AES256) |
| Origin access control | `reefradar-2477-contract-oac` (`E3JD4NDX1VQA27`): sigv4, signing always, origin type s3 |
| Distribution | `E1SD3UZ4FZ1GWL`, domain `d7dr1fzple2sg.cloudfront.net`, comment `reefradar-2477-contract`, enabled, deployed, pay-as-you-go (no flat-rate plan) |
| Origin | `reefradar-2477-contract.s3.us-east-1.amazonaws.com` through the OAC (no legacy origin access identity) |
| Behaviour | redirect HTTP to HTTPS; GET and HEAD only; compression on; HTTP/2 and HTTP/3; IPv6 on; PriceClass_All |
| Cache policy | AWS managed `Managed-CachingOptimized` (honours the origin `Cache-Control` set by the publisher) |
| CORS | AWS managed `Managed-SimpleCORS` response-headers policy (`Access-Control-Allow-Origin: *`, no credentials): the data is public, open-licensed and fetched without credentials, and `*.vercel.app` preview hosts cannot be listed in advance |
| Error caching | 403 and 404 cached for 10 seconds, no custom error page |
| Bucket policy | exactly one statement: Allow `s3:GetObject` on `arn:aws:s3:::reefradar-2477-contract/*` to `cloudfront.amazonaws.com`, conditioned on `AWS:SourceArn` = this distribution. No `s3:ListBucket`, no wildcard principal |

The bucket policy is written only after the distribution reports Deployed. The CloudFront domain above becomes the web
app's default contract base URL (plan 02-07). No invalidation is ever needed: versions are immutable and
`contract/latest.json` has a 60 second TTL.

Commands used:

```
py -3.12 scripts/setup_contract_infra.py --step storage --dry-run
py -3.12 scripts/setup_contract_infra.py --step storage --confirm
py -3.12 scripts/setup_contract_infra.py --step all --verify
py -3.12 scripts/setup_contract_infra.py --step all --record-resources
```

Verification (unauthenticated HTTPS probes, status codes only): a direct S3 GET of `contract/latest.json` returned 403;
a CloudFront GET of a missing key returned 403; CloudFront `contract/latest.json` returned 403 (bucket empty); the
CloudFront root path returned 403 and no `ListBucketResult` body. A second `--confirm` created and changed nothing, and
a later `--step all --dry-run` listed no create or update action.

### Rollback (storage)

The bucket is empty and unused until 02-06, so removal is safe now. Once content is published, removing it takes the
site data with it, so publish a replacement first.

1. Disable the distribution (CloudFront needs the current ETag and config):

   ```
   py -3.12 -m awscli cloudfront get-distribution-config --id E1SD3UZ4FZ1GWL --profile reefradar
   ```

   Save the `DistributionConfig` part to `dist.json` with `"Enabled": false`, then:

   ```
   py -3.12 -m awscli cloudfront update-distribution --id E1SD3UZ4FZ1GWL --if-match <ETag> --distribution-config file://dist.json --profile reefradar
   ```

2. When the distribution status is Deployed, delete it:
   `py -3.12 -m awscli cloudfront delete-distribution --id E1SD3UZ4FZ1GWL --if-match <new ETag> --profile reefradar`
3. Delete the origin access control:
   `py -3.12 -m awscli cloudfront delete-origin-access-control --id E3JD4NDX1VQA27 --if-match <ETag> --profile reefradar`
4. Delete the empty bucket:
   `py -3.12 -m awscli s3api delete-bucket --bucket reefradar-2477-contract --profile reefradar`
5. Remove the `s3.buckets.contract` and `cloudfront` entries from `infrastructure/resources.json`.

## Contract v1 publish (2026-10-02)

First production publish of the data contract. Published 2026-10-02T00:58:50Z (UTC; local date 2026-10-01).

### Approving decision

The owner's standing approval for all production deployment decisions and S3 object changes within the 25 USD/month
ceiling (`.planning/research/DRIVING-QUESTIONS.md`, "Standing owner approvals (2026-10-01)"), together with the Phase 2
decision in `02-CONTEXT.md` to freeze the post-Phase-1 data as v1 and publish it with `scripts/publish_contract.py`.
Nothing in the production frontend reads the contract yet (merge to main is on hold).

### Source and endpoint

| Item | Value |
|---|---|
| Git sha published from | `a4b2f81954a031e41f0f3c202d45f33ac56bd895` (branch `redesign/v2-discovery`, `contracts/` clean) |
| Bucket | `reefradar-2477-contract` (private, served only through CloudFront) |
| CloudFront domain | `d7dr1fzple2sg.cloudfront.net` (distribution `E1SD3UZ4FZ1GWL`) |
| Budget gate | passed: `reefradar-2477-ceiling-25`, 3 notifications |
| Manifest sha256 | `c9d520addac040f4e7f2c74dce2678e4b3365779f176f8f90a004bf04db7bcb2` |

### Commands run

```
py -3.12 scripts/check_contract.py --check --additive
py -3.12 scripts/setup_contract_infra.py --step all --verify
py -3.12 scripts/publish_contract.py --version 1 --dry-run
py -3.12 scripts/publish_contract.py --version 1 --confirm
py -3.12 scripts/verify_contract_live.py --expect-latest 1
py -3.12 scripts/publish_contract.py --set-latest 1 --dry-run
```

### Published keys (all `created`; the pointer was written last)

| Key | Bytes | sha256 |
|---|---|---|
| `v1/embeddings.f32` | 245760 | `f73ab3a45422d43227ba0006d229fd801a541b3c36138012b42ccb40517816ec` |
| `v1/model_version.json` | 1651 | `13a6ada8fb699558887b5fdfb4d9b7c78d2c528afdebfcf60303ddf63af12cd5` |
| `v1/preprocessing_spec.json` | 2568 | `4b02ca76c6fa5ff7c3032641ad59d52f15b579b6278f902e1b30b472ea0711e9` |
| `v1/projection.json` | 77509 | `da2ab7cc4142e36e3ff2dccfd10e135d3328f2a10635e63cd77d7046ea026c14` |
| `v1/schema/analysis-result.schema.json` | 1733 | `1c7810236fa4c5398e30f67d950e0946efca8d3a9979edbabc699e48acb1fa32` |
| `v1/schema/contract-manifest.schema.json` | 7470 | `ffbe3072befcf2a40aee62ea26b8592cc711e0b8875b153f206d679488292a5b` |
| `v1/schema/contract-pointer.schema.json` | 677 | `d101ccab16f01084d8c180fed71dd04b78665b606d7b1fe70aa9a126d48a31bf` |
| `v1/schema/model-version.schema.json` | 4124 | `b1cf898d3a637b347c549790879b39c617b2ceb146d32673f8ec2818fe2a8407` |
| `v1/schema/preprocessing-spec.schema.json` | 3406 | `df569d3867ddd604380304e1684e9d0f24445e187c652cc7107a8647097075f1` |
| `v1/schema/projection.schema.json` | 2241 | `2c493734705abbd2bc24a10a8c411b375258007ebfb57a0e265f64fc0438ff22` |
| `v1/schema/site.schema.json` | 5882 | `7961edb8f6d26eceaf04af39f94fda019916d6a865519d08af6972343cb1f79a` |
| `v1/sites.json` | 59384 | `26325470e84fc51dd1a6cabd43c9a0100bb0358bf386ede855f8cf8902352661` |
| `v1/stamp.json` | 187 | `4f67a0569b99b4e2fd2af2d462520b4aa1fe8a80f46e636b38c85b10121e79b6` |
| `contract/v1.json` (manifest) | 7583 | `c9d520addac040f4e7f2c74dce2678e4b3365779f176f8f90a004bf04db7bcb2` |
| `contract/latest.json` (pointer) | 155 | `9ec73e4a2bab2746d9f0261f9dc162fbda28481ba1c1555899674054ae559b65` |

### Verification (`verify_contract_live.py --expect-latest 1`, exit 0, "OK: contract verified live")

- Pointer: HTTP 200, `Cache-Control: public, max-age=60`, `Access-Control-Allow-Origin: *`, valid against the pointer
  schema, names version 1.
- Manifest: HTTP 200, sha256 equals the pointer's `manifest_sha256` and the committed `contracts/bucket/contract/v1.json`
  (byte-identical), `Cache-Control: public, max-age=31536000, immutable`, CORS `*`.
- All 13 artifacts (embeddings, model version, preprocessing spec, projection, sites, stamp, and the 7 schema copies):
  HTTP 200, sha256 equals the manifest, one-year immutable `Cache-Control`, CORS `*`.
- Direct S3 access: 403. A version that does not exist (`contract/v999999.json`): 403. CDN root: 403, not a bucket
  listing.
- `check_contract.py --check --additive` still exits 0 with `contracts/PUBLISHED.json` committed, so the CI
  immutability guard accepts the published state and now fails if the committed v1 manifest ever changes.

### Rollback

Published versions are never deleted or edited. Contract objects are immutable, so the only live mutable object is the
pointer `contract/latest.json`.

- Move the pointer back to an already-published version `<N>` (the publisher first re-verifies every object of that
  version against `contracts/PUBLISHED.json`):

  ```
  py -3.12 scripts/publish_contract.py --set-latest <N> --dry-run
  py -3.12 scripts/publish_contract.py --set-latest <N> --confirm
  py -3.12 scripts/verify_contract_live.py --expect-latest <N>
  ```

- A bad v1 is superseded, not edited: publish v2 and move the pointer to it (`--version 2 --confirm`). Stamped results
  and pinned URLs keep resolving the exact v1 bytes.
- Rehearsal (2026-10-02): `py -3.12 scripts/publish_contract.py --set-latest 1 --dry-run` exited 0. It verified 14
  published objects against `PUBLISHED.json`, passed the budget gate, reported `pointer_unchanged` for
  `contract/latest.json` (155 bytes, sha256 `9ec73e4a...`, already naming v1) and made no S3 write.

## Phase 2: contract stamp deploy (2026-10-01 local, 2026-10-02 UTC)

Plan 02-11. Ships result version stamping (plan 02-05) to production: the classifier writes `contract_version`,
`dataset_version`, `model_version` and `preprocessing_spec_version` on every new RESULT item and the router returns them from
`/visualize`. No credentials, environment values or signed URLs appear in this section.

### Approving decision

The owner's standing approval for production deployment decisions within the 25 USD/month ceiling
(`.planning/research/DRIVING-QUESTIONS.md`, "Standing owner approvals (2026-10-01)"), and the Phase 2 discussion decision in
`02-CONTEXT.md` that stamping needs one classifier deploy through the scripted path with serial live verification.

### Source and pre-flight

| Item | Value |
|---|---|
| Git sha deployed from | `c7215544295a0fd3bd3ea6f5bf958a5e20f9a315` (branch `redesign/v2-discovery`, clean tree, includes the stamp-aware verifier) |
| Contract live | `py -3.12 scripts/verify_contract_live.py --expect-latest 1` exit 0 (contract v1 live before the deploy) |
| Deployed model | `models/model_config.json` version `interim-real-only` (read-only S3 copy), so the stamp guard yields non-null stamps |
| `GET /health` | 200 before the deploy |
| Warm-up | one `lambda invoke` of `reefradar-2477-inference` with payload `{}`: StatusCode 200 (response file kept in the scratchpad) |
| Dry-run | `deploy-lambdas.py --function classifier --function router --dry-run`: classifier 6 members (`BPtnJNIFeWYJx3lq/08+HrmiDzeC3OI3dwWv0b98mxo=`), router 4 members (`/YmvAjuu3+dtOkhbXpMJHNPBhFqosNm608d5+UiuJeE=`) |

### Pre-deploy drift baseline (`drift-check.py --function all --json`)

- router: `handler.py` changed. The router in production was built from `6aca641` (the CORS preflight fix, deployed
  2026-10-01 20:26:20Z outside the earlier log entries; a dry-run of `--ref 6aca641` reproduces the live hash exactly). This
  deploy therefore ships the `/visualize` stamp fields (02-05) on top of that CORS fix. Nothing else changed in the router.
- preprocessor: MATCH. inference: MATCH.
- classifier: `handler.py` changed and `contract_stamp.json` / `contract_stamp.py` missing, as expected (the package gained the
  stamp members). The live hash equalled a dry-run of `--ref 6e2e962`.

### What changed in production

Deployed with `py -3.12 scripts/deploy-lambdas.py --function classifier --confirm` then
`py -3.12 scripts/deploy-lambdas.py --function router --confirm` (one function per call; both from the clean tree at `c721554`).

| Function | CodeSha256 before | CodeSha256 after | Deployed (UTC) |
|---|---|---|---|
| reefradar-2477-classifier | `PTJpriO5u+Z6PKvVzJh+vBtuqKILBiD5+XBYJfd1LQg=` (git `6e2e962`) | `BPtnJNIFeWYJx3lq/08+HrmiDzeC3OI3dwWv0b98mxo=` | 2026-10-02 02:16:22 |
| reefradar-2477-router | `n8JWB5laVgPi5yvBIfpresn1a2o27Hy9zDgA/xCDugk=` (git `6aca641`) | `/YmvAjuu3+dtOkhbXpMJHNPBhFqosNm608d5+UiuJeE=` | 2026-10-02 02:16:32 |

Preprocessor and inference were not touched. No S3, model, DynamoDB or configuration change (the classifier's async
`MaximumRetryAttempts=0` is unchanged).

### Verification (`py -3.12 scripts/verify_live_truth.py`, exit 0, first run; analyses strictly serial)

PASS /sites provenance; PASS /samples ids; PASS /samples audio real and hash-matched (9 clips); PASS analysis with
coordinates (33 s); PASS analysis without coordinates (14 s). No 5xx, no throttling.

| Check | Analysis id | Stamp |
|---|---|---|
| With coordinates (ind_H1 excerpt) | `de0f3271-587e-49f8-9e3a-f157561d21b5` | contract_version `1` (integer), dataset_version `reefradar-reference-2026.10.0`, model_version `interim-real-only`, preprocessing_spec_version `preproc-2026.10.0-as-deployed`; region INDONESIA, probability sum 0.999999999, 3 similar sites |
| Without coordinates | `762e1327-be27-475f-9c16-ea3cb3e79ea7` | the same four stamp values; region UNKNOWN, coordinates_provided false, probability sum 0.999999999, 3 similar sites |

Both stamps equal `contracts/bucket/v1/stamp.json` and resolve against the live, immutable `contract/v1.json` on CloudFront.

### Drift after the deploy

`py -3.12 scripts/drift-check.py --function all`: router MATCH, preprocessor MATCH, classifier MATCH, inference MATCH, exit 0.
`infrastructure/deployed-state.json` was refreshed from a read-only boto3 query (environment variable names only).

### Rollback (this deploy)

Recorded per-function refs (each reproduces the pre-deploy hash exactly). Both work with the working tree dirty:

```
py -3.12 scripts/deploy-lambdas.py --function classifier --ref 6e2e962 --confirm
py -3.12 scripts/deploy-lambdas.py --function router --ref 6aca641 --confirm
```

Then confirm `GET /health` returns 200 (drift-check will report drift against HEAD until the next deploy, which is expected). Results written while
stamping was live keep their stamps in DynamoDB; they stay truthful because contract v1 is immutable, and the older router
simply does not return the fields. To go back further than this deploy, see the Rollback section above.

## Phase 2: contract CDN browser CORS fix (2026-10-01)

Plan 02-13 (gap closure for plan 02-12). Gives the contract CDN a custom response headers policy so a real browser can read
the live contract cross-origin. No credentials, signed URLs or addresses appear in this section.

**Status:** complete. The browser read path is fixed and verified (real Chromium, all four fetch cache modes). The CORS
*preflight* (an OPTIONS request) is still answered 403 by the CDN; the owner accepted that on 2026-10-02 (see "Preflight
outcome and owner decision"). The new policy stays attached.

### Approving decision

The owner explicitly approved this fix on 2026-10-01 ("Yes, fix it"), including the production CloudFront distribution update,
as gap-closure plan 02-13 (replace the response headers policy with a custom wildcard CORS policy). CloudFront settings are
Claude's discretion per `02-CONTEXT.md`; the standing approval for AWS changes within the 25 USD/month ceiling also applies
(a response headers policy and its attachment cost nothing).

### The defect and how it was found

The 02-12 tracer in headless Chrome could not read the contract: "blocked by CORS policy". The distribution used the AWS
managed `Managed-SimpleCORS` policy, which adds `Access-Control-Allow-Origin` only to *simple* CORS requests. Chrome always adds
non-safelisted headers to a fetch (`Priority: u=1, i`; `Cache-Control` and `Pragma: no-cache` on a hard reload), so CloudFront
left the header off every real browser request, on cache hits and misses alike, for `contract/latest.json`,
`contract/v1.json`, `v1/sites.json` and `v1/stamp.json`. A request carrying only `Origin` still got the header, which is why
`verify_contract_live.py` passed. The verifier now sends the `priority`, `no-cache` and `chrome` header profiles and an OPTIONS
preflight for the pointer, the manifest and the sites artifact (12 extra checks), and a Chromium spec
(`dashboard-next/tests/e2e/contract-cdn-cors-live.spec.ts`) fetches the CDN from `http://localhost:3999` in the cache modes
default, no-cache, reload and no-store.

Reproduction before any AWS change: `verify_contract_live.py --expect-latest 1` exited 1 with exactly the 12 browser checks
failing (status 200 and no `Access-Control-Allow-Origin` for the three GET profiles; preflight status 403 with no CORS headers) and every
older check PASS; both Chromium tests were rejected with `TypeError: Failed to fetch`.

### What changed

| Item | Before | After |
|---|---|---|
| Response headers policy | managed `Managed-SimpleCORS` (`60669652-455b-4ae9-85a4-c4c02393f86c`) | new custom policy `reefradar-2477-contract-cors`, id `837522dc-5a65-4b60-9c61-40d7e84e9741` |
| Policy settings | n/a | origins `*`, headers `*`, methods GET/HEAD/OPTIONS, credentials false, max age 600 s, origin override true; no expose headers and no security, custom, remove or server-timing sections |
| Distribution `E1SD3UZ4FZ1GWL` default behaviour, `ResponseHeadersPolicyId` | `60669652-455b-4ae9-85a4-c4c02393f86c` | `837522dc-5a65-4b60-9c61-40d7e84e9741` |
| Distribution `E1SD3UZ4FZ1GWL` default behaviour, `AllowedMethods` | GET, HEAD | GET, HEAD, OPTIONS (`CachedMethods` unchanged: GET, HEAD) |

Unchanged: the cache policy (Managed-CachingOptimized), origin access control `E3JD4NDX1VQA27`, the bucket, the bucket policy,
error caching and every object. The update was an `update_distribution` with `IfMatch` on the ETag read just before, changing
only those two fields (asserted by the unit tests). Wildcard origin is kept from 02-02: the data is public, open-licensed and
immutable, the app fetches with `credentials: 'omit'`, and `*.vercel.app` preview hosts cannot be listed.

**No invalidation was requested.** The AWS documentation ("Add or remove HTTP headers in CloudFront responses with a policy")
says: "CloudFront modifies the headers in the responses that it serves from the cache and the ones that it forwards from the
origin." The policy applies at response time, so cached objects are correct as they are.

### Commands run (UTC)

| Time | Command | Exit |
|---|---|---|
| just before 03:14 | `py -3.12 scripts/setup_contract_infra.py --step cors --dry-run` | 0 (planned `create_response_headers_policy` and `update_distribution`, "[dry-run] no AWS write made") |
| 03:14:19 to 03:14:53 | `py -3.12 scripts/setup_contract_infra.py --step cors --confirm` | 0 (policy created, distribution updated, Deployed after about 35 s, read-back ok) |
| 03:15:09 | `py -3.12 scripts/setup_contract_infra.py --step all --verify` | 0 (budget, storage with the public probes, and the 4 cors checks all ok) |
| 03:15:24, 03:15:53, 03:17:59 | `py -3.12 scripts/verify_contract_live.py --expect-latest 1` | 1, identical each time (3 preflight checks failed; see below) |
| 2026-10-02 07:37 | `py -3.12 scripts/verify_contract_live.py --expect-latest 1` (after the report-only decision) | 0, "OK: contract verified live" (74 PASS, 3 WARN) |
| 03:15:41, 03:16:32 | `npm --prefix dashboard-next run test:live -- tests/e2e/contract-cdn-cors-live.spec.ts` | see below |
| later | `py -3.12 scripts/setup_contract_infra.py --step all --record-resources` | 0 |
| later | `py -3.12 scripts/setup_contract_infra.py --step all --dry-run` | 0, no planned action (idempotent) |
| later | `py -3.12 scripts/setup_contract_infra.py --step cors-rollback --dry-run` | 0, one planned `update_distribution` back to Managed-SimpleCORS and GET/HEAD (rehearsal only, never confirmed) |

### Verification results (check names and counts only, no bodies; state before the 2026-10-02 owner decision)

- `verify_contract_live.py --expect-latest 1`: 74 checks PASS, 3 FAIL. All pre-existing checks (pointer, manifest, 13 artifacts,
  privacy: direct S3 403, missing version 403, root not a listing) PASS, and all 9 browser GET checks PASS
  (`priority`, `no-cache`, `chrome` for pointer, manifest and `artifact sites`: status 200, `Access-Control-Allow-Origin: *`).
  The only failures are the three `CORS preflight answered` checks.
- Chromium, real page origin `http://localhost:3999` served by a real local HTTP server: "pointer, manifest and sites are
  readable cross-origin" PASSES (pointer, manifest and 54 sites read as `cors` responses in cache modes default, no-cache,
  reload and no-store, every CDN request carrying `origin: http://localhost:3999`). "author header forces a preflight that the
  CDN answers" FAILS (`TypeError: Failed to fetch`).
- The first version of the spec used `page.route()` for the page origin; while interception is active Playwright answers CORS
  preflights itself and disables the HTTP cache, so that test passed vacuously on its first run. The spec now uses a real
  server (commit `adb9bdf`) and the preflight test fails honestly.

### Preflight outcome and owner decision

OPTIONS to `contract/latest.json`, `contract/v1.json` and `v1/sites.json` with `Access-Control-Request-Method: GET` and
`Access-Control-Request-Headers: priority,cache-control` answers **HTTP 403** with `Access-Control-Allow-Origin: *`,
`Access-Control-Allow-Methods: GET,HEAD,OPTIONS` and `Access-Control-Allow-Headers: *` (the policy adds its headers, the status
is not 2xx). A browser rejects a preflight that is not 2xx. This is consistent with CloudFront relaying the OPTIONS to the
S3 origin, which has no bucket CORS configuration. Real browser reads of the contract do not preflight (the contract client
sends a plain `fetch(url, { credentials: 'omit' })`; Priority and cache headers are added after the CORS decision), which is
what the passing Chromium test shows. A preflight would only appear if the app ever sets its own request header. The new
policy stays attached because it fixes every real browser read. Options put to the owner: (a) accept that the CDN does not
answer preflights and make the preflight probe and the Chromium preflight test report-only; (b) answer OPTIONS at the edge with a
CloudFront Function; (c) add S3 bucket CORS plus the AWS managed origin request policy Managed-CORS-S3Origin.

**Owner decision, 2026-10-02: option (a), "Accept + guard".** No further AWS change was made. Consequences, all in the repo:

- `verify_contract_live.py` prints the three preflight probes as `PASS`, or `WARN ... report-only: CDN relays OPTIONS to S3 (no
  bucket CORS); contract client never preflights - owner decision 2026-10-02`; they never fail the run. A GET that lacks
  `Access-Control-Allow-Origin` (the 9 browser profile checks) still FAILs. Final live run: exit 0, 74 PASS, 3 WARN, "OK: contract
  verified live".
- The Chromium test "author header forces a preflight that the CDN answers" is `test.fixme` with this reason; the cross-origin
  cache-mode test remains the gate and passes.
- Guard against the one thing that would expose the limitation: the unit test
  `dashboard-next/tests/unit/contract-no-preflight.test.ts` fails if anything in `src/features/contract/` passes a request header,
  a `Headers`/`Request` object, an XHR, or any fetch option other than `credentials`/`cache` (verified by temporarily adding
  `headers: { 'X-Probe': '1' }` to the real client: the guard failed, then the change was reverted).

### Rollback

Re-attaches `Managed-SimpleCORS` (`60669652-455b-4ae9-85a4-c4c02393f86c`) and GET/HEAD in one deployment (minutes). This brings the
browser defect back. No object, bucket setting or policy is deleted.

```
py -3.12 scripts/setup_contract_infra.py --step cors-rollback --dry-run
py -3.12 scripts/setup_contract_infra.py --step cors-rollback --confirm
py -3.12 scripts/setup_contract_infra.py --step storage --verify
```

Manual CLI equivalent: `aws cloudfront get-distribution-config --id E1SD3UZ4FZ1GWL`, edit only
`DefaultCacheBehavior.ResponseHeadersPolicyId` (back to the managed id above) and `DefaultCacheBehavior.AllowedMethods`
(`Items` GET and HEAD, `Quantity` 2), then `aws cloudfront update-distribution --id E1SD3UZ4FZ1GWL --if-match <ETag>
--distribution-config file://<edited config>`. Once the policy is unattached it can optionally be removed with
`aws cloudfront delete-response-headers-policy --id 837522dc-5a65-4b60-9c61-40d7e84e9741 --if-match <its ETag>`.
