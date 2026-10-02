# ReefRadar v2 — Reef Soundscape Research Instrument

## What This Is

ReefRadar is a listening instrument for coral-reef soundscapes in which every claim is something you can hear, see, and trace to its source. Researchers (and curious visitors through a public front door) listen to and fairly compare real reef recordings across places, restoration stages, times of day and events; place their own recording among labelled references (upload as *search*, not verdict); and inspect the evidence — sites, datasets, label definitions, model and methods — behind every number. It is built on the existing AWS serverless pipeline (SurfPerch embeddings + classifier) and the Next.js dashboard, redesigned from the ground up.

## Core Value

**Every sound, label and number shown is real, traceable to its source, and honestly qualified — and a visitor can hear a real reef within seconds.** If everything else fails, the product must never present synthetic audio as real, an unvalidated model output as a diagnosis, or a number without its provenance.

## Requirements

### Validated

<!-- Existing capabilities (brownfield) — see .planning/audit/CAPABILITY-MATRIX.md for the full 86-row preservation contract. -->

- ✓ Serverless analysis pipeline: upload WAV → async preprocess (32 kHz mono, 5 s windows) → SurfPerch 1280-d embeddings (Lambda container) → MLP classification → top-k cosine similarity to reference sites → results in DynamoDB — existing
- ✓ 54 reference sites across 7 countries / 4 datasets (MARRS, Hurricane Irma, CoralSoundExplorer, NOAA SanctSound), 48 with embeddings, served by `GET /sites` — existing
- ✓ Geographic region detection from coordinates with out-of-distribution flag — existing (presentation to be corrected)
- ✓ Real Web Audio band-isolation filtering (fish / grazing / shrimp biquads) — existing
- ✓ Pre-upload audio preview with live spectrogram — existing
- ✓ Healthy↔degraded crossfade listening comparison — existing (content to be replaced)
- ✓ Site map with country/status filters, region fly-to, reference vs location-only distinction — existing
- ✓ Methods/limitations content ("what it measures / cannot measure"), dataset citations, architecture diagram — existing
- ✓ Graceful fallbacks for missing WebGL / Web Audio; partial reduced-motion support — existing
- ✓ Truth & reproducibility: clean-clone build; CI (unit, e2e, axe, Linux visual regression); all four Lambdas built from git with drift check MATCH; synthetic audio retired and 9 real MARRS excerpts served; interim real-only 3-class model live (restored_mid dropped until real data); raw probabilities; label provenance and canonical citations (TRUTH-01..10, PLAT-04) — Phase 1
- ✓ Data contract v1: versioned, immutable contract (S3 + CloudFront, browser-readable CORS) with full per-site provenance (54 sites; 48 embedded with disclosed 2-D PCA, 33% variance), coverage flags, `?cv=` pinning, live latest pointer, sha256-verified Zod-parsed client as the app's only reference-data source, lint/CI fence, and contract version stamps on every new analysis result (CONTRACT-01..05) — Phase 2

### Active

See `.planning/REQUIREMENTS.md` for the full, ID'd list. Summary of the milestone's intent:

- [ ] **Data & model track:** large ingestion of MARRS timestamped audio + sonotype detections + Hurricane Irma pre/post; batch embedding; leave-one-site-out evaluation; retrained classifier on real data only (SurfPerch vs Perch 2.0 evaluated); published model card; versioned dataset/model contract.
- [ ] **Instrument:** one workspace — Atlas (geography ↔ sound-space), persistent Inspector, Listening Bench (real spectrograms, per-window readings, guild filters, fair A/B/C comparison, recovery ladder) — with all state in the URL.
- [ ] **Time as a first-class dimension:** within-recording playhead/window strip; diel (time-of-day) patterns; deployment effort and detection timelines; pre/post-event comparison.
- [ ] **Analysis as search:** presigned upload with guardrails; nearest playable references; per-window readings with abstain; training coverage shown separately; permalinks.
- [ ] **Evidence pages:** site, dataset, methods/model-card pages; provenance on every number; exports with context.
- [ ] **Question-led public front door**, command palette, local saved investigations and notes.
- [ ] **Light scientific-editorial design system**, accessibility (maps/charts/audio), responsive (desktop + tablet first-class), performance budgets, automated + visual regression testing.

### Out of Scope

- **User accounts, server-side shared workspaces, collaboration/annotation** — owner chose URL + local persistence (Q5); adds auth/privacy/cost burden not justified yet.
- **Bioluminescent "vitality" layer** (vitality store, color engine, background particles/caustics, decorative spectrogram) — retired by owner decision (Q7); label-driven decoration conflicts with Core Value.
- **Dark theme** — not required this milestone (Q8); tokens must not preclude it later.
- **Species identification, coral cover, bleaching, continuous "health score", absolute loudness across sources** — the data cannot support these claims (`.planning/audit/DATA-MODEL.md §8`).
- **In-browser model inference, WebGPU, deck.gl, spatial database, WebSockets/SSE** — over-engineering at this data scale (`.planning/research/TECH-LANDSCAPE.md`); revisit only with evidence.
- **AI chat interface** — curated questions route better for a product of this scope (REFERENCE-PLATFORMS finding 9).
- **Native mobile apps** — responsive web covers phone listening/viewing.

