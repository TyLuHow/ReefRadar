<!-- GSD:project-start source:PROJECT.md -->

## Project

**ReefRadar v2 — Reef Soundscape Research Instrument**

ReefRadar is a listening instrument for coral-reef soundscapes in which every claim is something you can hear, see, and trace to its source. Researchers (and curious visitors through a public front door) listen to and fairly compare real reef recordings across places, restoration stages, times of day and events; place their own recording among labelled references (upload as *search*, not verdict); and inspect the evidence — sites, datasets, label definitions, model and methods — behind every number. It is built on the existing AWS serverless pipeline (SurfPerch embeddings + classifier) and the Next.js dashboard, redesigned from the ground up.

**Core Value:** **Every sound, label and number shown is real, traceable to its source, and honestly qualified — and a visitor can hear a real reef within seconds.** If everything else fails, the product must never present synthetic audio as real, an unvalidated model output as a diagnosis, or a number without its provenance.

### Constraints

- **Tech stack:** Next.js (upgrade 14.2 → 16, React 19) on Vercel; AWS Lambda/API Gateway/S3/DynamoDB backend in us-east-1; incremental migration inside `dashboard-next/` (no big-bang rewrite).
- **Integrity:** no synthetic or unattributed audio; no displayed probability that is not a probability; every label shows who assigned it and what it means.
- **Legacy operability:** legacy routes remain working and testable until their capabilities are rehomed per CAPABILITY-MATRIX; retired only after verification.
- **Licensing:** dataset licences (CC BY 4.0 / CC0 / public domain) require attribution on every surface where audio or derived data appears.
- **Budget:** owner to set an AWS spend ceiling for ingestion/re-embedding; budget alarm required before large jobs.
- **Access:** AWS (CLI v1 via `py -3.12 -m awscli`), Vercel CLI, GitHub CLI installed; credentials provided by owner.
- **Devices:** desktop and tablet first-class; phone supports listening, viewing results and sharing.
- **Browsers:** evergreen; Safari ≥ 16.4 (Tailwind v4 baseline).

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- Python 3.11 / 3.12 - AWS Lambda functions (`lambdas/`, `infrastructure/lambda_container/`)
- TypeScript - Next.js dashboard (`dashboard-next/src/`)
- Python 3.x (unpinned) - tooling scripts (`scripts/`)
- Bash - deploy/ops scripts (`scripts/*.sh`)
- YAML/JSON - infra config (`infrastructure/resources.json`, `infrastructure/ec2_transfer_template.yaml`, `infrastructure/lambda_container/buildspec.yml`)

## Runtime

- AWS Lambda managed runtime `python3.11` for `router`, `preprocessor`, `classifier` (per `infrastructure/resources.json`)
- AWS Lambda container image runtime (Python 3.12 base, `public.ecr.aws/lambda/python:3.12`) for the `inference` function — see `infrastructure/lambda_container/Dockerfile`
- `lambdas/preprocessor/Dockerfile` separately builds on `public.ecr.aws/lambda/python:3.11` (ffmpeg-free + libsndfile) — appears to be an alternate/legacy containerized build path for preprocessor vs. the zip-deployed `handler.py` used in production per `resources.json`
- Node.js `>=20.9.0` (`engines` in `dashboard-next/package.json`) for `dashboard-next/` — required by Next.js 16
- npm for `dashboard-next/` — `dashboard-next/package-lock.json` is committed (reproducible installs via `npm ci`)
- pip for all Python components — no lockfiles (`requirements.txt` only, version floors via `>=`)

## Frameworks

