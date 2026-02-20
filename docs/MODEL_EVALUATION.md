# Reef Health Classifier - Model Evaluation

**Generated:** 2026-02-03 10:20:33
**Model Version:** 1.0

## Summary

- **Overall Accuracy:** 90.0%
- **Classes:** degraded, healthy, restored_early
- **Input Dimension:** 1280
- **Architecture:** 1280 → 256 → 64 → 3

## Per-Class Performance

| Class | Precision | Recall | F1-Score | Support |
|-------|-----------|--------|----------|---------|
| degraded | 0.80 | 1.00 | 0.89 | 4 |
| healthy | 1.00 | 1.00 | 1.00 | 4 |
| restored_early | 1.00 | 0.50 | 0.67 | 2 |

## Confusion Matrix

```
            Predicted
          degr    heal    rest
Actual   degr      4      0      0
Actual   heal      0      4      0
Actual   rest      1      0      1
```

## Confidence Calibration

| Confidence Range | Count | Accuracy |
|------------------|-------|----------|
| 0%-50% | 2 | 50.0% |
| 50%-70% | 3 | 100.0% |
| 70%-85% | 2 | 100.0% |
| 85%-100% | 3 | 100.0% |

## Model Configuration

```json
{
  "version": "1.0",
  "created": "2026-02-03T10:20:33.949639",
  "input_dim": 1280,
  "hidden_dims": [
    256,
    64
  ],
  "num_classes": 3,
  "label_to_idx": {
    "degraded": 0,
    "healthy": 1,
    "restored_early": 2
  },
  "idx_to_label": {
    "0": "degraded",
    "1": "healthy",
    "2": "restored_early"
  },
  "training_samples": 100,
  "test_accuracy": 0.9
}
```

## Deployment Notes

The model is exported as NumPy weights for deployment in AWS Lambda.
No PyTorch dependency required for inference - uses pure NumPy forward pass.

### Inference Code (Python)

```python
import numpy as np

def classify_embedding(embedding, weights_path='reef_classifier_weights.npz'):
    weights = np.load(weights_path)
    x = np.array(embedding)

    # Forward pass through MLP
    x = np.maximum(0, x @ weights['w1'] + weights['b1'])  # ReLU
    x = np.maximum(0, x @ weights['w2'] + weights['b2'])  # ReLU
    logits = x @ weights['w3'] + weights['b3']

    # Softmax
    exp_logits = np.exp(logits - np.max(logits))
    probs = exp_logits / exp_logits.sum()

    labels = {'degraded': 0, 'healthy': 1, 'restored_early': 2}
    pred_idx = np.argmax(probs)

    return {
        'label': list(labels.keys())[pred_idx],
        'confidence': float(probs[pred_idx]),
        'probabilities': dict(zip(labels.keys(), probs.tolist()))
    }
```