## Context

- **Discovery artifacts (read before planning any phase):** `.planning/codebase/*` (7-doc codebase map), `.planning/audit/PRODUCT-AUDIT.md`, `.planning/audit/CAPABILITY-MATRIX.md` (anti-regression contract), `.planning/audit/DATA-MODEL.md`, `.planning/research/REFERENCE-PLATFORMS.md`, `.planning/research/TECH-LANDSCAPE.md`, `.planning/research/REDESIGN-THESIS.md`, `.planning/research/DRIVING-QUESTIONS.md`.
- **Prior milestone:** `dashboard-next/.planning/` holds the completed v1.0 "Adaptive Bioluminescent UI" milestone (2026-03). It is superseded by this project; its vitality system is retired.
- **Live system:** API `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod` (AWS account 781978598306, us-east-1, prefix `reefradar-2477-`); dashboard on Vercel (`dashboard-next-indol-nu.vercel.app`). All deployed Lambda code and the gallery source are in git (drift check MATCH); production frontend remains the legacy UI until the overhaul is launch-worthy (merge on hold by owner decision).
- **Phase 1 outcome:** backend truth fixes live in production (2026-10-01). Lambda account concurrency is 10 until a quota increase is granted. The interim model labels the healthy ind_H1 excerpt degraded (0.956), so grouped evaluation (Phase 5) and a real-data retrain (Phase 12) matter.
- **Integrity findings that shape everything (pre-Phase 1):** synthetic gallery audio (verified), likely synthetic-trained `restored_mid` class, 10-window same-site test set, probabilities scaled by region multipliers, meaningless embedding scatter, cherry-picked confounded demo pair, mislabelled datasets (Bora-Bora disturbance types as "degraded", post-hurricane vector labelled healthy), citation errors (MARRS, SurfPerch arXiv id).
- **Dataset's strongest asset:** South Sulawesi paired design — healthy, degraded, newly-restored (<3 mo) and mid-restored (32–53 mo) sites within ~2 km.
- **Upstream data available for ingestion:** MARRS ~542k timestamped one-minute files (~9,000 h, every 2–4 min over 3–40 days/site), MARRS sonotype detections (15 sound types, ~66 GB), Hurricane Irma pre/post archives (CC0), CoralSoundExplorer, SanctSound. MARRS filename timezone unverified.
- **Users:** (1) reef/PAM researchers and restoration practitioners — the standard every number is held to; (2) curious public and portfolio reviewers — served by the front door.

## Constraints

- **Tech stack:** Next.js (upgrade 14.2 → 16, React 19) on Vercel; AWS Lambda/API Gateway/S3/DynamoDB backend in us-east-1; incremental migration inside `dashboard-next/` (no big-bang rewrite).
- **Integrity:** no synthetic or unattributed audio; no displayed probability that is not a probability; every label shows who assigned it and what it means.
- **Legacy operability:** legacy routes remain working and testable until their capabilities are rehomed per CAPABILITY-MATRIX; retired only after verification.
- **Licensing:** dataset licences (CC BY 4.0 / CC0 / public domain) require attribution on every surface where audio or derived data appears.
- **Budget:** owner to set an AWS spend ceiling for ingestion/re-embedding; budget alarm required before large jobs.
- **Access:** AWS (CLI v1 via `py -3.12 -m awscli`), Vercel CLI, GitHub CLI installed; credentials provided by owner.
- **Devices:** desktop and tablet first-class; phone supports listening, viewing results and sharing.
- **Browsers:** evergreen; Safari ≥ 16.4 (Tailwind v4 baseline).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Research instrument with public front door (Q1) | Credibility comes from rigor; landing still hooks in 5 s | — Pending |
| Truth pass + retrain this milestone (Q2) | Instrument cannot sit on synthetic data / unvalidated model | ✓ Truth pass done (Phase 1); retrain Phase 12 |
| Large ingestion of upstream data (Q3) | Makes time (diel, effort, detections, pre/post) a real axis | — Pending |
| Evidence-first classifier role (Q4) | Upload as search; probabilities secondary with abstain | — Pending |
| URL permalinks + local saves, no accounts (Q5) | Shareability without auth/privacy burden | — Pending |
| Public uploads with guardrails (Q6) | Keep "my reef" use case; presigned upload, caps, rate limits, budget alarm | — Pending |
| Retire vitality layer (Q7) | Label-driven decoration conflicts with Core Value | — Pending |
| Light scientific-editorial visual system (Q8); spectrograms in dark wells | Publication-grade credibility; reading comfort; print/export | — Pending |
| Stay on Next.js, incremental strangler in `dashboard-next/` | Small data, client-heavy instrument, Vercel already wired | — Pending |
| MapLibre only; Observable Plot + d3; React Aria Components; Tailwind v4 tokens; nuqs + zustand + TanStack Query | Single engine per concern; accessible primitives; URL state | — Pending |
| Data & Model track runs parallel to UI tracks behind a versioned data contract | Large ingestion must not block UI progress | ✓ Contract v1 live (Phase 2) |
| Hold production frontend merge until the overhaul is worth a visible launch (owner, 2026-10-01) | Phase 1 is honesty fixes on the legacy UI; launch the redesign when visibly new | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-02 after Phase 2*
