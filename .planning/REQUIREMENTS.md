# Requirements: ReefRadar v2 — Reef Soundscape Research Instrument

**Defined:** 2026-09-30
**Core Value:** Every sound, label and number shown is real, traceable to its source, and honestly qualified — and a visitor can hear a real reef within seconds.

**Sources:** `.planning/research/FEATURES.md` (table stakes + owner-decided scope), `.planning/audit/CAPABILITY-MATRIX.md` (CAP-IDs in brackets = preservation contract rows this requirement satisfies), `.planning/research/DRIVING-QUESTIONS.md` (Q1–Q9), `.planning/research/ARCHITECTURE.md`, `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`.

## v1 Requirements

### Truth & Reproducibility (TRUTH)

- [x] **TRUTH-01**: A fresh clone of the repository builds and runs the dashboard without any uncommitted local files (gallery and samples sources committed) [CAP-13, CAP-14]
- [x] **TRUTH-02**: Every deployed Lambda (including the `/samples` route) is built from source in the repository, and a drift check confirms deployed code matches git
- [x] **TRUTH-03**: No synthetic audio is served anywhere in the product; every playable clip is a real recording from a cited dataset
- [x] **TRUTH-04**: No sample or site references a location absent from the reference dataset (e.g. `phl_D1` removed), and sample labels match site labels (e.g. `aus_R1`)
- [x] **TRUTH-05**: The deployed classifier's version, classes and training data are verified and recorded; any class trained on synthetic audio is removed from the live model until retrained on real data
- [x] **TRUTH-06**: Displayed class probabilities are unmodified model probabilities that sum to 100% (region multipliers removed from probabilities) [CAP-38]
- [x] **TRUTH-07**: Descriptive copy makes no claims the system did not measure (no species claims, no fabricated crossfade states, no scripted processing messages) [CAP-17, CAP-26, CAP-36]
- [x] **TRUTH-08**: Dataset citations, DOIs, author lists and model paper references are corrected and consistent everywhere (MARRS Williams et al. 2025; SurfPerch arXiv 2404.16436; Irma DOI) [CAP-74]
- [x] **TRUTH-09**: Dataset-specific labels are presented with who assigned them and what they mean (e.g. Bora-Bora disturbance types are not shown as "degraded" health; post-hurricane vector not labelled healthy)
- [x] **TRUTH-10**: Visual, accessibility and bundle-size baselines of the current app are captured before redesign work begins

### Data Contract (CONTRACT)

- [x] **CONTRACT-01**: A versioned, immutable data contract (dataset version + model version + preprocessing-spec version + schemas) is published to CDN-served storage and is the only source of reference data for the web app
- [x] **CONTRACT-02**: Contract v1 freezes the current real (post-truth-pass) 54-site data with full provenance per site (source, DOI, licence, label definition, acoustic-reference vs location-only)
- [x] **CONTRACT-03**: The contract schema declares coverage flags (diel, detections, pre/post event, effort) so time features can ship dormant and activate on a later contract publish without a redeploy
- [x] **CONTRACT-04**: Every analysis result, export and shared URL pins the dataset, model and preprocessing versions it was produced with, and resolves that exact version on load
- [x] **CONTRACT-05**: UI development runs against contract fixtures so UI phases are never blocked by data ingestion

### Data Ingestion (DATA)

