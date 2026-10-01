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

        # Validate file size (50MB max)
        if len(file_content) > 50 * 1024 * 1024:
            return response(400, {
                'error': {
                    'code': 'FILE_TOO_LARGE',
                    'message': 'File exceeds 50MB limit'
                }
            })

        upload_id = str(uuid.uuid4())
        headers = event.get('headers', {})
        content_type = headers.get('content-type', 'audio/wav')
        filename = headers.get('x-filename', f'upload_{upload_id}.wav')

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

        lambda_client.invoke(
            FunctionName=PREPROCESSOR_FUNCTION,
            InvocationType='Event',
            Payload=json.dumps(preprocess_payload)
        )

        # Create analysis metadata record (enables /status lookups immediately)
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

        return response(202, {
            'analysis_id': analysis_id,
            'upload_id': upload_id,
            'status': 'processing',
            'message': 'Analysis started. Poll GET /visualize/{analysis_id} for results.'
        })

    except Exception as e:
        return response(500, {'error': {'code': 'ANALYZE_FAILED', 'message': str(e)}})


def handle_get_sites(event):
    """Return list of reference sites from S3 metadata."""
    try:
        # Try loading v5 metadata first, fall back to legacy metadata.json
        metadata = None
        for key in ['reference/metadata_v6.json', 'reference/metadata_v5.json', 'reference/metadata.json']:
            try:
                s3_response = s3.get_object(Bucket=EMBEDDINGS_BUCKET, Key=key)
                metadata = json.loads(s3_response['Body'].read().decode())
                break
            except Exception:
                continue

        if metadata is None:
            raise Exception('Could not load metadata from S3')

        # Handle new format (v2.0+) with 'sites' key
        if isinstance(metadata, dict) and 'sites' in metadata:
            raw_sites = metadata['sites']
        elif isinstance(metadata, list):
            raw_sites = metadata
        else:
            raw_sites = []

        # Check for ?has_embedding=true query parameter
        query_params = event.get('queryStringParameters') or {}
        filter_has_embedding = query_params.get('has_embedding')

        # Extract only the fields needed for the API response (exclude large embeddings)
        prov = get_label_provenance()
        sites = []
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
            sites.append(apply_label_provenance(site_record, prov))

        # Include metadata-level counts for the full dataset
        total_all_sites = len(raw_sites)
        sites_with_embeddings = metadata.get('sites_with_embeddings',
            sum(1 for s in raw_sites if s.get('has_embedding', True)))

        return response(200, {
            'sites': sites,
            'total_sites': len(sites),
            'total_all_sites': total_all_sites,
            'sites_with_embeddings': sites_with_embeddings,
            'countries': list(set(s['country'] for s in sites)),
            'version': metadata.get('version', '1.0') if isinstance(metadata, dict) else '1.0',
            'source': metadata.get('source', 'Unknown') if isinstance(metadata, dict) else 'Unknown',
            'notes': metadata.get('notes', '') if isinstance(metadata, dict) else ''
        })
    except Exception as e:
        # Fallback to hardcoded minimal list if S3 fails. Still carries the
        # same label provenance as the main path (D-17) -- the fallback is
        # a reduced site list, not a different truth-telling contract.
        prov = get_label_provenance()
        sites = [
            apply_label_provenance(s, prov) for s in [
                {'site_id': 'ind_H4', 'country': 'Indonesia', 'status': 'healthy', 'has_embedding': True, 'synthetic': False},
                {'site_id': 'ind_H5', 'country': 'Indonesia', 'status': 'healthy', 'has_embedding': True, 'synthetic': False},
                {'site_id': 'ken_H1', 'country': 'Kenya', 'status': 'healthy', 'has_embedding': True, 'synthetic': False},
                {'site_id': 'ind_N1', 'country': 'Indonesia', 'status': 'restored_early', 'has_embedding': True, 'synthetic': False},
            ]
        ]
        return response(200, {
            'sites': sites,
            'total_sites': len(sites),
            'total_all_sites': len(sites),
            'sites_with_embeddings': len(sites),
            'countries': list(set(s['country'] for s in sites)),
            'error_note': f'Loaded from fallback: {str(e)}'
        })


