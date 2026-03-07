#!/usr/bin/env python3
"""
Test script for the SurfPerch inference Lambda.

Tests:
1. Direct Lambda invocation with S3-based payload
2. Verifies embeddings are real (1280-dim, valid values)
3. Validates no synthetic fallback occurs

Usage:
    python scripts/test_inference_lambda.py
"""

import json
import boto3
import numpy as np
import sys
import time

# Configuration
INFERENCE_FUNCTION = 'reefradar-2477-inference'
EMBEDDINGS_BUCKET = 'reefradar-2477-embeddings'
AWS_REGION = 'us-east-1'

# SurfPerch specifications
EXPECTED_SAMPLE_RATE = 32000
WINDOW_SAMPLES = 160000  # 5 seconds at 32kHz
EMBEDDING_DIM = 1280


def create_test_audio():
    """Create synthetic test audio (sine wave) for testing."""
    duration = 5.0  # seconds
    t = np.linspace(0, duration, int(EXPECTED_SAMPLE_RATE * duration), dtype=np.float32)

    # Create a complex signal (multiple frequencies like a coral reef recording)
    audio = np.zeros_like(t)
    frequencies = [100, 200, 500, 1000, 2000, 5000]  # Hz

    for freq in frequencies:
        audio += 0.1 * np.sin(2 * np.pi * freq * t)

    # Add some noise
    audio += 0.05 * np.random.randn(len(audio)).astype(np.float32)

    # Normalize
    audio = audio / np.max(np.abs(audio)) * 0.8

    return audio.tolist()


def test_inference_lambda():
    """Test the inference Lambda directly."""
    print("=" * 60)
    print("Testing SurfPerch Inference Lambda")
    print("=" * 60)

    # Initialize clients
    s3 = boto3.client('s3', region_name=AWS_REGION)
    lambda_client = boto3.client('lambda', region_name=AWS_REGION)

    # Step 1: Check Lambda exists
    print("\n1. Checking Lambda function exists...")
    try:
        response = lambda_client.get_function(FunctionName=INFERENCE_FUNCTION)
        config = response['Configuration']
        print(f"   Function: {config['FunctionName']}")
        print(f"   State: {config['State']}")
        print(f"   Memory: {config['MemorySize']} MB")
        print(f"   Timeout: {config['Timeout']} seconds")
        print(f"   Package Type: {config['PackageType']}")
    except Exception as e:
        print(f"   ERROR: Lambda not found - {e}")
        return False

    # Step 2: Create test audio and upload to S3
    print("\n2. Creating test audio segment...")
    test_audio = create_test_audio()
    print(f"   Audio length: {len(test_audio)} samples ({len(test_audio)/EXPECTED_SAMPLE_RATE:.2f}s)")

    test_key = f'temp/test_inference_{int(time.time())}.json'
    test_data = {
        'segments': [test_audio],
        'sample_rate': EXPECTED_SAMPLE_RATE
    }

    print(f"\n3. Uploading test data to S3...")
    print(f"   Bucket: {EMBEDDINGS_BUCKET}")
    print(f"   Key: {test_key}")
    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key=test_key,
        Body=json.dumps(test_data),
        ContentType='application/json'
    )

    # Step 3: Invoke Lambda
    print("\n4. Invoking inference Lambda...")
    start_time = time.time()

    try:
        response = lambda_client.invoke(
            FunctionName=INFERENCE_FUNCTION,
            InvocationType='RequestResponse',
            Payload=json.dumps({
                's3_bucket': EMBEDDINGS_BUCKET,
                's3_key': test_key
            })
        )
    except Exception as e:
        print(f"   ERROR: Failed to invoke Lambda - {e}")
        cleanup_s3(s3, test_key)
        return False

    elapsed = time.time() - start_time
    print(f"   Invocation time: {elapsed:.2f}s")

    # Step 4: Check response
    print("\n5. Checking response...")

    if 'FunctionError' in response:
        payload = json.loads(response['Payload'].read().decode())
        print(f"   ERROR: Lambda execution failed")
        print(f"   Error: {payload}")
        cleanup_s3(s3, test_key)
        return False

    payload = json.loads(response['Payload'].read().decode())
    print(f"   Status code: {payload.get('statusCode')}")

    if payload.get('statusCode') != 200:
        print(f"   ERROR: Non-200 status")
        print(f"   Response: {json.dumps(payload, indent=2)}")
        cleanup_s3(s3, test_key)
        return False

    body = payload.get('body', {})
    if isinstance(body, str):
        body = json.loads(body)

    # Step 5: Validate embeddings
    print("\n6. Validating embeddings...")

    embeddings = body.get('embeddings', [])
    print(f"   Number of embeddings: {len(embeddings)}")

    if not embeddings:
        print("   ERROR: No embeddings returned")
        cleanup_s3(s3, test_key)
        return False

    embedding = embeddings[0]
    print(f"   Embedding dimension: {len(embedding)}")

    if len(embedding) != EMBEDDING_DIM:
        print(f"   ERROR: Expected {EMBEDDING_DIM} dimensions, got {len(embedding)}")
        cleanup_s3(s3, test_key)
        return False

    # Check embedding values are reasonable
    embedding_array = np.array(embedding)
    print(f"   Min value: {embedding_array.min():.4f}")
    print(f"   Max value: {embedding_array.max():.4f}")
    print(f"   Mean value: {embedding_array.mean():.4f}")
    print(f"   Std dev: {embedding_array.std():.4f}")

    # Check for synthetic flag
    is_synthetic = body.get('synthetic', True)
    print(f"   Synthetic flag: {is_synthetic}")

    if is_synthetic:
        print("   WARNING: Response indicates synthetic embeddings!")
        cleanup_s3(s3, test_key)
        return False

    # Check model info
    print(f"   Model: {body.get('model', 'unknown')}")
    print(f"   Model version: {body.get('model_version', 'unknown')}")

    # Step 6: Cleanup
    print("\n7. Cleaning up...")
    cleanup_s3(s3, test_key)

    print("\n" + "=" * 60)
    print("SUCCESS: Inference Lambda is working correctly!")
    print("=" * 60)
    return True


