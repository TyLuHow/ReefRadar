# Coding Conventions

**Analysis Date:** 2026-09-30

## Naming Patterns

**Files:**
- Python (lambdas, scripts): `snake_case.py` — `handler.py`, `region_detection.py`, `test_inference_lambda.py`
- TypeScript/React components: `PascalCase.tsx` — `AnalysisResults.tsx`, `ProbabilityBars.tsx`, `CoordinateModal.tsx`
- TypeScript utility/lib modules: `camelCase.ts` or short lowercase — `utils.ts`, `color-engine.ts` (kebab-case used for multi-word lib files)
- Next.js App Router special files: lowercase Next.js convention — `page.tsx`, `layout.tsx`, `route.ts`
- Components grouped by domain in subdirectories: `src/components/{about,audio,charts,dashboard,experience,maps}/`

**Functions:**
- Python: `snake_case` — `convert_floats()`, `detect_region()`, `adjust_classification()`
- TypeScript: `camelCase` — `formatStatus()`, `getStatusBgColor()`, `validateWavFile()`
- React components exported as named `PascalCase` functions: `export function AnalysisResults({ result }: AnalysisResultsProps)`

**Variables:**
- Python: `snake_case`, module-level constants `UPPER_SNAKE_CASE` — `AUDIO_BUCKET`, `MAX_RETRIES`, `RETRY_DELAYS`, `BATCH_SIZE`
- Python module-level caches prefixed with underscore for warm-Lambda state: `_model_weights`, `_model_config`, `_reference_embeddings`
- TypeScript: `camelCase` for locals, `UPPER_SNAKE_CASE` for module constants (`color-engine.ts`: `DEG_PRIMARY`, `THRESHOLD_ACCENT`, `GLOW_ALPHA_DEGRADED`)

**Types:**
- TypeScript interfaces: `PascalCase`, often suffixed `Props` for component props — `AnalysisResultsProps`, `ReefColors`
- Shared domain types centralized in `dashboard-next/src/types` (e.g. `AnalysisResult`, `ReefStatus`, `STATUS_COLORS`)
- Python: no dataclasses/TypedDicts observed in lambdas; dict-based payloads validated ad hoc via `event.get(...)` / `event[...]`

## Code Style

**Formatting:**
- No `.prettierrc`, `.eslintrc`, `eslint.config.*`, or `biome.json` found in `dashboard-next/` — linting relies solely on `eslint-config-next` default (`next lint` script in `package.json`), no custom rule overrides present
- No Python formatter/linter config (`.flake8`, `pyproject.toml` with `[tool.black]`, `ruff.toml`) found in `lambdas/` or `scripts/` — Python style is informal/consistent-by-convention rather than enforced by tooling

**Linting:**
- `dashboard-next/package.json` → `"lint": "next lint"` is the only configured check; run manually, not wired into a pre-commit hook or CI config found in the repo

## Import Organization

**TypeScript order (observed, not enforced by tooling):**
1. Framework/external packages (`next/dynamic`, `react`)
2. Internal absolute imports via `@/` alias (`@/types`, `@/lib/utils`, `@/components/charts`)
3. Icon/UI libraries last (`lucide-react`)

**Path Aliases:**
- `@/*` maps to `dashboard-next/src/*` (standard Next.js App Router alias via `tsconfig.json`) — used pervasively: `@/lib/utils`, `@/components/maps`, `@/types`

**Python:**
- Standard library first, then third-party (`boto3`, `numpy`), then local module imports — seen in `lambdas/classifier/handler.py`: `json, boto3, os, numpy, uuid, time` → `from datetime import datetime` → `from decimal import Decimal` → `from region_detection import detect_region, adjust_classification`
- Each Lambda (`classifier/`, `preprocessor/`, `router/`) has its own `requirements.txt`; no shared Python package/dependency management (no shared `lambdas/common/` module observed)

## Error Handling

**Python (Lambda handlers):**
- Custom exception classes carry structured metadata for API responses: `InferenceError(message, error_type='INFERENCE_FAILED', retry_count=0, request_id=None)` in `lambdas/classifier/handler.py`
- Explicit "NEVER falls back to synthetic data" policy — module docstring and inline comments assert hard-fail-on-error behavior instead of silent degradation (`lambdas/classifier/handler.py:1-5`, `:70`)
- Retry pattern with exponential backoff constants: `MAX_RETRIES = 3`, `RETRY_DELAYS = [1, 2, 4]` seconds, applied around inference calls
- Layered `try/except`: narrow `except InferenceError as e:` catches re-raise with re-raise (`raise`) to propagate to the Lambda runtime for proper HTTP error mapping, broader `except Exception as e:` wraps unexpected errors into `InferenceError`
- `context.aws_request_id` captured and threaded through errors for traceability (`request_id = context.aws_request_id if context else str(uuid.uuid4())`)

