# ReefRadar - AI Navigation Guide

This file helps AI assistants understand and navigate the ReefRadar codebase.

## Project Overview

ReefRadar is a serverless API for analyzing coral reef health from underwater audio recordings. It uses a trained MLP classifier on SurfPerch embeddings to classify reef health status, with geographic region detection for out-of-distribution warnings.

**Tech Stack:** AWS Lambda (including container-based), API Gateway, S3, DynamoDB, Python 3.11, Next.js 14, Streamlit, TensorFlow, perch-hoplite

**Live API:** `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`

## Repository Structure

```
ReefRadar/
├── lambdas/                    # AWS Lambda function code
│   ├── router/                 # API request handling (256MB, 30s)
│   │   └── handler.py          # Routes: /health, /sites, /upload, /analyze, /visualize, /status
│   ├── preprocessor/           # Audio processing (1024MB, 180s)
│   │   └── handler.py          # WAV parsing, resampling to 32kHz, segmentation
│   └── classifier/             # ML classification (512MB, 120s)
│       ├── handler.py          # Trained MLP classifier, embedding generation
│       └── region_detection.py # Geographic region detection and confidence adjustment
│
├── dashboard-next/             # Next.js 14 web UI (primary)
│   ├── src/app/                # App Router pages (/, /sites, /about)
│   ├── src/components/         # 20+ React components
│   ├── src/lib/api.ts          # Typed API client
│   └── src/types/index.ts      # TypeScript types
│
├── dashboard/                  # Streamlit web UI (legacy)
│   └── app.py                  # 3-tab dashboard
│
├── data/
│   └── embeddings/             # Pre-computed reference site embeddings
│       ├── metadata.json       # 54 sites with real 1280-dim SurfPerch embeddings
│       ├── marrs_sites.json    # All 45 MARRS sites with coordinates
│       └── study_sites_map.kml # KML with all site coordinates
│
├── models/                     # Trained classifier
│   ├── reef_classifier_weights.npz  # MLP weights (1280→256→64→4)
│   └── model_config.json            # Architecture, labels, accuracy
│
├── infrastructure/
│   ├── resources.json          # Complete AWS resource inventory
│   └── lambda_container/       # SurfPerch inference container
│       ├── Dockerfile          # Lambda container image
│       ├── buildspec.yml       # AWS CodeBuild pipeline
│       ├── requirements.txt    # tensorflow-cpu, setuptools, etc.
│       └── inference.py        # SurfPerch embedding handler
│
├── scripts/                    # Operational scripts
│   ├── test-all.sh             # Full API test suite
│   ├── train_classifier.py     # MLP training script
│   └── generate_marrs_embeddings.py  # Embedding generation
│
└── docs/                       # Documentation
    ├── ML_RESEARCH.md
    ├── SCIENTIFIC_VALIDITY.md
    └── MODEL_EVALUATION.md
```

## Key Entry Points

| Task | Start Here |
|------|------------|
| Understand the API | `ARCHITECTURE.md` |
| Modify API routing | `lambdas/router/handler.py` |
| Modify audio processing | `lambdas/preprocessor/handler.py` |
| Modify ML classification | `lambdas/classifier/handler.py` |
| Modify region detection | `lambdas/classifier/region_detection.py` |
| Modify Next.js dashboard | `dashboard-next/src/app/page.tsx` |
| Check AWS resources | `infrastructure/resources.json` |

## Data Flow

```
User Audio Upload (+ optional lat/lon)
       │
       ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────┐    ┌──────────────┐
│    Router    │───▶│  Preprocessor   │───▶│  Classifier  │───▶│  Inference   │
│  /upload     │    │  32kHz resample │    │  trained MLP │    │  SurfPerch   │
│  /analyze    │    │  5.0s segments  │    │  + region    │    │  embeddings  │
└──────────────┘    └─────────────────┘    └──────────────┘    └──────────────┘
       │                    │                      │                   │
       ▼                    ▼                      ▼                   ▼
   DynamoDB              S3 Audio            S3 Embeddings      perch-hoplite
   (metadata)           (uploads/)           (reference/)       (TensorFlow)
```

