# ReefRadar Data Model and Scientific Meaning Audit

**Date:** 2026-09-30
**Branch audited:** `redesign/v2-discovery` (HEAD `8b26a24`)
**Purpose:** Establish what ReefRadar's data actually is and means *before* any presentation redesign.
**Method:** Read every Lambda, the inference container, the data scripts, frontend types and audio assets, and the docs. Called the live API with GETs only (`/sites`, `/health`, `/samples`). Pulled upstream metadata from the dataset landing pages (MARRS figshare + `manifest.csv` + `study_sites_map.kml`, Williams et al. 2025 bioRxiv, Dryad Irma, Zenodo CoralSoundExplorer, Zenodo ReefSet, arXiv SurfPerch, perch-hoplite `model_configs.py`). Measured the spectra of every audio clip the product serves.

**Limits:** The `data/` directory (training JSON, `metadata_v6.json`, `model_config.json`) is **not in this clone**. Its scripts point at the original WSL path `/home/yler_uby_oward/ReefRadar`. I had no S3 read access and was not allowed to POST. So anything about the *deployed* model weights or the stored reference JSON is inferred from scripts, docs and the live API, and each such inference is marked **[verify]**.

---

## 0. Findings that change the redesign (read first)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| F1 | **All 8 gallery clips served by the live `/samples` endpoint are synthetic tone mixes**, yet they are labelled with real MARRS site IDs. The "healthy" clips are pure 200/500/1000 Hz sines (88% of their energy sits in 50 FFT bins). `idn_healthy_dawn` and `aus_healthy_gbr` correlate at r = 0.88 sample-for-sample. They carry energy above 8 kHz, which a 16 kHz MARRS recording cannot contain. Three pairs share identical spectral profiles. One clip is a **"Philippines" site (`phl_D1`) that exists in no dataset**. | §5.6. Spectral analysis of `GET /prod/samples` clips | **Critical (honesty)** |
| F2 | **The deployed 4-class model (v2.0) very likely learned `restored_mid` from synthetic sine-wave audio.** `scripts/add_restored_mid_and_retrain.py:144-176` generates sines plus random clicks, labels them `ind_R1`/`ind_R2` `restored_mid` (`file_id …_synthetic_NNNN`, l.252) and uploads the model as v2.0. `docs/REFERENCE_SITE_EXPANSION_PLAN.md:27-30` records "Model Version 2.0 (4-class), 140 samples, 90.5%". 100 real + 40 synthetic = 140. No later retrain script exists. | §6 | **Critical [verify `models/model_config.json`]** |
| F3 | **The reported accuracy has no scientific meaning.** The classifier was trained on 100 single 5-s windows from 5 sites (`ind_D2, ind_D3, ind_H4, ind_N1, ken_H1`). The split was random *per sample*, so train and test share sites (`train_classifier.py:117-125`; `site_ids` loaded but never used). The test set is n=10 (v1) or about 21 (v2). No cross-validation was run, and no site, region or time hold-out exists. | §6 | Critical |
| F4 | **There is no time dimension in ReefRadar's stored data**, even though upstream is rich in time. MARRS has 542,187 timestamped one-minute files, about 9,036 h, with a 2–4-minute duty cycle over 3–40 days per site. Irma has pre, during and post hurricane recordings at 20-min resolution. ReefRadar keeps one timeless vector per site, built from about 25 s of audio. | §3 | High (opportunity) |
| F5 | **Geography is points inside 7 clusters, not a map-scale dataset.** Every MARRS project's sites fit inside a box of 0.1–9 km. The 7 GBR sites fit in 140 m × 340 m. At any zoom below about 13 there are **7 dots, not 54**. | §2 | High (design) |
| F6 | **The "embedding map" is not an embedding projection.** `generate_visualization` plots *(mean of dims 0–639, mean of dims 640–1279)* and shows only the **first 10** reference sites in file order (`classifier/handler.py:548-577`). It carries no structure. | §4.5 | High |
| F7 | **Region "confidence adjustment" breaks the probability semantics.** All four probabilities are multiplied by 0.6 or 0.7, so they sum to 0.6 or 0.7. Leaving out coordinates (×0.7) is penalised *less* than giving honest out-of-region coordinates (×0.6). The caveat also says the model "was trained on … Indonesia, Australia, Kenya, Maldives and Mexico", which is false for the classifier (Indonesia and Kenya only). | `region_detection.py:130-206` | High |
| F8 | **Train/serve skew in four places.** (a) Training audio and MARRS reference audio were peak-normalised per file; uploads are not. (b) The model was trained on single windows but is applied to a *mean of N windows*. (c) MARRS is 16 kHz (no content above 8 kHz), while 44.1/48 kHz uploads keep 8–16 kHz content after linear (non-anti-aliased) resampling. (d) The reference vectors mix 5-window means, about 30-file means, and 10 random windows. | §4.1 | High |
| F9 | **Labels outside MARRS are ReefRadar's own inventions.** Bora-Bora "tourist" and "boat traffic" sites are labelled `degraded`, but upstream they are use/disturbance contexts, not coral condition. Both Irma reefs are labelled `healthy`, but upstream gives them no health status, and the WDR embedding comes from **October 2017, after Hurricane Irma**. The SanctSound coordinates don't match the upstream site names (FK01 = Western Dry Rocks, FK02 = Eastern Sambo). | §5 | High |
| F10 | **Site-naming bug: `ken_D3` doesn't exist upstream as audio; `ken_D2.zip` (11,917 files) does.** The MARRS KML labels that point "D3"; the audio archive calls it D2. ReefRadar shows `ken_D3` with no embedding and never used ken_D2's 33 days of audio. | `manifest.csv`, KML | Medium (easy fix) |
| F11 | **Upstream metadata that ReefRadar never ingested**: MARRS sonotype detections (15 sonotypes, about 66 GB across 5 country zips). Upstream also has per-region coral cover (for example Indonesia healthy 71.8±10.1% vs degraded 10.2±8.0%), restoration-age definitions, depth (1.2–4 m), recorder settings, and published ecosystem-function metrics (cuescape, phonic richness, grazing, snaps). | §5.1, §9 | Opportunity |
| F12 | **Similarity search may be silently empty or partial [verify].** The classifier reads `ref['mean_embedding']` (`handler.py:519, 561`). The v5 schema (prompt 046) and every expansion merge write `embedding` (`merge_expansion_embeddings.py:48`, `merge_irma_embeddings.py:48`). The v4 MARRS output used `mean_embedding`. Depending on what v5 kept, `similar_sites` and `reference_sites` might cover only some sites, or none. | §4.4 | High [verify with one POST /analyze] |

