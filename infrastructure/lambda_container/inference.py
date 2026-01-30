"""
SurfPerch inference Lambda handler.

Generates 1280-dimensional embeddings from coral reef audio recordings
using the SurfPerch model from Google Research.

Model specs (from perch-hoplite model_configs.py):
- Input: 32kHz mono audio, 5.0 second windows (160,000 samples)
- Output: 1280-dimensional embedding per window
"""

import json
import os
import numpy as np
import boto3

# Lazy load TensorFlow to reduce cold start
_model = None
_embed_fn = None

# Constants matching SurfPerch specifications (from perch-hoplite model_configs.py)
SAMPLE_RATE = 32000          # 32 kHz
WINDOW_SECONDS = 5.0         # 5.0 seconds
WINDOW_SAMPLES = int(SAMPLE_RATE * WINDOW_SECONDS)  # 160,000 samples
EMBEDDING_DIM = 1280

# Kaggle model handle - format: owner/model/framework/variation
# Try without the duplicate 'TensorFlow2' component
MODEL_HANDLE = 'google/surfperch/tensorFlow2/1'

s3 = boto3.client('s3')


def get_model():
    """Lazy load SurfPerch model to reduce cold start impact."""
    global _model, _embed_fn

    if _model is None:
        print("Loading SurfPerch model...")
        import tensorflow as tf
        import tensorflow_hub as hub

        # Set TF Hub cache directory to /tmp for Lambda
        os.environ['TFHUB_CACHE_DIR'] = '/tmp/tfhub_cache'

        # Try loading via tensorflow_hub with the Kaggle URL
        # TF Hub automatically handles Kaggle model URLs
        model_url = 'https://www.kaggle.com/models/google/surfperch/TensorFlow2/1'
        print(f"Loading model from: {model_url}")

        try:
            # Use hub.load for SavedModel format
            _model = hub.load(model_url)
            print("Model loaded via hub.load")
        except Exception as e:
            print(f"hub.load failed: {e}")
            # Fallback: try downloading via kagglehub and loading directly
            import kagglehub
            os.environ['KAGGLEHUB_CACHE'] = '/tmp/kagglehub'

            # Try different handle formats
            handles_to_try = [
                MODEL_HANDLE,
                'google/surfperch/tensorFlow2',
                'google/surfperch',
            ]

            model_path = None
            for handle in handles_to_try:
                try:
                    print(f"Trying kagglehub download: {handle}")
                    model_path = kagglehub.model_download(handle)
                    print(f"Downloaded to: {model_path}")
                    break
                except Exception as he:
                    print(f"Handle {handle} failed: {he}")
                    continue

            if model_path:
                _model = tf.saved_model.load(model_path)
            else:
                raise RuntimeError("Could not download SurfPerch model")

        # Get the embedding function
        if hasattr(_model, 'signatures'):
            sig_keys = list(_model.signatures.keys())
            print(f"Available signatures: {sig_keys}")
            if 'serving_default' in sig_keys:
                _embed_fn = _model.signatures['serving_default']
            elif sig_keys:
                _embed_fn = _model.signatures[sig_keys[0]]
            else:
                _embed_fn = _model
        else:
            _embed_fn = _model

        print(f"SurfPerch model loaded. Sample rate: {SAMPLE_RATE}Hz, "
              f"Window: {WINDOW_SECONDS}s, Embedding dim: {EMBEDDING_DIM}")

    return _model, _embed_fn


def preprocess_audio(audio_data, source_sample_rate=None):
    """
    Preprocess audio for SurfPerch inference.

    Args:
        audio_data: Raw audio samples as list or numpy array
        source_sample_rate: Original sample rate (for resampling if needed)

    Returns:
        List of 5.0-second windows at 32kHz
    """
    audio = np.array(audio_data, dtype=np.float32)

    # Normalize to [-1, 1] if needed
    max_val = np.max(np.abs(audio))
    if max_val > 1.0:
        audio = audio / max_val

    # Resample if needed (simple linear interpolation)
    if source_sample_rate and source_sample_rate != SAMPLE_RATE:
        duration = len(audio) / source_sample_rate
        new_length = int(duration * SAMPLE_RATE)
        indices = np.linspace(0, len(audio) - 1, new_length)
        audio = np.interp(indices, np.arange(len(audio)), audio)

    # Segment into windows
    windows = []
    for start in range(0, len(audio) - WINDOW_SAMPLES + 1, WINDOW_SAMPLES):
        window = audio[start:start + WINDOW_SAMPLES]
        windows.append(window)

    # Handle partial final window (pad with zeros)
    remaining = len(audio) % WINDOW_SAMPLES
    if remaining > WINDOW_SAMPLES // 2:  # Only if more than half a window
        final_window = np.zeros(WINDOW_SAMPLES, dtype=np.float32)
        final_window[:remaining] = audio[-remaining:]
        windows.append(final_window)

    return windows


