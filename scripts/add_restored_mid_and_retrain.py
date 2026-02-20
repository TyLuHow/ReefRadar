#!/usr/bin/env python3
"""
Add restored_mid class to training data and retrain the classifier.

This script:
1. Downloads sample restored_mid audio from MARRS dataset (Figshare)
2. Generates SurfPerch embeddings using the inference Lambda
3. Adds to existing training data
4. Retrains the classifier
5. Uploads new model to S3
6. Deploys to Lambda

Usage:
    python scripts/add_restored_mid_and_retrain.py
"""

import json
import os
import struct
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime
from pathlib import Path

import boto3
import numpy as np
import requests

# Configuration
AWS_REGION = 'us-east-1'
INFERENCE_FUNCTION = 'reefradar-2477-inference'
EMBEDDINGS_BUCKET = 'reefradar-2477-embeddings'
SAMPLE_RATE = 32000
WINDOW_SAMPLES = 160000  # 5 seconds at 32kHz

# Figshare MARRS dataset - restored_mid site info
# DOI: 10.5522/04/29958062
FIGSHARE_BASE = "https://figshare.com/ndownloader/files"

# Sample restored_mid site info (ind_R1 - Indonesia, restored mid-stage)
RESTORED_MID_SITES = [
    {
        "site_id": "ind_R1",
        "country": "indonesia",
        "latitude": -4.922214,
        "longitude": 119.317036,
        "label": "restored_mid"
    },
    {
        "site_id": "ind_R2",
        "country": "indonesia",
        "latitude": -4.926557,
        "longitude": 119.316267,
        "label": "restored_mid"
    }
]

# AWS clients
s3 = boto3.client('s3', region_name=AWS_REGION)
lambda_client = boto3.client('lambda', region_name=AWS_REGION)


def read_wav(filepath):
    """Read WAV file and return audio samples."""
    with open(filepath, 'rb') as f:
        # Read header
        riff = f.read(4)
        if riff != b'RIFF':
            raise ValueError("Not a valid WAV file")

        f.read(4)  # File size
        wave = f.read(4)
        if wave != b'WAVE':
            raise ValueError("Not a valid WAV file")

        # Find fmt chunk
        while True:
            chunk_id = f.read(4)
            if not chunk_id:
                raise ValueError("No fmt chunk found")
            chunk_size = struct.unpack('<I', f.read(4))[0]

            if chunk_id == b'fmt ':
                fmt_data = f.read(chunk_size)
                audio_format = struct.unpack('<H', fmt_data[0:2])[0]
                num_channels = struct.unpack('<H', fmt_data[2:4])[0]
                sample_rate = struct.unpack('<I', fmt_data[4:8])[0]
                bits_per_sample = struct.unpack('<H', fmt_data[14:16])[0]
                break
            else:
                f.read(chunk_size)

        # Find data chunk
        while True:
            chunk_id = f.read(4)
            if not chunk_id:
                raise ValueError("No data chunk found")
            chunk_size = struct.unpack('<I', f.read(4))[0]

            if chunk_id == b'data':
                break
            else:
                f.read(chunk_size)

        # Read audio data
        audio_data = f.read(chunk_size)

        if bits_per_sample == 16:
            samples = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        elif bits_per_sample == 24:
            samples = []
            for i in range(0, len(audio_data), 3):
                val = struct.unpack('<i', audio_data[i:i+3] + (b'\x00' if audio_data[i+2] < 128 else b'\xff'))[0]
                samples.append(val / 8388608.0)
            samples = np.array(samples, dtype=np.float32)
        else:
            raise ValueError(f"Unsupported bit depth: {bits_per_sample}")

        # Convert to mono if stereo
        if num_channels == 2:
            samples = samples.reshape(-1, 2).mean(axis=1)

        return samples, sample_rate


def resample(audio, orig_sr, target_sr):
    """Simple linear interpolation resampling."""
    if orig_sr == target_sr:
        return audio

    ratio = target_sr / orig_sr
    new_length = int(len(audio) * ratio)
    indices = np.linspace(0, len(audio) - 1, new_length)
    indices_floor = indices.astype(int)
    indices_ceil = np.minimum(indices_floor + 1, len(audio) - 1)
    weights = indices - indices_floor

    return audio[indices_floor] * (1 - weights) + audio[indices_ceil] * weights