- Next.js 16.3.8 (App Router) - `dashboard-next/src/app/` — dashboard frontend
- React 19.3.0 / React DOM 19.3.0
- TensorFlow-cpu >=2.18.0 - ML inference runtime inside the `inference` Lambda container (`infrastructure/lambda_container/requirements.txt`)
- `maplibre-gl` 6.11.2 + `react-map-gl` 8.1.3 (`/maplibre` subpath) - the only map renderer: `dashboard-next/src/features/map/` (`ReefMap`, `WorldMap`, `MiniMap`)
- `@observablehq/plot` 0.6.17 + `d3-array`, `d3-format`, `d3-scale`, `d3-shape` - the only chart libraries: `dashboard-next/src/features/charts/` (no Recharts, no wavesurfer.js, no deck.gl, no Leaflet; a CI test fails if they return)
- `framer-motion` ^11.0 - animation
- `zustand` ^4.5 - client state
- `@tanstack/react-query` ^5.51.21 - data fetching/caching (contract client)
- `@vercel/speed-insights` 2.0.0 (web vitals) and `POST /api/client-error/` (client errors to Vercel runtime logs) - see `docs/MONITORING.md`
- Tests: Vitest 5 + Testing Library (`dashboard-next/tests/unit`), Playwright 1.63 with axe (`tests/e2e`, fixture-mocked, plus Docker-pinned visual baselines), pytest for Python; all run in `.github/workflows/ci.yml`. `scripts/test-all.sh`, `scripts/test_inference_lambda.py`, `scripts/test_region_detection.py` remain ad hoc manual scripts.
- TypeScript 5.5.4, ESLint 9.39.5 (flat config `eslint.config.mjs`, `eslint-config-next` 16.3.8), Tailwind CSS 4.3.3 with `@tailwindcss/postcss` 4.3.3, PostCSS 8.4.40 (no Autoprefixer; all dev deps in `dashboard-next/package.json`)
- Docker (via CodeBuild and local `scripts/deploy_inference_lambda.sh`) for building Lambda container images

## Key Dependencies

- `kagglehub` >=0.3.0 - downloads the SurfPerch acoustic embedding model at Lambda cold-start (`infrastructure/lambda_container/inference.py`); no `tensorflow_hub` dependency used
- `tensorflow-cpu` >=2.18.0 - loads SurfPerch SavedModel via `tf.saved_model.load()`
- `boto3` >=1.28.0/1.34.0 - AWS SDK used in every Lambda (`router`, `preprocessor`, `classifier`, `inference` container)
- `numpy` >=1.24.0 - audio/embedding math in `preprocessor` and `classifier` Lambdas (deployed via a shared Lambda layer `reefradar-2477-numpy` pinned to NumPy 1.26.4 for Python 3.11, per `infrastructure/resources.json`)
- `setuptools` >=69.0.0, force-reinstalled last in the inference Dockerfile because `tensorflow-cpu` clobbers it

## Configuration

- `dashboard-next/.env.example` exists (contents not read — treat as template; do not assume values). Confirmed used var: `NEXT_PUBLIC_API_URL` (`dashboard-next/src/lib/api.ts:13`), falling back to the live API Gateway URL if unset.
- Lambda environment variables are defined per-function in `infrastructure/resources.json` (bucket names, table name, downstream function names) rather than via a `.env` file — see INTEGRATIONS.md.
- No `.env` (non-example) files found in the repo.
- `dashboard-next/next.config.js` - `trailingSlash: true`, `images.unoptimized: true`, `agentRules: false`; Tailwind 4 reads its tokens from CSS (`@theme` in `src/app/globals.css`; there is no `tailwind.config.js`), and the scanned directories are set by the `@source` lines in that file (`src/pages`, `src/components`, `src/app`, `src/features`), guarded by `tests/unit/tailwind-v4-sources.test.ts`
- `dashboard-next/vercel.json` - sets `framework: nextjs`, explicit build/install commands, and security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- `infrastructure/lambda_container/buildspec.yml` - AWS CodeBuild spec: logs into ECR, builds/pushes the `inference` container (`--platform linux/amd64 --provenance=false`), then calls `aws lambda update-function-code`
- `scripts/deploy_inference_lambda.sh` - local equivalent of the CodeBuild flow for the inference container
- `scripts/deploy_preprocessor.sh` - zips `handler.py` and calls `aws lambda update-function-code` directly (no container) for the preprocessor Lambda, which is the path actually reflected in `infrastructure/resources.json` (runtime `python3.11`, not `container`)

