# Feature Research — ReefRadar v2

**Domain:** Reef passive-acoustic-monitoring (PAM) research instrument, public front door
**Researched:** 2026-09-30
**Confidence:** HIGH (grounded in `.planning/audit/CAPABILITY-MATRIX.md`, `.planning/audit/DATA-MODEL.md` §8–9, `.planning/research/REFERENCE-PLATFORMS.md`, `.planning/research/DRIVING-QUESTIONS.md`) with MEDIUM confidence on a handful of PAM-domain conventions confirmed by targeted web search (long-duration false-colour / diel "soundscape fingerprint" spectrograms, BirdNET-style review workflows) rather than by direct tool inspection

**Method:** This file does not re-derive the 40-product interaction study or the 86-row capability inventory — both already exist and are cited throughout by CAP-ID. Its job is to convert them, plus the owner's nine driving-question decisions, into one categorized feature landscape scoped to *this* product at *this* milestone: ~54 sites / 7 clusters, ~9,000 h of timestamped MARRS audio + 15-class sonotype detections to be ingested, a retrained evidence-first classifier, URL + local persistence (no accounts), public uploads with guardrails, light scientific-editorial design, and a public front door. Two extra searches confirmed that long-duration false-colour spectrograms ("soundscape fingerprints") and review/verify loops with confidence thresholds (BirdNET Analyzer) are established PAM-research conventions, not ReefRadar inventions — both are cited where relevant below.

---

## Feature Landscape

