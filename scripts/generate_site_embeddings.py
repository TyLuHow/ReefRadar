#!/usr/bin/env python3
"""
Generate SurfPerch embeddings for all 45 MARRS sites via Lambda.

For each site:
1. Reads up to 5 WAV files from data/marrs/samples/{site_id}/
2. Preprocesses audio (read WAV, normalize, resample to 32kHz, segment into 5s windows)
3. Uploads segments to S3 and invokes the inference Lambda
4. Averages all returned embeddings to create one 1280-dim mean embedding per site
5. Saves progress to data/marrs/embedding_progress.json (resumable)
6. Outputs final metadata to data/embeddings/metadata_v4.json

Usage:
    python scripts/generate_site_embeddings.py
    python scripts/generate_site_embeddings.py --dry-run
    python scripts/generate_site_embeddings.py --site ind_H4  # single site
"""

import argparse
import json
import os
import struct
import sys
import time
import uuid
from pathlib import Path

import boto3
import numpy as np

# SurfPerch constants
SAMPLE_RATE = 32000
WINDOW_SECONDS = 5.0
WINDOW_SAMPLES = int(SAMPLE_RATE * WINDOW_SECONDS)  # 160,000
EMBEDDING_DIM = 1280

# AWS config
AWS_REGION = 'us-east-1'
LAMBDA_FUNCTION = 'reefradar-2477-inference'
S3_BUCKET = 'reefradar-2477-embeddings'
S3_TEMP_PREFIX = 'temp/site_embedding_batches/'

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
SAMPLES_DIR = PROJECT_ROOT / 'data' / 'marrs' / 'samples'
MARRS_SITES_PATH = PROJECT_ROOT / 'data' / 'embeddings' / 'marrs_sites.json'
PROGRESS_PATH = PROJECT_ROOT / 'data' / 'marrs' / 'embedding_progress.json'
OUTPUT_PATH = PROJECT_ROOT / 'data' / 'embeddings' / 'metadata_v4.json'

# Batch settings
MAX_SEGMENTS_PER_BATCH = 10

# AWS clients
lambda_client = boto3.client('lambda', region_name=AWS_REGION)
s3_client = boto3.client('s3', region_name=AWS_REGION)


def load_progress():
    """Load embedding progress from JSON file."""
    if PROGRESS_PATH.exists():
        with open(PROGRESS_PATH) as f:
            return json.load(f)
    return {'completed': {}, 'failed': {}}


def save_progress(progress):
    """Save embedding progress to JSON file."""
    PROGRESS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_PATH, 'w') as f:
        json.dump(progress, f, indent=2)


