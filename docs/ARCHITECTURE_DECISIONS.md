# Architecture Decision Records

**Last Updated:** 2026-02-03
**Author:** AI-assisted research compilation

## Overview

This document captures the key architectural decisions made in building ReefRadar, including the rationale, alternatives considered, and tradeoffs. These records serve as institutional memory for future development and demonstrate thoughtful engineering choices for portfolio presentation.

## ADR-001: Serverless Lambda Architecture

### Context

ReefRadar needs to process audio files, run ML inference, and return classification results. The system must be cost-effective for a student project with low traffic but capable of scaling.

### Decision

Use AWS Lambda functions for all compute, with a multi-Lambda pipeline:

```
Router Lambda (256MB, 30s)
    |
    v
Preprocessor Lambda (1024MB, 180s)
    |
    v
Classifier Lambda (512MB, 120s)
    |
    v
Inference Lambda Container (3008MB, 300s)
```

### Alternatives Considered

| Option | Monthly Cost | Pros | Cons |
|--------|-------------|------|------|
| EC2 Always-On | ~$30-50 | Simple, consistent | Pays for idle time |
| ECS Fargate | ~$20-40 | Containers, consistent | Still pays for idle |
| Lambda | ~$0-5 | Pay-per-use, scales to zero | Cold starts, timeouts |
| App Runner | ~$15-25 | Simple containers | Minimum charge |

### Rationale

- **Cost:** Lambda costs $0 at idle, critical for student budget
- **Scaling:** Automatic scaling handles traffic spikes
- **Maintenance:** No server patching or management
- **AWS Free Tier:** 1M requests/month free for 12 months

### Consequences

- **Positive:** Near-zero cost during development/demo phases
- **Negative:** Cold starts add 5-30s latency for first request
- **Negative:** 15-minute timeout limits very long processing
- **Mitigation:** Async processing pattern handles timeout concerns

---

## ADR-002: Async Processing with Polling

### Context

Audio analysis takes 10-30 seconds total. HTTP requests would timeout, and users need progress feedback.

### Decision

Implement async processing with client-side polling:

```
1. POST /upload -> Returns upload_id immediately
2. POST /analyze -> Triggers background processing, returns analysis_id
3. GET /visualize/{id} -> Poll until status="complete"
```

### Alternatives Considered

| Option | Complexity | User Experience | Cost |
|--------|------------|-----------------|------|
| Sync Processing | Low | Poor (timeouts) | Same |
| WebSocket | High | Best (real-time) | Higher |
| Server-Sent Events | Medium | Good | Same |
| Polling | Low | Good | Same |

### Rationale

- **Simplicity:** Polling works with any HTTP client
- **Reliability:** No WebSocket connection management
- **Cost:** No additional infrastructure (API Gateway WebSocket)
- **User Experience:** Dashboard shows progress spinner

### Consequences

- **Positive:** Works reliably across all clients
- **Positive:** Easy to implement error recovery
- **Negative:** Slight inefficiency (multiple requests)
- **Negative:** Not real-time (1-2s poll interval)

### Implementation

```python
# Dashboard polling logic
while status != "complete":
    response = requests.get(f"{API_URL}/visualize/{analysis_id}")
    status = response.json().get("status")
    if status == "error":
        raise Exception(response.json().get("error"))
    time.sleep(1.5)  # Poll interval
```

---

## ADR-003: S3 for Large Payload Transfer

### Context

Audio files can be several MB. Lambda has a 6MB synchronous payload limit. API Gateway has similar limits.

### Decision

Use S3 as an intermediary for large data:

```
1. Upload audio directly to S3 (presigned URL or via router)
2. Pass S3 keys between Lambdas (not raw data)
3. Store intermediate results (segments, embeddings) in S3
4. Clean up temporary files after processing
```

### Alternatives Considered

| Option | Payload Limit | Latency | Complexity |
|--------|---------------|---------|------------|
| Direct Lambda payload | 6 MB sync | Lowest | Lowest |
| S3 intermediary | Unlimited | Medium | Medium |
| SQS messages | 256 KB | Higher | Higher |
| Step Functions | 256 KB | Higher | Higher |

### Rationale

- **Flexibility:** Handles any audio file size
- **Reliability:** S3 durability vs in-flight data
- **Debugging:** Intermediate files can be inspected
- **Cost:** S3 storage is ~$0.023/GB/month

### Consequences

- **Positive:** No payload size limits
- **Positive:** Enables parallel processing (multiple segments)
- **Negative:** Additional S3 API calls add ~50-100ms latency
- **Negative:** Must manage cleanup of temporary files

### S3 Structure

```
s3://reefradar-2477-audio/
├── uploads/{upload_id}/original.wav
├── processed/{analysis_id}/segments.json
└── temp/embedding_batches/{analysis_id}_batch{n}.json  # Cleaned up

s3://reefradar-2477-embeddings/
├── reference/metadata.json
├── models/reef_classifier_weights.npz
└── models/model_config.json
```

---

## ADR-004: DynamoDB for Metadata Storage

