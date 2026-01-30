<objective>
Build the three Lambda functions that power the ReefRadar API:
1. Router - API Gateway request handler
2. Preprocessor - Audio format conversion (container-based)
3. Classifier - Health classification using SurfPerch embeddings

These functions form the core processing pipeline: upload → preprocess → classify → return results.
</objective>

<context>
Project: ReefRadar - Coral Reef Acoustic Health Analysis API
Phase: 3 of 8

Architecture:
```
API Gateway → Router Lambda → Preprocessor Lambda → Classifier Lambda
                                     ↓                      ↓
                                  S3 Audio              SageMaker
                                     ↓                      ↓
                                 DynamoDB ←←←←←←←←←←←←←←←←←←
```

Technical Constraints:
- Router: Standard Python Lambda (256 MB memory, 30s timeout)
- Preprocessor: Container image (librosa too large for layers), 1024 MB, 300s timeout
- Classifier: Standard Python Lambda (512 MB, 300s timeout)
- SurfPerch requires: 16 kHz, mono, 1.88-second segments
</context>

<prerequisites>
Before starting:
1. Source AWS environment: `source ./config/aws-env.sh`
2. Phase 1 (AWS Setup) completed
3. Phase 2 (Data Preparation) completed
4. Docker installed for container build
</prerequisites>

<implementation>

**Step 1: Create Project Structure**
```bash
mkdir -p ~/reef-project/lambdas/{router,preprocessor,classifier}
cd ~/reef-project
```

**Step 2: Router Lambda**

Create `./lambdas/router/handler.py`:
```python
"""
API Gateway router - handles incoming requests and routes to appropriate functions.
"""

import json
import boto3
import uuid
from datetime import datetime
import base64
import os

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

AUDIO_BUCKET = os.environ.get('AUDIO_BUCKET')
METADATA_TABLE = os.environ.get('METADATA_TABLE')
PREPROCESSOR_FUNCTION = os.environ.get('PREPROCESSOR_FUNCTION')


def handler(event, context):
    """Main Lambda handler."""
    http_method = event.get('requestContext', {}).get('http', {}).get('method', 'GET')
    path = event.get('rawPath', '/')

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
    """Return list of reference sites."""
    # For MVP, return hardcoded list. Production would query DynamoDB.
    sites = [
        {'site_id': 'ind_H1', 'country': 'Indonesia', 'status': 'healthy'},
        {'site_id': 'ind_H2', 'country': 'Indonesia', 'status': 'healthy'},
        {'site_id': 'ind_D1', 'country': 'Indonesia', 'status': 'degraded'},
        {'site_id': 'aus_H1', 'country': 'Australia', 'status': 'healthy'},
        {'site_id': 'aus_D1', 'country': 'Australia', 'status': 'degraded'},
        {'site_id': 'ken_R1', 'country': 'Kenya', 'status': 'restored_early'},
        {'site_id': 'mex_M1', 'country': 'Mexico', 'status': 'restored_mid'},
        {'site_id': 'mdv_H1', 'country': 'Maldives', 'status': 'healthy'},
    ]

    return response(200, {
        'sites': sites,
        'total_sites': len(sites),
        'countries': list(set(s['country'] for s in sites))
    })


def handle_visualize(analysis_id):
    """Return visualization data for an analysis."""
    table = dynamodb.Table(METADATA_TABLE)
    result = table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'RESULT'})

    if 'Item' not in result:
        # Check if still processing
        preprocess_result = table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'PREPROCESSED'})
        if 'Item' in preprocess_result:
            return response(200, {'analysis_id': analysis_id, 'status': 'processing'})

        # Check for errors
        error_result = table.get_item(Key={'pk': f'ANALYSIS#{analysis_id}', 'sk': 'ERROR'})
        if 'Item' in error_result:
            return response(200, {'analysis_id': analysis_id, 'status': 'failed', 'error': error_result['Item'].get('error')})

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
        'body': json.dumps(body)
    }
```

Create `./lambdas/router/requirements.txt`:
```
boto3>=1.28.0
```

**Step 3: Preprocessor Lambda (Container)**

Create `./lambdas/preprocessor/Dockerfile`:
```dockerfile
FROM public.ecr.aws/lambda/python:3.11

# Install system dependencies for audio processing
RUN yum install -y ffmpeg libsndfile

# Copy and install Python requirements
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy handler
COPY handler.py .

CMD ["handler.handler"]
```

Create `./lambdas/preprocessor/requirements.txt`:
```
boto3>=1.28.0
pydub>=0.25.1
numpy>=1.24.0
```

