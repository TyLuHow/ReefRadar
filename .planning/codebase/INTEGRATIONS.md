# External Integrations

**Analysis Date:** 2026-09-30

## APIs & External Services

**ReefRadar REST API (self-hosted, deployed):**
- Provider: AWS API Gateway, HTTP API `reefradar-2477-api`
- Base URL: `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod` (hardcoded fallback in `dashboard-next/src/lib/api.ts:13`; overridable via `NEXT_PUBLIC_API_URL`)
- Routes (per `lambdas/router/handler.py` and `dashboard-next/src/lib/api.ts`): `GET /health`, `GET /sites`, `POST /upload`, `POST /analyze`, `GET /status/{analysisId}`, `GET /visualize/{analysisId}`
- Integration: `$default` route → `router` Lambda (`integration_id: hl8zxb4`)
- Consumed by: `dashboard-next` (`src/lib/api.ts`), legacy `dashboard/app.py` (Streamlit, via `requests`)

**SurfPerch acoustic embedding model:**
- Source: Kaggle Models, pulled at Lambda cold-start via `kagglehub.model_download(handle)` in `infrastructure/lambda_container/inference.py`
- Loaded with `tf.saved_model.load(model_path)` (TensorFlow SavedModel format) — explicitly avoids `tensorflow_hub`
- Cache dir: `KAGGLEHUB_CACHE=/tmp/kagglehub` (Lambda `/tmp` ephemeral storage); `KAGGLE_CONFIG_DIR=/tmp` set as Lambda env var on the `inference` function (`infrastructure/resources.json`)
- No Kaggle API credentials found in repo — public/anonymous model download assumed, or credentials are injected at runtime outside the repo (unconfirmed; verify before deploy)