### Context

Need to track upload status, analysis progress, and results. Must support rapid development iteration.

### Decision

Use DynamoDB with a single-table design:

```
Table: reefradar-2477-metadata
Partition Key: pk (String)  - e.g., "UPLOAD#abc123"
Sort Key: sk (String)       - e.g., "METADATA", "RESULT", "ERROR"
```

### Alternatives Considered

| Option | Schema Flexibility | Cost | Query Patterns |
|--------|-------------------|------|----------------|
| DynamoDB | High | Pay-per-request | Limited |
| PostgreSQL (RDS) | Medium | ~$15+/month | Rich SQL |
| Aurora Serverless | Medium | ~$0.12/ACU-hour | Rich SQL |
| S3 + JSON | Highest | Lowest | None |

### Rationale

- **Cost:** On-demand pricing means $0 at low volume
- **Flexibility:** No schema migrations during development
- **Speed:** Single-digit millisecond latency
- **Integration:** Native Lambda SDK support

### Consequences

- **Positive:** Near-zero cost for development
- **Positive:** No database management
- **Negative:** Limited query patterns (no joins)
- **Negative:** Decimal handling quirks with Python floats

### Schema Design

| pk | sk | Purpose |
|----|-----|---------|
| `UPLOAD#{id}` | `METADATA` | Upload info, status |
| `ANALYSIS#{id}` | `PREPROCESSED` | Segment info after preprocessing |
| `ANALYSIS#{id}` | `RESULT` | Classification results |
| `ANALYSIS#{id}` | `ERROR` | Error details if failed |

---

## ADR-005: Lambda Container for ML Inference

### Context

SurfPerch model requires TensorFlow (~400MB) and the model itself (~127MB). Standard Lambda has 250MB deployment limit.

### Decision

Deploy ML inference as a Lambda container image:

```dockerfile
FROM public.ecr.aws/lambda/python:3.12
RUN pip install tensorflow-cpu tensorflow-hub kagglehub
COPY inference.py ${LAMBDA_TASK_ROOT}/
CMD [ "inference.handler" ]
```

### Alternatives Considered

| Option | Image Size Limit | Cold Start | Monthly Cost |
|--------|-----------------|------------|--------------|
| Lambda Zip | 250 MB | 1-5s | ~$2 |
| Lambda Container | 10 GB | 5-30s | ~$3 |
| SageMaker Endpoint | Unlimited | N/A | ~$83 |
| SageMaker Serverless | Unlimited | 60s+ | ~$5-15 |
| EC2 + FastAPI | Unlimited | N/A | ~$30 |

### Rationale

- **Cost:** Eliminated $83/month SageMaker endpoint
- **Simplicity:** Same Lambda invocation pattern
- **Scaling:** Automatic, pay-per-use
- **Size:** 10GB limit easily fits TensorFlow + model

### Consequences

- **Positive:** 97% cost reduction vs SageMaker
- **Positive:** Unified Lambda architecture
- **Negative:** 5-30s cold starts
- **Negative:** Model download on each cold start (~10-20s)

### Cold Start Mitigation

- Lazy import TensorFlow
- Cache model in `/tmp` for warm invocations
- Consider provisioned concurrency for production (~$15/month)

---

## ADR-006: SageMaker Endpoint Elimination

### Context

Initial deployment used SageMaker real-time inference:
- Instance: ml.m5.large ($0.115/hour = $83/month)
- Failed with XLA compilation error
- Cost exceeded student budget

### Decision

Replace SageMaker with Lambda container inference and delete the endpoint.

### Cost Analysis

| Phase | SageMaker | Lambda Container | Savings |
|-------|-----------|------------------|---------|
| Initial | $83/month | N/A | N/A |
| After migration | $0 | ~$2.50/month | $80.50/month |
| Annual | $996/year | ~$30/year | $966/year |

### Rationale

- **Cost:** Primary driver - $83/month unacceptable for demo
- **Functionality:** SageMaker endpoint was broken (XLA error)
- **Reliability:** Lambda approach works correctly

### Consequences

- **Positive:** Massive cost reduction
- **Positive:** Working inference (SageMaker was broken)
- **Negative:** Cold start latency trade-off
- **Mitigated:** Async processing hides latency from users

### Migration Steps

```bash
# 1. Deploy Lambda container
./scripts/deploy_inference_lambda.sh

# 2. Update classifier to use Lambda
./scripts/update_classifier_env.sh

# 3. Verify working
./scripts/test-all.sh

# 4. Delete SageMaker (saves $83/month)
./scripts/delete_sagemaker_endpoint.sh
```

---

## ADR-007: HTTP API Gateway vs REST API

### Context

Need an API endpoint for the Lambda functions. AWS offers two API Gateway types.

### Decision

Use HTTP API (v2) instead of REST API (v1).

### Comparison

| Feature | HTTP API | REST API |
|---------|----------|----------|
| Latency | ~10ms | ~30ms |
| Cost | $1.00/million | $3.50/million |
| Features | Basic | Full (caching, keys) |
| CORS | Simple | Complex |

