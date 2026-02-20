#!/usr/bin/env python3
"""
Generate SurfPerch embeddings from MARRS coral reef audio for training.

This script:
1. Scans local audio files or S3 bucket for WAV files
2. Groups by site and label for balanced sampling
3. Preprocesses audio to 32kHz mono
4. Uploads segments to S3 and invokes inference Lambda in batches
5. Aggregates results into a labeled training dataset
6. Supports resume from intermediate checkpoints

Usage:
    # Process local files (default)
    python scripts/generate_training_embeddings.py --audio-dir data/marrs_audio

    # Limit samples per site for cost control
    python scripts/generate_training_embeddings.py --max-per-site 100

    # Resume from checkpoint
    python scripts/generate_training_embeddings.py --resume

    # Dry run to estimate costs
    python scripts/generate_training_embeddings.py --dry-run
"""

import argparse
import json
import os
import struct
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import boto3
import numpy as np

# =============================================================================
# Configuration
# =============================================================================

# SurfPerch model specs
SAMPLE_RATE = 32000  # 32 kHz target
WINDOW_SECONDS = 5.0
WINDOW_SAMPLES = int(SAMPLE_RATE * WINDOW_SECONDS)  # 160,000 samples
EMBEDDING_DIM = 1280

# AWS configuration
AWS_REGION = 'us-east-1'
INFERENCE_FUNCTION = 'reefradar-2477-inference'
EMBEDDINGS_BUCKET = 'reefradar-2477-embeddings'
TEMP_PREFIX = 'temp/training_batches/'
OUTPUT_PREFIX = 'training/'

# Batch processing settings
SEGMENTS_PER_BATCH = 10  # Segments per Lambda invocation
MAX_CONCURRENT_LAMBDAS = 10  # Parallel Lambda invocations
RETRY_DELAYS = [1, 2, 4, 8]  # Exponential backoff in seconds

# Label mapping from site codes
LABEL_MAP = {
    'H': 'healthy',
    'D': 'degraded',
    'R': 'restored_mid',
    'N': 'restored_early'
}

# Country codes from site prefixes
COUNTRY_MAP = {
    'aus': 'australia',
    'ind': 'indonesia',
    'ken': 'kenya',
    'mal': 'maldives',
    'mex': 'mexico'
}

# Cost estimates (us-east-1 pricing)
LAMBDA_COST_PER_GB_SEC = 0.0000166667
LAMBDA_MEMORY_GB = 3.0  # Inference Lambda uses 3GB
LAMBDA_DURATION_SEC = 30  # Average duration per invocation
S3_PUT_COST = 0.000005  # $0.005 per 1000 requests


# =============================================================================
# AWS Clients
# =============================================================================

s3_client = boto3.client('s3', region_name=AWS_REGION)
lambda_client = boto3.client('lambda', region_name=AWS_REGION)


# =============================================================================
# Audio Processing Functions
# =============================================================================