Create `./lambdas/preprocessor/handler.py`:
```python
"""
Audio preprocessor - converts uploaded audio to SurfPerch-compatible format.
Target: 16 kHz, mono, 16-bit PCM, 1.88-second segments
"""

import json
import boto3
import os
import tempfile
from pathlib import Path
import numpy as np

s3 = boto3.client('s3')
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')

AUDIO_BUCKET = os.environ.get('AUDIO_BUCKET')
EMBEDDINGS_BUCKET = os.environ.get('EMBEDDINGS_BUCKET')
METADATA_TABLE = os.environ.get('METADATA_TABLE')
CLASSIFIER_FUNCTION = os.environ.get('CLASSIFIER_FUNCTION')

TARGET_SAMPLE_RATE = 16000
SEGMENT_DURATION = 1.88
SEGMENT_SAMPLES = int(TARGET_SAMPLE_RATE * SEGMENT_DURATION)


def handler(event, context):
    """Process uploaded audio file."""
    upload_id = event['upload_id']
    analysis_id = event['analysis_id']
    s3_key = event['s3_key']

    table = dynamodb.Table(METADATA_TABLE)

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = Path(tmpdir) / 'input.wav'
            output_path = Path(tmpdir) / 'processed.wav'

            # Download from S3
            s3.download_file(AUDIO_BUCKET, s3_key, str(input_path))

            # Convert using pydub
            from pydub import AudioSegment

            audio = AudioSegment.from_file(str(input_path))
            audio = audio.set_channels(1)  # Mono
            audio = audio.set_frame_rate(TARGET_SAMPLE_RATE)  # 16kHz
            audio = audio.set_sample_width(2)  # 16-bit
            audio.export(str(output_path), format='wav')

            duration_seconds = len(audio) / 1000.0
            num_segments = int(duration_seconds / SEGMENT_DURATION)

            if num_segments == 0:
                raise ValueError(f"Audio too short: {duration_seconds:.2f}s (minimum: {SEGMENT_DURATION}s)")

            # Upload processed audio
            processed_key = f'processed/{analysis_id}/audio.wav'
            s3.upload_file(str(output_path), AUDIO_BUCKET, processed_key)

            # Segment audio for embedding
            samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
            samples = samples / 32768.0  # Normalize to [-1, 1]

            segments = []
            for i in range(num_segments):
                start = i * SEGMENT_SAMPLES
                end = start + SEGMENT_SAMPLES
                if end <= len(samples):
                    segments.append(samples[start:end].tolist())

            # Save segments for classifier
            segments_key = f'processed/{analysis_id}/segments.json'
            s3.put_object(
                Bucket=AUDIO_BUCKET,
                Key=segments_key,
                Body=json.dumps({'segments': segments}),
                ContentType='application/json'
            )

            # Update metadata
            table.put_item(Item={
                'pk': f'ANALYSIS#{analysis_id}',
                'sk': 'PREPROCESSED',
                'upload_id': upload_id,
                'analysis_id': analysis_id,
                'duration_seconds': str(duration_seconds),
                'num_segments': num_segments,
                'processed_key': processed_key,
                'segments_key': segments_key,
                'status': 'preprocessed'
            })

            # Invoke classifier
            lambda_client.invoke(
                FunctionName=CLASSIFIER_FUNCTION,
                InvocationType='Event',
                Payload=json.dumps({
                    'upload_id': upload_id,
                    'analysis_id': analysis_id,
                    'segments_key': segments_key,
                    'num_segments': num_segments
                })
            )

            return {'statusCode': 200, 'body': json.dumps({'analysis_id': analysis_id, 'status': 'preprocessed', 'num_segments': num_segments})}

    except Exception as e:
        table.put_item(Item={
            'pk': f'ANALYSIS#{analysis_id}',
            'sk': 'ERROR',
            'upload_id': upload_id,
            'error': str(e),
            'status': 'failed'
        })
        raise
```

**Step 4: Classifier Lambda**

