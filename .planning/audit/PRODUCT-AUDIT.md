# ReefRadar — Brownfield Product / UX / Data-Communication Audit

**Date:** 2026-09-30
**Branch audited:** `redesign/v2-discovery` (HEAD `4165617`)
**Live surfaces checked:** `https://dashboard-next-indol-nu.vercel.app` (all 8 routes + static audio), API `GET /health`, `GET /sites`, `GET /samples` (read-only; nothing uploaded)
**Companion document:** `.planning/audit/CAPABILITY-MATRIX.md` (the anti-regression contract)
**Related prior audit:** `.planning/codebase/CONCERNS.md` (security, tech-debt, build-blocker detail; not repeated here except where it changes a product decision)

> Tone note: this audit is deliberately blunt. ReefRadar has a good engineering spine (real SurfPerch inference, async serverless pipeline, honest caveat *text*) wrapped in a UI that, in several places, communicates more certainty and more science than the system actually has. Most redesign value is in fixing *what the screens claim*, not in adding effects.

---

## 0. Executive summary (the 12 things that matter most)

1. **The repo HEAD does not build, and the deployed app is not reproducible from git.** `SampleGallery.tsx`, `lib/samples.ts`, the `Sample` type and `api.getSamples()` are all missing from git (`app/page.tsx:5`, `app/experience/page.tsx:18,20,544`). The `GET /samples` route is live on the API but absent from `lambdas/router/handler.py`. The landing page — the product's front door — exists only on the author's disk and in a Lambda that has drifted from source.
2. **Two of the most prominent visualizations do not show what they say.** (a) The "Acoustic Embedding Space" scatter (`EmbeddingChart.tsx`) plots x = mean of embedding dims 0–639, y = mean of dims 640–1279 (`lambdas/classifier/handler.py:generate_visualization`) for only the *first 10* reference sites. That is not a projection of similarity; proximity on that chart means nothing. (b) The full-bleed "SpectrogramCanvas" on `/`, `/experience` (`components/spectrogram/*`) is three animated sine waves plus random particles; it is not a spectrogram, and its band bins (0–50/50–200/200–500 FFT bins) don't match its own labels (<800 / 800–3500 / >3500 Hz).
3. **Probability bars stop being probabilities after "confidence adjustment".** `region_detection.adjust_classification` multiplies *every* class probability by 0.6 (out-of-distribution) or 0.7 (no coordinates). Bars titled "Probability Distribution" then sum to 60–70%, with nothing shown for the missing mass. Skipping the "optional" coordinate step silently costs 30% and triggers an "Out-of-Distribution Region Detected — Unknown (UNKNOWN)" warning whose text says "reduced by 40%" (wrong number).
4. **The model behind the 4-class UI is not what the UI implies.** The documented deployed model (`docs/MODEL_EVALUATION.md`) is **3-class**, trained on **100 clips from 5 sites in 2 countries** (4 Indonesia + 1 Kenya), evaluated on a **10-clip** test set (one random 80/20 split, very likely clip-level leakage within sites). README/About/ArchitectureDiagram claim "1280→256→64→4, ~90%". The only script that adds `restored_mid` (`scripts/add_restored_mid_and_retrain.py`) trains that class on **synthetic sine-wave audio**. Either the UI renders a 0.0% "Restored (Mid)" bar the model never produces, or the 4th class is synthetic. Both must be resolved and disclosed before any redesign shows class probabilities.
5. **"In training distribution" is false for most "in-distribution" regions.** `region_detection.py` marks GBR, Maldives, Mesoamerican Reef as in-distribution (full confidence) because MARRS *recorded* there — but the classifier never trained on a single clip from Australia, Maldives or Mexico.
6. **The healthy-vs-degraded demo is a cherry-picked, confounded pair.** `public/audio/ATTRIBUTION.md`: healthy = Mexico site H1 at **dusk chorus**, degraded = Maldives site D2 at **midday** — different ocean, different time of day, then peak-normalized. `docs/AUDIO_DIAGNOSIS.md §3.5` shows it was chosen as the *maximum-contrast* pair (53× power) after the original pair came out *inverted*. The page copy then generalizes ("degraded reefs are strikingly quiet", "markedly higher sound level"). The DemoState text even admits "dusk chorus … midday recording".
7. **Location Compare is broken in production.** `public/audio/compare/manifest.json` promises 5 locations × up to 4 states (16 files); only `aus/healthy.wav` and `aus/degraded.wav` exist (live: `/audio/compare/ind/healthy.wav` → 404). The default selection is Indonesia, so the first thing the mode does is fail silently (load error is swallowed; no error UI).
8. **Sample gallery content has provenance problems.** Live `/samples` includes `phl_D1` "Degraded Reef, Philippines" — not one of the 54 reference sites and not one of the 7 countries; `aus_R1` is labelled `restored_early` in `/samples` but `restored_mid` in `/sites`; descriptions assert facts nothing in the system measured ("A bleached reef", "grouper booms and clownfish chirps", "damselfish territorial calls", "Two years into restoration") while About says the tool "cannot" do species identification. "Recovery in Sound" stitches Australian and Indonesian sites into one "reef's" recovery arc. "Analyze This" does not analyze anything — it opens a playback card that displays the *ground-truth* label in the same badge style used for model output.
9. **The color system encodes status ambiguously and inaccessibly.** Four warm browns for four classes (healthy `#cd853f` vs restored_mid `#c08081` luminance ratio **1.06:1**; degraded `#6b6560` vs restored_early `#8b7355` **1.28:1**). Dusty rose means *degraded* in `/dashboard/compare`, Demo and Location Compare, but *restored_mid* everywhere else. Healthy = ochre is also the brand/CTA color. `--text-dim` (`#4a4542`, **1.89:1** on the page background) is used for the scientific caveat list items, durations, file info.
10. **The "bioluminescent vitality" milestone is mostly invisible and largely decorative.** The `--reef-*` CSS variables written at 30 fps on every route are consumed by exactly one slider thumb (`globals.css:257-281`) and the dev panel. The global `BackgroundCanvas` sits at `z-index:-1` beneath opaque page backgrounds on every route (very likely never visible — visual verification was deferred to "human" in phases 1–3 and never recorded). Its "vitality" is set from *ground-truth* sample categories, from crossfader position, or from the model label — i.e. it restates a label as atmosphere; it encodes no measured quantity. Meanwhile the default palette is literally defined as the "degraded" state (`.planning/PROJECT.md`).
11. **Two of everything.** Two analyze flows (`/experience` upload vs `/dashboard/analyze`), two compare experiences (`/dashboard/compare` vs `/experience?mode=demo` vs `?mode=compare`), two "spectrogram" components with the same name, two map stacks (deck.gl/maplibre on `/dashboard/map`, Leaflet/OSM on `/sites` and in results), two site lists, two caveat components with different text, two status-color tables, two hubs (`/` and `/dashboard`), two coordinate inputs (validated modal vs unvalidated inline). Users must change mode/route to do adjacent tasks, and results from one flow cannot be seen in the other.
12. **Nothing is shareable, exportable, or traceable.** No result permalink (results already persist by `analysis_id` in DynamoDB and `/visualize/{id}` is a stable GET), no export, no URL state except two read-once params (`?sample`, `?mode`), no per-site page, no model card, no provenance chips on any number.

