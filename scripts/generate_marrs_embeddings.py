#!/usr/bin/env python3
"""
Generate real SurfPerch embeddings from MARRS coral reef audio.

This script:
1. Reads WAV files from MARRS audio folders
2. Preprocesses to 32kHz mono
3. Segments into 5-second windows (160,000 samples)
4. Uploads batches to S3 and invokes Lambda for embedding generation
5. Averages embeddings across all segments per site
6. Outputs updated metadata.json

Usage:
    python scripts/generate_marrs_embeddings.py --sites ind_H5 ken_H1 ind_N1 ind_H4
"""

import argparse
import json
import os
import struct
import sys
import time
import numpy as np
import boto3
from pathlib import Path

# SurfPerch constants
SAMPLE_RATE = 32000  # 32 kHz target
WINDOW_SECONDS = 5.0
WINDOW_SAMPLES = int(SAMPLE_RATE * WINDOW_SECONDS)  # 160,000
EMBEDDING_DIM = 1280

# AWS config
AWS_REGION = 'us-east-1'
LAMBDA_FUNCTION = 'reefradar-2477-inference'
S3_BUCKET = 'reefradar-2477-embeddings'

# Batch settings - Lambda has payload limits
MAX_SEGMENTS_PER_BATCH = 10  # Batch size for S3 uploads
MAX_FILES_PER_SITE = 50  # Limit files per site for efficiency
S3_TEMP_PREFIX = 'temp/embedding_batches/'

lambda_client = boto3.client('lambda', region_name=AWS_REGION)
s3_client = boto3.client('s3', region_name=AWS_REGION)


def read_wav(filepath):
    """
    Read WAV file using pure Python (no dependencies).
    Returns (samples, sample_rate, channels).
    """
    with open(filepath, 'rb') as f:
        # RIFF header
        riff = f.read(4)
        if riff != b'RIFF':
            raise ValueError(f"Not a RIFF file: {filepath}")

        f.read(4)  # file size
        wave = f.read(4)
        if wave != b'WAVE':
            raise ValueError(f"Not a WAVE file: {filepath}")

        # Find fmt chunk
        fmt_data = None
        data_samples = None

        while True:
            chunk_id = f.read(4)
            if len(chunk_id) < 4:
                break

            chunk_size = struct.unpack('<I', f.read(4))[0]

            if chunk_id == b'fmt ':
                fmt_data = f.read(chunk_size)
            elif chunk_id == b'data':
                data_bytes = f.read(chunk_size)
                data_samples = data_bytes
            else:
                f.read(chunk_size)

        if fmt_data is None or data_samples is None:
            raise ValueError(f"Missing fmt or data chunk: {filepath}")

        # Parse fmt chunk
        audio_format = struct.unpack('<H', fmt_data[0:2])[0]
        num_channels = struct.unpack('<H', fmt_data[2:4])[0]
        sample_rate = struct.unpack('<I', fmt_data[4:8])[0]
        bits_per_sample = struct.unpack('<H', fmt_data[14:16])[0]

        # Convert to samples
        if bits_per_sample == 16:
            fmt_str = f'<{len(data_samples)//2}h'
            samples = struct.unpack(fmt_str, data_samples)
        elif bits_per_sample == 24:
            # Handle 24-bit audio
            samples = []
            for i in range(0, len(data_samples), 3):
                if i + 3 <= len(data_samples):
                    b = data_samples[i:i+3]
                    val = struct.unpack('<i', b + (b'\xff' if b[2] & 0x80 else b'\x00'))[0]
                    samples.append(val // 256)  # Convert to 16-bit range
            samples = tuple(samples)
        elif bits_per_sample == 32:
            fmt_str = f'<{len(data_samples)//4}i'
            samples = struct.unpack(fmt_str, data_samples)
        else:
            raise ValueError(f"Unsupported bit depth: {bits_per_sample}")

        return np.array(samples, dtype=np.float32), sample_rate, num_channels


def preprocess_audio(samples, source_rate, num_channels):
    """
    Preprocess audio: stereo->mono, resample to 32kHz, normalize.
    """
    # Convert to mono if stereo
    if num_channels == 2:
        samples = samples.reshape(-1, 2).mean(axis=1)

    # Normalize to [-1, 1]
    max_val = np.max(np.abs(samples))
    if max_val > 0:
        samples = samples / max_val

    # Resample if needed
    if source_rate != SAMPLE_RATE:
        duration = len(samples) / source_rate
        new_length = int(duration * SAMPLE_RATE)
        indices = np.linspace(0, len(samples) - 1, new_length)
        samples = np.interp(indices, np.arange(len(samples)), samples)

    return samples.astype(np.float32)


def segment_audio(samples):
    """
    Segment audio into 5-second windows (160,000 samples at 32kHz).
    """
    windows = []
    for start in range(0, len(samples) - WINDOW_SAMPLES + 1, WINDOW_SAMPLES):
        window = samples[start:start + WINDOW_SAMPLES]
        windows.append(window.tolist())
    return windows


def invoke_lambda_via_s3(segments, batch_id):
    """
    Upload segments to S3 and invoke Lambda.
    This avoids Lambda payload size limits.
    Returns list of embeddings.
    """
    import uuid

    # Upload segments to S3
    s3_key = f"{S3_TEMP_PREFIX}{batch_id}_{uuid.uuid4().hex[:8]}.json"

    segment_data = {
        'segments': segments,
        'sample_rate': SAMPLE_RATE
    }

    s3_client.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=json.dumps(segment_data).encode(),
        ContentType='application/json'
    )

    # Invoke Lambda with S3 reference
    payload = {
        's3_bucket': S3_BUCKET,
        's3_key': s3_key
    }

    response = lambda_client.invoke(
        FunctionName=LAMBDA_FUNCTION,
        InvocationType='RequestResponse',
        Payload=json.dumps(payload).encode()
    )

    result = json.loads(response['Payload'].read().decode())

    # Clean up temp file
    try:
        s3_client.delete_object(Bucket=S3_BUCKET, Key=s3_key)
    except:
        pass

    if result.get('statusCode') != 200:
        error_body = result.get('body', result)
        if isinstance(error_body, str):
            error_body = json.loads(error_body)
        raise RuntimeError(f"Lambda error: {error_body}")

    body = result.get('body', result)
    if isinstance(body, str):
        body = json.loads(body)

    return body.get('embeddings', [])


