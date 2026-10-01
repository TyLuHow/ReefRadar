# ReefRadar v2 — Initial Redesign Thesis

**Date:** 2026-09-30 · **Status:** Preliminary. Pending product-owner answers to the driving questions (§11). Not yet a roadmap.
**Built on:** `.planning/codebase/*` (7 docs), `.planning/audit/PRODUCT-AUDIT.md`, `.planning/audit/CAPABILITY-MATRIX.md` (86 capabilities + 19 candidates), `.planning/audit/DATA-MODEL.md`, `.planning/research/REFERENCE-PLATFORMS.md` (40 references), `.planning/research/TECH-LANDSCAPE.md`.

---

## 1. What the audit actually found (A — current state, condensed)

ReefRadar has a sound engineering spine — real SurfPerch inference, an async serverless pipeline, honest caveat *prose* — wrapped in a product that claims more certainty and more science than the system has. The biggest redesign lever is not visual; it is **truth**.

**Integrity (must be resolved before any "research instrument" can exist):**
- Gallery audio served by the live `/samples` endpoint is synthetic (verified: 88% of `idn_healthy_dawn` energy is in pure 200/500/1000 Hz tones), labelled with real MARRS site IDs, with invented biology ("grouper booms", "bleached") and one non-existent site (`phl_D1`, Philippines).
- The `restored_mid` class was likely trained on generated sine+click audio (`scripts/add_restored_mid_and_retrain.py:144-171`); deployed model version unverified (`s3://…/models/model_config.json`).
- "~90% accuracy" = one random split of 100 five-second windows from 5 sites in 2 countries, tested on 10 windows from the same sites. No site hold-out.
- Labels are entangled with deployment length, country, and time of day; the flagship healthy-vs-degraded demo is a cherry-picked Mexico-dusk vs Maldives-midday pair.
- Displayed metrics that are invalid as shown: the "embedding space" scatter (half-vector means, 10 sites), probabilities scaled by 0.6/0.7 so they no longer sum to 1, "in training distribution" for countries with zero training data, a "spectrogram" that is sine waves.

**Product/IA:** two analyze flows, three compare implementations, three map renderers on two tile providers, two hubs, nine copies of the status palette, four contradictory caveat lists, seven peer nav items with jargon labels. Nothing is shareable, exportable, or traceable. Location Compare is 404 in production. `/dashboard/analyze` likely fails at first poll (verified in code: `/visualize` 404s before `PREPROCESSED`, `api.pollAnalysis` throws on non-OK).

**Engineering:** HEAD does not build (gallery source never committed); deployed Lambda has drifted from repo (`/samples` route); uploads > ~4.5 MB fail at the Lambda payload limit (verified: body-in-request upload, `lambdas/router/handler.py:72-122`); unauthenticated upload drives a 3 GB inference container; always-on rAF loops on every route; no tests of any kind.

**What is genuinely good and must survive:** real band-isolation filtering (Web Audio biquads), pre-upload preview spectrogram, reference-vs-location-only distinction, WebGL/Web Audio fallbacks, reduced-motion fly-to, the About page's "measures / cannot measure" content, and the instinct that *hearing* the reef is the hook.

**The dataset's strongest asset is unused:** South Sulawesi has healthy, degraded, newly-restored and mid-restored sites within ~2 km — a true paired design. The UI never lets anyone hear it.

## 2. The core reframing (C — product model)

> **ReefRadar becomes a listening instrument for reef soundscapes, in which every claim is something you can hear, see, and trace to its source.**

Not "an AI that diagnoses reef health." Not "a map of sites." The atomic object is a **soundscape** — a recording or a 5-second window of one — placed in a **site**, inside a **project cluster**, with **provenance** and **labels whose meaning is stated**. The classifier is one instrument on the bench, not the verdict at the end of a funnel.