---

## 1. Product

### 1.1 Problem actually solved

Stated problem (README, About): "assess reef health non-invasively from underwater audio".

Problem the system can *honestly* solve today: **"Given a ≥5 s WAV, how acoustically similar is its mean SurfPerch embedding to a small set of labelled MARRS reference soundscapes, and which reference sites is it nearest to?"** — plus a strong secondary capability: **letting people *hear* reef soundscapes and the healthy/degraded/restored contrast.**

What it cannot solve (and the UI sometimes implies it can): reef-health diagnosis; generalization outside South Sulawesi/Kenya acoustic conditions; temporal assessment; species-level interpretation; restoration-stage estimation with any validated accuracy.

### 1.2 Inferred users (ranked by who the product actually serves today)

| Rank | User | Evidence | What they need | How well served |
|---|---|---|---|---|
| 1 | **Portfolio / hiring reviewers, demo audiences** | `PORTFOLIO.md` demo script, prompt 054 ("single most important UX improvement for demo/presentation purposes"), About architecture diagram, "Quick Facts" panel | "Hear something in 5 s", understand the architecture, see a credible ML result without uploading | Partly. Gallery does the 5-second hook well; credibility is undermined for any technical reviewer who notices the fake scatter, the 0.6× probabilities, or the 404 compare mode |
| 2 | **Curious public / conservation-minded visitors** | Vitality milestone core value: "users FEEL something … without reading a single word" | Emotional contrast, plain-language explanation | Emotionally yes; scientifically the experience over-generalizes from one confounded pair |
| 3 | **Reef / PAM scientists (evaluators)** | SCIENTIFIC_VALIDITY.md, caveats, DOIs | Provenance, methodology, model card, per-segment output, uncertainty, export | Poorly. No model card in-product, no training-set disclosure, no per-segment results, no export, contradictory dataset citations |
| 4 | **Restoration practitioners (MARRS-type)** | restored_early/mid classes, restoration-age text in SiteCard | Compare a restored site to its paired healthy/degraded controls over time | Not served. No site-pair comparison, no time series, no batch upload, single-clip mean embedding |

**Recommendation for the redesign:** design primarily for (1) and (2) but hold every number to the standard of (3). The cheapest credibility win is honesty, not more features.

### 1.3 Research questions the data can actually answer

Grounded in live `/sites` (54 sites: Indonesia 21, Australia 7, Mexico 7, USA 6, Kenya 5, Maldives 5, French Polynesia 3; 48 flagged `has_embedding`, metadata says 44) and one mean embedding per site:

| Question | Answerable? | Notes |
|---|---|---|
| Does this recording's soundscape resemble MARRS healthy vs degraded reference soundscapes? | **Weakly, yes** | Strongest within South Sulawesi; classifier trained on 4 Indonesian + 1 Kenyan site |
| Which reference sites is this recording most similar to (cosine)? | **Yes** | top-3 only; no baseline distribution so "92% similar" is uninterpretable |
| At one location, how do healthy / degraded / newly-restored / mid-restored reefs differ acoustically? | **Yes — the best question in the dataset** | Indonesia has H×6, D×6, N×3, R×6 in a ~2 km area (true paired design). The UI never shows this comparison with real data (Location Compare would, but its files are missing) |
| Do soundscapes differ by ocean basin? | **Confounded** | Equipment, depth, time of day, season differ by country |
| Did a reef's soundscape change after Hurricane Irma? | **Not with current data model** | `/sites` exposes `irma_eastern_sambo` / `irma_western_dry_rocks` as single records; `SITE_COORDINATES` has `_pre`/`_post` keys that no longer exist. About page advertises "pre/post hurricane comparison" that is nowhere in the UI |
| Is a reef recovering over time? | **No** | No timestamps, no multiple recordings per site exposed |
| What species are calling? | **No** | Explicitly out of scope on About; contradicted by sample descriptions |

### 1.4 Essential vs incidental capabilities

**Essential (the product):** listen to real reef audio; hear a *fair* healthy/degraded/restored contrast; analyze my own recording with honest uncertainty; see which reference sites it resembles and where they are; understand data provenance and limitations.