def process_site(site_folder, site_id, max_files=MAX_FILES_PER_SITE):
    """
    Process all WAV files for a site and return mean embedding.
    Supports both: subfolder structure OR flat files with site_id prefix.
    """
    site_path = Path(site_folder)

    # Try subfolder first (e.g., audio_dir/ind_D2/)
    if site_path.is_dir():
        wav_files = sorted(site_path.glob('*.WAV'))[:max_files]
        if not wav_files:
            wav_files = sorted(site_path.glob('*.wav'))[:max_files]
    else:
        wav_files = []

    # If no subfolder, try flat structure with site_id prefix (e.g., ind_D2_*.WAV)
    if not wav_files:
        parent_dir = site_path.parent
        wav_files = sorted(parent_dir.glob(f'{site_id}_*.WAV'))[:max_files]
        if not wav_files:
            wav_files = sorted(parent_dir.glob(f'{site_id}_*.wav'))[:max_files]

    if not wav_files:
        print(f"  No WAV files found for {site_id} in {site_folder}")
        return None

    print(f"  Processing {len(wav_files)} files for {site_id}...")

    all_embeddings = []
    segments_buffer = []
    files_processed = 0

    for wav_file in wav_files:
        try:
            # Read and preprocess
            samples, rate, channels = read_wav(str(wav_file))
            samples = preprocess_audio(samples, rate, channels)

            # Segment into windows
            windows = segment_audio(samples)
            if not windows:
                continue

            # Take first window from each file (representative sample)
            segments_buffer.append(windows[0])
            files_processed += 1

            # Process batch when buffer is full
            if len(segments_buffer) >= MAX_SEGMENTS_PER_BATCH:
                print(f"    Invoking Lambda with {len(segments_buffer)} segments via S3...")
                try:
                    embeddings = invoke_lambda_via_s3(segments_buffer, f"{site_id}_batch{len(all_embeddings)}")
                    all_embeddings.extend(embeddings)
                    print(f"    Got {len(embeddings)} embeddings")
                except Exception as e:
                    print(f"    Lambda error: {e}")
                segments_buffer = []
                time.sleep(1.0)  # Rate limiting for Lambda cold starts

        except Exception as e:
            print(f"    Error processing {wav_file.name}: {e}")
            continue

    # Process remaining segments
    if segments_buffer:
        print(f"    Invoking Lambda with final {len(segments_buffer)} segments via S3...")
        try:
            embeddings = invoke_lambda_via_s3(segments_buffer, f"{site_id}_final")
            all_embeddings.extend(embeddings)
            print(f"    Got {len(embeddings)} embeddings")
        except Exception as e:
            print(f"    Lambda error: {e}")

    if not all_embeddings:
        print(f"  No embeddings generated for {site_id}")
        return None

    # Compute mean embedding
    mean_embedding = np.mean(all_embeddings, axis=0).tolist()
    print(f"  Generated mean embedding from {len(all_embeddings)} windows ({files_processed} files)")

    return {
        'embedding': mean_embedding,
        'num_files': files_processed,
        'num_windows': len(all_embeddings)
    }


