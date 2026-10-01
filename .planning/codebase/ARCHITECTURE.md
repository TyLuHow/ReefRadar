<!-- refreshed: 2026-09-30 -->
# Architecture

**Analysis Date:** 2026-09-30

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────────┐
│  FRONTENDS                                                                 │
│  Next.js 14 App Router        `dashboard-next/src/app/`  (primary, live)   │
│  Streamlit (legacy)           `dashboard/app.py`          (3-tab, port 8501)│
└───────────────────────────────┬────────────────────────────────────────────┘
                                 │ HTTPS (fetch / requests)
                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  API GATEWAY (HTTP API v2, $default route, no auth, CORS: *)              │
└───────────────────────────────┬────────────────────────────────────────────┘
                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  LAMBDA: ROUTER        `lambdas/router/handler.py`                        │
│  GET /health  GET /sites  POST /upload  POST /analyze                     │
│  GET /status/{id}  GET /visualize/{id} (alias GET /results/{id})          │
└───────────┬───────────────────────────────────┬─────────────────────────┘
            │ S3 put_object (uploads/)           │ DynamoDB put/get/update
            ▼                                    ▼
   S3 `reefradar-2477-audio`            DynamoDB `reefradar-2477-metadata`
            │
            │ lambda_client.invoke(InvocationType='Event') — async, fire-and-forget
            ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  LAMBDA: PREPROCESSOR  `lambdas/preprocessor/handler.py`                  │
│  Download WAV from S3 → parse headers (pure Python) → mono → resample     │
│  32kHz → segment 5.0s (160,000 samples) → write segments JSON to S3       │
│  processed/{analysis_id}/ → write DynamoDB `PREPROCESSED` item            │
└───────────────────────────────┬────────────────────────────────────────────┘
                                 │ async invoke (forwards coords)
                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  LAMBDA: CLASSIFIER    `lambdas/classifier/handler.py` +                  │
│                        `lambdas/classifier/region_detection.py`           │
│  Invoke inference Lambda per segment → mean-pool 1280-dim embeddings →    │
│  MLP (1280→256→64→4, pure NumPy) → region-adjust confidence → cosine      │
│  similarity vs 54 reference sites → 2D projection → write `RESULT`/`ERROR`│
└───────────────────────────────┬────────────────────────────────────────────┘
                                 │ sync invoke (RequestResponse)
                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  LAMBDA: INFERENCE (container, 3GB)  `infrastructure/lambda_container/`   │
│  inference.py — TensorFlow CPU + perch-hoplite (SurfPerch, Google         │
│  Research bird-vocalization-classifier reused for reef audio)            │
│  Input: 160,000-sample float32 segments → Output: 1280-dim embeddings    │
└───────────────────────────────────────────────────────────────────────────┘
            │
            ▼
   S3 `reefradar-2477-embeddings`  — reference/metadata.json (54 sites)
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Router | HTTP routing, upload validation, DynamoDB status fan-out | `lambdas/router/handler.py` |
| Preprocessor | WAV decode, resample, segment | `lambdas/preprocessor/handler.py` |
| Classifier | Orchestrates inference, runs MLP, region adjustment, similarity | `lambdas/classifier/handler.py` |
| Region detection | Biogeographic lookup + confidence multiplier | `lambdas/classifier/region_detection.py` |
| Inference container | SurfPerch embedding extraction | `infrastructure/lambda_container/inference.py` |
| Next.js dashboard | Upload/analyze UX, site explorer, immersive experience | `dashboard-next/src/app/` |
| Streamlit dashboard | Legacy 3-tab UI (Analyze / Reference Sites / About) | `dashboard/app.py` |
| Zustand analysis-store | Client state machine for upload→analyze→poll→results | `dashboard-next/src/stores/analysis-store.ts` |
| Zustand vitality-store | Reef "health glow" animation target + band energy | `dashboard-next/src/stores/vitality-store.ts` |
| API client | Typed fetch wrapper + polling loop | `dashboard-next/src/lib/api.ts` |
| Color engine | Vitality value → HSL theme colors | `dashboard-next/src/lib/color-engine.ts` |