**Supporting:** site map and site list; frequency band isolation (genuinely educational when it's real filtering — it is, via Web Audio biquads); architecture explainer (portfolio).

**Incidental / implementation-history artifacts:**
- `/dashboard` hub page (a card grid that duplicates the navbar; animated counters SSR as "0 Reference Sites").
- Separate `/dashboard/analyze` (pre-"experience" analyzer kept alive after `/experience` reimplemented upload).
- `/dashboard/compare` (pre-experience A/B page; the Demo mode re-implements it with band filters but without dual spectrograms).
- `/sites` *and* `/dashboard/map` (prompt 049 added deck.gl map; Leaflet world map on `/sites` predates it).
- Background vitality canvas, caustics, particles, the decorative "living spectrogram" (milestone-driven, not need-driven).
- Toasts announcing UUIDs ("Uploaded: 3f2a…").
- `useAudioPlayback.ts`, `analysis-store.ts`, `WaveBackground`, `ScrollProgress`, `useAudioPlayer`, `useSpectrogram`, `useAnimateOnScroll`, `ProbabilityStackedBar`, `LoadingSpinner`, `GlassCard`, `wavesurfer.js` dependency, Streamlit `dashboard/` — dead code.

### 1.5 Screens that exist because of implementation history

| Screen | Origin | Why it persists | Disposition |
|---|---|---|---|
| `/dashboard` | Early "dashboard" IA (prompt 007 Streamlit → Next port) | Nav item | Retire; fold into landing |
| `/dashboard/analyze` | First analyzer | Has unique assets (preview spectrogram, mini-map, embedding chart) | Consolidate into one Analyze flow |
| `/dashboard/compare` | Synthetic-audio A/B demo, later swapped to real audio (TO-DOS) | Has unique dual spectrogram | Consolidate with Demo/Location Compare into one "Listen & Compare" |
| `/experience` (landing state) | "Living spectrogram" overhaul | Became the analyzer; then the gallery became the front door (prompt 054) and `/experience` became "Skip to analyzer" | Becomes the single Analyze route |
| `/sites` | Original site browser | Stats + list + Leaflet | Merge with map into one "Sites" explorer |

---

## 2. Information architecture

### 2.1 Route inventory

| Route | Shell | Purpose | Data | Notes |
|---|---|---|---|---|
| `/` | Navbar + Footer | Hero + sample gallery (3 stories + "More Samples") | `GET /samples` (+ hard-coded `FALLBACK_SAMPLES`) | Source of gallery not in git. Fixed idle "spectrogram" canvas at 8% opacity. Dev-only VitalityDebugPanel |
| `/experience` | **Immersive (no nav/footer)** via `ConditionalShell` | Reducer state machine: `landing → uploading(coord modal) → processing → results / error`, plus `demo`, `compare`, `sample` | `/upload`, `/analyze`, poll `/visualize/{id}` (direct `fetch`, hard-coded `API_BASE`, bypasses `lib/api.ts`), `/samples` | Read-once URL params `?sample=`, `?mode=demo|compare`; state changes never write back to URL, so Back button leaves the route entirely and nothing is linkable |
| `/dashboard` | Navbar | Hub cards + 3 animated counters (hard-coded 54/7/4) | none | Duplicate of navbar |
| `/dashboard/analyze` | Navbar | Upload → preview → optional coords → analyze → results (stepper, classification card, probability bars, region warnings, similar sites + MiniMap, embedding scatter, caveats) | `lib/api.ts` | Richer results than `/experience`; different components for the same data |
| `/dashboard/map` | Navbar | deck.gl/maplibre dark map, region fly-to, country/status filters, legend, popup | `GET /sites` | Overlapping legends (see 4.3) |
| `/dashboard/compare` | Navbar | A/B crossfader healthy vs degraded, dual waterfall spectrograms | `/audio/*.wav` | Not wired to vitality (contradicts PAGE-01 "complete") |
| `/sites` | Navbar | Stat cards, Leaflet/OSM light map, filters sidebar, site cards | `GET /sites` | Text says "5 countries" while data shows 7 |
| `/about` | Navbar | API health (polls every 30 s), what/how, architecture diagram, limitations, data sources, credits | `GET /health` | "Version: Unknown" (health returns no version) |

### 2.2 Navigation structure

- **Navbar** (`components/Navbar.tsx`): 7 peer items — Experience, Dashboard, Analyze, Map, Compare, Sites, About. Problems: "Experience" is jargon (it is the analyzer + two compare modes + sample player); "Dashboard" is a hub with no dashboard content; "Analyze" and "Experience" both analyze; "Map" and "Sites" both browse sites; "Compare" here is not the same as "Compare Locations" inside Experience. No "Listen/Samples" entry even though the gallery is the core hook (only reachable via logo). Active-state logic special-cases `/dashboard`. Mobile menu: no focus trap, no Escape-to-close, no `aria-expanded`/`aria-controls`.
- **ConditionalShell** hides Navbar and Footer for any path starting with `/experience`. Once inside, the only exits are per-state "Back"/"Gallery"/"Home" ghost buttons, which route to `/` (not to where the user came from). A user who arrives from `/dashboard/map` → Demo → "Back" lands on the gallery.
- **Footer**: one static tagline; no attribution, no dataset credits, no license, no version, no link to About/methodology. A dead `isDark` branch and an unused `pathname`.

### 2.3 Entities

| Entity | Source of truth | Where shown | Problems |
|---|---|---|---|
| Reference site | S3 `reference/metadata_v6.json` via `/sites`; **also** hard-coded `SITE_COORDINATES` (`types/index.ts:128-192`) | map, sites list, similar sites, mini-map, popup | Two sources drift: `SITE_COORDINATES` has `irma_*_pre/_post`, API has `irma_eastern_sambo` (→ no location on its SiteCard). Similar sites come from `reference/metadata.json` (classifier), list from `metadata_v6.json` (router) — can differ |
| Sample | `/samples` (S3 presigned URLs) + `FALLBACK_SAMPLES` | gallery, sample state | Not in git; includes non-reference site `phl_D1`; label mismatch `aus_R1` |
| Demo pair | `public/audio/{healthy,degraded}-reef.wav` | `/dashboard/compare`, Demo mode | Confounded, unlabeled provenance in UI except a one-line banner |
| Location compare clips | `public/audio/compare/manifest.json` | Location Compare | 14 of 16 files missing |
| Upload | DynamoDB `UPLOAD#` | toast only | Not user-visible otherwise |
| Analysis | DynamoDB `ANALYSIS#` (METADATA / PREPROCESSED / RESULT / ERROR) | results panels | No permalink; refresh loses it |
| Region | computed in classifier | region card / warnings | Bounding boxes; "in distribution" mislabeled (see §4) |
| Model | S3 `models/model_config.json` | nowhere | `model_version`, `classifier_version` returned by API but never rendered |

### 2.4 Filters, views, map/chart interactions

- **Map page filters** (`MapControls.tsx`): default = all checked; "Reset Filters" appears when any unchecked. Visual checkbox is a styled `<span>` beside an `sr-only` input → keyboard focus is invisible. No per-option counts. Region selector cannot re-fly to the same region (guarded by `lastFlyToIdRef`) — after panning away, choosing the same region again does nothing.
- **Sites page filters** (`SiteFilters.tsx`): default = *none* selected means all (opposite model to the map page). Search matches id/country/status. Counts per country. **Bug:** `sites/page.tsx:49` — when filters match zero sites, `displaySites` falls back to *all* sites, so the "No sites match your filters" empty state is unreachable and the "Clear filters" button resets the parent but not `SiteFilters`' internal state. Grid/List toggle renders a single button that is always "grid".
- **Filters are not shared** between `/sites` and `/dashboard/map`, and not in the URL.
- **Map interactions:** deck.gl click → popup; hover enlarges radius; pitch 30° tilt on a 2-D point layer (gratuitous); 21 Indonesian sites within ~2 km overlap completely below zoom ~13 — no clustering, no spiderfy, no list of overlapped sites; default view centered at lon 80 cuts off Mexico/Florida/Bora-Bora. Leaflet `/sites` map: click scrolls to and rings the card for 2 s; pulsing markers (not reduced-motion gated); light OSM tiles inside a dark UI.
- **Chart interactions:** EmbeddingChart tooltip shows raw `(x, y)` of a meaningless projection to 3 decimals. ProbabilityBars: none (animated 1 s grow). No hover/focus detail anywhere else.

### 2.5 Forms, uploads, analysis operations

- Two upload widgets: `/experience` dropzone is a `GlassPanel` `<div onClick>` with a hidden input — not keyboard reachable; `/dashboard/analyze` `FileUpload` overlays a transparent input (keyboard reachable, no visible focus).
- Client validation: `.wav` extension, `type` includes "audio", ≤50 MB, non-empty. Not validated client-side: duration ≥5 s, ≤600 s (server enforces `AUDIO_TOO_SHORT`/too long — user waits through upload first), sample rate, channels.
- Coordinates: `/experience` modal validates ranges with inline errors; `/dashboard/analyze` inline inputs have no labels (placeholders only), no range validation (latitude 200 is sent as-is and simply matches no region → treated as "Unknown Region", 0.7×), and supplying only one of lat/lon silently counts as "no coordinates". Neither explains that *skipping costs 30% confidence*.
- Analysis operation: upload (whole file as body through API Gateway) → `/analyze` → async preprocessor → classifier → inference container. Polling: `/experience` tolerates non-OK responses and retries; **`/dashboard/analyze` uses `api.pollAnalysis`, which throws on the first non-OK response — `/visualize/{id}` returns 404 until the preprocessor writes `PREPROCESSED`, and the first poll fires immediately, so this flow very likely fails with "No analysis found" on most runs.** (Router writes a METADATA record "to enable /status lookups immediately", but polling uses `/visualize`, which ignores METADATA.) Verify live before redesign; either way the redesign must poll `/status`.

### 2.6 Saved state, URL state, exports, configuration, admin

- **localStorage/sessionStorage:** none.
- **URL params:** `/experience?sample=<id>` and `?mode=demo|compare`, read once on mount; never written. No URL state for filters, selected site, region, crossfade, band toggles, analysis id.
- **Server state:** React Query for `/sites` (shared key `['sites']`, staleTime 60 s) and `/health` (30 s poll). `/samples` fetched ad hoc in the experience sample state (not cached with the gallery's fetch).
- **Exports:** none (no JSON/CSV/image/citation/share).
- **Configuration:** `NEXT_PUBLIC_API_URL` respected by `lib/api.ts` but **ignored** by `/experience` (hard-coded `API_BASE`).
- **Admin:** none. API health appears only on About.

### 2.7 Duplicate concepts, unnecessary mode changes, fragmented flows, unclear naming

| Concept | Instances | Divergence |
|---|---|---|
| Analyze my recording | `/experience` (state machine) vs `/dashboard/analyze` | Different upload widgets, coordinate UX, polling robustness, result components (ControlsPanel/ComparisonPanel vs AnalysisResults/ProbabilityBars/MiniMap/EmbeddingChart), caveat components |
| Compare healthy vs degraded | `/dashboard/compare` (AudioCompare, dual spectrograms, no band filters, no vitality) vs Experience Demo (band filters, single decorative canvas, loop, H/D buttons *and* crossfader) vs Location Compare (pairs per location, vitality) | Three implementations of one Web Audio graph (`AudioCompare.tsx`, `useDemoAudio.ts`, `useLocationAudio.ts`) + a fourth unused (`useAudioPlayback.ts`) |
| "Spectrogram" | `components/audio/SpectrogramCanvas` (real waterfall FFT) vs `components/spectrogram/SpectrogramCanvas` (decorative sine waves) | Same component name, opposite truthfulness |
| Site browsing | `/sites` (Leaflet, cards, search) vs `/dashboard/map` (deck.gl, popup, region fly-to) | Different basemaps, filter models, legends, detail depth |
| Maps of sites | deck.gl ReefMap, Leaflet WorldMap, Leaflet MiniMap | Three map renderers, two tile providers, three marker styles |
| Caveats | `CaveatsFooter` (experience, 5 items, text-dim) vs `CaveatsBanner` (dashboard, 5 different items, amber) vs per-result `caveats` string from API vs About "Limitations" | Contradict each other (see §4.8) |
| Status color tables | `STATUS_COLORS`, `STATUS_MARKER_COLORS`, `STATUS_COLORS_RGB`, `STATUS_DOT_COLORS`, `LEGEND_ITEMS`, `MapControls.STATUSES`, `WorldMap legendItems`, LocationCompare `STATUS_COLORS` (different values), CSS `--status-*` | 9 copies; one disagrees |
| Status labels | "Restored (Early)", "Early Restoration", "Restored Early", "N" (shorthand), "Restoration Site" (SiteCard type for `_N`), "Reference Site" (for `_R`) | Inconsistent; `_R` sites mislabeled as generic "Reference Site" |
| Hubs | `/` hero quick links vs `/dashboard` cards | Both are menus |

**Naming:** "Experience" (route + nav), "Health Similarity" (actually class probabilities), "Confidence" (actually max probability × heuristic multiplier), "Similarity %" (cosine × 100), "Acoustic Dimension 1/2" (half-vector means), "Analyze This" (plays audio), "Monitoring Network" (reference sites, not monitors), "Full data" vs "Location only" (has embedding or not), "Real-time processing" (async 10–120 s).

---

## 3. Workflows

### 3.1 Listen to samples

1. Land on `/` → hero → "Loading samples…" (SSR shows nothing else; gallery is client-only).
2. Story sections (The Sound of Health / Recovery in Sound / Reefs Around the World / More Samples) of horizontally laid `w-72` cards.
3. Press play on a card → HTML `<audio>` from presigned S3 URL; progress bar; one card plays at a time (parent `playingId`).
4. "Analyze This" → `/experience?sample=<id>` → immersive (navbar disappears) → card with badge, description, play button, highlight chips, "Upload Your Own", "Compare Healthy vs Degraded".

Friction:
- Same sample id appears in several stories (`idn_healthy_dawn` in 3); cards share `playingId`, so two cards show "Pause" while only one `Audio` element plays (each card owns its own element).
- "Analyze This" doesn't analyze; there are no precomputed results (prompt 054 Phase 5 never wired). The sample state re-fetches `/samples` instead of using what the gallery already loaded.
- The badge on a sample shows the **reference label**, styled identically to a **model prediction** badge → visitors can't tell "this is what the dataset says" from "this is what the AI says".
- No spectrogram of the sample being played; no link to its site on the map; no attribution per sample; presigned URL expiry (~1 h) can break a long-open tab with no retry.
- "Recovery in Sound" mixes Australia and Indonesia — not a recovery sequence.

### 3.2 Compare healthy vs degraded

Three entry points:
- **`/dashboard/compare`:** press play (first press only loads; auto-starts when ready) → crossfader → two waterfall spectrograms. Degraded spectrogram is **blank** at crossfade 0 because its analyser is *after* its gain node (gain 0) — the spectrograms show the *mix weight*, not the recordings. Different palettes ("ocean" ochre vs "thermal" rose) for the two panels make side-by-side comparison of intensity invalid. Axis labels go to 16 k on 16 kHz files (content stops at 8 kHz; the top of the log axis is empty by construction). Plays once (15 s) then stops. Crossfader description text invents graded soundscapes ("Mixed soundscape -- some biophony, some silence") for what is a linear mix of two clips.
- **Experience Demo:** looped; H/D buttons duplicate the crossfader; band toggles really filter (biquads 800 Hz LP / 2 kHz BP Q1.5 / 3.5 kHz HP — good); background canvas is decorative (does not reflect crossfade; Demo doesn't set vitality at all).
- **Experience Location Compare:** auto-selects Indonesia → fetch 404 → `loadState='error'` with no message; play button stays enabled. Only Australia works, and only for H/D.

Friction: three UIs, none shows level (dB/RMS) or a fair comparison; no indication of time-of-day / country confound; no "play exemplar from same site"; no restored states with real audio.

### 3.3 Analyze my recording

Via `/experience`: drop WAV → coordinate modal (Skip / Analyze / Cancel) → upload (whole file in browser memory, no progress) → processing overlay with **scripted** messages ("Measuring fish chorus density…", "Comparing to 44 reference sites…") that do not reflect pipeline state (real stages available at `/status/{id}`) → results: verdict + confidence, "Health Similarity" bars, region card, top-3 similar sites by raw `site_id`, caveat paragraph, "View on Map" (doesn't focus the similar sites), "Compare with Demo Reefs" (goes to the fixed demo, not a comparison with *your* audio). **No playback of your own recording, no spectrogram of it, no per-segment view, no duration/segment count** (`embedding_summary.num_segments` is returned but unused). Refresh = lost.

Via `/dashboard/analyze`: richer (preview spectrogram of your audio before upload, stepper, hero card, sorted probability bars, duplicated region warnings, mini-map, scatter) but likely fails at first poll (§2.5). Toasts expose UUIDs. Fake progress % (attempt count / 60).

Friction common to both: skipping coordinates silently penalizes; OOD warnings phrased as definitive; no explanation of what "confidence" is; similar-site "92%" with no scale; errors show `message` but drop `suggestion`/`stage`/`request_id` the API returns.

### 3.4 Explore sites

`/dashboard/map`: wait for `/sites` → deck.gl map, filters panel top-right (200 px fixed, collapsible on mobile), **two legends stacked in the same bottom-left corner** (HealthLegend `bottom:24px,left:16px` in page; embedding legend `bottom:16px,left:16px` inside map) → overlap. Popup shows id/status/coords/location. No audio, no "analyze similar", no link to site card, no provenance/source dataset, no restoration age.

`/sites`: stat cards (Total / Healthy / Degraded / Restored — Unknown(4) omitted, so cards sum to 50 not 54) → Leaflet map → filter sidebar → 2-col cards with "More details" (site type guessed from id substring; generic status description; Google Maps link). Footer says data is MARRS-only across 5 countries — wrong for 9 of 54 sites.

### 3.5 Learn methodology

`/about`: well-intended and the most honest page, but: no model card (training n, sites, countries, test n, calibration); "Caribbean/Atlantic reefs … not validated" while Mexico (Caribbean) is called in-distribution and Florida Keys sites are references; MARRS described as "45 sites across Indo-Pacific" (includes Caribbean Mexico); API status shows "Checking…" forever on error (no error state) and "Version: Unknown"; "Last checked" prints render time. Dataset citations disagree across the repo: MARRS authors "Williams et al." (AudioCompare, ATTRIBUTION) vs "Sherwen, K." (SCIENTIFIC_VALIDITY); MARRS expansion "Mars Assisted Reef Restoration System" vs "Monitoring And Restoration of Reef Soundscapes"; Irma DOI `10.5061/dryad.5tb2rbp38` (About) vs `10.5061/dryad.sxksn0319` (prompt 049) vs Zenodo 4396323 (TO-DOS).

---

## 4. Data communication audit

Legend for verdicts: **OK** = honest and fit for purpose; **FIX** = right idea, wrong execution; **WRONG** = misleading; **DECOR** = decoration presented as data.

### 4.1 Classification verdict + confidence

| Element | Location | Question answered | Verdict | Detail |
|---|---|---|---|---|
| Label ("Healthy") large, status-colored | `ControlsPanel.tsx:51-56`, `AnalysisResults.tsx:49-68` | "What is my reef?" | **WRONG framing** | Presented as a diagnosis. Should read "Most similar to: Healthy reference soundscapes (Indonesia/Kenya-trained)" |
| "87.3% confidence" | same | "How sure?" | **WRONG** | It is `max(softmax) × {1.0, 0.7, 0.6}`. Not calibrated (calibration table in MODEL_EVALUATION has 2–3 samples per bin out of 10). Multiplier is arbitrary. One decimal place implies precision the 10-sample test cannot support |
| Status-colored hero background with white text | `AnalysisResults.tsx:50-52` | — | **FIX** | White on ochre = 2.99:1 (fails AA); healthy = brand color = CTA color, so "healthy" looks like "success/primary" |

### 4.2 Probability bars

| Element | Location | Verdict | Detail |
|---|---|---|---|
| "Health Similarity" bars (fixed order) | `ComparisonPanel.tsx:31-60` | **WRONG** | Titled "similarity", are class probabilities; after OOD multiplier sum to 60–70%; `restored_mid` rendered even if the model is 3-class (shows 0.0% via `?? 0`, implying the model judged it); one-decimal precision |
| "Probability Distribution" animated bars (sorted desc) | `ProbabilityBars.tsx` via `AnalysisResults.tsx:109` | **WRONG** | Same data, different order than ComparisonPanel; 1 s grow animation not reduced-motion gated; colors CVD-unsafe; no reference line for chance (25%/33%) |
| Right form? | — | — | A bar list is fine for 3–4 classes *if* values are true probabilities, the residual "unadjusted/OOD" is shown explicitly (or OOD is shown as a separate flag rather than scaling), and precision is integers. Consider a single stacked bar with labels on segments plus an explicit "low-confidence" state |

### 4.3 Maps, legends, markers, popups

| Element | Location | Verdict | Detail |
|---|---|---|---|
| deck.gl status points + glow | `ReefMap.tsx` | **FIX** | Glow radius 2 km ≈ whole Indonesian cluster → visual mass encodes site density, not anything measured; 21 overlapping sites unreadable; degraded gray `#6b6560` on dark-matter basemap is low contrast; 30° pitch adds distortion with no benefit |
| Location-only (no embedding) ring style | `ReefMap.tsx:331-395` | **OK idea** | Good distinction; legend for it collides with HealthLegend (same corner) |
| HealthLegend | `HealthLegend.tsx` | **FIX** | Static list incl. "Unknown" regardless of filters; no counts; colors duplicated in code |
| Leaflet WorldMap legend with counts | `WorldMap.tsx:56-93` | **OK** | Counts are good; hides zero categories; omits "Unknown" entirely while markers for unknown sites still render |
| SitePopup | `SitePopup.tsx` | **FIX** | Shows raw id, coords to 4 dp (~11 m — implies precision of a site centroid that isn't documented); no source dataset, no audio, no definitions; country fallback logic is dead code |
| MiniMap of similar sites | `MiniMap.tsx` via `AnalysisResults` | **WRONG emphasis** | Places *acoustic* neighbors on a *geographic* map as if location mattered; "Geographic location of similar reference sites" invites the inference "my reef is like the Indonesian one because it's near"; with top-3 often all in one Sulawesi cluster, it shows a single blob |
| Region fly-to | `MapControls`/`regions.ts` | **OK** | Respects reduced motion (good). Can't re-select same region |

### 4.4 Embedding scatter ("Acoustic Embedding Space")

`EmbeddingChart.tsx` ← `visualization` from `classifier/handler.py:generate_visualization`.

- **Computation:** x = `mean(embedding[0:640])`, y = `mean(embedding[640:1280])`. For reference points: same, for `reference_data[:10]` only (metadata order — the first ten entries, almost certainly all Indonesian D/H sites).
- **Meaning:** none. Two embeddings with cosine similarity ~0 can plot at the same point; the two "dimensions" are near-constant scalar summaries dominated by embedding norm/offset. Axis labels "Acoustic Dimension 1/2" and subtitle "how your audio sample compares to reference sites" are false.
- **Encoding:** your sample's star is colored by the *predicted* label — so the chart restates the prediction as if it were evidence.
- **Verdict: WRONG. Retire** or **replace** with a PCA (or fixed UMAP) fitted offline on all reference embeddings, with explained-variance in the axis labels, all 44–48 sites plotted, and the star colored neutrally. A nearest-neighbor list with a similarity *distribution* is likely more useful than any 2-D map.

### 4.5 Similar sites / similarity %

| Element | Verdict | Detail |
|---|---|---|
| Top-3 list, raw `site_id` (e.g. `ind_H4`) | **FIX** | IDs are not human names; no link to site; status shown is reference label (fine) |
| "92.4% similarity" | **WRONG scale** | Cosine × 100. SurfPerch embeddings typically sit at high cosine similarity to each other, so every site may read 85–99% — the number has no reference distribution. Show rank and relative distance, or percentile among all references |
| "+ N more sites" | dead | Classifier returns `top_k=3`; UI slices to 5 and shows "more" when > 5 → never renders |
| "Best Match" badge + check icon | **FIX** | Check mark reads as "verified/correct" |

### 4.6 Region detection & OOD

| Element | Verdict | Detail |
|---|---|---|
| Region card (ComparisonPanel) | **WRONG** | "Within training distribution — full confidence" for GBR/Maldives/Mexico, where the classifier has zero training clips |
| RegionWarning banner | **WRONG text** | Hard-codes "reduced by 40%" (unknown region uses 30%); names "Unknown (UNKNOWN)" as a "detected region"; says trained "primarily on Indo-Pacific … and Mexico" (Mexico is Caribbean; and training was Indonesia+Kenya only) |
| Duplicate inline "Geographic Limitation" + "Confidence adjusted" chip | **FIX** | Same message twice on `/dashboard/analyze` |
| Bounding boxes | **FIX** | Rectangles (Caribbean box -100..-55 includes Gulf of Mexico/Pacific coast of Central America; Mesoamerican box wins by area). Fine as a heuristic if presented as heuristic |
| What should be shown | — | Three separate facts: (1) where the recording is (or "not provided"), (2) how much training data exists *from that region* (count of training clips/sites), (3) raw model probabilities. Do not fold (2) into (3) by multiplication |

### 4.7 Audio visualizations

| Element | Location | Verdict | Detail |
|---|---|---|---|
| Waterfall spectrogram | `components/audio/SpectrogramCanvas.tsx` | **FIX** | Real FFT (good). No time axis, no dB colorbar, log-frequency axis to context Nyquist (22–24 kHz) on 16 kHz content, nearest-bin sampling (aliasing at low freqs), `getImageData` + `putImageData` every frame (CPU heavy), palette names lie ("ocean" is ochre), two different palettes for A/B |
| Band annotation overlay | `FrequencyBandLabels.tsx` | **FIX** | Hard-coded bands overlap ("Boat noise 0–500 Hz" vs "Fish 50–1000 Hz"); shrimp band drawn to 16 kHz where there's no data; only on healthy panel |
| Band definitions | four different definitions: `FrequencyBands.ts` (<800/800–3500/>3500), audio filters (800 LP/2 k BP/3.5 k HP), `useAudioVisualBridge` (ambient <200, fish 200–2 k, grazing 1–4 k, shrimp 2–20 k), `FrequencyBandLabels` (0–500, 50–1 k, 2–16 k), sample chips ("2–20 kHz") | **WRONG (inconsistent)** | One canonical band table needed, with Nyquist-aware upper bounds and a citation |
| "Living spectrogram" | `components/spectrogram/*` | **DECOR presented as data** | Sine waves with preset amplitudes in idle; in playing mode, amplitudes from FFT bins 0–50/50–200/200–500 (≈0–1.2 k, 1.2–4.7 k, 4.7–11.7 kHz at 48 kHz context) that don't match labels; Demo copy says "The spectrogram in the background visualizes amplitude across the three frequency ranges in real time." Rename to ambient visual or make it truthful |
| Crossfader description | `ABCrossfader.tsx:getDescription` | **WRONG** | Fabricated intermediate states for a linear mix |
| Processing overlay messages | `ProcessingOverlay.tsx` | **WRONG** | Scripted claims ("Measuring fish chorus density", "Identifying snapping shrimp patterns") the pipeline does not perform; "44 reference sites" stale |

### 4.8 Numbers, counts, units, caveats

| Item | Where | Issue |
|---|---|---|
| "54 sites / 7 countries / 4 classes" | `/dashboard` counters (hard-coded, SSR "0"), landing link, About | Hard-coded; 4 classes may be false; 54 includes 6 location-only and 4 `unknown`-status sites |
| "Comparing to 44 reference sites" | ProcessingOverlay | Disagrees with 48 `has_embedding` in `/sites` |
| "Reference sites span 5 countries" | `/sites` | Stale (7) |
| Restored stat card = early+mid | `/sites` | Merges two classes; omits Unknown so cards don't sum to total |
| "Restored site (32–53 months)" / "<3 months" | SiteCard | Valuable context — but appears only inside a collapsed card; contradicted by sample "Two years into restoration" |
| "Real-time processing" | Analyze Quick Facts | False |
| "Minimum duration: 5 seconds" | Analyze Requirements | True; maximum (10 min) not mentioned |
| `{duration_seconds} seconds` | sample state | OK |
| Coordinates to 4 dp | popup/cards | Precision not justified; no datum note |
| Caveats | 4 sources | `CaveatsFooter` says model trained on "Indo-Pacific reefs (Indonesia, Australia, Kenya, Maldives, Mexico)"; `CaveatsBanner` adds "Results for Caribbean … reduced confidence" (Mexico is Caribbean); About says Caribbean "not validated"; API caveat says MARRS regions are training regions. None says "classifier trained on 100 clips from 5 sites in Indonesia and Kenya" |

### 4.9 Badges, tooltips, chips

- Status badges: four warm hues + text label (good that text is present); on SampleCard the degraded badge is `#6b6560` text on near-black (3.1:1, fails AA for 10 px uppercase).
- Frequency-highlight chips: unverified editorial content presented in a data-chip style.
- ArchitectureDiagram tooltips: hover-only (check keyboard reachability); include "~90% test accuracy" and "→4" claims.
- Toasts: expose internal UUIDs; success toasts for intermediate steps are noise.

### 4.10 Empty / loading / error states

| State | Where | Assessment |
|---|---|---|
| Sites loading | map page `LoadingReef`, sites skeletons | OK |
| Sites error | map (generic text), sites (message + retry) | OK-ish; map has no retry. Router silently returns a 4-site fallback on S3 failure with `error_note` that UI never shows → users would see "4 sites" as truth |
| Samples loading | "Loading samples..." text | OK; fallback samples silently substituted on failure (no indication; their `audio_url` may be absent → cards without play) |
| Location audio error | none | **Missing** — silent |
| Demo audio error | `loadState='error'` not rendered in DemoState | **Missing** |
| Analysis error | `/experience` ErrorState (message only); analyze stepper (message) | `suggestion`, `stage`, `request_id` dropped |
| Health error | About shows "Checking…" forever | **Wrong** |
| WebGL unsupported / deck error | ReefMap fallbacks | Good |
| Web Audio unsupported | AudioCompare, analyze preview | Good |
| Empty filter result | `/sites` | Unreachable due to bug |
| Counters pre-hydration | `/dashboard` SSR "0 Reference Sites" | Misleading in previews/screenshots/no-JS |

### 4.11 Uncertainty indicators — summary

Present: textual caveats; OOD flag; "confidence adjusted" chip. Absent: calibrated probabilities or abstention; test-set size; per-segment agreement (e.g., "7 of 9 segments most similar to healthy"); similarity distribution; training-coverage indicator per region; disclosure of the demo pair's confounds; data freshness/version. The API already returns `embedding_summary.num_segments` and `model_version`; neither is shown.

### 4.12 Traceability to source

No number in the UI links to its source. Site status labels don't say who assigned them (MARRS researchers vs. CoralSoundExplorer "tourist/boat_traffic" disturbance types mapped to "degraded" vs. SanctSound "unknown"). The status taxonomy is overloaded across datasets: Bora-Bora "tourist" and "boat_traffic" are *disturbance* conditions, shown as "Degraded" reef health. Attribution for audio appears only on `/dashboard/compare` and About; the gallery (primary audio surface) has none.

### 4.13 Color-vision safety and color semantics

- Status palette is four low-chroma warm hues with poor luminance separation (healthy/restored_mid 1.06:1; degraded/restored_early 1.28:1). Under deuteranopia/protanopia, ochre and dusty rose converge further. Shape/position redundancy exists only where text labels accompany color (bars, badges); maps and the scatter rely on color alone.
- Semantic collisions: ochre = healthy = brand = primary CTA = focus ring; dusty rose = degraded (compare/demo/location) = restored_mid (everywhere else) = error text color (FileUpload, map error).
- Vitality palette (teal/magenta healthy, brown degraded) is a *third* scheme that contradicts the status palette (healthy is ochre in badges but teal in particles).
- Recommendation: one ordinal palette for the 4-class health scale (degraded → restored_early → restored_mid → healthy is ordinal), CVD-validated, with a distinct neutral for unknown and a non-status brand accent.

### 4.14 Responsive legibility

- `/dashboard/compare`: `grid-cols-2` spectrograms at all widths → ~150 px panels on phones with overlapping 9–10 px labels.
- Map controls fixed 200 px over a 600 px map on mobile; legends overlap.
- 10 px uppercase badges/chips (`text-[10px]`) throughout gallery and sample state.
- Gallery cards fixed `w-72` (check horizontal overflow on 360 px).
- Experience results stack fine (`lg:flex-row`).

### 4.15 The vitality aesthetic: data or decoration?

**Decoration.** Inputs to vitality are: (a) the reference label of a sample (`ML_TO_VITALITY[sample.category]`), (b) the predicted label (not probabilities, not confidence), (c) crossfader position between two clips, (d) per-band RMS of whatever is playing (only for burst particles, and only in Demo where the bridge is wired). It never encodes the model's uncertainty, the OOD status, similarity, or any site attribute. A 51% "healthy" prediction outside the training region produces the same full-teal "thriving" atmosphere as a 99% in-region one. The stagger thresholds ("shrimp first → fish → complex behaviors") are presented as biology but are arbitrary constants on a label-derived scalar. And in practice it is barely visible (§0 item 10).

Keep the *idea* (sound-reactive ambience is a legitimate hook) but: drive it only from measured audio energy of what is actually playing, never from labels; never from ground truth presented next to a prediction; and gate it from any surface that displays numbers.

---

## 5. Visual & interaction design critique

### 5.1 Hierarchy & density
- Landing: strong — one sentence, three text links, then content. The text links are 12 px muted gray and are the only path to the map/about from the hero.
- Experience states: consistent two-panel layout, but every state reinvents its header (Back/Gallery/Home/New Analysis buttons route inconsistently).
- Dashboard pages: generic "centered H1 + subtitle + glass cards" template repeated; `/dashboard/analyze` right rail ("How it works", gradient "Quick Facts", "Requirements") competes with results and repeats About.
- Density is low on desktop (results occupy a narrow column; 7xl containers with 2/3 width used) and high on mobile overlays (map).

### 5.2 Typography
- Inter + JetBrains Mono (good). `.mono` used as section labels ("Classification", "Playback"). Very small type is common (`text-[10px]`, `text-xs` at `--text-dim`). Hero `hero-text` only on landing; elsewhere `text-4xl font-bold` — two typographic voices (immersive light-weight vs dashboard bold).

### 5.3 Color system: Golden Hour vs bioluminescent
- Golden Hour (ochre, dusty rose, pale gold, muted tan on charcoal) is the brand **and** is defined as the "degraded" state. The site's resting appearance therefore means "degraded" in the system's own semantics.
- Bioluminescent palette exists only in the background canvas (occluded) and one slider thumb.
- Ad-hoc inline hex values everywhere (`#cd853f`, `rgba(205,133,63,…)`) bypass tokens; 9 status color tables.
- Amber (`#b8860b`, `amber-*` Tailwind) used for warnings — the only non-warm signal is still warm; warning vs healthy vs brand are hard to distinguish.

### 5.4 Motion
- Framer-motion page transitions in Experience (scale/slide), animated bar growth, animated counters, pulsing markers and slider thumb, spinning rings, background particles/caustics, decorative spectrogram particles, global `* { transition: … 150ms }` on every element.
- Reduced motion: honored by `useBackgroundCanvas` (stops), `useVitality` (no lerp), map fly-to. **Not honored** by the decorative SpectrogramCanvas (always animating on `/` and `/experience`), Framer transitions (no `MotionConfig reducedMotion`), ProbabilityBars, AnimatedCounter, marker pulse, thumb pulse, spinner. No global `@media (prefers-reduced-motion)` rule.

### 5.5 Glassmorphism
- `backdrop-filter: blur(16px)` on most panels over a mostly flat dark background — cost without visible benefit (nothing behind to blur except the occluded canvas). Glass borders at 10% alpha give weak panel separation; low-contrast secondary text on glass compounds legibility issues.

### 5.6 Accessibility
- **Keyboard:** Experience dropzone is a clickable `div` (not focusable); map filter checkboxes are `sr-only` with no visible focus on the styled proxy; deck.gl map points are mouse-only (no list alternative on that page); Leaflet markers partially keyboard-accessible; mobile menu no Esc/focus management; coordinate modal is not a dialog (no `role="dialog"`, no focus trap, no Esc) despite being full-screen fixed.
- **Semantics:** band toggles and H/D/state selectors are buttons without `aria-pressed`; crossfader ranges in Demo/LocationCompare have no accessible name (`ABCrossfader` does); progress bars are divs without `role="progressbar"`; charts have no text alternative; status conveyed by color dot in similar-sites list (text present — OK).
- **Contrast:** `--text-dim` 1.89:1, `--text-muted` 3.11:1 on background — both used for meaningful text (caveats, coordinates, durations, legends). White on ochre 2.99:1 (hero card, Best Match chip, analyze button `bg-ochre text-white`).
- **Audio:** no transcripts/descriptions of what each clip contains beyond editorial blurbs; autoplay not used (good).
- **Focus:** global `:focus-visible` ochre outline (good) but ochre on ochre-tinted buttons is weak.

### 5.7 Responsive behavior
- Navbar collapses at `md`. Experience panels stack. Map overlays crowd at < 768 px. Compare spectrogram grid not responsive. Mobile gating of particles/caustics exists, but the decorative spectrogram and vitality loop still run.

---

## 6. Performance observations (from code)

| Concern | Evidence | Impact |
|---|---|---|
| Always-on rAF loops on every route | `useVitality` (Providers, never stops, writes 8 CSS vars at 30 fps → style recalcs app-wide), `useBackgroundCanvas` (60 fps, 150–200 pooled particles + 3-layer caustics, even when occluded), decorative `SpectrogramCanvas` on `/` and `/experience` (40–80 particles, `createRadialGradient` per particle per frame, 3 bands × 2 strokes) | Continuous CPU/GPU/battery drain while idle; three concurrent loops on landing |
| Global transition rule | `globals.css: * { transition-property: …; 150ms }` | Every CSS var write can trigger transitions on every element |
| Waterfall spectrogram | `getImageData` full canvas + `putImageData` shift every frame, ×2 on compare | Expensive readbacks; prefer `drawImage(canvas, -1, 0)` |
| Spectrogram re-init | `useSpectrogramAnimation` effect depends on `activeBands` Set identity → every band toggle tears down and rebuilds the canvas loop & ResizeObserver | Stutter on toggle |
| Bundle | deck.gl ×3 + maplibre + leaflet/react-leaflet + recharts + framer-motion + sonner + unused wavesurfer.js | Heavy; maps are dynamically imported (good), framer/recharts are not on all routes |
| Audio decode | Demo/compare decode both WAVs fully into memory (fine at 0.5 MB); upload reads whole file (≤50 MB) into an ArrayBuffer and sends it through API Gateway (payload limits; base64 inflation) | Large uploads may fail at the gateway rather than at validation |
| Polling | 2 s fixed interval, 60 attempts, no backoff; `/visualize` hit instead of the lighter `/status` | Fine at demo scale |
| Health polling | About polls `/health` every 30 s while open | Negligible but pointless for users |
| Multiple AudioContexts | Each compare/demo/location/preview hook creates its own; closed on unmount (good) | OK |

---

## 7. Repo ↔ live discrepancies (verified 2026-09-30)

| # | Discrepancy | Evidence |
|---|---|---|
| 1 | Gallery + samples lib not in git; deployed bundle contains them | `git ls-files`; live `app/page-*.js` contains story titles and `getSamples` |
| 2 | `GET /samples` live, not in `lambdas/router/handler.py` | live 200; route table lines 43-63 |
| 3 | Location Compare files missing (14/16) | live 404 for `ind/healthy.wav`, `mex/healthy.wav`, `aus/restored_mid.wav` |
| 4 | `/samples` contains `phl_D1` (Philippines) — not in `/sites` | live JSON |
| 5 | `aus_R1` = `restored_early` (samples) vs `restored_mid` (sites) | live JSON |
| 6 | `sites_with_embeddings: 44` vs 48 `has_embedding: true` | live `/sites` |
| 7 | `/health` has no `version` → About "Version: Unknown" | live `/health` |
| 8 | Irma pre/post keys in `SITE_COORDINATES` vs single records in API | `types/index.ts:184-187` vs live |
| 9 | Model: docs 3-class vs README/About/diagram 4-class; retrain script uses synthetic audio | `docs/MODEL_EVALUATION.md`, `scripts/add_restored_mid_and_retrain.py:144-176` — **verify `s3://reefradar-2477-embeddings/models/model_config.json`** |
| 10 | Vitality requirement PAGE-01 ("compare page crossfader drives vitality") marked complete; `/dashboard/compare` has no vitality wiring | `AudioCompare.tsx` |
| 11 | PAGE-04 gallery glow later removed (`d8302eb`) | git |
| 12 | Gallery sample audio is 32 kHz WAV; MARRS source is 16 kHz — likely upsampled, so "2–20 kHz" / "3–15 kHz" chips describe content that probably isn't there | WAV headers of all 8 samples |

---

## 8. Redesign implications (not a plan — constraints the plan must honor)

1. **Truth before beauty:** retire the fake scatter and the decorative "spectrogram" naming; stop multiplying probabilities; resolve the model-class question; replace scripted processing messages with `/status` stages; disclose training coverage in-product.
2. **One of each:** one Analyze flow (with result permalink `/analysis/[id]`), one Listen/Compare surface (with real per-location pairs), one Sites explorer (one map engine, list + map + detail), one caveat/model-card source rendered in context.
3. **Make the strong question visible:** paired same-location comparison (South Sulawesi H/D/N/R) is the dataset's best story — build the restoration narrative on it, not on cross-country cherry-picks.
4. **Every number gets a source and a scale:** similarity with distribution context; counts from the API not constants; provenance chips (dataset, DOI, license) on sites and samples.
5. **Ambience is opt-in garnish:** sound-reactive visuals driven by measured audio only, off by default on data surfaces, fully reduced-motion gated, no always-on loops.
6. **Fix the build and the content pipeline first:** commit the gallery, reconcile `/samples` and router source, remove/flag non-reference samples, fix labels.