---

## 1. Domain entities and relationships

### 1.1 ER diagram (what actually exists, stored or transient)

```
                           ┌────────────────────────────┐
                           │ DATASET / SOURCE           │  (implicit: string on Site.source)
                           │ MARRS | CoralSoundExplorer │
                           │ Hurricane Irma Dataset |   │
                           │ NOAA SanctSound            │
                           └─────────────┬──────────────┘
                                         │ 1..*
                                         ▼
 ┌──────────────────────┐  0..1  ┌──────────────────────────────┐   1   ┌────────────────────────┐
 │ BIOGEOGRAPHIC REGION │◄───────│ REFERENCE SITE (54)          │──────►│ SITE EMBEDDING (≤48)   │
 │ (12 hard-coded bbox) │ derived│ site_id, country, region,    │ 0..1  │ 1280-d mean vector     │
 │ region_detection.py  │ by bbox│ status, lat, lon, source,    │       │ (S3 metadata_v6 only;  │
 └──────────▲───────────┘        │ has_embedding, synthetic     │       │  never exposed by API) │
            │                    └──────────────┬───────────────┘       └───────────▲────────────┘
            │                                   │ upstream only (not stored)          │ mean of
            │                                   ▼                                     │
            │                    ┌──────────────────────────────┐   1..* ┌────────────┴───────────┐
            │                    │ RECORDING (upstream)         │───────►│ WINDOW EMBEDDING       │
            │                    │ 60 s WAV, YYYYMMDD_HHMMSS    │        │ 5 s @ 32 kHz → 1280-d  │
            │                    │ (MARRS 542,187 files)        │        │ (discarded after mean) │
            │                    └──────────────────────────────┘        └────────────────────────┘
            │
            │ derived from optional lat/lon
 ┌──────────┴───────────┐ 1   1 ┌──────────────────────────────┐ 1  1..120 ┌──────────────────────┐
 │ UPLOAD               │──────►│ ANALYSIS JOB                 │──────────►│ SEGMENT (5 s window) │
 │ DDB UPLOAD#{id}/     │       │ DDB ANALYSIS#{id}/METADATA,  │ transient │ S3 segments.json;    │
 │ METADATA             │       │ PREPROCESSED, RESULT, ERROR  │           │ its embedding is     │
 └──────────────────────┘       └──────────────┬───────────────┘           │ discarded after mean │
                                               │ 1                         └──────────────────────┘
               ┌───────────────────────────────┼──────────────────────────────┐
               ▼ 1                             ▼ 3 (top-k)                     ▼ 1
 ┌──────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────────┐
 │ CLASSIFICATION           │  │ SIMILAR-SITE MATCH           │  │ VISUALIZATION (pseudo-2D)    │
 │ label, confidence,       │  │ site_id, similarity (cosine),│  │ user (x,y) + ≤10 ref (x,y)   │
 │ probabilities{4},        │  │ country, status  → Site      │  │ x=mean(dims[:640]),          │
 │ model_version, region{}  │  └──────────────────────────────┘  │ y=mean(dims[640:])           │
 └──────────────────────────┘                                     └──────────────────────────────┘

 ┌──────────────────────────────┐        ┌──────────────────────────────┐
 │ TRAINING SAMPLE (offline)    │ *    1 │ CLASSIFIER MODEL             │
 │ file_id, site_id, label,     │───────►│ MLP 1280→256→64→4, npz +     │
 │ country, timestamp, 1280-d   │        │ model_config.json (v2.0?)    │
 │ (data/training/*.json, n=140)│        └──────────────────────────────┘
 └──────────────────────────────┘
 ┌──────────────────────────────┐
 │ GALLERY SAMPLE (live /samples│  site_id → Site (but phl_D1 has no Site);
 │ endpoint, not in repo)       │  audio_url → S3 presigned 15 s synthetic WAV
 └──────────────────────────────┘
```

### 1.2 Entity field tables (real values)

**Reference Site** (`GET /prod/sites`, `router/handler.py:256-266`). This is the only field set the API exposes.

| Field | Type | Real example | Notes |
|---|---|---|---|
| `site_id` | string | `ind_R4`, `borabora_tourist`, `sanctsound_fk02` | MARRS IDs encode `{country}_{class letter}{n}`: H healthy, D degraded, N restored_early, R restored_mid. Code paths parse the letter (`generate_training_embeddings.py:64-69`). |
| `country` | string | `Indonesia` | 7 values |
| `region` | string | `South Sulawesi` | **One per country** (7 values). This is a project area, not a biogeographic region. |
| `status` | enum | `restored_mid` | healthy 19, degraded 17, restored_mid 8, restored_early 6, unknown 4 |
| `latitude`/`longitude` | float | `-4.927955`, `119.315882` | 4–7 decimals (see §2) |
| `has_embedding` | bool | `false` for `ken_D3`, `irma_eastern_sambo`, `sanctsound_fk01..04` | 48 true / 6 false. The top-level `sites_with_embeddings` says **44** (stale: `merge_expansion_embeddings.py` never recomputes it). |
| `source` | string | `MARRS`, `CoralSoundExplorer`, `Hurricane Irma Dataset`, `NOAA SanctSound` | Free-text dataset identifier. No DOI is exposed (DOIs exist in S3 JSON for some sites, `merge_metadata_v6.py:32`). |
| `synthetic` | bool | `false` for all 54 | Describes the *site record*, not the audio. False even where the classifier class was learned from synthetic audio (F2). |

Top-level response: `{total_sites: 54, total_all_sites: 54, sites_with_embeddings: 44, countries: [...7], version: "6.0", source: "MARRS dataset (DOI: 10.5522/04/29958062)", notes: ""}`. `source` is a single string even though 4 sources exist.

Fields stored in S3 but **not exposed**: the `embedding` / `mean_embedding` 1280-float vector; `recordings_used` and `windows_processed` (v4, `generate_site_embeddings.py:342-346`); `doi`, `citation` (expansion sites); `site_type`. The frontend type `Site` (`types/index.ts:5-15`) expects `location` (never sent). `SitesResponse.count` (l.19) is never sent either. A hard-coded `SITE_COORDINATES` map (l.128-192) lists **56 IDs**, including `irma_*_pre/_post` that the API doesn't return, and it lacks `irma_eastern_sambo`, which the API does return.