def generate_embedding(audio_window):
    """
    Generate embedding for a single audio window using SurfPerch.

    Args:
        audio_window: 160,000 samples at 32kHz (5.0 seconds)

    Returns:
        1280-dimensional embedding as list
    """
    import tensorflow as tf

    model, embed_fn = get_model()

    # Ensure correct shape and type
    audio = np.array(audio_window, dtype=np.float32)

    if len(audio) != WINDOW_SAMPLES:
        raise ValueError(f"Expected {WINDOW_SAMPLES} samples, got {len(audio)}")

    # Reshape for model input: (batch, samples) or (batch, samples, channels)
    # Try different input shapes based on model signature
    audio_tensor = tf.constant(audio.reshape(1, -1), dtype=tf.float32)

    try:
        # Try calling the embedding function directly
        if callable(embed_fn):
            outputs = embed_fn(audio_tensor)
        else:
            outputs = model(audio_tensor)

        # Extract embeddings from output
        # SavedModel outputs may be dict, tensor, or named tuple
        if isinstance(outputs, dict):
            # Look for embedding-related keys
            for key in ['embeddings', 'embedding', 'output', 'output_0']:
                if key in outputs:
                    embedding = outputs[key]
                    break
            else:
                # Use first output
                embedding = list(outputs.values())[0]
        elif hasattr(outputs, 'embeddings'):
            embedding = outputs.embeddings
        else:
            embedding = outputs

        # Convert to numpy and flatten
        embedding = np.array(embedding).flatten()[:EMBEDDING_DIM]

        return embedding.tolist()

    except Exception as e:
        print(f"Error generating embedding: {e}")
        # Try alternative input shape (some models expect [batch, samples, 1])
        audio_3d = tf.constant(audio.reshape(1, -1, 1), dtype=tf.float32)
        outputs = model(audio_3d)
        embedding = np.array(outputs).flatten()[:EMBEDDING_DIM]
        return embedding.tolist()


def handler(event, context):
    """
    Lambda handler for SurfPerch inference.

    Supports two modes:
    1. Direct: Audio segments passed in event body
    2. S3: Audio segments loaded from S3 key

    Event format (direct):
    {
        "segments": [[...], [...], ...],  # List of audio windows (160,000 samples each)
        "sample_rate": 32000  # Optional, for resampling
    }

    Event format (S3):
    {
        "s3_bucket": "bucket-name",
        "s3_key": "path/to/segments.json"
    }

    Returns:
    {
        "embeddings": [[...], [...], ...],  # 1280-dim embedding per segment
        "num_segments": 5,
        "embedding_dim": 1280,
        "model": "surfperch",
        "synthetic": false
    }
    """
    print(f"Received event: {json.dumps(event)[:500]}...")

    try:
        # Load segments from S3 or direct
        if 's3_bucket' in event and 's3_key' in event:
            print(f"Loading segments from s3://{event['s3_bucket']}/{event['s3_key']}")
            response = s3.get_object(
                Bucket=event['s3_bucket'],
                Key=event['s3_key']
            )
            segments_data = json.loads(response['Body'].read().decode())
            segments = segments_data.get('segments', segments_data)
            sample_rate = segments_data.get('sample_rate', SAMPLE_RATE)
        else:
            segments = event.get('segments', [])
            sample_rate = event.get('sample_rate', SAMPLE_RATE)

        if not segments:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'No audio segments provided',
                    'expected_format': {
                        'segments': '[[160000 audio samples at 32kHz], ...]',
                        'sample_rate': 32000
                    }
                })
            }

        print(f"Processing {len(segments)} segments at {sample_rate}Hz")

        # Generate embeddings for each segment
        embeddings = []
        for i, segment in enumerate(segments):
            # Preprocess if not already at correct sample rate/length
            if len(segment) != WINDOW_SAMPLES:
                windows = preprocess_audio(segment, sample_rate)
                if windows:
                    segment = windows[0]  # Use first window
                else:
                    print(f"Segment {i} too short, skipping")
                    continue

            embedding = generate_embedding(segment)
            embeddings.append(embedding)
            print(f"Generated embedding {i+1}/{len(segments)}")

        result = {
            'statusCode': 200,
            'body': {
                'embeddings': embeddings,
                'num_segments': len(embeddings),
                'embedding_dim': EMBEDDING_DIM,
                'model': 'surfperch',
                'model_version': '1.0',
                'synthetic': False
            }
        }

        print(f"Successfully generated {len(embeddings)} embeddings")
        return result

    except Exception as e:
        print(f"Error during inference: {str(e)}")
        import traceback
        traceback.print_exc()

        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'error_type': type(e).__name__
            })
        }
