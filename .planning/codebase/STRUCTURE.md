# Codebase Structure

**Analysis Date:** 2026-09-30

## Directory Layout

```
reefradar/
├── lambdas/                     # AWS Lambda source (router/preprocessor/classifier)
│   ├── router/handler.py
│   ├── preprocessor/handler.py
│   └── classifier/{handler.py, region_detection.py}
├── infrastructure/              # Container-based inference Lambda + IaC artifacts
│   ├── lambda_container/{Dockerfile, inference.py, requirements.txt, buildspec.yml}
│   ├── resources.json           # deployed resource name/ID registry
│   └── ec2_transfer_template.yaml
├── dashboard-next/               # Primary frontend — Next.js 14 App Router
│   └── src/
│       ├── app/                 # route segments (see table below)
│       ├── components/          # shared + route-local React components
│       ├── hooks/                # cross-cutting client hooks
│       ├── lib/                  # api client, color engine, regions, utils
│       ├── stores/                # zustand stores
│       └── types/                 # shared TypeScript types
├── dashboard/                    # Legacy Streamlit app (app.py, port 8501)
├── scripts/                       # Operational/ML utility scripts (not explored in depth)
├── config/                        # Deployment/runtime config
├── prompts/                        # AI prompt artifacts, incl. prompts/completed/
├── docs/                           # Includes ARCHITECTURE_DIAGRAMS.md (mermaid)
├── ARCHITECTURE.md, API.md, COSTS.md, PORTFOLIO.md, README.md, TO-DOS.md, CLAUDE.md  # root-level docs
└── .planning/codebase/              # this analysis output
```

## Directory Purposes

**`lambdas/`:**
- Purpose: one subdirectory per Lambda function, each with a flat `handler.py` (plus `region_detection.py` helper for classifier)
- Contains: pure-Python request handlers, no shared package between them (each Lambda is deployed independently, likely with its own zip/layer)
- Key files: `lambdas/router/handler.py` (entry `handler`), `lambdas/preprocessor/handler.py`, `lambdas/classifier/handler.py` + `lambdas/classifier/region_detection.py`

**`infrastructure/lambda_container/`:**
- Purpose: the one Lambda that needs TensorFlow/perch-hoplite, too large for a zip — shipped as a container image
- Contains: `Dockerfile`, `inference.py` (handler), `requirements.txt`, `buildspec.yml` (CodeBuild)
- Key files: `inference.py`

**`dashboard-next/src/app/`:**
- Purpose: Next.js App Router route tree — every folder with a `page.tsx` is a route
- Contains: route pages, nested layouts, global CSS, app icon

**`dashboard-next/src/components/`:**
- Purpose: all React components; mixes flat top-level general components with feature-named subfolders
- Contains: both route-specific components (e.g. `dashboard/`, `sites/`, `experience/`) and shared primitives (`ui/`, `ui/glass/`)

**`dashboard-next/src/hooks/`:**
- Purpose: reusable client-side logic not tied to one component tree (animation loops, audio bridging, scroll)
- Contains: `useVitality.ts`, `useAudioVisualBridge.ts`, `useBackgroundCanvas.ts`, `useSpectrogram.ts`, `useAudioPlayer.ts`, `useScrollProgress.ts`, `useAnimateOnScroll.ts`

**`dashboard-next/src/lib/`:**
- Purpose: framework-agnostic utilities and the API boundary
- Contains: `api.ts` (HTTP client), `color-engine.ts` (vitality→HSL), `regions.ts`, `utils.ts`
- **Missing file referenced in code:** `lib/samples.ts` (imported by `app/experience/page.tsx`) does not exist on disk or in git history

**`dashboard-next/src/stores/`:**
- Purpose: zustand global state
- Contains: `analysis-store.ts` (upload/analyze/poll lifecycle), `vitality-store.ts` (animation target + band energy)

**`dashboard/`:**
- Purpose: legacy Streamlit dashboard, kept for reference per task scope (explicitly out of deep-dive scope here)
- Contains: `app.py`

## Key File Locations

**Entry Points:**
- `dashboard-next/src/app/layout.tsx`: Next.js root layout (Providers + ConditionalShell)
- `dashboard-next/src/app/providers.tsx`: react-query provider, starts `useVitality()`, mounts `BackgroundCanvas`
- `lambdas/router/handler.py::handler`: API Gateway Lambda proxy entry point
- `infrastructure/lambda_container/inference.py`: container image Lambda entry point

**Configuration:**
- `infrastructure/resources.json`: deployed AWS resource name registry (bucket/table/function names)
- `dashboard-next/next.config.js` / `dashboard-next/tsconfig.json` (not read in depth — standard Next.js config location)
- Root `ARCHITECTURE.md`, `API.md`, `COSTS.md`: hand-maintained docs describing deployed infra (useful cross-reference, may drift from code)

**Core Logic:**
- `lambdas/classifier/handler.py`: embedding→classification→similarity pipeline (577 lines)
- `lambdas/preprocessor/handler.py`: WAV parsing/resampling/segmentation (375 lines)
- `infrastructure/lambda_container/inference.py`: SurfPerch embedding extraction (291 lines)
- `dashboard-next/src/lib/api.ts`: typed API client + polling loop
- `dashboard-next/src/lib/color-engine.ts`: vitality-to-color mapping (230 lines)

**Testing:**
- No test files were found under `lambdas/`, `infrastructure/`, or `dashboard-next/src/` during this scan — treat as a coverage gap (see CONCERNS.md if produced).

## Naming Conventions