- [ ] **DATA-01**: An AWS budget ceiling and budget alarm exist before any batch transfer or compute job is submitted
- [ ] **DATA-02**: MARRS filename timestamps are verified (timezone established) and documented before any time-of-day aggregate is produced
- [ ] **DATA-03**: MARRS recording manifest (files, deployment windows, duty cycle per site) is ingested
- [ ] **DATA-04**: MARRS timestamped audio (~542k one-minute files) is transferred cloud-to-cloud into S3 with checksums and a resumable manifest
- [ ] **DATA-05**: MARRS sonotype detections (15 sound types) are ingested into a queryable columnar store
- [ ] **DATA-06**: Hurricane Irma pre/post recordings are ingested with `period: pre|post` and status `unknown` (never relabelled as health)
- [ ] **DATA-07**: A pilot shard measures embedding throughput and cost before the full batch embedding job runs
- [ ] **DATA-08**: All ingested audio is windowed and embedded with the shared preprocessing library, producing per-window embeddings with full provenance
- [ ] **DATA-09**: Precomputed aggregates (per site × hour-of-day, per site × date, detection counts, recording effort, reference spectrogram images, projection coordinates) are published in the data contract

### Model & Evaluation (ML)

- [ ] **ML-01**: One shared audio-preprocessing library (anti-aliased resampling, consistent normalization, 5 s windowing) is used by both offline jobs and the live analysis Lambdas (train/serve parity)
- [ ] **ML-02**: The live pipeline classifies each 5 s window individually (never a mean-pooled embedding) and persists per-window probabilities and similarities
- [ ] **ML-03**: The classifier is evaluated with leave-one-site-out (grouped) cross-validation with bootstrap confidence intervals, per class and per region
- [ ] **ML-04**: SurfPerch and Perch 2.0 embeddings are compared under the same grouped evaluation and the better-supported model is chosen with recorded rationale
- [ ] **ML-05**: The classifier is retrained on real data only (no synthetic samples), calibrated, and given an explicit abstain threshold
- [ ] **ML-06**: Out-of-distribution status is computed from distance to training data and reported separately from class probabilities
- [ ] **ML-07**: Model artifacts, metrics and a model card are published as a versioned release and deployed to the live classifier
- [ ] **ML-08**: Similarity to all reference sites (not only top-3) and projection coordinates (PCA of reference embeddings with explained variance) are returned for every analysis

### Platform & Engineering (PLAT)

- [x] **PLAT-01**: Dashboard runs on Next.js 16 / React 19 with legacy routes still functional during migration
- [x] **PLAT-02**: Duplicate stacks are removed: one map engine (MapLibre), one chart approach (Observable Plot + d3), no unused dependencies (wavesurfer, deck.gl, Leaflet, recharts, Streamlit dashboard) [CAP-86]
- [ ] **PLAT-03**: New code lives in feature modules with a lint fence preventing imports from legacy components
- [x] **PLAT-04**: Unit, component, end-to-end, accessibility (axe) and screenshot visual-regression tests run in CI on every push
- [ ] **PLAT-05**: Uploads go directly to S3 via presigned URL with server-enforced size and duration caps (60 s at 96 kHz succeeds)
- [ ] **PLAT-06**: The public API enforces rate limits on upload and analyze, and upload filenames are sanitized
- [ ] **PLAT-07**: Analysis progress is driven by real pipeline stages from `/status`, with backoff and cancel [CAP-35, CAP-36]
- [ ] **PLAT-08**: Route performance budgets are enforced: instrument LCP < 2.0 s on mid-tier mobile, select/hover/scrub interaction < 100 ms, no animation loops running while idle
- [ ] **PLAT-09**: Error monitoring and web-vitals reporting are in place for production
- [ ] **PLAT-10**: A single API client honours the configured API base URL across all flows [CAP-09]; React Query caching preserved [CAP-08]; security headers preserved [CAP-10]

### Design System (DS)