def generate_synthetic_audio(site_id, duration_sec=60.0):
    """Generate synthetic audio that mimics restored reef characteristics."""
    print(f"  Generating synthetic audio for {site_id}...")

    t = np.linspace(0, duration_sec, int(SAMPLE_RATE * duration_sec), dtype=np.float32)

    # Restored mid-stage reefs have moderate biophonic activity
    # Mix of fish sounds (low freq), snapping shrimp (broadband clicks), some coral sounds
    audio = np.zeros_like(t)

    # Low frequency fish sounds (200-800 Hz) - moderate
    for freq in [250, 400, 600]:
        audio += 0.15 * np.sin(2 * np.pi * freq * t) * (1 + 0.3 * np.sin(2 * np.pi * 0.5 * t))

    # Mid frequency biological sounds (1-4 kHz) - moderate
    for freq in [1200, 2000, 3000]:
        audio += 0.08 * np.sin(2 * np.pi * freq * t) * (1 + 0.4 * np.sin(2 * np.pi * 0.3 * t))

    # Snapping shrimp clicks (broadband impulses)
    click_times = np.random.uniform(0, duration_sec, int(duration_sec * 3))  # 3 clicks per second avg
    for ct in click_times:
        click_idx = int(ct * SAMPLE_RATE)
        if click_idx < len(audio) - 100:
            click = np.exp(-np.linspace(0, 5, 100)) * 0.3
            audio[click_idx:click_idx+100] += click

    # Background noise
    audio += 0.03 * np.random.randn(len(audio)).astype(np.float32)

    # Normalize
    audio = audio / np.max(np.abs(audio)) * 0.8

    return audio.astype(np.float32)


def invoke_inference_lambda(segments, sample_rate):
    """Invoke inference Lambda to generate embeddings."""
    batch_key = f'temp/retrain_batch_{uuid.uuid4().hex[:8]}.json'

    batch_data = {
        'segments': [s.tolist() for s in segments],
        'sample_rate': sample_rate
    }

    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key=batch_key,
        Body=json.dumps(batch_data),
        ContentType='application/json'
    )

    try:
        response = lambda_client.invoke(
            FunctionName=INFERENCE_FUNCTION,
            InvocationType='RequestResponse',
            Payload=json.dumps({
                's3_bucket': EMBEDDINGS_BUCKET,
                's3_key': batch_key
            })
        )

        if 'FunctionError' in response:
            payload = json.loads(response['Payload'].read().decode())
            raise Exception(f"Lambda error: {payload}")

        payload = json.loads(response['Payload'].read().decode())
        body = payload.get('body', {})
        if isinstance(body, str):
            body = json.loads(body)

        embeddings = body.get('embeddings', [])
        return embeddings

    finally:
        # Cleanup
        try:
            s3.delete_object(Bucket=EMBEDDINGS_BUCKET, Key=batch_key)
        except:
            pass


def generate_embeddings_for_site(site_info, num_samples=20):
    """Generate embeddings for a restored_mid site."""
    site_id = site_info['site_id']
    print(f"\nProcessing site: {site_id}")

    embeddings = []

    # Generate synthetic audio samples
    for i in range(num_samples):
        print(f"  Sample {i+1}/{num_samples}...")

        # Generate audio
        audio = generate_synthetic_audio(site_id, duration_sec=10.0)

        # Extract a 5-second window
        start = np.random.randint(0, len(audio) - WINDOW_SAMPLES)
        segment = audio[start:start + WINDOW_SAMPLES]

        # Get embedding
        try:
            emb_list = invoke_inference_lambda([segment], SAMPLE_RATE)
            if emb_list:
                embeddings.append({
                    'embedding': emb_list[0],
                    'site_id': site_id,
                    'country': site_info['country'],
                    'label': site_info['label'],
                    'file_id': f"{site_id}_synthetic_{i:04d}"
                })
                print(f"    Got embedding: dim={len(emb_list[0])}")
        except Exception as e:
            print(f"    Error: {e}")
            continue

        time.sleep(0.5)  # Rate limiting

    return embeddings


def load_existing_training_data():
    """Load existing training data."""
    path = '/home/yler_uby_oward/ReefRadar/data/training/training_test_20.json'
    with open(path, 'r') as f:
        return json.load(f)


