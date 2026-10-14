"""
Health classifier - uses SurfPerch embeddings to classify reef health.

Plan 05-09: every 5 s window is embedded and classified individually; the
recording's probabilities are the mean of the per-window probability vectors.
A mean-pooled embedding is never classified.

Uses the SurfPerch inference Lambda (container-based) for real ML embeddings.
NEVER falls back to synthetic embeddings - fails with clear error instead.
"""

import hashlib
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
import reef_audio
import reef_reference
from region_detection import detect_region, adjust_classification, DEFAULT_TRAINING_SITES
from contract_stamp import load_stamp, stamp_for_model, STAMP_KEYS

s3 = boto3.client('s3')
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')


# Stored floats are rounded to this many decimals. 9 (not 6) so the stored class
# probabilities still sum to 1 to within ~1e-8: rounding 3-4 values to 6 decimals
# let the sum drift by up to ~2e-6 (REVIEW WR-08).
STORED_FLOAT_DECIMALS = 9


def convert_floats(obj):
    """Convert a value tree to DynamoDB-safe Python types.

    NumPy scalars and arrays become Python values first; floats become Decimal
    rounded to STORED_FLOAT_DECIMALS. NaN and infinity raise ValueError rather
    than being written (DynamoDB rejects them, and a stored non-finite number
    would be a silent defect).
    """
    if isinstance(obj, np.ndarray):
        return convert_floats(obj.tolist())
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        obj = float(obj)
    if isinstance(obj, float):
        if obj != obj or obj in (float('inf'), float('-inf')):
            raise ValueError(f"refusing to store a non-finite number: {obj}")
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

# The preprocessing the deployed (pre-05) preprocessor wrote as JSON segments. The
# served model was trained on reef_audio windows, so these are refused (below).
LEGACY_PREPROCESSING_SPEC_VERSION = 'preproc-2026.10.0-as-deployed'

# Caches for warm Lambda invocations
_served_model = None
_reference_set = None
_contract_stamp = None

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


class PreprocessingSpecMismatch(Exception):
    """The windows were prepared under a different preprocessing spec than the served model was trained on."""
    def __init__(self, windows_spec, training_spec):
        super().__init__(
            f"windows were prepared under {windows_spec!r} but the served model was trained "
            f"under {training_spec!r}"
        )
        self.windows_spec = windows_spec
        self.training_spec = training_spec