**TypeScript (dashboard-next):**
- Validation-first pattern returning typed result objects rather than throwing, for user-facing checks: `validateWavFile(file: File): { valid: boolean; error?: string }` in `src/lib/utils.ts`
- Defensive rendering: components check for missing/null data and render a fallback message rather than crashing (`AnalysisResults.tsx`: `if (!classification) { return <div className="glass-panel p-6">...No classification results available...</div> }`)
- No global error boundary or `app/error.tsx` confirmed present — check `dashboard-next/src/app/` for `error.tsx` before assuming resilience at the route level

## Styling System

**Tailwind config** (`dashboard-next/tailwind.config.js`):
- Hardcoded brand palette tokens: `abyss`, `depths`, `bg-surface`, `bone`, `ochre`, `dusty-rose`, `pale-gold`, `muted-tan`, `warm-gray`, `warm-amber`
- CSS-variable-backed dynamic tokens (resolved at runtime, not compile time): `glass-bg`, `glass-hover`, `glass-active`, `glass-border`, `status-healthy`, `status-degraded`, `status-restoring-early`, `status-restoring-mid`, `reef-primary`, `reef-accent`, `reef-secondary`, `reef-highlight`, `reef-bg`, `reef-surface`, `reef-glow`, `reef-text`
- Custom font families mapped to CSS vars from `next/font`: `--font-inter`, `--font-jetbrains-mono`
- `backdropBlur.glass: '16px'` and custom keyframe `wave` for reef-themed motion
- When adding new themeable colors, prefer a CSS custom property in `globals.css` plus a matching Tailwind color token (pattern used throughout) rather than a hardcoded hex in `tailwind.config.js`, so values can be dynamically updated (see vitality engine below)

**`globals.css` custom properties** (`dashboard-next/src/app/globals.css`):
- `:root` defines layered token groups: Backgrounds (`--bg-abyss`, `--bg-depths`, `--bg-surface`), Glassmorphism (`--glass-bg`, `--glass-bg-hover`, `--glass-bg-active`, `--glass-border`, `--glass-border-bright`), Text (`--text-primary`, `--text-secondary`, `--text-muted`, `--text-dim`), Frequency Bands (`--freq-low/mid/high`), Health Status (`--status-healthy`, `--status-degraded`, `--status-restoring-early`, `--status-restoring-mid`), Accents (`--accent-glow`, `--accent-warning`, `--accent-info`), and the Reef Vitality system (`--reef-primary`, `--reef-accent`, `--reef-secondary`, `--reef-highlight`, `--reef-bg`, `--reef-surface`, `--reef-glow`, `--reef-text`)
- Global transition rule applies to common properties on every element (`*` selector): `transition-property: background-color, border-color, color, fill, stroke, opacity, box-shadow, transform; transition-duration: 150ms;` — animations (`.animate-spin`, `.animate-pulse`) are explicitly excluded (`transition: none`) to avoid conflicting with keyframe animation
- `:focus-visible { outline: 2px solid #cd853f; outline-offset: 2px; }` is the one global accessibility affordance defined at the CSS level
- Component-level utility classes defined once in `globals.css` and reused via `className`: `.glass-panel` (16px blur, `--glass-bg`/`--glass-border`, 16px radius), `.glass-button` (12px blur, pill radius, hover state swaps to `--glass-bg-hover`/`--glass-border-bright`), `.heading` (weight 300, tight tracking), `.hero-text` (clamp-based responsive display type)