**Map Tiles (dashboard-next):**
- CARTO basemap style JSON: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` (`dashboard-next/src/components/map/ReefMap.tsx:14`), rendered via `maplibre-gl` + `react-map-gl/maplibre`
- No API key required for this CARTO style endpoint
- `leaflet`/`react-leaflet` also present as a dependency for secondary map components (e.g. mini maps); tile provider for those not confirmed in this pass

## Data Storage

**Databases:**
- AWS DynamoDB table `reefradar-2477-metadata` (partition key `pk`, sort key `sk`, `PAY_PER_REQUEST` billing) — stores analysis/site metadata; accessed via `boto3` in `router`, `preprocessor`, `classifier` Lambdas

**File Storage:**
- AWS S3 bucket `reefradar-2477-audio` — folders `uploads/`, `processed/`, `reference/` (uploaded recordings, processed audio)
- AWS S3 bucket `reefradar-2477-embeddings` — folders `models/`, `reference/`, `layers/` (precomputed embeddings, model artifacts, Lambda layer packages)
- Locally, `data/` and `models/` directories are gitignored (see `.gitignore` lines for `data/marrs/`, `data/marrs_audio/`, `data/training/`, `data/embeddings/*.npy`, `data/embeddings/*.json`, `models/*.npz`, `models/*.json`) — these datasets/model artifacts live in S3, not in git

**Caching:**
- None detected (no Redis/ElastiCache/CDN cache layer found)

## Authentication & Identity

**Auth Provider:**
- None. The API Gateway/`router` Lambda sets `Access-Control-Allow-Origin: '*'` with no API key, JWT, or IAM authorizer found in `lambdas/router/handler.py`. The API is fully open/public.
- No auth found in `dashboard-next` (no NextAuth, Clerk, Supabase Auth, etc. in `package.json`)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry/Rollbar/Bugsnag dependency)

**Logs:**
- AWS CloudWatch Logs — one log group per Lambda: `/aws/lambda/reefradar-2477-router`, `/aws/lambda/reefradar-2477-preprocessor`, `/aws/lambda/reefradar-2477-classifier`, `/aws/lambda/reefradar-2477-inference` (`infrastructure/resources.json`)

## CI/CD & Deployment

**Hosting:**
- `dashboard-next/` → Vercel (`dashboard-next/vercel.json`: `framework: nextjs`, custom build/install commands, security headers)
- Legacy `dashboard/` (Streamlit) → no deployment config found in repo
- Backend → AWS Lambda + API Gateway (see STACK.md), account `781978598306`, region `us-east-1`

**CI Pipeline:**
- AWS CodeBuild via `infrastructure/lambda_container/buildspec.yml` — builds the `inference` Docker image, pushes to ECR repo `reefradar-2477-inference`, then calls `aws lambda update-function-code --image-uri ...`
- No CodeBuild/CI config found for `router`/`classifier`/`preprocessor` zip-deployed Lambdas — these are deployed manually via `scripts/deploy_preprocessor.sh` and similar ad hoc scripts (zip + `aws lambda update-function-code`)
- No GitHub Actions or other CI found for `dashboard-next` (Vercel's own git-push build likely handles this, per `vercel.json`, but no workflow file confirms it)

## Environment Configuration

**Required env vars:**
- `dashboard-next`: `NEXT_PUBLIC_API_URL` (optional; falls back to the live prod API URL) — see `dashboard-next/.env.example` for the documented template (contents not read per secrets policy — existence noted only)
- Lambda functions (set directly in `infrastructure/resources.json`, not via `.env`):
  - `router`: `AUDIO_BUCKET`, `EMBEDDINGS_BUCKET`, `METADATA_TABLE`, `PREPROCESSOR_FUNCTION`
  - `preprocessor`: `AUDIO_BUCKET`, `EMBEDDINGS_BUCKET`, `METADATA_TABLE`, `CLASSIFIER_FUNCTION`
  - `classifier`: `AUDIO_BUCKET`, `EMBEDDINGS_BUCKET`, `METADATA_TABLE`, `INFERENCE_FUNCTION`
  - `inference`: `KAGGLE_CONFIG_DIR=/tmp`

**Secrets location:**
- `.env` is gitignored repo-wide (`.gitignore`); only `dashboard-next/.env.example` is committed as a template
- No AWS credentials or Kaggle credentials found committed in repo — assumed to be supplied via IAM role (Lambda execution role `reefradar-2477-lambda-role`, attached policies: `AWSLambdaBasicExecutionRole`, `AmazonDynamoDBFullAccess`, `AmazonS3FullAccess`, `AmazonSageMakerFullAccess` [legacy/unused now that SageMaker is deleted], plus inline `LambdaInvokePolicy`) and local AWS CLI profile for deploy scripts

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected (status polling is client-driven via `GET /status/{id}` and `GET /visualize/{id}`, not webhook push)

## Lambda-to-Lambda Invocation Chain

The backend is a synchronous-looking pipeline implemented as async Lambda chaining:
1. `router` (`lambdas/router/handler.py`) receives `POST /analyze`, then invokes `preprocessor` asynchronously (`lambda_client.invoke(..., InvocationType='Event')`, `lambdas/router/handler.py:181-183`)
2. `preprocessor` (`lambdas/preprocessor/handler.py`) processes the audio, then invokes `classifier` asynchronously (`InvocationType='Event'`, `lambdas/preprocessor/handler.py:186-188`)
3. `classifier` (`lambdas/classifier/handler.py`) invokes the `inference` container Lambda synchronously (`InvocationType='RequestResponse'`, `lambdas/classifier/handler.py:277-279`) to get SurfPerch embeddings/classification, then writes results to DynamoDB
4. Client polls `GET /status/{analysisId}` / `GET /visualize/{analysisId}` on `router` until `status: complete`

## Known Gaps / Unresolved References

- `dashboard-next/src/app/page.tsx` imports `SampleGallery` from `@/components/gallery/SampleGallery`, and `dashboard-next/src/app/experience/page.tsx` imports `FALLBACK_SAMPLES` from `@/lib/samples` — **neither `SampleGallery.tsx` nor `src/lib/samples.ts` exists in git**. Only `dashboard-next/src/components/gallery/SampleCard.tsx` is committed. The build will fail on these imports until the missing files are added or the imports are removed/stubbed.
- `dashboard-next/public/audio/` does contain committed static demo assets (`healthy-reef.wav`, `degraded-reef.wav`, `compare/`, `ATTRIBUTION.md`) used by `AudioCompare.tsx` and `useDemoAudio.ts` via same-origin `fetch('/audio/...')` — this part of the audio asset pipeline is self-hosted static files, not S3.

---

*Integration audit: 2026-09-30*