**Upload** (DDB `UPLOAD#{id}/METADATA`, `router/handler.py:126-136`): `upload_id` (uuid), `filename` (from `X-Filename`), `s3_key` `uploads/{id}/{filename}`, `size_bytes`, `content_type`, `status` (uploaded→processing→complete|failed), `created_at` (UTC server time, not recording time).

**Analysis job** (DDB `ANALYSIS#{id}`):
- `METADATA`: status, stage, created_at.
- `PREPROCESSED` (`preprocessor/handler.py:162-172`): `duration_seconds` (stored as **string**), `num_segments`, `processed_key`, `segments_key`.
- `RESULT` (`classifier/handler.py:102-123`): classification, similar_sites, visualization, `embedding_summary {dimension:1280, num_segments, aggregation:"mean", synthetic:false, embedding_model:"surfperch", embedding_version:"1.0", classifier_model:"trained_mlp", classifier_version}`, completed_at, caveats.
- `ERROR`: error_code, error, stage, retry_count, request_id, suggestion.
- **Not persisted:** user latitude/longitude (passed through Lambda events, `router/handler.py:176-179`; only the derived `region` survives inside classification), original sample rate, bit depth and channels (only in S3 `segments.json`, `preprocessor/handler.py:146-153`), and per-segment embeddings.

**Segment**: 160,000 float samples (5.0 s @ 32 kHz) in `processed/{analysis_id}/segments.json`. The trailing partial window is **dropped** (`preprocessor/handler.py:116`, `int(duration/5)`). Count is 1–120 (the 600 s cap gives 120). Segment embeddings exist only in Lambda memory (`classifier/handler.py:88-89`) and are then averaged away.

**Classification** (`classifier/handler.py:470-475` + `region_detection.py:199-204`): `{label, confidence, probabilities:{degraded, healthy, restored_early, restored_mid}, model_version, region:{detected, name, in_training_distribution, confidence_adjusted}}`.

**Similar-site match** (`handler.py:524-529`): `{site_id, similarity (cosine), country, status}`, top 3.

**Visualization** (`handler.py:573-577`): `{type:"projection_2d", coordinates:{x,y}, reference_sites:[{site_id,x,y,status}] ≤10}`.

**Gallery sample** (live `GET /samples`; **the router code in this repo has no `/samples` route**, `router/handler.py:43-63`, and `dashboard-next/src/lib/samples.ts`, imported at `app/experience/page.tsx:18`, is not in git. The deployed backend and this repo have diverged):
`{id:"idn_healthy_dawn", site_id:"ind_H1", name:"Dawn Chorus, Sulawesi", country, country_code, category:"healthy", description, duration_seconds:30 (actual file is 15.0 s), audio_url (S3 presigned), frequency_highlights:["Fish chorus (200–2000 Hz)","Snapping shrimp (2–20 kHz)"], coordinates:{lat,lng}}` plus `stories{healthy_vs_degraded, restoration_timeline, geographic_diversity}`.

**Training sample** (offline, `generate_training_embeddings.py:384-391`): `{file_id:"ind_D2_20220830_124200", site_id, country, label, embedding[1280], timestamp:"2022-08-30T12:42:00"}`. This is the **only place a recording timestamp survives** in any ReefRadar artifact, and it isn't deployed.

---

## 2. Geography

### 2.1 Spatial entities that exist

| Level | What it is in data | Count | Source of truth |
|---|---|---|---|
| Biogeographic region | 12 hand-drawn lat/lon boxes, smallest-area wins | 12 (5 broad, 7 specific) | `region_detection.py:15-97`. Used only to tag *uploads*, never sites. |
| Country | `Site.country` | 7 | metadata |
| Project area | `Site.region` (1:1 with country) | 7 | metadata |
| Site | point | 54 (53 unique places in reality; see below) | metadata |

No reef, habitat (fore-reef/fringing/channel), depth or transect level exists. Upstream MARRS gives depth only as a range (1.2–4 m at low tide, fringing reef, recorder about 0.5 m above benthos; Williams et al. 2025). It gives no per-site depth. The KML's third coordinate (0–19.85 for Indonesia) is **not** depth; it contradicts the 1.2–4 m range.

### 2.2 Precision and clustering (computed from live `/sites`)

| Cluster | Sites | Bounding box | Coordinate decimals | Comment |
|---|---|---|---|---|
| South Sulawesi (ID) | 21 | 2.1 km × 0.5 km | 6–7 | Matches the MARRS KML exactly |
| GBR (AU) | 7 | **0.14 km × 0.34 km** | 5 | All within one reef flat |
| Mombasa (KE) | 5 | 0.2 × 0.7 km | 6 | |
| N. Malé (MV) | 5 | 0.1 × 1.4 km | 4–7 | |
| Caribbean MX | 7 | 9.0 × 1.9 km | 6–7 | Two sub-clusters (about 18.26 and about 18.34 N) |
| Bora-Bora (PF) | 3 | 3.0 × 3.5 km | 4 | Coordinates look hand-placed; not from the Zenodo record [verify] |
| Florida Keys (US) | 6 | 18 × 83 km | 4 | Irma + SanctSound. **SanctSound coordinates are inconsistent with upstream naming**: per NCSU CMAST, FK01 = Western Dry Rocks and FK02 = Eastern Sambo, the *same reefs* as the Irma sites. ReefRadar places fk01 at (24.5575, −81.4044), about 54 km from WDR (24.4468, −81.9275). |

No two API sites share exact coordinates. The frontend constant, however, maps `irma_*_pre/_post` onto the same points (Irma pre/post = same reef, different time), which is a time distinction modelled as space. MARRS sites within a project are ≥50 m apart by design (paper).

### 2.3 Honest "semantic zoom"

| Zoom | What can honestly be shown | What would be fake |
|---|---|---|
| World (z 1–5) | **7 project clusters** (5 MARRS + Bora-Bora + Florida Keys), each with counts by status and source. Biogeographic-region boxes as an "in/out of training data" overlay. | 54 separate world dots (they overplot into 7). Any choropleth or "global reef health" surface. |
| Project (z 12–17) | Individual sites with status, restoration age bin, recording effort (MARRS `manifest.csv` file count, about days), and data availability (embedding / location-only). The GBR needs about z17 to separate 7 sites. | Interpolated or heat-mapped health between sites. "Nearby reef" inference. |
| Site | Labels with upstream definitions, provenance, recording effort, deployment window (from filenames upstream), and, if ingested, diel activity profiles and sonotype detections. | Per-site coral cover (only regional means published), depth, trends. |
| Recording / segment | Only for a user's own upload, and only if per-segment results are kept (§9). | |