- [ ] **DS-01**: A single token source (Tailwind v4 CSS-first) defines the light scientific-editorial system — typography, spacing, surfaces, rules, radii, elevation, focus — consumed by UI, map style and chart scales [CAP-85]
- [ ] **DS-02**: One CVD-validated ordinal palette encodes degraded → restored_early → restored_mid → healthy, with a distinct neutral for unknown, never reused as UI accent, always paired with shape or text [CAP-56]
- [ ] **DS-03**: Spectrograms and waveforms render in dark "wells" with a documented, perceptually uniform colour scale and dB colourbar
- [ ] **DS-04**: Accessible primitives (React Aria Components) cover dialog, sheet, listbox, table, range/dual-range slider, toggle group, tooltip, command palette
- [ ] **DS-05**: Instrument components exist as reusable primitives: Transport, Spectrogram, WindowStrip, BandToggle, CompareRow, ProvenanceChip/Why panel, StripPlot, ProbabilityBar (with abstain), DataTable, Legend (data-driven, with counts), Empty/Error/Loading states
- [ ] **DS-06**: Motion is limited to continuity (selection, layout morph, playhead, view transitions) and fully respects reduced-motion [CAP-81]
- [ ] **DS-07**: The bioluminescent vitality system (vitality store, colour engine, background canvas, caustics/particles, decorative spectrogram, dev vitality panel) is removed [CAP-25, CAP-47, CAP-76–80, CAP-83, CAP-84 retired by Q7]
- [ ] **DS-08**: A dev-only fixtures route renders every primitive in every state for visual review

### Listen & Compare (LISTEN)

- [ ] **LISTEN-01**: A visitor hears a real, attributed reef recording within 5 seconds of landing [CAP-06, CAP-13, CAP-15]
- [ ] **LISTEN-02**: Every audio surface shows per-clip attribution: dataset, site, recording time, DOI, licence [CAP-28]
- [ ] **LISTEN-03**: Every clip has a real spectrogram with time, frequency and dB axes appropriate to its sample rate [CAP-21]
- [ ] **LISTEN-04**: User can isolate frequency bands (fish / grazing / snapping shrimp) using real filtering defined by one cited band table, on every playback surface [CAP-23]
- [ ] **LISTEN-05**: User can compare two or three clips side by side (A/B/C) with level-matched playback and a disclosure of how levels were normalized [CAP-20, CAP-22, CAP-30]
- [ ] **LISTEN-06**: User can listen to the South Sulawesi recovery ladder — degraded, restored <3 months, restored 32–53 months, healthy — at one location, with each rung's definition shown and no implied continuous trajectory [CAP-24, CAP-27]
- [ ] **LISTEN-07**: Each comparison discloses recording site, date and time of day so confounds are visible [CAP-27]
- [ ] **LISTEN-08**: Clip metadata distinguishes reference labels (assigned by dataset authors) from model readings in wording and styling [CAP-16]
- [ ] **LISTEN-09**: Playback degrades gracefully when Web Audio is unavailable and respects browser autoplay policy [CAP-29, CAP-30]

### Time & Effort (TIME)

- [ ] **TIME-01**: The listening bench shows a playhead and a strip of 5 s windows coloured by model reading with opacity by confidence, synchronized with the spectrogram
- [ ] **TIME-02**: Each site shows a recording-effort calendar (deployment window, duty cycle, days recorded)
- [ ] **TIME-03**: Each MARRS site shows a diel "soundscape fingerprint" (time-of-day pattern across the deployment)
- [ ] **TIME-04**: User can compare diel fingerprints of sites side by side (e.g. healthy vs degraded at one location)
- [ ] **TIME-05**: Each MARRS site shows a detection timeline for the 15 sonotypes over its deployment
- [ ] **TIME-06**: User can compare Hurricane Irma pre- and post-event recordings for the same reef
- [ ] **TIME-07**: Time selections (playhead second, hour-of-day, date range) are shared state that synchronize all views and appear in the URL

### Analysis as Search (ANLZ)

