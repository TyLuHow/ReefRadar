# Architecture Research: End-to-End System for the Versioned Data Contract

**Domain:** reef-soundscape research instrument — brownfield redesign spanning an AWS serverless ML pipeline and a Next.js instrument (`dashboard-next/`)
**Researched:** 2026-09-30
**Confidence:** MEDIUM-HIGH for the frontend/AWS-serverless mechanics (grounded in `TECH-LANDSCAPE.md` `[REG]`/`[OFF]` sources and `.planning/codebase/ARCHITECTURE.md` `[CODE]`); MEDIUM for general MLOps versioning/orchestration patterns (web-sourced, industry-standard, not project-specific — tagged `[WEB, LOW]` per the confidence seam); HIGH for the train/serve-parity bug list (verified in `.planning/audit/DATA-MODEL.md` against this repo's code).

This document answers one question: **how is the whole system shaped so that a slow, truth-sensitive data/ML track and a fast-moving UI track can both move immediately, independently, and converge on exactly reproducible results?** The answer is a single seam — a **versioned data contract** — that both tracks are built against from day one.

---

## 1. Standard Architecture

### 1.1 System overview — two tracks joined by one seam

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ TRACK A — DATA & ML PIPELINE (offline, batch, Python, AWS Step Functions)            │
│                                                                                        │
│  ┌────────┐  ┌──────────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌───────┐│
│  │ Ingest │─▶│ Preprocess   │─▶│  Embed     │─▶│ Aggregate │─▶│ Evaluate │─▶│Publish││
│  │(MARRS, │  │(reef_audio   │  │(SurfPerch /│  │(diel,     │  │(leave-   │  │(write ││
│  │ Irma,  │  │ shared lib — │  │ Perch 2.0  │  │ effort,   │  │ one-site-│  │ v{N}  ││
│  │ CSE,   │  │ SAME code as │  │ container, │  │ detection │  │ out CV,  │  │contract││
│  │ Sanct- │  │ live path)   │  │ batch,     │  │ counts,   │  │ model    │  │ atomic││
│  │ Sound) │  │              │  │ Distributed│  │ PCA)      │  │ card)    │  │ swap) ││
│  └────────┘  └──────────────┘  │ Map)       │  └───────────┘  └──────────┘  └───┬───┘│
│                                 └───────────┘                                    │    │
└────────────────────────────────────────────────────────────────────────────────┼────┘
                                                                                   │
                                   publishes immutable, versioned artifacts        │
                                                                                   ▼
                         ┌─────────────────────────────────────────────────────────────┐
                         │  VERSIONED DATA CONTRACT  (CDN: S3 + CloudFront / Vercel)    │
                         │  contract/v{N}.json  +  contract/latest.json (pointer)       │
                         │  → sites.v{N}.json, embeddings.v{N}.f32, pca.v{N}.json,      │
                         │    spectrograms/, audio/, model_config.v{N}.json,            │
                         │    model_card.v{N}.md, aggregates_diel.v{N}.json, …          │
                         └───────────────┬─────────────────────────┬───────────────────┘
                                         │ read-only                │ read-only
                                         ▼                           ▼
┌────────────────────────────────────────────────────┐  ┌──────────────────────────────┐
│ LIVE ANALYSIS PATH (AWS, per-upload, low-latency)   │  │ TRACK B — WEB APP             │
│                                                       │  │ (dashboard-next/, Next.js)    │
│ presigned S3 PUT → Preprocessor Lambda (reef_audio,  │  │                                │
│ SAME preprocessing_spec pinned by current             │  │ features/contract/ resolves   │
│ model_version) → Classifier Lambda (per-window MLP,  │  │ dataset_version + model_      │
│ model artifact pinned by contract) → RESULT persisted│◀─┤ version from URL/latest,      │
│ with {dataset_version, model_version} stamped in     │  │ fetches pinned artifacts,     │
│ DynamoDB                                              │  │ renders Atlas / Inspector /   │
└──────────────────────────────────────────────────────┘  │ Listening Bench               │
                                                            └──────────────────────────────┘
```

**Read the diagram two ways:**
- **Vertically**, Track A never talks to Track B directly — it only ever writes new immutable versions into the contract. Track B (and the live analysis path) only ever *read* the contract. This one-directional, publish/subscribe relationship is what lets ingestion run for days without blocking a single UI phase.
- **Horizontally**, the live analysis path is drawn separately from Track A's batch pipeline because it runs the *same preprocessing and model code* but on a different trigger (one upload, seconds) and a different orchestration style (Lambda chain, not Step Functions) — see §1.4.

### 1.2 Component responsibilities

| Component | Responsibility | Typical implementation here |
|-----------|----------------|------------------------------|
| **Ingest jobs** | Pull one upstream dataset (MARRS timestamped audio, MARRS sonotype detections, Irma pre/post, CSE, SanctSound) into an immutable raw archive | Per-dataset Python job (S3-to-S3 or HTTP-to-S3 transfer), writes to `raw/{dataset}/{upstream_id}`, content-hashed, never mutated after write |
| **`reef_audio` (shared preprocessing library)** | The *single* implementation of resample → anti-alias filter → mono-mix → window → normalize, parameterized by a versioned `PreprocessingSpec` | One Python package, imported by (a) the offline embedding job and (b) the live Preprocessor Lambda (as a Lambda layer or vendored dependency) — **this is the component that fixes train/serve parity, structurally, not by convention** |
| **Embed job** | Run the embedding model (SurfPerch now; Perch 2.0 evaluated) over every window of ingested audio | Step Functions Distributed Map fan-out over S3 objects → batch-invokes the existing inference container Lambda (or AWS Batch if container concurrency needs exceed Lambda); writes per-window embeddings (not just means) to a partitioned S3/Parquet store |
| **Aggregate job** | Turn window-level embeddings + detections into precomputed, UI-ready summaries | Per-site × hour-of-day histograms, deployment-effort tables, sonotype-detection counts, PCA fit over reference embeddings (NumPy/scikit-learn) |
| **Evaluate job** | Produce an honest performance number | Leave-one-site-out (and leave-one-country-out) cross-validation harness over all embedded sites; writes a structured eval report |
| **Train job** | Produce the next classifier | Trains the MLP head on **single-window** embeddings only (no mean-pooling, no synthetic rows), using the same `reef_audio`-preprocessed windows the evaluate job scored |
| **Publish job** | Assemble and atomically release a new contract version | Writes all versioned artifacts under `v{N}/`, writes `contract/v{N}.json`, then swaps `contract/latest.json` last (atomic pointer flip — never partially-published) |
| **Contract manifest** | The data-contract seam itself | A small, stable, cacheable JSON document; the only thing either track needs to agree on |
| **Preprocessor Lambda** (live path) | Decode, resample, window a single user upload | Imports `reef_audio`; reads `preprocessing_spec_version` from the **currently pinned** model's contract entry at cold start |
| **Classifier Lambda** (live path) | Per-window embed + classify + rank against references | Classifies **every window independently** (never a mean), loads the exact model artifact referenced by the pinned `model_version` |
| **`features/contract/`** (frontend) | Resolve, fetch, cache, and type the data contract | TanStack Query hooks (`useContract(version?)`, `useReferenceSites()`, `useModelVersion()`), `staleTime: Infinity` keyed by version string |
| **Instrument feature modules** (frontend) | Atlas, Inspector, Listening Bench, Analysis, Investigations, Command palette | Each reads data only through `features/contract/` and `features/analysis/` — never fetches contract artifacts directly |
| **Evidence pages** (frontend) | `/sites/[id]`, `/analyses/[id]`, `/methods`, `/about` | Server Components reading the contract at build/request time; `/analyses/[id]` additionally resolves the **historical** pinned contract version from the stored analysis record |

### 1.3 Why a contract, not a shared database

The two tracks have incompatible cadences: ingestion/retraining is a multi-day batch job touching ~9,000 hours of audio and 66 GB of detections; the UI needs to ship weekly against *something* now. A shared live database would force synchronization (schema migrations blocking UI work, partial-write states visible to users). A **versioned, immutable, file-based contract** gives:

- **Non-blocking parallelism** — UI reads whatever version is published; ingestion publishes whenever it's ready. No handshake required.
- **Reproducibility for free** — because artifacts are immutable and content-hashed, any `(dataset_version, model_version)` pair fetched a year from now returns byte-identical data. This directly satisfies requirement (f) — permalinks and exports just need to record which version they used.
- **An explicit coverage model** — the contract schema (§3) carries `coverage` flags (`has_diel`, `has_detections`, `has_pre_post_event`) so the UI can be written once against the *superset* schema and conditionally render features as later contract versions add richness, rather than needing a redeploy per dataset milestone. This directly satisfies requirement (b).
- **A natural place to put fixtures** — a `/dev/fixtures` route can serve synthetic-*shaped* (never synthetic-labelled-as-real) contract bundles that conform to the same schema, for testing scale and edge cases without waiting on ingestion, and without reviving Finding F1 (synthetic audio presented as real) because fixtures are environment-gated and never reachable in production.

### 1.4 Why the live analysis path stays a Lambda chain, but the batch pipeline moves to Step Functions

`[WEB, LOW — but corroborated by multiple independent sources in the same search and consistent with the audit's own finding about stuck DynamoDB stages]`

The current router→preprocessor→classifier chain (`InvocationType='Event'`, fire-and-forget, no DLQ) is adequate for a **single upload** (`.planning/codebase/ARCHITECTURE.md` "Architectural Constraints") because it's three steps, seconds long, and user-visible failure is tolerable (the user sees "failed", retries). Keep it, but add the DLQ/terminal-timeout write the audit flags as missing.

The **batch pipeline**, by contrast, must run ingest→preprocess→embed→aggregate→evaluate→train→publish over 542,187 files across days, needs to resume after partial failure without re-processing already-embedded files, and benefits from visual execution tracking an owner can check without reading CloudWatch. That is the textbook case for **AWS Step Functions**, specifically a **Distributed Map** state for the embed stage (built for exactly this: fan out over an S3 object list, checkpointed, resumable, with per-item retry) feeding standard states for aggregate/evaluate/train/publish. This is a deliberate asymmetry, not an inconsistency: orchestration weight should match job duration and failure cost, and the two tracks have very different profiles.

---

## 2. Recommended Project Structure

```
reefradar/
├── contracts/                        # the schema itself — source of truth, versioned with code
│   ├── schema/
│   │   ├── contract-manifest.schema.json     # ContractManifest (JSON Schema)
│   │   ├── preprocessing-spec.schema.json    # PreprocessingSpec
│   │   ├── model-version.schema.json         # ModelVersion / model_config
│   │   ├── site.schema.json                  # Site (sites.v{N}.json entries)
│   │   └── analysis-result.schema.json       # per-upload RESULT shape
│   └── CHANGELOG.md                  # human-readable schema version history
│
├── pipeline/                         # TRACK A — offline/batch, Python (renames/consolidates scripts/)
│   ├── reef_audio/                   # the shared preprocessing library — ALSO vendored into lambdas/preprocessor
│   │   ├── resample.py               # anti-aliased resample (replaces np.interp)
│   │   ├── window.py                 # windowing per PreprocessingSpec
│   │   ├── normalize.py              # normalization per PreprocessingSpec (pinned, not ad hoc)
│   │   └── spec.py                   # loads/validates PreprocessingSpec against contracts/schema/
│   ├── ingest/{marrs,irma,cse,sanctsound}/
│   ├── embed/                        # Step Functions Distributed Map target
│   ├── aggregate/
│   ├── evaluate/                     # leave-one-site-out CV harness
│   ├── train/
│   ├── publish/                      # assembles + atomically releases contract/v{N}.json
│   └── state_machine/                # Step Functions ASL definitions (CDK/SAM/Terraform, whichever this repo uses)
│
├── lambdas/                          # existing live-path Lambdas (router, preprocessor, classifier)
│   └── preprocessor/
│       └── reef_audio -> ../../pipeline/reef_audio   # shared, not duplicated (Lambda layer in prod)
│
├── infrastructure/lambda_container/  # existing SurfPerch/Perch 2.0 inference container
│
└── dashboard-next/                   # TRACK B — web app
    └── src/
        ├── app/
        │   ├── (instrument)/explore/…        # the instrument — client island
        │   ├── (site)/{about,sites/[id],methods}/…  # RSC, static/ISR
        │   └── analyses/[id]/…                # hybrid: RSC shell + client hydration
        ├── features/
        │   ├── contract/                     # owns contract fetch/cache/typing — the seam consumer
        │   ├── map/ audio/ timeline/ analysis/ investigations/ command/
        ├── design/                           # tokens.css + RAC component kit
        └── components/                       # LEGACY — frozen, lint-fenced from features/+design/
```

### Structure rationale

- **`contracts/` is its own top-level directory**, not owned by either track, because both the Python pipeline and the TypeScript frontend must validate against it. Treat schema changes as a reviewed, versioned event (`CHANGELOG.md`) — a breaking contract-schema change is effectively an API break between the two tracks and should feel like one.
- **`pipeline/reef_audio/` is physically shared** with `lambdas/preprocessor/`, not reimplemented. In Python this is trivial (same package, vendored or as a Lambda layer); this is the single structural fix for train/serve parity (§4).
- **`features/contract/` is the only module allowed to fetch contract artifacts.** Every other feature module (map, audio, timeline, analysis) consumes typed hooks from it. This keeps the client/server boundary enforceable with the same ESLint `no-restricted-imports` fence already proposed in `TECH-LANDSCAPE.md` §12 for legacy isolation — extend that fence so `features/**` (excluding `features/contract/`) cannot import a raw `fetch`/contract URL.

---

## 3. The Versioned Data Contract — schemas (high level)

All four schemas below live in `contracts/schema/` as JSON Schema (validated in Python with `jsonschema`/pydantic, and in TypeScript with a hand-mirrored Zod schema that is contract-tested against the JSON Schema in CI — do not hand-maintain two independently-drifting type systems without a test that catches drift).

### 3.1 `PreprocessingSpec` — the parity-critical object

```
PreprocessingSpec {
  spec_version: string            // e.g. "2026.10.0" — bumped on ANY change to these fields
  sample_rate_hz: 32000
  window_s: 5.0
  hop_s: 5.0                      // no overlap today; explicit so future overlap is a visible change
  normalization: "none"           // PINNED — must be identical for offline embedding + live upload.
                                   // (fixes F8a: training/reference audio was peak-normalized; live uploads were not)
  anti_alias_filter: { applied: true, method: "polyphase" }  // fixes F8c: linear resample aliased >8kHz content
  stft: {                         // consumed by the CLIENT spectrogram worker too (not just the model)
    n_fft: 1024, hop: 256, window_fn: "hann", scale: "linear", fmin_hz: 0, fmax_hz: 16000, db_range: 80
  }
  embedding_model: { name: "surfperch" | "perch2.0", version: string, input_window_s: 5.0, output_dim: 1280 | 1536 }
}
```

A `PreprocessingSpec` is referenced **by id** from both a `ModelVersion` and a `ContractManifest.artifacts.spectrograms` entry, so the frontend's `<SpectrogramGL>` worker and the offline reference-spectrogram generator can assert they used the same `spec_version` — directly fixing Pitfall P10 (parameter mismatch between precomputed reference images and client-computed upload images).

### 3.2 `ModelVersion` (`model_config.v{N}.json`)

```
ModelVersion {
  model_version: string                  // e.g. "classifier-2026.11-loso"
  trained_on_dataset_version: string      // which DatasetVersion's windows it trained on
  preprocessing_spec_version: string      // PINNED — Lambdas load this at cold start, not "whatever's latest"
  architecture: "MLP 1280→256→64→4"
  classes: ["degraded","healthy","restored_early","restored_mid"]
  weights_uri: string
  training: { n_windows: int, n_sites: int, synthetic_data: false, window_pooling: "none" }  // "none" fixes F8b
  evaluation: { method: "leave-one-site-out", balanced_accuracy: float, ci_95: [float,float], per_class: {...}, n_sites_evaluated: int }
  model_card_uri: string
}
```

`training.window_pooling: "none"` is a deliberate, named field — it exists specifically so a future reviewer (or CI check) can assert the classifier was never trained on mean-pooled embeddings, closing finding F8b permanently rather than by convention.

### 3.3 `ContractManifest` (`contract/v{N}.json`, and `contract/latest.json` as a pointer)

```
ContractManifest {
  contract_version: int                   // monotonic, e.g. 1, 2, 3…
  published_at: ISO8601
  dataset_version: string                 // e.g. "marrs-full-2026.11"
  model_version: string                   // FK → ModelVersion.model_version
  preprocessing_spec_version: string      // FK → PreprocessingSpec.spec_version
  artifacts: {
    sites:        { uri, sha256, count },
    embeddings:   { uri, sha256, dim, count },
    pca:          { uri, explained_variance: [float] },
    spectrograms: { base_uri, format: "u8" | "webp" },
    audio_clips:  { base_uri, format: "opus", license_note: string },
    model_config: { uri }, model_card: { uri }, eval_report: { uri },
    aggregates_diel:    { uri, present: bool },
    aggregates_effort:  { uri, present: bool },
    detections:         { uri, present: bool }
  }
  coverage: { has_diel: bool, has_detections: bool, has_pre_post_event: bool,
              total_sites: int, sites_with_embeddings: int, countries: int },
  upstream_sources: [ { name: "MARRS"|"Hurricane Irma Dataset"|"CoralSoundExplorer"|"NOAA SanctSound",
                         doi: string, license: string, ingested_at: ISO8601 } ]
}
```

`contract/latest.json` is **only ever written last**, after every artifact it references is already durable at `v{N}/…` — an atomic pointer flip, not an in-place mutation, so a UI mid-fetch can never observe a half-published version.

### 3.4 `Site` (`sites.v{N}.json` entries) — extends the current 9-field shape with provenance the audit found missing (F8, DATA-MODEL §9 item 8)

```
Site {
  site_id, dataset_source, doi, license, country, cluster, status,
  status_basis: "upstream" | "reefradar-assigned",   // closes F9 — makes invented labels visible
  latitude, longitude, recorder, sample_rate_hz,
  deployment_start, deployment_end, recordings_used, windows_used,
  has_embedding: bool, embedding_ref: string | null
}
```

### 3.5 `AnalysisResult` (per upload, persisted in DynamoDB `ANALYSIS#{id}/RESULT`) — the object a permalink/export pins

```
AnalysisResult {
  analysis_id,
  dataset_version, model_version, preprocessing_spec_version,   // PINNED at analysis time, never recomputed
  windows: [ { t_start_s, probs: {degraded,healthy,restored_early,restored_mid}, abstain: bool,
               top_similar_sites: [{site_id, cosine}] } ],       // per-window, never a mean (fixes F8b downstream)
  summary: { n_windows, majority_label, agreement_fraction,
             training_coverage: { region_has_training_sites: bool, n_training_sites_in_region } },  // replaces the 0.6/0.7 multiplier (F7)
  provenance: { uploaded_at, original_filename, client_resampled: bool }
}
```

Because `dataset_version`/`model_version`/`preprocessing_spec_version` are stamped **at analysis time** and never recomputed, `/analyses/[id]` always resolves `contract/v{N}.json` (the exact historical version), never `contract/latest.json` — this is what makes a permalink reproducible even after the contract moves to v4, v5, etc. (requirement f).

---

## 4. Train/Serve Parity — the specific fixes, mapped to components

`DATA-MODEL.md` F8 names four concrete skews. Each is closed by a specific architectural decision, not a policy:

| Skew (from F8) | Fix | Where it's enforced |
|---|---|---|
| (a) Training/reference audio peak-normalized; uploads not | `PreprocessingSpec.normalization: "none"` applied identically by `reef_audio` in both the offline embed job and the live Preprocessor Lambda | `pipeline/reef_audio/normalize.py`, imported by both |
| (b) Trained on single windows; served on mean-of-N-windows | Classifier Lambda classifies **every window independently**; `ModelVersion.training.window_pooling: "none"` makes this an assertable, named contract field | `lambdas/classifier/handler.py` rewrite — drop `mean_pool` before the MLP call; `AnalysisResult.windows[]` replaces the single mean-based `classification` object |
| (c) MARRS 16 kHz (no content >8 kHz) vs 44.1/48/96 kHz uploads resampled with no anti-alias filter | `PreprocessingSpec.anti_alias_filter.applied: true`, implemented once in `reef_audio.resample` (polyphase, not `np.interp`) | Same shared module, both call sites |
| (d) Reference vectors mix 5-window means, ~30-file means, 10 random windows (inconsistent per dataset) | Embed job in Track A re-embeds **every** ingested window through one pipeline, and the site-level reference vector becomes a documented aggregate (e.g., mean of all available windows) computed once, consistently, by the Aggregate job — never per-dataset ad hoc scripts | `pipeline/aggregate/` replaces the five divergent `generate_*_embeddings.py` scripts |

**The structural insight:** parity is not a QA checklist item here — it is encoded as the fact that `reef_audio` is **one package with one import site in each runtime**, and the `PreprocessingSpec`/`ModelVersion` schema fields exist specifically to make a regression *visible* (a code reviewer or CI check can diff `spec_version` between a model's training config and what the live Lambda loads) rather than *silent*, which is how F8 went undetected for this long.

---

## 5. Data Flow

### 5.1 Reference-data flow (batch → CDN → UI, one-directional)

```
Upstream dataset (MARRS/Irma/CSE/SanctSound)
   → raw/ (immutable, content-hashed, S3)
   → reef_audio preprocess (windowed, spec-pinned)
   → embed (per-window, 1280/1536-d vectors, Parquet/S3, partitioned by site)
   → aggregate (site-level mean vectors, PCA, diel histograms, detection counts, effort tables)
   → evaluate (leave-one-site-out CV) + train (window-level MLP, no synthetic rows)
   → publish (writes v{N}/ artifacts, then contract/v{N}.json, then flips contract/latest.json)
   → CDN (S3 + CloudFront, or Vercel public/ for smaller artifacts)
   → features/contract/ (TanStack Query, staleTime: Infinity, keyed by version)
   → Atlas / Inspector / Listening Bench / Evidence pages
```

### 5.2 Live-analysis flow (per upload, low-latency, parity-checked)

```
User file
   → client: optional size-reducing resample (NOT authoritative — see note)
   → presigned S3 PUT (uploads/{id}/…)
   → Router Lambda: creates ANALYSIS#{id}, async-invokes Preprocessor
   → Preprocessor Lambda: reef_audio.preprocess(audio, spec=contract.preprocessing_spec_version)
        — loads spec_version from the model currently pinned by contract/latest.json (or a URL-pinned version, for re-runs)
   → Classifier Lambda: per-window embed (same embedding model as ModelVersion) → per-window MLP → per-window
     top-k cosine vs reference site vectors (from the SAME contract version's embeddings.f32)
   → RESULT written with {dataset_version, model_version, preprocessing_spec_version, windows[]} stamped
   → Frontend polls /status, renders window strip from windows[], never recomputes a mean
```

**Note on client-side resampling:** `TECH-LANDSCAPE.md` recommends client resample before upload purely to shrink payload size (a 96 kHz/24-bit file is ~9× a 32 kHz/16-bit one). That resample is **not** the authoritative preprocessing step — it only has to be "close enough" to avoid absurd upload sizes. The Preprocessor Lambda's `reef_audio` call is the one and only authoritative transform, guaranteeing the exact same code path produced both the reference embeddings and the query embedding. This removes a second, independent source of train/serve skew (a divergent client-side DSP implementation) that a "do the FFT in the browser for speed" design would have reintroduced.

### 5.3 Shared audio engine → synchronized views (requirement e)

```
                     ┌─────────────────────────────┐
  Reference audio ──▶│ offline STFT (Python,        │──▶ spectrograms/{site}.u8  (precomputed, CDN)
  (precomputed)       │ PreprocessingSpec.stft)      │
                     └─────────────────────────────┘
                                                            both consumed by
  Upload audio    ──▶ Worker STFT (TS, SAME                              ▼
  (client-side)        PreprocessingSpec.stft params   ┌───────────────────────────────┐
                        read from the pinned contract)─▶│  <SpectrogramGL>  (WebGL2)     │
                                                          │  band-energy chart (Plot)      │
                                                          │  window strip (classification) │
                                                          │  map highlight (feature-state) │
                                                          └───────────────────────────────┘
                                                          all driven by ONE AudioEngine's
                                                          `currentTime`-based playhead (zustand,
                                                          read via refs/rAF — never React state/frame)
```

Both the precomputed-reference path and the live-upload path read `stft` params from the same `PreprocessingSpec`, so a reference spectrogram and a user's uploaded spectrogram are pixel-comparable — this is what makes the Listening Bench's A/B/C comparison honest rather than merely plausible.

---

## 6. Architectural Patterns

### Pattern 1: Contract-as-seam (publish/subscribe over immutable versions)

**What:** Track A never pushes to Track B; it publishes an immutable, versioned, atomically-pointered artifact set that Track B pulls on its own schedule.
**When to use:** Any time two workstreams have fundamentally different cadences (batch ML vs. interactive UI) and correctness depends on exact reproducibility.
**Trade-offs:** UI must tolerate "old" data gracefully (coverage flags, not crashes) in exchange for never being blocked by ingestion; adds one indirection (fetch manifest, then fetch artifact) versus a direct API call.

### Pattern 2: One shared preprocessing library, two call sites, zero duplication

**What:** `reef_audio` lives once, is imported (not reimplemented) by the offline embed job and the live Preprocessor Lambda.
**When to use:** Whenever "the same numbers must come out of two different runtimes" — this is the single highest-leverage fix for train/serve skew, per general MLOps practice `[WEB, LOW]` ("transformations performed when creating features — use the same code — to avoid training/serving skew") and specifically closes F8 here.
**Trade-offs:** Requires packaging discipline (Lambda layer or vendored dependency with a pinned version), and a CI check that fails if `lambdas/preprocessor` and `pipeline/` diverge on `reef_audio`'s version.

### Pattern 3: Version-pinned permalinks

**What:** Every shareable or exportable artifact (an `/analyses/[id]` permalink, a CSV/JSON export, an `/explore?...` URL once a user has interacted with it) carries `dataset_version`/`model_version`/`preprocessing_spec_version` explicitly, and resolves against `contract/v{N}.json`, never `contract/latest.json`.
**When to use:** Any research-instrument or scientific-tool context where "what exactly produced this number" must survive the underlying data changing.
**Trade-offs:** Slightly larger URLs/export payloads; requires the frontend's `features/contract/` module to support "fetch a specific historical version," not just "fetch latest."

---

## 7. Data-Scale Considerations (not user-scale — this product has no scaling problem in the conventional sense)

| Stage | Today (post-truth-pass) | After large ingestion (Q3) | Notes |
|---|---|---|---|
| Reference sites | 54 sites, 48 embeddings, ~276 KB vectors | Same site count; vectors recomputed consistently | Still trivially small; stays static JSON/binary on CDN |
| Per-site audio basis | ~25 s/site (5 random windows) | All available windows per site (MARRS alone: ~9,036 h total) | Site-level reference *vector* stays a single aggregate; *window-level* embeddings move to partitioned Parquet, not JSON |
| Detections | None ingested | ~66 GB raw MARRS sonotype detections | Never served raw to the client — aggregated (per-site × hour-of-day counts) before publish; this is the "precomputed aggregates, not a spatial DB/DuckDB-WASM" decision `TECH-LANDSCAPE.md` already made, extended to the ML track's output |
| Live analysis payload | Fails above ~4.5 MB (P1) | Presigned upload, size/duration-capped | Independent of the data-scale growth above |
| Embedding job compute | N/A (ad hoc scripts, run once per expansion) | 542,187 files × ~5 s windows, needs checkpointed, resumable batch execution | Step Functions Distributed Map, not a long-running single Lambda |

**First bottleneck:** the embed job's raw file count (542k), not storage or UI data volume — solved by Distributed Map fan-out with per-item retry, not by changing anything on the UI side.
**Second bottleneck:** keeping `contracts/schema/` additive (never removing a field a published UI depends on) as coverage grows — solved by the `coverage` flags pattern (§3.3), not by UI-side version branching logic.

---

## 8. Anti-Patterns to Avoid

### Anti-Pattern 1: Classifying a mean-pooled embedding because "it's what the current code does"

**What people do:** Average N window embeddings, then run the classifier once on the mean — cheaper, and matches the existing `lambdas/classifier/handler.py`.
**Why it's wrong:** The model was trained on single windows (F8b); classifying a mean is a distribution shift the model was never evaluated against, and it silently throws away the "7 of 9 windows agreed" signal the product's own data-communication strategy (`REDESIGN-THESIS.md` §5) depends on.
**Do this instead:** Classify every window independently; aggregate only for *display* (majority label, agreement fraction), never before the model.

### Anti-Pattern 2: Letting the frontend compute its own STFT with parameters that drift from the reference spectrograms

**What people do:** Pick convenient FFT parameters in the client worker without checking what generated the precomputed reference images.
**Why it's wrong:** Produces a side-by-side comparison that *looks* scientific but silently compares different frequency/time resolutions (Pitfall P10) — exactly the kind of "presentation that claims more certainty than the system has" the redesign exists to eliminate.
**Do this instead:** Read `stft` params from the pinned `PreprocessingSpec` at runtime; never hardcode them client-side.

### Anti-Pattern 3: Auto-advancing production to `contract/latest.json` everywhere

**What people do:** Always resolve "latest" on every page load for simplicity.
**Why it's wrong:** Breaks reproducibility the moment a new dataset/model version publishes — a user's open tab, a shared link, or a stored export would silently start describing different underlying data.
**Do this instead:** `/explore` without a version param may default to latest (fresh session); the moment any state is selected/shared/exported, the resolved version gets written into the URL/record and all further reads for that artifact are pinned.

### Anti-Pattern 4: Treating the batch pipeline's ad hoc per-dataset scripts as the permanent architecture

**What people do:** The current repo has five divergent `generate_*_embeddings.py` scripts, each with different normalization/windowing choices (F8d) — the path of least resistance is to add a sixth for the next dataset.
**Why it's wrong:** Every new script is a new opportunity for silent parameter drift; this is literally how F8 happened.
**Do this instead:** One `pipeline/embed/` job parameterized by `PreprocessingSpec`, invoked identically regardless of upstream dataset.

### Anti-Pattern 5: Building UI components that fetch contract artifacts directly

**What people do:** A map component does `fetch('/sites.json')` because it's one line.
**Why it's wrong:** Scatters version-resolution logic across the codebase, makes the fixtures route (`/dev/fixtures`) impossible to swap in cleanly, and breaks the lint fence's ability to guarantee one data-access path.
**Do this instead:** All contract reads go through `features/contract/` hooks; everything else consumes typed data, never URLs.

---

## 9. Integration Points

### External services / upstream dependencies

| Service / source | Integration pattern | Notes |
|---|---|---|
| MARRS (figshare DOI 10.5522/04/29958062) | Bulk download job in `pipeline/ingest/marrs/` → `raw/marrs/` | CC BY 4.0, attribution required on every surface per constraint; timezone of filenames unverified — resolve before any diel feature ships |
| MARRS sonotype detections | Separate ingest job (~66 GB, 5 country zips) | Feeds `aggregates_detections`, the "sound guilds" lens grounded in the dataset authors' own pipeline |
| Hurricane Irma (Dryad CC0) | `pipeline/ingest/irma/`, both pre- and post-storm folders | Enables the pre/post-event lens (REDESIGN-THESIS §4c) — label status `unknown`, attach `period: pre|post`, not a health claim |
| CoralSoundExplorer, SanctSound | Same ingest pattern | SanctSound site-naming mismatch (F9) must be fixed at ingest, not papered over downstream |
| SurfPerch / Perch 2.0 weights (Kaggle / Hugging Face) | Pulled once into the inference container image; `ModelVersion.embedding_model` records which | Verify SurfPerch license before any redistribution; Perch 2.0 evaluation is a distinct `ModelVersion` row, not a silent swap |
| AWS Step Functions | Orchestrates Track A only (ingest→publish) | Distributed Map for the embed stage specifically |
| CDN (CloudFront/S3 or Vercel) | Serves `contract/*` and all versioned artifacts | `staleTime: Infinity` on the client is safe because artifacts are immutable per version |

### Internal boundaries

| Boundary | Communication | Notes |
|---|---|---|
| Track A ↔ contract | One-way file publish, atomic pointer swap | Track A has no read dependency on Track B at all |
| Contract ↔ Track B | Read-only fetch, versioned | `features/contract/` is the sole consumer |
| Contract ↔ live-analysis Lambdas | Read-only, resolved at cold start (or per-request if re-analysis against a specific version is supported) | Preprocessor/Classifier Lambdas never *write* to the contract |
| `features/contract/` ↔ other feature modules | Typed hooks only | Enforced by the existing ESLint `no-restricted-imports` fence, extended |
| `(instrument)` (client) ↔ `(site)` pages (RSC) | Both read the contract, independently, through their own boundary-appropriate mechanism (TanStack Query vs server `fetch`) | No shared client-only state crosses the RSC/client boundary — each side resolves its own contract reference |

---

## 10. Suggested Build Order — explicit cross-track dependencies

This refines `REDESIGN-THESIS.md` §10 by making the two-track dependency graph explicit. **Bold** = hard blocking dependency; others may run in parallel.

```
Phase 0  Truth & reproducibility             (Track-agnostic, blocks contract v1)
   │     — remove synthetic gallery (F1), verify/pin deployed model (F2),
   │       reconcile deployed Lambda vs repo
   ▼
Phase 1  Foundations (Next 16/React 19,      ║  ML-A  reef_audio shared library +
   │     tokens, strangler scaffolding)      ║        parity fixes (F8a–d) deployed
   │     — independent of Track A            ║        to live Preprocessor/Classifier
   │                                          ║        — MUST land before Phase 5
   ▼                                          ║
Phase 2  Data contract v1                    ◀══ depends on Phase 0 (clean data to
   │     — schema (§3), freeze current real  ║    freeze) — NOT on ML-B..F
   │       54-site data as contract v1,      ║
   │       /dev/fixtures route               ║
   │     **blocks Phases 3, 4, 5**           ║
   ▼                                          ║
Phase 3  Instrument shell & Atlas            ║  ML-B  Large ingestion (MARRS timestamped
   │     — depends on Phase 1 + Phase 2 v1   ║        + detections, Irma pre/post)
   │     — NOT on ML-B..F                    ║        — runs in parallel, independent
   ▼                                          ║
Phase 4  Listening Bench                     ║  ML-C  Batch embedding (window-level,
   │     — depends on Phase 2 v1             ║        via reef_audio + Step Functions
   │       (spectrogram params pinned)       ║        Distributed Map)
   │     — NOT on ML-B..F                    ║
   ▼                                          ║
Phase 5  Analysis as search                  ◀══ **hard-depends on ML-A** (live path
   │     — upload drawer, permalinks,        ║    must be parity-fixed before shipping
   │       per-window honest reading         ║    "honest" per-window results)
   │                                          ║
   │                                          ║  ML-D  Aggregate (diel, effort,
   │                                          ║        detections, PCA)
   │                                          ║
   │                                          ║  ML-E  Evaluate (leave-one-site-out) +
   │                                          ║        Train (real data only, window-
   │                                          ║        level) → ModelVersion v2
   │                                          ║
   │                                          ║  ML-F  Publish contract v2
   ▼                                          ▼
Phase 6  Evidence pages                      ◀══ richer with ML-E's model card + ML-D's
   │     — ships a v1-honest version off     ║    aggregates, but has a legitimate v1
   │       contract v1, upgrades in place    ║    version that doesn't block on them
   │       when v2 publishes                 ║
   ▼
Phase 7  Time-as-first-class UI features     ◀══ **hard-depends on ML-D** (diel/effort/
   │     (diel patterns, deployment effort,  ║    detection aggregates must exist in a
   │      pre/post-event comparison)         ║    published contract version)
   │     — built against `coverage` flags    ║    Gated by `coverage.has_diel` etc., so
   │       from day one (Phase 3), activated ║    the UI code ships before the data does
   │       by a contract version bump only   ║    and "just activates" on publish.
   ▼
Phase 8  Investigations & sharing, Question-led entry, Responsive/a11y/perf hardening,
         Legacy retirement — as in REDESIGN-THESIS §10, unaffected by Track A's timeline
```

**The load-bearing dependency to protect in planning:** Phase 2 (contract v1 + schema) is the one phase that *must* exist before Phases 3, 4, 5, 6 can start, and it is realistically small (freeze existing real data into the new shape, no new ML work) — so it should be scheduled immediately after Phase 0, not after any part of the ingestion/retrain track. Everything else in Track A (ML-B through ML-F) is schedule-independent of the UI roadmap as long as the contract schema was designed to be a superset from the start (§3.3's `coverage` flags exist specifically to make this true).

---

## Sources

- `.planning/codebase/ARCHITECTURE.md` — current Lambda chain, fire-and-forget invoke pattern, missing DLQ `[CODE, HIGH]`
- `.planning/audit/DATA-MODEL.md` §4.1, §6, §9 — F7, F8(a–d), F9, F12; the parity bugs this document's §4 closes `[CODE+upstream-doc cross-check, HIGH]`
- `.planning/research/TECH-LANDSCAPE.md` §4, §7, §12 — audio engine/spectrogram ownership, presigned upload, static versioned reference artifacts, strangler route-group structure `[REG/OFF/CODE, MEDIUM-HIGH]`
- `.planning/research/REDESIGN-THESIS.md` §3, §4, §8, §10 — IA/routes, time-as-first-class, roadmap sketch this document refines `[project synthesis]`
- `.planning/research/DRIVING-QUESTIONS.md` Q2, Q3, Q9 — truth pass + retrain scope, large ingestion scope, versioned dataset/model contract decision `[owner decision]`
- Web (general MLOps patterns, cross-checked against this repo's specific bugs, `[WEB, LOW confidence per classify-confidence seam — treat as industry-standard framing, not project-specific verified fact]`):
  - Model/dataset versioning, model registries, data/feature/code tuple logging — multiple sources incl. [Cycle: Versioning in ML](https://cycle.io/learn/versioning-in-machine-learning), [phData: version control your ML pipeline](https://www.phdata.io/blog/how-to-effectively-version-control-your-machine-learning-pipeline/)
  - Training/serving skew and shared-preprocessing-code mitigation — [eliminate training serving skew (MLOps)](https://dev.to/dataengineeringguide/eliminate-training-serving-skew-mlops-4cfl), [Confluent: eliminate training-serving skew](https://www.confluent.io/fr-fr/blog/eliminate-training-serving-skew-mlops/)
  - Step Functions vs. Lambda chaining for orchestration — [FloQast: AWS Step Functions reducing a long-running process](https://www.floqast.com/engineering-blog/aws-step-functions-reducing-a-long-running-process-by-75), [Whizlabs: AWS Step Functions ML pipeline](https://www.whizlabs.com/blog/aws-step-functions-machine-learning-pipeline)

---
*Architecture research for: reef-soundscape research instrument (data/ML pipeline + Next.js instrument, versioned data-contract seam)*
*Researched: 2026-09-30*
