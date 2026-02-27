<objective>
Expand the ReefRadar reference site database from 45 MARRS sites to ~54 sites by adding Caribbean (Florida Keys) and Pacific (French Polynesia) locations. This prompt handles data acquisition, embedding generation, and metadata merging into v6.0.

Three new data sources:
1. CoralSoundExplorer (Bora-Bora, French Polynesia) — 3 sites, CC-BY 4.0, Zenodo
2. Hurricane Irma (Florida Keys, USA) — 2-4 sites, CC0, Zenodo/Dryad
3. SanctSound (Florida Keys, USA) — 4 sites, Public Domain, NOAA (location-only if download fails)
</objective>

<context>
Read CLAUDE.md for project conventions and architecture.

Key files:
- `data/embeddings/metadata_v5.json` — Current v5.0 with 45 sites (44 with real embeddings)
- `data/embeddings/marrs_sites.json` — MARRS site coordinates
- `lambdas/classifier/region_detection.py` — Geographic region detection
- `scripts/generate_site_embeddings.py` — Existing embedding generation script

Current state:
- 45 sites across 5 countries (Indonesia, Australia, Kenya, Maldives, Mexico)
- 44 sites have real SurfPerch 1280-dim embeddings
- 1 site (ken_D3) is location-only
- Inference Lambda: `reefradar-2477-inference` in us-east-1 (container-based)
- 921 GB disk space available

The inference Lambda accepts base64-encoded audio and returns 1280-dim SurfPerch embeddings.
</context>

<requirements>

## Step 1: Download CoralSoundExplorer (French Polynesia)

This is the easiest and most reliable dataset. Start here.

```bash
mkdir -p data/audio/french_polynesia
```

Download from Zenodo record 14577064. The dataset contains audio from 3 Bora-Bora sites with different anthropogenic pressure levels:
- Site 1: Undisturbed (healthy reference)
- Site 2: Tourist area (degraded - anthropogenic pressure)
- Site 3: Boat traffic zone (degraded - heavy boat traffic)

The full dataset is 3.3 GB. Download the audio archive:
- URL: `https://zenodo.org/records/14577064`
- Check what files are available via the Zenodo API first
- Download only the audio files (not supplementary materials)
- Extract to `data/audio/french_polynesia/`

If the download fails or the file structure is different than expected, document what you found and create the sites as location-only.

## Step 2: Attempt Hurricane Irma Download (Florida Keys)

The full Hurricane Irma dataset is 75 GB — way too large. We need only representative samples.

Two sites: Eastern Sambo and Western Dry Rocks (fore-reef)
- Pre-hurricane recordings (July 2017) → healthy baseline
- Post-hurricane recordings (October 2017) → degraded/impacted

