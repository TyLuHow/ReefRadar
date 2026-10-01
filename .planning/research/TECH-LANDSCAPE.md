# Technology Landscape: ReefRadar Research-Instrument Redesign

**Project:** ReefRadar (`dashboard-next/` web app + AWS serverless backend)
**Researched:** 2026-09-30
**Mode:** Ecosystem + comparison
**Overall confidence:** MEDIUM-HIGH (versions are registry-verified; ecosystem claims are web-sourced and cross-checked where possible)

### Confidence tags used in this document

| Tag | Meaning | Confidence |
|-----|---------|------------|
| `[REG]` | Read directly from the npm registry (`npm view`) on 2026-09-30 | HIGH |
| `[CODE]` | Read directly from this repository | HIGH |
| `[OFF]` | Official vendor docs/blog fetched and read (react.dev, nextjs.org, wavesurfer.xyz, AWS docs) | MEDIUM-HIGH |
| `[WEB]` | Web-search synthesis, cross-checked against a second source | MEDIUM |
| `[WEB?]` | Single web source or my inference; treat as a lead, verify before relying on it | LOW |

---

## 0. Where the app is today (audit of the current stack)

Read from `dashboard-next/package.json`, `next.config.js`, `src/**` `[CODE]`:

| Area | Current | Notes |
|------|---------|-------|
| Framework | Next.js **14.2.5**, App Router, React 18.3 | **Every page is `'use client'`**. RSC is not used at all. `trailingSlash`, `images.unoptimized`, `transpilePackages` for deck.gl. Deployed on Vercel (Hobby). |
| Maps | **Two stacks**: deck.gl 9 + react-map-gl 7 + maplibre-gl 4 (`components/map/ReefMap.tsx`, 531 LOC, CARTO dark-matter style) **and** Leaflet 1.9 + react-leaflet 4 (`components/maps/WorldMap.tsx`, `MiniMap.tsx`, `SiteMarker.tsx`) | deck.gl renders a `ScatterplotLayer` for 54 points; that is a ~hundreds-of-KB dependency doing what a MapLibre `circle` layer does natively. |
| Charts | recharts 2.12 — only in `EmbeddingChart.tsx` | One chart; `ProbabilityBars` is hand-rolled. |
| Audio | Raw Web Audio. **Five separate `new AudioContext()` call sites** (`AudioCompare`, `analyze/page`, `useLocationAudio`, `useDemoAudio`, `useAudioPlayback`) plus `useSpectrogram` | `useSpectrogram` calls `setFrequencyData(new Float32Array(...))` **every animation frame → a React re-render at 60 fps**. `wavesurfer.js ^7.8` is in `package.json` **but is never imported** (dead dependency). |
| Visual effects | Canvas2D particle systems (`useBackgroundCanvas` 446 LOC, `useSpectrogramAnimation` 297 LOC) driven by a zustand "vitality" store | Decorative "spectrogram" is particles + AnalyserNode, not a true time-frequency image. |
| State | zustand 4.5 (`analysis-store`, `vitality-store`), TanStack Query 5 for `/sites`, imperative `pollAnalysis` loop in `lib/api.ts` | No URL state. No persistence. |
| Styling | Tailwind 3.4 + lots of inline `style={{...}}` with hard-coded rgba values | Tokens are partly in `globals.css` (`var(--text-muted)`), partly literals. |
| Motion | framer-motion 11 (only `experience/page.tsx`) | |
| Tests | **None.** No test runner installed. | |
| Backend | API Gateway **HTTP API** (v2, `$default` route) → Python 3.11 Lambdas; S3; DynamoDB; inference in a 3 GB container Lambda (SurfPerch) | Upload is `POST /upload` with the **raw WAV as the request body** through API Gateway → Lambda. The router's "50 MB max" check is unreachable — see Pitfall P1 below. |
| Data | 54 reference sites, 1280-d SurfPerch embeddings in `reference/metadata.json` on S3; 2.8 MB of demo audio in `public/audio` | 54 × 1280 × float32 ≈ **276 KB** of embeddings. The whole reference dataset is smaller than one map tile pyramid. |

**Implication:** the current app is a client-only SPA that happens to run inside Next.js. That frames every framework decision below.

---

## 1. Framework

### Current versions `[REG]`
- `next` **16.3.8** (16.0 shipped 2025-10-22; 16.3 shipped 2026-08-03) — `next@14` line is at 14.2.35.
- `react` / `react-dom` **19.3.0** (2026-09-09).
- `vite` **8.3.1**; `@vitejs/plugin-react` 6.1.1.
- `@tanstack/react-router` **1.170.x**; `@tanstack/react-start` 1.168.x.
- `react-router` **8.4.0**.
- `astro` **7.3.5**; `@sveltejs/kit` **2.70.3** / `svelte` **5.57.1**.
- `typescript` **7.0.2** (native Go port; Next 16.3 can use it for `next build` type-checking `[OFF]`).

### What changed in Next.js since 14.2 `[OFF]`
- **16.0:** Turbopack is the default bundler; Node ≥ 20.9; async `params`/`searchParams` required; `middleware.ts` → `proxy.ts`; Cache Components (`'use cache'`, `cacheComponents: true`) replaces implicit caching. `next lint` is gone (use ESLint CLI directly).
- **16.3:** dev-server memory down up to 90%, cached `next build`, TypeScript 7 type-checking, Node-stream SSR, `catchError` error boundaries, **"Instant Navigations"** (Partial Prefetching + `'use cache'` client caching — explicitly aimed at SPA-like responsiveness), a Playwright `instant()` test helper, experimental Rust React Compiler, experimental `useOffline`.
- **React 19.3:** `<ViewTransition>` and `addTransitionType` are **stable**; Fragment refs stable; new `use(browser())` to opt a component out of SSR (cleaner than `next/dynamic({ ssr:false })` for WebGL/Web Audio components); `<Activity>` shipped in 19.2.

### Options

| Option | Fit for ReefRadar | Verdict |
|--------|------------------|---------|
| **A. Stay on Next.js, upgrade 14.2 → 16.3 + React 19.3** | Keeps Vercel previews, file routing, OG-image generation (`opengraph-image.tsx`) for shareable investigation links and per-site pages, static generation of 54 site pages (SEO, fast first paint), and lets new and old UI coexist route-by-route. RSC is useful only at the edges (about/methodology/site pages, OG images); the instrument itself stays a client island. | **Recommended** |
| B. Vite 8 + TanStack Router SPA | Honest best fit for the *instrument* alone: no SSR/hydration traps around WebGL/Audio, typed search params built into the router (would replace nuqs), smallest mental model, static hosting anywhere (S3+CloudFront next to the backend). Loses built-in OG images/SSR for share-link unfurls (needs a separate function), and a migration is a router rewrite rather than an in-place strangler. | Strong runner-up. Pick it if you also want to leave Vercel. |
| C. Vite + React Router 8 (framework or data mode) | Comparable to B; weaker search-param typing than TanStack Router `[WEB]`. No advantage over B for this app. | No |
| D. Astro 7 islands | Islands are great for content sites; the instrument is *one* large stateful island where map, timeline, sidecar and audio share state. Cross-island state is friction. Good only for a marketing/methodology site. | No (for the app) |
| E. SvelteKit 2 / Svelte 5 | Excellent tech, but a full rewrite and you leave the React ecosystem you actually depend on (react-map-gl, React Aria, nuqs, TanStack Query, deck.gl). Not justified by any requirement. | No |