## Pattern Overview

**Overall:** Event-driven serverless pipeline (AWS Lambda chain triggered by async `Invoke`) feeding a DynamoDB single-table store that the frontend polls. Frontend is a client-heavy Next.js App Router app — nearly every interactive component is `'use client'`; server components are limited to route-level layout shells.

**Key Characteristics:**
- No queue/step-function orchestration — each Lambda stage directly `lambda_client.invoke()`s the next with `InvocationType='Event'` (fire-and-forget); failures are recorded as DynamoDB `ERROR` items, not retried automatically.
- Single DynamoDB table with composite `pk`/`sk` keys models multiple entity types (uploads, analyses, results, errors) — see Data Flow below.
- Classifier inference is split from the "thinking" Lambda: `classifier` holds the trained MLP weights (pure NumPy, no TF) and calls out synchronously to the heavy `inference` container Lambda for embeddings only.
- Frontend never talks to Lambdas directly — always through the single `$default`-route API Gateway behind `dashboard-next/src/lib/api.ts`.
- Frontend status/results are obtained by polling (`ApiClient.pollAnalysis`), not WebSockets/SSE.

## Layers

**S3 + DynamoDB (storage layer):**
- Purpose: durable artifacts (raw/processed audio, reference embeddings) + ephemeral job state
- Location: `reefradar-2477-audio`, `reefradar-2477-embeddings`, `reefradar-2477-metadata` (bucket/table names from `ARCHITECTURE.md` at repo root and `infrastructure/resources.json`)
- Depends on: nothing (leaf layer)
- Used by: all four Lambdas

**Lambda pipeline (compute layer):**
- Purpose: router → preprocess → classify → infer, chained via async invoke
- Location: `lambdas/*/handler.py`, `infrastructure/lambda_container/inference.py`
- Depends on: S3, DynamoDB, each other (one-directional chain)
- Used by: API Gateway (router only); internal chain invokes the rest

**Next.js App Router (presentation layer):**
- Purpose: upload UI, polling UX, data visualization, immersive audio-reactive experience, reference site explorer
- Location: `dashboard-next/src/app/`
- Depends on: `lib/api.ts` (HTTP), zustand stores, hooks, components
- Used by: end users

**Streamlit (legacy presentation layer):**
- Purpose: original 3-tab demo UI, kept for reference/fallback
- Location: `dashboard/app.py`
- Depends on: same API Gateway endpoint
- Used by: not linked from the Next.js app; standalone deployment

## Data Flow

### Primary Request Path (upload → analyze → preprocess → classify → infer → visualize/poll)

