# ReefRadar — Capability Matrix (Anti-Regression Preservation Contract)

**Date:** 2026-09-30 · **Branch:** `redesign/v2-discovery` · **Companion:** `PRODUCT-AUDIT.md`

**How to use this document.** Every row is a capability a user (or the demo) can exercise today. A redesign may change *where* and *how* a capability lives, but a row may only disappear if its Disposition is `retire` with a written justification below. Before any redesign phase is marked complete, walk this table and confirm every `preserve / redesign / consolidate / expand / replace` row has a home in the new IA.

**Disposition vocabulary**
- **preserve** — keep behavior; restyle only.
- **redesign** — keep the user need, change interaction/presentation materially.
- **consolidate** — merge with duplicate(s) listed in Notes into one implementation.
- **expand** — keep and extend with data the backend already has.
- **replace** — the current implementation is misleading/broken; meet the need a different way.
- **retire** — remove; justification required.

**Essential?** Y = core to the product's purpose; N = incidental; ? = depends on product decision.

---

## A. Shell, navigation, platform

| ID | Capability | What it does | Current location | User need served | Essential? | Interaction quality | Disposition | Notes |
|---|---|---|---|---|---|---|---|---|
| CAP-01 | Global navigation | 7 peer links (Experience, Dashboard, Analyze, Map, Compare, Sites, About), active state | `components/Navbar.tsx` | Wayfinding | Y | poor — duplicate/jargon labels, no "Listen" entry, `/dashboard` special-cased | redesign | Target ~4 items: Listen, Analyze, Sites, About (+ Methods). Keep PERF-06 fixed-contrast rule |
| CAP-02 | Mobile menu | Hamburger toggles dropdown, closes on navigate | `Navbar.tsx:104-155` | Wayfinding on phones | Y | ok — no Esc, no focus mgmt, no `aria-expanded` | preserve | Add dialog semantics |
| CAP-03 | Immersive mode | Hides navbar/footer for `/experience*` | `components/layout/ConditionalShell.tsx` | Focus during listening/analysis | ? | poor — traps users; exits always go to `/` | redesign | Keep a minimal persistent header with a real back path |
| CAP-04 | Footer | Static tagline | `components/layout/Footer.tsx` | Identity | N | poor — no credits/license/version | expand | Put dataset attribution, license, model/data version, methods link here |
| CAP-05 | Dashboard hub | Card grid to 4 tools + animated 54/7/4 counters | `app/dashboard/page.tsx` | Orientation | N | poor — duplicates nav; counters hard-coded and SSR as "0" | retire | Justification: pure menu duplicating navbar + landing; counters move to landing fed from `/sites` |
| CAP-06 | Landing hero + quick links | Title, one-line pitch, links to analyzer/map/about | `app/page.tsx` | First impression, routing | Y | ok — links are 12 px muted | redesign | Keep "hear audio within 5 s" principle from prompt 054 |
| CAP-07 | Deep-link params | `/experience?sample=<id>`, `?mode=demo|compare` read once | `app/experience/page.tsx:81-92` | Linking into a state | Y | poor — read-only, never written, Back leaves route | expand | Make all view state URL-addressable (sample, mode, location pair, analysis id, filters) |
| CAP-08 | Server-state caching | React Query `['sites']` shared, 60 s stale; `/health` 30 s poll | `app/providers.tsx`, pages | Fast nav, consistent site data | Y | good | preserve | Also cache `/samples` once (currently fetched twice) |
| CAP-09 | API base config | `NEXT_PUBLIC_API_URL` in `lib/api.ts` | `lib/api.ts:12` | Env switching | Y | poor — `/experience` hard-codes `API_BASE` | consolidate | Single API client for all flows |
| CAP-10 | Security headers | nosniff, DENY framing, referrer policy | `vercel.json` | Safety | Y | good | preserve | |
| CAP-11 | SEO / OpenGraph metadata | Title, description, OG | `app/layout.tsx` | Shareability | Y | ok — no OG image, no per-route titles | expand | Per-route metadata, OG image for result permalinks |
| CAP-12 | Toast notifications | sonner toasts for upload/analyze milestones | `components/Toast.tsx`, `dashboard/analyze/page.tsx` | Feedback | N | poor — leaks UUIDs, noisy | redesign | Use inline status; toasts only for background events |

## B. Listen (samples, demo, compare)

