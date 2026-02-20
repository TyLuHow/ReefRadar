# Machine Learning Implementation Research

**Last Updated:** 2026-02-03
**Author:** AI-assisted research compilation

## Overview

This document provides comprehensive technical documentation of the machine learning components in ReefRadar, including the SurfPerch bioacoustic embedding model, the perch-hoplite library integration, and deployment architecture decisions. It serves as a reference for future development and technical review.

## SurfPerch Model Specifications

### Origin and Purpose

[SurfPerch](https://www.kaggle.com/models/google/surfperch) is a transfer learning model developed by Google Research specifically for coral reef acoustic analysis. It builds on the Perch architecture originally designed for bird vocalization detection, extended to marine bioacoustics.

**Key Paper:** Williams et al. (2024) "Leveraging Tropical Reef, Bird and Unrelated Sounds for Superior Transfer Learning in Marine Bioacoustics" ([arXiv](https://arxiv.org/abs/2505.03071))

### Technical Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Sample Rate | 32 kHz | Native model expectation |
| Window Duration | 5.0 seconds | Per inference window |
| Samples per Window | 160,000 | 32000 Hz x 5.0s |
| Embedding Dimension | 1280 | Output feature vector size |
| Model Size | ~127 MB | TensorFlow SavedModel format |
| Architecture | EfficientNet-based | Convolutional neural network |
| Training Data | ReefSet + AudioSet | 57,084 reef sounds + diverse audio |

### Input/Output Specification

**Input Format:**
- Audio: 32kHz mono PCM float32
- Shape: `[batch_size, 160000]` or `[batch_size, 160000, 1]`
- Value range: normalized to [-1, 1]

**Output Format:**
- Embedding: 1280-dimensional float32 vector
- Shape: `[batch_size, 1280]`
- Semantically meaningful: similar sounds produce similar embeddings

### Performance Characteristics

From the original paper:
- **AUC-ROC:** 0.933 (+-0.02) on cross-domain evaluation
- **Training:** Can be fine-tuned in seconds on standard laptop
- **Inference:** ~100-500ms per 5-second window (CPU)

## perch-hoplite Library Integration

### Library Overview

[perch-hoplite](https://github.com/google-research/perch) is Google's official inference toolkit for the Perch family of bioacoustic models. ReefRadar uses this library instead of raw TensorFlow to ensure correct preprocessing and model loading.

### Dependencies

```
tensorflow-hub>=0.16.0      # Model loading from Kaggle
kagglehub>=0.3.0            # Fallback model download
tensorflow-cpu>=2.18.0      # Inference runtime (~400MB)
soundfile>=0.12.0           # Audio file I/O
```

### Model Loading Strategy

The inference Lambda implements a multi-stage loading strategy:

1. **Primary:** Load via `tensorflow_hub.load()` from Kaggle URL
2. **Fallback:** Download via `kagglehub.model_download()`
3. **Cache:** Store in Lambda `/tmp` for warm invocations

```python
# Primary loading path
model_url = 'https://www.kaggle.com/models/google/surfperch/TensorFlow2/1'
model = hub.load(model_url)

# Get embedding function via signatures
embed_fn = model.signatures['serving_default']
```

### Preprocessing Pipeline

Audio preprocessing follows this sequence:

1. **Normalization:** Scale to [-1, 1] range
2. **Resampling:** Linear interpolation to 32kHz if needed
3. **Segmentation:** Split into 5.0-second windows (160,000 samples)
4. **Padding:** Zero-pad final window if >50% complete

## Lambda Container Deployment

### Architecture Decision

ReefRadar uses AWS Lambda container images rather than SageMaker for ML inference. This decision was driven by:

| Factor | Lambda Container | SageMaker Endpoint |
|--------|------------------|-------------------|
| Monthly Cost | ~$2.50 (demo) | ~$83 (ml.m5.large) |
| Cold Start | 5-30 seconds | N/A (always-on) |
| Max Memory | 10 GB | Unlimited |
| Max Timeout | 15 minutes | Unlimited |
| Scaling | Automatic | Manual/Auto |

### Container Specification

**Base Image:** `public.ecr.aws/lambda/python:3.12`

**Dockerfile:**
```dockerfile
FROM public.ecr.aws/lambda/python:3.12

RUN dnf install -y libsndfile gcc gcc-c++ && dnf clean all
RUN pip install --upgrade pip

COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

COPY inference.py ${LAMBDA_TASK_ROOT}/
CMD [ "inference.handler" ]
```

**Lambda Configuration:**
- Memory: 3008 MB (~2 vCPUs)
- Timeout: 300 seconds (5 minutes)
- Ephemeral Storage: 512 MB
- Image Size: ~1.5 GB

### Cold Start Optimization

Cold starts are the primary latency concern:

| Component | Time | Mitigation |
|-----------|------|------------|
| Container init | 2-5s | Use smaller base image |
| Python import | 3-5s | Lazy import TensorFlow |
| Model download | 10-30s | Cache in /tmp |
| First inference | 1-2s | Warm via periodic ping |

**Total cold start:** 15-40 seconds (first request)
**Warm invocation:** 0.5-2 seconds

### S3-Based Payload Pattern

Lambda has a 6MB synchronous payload limit. ReefRadar uses S3 for larger audio transfers:

```python
# Classifier stores segments in S3
batch_key = f'temp/embedding_batches/{analysis_id}_{batch_idx}.json'
s3.put_object(Bucket=EMBEDDINGS_BUCKET, Key=batch_key, Body=json.dumps(batch_data))

# Invoke inference with S3 reference
lambda_client.invoke(
    FunctionName=INFERENCE_FUNCTION,
    Payload=json.dumps({'s3_bucket': bucket, 's3_key': batch_key})
)
```

## Trained Classifier Model

### Architecture

ReefRadar uses a lightweight MLP classifier trained on MARRS SurfPerch embeddings:

```
Input: 1280-dimensional SurfPerch embedding
    |
Hidden Layer 1: 256 units, ReLU
    |
Hidden Layer 2: 64 units, ReLU
    |
Output: 3 classes (softmax)
```

### Training Data

- **Source:** MARRS dataset embeddings
- **Training Samples:** 100 (small due to limited GPU access)
- **Test Accuracy:** 90%
- **Classes:** degraded, healthy, restored_early

### Inference Implementation

The classifier uses pure NumPy for inference (no PyTorch dependency):

```python
def classify_embedding(embedding, weights):
    x = np.array(embedding, dtype=np.float32)
    x = np.maximum(0, x @ weights['w1'] + weights['b1'])  # ReLU
    x = np.maximum(0, x @ weights['w2'] + weights['b2'])  # ReLU
    logits = x @ weights['w3'] + weights['b3']

    # Softmax
    exp_logits = np.exp(logits - np.max(logits))
    probs = exp_logits / exp_logits.sum()
    return probs
```

### Model Storage

- **Location:** `s3://reefradar-2477-embeddings/models/`
- **Files:** `reef_classifier_weights.npz`, `model_config.json`
- **Caching:** Downloaded to Lambda `/tmp` on cold start

## Comparison: SageMaker vs Lambda Container

### Original SageMaker Deployment (Failed)

The initial approach used SageMaker real-time inference:

```
SageMaker Endpoint
├── Instance: ml.m5.large ($0.115/hour)
├── Container: tensorflow-inference:2.12-cpu
├── Model: SurfPerch SavedModel
└── Error: XLA compilation disabled
```

**Failure Reason:** SurfPerch was saved with XLA JIT compilation enabled. TensorFlow Serving on SageMaker does not support XLA-compiled models, producing the error:
```
XLA compilation disabled [[{{function_node __inference_signature_wrapper_21994}}]]
```

### Lambda Container Solution (Current)

The Lambda container approach avoids this issue by:
1. Using `tensorflow_hub.load()` instead of TensorFlow Serving
2. Running inference directly rather than via SavedModel signatures
3. Enabling eager execution mode

### Cost Comparison

| Scenario | SageMaker | Lambda Container | Savings |
|----------|-----------|------------------|---------|
| Always-on (demo) | $83/month | N/A | N/A |
| 300 requests/month | $83/month | $0.50/month | 99% |
| 1,500 requests/month | $83/month | $2.50/month | 97% |
| 6,000 requests/month | $83/month | $10/month | 88% |

## Future Optimizations

### TensorFlow Lite Conversion

Converting SurfPerch to TFLite could reduce cold starts:
- Model size: ~127MB to ~53MB
- Load time: ~10s to ~3s
- Risk: Some operations may not convert

### Provisioned Concurrency

For production with strict latency requirements:
- Cost: ~$15/month for 1 warm instance
- Benefit: Eliminates cold starts entirely

### EFS Model Caching

Using EFS instead of /tmp for model storage:
- Benefit: Persistent across invocations
- Cost: ~$0.30/GB-month

## References

- [SurfPerch Model on Kaggle](https://www.kaggle.com/models/google/surfperch) - Official model repository
- [Google Research Perch Repository](https://github.com/google-research/perch) - Source code and documentation
- [ReefSet Dataset on Zenodo](https://zenodo.org/records/11060189) - Training data for SurfPerch
- [AWS Lambda Container Images](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html) - AWS documentation
- [TensorFlow Hub](https://www.tensorflow.org/hub) - Model loading library
- [Williams et al. (2024)](https://arxiv.org/abs/2505.03071) - Original SurfPerch paper
