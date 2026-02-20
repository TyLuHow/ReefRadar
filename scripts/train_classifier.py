#!/usr/bin/env python3
"""
Train a reef health classifier on SurfPerch embeddings.

Usage:
    python scripts/train_classifier.py [--local] [--epochs 100]

The classifier is a simple MLP that takes 1280-dim SurfPerch embeddings
and outputs class probabilities for reef health status.
"""

import json
import os
import argparse
import numpy as np
from datetime import datetime

# Check for PyTorch availability
try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
    from torch.utils.data import DataLoader, TensorDataset
    HAS_PYTORCH = True
except ImportError:
    HAS_PYTORCH = False
    print("PyTorch not available, using sklearn fallback")

try:
    from sklearn.neural_network import MLPClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
    from sklearn.preprocessing import LabelEncoder
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False


def load_training_data(local_path=None, s3_path=None):
    """Load training data from local file or S3."""
    if local_path and os.path.exists(local_path):
        print(f"Loading from local: {local_path}")
        with open(local_path, 'r') as f:
            data = json.load(f)
    elif s3_path:
        import boto3
        print(f"Loading from S3: {s3_path}")
        s3 = boto3.client('s3')
        bucket = s3_path.split('/')[2]
        key = '/'.join(s3_path.split('/')[3:])
        response = s3.get_object(Bucket=bucket, Key=key)
        data = json.loads(response['Body'].read().decode())
    else:
        raise ValueError("No valid data source provided")

    return data


def prepare_data(data):
    """Convert training data to numpy arrays."""
    embeddings = []
    labels = []
    site_ids = []

    for sample in data['samples']:
        embeddings.append(sample['embedding'])
        labels.append(sample['label'])
        site_ids.append(sample['site_id'])

    X = np.array(embeddings, dtype=np.float32)

    # Get unique labels and create mapping
    unique_labels = sorted(set(labels))
    label_to_idx = {l: i for i, l in enumerate(unique_labels)}
    idx_to_label = {i: l for l, i in label_to_idx.items()}

    y = np.array([label_to_idx[l] for l in labels], dtype=np.int64)

    print(f"Loaded {len(X)} samples with {len(unique_labels)} classes")
    print(f"Classes: {unique_labels}")
    print(f"Class distribution: {dict(zip(*np.unique(y, return_counts=True)))}")

    return X, y, label_to_idx, idx_to_label, site_ids


# PyTorch model class - only defined if PyTorch is available
if HAS_PYTORCH:
    class ReefClassifier(nn.Module):
        """Simple MLP classifier for reef health."""

        def __init__(self, input_dim=1280, hidden_dims=[256, 64], num_classes=4, dropout=0.3):
            super().__init__()

            layers = []
            prev_dim = input_dim

            for i, hidden_dim in enumerate(hidden_dims):
                layers.append(nn.Linear(prev_dim, hidden_dim))
                layers.append(nn.ReLU())
                layers.append(nn.Dropout(dropout if i == 0 else dropout * 0.7))
                prev_dim = hidden_dim

            layers.append(nn.Linear(prev_dim, num_classes))

            self.layers = nn.Sequential(*layers)

        def forward(self, x):
            return self.layers(x)


