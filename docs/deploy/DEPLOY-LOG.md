# Production Deploy Log

Record of production changes made by the Phase 1 backend truth deploy (plan 01-14).
No credentials, presigned URLs or Lambda environment values appear in this file.

## Attempt 1 (2026-10-01): ROLLED BACK after live verification failed

**Status:** production was returned to its pre-deploy behaviour. The plan is NOT complete:
the truthful router/classifier, interim model and real-audio retirement are not live.
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

### Root cause of the 503: not established

The 503 began between the second and third verifier runs, and cleared after the rollback. Two hypotheses, neither
confirmed (no CloudWatch or Lambda-configuration read access in this session):

1. Account-level Lambda concurrency saturation: the two buggy verifier runs left four analyses in flight, each
   cold-starting the 3 GB inference container (plus async retries), which may have starved the router.
2. A fault in the new router or classifier code. The router answered `/sites`, `/samples`, `/upload` and `/analyze`
   correctly minutes earlier, and `/health` is a trivial handler, which argues against this.

Before a second attempt: check the account concurrency limit and recent CloudWatch errors for the router and
classifier, then re-run deploy with the fixed verifier (it runs the two analyses strictly one at a time).

## Rollback

Exact commands, valid for any future deploy of this plan.

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