---

## 3. Time

### 3.1 Temporal dimensions: stored vs upstream-only

| Dimension | Upstream | Stored in ReefRadar | Notes |
|---|---|---|---|
| Recording timestamp | MARRS filenames `site_YYYYMMDD_HHMMSS.WAV` (parsed in `generate_training_embeddings.py:199-224`). Irma: SoundTrap file times. CSE: `2022_*` folders. | **Training JSON only** (offline). Not in API, not in S3 site metadata. | **Timezone unverified**: HydroMoth/AudioMoth filenames default to **UTC**. `ATTRIBUTION.md` calls `mex_H1_20230627_171200` "dusk chorus" and `mal_D2_20211115_110800` "midday". If UTC, these are about 11:12 local (Mexico, UTC−5) and about 16:08 local (Maldives, UTC+5). [verify] |
| Deployment window per site | MARRS: Oct 2021 – Jun 2023 overall. About 3–40 days per site (file_count × duty cycle; ken_H1 is only 2.9 d, and ind_H4/H5/N1–N3 about 5 d vs about 22 d for other Indonesian sites). | No | The short Indonesian deployments are healthy H4/H5 and restored_early N1–3, which suggests a separate campaign. ind_H4, ind_H5 and ind_N1 are exactly the healthy/early training and reference sites, so **campaign is a candidate confound** [verify dates]. |
| Duty cycle | MARRS 1 min every 4 min (Indonesia every 2). Irma 2 min every 20 min. | No | Allows diel profiles at about 2–4 min resolution. |
| Diel (day/night) | Fully covered upstream (24 h). The paper's "recruitment cuescape" is a *night-time* fish sound metric. | No. Reference vectors are random windows with unknown hour. `download_marrs_samples.py:93` picks 5 random files per site (seeded with Python `hash()`, which is randomised per process, so **not reproducible**). | Diel is a large source of variance in reef soundscapes. A single upload is compared against a time-blind mean. |
| Season | MARRS: one about 1-month deployment per site, so **no within-site seasonality**. Countries were recorded in different months and years, so season is confounded with country. | No | |
| Restoration age | Two bins only: early <3 months, mid 32–53 months post install (paper). Per-site install dates are not in the figshare record. | As category only | The gallery text says "Two years into restoration" for `ind_R1` and labels `aus_R1` as `restored_early`. Both are wrong (`aus_R1` is mid, 32–53 months). |
| Pre/post Hurricane Irma | Irma Dryad/Zenodo: ESB 14 Jul – 17 Oct 2017, WDR 14 Jul – 1 Oct 2017. Irma passed 10 Sep 2017. | **No.** Live data has `irma_western_dry_rocks` (embedding from the *October* folder, `generate_expansion_embeddings.py:284`, i.e. post-storm) labelled `healthy`, and `irma_eastern_sambo` with no embedding. `add_irma_sites.py` (pre/post split) was **never deployed**, yet the frontend constants reference its IDs. | A genuine before/after natural experiment exists upstream and is unused. |
| Intra-recording timeline | Uploads are split into 5 s windows | **Discarded**: only the mean embedding is kept (`classifier/handler.py:89`). | Cheapest real "time" axis to add (§9). |

**Bottom line:** in deployed data the only real temporal attributes are the restoration-age bin and the `created_at` of uploads. Every other time axis exists only upstream.

---

## 4. Measurements and computed metrics

### 4.1 What is measured

Uncalibrated digital audio. No hydrophone sensitivity is applied anywhere, so **no absolute level (dB re 1 µPa)** exists for any source. MARRS recorders were HydroMoths at the lowest gain with "low gain range" (paper), so approximate calibration is possible for MARRS only. User uploads cannot be calibrated.

Preprocessing differs by path, and this is the train/serve skew in F8:

| Path | Normalisation | Window choice | Resampling |
|---|---|---|---|
| Training samples (`generate_training_embeddings.py:162-192`) | **Peak-normalise each file to 1.0** | **First** 5 s of each 60 s file | 16→32 kHz `np.interp` |
| MARRS reference vectors (v4, `generate_site_embeddings.py:131-152, 241`) | Peak-normalise | **First window of 5 random files**, i.e. **25 s of audio per site** | same |
| Original 6 sites (`generate_marrs_embeddings.py:122-142`) | Peak-normalise | All 12 windows of about 30 files (validation report §7) | same |
| Bora-Bora / Irma (`generate_expansion_embeddings.py:98-116`) | **None** (int/32768) | 1 **random** 5 s window × 10 files | inside inference Lambda, `np.interp` from native rate |
| User upload (`preprocessor/handler.py:100-140`) | **None** | **All** full 5 s windows; trailing partial dropped | `resample_linear`, no anti-alias filter (aliases when downsampling 44.1/48/96 kHz) |
| Inference container (`inference.py:98-103`) | Rescales only if max > 1 | | |

Data-quality edge cases: 32-bit **float** WAVs (format 3) are read as int32 (`preprocessor/handler.py:305-306`), which produces garbage. 24-bit WAVs are rejected by the preprocessor.

### 4.2 Derived metrics: units, range, meaning, uncertainty

