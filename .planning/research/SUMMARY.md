# Project Research Summary

**Project:** ReefRadar v2 — reef soundscape research instrument
**Domain:** Passive-acoustic-monitoring (PAM) research instrument — brownfield redesign spanning a Next.js/React web app and an AWS serverless ML pipeline
**Researched:** 2026-09-30
**Confidence:** MEDIUM-HIGH

## Executive Summary

ReefRadar is a listening instrument for coral-reef soundscapes — not a map app, not an AI-diagnosis demo — where every sound, label, and number must be real and traceable to its source. The audit found the engineering spine (serverless SurfPerch inference, async pipeline) is sound, but wrapped in claims the data cannot support: a synthetic sample gallery presented as real, a classifier likely trained partly on synthetic audio and evaluated with a leaky random (not per-site) split, probabilities scaled by an ad hoc multiplier so they no longer sum to 1, and confounds (region, campaign length, disturbance type, diel timing) dressed up as biological signal. The highest-leverage move is **truth before polish**: remove synthetic audio, verify the deployed model, retrain under leave-one-site-out evaluation. The honest embedding projection, sound-space morph, training-coverage indicator and model card all depend on that truth pass.

The work splits into two parallel tracks joined by one seam: a **versioned data contract**. Track A (Data & ML: Python, AWS Batch, Step Functions) ingests MARRS timestamped audio (~542k files, ~1 TB) and sonotype detections (~66 GB), fixes train/serve preprocessing parity via one shared `reef_audio` library, runs leave-one-site-out evaluation, and retrains on real data only — publishing immutable, atomically-versioned artifacts (`contract/v{N}.json`) that the UI reads but never blocks on. Track B (UI: Next.js 16 / React 19, MapLibre, Observable Plot, custom WebGL2 audio/spectrogram engine) rebuilds the instrument (Atlas, Inspector, Listening Bench) against the contract from day one, using `coverage` flags so richer features (diel fingerprints, detection timelines) activate when Track A publishes them, without a redeploy. At 54 sites in 7 clusters, heavyweight serving infrastructure (spatial DB, DuckDB-WASM, second map engine, in-browser inference) is over-engineering; the only real scale is ingestion volume (542k files, ~6.5M windows), solved with AWS Batch Distributed Map, not in the serving layer.

Main risks: (1) a "retrained" model that is still leaky or confounded — prevented by mandatory LOSO CV, bootstrap CIs and a confound checklist; (2) an expensive re-embedding run discovering a preprocessing bug afterward — prevented by fixing `reef_audio` parity centrally and piloting a shard first; (3) silently dropping a legacy capability during the strangler migration — prevented by gating route retirement on `CAPABILITY-MATRIX.md` sign-off; (4) UI density the data doesn't support — map-as-hero, label-driven vitality/health-score decoration — ruled out by owner decision Q7 and data-density analysis.

## Key Findings

### Recommended Stack

**Frontend** (from `TECH-LANDSCAPE.md`, unchanged): Next.js 16.3 App Router (RSC for static/site/OG pages; instrument is a client island) + React 19.3; MapLibre GL JS 6.11 via `react-map-gl/maplibre` only (drop deck.gl, Leaflet); Observable Plot 0.6.17 + d3 modules (drop recharts); hand-built `AudioEngine` + Worker STFT + WebGL2 spectrogram (drop unused wavesurfer); `nuqs` URL state, `zustand` ephemeral state, TanStack Query server cache; Tailwind v4 `@theme` tokens + React Aria Components; Vitest + Playwright (Docker-pinned visual regression) + axe-core.

**Data & ML** (new): Python 3.12; `boto3` + `remotezip` streaming Figshare ZIP members → S3 (no full ZIP on disk); AWS Batch (Spot EC2/Fargate; GPU only via EC2 compute envs) orchestrated by Step Functions Distributed Map; `tensorflow-cpu>=2.18` for SurfPerch / Perch 2.0; `scikit-learn` (`LeaveOneGroupOut`/`GroupKFold`, `CalibratedClassifierCV`); `scipy.signal.resample_poly` (anti-aliased); `scikit-maad` for optional descriptive indices; `pandas` + `pyarrow` Parquet; brute-force NumPy for 48-site similarity (LanceDB only if window-level search is adopted); DuckDB as an offline build tool for aggregates; plain versioned S3 artifacts + manifest + model card (not MLflow/DVC) at one-operator cadence.

