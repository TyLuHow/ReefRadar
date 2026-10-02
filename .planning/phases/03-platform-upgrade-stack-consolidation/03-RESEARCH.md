# Phase 3: Platform Upgrade & Stack Consolidation - Research

**Researched:** 2026-10-02
**Domain:** Next.js 14 to 16 / React 18 to 19 upgrade, MapLibre-only maps, Observable Plot, vitality-layer removal, Vercel monitoring, lint fences
**Confidence:** HIGH for the upgrade, ports and fences (each was executed in scratch copies of the repo); MEDIUM for monitoring retention (depends on the owner's Vercel plan) and for WebGL inside the Linux CI image

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Upgrade and vitality removal**
- Upgrade Next.js 14.2.35 → 16 and React 18 → 19 using the official codemods (`@next/codemod`, React 19 codemods). Step through Next 15 as separate, individually green commits within this phase rather than one big-bang jump. Keep App Router, `trailingSlash: true` and `images.unoptimized`. Check `transpilePackages` once deck.gl is removed.
- Tailwind stays on v3 in this phase. The Tailwind v4 migration belongs to the Phase 4 design system.
- Remove the vitality system: vitality store, colour engine, background canvas, caustics/particles, decorative spectrogram and dev vitality panel. Legacy pages fall back to a plain, neutral version of today's dark palette using static CSS tokens. No new visual design until Phase 4.
- Expect visual changes. Regenerate all affected Linux visual baselines through the CI `workflow_dispatch` `update_snapshots` path, and show the owner a before/after review page (like Phase 1) for sign-off. Success criterion 1 requires the diffs to be reviewed and accepted.
- Delete the legacy Streamlit dashboard (`dashboard/`). Git history keeps it. Backend `GET /sites` and the Lambdas are untouched. Update CLAUDE.md and README references to the Streamlit app, factual edits only.

**One map engine, one chart engine**
- Port the Leaflet `WorldMap`, `MiniMap` and `SiteMarker`, and the deck.gl `ReefMap`, to MapLibre (`maplibre-gl` + `react-map-gl/maplibre`). Keep the same OpenStreetMap raster tiles and attribution as today, so the maps look about the same. Phase 6 restyles them. Respect the OSM tile usage policy (attribution, no bulk prefetch).
- Replace every recharts usage with Observable Plot (pin `@observablehq/plot` 0.6.17) plus individual d3 modules (`d3-scale`, `d3-array`, `d3-shape`, `d3-format`). Each chart keeps its meaning: same data, same encodings, honest axes and labels.
- Remove `wavesurfer.js` (no source file uses it), `leaflet`, `react-leaflet`, `@deck.gl/*` and `recharts` from dependencies. `npm ls` must show none of them.

**Monitoring and code structure**
- Monitoring is Vercel only; no new vendor account:
  - Vercel Speed Insights (`@vercel/speed-insights`) for web vitals.
  - A small client error reporter (window `error` / `unhandledrejection` plus a React error boundary / `app/error.tsx` / `global-error.tsx`) that POSTs a scrubbed payload to a Next route handler. The handler logs a structured line to Vercel runtime logs, which the owner opens in the Vercel dashboard.
  - Scrubbing removes PII, presigned URLs and query strings. Payload size and rate are capped.
  - Document where the owner finds both.
- New code lives in `dashboard-next/src/features/*`. Phase 2's `features/contract` already follows this. An ESLint rule fails any import from legacy `@/components/**` inside `src/features/**`, using the same mechanism as the Phase 2 contract fence and `scripts/check-contract-fence.mjs`.
- One API client: `src/lib/api.ts` singleton honours `NEXT_PUBLIC_API_URL` in every flow, with no stray `fetch` to the API elsewhere. React Query caching and the `vercel.json` security headers are preserved, and tests assert both.

### Claude's Discretion
- Exact codemod order, how to split plans, React 19 / Next 16 breakage fixes (async request APIs, `useRef` types, etc.), test tooling version bumps needed for compatibility (Vitest, Playwright, eslint-config-next / ESLint 9 flat config if required), and how the Plot charts are wrapped (a small `<PlotFigure>` in a feature module).

### Deferred Ideas (OUT OF SCOPE)
- Sentry (richer error tracking and source maps): revisit if Vercel logs prove insufficient.
- Tailwind v4 and the light scientific-editorial look (Phase 4).
- Production frontend merge (owner hold).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-01 | Dashboard runs on Next.js 16 / React 19 with legacy routes still functional during migration | "Upgrade Playbook": both hops executed in scratch copies, 51/51 e2e green on 15.5.26 and on 16.3.8; breakage list with fixes |
| PLAT-02 | Duplicate stacks removed: one map engine (MapLibre), one chart approach (Plot + d3), no unused deps (wavesurfer, deck.gl, Leaflet, recharts, Streamlit) [CAP-86] | "Stack Inventory and Removal Order", "MapLibre Port", "Plot wrapper", "Streamlit deletion" |
| PLAT-03 | New code lives in feature modules with a lint fence preventing imports from legacy components | "Feature-Module Fence" (flat-config probe with 9 verified allow/block cases) |
| PLAT-09 | Error monitoring and web-vitals reporting in place for production | "Monitoring Design" (Speed Insights, reporter, route handler, trailing-slash trap, retention limits) |
| PLAT-10 | Single API client honours configured base URL [CAP-09]; React Query caching preserved [CAP-08]; security headers preserved [CAP-10] | "Single API Client, Query Defaults, Headers" (audit shows the code is already compliant; the work is tests plus fences) |
| DS-07 | Vitality system removed [CAP-25, 47, 76-80, 83, 84] | "Vitality Removal", token replacement map, grep gate |
</phase_requirements>

## Summary

The upgrade is far less risky than the roadmap implies. I copied the committed tree into scratch directories and executed both hops: Next 15.5.26 + React 19.3.0 (type-check clean, lint clean apart from the one pre-existing warning, 250 unit tests pass, build passes, 51 of 51 e2e pass) and Next 16.3.8 + React 19.3.0 + ESLint 9.39.5 (type-check clean, build passes after one CSS fix, 237 unit tests pass, 51 of 51 e2e pass). The failures I did see are all predictable and listed below: Turbopack rejects `@import` placed after `@tailwind` in `globals.css`; `next lint` is gone so ESLint must move to a flat config; the Next 16 React-hooks lint rules (React Compiler family) add about 20 findings in legacy files; `next dev` now writes `AGENTS.md`/`CLAUDE.md` into the app folder; and the `upgrade` codemod picks ESLint 10, which crashes with the Next toolchain. There is no async Request API, middleware, AMP or runtime-config usage in the app, so the async codemod is a no-op.

The two real engineering risks are the maps and monitoring. MapLibre 6.11.2 (the version TECH-LANDSCAPE recommends) needs an explicit `setWorkerUrl()` plus two worker files copied into `public/` under Next/Turbopack; without it the map fails with "Worker failed to load" (verified). MapLibre 5.24.0 works with zero worker configuration (verified) and is a documented fallback. Popups opened from a DOM marker close instantly unless `closeOnClick={false}`, and MapLibre's popup does not close on Escape, so the UI-SPEC keyboard contract needs explicit code (both verified in a headless Chromium run). For monitoring, Vercel Hobby keeps runtime logs for only 1 hour (Pro: 1 day; 30 days only with Observability Plus), so "scrubbed error route logs to runtime logs" is only useful if the owner looks quickly or is on a paid plan. That is the single most important thing to put in front of the owner.

**Primary recommendation:** Execute as ordered, individually green commits: fences and test scaffolding first, Next 15.5.26 hop, Next 16.3.8 hop (with ESLint 9.39.5, never 10), baseline-neutral dependency and Streamlit deletion, vitality removal, MapLibre ports into `src/features/map`, Plot wrapper, monitoring, then one CI snapshot regeneration plus the review page. Never run `npm install --legacy-peer-deps` in this repo (it silently drops required peers such as `vite` and `@testing-library/dom`).

## Project Constraints (from CLAUDE.md)

From `./.claude/CLAUDE.md` (project instructions) and `./CLAUDE.md`:
- GSD workflow enforcement: edit files only through a GSD command; no direct repo edits outside a GSD workflow unless the user explicitly asks.
- Tech stack constraint: Next.js upgrade 14.2 to 16 with React 19 on Vercel; incremental migration inside `dashboard-next/` (no big-bang rewrite).
- Integrity: no synthetic or unattributed audio; no displayed probability that is not a probability; every label shows who assigned it. New strings must pass the banned-claims gate (`tests/unit/copy-claims.test.ts`).
- Legacy operability: legacy routes remain working and testable until rehomed per CAPABILITY-MATRIX.
- Licensing: dataset attribution stays on every audio surface (do not drop attribution lines while removing decorative components).
- Browsers: evergreen, Safari 16.4 or newer (matches Next 16's own floor: Chrome 111, Edge 111, Firefox 111, Safari 16.4 [CITED: nextjs.org/docs/app/guides/upgrading/version-16]).
- Access: AWS CLI v1 via `py -3.12 -m awscli`; Vercel CLI and GitHub CLI installed. No AWS writes or deploys in this phase.
- Deploys only from a clean committed tree (Lambda path; not relevant to this phase since no backend change).
- Styling conventions: `cn()` for class merging; prefer CSS custom property plus Tailwind token; `@/*` alias maps to `dashboard-next/src/*`.
- Existing conventions worth keeping: `'use client'` at the top of interactive files, props typed in a co-located `interface XProps`, maps lazy-loaded via `next/dynamic` with `ssr: false` and a loading panel in the glass-panel style.
- Permission/process pitfalls from the orchestrator: run git/gh commands standalone, push only with `git push origin redesign/v2-discovery`, never print secrets or presigned URLs, never read CLI auth/token files, no merge to main, no `vercel --prod`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Map rendering (WorldMap, MiniMap, ReefMap) | Browser / Client | CDN / Static (OSM and CARTO tiles, MapLibre worker files in `public/`) | WebGL and DOM markers are client-only; loaded with `next/dynamic` `ssr:false` |
| Site data for maps | Browser / Client (React Query over the contract hooks) | CDN (CloudFront contract artifacts) | Already Phase 2 behaviour; maps only consume `useLegacySitesResponse` / `useSiteIndex` |
| Chart rendering (Plot) | Browser / Client | none | Plot returns a DOM node; render in `useEffect` into a ref |
| Web-vitals collection | Browser / Client (script) | Vercel platform (collects at `/_vercel/speed-insights/*`) | Script-only component; data visible in the Vercel dashboard |
| Client error capture | Browser / Client | none | window `error`/`unhandledrejection` listeners and error boundaries |
| Error report ingestion and scrub (second pass) | API / Backend (Next route handler, Node runtime on Vercel) | none | Server re-validates, caps, rate-limits, writes one structured line to stdout |
| Error log storage and viewing | Vercel platform (runtime logs) | none | Owner opens Vercel dashboard Logs tab; retention depends on plan |
| Security headers | CDN / Static (Vercel `vercel.json` headers) | none | Applied by the platform, not by `next start`, so they are asserted by reading the JSON, not over HTTP locally |
| API calls to the analysis backend | Browser / Client via the single `src/lib/api.ts` singleton | API Gateway (AWS) | One base URL (`NEXT_PUBLIC_API_URL`), one retry/poll policy |
| Lint and structure fences | Build / CI (ESLint 9 flat config plus Node grep script) | none | Fails the `web` CI job |
| Visual regression and review | CI (Playwright in Docker image) | repo docs | Baselines only regenerate in CI; owner signs off in a static review page |

## Standard Stack

### Current state (read from `dashboard-next/package.json` this session)

Verbatim from `package.json` lines 15-54: dependencies `"@deck.gl/core": "^9.0"`, `"@deck.gl/layers": "^9.0"`, `"@deck.gl/react": "^9.0"`, `"@tanstack/react-query": "^5.51.21"`, `"clsx": "^2.1.1"`, `"framer-motion": "^11.0"`, `"leaflet": "^1.9.4"`, `"lucide-react": "^0.424.0"`, `"maplibre-gl": "^4.0"`, `"next": "14.2.35"`, `"react": "^18.3.1"`, `"react-dom": "^18.3.1"`, `"react-leaflet": "^4.2.1"`, `"react-map-gl": "^7.1"`, `"recharts": "^2.12.7"`, `"sonner": "^1.5.0"`, `"tailwind-merge": "^2.4.0"`, `"wavesurfer.js": "^7.8"`, `"zod": "4.4.3"`, `"zustand": "^4.5"`; devDependencies `"@axe-core/playwright": "4.13.0"`, `"@playwright/test": "1.63.0"`, `"@testing-library/jest-dom": "7.0.1"`, `"@testing-library/react": "16.3.3"`, `"@types/leaflet": "^1.9.8"`, `"@types/node": "24.13.6"`, `"@types/react": "^18.3.3"`, `"@types/react-dom": "^18.3.0"`, `"autoprefixer": "^10.4.19"`, `"eslint": "^8.57.0"`, `"eslint-config-next": "14.2.35"`, `"jsdom": "30.1.1"`, `"postcss": "^8.4.40"`, `"tailwindcss": "^3.4.7"`, `"typescript": "^5.5.4"`, `"vitest": "5.0.3"`. Scripts include `"lint": "next lint"`. [VERIFIED: dashboard-next/package.json:15-54]

Installed (from `npm ls --depth=0`): next 14.2.35, react 18.3.1, eslint 8.57.1, typescript 5.9.3, @tanstack/react-query 5.90.20, zustand 4.5.7, framer-motion 11.18.2, maplibre-gl 4.7.1, react-map-gl 7.1.9, lucide-react 0.424.0, sonner 1.7.4, tailwindcss 3.4.19. [VERIFIED: npm ls, this session]

### Target versions (registry-checked 2026-10-02; behaviour verified in scratch copies)

| Package | Current | Target | Action and reason |
|---------|---------|--------|-------------------|
| `next` | 14.2.35 | hop 1 `15.5.26`, hop 2 `16.3.8` (exact pins) | 16.3.8 was run end to end (build, 51 e2e, 237 unit). Requires Node >= 20.9.0 [CITED: nextjs.org version-16 guide]; CI already uses Node 22 |
| `react`, `react-dom` | ^18.3.1 | `19.3.0` (exact) | Next 16 peer: `^18.2.0 \|\| ^19.0.0`; both hops ran on 19.3.0 [VERIFIED: npm view next@16.3.8 peerDependencies] |
| `@types/react`, `@types/react-dom` | ^18.x | `19.3.0` (exact) | tsc was clean on 19.3.0 types with no source edits [VERIFIED: probe] |
| `eslint-config-next` | 14.2.35 | hop 1 `15.5.26`, hop 2 `16.3.8` | Same version as `next`. 16.x peer `eslint >=9.0.0` [VERIFIED: npm view] |
| `eslint` | ^8.57.0 | hop 1 keep `^8.57.0`; hop 2 `9.39.5` (exact, NOT 10) | ESLint 10.11.0 crashes with this toolchain: `TypeError: scopeManager.addGlobals is not a function` [VERIFIED: probe]. eslint-plugin-react 7.37.5 / import 2.32.0 / jsx-a11y 6.10.2 peer ranges stop at ESLint 9 [VERIFIED: npm view]. npm prints "eslint@9.39.5 ... no longer supported"; accept until the Next toolchain supports 10 |
| `typescript` | ^5.5.4 (5.9.3 installed) | keep `^5.9.3` | Do NOT take 7.0.2: typescript-eslint peer is `typescript >=4.8.4 <6.1.0` [VERIFIED: npm view]. Next 16 needs >= 5.1 |
| `@testing-library/dom` | transitive peer only | add explicit devDependency `10.4.2` (`^10`) | RTL 16.3.3 requires it as a peer; with `--legacy-peer-deps` it vanished and `screen`/`waitFor` imports stopped type-checking [VERIFIED: probe] |
| `@testing-library/react` | 16.3.3 | keep | peer `react ^18 \|\| ^19` |
| `vitest` | 5.0.3 | keep | React 19 tests pass; peer `vite ^6.4 \|\| ^7 \|\| ^8` must stay installed (never `--legacy-peer-deps`) |
| `@playwright/test` | 1.63.0 | keep | CI image `mcr.microsoft.com/playwright:v1.63.0-noble` must stay in step |
| `@tanstack/react-query` | ^5.51.21 (5.90.20 installed) | keep | peer `react ^18 \|\| ^19`; no bump needed |
| `zustand` | ^4.5 (4.5.7) | keep | still used by `features/contract/version.ts` and `stores/analysis-store.ts`; React 19 fine |
| `framer-motion` | ^11.0 (11.18.2) | keep | peer `react ^18 \|\| ^19`; e2e green on React 19. (14.0.0 exists; not needed) |
| `lucide-react` | ^0.424.0 | keep | peer includes `^19.0.0-rc`; `AlertTriangle` exists in 0.424 (grep of its d.ts) |
| `sonner` | ^1.5.0 | keep | peer `^18 \|\| ^19 \|\| ^19.0.0-rc` |
| `maplibre-gl` | ^4.0 (4.7.1) | `6.11.2` (matches TECH-LANDSCAPE) with the worker recipe below; verified fallback `5.24.0` | See "MapLibre Port". Decision needed: see Open Question 1 |
| `react-map-gl` | ^7.1 (7.1.9) | `8.1.3` | Import path stays `react-map-gl/maplibre`; peer `maplibre-gl >=1.13`; depends on `@vis.gl/react-maplibre 8.1.3` (peer `maplibre-gl >=4.0.0`) |
| `@observablehq/plot` | none | `0.6.17` (exact) | Depends on full `d3 ^7.9.0` internally; our own code imports individual modules only |
| `d3-scale` / `d3-array` / `d3-shape` / `d3-format` | none | `4.0.2` / `3.2.4` / `3.2.0` / `3.1.2` | plus devDependencies `@types/d3-scale 4.0.9`, `@types/d3-array 3.2.2`, `@types/d3-shape 3.2.0`, `@types/d3-format 3.0.4` |
| `@vercel/speed-insights` | none | `2.0.0` | Import `SpeedInsights` from `@vercel/speed-insights/next`; v2 is MIT and supports "Resilient Intake" [CITED: vercel.com/docs/speed-insights/package] |
| REMOVE | | `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/react`, `leaflet`, `react-leaflet`, `@types/leaflet`, `recharts`, `wavesurfer.js` | `recharts` and `wavesurfer.js` have zero import sites in `src/` (grep, this session) so removal is dependency-only |

**Installation (in the plan that owns each step, one commit each):**
```bash
# hop 1 (run from dashboard-next/, clean tree)
npm install next@15.5.26 react@19.3.0 react-dom@19.3.0 eslint-config-next@15.5.26 --save-exact
npm install -D @types/react@19.3.0 @types/react-dom@19.3.0 @testing-library/dom@^10 --save-exact=false
# hop 2
npm install next@16.3.8 eslint-config-next@16.3.8 --save-exact
npm install -D eslint@9.39.5 --save-exact
# later plans
npm rm recharts wavesurfer.js
npm rm leaflet react-leaflet @types/leaflet        # after the three Leaflet components are ported
npm rm @deck.gl/core @deck.gl/layers @deck.gl/react # after ReefMap is ported
npm install maplibre-gl@6.11.2 react-map-gl@8.1.3 --save-exact
npm install @observablehq/plot@0.6.17 d3-scale@4.0.2 d3-array@3.2.4 d3-shape@3.2.0 d3-format@3.1.2 @vercel/speed-insights@2.0.0 --save-exact
npm install -D @types/d3-scale @types/d3-array @types/d3-shape @types/d3-format
```
If `npm install` reports a hard ERESOLVE for `react-leaflet` (it does when the `@next/codemod upgrade` command runs `npm install`, see Pitfall 1), add a temporary `"overrides": {"react-leaflet": {"react": "$react", "react-dom": "$react-dom"}}` (verified to resolve) and delete it in the commit that removes `react-leaflet`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| maplibre-gl 6.11.2 | maplibre-gl 5.24.0 | 5.x needs no worker setup and no `public/` copy script (verified), but Phase 6 would migrate to 6 later; 6.x is 8 days old at research time |
| Codemod-chosen versions | exact pins above | The `upgrade` codemod chose `eslint 10.11.0` and added `@types/react` overrides in the probe; reject both |
| Flat config hand-written | `next-lint-to-eslint-cli` codemod | The codemod output was correct (kept all three `no-restricted-syntax` selectors and the import pattern, set `"lint": "eslint ."`, `eslint ^9`); use it, then edit and delete `.eslintrc.json` |

## Package Legitimacy Audit

Run via `gsd_run query package-legitimacy check --ecosystem npm ...` on 2026-10-02. Every "SUS" below carries only the reason `too-new`: the heuristic fires on the age of the latest version, not the package. All are long-established, high-download, official-repo packages. Because the planner rules say SUS requires a human checkpoint, add ONE `checkpoint:human-verify` task at the start of the dependency-bump plans: the executor prints the lockfile diff summary and the exact pinned versions below and the owner (or the plan's verifier) confirms them before install.

| Package | Registry | Latest published | Downloads/wk | Source Repo | Verdict | Disposition |
|---------|----------|------------------|--------------|-------------|---------|-------------|
| @vercel/speed-insights | npm | 2026-03-10 | 5.9M | github.com/vercel/speed-insights | OK | Approved; `postinstall` null |
| @observablehq/plot | npm | 2025-02-14 | 914K | github.com/observablehq/plot | OK | Approved (0.6.17) |
| d3-scale, d3-array, d3-shape, d3-format | npm | 2021 to 2026 | 91M to 125M | github.com/d3/* | OK | Approved |
| @types/d3-scale, -array, -shape, -format | npm | 2023 to 2026 | 32M to 94M | DefinitelyTyped | OK | Approved |
| maplibre-gl | npm | 2026-09-24 | 6.4M | github.com/maplibre/maplibre-gl-js | SUS (too-new) | Flagged; pin 6.11.2 (or 5.24.0); checkpoint |
| react-map-gl | npm | 2026-09-02 | 2.7M | github.com/visgl/react-map-gl | SUS (too-new) | Flagged; pin 8.1.3; checkpoint |
| next, eslint-config-next | npm | 2026-09-30 | 73M / 40M | github.com/vercel/next.js | SUS (too-new) | Flagged; pin 16.3.8 (fallback 16.3.6, published 2026-09-22); checkpoint |
| react, react-dom, @types/react, @types/react-dom | npm | 2026-09-09 | 169M to 214M | facebook/react, DefinitelyTyped | SUS (too-new) | Flagged; pin 19.3.0; checkpoint |
| @next/codemod | npm | 2026-09-30 | 75K | github.com/vercel/next.js | SUS (too-new) | Flagged; run as `npx @next/codemod@16.3.8` (documented official tool); checkpoint |
| eslint, @testing-library/dom | npm | 2026-09 | 190M / 91M | official | SUS (too-new) | Flagged; pin eslint 9.39.5 and dom 10.x (not the latest majors) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** maplibre-gl, react-map-gl, next, eslint-config-next, react, react-dom, @types/react, @types/react-dom, @next/codemod, eslint, @testing-library/dom (all heuristic "too-new" on the latest version). `[ASSUMED]` names: none; every name above comes from the official docs or from `package.json` already in the repo. `postinstall` scripts: none on the new packages. New npm 11 prints `allow-scripts` warnings for `unrs-resolver` (a dependency of `eslint-config-next`); this is informational on the dev box, not a gate.

## Architecture Patterns

### System Architecture Diagram

```
 Browser (legacy routes: /, /sites, /about, /dashboard/*, /experience*)
   |
   |-- layout.tsx -- <Providers: QueryClient(staleTime 60s, no focus refetch), ContractVersionSync, ClientErrorReporter>
   |       |-- <SpeedInsights/>  --script--> Vercel /_vercel/speed-insights/*  --> Vercel dashboard "Speed Insights" tab
   |       |-- pages -> lib/api.ts (single ApiClient, NEXT_PUBLIC_API_URL) -> API Gateway -> Lambdas (untouched)
   |       |-- pages -> features/contract hooks -> CloudFront contract artifacts (Phase 2)
   |       `-- map pages -> features/map (MapShell: WebGL check + MapErrorBoundary)
   |                          |-- WorldMap / MiniMap: raster OSM style, DOM <button> markers, Popup
   |                          `-- ReefMap: CARTO vector style, GeoJSON source + circle layers (halo/core)
   |
   |-- error.tsx / global-error.tsx / window error + unhandledrejection
   |         `--> features/monitoring: scrub -> cap -> rate-limit(client) -> fetch POST /api/client-error/ (keepalive)
   |
 Next route handler  app/api/client-error/route.ts (Node runtime on Vercel)
   |   content-type JSON only, size cap, same-origin check, zod strict schema, scrub again, rate-limit (per instance)
   `--> console.error(JSON.stringify({ evt:'client-error', ... }))  -->  Vercel runtime logs (owner: Logs tab)

 CI (web job): eslint (flat) + check-contract-fence + check-feature-fence + tsc + vitest + next build
 CI (e2e/visual jobs): Playwright in Docker image; visual regenerates only via workflow_dispatch update_snapshots
```

### Recommended Project Structure
```
dashboard-next/
  eslint.config.mjs                 # NEW (flat); .eslintrc.json deleted
  next.config.js                    # trailingSlash, images.unoptimized, agentRules:false (no transpilePackages)
  scripts/copy-maplibre-worker.mjs  # only if maplibre-gl 6 is chosen; runs from predev/prebuild
  src/
    app/ (error.tsx, global-error.tsx, api/client-error/route.ts, layout.tsx, providers.tsx)
    components/                     # LEGACY. Shrinks. Nothing under features/ may import it.
    features/
      contract/                     # existing (Phase 2)
      map/                          # NEW: MapShell, setup (worker url), SiteMarker, SitePopup, WorldMap, MiniMap, ReefMap, geojson.ts, style.ts
      charts/                       # NEW: PlotFigure (only with a unit test; see below)
      monitoring/                   # NEW: scrub.ts, report.ts, ClientErrorReporter.tsx, schema.ts
  tests/unit/                       # new gate tests listed in Validation Architecture
scripts/
  check-feature-fence.mjs           # NEW, sibling of check-contract-fence.mjs
  build-visual-review.mjs           # NEW (UI-SPEC)
docs/deploy/ (PHASE-3-EXIT.md, PHASE-3-VISUAL-REVIEW.md, phase-3-visual-review/)   docs/MONITORING.md
```
Ported maps go to `src/features/map/` (not in place) so they sit behind the fence; `SitePopup` must move there too because `ReefMap` imports it today and a feature may not import `@/components/**`. Update the three consumers (`app/sites/page.tsx`, `components/AnalysisResults.tsx`, `app/dashboard/map/page.tsx`) to `next/dynamic(() => import('@/features/map')...)` and delete `components/maps/` and `components/map/{ReefMap,SitePopup}.tsx` (keep `HealthLegend`, `MapControls`, which have no WebGL coupling). `components/index.ts` re-exports `./maps`; drop that line.

### Pattern 1: Upgrade as individually green commits
Each hop ends with: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`, `npx playwright test --project=e2e` locally, then push and wait for the full CI run (including `visual`) before the next hop. Never push while a snapshot dispatch is running (concurrency `cancel-in-progress: true`).

### Pattern 2: MapLibre via react-map-gl (verified in headless Chromium)
**What:** `Map` + `Marker`(DOM button) + `Popup`, plus `Source`/`Layer` for ReefMap circles. **When:** all three map components.
```tsx
// Source: verified probe (maplibre-gl 6.11.2 + react-map-gl 8.1.3, Next 16.3.8 Turbopack) and
// https://visgl.github.io/react-map-gl/docs/api-reference/maplibre/map
'use client';
import * as maplibregl from 'maplibre-gl';                       // v6 is ESM-only: namespace import
import { Map, Marker, Popup, NavigationControl, AttributionControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
if (typeof window !== 'undefined') maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs'); // v6 only
const mapLib = Promise.resolve(maplibregl);
// <Map mapLib={mapLib} mapStyle={OSM_RASTER_STYLE} attributionControl={false} ...>
//   <NavigationControl showCompass={false} position="top-left" />
//   <AttributionControl compact={false} position="bottom-right" />
//   <Marker longitude={lon} latitude={lat} anchor="center"><button type="button" aria-label="..." /></Marker>
//   {open && <Popup longitude={lon} latitude={lat} maxWidth="300px" closeOnClick={false} onClose={...}/>}
```

### Pattern 3: Plot render-into-ref (verified under Vitest 5 and `next build`)
```tsx
// Source: verified probe; ariaLabel/ariaDescription are Plot options (plot.js attrs aria-label / aria-description)
'use client';
import { useEffect, useRef } from 'react';
import * as Plot from '@observablehq/plot';
export function PlotFigure({ options }: { options: Plot.PlotOptions }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const n = Plot.plot(options); ref.current?.append(n); return () => n.remove(); }, [options]);
  return <div ref={ref} />;
}
```
Type trap: `Plot.ruleX([0], { ariaHidden: true })` fails `tsc` (`Type 'boolean' is not assignable to type 'string'`); pass `ariaHidden: 'true'`. Plot's chunk is about 241 KB raw in the production build (measured), so import it only from the component that needs it via `next/dynamic`.

### Anti-Patterns to Avoid
- **`npm install --legacy-peer-deps`:** removes peers (`vite` for Vitest, `@testing-library/dom`), producing confusing Vitest start-up and type errors (both reproduced).
- **Accepting the codemod's package choices blindly:** it selected `eslint 10.11.0`.
- **Per-feature `./components` imports blocked by a too-broad glob:** `**/components/**` blocks a feature's own `./components/Foo`; ban the alias `@/components` only in ESLint and resolve relative paths in the grep script.
- **Using the Leaflet tuple order:** Leaflet is `[lat, lon]`, MapLibre `[lon, lat]`; test with a known site.
- **Calling the API Gateway from the new error reporter:** it posts to the same-origin route handler only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Map controls, attribution, popups | custom zoom buttons / attribution div | `NavigationControl`, `AttributionControl`, `Popup` from `react-map-gl/maplibre` | Attribution must stay visible text (OSM policy); controls already keyboard operable (`aria-label="Zoom in"` verified) |
| Marker clustering / hit-testing | custom canvas hit test | MapLibre `circle` layers + `interactiveLayerIds` + `feature-state` | Native, no deck.gl |
| Chart rendering | hand-built SVG for new charts | `PlotFigure` + `d3-scale`/`d3-format` | Honest axes, ARIA options built in |
| ESLint config conversion | manual rewrite of `.eslintrc.json` | `npx @next/codemod@16.3.8 next-lint-to-eslint-cli . --force` (output verified), then trim | Keeps the three contract-fence selectors byte-identical |
| Web-vitals collection | custom `web-vitals` beacon | `@vercel/speed-insights/next` | Locked decision; script-only |
| Error de-duplication / rate limit | per-error timers everywhere | one small module in `features/monitoring` with a Map of fingerprints and a counter | Keeps reporter silent and bounded |
| Image-diff review UI | an image-diff library | CSS `mix-blend-mode: difference` page generated by a Node script with built-ins | UI-SPEC: no new dependencies |
| Peer-dep conflicts | `--force`/`--legacy-peer-deps` | temporary `overrides` for `react-leaflet`, removed with the package | Verified to resolve |

**Key insight:** every risky thing in this phase already has a verified small recipe (worker file copy, `closeOnClick={false}`, trailing-slash POST URL, Speed Insights e2e stub, flat-config blocks). Do not improvise around them.

## Upgrade Playbook (Next 14 to 15 to 16)

### Hop 1: Next 15.5.26 + React 19.3.0 (executed in scratch copy)
Result: `tsc --noEmit` clean; `next lint` prints a deprecation notice and only the pre-existing `react-hooks/exhaustive-deps` warning (`LocationCompare.tsx:91`); `vitest` 250 pass (2 failures are scratch-copy artefacts: missing `infrastructure/resources.json` and top-level docs); `next build` passes and still prints First Load JS; `playwright --project=e2e` 51 passed. `next build` rewrote `tsconfig.json` (`target: ES2017`) [VERIFIED: probe]; commit that change.
- Codemods to run (clean tree, from `dashboard-next/`): `npx @next/codemod@16.3.8 upgrade 15.5.26 --yes` is the official command shape (`upgrade [revision]`, `--yes` skips prompts) [CITED: nextjs.org/docs/app/guides/upgrading/version-15; codemod `--help` run this session]. It runs `npm install` internally, which fails on `react-leaflet`'s React 18 peer; add the temporary `overrides` first. Expected diff: version bumps only. `next-async-request-api` is a no-op here (grep: no `cookies()`, `headers()`, `draftMode()`, `params`, `searchParams` prop, `middleware`, `next/legacy`, `next/amp`, or `experimental-edge` in `src/`; both `useSearchParams` call sites are already under `<Suspense>`).
- Keep ESLint 8.57 and `.eslintrc.json` in this hop (`next lint` still works in 15). Add `@testing-library/dom` explicitly.
- React 19 codemods (`npx codemod@latest react/19/migration-recipe`): not needed; tsc is clean (no `useRef()` without argument, no `forwardRef`/`ReactDOM.render`/string-ref/`propTypes` hits). Run the recipe only to record "no changes" if the plan wants the audit trail. [ASSUMED: command name from React 19 upgrade guide, not executed]

### Hop 2: Next 16.3.8 (executed in scratch copy)
Result after the fixes below: build passes (Turbopack), 237 unit pass (+ the fence suite once `eslint.config.mjs` exists: 22/22 pass), 51/51 e2e pass.
1. `npx @next/codemod@16.3.8 next-lint-to-eslint-cli . --force`: converts `.eslintrc.json` to `eslint.config.mjs`, sets `"lint": "eslint ."`, `eslint ^9`. Output is correct but leaves unused `path`/`__dirname` imports and does not delete `.eslintrc.json`. Pin `eslint` to `9.39.5`; delete `.eslintrc.json`; delete the unused imports. [VERIFIED: probe15]
2. Do not run `upgrade` without reviewing `package.json` afterwards (it chose `eslint 10.11.0` and injected `@types/react*` overrides). Set `next` and `eslint-config-next` to `16.3.8` by hand instead if preferred.
3. **`globals.css` line 6 `@import 'leaflet/dist/leaflet.css';` sits after `@tailwind` directives and Turbopack fails the build** ("@import rules must precede all rules aside from @charset and @layer statements") [VERIFIED: probe]. Baseline-neutral fix in hop 2: move that `@import` to line 1 of `globals.css` (Leaflet is still used until the port); delete it in the Leaflet-removal plan.
4. `next.config.js`: delete `transpilePackages` only in the deck.gl-removal plan (keep until then); add `agentRules: false`. Reason: `next dev` in 16.3 writes `AGENTS.md` and `CLAUDE.md` into the app folder ("Generated AGENTS.md and CLAUDE.md for AI agents. Set `agentRules: false` in next.config to disable.") [VERIFIED: probe; type `agentRules?: boolean` in `next/dist/server/config-shared.d.ts`]. This repo already has `CLAUDE.md` files with GSD meaning; avoid noise. Also replace the stale WSL2/`allowedDevOrigins` comment.
5. `layout.tsx` has `className="scroll-smooth ..."` on `<html>`. Next 16 no longer overrides `scroll-behavior` during navigation; add `data-scroll-behavior="smooth"` to `<html>` to keep the old behaviour [CITED: nextjs.org version-16 guide "Scroll Behavior Override"].
6. Lint triage: with `eslint-config-next 16.3.8` (depends on `eslint-plugin-react-hooks ^7`) the lint run reports React-Compiler-family errors in legacy files [VERIFIED: probe]:
   `react-hooks/set-state-in-effect` x4 (`dashboard/analyze/page.tsx:57`, `audio/AudioCompare.tsx:68`, `charts/ProbabilityBars.tsx:54`, `map/ReefMap.tsx:209`), `react-hooks/refs` x14 (`analyze/page.tsx:290` x3, `AudioCompare.tsx:286,286,364,371,387`, `audio/SpectrogramCanvas.tsx:258`, `hooks/useAudioPlayer.ts:104` x2, `hooks/useAudioVisualBridge.ts:59`, `hooks/useSpectrogram.ts:101` x2), `react-hooks/immutability` x2 (`audio/SpectrogramCanvas.tsx:177`, `useAudioPlayer.ts:56`), plus 2 "unused eslint-disable" warnings in tests. Prescription: in `eslint.config.mjs` set those three rules to `'warn'` for `src/components/**`, `src/hooks/**`, `src/app/**` (legacy, mostly rewritten in Phase 4 to 9) and leave them `'error'` for `src/features/**` and `tests/**`. Files deleted by DS-07/PLAT-02 take 5 findings with them.
7. Remove the `lint` step reliance on `next build`: `next build` no longer lints and no longer prints "First Load JS". `scripts/record-bundle-sizes.mjs` reads `.next/app-build-manifest.json`, which does not exist in Next 16 (listing of `.next/` confirms). Treat the bundle-size baseline as frozen history; do not run the script again; use `npm ls` and chunk inspection for the consolidation proof.
8. `next dev` writes types into `.next/dev/types/**` and `tsconfig.json` now includes them; after deleting or renaming a route, a stale `.next/dev/types/validator.ts` breaks `tsc`/`next build` locally. Fix: `rm -rf .next`. CI is clean.
9. `next build` type-checks `tests/**` too (tsconfig `include` is `**/*.ts(x)`). Any plan that removes a module must update the unit tests that import it in the same commit, or `npm run build` fails.
10. Engines: add `"engines": { "node": ">=20.9.0" }` to `package.json` (Next 16 minimum). Whether Vercel's default Node version satisfies it is `[ASSUMED]`; pin `22.x` in the Vercel project settings or via `engines` to match CI. CI stays on Node 22 (`actions/setup-node@v4`, `node-version: 22`).
11. Defaults that changed but do not bite here: `trailingSlash: true` and `images.unoptimized: true` kept; no `next/image` with queries; no parallel routes; no PPR; `middleware` unused. `next/dynamic` with `ssr:false` is only used inside `'use client'` files (build passes).

## Stack Inventory and Removal Order

### Leaflet (4 files + CSS + tests)
`src/components/maps/{WorldMap,MiniMap,SiteMarker}.tsx`, `maps/index.ts`; `src/app/globals.css` (`@import 'leaflet/dist/leaflet.css'`, `.leaflet-container`, `.leaflet-popup-*`, `.leaflet-control-zoom*`, `.leaflet-control-attribution`, `.custom-marker`); in-component `<style jsx global>` blocks in `WorldMap.tsx` and `MiniMap.tsx` (they define `@keyframes pulse` and `.custom-marker`). Tests: `tests/unit/site-index.test.tsx` mocks `react-leaflet`/`leaflet` (rewrite to mock `react-map-gl/maplibre` and the WebGL check); `tests/unit/sites-page.test.tsx` mocks `@/components/maps` (update path to `@/features/map`). `tests/e2e/visual.spec.ts:79` hides `.leaflet-container` (drop only after Leaflet is gone). Consumers: `app/sites/page.tsx` (`WorldMap`), `components/AnalysisResults.tsx` (`MiniMap`).

### deck.gl (2 files + config)
`src/components/map/ReefMap.tsx` (`DeckGL`, `FlyToInterpolator`, `ScatterplotLayer` x4, `ReactMapGL`), `src/app/dashboard/map/page.tsx` (comment and dynamic import). `next.config.js` `transpilePackages` lists `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/react`. ReefMap also owns `WebGLFallback` and `DeckGLErrorBoundary` (rename `MapErrorBoundary`, keep copy).

### recharts, wavesurfer.js
No import sites in `src/` [VERIFIED: grep]. Remove from `package.json` only. `components/charts/ProbabilityBars.tsx` is hand-built HTML and stays untouched (UI-SPEC).

### Vitality system (verified consumer map)
| File | Role | Action |
|------|------|--------|
| `src/stores/vitality-store.ts` | store (`target`, `bandEnergy`, `activeBands`; types `ReefBandId`, `BandEnergy`) | delete last |
| `src/lib/color-engine.ts` | HSL engine | delete (only `hooks/useVitality.ts` imports it) |
| `src/hooks/useVitality.ts` | rAF loop writing `--reef-*` | delete; remove call in `app/providers.tsx:28` |
| `src/components/BackgroundCanvas.tsx`, `src/hooks/useBackgroundCanvas.ts` | particles and caustics | delete; remove dynamic import and `<BackgroundCanvas />` in `providers.tsx:9-12,32` |
| `src/hooks/useAudioVisualBridge.ts` | 4-band RMS to store | delete; remove `useAudioVisualBridge(...)` and the 3-to-4 band sync effect in `components/experience/useDemoAudio.ts` (about lines 305-325). Keep the audio graph, `activeBands`, `toggleBand`: they drive real audio filtering |
| `src/components/spectrogram/SpectrogramCanvas.tsx`, `useSpectrogramAnimation.ts` | decorative "living spectrogram" | delete; remove dynamic imports and wrapper divs in `app/page.tsx:9-12,27`, `app/experience/page.tsx:23-28,165,267,323,368,431,596,617`, `components/experience/DemoState.tsx:12,45`, `components/experience/LocationCompare.tsx:12,104`. KEEP `components/spectrogram/FrequencyBands.ts` (`BANDS`, `BAND_IDS`, `ALL_BANDS`, `BandId`) because `ControlsPanel`, `DemoState`, `LocationCompare`, `useDemoAudio`, `useLocationAudio` import it; update `spectrogram/index.ts` to export only the bands |
| `src/components/dev/VitalityDebugPanel.tsx` | dev panel | delete; remove dynamic import and render at `app/page.tsx:14-17,64` |
| `app/experience/page.tsx` | `useVitalityStore.getState().setVitality(...)` at 348-356 and 567-575; `ML_TO_VITALITY` at 467 | remove effects and map |
| `components/experience/LocationCompare.tsx` | `useVitalityStore`, `crossfadeToVitality` (line 50), `setVitality` calls (83-97, 258-262), `className="flex-1 vitality-slider"` (265) | remove vitality wiring; rename class to `crossfader-slider`; keep `audio.setCrossfade` |
| `src/app/globals.css` | `--reef-*` block (lines 43-51), `.vitality-slider` rules (235-275), `@keyframes thumb-pulse` (279-282) | replace by `.crossfader-slider` per UI-SPEC; delete the rest |
| `tailwind.config.js` | eight `reef-*` colour entries | delete |
| `components/Navbar.tsx:32-33` | comment "Do NOT add --reef-* ... at all vitality levels" | reword to "fixed palette" (UI-SPEC) |
| `components/ui/LoadingReef.tsx` | has `reef-pulse` class and `reef-pulse-anim` keyframes | NOT vitality; keep. The DS-07 grep gate must target the eight token names (`--reef-(primary|accent|secondary|highlight|bg|surface|glow|text)` and `reef-(primary|...)` classes), not the substring `reef-` |

Safe order (each step leaves the app building and tests green): (1) consumers and call sites in pages/components/hooks, with the DS-07 grep test added red-then-green; (2) CSS and Tailwind tokens plus slider rename; (3) delete the now-unreferenced files from `useAudioVisualBridge` and `useVitality` outward, ending with `vitality-store.ts` and `color-engine.ts`; (4) update tests (`tests/unit/*` do not import any vitality module today: grep shows zero hits in `tests/`). What breaks if done out of order: deleting the store first breaks `experience/page.tsx`, `LocationCompare.tsx`, `useDemoAudio.ts`, `VitalityDebugPanel.tsx`, `useBackgroundCanvas.ts` at once.

### CAPABILITY-MATRIX
Mark `retired` (Q7 justification): CAP-25, 47, 76, 77, 78, 79, 80, 83, 84. CAP-81 (reduced motion) and CAP-82 (mobile gating) carry over as principles to the remaining canvases (`components/audio/SpectrogramCanvas`, which must not read vitality state; it does not today). CAP-86 row lists many unused symbols plus `wavesurfer.js` and Streamlit. Close the dependency/stack part here; the row says to harvest `useAudioPlayback` and the `analysis-store` stage enum before deleting those, so do not delete them in this phase (see Open Question 3).

## MapLibre Port

### Verified facts (headless Chromium, Next 16.3.8 dev server, 2026-10-02)
- maplibre-gl 6.11.2 + react-map-gl 8.1.3: with no worker config the map errors `Worker failed to load. Check that the worker URL is correct.`; `new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url)` also fails (Turbopack does not emit the sibling `maplibre-gl-shared.mjs`); `setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')` with both `maplibre-gl-worker.mjs` and `maplibre-gl-shared.mjs` copied into `public/maplibre/` works: state loaded, `queryRenderedFeatures` returned the core circle, attribution text visible, no console errors. [VERIFIED: probe; matches MapLibre docs, CITED: maplibre.org/maplibre-gl-js/docs/]
- maplibre-gl 5.24.0 + react-map-gl 8.1.3: works with no worker configuration. [VERIFIED: probe]
- Headless Chromium on this Windows box provides WebGL2 (`canvas.getContext('webgl2')` truthy). Whether the Linux Playwright image does is `[ASSUMED]`; see Open Question 5.
- `Popup` must set `closeOnClick={false}`. A click on a DOM marker bubbles as a map click and the default popup closes in the same tick: the marker `onClick` fired but the popup never appeared. [VERIFIED: probe]
- With `closeOnClick={false}`: Enter or Space on the marker button opens the popup, focus moves to the popup close button, whose default `aria-label` is `Close popup` (matches UI-SPEC copy). Pressing Escape does NOT close the popup. [VERIFIED: probe] So the UI-SPEC rule "Escape closes the popup and returns focus to that marker" needs code: while open, a `keydown` listener (document or popup root) that on Escape sets state closed and calls `markerButtonRef.current?.focus()`; also call `focus()` in `onClose` for the close-button path.
- Controls: `NavigationControl` renders `aria-label="Zoom in"` / zoom out; with `showCompass={false}` only the zoom pair shows.
- Coordinates: `Marker`/`Source` take `[lon, lat]`; WorldMap's initial center today is `[lat 0, lon 80]` (Leaflet order); convert once in a helper and unit-test Indonesia (`lon ~119, lat ~-5`).

### Recipe
- **Shared shell (`features/map/MapShell.tsx`):** WebGL check (same `detectWebGLSupport` logic as `ReefMap`: try `webgl2`, `webgl`, `experimental-webgl`; MapLibre 6 needs WebGL2, so in the 6.x path check `webgl2` first and treat missing WebGL2 as unsupported), the "Initializing map..." state, `WebGLFallback`, `MapErrorBoundary`, and `role="region"` `aria-label`. WorldMap and MiniMap now use it too (UI-SPEC "New").
- **Raster style (WorldMap, MiniMap):** `{ version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] }`; `attributionControl={false}` on `Map` plus an explicit `<AttributionControl compact={false} position="bottom-right" />`. The MiniMap string is the shorter one from UI-SPEC.
- **WorldMap:** `initialViewState` zoom 2 and the bbox midpoint (as `[lon, lat]`); `bounds` via `mapRef.current?.fitBounds([[minLon,minLat],[maxLon,maxLat]], { padding: 50, maxZoom: 10 })` in an effect keyed on `sites`; `scrollZoom` default on. Replace `z-[1000]` with `z-10` on the legend.
- **MiniMap:** `scrollZoom={false}`, no nav control, `dragPan`/`touchZoomRotate` on, `dragRotate={false}`, `fitBounds` padding 30, `maxZoom 8`; fix the latent bug that the Leaflet `FitBoundsController` runs its side effect in `useMemo`. Keep rank badges, "Loading map..." and "No location data available" panels.
- **SiteMarker:** DOM `<button type="button" aria-label="{site_id}, {country}, {Status label}">` rendering the same 12px (16px highlighted) dot, colours from `STATUS_COLORS` in `src/types/index.ts`, highlighted pulse disabled under `prefers-reduced-motion`. Light popup styling replaces `.leaflet-popup-*` with `.maplibregl-popup-content` rules (radius 12px, padding `12px 14px`).
- **ReefMap:** one GeoJSON `Source` (`promoteId="site_id"`) with four `circle` layers from the UI-SPEC encoding table; colours via `['get','color']` computed from `STATUS_COLORS` (delete `STATUS_COLORS_RGB`); radii as `['interpolate',['linear'],['zoom'], ...]` stops from the table; hover and selected via `feature-state` (`+2px`); `interactiveLayerIds={['sites-core','sites-no-embedding-core']}` and `cursor` state for the pointer; `pitch: 30`; fly-to by `mapRef.current?.flyTo({ center: [lon,lat], zoom, duration: reduced ? 0 : 1500 })` with the same last-region de-dup; keep the CARTO style URL `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`; keep `SitePopup` as a React overlay.
- **Worker plumbing if 6.x:** `scripts/copy-maplibre-worker.mjs` copies the two files from `node_modules/maplibre-gl/dist/` to `public/maplibre/` (Node built-ins only), wired as `predev`, `prebuild` (and `pretest:e2e` is unnecessary because Playwright's web server runs `npm run build`). Add `public/maplibre/` to `.gitignore` so the copied files always match the installed version. No CSP header exists today (`vercel.json` lists only three headers), so no CSP change is required [VERIFIED: vercel.json:7-25].
- **jsdom testing:** jsdom has no WebGL; unit-test (a) the pure helpers (GeoJSON builder, paint expression builder, `[lon,lat]` conversion, status counts), (b) the shell's fallback branch (`HTMLCanvasElement.prototype.getContext` returns null so the WebGL fallback renders), (c) markers/popups with `vi.mock('react-map-gl/maplibre', ...)` (same style as the current Leaflet mocks in `site-index.test.tsx`). Do not import real `maplibre-gl` in Vitest.
- **Playwright testing:** real map render asserts `.maplibregl-canvas` exists, attribution text visible, DOM markers have the `aria-label` format, Enter/Space/Escape flow, no `pageerror`. For ReefMap click selection add a test-only hook: in the page, `onLoad={(e) => { if (process.env.NEXT_PUBLIC_E2E_HOOKS === '1') (window as any).__reefMap = e.target }}` and set `webServer.env: { NEXT_PUBLIC_E2E_HOOKS: '1' }` in `playwright.config.ts` (the config's `webServer` supports `env`; cross-platform, unlike inline `VAR=1 cmd`). Alternative without a hook: assert only canvas presence and fallback behaviour (weaker).
- **Visual suite:** keep blocking `tile.openstreetmap.org` and `cartocdn.com`; keep `.maplibregl-map` in the hide rule (`visual.spec.ts:79`) and drop `.leaflet-container` after the port. Because the hide rule uses `visibility: hidden` on the map container, DOM markers are hidden in baselines too; only the legend, rank badges and loading/fallback panels remain visible.

## Plot Wrapper (PLAT-02 chart half)
Finding: `recharts` and `wavesurfer.js` have no imports, and `ProbabilityBars.tsx` is hand-built (UI-SPEC says keep it). So "recharts replaced by Plot" is satisfied by deletion. Build `features/charts/PlotFigure.tsx` only with its own unit test (UI-SPEC allows this) and no legacy consumer. The test, run under Vitest/jsdom, asserts: root `svg` has `aria-label` and `aria-description`, a `<figure>` has a `<figcaption>`, a visually hidden `<table>` holds the plotted values, empty data renders "No data to plot." and no SVG, one value renders one mark, probability axis domain `[0, 1]`. I verified `Plot.plot` returns an `svg` with `aria-label`, `aria-description` and per-datum `aria-label` under Vitest 5/jsdom 30. Percent labels shown to users must come from `toIntegerPercentages` (`src/lib/probabilities.ts`), never re-rounded in Plot. Colour: `color: { domain, range }` from `STATUS_COLORS`.

## Monitoring Design (PLAT-09)

**Speed Insights.** `import { SpeedInsights } from '@vercel/speed-insights/next'` and render `<SpeedInsights />` inside `<body>` of `app/layout.tsx` [CITED: vercel.com/docs/speed-insights/quickstart]. Verified in a production build.
- **E2E trap (verified):** on local `next start` the script path `/_vercel/speed-insights/script.js` returns 404, so `routes.spec.ts` (`unexpected >=400 same-origin responses`) fails on all 10 non-h1-exempt routes. Fix in `tests/e2e/support/mock-api.ts` `mockApi()`: `page.route(/\/_vercel\/speed-insights\//, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))`. Visual and a11y specs call `mockApi()` as well.
- **Free-tier limits [CITED: vercel.com/docs/speed-insights/limits-and-pricing]:** free on all plans; free tier shows Real Experience Score only (individual Core Web Vitals need Speed Insights Plus on Pro); 10,000 events per rolling 30 days shared across the team, after which collection is paused for at least 14 days. `sampleRate` can lower usage. Data appears "after a few days of visitors".
- **Where data comes from:** collected only on Vercel deployments (the endpoint is a Vercel platform route). Production merge is on hold, so the owner will see data only from preview deployments of `redesign/v2-discovery` (previews are protected). Whether previews are included in the dashboard figures is `[ASSUMED]`.

**Error reporter.**
- Capture: `ClientErrorReporter` (client component in `Providers`) adds `window.addEventListener('error' | 'unhandledrejection')` once; `error.tsx` and `global-error.tsx` call `reportClientError(error, { source })` from `useEffect`; `MapErrorBoundary` keeps local copy and does not escalate. React error boundaries do not catch event-handler or async errors, hence the window listeners.
- `error.tsx` props: in Next 16.3 the primary recovery prop is `retry` (stable since 16.3.0); `reset` still exists and is described as the no-refetch option; `unstable_retry` was added in 16.2 [CITED: nextjs.org/docs/app/api-reference/file-conventions/error]. UI-SPEC says "Try again calls `reset()`". Recommendation: wire the button to `retry()` (documented default) and accept the UI-SPEC test as "calls the recovery prop"; flag to the UI checker. `error.digest` exists for server-originated errors; never render `error.message`. `global-error.tsx` must render its own `<html>` and `<body>`; static inline styles only (per UI-SPEC).
- Client scrub (`scrub.ts`): send only `{ v, source, name, message, stack, route, digest, ts }`. Message and stack: replace `https?://\S+` with `[url]`, strip anything after `?` or `#` in remaining path-like tokens, replace emails with `[email]`, replace runs of 24 or more `[A-Za-z0-9_-]` with `[token]`, remove `X-Amz-*=value` pairs, truncate message to 300 characters, keep at most 8 stack lines each cut to 200 characters. `route` is `location.pathname` only (no query, no hash). No user agent, no IP, no cookies, no storage values, no audio file names. Client caps: at most 5 reports per page load, dedupe by name+first stack frame for 60 s, ignore `ResizeObserver loop` noise and cross-origin `Script error.`; reporter failures are swallowed (one `console.error` at most).
- Transport: `fetch('/api/client-error/', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body })`. **The trailing slash is mandatory:** with `trailingSlash: true`, `POST /api/client-error` answers `308` to `/api/client-error/`, while `POST /api/client-error/` answers `204` [VERIFIED: probe].
- Server (`app/api/client-error/route.ts`): `export const dynamic = 'force-dynamic'`; reject non-JSON content type (415), `content-length` or body over 4 KB (413), `Origin` host not equal to `Host` (403); parse with zod 4 `.strict()` schema (unknown fields rejected); run the same scrub again; per-instance token bucket (for example 30 per minute, otherwise 429); then `console.error(JSON.stringify({ evt: 'client-error', ...payload, build: process.env.VERCEL_GIT_COMMIT_SHA }))` and `return new Response(null, { status: 204 })`. A per-instance in-memory limiter is best effort on serverless; say so in the docs. `export const runtime = 'nodejs'` is the default. The app has no `output: 'export'`, so route handlers run on Vercel (`/api/client-error/` shows as `ƒ Dynamic` in the build table) [VERIFIED: probe build].
- Log semantics [CITED: vercel.com/docs/logs/runtime]: `console.error` (stderr) is `error` level; limits 256 lines per request, 256 KB per line, 1 MB per request. Free-text search is limited to the `message` and `requestPath` fields, so put a fixed prefix in the message line (`client-error ...`) and filter by Request Path `/api/client-error/`.
- **Retention [CITED: vercel.com/docs/logs/runtime]:** Hobby 1 hour of logs, Pro 1 day, Pro with Observability Plus 30 days, Enterprise 3 days. This undermines "owner can open it" on Hobby. See Open Question 2. Document in `docs/MONITORING.md`: Vercel dashboard, project, Logs, filter Request Path and Level Error, plus the retention table, plus Speed Insights tab and the free-tier caveats above.
- Security headers on the route come from `vercel.json` `source: "/(.*)"` automatically on Vercel.

## Feature-Module Fence (PLAT-03)

Flat config (verified with 9 cases via `ESLint.lintText`): three blocks, because a later config object for the same rule replaces, not merges, an earlier one.
```js
// dashboard-next/eslint.config.mjs  (selectors use String.raw so the backslashes survive; JSON "\\." == JS String.raw "\.")
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
const CONTRACT_DEEP = { group: ['@/features/contract/*', '**/features/contract/*', '**/contracts/fixtures/**'], message: "Import from '@/features/contract' only." };
const LEGACY = { group: ['@/components', '@/components/**'], message: 'src/features/** must not import legacy @/components/**.' };
export default defineConfig([
  ...nextVitals,
  { files: ['src/**/*.{ts,tsx}'], ignores: ['src/features/contract/**'],
    rules: { 'no-restricted-syntax': ['error', /* the three existing selectors, unchanged */],
             'no-restricted-imports': ['error', { patterns: [CONTRACT_DEEP] }] } },
  { files: ['src/features/**/*.{ts,tsx}'], ignores: ['src/features/contract/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [CONTRACT_DEEP, LEGACY] }] } },
  { files: ['src/features/contract/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [LEGACY] }] } },
  { files: ['src/components/**', 'src/hooks/**', 'src/app/**'],
    rules: { 'react-hooks/set-state-in-effect': 'warn', 'react-hooks/refs': 'warn', 'react-hooks/immutability': 'warn' } },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
```
Verified outcomes (my probe used the broader glob `**/components/**`; use the narrower `LEGACY` above): `@/components/Navbar` blocked, `@/components` blocked, `../../components/Navbar` blocked by the broad glob, `@/lib/api` allowed, `@/features/contract/client` blocked, `src/app/*` importing `@/components/*` allowed, **`import('@/components/Navbar')` (dynamic) allowed** (rule limitation), and `./components/Local` was wrongly blocked by the broad glob. Therefore:
- ESLint covers static `import` of the alias; add an `ImportExpression` `no-restricted-syntax` selector for `@/components` in `src/features/**` if desired.
- `scripts/check-feature-fence.mjs` (Node built-ins, same CLI shape as `check-contract-fence.mjs`: `--root DIR`, exit 0/1): walks `src/features/**`, for each `import`/`export ... from`/`import()`/`require()` specifier either matches `^@/components(/|$)` or, if relative, resolves against the file's directory and fails if it lands inside `src/components/`. Wire as a second CI step next to the existing `node ../scripts/check-contract-fence.mjs` in the `web` job of `.github/workflows/ci.yml`.
- Tests: extend the pattern of `tests/unit/contract-fence.test.ts` (it uses `new ESLint({ cwd })` + `lintText`; it passed 22/22 against the flat config on ESLint 9.39.5) with planted violations, a pass case inside a feature, and a clean-tree run of the script via a temp `--root`.
- Survives ESLint 9 flat config: yes, verified. The existing `contract-fence.test.ts` requires no change; the `// eslint-disable-next-line @typescript-eslint/no-require-imports` comments in two tests become unused-directive warnings (add `eslint-config-next/typescript` or delete the comments).

## Single API Client, Query Defaults, Headers (PLAT-10)

Audit result (grep this session): `src/lib/api.ts:14` holds the only API base URL: `const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod';` [VERIFIED: src/lib/api.ts:14]. All API consumers call `api.*` (`about/page.tsx`, `dashboard/analyze/page.tsx`, `experience/page.tsx`, `SampleGallery.tsx`). The only other `fetch(` call sites are the contract client (`features/contract/client.ts:79`, CloudFront artifacts, fenced in Phase 2) and same-origin static audio assets (`components/audio/AudioCompare.tsx:87-88`, `components/experience/useDemoAudio.ts:87-88`, `useLocationAudio.ts:127,260-261`). No `XMLHttpRequest`, axios, or hard-coded `execute-api` outside `api.ts`. So PLAT-10 is a verification task, not a refactor. Add:
1. `tests/unit/api-client.test.ts`: `vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://example.test/prod')`, `vi.resetModules()`, dynamic `import('@/lib/api')`, stub `fetch`, assert the URL starts with the stubbed base; and with the variable unset assert the documented default. Fence assertions in the same file: no `execute-api` or `NEXT_PUBLIC_API_URL` string under `src/` outside `lib/api.ts`; every `fetch(` call site is in an allowlist (`lib/api.ts`, `features/contract/client.ts`, `features/monitoring/report.ts`, the three audio files).
2. `tests/unit/query-defaults.test.tsx`: render `Providers` (after vitality removal it has no rAF loop), read `useQueryClient().getDefaultOptions().queries` and assert `staleTime === 60000` and `refetchOnWindowFocus === false`; plus a dedupe test (two components, same key, one `queryFn` call) to assert caching is live.
3. `tests/unit/security-headers.test.ts`: parse `vercel.json`, find `source: "/(.*)"`, assert exactly `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` [VERIFIED: vercel.json:12-21]. Headers from `vercel.json` are applied by the Vercel platform, not by `next start`, so they cannot be checked against the local server; do not move them into `next.config.js` (not asked, and duplication invites drift).

## Streamlit Deletion

`git ls-files dashboard` returns `dashboard/app.py`, `dashboard/requirements.txt`, `dashboard/start.sh`. Remove with `git rm -r dashboard/`. No CI, pytest, or citation-checker config references it (`pytest.ini` `testpaths = lambdas scripts/tests`; `.github/workflows/ci.yml` has no `dashboard/` path; `scripts/check-citations.mjs` only names `dashboard-next/...` paths). Factual edits needed (live docs only):
- `./CLAUDE.md` line 32 (repo tree line `dashboard/ # Streamlit web UI (legacy)`): delete the line; also the `dashboard-next/` description may mention Leaflet/deck.gl in the stack line (`Next.js 14` appears in the header: update to Next.js 16).
- `./ARCHITECTURE.md` lines 11-12 ASCII box (`Next.js` and `Streamlit` boxes) and lines 247-251 (`#### Streamlit Dashboard (Legacy)` section, `dashboard/app.py`, port 8501); line about "Interactive Leaflet map of similar sites" becomes MapLibre.
- `./.claude/CLAUDE.md` lines 32, 49, 59, 71, 91, 201, 230 (Streamlit, folium, pandas/plotly bullets and the component-table row) and every Leaflet/deck.gl/recharts/wavesurfer/vitality mention in the stack, architecture and styling sections.
- README: `README.md` has no Streamlit mention (grep).
- Leave historical reports untouched (`docs/PROJECT_STATUS.md`, `docs/TEST_REPORT.md`, `docs/SYSTEM_ASSESSMENT.md`, `docs/ARCHITECTURE_DIAGRAMS.md`, `TO-DOS.md`): point-in-time records; add a one-line note in the exit doc.
- `tests/unit/copy-claims.test.ts` scans README/ARCHITECTURE/CLAUDE/API for banned claims: re-run after the doc edits.
- Add a test asserting `dashboard/` no longer exists (stack-consolidation test).

## Visual Baseline Plan (additions to UI-SPEC)
- `BEFORE_SHA`: the last commit with a green `visual` job is `89ec41a350873b7642a990ba7ca781112d877932` (CI run 36986849372: web, citations, python, visual, e2e all success). Later commits (`789e1fe`, `2d3d798`, `1c74f86`) are docs only. Record `1c74f86` as `BEFORE_SHA` for code purposes and cite run 36986849372 as the last full visual pass [VERIFIED: gh run view].
- Expected baseline movement: certain only `experience-compare` x 3 widths (slider track/thumb). The vitality canvases are hidden by the suite and wrappers are empty `absolute`/`fixed` divs. The map containers are hidden; DOM markers inside them are hidden too (visibility inherits), so only legends/badges/fallback panels can move.
- Risk if WebGL is unavailable in the Linux image: all maps render fallback panels (visible text) in baselines and in "unhidden" review captures. Check once in the first dispatch (capture artifact), and if absent consider Chromium args (`--use-angle=swiftshader`, `--enable-unsafe-swiftshader`) in the review project only `[ASSUMED]`.
- Review-only captures (UI-SPEC step 6) at `BEFORE_SHA`: add a `workflow_dispatch` input `before_ref`; in the dispatch job check out `before_ref` into `before/` with a second `actions/checkout` (`path: before`), copy the new `review.spec.ts` and `playwright.config` project into it, run `npm ci` and the spec there, upload as separate artifacts (the spec only uses `mockApi`, which exists at that SHA). A new Playwright project `review` with `testMatch: /review\.spec\.ts/` keeps `visual` untouched.
- Regeneration discipline: pushes of vitality/map commits will turn `visual` red (expected window); regenerate once, after the last UI-changing commit, never while another dispatch runs. Windows renders are never committed (snapshot names carry the platform: `-visual-linux.png`).

## Common Pitfalls

### Pitfall 1: The `upgrade` codemod and `react-leaflet`
**What goes wrong:** `npx @next/codemod@16.3.8 upgrade ...` aborts at `npm install` with ERESOLVE (`react-leaflet@4.2.1` wants React 18) and, when it works, picks `eslint 10.11.0`. **Avoid:** add the temporary `overrides` block; pin versions manually after; remove the override with `react-leaflet`. **Warning sign:** `package.json` diff shows `"eslint": "10.11.0"` or an `overrides` entry for `@types/react`.

### Pitfall 2: `--legacy-peer-deps` silently drops peers
Produces `ERR_MODULE_NOT_FOUND: vite` (Vitest) and `Module '@testing-library/react' has no exported member 'screen'` (missing `@testing-library/dom`). Never use it; add `@testing-library/dom` explicitly.

### Pitfall 3: Turbopack CSS `@import` ordering
Any `@import` below an `@tailwind` line fails the Next 16 build. Keep `@import` lines at the very top of `globals.css` until the Leaflet one is deleted.

### Pitfall 4: ESLint 10 and TypeScript 7 are on the registry but unsupported by this toolchain
Pin `eslint 9.39.5` and keep `typescript ^5.9`.

### Pitfall 5: React Compiler lint rules in `eslint-config-next 16`
Roughly 20 legacy findings appear on the first Next 16 lint run (list above); downgrade to `warn` for legacy paths, keep `error` for `src/features/**`.

### Pitfall 6: Speed Insights 404 in local e2e
Mock `/_vercel/speed-insights/*` in `mockApi()`; otherwise `routes.spec.ts` fails.

### Pitfall 7: Trailing-slash POST redirect
Always POST to `/api/client-error/` (308 otherwise). Add an e2e assertion that the POST returns 204 with no redirect.

### Pitfall 8: MapLibre popup closes instantly; Escape does nothing
`closeOnClick={false}` plus explicit Escape handling and focus return (verified).

### Pitfall 9: MapLibre 6 worker under Turbopack
`setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')` and both `.mjs` files in `public/maplibre/`; generated by script so versions match; gitignored.

### Pitfall 10: `next dev` writes `AGENTS.md`/`CLAUDE.md`
`agentRules: false`. Do not commit the generated files by accident.

### Pitfall 11: Stale `.next/dev/types` and `tests/**` in the production type-check
`rm -rf .next` after route changes; update tests with the code in the same commit.

### Pitfall 12: Windows dev box vs Linux CI
Visual specs self-skip off Linux; local `npm run build && npm run start -- -p 3100` is what Playwright runs. Lockfile edits made on Windows must be proven by the CI `web` job (`npm ci`) before the next hop. `taskkill` is needed to stop stray `next dev` processes on Windows. CI concurrency cancels in-progress runs on the same ref: do not push during a snapshot dispatch. Run git/gh commands standalone; push only as `git push origin redesign/v2-discovery`.

### Pitfall 13: Observability expectations
Runtime logs on Hobby last 1 hour; Speed Insights free tier shows only the Real Experience Score and pauses at 10,000 events per 30 days. State this in `docs/MONITORING.md` rather than implying a durable error archive.

### Pitfall 14: Copy gate
New strings (error pages, fallbacks, monitoring docs shipped in `src/`) must not contain "reported", "fixed", "AI", "real-time", or any guarantee the error was received (UI-SPEC); `tests/unit/copy-claims.test.ts` scans all of `src/`.

## Code Examples

### Static slider replacing the vitality thumb (UI-SPEC values)
```css
/* Source: 03-UI-SPEC.md "Vitality token replacement map" */
input[type=range].crossfader-slider { -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; height: 20px; touch-action: none; }
input[type=range].crossfader-slider::-webkit-slider-runnable-track { background: #6b6560; height: 6px; border-radius: 3px; }
input[type=range].crossfader-slider::-moz-range-track { background: #6b6560; height: 6px; border-radius: 3px; }
input[type=range].crossfader-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #cd853f; border: 2px solid rgba(229, 225, 219, 0.2); margin-top: -7px; box-shadow: none; }
input[type=range].crossfader-slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #cd853f; border: 2px solid rgba(229, 225, 219, 0.2); box-shadow: none; }
```

### next.config.js after the phase
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  agentRules: false, // 16.3 dev server otherwise writes AGENTS.md / CLAUDE.md into this folder
};
module.exports = nextConfig;
```

### Worker copy script (maplibre-gl 6 only)
```js
// scripts/copy-maplibre-worker.mjs  (Node built-ins only)
import { mkdirSync, copyFileSync } from 'node:fs';
const dist = new URL('../node_modules/maplibre-gl/dist/', import.meta.url);
const out = new URL('../public/maplibre/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) copyFileSync(new URL(f, dist), new URL(f, out));
// package.json: "predev": "node scripts/copy-maplibre-worker.mjs", "prebuild": "node scripts/copy-maplibre-worker.mjs"
```

### Error pages and route handler skeleton
```ts
// src/app/api/client-error/route.ts (skeleton; schema and scrub live in features/monitoring)
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return new Response(null, { status: 415 });
  const origin = request.headers.get('origin'); const host = request.headers.get('host');
  if (origin && host && new URL(origin).host !== host) return new Response(null, { status: 403 });
  const text = await request.text();
  if (text.length > 4096) return new Response(null, { status: 413 });
  // zod .strict() parse -> scrub -> rate limit -> console.error(JSON.stringify({ evt: 'client-error', ... }))
  return new Response(null, { status: 204 });
}
```

### Playwright env for test-only hook
```ts
// playwright.config.ts
webServer: { command: 'npm run build && npm run start -- -p 3100', url: 'http://localhost:3100',
  reuseExistingServer: !process.env.CI, timeout: 240_000, env: { NEXT_PUBLIC_E2E_HOOKS: '1' } },
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `next lint` | ESLint CLI with flat config (`eslint .`) | Next 16.0 | Lint script and config file change; `next build` no longer lints |
| Webpack default | Turbopack default for dev and build | Next 16.0 | Strict CSS `@import` order; `webpack()` config would fail the build (none here) |
| `error.tsx` `reset` | `retry` (stable 16.3.0) | Next 16.2/16.3 | Prefer `retry`; `reset` still works |
| MapLibre UMD, auto worker | ESM-only; bundlers need `setWorkerUrl` | maplibre-gl 6.0 (2026-07-22) | Worker copy script on Next/Turbopack; or stay on 5.x |
| react-map-gl 7 default import | `react-map-gl/maplibre` v8 | 8.0 | Same subpath; named `Map` import; type renames (`MapStyle` to `StyleSpecification`) |
| recharts/deck.gl | Plot + d3 modules / MapLibre layers | this phase | Dependencies removed |

**Deprecated/outdated:** `@next/font` (already gone), `serverRuntimeConfig`/`publicRuntimeConfig`, AMP, `middleware` filename (renamed `proxy`), `next/legacy/image`, `images.domains`. None are used here.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Playwright `noble` Docker image provides WebGL2 to headless Chromium (verified only on the Windows box) | MapLibre Port, Visual Baseline | Map fallback panels appear in CI baselines and unhidden captures; extra Chromium flags needed |
| A2 | Vercel's default Node version satisfies Next 16's `>=20.9` for this project | Upgrade Playbook item 10 | Build fails on Vercel; set `engines`/project Node setting |
| A3 | Speed Insights collects on protected preview deployments and shows in the dashboard | Monitoring Design | Owner sees no web-vitals until production merge |
| A4 | `VERCEL_GIT_COMMIT_SHA` is available to route handlers at runtime | Monitoring Design | `build` field is empty in logs; harmless |
| A5 | `npx codemod@latest react/19/migration-recipe` is the right React 19 recipe command | Upgrade Playbook hop 1 | Skip it; tsc and tests show nothing to migrate |
| A6 | `vercel logs` CLI can read runtime logs for the owner | Monitoring Design | Dashboard Logs tab remains the documented path |
| A7 | Owner's Vercel plan (Hobby vs Pro) | Monitoring Design | Determines whether error logs survive more than an hour |
| A8 | Chromium args `--use-angle=swiftshader` etc. enable WebGL in the Docker image if missing | Visual Baseline | Review captures stay at fallback panels |

## Open Questions

1. **maplibre-gl 6.11.2 or 5.24.0?**
   - Known: both work with react-map-gl 8.1.3 on Next 16.3.8; 6.x requires a copy-script plus `setWorkerUrl`, ESM-only, WebGL2-only; TECH-LANDSCAPE recommends 6.11.2; Phase 6 does the map restyle.
   - Unclear: whether the owner wants the extra moving part now.
   - Recommendation: default to 6.11.2 with the verified recipe (aligned with locked research); if the planner wants the smallest Phase 3 blast radius, 5.24.0 is a one-line substitution and the worker script/`public/maplibre` disappear. Record the choice in the plan.
2. **Owner's Vercel plan and log retention.** Hobby keeps runtime logs 1 hour, Pro 1 day, 30 days only with Observability Plus. Recommendation: ask the owner in the hand-off; document clearly; if retention is inadequate the deferred Sentry idea becomes the follow-up (do not add it in this phase).
3. **CAP-86 scope.** CONTEXT says "CAP-86 (duplicate stacks) is closed here". The row also lists unused components/hooks/stores with harvest-before-delete notes. Recommendation: close dependencies and Streamlit; leave the unused symbols in place and note the residual in the matrix.
4. **`error.tsx` recovery prop (`retry` vs `reset`).** UI-SPEC names `reset`; Next 16.3 documents `retry` as primary. Recommendation: use `retry`, keep copy unchanged, adjust the RTL assertion.
5. **WebGL in the Linux image.** Decide after the first CI dispatch capture; no action before.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | all | yes | v24.18.0 (CI uses 22; Next 16 needs >= 20.9) | none needed |
| npm | installs | yes | 11.16.0 (prints `allow-scripts` warnings; harmless) | CI npm from Node 22 |
| Git / GitHub CLI | commits, CI dispatch, run inspection | yes | gh 2.102.0 | none |
| Playwright Chromium (local) | e2e project | yes | chromium-1217 and 1243 in `%LOCALAPPDATA%\ms-playwright` | CI container |
| Docker | regenerate snapshots locally | no (`docker: command not found`) | none | CI `workflow_dispatch update_snapshots` (already the designed path) |
| Vercel CLI | optional inspection | yes | 62.0.0 | dashboard |
| Headless WebGL2 (local Chromium) | map e2e | yes (verified) | | fallback-panel assertions |
| Network to registry.npmjs.org, fonts.googleapis.com (next/font at build) | install, build | yes | | none |

**Missing dependencies with no fallback:** none. **Missing with fallback:** Docker (use CI).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 (jsdom 30.1.1, RTL 16.3.3), Playwright 1.63.0 (+ axe 4.13.0) |
| Config file | `dashboard-next/vitest.config.ts`, `dashboard-next/playwright.config.ts` |
| Quick run command | `cd dashboard-next && npx vitest run tests/unit/<file>` |
| Full suite command | `cd dashboard-next && npm run lint && node ../scripts/check-contract-fence.mjs && node ../scripts/check-feature-fence.mjs && npm run typecheck && npm test && npm run build && npx playwright test --project=e2e` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-01 | next 16.3.8 / react 19.3.0 pinned; build passes; all 11 states load clean; axe no new serious/critical; unit suite green | unit + build + e2e | `npx vitest run tests/unit/platform-versions.test.ts`; `npx playwright test --project=e2e` | Wave 0 (new) / existing e2e |
| PLAT-01 | Visual diffs reviewed and accepted | CI visual + manual sign-off | CI `visual` job; owner decision column in `docs/deploy/PHASE-3-VISUAL-REVIEW.md` | review page new |
| PLAT-02 | no `wavesurfer.js`, `leaflet`, `react-leaflet`, `@types/leaflet`, `@deck.gl/*`, `recharts` in `package.json`, `package-lock.json`, or `src` imports; `dashboard/` absent | unit | `npx vitest run tests/unit/stack-consolidation.test.ts` | Wave 0 |
| PLAT-02 | `npm ls` shows none of the removed packages | shell gate | `npm ls leaflet react-leaflet recharts wavesurfer.js @deck.gl/core` exits non-zero / "(empty)" | n/a |
| PLAT-02 | map helpers, shell fallback, markers, popup, `[lon,lat]` conversion | unit | `npx vitest run tests/unit/map-*.test.tsx` | Wave 0 |
| PLAT-02 | real MapLibre canvas, markers, popup keyboard flow, attribution, WebGL fallback | e2e | `npx playwright test --project=e2e -g map` | Wave 0 (`tests/e2e/maps.spec.ts`) |
| PLAT-02 | PlotFigure ARIA, table, empty/one/many | unit | `npx vitest run tests/unit/plot-figure.test.tsx` | Wave 0 |
| PLAT-03 | planted `@/components` import under `src/features/**` fails ESLint and script; clean tree passes | unit | `npx vitest run tests/unit/feature-fence.test.ts` | Wave 0 |
| PLAT-03 | CI runs the new script | CI | `web` job step `node ../scripts/check-feature-fence.mjs` | edit `ci.yml` |
| PLAT-09 | scrub removes URLs, query strings, tokens, emails; size and rate caps; route handler status codes (204/413/415/403/429) | unit (node env) | `npx vitest run tests/unit/monitoring-*.test.ts` | Wave 0 |
| PLAT-09 | error pages render, focus the `h1`, call `retry`, no `error.message`, wrap long digest | unit (RTL) | `npx vitest run tests/unit/error-pages.test.tsx` | Wave 0 |
| PLAT-09 | thrown page error produces one scrubbed POST to `/api/client-error/` (204, no redirect); no visible UI | e2e | `npx playwright test --project=e2e -g monitoring` | Wave 0 (`tests/e2e/monitoring.spec.ts`) |
| PLAT-09 | Speed Insights present and does not break routes | e2e | `routes.spec.ts` with the new `mockApi` stub | edit `mock-api.ts` |
| PLAT-10 | env base URL honoured; default; no stray API strings; fetch allowlist | unit | `npx vitest run tests/unit/api-client.test.ts` | Wave 0 |
| PLAT-10 | Query defaults and dedupe | unit | `npx vitest run tests/unit/query-defaults.test.tsx` | Wave 0 |
| PLAT-10 | security headers present in `vercel.json` | unit | `npx vitest run tests/unit/security-headers.test.ts` | Wave 0 |
| DS-07 | no vitality modules, `reef-*` token usage, `vitality` identifiers in `src`, `globals.css`, `tailwind.config.js`; `.crossfader-slider` rules exist with the UI-SPEC values; no `thumb-pulse` | unit | `npx vitest run tests/unit/vitality-removed.test.ts` | Wave 0 |
| DS-07 | legacy pages render without the canvases (visual review) | CI visual + review page | CI `visual`, review captures | review spec new |

### Sampling Rate
- **Per task commit:** the single affected unit file plus `npx tsc --noEmit` (about 15 s).
- **Per wave merge:** `npm run lint && npm test && npm run build`, then `npx playwright test --project=e2e` (about 1.6 min locally).
- **Phase gate:** full local suite, then a full green CI run (all five jobs) on the pushed branch, snapshot dispatch completed and committed, owner sign-off recorded in the verification file.

### Wave 0 Gaps
- [ ] `tests/unit/platform-versions.test.ts`, `stack-consolidation.test.ts`, `vitality-removed.test.ts`, `feature-fence.test.ts`, `api-client.test.ts`, `query-defaults.test.tsx`, `security-headers.test.ts`, `error-pages.test.tsx`, `monitoring-scrub.test.ts`, `monitoring-route.test.ts` (`// @vitest-environment node`), `map-*.test.tsx`, `plot-figure.test.tsx`
- [ ] `tests/e2e/maps.spec.ts`, `tests/e2e/monitoring.spec.ts`, review capture spec (`review.spec.ts`, own Playwright project)
- [ ] `scripts/check-feature-fence.mjs`, `scripts/build-visual-review.mjs`, `eslint.config.mjs`
- [ ] Update `tests/unit/site-index.test.tsx` and `sites-page.test.tsx` (Leaflet mocks) in the same commit as the port
- [ ] Framework install: none (Vitest and Playwright already present); add `@testing-library/dom` explicitly

## Security Domain

`security_enforcement` is enabled in `.planning/config.json` (`security_asvs_level: 1`, `security_block_on: high`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in this phase |
| V3 Session Management | no | none; reporter sends no cookies or storage values |
| V4 Access Control | partial | Same-origin check on the new route; no secrets exposed; `NEXT_PUBLIC_E2E_HOOKS` only set by the Playwright server, never in Vercel env |
| V5 Input Validation | yes | zod 4 `.strict()` schema, size cap, content-type check, scrub on client and server |
| V6 Cryptography | no | none |
| V7 Error handling and logging | yes | never log `error.message` raw; scrubbed structured line; no PII, presigned URLs, query strings |
| V14 Configuration | yes | Preserve `vercel.json` headers; pin exact versions; review lockfile diffs (checkpoint) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Log injection or log flooding via the public error endpoint | Tampering / DoS | JSON-only strict schema, 4 KB cap, per-instance rate limit, fixed `evt` field, newline-free single JSON line |
| Cross-site forged reports | Spoofing | `Origin` equals `Host` check; JSON content type forces CORS preflight for cross-origin browsers |
| PII or presigned URL leakage into logs | Information disclosure | Client plus server scrub; no query strings; token and URL redaction; test with an `X-Amz-Signature=` sample |
| Supply-chain (fresh majors) | Tampering | Exact pins, lockfile diff checkpoint, `npm ci` in CI, no `--legacy-peer-deps` |
| OSM tile policy abuse | n/a (policy) | Attribution visible, no prefetch, no tile URL rewriting, Referrer-Policy unchanged |
| Clickjacking | Spoofing | `X-Frame-Options: DENY` preserved (asserted) |

## Sources

### Primary (HIGH confidence)
- Executed probes in scratch copies of the repo (2026-10-02): Next 15.5.26 and 16.3.8 with React 19.3.0 (tsc, lint, vitest, build, 51 e2e), ESLint 9.39.5 and 10.11.0, flat-config fence cases, Turbopack CSS failure, maplibre-gl 6.11.2 and 5.24.0 with react-map-gl 8.1.3 in headless Chromium, Plot under Vitest and `next build`, route handler trailing-slash behaviour, Speed Insights 404 in e2e, codemod runs (`upgrade`, `next-lint-to-eslint-cli`).
- https://nextjs.org/docs/app/guides/upgrading/version-16 and /version-15 (read in full)
- https://nextjs.org/docs/app/api-reference/config/eslint (flat config setup)
- https://nextjs.org/docs/app/api-reference/file-conventions/error (`retry`, `reset`, global-error)
- https://vercel.com/docs/speed-insights/quickstart, /package, /limits-and-pricing
- https://vercel.com/docs/logs/runtime (retention and limits)
- npm registry (`npm view`): versions, peerDependencies, publish dates; `gsd-tools query package-legitimacy check`
- Repo files read this session: `dashboard-next/package.json`, `next.config.js`, `vercel.json`, `.eslintrc.json`, `src/app/providers.tsx`, `src/lib/api.ts`, map components, `.github/workflows/ci.yml`, `scripts/check-contract-fence.mjs`, CONTEXT and UI-SPEC

### Secondary (MEDIUM confidence)
- https://visgl.github.io/react-map-gl/docs (get-started, upgrade guide, Map, Marker pages)
- https://maplibre.org/maplibre-gl-js/docs/ and the v6.0.0 release notes and v5-to-v6 migration guide (worker setup, ESM-only, WebGL2)
- `.planning/research/TECH-LANDSCAPE.md` (version rationale)

### Tertiary (LOW confidence)
- Observable Plot web docs returned HTTP 429; accessibility options were instead verified in `node_modules/@observablehq/plot/src/plot.js` and by running a test.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, versions registry-checked and executed
- Architecture: HIGH for fences/ports (executed), MEDIUM for review-capture CI mechanics (not executed)
- Pitfalls: HIGH (each reproduced)
- Monitoring: MEDIUM (docs-based; owner plan unknown)

**Research date:** 2026-10-02
**Valid until:** 2026-10-16 (Next 16.x and MapLibre 6.x patch releases are weekly; re-run the registry checks and the three gates before locking exact pins)