**Files:**
- React components: PascalCase filename matching the exported component (`FileUpload.tsx`, `ReefMap.tsx`)
- Hooks: `useXxx.ts` camelCase, always in `src/hooks/` or co-located inside a feature folder (e.g. `components/experience/useDemoAudio.ts`)
- Barrel files: `index.ts` per component subfolder re-exporting its public members (`components/maps/index.ts`, `components/map/index.ts`, `components/spectrogram/index.ts`, `components/charts/index.ts`, `components/sites/index.ts`, `components/ui/glass/index.ts`, top-level `components/index.ts`)
- Lambda handlers: always `handler.py` inside a per-function directory named after the function

**Directories:**
- Route segments under `app/` use lowercase kebab-free single words matching the URL path (`dashboard/`, `sites/`, `about/`, `experience/`)
- Component subfolders are feature/domain-named, lowercase (`audio/`, `maps/`, `map/`, `spectrogram/`, `gallery/`)

## Where to Add New Code

**New Feature (frontend):**
- Route: add a folder + `page.tsx` under `dashboard-next/src/app/` (nest under `dashboard/` if it's part of the analysis workflow)
- Feature components: new subfolder under `dashboard-next/src/components/<feature>/` with an `index.ts` barrel, following the existing pattern
- Shared primitives (buttons, cards, panels): `dashboard-next/src/components/ui/` or `ui/glass/` if it's a "glassmorphism" styled primitive

**New Lambda stage:**
- New directory under `lambdas/<name>/handler.py`; wire into the chain via `lambda_client.invoke()` from the preceding stage, following the `preprocessor → classifier` pattern (event payload dict, `InvocationType='Event'`)

**New reusable client hook:**
- `dashboard-next/src/hooks/` if genuinely cross-feature; keep hook local to `components/<feature>/` (as `useDemoAudio.ts`, `useLocationAudio.ts`, `useAudioPlayback.ts` already are under `components/experience/`) if it's single-feature-specific

**Utilities:**
- Shared, framework-agnostic helpers: `dashboard-next/src/lib/`
- Shared types: `dashboard-next/src/types/index.ts`

## Special Directories

**`dashboard-next/public/audio/`:**
- Purpose: static sample audio assets (including `public/audio/compare/aus/`) served directly by Next.js
- Generated: No
- Committed: Yes (but the component that curates/displays them, `SampleGallery`, is missing — see Duplicate/Dead Code below)

**`dashboard-next/.planning/`:**
- Purpose: GSD planning artifacts for prior frontend phases (vitality engine, visual effects, audio-reactive system, page integration) — historical context only, per task scope treated as reference, not live code
- Generated: No (hand-authored planning docs)
- Committed: Yes

**`prompts/completed/`:**
- Purpose: archived AI prompt transcripts/specs used during development
- Generated: Partially (human + AI authored)
- Committed: Yes

## Duplicate / Parallel Modules

| Pair | Files | Status |
|------|-------|--------|
| Spectrogram canvas (two independent implementations) | `components/spectrogram/SpectrogramCanvas.tsx` (+ `useSpectrogramAnimation.ts`, `FrequencyBands.ts`) vs `components/audio/SpectrogramCanvas.tsx` | **Real duplication.** `spectrogram/` version is used by `/`, `/experience`, `components/experience/DemoState.tsx`, `components/experience/LocationCompare.tsx`. `audio/` version is used only by `app/dashboard/analyze/page.tsx` and `components/audio/AudioCompare.tsx`. Visual behavior can drift between the legacy analyze flow and the newer immersive flow. |
| Frequency-band constants (two independent definitions) | `hooks/useAudioVisualBridge.ts` (`REEF_BANDS` const, 4 bands with Hz ranges) vs `components/spectrogram/FrequencyBands.ts` | **Real duplication** — not re-exported from a shared module; must be kept in sync manually. |
| `components/map/` vs `components/maps/` | `components/map/ReefMap.tsx` (deck.gl + maplibre, used only by `/dashboard/map`) vs `components/maps/{WorldMap,MiniMap,SiteMarker}.tsx` (react-leaflet, used by `/sites` and `AnalysisResults.tsx`'s `MiniMap`) | **Not a true duplicate** — two different mapping stacks deliberately used for two different UX needs (heavy interactive globe vs. lightweight embedded map), but the near-identical directory names (`map` singular vs `maps` plural) are easy to confuse during imports/navigation. Consider renaming one (e.g. `components/deck-map/` and `components/leaflet-map/`) to reduce ambiguity. |
| `components/audio/AudioCompare.tsx` vs `components/experience/LocationCompare.tsx` / `ComparisonPanel.tsx` | Overlapping "compare two audio sources" UX implemented separately for `/dashboard/compare` vs `/experience` | Not verified as byte-identical logic, but both implement audio A/B comparison UI independently — worth consolidating if both are actively maintained. |

## Dead / Orphaned / Missing Files

**Orphaned (exists, not imported anywhere):**
- `dashboard-next/src/components/ui/WaveBackground.tsx` — no references found anywhere in `src/` outside its own file. Confirmed dead code; candidate for removal.

**Missing but imported (will break build):**
- `@/components/gallery/SampleGallery` — imported in `dashboard-next/src/app/page.tsx:5` (`import { SampleGallery } from '@/components/gallery/SampleGallery'`). Only `components/gallery/SampleCard.tsx` is present and tracked in git; `SampleGallery.tsx` is absent from both the working tree and `git ls-files`.
- `@/lib/samples` — imported in `dashboard-next/src/app/experience/page.tsx`. No `lib/samples.ts`/`.tsx` exists on disk or in git history.
- Both gaps mean `dashboard-next` currently cannot build/typecheck cleanly from a fresh clone until these two files are authored or the imports are removed.

---

*Structure analysis: 2026-09-30*