**Core technologies:**
- Next.js 16.3 + React 19.3 — keeps Vercel/routing/OG workflow
- MapLibre GL JS 6.11 (one engine) — consolidates three map renderers
- AWS Batch + Step Functions Distributed Map — per-item retry/resume at 542k files
- `reef_audio` shared preprocessing library — one import site for batch and live paths; closes four train/serve parity bugs
- scikit-learn grouped CV + calibration — fixes the leaky "90% accuracy"

### Expected Features

Eight capability areas (Listen & compare, Time & effort, Analysis-as-search, Atlas & navigation, Evidence & provenance, Persistence & sharing, Front door, Accessibility), grounded in the 86-row capability matrix and 40-product study.

**Must have (table stakes):**
- Real, attributed sample gallery
- Truth pass + retrained classifier with LOSO evaluation + published model card
- Per-window readings with explicit abstain; raw probabilities summing to 100
- Real spectrograms, canonical band filters, paired recovery-ladder comparison (currently broken: 14/16 files 404)
- Recording-effort calendar, diel soundscape fingerprint, detection timeline (depend on ingestion)
- Presigned upload with guardrails; site detail pages; in-product model card; URL-complete state with permalinks; question-led landing with real audio within 5 s
- Accessibility baseline: chart text/table alternatives, keyboard bench, CVD-safe ordinal status, global reduced motion

**Should have (differentiators):** sound-space ↔ geography morph (depends on retrained embeddings); cross-site diel comparison; group-separation metric; "flag this verdict"; command palette; guided audio tour.

**Defer (v2+):** annotation/review tooling, spectrogram parameter controls, acoustic indices beyond band energy, dark theme, beeswarm range filters, multi-language.

**Anti-features:** accounts/annotation tooling, species ID, continuous health score / vitality, absolute loudness comparison, multi-year trend charts, AI chat entry, scroll-driven microsite, persona entry, in-browser inference, pin clustering, dark-by-default.

### Architecture Approach

Two tracks, one seam: a **versioned data contract**. Track A (offline batch) runs ingest → preprocess → embed → aggregate → evaluate → train → publish and only publishes immutable versions (`contract/v{N}.json`; `latest.json` flipped only after all referenced artifacts are durable). Track B (instrument) and the live analysis path only read it. Every permalink/export pins `(dataset_version, model_version, preprocessing_spec_version)` and resolves that exact version, never `latest`.

**Major components:**
1. **`reef_audio`** — shared preprocessing for offline embed job and live Preprocessor Lambda; closes normalization mismatch, mean-pool vs single-window training, non-anti-aliased resampling, inconsistent reference-vector construction
2. **Track A pipeline** — Distributed Map embed fan-out; Aggregate to small UI-ready shapes (diel histograms, effort tables, PCA); LOSO Evaluate; atomic Publish
3. **`features/contract/` (frontend)** — sole module fetching contract artifacts; ESLint import fence
4. **Live analysis path** — lightweight Lambda chain (with DLQ/timeouts); classifies every window independently; stamps pinned contract version

### Critical Pitfalls

1. **Site/recorder leakage as accuracy** — LOSO / leave-one-country-out with bootstrap CIs; never random per-window splits.
2. **Confounds as biological signal** — verify MARRS timezone before diel features; confound checklist (country, recorder, campaign length, disturbance vs health label) for every lens.
3. **Train/serve preprocessing skew** — enforced structurally via `reef_audio` before any large re-embedding.
4. **Probabilities that aren't probabilities** — remove 0.6/0.7 multiplier; explicit abstain + separate OOD score.
5. **Map/dashboard overreach** — 54 sites = 7 clusters; match visualization density to data density.

## Implications for Roadmap

Two tracks with very different cadences (multi-day batch ML vs weekly UI iteration), joined by a versioned contract, with a short list of hard cross-track dependencies.

### Phase 0: Truth & Reproducibility
Blocking gate. Clean-clone build; synthetic audio removed and replaced with real excerpts; deployed Lambdas reconciled with repo; synthetic `restored_mid` identified/removed; deployed model verified; screenshot/a11y/bundle baselines captured.

### Phase 1: Foundations (parallel with ML-A)
Next 16/React 19; drop deck.gl/Leaflet/recharts/framer-motion/wavesurfer; tokens, RAC primitives, shell; vitality retirement.

**[PARALLEL] ML-A: `reef_audio` + parity fixes** — hard blocker for Phase 5 and any batch embedding.

### Phase 2: Data Contract v1 — load-bearing gate
Small: freeze existing real 54-site data into versioned schemas (PreprocessingSpec, ModelVersion, ContractManifest, Site, AnalysisResult) with coverage flags; `/dev/fixtures`. Blocks Phases 3–6; depends only on Phase 0.

