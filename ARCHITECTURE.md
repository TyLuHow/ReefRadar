# ReefRadar - Technical Architecture

> **See Also:** [Architecture Diagrams (Mermaid)](./docs/ARCHITECTURE_DIAGRAMS.md) - Interactive diagrams that render on GitHub.

## System Architecture Diagram

```
                                    +-------------------------------------+
                                    |           USER INTERFACE            |
                                    |          +-----------+          |
                                    |          |  Next.js  |          |
                                    |          | Dashboard |          |
                                    |          +-----+-----+          |
                                    +---------------|-----------------+
                                                    | HTTPS
                                    +---------------v-----------------+
                                    |         API GATEWAY (HTTP)       |
                                    |  +-----------------------------+ |
                                    |  |   rgoe4pqatf / prod stage   | |
                                    |  |   CORS: Allow all origins   | |
                                    |  +-----------------------------+ |
                                    +---------------+-----------------+
                                                    | $default route
                                    +---------------v-----------------+
                                    |        LAMBDA: ROUTER            |
                                    |  +-----------------------------+ |
                                    |  |  Route requests             | |
                                    |  |  Handle uploads to S3       | |
                                    |  |  Query DynamoDB             | |
                                    |  |  Trigger preprocessing      | |
                                    |  |  Forward lat/lon coords     | |
                                    |  +-----------------------------+ |
                                    +--------+------------------+------+
                                             |                  |
                           +-----------------v------+   +-------v--------+
                           |   LAMBDA: PREPROCESS   |   |    DynamoDB    |
                           | +--------------------+ |   | +------------+ |
                           | | Download from S3   | |   | |  Metadata  | |
                           | | Convert to 32kHz   | |   | |   Table    | |
                           | | Segment 5.0s       | |   | | pk/sk keys | |
                           | | Forward coords     | |   | +------------+ |
                           | +--------------------+ |   +----------------+
                           +------------+-----------+
                                        | async invoke
                           +------------v-----------+
                           |  LAMBDA: CLASSIFIER    |
                           | +--------------------+ |
                           | | Invoke inference   | |
                           | | MLP classification | |
                           | | Region detection   | |
                           | | Cosine similarity  | |
                           | | Store results      | |
                           | +--------------------+ |
                           +------+-----+-----------+
                                  |     |
              +-------------------+     +-------------------+
              |                                             |
    +---------v---------+                        +----------v----------+
    |  LAMBDA: INFERENCE |                        |    S3: EMBEDDINGS   |
    | (Container, 3GB)  |                        | +-----------------+ |
    | +---------------+ |                        | | reference/      | |
    | | SurfPerch     | |                        | |  metadata.json  | |
    | | TensorFlow    | |                        | |  (54 sites,     | |
    | | perch-hoplite | |                        | |   1280-dim)     | |
    | | 1280-dim out  | |                        | +-----------------+ |
    | +---------------+ |                        +---------------------+
    +-------------------+
```

## Component Details

### 1. API Gateway

**Type:** HTTP API (v2)
**Endpoint:** `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`

- Single `$default` route catches all requests
- Lambda proxy integration (payload format 2.0)
- CORS enabled for all origins
- No authentication configured

### 2. Lambda Functions

#### Router (reefradar-2477-router)
**Memory:** 256 MB | **Timeout:** 30s

**Routes:**
| Method | Path | Handler |
|--------|------|---------|
| GET | /health | Health check |
| GET | /sites | List reference sites |
| POST | /upload | Upload WAV file |
| POST | /analyze | Start analysis (accepts optional lat/lon) |
| GET | /visualize/{id} | Get analysis results |
| GET | /status/{id} | Get processing stage |

**Key patterns:**
- Stage prefix stripping (API Gateway adds `/prod`)
- `DecimalEncoder` for DynamoDB Decimal-to-float conversion
- Forwards `latitude`/`longitude` from `/analyze` body through the pipeline

#### Preprocessor (reefradar-2477-preprocessor)
**Memory:** 1024 MB | **Timeout:** 180s | **Layer:** numpy

**Processing Pipeline:**
1. Download WAV from S3
2. Parse WAV headers (pure Python, no ffmpeg)
3. Convert to mono if stereo
4. Resample to 32kHz using linear interpolation
5. Segment into 5.0-second windows (160,000 samples)
6. Store segments as JSON in S3
7. Forward coordinates to classifier

**Audio Requirements:**
- Input: WAV format (8/16/32 bit PCM)
- Output: 32kHz, mono, float32
- Minimum duration: 5 seconds

#### Classifier (reefradar-2477-classifier)
**Memory:** 512 MB | **Timeout:** 120s | **Layer:** numpy

**Files:** `handler.py` + `region_detection.py`

**Classification Pipeline:**
1. Load audio segments from S3
2. Invoke inference Lambda to generate real SurfPerch embeddings
3. Average embeddings across segments (mean pooling)
4. Classify using the deployed trained MLP (interim real-only model, 1280->256->64->3)
5. Detect geographic region from coordinates and report distance to the nearest real training site (probabilities are never adjusted)
6. Find top similar reference sites via cosine similarity (with their label source; an explicit note if unavailable)
7. Store results in DynamoDB (one terminal RESULT or ERROR item per analysis)

**Categories:**
Dataset (MARRS) reference labels, each assigned by the dataset's researchers:
- `healthy` - least disturbed reef habitat in the local area
- `degraded` - comparable to restored sites prior to restoration (rubble)
- `restored_early` - reef stars installed less than 3 months before recording
- `restored_mid` - restored 32 to 53 months before recording (reference label only; the deployed model is 3-class and has no `restored_mid` output)