def train_pytorch(X, y, label_to_idx, epochs=100, lr=1e-3, batch_size=32, patience=15):
    """Train using PyTorch."""
    print("\n=== Training with PyTorch ===")

    num_classes = len(label_to_idx)

    # Stratified split: 80% train, 10% val, 10% test
    # First split off test set
    X_trainval, X_test, y_trainval, y_test = train_test_split(
        X, y, test_size=0.1, stratify=y, random_state=42
    )
    # Then split train/val
    X_train, X_val, y_train, y_val = train_test_split(
        X_trainval, y_trainval, test_size=0.111, stratify=y_trainval, random_state=42
    )

    print(f"Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")

    # Compute class weights for imbalanced data
    class_counts = np.bincount(y_train)
    class_weights = 1.0 / class_counts
    class_weights = class_weights / class_weights.sum() * len(class_weights)
    class_weights = torch.FloatTensor(class_weights)
    print(f"Class weights: {class_weights.numpy()}")

    # Create data loaders
    train_dataset = TensorDataset(torch.FloatTensor(X_train), torch.LongTensor(y_train))
    val_dataset = TensorDataset(torch.FloatTensor(X_val), torch.LongTensor(y_val))

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size)

    # Initialize model
    model = ReefClassifier(input_dim=X.shape[1], num_classes=num_classes)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = optim.Adam(model.parameters(), lr=lr)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)

    # Training loop with early stopping
    best_val_loss = float('inf')
    best_model_state = None
    patience_counter = 0

    for epoch in range(epochs):
        # Training
        model.train()
        train_loss = 0
        for batch_X, batch_y in train_loader:
            optimizer.zero_grad()
            outputs = model(batch_X)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()

        train_loss /= len(train_loader)

        # Validation
        model.eval()
        val_loss = 0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for batch_X, batch_y in val_loader:
                outputs = model(batch_X)
                loss = criterion(outputs, batch_y)
                val_loss += loss.item()

                _, predicted = torch.max(outputs, 1)
                val_total += batch_y.size(0)
                val_correct += (predicted == batch_y).sum().item()

        val_loss /= len(val_loader)
        val_acc = val_correct / val_total

        scheduler.step(val_loss)

        if (epoch + 1) % 10 == 0 or epoch == 0:
            print(f"Epoch {epoch+1}/{epochs} - Train Loss: {train_loss:.4f}, Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.4f}")

        # Early stopping check
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_model_state = model.state_dict().copy()
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= patience:
                print(f"Early stopping at epoch {epoch+1}")
                break

    # Load best model
    model.load_state_dict(best_model_state)

    # Evaluate on test set
    model.eval()
    with torch.no_grad():
        test_outputs = model(torch.FloatTensor(X_test))
        _, test_preds = torch.max(test_outputs, 1)
        test_probs = torch.softmax(test_outputs, dim=1)

    test_preds = test_preds.numpy()
    test_probs = test_probs.numpy()

    return model, X_test, y_test, test_preds, test_probs


def train_sklearn(X, y, label_to_idx):
    """Train using sklearn as fallback."""
    print("\n=== Training with sklearn ===")

    # Stratified split
    X_trainval, X_test, y_trainval, y_test = train_test_split(
        X, y, test_size=0.1, stratify=y, random_state=42
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_trainval, y_trainval, test_size=0.111, stratify=y_trainval, random_state=42
    )

    print(f"Train: {len(X_train)}, Val: {len(X_val)}, Test: {len(X_test)}")

    # Train MLP
    model = MLPClassifier(
        hidden_layer_sizes=(256, 64),
        activation='relu',
        solver='adam',
        alpha=0.001,
        batch_size=32,
        learning_rate='adaptive',
        max_iter=200,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=15,
        random_state=42,
        verbose=True
    )

    model.fit(X_train, y_train)

    test_preds = model.predict(X_test)
    test_probs = model.predict_proba(X_test)

    return model, X_test, y_test, test_preds, test_probs


def extract_numpy_weights(pytorch_model):
    """Extract weights from PyTorch model as numpy arrays."""
    if not HAS_PYTORCH:
        raise RuntimeError("PyTorch not available")

    weights = {}

    # Get all linear layers
    linear_idx = 0
    for name, module in pytorch_model.layers.named_modules():
        if isinstance(module, nn.Linear):
            linear_idx += 1
            weights[f'w{linear_idx}'] = module.weight.detach().numpy().T  # Transpose for numpy
            weights[f'b{linear_idx}'] = module.bias.detach().numpy()

    return weights


def numpy_inference(weights, embedding):
    """Run inference using pure numpy (for deployment verification)."""
    x = np.array(embedding)

    # Forward pass through MLP
    x = np.maximum(0, x @ weights['w1'] + weights['b1'])  # ReLU
    x = np.maximum(0, x @ weights['w2'] + weights['b2'])  # ReLU
    logits = x @ weights['w3'] + weights['b3']

    # Softmax
    exp_logits = np.exp(logits - np.max(logits))
    probs = exp_logits / exp_logits.sum()

    return probs