Three jobs, in priority order:
1. **Listen and compare fairly** — what does a reef sound like, and how do degraded / restored / healthy reefs differ *at the same place*? (South Sulawesi recovery ladder; matched-level playback; time-of-day disclosed.)
2. **Place a recording** — upload as *search*, not as a job: where does my recording land among the references, which ones does it sound like (playable side by side), what does the model read for each 5-second window, and how much should I trust that?
3. **Inspect the evidence** — every site, clip, dataset, label definition, and model claim is a first-class, linkable page with provenance, licence, and limits.

Design principle borrowed from BirdWeather: *every verdict ships with the audio and spectrogram so you can verify it yourself.*

## 3. Information architecture (D)

**From** 8 routes / 7 peer nav items / 3 modes **to** one instrument plus entity pages:

| Route | Purpose |
|---|---|
| `/` | Question-led entry. Hear a real reef within 5 s. Curated questions open pre-configured instrument states (narrative drives the explorer; it never wraps it). |
| `/explore` | **The instrument.** Atlas + Inspector + Listening Bench. All state in the URL. |
| `/sites/[id]` | Site page: what was recorded, who labelled it and what the label means, source/DOI/licence, clips, nearest acoustic neighbours, paired sites at same location. |
| `/analyses/[id]` | Permalink for any analysis (backend already persists it). Shareable, exportable, with OG image. |
| `/methods` | Model card (classes, training n, sites, countries, evaluation, calibration, version, synthetic-data disclosure), datasets, canonical frequency-band table with citations, limitations. Single source of every caveat. |
| `/about` | Project, architecture (portfolio), credits. |

Nav collapses to **Listen · Explore · Analyze · Methods** (Analyze = Explore with the upload drawer open). Command palette (⌘K) resolves sites, clusters, clips, questions, method topics. Retired: `/dashboard`, `/dashboard/*`, `/experience`, the separate `/sites` list page — each capability rehomed per `CAPABILITY-MATRIX.md`.

**Entities:** Cluster (7) → Site (54) → Clip/Recording → Window (5 s) ; Dataset (4) ; Label definition (per dataset) ; Model (versioned) ; Analysis (user upload) ; Question (curated).

## 4. Core interaction model (E)

**The instrument has three coordinated regions:**