def cleanup_s3(s3, key):
    """Clean up test S3 object."""
    try:
        s3.delete_object(Bucket=EMBEDDINGS_BUCKET, Key=key)
        print(f"   Deleted: s3://{EMBEDDINGS_BUCKET}/{key}")
    except Exception as e:
        print(f"   Warning: Failed to delete test file - {e}")


def test_cosine_similarity():
    """Test that embeddings produce valid cosine similarities."""
    print("\n" + "=" * 60)
    print("Testing Cosine Similarity Validity")
    print("=" * 60)

    # Initialize clients
    s3 = boto3.client('s3', region_name=AWS_REGION)
    lambda_client = boto3.client('lambda', region_name=AWS_REGION)

    # Create two different test audios
    print("\n1. Creating two different test audio segments...")

    # Audio 1: Low frequencies (like healthy reef)
    t = np.linspace(0, 5.0, WINDOW_SAMPLES, dtype=np.float32)
    audio1 = (0.3 * np.sin(2 * np.pi * 200 * t) +
              0.2 * np.sin(2 * np.pi * 500 * t) +
              0.1 * np.random.randn(len(t)).astype(np.float32))
    audio1 = (audio1 / np.max(np.abs(audio1)) * 0.8).tolist()

    # Audio 2: Higher frequencies (like degraded reef)
    audio2 = (0.3 * np.sin(2 * np.pi * 2000 * t) +
              0.2 * np.sin(2 * np.pi * 4000 * t) +
              0.1 * np.random.randn(len(t)).astype(np.float32))
    audio2 = (audio2 / np.max(np.abs(audio2)) * 0.8).tolist()

    # Upload both
    test_key = f'temp/test_similarity_{int(time.time())}.json'
    test_data = {
        'segments': [audio1, audio2],
        'sample_rate': EXPECTED_SAMPLE_RATE
    }

    print("\n2. Uploading test data...")
    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key=test_key,
        Body=json.dumps(test_data),
        ContentType='application/json'
    )

    # Invoke Lambda
    print("\n3. Invoking inference Lambda...")
    response = lambda_client.invoke(
        FunctionName=INFERENCE_FUNCTION,
        InvocationType='RequestResponse',
        Payload=json.dumps({
            's3_bucket': EMBEDDINGS_BUCKET,
            's3_key': test_key
        })
    )

    if 'FunctionError' in response:
        print("   ERROR: Lambda failed")
        cleanup_s3(s3, test_key)
        return False

    payload = json.loads(response['Payload'].read().decode())
    body = payload.get('body', {})
    if isinstance(body, str):
        body = json.loads(body)

    embeddings = body.get('embeddings', [])

    if len(embeddings) < 2:
        print("   ERROR: Expected 2 embeddings")
        cleanup_s3(s3, test_key)
        return False

    # Calculate cosine similarity
    print("\n4. Calculating cosine similarities...")
    emb1 = np.array(embeddings[0])
    emb2 = np.array(embeddings[1])

    # Self-similarity (should be 1.0)
    self_sim = np.dot(emb1, emb1) / (np.linalg.norm(emb1) ** 2)
    print(f"   Self-similarity (emb1 vs emb1): {self_sim:.4f}")

    # Cross-similarity (should be between 0 and 1 for normalized embeddings)
    cross_sim = np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))
    print(f"   Cross-similarity (emb1 vs emb2): {cross_sim:.4f}")

    # Validation
    print("\n5. Validating similarity values...")

    if not (0.99 < self_sim < 1.01):
        print(f"   WARNING: Self-similarity should be ~1.0, got {self_sim}")

    if cross_sim < 0:
        print(f"   ERROR: Negative cosine similarity! Value: {cross_sim}")
        print("   This indicates a problem with the embeddings.")
        cleanup_s3(s3, test_key)
        return False

    if cross_sim > 1:
        print(f"   ERROR: Cosine similarity > 1! Value: {cross_sim}")
        cleanup_s3(s3, test_key)
        return False

    print(f"   All similarities in valid range [0, 1]")

    # Cleanup
    cleanup_s3(s3, test_key)

    print("\n" + "=" * 60)
    print("SUCCESS: Cosine similarity validation passed!")
    print("=" * 60)
    return True


if __name__ == '__main__':
    print("\nReefRadar Inference Lambda Test Suite")
    print("=" * 60)

    # Run tests
    test1_passed = test_inference_lambda()
    test2_passed = test_cosine_similarity() if test1_passed else False

    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"  Inference Lambda Test: {'PASSED' if test1_passed else 'FAILED'}")
    print(f"  Cosine Similarity Test: {'PASSED' if test2_passed else 'FAILED' if test1_passed else 'SKIPPED'}")
    print("=" * 60)

    sys.exit(0 if (test1_passed and test2_passed) else 1)
