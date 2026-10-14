"""
Audio preprocessor - converts an uploaded WAV into SurfPerch-ready windows.

A thin S3-in, S3-out wrapper around the shared `reef_audio` module (bundled
flat into the zip; lambdas/shared on the test path). reef_audio owns every
signal-processing step so the live path and the offline re-embedding jobs
hand the model identical bytes: WAV decode (PCM 8/16/24/32, float 32/64,
WAVE_FORMAT_EXTENSIBLE, 1-8 channels), channel mix, full-scale conversion,
polyphase Kaiser resampling to 32 kHz, 5.0 s windows (160,000 samples, the
trailing partial window is dropped) and the perch-hoplite wrapper
normalisation (DC removal, peak 0.25). This handler keeps no copy of that
logic; the contract is reef_audio.SPEC_VERSION, recorded in the sidecar.

Writes, per analysis:
  processed/{analysis_id}/segments.f32       little-endian float32, n x 160000
  processed/{analysis_id}/preprocessing.json sidecar (spec version, levels,
                                             segments sha256 and byte length)
  processed/{analysis_id}/audio.wav          PCM16 mono 32 kHz playback copy
                                             (pre-normalisation, clipped)
and tells the classifier the format (`segments_format` "f32le").
"""

import json
import os

import boto3

import reef_audio

s3 = boto3.client('s3')
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')

AUDIO_BUCKET = os.environ.get('AUDIO_BUCKET')
EMBEDDINGS_BUCKET = os.environ.get('EMBEDDINGS_BUCKET')
METADATA_TABLE = os.environ.get('METADATA_TABLE')
CLASSIFIER_FUNCTION = os.environ.get('CLASSIFIER_FUNCTION')


def _error_item(analysis_id, upload_id, error_code, error):
    """The ERROR item written for a failed preprocessing run."""
    item = {
        'pk': f'ANALYSIS#{analysis_id}',
        'sk': 'ERROR',
        'upload_id': upload_id,
        'error_code': error_code,
        'error': str(error),
        'status': 'failed',
    }
    if error_code == 'AUDIO_TOO_SHORT':
        item['min_duration_required'] = str(reef_audio.MIN_DURATION_S)
    elif error_code == 'AUDIO_TOO_LONG':
        item['max_duration_allowed'] = str(reef_audio.MAX_DURATION_S)
    return item


def handler(event, context):
    """Process uploaded audio file for SurfPerch inference."""
    upload_id = event['upload_id']
    analysis_id = event['analysis_id']
    s3_key = event['s3_key']
    latitude = event.get('latitude')
    longitude = event.get('longitude')

    table = dynamodb.Table(METADATA_TABLE)

    try:
        print(f"Downloading audio from s3://{AUDIO_BUCKET}/{s3_key}")
        data = s3.get_object(Bucket=AUDIO_BUCKET, Key=s3_key)['Body'].read()

        prepared = reef_audio.audio_to_windows(data)
        num_segments = int(prepared.windows.shape[0])
        duration_seconds = len(prepared.resampled) / reef_audio.TARGET_SAMPLE_RATE
        print(
            f"Input audio: {prepared.input['sample_rate_hz']}Hz, "
            f"{prepared.input['channels']} channel(s), {prepared.input['duration_s']:.2f}s; "
            f"processed {reef_audio.TARGET_SAMPLE_RATE}Hz, {duration_seconds:.2f}s, "
            f"{num_segments} segments"
        )

        # Playback copy: the resampled signal before normalisation, clipped (no int16 wrap).
        processed_key = f'processed/{analysis_id}/audio.wav'
        s3.put_object(
            Bucket=AUDIO_BUCKET,
            Key=processed_key,
            Body=reef_audio.pcm16_wav_bytes(prepared.resampled, reef_audio.TARGET_SAMPLE_RATE),
            ContentType='audio/wav',
        )

        segments_bytes = reef_audio.encode_segments(prepared.windows)
        segments_key = f'processed/{analysis_id}/segments.f32'
        s3.put_object(
            Bucket=AUDIO_BUCKET,
            Key=segments_key,
            Body=segments_bytes,
            ContentType='application/octet-stream',
        )

        sidecar = reef_audio.build_sidecar(prepared, segments_bytes)
        preprocessing_key = f'processed/{analysis_id}/preprocessing.json'
        s3.put_object(
            Bucket=AUDIO_BUCKET,
            Key=preprocessing_key,
            Body=json.dumps(sidecar, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8'),
            ContentType='application/json',
        )

        table.put_item(Item={
            'pk': f'ANALYSIS#{analysis_id}',
            'sk': 'PREPROCESSED',
            'upload_id': upload_id,
            'analysis_id': analysis_id,
            'duration_seconds': str(duration_seconds),
            'num_segments': num_segments,
            'processed_key': processed_key,
            'segments_key': segments_key,
            'segments_format': reef_audio.SEGMENTS_FORMAT,
            'preprocessing_key': preprocessing_key,
            'spec_version': reef_audio.SPEC_VERSION,
            'status': 'preprocessed',
        })

        classifier_payload = {
            'upload_id': upload_id,
            'analysis_id': analysis_id,
            'segments_key': segments_key,
            'num_segments': num_segments,
            'segments_format': reef_audio.SEGMENTS_FORMAT,
            'preprocessing_key': preprocessing_key,
        }
        if latitude is not None:
            classifier_payload['latitude'] = latitude
        if longitude is not None:
            classifier_payload['longitude'] = longitude

        lambda_client.invoke(
            FunctionName=CLASSIFIER_FUNCTION,
            InvocationType='Event',
            Payload=json.dumps(classifier_payload),
        )

        return {'statusCode': 200, 'body': json.dumps({
            'analysis_id': analysis_id,
            'status': 'preprocessed',
            'num_segments': num_segments,
        })}

    except reef_audio.ReefAudioError as e:
        error_code = e.error_code
        print(f"Error: {error_code} - {str(e)}")
        table.put_item(Item=_error_item(analysis_id, upload_id, error_code, e))
        raise

    except Exception as e:
        error_code = 'PROCESSING_FAILED'
        print(f"Error: {error_code} - {str(e)}")
        table.put_item(Item=_error_item(analysis_id, upload_id, error_code, e))
        raise