### Phase 3: Instrument Shell & Atlas
URL schema (nuqs), selection model, persistent map + inspector, site table as primary accessible interface, semantic zoom (world = 7 clusters).

### Phase 4: Listening Bench
AudioEngine + Worker STFT + WebGL2 spectrogram (STFT params pinned in contract), window strip, canonical bands, fair A/B/C with loudness disclosure, recovery ladder.

**[PARALLEL] ML-B/C: Large ingestion + batch embedding** — MARRS audio + detections + Irma pre/post; SurfPerch and Perch 2.0 window embeddings to Parquet. Gate: pilot cost-per-1000-windows + budget ceiling with automated stop action (SNS → Lambda disables Batch queue).

### Phase 5: Analysis as Search
Hard-depends on ML-A. Presigned upload with guardrails (throttling, caps, budget alarm), per-window readings with abstain, nearest playable references, permalinks.

**[PARALLEL] ML-D/E/F: Aggregate, Evaluate + Train, Publish v2** — LOSO harness + `reef_audio` must exist before trusting re-embedding; compare SurfPerch vs Perch 2.0 under identical CV.

### Phase 6: Evidence Pages
Honest v1 off contract v1; enriched by model card and aggregates on v2. Site/dataset/methods pages, provenance on every number, exports.

### Phase 7: Time-as-First-Class
Hard-depends on ML-D for activation (UI built earlier against coverage flags). Diel fingerprint, effort calendar, detection timeline, Irma pre/post. Gate: MARRS timezone verified against a dated event.

### Phase 8: Investigations, Sharing, Front Door, Hardening, Legacy Retirement
Local saved investigations, question-led front door, command palette, responsive/a11y/perf hardening; legacy removal gated on CAPABILITY-MATRIX sign-off.

### Phase Ordering Rationale

- Contract v1 is the single load-bearing gate for Phases 3–6; never schedule after any ingestion work.
- ML-A blocks Phase 5 specifically; runs parallel to Phase 1.
- ML-B..F are schedule-independent of the UI as long as the contract schema is additive (coverage flags) from v1.
- Early zero-dependency wins: result permalinks, own-upload playback, effort calendar (manifest only), recovery-ladder audio fix, per-window persistence.
- UI-SPEC (design contract) precedes every UI phase; accessibility designed in, not audited after.
- Legacy retirement gated on CAPABILITY-MATRIX sign-off, never on calendar.
- Pilot-cost + budget stop-action precede every large Batch job.
- Visual review + functional verification per phase, especially 3, 4, 6, 7, 8.

### Research Flags

Needs deeper research during planning: Phase 4 (WebGL2 spectrogram, iOS audio, memory on long files); ML-C (GPU vs CPU throughput — pilot); Phase 7 (LDFC/diel conventions, timezone); ML-E (calibration method at low n per class); UI-SPEC for every UI phase.

Standard patterns: Phase 1, Phase 2, Phase 6, ML-A.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Frontend versions registry-verified; Data & ML versions cross-checked; Spot pricing directional |
| Features | HIGH | Grounded in capability matrix + 40-product study; PAM conventions web-confirmed |
| Architecture | MEDIUM-HIGH | Repo-verified mechanics; general MLOps framing web-sourced |
| Pitfalls | MEDIUM-HIGH | Literature-checked; UI pitfalls verified against current code |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- MARRS filename timezone unverified — correctness gate for diel features.
- Spot pricing and Perch 2.0 Kaggle handle — re-verify before committing budget.
- GPU vs CPU embedding throughput — pilot before sizing.
- SurfPerch vs Perch 2.0 — decided by identical-CV comparison, not presupposed.
- Calibration method for retrained classifier at 5–10 real sites per class.

## Sources

### Primary (HIGH confidence)
- `.planning/audit/CAPABILITY-MATRIX.md`, `DATA-MODEL.md`, `PRODUCT-AUDIT.md`
- `.planning/codebase/*`
- `.planning/PROJECT.md`, `.planning/research/DRIVING-QUESTIONS.md`

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `TECH-LANDSCAPE.md`, `REFERENCE-PLATFORMS.md`, `REDESIGN-THESIS.md`
- AWS Batch / Step Functions / Budgets docs; scikit-learn, scikit-maad, LanceDB, DuckDB docs
- Bioacoustics ML literature on grouped CV, leakage, acoustic-index reliability, diel/lunar confounds

### Tertiary (LOW confidence)
- Exact Spot pricing; Perch 2.0 Kaggle handle; GPU vs CPU throughput assumptions

---
*Research completed: 2026-09-30*
*Ready for roadmap: yes*