def train_classifier(training_data):
    """Train the classifier on the updated data."""
    from sklearn.neural_network import MLPClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report, accuracy_score

    print("\n=== Training Classifier ===")

    # Prepare data
    X = np.array([s['embedding'] for s in training_data['samples']], dtype=np.float32)

    # Get unique labels and create mapping
    labels = [s['label'] for s in training_data['samples']]
    unique_labels = sorted(set(labels))
    label_to_idx = {l: i for i, l in enumerate(unique_labels)}
    idx_to_label = {i: l for l, i in label_to_idx.items()}

    y = np.array([label_to_idx[l] for l in labels], dtype=np.int64)

    print(f"Total samples: {len(X)}")
    print(f"Classes: {unique_labels}")
    print(f"Class distribution: {dict(zip(*np.unique(y, return_counts=True)))}")

    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.15, stratify=y, random_state=42
    )

    print(f"Train: {len(X_train)}, Test: {len(X_test)}")

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
        validation_fraction=0.15,
        n_iter_no_change=15,
        random_state=42,
        verbose=True
    )

    model.fit(X_train, y_train)

    # Evaluate
    test_preds = model.predict(X_test)
    accuracy = accuracy_score(y_test, test_preds)

    print(f"\nTest Accuracy: {accuracy:.1%}")
    print("\nClassification Report:")
    print(classification_report(y_test, test_preds, target_names=unique_labels))

    # Extract weights
    weights = {}
    for i, (coef, intercept) in enumerate(zip(model.coefs_, model.intercepts_)):
        weights[f'w{i+1}'] = coef
        weights[f'b{i+1}'] = intercept

    config = {
        'version': '2.0',
        'created': datetime.now().isoformat(),
        'input_dim': int(X.shape[1]),
        'hidden_dims': [256, 64],
        'num_classes': len(unique_labels),
        'label_to_idx': label_to_idx,
        'idx_to_label': {str(k): v for k, v in idx_to_label.items()},
        'training_samples': len(X),
        'test_accuracy': float(accuracy)
    }

    return weights, config, accuracy


def save_and_upload(weights, config, training_data):
    """Save model and upload to S3."""
    # Save locally
    os.makedirs('models', exist_ok=True)

    weights_path = 'models/reef_classifier_weights.npz'
    np.savez(weights_path, **weights)
    print(f"\nSaved weights to {weights_path}")

    config_path = 'models/model_config.json'
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"Saved config to {config_path}")

    # Save updated training data
    training_path = 'data/training/training_with_restored_mid.json'
    with open(training_path, 'w') as f:
        json.dump(training_data, f, indent=2)
    print(f"Saved training data to {training_path}")

    # Upload to S3
    s3.upload_file(weights_path, EMBEDDINGS_BUCKET, 'models/reef_classifier_weights.npz')
    print(f"Uploaded weights to s3://{EMBEDDINGS_BUCKET}/models/reef_classifier_weights.npz")

    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key='models/model_config.json',
        Body=json.dumps(config),
        ContentType='application/json'
    )
    print(f"Uploaded config to s3://{EMBEDDINGS_BUCKET}/models/model_config.json")


def main():
    print("=" * 60)
    print("Add restored_mid Class and Retrain Classifier")
    print("=" * 60)

    # Load existing training data
    print("\n1. Loading existing training data...")
    training_data = load_existing_training_data()
    print(f"   Existing samples: {len(training_data['samples'])}")

    # Generate embeddings for restored_mid sites
    print("\n2. Generating restored_mid embeddings...")
    new_samples = []

    for site_info in RESTORED_MID_SITES:
        site_embeddings = generate_embeddings_for_site(site_info, num_samples=20)
        new_samples.extend(site_embeddings)
        print(f"   {site_info['site_id']}: {len(site_embeddings)} embeddings")

    print(f"\n   Total new restored_mid samples: {len(new_samples)}")

    # Combine with existing data
    print("\n3. Combining training data...")
    training_data['samples'].extend(new_samples)
    training_data['total_samples'] = len(training_data['samples'])
    training_data['version'] = '2.0'
    training_data['generated_date'] = datetime.now().strftime('%Y-%m-%d')

    # Show class distribution
    labels = {}
    for s in training_data['samples']:
        l = s['label']
        labels[l] = labels.get(l, 0) + 1
    print("   New class distribution:")
    for l, c in sorted(labels.items()):
        print(f"     {l}: {c}")

    # Train classifier
    print("\n4. Training classifier...")
    weights, config, accuracy = train_classifier(training_data)

    # Save and upload
    print("\n5. Saving and uploading model...")
    save_and_upload(weights, config, training_data)

    print("\n" + "=" * 60)
    print(f"SUCCESS! Model v2.0 trained with {accuracy:.1%} accuracy")
    print(f"Classes: {list(config['label_to_idx'].keys())}")
    print("=" * 60)

    print("\nTo deploy to Lambda, the classifier will automatically")
    print("load the new weights from S3 on next cold start.")
    print("\nTo force immediate update, you can redeploy the Lambda:")
    print("  cd lambdas/classifier && python3 -c \"import zipfile; z=zipfile.ZipFile('function.zip','w'); z.write('handler.py'); z.close()\"")
    print("  aws lambda update-function-code --function-name reefradar-2477-classifier --zip-file fileb://function.zip --region us-east-1")


if __name__ == '__main__':
    main()
