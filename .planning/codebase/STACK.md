# Technology Stack

**Analysis Date:** 2026-09-30

## Languages

**Primary:**
- Python 3.11 / 3.12 - AWS Lambda functions (`lambdas/`, `infrastructure/lambda_container/`)
- TypeScript - Next.js dashboard (`dashboard-next/src/`)

**Secondary:**
- Python 3.x (unpinned) - Streamlit legacy dashboard (`dashboard/app.py`) and tooling scripts (`scripts/`)
- Bash - deploy/ops scripts (`scripts/*.sh`)
- YAML/JSON - infra config (`infrastructure/resources.json`, `infrastructure/ec2_transfer_template.yaml`, `infrastructure/lambda_container/buildspec.yml`)

## Runtime

**Environment:**
- AWS Lambda managed runtime `python3.11` for `router`, `preprocessor`, `classifier` (per `infrastructure/resources.json`)
- AWS Lambda container image runtime (Python 3.12 base, `public.ecr.aws/lambda/python:3.12`) for the `inference` function — see `infrastructure/lambda_container/Dockerfile`
- `lambdas/preprocessor/Dockerfile` separately builds on `public.ecr.aws/lambda/python:3.11` (ffmpeg-free + libsndfile) — appears to be an alternate/legacy containerized build path for preprocessor vs. the zip-deployed `handler.py` used in production per `resources.json`
- Node.js (version unpinned; no `.nvmrc` found) for `dashboard-next/` — Next.js 14.2.5 requires Node ^18.17 or ^20

**Package Manager:**
- npm for `dashboard-next/` — `dashboard-next/package-lock.json` is committed (reproducible installs via `npm ci`)
- pip for all Python components — no lockfiles (`requirements.txt` only, version floors via `>=`)

## Frameworks

**Core:**
- Next.js 14.2.5 (App Router) - `dashboard-next/src/app/` — dashboard frontend
- React 18.3.1 / React DOM 18.3.1
- Streamlit >=1.28.0 - `dashboard/app.py` — legacy 3-tab dashboard
- TensorFlow-cpu >=2.18.0 - ML inference runtime inside the `inference` Lambda container (`infrastructure/lambda_container/requirements.txt`)

**Mapping/Visualization (dashboard-next):**
- `maplibre-gl` ^4.0 + `react-map-gl` ^7.1 (`/maplibre` subpath) - primary map renderer, `dashboard-next/src/components/map/ReefMap.tsx`
- `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/react` ^9.0 - deck.gl overlay layers (transpiled via `next.config.js` `transpilePackages`)
- `leaflet` ^1.9.4 + `react-leaflet` ^4.2.1 - used elsewhere in dashboard (e.g. mini maps)
- `recharts` ^2.12.7 - charts
- `wavesurfer.js` ^7.8 - audio waveform rendering
- `framer-motion` ^11.0 - animation
- `zustand` ^4.5 - client state
- `@tanstack/react-query` ^5.51.21 - data fetching/caching
- `folium` >=0.15.0 + `streamlit-folium` >=0.15.0 - maps in the legacy Streamlit dashboard

**Testing:**
- No test framework/config detected in `dashboard-next/` (no jest/vitest config) or in Python components (no pytest config found); `scripts/test-all.sh`, `scripts/test_inference_lambda.py`, `scripts/test_region_detection.py` appear to be ad hoc manual test scripts, not a formal suite.

**Build/Dev:**
- TypeScript 5.5.4, ESLint 8.57.0 (`eslint-config-next` 14.2.5), Tailwind CSS 3.4.7, PostCSS 8.4.40, Autoprefixer 10.4.19 (all dev deps in `dashboard-next/package.json`)
- Docker (via CodeBuild and local `scripts/deploy_inference_lambda.sh`) for building Lambda container images

## Key Dependencies

**Critical:**
- `kagglehub` >=0.3.0 - downloads the SurfPerch acoustic embedding model at Lambda cold-start (`infrastructure/lambda_container/inference.py`); no `tensorflow_hub` dependency used
- `tensorflow-cpu` >=2.18.0 - loads SurfPerch SavedModel via `tf.saved_model.load()`
- `boto3` >=1.28.0/1.34.0 - AWS SDK used in every Lambda (`router`, `preprocessor`, `classifier`, `inference` container)
- `numpy` >=1.24.0 - audio/embedding math in `preprocessor` and `classifier` Lambdas (deployed via a shared Lambda layer `reefradar-2477-numpy` pinned to NumPy 1.26.4 for Python 3.11, per `infrastructure/resources.json`)

**Infrastructure:**
- `setuptools` >=69.0.0, force-reinstalled last in the inference Dockerfile because `tensorflow-cpu` clobbers it
- `pandas`, `plotly`, `requests` (Streamlit dashboard only, `dashboard/requirements.txt`)

## Configuration

**Environment:**
- `dashboard-next/.env.example` exists (contents not read — treat as template; do not assume values). Confirmed used var: `NEXT_PUBLIC_API_URL` (`dashboard-next/src/lib/api.ts:13`), falling back to the live API Gateway URL if unset.
- Lambda environment variables are defined per-function in `infrastructure/resources.json` (bucket names, table name, downstream function names) rather than via a `.env` file — see INTEGRATIONS.md.
- No `.env` (non-example) files found in the repo.

**Build:**
- `dashboard-next/next.config.js` - `trailingSlash: true`, `images.unoptimized: true`, transpiles deck.gl ESM packages
- `dashboard-next/vercel.json` - sets `framework: nextjs`, explicit build/install commands, and security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- `infrastructure/lambda_container/buildspec.yml` - AWS CodeBuild spec: logs into ECR, builds/pushes the `inference` container (`--platform linux/amd64 --provenance=false`), then calls `aws lambda update-function-code`
- `scripts/deploy_inference_lambda.sh` - local equivalent of the CodeBuild flow for the inference container
- `scripts/deploy_preprocessor.sh` - zips `handler.py` and calls `aws lambda update-function-code` directly (no container) for the preprocessor Lambda, which is the path actually reflected in `infrastructure/resources.json` (runtime `python3.11`, not `container`)

## Platform Requirements

**Development:**
- AWS CLI configured with credentials for account `781978598306`, region `us-east-1`
- Docker (for building/pushing the `inference` container image)
- Node.js + npm for `dashboard-next/`
- Python 3.11/3.12 locally to match Lambda runtimes when testing handlers

**Production:**
- AWS: API Gateway (`reefradar-2477-api`), Lambda (3 zip-deployed functions + 1 container-image function), S3 (2 buckets), DynamoDB (1 table), ECR (2 repositories), CloudWatch Logs, IAM — all in `us-east-1` under account `781978598306`
- Vercel for `dashboard-next/` (per `vercel.json`); the legacy `dashboard/` Streamlit app has no deployment config found in-repo (likely run manually or via Streamlit Community Cloud — unconfirmed)
- SageMaker previously used for inference; explicitly deleted per `infrastructure/resources.json` (`"sagemaker": {"status": "DELETED", "deleted_at": "2026-02-20"}`) — inference now runs entirely in the Lambda container

---

*Stack analysis: 2026-09-30*
