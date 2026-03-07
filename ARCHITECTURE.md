# ReefRadar - Technical Architecture

> **See Also:** [Architecture Diagrams (Mermaid)](./docs/ARCHITECTURE_DIAGRAMS.md) - Interactive diagrams that render on GitHub.

## System Architecture Diagram

```
                                    +-------------------------------------+
                                    |           USER INTERFACE            |
                                    |  +-----------+  +-----------+       |
                                    |  |  Next.js  |  | Streamlit |       |
                                    |  | Dashboard |  | Dashboard |       |
                                    |  +-----+-----+  +-----+-----+      |
                                    +--------|--------------|-----------+
                                             |              |
                                             +------+-------+
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
4. Classify using trained MLP (1280->256->64->4)
5. Detect geographic region from coordinates
6. Adjust confidence for out-of-distribution regions
7. Find top similar reference sites via cosine similarity
8. Generate 2D visualization coordinates (PCA-like projection)
9. Store results in DynamoDB

**Categories:**
- `healthy` - Diverse bioacoustic signatures
- `degraded` - Reduced acoustic diversity
- `restored_early` - Early restoration (<3 months)
- `restored_mid` - Mid restoration (32-53 months)

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

Detects biogeographic region from recording coordinates and adjusts classification confidence:

| Region | Confidence Multiplier | Training Data? |
|--------|----------------------|----------------|
| Indo-Pacific West (Indonesia/Philippines) | 1.0 | Yes |
| Indian Ocean (Kenya/Maldives) | 1.0 | Yes |
| Indo-Pacific Central (Australia/PNG) | 0.6 | No |
| Caribbean | 0.6 | No |
| Eastern Atlantic | 0.6 | No |
| Red Sea | 0.6 | No |
| Eastern Pacific | 0.6 | No |
| Unknown (no coordinates) | 0.7 | Unknown |

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
| `ANALYSIS#{id}` | `RESULT` | classification, similar_sites, visualization |
| `ANALYSIS#{id}` | `ERROR` | error message, status |

### 5. ML Pipeline

#### SurfPerch Model
**Source:** Google Research (bird-vocalization-classifier)
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
**Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Leaflet maps

**Pages:**
- `/` - Upload and analyze audio with optional coordinates
- `/sites` - Interactive map of reference sites
- `/about` - Methodology, limitations, and references

**Features:**
- Drag-and-drop file upload
- Optional lat/lon input for region detection
- Animated probability distribution bars
- Interactive Leaflet map of similar sites
- Region detection warnings for out-of-distribution

#### Streamlit Dashboard (Legacy)
**Location:** `dashboard/app.py`
**Port:** 8501

3-tab interface: Analyze Audio, Reference Sites, About

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