def read_wav(filepath):
    """
    Read WAV file using pure Python (no external dependencies).
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

        # Find fmt and data chunks
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

        # Parse fmt chunk
        num_channels = struct.unpack('<H', fmt_data[2:4])[0]
        sample_rate = struct.unpack('<I', fmt_data[4:8])[0]
        bits_per_sample = struct.unpack('<H', fmt_data[14:16])[0]

        # Convert to samples
        if bits_per_sample == 16:
            fmt_str = f'<{len(data_samples)//2}h'
            samples = struct.unpack(fmt_str, data_samples)
        elif bits_per_sample == 24:
            samples = []
            for i in range(0, len(data_samples), 3):
                if i + 3 <= len(data_samples):
                    b = data_samples[i:i+3]
                    val = struct.unpack('<i', b + (b'\xff' if b[2] & 0x80 else b'\x00'))[0]
                    samples.append(val // 256)
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

    # Resample if needed (linear interpolation)
    if source_rate != SAMPLE_RATE:
        duration = len(samples) / source_rate
        new_length = int(duration * SAMPLE_RATE)
        indices = np.linspace(0, len(samples) - 1, new_length)
        samples = np.interp(indices, np.arange(len(samples)), samples)

    return samples.astype(np.float32)


def extract_first_window(samples):
    """Extract first 5-second window (160,000 samples) from audio."""
    if len(samples) < WINDOW_SAMPLES:
        # Pad with zeros if too short
        padded = np.zeros(WINDOW_SAMPLES, dtype=np.float32)
        padded[:len(samples)] = samples
        return padded
    return samples[:WINDOW_SAMPLES]


# =============================================================================
# File Discovery Functions
# =============================================================================

def parse_filename(filename):
    """
    Parse site_id, timestamp from filename.
    E.g., 'ind_D2_20220830_124200.WAV' -> ('ind_D2', '2022-08-30T12:42:00')
    """
    basename = Path(filename).stem
    parts = basename.split('_')

    if len(parts) >= 4:
        country_code = parts[0]
        site_code = parts[1]
        date_str = parts[2]
        time_str = parts[3]

        site_id = f"{country_code}_{site_code}"

        # Parse timestamp
        try:
            timestamp = datetime.strptime(f"{date_str}_{time_str}", "%Y%m%d_%H%M%S")
            timestamp_str = timestamp.isoformat()
        except ValueError:
            timestamp_str = None

        return site_id, timestamp_str

    return None, None


def get_label_from_site(site_id):
    """
    Get label from site ID.
    E.g., 'ind_D2' -> 'degraded', 'ken_H1' -> 'healthy'
    """
    parts = site_id.split('_')
    if len(parts) >= 2:
        site_code = parts[1]
        if site_code and site_code[0] in LABEL_MAP:
            return LABEL_MAP[site_code[0]]
    return 'unknown'


def get_country_from_site(site_id):
    """
    Get country from site ID.
    E.g., 'ind_D2' -> 'indonesia'
    """
    parts = site_id.split('_')
    if parts:
        prefix = parts[0].lower()
        return COUNTRY_MAP.get(prefix, 'unknown')
    return 'unknown'


def discover_local_files(audio_dir, max_per_site=None):
    """
    Discover WAV files from local directory.
    Returns dict: {site_id: [file_paths]}
    """
    audio_path = Path(audio_dir)
    files_by_site = {}

    # Find all WAV files (both in root and subdirectories)
    all_wav_files = list(audio_path.glob('**/*.WAV'))
    all_wav_files.extend(audio_path.glob('**/*.wav'))

    for filepath in all_wav_files:
        # Skip empty files
        if filepath.stat().st_size < 1000:
            continue

        site_id, _ = parse_filename(filepath.name)
        if site_id:
            if site_id not in files_by_site:
                files_by_site[site_id] = []
            files_by_site[site_id].append(str(filepath))

    # Apply max_per_site limit with stratified sampling (spread across time)
    if max_per_site:
        for site_id in files_by_site:
            files = sorted(files_by_site[site_id])
            if len(files) > max_per_site:
                # Sample evenly across the sorted files
                step = len(files) / max_per_site
                indices = [int(i * step) for i in range(max_per_site)]
                files_by_site[site_id] = [files[i] for i in indices]

    return files_by_site


# =============================================================================
# Lambda Invocation Functions
# =============================================================================

def invoke_inference_lambda(segments, batch_id, retry_count=0):
    """
    Upload segments to S3 and invoke inference Lambda.
    Returns list of embeddings or raises exception.
    """
    # Upload segments to S3
    s3_key = f"{TEMP_PREFIX}{batch_id}.json"
    payload = {
        'segments': [seg.tolist() if isinstance(seg, np.ndarray) else seg for seg in segments],
        'sample_rate': SAMPLE_RATE
    }

    s3_client.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key=s3_key,
        Body=json.dumps(payload).encode(),
        ContentType='application/json'
    )

    try:
        # Invoke Lambda
        response = lambda_client.invoke(
            FunctionName=INFERENCE_FUNCTION,
            InvocationType='RequestResponse',
            Payload=json.dumps({
                's3_bucket': EMBEDDINGS_BUCKET,
                's3_key': s3_key
            }).encode()
        )

        # Parse response
        result = json.loads(response['Payload'].read().decode())

        if result.get('statusCode') == 200:
            body = result.get('body', {})
            if isinstance(body, str):
                body = json.loads(body)
            embeddings = body.get('embeddings', [])

            if embeddings:
                return embeddings
            else:
                raise RuntimeError("Empty embeddings returned")
        else:
            error = result.get('body', {})
            if isinstance(error, str):
                error = json.loads(error)
            raise RuntimeError(f"Lambda error: {error.get('error', 'Unknown error')}")

    finally:
        # Clean up temp S3 object
        try:
            s3_client.delete_object(Bucket=EMBEDDINGS_BUCKET, Key=s3_key)
        except Exception:
            pass


def process_batch_with_retry(batch_info):
    """
    Process a batch of files with retry logic.
    batch_info: (batch_id, file_metadata_list)
    Returns: (batch_id, results_list) or (batch_id, error)
    """
    batch_id, file_metadata_list = batch_info

    # Load and preprocess audio
    segments = []
    valid_metadata = []

    for meta in file_metadata_list:
        try:
            samples, rate, channels = read_wav(meta['filepath'])
            processed = preprocess_audio(samples, rate, channels)
            window = extract_first_window(processed)
            segments.append(window)
            valid_metadata.append(meta)
        except Exception as e:
            print(f"    Skipping {meta['filepath']}: {e}")

    if not segments:
        return batch_id, []

    # Invoke Lambda with retries
    for attempt in range(len(RETRY_DELAYS) + 1):
        try:
            embeddings = invoke_inference_lambda(segments, batch_id)

            # Pair embeddings with metadata
            results = []
            for i, emb in enumerate(embeddings):
                if i < len(valid_metadata):
                    meta = valid_metadata[i]
                    results.append({
                        'file_id': Path(meta['filepath']).stem,
                        'site_id': meta['site_id'],
                        'country': meta['country'],
                        'label': meta['label'],
                        'embedding': emb,
                        'timestamp': meta['timestamp']
                    })

            return batch_id, results

        except Exception as e:
            if attempt < len(RETRY_DELAYS):
                delay = RETRY_DELAYS[attempt]
                print(f"    Batch {batch_id} attempt {attempt+1} failed: {e}. Retrying in {delay}s...")
                time.sleep(delay)
            else:
                print(f"    Batch {batch_id} failed after {len(RETRY_DELAYS)+1} attempts: {e}")
                return batch_id, {'error': str(e)}

    return batch_id, {'error': 'Max retries exceeded'}


# =============================================================================
# Progress and Checkpoint Functions
# =============================================================================

def save_checkpoint(checkpoint_path, processed_batches, results):
    """Save intermediate results to checkpoint file."""
    checkpoint = {
        'processed_batches': list(processed_batches),
        'results': results,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    with open(checkpoint_path, 'w') as f:
        json.dump(checkpoint, f)


def load_checkpoint(checkpoint_path):
    """Load checkpoint if it exists."""
    if Path(checkpoint_path).exists():
        with open(checkpoint_path) as f:
            return json.load(f)
    return None


def estimate_costs(total_files, segments_per_batch):
    """Estimate Lambda and S3 costs."""
    num_batches = (total_files + segments_per_batch - 1) // segments_per_batch

    # Lambda costs
    lambda_cost = num_batches * LAMBDA_MEMORY_GB * LAMBDA_DURATION_SEC * LAMBDA_COST_PER_GB_SEC

    # S3 costs (PUT for temp files, PUT for final output)
    s3_cost = (num_batches + 2) * S3_PUT_COST

    return {
        'num_batches': num_batches,
        'lambda_cost': lambda_cost,
        's3_cost': s3_cost,
        'total_cost': lambda_cost + s3_cost
    }


# =============================================================================
# Main Processing Functions
# =============================================================================

def process_all_files(files_by_site, checkpoint_path, max_workers=MAX_CONCURRENT_LAMBDAS):
    """
    Process all files and generate embeddings.
    Returns list of sample dictionaries.
    """
    # Load checkpoint if resuming
    checkpoint = load_checkpoint(checkpoint_path)
    processed_batches = set(checkpoint['processed_batches']) if checkpoint else set()
    all_results = checkpoint['results'] if checkpoint else []

    # Prepare batches
    batches = []
    batch_id = 0
    current_batch = []

    for site_id, filepaths in sorted(files_by_site.items()):
        label = get_label_from_site(site_id)
        country = get_country_from_site(site_id)

        for filepath in filepaths:
            _, timestamp = parse_filename(Path(filepath).name)

            current_batch.append({
                'filepath': filepath,
                'site_id': site_id,
                'label': label,
                'country': country,
                'timestamp': timestamp
            })

            if len(current_batch) >= SEGMENTS_PER_BATCH:
                batch_key = f"batch_{batch_id:06d}"
                if batch_key not in processed_batches:
                    batches.append((batch_key, current_batch))
                batch_id += 1
                current_batch = []

    # Add remaining files
    if current_batch:
        batch_key = f"batch_{batch_id:06d}"
        if batch_key not in processed_batches:
            batches.append((batch_key, current_batch))

    if not batches:
        print("All batches already processed (from checkpoint)")
        return all_results

    print(f"\nProcessing {len(batches)} batches with {max_workers} workers...")
    print(f"Already processed: {len(processed_batches)} batches, {len(all_results)} samples")

    # Process batches in parallel
    completed = 0
    errors = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_batch_with_retry, batch): batch[0] for batch in batches}

        for future in as_completed(futures):
            batch_id = futures[future]

            try:
                result_batch_id, results = future.result()

                if isinstance(results, dict) and 'error' in results:
                    errors += 1
                    print(f"  Batch {batch_id}: ERROR - {results['error']}")
                else:
                    all_results.extend(results)
                    processed_batches.add(batch_id)
                    completed += 1

                    # Progress update
                    if completed % 10 == 0 or completed == len(batches):
                        elapsed = time.time() - start_time
                        rate = completed / elapsed if elapsed > 0 else 0
                        remaining = (len(batches) - completed) / rate if rate > 0 else 0
                        print(f"  Progress: {completed}/{len(batches)} batches "
                              f"({len(all_results)} samples, {errors} errors, "
                              f"ETA: {remaining:.0f}s)")

                    # Save checkpoint periodically
                    if completed % 50 == 0:
                        save_checkpoint(checkpoint_path, processed_batches, all_results)

            except Exception as e:
                errors += 1
                print(f"  Batch {batch_id}: EXCEPTION - {e}")

    # Final checkpoint save
    save_checkpoint(checkpoint_path, processed_batches, all_results)

    return all_results


def create_training_dataset(results):
    """
    Create the final training dataset structure.
    """
    # Calculate label distribution
    label_counts = {}
    for sample in results:
        label = sample.get('label', 'unknown')
        label_counts[label] = label_counts.get(label, 0) + 1

    dataset = {
        'version': '1.0',
        'model': 'surfperch_v1',
        'generated_date': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'total_samples': len(results),
        'samples': results,
        'label_distribution': label_counts
    }

    return dataset


def upload_to_s3(dataset, key):
    """Upload dataset to S3."""
    s3_client.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key=key,
        Body=json.dumps(dataset).encode(),
        ContentType='application/json'
    )
    print(f"Uploaded to s3://{EMBEDDINGS_BUCKET}/{key}")


def verify_embeddings(results, num_samples=5):
    """Verify embeddings are valid."""
    print("\n=== Embedding Verification ===")

    # Sample some embeddings
    import random
    samples = random.sample(results, min(num_samples, len(results)))

    all_valid = True
    for sample in samples:
        emb = np.array(sample['embedding'])

        # Check dimension
        if len(emb) != EMBEDDING_DIM:
            print(f"  ERROR: {sample['file_id']} has wrong dimension: {len(emb)}")
            all_valid = False
            continue

        # Check not all zeros
        if np.allclose(emb, 0):
            print(f"  ERROR: {sample['file_id']} is all zeros")
            all_valid = False
            continue

        # Check reasonable range
        if np.max(np.abs(emb)) > 10:
            print(f"  WARNING: {sample['file_id']} has large values: max={np.max(np.abs(emb)):.2f}")

        print(f"  OK: {sample['file_id']} - dim={len(emb)}, "
              f"mean={np.mean(emb):.4f}, std={np.std(emb):.4f}, "
              f"range=[{np.min(emb):.4f}, {np.max(emb):.4f}]")

    return all_valid


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Generate SurfPerch embeddings for MARRS training data'
    )
    parser.add_argument(
        '--audio-dir',
        default='data/marrs_audio',
        help='Local directory containing WAV files'
    )
    parser.add_argument(
        '--max-per-site',
        type=int,
        default=None,
        help='Maximum files per site (for cost control)'
    )
    parser.add_argument(
        '--max-workers',
        type=int,
        default=MAX_CONCURRENT_LAMBDAS,
        help=f'Maximum concurrent Lambda invocations (default: {MAX_CONCURRENT_LAMBDAS})'
    )
    parser.add_argument(
        '--resume',
        action='store_true',
        help='Resume from checkpoint'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Estimate costs without processing'
    )
    parser.add_argument(
        '--output',
        default='training_dataset.json',
        help='Output filename in S3'
    )
    parser.add_argument(
        '--checkpoint',
        default='data/training/checkpoint.json',
        help='Checkpoint file path'
    )
    parser.add_argument(
        '-y', '--yes',
        action='store_true',
        help='Skip confirmation prompt'
    )
    args = parser.parse_args()

    # Ensure checkpoint directory exists
    Path(args.checkpoint).parent.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("MARRS Training Embeddings Generator")
    print("=" * 60)

    # Discover files
    print(f"\nScanning {args.audio_dir} for WAV files...")
    files_by_site = discover_local_files(args.audio_dir, args.max_per_site)

    # Summary
    total_files = sum(len(f) for f in files_by_site.values())
    print(f"\nDiscovered {total_files} files across {len(files_by_site)} sites:")

    label_summary = {}
    for site_id, files in sorted(files_by_site.items()):
        label = get_label_from_site(site_id)
        label_summary[label] = label_summary.get(label, 0) + len(files)
        print(f"  {site_id}: {len(files)} files ({label})")

    print(f"\nLabel distribution:")
    for label, count in sorted(label_summary.items()):
        print(f"  {label}: {count} files")

    # Cost estimation
    costs = estimate_costs(total_files, SEGMENTS_PER_BATCH)
    print(f"\nCost estimate:")
    print(f"  Lambda invocations: {costs['num_batches']}")
    print(f"  Lambda cost: ${costs['lambda_cost']:.4f}")
    print(f"  S3 cost: ${costs['s3_cost']:.6f}")
    print(f"  Total estimated: ${costs['total_cost']:.4f}")

    if args.dry_run:
        print("\n[DRY RUN] Exiting without processing")
        return

    # Confirmation for large runs
    if total_files > 1000 and not args.resume and not args.yes:
        response = input(f"\nProcess {total_files} files? [y/N] ")
        if response.lower() != 'y':
            print("Aborted")
            return

    # Process files
    print("\n" + "=" * 60)
    print("Starting embedding generation...")
    print("=" * 60)

    start_time = time.time()
    results = process_all_files(
        files_by_site,
        args.checkpoint,
        max_workers=args.max_workers
    )
    elapsed = time.time() - start_time

    print(f"\nCompleted in {elapsed:.1f}s")
    print(f"Generated {len(results)} embeddings")

    if not results:
        print("ERROR: No embeddings generated!")
        sys.exit(1)

    # Verify embeddings
    if not verify_embeddings(results):
        print("\nWARNING: Some embeddings failed verification")

    # Create dataset
    dataset = create_training_dataset(results)

    # Save locally
    local_output = Path('data/training') / args.output
    local_output.parent.mkdir(parents=True, exist_ok=True)
    with open(local_output, 'w') as f:
        json.dump(dataset, f)
    print(f"\nSaved locally: {local_output}")

    # Upload to S3
    s3_key = f"{OUTPUT_PREFIX}{args.output}"
    upload_to_s3(dataset, s3_key)

    # Create metadata file
    metadata = {
        'version': '1.0',
        'generated_date': datetime.now(timezone.utc).isoformat(),
        'total_samples': len(results),
        'embedding_dim': EMBEDDING_DIM,
        'model': 'surfperch_v1',
        'label_distribution': dataset['label_distribution'],
        'sites_processed': list(files_by_site.keys()),
        'processing_time_seconds': elapsed,
        'estimated_cost_usd': costs['total_cost']
    }

    metadata_key = f"{OUTPUT_PREFIX}metadata.json"
    upload_to_s3(metadata, metadata_key)

    # Final summary
    print("\n" + "=" * 60)
    print("COMPLETE")
    print("=" * 60)
    print(f"Total samples: {len(results)}")
    print(f"Label distribution: {dataset['label_distribution']}")
    print(f"Processing time: {elapsed:.1f}s")
    print(f"Estimated cost: ${costs['total_cost']:.4f}")
    print(f"\nOutput files:")
    print(f"  Local: {local_output}")
    print(f"  S3: s3://{EMBEDDINGS_BUCKET}/{s3_key}")
    print(f"  Metadata: s3://{EMBEDDINGS_BUCKET}/{metadata_key}")


if __name__ == '__main__':
    main()