def evaluate_model(y_test, test_preds, test_probs, idx_to_label):
    """Generate evaluation metrics."""
    labels = [idx_to_label[i] for i in range(len(idx_to_label))]

    # Classification report
    report = classification_report(y_test, test_preds, target_names=labels, output_dict=True)
    report_str = classification_report(y_test, test_preds, target_names=labels)

    # Confusion matrix
    cm = confusion_matrix(y_test, test_preds)

    # Overall accuracy
    accuracy = accuracy_score(y_test, test_preds)

    # Confidence calibration: check if high confidence = correct
    confidences = test_probs.max(axis=1)
    correct = (test_preds == y_test)

    # Bin by confidence
    bins = [0, 0.5, 0.7, 0.85, 1.0]
    calibration = {}
    for i in range(len(bins)-1):
        mask = (confidences >= bins[i]) & (confidences < bins[i+1])
        if mask.sum() > 0:
            calibration[f"{bins[i]:.0%}-{bins[i+1]:.0%}"] = {
                'count': int(mask.sum()),
                'accuracy': float(correct[mask].mean())
            }

    return {
        'accuracy': accuracy,
        'report': report,
        'report_str': report_str,
        'confusion_matrix': cm.tolist(),
        'calibration': calibration,
        'labels': labels
    }


def save_model_artifacts(model, weights, config, metrics, output_dir):
    """Save all model artifacts."""
    os.makedirs(output_dir, exist_ok=True)

    # Save numpy weights
    weights_path = os.path.join(output_dir, 'reef_classifier_weights.npz')
    np.savez(weights_path, **weights)
    print(f"Saved weights to {weights_path}")

    # Save config
    config_path = os.path.join(output_dir, 'model_config.json')
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"Saved config to {config_path}")

    # Save PyTorch model if available
    if HAS_PYTORCH and hasattr(model, 'state_dict'):
        pt_path = os.path.join(output_dir, 'reef_classifier.pt')
        torch.save(model.state_dict(), pt_path)
        print(f"Saved PyTorch model to {pt_path}")

    return weights_path, config_path


def upload_to_s3(local_path, s3_bucket, s3_key):
    """Upload file to S3."""
    import boto3
    s3 = boto3.client('s3')
    s3.upload_file(local_path, s3_bucket, s3_key)
    print(f"Uploaded {local_path} to s3://{s3_bucket}/{s3_key}")


def generate_evaluation_report(metrics, config, output_path):
    """Generate markdown evaluation report."""
    labels = metrics['labels']
    cm = np.array(metrics['confusion_matrix'])

    report = f"""# Reef Health Classifier - Model Evaluation

**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
**Model Version:** {config['version']}

## Summary

- **Overall Accuracy:** {metrics['accuracy']:.1%}
- **Classes:** {', '.join(labels)}
- **Input Dimension:** {config['input_dim']}
- **Architecture:** {' → '.join(map(str, [config['input_dim']] + config['hidden_dims'] + [len(labels)]))}

## Per-Class Performance

| Class | Precision | Recall | F1-Score | Support |
|-------|-----------|--------|----------|---------|
"""

    for label in labels:
        m = metrics['report'][label]
        report += f"| {label} | {m['precision']:.2f} | {m['recall']:.2f} | {m['f1-score']:.2f} | {int(m['support'])} |\n"

    report += f"""
## Confusion Matrix

```
{' ' * 12}Predicted
{' ' * 8}{'  '.join(f'{l[:4]:>6}' for l in labels)}
"""

    for i, label in enumerate(labels):
        report += f"Actual {label[:4]:>6} {' '.join(f'{cm[i][j]:>6}' for j in range(len(labels)))}\n"

    report += """```

## Confidence Calibration

| Confidence Range | Count | Accuracy |
|------------------|-------|----------|
"""

    for range_str, cal in metrics['calibration'].items():
        report += f"| {range_str} | {cal['count']} | {cal['accuracy']:.1%} |\n"

    report += f"""
## Model Configuration

```json
{json.dumps(config, indent=2)}
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

    labels = {config['label_to_idx']}
    pred_idx = np.argmax(probs)

    return {{
        'label': list(labels.keys())[pred_idx],
        'confidence': float(probs[pred_idx]),
        'probabilities': dict(zip(labels.keys(), probs.tolist()))
    }}
```
"""

    with open(output_path, 'w') as f:
        f.write(report)

    print(f"Saved evaluation report to {output_path}")


