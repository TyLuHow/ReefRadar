# ReefRadar - Coral Reef Acoustic Health Analysis System

A serverless AWS-based system for analyzing coral reef health through underwater acoustic recordings using machine learning.

**Project Prefix:** `reefradar-2477`
**AWS Account:** `781978598306` (tlubyhow@calpoly.edu)
**Region:** `us-east-1`
**API Endpoint:** https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [AWS Resources](#aws-resources)
- [API Reference](#api-reference)
- [Quick Start](#quick-start)
- [Cost Analysis](#cost-analysis)
- [Known Issues](#known-issues)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              REEFRADAR ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐         ┌─────────────────────────────────────────────┐
    │   Streamlit  │         │              AWS Cloud (us-east-1)          │
    │   Dashboard  │         │                                             │
    │  (localhost) │         │  ┌─────────────┐    ┌──────────────────┐   │
    └──────┬───────┘         │  │ API Gateway │───▶│  Lambda: Router  │   │
           │                 │  │  (HTTP API) │    │   (256 MB, 30s)  │   │
           │ HTTPS           │  └─────────────┘    └────────┬─────────┘   │
           │                 │                              │              │
           ▼                 │                    ┌─────────▼──────────┐   │
    ┌──────────────┐         │                    │ Lambda: Preprocess │   │
    │    Users     │─────────┼───────────────────▶│  (1024 MB, 180s)   │   │
    │  (Browser)   │         │                    │  + numpy layer     │   │
    └──────────────┘         │                    └─────────┬──────────┘   │
                             │                              │              │
                             │                    ┌─────────▼──────────┐   │
                             │                    │ Lambda: Classifier │   │
                             │                    │   (512 MB, 120s)   │   │
                             │                    │  + numpy layer     │   │
                             │                    └─────────┬──────────┘   │
                             │                              │              │
                             │  ┌───────────────────────────┼────────────┐ │
                             │  │                           ▼            │ │
                             │  │  ┌────────────┐    ┌─────────────┐    │ │
                             │  │  │ S3: Audio  │    │ S3: Embed   │    │ │
                             │  │  │  Bucket    │    │   Bucket    │    │ │
                             │  │  └────────────┘    └─────────────┘    │ │
                             │  │                                       │ │
                             │  │  ┌────────────┐    ┌─────────────┐    │ │
                             │  │  │  DynamoDB  │    │  SageMaker  │    │ │
                             │  │  │  Metadata  │    │  Endpoint*  │    │ │
                             │  │  └────────────┘    └─────────────┘    │ │
                             │  │         (* XLA issue - using fallback) │ │
                             │  └───────────────────────────────────────┘ │
                             └─────────────────────────────────────────────┘
```

### Data Flow

1. **Upload** (`POST /upload`)
   - User uploads WAV file via API or Dashboard
   - Router Lambda stores file in S3 (`uploads/{upload_id}/`)
   - Metadata recorded in DynamoDB

2. **Analyze** (`POST /analyze`)
   - Router triggers Preprocessor Lambda asynchronously
   - Returns `analysis_id` immediately (202 Accepted)

3. **Preprocess** (Async)
   - Downloads audio from S3
   - Converts to 32kHz mono, 16-bit PCM
   - Segments into 5-second chunks (160,000 samples each)
   - Stores segments as JSON in S3
   - Triggers Classifier Lambda

4. **Classify** (Async)
   - Loads audio segments from S3
   - Generates embeddings (synthetic fallback due to SageMaker XLA issue)
   - Compares to reference site embeddings using cosine similarity
   - Stores results in DynamoDB

5. **Visualize** (`GET /visualize/{analysis_id}`)
   - Returns classification results, similar sites, and visualization data

---

## AWS Resources

### S3 Buckets

| Bucket | Purpose | Contents |
|--------|---------|----------|
| `reefradar-2477-audio` | Audio storage | `uploads/`, `processed/`, `reference/` |
| `reefradar-2477-embeddings` | Model & embeddings | `models/`, `reference/`, `layers/` |

**Storage Usage:**
- Audio bucket: ~18 MB (17 files)
- Embeddings bucket: ~102 MB (11 files, includes 88MB model)

### DynamoDB

| Table | Schema | Mode |
|-------|--------|------|
| `reefradar-2477-metadata` | PK: `pk` (String), SK: `sk` (String) | On-Demand |

**Item Types:**
- `UPLOAD#{id}` / `METADATA` - Upload records
- `ANALYSIS#{id}` / `PREPROCESSED` - Preprocessing status
- `ANALYSIS#{id}` / `RESULT` - Analysis results
- `ANALYSIS#{id}` / `ERROR` - Error records

### Lambda Functions

| Function | Memory | Timeout | Layers | Purpose |
|----------|--------|---------|--------|---------|
| `reefradar-2477-router` | 256 MB | 30s | None | API routing, upload handling |
| `reefradar-2477-preprocessor` | 1024 MB | 180s | numpy | Audio processing |
| `reefradar-2477-classifier` | 512 MB | 120s | numpy | Classification |

### Lambda Layer

| Layer | Version | Size | Contents |
|-------|---------|------|----------|
| `reefradar-2477-numpy` | 1 | 18 MB | numpy 1.26.4 |

### API Gateway

| Property | Value |
|----------|-------|
| API ID | `rgoe4pqatf` |
| Type | HTTP API |
| Endpoint | https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com |
| Stage | `prod` |
| Route | `$default` → Lambda Router |
| CORS | Allow all origins, GET/POST/OPTIONS |

### IAM Roles

| Role | Trust | Policies |
|------|-------|----------|
| `reefradar-2477-lambda-role` | lambda.amazonaws.com | AWSLambdaBasicExecutionRole, AmazonDynamoDBFullAccess, AmazonS3FullAccess, AmazonSageMakerFullAccess, LambdaInvokePolicy (inline) |
| `reefradar-2477-sagemaker-role` | sagemaker.amazonaws.com | AmazonSageMakerFullAccess, AmazonS3ReadOnlyAccess |

### SageMaker (Demo Mode)

| Resource | Value | Status |
|----------|-------|--------|
| Endpoint | `reefradar-2477-surfperch-endpoint` | InService (XLA Error) |
| Model | `reefradar-2477-surfperch` | Deployed |
| Instance | ml.m5.large | Running |

**Note:** The SageMaker endpoint returns XLA compilation errors due to model compatibility issues. The system falls back to synthetic embeddings for demo purposes.

### ECR

| Repository | URI | Status |
|------------|-----|--------|
| `reefradar-2477-preprocessor` | 781978598306.dkr.ecr.us-east-1.amazonaws.com/reefradar-2477-preprocessor | Empty (not used) |

---

## API Reference

### Base URL
```
https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod
```

### Endpoints

#### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-30T03:01:43.855765"
}
```

**curl:**
```bash
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health
```

---

#### GET /sites
List reference sites.

**Response:**
```json
{
  "sites": [
    {"site_id": "aus_H1", "country": "Australia", "status": "healthy"},
    {"site_id": "aus_H2", "country": "Australia", "status": "healthy"},
    {"site_id": "idn_H1", "country": "Indonesia", "status": "healthy"},
    {"site_id": "aus_D1", "country": "Australia", "status": "degraded"},
    {"site_id": "phl_D1", "country": "Philippines", "status": "degraded"},
    {"site_id": "mex_R1", "country": "Mexico", "status": "restored_early"},
    {"site_id": "aus_R1", "country": "Australia", "status": "restored_early"},
    {"site_id": "idn_M1", "country": "Indonesia", "status": "restored_mid"}
  ],
  "total_sites": 8,
  "countries": ["Australia", "Indonesia", "Philippines", "Mexico"]
}
```

**curl:**
```bash
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites
```

---

#### POST /upload
Upload an audio file for analysis.

**Headers:**
- `Content-Type: audio/wav`
- `X-Filename: yourfile.wav` (optional)

**Body:** Raw WAV file bytes

**Response:**
```json
{
  "upload_id": "038bf9da-b260-4f95-bf04-20ab191e9b6c",
  "filename": "test_reef.wav",
  "s3_key": "uploads/038bf9da-b260-4f95-bf04-20ab191e9b6c/test_reef.wav",
  "size_bytes": 384044,
  "status": "uploaded"
}
```

**curl:**
```bash
curl -X POST https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/upload \
  -H "Content-Type: audio/wav" \
  -H "X-Filename: reef_audio.wav" \
  --data-binary @your_audio.wav
```

---

#### POST /analyze
Start analysis of an uploaded file.

**Body:**
```json
{
  "upload_id": "038bf9da-b260-4f95-bf04-20ab191e9b6c"
}
```

**Response (202 Accepted):**
```json
{
  "analysis_id": "a1d941dd-5d28-4486-ad45-09c214aca530",
  "upload_id": "038bf9da-b260-4f95-bf04-20ab191e9b6c",
  "status": "processing",
  "message": "Analysis started. Poll GET /visualize/{analysis_id} for results."
}
```

**curl:**
```bash
curl -X POST https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/analyze \
  -H "Content-Type: application/json" \
  -d '{"upload_id": "YOUR_UPLOAD_ID"}'
```

---

#### GET /visualize/{analysis_id}
Get analysis results.

**Response (Complete):**
```json
{
  "analysis_id": "36d93866-d414-4a60-a562-68a72eed219a",
  "status": "complete",
  "classification": {
    "label": "degraded",
    "confidence": 0.261377,
    "probabilities": {
      "healthy": 0.241853,
      "degraded": 0.261377,
      "restored_early": 0.250283,
      "restored_mid": 0.246488
    }
  },
  "similar_sites": [
    {"site_id": "phl_D1", "country": "phl", "similarity": 0.223476, "status": "degraded"},
    {"site_id": "aus_D1", "country": "aus", "similarity": 0.20864, "status": "degraded"},
    {"site_id": "aus_R1", "country": "aus", "similarity": 0.20801, "status": "restored_early"}
  ],
  "visualization": {
    "type": "projection_2d",
    "coordinates": {"x": 0.662955, "y": 0.318253},
    "reference_sites": [...]
  },
  "embedding_summary": {
    "dimension": 1280,
    "num_segments": 1,
    "aggregation": "mean",
    "synthetic": true
  },
  "caveats": "Classification based on acoustic similarity... (Demo mode: using synthetic embeddings)"
}
```

**Response (Processing):**
```json
{
  "analysis_id": "36d93866-d414-4a60-a562-68a72eed219a",
  "status": "processing"
}
```

**curl:**
```bash
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/visualize/YOUR_ANALYSIS_ID
```

---

## Quick Start

### Test the API

```bash
# 1. Health check
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health

# 2. Create test audio (6 seconds, 32kHz)
python3 << 'EOF'
import numpy as np
import struct
sr, dur = 32000, 6
t = np.linspace(0, dur, sr * dur)
audio = (np.sin(2*np.pi*500*t) * 0.5 * 32767).astype(np.int16)
with open('/tmp/test.wav', 'wb') as f:
    f.write(b'RIFF' + struct.pack('<I', 36 + len(audio)*2) + b'WAVE')
    f.write(b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 1, sr, sr*2, 2, 16))
    f.write(b'data' + struct.pack('<I', len(audio)*2) + audio.tobytes())
EOF

# 3. Upload
UPLOAD=$(curl -s -X POST https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/upload \
  -H "Content-Type: audio/wav" --data-binary @/tmp/test.wav)
UPLOAD_ID=$(echo $UPLOAD | python3 -c "import sys,json; print(json.load(sys.stdin)['upload_id'])")

# 4. Analyze
ANALYZE=$(curl -s -X POST https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/analyze \
  -H "Content-Type: application/json" -d "{\"upload_id\": \"$UPLOAD_ID\"}")
ANALYSIS_ID=$(echo $ANALYZE | python3 -c "import sys,json; print(json.load(sys.stdin)['analysis_id'])")

# 5. Poll for results
sleep 15
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/visualize/$ANALYSIS_ID
```

### Run the Dashboard

```bash
cd ~/ReefRadar/dashboard
./start.sh
# Open http://localhost:8501
```

---

## Cost Analysis

### Current Month Costs (January 2026)

| Service | Cost |
|---------|------|
| SageMaker | ~$2.76/day (ml.m5.large @ $0.115/hr) |
| Lambda | Free tier (likely $0) |
| S3 | ~$0.01 |
| DynamoDB | Free tier (likely $0) |
| API Gateway | Free tier (likely $0) |
| **Total** | **~$83/month if SageMaker runs continuously** |

### Cost Optimization

1. **Delete SageMaker endpoint when not in use** - Saves $83/month
   ```bash
   aws sagemaker delete-endpoint --endpoint-name reefradar-2477-surfperch-endpoint --region us-east-1
   ```

2. **Use Serverless Inference** - Pay per request instead of hourly

3. **Current system works without SageMaker** - Falls back to synthetic embeddings

### Projected Costs (Without SageMaker)

| Usage Level | Monthly Cost |
|-------------|--------------|
| Development (10 req/day) | ~$0 (free tier) |
| Demo (100 req/day) | ~$0.50 |
| Light Production (1000 req/day) | ~$5 |

---

## Known Issues

### 1. SageMaker XLA Compilation Error

**Error:**
```
XLA compilation disabled
[[{{function_node __inference_signature_wrapper_21994}}{{node StatefulPartitionedCall}}]]
```

**Cause:** The SurfPerch model from Kaggle was compiled with XLA enabled, which TensorFlow Serving doesn't support out of the box.

**Workaround:** System uses synthetic embeddings generated from audio features. Results are illustrative but not from the actual ML model.

**Fix:** Re-export the TensorFlow model without XLA compilation:
```python
tf.saved_model.save(model, 'new_model', options=tf.saved_model.SaveOptions(experimental_custom_gradients=False))
```

### 2. WSL2 Port Forwarding

The Streamlit dashboard may not be accessible from Windows browsers due to WSL2 networking.

**Fix:** Run in Windows PowerShell as Admin:
```powershell
netsh interface portproxy add v4tov4 listenport=8501 listenaddress=0.0.0.0 connectport=8501 connectaddress=$(wsl hostname -I)
```

---

## Project Structure

```
~/reef-project/
├── lambdas/
│   ├── router/
│   │   ├── handler.py          # API routing logic
│   │   └── requirements.txt    # boto3
│   ├── preprocessor/
│   │   ├── handler.py          # Audio processing
│   │   ├── requirements.txt    # boto3, numpy
│   │   └── Dockerfile          # (unused)
│   └── classifier/
│       ├── handler.py          # Classification logic
│       └── requirements.txt    # boto3, numpy
├── sagemaker/
│   └── code/
│       ├── inference.py        # TF Serving handlers
│       └── requirements.txt    # tensorflow, numpy
├── scripts/
│   └── prepare_embeddings.py   # Reference embedding generation
├── data/
│   ├── marrs/                  # Sample audio files
│   └── embeddings/             # Pre-computed embeddings
└── models/
    └── surfperch/              # SurfPerch model files

~/ReefRadar/
└── dashboard/
    ├── app.py                  # Streamlit application
    ├── requirements.txt        # streamlit, requests, plotly, pandas
    └── start.sh                # Launch script
```

---

## Environment Configuration

File: `~/.reefradar-env`
```bash
export PROJECT_PREFIX=reefradar-2477
export AWS_ACCOUNT_ID=781978598306
export ECR_URI=781978598306.dkr.ecr.us-east-1.amazonaws.com/reefradar-2477-preprocessor
export LAMBDA_ROLE_ARN=arn:aws:iam::781978598306:role/reefradar-2477-lambda-role
export SAGEMAKER_ROLE_ARN=arn:aws:iam::781978598306:role/reefradar-2477-sagemaker-role
export SAGEMAKER_ENDPOINT=reefradar-2477-surfperch-endpoint
export API_URL="https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod"
```

---

## AWS Console Links

- **Lambda:** https://us-east-1.console.aws.amazon.com/lambda/home?region=us-east-1#/functions
- **DynamoDB:** https://us-east-1.console.aws.amazon.com/dynamodbv2/home?region=us-east-1#tables
- **S3:** https://s3.console.aws.amazon.com/s3/buckets
- **API Gateway:** https://us-east-1.console.aws.amazon.com/apigateway/main/apis?region=us-east-1
- **SageMaker:** https://us-east-1.console.aws.amazon.com/sagemaker/home?region=us-east-1#/endpoints
- **CloudWatch Logs:** https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups

---

## Credits

- **SurfPerch Model:** Google Research (bird-vocalization-classifier)
- **Reference Data:** MARRS coral reef acoustic research
- **Built for:** AWS Cloud Practitioner certification demonstration