## API Endpoints Quick Reference

| Method | Path | Purpose |
|--------|------|---------|
| GET | /health | Health check |
| GET | /sites | List 54 reference sites |
| POST | /upload | Upload WAV file (returns upload_id) |
| POST | /analyze | Start analysis with optional lat/lon (returns analysis_id) |
| GET | /visualize/{id} | Get results (poll until complete) |
| GET | /status/{id} | Get detailed processing status |
| GET | /results/{id} | Alias for /visualize |

## Important Code Patterns

### DynamoDB Key Schema
```
pk: "UPLOAD#{uuid}" or "ANALYSIS#{uuid}"
sk: "METADATA", "PREPROCESSED", "RESULT", or "ERROR"
```

### Audio Processing Pipeline
1. Read WAV with pure Python (struct module)
2. Convert stereo to mono (average channels)
3. Resample to 32kHz (SurfPerch requirement)
4. Segment into 5.0-second windows (160,000 samples)

### ML Inference (SurfPerch)
- **Model**: SurfPerch v1.0 via tensorflow-hub/kagglehub
- **Input**: 32kHz mono audio, 5.0s windows (160,000 samples)
- **Output**: 1280-dimensional embeddings
- **Deployment**: Lambda container (3GB memory, 5min timeout)

### Classification
- Generates real SurfPerch embeddings via inference Lambda
- Classifies using trained MLP (1280→256→64→4, ~90% test accuracy)
- Applies geographic region detection for confidence adjustment
- Compares to 54 reference sites via cosine similarity
- Categories: healthy, degraded, restored_early, restored_mid

### Geographic Region Detection
- `region_detection.py` detects biogeographic region from coordinates
- Indo-Pacific (training distribution): full confidence
- Caribbean/Atlantic/Red Sea/Eastern Pacific: 60% confidence multiplier
- Unknown (no coordinates): 70% confidence multiplier
- Caveats automatically adjusted based on region

## Reference Data

54 sites across 7 countries with real SurfPerch embeddings:
- **Indonesia**: 21 sites (South Sulawesi -- MARRS)
- **Australia**: 7 sites (Great Barrier Reef -- MARRS)
- **Kenya**: 5 sites (Mombasa Coast -- MARRS)
- **Maldives**: 5 sites (North Male Atoll -- MARRS)
- **Mexico**: 7 sites (Caribbean Coast -- MARRS)
- **USA**: 8 sites (Florida Keys -- Hurricane Irma + NOAA SanctSound)
- **French Polynesia**: 3 sites (Bora-Bora -- CoralSoundExplorer)

## AWS Resource Names

All resources use prefix: `reefradar-2477-`

| Resource | Name |
|----------|------|
| API Gateway | reefradar-2477-api |
| Lambda (router) | reefradar-2477-router |
| Lambda (preprocessor) | reefradar-2477-preprocessor |
| Lambda (classifier) | reefradar-2477-classifier |
| Lambda (inference) | reefradar-2477-inference (container) |
| ECR (inference) | reefradar-2477-inference |
| S3 (audio) | reefradar-2477-audio |
| S3 (embeddings) | reefradar-2477-embeddings |
| DynamoDB | reefradar-2477-metadata |
| CodeBuild | reefradar-2477-inference-build |

Note: SageMaker resources have been deleted (endpoint, config, model).

## Deployment

### Standard Lambda Functions
```bash
# Classifier requires both handler.py and region_detection.py
cd lambdas/classifier && zip -r function.zip handler.py region_detection.py
aws lambda update-function-code --function-name reefradar-2477-classifier --zip-file fileb://function.zip
```

### Inference Lambda (Container via CodeBuild)
```bash
# Package source and trigger CodeBuild
cd infrastructure/lambda_container
zip -r /tmp/inference-source.zip Dockerfile requirements.txt inference.py buildspec.yml
aws s3 cp /tmp/inference-source.zip s3://reefradar-2477-codebuild-artifacts/inference-source.zip
aws codebuild start-build --project-name reefradar-2477-inference-build
```

### Testing
```bash
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites
```