| Metric | Computation | Units / range | Calibrated / meaningful? | Uncertainty available or computable |
|---|---|---|---|---|
| **Window embedding** | SurfPerch (EfficientNet-B1 family), 5 s @ 32 kHz (perch-hoplite `model_configs.py`: `sample_rate=32000, window_size_s=5.0`) → `flatten()[:1280]` of the first matching output key (`inference.py:161-176`) | 1280 floats. Observed per-element range about −0.20…+0.30, L2 about 2.1–2.4 (validation report) | A feature vector, not a measurement. Observed mins are about ≥ −0.278, consistent with pooled swish activations, which suggests the right output was picked. The key-selection code is fragile though (falls back to "first output", truncates). [verify signature output names] | Per-window vectors are available in classifier memory. Dispersion (trace of covariance, mean pairwise cosine) is computable for free. |
| **Recording/site mean embedding** | arithmetic mean over windows | as above, shrunk toward the centroid | Mean vectors from 5 vs 120 windows aren't comparable. The model was trained on single windows, not means. | n_windows is known (`num_segments`); a standard error per dimension is computable. |
| **Class probabilities** | MLP 1280→256→64→4 + softmax (`classifier/handler.py:437-475`) | 0–1, sums to 1 before adjustment | **Not calibrated.** The "calibration" table rests on 10 test samples (`MODEL_EVALUATION.md:31-38`). Labels: idx order `degraded, healthy, restored_early, restored_mid` (sorted strings). | Entropy and top-2 margin are computable now. A per-segment probability distribution is computable with no new infrastructure. Ensembles or MC-dropout would need retraining. |
| **Confidence** | `max(p)`, then × region multiplier | 0–1 | After ×0.6/0.7 it is **not a probability** and probabilities no longer sum to 1 (`region_detection.py:193-197`). Rendered as "%" in the UI (`AnalysisResults.tsx:65`). | Replace with entropy, margin, or the per-segment agreement fraction. |
| **Region multiplier** | bbox lookup: in-dist 1.0, OOD **0.6**, no coordinates **0.7** | scalar | Arbitrary constants. The broad boxes mark the whole Indian Ocean, W and **Central Pacific** "in distribution" (Hawaii would pass) although the classifier saw only Indonesia + Kenya. | Replace with an embedding-space OOD score (distance to the nearest training vector or Mahalanobis), computable from stored vectors. |
| **Cosine similarity** | `a·b/(‖a‖‖b‖)` vs each reference vector, top 3 (`handler.py:508-545`) | −1…1. In practice compressed to about 0.55–0.90 between site means (validation report §2) because the features are largely positive. | Rank is meaningful, the absolute value is not. Shown as "% similarity" (`AnalysisResults.tsx:190`), which reads like a percentage match. | Rank stability across segments (bootstrap over windows) is computable. |
| **"2D projection"** | x = mean(dims[0:640]), y = mean(dims[640:1280]); first 10 refs only | about ±0.02 | **Meaningless.** Averaging 640 unrelated dims is close to a constant. The 10 refs are whatever comes first in the file (likely 7 Australian + 3 Indonesian degraded). | Replace with PCA fitted on the 48 reference vectors (deterministic, explainable), with the user's windows projected into it. |
| **Client band energies** (`useAudioVisualBridge.ts:10-15`) | RMS of `getByteFrequencyData` bytes (dB-scaled 0–255, browser smoothing) in ambient 0–200, fish 200–2000, grazing 1–4 k, shrimp 2–20 k Hz | 0–1 unitless | Relative within one playback only. **Not comparable across clips** because every served clip is peak-normalised (0.85/0.9/0.95). For 16 kHz MARRS audio the "shrimp" band above 8 kHz is structurally empty. | n/a |
| **Band label schemes** | Three inconsistent definitions: `FrequencyBands.ts` (<800 / 800–3500 / >3500), `FrequencyBandLabels.tsx:10-14` (boat 0–500, fish 50–1000, shrimp 2–16 k), vitality store (4 bands above) | | Pick one, cite it, and clip it to the source Nyquist. | |
| **"Vitality" 0–1** | `ML_TO_VITALITY` healthy 1.0, restored_mid 0.7, restored_early 0.4, degraded 0 (`experience/page.tsx:513-518`), or crossfader position | 0–1 | **An invented ordinal-to-interval mapping** that drives the page colour. It implies early restoration is "40% healthy". Not a measurement. | n/a |
| Acoustic indices (ACI, ADI, BI, NDSI, H, SPL) | **Not computed anywhere** | | | Could be added in the preprocessor (§9) |

### 4.3 What "accuracy" means

v1: 90% on **10** test windows from the same 5 sites and the same deployments as training. v2: "90.5%" on about 21 windows, where 15% of the 40 synthetic `restored_mid` sines are trivially separable. Neither number estimates performance on a new site, region, time of day or recorder. A 95% CI on 9/10 is about 55–100%.

### 4.4 Similarity-search integrity [verify]

- Reference store read by the classifier: `reference/metadata.json` (`handler.py:491`). `upload_metadata_v6.py:78` overwrites it with v6, so similarity and `/sites` use the same 54-site file.
- The vector key is `mean_embedding` in the classifier, but `embedding` in v5/v6 writers. See F12. One real `/analyze` call (not done in this audit) would settle it: inspect `similar_sites` and `visualization.reference_sites`.
- Fallback `status_map` maps `R → restored_early` (`handler.py:516, 558`). That's wrong (R = restored_mid). Inert if `status` is present.

---

## 5. Provenance (per dataset)

### 5.1 MARRS (primary; all training and 44 of 48 reference vectors)

| Item | Upstream fact | ReefRadar |
|---|---|---|
| Title / DOI | *Coral Reef Soundscapes from a Global Restoration Programme*, UCL figshare **10.5522/04/29958062**, published 2025-09-24 | DOI correct |
| Authors | **Ben Williams**, Kate E. Jones, Aya Naseem, Gaby Nava, Angus Roberts, Freda Nicholson, Mars Coral Restoration Project Monitoring Team, Timothy Lamont, Tries Razak, Aimee du Luart, D. Erasmus, O. Stoole, A. Whittick, Rory Gibb, Steve Simpson, David Curnick | Cited **three different wrong ways**: "Sherwen, K. et al. 2024 … Monitoring And Restoration of Reef Soundscapes" (`SCIENTIFIC_VALIDITY.md:44`); "Williams, B., Maynes, T., Sherwood, O. et al. 2024" (`public/audio/ATTRIBUTION.md`); README Credits link to **zenodo 6024203, which is a scale-insect taxonomy record** (`README.md:379`) |
| Programme | MARRS = Mars Assisted Reef Restoration System (rubble stabilisation with "reef stars" plus coral out-planting) | README correct; SCIENTIFIC_VALIDITY wrong |
| Paper | Williams et al. 2025, bioRxiv 10.1101/2025.09.24.678197 | Not cited |
| License | CC BY 4.0 | Correct |
| Recorder | HydroMoth, 16 kHz, lowest gain + low-gain range, about 0.5 m above benthos | "16 kHz" known; rest not recorded |
| Depth / habitat | 1.2–4 m at low tide; ≥50×20 m fringing reef; sites ≥50 m apart | Not recorded |
| Dates / effort | Oct 2021 – Jun 2023; duty 1/4 min (Indonesia 1/2); mean 27.85 ± 10.11 days per site | Not recorded |
| Volume | 45 site zips, **542,187** one-minute files (about 9,036 h, about 1.04 TB uncompressed, about 566 GB zipped) + `manifest.csv` + `study_sites_map.kml` + **sonotype detections** per country (5 zips, about 66 GB) | 44 sites × 1 vector. Training: 100 × 5 s windows (**about 8 min** of audio). Reference: about 25 s per site for most sites. |
| Class definitions | Healthy = "least disturbed reef habitat in the local area"; Degraded = "comparable to restored sites prior to restoration" (rubble); Early = reef stars <3 months; Mid = 32–53 months | Partly reflected in README |
| Coral cover | Regional means only: Indonesia healthy 71.8 ± 10.1% vs degraded 10.2 ± 8.0%; Mexico healthy about 20 ± 7.9% vs degraded <5% | Not used |
| Site list | 45 zips incl. **`ken_D2`**; KML labels the same Kenyan point "D3"; KML codes restored as `ER`/`MR` | `ken_D3` shown (0 files); `ken_D2` audio never used |