## Platform Requirements

- AWS CLI configured with credentials for account `781978598306`, region `us-east-1`
- Docker (for building/pushing the `inference` container image)
- Node.js + npm for `dashboard-next/`
- Python 3.11/3.12 locally to match Lambda runtimes when testing handlers
- AWS: API Gateway (`reefradar-2477-api`), Lambda (3 zip-deployed functions + 1 container-image function), S3 (2 buckets), DynamoDB (1 table), ECR (2 repositories), CloudWatch Logs, IAM — all in `us-east-1` under account `781978598306`
- Vercel for `dashboard-next/` (per `vercel.json`)
- SageMaker previously used for inference; explicitly deleted per `infrastructure/resources.json` (`"sagemaker": {"status": "DELETED", "deleted_at": "2026-02-20"}`) — inference now runs entirely in the Lambda container

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Python (lambdas, scripts): `snake_case.py` — `handler.py`, `region_detection.py`, `test_inference_lambda.py`
- TypeScript/React components: `PascalCase.tsx` — `AnalysisResults.tsx`, `ProbabilityBars.tsx`, `CoordinateModal.tsx`
- TypeScript utility/lib modules: `camelCase.ts` or short lowercase — `utils.ts`, `api.ts` (kebab-case used for multi-word lib files, e.g. `site-stats.ts`)
- Next.js App Router special files: lowercase Next.js convention — `page.tsx`, `layout.tsx`, `route.ts`
- Legacy components grouped by domain in `src/components/{about,audio,charts,dashboard,experience,map,sites,ui}/`; new code goes in `src/features/{contract,map,charts,monitoring}/` and may not import `@/components` (ESLint block plus `scripts/check-feature-fence.mjs` in CI)
- Python: `snake_case` — `convert_floats()`, `detect_region()`, `adjust_classification()`
- TypeScript: `camelCase` — `formatStatus()`, `getStatusBgColor()`, `validateWavFile()`
- React components exported as named `PascalCase` functions: `export function AnalysisResults({ result }: AnalysisResultsProps)`
- Python: `snake_case`, module-level constants `UPPER_SNAKE_CASE` — `AUDIO_BUCKET`, `MAX_RETRIES`, `RETRY_DELAYS`, `BATCH_SIZE`
- Python module-level caches prefixed with underscore for warm-Lambda state: `_model_weights`, `_model_config`, `_reference_embeddings`
- TypeScript: `camelCase` for locals, `UPPER_SNAKE_CASE` for module constants (`MAP_STYLE`, `DEFAULT_VIEW_STATE`)
- TypeScript interfaces: `PascalCase`, often suffixed `Props` for component props — `AnalysisResultsProps`, `MapShellProps`
- Shared domain types centralized in `dashboard-next/src/types` (e.g. `AnalysisResult`, `ReefStatus`, `STATUS_COLORS`)
- Python: no dataclasses/TypedDicts observed in lambdas; dict-based payloads validated ad hoc via `event.get(...)` / `event[...]`

## Code Style

- No `.prettierrc` or `biome.json` in `dashboard-next/`; linting is `eslint.config.mjs` (`eslint-config-next` plus the contract-fence and feature-fence blocks); there is no formatter
- No Python formatter/linter config (`.flake8`, `pyproject.toml` with `[tool.black]`, `ruff.toml`) found in `lambdas/` or `scripts/` — Python style is informal/consistent-by-convention rather than enforced by tooling
- `npm run lint` (`eslint .`), `typecheck`, `test` (Vitest) and the two fence scripts run in the CI `web` job; Playwright e2e, visual, python and citation checks have their own jobs

## Import Organization