1. User drops a WAV file in `dashboard-next/src/components/FileUpload.tsx` on `/dashboard/analyze` (or the `/experience` flow) → `api.uploadAudio(file)` (`dashboard-next/src/lib/api.ts:63`) → `POST /upload`.
2. Router validates RIFF/WAVE magic bytes and size, writes `uploads/{upload_id}/{filename}` to S3, writes a DynamoDB item `pk=UPLOAD#{id}, sk=METADATA, status=uploaded` (`lambdas/router/handler.py:72-147`).
3. Frontend calls `api.startAnalysis(uploadId, lat?, lon?)` → `POST /analyze` (`dashboard-next/src/lib/api.ts:77`). `useAnalysisStore` transitions `stage: 'uploading' → 'preprocessing'`.
4. Router looks up the upload item, generates `analysis_id`, async-invokes the Preprocessor Lambda with `{upload_id, analysis_id, s3_key, latitude?, longitude?}`, writes `pk=ANALYSIS#{id}, sk=METADATA, status=processing, stage=preprocessing`, and updates the upload item with `analysis_id` (`lambdas/router/handler.py:150-214`).
5. Preprocessor downloads the WAV, converts to mono/32kHz/float32, segments into 5.0s windows, stores segment JSON under `processed/{analysis_id}/` in S3, writes `pk=ANALYSIS#{id}, sk=PREPROCESSED` with `num_segments`, and async-invokes the Classifier.
6. Classifier synchronously invokes the Inference Lambda (container) per batch of segments to get 1280-dim SurfPerch embeddings, mean-pools them, runs the pure-NumPy MLP classifier, calls `region_detection.py` to adjust confidence by biogeographic region, computes cosine similarity against the 54-site reference set loaded from `reference/metadata.json` in the embeddings bucket, derives a 2D projection, and writes `pk=ANALYSIS#{id}, sk=RESULT` (or `sk=ERROR` on failure) (`lambdas/classifier/handler.py`).
7. Frontend polls `GET /visualize/{analysis_id}` via `ApiClient.pollAnalysis()` (`dashboard-next/src/lib/api.ts:106-137`, 2s interval, 60 attempts) — router's `handle_visualize` checks `RESULT` → `PREPROCESSED` (still processing) → `ERROR` → 404, in that order (`lambdas/router/handler.py:301-344`). A parallel `GET /status/{id}` endpoint (`handle_status`, `lambdas/router/handler.py:347-407`) gives coarser stage names (`preprocessing` / `classifying` / `complete` / `failed`) used for progress text.
8. On `status === 'complete'`, `useAnalysisStore.setResults()` stores the `AnalysisResult`; `AnalysisResults.tsx`, `EmbeddingChart.tsx`, `ProbabilityBars.tsx`, and `MiniMap` (deck.gl-free Leaflet) render classification, similarity, and embedding visualization.

### Reference Site Browsing (`/sites`, `/dashboard/map`)

1. `GET /sites` reads `reference/metadata_v6.json` → `metadata_v5.json` → `metadata.json` (first that exists) from the embeddings bucket, falls back to a 4-site hardcoded list on any S3/parse error (`lambdas/router/handler.py:217-298`).
2. `/sites` page renders `WorldMap` (react-leaflet) with `SiteCard` list; `/dashboard/map` renders `ReefMap` (deck.gl `ScatterplotLayer` + `react-map-gl/maplibre`) for a different, heavier visualization of the same site set.

### Immersive Audio Experience (`/experience`)

1. `components/experience/useDemoAudio.ts` / `useLocationAudio.ts` create an `AudioContext` + `AnalyserNode` against a static sample (`public/audio/...`) or a fetched comparison track.
2. `hooks/useAudioVisualBridge.ts` reads `AnalyserNode.getByteFrequencyData()` each rAF tick, computes 4 reef frequency bands (ambient 0–200Hz, fish 200–2000Hz, grazing 1000–4000Hz, shrimp 2000–20000Hz with overlap) via RMS, and writes to `vitality-store` via `getState().setBandEnergy()` (no React re-render) at ~30fps.
3. `hooks/useVitality.ts` runs a separate rAF loop that reads `vitality-store.target`, eases toward it exponentially, and writes 8 `--reef-*` CSS custom properties (computed by `lib/color-engine.ts`) directly onto `document.documentElement.style`, also throttled to 30fps. Started once in `app/providers.tsx`.
4. `components/spectrogram/SpectrogramCanvas.tsx` (+ `useSpectrogramAnimation.ts`) renders a canvas-based scrolling spectrogram keyed on `state` prop (`idle` / `playing` / `analyzing`), used as full-bleed background art on `/`, `/experience`, and inside `DemoState.tsx` / `LocationCompare.tsx`.
5. `BackgroundCanvas.tsx` + `hooks/useBackgroundCanvas.ts` render a separate, independent particle/caustics canvas fixed behind all content (`zIndex: -1`), mounted once in `Providers`.