Create `./lambdas/classifier/handler.py`:
```python
"""
Health classifier - uses SurfPerch embeddings to classify reef health.
"""

import json
import boto3
import os
import numpy as np
from datetime import datetime

s3 = boto3.client('s3')
sagemaker_runtime = boto3.client('sagemaker-runtime')
dynamodb = boto3.resource('dynamodb')

AUDIO_BUCKET = os.environ.get('AUDIO_BUCKET')
EMBEDDINGS_BUCKET = os.environ.get('EMBEDDINGS_BUCKET')
METADATA_TABLE = os.environ.get('METADATA_TABLE')
SAGEMAKER_ENDPOINT = os.environ.get('SAGEMAKER_ENDPOINT')

CATEGORIES = ['healthy', 'degraded', 'restored_early', 'restored_mid']


def handler(event, context):
    """Classify audio segments."""
    upload_id = event['upload_id']
    analysis_id = event['analysis_id']
    segments_key = event['segments_key']
    num_segments = event['num_segments']

    table = dynamodb.Table(METADATA_TABLE)

    try:
        # Load segments
        response = s3.get_object(Bucket=AUDIO_BUCKET, Key=segments_key)
        segments_data = json.loads(response['Body'].read().decode())
        segments = segments_data['segments']

        # Get embeddings from SageMaker
        embeddings = []
        for segment in segments:
            sm_response = sagemaker_runtime.invoke_endpoint(
                EndpointName=SAGEMAKER_ENDPOINT,
                ContentType='application/json',
                Body=json.dumps({'inputs': segment})
            )
            embedding = json.loads(sm_response['Body'].read().decode())
            embeddings.append(embedding['embedding'])

        embeddings = np.array(embeddings)
        mean_embedding = embeddings.mean(axis=0)

        # Classify and find similar sites
        classification = classify_embedding(mean_embedding)
        similar_sites = find_similar_sites(mean_embedding)
        viz_coords = generate_visualization(mean_embedding)

        # Store results
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
                'aggregation': 'mean'
            },
            'completed_at': datetime.utcnow().isoformat(),
            'caveats': 'Classification based on acoustic similarity to reference sites. Not a definitive health diagnosis. Complements but does not replace visual surveys.'
        }
        table.put_item(Item=result_item)

        # Update upload record
        table.update_item(
            Key={'pk': f'UPLOAD#{upload_id}', 'sk': 'METADATA'},
            UpdateExpression='SET #status = :status',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={':status': 'complete'}
        )

        return {'statusCode': 200, 'body': json.dumps({'analysis_id': analysis_id, 'status': 'complete', 'classification': classification})}

    except Exception as e:
        table.put_item(Item={
            'pk': f'ANALYSIS#{analysis_id}',
            'sk': 'ERROR',
            'upload_id': upload_id,
            'error': str(e),
            'status': 'failed'
        })
        raise


def classify_embedding(embedding):
    """
    Classify embedding by comparing to reference site centroids.
    MVP uses placeholder logic. Production would load actual reference embeddings.
    """
    # TODO: Load pre-computed reference centroids from S3 and compute similarities
    # For MVP, return placeholder probabilities
    probabilities = {
        'healthy': 0.65,
        'degraded': 0.15,
        'restored_early': 0.10,
        'restored_mid': 0.10
    }

    label = max(probabilities, key=probabilities.get)
    confidence = probabilities[label]

    return {
        'label': label,
        'confidence': float(confidence),
        'probabilities': {k: float(v) for k, v in probabilities.items()}
    }


def find_similar_sites(embedding, top_k=3):
    """Find most similar reference sites."""
    # TODO: Load reference embeddings and compute cosine similarities
    # For MVP, return placeholder data
    return [
        {'site_id': 'ind_H3', 'similarity': 0.94, 'country': 'Indonesia', 'status': 'healthy'},
        {'site_id': 'aus_H1', 'similarity': 0.91, 'country': 'Australia', 'status': 'healthy'},
        {'site_id': 'mdv_H1', 'similarity': 0.88, 'country': 'Maldives', 'status': 'healthy'}
    ]


def generate_visualization(embedding):
    """Generate 2D coordinates for visualization."""
    # TODO: Use UMAP or t-SNE for proper dimensionality reduction
    # For MVP, use simple projection
    x = float(np.mean(embedding[:640]))
    y = float(np.mean(embedding[640:]))

    return {
        'type': 'umap_2d',
        'coordinates': {'x': x, 'y': y},
        'reference_sites': [
            {'site_id': 'ind_H1', 'x': 0.8, 'y': -0.3, 'status': 'healthy'},
            {'site_id': 'ind_D1', 'x': -0.9, 'y': 0.5, 'status': 'degraded'},
            {'site_id': 'aus_R1', 'x': 0.2, 'y': 0.1, 'status': 'restored_early'},
        ]
    }
```

Create `./lambdas/classifier/requirements.txt`:
```
boto3>=1.28.0
numpy>=1.24.0
```
</implementation>

<output>
Files created:
- `./lambdas/router/handler.py` - API router Lambda
- `./lambdas/router/requirements.txt`
- `./lambdas/preprocessor/Dockerfile` - Container definition
- `./lambdas/preprocessor/handler.py` - Audio preprocessor
- `./lambdas/preprocessor/requirements.txt`
- `./lambdas/classifier/handler.py` - Health classifier
- `./lambdas/classifier/requirements.txt`
</output>

<verification>
```bash
# Verify file structure
tree ~/reef-project/lambdas/

# Check Python syntax
python -m py_compile ~/reef-project/lambdas/router/handler.py
python -m py_compile ~/reef-project/lambdas/preprocessor/handler.py
python -m py_compile ~/reef-project/lambdas/classifier/handler.py

echo "All Lambda functions created successfully"
```
</verification>

<success_criteria>
- [ ] Router handler.py created with all 5 endpoints (upload, analyze, sites, visualize, health)
- [ ] Preprocessor Dockerfile created with ffmpeg and pydub
- [ ] Preprocessor handler.py converts audio to 16kHz mono and segments
- [ ] Classifier handler.py processes embeddings and returns classifications
- [ ] All Python files pass syntax check
- [ ] Requirements.txt files created for each function
</success_criteria>

<next_phase>
After completing this phase, proceed to Phase 4: Deploy SageMaker Endpoint (prompts/004-deploy-sagemaker.md)
</next_phase>