Organized by the eight capability areas the roadmap will plan against. Each row cites the CAP-ID(s) it preserves, redesigns, expands, or replaces from `CAPABILITY-MATRIX.md`, and/or the candidate ID (CAP-N#) or driving-question (Q#) that originates it. A capability area's "why table stakes" draws on the PAM-tool survey named in the brief — Arbimon, Raven Pro/Lite, Kaleidoscope, OPUS/ecoSound-web, SanctSound/NCEI, Perch agile modeling, BirdNET Analyzer, scikit-maad — cross-referenced with `REFERENCE-PLATFORMS.md`.

### 1. Listen & compare

**Why this is where credibility is won or lost first:** every reef-PAM tool surveyed — MBARI Soundscape Listening Room, SanctSound, Arbimon, CoralSoundExplorer, BirdWeather — puts real, playable, attributed audio ahead of any model output. ReefRadar's current `/samples` gallery is synthetic (`DATA-MODEL.md` F1); fixing that is the single highest-leverage table-stakes item in the whole redesign.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Real, attributed sample gallery (play real reef audio within 5 s of landing) | Every reference tool's hook is real sound (MBARI, SanctSound, Calling in our Corals); Core Value forbids synthetic audio | MEDIUM | CAP-13, CAP-14, CAP-15, CAP-16; redesign — commit gallery source first, fix `phl_D1`/`aus_R1` provenance, rebuild "Recovery in Sound" from one real location |
| Per-clip attribution (dataset, site, DOI, licence) on every surface audio appears | CC-BY/CC0 licence terms require it; Climate TRACE's "caveats hidden in CSV" is the negative lesson | LOW | CAP-28, CAP-74; expand to every playback surface, not just one page |
| Canonical frequency-band isolation filters (real Web Audio biquads, one cited band table) | SanctSound's biophony/anthrophony/geophony taxonomy and MBARI's "shrimp vs fish" framing are the domain norm for "what am I listening for" | MEDIUM | CAP-23; preserve the real filtering, consolidate 3 conflicting band tables into one cited source |
| Real spectrogram per clip — time, Hz, dB axes, Nyquist-aware | Table stakes across every tool surveyed (Raven, Kaleidoscope, Arbimon, Ocean Noise Explorer, CoralSoundExplorer); current decorative "spectrogram" is sine bands, not real data | MEDIUM-HIGH | CAP-21 redesign, CAP-N7; precompute reference spectrograms server-side, worker-FFT for uploads with identical parameters |
| Paired same-location recovery-ladder comparison (degraded → restored_early → restored_mid → healthy, South Sulawesi) | The dataset's one true experimental-design asset (`DATA-MODEL.md` §5.1, §6); no reference tool has this exact design, but "before/after" and "period comparison" (GFW) and "trajectory" (CoralSoundExplorer) validate the *pattern* | MEDIUM | CAP-24 (currently **broken**, 14/16 audio files 404), CAP-N3; ship the audio, matched-level playback |
| A/B/C fair comparison with matched-level playback and a stated loudness-normalisation disclosure | Peak-normalising removes the strongest real cue (`DATA-MODEL.md` §5.6: "degraded" is 8.6 dB louder than "healthy" post-normalisation, which is backwards); MBARI explicitly disclosures levels | MEDIUM | CAP-20, CAP-22 consolidated into one compare engine; CAP-N10 adds "A/B my upload vs nearest reference" |
| Listening-condition honesty notice ("best with headphones"; snapping shrimp is high-frequency, fish calls are low) | MBARI's explicit hardware-limitation disclosure is a credibility signal reef-PAM researchers recognise | LOW | New; cheap, high trust payoff |
| Graceful degradation (no WebGL / no Web Audio) | Standard accessibility baseline; already present and good | LOW | CAP-29, CAP-59; preserve |

### 2. Time & effort

**Why this is table stakes for PAM researchers specifically (not just a "nice chart"):** reef-PAM tools build their credibility on exactly three time views that ReefRadar currently has none of — a **diel ("soundscape fingerprint") plot**, a **recording-effort calendar**, and a **detection timeline**. These are the first things a PAM reviewer looks for. Long-duration false-colour (LDFC) spectrograms — the technical name for the diel fingerprint — are an established ecoacoustics visualization specifically built to navigate and compare long recordings by time of day (confirmed via web search, not just the given references). Arbimon's time-of-day × frequency "soundscape" heatmap and SanctSound's "where and when did we listen?" framing are the direct domain analogues already captured in `REFERENCE-PLATFORMS.md` §2B.15/§2B.20. This entire capability area is new — the legacy app stores no time dimension at all (`DATA-MODEL.md` F4) — and depends on the Data & Model track ingesting MARRS timestamps and sonotype detections (Q3).

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Within-recording playhead + 5 s window strip (class colour, confidence opacity, playhead-linked) | Universal pattern across Pattern Radio, Merlin, Raven, Kaleidoscope: the spectrogram's "what did the model think, right here" strip | MEDIUM | CAP-N6; needs per-segment probabilities persisted server-side (small backend change, `classifier/handler.py:88-99`) |
| Diel / time-of-day "soundscape fingerprint" per site (false-colour long-duration spectrogram or hour-binned summary) | Standard PAM deliverable (LDFC spectrograms; Arbimon's recommended "time of day" soundscape aggregation); the brief names it explicitly | HIGH | New; requires MARRS filename timestamps ingested and **timezone verified** (`DATA-MODEL.md` §3.1 — filenames are plausibly UTC but unverified; this is a correctness gate, not a design choice) |
| Recording-effort calendar (deployment window, duty cycle, days recorded per site) | `manifest.csv` already answers "where and when did we listen" — SanctSound's own second IA pillar; researchers judge trust in a site partly by how much audio backs it | LOW-MEDIUM | New; cheapest time feature to ship — no embeddings needed, just `manifest.csv` ingestion |
| Detection timeline per site (15 MARRS sonotypes, counts over the deployment) | The scientifically grounded "guild" lens the brief calls out; directly answers "what did we hear, and when" (SanctSound's third pillar) | HIGH | New; requires ingesting the ~66 GB sonotype detection archive (Q3) — the single largest Data & Model track dependency in this feature area |
| Restoration-stage ladder as an explicit ordinal axis (not a trajectory) | The dataset's chronosequence design; must be labelled honestly — restored_mid sites are not "between" on any measured function (`DATA-MODEL.md` §6) | LOW | CAP-N12; content/labelling work, no new data |
| Pre/post Hurricane Irma comparison (Western Dry Rocks / Eastern Sambo) | A genuine natural-experiment time axis sitting unused upstream (`DATA-MODEL.md` §3.1, F9) | MEDIUM | CAP-N13; `add_irma_sites.py` logic exists but was never deployed — label status `unknown`, attach `period: pre|post`, never relabel as health |

### 3. Analysis-as-search (upload flow)

**Why "search," not "job":** Perch agile modeling and Earth Index both treat a query clip as a vector search over embeddings with ranked, listenable neighbours and distributional uncertainty — this is explicitly ReefRadar's existing mental model (`similar_sites`) and the owner's Q4 decision formalises it. The legacy flow currently ships a progress bar ending in a single label, which is the anti-pattern this whole area corrects.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Presigned upload with guardrails (size/duration caps, per-IP rate limit, budget alarm) | Current body-in-request upload fails >4.5 MB and an unauthenticated upload drives a 3 GB container — a real abuse surface | MEDIUM | CAP-31 consolidate; Q6 (public uploads, guardrails required before any public launch) |
| Pre-upload preview + live spectrogram | Already the best-quality piece of the current analyze flow | LOW | CAP-32; preserve verbatim — flagged in the preservation checklist as "at risk of being dropped" |
| Validated coordinate capture (map-click + manual entry, one component) | Needed for region/training-coverage context, must disclose what skipping costs | MEDIUM | CAP-33, CAP-34 consolidated |
| Upload → analyze → real-status poll (stage-driven, not scripted messages) | `/status/{id}` already exists and is unused; current flow 404s on first poll in `/dashboard/analyze` | MEDIUM | CAP-35, CAP-36; fixes a verified broken path |
| Per-window readings with explicit abstain state | Q4 decision: probabilities are secondary evidence, not a verdict; abstain must exist for low-confidence/out-of-coverage windows | MEDIUM-HIGH | CAP-37, CAP-38 redesign; depends on per-segment persistence (same backend change as the window strip, area 2) |
| Raw class probabilities (integers, sum to 100, only classes the model actually has) | Current probabilities are scaled by 0.6/0.7 region multipliers and no longer sum to 1 — this is a Core Value violation, not a style issue | LOW | CAP-38; fix is mostly removing code, not adding it |
| Training-coverage indicator, shown separately from the OOD flag | "In training distribution" is currently wrong for AUS/MDV/MEX (`DATA-MODEL.md` F7); researchers need "how many clips/sites trained this region" as its own fact | LOW-MEDIUM | CAP-39, CAP-40 consolidated; CAP-N5; depends on the evaluation track publishing a training-site table (Q2) |
| Nearest playable reference sites, ranked with context (not raw ids/%) | Core "search, not verdict" interaction; BirdWeather/Perch pattern | MEDIUM | CAP-41, CAP-N9 (return all similarities, not just top-3, for a rank/percentile strip) |
| Honest embedding projection with the upload plotted among retrained references | Current "embedding space" is two half-vector means over 10 sites — proven meaningless (`DATA-MODEL.md` F6) | MEDIUM-HIGH | CAP-43 replace; CAP-N8; **depends on the retrained, real-audio-only reference embeddings (Q2)** — cannot ship an honest version against the current synthetic-tainted vectors |
| Playback of the user's own uploaded audio in the result | Built but never wired (`useAudioPlayback.ts`) | LOW | CAP-51; cheapest "evidence-first" win available |
| A/B the upload against its nearest reference exemplar | Replaces "compare with generic demo," which doesn't involve the user's own audio | MEDIUM | CAP-50 replace, CAP-N10 |
| Error states with actionable suggestion + copyable request id | API already returns `suggestion`/`request_id`/`stage`; UI drops them | LOW | CAP-48 expand |
| Reset / analyze another | Already works | LOW | CAP-49; preserve |
| Short inline requirements near the uploader + link to Methods (not a static 5-step explainer claiming "real-time processing") | Sets honest expectations | LOW | CAP-52 redesign |
| Optional recording-context capture (time of day, depth, sample rate auto-read from WAV header) with a band-limited-input warning | Strengthens the evidence a researcher can use to interpret their own result; WAV header is already readable client-side | LOW-MEDIUM | CAP-N17; optional field, not a blocker |

### 4. Atlas & navigation

**Why a locator, not a hero map:** with 54 points inside 7 tight clusters, a full-bleed world map is mostly empty ocean (`DATA-MODEL.md` §2, `REFERENCE-PLATFORMS.md` §0/§1). The scale that *is* right for 54 entities is the one almost every reference misses — a station-network model like BirdWeather or NOAA Coral Reef Watch's 219 virtual stations, where every site is a real page.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single-engine site map (locator role), region fly-to, reduced-motion aware | Consolidating 3 map renderers on 2 tile providers into one | MEDIUM | CAP-53, CAP-54, CAP-59 consolidated onto MapLibre (`STACK.md`-level decision already made) |
| Reference-vs-location-only distinction on every map/list surface | The single best-rated existing interaction idea in the audit ("good idea, poor placement") | LOW | CAP-57; preserve, reposition |
| Filters with live counts, URL-synced | Standard filter-feedback pattern (Climate TRACE "Showing X of Y") | LOW-MEDIUM | CAP-55, CAP-63 consolidated |
| Site list/table as the primary accessible interface (map is a view of it) | Explicit accessibility principle from the reference study — the table must be a first-class, not fallback, surface | MEDIUM | CAP-61, CAP-64, CAP-67, CAP-68; table/list view replaces the non-functional grid/list toggle |
| Site detail page `/sites/[id]` — status + who assigned it + what it means, source/DOI/licence, recording effort, acoustic-reference flag, nearest neighbours, paired sites at the same location | "54 sites is exactly the scale where each deserves a real page" (GFW vessel profile / Restor / CRW virtual-station pattern) | MEDIUM | CAP-N2, folds in CAP-42 (mini-map becomes a small locator here, not the result hero), CAP-64 replace, CAP-65 |
| Dataset composition view (status × country × source) | Current stats merge classes and don't sum to the total | LOW | CAP-61 redesign, CAP-N14 |
| Sound-space ↔ geography morph (same 54/48 points, animated between two layouts) | **Signature differentiator**, not table stakes — see Differentiators below | — | — |
| Beeswarm/strip range filters (not histograms) that keep each of 54 sites identifiable | — | — | See Differentiators |
| Command palette (⌘K) | — | — | See Differentiators |

### 5. Evidence & provenance

**Why this is non-negotiable here specifically:** the Core Value states the product fails if *any* number lacks provenance. CoralNet's public "backend" model-transparency page and Climate TRACE's "caveats hidden in CSV" negative lesson are the two poles this area sits between.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Provenance on every number (dataset, version, source, path to underlying data) | Core Value, non-negotiable | MEDIUM | CAP-28, CAP-44, CAP-45, CAP-46, CAP-73 consolidated into one model-card-backed component (currently 4 contradictory caveat lists) |
| Per-source data panel (counts, DOI, licence per dataset) | Current panel claims "MARRS-only, 5 countries," which is wrong | LOW | CAP-68 expand |
| "What it measures / cannot measure" content | Already the best content in the app | LOW | CAP-70; preserve, promote, link from every result |
| In-product model card (classes, training n/sites/countries, split method, leave-one-site-out evaluation, calibration, version, synthetic-data disclosure) | CoralNet's "backend" page is the most-cited credibility pattern across the reference study; directly required by Q2 | MEDIUM-HIGH | CAP-N4, CAP-72 expand; **depends on the evaluation track finishing leave-one-site-out CV and publishing results (Q2)** — cannot ship an honest version before that |
| Architecture diagram (portfolio-credibility) | Already present, needs an accuracy fix | LOW | CAP-71; preserve |
| Credits | — | LOW | CAP-75; consolidate into footer/about |
| System status indicator (API health, data version, model version) | Honesty baseline | LOW | CAP-69, CAP-N19 |
| Citation generator (BibTeX/APA per dataset) | OPUS/ecoSound-web and Ocean+ Habitats both make versioned citation text a first-class control ("insert month/year of version downloaded") | LOW | CAP-N15 (citation half) |

### 6. Persistence & sharing & export

**Why URL-first, not accounts:** Q5 is explicit and the reference study confirms it's sufficient at this scale — GFW's full workspace state lives in the URL with no login, and that pattern costs almost nothing for 54 sites plus a handful of filters.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Full URL-addressable state (view, lens, selection, compare set, analysis id, playhead seconds, zoom) | Q5; GFW-grade workspace links without accounts | MEDIUM | CAP-07 expand |
| Result permalinks `/analyses/[id]` with OG image | Backend already persists completed analyses; this is pure routing | LOW | CAP-N1, CAP-11 expand |
| Export JSON/CSV with a provenance block | Every number needs "a path to the underlying data" | LOW | CAP-N15 (export half) |
| Local saved investigations/notes/history (IndexedDB/localStorage, no accounts) | Q5's differentiator half — gives return visitors continuity without any auth burden | MEDIUM | New; explicit owner decision |
| Deep-link to an exact playhead second (`?t=`) | Pattern Radio's "share a link that goes directly to that sound" | LOW | New, cheap once URL state exists |

### 7. Front door & onboarding

**Why question-led, not chat:** the question space is small and known (is it healthy? which reefs is it similar to? what can't it tell me?) — SanctSound proves this works for an acoustic program, and GNW's AI chat solves a different problem (routing across 80+ datasets) that ReefRadar doesn't have.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Question-led landing, real audio playing within 5 s | Q1; "hooks in 5 s" is an explicit success criterion | MEDIUM | CAP-06 redesign |
| Nav collapsed to ~4 items (Listen · Explore · Analyze · Methods) | Current 7 peer links with jargon labels and a duplicate hub | LOW-MEDIUM | CAP-01, CAP-02, CAP-03 redesign |
| Footer attribution/version/licence | — | LOW | CAP-04 expand |
| Inline, non-leaking status feedback (not UUID-leaking toasts) | — | LOW | CAP-12 redesign |

### 8. Accessibility

**Why this is its own area, not an afterthought:** maps, charts and audio are three of the hardest accessibility surfaces, and this product has all three as primary surfaces. The reference study's own accessibility principle (§9) is explicit: the site table is the *primary* accessible interface, not a fallback.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Text/table alternative for every chart | Non-negotiable baseline for a scientific instrument | MEDIUM | CAP-N18 |
| Keyboard model for the Listening Bench (space, ←/→ by window, band toggle, compare swap) | Standard media-accessibility practice; currently absent | MEDIUM | New |
| Status never by colour alone (shape/text redundancy, one CVD-safe ordinal palette) | 9 duplicated status colour tables today, some with 1.89:1 contrast | MEDIUM | CAP-56 redesign, CAP-85 redesign |
| Reduced-motion gated globally (CSS + motion config + per-canvas) | Partial today — spectrogram, framer transitions, bars, counters, pulses are not gated | MEDIUM | CAP-81 expand; the *principle* carries over from the retired vitality system per Q7 |
| Mobile performance gating (loop budgets, particle/canvas caps) | — | LOW | CAP-82 preserve; extend to remaining canvases |
| Graceful WebGL/Web Audio fallbacks | — | LOW | CAP-29, CAP-59; preserve |
| Audio clips get text descriptions of measured content | Screen-reader parity for the product's primary evidence type | MEDIUM | CAP-N18 |
| One token source, light scientific-editorial system, dark "wells" for spectrograms | Q8; publication-grade, print/export-friendly, preserves spectrogram colour-scale range | MEDIUM-HIGH | CAP-85 redesign |

### Supporting platform capabilities (non-user-facing, cited for CAP-ID completeness)

These are implementation plumbing, not user-visible features, but every non-retired CAP-ID must have a home per the preservation contract:

| CAP-ID | What | Home |
|--------|------|------|
| CAP-08 | React Query shared cache, 60 s stale / 30 s health poll | Supports Atlas & navigation and Evidence & provenance (fast selection, live status); preserve, extend to `/samples` |
| CAP-09 | Single `NEXT_PUBLIC_API_URL` client | Cross-cutting; consolidate (currently `/experience` hard-codes a second base) |
| CAP-10 | Security headers (nosniff, DENY framing, referrer policy) | Cross-cutting; preserve as-is |

---

## Differentiators (competitive advantage)

These are where ReefRadar should be distinctive relative to both the generic "ML demo" pattern and the generic "big map platform" pattern. All align with the Core Value (traceable, evidence-first) rather than decoration.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Sound-space ↔ geography morph (same points, animated between UMAP/PCA similarity layout and map layout) | Makes "acoustic similarity" physically visible; cheap and smooth at 54–48 points; no reference tool in the survey does exactly this for reef sound, though Earth Index (satellite embeddings) and CoralSoundExplorer (UMAP point cloud) both validate the pattern separately | HIGH | Signature interaction named in `REDESIGN-THESIS.md` §4; **depends on retrained real-audio reference embeddings (Q2)** — do not ship against the current synthetic-tainted vectors |
| Diel "soundscape fingerprint" per site and cross-site diel comparison (e.g., healthy vs degraded diel pattern side by side) | Lets a researcher ask "does the daily rhythm differ by recovery stage," a scientifically interesting question the current product cannot even pose | HIGH | Builds on the Time & effort table-stakes fingerprint; depends on MARRS ingestion + timezone verification (Q3) |
| Group-separation metric on the model page ("how distinct are healthy vs degraded in this dataset?") | An honest, falsifiable model-quality signal — CoralSoundExplorer's silhouette-index pattern is the closest domain analogue | MEDIUM | Needs the retrained embeddings and evaluation track (Q2) |
| "Flag this verdict" lightweight feedback | A minimal, low-cost trust loop (Nature Map Explorer's "preliminary output + expert feedback" ethos, Felt's pinned comments without accounts) — deliberately *not* full annotation (see Anti-Features) | LOW-MEDIUM | No storage requirement beyond a simple event log; does not imply review workflow |
| Cross-links to Allen Coral Atlas / NOAA Coral Reef Watch for the site's area | Directly answers "this is acoustic — what about the coral itself?" without ReefRadar claiming visual/bleaching data it doesn't have | LOW | Link-out only, no data ingestion |
| Query-by-example framing throughout copy and IA ("your reef, placed among the references") | Perch agile modeling / Earth Index Quick Search mental model — ReefRadar is the polished layer this research ecosystem currently lacks | LOW (mostly copy/IA, not new engineering) | Reinforces Q4; cheap relative to its credibility payoff |
| Progressive/streaming per-segment verdicts while an upload processes | Merlin's live species cards vs a spinner; replaces fabricated "Analyzing..." messages | MEDIUM | Depends on the same per-segment persistence as the window strip |
| Curated question chips that open pre-configured instrument states, plus a short guided audio tour that drives the live explorer | SanctSound's question-first IA + Pattern Radio's "tour drives the real explorer, never a separate microsite" | MEDIUM | Content-heavy; needs domain review of sound descriptions before shipping |
| Command palette (⌘K: jump to site, compare X vs Y, open upload, change lens) | Cheap (`cmdk`), useful for repeat/analyst users, never the only path | LOW | Explicitly rated low-priority-but-cheap in `REFERENCE-PLATFORMS.md` §3 |
| Beeswarm/strip range filters that keep each of 54 sites individually identifiable | A histogram of 54 values is ~10 noisy bins; GFW Marine Manager's histogram pattern doesn't fit this n | MEDIUM | Apply to similarity/confidence/P(class), not raw site counts |

---

## Anti-Features (commonly expected elsewhere, deliberately not building)

Several of these are standard in the PAM-tool landscape surveyed (annotation, species ID, long-run trend charts) but are explicitly wrong for *this* product at *this* data scale and maturity. Each is cited to the owner decision or data finding that rules it out.

| Feature | Why Requested / Expected Elsewhere | Why Problematic Here | Alternative |
|---------|---------------------------------|----------------------|-------------|
| User accounts, server-side shared workspaces, full annotation/review tooling (à la Raven Pro, Arbimon box-tagging, Whombat, BirdNED review-and-retrain loop) | Table stakes in dedicated PAM annotation software; researchers expect to verify and correct detections | Adds auth, privacy and hosting-cost burden not justified at this stage (explicit owner decision, Out of Scope); ReefRadar is a listening/evidence instrument, not an annotation platform this milestone | Lightweight "flag this verdict" (see Differentiators); defer real annotation to a future milestone if demand appears |
| Species identification from sound (grouper booms, parrotfish grazing, clownfish, etc.) | Users naturally want to know "what fish is that" (Merlin, BirdNET normalize this expectation) | The data cannot support it — band energy and embeddings are not species labels; `DATA-MODEL.md` §6 explicitly forbids this claim | Named, cited frequency-band table ("fish calls <1–2 kHz," "snapping shrimp 2–8 kHz") with an explicit "not species ID" caveat |
| Continuous "health score" / vitality mapping from predicted label or crossfade position | Emotionally satisfying, intuitive-feeling UI (the legacy vitality system) | Ordinal labels are not a continuous health measure; a prediction-driven score misrepresents both confidence and OOD status — Core Value violation | Ordinal recovery-ladder presentation with explicit definitions per rung; "sounds most like X" phrasing, never a score |
| Vitality store / colour engine / background particles & caustics / decorative "living spectrogram" | Was the entire v1.0 visual identity; atmospheric/emotional UI is common in nature-data products (Half-Earth globe, donor microsites) | Label-driven decoration directly conflicts with Core Value (a verdict must never be dressed up as more certain than it is); always-on rAF loops hurt performance on every route | Real audio + real spectrograms + the recovery ladder carry the emotional weight; CAP-25, CAP-47, CAP-76–80, CAP-83, CAP-84 retired by Q7 (CAP-81 reduced-motion and CAP-82 mobile-gating *principles* carry over to the surfaces that remain) |
| Absolute loudness / SPL comparison across sources | Users intuitively compare "how loud" between clips | No hydrophone calibration exists for MARRS peak-normalised clips or for any user upload; an absolute-loudness claim would be fabricated (`DATA-MODEL.md` §4.1, §4.2) | Disclose that all comparisons are relative/within-clip; offer a "raw level" toggle for analysts without claiming calibration |
| Multi-year / seasonal trend charts, "recovery trajectory" line over time | Standard expectation from any monitoring dashboard (Coral Reef Watch time series, Ocean Health Index trend lines) | Each MARRS site has exactly one ~1-month deployment; there is no within-site seasonality or multi-year series to show — a trend line here would be invented (`DATA-MODEL.md` §3.1) | Restoration stage as an explicit ordinal *ladder* across different sites, never plotted as a time series |
| Calendar-scale, GFW-style multi-year timebar | The signature interaction of the closest "serious monitoring platform" reference (Global Fishing Watch) | ReefRadar has no calendar time series worth a GFW timebar — explicitly assessed and rejected in `REFERENCE-PLATFORMS.md` §3 | Within-recording playhead/window strip + diel fingerprint + recording-effort calendar (area 2) — three honest, smaller time views instead of one dishonest big one |
| AI chat box as the primary entry point | The 2025–2026 trend (Global Nature Watch/Horizon, many "ask anything" dashboards) | Invites unanswerable questions (bleaching, species, trends) the data cannot support; ReefRadar has one model and one reference set, not 80+ datasets needing a routing agent | Curated question cards opening pre-configured instrument states (explicit Out of Scope item, `REFERENCE-PLATFORMS.md` finding 9) |
| Scroll-driven cinematic microsite / narrative-as-information-architecture | Donor- and portfolio-facing conservation sites often use this register (the explicit negative reference, Room 302/"Mapping Resilience") | Locks interaction behind scrolling, competes with the data for attention, and the owner explicitly rejected this direction | Short, skippable curated-question entry and an optional guided tour that *drives* the real explorer, never wraps it |
| Persona-based entry (6+ personas, à la Climate Central) | A common pattern for broad, multi-audience tools | ReefRadar has at most two implicit modes (researcher, curious visitor) and even those are better served as entry questions than persona pages | Question-led landing; Methods page serves the researcher depth directly |
| In-browser model inference / WebGPU | Feels modern, removes a server round-trip | Over-engineering at this data scale; explicit Out of Scope item backed by `TECH-LANDSCAPE.md` | Server-side Lambda inference, already built |
| Pin clustering on the site map | Standard map UX at scale (Restor clusters 130,000 sites) | Hides meaningful entities at n=54 — the opposite problem clustering solves | Show all 54 points; offset overlaps within a cluster instead |
| Dark theme as the default this milestone | Many "instrument" products (and the prior v1.0 thesis) default dark | Not required this milestone (Q8); building it now is scope the owner didn't ask for | Light scientific-editorial system with dark "wells" only around spectrogram/waveform canvases; tokens must not preclude a future dark theme |

---

## Feature Dependencies

```
[Truth pass: remove synthetic audio + classes]
    └──requires──> [Real, attributed sample gallery]           (area 1, table stakes)
    └──requires──> [Honest embedding projection / sound-space] (area 3/4, differentiator)
    └──requires──> [In-product model card]                     (area 5, table stakes)

[Retrained classifier on real data only, leave-one-site-out eval] (Q2)
    └──requires──> [Per-window readings with abstain]          (area 3)
    └──requires──> [Training-coverage indicator]                (area 3)
    └──requires──> [Sound-space ↔ geography morph]              (differentiator)
    └──requires──> [Group-separation metric]                    (differentiator)
    └──requires──> [In-product model card w/ confusion matrix]  (area 5)

[Per-segment probability persistence]  (small backend change, independent of retrain)
    └──requires──> [Within-recording window strip]              (area 2)
    └──requires──> [Per-window readings with abstain]            (area 3)
    └──requires──> [Progressive streaming verdicts]              (differentiator)

[MARRS timestamped-audio ingestion + timezone verification]  (Q3, Data & Model track)
    └──requires──> [Diel soundscape fingerprint]                 (area 2)
    └──enhances──> [Cross-site diel comparison]                  (differentiator)

[MARRS sonotype-detection ingestion, ~66 GB]  (Q3)
    └──requires──> [Detection timeline]                          (area 2)

[manifest.csv ingestion]  (Q3, cheap — no embeddings/retrain needed)
    └──requires──> [Recording-effort calendar]                   (area 2)

[Presigned S3 upload + rate limiting]  (Q6, independent of data track)
    └──requires──> [Public uploads with guardrails]              (area 3)

[URL-complete state (nuqs)]  (Q5, independent)
    └──requires──> [Result permalinks]                            (area 6)
    └──requires──> [Deep-link to playhead second]                 (area 6)
    └──enhances──> [Local saved investigations]                   (area 6)

[South Sulawesi audio shipped to S3]  (fixes CAP-24, independent of retrain)
    └──requires──> [Paired recovery-ladder comparison]            (area 1)

[Site metadata expansion: DOI, licence, recording effort]  (cheap, independent)
    └──requires──> [Site detail pages]                            (area 4)

[Vitality system retirement]  (Q7)
    └──conflicts──> [Any label-driven ambient/colour feature]
    └──enhances──> [Reduced-motion/mobile-gating principles reapplied to remaining canvases]
```

### Dependency notes

- **The retrained classifier (Q2) is the single largest fan-out dependency.** Five features across three capability areas — abstain states, training coverage, the sound-space morph, the separation metric, and the full model card — cannot ship *honestly* against the current embeddings, because those embeddings include synthetic `restored_mid` training data (`DATA-MODEL.md` F2) and an unverified deployed model version. The roadmap should sequence the truth pass + retrain before any of these five.
- **Per-segment persistence is cheap and independent of the retrain.** It only requires keeping the per-window outputs the classifier already computes in memory (`classifier/handler.py:88-99`) instead of discarding them after averaging — this can and should ship early, unblocking three features without waiting on the Data & Model track's larger ingestion work.
- **The diel fingerprint and detection timeline are the two most expensive Time & Effort features** and both gate on large ingestion jobs (timestamped audio, sonotype detections respectively) that are explicitly in scope per Q3 but should be the Data & Model track's headline deliverables, not an incidental side effect.
- **Several table-stakes items have zero data dependency and should ship first**: result permalinks (backend already persists analyses), playback of the user's own upload (dead code exists, just needs wiring), recording-effort calendar (cheap CSV ingestion), and the recovery-ladder comparison (audio-hosting fix only).
- **The vitality retirement (Q7) is a hard conflict, not a soft preference.** No new feature in any area should derive colour, motion, or ambience from a predicted label — only from measured audio (the one surviving input, CAP-78's "real audio-reactive bridge," is itself retired as a vitality-system component, but the *principle* that any future sound-reactive surface must be measurement-driven, never label-driven, carries forward).

---

## MVP Definition

Framed against this milestone's actual scope (a brownfield redesign, not a from-scratch v1): "Launch" = credible to ship as the new public instrument and dashboard this milestone. "v1.x" = natural fast-follow if time runs short within the same milestone. "v2+" = explicitly deferred, matching `REDESIGN-THESIS.md` §10's "analyst extras (defer)."

### Launch With (this milestone)

- [ ] Real, attributed sample gallery — synthetic audio is a Core Value violation, not a quality gap
- [ ] Truth pass: synthetic audio and synthetic-trained classes removed, deployed model verified
- [ ] Retrained classifier on real data only, leave-one-site-out evaluation, published model card
- [ ] Per-window readings with abstain, raw probabilities (sum to 100), training-coverage indicator
- [ ] Canonical frequency-band filters, real spectrograms, paired recovery-ladder comparison (fixes CAP-24)
- [ ] Within-recording playhead/window strip
- [ ] Recording-effort calendar, diel soundscape fingerprint, detection timeline (Data & Model track)
- [ ] Presigned upload with guardrails; pre-upload preview/spectrogram; honest embedding projection
- [ ] Site detail pages, dataset composition view, single-engine locator map
- [ ] In-product model card, consolidated caveats, per-source provenance panel
- [ ] Full URL-complete state, result permalinks, export with provenance, local saved investigations
- [ ] Question-led landing with real audio within 5 s, 4-item nav
- [ ] Accessibility baseline: text/table chart alternatives, keyboard bench model, CVD-safe ordinal status, global reduced-motion gating, light scientific-editorial token system

### Add After Validation (v1.x, same milestone if time allows)

- [ ] Sound-space ↔ geography morph (signature differentiator; ship once retrained embeddings exist)
- [ ] Cross-site diel comparison, group-separation metric on the model page
- [ ] "Flag this verdict" feedback loop
- [ ] Command palette
- [ ] Guided audio tour that drives the live explorer
- [ ] Cross-links to Allen Coral Atlas / Coral Reef Watch

### Future Consideration (v2+)

- [ ] Full annotation/review tooling (box-tagging, expert-confirm workflow) — only if real researcher demand appears; conflicts with the no-accounts decision as specified
- [ ] Spectrogram parameter controls (window size, colormap, dynamic range) for analyst users
- [ ] Acoustic indices beyond basic band energy (ACI, ADI, NDSI) — cheap to compute but no current consumer feature needs them yet
- [ ] Dark theme (tokens must not preclude it, per Q8)
- [ ] Beeswarm/strip range filters, low-confidence "listening queue" (Renumics pattern)
- [ ] Multi-language support

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Real, attributed sample gallery | HIGH | MEDIUM | P1 |
| Truth pass (synthetic audio/class removal, model verification) | HIGH | MEDIUM | P1 |
| Retrained classifier + leave-one-site-out eval + model card | HIGH | HIGH | P1 |
| Per-window readings + abstain + raw probabilities | HIGH | MEDIUM | P1 |
| Recovery-ladder paired comparison (fix CAP-24) | HIGH | MEDIUM | P1 |
| Recording-effort calendar | MEDIUM-HIGH | LOW | P1 |
| Diel soundscape fingerprint | HIGH | HIGH | P1 |
| Detection timeline (sonotypes) | MEDIUM-HIGH | HIGH | P1 |
| Presigned upload with guardrails | HIGH | MEDIUM | P1 |
| Honest embedding projection (PCA on retrained vectors) | HIGH | MEDIUM-HIGH | P1 |
| Site detail pages | HIGH | MEDIUM | P1 |
| In-product model card | HIGH | MEDIUM | P1 |
| Full URL-complete state + result permalinks | HIGH | MEDIUM | P1 |
| Local saved investigations | MEDIUM | MEDIUM | P1 |
| Question-led landing, 5 s audio hook | HIGH | MEDIUM | P1 |
| Accessibility baseline (text alternatives, keyboard, CVD-safe status) | HIGH | MEDIUM | P1 |
| Sound-space ↔ geography morph | HIGH (differentiator) | HIGH | P2 |
| Cross-site diel comparison | MEDIUM | MEDIUM | P2 |
| Group-separation metric | MEDIUM | LOW-MEDIUM | P2 |
| "Flag this verdict" | LOW-MEDIUM | LOW | P2 |
| Command palette | LOW-MEDIUM | LOW | P2 |
| Guided audio tour | MEDIUM | MEDIUM | P2 |
| Cross-links to Allen Coral Atlas / CRW | LOW-MEDIUM | LOW | P2 |
| Full annotation/review tooling | MEDIUM (for researchers) | HIGH | P3 |
| Spectrogram parameter controls | LOW-MEDIUM | MEDIUM | P3 |
| Acoustic indices beyond band energy | LOW | LOW-MEDIUM | P3 |
| Dark theme | LOW | MEDIUM | P3 |
| Beeswarm/strip filters | LOW-MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have — Core Value or explicit Active requirement in `PROJECT.md`
- P2: Should have — differentiators that strengthen credibility and distinctiveness, add once P1 is stable
- P3: Explicitly deferred per `REDESIGN-THESIS.md` §10 "analyst extras"

---

## Reference-platform patterns adopted (condensed)

Full detail in `REFERENCE-PLATFORMS.md` §1–§4; this is the feature-to-pattern crosswalk only.

| Feature area | Closest reference pattern | ReefRadar's adaptation |
|---------------|---------------------------|-------------------------|
| Listen & compare | MBARI Listening Room, SanctSound, Calling in our Corals | Real audio, attribution, honesty notices — no gamification |
| Time & effort | Arbimon soundscape heatmap, SanctSound "where/when," LDFC false-colour spectrograms | Diel fingerprint + effort calendar + detection timeline, no calendar-scale timebar |
| Analysis-as-search | Perch agile modeling, Earth Index Quick Search, BirdWeather "verify it yourself" | Upload = query vector; ranked, playable, listenable neighbours with abstain |
| Atlas & navigation | NOAA Coral Reef Watch virtual stations, BirdWeather station network, Restor site profile | Locator map + per-site page; no clustering, no globe-as-hero |
| Evidence & provenance | CoralNet "backend" model page, Ocean+ Habitats versioned citations | One model card, one caveat source, per-clip attribution |
| Persistence & sharing | Global Fishing Watch URL-complete workspaces | Same pattern, no accounts |
| Front door & onboarding | SanctSound question-first IA, Pattern Radio expert tours | Curated questions + tour-drives-explorer, never a chat box or microsite |
| Accessibility | REFERENCE-PLATFORMS §9 principles (table-as-primary-interface, text alternatives) | Applied as a standing constraint, not a bolt-on pass |

---

## Sources

- `.planning/audit/CAPABILITY-MATRIX.md` — 86-row preservation contract (anti-regression baseline for every CAP-ID cited above)
- `.planning/audit/DATA-MODEL.md` §8 (lenses), §9 (gaps and cheap additions) — what the data can honestly support
- `.planning/research/REFERENCE-PLATFORMS.md` — 40-product interaction study (SanctSound, Arbimon, CoralSoundExplorer, Pattern Radio, Perch agile modeling, BirdWeather, CoralNet, NOAA Coral Reef Watch, MBARI, Renumics, Earth Index, and others)
- `.planning/research/DRIVING-QUESTIONS.md` — Q1–Q9 owner decisions that gate scope in every area above
- `.planning/research/REDESIGN-THESIS.md` — product model, IA, roadmap sketch
- `.planning/PROJECT.md` — Active/Out-of-Scope requirements this feature set must satisfy
- Web search (2026-09-30): long-duration false-colour ("LDFC") spectrogram / diel soundscape-fingerprint convention in ecoacoustics (confirms area 2's table-stakes claim independent of the given reference list)
- Web search (2026-09-30): BirdNET Analyzer GUI review/verify workflow and confidence-threshold tradeoffs (confirms the annotation/review convention explicitly ruled an anti-feature for this milestone, and grounds the "flag this verdict" differentiator as a deliberately lighter-weight substitute)

---
*Feature research for: ReefRadar v2 reef-soundscape research instrument*
*Researched: 2026-09-30*
