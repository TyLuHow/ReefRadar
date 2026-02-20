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
        ('GET', '/health'): handle_health,
    }

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

        upload_id = str(uuid.uuid4())
        headers = event.get('headers', {})
        content_type = headers.get('content-type', 'audio/wav')
        filename = headers.get('x-filename', f'upload_{upload_id}.wav')

        # Validate file size (50 MB max)
        if len(file_content) > 50 * 1024 * 1024:
            return response(400, {
                'error': {
                    'code': 'FILE_TOO_LARGE',
                    'message': 'File exceeds 50 MB limit',
                    'details': {'size_bytes': len(file_content)}
                }
            })

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

        if not upload_id:
            return response(400, {'error': {'code': 'MISSING_UPLOAD_ID', 'message': 'upload_id is required'}})

        table = dynamodb.Table(METADATA_TABLE)
        result = table.get_item(Key={'pk': f'UPLOAD#{upload_id}', 'sk': 'METADATA'})

        if 'Item' not in result:
            return response(404, {'error': {'code': 'UPLOAD_NOT_FOUND', 'message': f'No upload found with ID: {upload_id}'}})

        upload_item = result['Item']
        analysis_id = str(uuid.uuid4())

        # Invoke preprocessor asynchronously
        lambda_client.invoke(
            FunctionName=PREPROCESSOR_FUNCTION,
            InvocationType='Event',
            Payload=json.dumps({
                'upload_id': upload_id,
                'analysis_id': analysis_id,
                's3_key': upload_item['s3_key']
            })
        )

        # Update status
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
        # Load sites from S3 embeddings metadata
        s3_response = s3.get_object(Bucket=EMBEDDINGS_BUCKET, Key='reference/metadata.json')
        metadata = json.loads(s3_response['Body'].read().decode())

        # Handle new format (v2.0) with 'sites' key
        if isinstance(metadata, dict) and 'sites' in metadata:
            raw_sites = metadata['sites']
        elif isinstance(metadata, list):
            raw_sites = metadata
        else:
            raw_sites = []

        # Extract only the fields needed for the API response (exclude large embeddings)
        sites = []
        for site in raw_sites:
            sites.append({
                'site_id': site.get('site_id'),
                'country': site.get('country'),
                'region': site.get('region'),
                'status': site.get('status'),
                'latitude': site.get('latitude'),
                'longitude': site.get('longitude'),
                'synthetic': site.get('synthetic', True)
            })

        return response(200, {
            'sites': sites,
            'total_sites': len(sites),
            'countries': list(set(s['country'] for s in sites)),
            'version': metadata.get('version', '1.0') if isinstance(metadata, dict) else '1.0',
            'source': metadata.get('source', 'Unknown') if isinstance(metadata, dict) else 'Unknown',
            'notes': metadata.get('notes', '') if isinstance(metadata, dict) else ''
        })
    except Exception as e:
        # Fallback to hardcoded minimal list if S3 fails
        sites = [
            {'site_id': 'ind_H4', 'country': 'Indonesia', 'status': 'healthy', 'synthetic': False},
            {'site_id': 'ind_H5', 'country': 'Indonesia', 'status': 'healthy', 'synthetic': False},
            {'site_id': 'ken_H1', 'country': 'Kenya', 'status': 'healthy', 'synthetic': False},
            {'site_id': 'ind_N1', 'country': 'Indonesia', 'status': 'restored_early', 'synthetic': False},
        ]
        return response(200, {
            'sites': sites,
            'total_sites': len(sites),
            'countries': list(set(s['country'] for s in sites)),
            'error_note': f'Loaded from fallback: {str(e)}'
        })


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