**State Management:**
- Zustand (`create()`, no middleware) for both cross-cutting stores; components read via the hook for reactive subscriptions or `getState()`/`setState()` directly inside rAF loops to avoid re-render thrashing.
- `@tanstack/react-query` (`QueryClient`) is initialized in `app/providers.tsx` but `lib/api.ts`'s polling loop itself does not use react-query — polling is a hand-rolled `while` loop with `setTimeout`.
- No server-side session/auth state; all state is client-local per browser tab.

## Key Abstractions

**ApiClient (`dashboard-next/src/lib/api.ts`):**
- Purpose: single typed HTTP boundary to the API Gateway; owns the polling loop
- Examples: `api.uploadAudio`, `api.startAnalysis`, `api.pollAnalysis`
- Pattern: class with private `request<T>()` wrapper, exported as a module-level singleton `api`

**DecimalEncoder (`lambdas/router/handler.py:14`):**
- Purpose: JSON-serialize DynamoDB `Decimal` values returned from `get_item`/`query`
- Pattern: custom `json.JSONEncoder` subclass passed as `cls=` to every `json.dumps`

**Zustand stores (`dashboard-next/src/stores/*.ts`):**
- Purpose: minimal global state without context providers; `analysis-store` for the upload/poll lifecycle, `vitality-store` for animation target + band energy
- Pattern: plain `create<T>((set) => ({...}))`, actions co-located with state, consumed via `getState()` in perf-sensitive rAF loops and via the hook elsewhere

**Reef frequency bands:**
- Purpose: domain-specific decomposition of the audio spectrum into biologically meaningful bands
- Examples: defined independently in `dashboard-next/src/hooks/useAudioVisualBridge.ts` (`REEF_BANDS` const) and `dashboard-next/src/components/spectrogram/FrequencyBands.ts` — **not shared**, see STRUCTURE.md duplication note

## Entry Points

**Next.js root layout:**
- Location: `dashboard-next/src/app/layout.tsx`
- Triggers: every route; wraps in `Providers` (react-query + vitality loop + BackgroundCanvas) and `ConditionalShell` (nav/footer, hidden on `/experience/*`)
- Responsibilities: global CSS import, font setup, shell composition

**Next.js route pages (client/server boundary):**
All page files are marked `'use client'` except where noted; see full route table in STRUCTURE.md.
- `/` — `dashboard-next/src/app/page.tsx` — landing + `SampleGallery` (import unresolved, see note below)
- `/about` — `dashboard-next/src/app/about/page.tsx`
- `/sites` — `dashboard-next/src/app/sites/page.tsx` — Leaflet `WorldMap`
- `/dashboard` — `dashboard-next/src/app/dashboard/page.tsx`
- `/dashboard/analyze` — `dashboard-next/src/app/dashboard/analyze/page.tsx` — upload/classify flow, uses legacy `components/audio/SpectrogramCanvas`
- `/dashboard/compare` — `dashboard-next/src/app/dashboard/compare/page.tsx`
- `/dashboard/map` — `dashboard-next/src/app/dashboard/map/page.tsx` — deck.gl `ReefMap`
- `/experience` — `dashboard-next/src/app/experience/page.tsx` (own `layout.tsx`, immersive/no-chrome) — heaviest page, 600+ lines, hosts the audio-reactive pipeline

**Lambda handlers:**
- `lambdas/router/handler.py::handler(event, context)` — API Gateway proxy entry
- `lambdas/preprocessor/handler.py::handler` — invoked async by router
- `lambdas/classifier/handler.py::handler` — invoked async by preprocessor
- `infrastructure/lambda_container/inference.py` — invoked sync by classifier (container image handler)

## Architectural Constraints