- `@/*` maps to `dashboard-next/src/*` (standard Next.js App Router alias via `tsconfig.json`) — used pervasively: `@/lib/utils`, `@/components/maps`, `@/types`
- Standard library first, then third-party (`boto3`, `numpy`), then local module imports — seen in `lambdas/classifier/handler.py`: `json, boto3, os, numpy, uuid, time` → `from datetime import datetime` → `from decimal import Decimal` → `from region_detection import detect_region, adjust_classification`
- Each Lambda (`classifier/`, `preprocessor/`, `router/`) has its own `requirements.txt`; no shared Python package/dependency management (no shared `lambdas/common/` module observed)

## Error Handling

- Custom exception classes carry structured metadata for API responses: `InferenceError(message, error_type='INFERENCE_FAILED', retry_count=0, request_id=None)` in `lambdas/classifier/handler.py`
- Explicit "NEVER falls back to synthetic data" policy — module docstring and inline comments assert hard-fail-on-error behavior instead of silent degradation (`lambdas/classifier/handler.py:1-5`, `:70`)
- Retry pattern with exponential backoff constants: `MAX_RETRIES = 3`, `RETRY_DELAYS = [1, 2, 4]` seconds, applied around inference calls
- Layered `try/except`: narrow `except InferenceError as e:` catches re-raise with re-raise (`raise`) to propagate to the Lambda runtime for proper HTTP error mapping, broader `except Exception as e:` wraps unexpected errors into `InferenceError`
- `context.aws_request_id` captured and threaded through errors for traceability (`request_id = context.aws_request_id if context else str(uuid.uuid4())`)
- Validation-first pattern returning typed result objects rather than throwing, for user-facing checks: `validateWavFile(file: File): { valid: boolean; error?: string }` in `src/lib/utils.ts`
- Defensive rendering: components check for missing/null data and render a fallback message rather than crashing (`AnalysisResults.tsx`: `if (!classification) { return <div className="glass-panel p-6">...No classification results available...</div> }`)
- Error boundaries: `src/app/error.tsx` (route level) and `src/app/global-error.tsx` (root layout) show only the digest, never `error.message` or the stack, and report once through `src/features/monitoring` (`/api/client-error/` to Vercel runtime logs)

## Styling System

- Hardcoded brand palette tokens: `abyss`, `depths`, `bg-surface`, `bone`, `ochre`, `dusty-rose`, `pale-gold`, `muted-tan`, `warm-gray`, `warm-amber`
- CSS-variable-backed tokens (resolved at runtime): `glass-bg`, `glass-hover`, `glass-active`, `glass-border`, `status-healthy`, `status-degraded`, `status-restoring-early`, `status-restoring-mid`. The dark palette is static CSS tokens until Phase 4; the reef-vitality theming engine and its `--reef-*` tokens were removed in Phase 3
- Custom font families mapped to CSS vars from `next/font`: `--font-inter`, `--font-jetbrains-mono`
- `backdropBlur.glass: '16px'` and custom keyframe `wave` for reef-themed motion
- When adding new themeable colors, prefer a CSS custom property in `globals.css` plus a matching Tailwind color token (pattern used throughout) rather than a hardcoded hex in a component; tokens live in CSS (`@theme` / `:root` in `globals.css`)
- `:root` defines layered token groups: Backgrounds (`--bg-abyss`, `--bg-depths`, `--bg-surface`), Glassmorphism (`--glass-bg`, `--glass-bg-hover`, `--glass-bg-active`, `--glass-border`, `--glass-border-bright`), Text (`--text-primary`, `--text-secondary`, `--text-muted`, `--text-dim`), Frequency Bands (`--freq-low/mid/high`), Health Status (`--status-healthy`, `--status-degraded`, `--status-restoring-early`, `--status-restoring-mid`) and Accents (`--accent-glow`, `--accent-warning`, `--accent-info`)
- Global transition rule applies to common properties on every element (`*` selector): `transition-property: background-color, border-color, color, fill, stroke, opacity, box-shadow, transform; transition-duration: 150ms;` — animations (`.animate-spin`, `.animate-pulse`) are explicitly excluded (`transition: none`) to avoid conflicting with keyframe animation
- `:focus-visible { outline: 2px solid #cd853f; outline-offset: 2px; }` is the one global accessibility affordance defined at the CSS level
- Component-level utility classes defined once in `globals.css` and reused via `className`: `.glass-panel` (16px blur, `--glass-bg`/`--glass-border`, 16px radius), `.glass-button` (12px blur, pill radius, hover state swaps to `--glass-bg-hover`/`--glass-border-bright`), `.heading` (weight 300, tight tracking), `.hero-text` (clamp-based responsive display type)
- `className="glass-panel ..."` combined with inline `style={{ color: 'var(--text-muted)' }}` is the dominant pattern for applying CSS-variable colors that Tailwind's static compiler cannot class-ify (seen throughout `AnalysisResults.tsx`) — prefer this mixed `className` (layout/spacing) + `style` (CSS-variable color values) approach
- 13 component files reference `glass` styling across `about/`, `audio/`, `dashboard/`, `experience/` subdirectories — glass-panel/glass-button are the two reusable primitives; no dedicated `<GlassPanel>` React wrapper component was found, so glass styling is applied directly via class name rather than componentized