**Vitality CSS-variable color engine** (`dashboard-next/src/lib/color-engine.ts`):
- Pure, side-effect-free module: takes a single `vitality` score (0.0 degraded → 1.0 healthy) and computes 8 HSL/HSLA color strings (`ReefColors` interface: `primary, accent, secondary, highlight, bg, surface, glow, text`) which callers then assign onto the `--reef-*` CSS custom properties
- Degraded/healthy endpoint colors are defined as `[H, S, L]` tuples (`DEG_PRIMARY`, `HLT_PRIMARY`, etc.) — do not hardcode new hues inline; add a new endpoint tuple pair plus a threshold constant following this pattern
- Per-token stagger thresholds (`THRESHOLD_PRIMARY = 0.2`, `THRESHOLD_GLOW = 0.2`, `THRESHOLD_TEXT = 0.3`, `THRESHOLD_ACCENT = 0.4`, `THRESHOLD_HIGHLIGHT = 0.7`, `THRESHOLD_SECONDARY = 0.7`, `THRESHOLD_BG = 0.0`, `THRESHOLD_SURFACE = 0.0`) control when each token starts transitioning as vitality rises, via `effectiveVitality(raw, threshold)` — this staggering is intentional design (see `computeSecondary()` comment: avoids "ugly green/purple mid-states" by snapping hue and delaying saturation ramp)
- `lerpHSL(fromH, fromS, fromL, toH, toS, toL, t, hueDirection)` is the core interpolation primitive with a `'cw' | 'ccw' | 'shortest'` hue-direction parameter for correct circular hue interpolation; `lerpHSLA` is the alpha-channel variant used for glow effects (`GLOW_ALPHA_DEGRADED = 0.2`, `GLOW_ALPHA_HEALTHY = 0.5`)
- When extending the vitality system (new token, new status state), follow the existing pattern: define degraded/healthy `[H,S,L]` endpoint tuples, assign a stagger threshold, and route through `lerpHSL`/`lerpHSLA` rather than computing colors ad hoc in components

**Glass components (usage pattern):**
- `className="glass-panel ..."` combined with inline `style={{ color: 'var(--text-muted)' }}` is the dominant pattern for applying CSS-variable-driven colors that Tailwind's static JIT compiler can't class-ify dynamically (seen throughout `AnalysisResults.tsx`) — prefer this mixed `className` (layout/spacing via Tailwind utilities) + `style` (CSS-variable color values) approach for any component that must react to the vitality engine or theme tokens
- 13 component files reference `glass` styling across `about/`, `audio/`, `dashboard/`, `experience/` subdirectories — glass-panel/glass-button are the two reusable primitives; no dedicated `<GlassPanel>` React wrapper component was found, so glass styling is applied directly via class name rather than componentized

## Component Patterns

- Functional components only, `'use client'` directive at top of interactive/stateful files (`AnalysisResults.tsx`)
- Props typed via a co-located `interface {ComponentName}Props` immediately above the component
- Heavy/SSR-incompatible components (maps) are lazy-loaded via `next/dynamic` with `ssr: false` and an explicit `loading:` fallback that matches the glass-panel visual language (`AnalysisResults.tsx` dynamic-imports `MiniMap`)
- State/formatting logic kept in `src/lib/utils.ts` as small pure functions (`cn`, `formatStatus`, `formatPercent`, `formatFileSize`, `validateWavFile`, `getStatusColorClass`, `getStatusBgColor`) and imported into components rather than inlined
- `cn()` (clsx + tailwind-merge) is the standard way to compose conditional/merged Tailwind classes — use it instead of manual string concatenation or template literals for className logic
- Status-to-color mapping exists in two places with overlapping purpose: `STATUS_COLORS` (in `@/types`) and `getStatusColorClass`/`getStatusBgColor` (in `@/lib/utils.ts`) — check both before adding a third mapping

## Accessibility Patterns

**Present:**
- `aria-label` used on icon-only interactive controls (play/pause/stop buttons): `ControlsPanel.tsx`, `DemoState.tsx`, `LocationCompare.tsx`, `AudioCompare.tsx`, `ABCrossfader.tsx` — pattern is `aria-label={isPlaying ? 'Pause' : 'Play'}`
- `aria-expanded` on collapsible banners: `CaveatsBanner.tsx`, `CaveatsFooter.tsx`
- `aria-hidden="true"` on decorative SVG elements and `role="img"` + `aria-label` on the architecture diagram (`ArchitectureDiagram.tsx`) to describe a complex visual to screen readers
- Global `:focus-visible` outline defined in `globals.css` ensures keyboard-focus visibility app-wide
- Only 13 files across the whole `dashboard-next/src/components` tree contain any `aria-*` attribute — accessibility coverage is targeted at audio controls and a couple of banners, not comprehensive

**Likely absent / not verified (treat as gaps when adding new UI):**
- No semantic landmark usage (`<nav>`, `<main>`, skip links) confirmed during this scan — verify in `src/app/layout.tsx` before assuming
- No `alt` text audit performed; maps, charts (deck.gl, recharts, leaflet) are visually dense and have no evidence of a text-equivalent/data-table fallback
- No automated accessibility testing (axe, Lighthouse CI) configured — see TESTING.md

---

*Convention analysis: 2026-09-30*