def main():
    parser = argparse.ArgumentParser(description='Train reef health classifier')
    parser.add_argument('--local', action='store_true', help='Use local training data')
    parser.add_argument('--epochs', type=int, default=100, help='Training epochs')
    parser.add_argument('--lr', type=float, default=1e-3, help='Learning rate')
    parser.add_argument('--batch-size', type=int, default=32, help='Batch size')
    parser.add_argument('--output-dir', default='models', help='Output directory')
    parser.add_argument('--upload', action='store_true', help='Upload to S3 after training')
    args = parser.parse_args()

    # Paths
    local_path = 'data/training/training_test_20.json'
    s3_training_path = 's3://reefradar-2477-embeddings/training/training_test_20.json'
    s3_bucket = 'reefradar-2477-embeddings'

    # Load data
    if args.local and os.path.exists(local_path):
        data = load_training_data(local_path=local_path)
    else:
        data = load_training_data(s3_path=s3_training_path)

    # Prepare data
    X, y, label_to_idx, idx_to_label, site_ids = prepare_data(data)

    # Train model
    if HAS_PYTORCH:
        model, X_test, y_test, test_preds, test_probs = train_pytorch(
            X, y, label_to_idx,
            epochs=args.epochs,
            lr=args.lr,
            batch_size=args.batch_size
        )
        weights = extract_numpy_weights(model)
    elif HAS_SKLEARN:
        model, X_test, y_test, test_preds, test_probs = train_sklearn(X, y, label_to_idx)
        # Extract sklearn weights
        weights = {}
        for i, (coef, intercept) in enumerate(zip(model.coefs_, model.intercepts_)):
            weights[f'w{i+1}'] = coef
            weights[f'b{i+1}'] = intercept
    else:
        raise RuntimeError("Neither PyTorch nor sklearn available for training")

    # Evaluate
    metrics = evaluate_model(y_test, test_preds, test_probs, idx_to_label)

    print(f"\n=== Evaluation Results ===")
    print(f"Test Accuracy: {metrics['accuracy']:.1%}")
    print(f"\nClassification Report:\n{metrics['report_str']}")

    # Verify numpy inference matches
    print("\n=== Verifying NumPy Inference ===")
    for i in range(min(3, len(X_test))):
        np_probs = numpy_inference(weights, X_test[i])
        orig_pred = test_preds[i]
        np_pred = np.argmax(np_probs)
        match = "✓" if orig_pred == np_pred else "✗"
        print(f"Sample {i}: Original pred={idx_to_label[orig_pred]}, NumPy pred={idx_to_label[np_pred]} {match}")

    # Model config
    config = {
        'version': '1.0',
        'created': datetime.now().isoformat(),
        'input_dim': int(X.shape[1]),
        'hidden_dims': [256, 64],
        'num_classes': len(label_to_idx),
        'label_to_idx': label_to_idx,
        'idx_to_label': {str(k): v for k, v in idx_to_label.items()},
        'training_samples': len(X),
        'test_accuracy': float(metrics['accuracy'])
    }

    # Save artifacts
    weights_path, config_path = save_model_artifacts(
        model, weights, config, metrics, args.output_dir
    )

    # Generate evaluation report
    report_path = 'docs/MODEL_EVALUATION.md'
    os.makedirs('docs', exist_ok=True)
    generate_evaluation_report(metrics, config, report_path)

    # Upload to S3 if requested
    if args.upload:
        upload_to_s3(weights_path, s3_bucket, 'models/reef_classifier_weights.npz')
        upload_to_s3(config_path, s3_bucket, 'models/model_config.json')

    print(f"\n=== Training Complete ===")
    print(f"Model weights: {weights_path}")
    print(f"Model config: {config_path}")
    print(f"Evaluation report: {report_path}")

    if not args.upload:
        print(f"\nTo upload to S3, run with --upload flag or manually:")
        print(f"  aws s3 cp {weights_path} s3://{s3_bucket}/models/")
        print(f"  aws s3 cp {config_path} s3://{s3_bucket}/models/")


if __name__ == '__main__':
    main()
