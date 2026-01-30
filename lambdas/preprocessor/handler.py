"""
Audio preprocessor - converts uploaded audio to SurfPerch-compatible format.
Target: 32 kHz, mono, 16-bit PCM, 5-second segments (160000 samples)
Uses numpy for WAV processing (no external dependencies).
"""

import json
import boto3
import os
import tempfile
from pathlib import Path
import struct
import numpy as np

s3 = boto3.client('s3')
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')

AUDIO_BUCKET = os.environ.get('AUDIO_BUCKET')
EMBEDDINGS_BUCKET = os.environ.get('EMBEDDINGS_BUCKET')
METADATA_TABLE = os.environ.get('METADATA_TABLE')
CLASSIFIER_FUNCTION = os.environ.get('CLASSIFIER_FUNCTION')

# Model requirements: 32kHz, 5-second segments
TARGET_SAMPLE_RATE = 32000
SEGMENT_DURATION = 5.0
SEGMENT_SAMPLES = int(TARGET_SAMPLE_RATE * SEGMENT_DURATION)  # 160000


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

            # Read WAV file using pure Python
            orig_sample_rate, audio_data = read_wav(str(input_path))

            # Convert to mono if stereo
            if len(audio_data.shape) > 1:
                audio_data = audio_data.mean(axis=1)

            # Convert to float32 and normalize
            if audio_data.dtype == np.int16:
                samples = audio_data.astype(np.float32) / 32768.0
            elif audio_data.dtype == np.int32:
                samples = audio_data.astype(np.float32) / 2147483648.0
            elif audio_data.dtype == np.float32:
                samples = audio_data
            else:
                samples = audio_data.astype(np.float32) / np.max(np.abs(audio_data))

            # Resample to target sample rate if needed
            if orig_sample_rate != TARGET_SAMPLE_RATE:
                samples = resample_linear(samples, orig_sample_rate, TARGET_SAMPLE_RATE)

            duration_seconds = len(samples) / TARGET_SAMPLE_RATE
            num_segments = int(duration_seconds / SEGMENT_DURATION)

            if num_segments == 0:
                raise ValueError(f"Audio too short: {duration_seconds:.2f}s (minimum: {SEGMENT_DURATION}s)")

            # Save processed audio as 16-bit WAV
            processed_samples = (samples * 32767).astype(np.int16)
            write_wav(str(output_path), TARGET_SAMPLE_RATE, processed_samples)

            # Upload processed audio
            processed_key = f'processed/{analysis_id}/audio.wav'
            s3.upload_file(str(output_path), AUDIO_BUCKET, processed_key)

            # Segment audio for embedding
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


def read_wav(filepath):
    """Read WAV file using pure Python/numpy."""
    with open(filepath, 'rb') as f:
        # Read RIFF header
        riff = f.read(4)
        if riff != b'RIFF':
            raise ValueError("Not a valid WAV file (missing RIFF)")
        f.read(4)  # file size
        wave = f.read(4)
        if wave != b'WAVE':
            raise ValueError("Not a valid WAV file (missing WAVE)")

        # Find fmt chunk
        sample_rate = None
        num_channels = None
        bits_per_sample = None

        while True:
            chunk_id = f.read(4)
            if len(chunk_id) < 4:
                break
            chunk_size = struct.unpack('<I', f.read(4))[0]

            if chunk_id == b'fmt ':
                audio_format = struct.unpack('<H', f.read(2))[0]
                num_channels = struct.unpack('<H', f.read(2))[0]
                sample_rate = struct.unpack('<I', f.read(4))[0]
                f.read(4)  # byte rate
                f.read(2)  # block align
                bits_per_sample = struct.unpack('<H', f.read(2))[0]
                # Skip any extra fmt data
                if chunk_size > 16:
                    f.read(chunk_size - 16)
            elif chunk_id == b'data':
                # Read audio data
                data = f.read(chunk_size)
                break
            else:
                # Skip unknown chunks
                f.read(chunk_size)

        if sample_rate is None:
            raise ValueError("Invalid WAV: missing fmt chunk")

        # Convert bytes to numpy array
        if bits_per_sample == 16:
            audio_data = np.frombuffer(data, dtype=np.int16)
        elif bits_per_sample == 32:
            audio_data = np.frombuffer(data, dtype=np.int32)
        elif bits_per_sample == 8:
            audio_data = np.frombuffer(data, dtype=np.uint8).astype(np.int16) - 128
        else:
            raise ValueError(f"Unsupported bit depth: {bits_per_sample}")

        # Reshape for stereo
        if num_channels > 1:
            audio_data = audio_data.reshape(-1, num_channels)

        return sample_rate, audio_data


def write_wav(filepath, sample_rate, samples):
    """Write WAV file using pure Python."""
    num_samples = len(samples)
    num_channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = num_samples * block_align

    with open(filepath, 'wb') as f:
        # RIFF header
        f.write(b'RIFF')
        f.write(struct.pack('<I', 36 + data_size))
        f.write(b'WAVE')

        # fmt chunk
        f.write(b'fmt ')
        f.write(struct.pack('<I', 16))  # chunk size
        f.write(struct.pack('<H', 1))   # audio format (PCM)
        f.write(struct.pack('<H', num_channels))
        f.write(struct.pack('<I', sample_rate))
        f.write(struct.pack('<I', byte_rate))
        f.write(struct.pack('<H', block_align))
        f.write(struct.pack('<H', bits_per_sample))

        # data chunk
        f.write(b'data')
        f.write(struct.pack('<I', data_size))
        f.write(samples.tobytes())


def resample_linear(samples, orig_rate, target_rate):
    """Resample audio using linear interpolation."""
    if orig_rate == target_rate:
        return samples

    # Calculate output length
    duration = len(samples) / orig_rate
    num_output = int(duration * target_rate)

    # Create output sample positions
    output_positions = np.arange(num_output) * orig_rate / target_rate

    # Linear interpolation
    indices = output_positions.astype(np.int32)
    fractions = output_positions - indices

    # Handle boundary
    indices = np.clip(indices, 0, len(samples) - 2)

    # Interpolate
    output = samples[indices] * (1 - fractions) + samples[indices + 1] * fractions

    return output.astype(np.float32)