Strategy:
1. First, check what's available via the Zenodo API: `https://zenodo.org/api/records/4396323`
2. Check Dryad mirror: DOI 10.5061/dryad.sxksn0319
3. Download the smallest available archive (or metadata CSV if individual files aren't available)
4. If we can only get a few files per site, that's fine — we need 5-10 WAV files per site for embedding generation
5. If download is not feasible (files too large, no granular access), add sites as location-only

```bash
mkdir -p data/audio/hurricane_irma
```

Sites to create:
- `irma_eastern_sambo_pre` — lat 24.4915, lon -81.6625, status: healthy
- `irma_eastern_sambo_post` — lat 24.4915, lon -81.6625, status: degraded
- `irma_western_dry_rocks_pre` — lat 24.4468, lon -81.9275, status: healthy
- `irma_western_dry_rocks_post` — lat 24.4468, lon -81.9275, status: degraded

## Step 3: SanctSound Sites (Location-Only)

NOAA SanctSound data requires gsutil or web interface access. Add these as location-only sites (no embeddings):

- `sanctsound_fk01` — lat 24.5575, lon -81.4044, Florida Keys
- `sanctsound_fk02` — lat 24.5433, lon -81.5192, Florida Keys
- `sanctsound_fk03` — lat 24.6128, lon -81.1067, Florida Keys
- `sanctsound_fk04` — lat 24.4561, lon -81.7858, Florida Keys

Status: "unknown" (to be classified when audio is processed later)
Source: "NOAA SanctSound"

## Step 4: Generate Embeddings for Downloaded Audio

Write a script `scripts/generate_expansion_embeddings.py` that:

1. Scans downloaded audio directories for WAV files
2. For each site, selects up to 10 representative WAV files
3. Invokes the inference Lambda (`reefradar-2477-inference`, region us-east-1) for each file:
   - Read WAV, base64-encode
   - Invoke Lambda with `{'audio_base64': ..., 'sample_rate': <actual_rate>}`
   - Collect returned embeddings
4. Computes mean embedding per site
5. Saves results to `data/embeddings/new_expansion_sites.json`

Rate limit: 0.3s between Lambda invocations.
Handle failures gracefully — if a site can't be embedded, mark it as location-only.

IMPORTANT: Check actual sample rates of downloaded audio before invoking Lambda. SurfPerch expects 32kHz.

Only run this script if we actually have downloaded audio files. If no audio was downloaded, skip to Step 5.

## Step 5: Create Metadata v6.0

Write a script `scripts/merge_metadata_v6.py` that:

1. Loads `data/embeddings/metadata_v5.json` (45 sites)
2. Loads `data/embeddings/new_expansion_sites.json` if it exists
3. Adds all new sites (with or without embeddings)
4. For sites with embeddings: `has_embedding: true`, include full embedding array
5. For location-only sites: `has_embedding: false`, `embedding: null`
6. Updates metadata: version "6.0", total_sites count, sites_with_embeddings count
7. Adds `sources` field listing all data sources
8. Saves to `data/embeddings/metadata_v6.json`

New site definitions (for sites without downloaded audio):

French Polynesia (if audio processing failed):
- borabora_undisturbed: lat -16.5004, lon -151.7415, healthy, "CoralSoundExplorer"
- borabora_tourist: lat -16.4864, lon -151.7256, degraded, "CoralSoundExplorer"
- borabora_boat_traffic: lat -16.5132, lon -151.7589, degraded, "CoralSoundExplorer"

Hurricane Irma (if download failed):
- irma_eastern_sambo: lat 24.4915, lon -81.6625, healthy, "Hurricane Irma Dataset"
- irma_western_dry_rocks: lat 24.4468, lon -81.9275, healthy, "Hurricane Irma Dataset"

All new sites should include:
- `site_id`, `country`, `region`, `status`, `latitude`, `longitude`
- `has_embedding` (boolean), `source` (string)
- `doi` where applicable
- `citation` for CoralSoundExplorer: "Minier et al. 2025, PLOS Computational Biology"

Country/region values:
- French Polynesia → region "Society Islands"
- USA → region "Florida Keys"

## Step 6: Create S3 Upload Script

Write `scripts/upload_metadata_v6.py` that:
1. Reads `data/embeddings/metadata_v6.json`
2. Validates: all sites have lat/lon, no duplicate site_ids
3. Uploads to `s3://reefradar-2477-embeddings/reference/metadata_v6.json` (versioned)
4. Uploads to `s3://reefradar-2477-embeddings/reference/metadata.json` (replaces current)
5. Prints summary: total sites, by country, with/without embeddings

Do NOT run this script automatically. Create it for the user to run when ready.

## Step 7: Update Region Detection

Update `lambdas/classifier/region_detection.py` to add:

Florida Keys region:
- lat_min: 24.3, lat_max: 25.5, lon_min: -82.5, lon_max: -80.0
- name: "Florida Keys"
- in_distribution: False (Caribbean, outside training distribution)

French Polynesia region:
- lat_min: -18, lat_max: -14, lon_min: -155, lon_max: -148
- name: "French Polynesia"
- in_distribution: False (Pacific, different ecosystem)

Do NOT deploy the Lambda — just update the code.
</requirements>

<constraints>
- Preserve all 45 existing sites and their embeddings exactly — do not modify metadata_v5.json
- All downloads must use verified URLs from the Zenodo/Dryad APIs
- Lambda invocations must use region us-east-1
- If a download fails, gracefully fall back to location-only entries
- Do NOT download more than 10 GB total
- Do NOT run the S3 upload script automatically
- All new site coordinates must be accurate (from published sources)
</constraints>

<verification>
1. `data/embeddings/metadata_v6.json` exists and is valid JSON
2. Site count is 50+ (45 existing + at least 5 new)
3. All existing 45 sites are preserved with embeddings intact
4. New sites have accurate coordinates (not null)
5. No duplicate site_ids
6. `scripts/upload_metadata_v6.py` and `scripts/merge_metadata_v6.py` are valid Python
7. `lambdas/classifier/region_detection.py` includes Florida Keys and French Polynesia regions
</verification>

<success_criteria>
- metadata_v6.json has 50+ sites across 7+ countries/territories
- At least 3 new sites have real SurfPerch embeddings (French Polynesia if downloaded)
- Florida Keys and French Polynesia sites included (with or without embeddings)
- SanctSound sites included as location-only
- Region detection updated for new regions
- All scripts created and syntactically valid
</success_criteria>