CURATED_SAMPLES = [
    {
        'id': 'idn_healthy_dawn',
        'site_id': 'ind_H1',
        'name': 'Dawn Chorus, Sulawesi',
        'country': 'Indonesia',
        'country_code': 'IDN',
        'category': 'healthy',
        'stories': ['healthy_vs_degraded', 'restoration_timeline', 'geographic_diversity'],
        'description': 'A thriving reef at sunrise \u2014 fish calls, snapping shrimp, and parrotfish grazing.',
        'duration_seconds': 30,
        's3_key': 'samples/idn_healthy_dawn.wav',
        'frequency_highlights': ['Fish chorus (200\u20132000 Hz)', 'Snapping shrimp (2\u201320 kHz)'],
        'coordinates': {'lat': -4.9216, 'lng': 119.316922},
    },
    {
        'id': 'aus_degraded_reef',
        'site_id': 'aus_D1',
        'name': 'Silent Reef, Great Barrier Reef',
        'country': 'Australia',
        'country_code': 'AUS',
        'category': 'degraded',
        'stories': ['healthy_vs_degraded', 'restoration_timeline'],
        'description': 'A bleached reef \u2014 sparse clicks, almost no fish chorus. The sound of absence.',
        'duration_seconds': 30,
        's3_key': 'samples/aus_degraded_reef.wav',
        'frequency_highlights': ['Sparse clicks (2\u20135 kHz)', 'Background noise dominates'],
        'coordinates': {'lat': -16.84732, 'lng': 146.22907},
    },
    {
        'id': 'idn_restored_mid',
        'site_id': 'ind_R1',
        'name': 'Reef Restoration Site, Sulawesi',
        'country': 'Indonesia',
        'country_code': 'IDN',
        'category': 'restored_mid',
        'stories': ['restoration_timeline'],
        'description': 'Two years into restoration \u2014 fish are returning, shrimp populations rebuilding.',
        'duration_seconds': 30,
        's3_key': 'samples/idn_restored_mid.wav',
        'frequency_highlights': ['Emerging fish calls (500\u20131500 Hz)', 'Growing shrimp activity'],
        'coordinates': {'lat': -4.922214, 'lng': 119.317036},
    },
    {
        'id': 'aus_healthy_gbr',
        'site_id': 'aus_H1',
        'name': 'Healthy Reef, Great Barrier Reef',
        'country': 'Australia',
        'country_code': 'AUS',
        'category': 'healthy',
        'stories': ['geographic_diversity'],
        'description': 'Dense acoustic landscape on Australia\'s iconic reef \u2014 constant biological activity.',
        'duration_seconds': 30,
        's3_key': 'samples/aus_healthy_gbr.wav',
        'frequency_highlights': ['Fish chorus (200\u20132000 Hz)', 'Reef invertebrates (3\u201315 kHz)'],
        'coordinates': {'lat': -16.84761, 'lng': 146.22839},
    },
    {
        'id': 'aus_restored_reef',
        'site_id': 'aus_R1',
        'name': 'Restored Reef, Great Barrier Reef',
        'country': 'Australia',
        'country_code': 'AUS',
        'category': 'restored_early',
        'stories': ['restoration_timeline'],
        'description': 'Early-stage recovery \u2014 the first signs of biological sound returning.',
        'duration_seconds': 30,
        's3_key': 'samples/aus_restored_reef.wav',
        'frequency_highlights': ['Pioneer species calls', 'Increasing low-frequency activity'],
        'coordinates': {'lat': -16.84719, 'lng': 146.22866},
    },
    {
        'id': 'mex_restored_carib',
        'site_id': 'mex_R1',
        'name': 'Restored Reef, Caribbean Mexico',
        'country': 'Mexico',
        'country_code': 'MEX',
        'category': 'restored_mid',
        'stories': ['geographic_diversity'],
        'description': 'Caribbean restoration project \u2014 damselfish territorial calls beginning to dominate.',
        'duration_seconds': 30,
        's3_key': 'samples/mex_restored_carib.wav',
        'frequency_highlights': ['Damselfish calls (300\u20131200 Hz)', 'Urchin grazing sounds'],
        'coordinates': {'lat': 18.34107, 'lng': -87.807348},
    },
    {
        'id': 'phl_degraded_reef',
        'site_id': 'phl_D1',
        'name': 'Degraded Reef, Philippines',
        'country': 'Philippines',
        'country_code': 'PHL',
        'category': 'degraded',
        'stories': ['geographic_diversity'],
        'description': 'Overfished reef in the Coral Triangle \u2014 wave noise with very little biology.',
        'duration_seconds': 30,
        's3_key': 'samples/phl_degraded_reef.wav',
        'frequency_highlights': ['Dominant wave noise (<500 Hz)', 'Minimal biotic sound'],
        'coordinates': {'lat': 9.85, 'lng': 124.02},
    },
    {
        'id': 'aus_healthy_outer',
        'site_id': 'aus_H2',
        'name': 'Outer Reef, Great Barrier Reef',
        'country': 'Australia',
        'country_code': 'AUS',
        'category': 'healthy',
        'stories': [],
        'description': 'Outer reef wall alive with sound \u2014 grouper booms and clownfish chirps.',
        'duration_seconds': 30,
        's3_key': 'samples/aus_healthy_outer.wav',
        'frequency_highlights': ['Grouper booms (100\u2013400 Hz)', 'Clownfish chirps (600\u20131500 Hz)'],
        'coordinates': {'lat': -16.84782, 'lng': 146.22798},
    },
]