## Component Patterns

- Functional components only, `'use client'` directive at top of interactive/stateful files (`AnalysisResults.tsx`)
- Props typed via a co-located `interface {ComponentName}Props` immediately above the component
- Heavy/SSR-incompatible components (maps) are lazy-loaded via `next/dynamic` with `ssr: false` and an explicit `loading:` fallback that matches the glass-panel visual language (`AnalysisResults.tsx` dynamic-imports `MiniMap`)
- State/formatting logic kept in `src/lib/utils.ts` as small pure functions (`cn`, `formatStatus`, `formatPercent`, `formatFileSize`, `validateWavFile`, `getStatusColorClass`, `getStatusBgColor`) and imported into components rather than inlined
- `cn()` (clsx + tailwind-merge) is the standard way to compose conditional/merged Tailwind classes — use it instead of manual string concatenation or template literals for className logic
- Status-to-color mapping exists in two places with overlapping purpose: `STATUS_COLORS` (in `@/types`) and `getStatusColorClass`/`getStatusBgColor` (in `@/lib/utils.ts`) — check both before adding a third mapping

## Accessibility Patterns

- `aria-label` used on icon-only interactive controls (play/pause/stop buttons): `ControlsPanel.tsx`, `DemoState.tsx`, `LocationCompare.tsx`, `AudioCompare.tsx`, `ABCrossfader.tsx` — pattern is `aria-label={isPlaying ? 'Pause' : 'Play'}`
- `aria-expanded` on collapsible banners: `CaveatsBanner.tsx`, `CaveatsFooter.tsx`
- `aria-hidden="true"` on decorative SVG elements and `role="img"` + `aria-label` on the architecture diagram (`ArchitectureDiagram.tsx`) to describe a complex visual to screen readers
- Global `:focus-visible` outline defined in `globals.css` ensures keyboard-focus visibility app-wide
- Only 13 files across the whole `dashboard-next/src/components` tree contain any `aria-*` attribute — accessibility coverage is targeted at audio controls and a couple of banners, not comprehensive
- No semantic landmark usage (`<nav>`, `<main>`, skip links) confirmed during this scan — verify in `src/app/layout.tsx` before assuming
- No `alt` text audit performed; the MapLibre maps and Observable Plot charts are visually dense and have no text-equivalent/data-table fallback yet (axe regression tests in `tests/e2e/a11y.spec.ts` guard against new serious or critical violations)
- Automated accessibility testing: `@axe-core/playwright` in `tests/e2e/a11y.spec.ts` (no Lighthouse CI)

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Router | HTTP routing, upload validation, DynamoDB status fan-out | `lambdas/router/handler.py` |
| Preprocessor | WAV decode, resample, segment | `lambdas/preprocessor/handler.py` |
| Classifier | Orchestrates inference, runs MLP, region adjustment, similarity | `lambdas/classifier/handler.py` |
| Region detection | Biogeographic region naming + distance to the nearest real training site (never scales probabilities) | `lambdas/classifier/region_detection.py` |
| Inference container | SurfPerch embedding extraction | `infrastructure/lambda_container/inference.py` |
| Next.js dashboard | Upload/analyze UX, site explorer, immersive experience | `dashboard-next/src/app/` |
| Zustand analysis-store | Client state machine for upload→analyze→poll→results | `dashboard-next/src/stores/analysis-store.ts` |
| API client | Typed fetch wrapper + polling loop | `dashboard-next/src/lib/api.ts` |
| Feature modules | New code behind a legacy-import fence: contract client, MapLibre maps, Observable Plot charts, client-error reporting | `dashboard-next/src/features/` |

