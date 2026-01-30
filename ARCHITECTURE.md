# ReefRadar - Technical Architecture

## System Architecture Diagram

```
                                    ┌─────────────────────────────────────┐
                                    │           USER INTERFACE            │
                                    │  ┌─────────────┐  ┌─────────────┐   │
                                    │  │  Streamlit  │  │   curl/     │   │
                                    │  │  Dashboard  │  │  Browser    │   │
                                    │  └──────┬──────┘  └──────┬──────┘   │
                                    └─────────┼────────────────┼──────────┘
                                              │                │
                                              └───────┬────────┘
                                                      │ HTTPS
                                    ┌─────────────────▼─────────────────┐
                                    │         API GATEWAY (HTTP)         │
                                    │  ┌─────────────────────────────┐  │
                                    │  │   rgoe4pqatf / prod stage   │  │
                                    │  │   CORS: Allow all origins   │  │
                                    │  └─────────────────────────────┘  │
                                    └─────────────────┬─────────────────┘
                                                      │ $default route
                                    ┌─────────────────▼─────────────────┐
                                    │        LAMBDA: ROUTER              │
                                    │  ┌─────────────────────────────┐  │
                                    │  │  • Route requests           │  │
                                    │  │  • Handle uploads to S3     │  │
                                    │  │  • Query DynamoDB           │  │
                                    │  │  • Trigger preprocessing    │  │
                                    │  └─────────────────────────────┘  │
                                    └────────┬──────────────────┬───────┘
                                             │                  │
                           ┌─────────────────▼──────┐   ┌───────▼────────┐
                           │   LAMBDA: PREPROCESS   │   │    DynamoDB    │
                           │ ┌────────────────────┐ │   │ ┌────────────┐ │
                           │ │ • Download from S3 │ │   │ │  Metadata  │ │
                           │ │ • Convert to 32kHz │ │   │ │   Table    │ │
                           │ │ • Segment audio    │ │   │ │ pk/sk keys │ │
                           │ │ • Trigger classify │ │   │ └────────────┘ │
                           │ └────────────────────┘ │   └────────────────┘
                           └────────────┬───────────┘
                                        │ async invoke
                           ┌────────────▼───────────┐
                           │  LAMBDA: CLASSIFIER    │
                           │ ┌────────────────────┐ │
                           │ │ • Load segments    │ │
                           │ │ • Generate embeds  │◄──── (Synthetic fallback)
                           │ │ • Compare to refs  │ │
                           │ │ • Store results    │ │
                           │ └────────────────────┘ │
                           └───────────┬────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
    ┌──────▼──────┐             ┌──────▼──────┐             ┌──────▼──────┐
    │  S3: AUDIO  │             │S3: EMBEDDINGS│             │  SAGEMAKER  │
    │ ┌─────────┐ │             │ ┌─────────┐ │             │ (XLA Error) │
    │ │uploads/ │ │             │ │models/  │ │             │ ┌─────────┐ │
    │ │processed│ │             │ │reference│ │             │ │SurfPerch│ │
    │ │reference│ │             │ │layers/  │ │             │ │ Model   │ │
    │ └─────────┘ │             │ └─────────┘ │             │ └─────────┘ │
    └─────────────┘             └─────────────┘             └─────────────┘
```

## Component Details

### 1. API Gateway

**Type:** HTTP API (v2)
**ID:** `rgoe4pqatf`
**Endpoint:** `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`

**Configuration:**
- Single `$default` route catches all requests
- Lambda proxy integration (payload format 2.0)
- CORS enabled for all origins
- No authentication configured

**Why HTTP API vs REST API:**
- Lower latency (~10ms vs ~30ms)
- Lower cost ($1.00/million vs $3.50/million)
- Simpler configuration
- Sufficient for this use case

### 2. Lambda Functions

#### Router (reefradar-2477-router)
**Purpose:** API request handling
**Memory:** 256 MB | **Timeout:** 30s

**Responsibilities:**
- Parse HTTP requests (method, path, headers, body)
- Route to appropriate handler function
- Handle file uploads (base64 decode if needed)
- Store uploads in S3
- Store metadata in DynamoDB
- Invoke preprocessor asynchronously
- Return JSON responses

**Code Highlights:**
```python
# Stage prefix stripping (API Gateway adds /prod)
stage = event.get('requestContext', {}).get('stage', '')
if stage and path.startswith(f'/{stage}'):
    path = path[len(f'/{stage}'):]

# DynamoDB Decimal handling
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
```

#### Preprocessor (reefradar-2477-preprocessor)
**Purpose:** Audio conversion and segmentation
**Memory:** 1024 MB | **Timeout:** 180s
**Layer:** numpy 1.26.4

**Processing Pipeline:**
1. Download WAV from S3
2. Parse WAV headers (pure Python, no ffmpeg)
3. Convert to mono if stereo
4. Normalize to float32 [-1, 1]
5. Resample to 32kHz using linear interpolation
6. Segment into 5-second chunks (160,000 samples)
7. Store segments as JSON
8. Trigger classifier