def read_wav(filepath):
    """
    Read WAV file using pure Python (no dependencies).
    Returns (samples_array, sample_rate, num_channels).
    """
    with open(filepath, 'rb') as f:
        riff = f.read(4)
        if riff != b'RIFF':
            raise ValueError(f"Not a RIFF file: {filepath}")
        f.read(4)  # file size
        wave = f.read(4)
        if wave != b'WAVE':
            raise ValueError(f"Not a WAVE file: {filepath}")

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
                data_samples = f.read(chunk_size)
            else:
                f.read(chunk_size)

        if fmt_data is None or data_samples is None:
            raise ValueError(f"Missing fmt or data chunk: {filepath}")

        num_channels = struct.unpack('<H', fmt_data[2:4])[0]
        sample_rate = struct.unpack('<I', fmt_data[4:8])[0]
        bits_per_sample = struct.unpack('<H', fmt_data[14:16])[0]

        if bits_per_sample == 16:
            fmt_str = f'<{len(data_samples) // 2}h'
            samples = struct.unpack(fmt_str, data_samples)
        elif bits_per_sample == 24:
            samples = []
            for i in range(0, len(data_samples), 3):
                if i + 3 <= len(data_samples):
                    b = data_samples[i:i + 3]
                    val = struct.unpack('<i', b + (b'\xff' if b[2] & 0x80 else b'\x00'))[0]
                    samples.append(val // 256)
            samples = tuple(samples)
        elif bits_per_sample == 32:
            fmt_str = f'<{len(data_samples) // 4}i'
            samples = struct.unpack(fmt_str, data_samples)
        else:
            raise ValueError(f"Unsupported bit depth: {bits_per_sample}")

        return np.array(samples, dtype=np.float32), sample_rate, num_channels


def preprocess_audio(samples, source_rate, num_channels):
    """Preprocess audio: stereo->mono, resample to 32kHz, normalize."""
    if num_channels == 2:
        samples = samples.reshape(-1, 2).mean(axis=1)

    max_val = np.max(np.abs(samples))
    if max_val > 0:
        samples = samples / max_val

    if source_rate != SAMPLE_RATE:
        duration = len(samples) / source_rate
        new_length = int(duration * SAMPLE_RATE)
        indices = np.linspace(0, len(samples) - 1, new_length)
        samples = np.interp(indices, np.arange(len(samples)), samples)

    return samples.astype(np.float32)


def segment_audio(samples):
    """Segment audio into 5-second windows."""
    windows = []
    for start in range(0, len(samples) - WINDOW_SAMPLES + 1, WINDOW_SAMPLES):
        window = samples[start:start + WINDOW_SAMPLES]
        windows.append(window.tolist())
    return windows


def invoke_lambda_via_s3(segments, batch_id):
    """
    Upload segments to S3 and invoke Lambda.
    Returns list of 1280-dim embeddings.
    """
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
    except Exception:
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


def process_site(site_id, dry_run=False):
    """
    Process all WAV files for a site and return mean embedding info.
    """
    site_dir = SAMPLES_DIR / site_id
    wav_files = sorted(site_dir.glob('*.WAV'))
    if not wav_files:
        wav_files = sorted(site_dir.glob('*.wav'))

    if not wav_files:
        print(f"  No WAV files found for {site_id}")
        return None

    print(f"  Found {len(wav_files)} WAV files")

    if dry_run:
        return {'dry_run': True, 'num_files': len(wav_files)}

    all_embeddings = []
    segments_buffer = []
    files_processed = 0

    for wav_file in wav_files:
        try:
            samples, rate, channels = read_wav(str(wav_file))
            samples = preprocess_audio(samples, rate, channels)
            windows = segment_audio(samples)

            if not windows:
                print(f"    {wav_file.name}: too short, skipping")
                continue

            # Take first window from each file
            segments_buffer.append(windows[0])
            files_processed += 1

            # Process batch when buffer is full
            if len(segments_buffer) >= MAX_SEGMENTS_PER_BATCH:
                print(f"    Invoking Lambda with {len(segments_buffer)} segments...")
                try:
                    embeddings = invoke_lambda_via_s3(
                        segments_buffer, f"{site_id}_batch{len(all_embeddings)}"
                    )
                    all_embeddings.extend(embeddings)
                    print(f"    Got {len(embeddings)} embeddings (total: {len(all_embeddings)})")
                except Exception as e:
                    print(f"    Lambda error: {e}")
                segments_buffer = []
                time.sleep(0.5)

        except Exception as e:
            print(f"    Error with {wav_file.name}: {e}")
            continue

    # Process remaining segments
    if segments_buffer:
        print(f"    Invoking Lambda with final {len(segments_buffer)} segments...")
        try:
            embeddings = invoke_lambda_via_s3(
                segments_buffer, f"{site_id}_final"
            )
            all_embeddings.extend(embeddings)
            print(f"    Got {len(embeddings)} embeddings (total: {len(all_embeddings)})")
        except Exception as e:
            print(f"    Lambda error: {e}")

    if not all_embeddings:
        print(f"  No embeddings generated for {site_id}")
        return None

    mean_embedding = np.mean(all_embeddings, axis=0).tolist()
    print(f"  Mean embedding from {len(all_embeddings)} windows ({files_processed} files)")

    return {
        'mean_embedding': mean_embedding,
        'recordings_used': files_processed,
        'windows_processed': len(all_embeddings),
    }


def main():
    parser = argparse.ArgumentParser(description='Generate SurfPerch embeddings for MARRS sites')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done')
    parser.add_argument('--site', type=str, default=None, help='Process single site')
    parser.add_argument('--resume', action='store_true', help='Skip already completed sites')
    args = parser.parse_args()

    # Load site metadata
    with open(MARRS_SITES_PATH) as f:
        all_sites = json.load(f)

    # Build lookup
    site_lookup = {s['site_id']: s for s in all_sites}

    # Get list of sites with samples
    if args.site:
        site_ids = [args.site]
    else:
        site_ids = sorted([
            d.name for d in SAMPLES_DIR.iterdir()
            if d.is_dir() and any(d.glob('*.WAV')) or any(d.glob('*.wav'))
        ])

    progress = load_progress()

    if args.resume:
        site_ids = [s for s in site_ids if s not in progress['completed']]
        print(f"Resuming: {len(progress['completed'])} already done, {len(site_ids)} remaining")

    print(f"Sites to process: {len(site_ids)}")
    if args.dry_run:
        print("DRY RUN - no Lambda invocations will be made")
    print()

    completed_sites = []
    for i, site_id in enumerate(site_ids):
        print(f"\n[{i + 1}/{len(site_ids)}] {site_id}")

        # Skip if already completed (even without --resume flag, respect progress)
        if site_id in progress['completed'] and not args.dry_run:
            print(f"  Already completed, skipping")
            completed_sites.append(progress['completed'][site_id])
            continue

        result = process_site(site_id, dry_run=args.dry_run)

        if result and not args.dry_run:
            # Build site entry
            site_meta = site_lookup.get(site_id, {'site_id': site_id})
            site_entry = {
                'site_id': site_id,
                'country': site_meta.get('country', 'Unknown'),
                'region': site_meta.get('status', 'unknown'),
                'status': site_meta.get('status', 'unknown'),
                'site_type': site_meta.get('status', 'unknown'),
                'latitude': site_meta.get('latitude'),
                'longitude': site_meta.get('longitude'),
                'recordings_used': result['recordings_used'],
                'windows_processed': result['windows_processed'],
                'synthetic': False,
                'mean_embedding': result['mean_embedding'],
            }
            progress['completed'][site_id] = site_entry
            completed_sites.append(site_entry)
            save_progress(progress)
            print(f"  SUCCESS")
        elif result is None and not args.dry_run:
            progress['failed'][site_id] = 'no_embeddings'
            save_progress(progress)
            print(f"  FAILED")

    if args.dry_run:
        print(f"\nDry run complete. Would process {len(site_ids)} sites.")
        return

    # Build metadata_v4.json
    print(f"\n{'=' * 60}")
    print(f"Building metadata_v4.json with {len(completed_sites)} sites")
    print('=' * 60)

    metadata = {
        'version': '4.0',
        'source': 'MARRS dataset (DOI: 10.5522/04/29958062)',
        'embedding_dimension': EMBEDDING_DIM,
        'model': 'surfperch_v1',
        'sites': completed_sites,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"Saved to: {OUTPUT_PATH}")
    print(f"Total sites: {len(completed_sites)}")

    # Summary by country
    from collections import Counter
    countries = Counter(s['country'] for s in completed_sites)
    for country, count in sorted(countries.items()):
        print(f"  {country}: {count} sites")

    failed = progress.get('failed', {})
    if failed:
        print(f"\nFailed sites ({len(failed)}):")
        for site_id, reason in failed.items():
            print(f"  {site_id}: {reason}")


if __name__ == '__main__':
    main()