## Pattern Overview

- No queue/step-function orchestration — each Lambda stage directly `lambda_client.invoke()`s the next with `InvocationType='Event'` (fire-and-forget); failures are recorded as DynamoDB `ERROR` items, not retried automatically.
- Single DynamoDB table with composite `pk`/`sk` keys models multiple entity types (uploads, analyses, results, errors) — see Data Flow below.
- Classifier inference is split from the "thinking" Lambda: `classifier` holds the trained MLP weights (pure NumPy, no TF) and calls out synchronously to the heavy `inference` container Lambda for embeddings only.
- Frontend never talks to Lambdas directly — always through the single `$default`-route API Gateway behind `dashboard-next/src/lib/api.ts`.
- Frontend status/results are obtained by polling (`ApiClient.pollAnalysis`), not WebSockets/SSE.

## Layers

- Purpose: durable artifacts (raw/processed audio, reference embeddings) + ephemeral job state
- Location: `reefradar-2477-audio`, `reefradar-2477-embeddings`, `reefradar-2477-metadata` (bucket/table names from `ARCHITECTURE.md` at repo root and `infrastructure/resources.json`)
- Depends on: nothing (leaf layer)
- Used by: all four Lambdas
- Purpose: router → preprocess → classify → infer, chained via async invoke
- Location: `lambdas/*/handler.py`, `infrastructure/lambda_container/inference.py`
- Depends on: S3, DynamoDB, each other (one-directional chain)
- Used by: API Gateway (router only); internal chain invokes the rest
- Purpose: upload UI, polling UX, data visualization, immersive audio experience, reference site explorer
- Location: `dashboard-next/src/app/`
- Depends on: `lib/api.ts` (one API client honouring `NEXT_PUBLIC_API_URL`), `features/contract` (the versioned data contract), zustand store, hooks, components
- Used by: end users

## Data Flow

### Primary Request Path (upload → analyze → preprocess → classify → infer → visualize/poll)

### Reference Site Browsing (`/sites`, `/dashboard/map`)

### Immersive Audio Experience (`/experience`)

- Zustand (`create()`, no middleware) for the analysis store; components read it via the hook for reactive subscriptions or `getState()`/`setState()` where re-render thrashing matters.
- `@tanstack/react-query` (`QueryClient`, defaults asserted by a unit test) is initialized in `app/providers.tsx` and used by the contract client; `lib/api.ts`'s polling loop itself does not use react-query — polling is a hand-rolled `while` loop with `setTimeout`.
- No server-side session/auth state; all state is client-local per browser tab.

## Key Abstractions

- Purpose: single typed HTTP boundary to the API Gateway; owns the polling loop
- Examples: `api.uploadAudio`, `api.startAnalysis`, `api.pollAnalysis`
- Pattern: class with private `request<T>()` wrapper, exported as a module-level singleton `api`
- Purpose: JSON-serialize DynamoDB `Decimal` values returned from `get_item`/`query`
- Pattern: custom `json.JSONEncoder` subclass passed as `cls=` to every `json.dumps`
- Purpose: minimal global state without context providers; `analysis-store` for the upload/poll lifecycle
- Pattern: plain `create<T>((set) => ({...}))`, actions co-located with state

