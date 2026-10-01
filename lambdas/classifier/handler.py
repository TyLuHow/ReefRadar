"""
Health classifier - uses SurfPerch embeddings to classify reef health.

Uses the SurfPerch inference Lambda (container-based) for real ML embeddings.
NEVER falls back to synthetic embeddings - fails with clear error instead.
"""

import hashlib
import io
import json
import boto3
import os
from botocore.exceptions import ClientError, ConnectTimeoutError, EndpointConnectionError, ReadTimeoutError
import numpy as np
import random
import uuid
import time
from datetime import datetime
from decimal import Decimal
from region_detection import detect_region, adjust_classification, DEFAULT_TRAINING_SITES
from site_provenance import load_provenance, apply_label_provenance

s3 = boto3.client('s3')
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')


# Stored floats are rounded to this many decimals. 9 (not 6) so the stored class
# probabilities still sum to 1 to within ~1e-8: rounding 3-4 values to 6 decimals
# let the sum drift by up to ~2e-6 (REVIEW WR-08).
STORED_FLOAT_DECIMALS = 9


def convert_floats(obj):
    """Convert floats to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(round(obj, STORED_FLOAT_DECIMALS)))
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

MODEL_WEIGHTS_KEY = 'models/reef_classifier_weights.npz'
MODEL_CONFIG_KEY = 'models/model_config.json'
# How often a warm container re-checks the S3 ETags of the model objects, so a
# model publish or rollback is picked up without waiting for a recycle.
MODEL_REFRESH_SECONDS = 60
REQUIRED_WEIGHT_KEYS = ('w1', 'b1', 'w2', 'b2', 'w3', 'b3')

# Caches for warm Lambda invocations
_model_weights = None
_model_config = None
_model_etags = None
_model_checked_at = 0.0
_reference_embeddings = None
_label_provenance = None

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAYS = [1, 2, 4]  # Exponential backoff in seconds
# Throttling needs a longer wait than a transient error to clear the window.
THROTTLE_RETRY_DELAYS = [3, 8, 15]
BATCH_SIZE = 10  # Segments per batch to avoid payload limits


class InferenceError(Exception):
    """Raised when ML inference fails after all retries."""
    def __init__(self, message, error_type='INFERENCE_FAILED', retry_count=0, request_id=None):
        super().__init__(message)
        self.error_type = error_type
        self.retry_count = retry_count
        self.request_id = request_id


class _InferenceCallError(Exception):
    """A failed inference call whose error_type is already known (not retry-classified by text)."""
    def __init__(self, message, error_type='INFERENCE_FAILED'):
        super().__init__(message)
        self.error_type = error_type


def classify_inference_exception(e):
    """Map an exception from the inference call to an error_type.

    Uses structured information (our own typed error, botocore ClientError
    codes, botocore timeout classes) rather than substring-matching the message,
    so unrelated text containing e.g. "timeout" cannot mislabel an error.
    """
    if isinstance(e, _InferenceCallError):
        return e.error_type
    if isinstance(e, ClientError):
        code = e.response.get('Error', {}).get('Code', '')
        if code == 'ResourceNotFoundException':
            return 'LAMBDA_NOT_FOUND'
        if code in ('TooManyRequestsException', 'ThrottlingException', 'Throttling', 'RequestLimitExceeded'):
            return 'THROTTLED'
        if code in ('ServiceException', 'ServiceUnavailableException', 'EC2ThrottledException'):
            return 'SERVICE_ERROR'
        if code in ('RequestTimeout', 'RequestTimeoutException'):
            return 'TIMEOUT'
        return 'INFERENCE_FAILED'
    if isinstance(e, (ReadTimeoutError, ConnectTimeoutError)):
        return 'TIMEOUT'
    if isinstance(e, EndpointConnectionError):
        return 'SERVICE_ERROR'
    return 'INFERENCE_FAILED'


def handler(event, context):
    """Classify audio segments."""
    upload_id = event['upload_id']
    analysis_id = event['analysis_id']
    segments_key = event['segments_key']
    num_segments = event['num_segments']
    latitude = event.get('latitude')
    longitude = event.get('longitude')

    table = dynamodb.Table(METADATA_TABLE)
    request_id = context.aws_request_id if context else str(uuid.uuid4())

    # Idempotency (WR-03): this function is invoked asynchronously, so Lambda
    # may deliver the same event more than once. A terminal RESULT or ERROR
    # item is the single authoritative outcome -- never redo the work.
    try:
        # The guard runs inside the try so a transient DynamoDB read failure
        # is recorded as CLASSIFICATION_FAILED instead of leaving the analysis
        # stuck in "classifying".
        if _terminal_outcome_exists(table, analysis_id):
            print(f"Analysis {analysis_id} already has a terminal outcome; skipping duplicate delivery")
            return {
                'statusCode': 200,
                'body': json.dumps({'analysis_id': analysis_id, 'status': 'duplicate_delivery_ignored'})
            }

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

        # Load the model ONCE per invocation so the probabilities and the
        # training-site list always come from the same model version.
        model = load_classifier_model()
        classification = classify_embedding(mean_embedding, model=model)

        # Apply geographic region detection (D-12: no confidence/probability
        # scaling -- region is reported honestly, separately, from the
        # classifier's actual (audited) training sites).
        _, model_config = model
        training_sites = model_config.get('training_sites') or DEFAULT_TRAINING_SITES
        region_result = detect_region(latitude, longitude, training_sites=training_sites)
        classification = adjust_classification(classification, region_result)

        similar_sites, similar_sites_error = find_similar_sites_with_status(mean_embedding)

        # Store results - synthetic is ALWAYS false now
        result_item = {
            'pk': f'ANALYSIS#{analysis_id}',
            'sk': 'RESULT',
            'upload_id': upload_id,
            'analysis_id': analysis_id,
            'status': 'complete',
            'classification': classification,
            'similar_sites': similar_sites,
            **({'similar_sites_error': similar_sites_error} if similar_sites_error else {}),
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
            'caveats': region_result['caveat']
        }
        # Convert floats to Decimal for DynamoDB. Conditional write: a RESULT is
        # written at most once per analysis (a concurrent duplicate delivery
        # must not overwrite it).
        try:
            table.put_item(
                Item=convert_floats(result_item),
                ConditionExpression='attribute_not_exists(pk)'
            )
        except table.meta.client.exceptions.ConditionalCheckFailedException:
            print(f"Analysis {analysis_id}: RESULT already written by another delivery")
            return {
                'statusCode': 200,
                'body': json.dumps({'analysis_id': analysis_id, 'status': 'duplicate_delivery_ignored'})
            }

        # A stale ERROR (e.g. from an earlier failed delivery) must not
        # contradict the RESULT that now exists.
        try:
            table.delete_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'ERROR'})
        except Exception as cleanup_err:  # best effort: the role may not grant DeleteItem
            print(f"WARN could not clear stale ERROR item: {type(cleanup_err).__name__}")

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
        # ML inference failed - record ONE terminal ERROR and return normally.
        # Re-raising would make Lambda's async-invoke machinery retry the whole
        # classification (up to 2 more times, each doing up to 3 inference
        # attempts per batch) after /status already told the client "failed".
        print(f"ERROR analysis {analysis_id}: {e.error_type}: {e}")
        return _record_failure(table, analysis_id, upload_id, {
            'error_code': e.error_type,
            'error': str(e),
            'stage': 'inference',
            'retry_count': e.retry_count,
            'request_id': e.request_id or request_id,
            'suggestion': get_error_suggestion(e.error_type),
        })

    except Exception as e:
        # Other errors (not inference-related)
        print(f"ERROR analysis {analysis_id}: CLASSIFICATION_FAILED: {type(e).__name__}: {e}")
        return _record_failure(table, analysis_id, upload_id, {
            'error_code': 'CLASSIFICATION_FAILED',
            'error': str(e),
            'stage': 'classification',
            'request_id': request_id,
            'suggestion': get_error_suggestion('CLASSIFICATION_FAILED'),
        })


# Classifier-authored ERROR items carry one of these stages. The preprocessor's
# ERROR items carry no stage and are retryable (it re-raises, so Lambda's async
# retry can re-run it successfully and then invoke this function).
_CLASSIFIER_ERROR_STAGES = ('inference', 'classification')


def _terminal_outcome_exists(table, analysis_id):
    """True if this analysis already has a terminal outcome: a RESULT, or an
    ERROR written by the classifier itself. A stale preprocessor ERROR is NOT
    terminal -- the pipeline has demonstrably recovered if we were invoked."""
    pk = f'ANALYSIS#{analysis_id}'
    if 'Item' in table.get_item(Key={'pk': pk, 'sk': 'RESULT'}):
        return True
    err = table.get_item(Key={'pk': pk, 'sk': 'ERROR'}).get('Item')
    return bool(err) and err.get('stage') in _CLASSIFIER_ERROR_STAGES


def _record_failure(table, analysis_id, upload_id, fields):
    """Write the terminal ERROR item (unless a RESULT already exists), mark the
    upload failed, and return a normal (non-raising) response so Lambda does
    not retry the async invocation."""
    error_item = {
        'pk': f'ANALYSIS#{analysis_id}',
        'sk': 'ERROR',
        'upload_id': upload_id,
        'status': 'failed',
        'timestamp': datetime.utcnow().isoformat(),
    }
    error_item.update(fields)

    # Never let a late failure contradict a RESULT that was already stored.
    if 'Item' in table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'RESULT'}):
        return {
            'statusCode': 200,
            'body': json.dumps({'analysis_id': analysis_id, 'status': 'complete'})
        }
    try:
        # Keep the first classifier terminal outcome, but let this ERROR
        # supersede a stale preprocessor ERROR (which has no 'stage').
        table.put_item(
            Item=error_item,
            ConditionExpression='attribute_not_exists(pk) OR attribute_not_exists(#stage)',
            ExpressionAttributeNames={'#stage': 'stage'},
        )
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        pass  # a classifier ERROR was already recorded: keep the first terminal outcome

    table.update_item(
        Key={'pk': f'UPLOAD#{upload_id}', 'sk': 'METADATA'},
        UpdateExpression='SET #status = :status',
        ExpressionAttributeNames={'#status': 'status'},
        ExpressionAttributeValues={':status': 'failed'}
    )
    return {
        'statusCode': 500,
        'body': json.dumps({
            'analysis_id': analysis_id,
            'status': 'failed',
            'error_code': fields.get('error_code'),
        })
    }


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
    last_error_type = 'INFERENCE_FAILED'

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
                # The inference function's own runtime reports a timeout structurally.
                timed_out = (
                    response_payload.get('errorType') == 'Sandbox.Timedout'
                    or 'Task timed out' in str(error_msg)
                )
                raise _InferenceCallError(
                    f"Lambda function error: {error_msg}",
                    error_type='TIMEOUT' if timed_out else 'INFERENCE_FAILED'
                )

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
                    raise _InferenceCallError("Inference returned empty embeddings")

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
                raise _InferenceCallError(f"Inference failed: {error_msg}")

        except InferenceError:
            # Don't retry client errors
            raise

        except Exception as e:
            last_error = e
            error_str = str(e)

            # Categorize error from structured information (not message text)
            error_type = classify_inference_exception(e)
            last_error_type = error_type

            print(f"Batch {batch_idx + 1} attempt {attempt + 1} failed ({error_type}): {error_str}")

            # Check if we should retry
            if attempt < MAX_RETRIES - 1:
                if error_type in ['LAMBDA_NOT_FOUND']:
                    # Don't retry infrastructure errors
                    break

                if error_type == 'THROTTLED':
                    delay = THROTTLE_RETRY_DELAYS[attempt] + random.uniform(0, attempt + 1)
                else:
                    delay = RETRY_DELAYS[attempt]
                print(f"Retrying in {delay:.1f}s...")
                time.sleep(delay)
            else:
                # Final attempt failed
                raise InferenceError(
                    f"Inference failed after {MAX_RETRIES} attempts for batch {batch_idx + 1}: {error_str}",
                    error_type=error_type,
                    retry_count=MAX_RETRIES,
                    request_id=request_id
                )

    # If we broke out of loop early (non-retryable error): keep the real error type
    raise InferenceError(
        f"Inference failed for batch {batch_idx + 1}: {str(last_error)}",
        error_type=last_error_type,
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


def validate_model(weights, config):
    """Raise ValueError unless weights and config describe one consistent model.

    Guards the core "probabilities sum to 100%" truth: with a 4-class softmax
    and a 3-class label map, classify_embedding would emit a subset of the
    distribution (sum < 1). Accepts any class count K as long as the weight
    shapes, the label map and (when declared) `num_classes` all agree, so both
    the interim 3-class and the archived 4-class models load.
    """
    missing = [k for k in REQUIRED_WEIGHT_KEYS if k not in weights]
    if missing:
        raise ValueError(f"model weights missing arrays: {missing}")

    idx_to_label = config.get('idx_to_label')
    if not isinstance(idx_to_label, dict) or not idx_to_label:
        raise ValueError("model config has no idx_to_label mapping")
    try:
        indices = sorted(int(k) for k in idx_to_label)
    except (TypeError, ValueError):
        raise ValueError("model config idx_to_label keys must be integer strings")

    num_out = int(weights['w3'].shape[1])
    if indices != list(range(num_out)):
        raise ValueError(
            f"model config idx_to_label covers classes {indices} but weights have {num_out} outputs"
        )
    if int(weights['b3'].shape[0]) != num_out:
        raise ValueError("model weights b3/w3 output sizes disagree")
    declared = config.get('num_classes')
    if declared is not None and int(declared) != num_out:
        raise ValueError(f"model config num_classes={declared} but weights have {num_out} outputs")
    input_dim = config.get('input_dim')
    if input_dim is not None and int(input_dim) != int(weights['w1'].shape[0]):
        raise ValueError("model config input_dim does not match weights")
    if len(set(idx_to_label.values())) != len(idx_to_label):
        raise ValueError("model config idx_to_label has duplicate labels")


def _head_etags():
    """(weights_etag, config_etag) from S3, or None if unavailable."""
    try:
        w = s3.head_object(Bucket=EMBEDDINGS_BUCKET, Key=MODEL_WEIGHTS_KEY)['ETag']
        c = s3.head_object(Bucket=EMBEDDINGS_BUCKET, Key=MODEL_CONFIG_KEY)['ETag']
        return (w, c)
    except Exception:
        return None


def load_classifier_model():
    """Load trained classifier weights from S3 -> (weights, config).

    Validated at load time (see validate_model) and, when the config declares a
    `weights_sha256`, checked against the downloaded weights so a half-published
    model (new weights with old config or vice versa) is rejected rather than
    served. Cached in memory for warm invocations, but the S3 ETags of both
    objects are re-checked every MODEL_REFRESH_SECONDS so a publish or rollback
    is picked up by warm containers. Nothing is cached on /tmp.
    """
    global _model_weights, _model_config, _model_etags, _model_checked_at

    now = time.time()
    if _model_weights is not None and _model_config is not None:
        if now - _model_checked_at < MODEL_REFRESH_SECONDS:
            return _model_weights, _model_config
        _model_checked_at = now
        etags = _head_etags()
        if etags is None or etags == _model_etags:
            return _model_weights, _model_config
        print("Model objects changed in S3; reloading")

    print("Downloading model from S3")
    try:
        etags_before = _head_etags()
        weights_bytes = s3.get_object(Bucket=EMBEDDINGS_BUCKET, Key=MODEL_WEIGHTS_KEY)['Body'].read()
        config = json.loads(
            s3.get_object(Bucket=EMBEDDINGS_BUCKET, Key=MODEL_CONFIG_KEY)['Body'].read().decode()
        )

        expected_sha = config.get('weights_sha256')
        if expected_sha and hashlib.sha256(weights_bytes).hexdigest() != expected_sha:
            raise ValueError("weights sha256 does not match model config (half-published model?)")

        with np.load(io.BytesIO(weights_bytes)) as npz:
            weights = {k: npz[k] for k in npz.files}
        validate_model(weights, config)

        _model_weights, _model_config = weights, config
        _model_etags = etags_before
        _model_checked_at = now
        print(f"Model loaded: version={config.get('version')}, accuracy={config.get('test_accuracy')}")
        return _model_weights, _model_config

    except Exception as e:
        print(f"Failed to load trained model: {e}")
        raise Exception(f"Trained classifier model not available: {e}")


def classify_embedding(embedding, model=None):
    """
    Classify embedding using trained MLP classifier.

    Uses pure NumPy inference with pre-trained weights.
    Returns label, confidence, and probability distribution. `model` may be a
    (weights, config) tuple already loaded for this invocation.
    """
    weights, config = model if model is not None else load_classifier_model()

    x = np.array(embedding, dtype=np.float32)

    # Forward pass through MLP (architecture: 1280 -> 256 -> 64 -> num_classes)
    x = np.maximum(0, x @ weights['w1'] + weights['b1'])  # ReLU
    x = np.maximum(0, x @ weights['w2'] + weights['b2'])  # ReLU
    logits = x @ weights['w3'] + weights['b3']

    # Softmax for probabilities (float64 so the distribution sums to 1)
    logits = logits.astype(np.float64)
    exp_logits = np.exp(logits - np.max(logits))
    probs = exp_logits / exp_logits.sum()

    # Label mapping from config (validated: covers every output exactly once)
    idx_to_label = config['idx_to_label']

    # Find predicted class
    pred_idx = int(np.argmax(probs))
    label = idx_to_label[str(pred_idx)]
    confidence = float(probs[pred_idx])

    # Build probability dict
    probabilities = {}
    for idx_str, lbl in idx_to_label.items():
        probabilities[lbl] = float(probs[int(idx_str)])

    total = sum(probabilities.values())
    if abs(total - 1.0) > 1e-6:
        raise ValueError(f"classifier probabilities sum to {total}, expected 1")

    return {
        'label': label,
        'confidence': confidence,
        'probabilities': probabilities,
        'model_version': config.get('version', 'unknown')
    }


REFERENCE_KEYS = (
    'reference/metadata_v6.json',
    'reference/metadata_v5.json',
    'reference/metadata.json',
)


def load_reference_sites():
    """Load reference sites (with mean embeddings) from S3.

    Uses the SAME key order as the router's /sites (v6 -> v5 -> legacy
    metadata.json) and takes the first object that parses and contains at
    least one site with a `mean_embedding`, so the sites a user sees listed
    and the sites the similarity step compares against come from one source.
    Returns (sites, source_key). Only successful loads are cached; failures
    are logged and raised, never swallowed into an empty list.
    """
    global _reference_embeddings

    if _reference_embeddings is not None:
        return _reference_embeddings

    errors = []
    for key in REFERENCE_KEYS:
        try:
            response = s3.get_object(Bucket=EMBEDDINGS_BUCKET, Key=key)
            metadata = json.loads(response['Body'].read().decode())
        except Exception as e:
            errors.append(f"{key}: {type(e).__name__}")
            continue

        # New format (v2.0+) has a 'sites' key; old format is a direct list.
        if isinstance(metadata, dict) and 'sites' in metadata:
            sites = metadata['sites']
        elif isinstance(metadata, list):
            sites = metadata
        else:
            sites = []

        if any(isinstance(s, dict) and s.get('mean_embedding') for s in sites):
            _reference_embeddings = (sites, key)
            return _reference_embeddings
        errors.append(f"{key}: no sites with embeddings")

    print(f"WARN reference lookup failed: {'; '.join(errors)}")
    raise RuntimeError("no reference object with site embeddings could be loaded")


def get_label_provenance():
    """Load and cache data/site-label-provenance.json (or bundled copy).

    D-17: this is the single place that decides which dataset assigned a
    reference site's label and what that label actually means, so the
    classifier can never invent a health status for a non-MARRS site.
    """
    global _label_provenance
    if _label_provenance is None:
        _label_provenance = load_provenance()
    return _label_provenance


def find_similar_sites_with_status(embedding, top_k=3):
    """Find most similar reference sites using cosine similarity.

    Returns (similar_sites, error_note). `error_note` is None when the lookup
    worked; otherwise a short, user-presentable reason why the list is empty
    ("similarity unavailable") so an empty list is never ambiguous between
    "no neighbours exist" and "the lookup is broken".

    Each result carries its label provenance (D-17): `label_source` names
    the dataset that assigned the status, and `label_original` is that
    dataset's own term for it. Non-MARRS sites (e.g. CoralSoundExplorer's
    disturbance-context recordings) never carry an invented health label
    -- their `status` is whatever apply_label_provenance resolves to
    (typically "unknown"), not a value this function makes up.
    """
    try:
        reference_data, source_key = load_reference_sites()
    except Exception as e:
        print(f"ERROR similar sites: reference load failed: {type(e).__name__}: {e}")
        return [], 'Reference embeddings could not be loaded, so similar-site comparison is unavailable.'

    prov = get_label_provenance()
    similarities = []
    skipped_dim = 0
    status_map = {'H': 'healthy', 'D': 'degraded', 'R': 'restored_early', 'N': 'restored_early'}

    for ref in reference_data:
        ref_embedding = np.array(ref.get('mean_embedding') or [])
        if len(ref_embedding) != len(embedding):
            skipped_dim += 1
            continue
        sim = cosine_similarity(embedding, ref_embedding)
        # Use 'status' field directly if available (new format), else map from site_type
        status = ref.get('status') or status_map.get(ref.get('site_type', 'U'), 'unknown')
        try:
            labeled = apply_label_provenance({'site_id': ref.get('site_id', 'unknown'), 'status': status}, prov)
        except KeyError:
            print(f"WARN similar sites: no provenance for {ref.get('site_id')!r}; skipped")
            continue
        similarities.append({
            'site_id': labeled['site_id'],
            'similarity': float(sim),
            'country': ref.get('country', 'Unknown'),
            'status': labeled['status'],
            'label_source': labeled['label_source'],
            'label_source_name': labeled['label_source_name'],
            'label_original': labeled['label_original'],
        })

    if skipped_dim:
        print(f"WARN similar sites: {skipped_dim}/{len(reference_data)} reference sites from {source_key} "
              f"have no {len(embedding)}-dim embedding and were skipped")

    if not similarities:
        return [], (
            f'No reference site has a comparable {len(embedding)}-dimensional embedding '
            f'({skipped_dim} of {len(reference_data)} reference sites skipped), '
            'so similar-site comparison is unavailable.'
        )

    # Sort by similarity and return top_k
    similarities.sort(key=lambda x: x['similarity'], reverse=True)
    return similarities[:top_k], None


def find_similar_sites(embedding, top_k=3):
    """List-only wrapper around find_similar_sites_with_status."""
    return find_similar_sites_with_status(embedding, top_k=top_k)[0]


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