| ID | Capability | What it does | Current location | User need served | Essential? | Interaction quality | Disposition | Notes |
|---|---|---|---|---|---|---|---|---|
| CAP-13 | Sample gallery (stories) | 3 story sections + "More Samples" of curated clips from `/samples` | `components/gallery/SampleGallery.tsx` (**uncommitted**), `app/page.tsx` | Hear real reef audio immediately | Y | ok — strong hook; content issues | redesign | Must commit source first. Fix `phl_D1` provenance, `aus_R1` label, editorial species claims; rebuild "Recovery in Sound" from one location |
| CAP-14 | Fallback samples | Hard-coded sample list used if `/samples` fails | `lib/samples.ts` (**uncommitted**) | Resilience | Y | ok — silent substitution, may lack audio | preserve | Show a "offline copy" indicator; ensure fallback has playable audio |
| CAP-15 | Inline sample playback | Play/pause, progress bar, one-at-a-time coordination | `components/gallery/SampleCard.tsx` | Listen without leaving page | Y | ok — duplicate ids across stories show two "playing" cards; no keyboard seek | preserve | Key coordination by card instance, not sample id; add seek & time |
| CAP-16 | Sample metadata display | Category badge, country, name, description, duration | `SampleCard.tsx`, `experience/page.tsx:656-697` | Context for what you hear | Y | poor — reference label styled like a model prediction | redesign | Label as "Reference status (MARRS)" distinct from prediction styling |
| CAP-17 | Frequency highlight chips | Per-sample editorial band tags | `SampleCard.tsx:110-120` | Know what to listen for | N | poor — unverified, Nyquist-inconsistent | replace | Replace with measured band-energy summary from the clip, or clearly mark as editorial |
| CAP-18 | "Analyze This" | Opens sample in Experience | `SampleCard.tsx:123-129` → `SamplePlaybackState` | See ML result on a sample without uploading (prompt 054 success criterion) | Y | poor — plays audio only; no analysis | replace | Serve precomputed results per sample (prompt 054 Phase 5) and show them with the same result view as uploads |
| CAP-19 | Sample playback state | Single-sample card with badge, play, chips, CTAs | `experience/page.tsx:527-733` | Focused listening | ? | ok | consolidate | Merge into a sample detail view / result view |
| CAP-20 | A/B crossfader (fixed pair) | Equal-power crossfade healthy↔degraded | `components/audio/AudioCompare.tsx`, `ABCrossfader.tsx` (`/dashboard/compare`) | Hear contrast | Y | ok — plays once, no loop | consolidate | With CAP-22/CAP-24 into one compare engine |
| CAP-21 | Dual live waterfall spectrograms | Real FFT waterfall for each side | `components/audio/SpectrogramCanvas.tsx` | See contrast | Y | poor — analyser post-gain (silent side blank), mismatched palettes, no time/dB axes, axis to 16–24 kHz on 16 kHz audio | redesign | Pre-gain analysers, one palette with colorbar, Nyquist-aware axis, time axis; or precomputed static spectrograms |
| CAP-22 | Experience Demo mode | Looped healthy/degraded pair, H/D buttons + crossfade, band filters | `components/experience/DemoState.tsx`, `useDemoAudio.ts` | Hear contrast with isolation | Y | ok — redundant controls; load error not shown | consolidate | Keep loop & band filters; drop duplicate H/D buttons |
| CAP-23 | Frequency band toggles (real filtering) | Web Audio biquads: LP 800 Hz / BP 2 kHz Q1.5 / HP 3.5 kHz with click-free gain | `useDemoAudio.ts`, `useLocationAudio.ts`, `DemoState.tsx`, `LocationCompare.tsx` | Isolate fish / grazing / shrimp | Y | good audio, ok UI — no `aria-pressed`, labels disagree with other band tables | preserve | Adopt one canonical band table; expose on every playback surface incl. samples and uploads |
| CAP-24 | Location Compare | Pick location, pick 2 of 4 health states, crossfade | `LocationCompare.tsx`, `useLocationAudio.ts`, `public/audio/compare/manifest.json` | Same-location fair comparison (dataset's strongest design) | Y | **broken** — 14/16 files 404 incl. default (Indonesia); silent failure | expand | Ship the audio (S3 + presigned), surface load errors, prioritize South Sulawesi H/D/N/R |
| CAP-25 | Crossfade → vitality mapping | Interpolates vitality between the two selected states | `LocationCompare.tsx:50-58,85-91,258-265` | Visual reinforcement | N | ok | retire | Justification: Q7 (Retire, DRIVING-QUESTIONS.md): emotional weight is carried by real audio, real spectrograms and the recovery ladder. Removed in Phase 3 (DS-07). If kept, drive from measured audio energy, not labels |
| CAP-26 | Crossfader descriptive text | Narrative text per crossfade range | `ABCrossfader.tsx:getDescription` | Interpretation | N | poor — fabricated intermediate states | retire | Justification: describes soundscapes that do not exist (a linear mix of two clips); replace with static description of each endpoint clip |
| CAP-27 | "What am I hearing" explainer | Per-state descriptions; general healthy/degraded text | `dashboard/compare/page.tsx:32-61`, `DemoState.tsx:139-166`, `LocationCompare.tsx:68-73,299-367` | Plain-language education | Y | ok — overgeneralizes from one confounded pair | redesign | Must disclose recording time/site/country of each clip and the time-of-day confound |
| CAP-28 | Audio attribution | "MARRS (CC-BY 4.0) — Williams et al. 2024" banner; `ATTRIBUTION.md` | `AudioCompare.tsx:273-278`, `public/audio/ATTRIBUTION.md` | License compliance, provenance | Y | poor — only on one page; gallery has none; author names inconsistent across repo | expand | Per-clip attribution (dataset, site, file, timestamp, DOI, license) on every audio surface |
| CAP-29 | Web Audio unsupported fallback | Message when no AudioContext | `AudioCompare.tsx:256-263`, analyze preview | Graceful degradation | Y | good | preserve | |
| CAP-30 | Play-on-first-press loading | First press triggers fetch/decode then auto-plays | `AudioCompare.tsx:217-227`, `useDemoAudio.ts:223-239` | Respect autoplay policy | Y | ok — spinner only on compare page | preserve | |

## C. Analyze

| ID | Capability | What it does | Current location | User need served | Essential? | Interaction quality | Disposition | Notes |
|---|---|---|---|---|---|---|---|---|
| CAP-31 | Upload (drag/drop/browse) + client validation | `.wav`, audio mime, ≤50 MB, non-empty | `experience/page.tsx:142-231`; `components/FileUpload.tsx`; `lib/utils.ts:validateWavFile` | Submit my recording | Y | poor (experience: div not keyboard-reachable) / ok (analyze) | consolidate | One uploader; add client duration check (5 s–10 min) by decoding header |
| CAP-32 | Pre-upload audio preview + live spectrogram | Decode locally, play, waterfall | `dashboard/analyze/page.tsx:59-163,272-323` | Confirm I picked the right file | Y | good | preserve | Unique to `/dashboard/analyze` — must survive consolidation |
| CAP-33 | Coordinate modal (validated) | Optional lat/lon, range validation, Skip/Analyze/Cancel | `components/experience/CoordinateModal.tsx` | Region detection | Y | ok — not a real dialog; doesn't disclose that skipping costs 30% | redesign | Add map-click picker, explain effect honestly |
| CAP-34 | Inline coordinate inputs | Unlabeled, unvalidated lat/lon | `dashboard/analyze/page.tsx:325-370` | Region detection | Y | poor | consolidate | Into CAP-33 |
| CAP-35 | Upload → analyze → poll pipeline | POST `/upload`, POST `/analyze`, poll `/visualize/{id}` every 2 s, 60 tries | `experience/page.tsx:242-365`; `lib/api.ts:pollAnalysis` | Get a result | Y | ok (experience tolerates 404) / **likely broken** (analyze throws on first 404) | redesign | Poll `/status/{id}` for stage, then fetch `/visualize/{id}` once; backoff; cancel |
| CAP-36 | Processing feedback | Spinner + scripted rotating messages; stepper with pseudo-% | `ProcessingOverlay.tsx`; `AnalysisProgress.tsx` | Know it's working | Y | poor — messages fabricated, % fake, "44 sites" stale | replace | Real stages from `/status` (preprocessing → classifying N segments → complete) |
| CAP-37 | Classification verdict + confidence | Label + "% confidence" | `ControlsPanel.tsx:46-60`; `AnalysisResults.tsx:47-69` | "What does it sound like?" | Y | poor — diagnosis framing; multiplied, uncalibrated number | redesign | "Most similar to …" phrasing; show raw probability; integer precision; abstain band |
| CAP-38 | Class probability bars | Per-class bars (fixed order / sorted & animated) | `ComparisonPanel.tsx:31-60`; `charts/ProbabilityBars.tsx` | Uncertainty across classes | Y | poor — sum ≠ 100% after adjustment; shows restored_mid even if model is 3-class | redesign | One component, raw probabilities, explicit OOD flag, only classes the model has |
| CAP-39 | Region detection display | Region name + in/out of distribution | `ComparisonPanel.tsx:62-85`; `AnalysisResults.tsx:88-102` | Know if the model applies here | Y | poor — "in distribution" wrong for AUS/MDV/MEX | redesign | Show training coverage (clips/sites) for the detected region |
| CAP-40 | OOD warning banner | Amber banner with explanation | `dashboard/RegionWarning.tsx`; inline duplicate `AnalysisResults.tsx:71-86` | Caution | Y | poor — hard-coded "40%", fires for "no coordinates", duplicated | consolidate | One warning, accurate text, distinguish "not provided" from "outside" |
| CAP-41 | Similar reference sites | Top-3 (API) by cosine; list w/ status dot, country, % | `ComparisonPanel.tsx:87-114`; `AnalysisResults.tsx:117-207` | Which references does it resemble? | Y | ok — raw ids, % without scale, dead "+N more" | expand | Link to site detail; show similarity rank/percentile; allow playing reference exemplar |
| CAP-42 | Similar-sites mini-map | Leaflet map of top matches with % badges | `components/maps/MiniMap.tsx` | Where are the matches? | N | poor — implies geography matters to acoustic similarity | redesign | Keep only as small locator on site detail; not in result hero |
| CAP-43 | Embedding scatter | 2-D "Acoustic Embedding Space" (x/y = half-vector means, 10 refs) | `components/EmbeddingChart.tsx` ← `classifier/handler.py:generate_visualization` | See where my sample sits among references | ? | **misleading** | replace | Offline PCA/UMAP on all reference embeddings with stated variance, or drop for a nearest-neighbor distance strip |
| CAP-44 | Per-analysis caveat string | API `caveats` text under results | `ComparisonPanel.tsx:116-121`; `AnalysisResults.tsx:209-217` | Context-specific limitation | Y | ok — text-dim contrast; contradicts other caveats | preserve | Single source of caveat truth |
| CAP-45 | Scientific caveats (experience variant) | Collapsible 5-item list | `components/experience/CaveatsFooter.tsx` | Limitations | Y | poor — 1.89:1 contrast, collapsed by default, conflicting text | consolidate | With CAP-46 and About limitations into one model-card-backed component |
| CAP-46 | Scientific caveats (dashboard variant) | Collapsible amber 5-item banner | `components/dashboard/CaveatsBanner.tsx` (map, compare, analyze) | Limitations | Y | ok visually; text conflicts (Mexico vs Caribbean) | consolidate | See CAP-45 |
| CAP-47 | ML result → vitality | Sets vitality from predicted label | `experience/page.tsx:401-410` | Emotional reinforcement | N | poor — ignores confidence/OOD | retire | Justification: Q7 (Retire, DRIVING-QUESTIONS.md): emotional weight is carried by real audio, real spectrograms and the recovery ladder. Removed in Phase 3 (DS-07). Never drive ambience from a prediction; if anything, from measured audio |
| CAP-48 | Error state with retry | Message + "Try Again" | `experience/page.tsx:466-509`; `AnalysisProgress.tsx` | Recover from failure | Y | ok — drops API `suggestion`, `stage`, `request_id` | expand | Show suggestion and a copyable request id |
| CAP-49 | Reset / analyze another | Clears state | `dashboard/analyze/page.tsx:216-224,384-397`; Experience "New Analysis" | Repeat | Y | good | preserve | |
| CAP-50 | Compare my result with demo | "Compare with Demo Reefs" → fixed demo | `ControlsPanel.tsx:121-126` | Put my result in context | ? | poor — doesn't involve my audio | replace | A/B my recording vs nearest reference exemplar (needs CAP-51) |
| CAP-51 | Playback of my uploaded audio in results | — (built in `useAudioPlayback.ts`, `ControlsPanel.audioPlayback` prop, never wired) | `components/experience/useAudioPlayback.ts` (dead) | Hear what was analyzed | Y | absent | expand | Wire it (file is still in memory client-side) |
| CAP-52 | How-it-works / Quick Facts / Requirements rail | Static 5-step explainer, facts, requirements | `dashboard/analyze/page.tsx:431-529` | Set expectations | N | poor — "Real-time processing" false; max duration missing | redesign | Short inline requirements near uploader; methods link |

## D. Explore sites

| ID | Capability | What it does | Current location | User need served | Essential? | Interaction quality | Disposition | Notes |
|---|---|---|---|---|---|---|---|---|
| CAP-53 | Interactive site map (WebGL) | deck.gl ScatterplotLayers on CARTO dark-matter, hover/click | `components/map/ReefMap.tsx`, `/dashboard/map` | Spatial overview | Y | ok — overlap at low zoom, pitch tilt, no clustering, mouse-only | consolidate | One map engine for the app (CONCERNS recommends maplibre) |
| CAP-54 | Region fly-to | 8 preset regions, animated, reduced-motion aware | `MapControls.tsx:79-131`, `lib/regions.ts`, `ReefMap.tsx:212-231` | Jump to a reef area | Y | ok — can't re-select same region | preserve | Also fit-to-filtered-sites |
| CAP-55 | Map country/status filters + reset | Checkbox filters, reset when changed | `MapControls.tsx:145-249`, `dashboard/map/page.tsx` | Narrow sites | Y | ok — invisible keyboard focus; no counts | consolidate | With CAP-62; shared, URL-synced filter model |
| CAP-56 | Health legend | Static 5-status legend | `components/map/HealthLegend.tsx` | Decode colors | Y | poor — static, overlaps embedding legend | redesign | Data-driven with counts; one legend |
| CAP-57 | Embedding vs location-only distinction | Faded ring for `has_embedding=false` + legend counts | `ReefMap.tsx:331-395,477-526`; SitePopup badge; SiteCard "Embedding" row | Know which sites can be matched | Y | good idea, poor placement | preserve | Rename "Acoustic reference" vs "Location only" |
| CAP-58 | Site popup | id, status, coords, location, "no audio" badge, close | `components/map/SitePopup.tsx` | Site details on map | Y | ok — thin, no links | expand | Link to site detail page; source dataset; audio if available |
| CAP-59 | WebGL detection + error boundary | Fallback panels for no-WebGL / init failure | `ReefMap.tsx:43-176,400-429` | Graceful degradation | Y | good | preserve | Provide list fallback, not just a message |
| CAP-60 | Filtered site count | "Showing X of Y reference sites" | `dashboard/map/page.tsx:189-195` | Filter feedback | Y | ok — "0 of 0" while loading | preserve | |
| CAP-61 | Site stats summary | Total / Healthy / Degraded / Restored cards | `app/sites/page.tsx:90-145` | Dataset composition | Y | poor — merges early+mid, omits Unknown (sum ≠ total) | redesign | Stacked composition bar by status × country from `/sites` |
| CAP-62 | Leaflet world map on Sites | OSM tiles, fitBounds, legend with counts, click → scroll & ring card | `components/maps/WorldMap.tsx`, `SiteMarker.tsx` | Map ↔ list linkage | Y | ok — light tiles in dark UI, pulse not motion-gated | consolidate | With CAP-53; keep map↔list linking behavior |
| CAP-63 | Site search + chip filters with counts | Text search (id/country/status), status & country chips, clear | `components/sites/SiteFilters.tsx` | Find a site | Y | ok — empty-result bug (`sites/page.tsx:49`) | consolidate | With CAP-55 |
| CAP-64 | Site cards (expandable) | Status bar, id, country, location, coords, site type, embedding, Google Maps link, status description incl. restoration age | `components/SiteCard.tsx` | Per-site detail | Y | ok — guessed "site type" (`_R` → "Reference Site"), generic descriptions | replace | Real site detail page (CAP-N2); keep restoration-age context |
| CAP-65 | External map link | "View on Google Maps" | `SiteCard.tsx:107-117` | Real-world context | N | ok | preserve | |
| CAP-66 | Grid/List view toggle | Single button, list mode not implemented | `app/sites/page.tsx:231-244` | Density control | N | poor — non-functional | retire | Justification: list mode never existed; a sortable table view should be built as part of CAP-63 consolidation instead |
| CAP-67 | Loading skeletons / error + retry | Skeleton cards; error card with "Try again" | `SiteCard.tsx:SiteCardSkeleton`, `sites/page.tsx:197-219` | Robustness | Y | good | preserve | Also surface router `error_note` (4-site fallback) |
| CAP-68 | Data source panel | MARRS description + DOI | `app/sites/page.tsx:289-302` | Provenance | Y | poor — claims MARRS-only, 5 countries | expand | Per-source counts (MARRS 45, SanctSound 4, CoralSoundExplorer 3, Irma 2) with DOIs/licenses |

## E. Learn / trust

| ID | Capability | What it does | Current location | User need served | Essential? | Interaction quality | Disposition | Notes |
|---|---|---|---|---|---|---|---|---|
| CAP-69 | API health check | Polls `/health` every 30 s, Operational/Checking | `app/about/page.tsx:9-62` | System status | N | poor — no error state, "Version: Unknown", fake "last checked" | redesign | Small status indicator in footer; real timestamp; error state |
| CAP-70 | What/why + measures / cannot measure | Narrative + two lists + recommended use | `about/page.tsx:64-154` | Correct expectations | Y | good — best content in app | preserve | Promote; link from every result |
| CAP-71 | Interactive architecture diagram | AWS node diagram with hover tooltips | `components/about/ArchitectureDiagram.tsx` | Portfolio / technical credibility | ? | ok — hover-only tooltips; "→4, ~90%" claim | preserve | Fix model claim; keyboard-accessible tooltips |
| CAP-72 | ML model & reference data cards | SurfPerch specs; 54 sites summary | `about/page.tsx:92-121` | Technical context | Y | ok | expand | Into a full model card (training n=100 clips / 5 sites / 2 countries; test n=10; classes; calibration; version) |
| CAP-73 | Limitations panel | Amber list | `about/page.tsx:156-172` | Limitations | Y | ok — contradicts in-distribution logic | consolidate | With CAP-45/46 |
| CAP-74 | Data sources & licenses | 4 datasets with citations, DOIs, licenses | `about/page.tsx:174-216` | Attribution | Y | ok — citations disagree with other repo docs (MARRS authors, Irma DOI) | preserve | Reconcile citations; reuse on site/sample pages |
| CAP-75 | Credits | Model / data / infra credits | `about/page.tsx:218-236` | Attribution | N | ok | consolidate | Into footer/about sources |

## F. Visual / vitality system

| ID | Capability | What it does | Current location | User need served | Essential? | Interaction quality | Disposition | Notes |
|---|---|---|---|---|---|---|---|---|
| CAP-76 | Vitality store + CSS variable writer | Global 0–1 scalar, lerped, writes 8 `--reef-*` vars at 30 fps forever | `stores/vitality-store.ts`, `hooks/useVitality.ts`, `lib/color-engine.ts` | Adaptive theming | N | poor — vars almost unused; always-on loop | retire | Justification: Q7 (Retire, DRIVING-QUESTIONS.md): emotional weight is carried by real audio, real spectrograms and the recovery ladder. Removed in Phase 3 (DS-07). If kept: run only while a sound-reactive surface is mounted; consume tokens deliberately |
| CAP-77 | Background particles + caustics | Pooled particles, vitality-scaled; caustics > 0.3; band-reactive bursts | `components/BackgroundCanvas.tsx`, `hooks/useBackgroundCanvas.ts` | Atmosphere | N | poor — likely occluded by opaque page backgrounds; runs on every route | retire | Justification: Q7 (Retire, DRIVING-QUESTIONS.md): emotional weight is carried by real audio, real spectrograms and the recovery ladder. Removed in Phase 3 (DS-07). Mount only on listening surfaces; verify visibility; never on data views |
| CAP-78 | Audio-visual bridge | 4-band RMS from analyser at 30 fps → store | `hooks/useAudioVisualBridge.ts` (Demo only) | Sound-reactive visuals | N | ok | retire | Justification: Q7 (Retire, DRIVING-QUESTIONS.md): emotional weight is carried by real audio, real spectrograms and the recovery ladder. Removed in Phase 3 (DS-07). The one *measured* vitality input — use it as the sole driver; wire to all playback surfaces |
| CAP-79 | 3→4 band mapping to visual layers | Band toggles dim/illuminate visual layers | `useDemoAudio.ts:297-311` | Link filters to visuals | N | ok | retire | Justification: Q7 (Retire, DRIVING-QUESTIONS.md): emotional weight is carried by real audio, real spectrograms and the recovery ladder. Removed in Phase 3 (DS-07). Unify band table first |
| CAP-80 | Decorative "living spectrogram" | Sine bands + particles; idle/playing/analyzing states | `components/spectrogram/*` (`/`, `/experience` all states) | Atmosphere | N | poor — named & described as a spectrogram; mismatched bins; not reduced-motion gated | retire | Justification: Q7 (Retire, DRIVING-QUESTIONS.md): emotional weight is carried by real audio, real spectrograms and the recovery ladder. Removed in Phase 3 (DS-07). Rename to ambient waveform, or replace with a true (static or live) spectrogram where a spectrogram is claimed |
| CAP-81 | Reduced-motion gating | Background canvas off, instant color, instant fly-to | `useBackgroundCanvas.ts:311-322`, `useVitality.ts:46-56`, `ReefMap.tsx:34-41` | Accessibility | Y | ok — partial (spectrogram, framer, bars, counters, pulses not gated) | expand | Global `MotionConfig` + CSS media query + per-canvas gate Phase 3: carried over as principles for the remaining canvases (components/audio/SpectrogramCanvas). |
| CAP-82 | Mobile performance gating | Particles ≤50, no caustics < 768 px | `useBackgroundCanvas.ts:326` | Battery/perf | Y | ok | preserve | Extend to other loops Phase 3: carried over as principles for the remaining canvases (components/audio/SpectrogramCanvas). |
| CAP-83 | Vitality slider styling | Gradient track, glowing pulsing thumb, `touch-action:none` | `globals.css:~250-282` (`.vitality-slider`) | Touch-friendly crossfader | Y | ok — pulse not motion-gated | retire | Justification: Q7 (Retire, DRIVING-QUESTIONS.md): emotional weight is carried by real audio, real spectrograms and the recovery ladder. Removed in Phase 3 (DS-07). Keep touch-action; gate pulse |
| CAP-84 | Dev vitality debug panel | Slider + token swatches (dev only) | `components/dev/VitalityDebugPanel.tsx`, `app/page.tsx:59` | Developer tuning | N | ok | retire | Justification: Q7 (Retire, DRIVING-QUESTIONS.md): emotional weight is carried by real audio, real spectrograms and the recovery ladder. Removed in Phase 3 (DS-07). Dev-only; move to a `/dev` route or Storybook |
| CAP-85 | Golden Hour palette & glass components | Tokens, `GlassPanel/Button/Input`, `.glass-panel` | `tailwind.config.js`, `globals.css`, `components/ui/glass/*` | Brand look | ? | ok — 9 duplicated status tables, low-contrast text tokens, blur everywhere | redesign | One token source; CVD-safe ordinal status scale distinct from brand accent |

## G. Dead or orphaned code (retire as a group)

| ID | Capability | What it does | Current location | User need served | Essential? | Interaction quality | Disposition | Notes |
|---|---|---|---|---|---|---|---|---|
| CAP-86 | Unused hooks/components/stores/deps | `useAudioPlayback` (salvage for CAP-51 first), `analysis-store`, `WaveBackground`, `ScrollProgress`, `useScrollProgress`, `useAnimateOnScroll`, `useAudioPlayer`, `useSpectrogram`, `ProbabilityStackedBar`, `LoadingSpinner`, `GlassCard`, `getStatusColorClass`, `STATUS_MARKER_COLORS`, `AudioCompare compact` mode, `wavesurfer.js` dep, Streamlit `dashboard/` | various | none | N | n/a | retire | Justification: zero imports (verified by grep 2026-09-30); they inflate surface and mislead contributors. Harvest `useAudioPlayback` into CAP-51 and the `analysis-store` stage enum into CAP-36 before deletion. Phase 3 (PLAT-02): wavesurfer.js and recharts removed from dependencies, the Streamlit dashboard/ deleted; deck.gl and Leaflet replaced by MapLibre. Residual: the unused hooks/components/stores listed here remain until harvested (useAudioPlayback -> CAP-51, analysis-store stage enum -> CAP-36). |

---

## Backend / API capabilities the UI does not yet expose

| Capability | Endpoint / source | What exists | Why it matters |
|---|---|---|---|
| Pipeline stage + segment count | `GET /status/{id}` → `stage` (`preprocessing`/`classifying`/`complete`/failed), `progress` ("Classifying N audio segments"), `completed_at` | Implemented in `lambdas/router/handler.py:handle_status`, wrapped by `api.getStatus` but never called | Replaces fabricated processing messages and fake %; also fixes the 404-at-first-poll failure in `/dashboard/analyze` |
| Rich error payload | `/visualize/{id}` failed → `error.code`, `stage`, `suggestion`, `request_id`, `retry_count`; preprocessor `AUDIO_TOO_SHORT` with `min_duration_required` | Returned, only `message` shown | Actionable recovery; support traceability |
| Embedding summary / model provenance | `/visualize/{id}` → `embedding_summary {dimension, num_segments, aggregation:'mean', embedding_model, embedding_version, classifier_model, classifier_version}`; `classification.model_version` | Returned, never rendered | Provenance chip on every result; disclose mean aggregation and segment count |
| Region code | `classification.region.detected` (e.g. `MESOAMERICAN_REEF`) | Only shown inside the OOD banner | Link to coverage table |
| Confidence multiplier value | computed (`confidence_multiplier` 1.0/0.7/0.6) but not returned | Not exposed (only boolean `confidence_adjusted`) | If adjustment survives, the factor must be visible; better: return raw probabilities alongside |
| Result permalink | `GET /visualize/{id}` and alias `GET /results/{id}` are stable GETs over DynamoDB | Not used for routing | `/analysis/[id]` share links with zero backend work |
| Site metadata fields | `/sites` → `region`, `source`, `synthetic`, `has_embedding`; top-level `total_all_sites`, `sites_with_embeddings`, `countries`, `version`, `source`, `notes`, `error_note` (fallback) | `source`/`region` partly used; `version`, `notes`, `error_note` never shown | Provenance per site, data version in footer, honest fallback warning |
| Server-side site filter | `/sites?has_embedding=true|false` | Unused | Acoustic-reference-only views |
| Curated stories | `/samples` → `stories {title, subtitle, sample_ids}`, per-sample `site_id`, `coordinates`, `country_code` | Stories used; `site_id`/`coordinates` not linked to sites/map | Sample ↔ site ↔ map linkage |
| Upload echo | `/upload` → `filename`, `s3_key`, `size_bytes` | Only toast | Show what was received (size, name) |
| Preprocessing facts | DynamoDB `PREPROCESSED` → `duration_seconds`, `num_segments`; logs original sample rate/channels | Not surfaced by any endpoint except `/status` progress string | Show analyzed duration, warn on low sample rate (<32 kHz → band-limited) |
| Duration limits | Preprocessor: min 5 s, max 600 s | Only min shown in UI | Client-side pre-check |
| Reference embeddings | S3 `reference/metadata.json` (`mean_embedding` per site, 1280-d) | Used only for cosine top-3 and a 10-site fake projection | Proper PCA map; full similarity distribution; "sites like this site" |
| Per-segment embeddings | Classifier computes one embedding per 5 s segment then averages (`handler.py:89`) | Discarded | Per-segment timeline (needs small backend change to persist per-segment probabilities) |
| Model config | S3 `models/model_config.json` (`version`, `test_accuracy`, `training_samples`, `idx_to_label`) | Not served | In-product model card; resolves 3- vs 4-class question |
| Health timestamp | `/health` → `timestamp` | About ignores it, prints client time | Honest "last checked" |

## Candidate new capabilities (grounded in the actual data)

| ID | Capability | Grounding (data that already exists) | Backend work | Priority |
|---|---|---|---|---|
| CAP-N1 | **Result permalinks & share** — `/analysis/[id]` renders any completed analysis; copy link; OG card | `/visualize/{id}` persisted in DynamoDB | none | High |
| CAP-N2 | **Site detail pages** `/sites/[id]` — status + who assigned it, source dataset/DOI/license, location, restoration age context, acoustic-reference flag, nearest reference neighbors, sample audio if curated, paired sites at same location | `/sites`, reference embeddings, `/samples.site_id`, SiteCard restoration-age text | small (neighbors endpoint or static build) | High |
| CAP-N3 | **Paired same-location comparison** — South Sulawesi H/D/N(early)/R(mid) side-by-side listening with matched-level playback and real spectrograms | 21 Indonesian sites within ~2 km; MARRS audio in S3 | ship clips (fix CAP-24) | High |
| CAP-N4 | **In-product model card / methods page** — classes, training n (100 clips), sites (4 IDN + 1 KEN), test n (10), split method, calibration table, version, known gaps, synthetic-data disclosure if applicable | `docs/MODEL_EVALUATION.md`, `CLASSIFIER_METRICS_AND_SCALING.md`, `model_config.json` | serve config (optional) | High |
| CAP-N5 | **Training-coverage indicator** — per region: training clips / reference sites / none; replaces "in distribution" boolean | classifier training table; `/sites` | none (static table) | High |
| CAP-N6 | **Per-segment timeline** of an uploaded recording — 5 s segments with per-segment class probabilities, agreement ("7/9 segments most similar to healthy"), click to play segment | classifier already has per-segment embeddings | persist per-segment probs in RESULT item | Medium-High |
| CAP-N7 | **True spectrogram of my recording** (static, full-length, time + Hz + dB axes, band overlays) with segment boundaries | file is in browser memory; OfflineAudioContext/FFT client-side | none | Medium-High |
| CAP-N8 | **Honest embedding map** — PCA (or fixed UMAP) fitted on all 44–48 reference embeddings, explained variance on axes, user sample projected, colored by reference status with CVD-safe ordinal palette | `reference/metadata.json` mean embeddings | precompute transform; return projected coords | Medium |
| CAP-N9 | **Similarity in context** — show where each reference's similarity falls in the distribution over all references (rank/percentile, strip plot) | cosine to all references (cheap) | return all similarities (≤48 floats) | Medium |
| CAP-N10 | **Hear the nearest reference** — A/B my recording vs best-match reference exemplar with the same crossfader + band filters | `/samples` audio, S3 reference audio | presign exemplar per site | Medium |
| CAP-N11 | **Precomputed sample results** — "Analyze This" shows a real stored result instantly | prompt 054 Phase 5; pipeline can run on sample clips | one-time batch, store `analysis_id` per sample | High (fixes CAP-18) |
| CAP-N12 | **Restoration-age context** — show restored_early (<3 months) / restored_mid (32–53 months) definitions wherever those labels appear; ordinal scale legend | SiteCard text, README class table | none | Medium |
| CAP-N13 | **Pre/post Hurricane Irma comparison** — Western Dry Rocks / Eastern Sambo before vs after | Irma dataset (CC0) cited; `SITE_COORDINATES` once had `_pre/_post` keys | restore split records + clips in `/sites` / `/samples` | Medium (About already advertises it) |
| CAP-N14 | **Dataset composition view** — stacked status × country × source chart; acoustic-reference vs location-only | `/sites` | none | Medium |
| CAP-N15 | **Export** — result JSON (incl. provenance block) and CSV of sites; citation (BibTeX/APA) for datasets | `/visualize`, `/sites`, About citations | none | Medium |
| CAP-N16 | **URL-synced explorer state** — filters, selected site, region, compare pair, band toggles, crossfade | client only | none | Medium |
| CAP-N17 | **Recording context capture** — optional time of day, depth, recorder/sample rate (auto-read from WAV header); warn on band-limited input (<32 kHz) and on time-of-day mismatch vs references | WAV header readable client-side; time-of-day confound documented in AUDIO_DIAGNOSIS | optional pass-through field | Low-Medium |
| CAP-N18 | **Accessible text alternatives** — data table for every chart; textual description of each clip's measured band energy; screen-reader list alternative to maps | all data already client-side | none | High (a11y) |
| CAP-N19 | **System status in footer** — API health, data version (`/sites.version`), model version | `/health`, `/sites`, `model_version` | add version to `/health` (trivial) | Low |

---

## Preservation checklist (gate for every redesign phase)

- [ ] All 73 non-retired rows (CAP-01…CAP-85 minus retired CAP-05, CAP-26, CAP-66 and the Q7 retirements CAP-25, CAP-47, CAP-76, CAP-77, CAP-78, CAP-79, CAP-80, CAP-83, CAP-84; CAP-86 is the retired dead-code group) have a named home (route + component) in the new IA.
- [ ] CAP-32 (pre-upload preview), CAP-23 (real band filtering), CAP-57 (reference vs location-only), CAP-59/CAP-29 (WebGL/Web Audio fallbacks), CAP-54 reduced-motion fly-to, CAP-70 (measures/cannot-measure) survive consolidation — these are the high-quality pieces most at risk of being dropped when duplicates are merged.
- [ ] No `replace` row ships its replacement with the original misleading behavior (CAP-17, 18, 36, 43, 50, 64, 80).
- [ ] Every retired row's justification is still true at merge time.
- [ ] Repo builds from a clean clone and `/samples` router source matches the deployed Lambda before any UI phase starts.