### 5.2 Hurricane Irma (2 sites, 1 vector)

Simmons, Bohnenstiehl & Eggleston (NC State), *Hurricane impacts on a coral reef soundscape*, Dryad **10.5061/dryad.5tb2rbp38** (Dryad = CC0). Audio pulled from Zenodo 4396323 (`download_irma_samples.py:26-28`). SoundTrap ST-300, **48 kHz**, 120 s every 20 min, spur-and-groove fore-reef. ESB 14 Jul – 17 Oct 2017, WDR 14 Jul – 1 Oct 2017. **No health status is given upstream.** ReefRadar labels both `healthy` (`merge_metadata_v6.py:67,79`). The WDR vector = 10 random 5 s windows from the **October** (post-hurricane) folder. ESB has no vector.

### 5.3 CoralSoundExplorer, Bora-Bora (3 sites, 3 vectors)

Zenodo **14577064**, CC BY 4.0. Minier, Rouch et al. (PLOS Comp Bio; preprint 10.1101/2024.04.05.588225). Audio 3.3 GB plus precomputed **VGGish embeddings, mel-spectra, and UMAP/PCA** projections. Three sites (undisturbed / tourist / boat channel), each with 3 replicates, folders `2022_*`. Upstream describes these as sites with **different uses / disturbance**, not coral condition. ReefRadar maps tourist and boat traffic to `degraded` (`merge_metadata_v6.py:40,53`). Each vector = 10 random windows pooled across the 3 replicates.

### 5.4 NOAA SanctSound (4 sites, 0 vectors)

Public domain. Florida Keys FK01–FK04 (FK01 Western Dry Rocks, FK02 Eastern Sambo, FK03 9-Ft Stake/Eyeglass Bar, FK04 Sombrero per NCSU CMAST). Upstream offers hourly broadband and 1/3-octave SPL, vessel detections and fish/whale detections. ReefRadar stores only placeholder points with `status: unknown`, and the coordinates don't line up with the named reefs (§2.2).

### 5.5 ReefSet and SurfPerch (model provenance, no site data)

- ReefSet v1.0, Zenodo 11060189, CC BY 4.0: 57,084 clips × **1.88 s @ 16 kHz**, multi-project. It's SurfPerch's training data. ReefRadar uses no ReefSet audio.
- SurfPerch paper: Williams et al. 2024, **arXiv 2404.16436**. The repo cites **arXiv 2505.03071** (`ML_RESEARCH.md:16`, `SCIENTIFIC_VALIDITY.md:256`), which is a *different* paper ("The Search for Squawk: Agile Modeling in Bioacoustics", Dumoulin et al. 2025). Model: Kaggle `google/surfperch/tensorFlow2/1`. Perch-hoplite config: 32 kHz, 5 s, 1280-d. The README calls it "bird-vocalization-classifier" (`README.md:378`). It's actually reef + bird + AudioSet pre-trained.

### 5.6 Audio served by the product

| Asset | What it actually is | Measured |
|---|---|---|
| `public/audio/healthy-reef.wav`, `degraded-reef.wav` | Real MARRS, 15 s @ 16 kHz, peak-normalised to 0.95 (`ATTRIBUTION.md`) | No energy >8 kHz. RMS −21.0 vs −49.2 dBFS. Healthy is from `mex_H1` 17:12 and degraded from `mal_D2` 11:08: **different country, different hour** (and possibly UTC). The A/B therefore confounds health with region and time of day. |
| `public/audio/compare/aus/{healthy,degraded}.wav` | Real MARRS, 30 s @ 16 kHz, 3–5 random files concatenated, peak-normalised to 0.85 (`prepare_comparison_audio.py`) | After normalisation "degraded" is **8.6 dB louder** in RMS than "healthy" (−31.7 vs −40.3 dBFS). Peak normalisation removes level, the strongest health cue. |
| `compare/manifest.json` | Lists 17 files across 5 countries | **15 of 17 files don't exist** (only `aus/*` is in git; `*.wav` is gitignored). The manifest coordinates (e.g. Kenya −4.02, 39.67) disagree with the site coordinates (−2.21, 41.01). |
| Live `/samples` (8 clips, S3 `samples/*.wav`) | **Synthetic.** 15.0 s @ 32 kHz (API claims 30 s). Healthy clips: dominant 200 / 500 / 1000 Hz pure tones, spectral flatness 0.065, 88% energy in 50 bins. The three "healthy" clips across 2 countries are near-identical (r = 0.88). The two "degraded" clips share one profile, as do the two "restored" clips. Energy >8 kHz is impossible for MARRS. Descriptions invent biology ("bleached reef", "grouper booms and clownfish chirps", "outer reef wall" for a 1.2–4 m fringing reef). `phl_D1` "Philippines" has no upstream dataset. | Measured locally from the live presigned URLs. |

---

## 6. Classification semantics

**What the labels mean (MARRS):** a *site-level, locally relative habitat category* assigned by the restoration programme. "Healthy" is the best reef nearby, not an absolute standard: Mexico "healthy" (about 20% coral) is worse than Indonesia "degraded" in places. "Degraded" means rubble fields like those *before* reef-star installation. The restored classes are **time since intervention**, not a condition score. No label is per recording, and none is ordinal by construction. Restored_mid sites are *not* "between" degraded and healthy in any measured sense, and the paper reports mid-stage restored sites *exceeding* degraded and sometimes approaching or exceeding healthy on some functions.

**Training set** (from `CLASSIFIER_METRICS_AND_SCALING.md:80-115` + scripts):

