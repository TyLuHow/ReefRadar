# ReefRadar Project Status

**Last Updated:** 2026-02-03

## Executive Summary

ReefRadar is a serverless coral reef acoustic health analysis API. The system uses SurfPerch ML embeddings to classify reef health by comparing underwater audio to reference sites from the MARRS dataset.

**Current Status:** MVP deployed and functional. Real ML inference operational. **Trained classifier deployed with 90% test accuracy.**

## Completed Milestones

### Phase 1: Core Infrastructure (2026-01-29)
- [x] API Gateway with 5 endpoints (/health, /sites, /upload, /analyze, /visualize)
- [x] 4 Lambda functions (router, preprocessor, classifier, inference container)
- [x] S3 buckets for audio storage and embeddings
- [x] DynamoDB for metadata and analysis state
- [x] Async processing pipeline with polling

### Phase 2: ML Inference (2026-01-29 - 2026-01-30)
- [x] SurfPerch model deployment via Lambda container
- [x] perch-hoplite integration for 1280-dim embeddings
- [x] Eliminated SageMaker endpoint (saved ~$83/month)
- [x] Retry logic with exponential backoff
- [x] S3-based payload passing to avoid Lambda limits

### Phase 3: Reference Data (2026-02-01 - 2026-02-02)
- [x] Cloud-to-cloud MARRS data pipeline (Figshare → S3)
- [x] 6 validated reference sites with real SurfPerch embeddings
- [x] metadata.json v2.0 format with coordinates and country info
- [x] Training dataset generated (100 samples)

### Phase 4: Dashboard (2026-01-29)
- [x] Streamlit dashboard with 3 tabs (Analyze, Reference Sites, About)
- [x] File upload and async analysis flow
- [x] 2D embedding visualization
- [x] ASCII architecture diagram

### Phase 5: Trained Classifier (2026-02-03)
- [x] MLP classifier trained on 100 MARRS samples
- [x] 90% test accuracy on held-out data
- [x] Pure NumPy inference (no PyTorch dependency)
- [x] Model deployed to classifier Lambda
- [x] Model evaluation report generated

## Current Capabilities

| Feature | Status | Notes |
|---------|--------|-------|
| Audio Upload | ✅ Working | WAV files up to 10MB |
| Audio Preprocessing | ✅ Working | 16kHz resampling, 1.88s segments |
| ML Embedding | ✅ Working | Real SurfPerch via Lambda container |
| Classification | ✅ Working | Trained MLP (90% test accuracy) |
| Reference Sites | ✅ Working | 6 MARRS sites with real embeddings |
| Visualization | ✅ Working | 2D projection + probability bars |
| Dashboard | ✅ Working | Streamlit (WSL2 networking issues) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────────────────────┐  │
│  │   Browser   │    │  Streamlit UI   │    │      curl / CLI             │  │
│  │  (future)   │    │  (dashboard/)   │    │                             │  │
│  └──────┬──────┘    └────────┬────────┘    └─────────────┬───────────────┘  │
└─────────┼────────────────────┼───────────────────────────┼──────────────────┘
          │                    │                           │
          ▼                    ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API GATEWAY                                     │
│                    https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  /health  │  /sites  │  /upload  │  /analyze  │  /visualize/{id}     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LAMBDA FUNCTIONS                                   │
│                                                                              │
│  ┌─────────────┐     ┌────────────────┐     ┌─────────────────────────────┐ │
│  │   Router    │────▶│  Preprocessor  │────▶│       Classifier            │ │
│  │   256MB     │     │    1024MB      │     │        512MB                │ │
│  │    30s      │     │     180s       │     │        120s                 │ │
│  └─────────────┘     └────────────────┘     └──────────────┬──────────────┘ │
│                                                            │                 │
│                                              ┌─────────────▼──────────────┐ │
│                                              │    Inference (Container)   │ │
│                                              │    3008MB / 300s           │ │
│                                              │    SurfPerch + TensorFlow  │ │
│                                              └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
          │                    │                           │
          ▼                    ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA STORES                                        │
│                                                                              │
│  ┌──────────────────────┐  ┌────────────────────┐  ┌─────────────────────┐  │
│  │    S3: Audio         │  │  S3: Embeddings    │  │     DynamoDB        │  │
│  │  reefradar-2477-     │  │  reefradar-2477-   │  │  reefradar-2477-    │  │
│  │  audio               │  │  embeddings        │  │  metadata           │  │
│  │                      │  │                    │  │                     │  │
│  │  - uploads/          │  │  - reference/      │  │  pk: UPLOAD#id      │  │
│  │  - processed/        │  │  - models/         │  │  pk: ANALYSIS#id    │  │
│  │                      │  │  - training/       │  │  sk: METADATA/      │  │
│  │                      │  │                    │  │      RESULT/ERROR   │  │
│  └──────────────────────┘  └────────────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Cost Analysis

### Current Monthly Costs (Estimated)
| Resource | Cost | Notes |
|----------|------|-------|
| API Gateway | ~$0.50 | Low traffic, pay-per-request |
| Lambda | ~$1-2 | Includes cold starts, ~100 analyses/month |
| S3 Storage | ~$0.25 | <10GB total |
| DynamoDB | ~$0.25 | On-demand, minimal reads/writes |
| ECR | ~$0.10 | Single container image |
| **Total** | **~$2-3/month** | At demo/dev usage levels |

### Cost Optimization Applied
- Eliminated SageMaker endpoint: **saved $83/month**
- Lambda containers vs EC2: pay only for actual inference time
- On-demand DynamoDB vs provisioned: better for low/variable traffic
- S3 Intelligent Tiering not needed at current scale

### Scaling Costs
| Usage Level | Analyses/Month | Est. Cost |
|-------------|----------------|-----------|
| Demo | 10-50 | $2-3 |
| Light | 100-500 | $5-15 |
| Medium | 1,000-5,000 | $30-80 |
| Heavy | 10,000+ | $150+ |

## Remaining Work

### High Priority

1. **Expand Reference Sites**
   - Currently: 6 sites
   - Goal: 45 MARRS sites across 5 countries
   - Infrastructure ready, just need to process more audio

### Medium Priority

2. **Custom Web UI**
   - Replace Streamlit with custom React/HTML frontend
   - Deploy to S3 + CloudFront
   - Solve WSL2 networking issues

3. **Enhanced Visualizations**
   - Add geographic maps with site locations
   - Spectrograms of audio
   - Interactive 3D embedding space

### Low Priority

4. **Research Documentation**
   - Create ML_RESEARCH.md, SCIENTIFIC_VALIDITY.md
   - Capture architectural decisions
   - Sources and citations

5. **Architecture Diagrams**
   - Create Lucidchart/Miro versions
   - Portfolio-ready visuals

## File Inventory

| Category | Files | Status |
|----------|-------|--------|
| Lambda Code | 4 handlers | Deployed |
| Dashboard | app.py + requirements | Working |
| Reference Data | metadata.json (6 sites) | Real embeddings |
| Training Data | 100 samples | Ready for training |
| Infrastructure | resources.json | Current |
| Documentation | CLAUDE.md, ARCHITECTURE.md, API.md | Up to date |

## Next Steps

1. ~~Run classifier training (prompt 017)~~ ✅ Done
2. ~~Deploy trained model (prompt 018)~~ ✅ Done
3. ~~Test end-to-end with trained classifier~~ ✅ Done
4. Expand to 45 reference sites
5. Consider custom UI for portfolio demo