class SegmentIntegrityError(Exception):
    """The segments object does not match its sidecar (length, hash or count), or the sidecar is malformed."""


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

        # The served model is bundled with this code (never read from S3), so
        # the probabilities and the training-site list come from one model.
        served = get_served_model()

        # Describe the segments and verify the sidecar before any inference.
        info = read_segment_info(event)

        # Train/serve parity (05-CONTEXT amendment): the served model was trained
        # on reef_audio windows. Windows prepared any other way -- including the
        # legacy JSON segments an in-flight analysis may still carry between the
        # classifier and preprocessor deploys -- are refused, never classified.
        if info['spec_version'] != served.training_spec_version:
            raise PreprocessingSpecMismatch(info['spec_version'], served.training_spec_version)

        # Real embeddings from the inference Lambda, one per window - NO SYNTHETIC FALLBACK
        embeddings = embed_windows(
            read_segment_batches(event, info),
            analysis_id=analysis_id,
            request_id=request_id,
            total_windows=info['num_windows'],
        )
        if embeddings.shape[0] != info['num_windows']:
            raise InferenceError(
                f"expected {info['num_windows']} embeddings, got {embeddings.shape[0]}",
                error_type='EMBEDDING_MISMATCH', request_id=request_id,
            )

        # Each window is classified on its own; the recording is the mean of the
        # per-window probability vectors. A mean embedding is never classified.
        window_probs = classify_windows(embeddings, served)
        classification = aggregate_classification(window_probs, served)

        # Apply geographic region detection (D-12: no confidence/probability
        # scaling -- region is reported honestly, separately, from the
        # classifier's actual (audited) training sites).
        training_sites = served.config.get('training_sites') or DEFAULT_TRAINING_SITES
        region_result = detect_region(latitude, longitude, training_sites=training_sites)
        classification = adjust_classification(classification, region_result)

        # Context from the bundled contract data: similarity to every reference
        # site (the legacy top-3 is derived from it). Computed after, and apart
        # from, classification: nothing here feeds back into the probabilities.
        similarity = compute_similarity_context(embeddings)
        similar_sites = similarity['similar_sites']
        similar_sites_error = similarity['similar_sites_error']

        # Per-window embeddings for later analysis (n x 1280 little-endian float32).
        s3.put_object(
            Bucket=AUDIO_BUCKET,
            Key=f'processed/{analysis_id}/embeddings.f32',
            Body=np.ascontiguousarray(embeddings, dtype='<f4').tobytes(),
            ContentType='application/octet-stream',
        )

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
            # CONTRACT-04: the versions this result was produced with.
            **result_version_stamp(served.version, info['spec_version']),
            'embedding_summary': {
                'dimension': int(embeddings.shape[1]),
                'num_segments': int(info['num_windows']),
                'aggregation': 'mean_of_window_probabilities',
                'synthetic': False,
                'embedding_model': 'surfperch',
                'embedding_version': '1.0',
                'classifier_model': 'trained_mlp',
                'classifier_version': classification.get('model_version', '1.0')
            },
            'windows': build_windows_block(
                window_probs, served, info['sidecar'],
                similarities=similarity['window_similarities'],
                nearest_site=similarity['nearest_site'],
            ),
            **({'site_similarities': similarity['site_similarities']} if similarity['site_similarities'] else {}),
            'input_audio': build_input_audio_block(info['sidecar']),
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

    except PreprocessingSpecMismatch as e:
        # Retryable by the user: starting the analysis again goes through the
        # updated preprocessor. Nothing is classified under a mismatched spec.
        print(f"ERROR analysis {analysis_id}: PREPROCESSING_SPEC_MISMATCH: {e}")
        return _record_failure(table, analysis_id, upload_id, {
            'error_code': 'PREPROCESSING_SPEC_MISMATCH',
            'error': str(e),
            'stage': 'classification',
            'request_id': request_id,
            'suggestion': get_error_suggestion('PREPROCESSING_SPEC_MISMATCH'),
        })

    except SegmentIntegrityError as e:
        print(f"ERROR analysis {analysis_id}: SEGMENTS_INTEGRITY: {e}")
        return _record_failure(table, analysis_id, upload_id, {
            'error_code': 'SEGMENTS_INTEGRITY',
            'error': str(e),
            'stage': 'classification',
            'request_id': request_id,
            'suggestion': get_error_suggestion('SEGMENTS_INTEGRITY'),
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


def _reject_non_finite_json(name):
    raise SegmentIntegrityError(f"non-finite number {name} in segments")


def read_segment_info(event):
    """Describe the analysis's segments and verify them against their sidecar.

    Returns a dict with `format` ('f32le' or 'json'), `spec_version` (the
    preprocessing spec the windows were prepared under), `num_windows` and, for
    binary segments, the parsed `sidecar`. Binary segments are checked here for
    the event's window count and the object's byte length; the sha256 is
    verified incrementally while the windows are read (read_segment_batches).
    A segments object without `segments_format` is the legacy JSON written by
    the pre-05 preprocessor: it is parsed and identified so it can be refused.

    Raises SegmentIntegrityError for any inconsistency.
    """
    fmt = event.get('segments_format')
    if fmt is None:
        return _read_legacy_segments(event)
    if fmt != reef_audio.SEGMENTS_FORMAT:
        raise SegmentIntegrityError(f"unsupported segments_format {fmt!r}")

    sidecar_key = event.get('preprocessing_key')
    if not sidecar_key:
        raise SegmentIntegrityError("the event has no preprocessing_key for binary segments")
    raw = s3.get_object(Bucket=AUDIO_BUCKET, Key=sidecar_key)['Body'].read()
    try:
        sidecar = reef_audio.parse_sidecar(raw)
    except reef_audio.SidecarError as e:
        raise SegmentIntegrityError(f"preprocessing sidecar is invalid: {e}") from e

    if event.get('num_segments') != sidecar['num_windows']:
        raise SegmentIntegrityError(
            f"event reports {event.get('num_segments')!r} windows but the sidecar describes "
            f"{sidecar['num_windows']}"
        )
    length = s3.head_object(Bucket=AUDIO_BUCKET, Key=event['segments_key'])['ContentLength']
    if length != sidecar['segments_bytes']:
        raise SegmentIntegrityError(
            f"segments object is {length} bytes but the sidecar describes {sidecar['segments_bytes']}"
        )
    return {
        'format': fmt,
        'spec_version': sidecar['spec_version'],
        'num_windows': sidecar['num_windows'],
        'sidecar': sidecar,
    }


def _read_legacy_segments(event):
    """Parse the legacy JSON segments ({"segments": [[160000 floats], ...], "sample_rate": 32000})."""
    body = s3.get_object(Bucket=AUDIO_BUCKET, Key=event['segments_key'])['Body'].read()
    try:
        data = json.loads(body.decode(), parse_constant=_reject_non_finite_json)
        segments = data['segments']
    except SegmentIntegrityError:
        raise
    except (ValueError, KeyError, TypeError, UnicodeDecodeError) as e:
        raise SegmentIntegrityError(f"legacy segments object is not readable: {e}") from e
    if not isinstance(segments, list) or any(
        not isinstance(row, list) or len(row) != reef_audio.WINDOW_SAMPLES for row in segments
    ):
        raise SegmentIntegrityError(
            f"legacy segments must be a list of {reef_audio.WINDOW_SAMPLES}-sample windows"
        )
    return {
        'format': 'json',
        'spec_version': LEGACY_PREPROCESSING_SPEC_VERSION,
        'num_windows': len(segments),
        'segments': segments,
    }


def read_segment_batches(event, info=None):
    """Yield (start_index, float32 array of at most BATCH_SIZE windows).

    Binary segments are read with ranged GETs, one batch at a time, so a
    600 s recording (120 windows, 77 MB) never sits in memory whole. Each
    range must return exactly the bytes asked for, and after the last batch
    the running sha256 must equal the sidecar's segments_sha256; otherwise
    SegmentIntegrityError is raised and no RESULT is written.
    """
    if info is None:
        info = read_segment_info(event)
    n = info['num_windows']

    if info['format'] == 'json':
        windows = np.asarray(info['segments'], dtype=np.float32)
        for start in range(0, n, BATCH_SIZE):
            yield start, windows[start:start + BATCH_SIZE]
        return

    per_window = reef_audio.SEGMENT_BYTES_PER_WINDOW
    digest = hashlib.sha256()
    for start in range(0, n, BATCH_SIZE):
        count = min(BATCH_SIZE, n - start)
        first, last = start * per_window, (start + count) * per_window - 1
        body = s3.get_object(
            Bucket=AUDIO_BUCKET, Key=event['segments_key'], Range=f'bytes={first}-{last}'
        )['Body'].read()
        if len(body) != count * per_window:
            raise SegmentIntegrityError(
                f"windows {start}-{start + count - 1}: read {len(body)} bytes, expected {count * per_window}"
            )
        digest.update(body)
        yield start, reef_audio.decode_segments(body)

    if digest.hexdigest() != info['sidecar']['segments_sha256']:
        raise SegmentIntegrityError("segments sha256 does not match the preprocessing sidecar")


def embed_windows(batches, analysis_id, request_id, total_windows=None):
    """Embed every window batch via the inference Lambda -> float32 (n, EMBEDDING_DIM).

    Each batch is staged in S3 (avoids Lambda's 6 MB payload limit) and sent
    through invoke_inference_batch, which retries transient failures and checks
    that the embeddings line up with the windows (count, length, finite).
    """
    total_batches = (total_windows + BATCH_SIZE - 1) // BATCH_SIZE if total_windows else None
    print(f"Embedding {total_windows} windows in {total_batches} batches")
    parts = []
    for batch_idx, (_, batch) in enumerate(batches):
        batch_key = f'temp/embedding_batches/{analysis_id}_batch{batch_idx}_{uuid.uuid4().hex[:8]}.json'
        s3.put_object(
            Bucket=EMBEDDINGS_BUCKET,
            Key=batch_key,
            Body=json.dumps({'segments': batch.tolist(), 'sample_rate': reef_audio.TARGET_SAMPLE_RATE}),
            ContentType='application/json'
        )
        try:
            parts.append(invoke_inference_batch(
                s3_bucket=EMBEDDINGS_BUCKET,
                s3_key=batch_key,
                batch_idx=batch_idx,
                total_batches=total_batches or batch_idx + 1,
                request_id=request_id,
                expected_count=int(batch.shape[0]),
            ))
        finally:
            try:
                s3.delete_object(Bucket=EMBEDDINGS_BUCKET, Key=batch_key)
            except Exception:
                pass  # Best effort cleanup

    if not parts:
        raise InferenceError(
            "No embeddings generated - inference returned empty results",
            error_type='NO_EMBEDDINGS',
            request_id=request_id
        )
    return np.concatenate(parts, axis=0)


def _check_embeddings(embeddings, expected_count, attempt, request_id):
    """Return a float32 (n, EMBEDDING_DIM) array or raise InferenceError(EMBEDDING_MISMATCH).

    05-RESEARCH Pitfall 5: a response with the wrong number of embeddings would
    silently shift every later window onto the wrong embedding. Count, row
    length and finiteness are all checked; this is not retried.
    """
    def mismatch(message):
        return InferenceError(
            f"Inference response does not match the windows sent: {message}",
            error_type='EMBEDDING_MISMATCH', retry_count=attempt + 1, request_id=request_id,
        )

    if expected_count is not None and len(embeddings) != expected_count:
        raise mismatch(f"{len(embeddings)} embeddings for {expected_count} windows")
    for i, row in enumerate(embeddings):
        if not isinstance(row, (list, tuple)) or len(row) != reef_audio.EMBEDDING_DIM:
            raise mismatch(f"embedding {i} does not have {reef_audio.EMBEDDING_DIM} values")
    try:
        arr = np.asarray(embeddings, dtype=np.float32)
    except (TypeError, ValueError):
        raise mismatch("embeddings contain non-numeric values")
    if not np.isfinite(arr).all():
        raise mismatch("embeddings contain NaN or infinity")
    return arr


def invoke_inference_batch(s3_bucket, s3_key, batch_idx, total_batches, request_id, expected_count=None):
    """
    Invoke inference Lambda for a single batch with retry logic.

    Returns:
        float32 (n, EMBEDDING_DIM) array of embeddings for this batch

    Raises:
        InferenceError: If batch fails after all retries, or the embeddings do
            not line up with the windows sent (EMBEDDING_MISMATCH, not retried)
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
                    return _check_embeddings(embeddings, expected_count, attempt, request_id)
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
        'CLASSIFICATION_FAILED': 'Classification step failed. Please retry.',
        'PREPROCESSING_SPEC_MISMATCH': (
            'This recording was prepared by an earlier version of the analysis pipeline during '
            'an update. Please start the analysis again.'
        ),
        'SEGMENTS_INTEGRITY': (
            'The prepared audio could not be verified (it did not match its checksum or length). '
            'Please start the analysis again.'
        ),
        'EMBEDDING_MISMATCH': (
            'The ML model returned results that do not line up with the audio windows, so no '
            'result was produced. Please retry.'
        ),
    }
    return suggestions.get(error_type, 'An error occurred. Please retry later.')


def validate_model(weights, config):
    """Raise ValueError unless weights and config describe one consistent model.

    Kept for callers and tests that hold a (weights, config) pair; the logic
    lives in reef_reference.validate_model_arrays.
    """
    reef_reference.validate_model_arrays(weights, config)


def get_served_model():
    """The bundled served model (weights verified against their config's sha256).

    Cached for warm invocations; only a successful load is cached. The model
    ships inside the zip with this code (D-03 drift-checked), so a model change
    is a deploy, and rollback is `deploy-lambdas.py --ref`. It is never read
    from the S3 models/ keys.
    """
    global _served_model
    if _served_model is None:
        _served_model = reef_reference.load_served_model()
        print(
            f"Served model loaded: version={_served_model.version}, "
            f"trained under {_served_model.training_spec_version}"
        )
    return _served_model


def class_names(model):
    """Class names in output-column order (idx_to_label is validated to cover 0..K-1)."""
    return [model.idx_to_label[str(i)] for i in range(len(model.idx_to_label))]


def classify_windows(E, model):
    """Per-window class probabilities -> float64 (n, K); each row is a softmax and sums to 1.

    The same forward pass as classify_embedding (1280 -> 256 -> 64 -> K, ReLU),
    batched over the windows. Probabilities are the model's raw output (D-12).
    """
    w = model.weights
    x = np.asarray(E, dtype=np.float32)
    x = np.maximum(0, x @ w['w1'] + w['b1'])
    x = np.maximum(0, x @ w['w2'] + w['b2'])
    logits = (x @ w['w3'] + w['b3']).astype(np.float64)
    exp_logits = np.exp(logits - logits.max(axis=1, keepdims=True))
    return exp_logits / exp_logits.sum(axis=1, keepdims=True)


def aggregate_classification(P, model):
    """Recording-level classification from per-window probabilities (n, K).

    probabilities = column means of the per-window vectors (still a
    distribution: the mean of rows that sum to 1 sums to 1); label = their
    argmax; confidence = their max. The shape is the legacy
    {label, confidence, probabilities, model_version}.
    """
    classes = class_names(model)
    means = np.asarray(P, dtype=np.float64).mean(axis=0)
    pred_idx = int(np.argmax(means))
    probabilities = {cls: float(means[k]) for k, cls in enumerate(classes)}

    total = sum(probabilities.values())
    if abs(total - 1.0) > 1e-6:
        raise ValueError(f"classifier probabilities sum to {total}, expected 1")

    return {
        'label': classes[pred_idx],
        'confidence': float(means[pred_idx]),
        'probabilities': probabilities,
        'model_version': model.config.get('version', 'unknown'),
    }


def build_windows_block(P, model, sidecar, similarities=None, nearest_site=None):
    """The additive `windows` block: column-wise per-window data (contract analysis-result $defs/windows).

    `similarities` (n rows of one cosine per reference site, columns in
    site_similarities.site_order) and `nearest_site` are added when the
    reference set was available.
    """
    classes = class_names(model)
    P = np.asarray(P, dtype=np.float64)
    n = int(P.shape[0])
    levels = sidecar['levels']
    block = {
        'count': n,
        'window_s': float(reef_audio.WINDOW_S),
        'index': list(range(n)),
        'start_s': [float(i * reef_audio.WINDOW_S) for i in range(n)],
        'classes': classes,
        'probabilities': {cls: P[:, k].tolist() for k, cls in enumerate(classes)},
        'label': [classes[int(i)] for i in P.argmax(axis=1)],
        'peak_dbfs': [float(v) for v in levels['peak_dbfs']],
        'rms_dbfs': [float(v) for v in levels['rms_dbfs']],
        'silent': [bool(v) for v in levels['silent']],
    }
    if similarities is not None:
        block['similarities'] = np.asarray(similarities, dtype=np.float64).tolist()
    if nearest_site is not None:
        block['nearest_site'] = list(nearest_site)
    return block


def build_input_audio_block(sidecar):
    """The additive `input_audio` block: what the upload was and which spec prepared it."""
    source = sidecar['input']
    return {
        'sample_rate_hz': int(source['sample_rate_hz']),
        'channels': int(source['channels']),
        'bits_per_sample': int(source['bits_per_sample']),
        'encoding': source['encoding'],
        'duration_s': float(source['duration_s']),
        'windows': int(sidecar['num_windows']),
        'dropped_tail_s': float(sidecar['dropped_tail_s']),
        'preprocessing_spec_version': sidecar['spec_version'],
    }


def classify_embedding(embedding, model=None):
    """
    Classify ONE embedding vector with the served MLP (single-vector reference path).

    Production classifies windows with classify_windows; this keeps the
    original independent single-vector forward pass as the cross-check the
    tests compare it against. `model` may be a (weights, config) tuple.
    """
    if model is None:
        served = get_served_model()
        weights, config = served.weights, served.config
    else:
        weights, config = model

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



def get_contract_stamp():
    """Load and cache the bundled version stamp (contract_stamp.json).

    Raises if the bundled file is missing or unreadable; the caller decides
    how to degrade. Only a successful load is cached, so a transient problem
    is retried on the next invocation.
    """
    global _contract_stamp
    if _contract_stamp is None:
        _contract_stamp = load_stamp()
    return _contract_stamp


STAMP_STATUS_STAMPED = 'stamped'
STAMP_STATUS_UNCOVERED = 'uncovered'
STAMP_STATUS_LOAD_FAILED = 'load_failed'


def _emit_stamp_metric(status, model_version):
    """CR-01: make an unstamped result observable in CloudWatch without failing it.

    One CloudWatch Embedded Metric Format log line (metric ContractStampStatus
    in namespace ReefRadar/Classifier, dimension Status) so an uncovered model
    or a stamp-load failure can be graphed and alarmed on; plain log text
    elsewhere is unaffected. Only emitted for non-stamped outcomes.
    """
    try:
        print(json.dumps({
            '_aws': {
                'Timestamp': int(time.time() * 1000),
                'CloudWatchMetrics': [{
                    'Namespace': 'ReefRadar/Classifier',
                    'Dimensions': [['Status']],
                    'Metrics': [{'Name': 'UnstampedResults', 'Unit': 'Count'}],
                }],
            },
            'Status': status,
            'UnstampedResults': 1,
            'model_version': model_version,
        }))
    except Exception:
        pass  # observability must never fail an analysis


def result_version_stamp(loaded_model_version, windows_spec_version=None):
    """CONTRACT-04: the four version keys plus `stamp_status` for a new RESULT item.

    `windows_spec_version` is the preprocessing spec the windows were prepared
    under (from the sidecar); a result is stamped only when the loaded model,
    reef_audio.SPEC_VERSION and the windows' spec all match the bundled stamp.

    `stamp_status` (CR-01) tells a post-contract result apart from a legacy one:
      - 'stamped':     the loaded model is the one the bundled stamp covers
      - 'uncovered':   a different model is running than the bundled stamp
                       covers; model_version is still the running model's own
      - 'load_failed': the bundled stamp could not be loaded (a packaging
                       defect); model_version is still the running model's own

    A stamp that cannot be loaded must not fail the analysis, so it is logged,
    counted in CloudWatch, and the three contract keys are written as null.
    model_version does not depend on the stamp file, so it is still reported.
    Legacy results (written before stamping) carry none of these keys.
    """
    try:
        stamp = stamp_for_model(
            loaded_model_version, get_contract_stamp(), windows_spec_version=windows_spec_version
        )
    except Exception as e:
        print(f"ERROR could not load the bundled contract stamp: {type(e).__name__}: {e}")
        _emit_stamp_metric(STAMP_STATUS_LOAD_FAILED, loaded_model_version)
        out = {key: None for key in STAMP_KEYS}
        out['model_version'] = loaded_model_version
        out['stamp_status'] = STAMP_STATUS_LOAD_FAILED
        return out

    if stamp.get('contract_version') is None:
        _emit_stamp_metric(STAMP_STATUS_UNCOVERED, loaded_model_version)
        stamp['stamp_status'] = STAMP_STATUS_UNCOVERED
    else:
        stamp['stamp_status'] = STAMP_STATUS_STAMPED
    return stamp



# --- context for every analysis: similarity to the reference sites (plan 05-10) ----

SIMILARITY_UNAVAILABLE_NOTE = 'Reference embeddings could not be loaded, so similar-site comparison is unavailable.'

SITE_SIMILARITIES_NOTE = (
    'Scores compare this recording\'s windows (prepared by the current preprocessing) with reference '
    'vectors that were made by the earlier preprocessing, so they are not a like-for-like comparison '
    'until the reference vectors are re-embedded. Each score is the mean of the per-window cosine '
    'similarities; the windows are never averaged into one vector first.'
)


def get_reference_set():
    """The bundled, hash-verified contract reference set (embeddings, sites, projection).

    Cached for warm invocations; only a successful load is cached, so a transient
    problem is retried on the next invocation. Raises ReferenceDataError.
    """
    global _reference_set
    if _reference_set is None:
        _reference_set = reef_reference.load_reference_set()
        print(
            f"Reference set loaded: contract v{_reference_set.contract_version}, "
            f"{len(_reference_set.row_site_ids)} sites with embeddings"
        )
    return _reference_set


def _emit_context_unavailable_metric(block, reason):
    """Make an omitted context block observable in CloudWatch without failing the analysis.

    One CloudWatch Embedded Metric Format log line (metric ContextUnavailable in
    namespace ReefRadar/Classifier, dimension Block), the same pattern as
    _emit_stamp_metric.
    """
    try:
        print(json.dumps({
            '_aws': {
                'Timestamp': int(time.time() * 1000),
                'CloudWatchMetrics': [{
                    'Namespace': 'ReefRadar/Classifier',
                    'Dimensions': [['Block']],
                    'Metrics': [{'Name': 'ContextUnavailable', 'Unit': 'Count'}],
                }],
            },
            'Block': block,
            'ContextUnavailable': 1,
            'reason': str(reason)[:200],
        }))
    except Exception:
        pass  # observability must never fail an analysis


def _normalise_rows(a):
    """Row-normalise to unit length in float64; an all-zero row stays zero (cosine 0)."""
    a = np.atleast_2d(np.asarray(a, dtype=np.float64))
    norms = np.linalg.norm(a, axis=1, keepdims=True)
    return np.divide(a, norms, out=np.zeros_like(a), where=norms > 0)


def window_similarities(E, ref):
    """Cosine similarity of every window to every acoustic reference site -> float64 (n, sites).

    Columns follow ref.row_site_ids. Rows are normalised once and one matrix
    product gives all the cosines; the windows are never pooled first.
    """
    S = _normalise_rows(E) @ _normalise_rows(ref.matrix).T
    return np.clip(S, -1.0, 1.0)


def build_site_similarities(S, ref):
    """The additive `site_similarities` block (contract analysis-result $defs/site_similarities).

    A site's score is the mean over windows of its per-window cosines; rank 1 is
    the highest score, ties broken by row order. The location-only sites are
    listed after the scored ones with has_embedding false and no similarity or
    rank: they have no embedding, so nothing is invented for them.
    """
    scores = np.asarray(S, dtype=np.float64).mean(axis=0)
    order = np.argsort(-scores, kind='stable')
    rank = np.empty(len(scores), dtype=int)
    rank[order] = np.arange(1, len(scores) + 1)
    sites = [
        {'site_id': site_id, 'has_embedding': True, 'similarity': float(scores[i]), 'rank': int(rank[i])}
        for i, site_id in enumerate(ref.row_site_ids)
    ]
    sites += [
        {'site_id': site_id, 'has_embedding': False, 'similarity': None, 'rank': None}
        for site_id in ref.location_only_ids
    ]
    return {
        'metric': 'cosine',
        'aggregation': 'mean_of_window_cosines',
        'contract_version': int(ref.contract_version),
        'dataset_version': ref.dataset_version,
        'site_order': list(ref.row_site_ids),
        'sites': sites,
        'note': SITE_SIMILARITIES_NOTE,
    }


def top3_similar_sites(scores, ref, top_k=3):
    """The legacy `similar_sites` list: the top_k sites in exactly the old entry shape.

    Entries are {site_id, similarity, country, status, label_source,
    label_source_name, label_original}, read from the bundled contract site
    records (which already carry the label provenance, D-17): label_source is the
    site's dataset_id and status is never invented here.
    """
    scores = np.asarray(scores, dtype=np.float64)
    entries = []
    for i in np.argsort(-scores, kind='stable')[:top_k]:
        site = ref.sites[ref.row_site_ids[int(i)]]
        entries.append({
            'site_id': site['site_id'],
            'similarity': float(scores[int(i)]),
            'country': site.get('country', 'Unknown'),
            'status': site.get('status'),
            'label_source': site.get('dataset_id'),
            'label_source_name': site.get('label_source_name'),
            'label_original': site.get('label_original'),
        })
    return entries


def compute_similarity_context(embeddings):
    """Similarity of the windows to the reference sites.

    Returns a dict with similar_sites, similar_sites_error (None when it worked),
    site_similarities, window_similarities and nearest_site (the last three None
    when the reference set is unavailable). A failure is logged and counted,
    never raised: classification does not depend on it.
    """
    try:
        ref = get_reference_set()
        S = window_similarities(embeddings, ref)
        scores = S.mean(axis=0)
        return {
            'similar_sites': top3_similar_sites(scores, ref),
            'similar_sites_error': None,
            'site_similarities': build_site_similarities(S, ref),
            'window_similarities': S,
            'nearest_site': [ref.row_site_ids[int(j)] for j in S.argmax(axis=1)],
            'reference': ref,
        }
    except Exception as e:
        print(f"ERROR similar sites: {type(e).__name__}: {e}")
        _emit_context_unavailable_metric('similarity', f"{type(e).__name__}: {e}")
        return {
            'similar_sites': [],
            'similar_sites_error': SIMILARITY_UNAVAILABLE_NOTE,
            'site_similarities': None,
            'window_similarities': None,
            'nearest_site': None,
            'reference': None,
        }
