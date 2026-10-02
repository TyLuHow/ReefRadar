# Phase 3: Platform Upgrade & Stack Consolidation - Context

**Gathered:** 2026-10-02
**Status:** Ready for planning

<domain>
## Phase Boundary

The dashboard (`dashboard-next/`) moves to Next.js 16 / React 19 on a single engine per concern:
- MapLibre for maps.
- Observable Plot + d3 for charts.
- No wavesurfer, deck.gl, Leaflet, recharts or Streamlit.

The bioluminescent vitality layer is removed. Every legacy route keeps working: `/`, `/sites`, `/about`, `/dashboard`, `/dashboard/analyze`, `/dashboard/compare`, `/dashboard/map` and `/experience*`.

New code lives in feature modules behind a lint fence. One API client serves all flows. Production errors and web-vitals are reported somewhere the owner can open.

Out of this phase:
- The new design system and Tailwind v4 (Phase 4).
- New instrument screens (Phase 6+).
- Any production frontend merge. The owner holds that until the overhaul is launch-worthy.
- Backend/Lambda changes. None are expected.

</domain>

<decisions>
## Implementation Decisions

### Upgrade and vitality removal
- Upgrade Next.js 14.2.35 → 16 and React 18 → 19 using the official codemods (`@next/codemod`, React 19 codemods). Step through Next 15 as separate, individually green commits within this phase rather than one big-bang jump. Keep App Router, `trailingSlash: true` and `images.unoptimized`. Check `transpilePackages` once deck.gl is removed.
- Tailwind stays on v3 in this phase. The Tailwind v4 migration belongs to the Phase 4 design system.
- Remove the vitality system: vitality store, colour engine, background canvas, caustics/particles, decorative spectrogram and dev vitality panel. Legacy pages fall back to a plain, neutral version of today's dark palette using static CSS tokens. No new visual design until Phase 4.
- Expect visual changes. Regenerate all affected Linux visual baselines through the CI `workflow_dispatch` `update_snapshots` path, and show the owner a before/after review page (like Phase 1) for sign-off. Success criterion 1 requires the diffs to be reviewed and accepted.
- Delete the legacy Streamlit dashboard (`dashboard/`). Git history keeps it. Backend `GET /sites` and the Lambdas are untouched. Update CLAUDE.md and README references to the Streamlit app, factual edits only.

### One map engine, one chart engine
- Port the Leaflet `WorldMap`, `MiniMap` and `SiteMarker`, and the deck.gl `ReefMap`, to MapLibre (`maplibre-gl` + `react-map-gl/maplibre`). Keep the same OpenStreetMap raster tiles and attribution as today, so the maps look about the same. Phase 6 restyles them. Respect the OSM tile usage policy (attribution, no bulk prefetch).
- Replace every recharts usage with Observable Plot (pin `@observablehq/plot` 0.6.17) plus individual d3 modules (`d3-scale`, `d3-array`, `d3-shape`, `d3-format`). Each chart keeps its meaning: same data, same encodings, honest axes and labels.
- Remove `wavesurfer.js` (no source file uses it), `leaflet`, `react-leaflet`, `@deck.gl/*` and `recharts` from dependencies. `npm ls` must show none of them.

### Monitoring and code structure
- Monitoring is Vercel only; no new vendor account:
  - Vercel Speed Insights (`@vercel/speed-insights`) for web vitals.
  - A small client error reporter (window `error` / `unhandledrejection` plus a React error boundary / `app/error.tsx` / `global-error.tsx`) that POSTs a scrubbed payload to a Next route handler. The handler logs a structured line to Vercel runtime logs, which the owner opens in the Vercel dashboard.
  - Scrubbing removes PII, presigned URLs and query strings. Payload size and rate are capped.
  - Document where the owner finds both.
- New code lives in `dashboard-next/src/features/*`. Phase 2's `features/contract` already follows this. An ESLint rule fails any import from legacy `@/components/**` inside `src/features/**`, using the same mechanism as the Phase 2 contract fence and `scripts/check-contract-fence.mjs`.
- One API client: `src/lib/api.ts` singleton honours `NEXT_PUBLIC_API_URL` in every flow, with no stray `fetch` to the API elsewhere. React Query caching and the `vercel.json` security headers are preserved, and tests assert both.

### Claude's Discretion
- Exact codemod order, how to split plans, React 19 / Next 16 breakage fixes (async request APIs, `useRef` types, etc.), test tooling version bumps needed for compatibility (Vitest, Playwright, eslint-config-next / ESLint 9 flat config if required), and how the Plot charts are wrapped (a small `<PlotFigure>` in a feature module).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1/2 test infrastructure: Vitest + Testing Library, Playwright e2e (`mockApi`/`mockContract` fixtures), axe, and 33 Docker-pinned Linux visual baselines with a CI `update_snapshots` dispatch.
- `dashboard-next/src/features/contract/`: the feature-module pattern and the ESLint/`check-contract-fence.mjs` fence pattern to extend for the legacy-import fence.
- `dashboard-next/vercel.json`: security headers to preserve.

### Established Patterns
- Maps: `src/components/maps/{WorldMap,MiniMap,SiteMarker}.tsx` (Leaflet) and `src/components/map/ReefMap.tsx` (react-map-gl/maplibre + deck.gl overlay). These now read site data from the contract hooks (Phase 2).
- Vitality: `src/stores/vitality-store.ts`, `src/lib/color-engine.ts`, the BackgroundCanvas in `app/providers.tsx`, and the vitality CSS custom properties (`--reef-*`) in `globals.css` and `tailwind.config.js`.
- CI concurrency cancels in-progress runs on the same ref, so don't push while a snapshot dispatch is running. Run git/gh commands standalone; pushes use `git push origin redesign/v2-discovery`, which is allow-listed.

### Integration Points
- `app/layout.tsx` / `app/providers.tsx` (QueryClient, ContractVersionSync, vitality loop), `next.config.js`, `package.json`, `.eslintrc.json` (may need ESLint 9 flat config for Next 16), `.github/workflows/ci.yml`.

</code_context>

<specifics>
## Specific Ideas

- Follow `.planning/research/TECH-LANDSCAPE.md` for versions and rationale: Observable Plot render-into-ref pattern, MapLibre, Speed Insights.
- `CAPABILITY-MATRIX.md` rows retired by Q7 (CAP-25, 47, 76–80, 83, 84) become `retired` with the Q7 justification. CAP-86 (duplicate stacks) is closed here.
- Reduced-motion and mobile-gating principles (CAP-81, CAP-82) carry over to any remaining canvases.

</specifics>

<deferred>
## Deferred Ideas

- Sentry (richer error tracking and source maps): revisit if Vercel logs prove insufficient.
- Tailwind v4 and the light scientific-editorial look (Phase 4).
- Production frontend merge (owner hold).

</deferred>