### Decision record — Framework

| Dimension | Detail |
|-----------|--------|
| Current approach | Next 14.2.5, React 18, every route `'use client'`, `next/dynamic({ssr:false})` for maps. |
| Proposed approach | Next **16.3** + React **19.3** + TS 5.x→7. Instrument lives under one route group (e.g. `app/(instrument)/explore/…`) rendered as a client island; static/marketing/site pages become Server Components with `generateStaticParams` for 54 sites; OG images via `opengraph-image.tsx`. Turn on `reactCompiler` (Babel path is stable; Rust path is experimental). Leave `cacheComponents` **off** at first — there is no server data worth caching. |
| User benefit | Fast first paint on landing/site pages; link previews for shared investigations; no visible change otherwise. |
| Engineering benefit | Turbopack dev/build speed; React 19 APIs (`ViewTransition`, `use(browser())`, Actions); keeps Vercel preview-per-PR workflow, which visual-regression CI will lean on. |
| Migration cost | **Low–medium (1–3 days)**. Forced dependency moves: react-leaflet 4 does not support React 19 (moot — we drop Leaflet); framer-motion 11 → `motion` 13; recharts 2 → 3 (or removed); ESLint config (no `next lint`); `allowedDevOrigins` for WSL2 (already flagged in `next.config.js`). Codemod: `npx @next/codemod@latest upgrade`. |
| Risk | Low. The app does not use the APIs that broke (middleware, implicit fetch caching, sync `params`). Main risk is third-party React 19 peer-dep noise. |
| Compatibility | Node ≥ 20.9 on Vercel and locally. Browsers unchanged. |
| Now vs later | **Now** (it is the foundation for everything else, and staying on 14.x means fighting React 18-only constraints). |

---

## 2. Map engine and basemap

### Current versions `[REG]`
- `maplibre-gl` **6.11.2** (v6.0.0 on 2026-07-22; v5 introduced globe projection).
- `react-map-gl` / `@vis.gl/react-maplibre` **8.1.3** (import from `react-map-gl/maplibre`).
- `deck.gl` / `@deck.gl/*` **9.4.0** (WebGPU parity for all layers, globe pitch/bearing; `@deck.gl/mapbox` `MapboxOverlay` supports MapLibre v4.5.1–v6) `[WEB]`.
- `pmtiles` **4.5.0**; `@protomaps/basemaps` **5.7.2** (style generator; replaces `protomaps-themes-base`, which stopped at 4.5.0 in 2025-02).