SAMPLE_STORIES = {
    'healthy_vs_degraded': {
        'title': 'The Sound of Health',
        'subtitle': 'Hear the difference between a thriving reef and a silent one',
        'sample_ids': ['idn_healthy_dawn', 'aus_degraded_reef'],
    },
    'restoration_timeline': {
        'title': 'Recovery in Sound',
        'subtitle': 'How a reef\'s voice returns after restoration',
        'sample_ids': ['aus_degraded_reef', 'aus_restored_reef', 'idn_restored_mid', 'idn_healthy_dawn'],
    },
    'geographic_diversity': {
        'title': 'Reefs Around the World',
        'subtitle': 'Every reef has its own acoustic signature',
        'sample_ids': ['idn_healthy_dawn', 'aus_healthy_gbr', 'mex_restored_carib', 'phl_degraded_reef'],
    },
}


def handle_get_samples(event):
    """Return curated sample audio with pre-signed S3 URLs."""
    try:
        samples = []
        for sample in CURATED_SAMPLES:
            audio_url = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': AUDIO_BUCKET, 'Key': sample['s3_key']},
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
                'frequency_highlights': sample['frequency_highlights'],
                'coordinates': sample['coordinates'],
            })

        return response(200, {
            'samples': samples,
            'stories': SAMPLE_STORIES,
        })
    except Exception as e:
        return response(500, {'error': {'code': 'SAMPLES_FAILED', 'message': str(e)}})


def handle_visualize(analysis_id):
    """Return visualization data for an analysis."""
    try:
        table = dynamodb.Table(METADATA_TABLE)
        result = table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'RESULT'})

        if 'Item' not in result:
            # Check if still processing
            preprocess_result = table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'PREPROCESSED'})
            if 'Item' in preprocess_result:
                return response(200, {'analysis_id': analysis_id, 'status': 'processing'})

            # Check for errors - return detailed error information
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

            return response(404, {'error': {'code': 'ANALYSIS_NOT_FOUND', 'message': f'No analysis found with ID: {analysis_id}'}})

        item = result['Item']
        return response(200, {
            'analysis_id': analysis_id,
            'status': 'complete',
            'classification': item.get('classification', {}),
            'similar_sites': item.get('similar_sites', []),
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
