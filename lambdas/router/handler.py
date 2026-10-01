"""
API Gateway router - handles incoming requests and routes to appropriate functions.
"""

import json
import boto3
import uuid
from datetime import datetime
from decimal import Decimal
import base64
import os
import re
from urllib.parse import unquote
from site_provenance import load_provenance, apply_label_provenance


class DecimalEncoder(json.JSONEncoder):
    """JSON encoder that handles Decimal types from DynamoDB."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

# Real upload ceiling. API Gateway passes the binary body to this Lambda
# base64-encoded (x 4/3) inside a synchronous invocation event capped at 6 MB,
# so 4 MiB of WAV (~5.6 MB of event) is the largest size that reliably gets here.
# Larger bodies are rejected by the platform before any code runs, with a
# non-JSON error. Keep in sync with MAX_UPLOAD_BYTES in dashboard-next/src/lib/utils.ts.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024

AUDIO_BUCKET = os.environ.get('AUDIO_BUCKET')
EMBEDDINGS_BUCKET = os.environ.get('EMBEDDINGS_BUCKET')
METADATA_TABLE = os.environ.get('METADATA_TABLE')
PREPROCESSOR_FUNCTION = os.environ.get('PREPROCESSOR_FUNCTION')

# Caches for warm Lambda invocations
_label_provenance = None
_audio_manifest = None


def get_label_provenance():
    """Load and cache data/site-label-provenance.json (or bundled copy).

    D-17: single place that decides which dataset assigned a reference
    site's label and what that label actually means, so /sites can never
    invent a health status for a non-MARRS site. Mirrors
    lambdas/classifier/handler.py's identically-named helper.
    """
    global _label_provenance
    if _label_provenance is None:
        _label_provenance = load_provenance()
    return _label_provenance


def handler(event, context):
    """Main Lambda handler."""
    http_method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')
    path = event.get('rawPath', '/')

    # Strip stage name from path (e.g., /prod/health -> /health)
    stage = event.get('requestContext', {}).get('stage', '')
    if stage and path.startswith(f'/{stage}'):
        path = path[len(f'/{stage}'):]
    if not path:
        path = '/'

    # CORS preflight. The API's single $default route forwards OPTIONS here, so
    # API Gateway's own CORS config never answers it; without this the browser
    # blocks every POST /upload and /analyze from the dashboard.
    if http_method == 'OPTIONS':
        preflight = response(204, {})
        preflight['body'] = ''
        preflight['headers']['Access-Control-Max-Age'] = '600'
        return preflight

    routes = {
        ('POST', '/upload'): handle_upload,
        ('POST', '/analyze'): handle_analyze,
        ('GET', '/sites'): handle_get_sites,
        ('GET', '/samples'): handle_get_samples,
        ('GET', '/health'): handle_health,
    }

    # Check for status endpoint (has path parameter)
    if path.startswith('/status/') and http_method == 'GET':
        analysis_id = path.split('/')[-1]
        return handle_status(analysis_id)

    # Check for visualize endpoint (has path parameter)
    if path.startswith('/visualize/') and http_method == 'GET':
        analysis_id = path.split('/')[-1]
        return handle_visualize(analysis_id)

    # Check for results endpoint (alternate name for visualize)
    if path.startswith('/results/') and http_method == 'GET':
        analysis_id = path.split('/')[-1]
        return handle_visualize(analysis_id)

    handler_func = routes.get((http_method, path))
    if handler_func:
        return handler_func(event)

    return response(404, {'error': {'code': 'NOT_FOUND', 'message': f'Unknown route: {http_method} {path}'}})


def sanitize_filename(name, default):
    """Client-controlled file name -> safe S3 key component.

    Drops any directory part (so a client cannot create sub-prefixes that
    downstream code may basename), keeps only [A-Za-z0-9._-], caps the length
    at 100 and never returns an empty / dot-only name.
    """
    base = (name or '').replace('\\', '/').rsplit('/', 1)[-1]
    cleaned = re.sub(r'[^A-Za-z0-9._-]', '_', base)[:100].lstrip('.')
    return cleaned or default


def handle_upload(event):
    """Handle audio file upload."""
    try:
        is_base64 = event.get('isBase64Encoded', False)
        body = event.get('body', '')

        if is_base64:
            file_content = base64.b64decode(body)
        else:
            file_content = body.encode() if isinstance(body, str) else body

        # Validate file: minimum size (WAV header is 44 bytes)
        if len(file_content) < 44:
            return response(400, {
                'error': {
                    'code': 'FILE_TOO_SMALL',
                    'message': 'File is too small to be a valid audio file'
                }
            })

        # Validate WAV magic bytes: RIFF header (bytes 0-3) and WAVE format (bytes 8-11)
        if file_content[:4] != b'RIFF' or file_content[8:12] != b'WAVE':
            return response(400, {
                'error': {
                    'code': 'INVALID_AUDIO_FORMAT',
                    'message': 'File does not appear to be a WAV file. Please upload a standard WAV audio file.'
                }
            })

        # Validate file size (see MAX_UPLOAD_BYTES)
        if len(file_content) > MAX_UPLOAD_BYTES:
            return response(400, {
                'error': {
                    'code': 'FILE_TOO_LARGE',
                    'message': f'File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit'
                }
            })

        upload_id = str(uuid.uuid4())
        headers = event.get('headers', {})
        content_type = headers.get('content-type', 'audio/wav')
        # The client percent-encodes X-Filename (HTTP headers are Latin-1 only).
        filename = sanitize_filename(
            unquote(headers.get('x-filename') or ''), f'upload_{upload_id}.wav'
        )

        # Upload to S3
        s3_key = f'uploads/{upload_id}/{filename}'
        s3.put_object(
            Bucket=AUDIO_BUCKET,
            Key=s3_key,
            Body=file_content,
            ContentType=content_type
        )

        # Store metadata
        table = dynamodb.Table(METADATA_TABLE)
        table.put_item(Item={
            'pk': f'UPLOAD#{upload_id}',
            'sk': 'METADATA',
            'upload_id': upload_id,
            'filename': filename,
            's3_key': s3_key,
            'size_bytes': len(file_content),
            'content_type': content_type,
            'status': 'uploaded',
            'created_at': datetime.utcnow().isoformat(),
        })

        return response(200, {
            'upload_id': upload_id,
            'filename': filename,
            's3_key': s3_key,
            'size_bytes': len(file_content),
            'status': 'uploaded'
        })

    except Exception as e:
        return response(500, {'error': {'code': 'UPLOAD_FAILED', 'message': str(e)}})


def handle_analyze(event):
    """Trigger analysis of uploaded audio."""
    try:
        body = json.loads(event.get('body', '{}'))
        upload_id = body.get('upload_id')
        latitude = body.get('latitude')
        longitude = body.get('longitude')

        if not upload_id:
            return response(400, {'error': {'code': 'MISSING_UPLOAD_ID', 'message': 'upload_id is required'}})

        table = dynamodb.Table(METADATA_TABLE)
        result = table.get_item(Key={'pk': f'UPLOAD#{upload_id}', 'sk': 'METADATA'})

        if 'Item' not in result:
            return response(404, {'error': {'code': 'UPLOAD_NOT_FOUND', 'message': f'No upload found with ID: {upload_id}'}})

        upload_item = result['Item']
        analysis_id = str(uuid.uuid4())

        # Write the records FIRST: if a record write fails after the pipeline was
        # started there would be a pipeline run with no record, the client would
        # get a 500, retry, and create duplicate analyses.
        table.put_item(Item={
            'pk': f'ANALYSIS#{analysis_id}',
            'sk': 'METADATA',
            'upload_id': upload_id,
            'analysis_id': analysis_id,
            'status': 'processing',
            'stage': 'preprocessing',
            'created_at': datetime.utcnow().isoformat(),
        })

        # Update upload status
        table.update_item(
            Key={'pk': f'UPLOAD#{upload_id}', 'sk': 'METADATA'},
            UpdateExpression='SET #status = :status, analysis_id = :aid',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':status': 'processing', ':aid': analysis_id}
        )

        # Invoke preprocessor asynchronously
        preprocess_payload = {
            'upload_id': upload_id,
            'analysis_id': analysis_id,
            's3_key': upload_item['s3_key']
        }
        if latitude is not None:
            preprocess_payload['latitude'] = latitude
        if longitude is not None:
            preprocess_payload['longitude'] = longitude

        try:
            lambda_client.invoke(
                FunctionName=PREPROCESSOR_FUNCTION,
                InvocationType='Event',
                Payload=json.dumps(preprocess_payload)
            )
        except Exception as invoke_err:
            # The pipeline never started: record a terminal ERROR so /status and
            # /visualize report it instead of "processing" forever.
            print(f"ERROR /analyze: could not start preprocessor ({type(invoke_err).__name__})")
            table.put_item(Item={
                'pk': f'ANALYSIS#{analysis_id}',
                'sk': 'ERROR',
                'upload_id': upload_id,
                'error_code': 'PIPELINE_START_FAILED',
                'error': 'The analysis pipeline could not be started.',
                'status': 'failed',
                'stage': 'preprocessing',
                'suggestion': 'Please retry the analysis.',
                'timestamp': datetime.utcnow().isoformat(),
            })
            return response(500, {'error': {'code': 'ANALYZE_FAILED', 'message': 'The analysis pipeline could not be started'}})

        return response(202, {
            'analysis_id': analysis_id,
            'upload_id': upload_id,
            'status': 'processing',
            'message': 'Analysis started. Poll GET /visualize/{analysis_id} for results.'
        })

    except Exception as e:
        return response(500, {'error': {'code': 'ANALYZE_FAILED', 'message': str(e)}})


def handle_get_sites(event):
    """Return list of reference sites from S3 metadata.

    Never fabricates data: if the reference metadata cannot be loaded or
    parsed the route returns 503 SITES_UNAVAILABLE instead of a hard-coded
    list with HTTP 200 (every UI count is derived from this response, so a
    silent fallback would show "4 sites" as truth). A single malformed site
    record is skipped and reported in `skipped_sites` rather than taking the
    whole response down.
    """
    try:
        # Try loading v6 metadata first, then v5, then legacy metadata.json
        metadata = None
        for key in ['reference/metadata_v6.json', 'reference/metadata_v5.json', 'reference/metadata.json']:
            try:
                s3_response = s3.get_object(Bucket=EMBEDDINGS_BUCKET, Key=key)
                metadata = json.loads(s3_response['Body'].read().decode())
                break
            except Exception:
                continue

        if metadata is None:
            raise RuntimeError('Could not load metadata from S3')

        # Handle new format (v2.0+) with 'sites' key
        if isinstance(metadata, dict) and 'sites' in metadata:
            raw_sites = metadata['sites']
        elif isinstance(metadata, list):
            raw_sites = metadata
        else:
            raw_sites = []
        meta = metadata if isinstance(metadata, dict) else {}

        # Check for ?has_embedding=true query parameter
        query_params = event.get('queryStringParameters') or {}
        filter_has_embedding = query_params.get('has_embedding')

        # Extract only the fields needed for the API response (exclude large embeddings)
        prov = get_label_provenance()
        sites = []
        skipped_sites = []
        for site in raw_sites:
            has_embedding = site.get('has_embedding', True)

            # Apply has_embedding filter if specified
            if filter_has_embedding is not None:
                filter_val = filter_has_embedding.lower() == 'true'
                if has_embedding != filter_val:
                    continue

            site_record = {
                'site_id': site.get('site_id'),
                'country': site.get('country'),
                'region': site.get('region'),
                'status': site.get('status'),
                'latitude': site.get('latitude'),
                'longitude': site.get('longitude'),
                'has_embedding': has_embedding,
                'source': site.get('source', 'MARRS'),
                'synthetic': site.get('synthetic', False)
            }
            # D-17: overlay label provenance (label_source, label_original,
            # label_definition, label_assigned_by, status_basis, period,
            # label_note) on every site record.
            try:
                sites.append(apply_label_provenance(site_record, prov))
            except (KeyError, AttributeError, TypeError) as site_err:
                # Never present a site without provenance; never hide that it
                # was dropped either.
                print(f"WARN /sites: skipping site {site.get('site_id')!r}: {type(site_err).__name__}")
                skipped_sites.append(site.get('site_id'))

        # Include metadata-level counts for the full dataset
        total_all_sites = len(raw_sites)
        sites_with_embeddings = meta.get('sites_with_embeddings',
            sum(1 for s in raw_sites if s.get('has_embedding', True)))

        body = {
            'sites': sites,
            'total_sites': len(sites),
            'total_all_sites': total_all_sites,
            'sites_with_embeddings': sites_with_embeddings,
            'countries': sorted(set(s['country'] for s in sites if s.get('country'))),
            'version': meta.get('version', '1.0'),
            'source': meta.get('source', 'Unknown'),
            'notes': meta.get('notes', '')
        }
        if skipped_sites:
            body['skipped_sites'] = skipped_sites
        return response(200, body)
    except Exception as e:
        print(f"ERROR /sites: {type(e).__name__}: {e}")
        return response(503, {
            'error': {
                'code': 'SITES_UNAVAILABLE',
                'message': 'Reference site list is temporarily unavailable.'
            }
        })


def get_audio_manifest():
    """Load and cache data/audio-manifest.json (or bundled copy).

    D-05/D-09: single source for the sample gallery -- real MARRS
    excerpts only, served from committed, git-tracked data instead of
    the old static CURATED_SAMPLES catalog (recovered in plan 01-09).
    Prefers audio_manifest.json bundled next to this module (the Lambda
    package layout this plan produces) and falls back to the repository
    file resolved relative to this module, so tests (repo checkout) and
    deployed Lambdas (bundled copy) share the same loading code path --
    mirrors site_provenance.load_provenance()'s identical strategy.
    """
    global _audio_manifest
    if _audio_manifest is None:
        module_dir = os.path.dirname(os.path.abspath(__file__))
        bundled_path = os.path.join(module_dir, 'audio_manifest.json')
        if os.path.exists(bundled_path):
            path = bundled_path
        else:
            path = os.path.join(module_dir, '..', '..', 'data', 'audio-manifest.json')
        with open(path, 'r', encoding='utf-8') as f:
            _audio_manifest = json.load(f)
    return _audio_manifest


def handle_get_samples(event):
    """Return the real-audio sample gallery with pre-signed S3 URLs (D-05/D-09).

    Every sample is a real MARRS excerpt from the committed audio
    manifest -- no synthetic clips, no sites outside the reference
    dataset. Audio URLs are presigned GETs for
    s3://{AUDIO_BUCKET}/samples/marrs/<excerpt file name> (the S3
    objects themselves are uploaded by plan 01-14 before this code is
    deployed).
    """
    try:
        manifest = get_audio_manifest()
    except Exception as e:
        return response(500, {
            'error': {
                'code': 'SAMPLES_UNAVAILABLE',
                'message': f'Audio manifest unavailable: {str(e)}'
            }
        })

    try:
        gallery = manifest.get('gallery', {})
        samples = []
        for sample in gallery.get('samples', []):
            file_name = os.path.basename(sample['audio_path'])
            audio_url = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': AUDIO_BUCKET, 'Key': f'samples/marrs/{file_name}'},
                ExpiresIn=3600,
            )
            samples.append({
                'id': sample['id'],
                'site_id': sample['site_id'],
                'name': sample['name'],
                'country': sample['country'],
                'country_code': sample['country_code'],
                'category': sample['category'],
                'description': sample['description'],
                'duration_seconds': sample['duration_seconds'],
                'audio_url': audio_url,
                'frequency_highlights': sample.get('frequency_highlights', []),
                'coordinates': sample['coordinates'],
                'attribution': sample['attribution'],
            })

        return response(200, {
            'samples': samples,
            'stories': gallery.get('stories', {}),
        })
    except Exception as e:
        return response(500, {'error': {'code': 'SAMPLES_FAILED', 'message': str(e)}})


def handle_visualize(analysis_id):
    """Return visualization data for an analysis."""
    try:
        table = dynamodb.Table(METADATA_TABLE)
        result = table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'RESULT'})

        if 'Item' not in result:
            # Check for errors FIRST (mirrors handle_status): classifier failures
            # happen after the PREPROCESSED item exists, so checking
            # PREPROCESSED first reported them as "processing" forever.
            error_result = table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'ERROR'})
            if 'Item' in error_result:
                error_item = error_result['Item']
                return response(200, {
                    'analysis_id': analysis_id,
                    'status': 'failed',
                    'error': {
                        'code': error_item.get('error_code', 'UNKNOWN_ERROR'),
                        'message': error_item.get('error', 'An unknown error occurred'),
                        'stage': error_item.get('stage', 'unknown'),
                        'suggestion': error_item.get('suggestion', 'Please retry the analysis'),
                        'request_id': error_item.get('request_id'),
                        'retry_count': error_item.get('retry_count', 0)
                    }
                })

            # Still processing: preprocessed, or the analysis record exists but
            # preprocessing has not finished yet.
            for sk in ('PREPROCESSED', 'METADATA'):
                progress_result = table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': sk})
                if 'Item' in progress_result:
                    return response(200, {'analysis_id': analysis_id, 'status': 'processing'})

            return response(404, {'error': {'code': 'ANALYSIS_NOT_FOUND', 'message': f'No analysis found with ID: {analysis_id}'}})

        item = result['Item']
        # CONTRACT-04 version stamps. Results written before the stamps existed
        # have none of the four keys and return null ("pre-contract"). DynamoDB
        # numbers are Decimal and DecimalEncoder emits float, so cast
        # contract_version to int or it would serialise as 1.0.
        contract_version = item.get('contract_version')
        return response(200, {
            'analysis_id': analysis_id,
            'status': 'complete',
            'contract_version': int(contract_version) if contract_version is not None else None,
            'dataset_version': item.get('dataset_version'),
            'model_version': item.get('model_version'),
            'preprocessing_spec_version': item.get('preprocessing_spec_version'),
            'classification': item.get('classification', {}),
            'similar_sites': item.get('similar_sites', []),
            'similar_sites_error': item.get('similar_sites_error'),
            'visualization': item.get('visualization', {}),
            'embedding_summary': item.get('embedding_summary', {}),
            'caveats': item.get('caveats', '')
        })

    except Exception as e:
        return response(500, {'error': {'code': 'VISUALIZE_FAILED', 'message': str(e)}})


def handle_status(analysis_id):
    """Get detailed processing status for an analysis."""
    try:
        table = dynamodb.Table(METADATA_TABLE)

        # Check for completed result
        result = table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'RESULT'})
        if 'Item' in result:
            return response(200, {
                'analysis_id': analysis_id,
                'stage': 'complete',
                'status': 'complete',
                'completed_at': result['Item'].get('completed_at')
            })

        # Check for error
        error_result = table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'ERROR'})
        if 'Item' in error_result:
            item = error_result['Item']
            return response(200, {
                'analysis_id': analysis_id,
                'stage': item.get('stage', 'unknown'),
                'status': 'failed',
                'error': {
                    'code': item.get('error_code', 'UNKNOWN_ERROR'),
                    'message': item.get('error', 'An unknown error occurred'),
                    'suggestion': item.get('suggestion', 'Please retry the analysis')
                }
            })

        # Check for preprocessed (in classification stage)
        preprocess_result = table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'PREPROCESSED'})
        if 'Item' in preprocess_result:
            item = preprocess_result['Item']
            return response(200, {
                'analysis_id': analysis_id,
                'stage': 'classifying',
                'status': 'processing',
                'progress': f'Classifying {item.get("num_segments", "?")} audio segments'
            })

        # Check for metadata record (analysis just started, still in early preprocessing)
        metadata_result = table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'METADATA'})
        if 'Item' in metadata_result:
            return response(200, {
                'analysis_id': analysis_id,
                'stage': 'preprocessing',
                'status': 'processing',
                'progress': 'Processing audio file'
            })

        # No records found at all — analysis does not exist
        return response(404, {
            'error': {
                'code': 'ANALYSIS_NOT_FOUND',
                'message': f'No analysis found with ID: {analysis_id}'
            }
        })

    except Exception as e:
        return response(500, {'error': {'code': 'STATUS_FAILED', 'message': str(e)}})


def handle_health(event):
    """Health check endpoint."""
    return response(200, {'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})


def response(status_code, body):
    """Create HTTP response."""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Filename'
        },
        'body': json.dumps(body, cls=DecimalEncoder)
    }