## Entry Points

- Location: `dashboard-next/src/app/layout.tsx`
- Triggers: every route; wraps in `Providers` (react-query, contract version sync, client-error reporter), `ConditionalShell` (nav/footer, hidden on `/experience/*`) and Vercel Speed Insights
- Responsibilities: global CSS import, font setup, shell composition
- `/` — `dashboard-next/src/app/page.tsx` — landing + `SampleGallery` (`components/gallery`)
- `/about` — `dashboard-next/src/app/about/page.tsx`
- `/sites` — `dashboard-next/src/app/sites/page.tsx` — MapLibre `WorldMap` (`features/map`)
- `/dashboard` — `dashboard-next/src/app/dashboard/page.tsx`
- `/dashboard/analyze` — `dashboard-next/src/app/dashboard/analyze/page.tsx` — upload/classify flow, uses legacy `components/audio/SpectrogramCanvas`
- `/dashboard/compare` — `dashboard-next/src/app/dashboard/compare/page.tsx`
- `/dashboard/map` — `dashboard-next/src/app/dashboard/map/page.tsx` — MapLibre `ReefMap` (`features/map`, circle layers on a GeoJSON source)
- `/experience` — `dashboard-next/src/app/experience/page.tsx` (own `layout.tsx`, immersive/no-chrome) — demo, compare and sample states; audio playback and the upload flow
- `lambdas/router/handler.py::handler(event, context)` — API Gateway proxy entry
- `lambdas/preprocessor/handler.py::handler` — invoked async by router
- `lambdas/classifier/handler.py::handler` — invoked async by preprocessor
- `infrastructure/lambda_container/inference.py` — invoked sync by classifier (container image handler)

## Architectural Constraints

- **Threading:** Browser-side audio analysis (the analyser-driven spectrogram on `/dashboard/analyze` and compare) runs on `requestAnimationFrame` on the main thread — no Web Workers or `AudioWorklet`; the decorative ambient layer (background canvas, caustics, particles, vitality store, colour engine) was removed in Phase 3.
- **Global state:** the module-level zustand `analysis-store.ts` is an app-wide singleton; `lib/api.ts` exports a singleton `ApiClient` instance (`api`).
- **Async fire-and-forget chain:** Router→Preprocessor→Classifier uses `InvocationType='Event'` with no dead-letter queue visible in the explored code — a crash mid-chain surfaces only as a stuck `stage` in DynamoDB until a client times out polling (60 × 2s = 120s in `ApiClient.pollAnalysis`).
- **Region detection is descriptive only:** `lambdas/classifier/region_detection.py` names the biogeographic region from static bounding boxes and reports distance to the nearest real training site (`in_training_region` within 50 km); it never scales probabilities or confidence (D-12); no runtime learning.
- **Feature fence:** nothing under `dashboard-next/src/features` may import `@/components` (ESLint `no-restricted-imports` plus `scripts/check-feature-fence.mjs`), and only `features/contract` may reach the contract CDN (`scripts/check-contract-fence.mjs`).

## Anti-Patterns

- None recorded since the Phase 3 cleanup (the duplicated band constants and the second SpectrogramCanvas went with the ambient layer).

## Error Handling

- Router: every `handle_*` function catches broadly and returns `response(500, {...})`; validation errors return `400` with typed `error.code` strings (`FILE_TOO_SMALL`, `INVALID_AUDIO_FORMAT`, `FILE_TOO_LARGE`, `MISSING_UPLOAD_ID`, `UPLOAD_NOT_FOUND`, `ANALYSIS_NOT_FOUND`).
- Frontend: `ApiClient.request<T>()` normalizes both network and API error-body failures into a thrown `Error` with the API's `error.message`; `ApiClient.pollAnalysis` additionally throws on `status === 'failed'` or on exhausting `maxAttempts`.
- `/sites`: router degrades gracefully to a 4-site hardcoded fallback rather than failing the request if S3 read/parse fails.

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