def load_site_metadata(site_id):
    """
    Load site metadata from marrs_sites.json.
    """
    metadata_path = Path(__file__).parent.parent / 'data' / 'embeddings' / 'marrs_sites.json'
    with open(metadata_path) as f:
        sites = json.load(f)

    for site in sites:
        if site['site_id'] == site_id:
            return site
    return None


def main():
    parser = argparse.ArgumentParser(description='Generate SurfPerch embeddings from MARRS audio')
    parser.add_argument('--sites', nargs='+', required=True, help='Site IDs to process (e.g., ind_H5 ken_H1)')
    parser.add_argument('--audio-dir', default='/mnt/c/Users/Tyler Luby Howard/Downloads',
                        help='Base directory containing site folders')
    parser.add_argument('--max-files', type=int, default=MAX_FILES_PER_SITE,
                        help=f'Max files per site (default: {MAX_FILES_PER_SITE})')
    parser.add_argument('--output', default='data/embeddings/real_embeddings.json',
                        help='Output file path')
    args = parser.parse_args()

    results = []

    for site_id in args.sites:
        print(f"\n{'='*60}")
        print(f"Processing site: {site_id}")
        print('='*60)

        # Load metadata
        metadata = load_site_metadata(site_id)
        if not metadata:
            print(f"  Warning: No metadata found for {site_id}")
            metadata = {'site_id': site_id}

        # Find audio folder or check for flat files with site_id prefix
        audio_dir = Path(args.audio_dir)
        site_folder = audio_dir / site_id

        # Check if subfolder exists, OR if flat files with site_id prefix exist
        has_subfolder = site_folder.exists() and site_folder.is_dir()
        has_flat_files = (any(audio_dir.glob(f'{site_id}_*.WAV')) or
                          any(audio_dir.glob(f'{site_id}_*.wav')))

        if not has_subfolder and not has_flat_files:
            print(f"  Error: No audio found for {site_id} in {audio_dir}")
            continue

        # Process audio files
        # For flat structure, pass a non-existent path so process_site uses fallback
        embedding_result = process_site(site_folder, site_id, args.max_files)

        if embedding_result:
            result = {
                **metadata,
                'embedding': embedding_result['embedding'],
                'recordings_used': embedding_result['num_files'],
                'windows_processed': embedding_result['num_windows'],
                'synthetic': False,
                'model': 'surfperch',
                'model_version': '1.0'
            }
            results.append(result)
            print(f"  SUCCESS: Embedding generated for {site_id}")
        else:
            print(f"  FAILED: No embedding for {site_id}")

    # Save results
    if results:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(results, f, indent=2)

        print(f"\n{'='*60}")
        print(f"COMPLETE: Generated embeddings for {len(results)} sites")
        print(f"Output saved to: {output_path}")
        print('='*60)
    else:
        print("\nNo embeddings generated!")
        sys.exit(1)


if __name__ == '__main__':
    main()