#### Inference (reefradar-2477-inference)
**Memory:** 3008 MB | **Timeout:** 300s | **Runtime:** Container (Python 3.12)

**Container contents:**
- TensorFlow CPU
- perch-hoplite (SurfPerch model loader)
- kagglehub (model download)
- setuptools (pkg_resources dependency)

**Pipeline:**
1. Receive audio segments (JSON array of float32 arrays)
2. Load SurfPerch model from Kaggle cache (first invocation downloads ~127MB)
3. Process each segment through SurfPerch
4. Return 1280-dimensional embeddings per segment

**Build:** Via AWS CodeBuild (`reefradar-2477-inference-build`)

### 3. Geographic Region Detection

**File:** `lambdas/classifier/region_detection.py`

Names the biogeographic region of a recording from its coordinates and reports how far it is from the classifier's real training sites. It never scales or adjusts probabilities or confidence (removed in Phase 1, D-12).

| Field | Meaning |
|-------|---------|
| `detected` / `name` | Region name from a coarse bounding box (descriptive only) |
| `in_training_region` | True only when a real training site is within 50 km (`training_radius_km`) |
| `nearest_training_site_km` | Distance to the nearest real training site |
| `training_countries` | Countries of the real training sites (currently Indonesia and Kenya) |
| no coordinates | `coordinates_provided: false`; the caveat says the location relative to the training sites is unknown |

Being near a training site is not validation of the model there.

### 4. Storage

#### S3: Audio Bucket (`reefradar-2477-audio`)

| Folder | Purpose |
|--------|---------|
| `uploads/{upload_id}/` | Original user uploads |
| `processed/{analysis_id}/` | Converted audio + segments JSON |

#### S3: Embeddings Bucket (`reefradar-2477-embeddings`)

| Folder | Purpose |
|--------|---------|
| `reference/metadata.json` | 54 reference site embeddings |
| `layers/` | Lambda layer zips |

#### DynamoDB (`reefradar-2477-metadata`)

**Mode:** On-Demand (pay-per-request)

| pk | sk | Contents |
|----|-----|----------|
| `UPLOAD#{id}` | `METADATA` | filename, s3_key, size, status, created_at |
| `ANALYSIS#{id}` | `PREPROCESSED` | duration, num_segments, processed_key |
| `ANALYSIS#{id}` | `RESULT` | classification, similar_sites, similar_sites_error |
| `ANALYSIS#{id}` | `ERROR` | error message, status |

### 5. ML Pipeline

#### SurfPerch Model
**Source:** SurfPerch (Williams et al. 2024, arXiv:2404.16436), Google Research — pre-trained on reef, bird and general audio. Canonical citation: [docs/CITATIONS.md](./docs/CITATIONS.md)
**Input:** 160,000 samples (5s @ 32kHz)
**Output:** 1280-dimensional embedding vector

The model runs in a Lambda container via perch-hoplite. First invocation downloads the model from Kaggle (~127MB), subsequent invocations use the cached model in `/tmp`.

#### MLP Classifier
**Architecture:** 1280 -> 256 (ReLU) -> 64 (ReLU) -> 4 (Softmax)
**Test Accuracy:** ~90.5%
**Inference:** Pure NumPy (no TensorFlow dependency in classifier Lambda)
**Weights:** `models/reef_classifier_weights.npz`

Trained on real SurfPerch embeddings from 7 MARRS sites (ind_H4, ind_H5, ind_N1, ind_D2, ind_D3, ind_R1, ind_R2) with augmentation.

#### Reference Embeddings
54 sites across 7 countries with real SurfPerch embeddings:
- **Indonesia**: 21 sites (healthy, degraded, restored early/mid)
- **Australia**: 7 sites (Great Barrier Reef)
- **Kenya**: 5 sites (Mombasa Coast)
- **Maldives**: 5 sites (North Male Atoll)
- **Mexico**: 7 sites (Caribbean Coast)
- **USA**: 8 sites (Florida Keys -- Hurricane Irma + NOAA SanctSound)
- **French Polynesia**: 3 sites (Bora-Bora -- CoralSoundExplorer)

### 6. Frontends

#### Next.js Dashboard (Primary)
**Location:** `dashboard-next/`
**Stack:** Next.js 16 (App Router, React 19), TypeScript, Tailwind CSS, MapLibre maps (maplibre-gl with react-map-gl), Observable Plot and d3 modules for charts

**Pages:**
- `/` - Upload and analyze audio with optional coordinates
- `/sites` - Interactive map of reference sites
- `/about` - Methodology, limitations, and references

**Features:**
- Drag-and-drop file upload
- Optional lat/lon input for region detection
- Animated probability distribution bars
- Interactive MapLibre map of similar sites
- Region detection warnings for out-of-distribution

## Security Considerations

### Current State (Demo)
- No authentication on API
- CORS allows all origins
- IAM roles use broad policies
- No encryption at rest configured

### Production Recommendations
1. Add API key or Cognito authentication
2. Restrict CORS to specific origins
3. Use least-privilege IAM policies
4. Enable S3 bucket encryption
5. Add WAF for API protection
6. Implement rate limiting

## Performance

| Stage | Typical Duration |
|-------|-----------------|
| Upload (1MB file) | 1-2 seconds |
| Preprocessing | 3-5 seconds |
| Inference (warm) | 5-10 seconds |
| Inference (cold) | 15-35 seconds |
| Classification | 1-2 seconds |
| Total (warm) | 10-20 seconds |
| Total (cold) | 25-45 seconds |