1. **Atlas** (context, not the hero). Two layouts of the *same* points, animated between: **Geography** (semantic zoom: world → 7 project clusters with evidence counts → reef-flat site layout with spiderfy) and **Sound-space** (honest PCA of the 48 reference embeddings, explained variance on axes; an upload lands among its neighbours). This geo↔sound morph is the signature interaction — it makes "acoustic similarity" physically visible, and it is cheap at 54 points.
2. **Inspector** (persistent sidecar, never popups): the selected cluster / site / clip / analysis / dataset, with provenance chips on every number and a "Why?" expansion.
3. **Listening Bench** (bottom dock, the true hero when anything is selected): one shared audio engine; transport; real spectrogram with time, Hz and dB axes (Nyquist-aware); **window strip** under the spectrogram (one cell per 5 s window, colour = model reading, opacity = confidence — Pattern Radio's pattern); guild band filters from one canonical, cited band table; A/B/C stacked rows for fair comparison with matched-level playback and loudness disclosure.

**Selection is first-class state** (`?site=ind_R2&clip=…&t=12.5&compare=ind_H1,ind_D1&bands=fish&layout=sound`). Select anywhere → everything else follows: atlas highlights, inspector loads, bench cues the clip.

**Time** is first-class but honest about which time exists: (a) **within-recording time** — the playhead and window strip (always); (b) **restoration stage** as an ordinal *ladder* (degraded → restored <3 mo → restored 32–53 mo → healthy) at one location — not a trajectory; (c) **diel / pre-post-hurricane time** only if the data is ingested (Q3).

**Lenses** (derived from what the data can honestly support, `DATA-MODEL.md §8`): *Habitat status* (MARRS category, defined), *Restoration stage*, *Evidence* (training site / reference vector / location-only; dataset source), *Sound guilds* (within-clip relative band energy). Explicitly **not** offered: health score, coral cover, species, trends, absolute loudness across sources.

**Filtering:** beeswarm/strip range filters that keep each of the 54 sites identifiable (histograms are too coarse at n=54).

## 5. Data-communication strategy (F)

| Replace | With |
|---|---|
| "Healthy — 87.3% confidence" | "Sounds most like *healthy MARRS reference reefs*" + raw class probabilities (integers, sum to 100) + explicit **abstain** state + a separate **training-coverage** fact for the region (clips/sites from that region), never multiplied in |
| Fake 2-D scatter | Sound-space PCA with explained variance; all reference sites; neutral marker for the upload |
| "92% similar" | Rank among all N references on a strip plot of all similarities; play the nearest reference |
| Mean-of-recording only | Window strip: per-5-s readings and agreement ("7 of 9 windows nearest healthy") |
| Decorative "living spectrogram" | Real spectrograms — precomputed for references, worker-computed for uploads with identical parameters |
| Four warm browns | One CVD-validated **ordinal** palette for degraded → restored_early → restored_mid → healthy, distinct neutral for unknown, UI accent that is never a status colour; shape/text redundancy on maps |
| Scripted processing messages | Real pipeline stages from `/status` |
| Caveats in four places | One model-card source rendered in context next to the claim it qualifies |

Every number gets: unit, scale, source, version, and a path to the underlying data (export JSON/CSV with a provenance block; BibTeX for datasets).

## 6. Visual direction (G — preliminary)

**"Hydrophone lab notebook."** Precise, calm, sound-native. Dark-first for the instrument (spectrograms and listening are night-room activities; dark grounds give spectrogram colour scales their range), with a light reading theme for Methods/Site pages and print/export — both from one token set.
- Neutrals: deep blue-graphite, not black, not navy-cliché; hairline rules instead of glass; 2–4 px radii; no backdrop blur.
- One interaction accent (cold, instrument-like — chosen so it can never be confused with a status colour). No forest green, no beige, no Golden Hour browns as brand.
- Type: a precise grotesk for UI, a monospaced face with tabular figures for timecode/numerics, and an editorial serif reserved for questions and narrative passages (VACS/Climate Central lesson: editorial voice at the entry, instrument voice inside).
- Motion communicates continuity only: geo↔sound morph, playhead, inspector transitions (View Transitions). Ambient sound-reactive visuals only in an opt-in listening mode, driven by measured audio, never by labels (Q7).
- Negative reference honoured: no scroll-driven cinematic microsite, no immersive full-bleed map-as-hero.

## 7. Design-system architecture (H — outline)

Tailwind v4 CSS-first tokens as the single source, consumed also by map style and chart scales. React Aria Components as the only behaviour layer (dual-thumb range, tables, listbox, dialog, command palette). Primitives: Shell, Toolbar, CommandPalette, AtlasCanvas, Inspector, ProvenanceChip/WhyPanel, Transport, Spectrogram, WindowStrip, BandGuildToggle, CompareRow, StatusSwatch (ordinal + shape), StripPlot, ProbabilityBar (with abstain), DataTable, Legend (data-driven, with counts), EmptyState/ErrorState (with suggestion + request id), Skeleton, Sheet (mobile). Dev-only `/dev/fixtures` route instead of Storybook initially.

## 8. Technology architecture (I) — summary of `TECH-LANDSCAPE.md`

| Area | Keep / change | Why |
|---|---|---|
| Framework | **Keep Next.js**, upgrade 14.2 → 16 / React 19; instrument is a client island, RSC only for static/OG | Data is tiny; Vercel already wired; incremental path |
| Maps | **MapLibre only** (drop deck.gl + Leaflet); OpenFreeMap now; GEBCO bathymetry + Allen Coral Atlas reef outlines later | 54 points; one engine, one style, globe at low zoom |
| Charts | **Observable Plot + d3 modules**; retire recharts | Bespoke strip/beeswarm/PCA; text + table alternative for every chart |
| Audio | One audio engine; worker FFT; WebGL2 spectrogram (Canvas2D fallback); precomputed reference spectrograms | Synchronised views need shared time-frequency data |
| State | **nuqs** (URL) + **zustand** (transient) + **TanStack Query** (server, built-in polling) | Shareable state without accounts |
| Reference data | Versioned static JSON on CDN with provenance (~300 KB) | Fast, cacheable, reproducible |
| Upload | **Presigned S3 upload** + client resample/duration check | Fixes the 4.5 MB ceiling and the abuse surface |
| Backend | Small changes: persist per-window outputs, return all similarities + PCA coords, serve model config, `/samples` from source, rate limiting | Enables window strip, sound-space, model card |
| Testing | Vitest + Playwright (e2e + screenshots in pinned Docker) + axe-core + bundle budget; Sentry + Speed Insights | No tests exist today |
| Ruled out (for now) | deck.gl, spatial DB, DuckDB-WASM, WebSockets/SSE, WebGPU, in-browser inference, accounts/Supabase, Storybook | Over-engineering at this data scale |

**Migration:** incremental strangler inside `dashboard-next/` (`(instrument)` route group, `features/`, `design/`, lint fence against legacy imports). Legacy routes stay testable until their capabilities are rehomed; retired at the end. No big-bang rewrite — the audit does not justify one.

## 9. Performance (J) and accessibility (K) — principles

- No always-on animation loops; every rAF loop owned by a mounted surface and paused off-screen/hidden.
- Reference spectrograms are images; uploads computed in a worker. Bundle budget per route; maps and audio lazy.
- The **site list/table is the primary accessible interface**; the atlas is a view of it. Every chart has a text takeaway and a table. Keyboard model for the bench (space, ←/→ by window, B for band, C for compare). Status never by colour alone. Reduced motion is global (CSS + Motion config + canvas gates). Audio clips get text descriptions of measured content.

## 10. Roadmap sketch (L — illustrative, depends on §11)

0. **Truth & reproducibility** — repo builds from clean clone; gallery/samples source committed and reconciled with the Lambda; synthetic audio removed; deployed model verified; screenshot / a11y / bundle baselines.
1. **Foundations** — Next 16 / React 19 upgrade, duplicate stacks removed, tokens + primitives + shell.
2. **Data contract** — versioned reference dataset with provenance; presigned upload; `/status`-driven progress; per-window outputs; PCA + all-similarities.
3. **Instrument shell & Atlas** — URL state, selection model, semantic zoom, geo↔sound morph, inspector, command palette.
4. **Listening Bench** — audio engine, real spectrograms, window strip, guild filters, fair A/B/C, recovery ladder.
5. **Analysis as search** — upload drawer, permalinks, nearest-reference playback, honest model reading.
6. **Evidence pages** — sites, datasets, methods/model card, provenance chips everywhere, exports.
7. **Question-led entry & tours.**
8. **Persistence & sharing** (scope per Q5).
9. **Responsive / accessibility / performance hardening.**
10. **Legacy retirement, visual QA, full capability-matrix regression walk.**

## 11. Success criteria (M — preliminary)

- Clean clone builds; CI runs unit + e2e + axe + screenshot suites; 0 serious axe violations.
- Every one of the 82 non-retired capabilities has a verified home; 0 `replace` rows ship their old misleading behaviour.
- 0 synthetic or unattributed audio; every clip, site and number links to its source.
- No displayed probability that fails to sum to 100%; every classification shows its window agreement and training coverage.
- A first-time visitor hears a real reef within 5 s of landing; any view is reproducible from its URL.
- Uploads of 60 s at 96 kHz succeed.
- Instrument route: LCP < 2.0 s on mid-tier mobile, interaction latency < 100 ms for select/hover/scrub, no idle CPU loops.

---

*Driving questions for the product owner are presented in conversation and recorded in `.planning/research/DRIVING-QUESTIONS.md` once answered.*