**Audio Requirements:**
- Input: WAV format (8/16/32 bit PCM)
- Output: 32kHz, mono, 16-bit PCM
- Minimum duration: 5 seconds

#### Classifier (reefradar-2477-classifier)
**Purpose:** Health classification
**Memory:** 512 MB | **Timeout:** 120s
**Layer:** numpy 1.26.4

**Classification Pipeline:**
1. Load audio segments from S3
2. Try SageMaker endpoint → fallback to synthetic
3. Generate 1280-dimensional embeddings
4. Compare to reference embeddings (cosine similarity)
5. Calculate category probabilities
6. Find top-3 similar reference sites
7. Generate 2D visualization coordinates
8. Store results in DynamoDB

**Categories:**
- `healthy` - Intact reef with diverse soundscape
- `degraded` - Reduced acoustic activity
- `restored_early` - Early restoration (0-2 years)
- `restored_mid` - Mid restoration (2-5 years)

### 3. Storage

#### S3: Audio Bucket
**Name:** `reefradar-2477-audio`

| Folder | Purpose |
|--------|---------|
| `uploads/{upload_id}/` | Original user uploads |
| `processed/{analysis_id}/` | Converted audio + segments JSON |
| `reference/` | Reference site audio files |

#### S3: Embeddings Bucket
**Name:** `reefradar-2477-embeddings`

| Folder | Purpose |
|--------|---------|
| `models/surfperch/` | SurfPerch model (model.tar.gz) |
| `reference/` | Pre-computed embeddings + metadata.json |
| `layers/` | Lambda layer zips |

#### DynamoDB: Metadata Table
**Name:** `reefradar-2477-metadata`
**Mode:** On-Demand (pay-per-request)

**Schema:**
```
Partition Key: pk (String)
Sort Key: sk (String)
```

**Item Types:**

| pk | sk | Contents |
|----|-----|----------|
| `UPLOAD#{id}` | `METADATA` | filename, s3_key, size, status, created_at |
| `ANALYSIS#{id}` | `PREPROCESSED` | duration, num_segments, processed_key |
| `ANALYSIS#{id}` | `RESULT` | classification, similar_sites, visualization |
| `ANALYSIS#{id}` | `ERROR` | error message, status |

### 4. ML Pipeline

#### SurfPerch Model
**Source:** Google Research (bird-vocalization-classifier)
**Input:** 160,000 samples (5s @ 32kHz)
**Output:**
- `output_0`: Logits (not used)
- `output_1`: 1280-dim embedding vector

**Issue:** Model compiled with XLA, incompatible with TensorFlow Serving.

#### Synthetic Embedding Fallback
When SageMaker fails, generates embeddings from audio features:
- RMS energy
- Zero crossing rate
- Peak amplitude
- Spectral centroid
- Deterministic noise based on RMS seed

**Note:** Synthetic embeddings are for demo purposes only. They provide consistent but not acoustically meaningful results.

#### Reference Embeddings
Pre-computed embeddings for 8 reference sites:
- 3 healthy (Australia × 2, Indonesia)
- 2 degraded (Australia, Philippines)
- 2 early restoration (Australia, Mexico)
- 1 mid restoration (Indonesia)

Stored in `s3://reefradar-2477-embeddings/reference/metadata.json`

### 5. Frontend

#### Streamlit Dashboard
**Location:** `~/ReefRadar/dashboard/app.py`
**Port:** 8501

**Tabs:**
1. **Analyze Audio** - Upload and process WAV files
2. **Reference Sites** - View database of reference sites
3. **About** - System documentation

**Features:**
- File upload with audio preview
- Progress bar during processing
- Interactive Plotly visualizations
- Probability distribution chart
- 2D acoustic space scatter plot

## Security Considerations

### Current State (Demo)
- No authentication on API
- CORS allows all origins
- IAM roles use FullAccess policies
- No encryption at rest configured

### Production Recommendations
1. Add API key or Cognito authentication
2. Restrict CORS to specific origins
3. Use least-privilege IAM policies
4. Enable S3 bucket encryption
5. Enable DynamoDB encryption
6. Add WAF for API protection
7. Implement rate limiting

## Performance Characteristics

| Stage | Typical Duration |
|-------|-----------------|
| Upload (1MB file) | 1-2 seconds |
| Preprocessing | 3-5 seconds |
| Classification | 2-4 seconds |
| Total end-to-end | 10-15 seconds |

**Bottlenecks:**
- Lambda cold starts (first request): +1-3 seconds
- S3 uploads for large files
- DynamoDB writes (minimal)

## Scalability

**Current Limits:**
- Lambda concurrent executions: 1000 (default)
- API Gateway: 10,000 requests/second
- DynamoDB: Unlimited (on-demand)
- S3: Unlimited

**Scaling Considerations:**
- Lambda scales automatically
- No provisioned capacity needed
- Consider S3 Transfer Acceleration for global users
- SageMaker Serverless could replace real-time endpoint