### Rationale

- **Cost:** 70% cheaper than REST API
- **Latency:** 3x faster baseline latency
- **Simplicity:** Sufficient features for this use case
- **CORS:** Built-in CORS support is simpler

### Consequences

- **Positive:** Lower cost and latency
- **Positive:** Simpler configuration
- **Negative:** No API caching
- **Negative:** No usage plans/API keys (not needed for demo)

---

## ADR-008: Pure NumPy Classifier Inference

### Context

The trained MLP classifier needs to run in Lambda without adding PyTorch dependency.

### Decision

Export model weights to NumPy format and implement forward pass in pure NumPy:

```python
def classify_embedding(embedding, weights):
    x = np.array(embedding, dtype=np.float32)
    x = np.maximum(0, x @ weights['w1'] + weights['b1'])  # ReLU
    x = np.maximum(0, x @ weights['w2'] + weights['b2'])  # ReLU
    logits = x @ weights['w3'] + weights['b3']
    exp_logits = np.exp(logits - np.max(logits))
    return exp_logits / exp_logits.sum()
```

### Alternatives Considered

| Option | Package Size | Inference Time | Complexity |
|--------|-------------|----------------|------------|
| PyTorch | ~1.5 GB | Fast | Low |
| TensorFlow | ~400 MB | Fast | Low |
| ONNX Runtime | ~50 MB | Fast | Medium |
| Pure NumPy | ~15 MB | Fast enough | Low |

### Rationale

- **Size:** NumPy already required; no additional dependencies
- **Simplicity:** MLP is trivial to implement manually
- **Lambda:** Avoids increasing package size
- **Performance:** 3-layer MLP inference is <1ms

### Consequences

- **Positive:** No additional dependencies
- **Positive:** Transparent, auditable inference code
- **Positive:** Easy to update weights
- **Negative:** Must manually implement any architecture changes

---

## ADR-009: Temporal Stratified Sampling for MARRS Data

### Context

MARRS dataset is ~1TB with 500k recordings. Need representative subset for reference embeddings without downloading everything.

### Decision

Implement temporal stratified sampling:

1. Parse timestamps from filenames
2. Group by hour of day (0-23)
3. Sample evenly across hours
4. Use ~200 files per site (~9,000 total)

### Rationale

- **Ecological Validity:** Reef soundscapes vary by time of day
- **Storage Cost:** 16GB vs 1TB = 98% reduction
- **Transfer Cost:** One-time ~$0.07 vs hours of download
- **Representative:** Captures dawn chorus, nocturnal activity, etc.

### Consequences

- **Positive:** Manageable dataset size
- **Positive:** Representative temporal coverage
- **Negative:** May miss rare acoustic events
- **Negative:** Selection introduces some bias

---

## ADR-010: Explicit Error Categories

### Context

ML inference can fail for many reasons. Users need actionable error messages.

### Decision

Implement categorized errors with suggestions:

```python
class InferenceError(Exception):
    def __init__(self, message, error_type, retry_count, request_id):
        self.error_type = error_type  # TIMEOUT, LAMBDA_NOT_FOUND, etc.
        self.retry_count = retry_count
        self.request_id = request_id

SUGGESTIONS = {
    'TIMEOUT': 'Try with a shorter audio file',
    'LAMBDA_NOT_FOUND': 'Contact administrator',
    'THROTTLED': 'Wait and retry',
    'INVALID_REQUEST': 'Check audio format',
}
```

### Rationale

- **User Experience:** Actionable suggestions vs generic errors
- **Debugging:** Error type enables targeted fixes
- **Operations:** Request ID enables log correlation

### Consequences

- **Positive:** Better user experience
- **Positive:** Faster debugging
- **Negative:** More code to maintain
- **Mitigated:** Centralized error handling

---

## Cost Summary

### Monthly Cost Comparison

| Configuration | Monthly Cost |
|---------------|-------------|
| Initial (with SageMaker) | ~$83.15 |
| Current (Lambda-only) | ~$0.50-2.50 |
| Production (1000 req/day) | ~$10-15 |

### Cost Breakdown (Demo Usage)

| Service | Cost |
|---------|------|
| Lambda (4 functions) | ~$0.50 |
| API Gateway | ~$0 |
| S3 (16GB) | ~$0.40 |
| DynamoDB | ~$0 |
| CloudWatch | ~$0.10 |
| **Total** | **~$1.00/month** |

### Free Tier Coverage

Most services remain within AWS Free Tier for 12 months:
- Lambda: 1M requests, 400K GB-seconds
- API Gateway: 1M requests
- DynamoDB: 25 GB, 25 WCU/RCU
- S3: 5 GB storage, 20K GET, 2K PUT

## References

- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [AWS API Gateway Pricing](https://aws.amazon.com/api-gateway/pricing/)
- [AWS DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/)
- [AWS SageMaker Pricing](https://aws.amazon.com/sagemaker/pricing/)
- [Lambda Container Images](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)
- [HTTP API vs REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html)
