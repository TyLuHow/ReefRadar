# Phase 3: Platform Upgrade & Stack Consolidation - Pattern Map

**Mapped:** 2026-10-02
**Files analyzed:** 40 new/modified/deleted (grouped)
**Analogs found:** 33 / 40 (7 use RESEARCH.md recipes; see No Analog Found)

All paths relative to `C:/Users/TylerLubyHoward/reefradar/dashboard-next/` unless prefixed with `../` (repo root).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `eslint.config.mjs` (new, replaces `.eslintrc.json`) | config | n/a | `.eslintrc.json` (convert byte-identically) | exact |
| `../scripts/check-feature-fence.mjs` | utility (CI script) | batch/file-I/O | `../scripts/check-contract-fence.mjs` | exact |
| `tests/unit/feature-fence.test.ts` | test | batch | `tests/unit/contract-fence.test.ts` | exact |
| `../.github/workflows/ci.yml` (add step) | config | CI | line 40 `node ../scripts/check-contract-fence.mjs` | exact |
| `src/features/map/{MapShell,WorldMap,MiniMap,SiteMarker,SitePopup,ReefMap,geojson,style,setup}.tsx/ts` | component | request-response (render) | `src/components/map/ReefMap.tsx` (shell, fallback, boundary), `src/components/maps/SiteMarker.tsx` (marker/popup) | role-match |
| `src/features/map/index.ts` | barrel | n/a | `src/features/contract/index.ts` | exact |
| `scripts/copy-maplibre-worker.mjs` (6.x only) | utility | file-I/O | RESEARCH.md "Worker copy script" | no analog |
| `src/features/charts/PlotFigure.tsx` | component | transform | RESEARCH.md Pattern 3 | no analog |
| `src/features/monitoring/{scrub,report,schema}.ts`, `ClientErrorReporter.tsx` | service/hook | event-driven | `src/features/contract/ContractVersionSync.tsx` (mounted-in-Providers leaf), `config.ts`/`errors.ts` style | partial |
| `src/app/api/client-error/route.ts` | route handler | request-response | RESEARCH.md skeleton | no analog (no route handlers exist) |
| `src/app/error.tsx`, `src/app/global-error.tsx` | component | request-response | `DeckGLErrorBoundary` fallback in `ReefMap.tsx:115-170` (copy, `#c08081` icon, inline styles) | partial |
| `src/app/providers.tsx` (modify) | provider | n/a | itself | exact |
| `src/app/layout.tsx` (modify: SpeedInsights, `data-scroll-behavior`) | config | n/a | itself | exact |
| `src/app/globals.css`, `tailwind.config.js` (remove `--reef-*`, add `.crossfader-slider`) | config | n/a | RESEARCH.md "Static slider" | exact |
| `next.config.js`, `package.json`, `tsconfig.json` | config | n/a | itself; RESEARCH.md "next.config.js after the phase" | exact |
| `tests/e2e/support/mock-api.ts` (add speed-insights stub) | test helper | request-response | itself (`page.route` pattern) | exact |
| `tests/e2e/maps.spec.ts`, `monitoring.spec.ts`, `review.spec.ts` | test | e2e | `tests/e2e/routes.spec.ts`, `visual.spec.ts` | role-match |
| `tests/unit/site-index.test.tsx`, `sites-page.test.tsx` (rewrite mocks) | test | n/a | themselves | exact |
| `tests/unit/{api-client,query-defaults,security-headers,stack-consolidation,vitality-removed,platform-versions,plot-figure,error-pages,monitoring-scrub,monitoring-route}.test.ts(x)`, `map-*.test.tsx` | test | n/a | `tests/unit/contract-fence.test.ts`, `site-index.test.tsx`, `api-poll.test.ts` | role-match |
| `../scripts/build-visual-review.mjs` | utility | batch/file-I/O | `../scripts/check-contract-fence.mjs` (Node built-ins, argv parse, walk) | partial |
| `../docs/MONITORING.md`, `../docs/deploy/PHASE-3-*.md` | docs | n/a | `../docs/deploy/PHASE-1-EXIT.md` | role-match |
| Vitality deletions (`stores/vitality-store.ts`, `lib/color-engine.ts`, `hooks/{useVitality,useBackgroundCanvas,useAudioVisualBridge}.ts`, `components/{BackgroundCanvas,dev/VitalityDebugPanel,spectrogram/SpectrogramCanvas,spectrogram/useSpectrogramAnimation}`) | delete | n/a | order per RESEARCH "Vitality system" table | n/a |
| Leaflet/deck.gl deletions (`components/maps/*`, `components/map/{ReefMap,SitePopup}.tsx`) + consumers `app/sites/page.tsx`, `components/AnalysisResults.tsx`, `app/dashboard/map/page.tsx`, `components/index.ts` | modify | n/a | `AnalysisResults.tsx` existing `next/dynamic` MiniMap import | exact |
| `../dashboard/` (Streamlit), `../CLAUDE.md`, `../.claude/CLAUDE.md`, `../ARCHITECTURE.md` | delete/docs | n/a | RESEARCH "Streamlit Deletion" line list | exact |

