"""
Health classifier - uses SurfPerch embeddings to classify reef health.

Uses the SurfPerch inference Lambda (container-based) for real ML embeddings.
NEVER falls back to synthetic embeddings - fails with clear error instead.
"""

import json
import boto3
import os
import numpy as np
import uuid
import time
from datetime import datetime
from decimal import Decimal

s3 = boto3.client('s3')
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')


def convert_floats(obj):
    """Convert floats to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(round(obj, 6)))
    elif isinstance(obj, dict):
        return {k: convert_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats(item) for item in obj]
    return obj


AUDIO_BUCKET = os.environ.get('AUDIO_BUCKET')
EMBEDDINGS_BUCKET = os.environ.get('EMBEDDINGS_BUCKET')
METADATA_TABLE = os.environ.get('METADATA_TABLE')
INFERENCE_FUNCTION = os.environ.get('INFERENCE_FUNCTION', 'reefradar-2477-inference')

CATEGORIES = ['healthy', 'degraded', 'restored_early', 'restored_mid']

# Caches for warm Lambda invocations
_model_weights = None
_model_config = None
_reference_embeddings = None

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAYS = [1, 2, 4]  # Exponential backoff in seconds
BATCH_SIZE = 10  # Segments per batch to avoid payload limits


class InferenceError(Exception):
    """Raised when ML inference fails after all retries."""
    def __init__(self, message, error_type='INFERENCE_FAILED', retry_count=0, request_id=None):
        super().__init__(message)
        self.error_type = error_type
        self.retry_count = retry_count
        self.request_id = request_id


def handler(event, context):
    """Classify audio segments."""
    upload_id = event['upload_id']
    analysis_id = event['analysis_id']
    segments_key = event['segments_key']
    num_segments = event['num_segments']

    table = dynamodb.Table(METADATA_TABLE)
    request_id = context.aws_request_id if context else str(uuid.uuid4())

    try:
        # Load segments
        response = s3.get_object(Bucket=AUDIO_BUCKET, Key=segments_key)
        segments_data = json.loads(response['Body'].read().decode())
        segments = segments_data['segments']
        sample_rate = segments_data.get('sample_rate', 32000)

        # Get real embeddings from inference Lambda - NO SYNTHETIC FALLBACK
        embeddings = invoke_inference_with_retry(
            segments=segments,
            sample_rate=sample_rate,
            analysis_id=analysis_id,
            request_id=request_id
        )

        embeddings = np.array(embeddings)
        mean_embedding = embeddings.mean(axis=0)

        # Load reference embeddings and classify
        classification = classify_embedding(mean_embedding)
        similar_sites = find_similar_sites(mean_embedding)
        viz_coords = generate_visualization(mean_embedding)

        # Store results - synthetic is ALWAYS false now
        result_item = {
            'pk': f'ANALYSIS#{analysis_id}',
            'sk': 'RESULT',
            'upload_id': upload_id,
            'analysis_id': analysis_id,
            'status': 'complete',
            'classification': classification,
            'similar_sites': similar_sites,
            'visualization': viz_coords,
            'embedding_summary': {
                'dimension': int(len(mean_embedding)),
                'num_segments': num_segments,
                'aggregation': 'mean',
                'synthetic': False,
                'embedding_model': 'surfperch',
                'embedding_version': '1.0',
                'classifier_model': 'trained_mlp',
                'classifier_version': classification.get('model_version', '1.0')
            },
            'completed_at': datetime.utcnow().isoformat(),
            'caveats': 'Classification by trained MLP on SurfPerch embeddings (90% test accuracy on MARRS data). Not a definitive health diagnosis. Complements visual surveys.'
        }
        # Convert floats to Decimal for DynamoDB
        table.put_item(Item=convert_floats(result_item))

        # Update upload record
        table.update_item(
            Key={'pk': f'UPLOAD#{upload_id}', 'sk': 'METADATA'},
            UpdateExpression='SET #status = :status',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':status': 'complete'}
        )

        return {
            'statusCode': 200,
            'body': json.dumps({
                'analysis_id': analysis_id,
                'status': 'complete',
                'classification': classification
            })
        }

    except InferenceError as e:
        # ML inference failed - store detailed error and propagate
        error_details = {
            'pk': f'ANALYSIS#{analysis_id}',
            'sk': 'ERROR',
            'upload_id': upload_id,
            'error_code': e.error_type,
            'error': str(e),
            'status': 'failed',
            'stage': 'inference',
            'retry_count': e.retry_count,
            'request_id': e.request_id or request_id,
            'suggestion': get_error_suggestion(e.error_type),
            'timestamp': datetime.utcnow().isoformat()
        }
        table.put_item(Item=error_details)

        # Update upload status
        table.update_item(
            Key={'pk': f'UPLOAD#{upload_id}', 'sk': 'METADATA'},
            UpdateExpression='SET #status = :status',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':status': 'failed'}
        )

        # Re-raise to return proper error
        raise

    except Exception as e:
        # Other errors (not inference-related)
        table.put_item(Item={
            'pk': f'ANALYSIS#{analysis_id}',
            'sk': 'ERROR',
            'upload_id': upload_id,
            'error_code': 'CLASSIFICATION_FAILED',
            'error': str(e),
            'status': 'failed',
            'stage': 'classification',
            'request_id': request_id,
            'timestamp': datetime.utcnow().isoformat()
        })

        # Update upload status
        table.update_item(
            Key={'pk': f'UPLOAD#{upload_id}', 'sk': 'METADATA'},
            UpdateExpression='SET #status = :status',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':status': 'failed'}
        )

        raise


def invoke_inference_with_retry(segments, sample_rate, analysis_id, request_id):
    """
    Invoke inference Lambda with retry logic and S3-based payload.

    Uses S3 to pass audio data (avoids Lambda's 6MB payload limit).
    Implements exponential backoff for transient failures.

    Returns:
        List of 1280-dim embeddings

    Raises:
        InferenceError: If inference fails after all retries
    """
    all_embeddings = []
    num_batches = (len(segments) + BATCH_SIZE - 1) // BATCH_SIZE

    print(f"Processing {len(segments)} segments in {num_batches} batches")

    for batch_idx in range(num_batches):
        start_idx = batch_idx * BATCH_SIZE
        end_idx = min(start_idx + BATCH_SIZE, len(segments))
        batch_segments = segments[start_idx:end_idx]

        # Store batch in S3 to avoid payload limits
        batch_key = f'temp/embedding_batches/{analysis_id}_batch{batch_idx}_{uuid.uuid4().hex[:8]}.json'
        batch_data = {
            'segments': batch_segments,
            'sample_rate': sample_rate
        }

        s3.put_object(
            Bucket=EMBEDDINGS_BUCKET,
            Key=batch_key,
            Body=json.dumps(batch_data),
            ContentType='application/json'
        )

        # Invoke inference with retries
        batch_embeddings = invoke_inference_batch(
            s3_bucket=EMBEDDINGS_BUCKET,
            s3_key=batch_key,
            batch_idx=batch_idx,
            total_batches=num_batches,
            request_id=request_id
        )

        all_embeddings.extend(batch_embeddings)

        # Clean up temp S3 object
        try:
            s3.delete_object(Bucket=EMBEDDINGS_BUCKET, Key=batch_key)
        except Exception:
            pass  # Best effort cleanup

    if not all_embeddings:
        raise InferenceError(
            "No embeddings generated - inference returned empty results",
            error_type='NO_EMBEDDINGS',
            request_id=request_id
        )

    return all_embeddings


def invoke_inference_batch(s3_bucket, s3_key, batch_idx, total_batches, request_id):
    """
    Invoke inference Lambda for a single batch with retry logic.

    Returns:
        List of embeddings for this batch

    Raises:
        InferenceError: If batch fails after all retries
    """
    last_error = None

    for attempt in range(MAX_RETRIES):
        try:
            print(f"Invoking inference Lambda for batch {batch_idx + 1}/{total_batches} (attempt {attempt + 1}/{MAX_RETRIES})")

            inference_response = lambda_client.invoke(
                FunctionName=INFERENCE_FUNCTION,
                InvocationType='RequestResponse',
                Payload=json.dumps({
                    's3_bucket': s3_bucket,
                    's3_key': s3_key
                })
            )

            # Check for Lambda execution errors
            if 'FunctionError' in inference_response:
                response_payload = json.loads(inference_response['Payload'].read().decode())
                error_msg = response_payload.get('errorMessage', str(response_payload))
                raise Exception(f"Lambda function error: {error_msg}")

            # Parse response
            response_payload = json.loads(inference_response['Payload'].read().decode())

            if response_payload.get('statusCode') == 200:
                body = response_payload.get('body', {})
                if isinstance(body, str):
                    body = json.loads(body)

                embeddings = body.get('embeddings', [])

                if embeddings:
                    print(f"Batch {batch_idx + 1}: received {len(embeddings)} embeddings")
                    return embeddings
                else:
                    raise Exception("Inference returned empty embeddings")

            elif response_payload.get('statusCode') == 400:
                # Client error - don't retry
                body = response_payload.get('body', {})
                if isinstance(body, str):
                    body = json.loads(body)
                error_msg = body.get('error', 'Bad request')
                raise InferenceError(
                    f"Invalid request to inference Lambda: {error_msg}",
                    error_type='INVALID_REQUEST',
                    retry_count=attempt + 1,
                    request_id=request_id
                )

            else:
                # Server error - retry
                body = response_payload.get('body', {})
                if isinstance(body, str):
                    body = json.loads(body)
                error_msg = body.get('error', f"Status code: {response_payload.get('statusCode')}")
                raise Exception(f"Inference failed: {error_msg}")

        except InferenceError:
            # Don't retry client errors
            raise

        except Exception as e:
            last_error = e
            error_str = str(e)

            # Categorize error for better messaging
            if 'Timeout' in error_str or 'timeout' in error_str:
                error_type = 'TIMEOUT'
            elif 'ResourceNotFoundException' in error_str:
                error_type = 'LAMBDA_NOT_FOUND'
            elif 'ServiceException' in error_str:
                error_type = 'SERVICE_ERROR'
            elif 'TooManyRequestsException' in error_str:
                error_type = 'THROTTLED'
            else:
                error_type = 'INFERENCE_FAILED'

            print(f"Batch {batch_idx + 1} attempt {attempt + 1} failed: {error_str}")

            # Check if we should retry
            if attempt < MAX_RETRIES - 1:
                if error_type in ['LAMBDA_NOT_FOUND']:
                    # Don't retry infrastructure errors
                    break

                delay = RETRY_DELAYS[attempt]
                print(f"Retrying in {delay}s...")
                time.sleep(delay)
            else:
                # Final attempt failed
                raise InferenceError(
                    f"Inference failed after {MAX_RETRIES} attempts for batch {batch_idx + 1}: {error_str}",
                    error_type=error_type,
                    retry_count=MAX_RETRIES,
                    request_id=request_id
                )

    # If we broke out of loop early (non-retryable error)
    raise InferenceError(
        f"Inference failed for batch {batch_idx + 1}: {str(last_error)}",
        error_type='INFERENCE_FAILED',
        retry_count=attempt + 1,
        request_id=request_id
    )


def get_error_suggestion(error_type):
    """Return actionable suggestion based on error type."""
    suggestions = {
        'TIMEOUT': 'The ML model took too long to process. Try with a shorter audio file or retry later.',
        'LAMBDA_NOT_FOUND': 'The inference service is not deployed. Contact administrator.',
        'SERVICE_ERROR': 'AWS service temporarily unavailable. Please retry in a few minutes.',
        'THROTTLED': 'Too many requests. Please wait a moment and try again.',
        'INVALID_REQUEST': 'The audio format may be incompatible. Ensure you are uploading valid WAV audio.',
        'NO_EMBEDDINGS': 'The ML model could not process the audio. Try a different recording.',
        'INFERENCE_FAILED': 'ML inference failed. Please retry. If problem persists, contact support.',
        'CLASSIFICATION_FAILED': 'Classification step failed. Please retry.'
    }
    return suggestions.get(error_type, 'An error occurred. Please retry later.')


def load_classifier_model():
    """Load trained classifier weights from S3.

    Caches model in memory for warm Lambda invocations.
    Also caches to /tmp for cold starts within same container.
    """
    global _model_weights, _model_config

    # Return cached model if available
    if _model_weights is not None and _model_config is not None:
        return _model_weights, _model_config

    weights_cache = '/tmp/reef_classifier_weights.npz'
    config_cache = '/tmp/model_config.json'

    # Try to load from /tmp cache
    if os.path.exists(weights_cache) and os.path.exists(config_cache):
        print("Loading model from /tmp cache")
        _model_weights = dict(np.load(weights_cache))
        with open(config_cache, 'r') as f:
            _model_config = json.load(f)
        return _model_weights, _model_config

    # Download from S3
    print("Downloading model from S3")
    try:
        # Download weights
        s3.download_file(EMBEDDINGS_BUCKET, 'models/reef_classifier_weights.npz', weights_cache)
        _model_weights = dict(np.load(weights_cache))

        # Download config
        response = s3.get_object(Bucket=EMBEDDINGS_BUCKET, Key='models/model_config.json')
        _model_config = json.loads(response['Body'].read().decode())
        with open(config_cache, 'w') as f:
            json.dump(_model_config, f)

        print(f"Model loaded: version={_model_config.get('version')}, accuracy={_model_config.get('test_accuracy')}")
        return _model_weights, _model_config

    except Exception as e:
        print(f"Failed to load trained model: {e}")
        raise Exception(f"Trained classifier model not available: {e}")


def classify_embedding(embedding):
    """
    Classify embedding using trained MLP classifier.

    Uses pure NumPy inference with pre-trained weights.
    Returns label, confidence, and probability distribution.
    """
    weights, config = load_classifier_model()

    x = np.array(embedding, dtype=np.float32)

    # Forward pass through MLP (architecture: 1280 -> 256 -> 64 -> num_classes)
    x = np.maximum(0, x @ weights['w1'] + weights['b1'])  # ReLU
    x = np.maximum(0, x @ weights['w2'] + weights['b2'])  # ReLU
    logits = x @ weights['w3'] + weights['b3']

    # Softmax for probabilities
    exp_logits = np.exp(logits - np.max(logits))
    probs = exp_logits / exp_logits.sum()

    # Get label mapping from config
    idx_to_label = config.get('idx_to_label', {'0': 'degraded', '1': 'healthy', '2': 'restored_early'})

    # Find predicted class
    pred_idx = int(np.argmax(probs))
    label = idx_to_label.get(str(pred_idx), 'unknown')
    confidence = float(probs[pred_idx])

    # Build probability dict
    probabilities = {}
    for idx_str, lbl in idx_to_label.items():
        probabilities[lbl] = float(probs[int(idx_str)])

    return {
        'label': label,
        'confidence': confidence,
        'probabilities': probabilities,
        'model_version': config.get('version', 'unknown')
    }


def load_reference_embeddings():
    """Load pre-computed reference embeddings from S3.

    Caches in memory for warm Lambda invocations.
    Supports both old format (list of sites) and new format (object with 'sites' key).
    New format (v2.0) includes metadata like source, version, and richer site info.
    """
    global _reference_embeddings

    if _reference_embeddings is not None:
        return _reference_embeddings

    try:
        response = s3.get_object(Bucket=EMBEDDINGS_BUCKET, Key='reference/metadata.json')
        metadata = json.loads(response['Body'].read().decode())

        # Handle new format (v2.0) with 'sites' key
        if isinstance(metadata, dict) and 'sites' in metadata:
            _reference_embeddings = metadata['sites']
        # Handle old format (direct list)
        elif isinstance(metadata, list):
            _reference_embeddings = metadata
        else:
            _reference_embeddings = []

        return _reference_embeddings
    except Exception:
        return []


def find_similar_sites(embedding, top_k=3):
    """Find most similar reference sites using cosine similarity."""
    reference_data = load_reference_embeddings()

    if not reference_data:
        raise Exception("No reference embeddings available for similarity comparison")

    similarities = []
    status_map = {'H': 'healthy', 'D': 'degraded', 'R': 'restored_early', 'N': 'restored_early'}

    for ref in reference_data:
        ref_embedding = np.array(ref.get('mean_embedding', []))
        if len(ref_embedding) == len(embedding):
            sim = cosine_similarity(embedding, ref_embedding)
            # Use 'status' field directly if available (new format), else map from site_type
            status = ref.get('status') or status_map.get(ref.get('site_type', 'U'), 'unknown')
            similarities.append({
                'site_id': ref.get('site_id', 'unknown'),
                'similarity': float(sim),
                'country': ref.get('country', 'Unknown'),
                'status': status
            })

    # Sort by similarity and return top_k
    similarities.sort(key=lambda x: x['similarity'], reverse=True)
    return similarities[:top_k]


def cosine_similarity(a, b):
    """Calculate cosine similarity between two vectors."""
    a = np.array(a)
    b = np.array(b)
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot_product / (norm_a * norm_b)


def generate_visualization(embedding):
    """Generate 2D coordinates for visualization using simple projection."""
    # Simple projection: split embedding and take means for x/y
    mid = len(embedding) // 2
    x = float(np.mean(embedding[:mid]))
    y = float(np.mean(embedding[mid:]))

    # Load reference sites for context
    reference_data = load_reference_embeddings()
    ref_points = []
    status_map = {'H': 'healthy', 'D': 'degraded', 'R': 'restored_early', 'N': 'restored_early'}

    for ref in reference_data[:10]:  # Limit to 10 reference points
        ref_emb = ref.get('mean_embedding', [])
        if ref_emb:
            mid = len(ref_emb) // 2
            # Use 'status' field directly if available (new format), else map from site_type
            status = ref.get('status') or status_map.get(ref.get('site_type', 'U'), 'unknown')
            ref_points.append({
                'site_id': ref.get('site_id', 'unknown'),
                'x': float(np.mean(ref_emb[:mid])),
                'y': float(np.mean(ref_emb[mid:])),
                'status': status
            })

    return {
        'type': 'projection_2d',
        'coordinates': {'x': x, 'y': y},
        'reference_sites': ref_points
    }