- [ ] **ANLZ-01**: User can upload a WAV recording (drag/drop or keyboard-accessible browse) with client-side checks for format, size and duration (5 s – 10 min) before upload [CAP-31]
- [ ] **ANLZ-02**: User can preview and play their recording with a live spectrogram before submitting [CAP-32]
- [ ] **ANLZ-03**: User can optionally provide coordinates by map click or validated entry, with a plain explanation of what providing them changes [CAP-33, CAP-34]
- [ ] **ANLZ-04**: The result shows the recording placed among references: nearest reference sites ranked, each playable, with similarity shown as rank among all references [CAP-41]
- [ ] **ANLZ-05**: The result shows per-window readings with agreement (e.g. "7 of 9 windows nearest healthy references") and an explicit "can't tell" state [CAP-37]
- [ ] **ANLZ-06**: Class probabilities appear as secondary evidence, integer percentages summing to 100, only for classes the model has [CAP-38]
- [ ] **ANLZ-07**: Training coverage for the recording's region (training clips/sites from that region, or "location not provided") is shown separately from probabilities [CAP-39, CAP-40]
- [ ] **ANLZ-08**: User can play back their own uploaded recording in the result and A/B it against the nearest reference [CAP-50, CAP-51]
- [ ] **ANLZ-09**: The result shows the recording's position in sound-space (honest projection) among reference sites [CAP-43]
- [ ] **ANLZ-10**: Failures show the stage, an actionable suggestion and a copyable request id; user can retry or analyze another recording [CAP-48, CAP-49]
- [ ] **ANLZ-11**: Upload requirements are stated inline next to the uploader with a link to Methods [CAP-52]
- [ ] **ANLZ-12**: Sample clips have precomputed analyses viewable instantly with the same result view as uploads ("Analyze this" truly analyzes) [CAP-18, CAP-19]

### Atlas & Navigation (ATLAS)

- [ ] **ATLAS-01**: One instrument workspace combines the Atlas, a persistent Inspector, and the Listening Bench; selecting an entity anywhere updates all three
- [ ] **ATLAS-02**: The Atlas map shows all sites on one MapLibre engine with semantic zoom (world → project clusters with counts → individual sites with overlap offsets), region fly-to and reduced-motion support [CAP-53, CAP-54, CAP-59, CAP-62]
- [ ] **ATLAS-03**: The Atlas can switch between geographic and sound-space layouts of the same sites, animating between them
- [ ] **ATLAS-04**: Every map and list distinguishes acoustic-reference sites from location-only sites [CAP-57]
- [ ] **ATLAS-05**: User can filter sites by status, restoration stage, country/cluster, dataset and evidence availability, with live counts, shared between map and list, synced to the URL [CAP-55, CAP-60, CAP-63]
- [ ] **ATLAS-06**: A sortable, keyboard-navigable site table is a first-class view of the same data as the map [CAP-61, CAP-64, CAP-66 replacement]
- [ ] **ATLAS-07**: The Inspector shows the selected cluster, site, clip, analysis or dataset with provenance, replacing popups [CAP-58]
- [ ] **ATLAS-08**: Navigation is reduced to Listen · Explore · Analyze · Methods with an accessible mobile menu (Escape, focus management, aria state) [CAP-01, CAP-02, CAP-03]
- [ ] **ATLAS-09**: A command palette jumps to sites, clusters, clips, questions and methods topics

### Evidence & Provenance (EVID)

- [ ] **EVID-01**: Each site has a page `/sites/[id]`: label and who assigned it, label definition, dataset/DOI/licence, location, recording effort, acoustic-reference flag, clips, nearest acoustic neighbours, paired sites at the same location, external map link [CAP-64, CAP-65, CAP-42, CAP-N2]
- [ ] **EVID-02**: Every displayed number offers a provenance view: source, version, unit, method, and a path to the underlying data
- [ ] **EVID-03**: A Methods page presents the model card (classes, training data, grouped evaluation with intervals, calibration, abstain rule, version, known gaps, synthetic-data history), "what it measures / cannot measure", the canonical band table, and limitations — the single source for every caveat shown in context [CAP-44, CAP-45, CAP-46, CAP-70, CAP-72, CAP-73]
- [ ] **EVID-04**: A datasets view lists each source with site counts, DOI, licence, recorder and sample rate, and dataset composition by status × country × source [CAP-61, CAP-68]
- [ ] **EVID-05**: An About page presents the project, an accurate keyboard-accessible architecture diagram and credits [CAP-71, CAP-75]
- [ ] **EVID-06**: A footer shows dataset attribution, licence, data/model versions and live API status with an honest last-checked time [CAP-04, CAP-69]
- [ ] **EVID-07**: User can copy citations (BibTeX/APA) for each dataset and for the model release

