# ReefRadar - AI Navigation Guide

This file helps AI assistants understand and navigate the ReefRadar codebase.

## Project Overview

ReefRadar is a serverless API for analyzing coral reef health from underwater audio recordings. It uses ML-based acoustic signature comparison to classify reef health status.

**Tech Stack:** AWS Lambda, API Gateway, S3, DynamoDB, SageMaker, Python 3.11, Streamlit

**Live API:** `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`

## Repository Structure

```
ReefRadar/
├── lambdas/                    # AWS Lambda function code
│   ├── router/                 # API request handling (256MB, 30s)
│   │   └── handler.py          # Routes: /health, /sites, /upload, /analyze, /visualize
│   ├── preprocessor/           # Audio processing (1024MB, 180s)
│   │   └── handler.py          # WAV parsing, resampling to 32kHz, segmentation
│   └── classifier/             # ML classification (512MB, 120s)
│       └── handler.py          # Embedding generation, cosine similarity, health classification
│
├── dashboard/                  # Streamlit web UI
│   ├── app.py                  # 3-tab dashboard (Analyze, Reference Sites, About)
│   ├── requirements.txt        # streamlit, requests, plotly, pandas
│   └── start.sh                # Launch script
│
├── data/
│   └── embeddings/             # Pre-computed reference site embeddings
│       ├── metadata.json       # Site metadata with embedded vectors
│       └── *.npy               # NumPy embedding files (1280-dim each)
│
├── infrastructure/
│   └── resources.json          # Complete AWS resource inventory with ARNs
│
├── scripts/                    # Operational scripts
│   ├── test-all.sh             # Full API test suite
│   ├── status.sh               # System health check
│   └── cleanup.sh              # AWS resource deletion
│
├── prompts/                    # Development prompts (for reference)
│   └── 001-008-*.md            # Phase-by-phase build instructions
│
├── config/
│   └── aws-env.sh              # AWS environment variables
│
└── Documentation
    ├── README.md               # Main documentation, quick start
    ├── ARCHITECTURE.md         # Technical deep-dive, ASCII diagrams
    ├── API.md                  # Full API reference with examples
    ├── COSTS.md                # Cost analysis, optimization guide
    └── PORTFOLIO.md            # Demo script, resume bullets
```

## Key Entry Points

| Task | Start Here |
|------|------------|
| Understand the API | `API.md` |
| Understand architecture | `ARCHITECTURE.md` |
| Modify API routing | `lambdas/router/handler.py` |
| Modify audio processing | `lambdas/preprocessor/handler.py` |
| Modify ML classification | `lambdas/classifier/handler.py` |
| Modify dashboard UI | `dashboard/app.py` |
| Check AWS resources | `infrastructure/resources.json` |
| Run tests | `scripts/test-all.sh` |

## Data Flow

```
User Audio Upload
       │
       ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│    Router    │───▶│  Preprocessor   │───▶│  Classifier  │
│  /upload     │    │  32kHz resample │    │  embeddings  │
│  /analyze    │    │  5s segments    │    │  similarity  │
└──────────────┘    └─────────────────┘    └──────────────┘
       │                    │                      │
       ▼                    ▼                      ▼
   DynamoDB              S3 Audio            S3 Embeddings
   (metadata)           (uploads/)           (reference/)
```

## API Endpoints Quick Reference

| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Health check |
| GET | /sites | List 8 reference sites |
| POST | /upload | Upload WAV file (returns upload_id) |
| POST | /analyze | Start analysis (returns analysis_id) |
| GET | /visualize/{id} | Get results (poll until complete) |

## Important Code Patterns

### DynamoDB Key Schema
```
pk: "UPLOAD#{uuid}" or "ANALYSIS#{uuid}"
sk: "METADATA", "PREPROCESSED", "RESULT", or "ERROR"
```

### Decimal Handling (DynamoDB)
The classifier uses `convert_floats()` to convert Python floats to Decimals.
The router uses `DecimalEncoder` to convert Decimals back to floats for JSON.

### Audio Processing Pipeline
1. Read WAV with pure Python (struct module)
2. Convert stereo to mono (average channels)
3. Resample to 32kHz (linear interpolation)
4. Segment into 5-second chunks (160,000 samples)

### Classification
- Generates 1280-dimensional embeddings
- Uses synthetic fallback (SageMaker has XLA error)
- Compares to 8 reference sites via cosine similarity
- Categories: healthy, degraded, restored_early, restored_mid

## Common Modifications

### Add a new API endpoint
1. Edit `lambdas/router/handler.py`
2. Add route in the `if/elif` chain
3. Update `lambdas/router/handler.py` and redeploy

### Add a new reference site
1. Add embedding to `data/embeddings/`
2. Update `data/embeddings/metadata.json`
3. Upload to S3: `s3://reefradar-2477-embeddings/reference/`

### Change classification categories
1. Edit `lambdas/classifier/handler.py`
2. Modify `CATEGORIES` list and probability calculation

## AWS Resource Names

All resources use prefix: `reefradar-2477-`

| Resource | Name |
|----------|------|
| API Gateway | reefradar-2477-api |
| Lambda (router) | reefradar-2477-router |
| Lambda (preprocessor) | reefradar-2477-preprocessor |
| Lambda (classifier) | reefradar-2477-classifier |
| S3 (audio) | reefradar-2477-audio |
| S3 (embeddings) | reefradar-2477-embeddings |
| DynamoDB | reefradar-2477-metadata |
| SageMaker | reefradar-2477-surfperch-endpoint |

## Known Issues

1. **SageMaker XLA Error**: The SurfPerch model fails with XLA compilation error. System uses synthetic embeddings as fallback.

2. **WSL2 Port Forwarding**: Streamlit dashboard may not be accessible from Windows browser without additional port forwarding configuration.

## Testing

```bash
# Test all endpoints
./scripts/test-all.sh

# Check system status
./scripts/status.sh

# Manual test
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health
```

## Deployment

Lambda functions are deployed via AWS CLI:
```bash
cd lambdas/router && zip -r function.zip handler.py
aws lambda update-function-code --function-name reefradar-2477-router --zip-file fileb://function.zip
```

See `infrastructure/resources.json` for all ARNs needed for deployment commands.