### MapLibre v6 breaking changes to plan for `[WEB]` (newreleases.io release notes + MapLibre newsletter)
- **ESM-only** distribution (no UMD); `import * as maplibregl from 'maplibre-gl'` or named imports.
- **WebGL2 mandatory** (fine for every evergreen browser incl. iOS Safari 15+; drops very old Android WebViews).
- `styleimagemissing` → `map.setMissingStyleImageResolver`; `map.transform` no longer exposed; class-based events (don't `instanceof`); `GeoJSONSource.setData` lost its 2nd param; `zoomLevelsToOverscale` default 4.

### Options

| Option | Verdict |
|--------|---------|
| **MapLibre GL JS 6 alone, via `react-map-gl/maplibre` 8** — sites as a GeoJSON source with `circle`/`symbol` layers, selection/hover through `feature-state`, globe projection (`map.setProjection({type:'globe'})` + `sky` atmosphere) for the world overview, Mercator when zoomed. | **Recommended.** 54 points is trivially within native-layer performance; feature-state lets the sidecar/list drive highlights with zero re-render cost; one rendering pipeline to reason about for accessibility and screenshots. |
| deck.gl overlay (`MapboxOverlay`, interleaved) on MapLibre | Keep in your pocket, not in the bundle. Justified only when you add something MapLibre can't do natively: animated arcs between a recording and its nearest reference sites, GPU-heavy aggregation, or a large embedding-space scatter (deck.gl `OrthographicView`). None of those are required for 54 sites. |
| deck.gl as the controller with MapLibre underneath (current pattern) | No. Two camera models, two event systems, harder a11y, larger bundle, and it is what produced the `FlyToInterpolator`/view-state glue in `ReefMap.tsx`. |
| Leaflet | **Drop.** Duplicate stack; raster-only styling; react-leaflet 4 is React-18-only. |

### Basemap / tiles

| Source | License / cost | Use it for | Verdict |
|--------|---------------|-----------|---------|
| **Protomaps basemap (PMTiles) self-hosted** on S3+CloudFront (or Cloudflare R2) + `@protomaps/basemaps` style generator | ODbL (OSM) data; you pay only storage/egress. Single file served via HTTP range requests `[WEB]`. Extract only the zoom range you need (e.g. global z0–8 plus z9–13 boxes around the 7 regions) with `pmtiles extract`. | Target basemap. Full control of a custom, ocean-first, muted style (land de-emphasised, coastlines crisp, labels sparse). | **Target** |
| **OpenFreeMap** | Free, no API key, no limits, commercial use allowed, donation-funded `[WEB]`. MapLibre-native styles. | Immediate drop-in to replace the CARTO style URL while the custom style is built. | **Now (interim)** |
| CARTO `dark-matter` (current) | CARTO basemap terms restrict free use; verify before any commercial use `[WEB?]`. | — | Replace |
| MapTiler (Ocean/bathymetry styles) | API key + quota tiers `[WEB?]`. | Only if you want a turnkey bathymetric style and accept a key. | Not needed |
| **GEBCO grid** (latest annual grid) | Public domain with attribution; no implied endorsement by IHO/IOC/GEBCO/NERC/BODC `[WEB]`. WMS at `wms.gebco.net` exists but is slow/raster-only. | **Pre-process once** (GDAL: hypsometric tint + hillshade raster, and/or depth contours via `gdal_contour` → tippecanoe) into a PMTiles layer. Gives the "ocean instrument" look and real depth context. | **Recommended (one-time build step)** |
| EMODnet Bathymetry | European seas only. None of the 7 study countries are in coverage. | — | **Skip** (irrelevant here) |
| **Allen Coral Atlas** (reef extent, geomorphic, benthic) | **CC BY 4.0**, © Allen Coral Atlas Partnership & Vulcan Inc. `[WEB]` — reuse is allowed with attribution. | Download reef extent/geomorphic polygons for the 7 regions, tile with tippecanoe into a vector PMTiles overlay. Massive context gain at zoom 10+ around each site. | **Recommended, Phase 2+** |

### Decision record — Map

| Dimension | Detail |
|-----------|--------|
| Current | deck.gl 9 controller + react-map-gl 7 + MapLibre 4 + CARTO style; separate Leaflet maps for mini/world maps. |
| Proposed | One `<MapView>` built on MapLibre 6.11 + `react-map-gl/maplibre` 8.1; GeoJSON site source with `promoteId: 'site_id'`; feature-state for hover/selected/compare; globe at low zoom; OpenFreeMap now → self-hosted Protomaps + GEBCO + Allen Coral Atlas PMTiles later. A **persistent map instance** in the instrument layout (never unmounted across sidecar navigation). |
| User benefit | Consistent map everywhere; smoother on tablets (one GL context instead of two); globe overview; real reef/bathymetry context; faster load. |
| Engineering benefit | Removes deck.gl, Leaflet, react-leaflet, @types/leaflet; one camera/event model; style is a JSON document you can version and theme from design tokens. |
| Migration cost | Medium (≈3–5 days for MapView + mini-map variant + style). Tiles pipeline is a separate ≈2–3 day task (GDAL/tippecanoe/pmtiles CLI). |
| Risk | Low for MapLibre. Medium for the tile pipeline (bathymetry styling is fiddly; tile hosting needs CORS + range requests). |
| Compatibility | WebGL2 required (MapLibre 6). Keep the existing WebGL-fallback UI, but make the **site list** the primary accessible alternative (see §10). |
| Now vs later | MapLibre-only map + OpenFreeMap: **now**. PMTiles/GEBCO/ACA: **Phase 2–3**. deck.gl: **later, only if a concrete layer needs it**. |

---

## 3. Data visualization

### Current versions `[REG]`
`@observablehq/plot` **0.6.17** · `@visx/visx` **4.0.0** (2026-06) · `d3` **7.9.0** · `echarts` **6.1.0** (`echarts-for-react` 3.0.6) · `recharts` **3.10.1**.

### Accessibility reality check
- **Observable Plot:** ARIA on the root SVG (`ariaLabel`, `ariaDescription`), auto `aria-label` per mark group, per-datum `ariaLabel` channel, `ariaHidden` for decorative marks `[OFF]`. **No built-in keyboard navigation.**
- **Recharts 3:** `accessibilityLayer` is **on by default**; the chart surface is focusable and arrow keys walk the tooltip point-by-point `[WEB]`. Best out-of-box keyboard story of the group, but its grammar is weak for uncertainty displays (intervals, dot/strip plots, small multiples).
- **visx:** primitives only; accessibility is whatever you build.
- **ECharts 6:** `aria` option auto-generates a text description and supports decal patterns for colour-blind users; canvas-rendered (screen readers get only the description). Heavy bundle even when tree-shaken.
- **D3 bespoke:** whatever you build.

No library gives you an accessible *analytical* chart for free. The pattern that actually works for a research instrument: **every chart has (1) a one-sentence text takeaway, (2) a "view as table" toggle backed by the same data, (3) ARIA labels on marks, (4) keyboard focus on the interactive ones (timeline, brush)**.

### Options

| Option | Verdict |
|--------|---------|
| **Observable Plot for analytical charts** (class-probability bars with uncertainty, similarity rankings, band-energy time series, embedding projection, per-segment strip plots) **+ small hand-written React/SVG components using `d3-scale`/`d3-array`/`d3-shape` for the interactive instrument views** (timeline/scrubber, brushes) | **Recommended.** Plot's grammar makes intervals, facets and dot plots one-liners; d3 modules (not the whole `d3` bundle) for the bespoke, keyboard-operable views you need to own anyway. |
| Keep recharts (v3) | Acceptable if the team strongly prefers declarative React charts; its default keyboard layer is a real plus. But it fights you on uncertainty/provenance displays, which are a core requirement. |
| visx 4 | Viable alternative to "Plot + d3 modules" if you want everything in JSX; more code per chart. |
| ECharts 6 | Built for big dashboards with lots of data. Overkill for 54 sites and 4 classes; large bundle; canvas a11y is description-only. **No.** |

Plot is pre-1.0 (0.6.x) but has been API-stable for years and is maintained by Observable; render it into a `ref` in a `useEffect` (it returns a DOM node). Pin the minor version.

### Decision record — Visualization

| Dimension | Detail |
|-----------|--------|
| Current | recharts 2 for one embedding chart; hand-rolled probability bars. |
| Proposed | `@observablehq/plot` 0.6.17 + `d3-scale`, `d3-array`, `d3-shape`, `d3-format` (individual modules). A shared `<Figure>` wrapper that enforces title, takeaway text, data-table toggle, source/provenance footnote. Colours come from design tokens (categorical status palette validated for colour-vision deficiency). |
| User benefit | Uncertainty and provenance visible, not hidden; consistent charts; usable by keyboard/screen-reader users via the table view. |
| Engineering benefit | Less chart code; one wrapper enforces a11y rules; d3 modules are tiny and tree-shake. |
| Migration cost | Low (only one recharts chart exists). |
| Risk | Low. Plot's SSR/DOM coupling means client-only render — fine, the instrument is client-only. |
| Now vs later | **Now**, alongside the instrument shell. |

---

## 4. Audio and spectrogram

### Current versions `[REG]`
`wavesurfer.js` **8.0.1** (8.0.0 released **2026-09-23 — one week old**; 7.12.12 on 2026-09-10 is the last v7) · `onnxruntime-web` **1.30.0** · `@litertjs/core` **2.5.3** · `@tensorflow/tfjs` 4.22.0 (no release since 2025-01) · `@ffmpeg/ffmpeg` 0.12.15 (no release since 2025-04) · `mediabunny` **1.61.0**.

### wavesurfer v8 facts `[OFF]`
- Core and plugins rebuilt on a single ownership/teardown model; many leaks and double-fired events fixed. Public API, events and plugin constructors unchanged; `destroy()` is final; superseded `load()` rejects with AbortError; `getMediaElement()` returns `HTMLMediaElement | null`.
- Spectrogram plugin: `rendering: 'full' | 'windowed'` (windowed uses a byte-based segment cache, 256 MB default); `noverlap` now honoured exactly; options include `fftSamples`, `windowFunc`, `frequencyMin/Max`, `scale` (`linear|logarithmic|mel|bark|erb`), `gainDB`, `rangeDB`, `colorMap`, `labels`, `useWebWorker`.
- It renders **pixels**. It does not hand you the time-frequency matrix as data.

### The core design question
The redesign needs scrubbing, **band filtering**, and **synchronized views** (spectrogram ↔ waveform ↔ band-energy chart ↔ per-segment classification strip ↔ map highlight). That means the STFT result has to be **data** shared by several views (band energies, acoustic indices, per-segment summaries), not just an image inside one widget. That argues for owning the STFT and the renderer.

### Options

| Option | Verdict |
|--------|---------|
| **Own audio engine + Worker STFT + WebGL2 spectrogram renderer** (Canvas2D fallback from the same matrix) | **Recommended.** One `AudioEngine` singleton (single `AudioContext`, unlocked on first gesture, `AudioBufferSourceNode` playback with an `AudioContext.currentTime`-based playhead, `BiquadFilterNode` band-pass for "listen to this band"). A Worker computes the STFT once into a `Float32Array`/`Uint8Array` matrix (transferable); a ~300–500 LOC WebGL2 component uploads it as a texture (tiled to respect `MAX_TEXTURE_SIZE`) and renders with a colour-map LUT; dB range, band highlight and the playhead are shader uniforms, so scrubbing/zooming never recomputes the FFT. The same matrix feeds band-energy charts. |
| wavesurfer v8 + Spectrogram plugin (`useWebWorker`, `rendering:'windowed'`) | Good **fallback / quick start**, and a fine choice for waveform + regions + timeline UI. Weak for multi-view sync and band analytics because the data stays inside the plugin. v8 is one week old — if used now, pin and expect 8.0.x patches. |
| Canvas2D-only (current approach style) | Fine for ≤ 30 s clips; repaint cost grows with zoom/scrub on mobile. Use only as the fallback path. |
| WebGPU spectrogram / WebGPU FFT | WebGPU now ships in Chrome/Edge, Safari 26, Firefox (Windows; macOS ARM from 145; **Android Firefox still pending**) `[WEB]`. Unnecessary: a 5-min, 32 kHz STFT is milliseconds in a Worker. **No.** |
| AudioWorklet | Needed only for custom sample-accurate DSP (e.g. custom filters, real-time level metering). Native `BiquadFilterNode` + `AnalyserNode` cover band filtering and live meters. **Later, if ever.** |

### Where to compute spectrograms

| Data | Recommendation |
|------|----------------|
| **Reference-site audio (54 sites, static)** | **Precompute** in an offline Python script (same STFT params as the client: e.g. 32 kHz, n_fft 1024, hop 256, Hann, dB, 0–16 kHz) → store the matrix as a quantised `Uint8` binary (or 16-bit PNG/WebP tiles for long recordings) + compressed listening audio (Opus/AAC) on the CDN. Instant compare views, identical on every device, no client CPU. |
| **User uploads** | **Client FFT in a Worker** — the browser already has the file; no round-trip. Use the **same parameters** as the precomputed reference spectrograms so comparisons are apples-to-apples. Optionally persist the backend's segment-level outputs (per-5 s class probabilities) to draw a classification strip under the spectrogram. |

### Decoding / resampling in the browser
- `decodeAudioData` covers WAV/MP3/AAC/FLAC/Opus in all evergreen browsers; resample to 32 kHz mono with `OfflineAudioContext` (sample-rate-converted render) — enough for v1.
- **Mediabunny** 1.61 (pure TS, zero deps, tree-shakable, WebCodecs-backed, has resampling in its conversion API) `[WEB]` — adopt when you need **streaming/chunked decode of long recordings** (10+ minutes) without holding the whole decoded buffer in memory, or container formats `decodeAudioData` rejects.
- **ffmpeg.wasm: no** — ~30 MB core, last release 2025-04, slow; WebCodecs/Mediabunny supersede it for this use.

**High-value side effect:** resample and down-mix **before upload** (see §6 and Pitfall P1). A 1-minute 96 kHz/24-bit stereo hydrophone file is ~34 MB; at 32 kHz/16-bit mono it is ~3.8 MB.

### In-browser embedding inference (SurfPerch-sized model) — feasibility
- SurfPerch: 32 kHz, 5 s windows, 1280-d embeddings; EfficientNet-family backbone. Reported parameter count ~24 M in the Perch 2.0 underwater paper's comparison `[WEB?]` → roughly **~95 MB FP32 / ~25 MB INT8** once converted. Perch v2 (EfficientNet-B3, 1536-d) community ONNX/TFLite ports exist: ~409 MB FP32 with classifier heads, ~131 MB INT8 `[WEB?]`.
- Runtimes: `onnxruntime-web` 1.30 (WASM/WebGPU/WebNN EPs) or LiteRT.js `@litertjs/core` 2.5 (TFLite in browser, WebGPU). TF.js 4.22 is effectively in maintenance — avoid for new work.
- The MLP head (1280→256→64→4, ≈ 344 K params ≈ 1.4 MB FP32) is trivial in plain JS.
- **Verdict: technically feasible on desktop/modern laptops, marginal on phones (25–100 MB download + GPU memory), and it duplicates the backend's job.** Value would be offline/privacy mode or zero-cold-start. **Spike later, not in the redesign.** Also verify the SurfPerch model license on Kaggle before redistributing weights to browsers.
- Backend note (not front-end, but material): the Perch 2.0 underwater-transfer paper reports Perch 2.0 embeddings generally outperform SurfPerch on few-shot underwater tasks `[OFF]` (arXiv 2512.03219). Switching models would invalidate all 54 reference embeddings and the trained MLP — a separate ML research item.

### Decision record — Audio/spectrogram

| Dimension | Detail |
|-----------|--------|
| Current | 5 ad-hoc AudioContexts; per-frame React state updates; particle "spectrogram"; wavesurfer installed but unused. |
| Proposed | `AudioEngine` singleton + `stft.worker.ts` + `<SpectrogramGL>` + shared `playhead` (zustand, read via `subscribe`/refs inside rAF — never React state per frame). Precomputed reference spectrograms on CDN. `OfflineAudioContext` resample now, Mediabunny later for long files. |
| User benefit | Real, scientific spectrograms; smooth scrub/zoom on tablets; "solo a band" listening; spectrogram, waveform, charts and map highlight move together. |
| Engineering benefit | One audio lifecycle (iOS unlock, cleanup) instead of five; testable pure DSP (Vitest can assert STFT correctness against NumPy fixtures); no re-render storms. |
| Migration cost | **Medium-high (≈1.5–2.5 weeks)**; the WebGL renderer and sync model are the biggest single build item in the redesign. |
| Risk | Medium: iOS Safari audio quirks, texture-size limits, memory for long files. Mitigate with a fixed max analysis window (e.g. 10 min) in v1. |
| Now vs later | Engine + Worker STFT + renderer: **now** (it's the instrument's core). AudioWorklet, Mediabunny streaming, in-browser inference: **later**. |

---

## 5. State management

### Current versions `[REG]`
`nuqs` **2.10.1** (adapters: Next app/pages, React SPA, React Router v6–v8, TanStack Router `[WEB]`) · `zustand` **5.0.15** · `@tanstack/react-query` **5.104.0**.

### Recommended split (three kinds of state, three tools)

| State kind | Examples | Tool |
|------------|----------|------|
| **Shareable / navigational** (must survive reload and be linkable) | selected site(s), comparison set, map camera (rounded), time window `t0..t1`, playhead (rounded), frequency band filter, active view/tab, analysis id, colour scale | **nuqs 2.10** with typed parsers; `createSerializer` to build share links; `history: 'replace'` + throttling for continuous values (camera, playhead) so you don't spam history. |
| **Ephemeral, high-frequency UI** | live playhead, hover, drag/brush in progress, audio engine status | **zustand 5** with transient subscriptions (refs/rAF), not React state. |
| **Server cache** | `/sites` (or static JSON), analysis status/result, uploads | **TanStack Query 5**: `refetchInterval` as a function of `status` (replaces the hand-written `pollAnalysis` loop), `staleTime: Infinity` for versioned static reference data. |

URL budget: keep the URL to IDs and small numbers. **Never** put embeddings, audio, or results in the URL — put an `analysis` id (or `investigation` id) in it.

### Saved investigations

| Option | Verdict |
|--------|---------|
| **URL-only sharing** (state already in the URL) | **Now.** Zero backend. |
| **localStorage (index) + IndexedDB (audio blobs, cached results)** for "My investigations" on this device | **Now/Phase 3.** `idb-keyval` or raw IDB; version the schema. |
| **DynamoDB `INVESTIGATION#<shortId>` items** in the existing table + `PUT/GET /investigations` on the router Lambda | **Later**, when you need cross-device or "publish a citable investigation". Fits existing infra, no new vendor, near-zero cost. Needs: S3 lifecycle policy alignment (saved investigations must not point at deleted uploads), abuse limits, optional TTL for anonymous drafts. |
| Supabase (Postgres + auth) | **No** unless/until you need user accounts, teams and relational queries. It would be a second backend and vendor for a 54-site app. |

| Dimension | Detail |
|-----------|--------|
| Current | zustand stores; no URL state; manual polling loop. |
| Proposed | nuqs for URL state, zustand for transient, TanStack Query for server; investigations local-first, DynamoDB later. |
| User benefit | Every view is a shareable link; back/forward works; reload doesn't lose context. |
| Engineering benefit | Clear ownership of each piece of state; deletes custom polling; URL schema becomes a testable contract (round-trip tests). |
| Migration cost | Low–medium (≈2–4 days); the URL schema design deserves its own short spec. |
| Risk | Low. Watch history spam and URL length. |
| Now vs later | nuqs/Query/zustand: **now**. Backend investigations: **later**. |

---

## 6. Styling, design system, primitives, motion

### Current versions `[REG]`
`tailwindcss` **4.3.3** · `react-aria-components` **1.21.1** · `@base-ui/react` **1.8.0** · `radix-ui` 1.6.7 · `@ark-ui/react` 5.39.2 · `shadcn` CLI 4.21.0 · `cmdk` **1.1.1** (last publish 2025) · `motion` / `framer-motion` **13.4.6** · `sonner` 2.0.8 · `lucide-react` 1.49.0.

### Tailwind v4
- CSS-first config: tokens declared in CSS via `@theme`, exposed as CSS custom properties automatically; Lightning CSS engine; automatic content detection. Upgrade tool: `npx @tailwindcss/upgrade`.
- **Browser floor: Safari 16.4+, Chrome 111+, Firefox 128+** (needs `@property`, `color-mix()`, oklch) `[WEB]`. Acceptable for a 2026 research tool; it does exclude iPads stuck on iPadOS 15.
- Put **semantic tokens** (surface, ink, accent, status-healthy … status-restored_mid, viz-seq-*, viz-cat-*) in one CSS layer; read them in JS (`getComputedStyle`) for the MapLibre style and Plot colour scales so map, charts and UI cannot drift. The current status colours (sienna for "healthy", grey for "degraded", pink for "restored_mid") should be re-derived and checked for colour-vision deficiency.

### Primitive layer

| Option | Strengths | Concerns | Verdict |
|--------|-----------|----------|---------|
| **React Aria Components 1.21** (Adobe) | Deepest accessibility engineering on the market: Slider with multiple thumbs (→ frequency band range), Table/GridList with keyboard nav, ComboBox/**Autocomplete + Menu (→ command palette)**, Toolbar, Disclosure, Dialog/Popover/Modal, focus management, i18n/RTL, virtualizer. Tailwind-friendly render props + data attributes. | More verbose than Radix; you style everything. | **Recommended single primitive layer** |
| Base UI 1.8 (MUI team) | Actively developed; **shadcn/ui's default since 2026-07** with Radix still supported `[WEB]`. | Fewer complex widgets than RAC for data tools (sliders/tables are thinner). | Good second choice; pick it if you want shadcn's copy-paste components. |
| Radix | Mature, huge ecosystem. | Maintenance slowed after WorkOS acquisition `[WEB]`; shadcn moved its default away. | Not for a new design system. |
| Ark UI 5 (Zag state machines) | Framework-agnostic, solid a11y. | Smaller React community. | No strong reason here. |
| shadcn/ui | Great starting point (copy-paste). | It's a code generator over Base UI/Radix — not a primitive layer in itself. | Optional: use for scaffolding only if you choose Base UI. |

**Command palette:** build it from RAC `Autocomplete` + `Menu` inside a `Modal` (documented RAC example). `cmdk` 1.1.1 is fine and popular (shadcn's Command wraps it) but is slow-moving and would be a second a11y model alongside RAC. Commands should be actions over the URL state (go to site, compare with…, set band, open analysis, copy share link, toggle globe).

### Motion
- `motion` **13.4.6** is the renamed framer-motion (v13 mainly removes `@emotion/is-prop-valid` optional dep) `[OFF]`.
- **Prefer platform features first:** CSS transitions for micro-interactions; React 19.3 `<ViewTransition>` (stable) for sidecar panel changes and list↔detail morphs. Use Motion only for gesture-driven pieces (bottom sheet drag on mobile, spring physics). Always honour `prefers-reduced-motion`.
- **Retire the decorative Canvas2D particle backgrounds from instrument views** (battery/GPU cost on tablets, competes with the map's GL context). Keep them, if wanted, on the landing/"experience" narrative page only.

| Dimension | Detail |
|-----------|--------|
| Current | Tailwind 3 + inline rgba styles; no primitive library; framer-motion 11; Canvas2D ambience everywhere. |
| Proposed | Tailwind 4.3 `@theme` tokens → CSS vars shared with map/charts; RAC as the only primitive layer; RAC-based command palette; CSS + `<ViewTransition>` first, `motion` 13 sparingly. |
| User benefit | Keyboard-complete UI, consistent visuals, calmer instrument, better battery/perf on tablets. |
| Engineering benefit | One token source; a11y behaviour inherited instead of hand-rolled; fewer deps. |
| Migration cost | Medium (Tailwind 4 upgrade is ~1 day; building the RAC-based component kit is the real cost, ≈1 week for the 12–15 components the instrument needs). |
| Risk | Low–medium: Tailwind 4 browser floor; RAC verbosity. |
| Now vs later | **Now** — the instrument shell is built on it. |

---

## 7. Backend / API evolution

### Facts that constrain choices
- Current API is **API Gateway HTTP API** `[CODE]`. **REST API** response streaming (launched 2025-11-19, `responseTransferMode: STREAM`, up to 15-min integrations) does **not** apply to HTTP APIs `[OFF]`.
- Lambda response streaming is native only on **Node.js managed runtimes**; Python needs a custom runtime or Lambda Web Adapter `[WEB]`.
- Payload limits: API Gateway 10 MB; **Lambda synchronous invocation 6 MB** (base64 bodies inflate ~33%) `[WEB]`.
- AWS **AppSync Events** offers serverless WebSocket pub/sub; backends publish over HTTP; Powertools for Python has an AppSync Events handler `[OFF]`.

### Options

| Topic | Recommendation | Rationale |
|-------|---------------|-----------|
| **Analysis progress** | **Keep polling**, but make it good: one status endpoint returning `{stage, stage_index, stage_count, segments_done, segments_total, updated_at}` from DynamoDB; TanStack Query `refetchInterval` (1 s for the first 10 s, then back off to 3–5 s); show the cold-start explicitly ("waking the model, ~20 s"). | An analysis takes ~10–40 s. Polling = 10–30 cheap GETs. SSE/WebSockets add infrastructure for no perceptible user gain. |
| SSE via Lambda streaming | No (HTTP API + Python makes it awkward). | |
| API Gateway WebSocket API | No (connection table, $connect/$disconnect Lambdas — real ops burden). | |
| AppSync Events | **Later**, only if you add long batch jobs (many files, multi-minute) where push matters. Cleanest AWS-native option at that point. | |
| **Uploads** | **Now:** `POST /uploads` returns an **S3 presigned PUT URL**; browser uploads directly to S3; the browser first decodes + resamples to 32 kHz mono 16-bit WAV (or FLAC) so uploads shrink 3–9×. | Fixes the hidden ~4.5 MB effective upload ceiling (Pitfall P1); removes binary-through-Lambda; enables progress bars (XHR/fetch upload progress). |
| **Reference data delivery** | Build-time static artifacts on the CDN (Vercel `public/` or S3+CloudFront), content-hashed & versioned: `sites.v{n}.json` (metadata + provenance: dataset DOI, licence, recorder, depth, date range, sample rate, n segments), `embeddings.v{n}.f32` (54×1280 Float32, ~276 KB; ~70 KB gz as float16), `spectrograms/{site}.u8`, `audio/{site}.opus`. Keep `GET /sites` for backward compatibility but stop depending on it. | Instant loads, offline-cacheable, removes a Lambda cold start from the first paint, makes provenance a first-class field. Also enables client-side cosine similarity for "what-if" exploration. |
| JSON vs Parquet vs Arrow | **JSON + one raw typed binary.** Publish Parquet only as a *downloadable dataset* for researchers (use `hyparquet` 1.31 in-browser if you ever need to read it — small, pure JS). | 54 rows does not need a columnar engine. |
| **DuckDB-WASM** (`@duckdb/duckdb-wasm` "latest" tag is still a `1.33.1-dev` build `[REG]`) | **No.** Multi-MB WASM to query 54 rows. Revisit only if you load thousands of per-segment rows from many recordings. | |
| **Spatial database** (PostGIS, DynamoDB geo libs, Aurora) | **No — not warranted.** 54 points are a ~20 KB GeoJSON. Nearest-site and bbox filters are brute-force haversine in microseconds in the browser or Lambda. The `region_detection.py` lat/lon boxes are fine. Revisit at ~10⁵ geometries or if you ingest reef polygons server-side (and even then, PMTiles + client queries likely suffice). | |

| Dimension | Detail |
|-----------|--------|
| Current | Binary upload through API GW→Lambda; manual polling; `/sites` from S3 JSON through Lambda. |
| Proposed | Presigned S3 uploads + client resample; richer status + Query-driven polling; static versioned reference artifacts with provenance. |
| User benefit | Real recordings (minutes, high sample rate) actually upload; honest progress; instant site data. |
| Engineering benefit | Smaller Lambda surface; cacheable data; provenance schema. |
| Migration cost | Low–medium (router Lambda changes + an offline build script; ≈3–5 days). |
| Risk | Low. CORS on the S3 bucket; presigned URL expiry; keep old endpoint during transition. |
| Now vs later | Presigned uploads + static data: **now**. AppSync Events, backend investigations: **later**. |

---

## 8. Testing and quality

### Current versions `[REG]`
`vitest` **5.0.3** (5.0.0 released 2026-09-03 — new major; Vitest 4 made **browser mode stable** and added `toMatchScreenshot` visual regression `[WEB]`) · `@playwright/test` **1.63.0** · `@playwright/experimental-ct-react` 1.62.1 (**still experimental**) · `axe-core` / `@axe-core/playwright` **4.13.0** · `storybook` **10.6.1** (ESM-only, `addon-vitest`, Vitest 4 support `[WEB]`) · `@lhci/cli` 0.15.1 (no release since 2025-06) · `@sentry/nextjs` **11.1.0** · `web-vitals` 6.2.2 · `@vercel/analytics` 2.0.1 · `@vercel/speed-insights` 2.0.0 · `@next/bundle-analyzer` 16.3.8.

### Recommended test pyramid

| Layer | Tool | What it covers |
|-------|------|----------------|
| Unit (Node) | **Vitest** | STFT/band-energy math vs NumPy fixtures; URL parsers/serializers round-trip; status→progress mapping; cosine similarity; token contrast checks. |
| Component (real browser) | **Vitest browser mode** (Playwright provider) | RAC-based components, command palette keyboard flows, timeline/scrubber keyboard operation. Prefer this over Playwright CT (still experimental). |
| E2E | **Playwright 1.63** | Upload→analyze→results with the API mocked via `page.route` (deterministic) + one nightly smoke against the real API; share-link round-trip; reload restores state. |
| Visual regression | **Playwright `toHaveScreenshot`**, run **only inside the pinned official Playwright Docker image** (fonts/AA differ by OS) `[WEB]` | Fixture pages for each component state + key instrument layouts at phone/tablet/desktop widths. **Mask the map canvas** or use a local, deterministic test style with no network tiles; wait for `map.once('idle')`; disable animations. |
| Accessibility | **@axe-core/playwright** in every E2E page + manual keyboard/screen-reader checklist per phase | axe catches ~a third of issues; maps and charts need manual review. |
| Perf budget | Bundle analyzer in CI (fail on budget regressions), Vercel Speed Insights / `web-vitals` for field data | Lighthouse CI is optional; it's slow-moving (last release 2025-06) and lab-only. |
| Observability | **Sentry** (errors + source maps; Replay only if privacy-reviewed) + Vercel Analytics/Speed Insights | Add a custom metric for "time to first spectrogram" and "analysis wall time". |

**Storybook 10 vs Ladle vs Playwright-only:** start **Playwright-only with a `/dev/fixtures` route** (component states rendered by URL, screenshot-tested, excluded from production via env flag). Adopt **Storybook 10** later if the component kit grows past ~25 components or non-engineers need a browsable catalogue; its `addon-vitest` reuses the same Vitest browser runner, so nothing is wasted. Ladle adds little over either.

| Dimension | Detail |
|-----------|--------|
| Current | No tests, no a11y checks, no bundle budget, no error monitoring. |
| Proposed | Vitest (unit + browser) + Playwright (e2e + screenshots in Docker) + axe + bundle budget + Sentry + Speed Insights. |
| User benefit | Fewer regressions; accessibility verified, not assumed. |
| Engineering benefit | Safety net that makes an incremental (strangler) migration possible at all. |
| Migration cost | ≈3–4 days initial setup; ongoing per-feature cost. |
| Risk | Visual-test flake from WebGL/fonts (mitigations above). Vitest 5 is 4 weeks old — fall back to 4.x if plugins lag. |
| Now vs later | **Now, first** (baseline screenshots of the current app before changing anything). Storybook/LHCI: later/optional. |

---

## 9. Hosting note

Vercel Hobby is **non-commercial only**; donations, ads, or paid work on the site count as commercial use `[WEB]`. If ReefRadar becomes part of paid work or takes donations, budget for Vercel Pro or move the static build to S3+CloudFront (works for option A with `output: 'export'` if you give up OG-image generation, or for option B natively). Tile/PMTiles hosting belongs on S3+CloudFront or R2 regardless (large files, range requests).

---

## 10. Accessibility architecture for maps and charts (cross-cutting)

1. **The site list is the primary interface; the map is a view of it.** A RAC `GridList`/`Table` of the 54 sites (filterable, sortable, keyboard-navigable) is always present in the sidecar; selecting a row updates map feature-state and vice versa. This is the established pattern for WebGL maps, which are opaque to assistive tech `[WEB]`.
2. Map canvas: `role="application"` only with explicit instructions, or `aria-hidden` with the list as the equivalent; MapLibre's keyboard pan/zoom stays on; a live region announces "Selected Site ind_H4, Indonesia, healthy, similarity 0.94".
3. Charts: text takeaway + table toggle + ARIA labels (§3).
4. Spectrogram: describe it (duration, dominant bands, band-energy summary from the same matrix); timeline/scrubber is a RAC `Slider` with `aria-valuetext` in mm:ss; band filter is a two-thumb `Slider`.
5. Colour: status and sequential palettes validated for CVD; never encode status by colour alone (shape/label too).

---

## 11. Recommended target stack

| Layer | Choice | Version (2026-09-30) |
|-------|--------|----------------------|
| Framework | Next.js App Router (instrument = client island; RSC for static/site/OG pages) | `next` 16.3.x |
| UI runtime | React (+ React Compiler) | `react` 19.3.x |
| Language | TypeScript (5.x now; 7 when ESLint/tooling plugins catch up) | `typescript` 5.9 → 7.0 |
| Map | MapLibre GL JS via `react-map-gl/maplibre` | `maplibre-gl` 6.11, `react-map-gl` 8.1 |
| Tiles | OpenFreeMap (interim) → self-hosted Protomaps PMTiles + GEBCO-derived bathymetry + Allen Coral Atlas reef overlay | `pmtiles` 4.5, `@protomaps/basemaps` 5.7 |
| Charts | Observable Plot + d3 modules (`d3-scale`, `d3-array`, `d3-shape`, `d3-format`) | `@observablehq/plot` 0.6.17 |
| Audio | Own `AudioEngine` (Web Audio) + Worker STFT + WebGL2 spectrogram; precomputed reference spectrograms | native APIs; `mediabunny` 1.61 later |
| URL state | nuqs | 2.10 |
| Client state | zustand (transient) | 5.0 |
| Server state | TanStack Query | 5.104 |
| Persistence | URL + localStorage/IndexedDB → DynamoDB items later | — |
| Styling | Tailwind CSS v4 `@theme` tokens + CSS custom properties | `tailwindcss` 4.3 |
| Primitives | React Aria Components (incl. command palette via Autocomplete+Menu) | `react-aria-components` 1.21 |
| Motion | CSS + React `<ViewTransition>`; `motion` for gestures only | `motion` 13.4 |
| Toasts / icons | sonner, lucide-react | 2.0, 1.49 |
| Tests | Vitest (unit + browser mode), Playwright (e2e + screenshots in Docker), axe | `vitest` 5.0 (or 4.x), `@playwright/test` 1.63, `@axe-core/playwright` 4.13 |
| Observability | Sentry, Vercel Analytics + Speed Insights, web-vitals | `@sentry/nextjs` 11.1 |
| Backend changes | Presigned S3 uploads; richer status; static versioned reference artifacts with provenance; keep polling | — |

**Removed:** deck.gl (3 packages), leaflet, react-leaflet, @types/leaflet, recharts, framer-motion (→ `motion`), wavesurfer.js (unused), decorative Canvas2D layers in instrument views.

```bash
# core (inside dashboard-next/)
npm i next@16.3 react@19.3 react-dom@19.3 maplibre-gl@6 react-map-gl@8 pmtiles@4 \
  @observablehq/plot@0.6.17 d3-scale d3-array d3-shape d3-format \
  nuqs@2 zustand@5 @tanstack/react-query@5 react-aria-components@1 motion@13 sonner@2 lucide-react
npm rm @deck.gl/core @deck.gl/layers @deck.gl/react leaflet react-leaflet @types/leaflet recharts framer-motion wavesurfer.js
# dev
npm i -D tailwindcss@4 @tailwindcss/postcss vitest @vitest/browser-playwright @playwright/test @axe-core/playwright \
  @next/bundle-analyzer eslint @types/react@19 @types/react-dom@19
```

---

## 12. Recommended migration sequence

### Strangler in place, not a rebuild in a new app directory

**Recommendation: incremental strangler inside the existing `dashboard-next/` app**, using route groups:

```
src/app/(legacy)/…        ← current pages, frozen except for upgrade fixes
src/app/(instrument)/explore/…   ← new persistent map + sidecar layout
src/app/(site)/about, /sites/[siteId], /methodology   ← RSC, static
src/features/{map,audio,timeline,analysis,investigations,command}/  ← all new code
src/design/{tokens.css,components/}                                 ← RAC kit
```

An ESLint `no-restricted-imports` boundary forbids `features/**` and `design/**` from importing `components/**` (legacy). Old routes redirect to `/explore?…` one by one as parity is reached; delete legacy folders at the end.

Why not a new app directory/monorepo: the data layer is tiny, the app has ~7 routes, and there is one developer-scale team. A second app means two deploys, two dependency trees, and cross-app routing glue for no isolation benefit. Why not a big-bang rewrite: there are no tests today; the strangler lets the screenshot/E2E baseline from Phase 0 keep guarding legacy pages while the new ones grow.

### Sequence

| # | Phase | Contents | Why here |
|---|-------|----------|----------|
| 0 | **Safety net** | Playwright + Docker screenshot baseline of current pages; axe baseline; bundle-size baseline; Sentry; Vitest scaffold. | Nothing can be changed safely without it. |
| 1 | **Platform upgrade & debt removal** | Next 16.3 / React 19.3; Tailwind 4 upgrade tool; `motion` 13; remove wavesurfer (unused), Leaflet maps → MapLibre `MapView` (mini + full); drop deck.gl; CARTO → OpenFreeMap; consolidate the 5 AudioContexts into one `AudioEngine`; fix per-frame `setState`. | Unblocks React 19-only libs; shrinks bundle; removes duplicate stacks before building on them. |
| 2 | **Data & upload foundation** | Static versioned `sites.json` (+ provenance) and `embeddings.f32`; precomputed reference spectrograms + Opus clips; presigned S3 uploads with client resample; richer `/status`. | The instrument UI needs these contracts; P1 upload ceiling is a real user-facing bug. |
| 3 | **Instrument shell** | `(instrument)` layout: persistent map + sidecar + site list (a11y primary), nuqs URL schema, RAC component kit + tokens, command palette, `<ViewTransition>` panel changes. | Establishes layout, state and a11y patterns everything else plugs into. |
| 4 | **Audio & timeline** | Worker STFT, WebGL2 spectrogram (+ Canvas2D fallback), unified timeline/scrubber, band filter (listen + highlight), synchronized band-energy chart, reference-vs-upload compare. | Highest complexity; isolated behind the shell's contracts. Needs a phase-level research spike. |
| 5 | **Analysis in the sidecar** | Upload→analyze→results flow with progress, per-segment strip, probability-with-uncertainty and similar-sites views (Plot), out-of-distribution/region caveats and provenance panels. | Combines 2–4. |
| 6 | **Investigations & sharing** | Local saved investigations (IDB), share links, OG images per investigation/site; static RSC site pages. | Builds purely on the URL schema. |
| 7 | **Retire legacy & polish** | Redirects, delete `(legacy)`, PMTiles basemap + GEBCO + Allen Coral Atlas overlays, mobile/tablet layout pass, perf budgets enforced. | Cosmetic/geo-context work after the core is right. |
| Later | Optional | DynamoDB-backed investigations; AppSync Events for batch jobs; Mediabunny streaming decode for long files; Storybook 10; in-browser inference spike; Perch 2.0 backend evaluation. | Each needs a concrete trigger. |

### Over-engineering guardrails (explicitly **not** doing, for a 54-site dataset)
DuckDB-WASM · Arrow/Parquet pipelines in the client · any spatial database · WebSockets/SSE · WebGPU spectrograms · in-browser model inference · deck.gl · Supabase or a second backend · microfrontends/monorepo · Storybook on day one · Cache Components/`'use cache'` (no server data to cache). Each of these is defensible at 100× the data or a different product; none is defensible now.

---

## 13. Pitfalls discovered during this research

| # | Pitfall | Evidence | Mitigation / phase |
|---|---------|----------|--------------------|
| P1 | **Effective upload ceiling ≈ 4.5 MB**, not the 50 MB the router checks for. Binary body → base64 through API Gateway → Lambda sync payload limit 6 MB. A 1-min 96 kHz mono 16-bit hydrophone file (~11.5 MB) fails. | `lambdas/router/handler.py` L75–106 `[CODE]`; limits `[WEB]` | Presigned S3 PUT + client resample (Phase 2). |
| P2 | React re-render every animation frame from `useSpectrogram` → jank on tablets. | `hooks/useSpectrogram.ts` `[CODE]` | Refs + rAF + zustand transient subscribe (Phase 1). |
| P3 | Five independent `AudioContext`s → iOS limits/unlock bugs, leaked contexts, inconsistent sample rates. | grep of `src/` `[CODE]` | `AudioEngine` singleton (Phase 1). |
| P4 | MapLibre 6 is ESM-only + WebGL2-only; old `import maplibregl from` patterns break. | release notes `[WEB]` | Named/namespace imports; keep WebGL fallback UI. |
| P5 | wavesurfer 8.0 is one week old. | `[REG]` | If adopted, pin 8.0.x and watch patch releases, or stay on 7.12.x. |
| P6 | Screenshot tests of WebGL maps/spectrograms are nondeterministic (tiles, GPU, fonts). | `[WEB]` | Docker image, masked canvases, local deterministic style, `idle` waits. |
| P7 | Decoded audio memory on mobile: `decodeAudioData` yields Float32 at the context rate; 10 min stereo 48 kHz ≈ 230 MB. WebGL max texture size caps spectrogram width. | `[WEB?]` (arithmetic) | Cap v1 analysis length; down-mix immediately; tile textures; Mediabunny streaming later. |
| P8 | Tailwind 4 floor (Safari 16.4+) silently breaks older iPads. | `[WEB]` | Decide the support matrix explicitly in requirements. |
| P9 | Saved investigations referencing `uploads/` objects that S3 lifecycle rules delete. | inference | Define retention before shipping persistence. |
| P10 | Spectrogram parameter mismatch between precomputed reference images and client-computed user images makes visual comparison misleading. | inference | One shared STFT parameter spec, tested in both Python and TS. |
| P11 | Vercel Hobby non-commercial clause. | `[WEB]` | Decide hosting tier if the project becomes commercial. |

---

## Sources

Registry (HIGH): `npm view <pkg> version time dist-tags` for every package version cited, run 2026-09-30.

Official / primary:
- [Next.js 16 release](https://nextjs.org/blog/next-16) · [Next.js 16.3 release](https://nextjs.org/blog/next-16-3)
- [React 19.3 release](https://react.dev/blog/2026/09/09/react-19-3) · [React Labs: View Transitions, Activity](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more)
- [wavesurfer.js 8.0.0 release notes](https://newreleases.io/project/github/katspaugh/wavesurfer.js/release/8.0.0) · [Spectrogram plugin docs](https://wavesurfer.xyz/docs/plugins/spectrogram/)
- [MapLibre GL JS v6.0.0 release](https://newreleases.io/project/github/maplibre/maplibre-gl-js/release/v6.0.0) · [MapLibre newsletter Jul 2026](https://maplibre.org/news/2026-08-02-maplibre-newsletter-jul-2026/) · [MapLibre globe + atmosphere example](https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-an-atmosphere/)
- [deck.gl v9.4.0 release](https://newreleases.io/project/github/visgl/deck.gl/release/v9.4.0) · [deck.gl with MapLibre](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre) · [MapboxOverlay](https://deck.gl/docs/api-reference/mapbox/mapbox-overlay)
- [react-map-gl upgrade guide](https://github.com/visgl/react-map-gl/blob/master/docs/upgrade-guide.md)
- [Protomaps](https://protomaps.com/) · [OpenFreeMap](https://openfreemap.org)
- [GEBCO Web Map Service & terms](https://www.gebco.net/data_and_products/gebco_web_services/web_map_service) · [Allen Coral Atlas resources/FAQ (CC BY 4.0)](https://allencoralatlas.org/resources)
- [Observable Plot accessibility](https://observablehq.com/plot/features/accessibility)
- [React Aria Autocomplete](https://react-aria.adobe.com/Autocomplete) · [React Aria command palette example](https://react-spectrum.adobe.com/react-aria/examples/command-palette.html)
- [Tailwind CSS compatibility](https://tailwindcss.com/docs/compatibility)
- [Motion upgrade guide](https://motion.dev/docs/react-upgrade-guide)
- [nuqs adapters](https://nuqs.dev/docs/adapters)
- [Vitest 4 announcement](https://voidzero.dev/posts/announcing-vitest-4)
- [API Gateway REST response streaming](https://aws.amazon.com/about-aws/whats-new/2025/11/api-gateway-response-streaming-rest-apis) · [Lambda response streaming config](https://docs.aws.amazon.com/apigateway/latest/developerguide/response-transfer-mode-lambda.html) · [Streaming Lambda in Python (re:Post)](https://repost.aws/questions/QUwVlNZV0nT7a-EdJVFoRz7g/streaming-response-from-lambda-in-python)
- [AppSync Events overview](https://docs.aws.amazon.com/appsync/latest/eventapi/event-api-welcome.html)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby) · [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines)
- [WebGPU in major browsers (web.dev)](https://web.dev/blog/webgpu-supported-major-browsers)
- [Perch 2.0 transfers to underwater tasks (arXiv 2512.03219)](https://arxiv.org/abs/2512.03219) · [SurfPerch paper (arXiv 2404.16436)](https://arxiv.org/pdf/2404.16436)
- [Mediabunny](https://mediabunny.dev/guide/introduction) · [onnxruntime-web](https://npmjs.com/package/onnxruntime-web)

Secondary (MEDIUM/LOW — used for ecosystem sentiment, verify before relying):
- [Base UI / Radix / shadcn status](https://www.pkgpulse.com/guides/shadcn-ui-vs-base-ui-vs-radix-components-2026) · [Radix future (DEV)](https://dev.to/mashuktamim/is-your-shadcn-ui-project-at-risk-a-deep-dive-into-radixs-future-45ei)
- [TanStack Router comparison](https://tanstack.com/router/v1/docs/framework/react/comparison)
- [Storybook 10 summary](https://alternativeto.net/news/2025/11/storybook-10-debuts-esm-only-29-lighter-module-automocking-and-typesafe-csf-factories)
- [Playwright visual regression in CI](https://testquality.com/playwright-visual-regression-guide/)
- [Perch v2 ONNX/TFLite sizes (HF)](https://huggingface.co/tphakala/Perch-v2-Models)
- [API Gateway vs Lambda payload limits](https://dev.to/aws-builders/synchronous-aws-lambda-amazon-api-gateway-limits-and-what-to-do-about-them-2oec)
- [Accessible web-map patterns](https://nicchan.me/blog/talk-ui-patterns-in-existing-web-map-widgets/)
- [Recharts accessibility discussion](https://github.com/recharts/recharts/discussions/4484)