## Pattern Assignments

### `eslint.config.mjs` (config)

**Analog:** `.eslintrc.json` (all 3 `no-restricted-syntax` selectors + import pattern must be carried over unchanged; run `npx @next/codemod@16.3.8 next-lint-to-eslint-cli . --force`, then trim).

**Existing rules to preserve** (`.eslintrc.json`, lines 4-33):
```json
"files": ["src/**/*.{ts,tsx}"], "excludedFiles": ["src/features/contract/**"],
"no-restricted-syntax": ["error",
  { "selector": "Literal[value=/NEXT_PUBLIC_CONTRACT_BASE_URL|cloudfront\\.net|contract\\/(latest|v\\d+)\\.json/]", "message": "Contract artifacts may only be fetched from src/features/contract." },
  { "selector": "TemplateElement[value.raw=/contract\\/(latest|v)|cloudfront\\.net/]", ... },
  { "selector": "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/CONTRACT/]", ... } ],
"no-restricted-imports": ["error", { "patterns": [{ "group": ["@/features/contract/*", "**/features/contract/*", "**/contracts/fixtures/**"], "message": "Import from '@/features/contract' only." }] }]
```
**Target shape:** RESEARCH.md "Feature-Module Fence" (3 config blocks: general src, `src/features/**` adds `LEGACY` pattern `['@/components','@/components/**']`, contract module gets LEGACY only; legacy paths downgrade `react-hooks/set-state-in-effect|refs|immutability` to `warn`). In JS use `String.raw` for selectors. Pin `eslint` 9.39.5, delete `.eslintrc.json`, `"lint": "eslint ."`. Do NOT use the broad `**/components/**` glob (blocks a feature's own `./components`).

---

### `../scripts/check-feature-fence.mjs` (utility, batch)

**Analog:** `../scripts/check-contract-fence.mjs` (copy structure wholesale: header comment, `parseArgs` with `--root`, `walk`, exit codes).

**Arg parsing + walk pattern** (lines 49-84):
```js
function parseArgs(argv) {
  let root = path.join(REPO_ROOT, 'dashboard-next', 'src');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') { const value = argv[i + 1]; if (!value) { console.error('FAIL: --root needs a directory'); process.exit(1); } root = path.resolve(value); i += 1; }
    else { console.error(`FAIL: unknown argument ${argv[i]}`); process.exit(1); }
  }
  return root;
}
function* walk(dir, root) { /* readdirSync withFileTypes; skip node_modules/.next; yield files with SCANNED ext */ }
```
**Output convention** (lines 103-110): `${rel}:${index + 1}: ${rule}` per hit to stderr; `FAIL: N ... hit(s)` exit 1; `OK: ... (N file(s) scanned).` exit 0.

**Differences:** scan only `src/features/**` (invert the contract script's skip); detect specifiers via regex over `import|export ... from|import(|require(`; fail on `^@/components(/|$)` or a relative specifier whose `path.resolve(dirname(file), spec)` lands under `<root>/components/`. Node built-ins only.

**CI wiring:** next to `../.github/workflows/ci.yml:40` `- run: node ../scripts/check-contract-fence.mjs` add `- run: node ../scripts/check-feature-fence.mjs`.

---

### `tests/unit/feature-fence.test.ts` (test)

**Analog:** `tests/unit/contract-fence.test.ts`

**Header + ESLint harness** (lines 1-60): `// @vitest-environment node`; `execFileSync, spawnSync`, `fs/os/path`; `const { ESLint } = require('eslint') as {...}`; `new ESLint({ cwd: DASHBOARD_ROOT })`; `lintText(code, { filePath })`; `FENCE_RULES = ['no-restricted-syntax','no-restricted-imports']`; table of `VIOLATIONS` via `it.each`, plus "passes inside the module" and "allows public barrel" cases; second `describe` makes tmp trees (`fs.mkdtempSync(path.join(os.tmpdir(), 'contract-fence-'))`) and runs the script with `--root`.
**Cases to plant:** `@/components/Navbar` and `@/components` from `src/features/map/x.tsx` (fail); `./components/Local` inside a feature (pass); `@/lib/api` (pass); `@/components/Navbar` from `src/app/` (pass); dynamic import is a documented ESLint gap, so assert via the script. Drop/replace the two `eslint-disable-next-line @typescript-eslint/no-require-imports` comments (become unused-directive warnings on flat config).

---

### `src/features/map/*` (component, render)

**Analogs:** `src/components/map/ReefMap.tsx` (shell pieces), `src/components/maps/SiteMarker.tsx` (marker + popup content), `src/features/contract/index.ts` (barrel).

**Reuse verbatim from ReefMap.tsx:**
- `prefersReducedMotion()` (lines 31-37) and `detectWebGLSupport()` (lines 45-57). Change order for MapLibre 6 to check `webgl2` first and treat missing WebGL2 as unsupported:
```ts
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
return gl !== null;
```
- `WebGLFallback({ height })` (lines 61-103): inline-styled panel, `rgba(26,23,20,0.6)` bg, ochre pin SVG, copy "WebGL is required for the interactive map". Move into `MapShell`, reuse for WorldMap/MiniMap (MiniMap: 200px panel, single line).
- `DeckGLErrorBoundary` (lines 106-170): class component with `getDerivedStateFromError` + `componentDidCatch(console.error)`; rename `MapErrorBoundary`, keep copy "Map failed to initialize" and `#c08081` icon.
- Existing structure: detect after mount in `useEffect` (`setWebglSupported(detectWebGLSupport())`, line 209), "Initializing map..." while null (line 400), fallback if false (422), boundary wraps content (433).

**Marker/popup content to carry** (`components/maps/SiteMarker.tsx`): sizes `isHighlighted ? 16 : 12`, border `3 : 2`, `box-shadow 0 2px 4px rgba(0,0,0,0.3)`, pulse animation when highlighted; colour `STATUS_COLORS[site.status] || '#666'` from `@/types`; `formatStatus` from `@/lib/utils`; popup `min-w-[180px]` with site_id + status pill; lat/lon read as `site.latitude/longitude`, return `null` if undefined (lines 37-44). Replace `L.divIcon` with react-map-gl `Marker` rendering a `<button type="button" aria-label="{site_id}, {country}, {Status label}">`.

**Target recipe** (RESEARCH Pattern 2, verified):
```tsx
'use client';
import * as maplibregl from 'maplibre-gl';
import { Map, Marker, Popup, NavigationControl, AttributionControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
if (typeof window !== 'undefined') maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs'); // v6 only
const mapLib = Promise.resolve(maplibregl);
// <Map mapLib={mapLib} mapStyle={OSM_RASTER_STYLE} attributionControl={false}>
// <Popup closeOnClick={false} maxWidth="300px" onClose=.../>  + Escape keydown -> close + marker button focus()
```
Raster style object and attribution strings: RESEARCH "Recipe". Coordinates are `[lon, lat]`; convert once in `geojson.ts` and unit test Indonesia (lon ~119, lat ~-5). ReefMap: single GeoJSON `Source` (`promoteId="site_id"`) + 4 `circle` layers per UI-SPEC encoding table; colours via `['get','color']` from `STATUS_COLORS` (delete `STATUS_COLORS_RGB`, lines 24-30); `MAP_STYLE` CARTO URL and `DEFAULT_VIEW_STATE` (lines 15-22) kept; fly-to de-dup by last region id preserved; `RegionBounds` from `@/lib/regions` (a `lib` import is allowed by the fence).

**Fence constraint:** nothing in `features/map` may import `@/components/**`; `SitePopup` moves into `features/map`; `HealthLegend`/`MapControls` stay legacy and are composed by the page (`app/`), not imported by the feature.

**Consumer pattern** (`components/AnalysisResults.tsx`, existing): `next/dynamic(() => import(...).then(m => m.MiniMap), { ssr: false, loading: <glass-panel fallback> })`; repoint to `@/features/map`.

**Barrel pattern** (`features/contract/index.ts` lines 1-6): doc comment stating the one public surface, then named exports; deep imports are banned by the fence.

---

### `src/features/monitoring/*`, `src/app/api/client-error/route.ts`, `src/app/error.tsx`, `src/app/global-error.tsx`

**Analog for the mount-once client leaf:** `src/features/contract/ContractVersionSync.tsx`, rendered inside `Providers` in a leaf (`providers.tsx` lines 34-37). Add `<ClientErrorReporter />` the same way.

**Providers target** (current `src/app/providers.tsx`, lines 1-41): keep `QueryClient` defaults exactly (`staleTime: 60 * 1000`, `refetchOnWindowFocus: false`; tested by `query-defaults.test.tsx`); delete `useVitality` import/call (line 28) and the `BackgroundCanvas` dynamic import/render (lines 9-12, 32); keep the `<Suspense fallback={null}><ContractVersionSync/></Suspense>` leaf pattern.

**Error page analog:** `ReefMap.tsx` `DeckGLErrorBoundary` fallback (inline styles, `#c08081` icon, same dark panel) for `global-error.tsx` (inline styles only; own `<html lang="en"><body>`). `error.tsx` uses `glass-panel` and lucide `AlertTriangle`, h1 `tabIndex={-1}` focused on mount, "Try again" wired to `retry` (decision), never render `error.message`.

**Route handler / scrub / report:** no existing route handlers. Use RESEARCH skeleton (415/413/403/429/204, zod 4 `.strict()`, `console.error(JSON.stringify({ evt:'client-error', ... }))`). POST URL must be `/api/client-error/` (trailing slash, else 308). Add `fetch` in `features/monitoring/report.ts` to the api-client fetch allowlist. Zod already installed (`zod 4.4.3`); mirror `features/contract/schema.ts` for schema style, `errors.ts` for error classes.

---

### `tests/e2e/support/mock-api.ts` (test helper)

**Analog:** itself. It routes API host via `page.route(API_HOST_PATTERN, ...)` and records unhandled calls in a `WeakMap` (lines 24-45; `API_HOST_PATTERN` line 47).
**Add** inside `mockApi()` (RESEARCH Pitfall 6):
```ts
await page.route(/\/_vercel\/speed-insights\//, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
```
This must be a non-API route so it does not land in `UNHANDLED`.

### `tests/e2e/visual.spec.ts` (modify, after Leaflet removal)

**Analog:** itself, lines ~79-84: `'canvas, .maplibregl-map, .leaflet-container { visibility: hidden !important; }'` becomes `'canvas, .maplibregl-map { ... }'`. Keep `blockMapTiles(page)` for `tile.openstreetmap.org` and `cartocdn.com`. Maps spec (`maps.spec.ts`): copy `mockApi(page)` + `blockMapTiles` + `afterEach(expectNoUnhandledApiCalls)` conventions from existing specs; `playwright.config.ts` `webServer.env: { NEXT_PUBLIC_E2E_HOOKS: '1' }`.

### `tests/unit/site-index.test.tsx` and `sites-page.test.tsx` (rewrite mocks)

**Analog:** itself, lines 8-21 (Leaflet mocks):
```tsx
vi.mock('react-leaflet', () => ({ MapContainer: ({children}) => <div data-testid="leaflet-map">{children}</div>, TileLayer: () => null, useMap: () => ({ fitBounds: () => undefined }) }));
vi.mock('leaflet', ...);
vi.mock('@/components/maps/SiteMarker', () => ({ SiteMarker: ({ site }) => <div data-testid="marker" data-site=... /> }));
import { MiniMap } from '@/components/maps/MiniMap';
```
Replace with `vi.mock('react-map-gl/maplibre', ...)` (Map renders div, Marker/Popup render children), mock `maplibre-gl`, stub `HTMLCanvasElement.prototype.getContext` to return a truthy object so the shell passes, import `MiniMap` from `@/features/map`. Keep the remainder (QueryClient wrapper, `installContractFetch`, `setContractPin`, `resetContractStore`) unchanged. Never import real maplibre in Vitest.

### New unit-gate tests (stack-consolidation, vitality-removed, api-client, security-headers, query-defaults, platform-versions)

**Analog:** `tests/unit/contract-fence.test.ts` (fs walk of the real tree + `// @vitest-environment node`), `tests/unit/api-poll.test.ts` (fetch stubbing for `lib/api.ts`). Sources of truth:
- `src/lib/api.ts:14`: `const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod';` (use `vi.stubEnv` + `vi.resetModules()` + dynamic import).
- `vercel.json` headers: `source "/(.*)"` with exactly `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- DS-07 grep gate targets only the eight tokens `--reef-(primary|accent|secondary|highlight|bg|surface|glow|text)` and `reef-(...)` classes, NOT the substring `reef-` (`LoadingReef` has `reef-pulse`).
- `copy-claims.test.ts` scans all of `src/`: new strings must avoid "reported", "fixed", "AI", "real-time".

## Shared Patterns

### Feature-module layout
**Source:** `src/features/contract/` (barrel `index.ts`, internal `client.ts/config.ts/errors.ts/schema.ts`, tests import internals but app code does not).
**Apply to:** `features/map`, `features/charts`, `features/monitoring`. Expose a single `index.ts`; keep `'use client'` on interactive files; props via co-located `interface XProps`.

### Lint fence + script fence pair
**Source:** `.eslintrc.json` selectors + `../scripts/check-contract-fence.mjs`, tested by `contract-fence.test.ts`, CI step `.github/workflows/ci.yml:40`.
**Apply to:** the legacy-import fence (config, script, test, CI step). The existing contract fence must keep passing unmodified after the flat-config conversion.

### Lazy map loading
**Source:** `components/AnalysisResults.tsx` dynamic MiniMap (`next/dynamic`, `ssr:false`, glass-panel loading). **Apply to:** `app/sites/page.tsx`, `app/dashboard/map/page.tsx`, `AnalysisResults.tsx`.

### Colours from one source
**Source:** `STATUS_COLORS` in `src/types/index.ts`. **Apply to:** SiteMarker, ReefMap paint expressions, WorldMap legend, PlotFigure. Do not add copies.

### Test mocking of network
**Source:** `tests/e2e/support/mock-api.ts` `mockApi` + `blockMapTiles`; `tests/unit/support/contract-fetch` (`installContractFetch`). **Apply to:** all new e2e specs and any unit test touching contract data.

### Commit discipline
Each hop is an individually green commit: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, `npx playwright test --project=e2e`; update tests in the same commit as any module removal (Next build type-checks `tests/**`). Never use `--legacy-peer-deps`. Do not push during a snapshot dispatch; push only `git push origin redesign/v2-discovery`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/app/api/client-error/route.ts` | route handler | request-response | No route handlers exist; use RESEARCH skeleton |
| `src/features/charts/PlotFigure.tsx` | component | transform | No Plot/d3 use; use RESEARCH Pattern 3 and UI-SPEC PlotFigure rules |
| `scripts/copy-maplibre-worker.mjs` | utility | file-I/O | New for maplibre 6.x only; RESEARCH code example (skip if 5.24.0 chosen) |
| `src/features/monitoring/scrub.ts` / `report.ts` | service | event-driven | No reporter exists; follow RESEARCH scrub spec |
| `src/app/error.tsx`, `global-error.tsx` | component | request-response | No `error.tsx` exists; partial styling analog only |
| `../scripts/build-visual-review.mjs` + `review.spec.ts` | utility/test | batch | Phase 1 review page exists in docs only (`docs/deploy/PHASE-1-EXIT.md`); no generator script in `scripts/` |
| Upgrade/codemod steps | config | n/a | Procedural; follow RESEARCH Upgrade Playbook |

## Metadata

**Analog search scope:** `dashboard-next/src`, `dashboard-next/tests`, `scripts/`, `.github/workflows/ci.yml`, `dashboard-next/{package,vercel}.json`, `next.config.js`
**Files read:** CONTEXT, RESEARCH (full), UI-SPEC, `.eslintrc.json`, `next.config.js`, `vercel.json`, `check-contract-fence.mjs`, `contract-fence.test.ts` (1-80), `providers.tsx`, `features/contract/index.ts`, `ReefMap.tsx` (1-135 targeted), `SiteMarker.tsx` (1-70), `site-index.test.tsx` (1-50), `mock-api.ts` (1-70), `visual.spec.ts` (60-110), `api.ts` (1-40)
**Pattern extraction date:** 2026-10-02