### Persistence, Sharing & Export (PERSIST)

- [ ] **PERSIST-01**: All instrument view state (layout, lens, filters, selection, compare set, analysis id, playhead second, zoom) is encoded in the URL and restored on load [CAP-07]
- [ ] **PERSIST-02**: Every completed analysis has a permalink `/analyses/[id]` with per-route metadata and a link-preview image [CAP-11, CAP-N1]
- [ ] **PERSIST-03**: User can export a result or the site list as JSON/CSV including a provenance block with pinned versions
- [ ] **PERSIST-04**: User can save named investigations with notes locally (no account) and reopen them later
- [ ] **PERSIST-05**: User can see and reopen recent analyses and views from local history
- [ ] **PERSIST-06**: Status feedback is inline and never exposes internal identifiers except copyable request ids on errors [CAP-12]

### Front Door (FRONT)

- [ ] **FRONT-01**: The landing page is question-led: curated questions open pre-configured instrument states [CAP-06]
- [ ] **FRONT-02**: A curated, real-audio sample collection is organized into stories built from honest comparisons (e.g. one location's recovery ladder) [CAP-13]
- [ ] **FRONT-03**: A short optional guided tour drives the live instrument (never a separate scroll-driven microsite)

### Accessibility & Responsive (A11Y)

- [ ] **A11Y-01**: Every chart and map has a text summary and a data-table alternative
- [ ] **A11Y-02**: The listening bench is fully keyboard operable (play/pause, step by window, band toggles, compare swap) with visible focus
- [ ] **A11Y-03**: Status is never conveyed by colour alone; all text meets WCAG 2.2 AA contrast
- [ ] **A11Y-04**: Each clip has a text description of its measured content for screen-reader users
- [ ] **A11Y-05**: Reduced motion is honoured globally (CSS, motion library, every canvas) [CAP-81]
- [ ] **A11Y-06**: Desktop and tablet layouts are first-class; on phones the instrument transforms into focused sheets supporting listening, viewing results and sharing, with touch targets ≥ 44 px [CAP-82, CAP-83 touch behaviour]
- [ ] **A11Y-07**: Zero serious or critical axe violations on all routes, verified in CI

### Migration & Capability Preservation (MIGR)

- [ ] **MIGR-01**: Every non-retired row of CAPABILITY-MATRIX has a verified home in the new IA before its legacy route is removed
- [ ] **MIGR-02**: Legacy routes (`/dashboard`, `/dashboard/*`, `/experience`, `/sites` list) redirect to their new homes after retirement
- [ ] **MIGR-03**: A final capability-matrix regression walk and visual review pass across all routes and breakpoints is completed before milestone ship

## v2 Requirements

Deferred to a future milestone. Tracked but not in current roadmap.

### Analyst Extras

- **ANLX-01**: Spectrogram parameter controls (window, colormap, dynamic range)
- **ANLX-02**: Acoustic indices (ACI, ADI, NDSI) as descriptive, non-health features
- **ANLX-03**: Beeswarm/strip range filters over similarity/confidence
- **ANLX-04**: Low-confidence "listening queue" for review
- **ANLX-05**: Window-level similarity search over all ingested windows (LanceDB)

### Feedback & Collaboration

- **COLLAB-01**: "Flag this reading" feedback with lightweight server event log
- **COLLAB-02**: Annotation/review tooling (requires accounts decision)

### Experience

- **EXP-01**: Dark theme
- **EXP-02**: Cross-links to Allen Coral Atlas / NOAA Coral Reef Watch for each site's area
- **EXP-03**: Group-separation metric on the model page
- **EXP-04**: Progressive streaming per-window readings while an upload processes
- **EXP-05**: Multi-language support

## Out of Scope

| Feature | Reason |
|---------|--------|
| User accounts / server-side shared workspaces | Owner decision Q5 — URL + local persistence only |
| Bioluminescent vitality / label-driven ambience | Owner decision Q7 — conflicts with Core Value |
| Species identification | Data cannot support it (DATA-MODEL §6) |
| Continuous health score, coral cover, bleaching | Data cannot support it; labels are ordinal and locally relative |
| Absolute loudness / SPL across sources | No hydrophone calibration for clips or uploads |
| Multi-year / seasonal trend lines, recovery trajectory charts | One deployment per site; would be invented |
| Calendar-scale multi-year timebar | No calendar series of that scale; replaced by honest smaller time views |
| AI chat entry | Invites unanswerable questions; curated questions route better |
| Scroll-driven cinematic microsite | Owner's negative reference (Room 302 / Mapping Resilience) |
| In-browser inference, WebGPU, deck.gl, spatial DB, WebSockets/SSE | Over-engineering at this data scale (TECH-LANDSCAPE) |
| Pin clustering that hides sites | Hides meaningful entities at n=54; use overlap offsets |
| Native mobile apps | Responsive web covers phone use |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRUTH-01 | Phase 1 | Complete |
| TRUTH-02 | Phase 1 | Complete |
| TRUTH-03 | Phase 1 | Complete |
| TRUTH-04 | Phase 1 | Complete |
| TRUTH-05 | Phase 1 | Complete |
| TRUTH-06 | Phase 1 | Complete |
| TRUTH-07 | Phase 1 | Complete |
| TRUTH-08 | Phase 1 | Complete |
| TRUTH-09 | Phase 1 | Complete |
| TRUTH-10 | Phase 1 | Complete |
| CONTRACT-01 | Phase 2 | Complete |
| CONTRACT-02 | Phase 2 | Complete |
| CONTRACT-03 | Phase 2 | Complete |
| CONTRACT-04 | Phase 2 | Complete |
| CONTRACT-05 | Phase 2 | Complete |
| DATA-01 | Phase 8 | Pending |
| DATA-02 | Phase 8 | Pending |
| DATA-03 | Phase 8 | Pending |
| DATA-04 | Phase 8 | Pending |
| DATA-05 | Phase 8 | Pending |
| DATA-06 | Phase 8 | Pending |
| DATA-07 | Phase 11 | Pending |
| DATA-08 | Phase 11 | Pending |
| DATA-09 | Phase 11 | Pending |
| ML-01 | Phase 5 | Pending |
| ML-02 | Phase 5 | Pending |
| ML-03 | Phase 5 | Pending |
| ML-04 | Phase 12 | Pending |
| ML-05 | Phase 12 | Pending |
| ML-06 | Phase 5 | Pending |
| ML-07 | Phase 12 | Pending |
| ML-08 | Phase 5 | Pending |
| PLAT-01 | Phase 3 | Complete |
| PLAT-02 | Phase 3 | Complete |
| PLAT-03 | Phase 3 | Pending |
| PLAT-04 | Phase 1 | Complete |
| PLAT-05 | Phase 10 | Pending |
| PLAT-06 | Phase 10 | Pending |
| PLAT-07 | Phase 10 | Pending |
| PLAT-08 | Phase 16 | Pending |
| PLAT-09 | Phase 3 | Pending |
| PLAT-10 | Phase 3 | Pending |
| DS-01 | Phase 4 | Pending |
| DS-02 | Phase 4 | Pending |
| DS-03 | Phase 4 | Pending |
| DS-04 | Phase 4 | Pending |
| DS-05 | Phase 4 | Pending |
| DS-06 | Phase 4 | Pending |
| DS-07 | Phase 3 | Pending |
| DS-08 | Phase 4 | Pending |
| LISTEN-01 | Phase 7 | Pending |
| LISTEN-02 | Phase 7 | Pending |
| LISTEN-03 | Phase 7 | Pending |
| LISTEN-04 | Phase 7 | Pending |
| LISTEN-05 | Phase 7 | Pending |
| LISTEN-06 | Phase 7 | Pending |
| LISTEN-07 | Phase 7 | Pending |
| LISTEN-08 | Phase 7 | Pending |
| LISTEN-09 | Phase 7 | Pending |
| TIME-01 | Phase 9 | Pending |
| TIME-02 | Phase 14 | Pending |
| TIME-03 | Phase 14 | Pending |
| TIME-04 | Phase 14 | Pending |
| TIME-05 | Phase 14 | Pending |
| TIME-06 | Phase 14 | Pending |
| TIME-07 | Phase 14 | Pending |
| ANLZ-01 | Phase 10 | Pending |
| ANLZ-02 | Phase 10 | Pending |
| ANLZ-03 | Phase 10 | Pending |
| ANLZ-04 | Phase 9 | Pending |
| ANLZ-05 | Phase 9 | Pending |
| ANLZ-06 | Phase 9 | Pending |
| ANLZ-07 | Phase 9 | Pending |
| ANLZ-08 | Phase 10 | Pending |
| ANLZ-09 | Phase 9 | Pending |
| ANLZ-10 | Phase 10 | Pending |
| ANLZ-11 | Phase 10 | Pending |
| ANLZ-12 | Phase 9 | Pending |
| ATLAS-01 | Phase 6 | Pending |
| ATLAS-02 | Phase 6 | Pending |
| ATLAS-03 | Phase 6 | Pending |
| ATLAS-04 | Phase 6 | Pending |
| ATLAS-05 | Phase 6 | Pending |
| ATLAS-06 | Phase 6 | Pending |
| ATLAS-07 | Phase 6 | Pending |
| ATLAS-08 | Phase 6 | Pending |
| ATLAS-09 | Phase 15 | Pending |
| EVID-01 | Phase 13 | Pending |
| EVID-02 | Phase 13 | Pending |
| EVID-03 | Phase 13 | Pending |
| EVID-04 | Phase 13 | Pending |
| EVID-05 | Phase 13 | Pending |
| EVID-06 | Phase 13 | Pending |
| EVID-07 | Phase 13 | Pending |
| PERSIST-01 | Phase 6 | Pending |
| PERSIST-02 | Phase 9 | Pending |
| PERSIST-03 | Phase 13 | Pending |
| PERSIST-04 | Phase 15 | Pending |
| PERSIST-05 | Phase 15 | Pending |
| PERSIST-06 | Phase 10 | Pending |
| FRONT-01 | Phase 15 | Pending |
| FRONT-02 | Phase 15 | Pending |
| FRONT-03 | Phase 15 | Pending |
| A11Y-01 | Phase 16 | Pending |
| A11Y-02 | Phase 7 | Pending |
| A11Y-03 | Phase 16 | Pending |
| A11Y-04 | Phase 16 | Pending |
| A11Y-05 | Phase 16 | Pending |
| A11Y-06 | Phase 16 | Pending |
| A11Y-07 | Phase 16 | Pending |
| MIGR-01 | Phase 17 | Pending |
| MIGR-02 | Phase 17 | Pending |
| MIGR-03 | Phase 17 | Pending |

**Coverage:**

- v1 requirements: 113 total
- Mapped to phases: 113
- Unmapped: 0 ✓

---
*Requirements defined: 2026-09-30*
*Last updated: 2026-09-30 after roadmap creation (traceability mapped to 17 phases)*