- **Threading:** Browser-side, all real-time work (band energy, vitality lerp, spectrogram) runs on `requestAnimationFrame` on the main thread — no Web Workers or `AudioWorklet`; heavy per-frame math is kept intentionally cheap (RMS over small typed-array slices).
- **Global state:** Module-level zustand stores (`analysis-store.ts`, `vitality-store.ts`) are effectively app-wide singletons; `lib/api.ts` exports a singleton `ApiClient` instance (`api`).
- **Async fire-and-forget chain:** Router→Preprocessor→Classifier uses `InvocationType='Event'` with no dead-letter queue visible in the explored code — a crash mid-chain surfaces only as a stuck `stage` in DynamoDB until a client times out polling (60 × 2s = 120s in `ApiClient.pollAnalysis`).
- **Region confidence is a static lookup table:** `lambdas/classifier/region_detection.py` hardcodes a confidence multiplier per geographic region; no runtime learning.
- **Missing committed files:** `@/components/gallery/SampleGallery` (imported in `dashboard-next/src/app/page.tsx:5`) and `@/lib/samples` (imported in `dashboard-next/src/app/experience/page.tsx`) are referenced but do not exist in the working tree or git history — the app will fail to build/run until these are added. See STRUCTURE.md.

## Anti-Patterns

### Duplicated frequency-band constants

**What happens:** `REEF_BANDS` is defined independently in `hooks/useAudioVisualBridge.ts` and a parallel band table exists in `components/spectrogram/FrequencyBands.ts`.
**Why it's wrong:** The two definitions can drift (different Hz boundaries), producing visually inconsistent band→color mapping between the vitality glow and the spectrogram overlay.
**Do this instead:** Extract a single `REEF_BANDS` constant into `dashboard-next/src/lib/` and import it from both.

### Two parallel SpectrogramCanvas implementations

**What happens:** `components/spectrogram/SpectrogramCanvas.tsx` (newer, used by `/`, `/experience`, `DemoState`, `LocationCompare`) and `components/audio/SpectrogramCanvas.tsx` (older, used only by `/dashboard/analyze` and `AudioCompare.tsx`) implement overlapping canvas-spectrogram rendering independently.
**Why it's wrong:** Bug fixes or visual-style changes made in one are silently absent from the other; `/dashboard/analyze` likely has a visually inconsistent spectrogram vs. the rest of the app.
**Do this instead:** Consolidate on `components/spectrogram/SpectrogramCanvas.tsx` and update `app/dashboard/analyze/page.tsx` + `components/audio/AudioCompare.tsx` to import it; retire `components/audio/SpectrogramCanvas.tsx`.

## Error Handling

**Strategy:** Lambdas wrap handler bodies in broad `try/except Exception` and return structured error JSON (`{error: {code, message}}`) or write a DynamoDB `ERROR` sort-key item with `stage`, `error_code`, `suggestion`, `retry_count` for async-chain failures (visible via `/status` and `/visualize`).

**Patterns:**
- Router: every `handle_*` function catches broadly and returns `response(500, {...})`; validation errors return `400` with typed `error.code` strings (`FILE_TOO_SMALL`, `INVALID_AUDIO_FORMAT`, `FILE_TOO_LARGE`, `MISSING_UPLOAD_ID`, `UPLOAD_NOT_FOUND`, `ANALYSIS_NOT_FOUND`).
- Frontend: `ApiClient.request<T>()` normalizes both network and API error-body failures into a thrown `Error` with the API's `error.message`; `ApiClient.pollAnalysis` additionally throws on `status === 'failed'` or on exhausting `maxAttempts`.
- `/sites`: router degrades gracefully to a 4-site hardcoded fallback rather than failing the request if S3 read/parse fails.

## Cross-Cutting Concerns

**Logging:** Minimal — Lambdas rely on default CloudWatch stdout from unhandled exceptions; `components/map/ReefMap.tsx` has explicit `console.error('[ReefMap] ...')` calls for DeckGL render errors. No structured logging library detected.
**Validation:** Router performs manual byte-level WAV validation (RIFF/WAVE magic, min size, 50MB max) before any S3 write; no schema validation framework (e.g., zod) found in `lib/`.
**Authentication:** None — API Gateway has no authorizer, CORS allows all origins (explicitly documented as a known gap in root `ARCHITECTURE.md`).

---

*Architecture analysis: 2026-09-30*