| Class | Sites | Samples | Notes |
|---|---|---|---|
| degraded | ind_D2, ind_D3 | 40 | Long Indonesian deployment |
| healthy | ind_H4, ken_H1 | 40 | **Short** deployments (4.7 d and 2.9 d) |
| restored_early | ind_N1 | 20 | Short deployment (5.6 d) |
| restored_mid | "ind_R1, ind_R2" | 40 | **Synthetic sines** (F2) [verify] |
| **Total** | 5 real sites + synthetic | 140 | 80% from Indonesia. Australia, Maldives and Mexico: 0 |

`ARCHITECTURE.md:216` claims "7 MARRS sites (… ind_R1, ind_R2) with augmentation". The only code that produces ind_R1/ind_R2 training rows is the synthetic generator.

**Known confounds:**
1. **Site leakage.** The split is per window, so the model can memorise site and recorder signatures. Accuracy is effectively "which of 5 hydrophones is this".
2. **One site ≈ one class ≈ one deployment.** Class is confounded with recorder unit, exact spot, and deployment dates (healthy and early come from short campaigns, degraded from long ones).
3. **Region.** Healthy includes Kenya; the other classes are Indonesia only. "Kenya-ness" can predict "healthy".
4. **Diel.** Window hour isn't controlled, and the first 5 s of each file is used.
5. **Preprocessing skew** (§4.1) and **mean-vs-single-window** distribution shift.
6. **Synthetic class.** Any real `restored_mid` audio is out-of-distribution for its own class.

**Claims the UI may honestly make:**
- "Your recording's SurfPerch features are most similar to reference site X (rank 1 of 48), recorded by MARRS in [country]."
- "A small exploratory classifier trained on 5 Indonesian/Kenyan sites assigns these probabilities. It hasn't been validated on new sites or regions."
- "MARRS researchers categorised this site as *healthy = least-disturbed local reef* / *degraded = pre-restoration rubble* / *restored <3 months* / *restored 32–53 months*."
- "Upstream study (Williams et al. 2025) found mid-stage restored reefs had about 4× the night-time fish 'cuescape' and 21% higher phonic richness than degraded reefs." (A cited population-level result, not a ReefRadar output.)
- "Your recording is outside the geographic range of the training data" (as a flag, not a multiplier).

**Claims the UI must not make:**
- "This reef is healthy / X% healthy", or vitality-style scores (ordinal labels aren't a continuous health measure).
- "90% accurate" without "on 10 windows from the training sites".
- Restoration "timelines" or "recovery in sound" stories built from different sites or countries (`/samples` `restoration_timeline` story).
- Any sound attributed to a real site that isn't real audio from that site (F1).
- Species claims ("grouper booms", "clownfish", "parrotfish grazing") from band energy or embeddings.
- "Bleached", "coral cover", or "overfished" for any site.
- `degraded` for Bora-Bora tourist/boat sites, or `healthy` for Irma sites, without saying the label is ReefRadar's assumption.
- Any "confidence %" after the 0.6/0.7 multiplier.

---

## 7. Data volume: what "dense" can honestly mean

| Entity | Count now | Size |
|---|---|---|
| Reference sites | 54 (45 MARRS incl. phantom ken_D3, 3 CSE, 2 Irma, 4 SanctSound) | about 10 attributes each |
| Site vectors | 48 per `has_embedding` (44 per top-level count) | 48 × 1280 floats ≈ 61k numbers |
| Countries / project clusters | 7 / 7 | |
| Status classes | 4 + unknown, with n = 19 / 17 / 8 / 6 / 4 | restored_early has 6 sites total, all MARRS |
| Training samples | 140 (100 real windows, 40 synthetic) | about 8 min real audio |
| Classifier test set | 10 (v1) / about 21 (v2) | |
| Per analysis | 1–120 segments → 1 mean vector, 4 probabilities, 3 matches, 1 + ≤10 pseudo-points | |
| Upstream MARRS | 542,187 recordings, 9,036 h, 45 sites, timestamps at 2–4 min resolution | 1.04 TB |
| Upstream MARRS detections | 15 sonotypes × all files (per paper) | about 66 GB zipped |

With 54 sites × ~10 categorical fields, a "dense analytical UI" built on *current* data would be decoration. Two tables and one map cover it, and charts with 6-site classes have no statistical power. Density can be real along three axes only:
1. **Within an upload:** per-segment timelines (up to 120 points per analysis), with per-segment class probabilities, nearest-site rank and dispersion. This needs only a code change (§9).
2. **Within the reference set:** a genuine PCA/UMAP of 48 × 1280 vectors, with honest annotation that most points rest on 25 s of audio.
3. **Upstream time series:** diel and deployment-length activity profiles per MARRS site from filenames plus detections. This is where 9,000 hours live. It needs an ingestion job.

---

## 8. Lenses

| Lens | Supported? | Basis | Caveat to display |
|---|---|---|---|
| Dataset / source | **Yes** | `Site.source` | 4 sources, different recorders, rates and purposes. Not comparable in level. |
| MARRS habitat category | **Yes** | upstream label | Locally relative; definitions must be shown |
| Restoration stage (early <3 mo / mid 32–53 mo) | **Yes**, as 2 bins | upstream | 6 vs 8 sites; not a trajectory |
| Country / project cluster | **Yes** | metadata | |
| Data availability (embedding / location-only / in training set / reference-only) | **Yes** | metadata + training site list | Makes the thin evidence visible, which is honest |
| In vs out of training geography | **Partly** | bbox | Should be "classifier training sites = 5 sites in ID/KE"; reference coverage is a separate question |
| Recording effort (files, days) | **Yes** with cheap ingestion | MARRS `manifest.csv` | |
| Frequency bands as guilds (fish <1–2 kHz, shrimp snaps 2–8 kHz for 16 kHz data) | **Within one clip, relative only** | client FFT | Not species ID. Band ranges overlap; >8 kHz is absent for MARRS; peak-normalised clips can't be compared on level. |
| Embedding-space neighbourhood | **Yes** (rank) | cosine | Rank only; vectors rest on 25 s per site |
| Classifier class probability | **Weakly** | MLP | Exploratory; see §6 |
| Diel / time-of-day | **Not now** (upstream yes) | filenames | Needs timezone verification |
| Pre/post hurricane | **Not now** (upstream yes) | Irma archives | Not a health label |
| Season / trend / recovery over time | **No** | One deployment per site | |
| Coral cover, fish biomass, species, bleaching | **No** | | Only regional means published |
| Continuous "health score" / vitality | **No** | | Invented mapping |
| Absolute loudness (SPL) | **No** (MARRS approximately possible) | | Requires HydroMoth calibration; never for uploads |

---

## 9. Gaps and cheap additions (ranked by value per effort)

1. **Remove or replace the synthetic gallery** (F1). Real 15–30 s MARRS excerpts already exist for some sites. Each clip needs file name, UTC/local time and site provenance. Don't peak-normalise across a comparison set, or show the original level.
2. **Verify the deployed model** (`s3://reefradar-2477-embeddings/models/model_config.json`, `training_samples`, `version`). If v2.0, retrain without the synthetic rows, or drop `restored_mid` from the classifier output.
3. **Persist per-segment results** in the RESULT item: an array `{t_start, probs[4], top_site, cos_to_top}` per 5 s window, plus summary dispersion (fraction of segments agreeing with the label, mean pairwise cosine). About 120 × 6 numbers, no new infrastructure (`classifier/handler.py:88-99`).
4. **Real projection:** fit PCA on the reference vectors offline, ship `components[2×1280]` + mean, and project user windows. Deterministic and honest. Replaces F6.
5. **OOD score:** distance from the user mean vector to the nearest *training-site* vector and to the reference centroid, as a percentile of reference-to-reference distances. Replaces the 0.6/0.7 multipliers (F7). Keep probabilities summing to 1.
6. **Acoustic indices in the preprocessor** (numpy only, about 50 lines): RMS dBFS, band power in 50–1000 Hz / 1–2 kHz / 2–8 kHz (cap at Nyquist of the *original* rate), snap count (impulse peak detection in 2–8 kHz), ACI, ADI/H, spectral centroid. Label them "descriptive acoustic features" and don't map them to health.
7. **Read WAV metadata chunks:** AudioMoth/HydroMoth write timestamp, gain and battery into the `ICMT` comment. The preprocessor currently skips unknown chunks (`preprocessor/handler.py:292-294`). Also ask the user for recording datetime and depth (optional). Persist lat/lon.
8. **Fix provenance metadata:** `ken_D3`→`ken_D2` (and generate its vector); correct the MARRS/SurfPerch citations; add `doi`, `license`, `recorder`, `sample_rate_hz`, `deployment_start/end`, `files_upstream`, `recordings_used`, `windows_used`, `label_basis` ("upstream" vs "ReefRadar-assigned") to every Site and expose them in `/sites`. Recompute `sites_with_embeddings`.
9. **Diel-aware reference vectors:** re-embed MARRS sites with stratified hours (e.g. 4 per hour × 24 = 96 files per site) and store per-hour-bin vectors. This enables "compare against healthy sites *at the same time of day*". Low cost per the repo's own estimates (§3 in `CLASSIFIER_METRICS_AND_SCALING.md`).
10. **Ingest MARRS sonotype detections** (per-country zips, 2.7–50 GB): per-site diel profiles of snaps, scrapes, pulses and night fish calls. This is the scientifically grounded "guild" lens, from the dataset authors' own SurfPerch + agile-model pipeline (2.9% false-positive rate at logit ≥1.0).
11. **Irma pre/post** as a *time* lens on two reefs (deploy `add_irma_sites.py` logic, but label status `unknown` and attach `period: pre|post`).
12. **Proper evaluation:** leave-one-site-out and leave-one-country-out CV across all 44 MARRS sites. Report balanced accuracy with CIs. Until then, show the classifier as exploratory.
13. **Reconcile repo vs deployment:** `/samples` route and `lib/samples.ts` are missing from the repo, and the frontend `SITE_COORDINATES` disagrees with the API.

---

## Appendix A: Sources

Code: `lambdas/router/handler.py`, `lambdas/preprocessor/handler.py`, `lambdas/classifier/handler.py`, `lambdas/classifier/region_detection.py`, `infrastructure/lambda_container/inference.py`, `scripts/{train_classifier, add_restored_mid_and_retrain, generate_training_embeddings, generate_site_embeddings, generate_marrs_embeddings, generate_expansion_embeddings, generate_irma_embeddings, download_marrs_samples, download_irma_samples, merge_metadata_v6, merge_expansion_embeddings, merge_irma_embeddings, add_irma_sites, upload_metadata_v6, prepare_comparison_audio}.py`, `dashboard-next/src/{types/index.ts, hooks/useAudioVisualBridge.ts, stores/vitality-store.ts, components/spectrogram/FrequencyBands.ts, components/audio/FrequencyBandLabels.tsx, components/EmbeddingChart.tsx, components/AnalysisResults.tsx, app/experience/page.tsx}`, `dashboard-next/public/audio/**`, `docs/*.md`, `README.md`, `ARCHITECTURE.md`, `TO-DOS.md`.

Live API (GET, 2026-10-01 00:46 UTC): `/prod/health` → `{"status":"healthy"}`; `/prod/sites` → v6.0, 54 sites; `/prod/samples` → 8 samples + 3 stories.

Upstream:
- [MARRS figshare 10.5522/04/29958062](https://doi.org/10.5522/04/29958062) (+ `manifest.csv`, `study_sites_map.kml`)
- [Williams et al. 2025 bioRxiv 10.1101/2025.09.24.678197](https://www.biorxiv.org/content/10.1101/2025.09.24.678197v1.full)
- [MARRS analysis repo](https://github.com/BenUCL/MARRS_global_acoustic_study)
- [Dryad Irma 10.5061/dryad.5tb2rbp38](https://datadryad.org/dataset/doi:10.5061/dryad.5tb2rbp38)
- [CoralSoundExplorer Zenodo 14577064](https://zenodo.org/records/14577064)
- [CoralSoundExplorer paper (Ifremer archive)](https://archimer.ifremer.fr/doc/00949/106051)
- [ReefSet Zenodo 11060189](https://zenodo.org/records/11060189)
- [SurfPerch arXiv 2404.16436](https://arxiv.org/abs/2404.16436)
- [arXiv 2505.03071 (mis-cited)](https://arxiv.org/abs/2505.03071)
- [perch-hoplite model_configs.py](https://github.com/google-research/perch-hoplite/blob/main/perch_hoplite/zoo/model_configs.py)
- [NCSU CMAST SanctSound FK sites](https://cmast.ncsu.edu/wp-json/wp/v2/posts/5169)
- [zenodo 6024203 (README credit, unrelated record)](https://zenodo.org/records/6024203)
