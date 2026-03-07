#!/usr/bin/env python3
"""
Expand Reference Sites with Real MARRS Audio Data

Downloads real coral reef audio from MARRS Figshare dataset,
generates real SurfPerch embeddings via inference Lambda,
and updates metadata.json with new reference sites.

NO SYNTHETIC AUDIO - ALL REAL DATA.

Priority sites (15 total):
- Australia: aus_H1, aus_D1, aus_R1 (new country)
- Mexico: mex_H1, mex_D1, mex_R1, mex_N1 (new country)
- Maldives: mal_H1, mal_D1, mal_N1 (new country)
- Kenya: ken_D1, ken_N1 (fill gaps)
- Indonesia: ind_R1, ind_R2, ind_R3 (restored_mid class)

Usage:
    python scripts/expand_reference_sites.py
    python scripts/expand_reference_sites.py --sites aus_H1,mex_H1
    python scripts/expand_reference_sites.py --dry-run
"""

import argparse
import json
import os
import random
import struct
import sys
import tempfile
import time
import zipfile
from datetime import datetime
from pathlib import Path

import boto3
import numpy as np
import requests

# Configuration
AWS_REGION = 'us-east-1'
INFERENCE_FUNCTION = 'reefradar-2477-inference'
EMBEDDINGS_BUCKET = 'reefradar-2477-embeddings'
FIGSHARE_API_URL = "https://api.figshare.com/v2/articles/29958062/files"

# Audio processing
SAMPLE_RATE = 32000  # SurfPerch expects 32kHz
WINDOW_SAMPLES = 160000  # 5 seconds at 32kHz
SAMPLES_PER_SITE = 50  # Audio files to process per site
MAX_SEGMENTS_PER_BATCH = 10  # Lambda batch size

# Priority sites for expansion (15 sites)
PRIORITY_SITES = [
    # Australia (new country)
    'aus_H1', 'aus_D1', 'aus_R1',
    # Mexico (new country)
    'mex_H1', 'mex_D1', 'mex_R1', 'mex_N1',
    # Maldives (new country)
    'mal_H1', 'mal_D1', 'mal_N1',
    # Kenya (fill gaps - already have ken_H1)
    'ken_D1', 'ken_N1',
    # Indonesia (restored_mid class)
    'ind_R1', 'ind_R2', 'ind_R3',
]

# AWS clients
s3 = boto3.client('s3', region_name=AWS_REGION)
lambda_client = boto3.client('lambda', region_name=AWS_REGION)


def load_site_metadata():
    """Load site metadata from marrs_sites.json."""
    path = Path(__file__).parent.parent / 'data' / 'embeddings' / 'marrs_sites.json'
    with open(path) as f:
        sites = json.load(f)
    return {s['site_id']: s for s in sites}


def get_figshare_files():
    """Fetch file listing from Figshare API."""
    print("Fetching Figshare file list...")
    all_files = []
    page = 1

    while True:
        response = requests.get(f"{FIGSHARE_API_URL}?page={page}&page_size=50")
        response.raise_for_status()
        files = response.json()
        if not files:
            break
        all_files.extend(files)
        page += 1

    # Build site -> file mapping
    site_files = {}
    for f in all_files:
        name = f['name']
        if name.endswith('.zip') and not name.startswith('detect'):
            site_id = name.replace('.zip', '')
            site_files[site_id] = {
                'download_url': f['download_url'],
                'file_id': f['id'],
                'size': f['size']
            }

    print(f"  Found {len(site_files)} site ZIP files")
    return site_files


def download_and_sample_site(site_id, figshare_info, num_samples):
    """Download ZIP from Figshare and extract sampled WAV files."""
    print(f"  Downloading {site_id} from Figshare...")

    # Get fresh download URL (Figshare URLs expire)
    file_id = figshare_info['file_id']
    response = requests.get(f"https://api.figshare.com/v2/file/download/{file_id}")
    download_url = response.url if response.status_code == 200 else figshare_info['download_url']

    # Download ZIP to temp file
    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
        print(f"    Downloading ZIP ({figshare_info['size'] / 1e9:.2f} GB)...")
        r = requests.get(download_url, stream=True, allow_redirects=True)
        r.raise_for_status()

        downloaded = 0
        for chunk in r.iter_content(chunk_size=8 * 1024 * 1024):
            if chunk:
                tmp.write(chunk)
                downloaded += len(chunk)
                if downloaded % (100 * 1024 * 1024) < len(chunk):
                    print(f"      {downloaded / 1e9:.2f} GB downloaded...")

        tmp_path = tmp.name

    print(f"    Download complete: {downloaded / 1e9:.2f} GB")

    # Extract sampled WAV files
    wav_data = []
    try:
        with zipfile.ZipFile(tmp_path, 'r') as zf:
            wav_files = [n for n in zf.namelist() if n.lower().endswith('.wav')]
            print(f"    Found {len(wav_files)} WAV files in archive")

            # Smart sampling: try to spread across time of day
            selected = smart_sample_files(wav_files, num_samples)
            print(f"    Sampling {len(selected)} files...")

            for wav_name in selected:
                try:
                    data = zf.read(wav_name)
                    wav_data.append((wav_name, data))
                except Exception as e:
                    print(f"      Error reading {wav_name}: {e}")
    finally:
        os.unlink(tmp_path)

    print(f"    Extracted {len(wav_data)} WAV files")
    return wav_data


def smart_sample_files(wav_files, num_samples):
    """Sample files to maximize temporal diversity."""
    if len(wav_files) <= num_samples:
        return wav_files

    # Try to parse hour from filename and spread samples across hours
    by_hour = {h: [] for h in range(24)}
    unparseable = []

    for filename in wav_files:
        try:
            basename = os.path.basename(filename)
            parts = basename.replace('.wav', '').replace('.WAV', '').split('_')
            if len(parts) >= 3:
                time_part = parts[-1]
                hour = int(time_part[:2])
                by_hour[hour].append(filename)
            else:
                unparseable.append(filename)
        except (ValueError, IndexError):
            unparseable.append(filename)

    # Distribute samples across hours
    selected = []
    hours_with_files = [h for h in range(24) if by_hour[h]]

    if hours_with_files:
        samples_per_hour = num_samples // len(hours_with_files)
        extra = num_samples % len(hours_with_files)

        for i, hour in enumerate(hours_with_files):
            n = samples_per_hour + (1 if i < extra else 0)
            hour_files = by_hour[hour]
            if len(hour_files) <= n:
                selected.extend(hour_files)
            else:
                selected.extend(random.sample(hour_files, n))

    # Fill remaining with random if needed
    if len(selected) < num_samples:
        remaining = [f for f in wav_files if f not in selected]
        needed = num_samples - len(selected)
        selected.extend(random.sample(remaining, min(needed, len(remaining))))

    return selected[:num_samples]


def read_wav_bytes(wav_bytes):
    """Read WAV file from bytes and return audio samples."""
    import io
    f = io.BytesIO(wav_bytes)

    # RIFF header
    riff = f.read(4)
    if riff != b'RIFF':
        raise ValueError("Not a valid WAV file")

    f.read(4)  # file size
    wave = f.read(4)
    if wave != b'WAVE':
        raise ValueError("Not a valid WAV file")

    # Find fmt and data chunks
    sample_rate = None
    num_channels = None
    bits_per_sample = None
    audio_data = None

    while True:
        chunk_id = f.read(4)
        if len(chunk_id) < 4:
            break
        chunk_size = struct.unpack('<I', f.read(4))[0]

        if chunk_id == b'fmt ':
            fmt_data = f.read(chunk_size)
            num_channels = struct.unpack('<H', fmt_data[2:4])[0]
            sample_rate = struct.unpack('<I', fmt_data[4:8])[0]
            bits_per_sample = struct.unpack('<H', fmt_data[14:16])[0]
        elif chunk_id == b'data':
            audio_data = f.read(chunk_size)
        else:
            f.read(chunk_size)

    if audio_data is None:
        raise ValueError("No data chunk found")

    # Convert to samples
    if bits_per_sample == 16:
        samples = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
    elif bits_per_sample == 24:
        samples = []
        for i in range(0, len(audio_data), 3):
            if i + 3 <= len(audio_data):
                b = audio_data[i:i+3]
                val = struct.unpack('<i', b + (b'\xff' if b[2] & 0x80 else b'\x00'))[0]
                samples.append(val / 8388608.0)
        samples = np.array(samples, dtype=np.float32)
    else:
        raise ValueError(f"Unsupported bit depth: {bits_per_sample}")

    # Convert to mono
    if num_channels == 2:
        samples = samples.reshape(-1, 2).mean(axis=1)

    return samples, sample_rate


def resample_audio(samples, orig_sr, target_sr=SAMPLE_RATE):
    """Resample audio to target sample rate."""
    if orig_sr == target_sr:
        return samples

    ratio = target_sr / orig_sr
    new_length = int(len(samples) * ratio)
    indices = np.linspace(0, len(samples) - 1, new_length)
    return np.interp(indices, np.arange(len(samples)), samples).astype(np.float32)


def invoke_inference_lambda(segments):
    """Invoke inference Lambda to get SurfPerch embeddings."""
    import uuid

    batch_key = f'temp/expand_{uuid.uuid4().hex[:8]}.json'
    batch_data = {
        'segments': [s.tolist() for s in segments],
        'sample_rate': SAMPLE_RATE
    }

    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key=batch_key,
        Body=json.dumps(batch_data),
        ContentType='application/json'
    )

    try:
        response = lambda_client.invoke(
            FunctionName=INFERENCE_FUNCTION,
            InvocationType='RequestResponse',
            Payload=json.dumps({
                's3_bucket': EMBEDDINGS_BUCKET,
                's3_key': batch_key
            })
        )

        if 'FunctionError' in response:
            payload = json.loads(response['Payload'].read().decode())
            raise Exception(f"Lambda error: {payload}")

        payload = json.loads(response['Payload'].read().decode())
        body = payload.get('body', {})
        if isinstance(body, str):
            body = json.loads(body)

        return body.get('embeddings', [])

    finally:
        try:
            s3.delete_object(Bucket=EMBEDDINGS_BUCKET, Key=batch_key)
        except:
            pass


def process_site(site_id, site_metadata, figshare_files, dry_run=False):
    """Process a single site: download audio, generate embeddings."""
    print(f"\n{'='*60}")
    print(f"Processing site: {site_id}")
    print(f"  Country: {site_metadata.get('country', 'Unknown')}")
    print(f"  Status: {site_metadata.get('status', 'Unknown')}")
    print('='*60)

    if site_id not in figshare_files:
        print(f"  ERROR: Site {site_id} not found in Figshare dataset")
        return None

    figshare_info = figshare_files[site_id]

    if dry_run:
        print(f"  [DRY RUN] Would download {figshare_info['size'] / 1e9:.2f} GB")
        print(f"  [DRY RUN] Would process {SAMPLES_PER_SITE} audio files")
        return {'dry_run': True}

    # Download and sample audio files
    wav_data = download_and_sample_site(site_id, figshare_info, SAMPLES_PER_SITE)

    if not wav_data:
        print(f"  ERROR: No WAV files extracted")
        return None

    # Process audio files and collect segments
    all_embeddings = []
    segments_buffer = []

    print(f"  Processing {len(wav_data)} audio files...")

    for i, (wav_name, wav_bytes) in enumerate(wav_data):
        try:
            # Read and preprocess audio
            samples, orig_sr = read_wav_bytes(wav_bytes)
            samples = resample_audio(samples, orig_sr, SAMPLE_RATE)

            # Normalize
            max_val = np.max(np.abs(samples))
            if max_val > 0:
                samples = samples / max_val

            # Extract 5-second segment
            if len(samples) >= WINDOW_SAMPLES:
                start = random.randint(0, len(samples) - WINDOW_SAMPLES)
                segment = samples[start:start + WINDOW_SAMPLES]
                segments_buffer.append(segment)

            # Process batch when full
            if len(segments_buffer) >= MAX_SEGMENTS_PER_BATCH:
                print(f"    Invoking Lambda with {len(segments_buffer)} segments...")
                try:
                    embeddings = invoke_inference_lambda(segments_buffer)
                    all_embeddings.extend(embeddings)
                    print(f"      Got {len(embeddings)} embeddings")
                except Exception as e:
                    print(f"      Lambda error: {e}")
                segments_buffer = []
                time.sleep(0.5)  # Rate limiting

        except Exception as e:
            print(f"    Error processing {wav_name}: {e}")
            continue

    # Process remaining segments
    if segments_buffer:
        print(f"    Invoking Lambda with final {len(segments_buffer)} segments...")
        try:
            embeddings = invoke_inference_lambda(segments_buffer)
            all_embeddings.extend(embeddings)
            print(f"      Got {len(embeddings)} embeddings")
        except Exception as e:
            print(f"      Lambda error: {e}")

    if not all_embeddings:
        print(f"  ERROR: No embeddings generated")
        return None

    # Compute mean embedding
    mean_embedding = np.mean(all_embeddings, axis=0).tolist()

    print(f"  SUCCESS: Generated mean embedding from {len(all_embeddings)} windows")
    print(f"    Embedding dimension: {len(mean_embedding)}")

    return {
        'site_id': site_id,
        'country': site_metadata.get('country', 'Unknown'),
        'status': site_metadata.get('status', 'Unknown'),
        'latitude': site_metadata.get('latitude', 0),
        'longitude': site_metadata.get('longitude', 0),
        'embedding': mean_embedding,
        'recordings_used': len(wav_data),
        'windows_processed': len(all_embeddings),
        'synthetic': False,
        'model': 'surfperch',
        'model_version': '1.0',
        'generated_date': datetime.now().strftime('%Y-%m-%d')
    }


def load_current_metadata():
    """Load current reference site metadata."""
    path = Path(__file__).parent.parent / 'data' / 'embeddings' / 'metadata.json'
    with open(path) as f:
        data = json.load(f)

    # Handle both old (list) and new (dict with 'sites') formats
    if isinstance(data, dict) and 'sites' in data:
        return data
    else:
        return {
            'version': '2.0',
            'source': 'MARRS Coral Reef Soundscapes',
            'sites': data if isinstance(data, list) else []
        }


def save_updated_metadata(metadata):
    """Save updated metadata to file and S3."""
    path = Path(__file__).parent.parent / 'data' / 'embeddings' / 'metadata.json'

    # Update version
    metadata['version'] = '3.0'
    metadata['last_updated'] = datetime.now().isoformat()

    # Save locally
    with open(path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"\nSaved updated metadata to {path}")

    # Upload to S3
    s3.put_object(
        Bucket=EMBEDDINGS_BUCKET,
        Key='reference/metadata.json',
        Body=json.dumps(metadata),
        ContentType='application/json'
    )
    print(f"Uploaded to s3://{EMBEDDINGS_BUCKET}/reference/metadata.json")


def main():
    global SAMPLES_PER_SITE

    parser = argparse.ArgumentParser(description='Expand reference sites with real MARRS audio')
    parser.add_argument('--sites', type=str, default=None,
                        help='Comma-separated site IDs (default: all priority sites)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be done without actually doing it')
    parser.add_argument('--samples', type=int, default=50,
                        help='Audio files per site (default: 50)')
    args = parser.parse_args()

    SAMPLES_PER_SITE = args.samples

    print("="*60)
    print("Expand Reference Sites with Real MARRS Audio")
    print("NO SYNTHETIC AUDIO - ALL REAL DATA")
    print("="*60)

    # Determine which sites to process
    if args.sites:
        sites_to_process = args.sites.split(',')
    else:
        sites_to_process = PRIORITY_SITES

    print(f"\nSites to process: {len(sites_to_process)}")
    for site in sites_to_process:
        print(f"  - {site}")

    # Load metadata
    site_metadata = load_site_metadata()
    figshare_files = get_figshare_files()

    # Check which sites are valid
    valid_sites = []
    for site_id in sites_to_process:
        if site_id not in site_metadata:
            print(f"  WARNING: {site_id} not in marrs_sites.json, skipping")
        elif site_id not in figshare_files:
            print(f"  WARNING: {site_id} not in Figshare dataset, skipping")
        else:
            valid_sites.append(site_id)

    if not valid_sites:
        print("\nNo valid sites to process!")
        sys.exit(1)

    print(f"\nValid sites: {len(valid_sites)}")

    if args.dry_run:
        print("\n[DRY RUN MODE]")

    # Process each site
    new_sites = []
    for site_id in valid_sites:
        result = process_site(
            site_id=site_id,
            site_metadata=site_metadata[site_id],
            figshare_files=figshare_files,
            dry_run=args.dry_run
        )

        if result and not result.get('dry_run'):
            new_sites.append(result)

    if args.dry_run:
        print(f"\n[DRY RUN] Would add {len(valid_sites)} new sites")
        return

    # Update metadata
    if new_sites:
        current_metadata = load_current_metadata()

        # Get existing site IDs
        existing_ids = {s['site_id'] for s in current_metadata.get('sites', [])}

        # Add new sites
        for site in new_sites:
            if site['site_id'] in existing_ids:
                # Update existing
                for i, s in enumerate(current_metadata['sites']):
                    if s['site_id'] == site['site_id']:
                        current_metadata['sites'][i] = site
                        break
                print(f"  Updated existing site: {site['site_id']}")
            else:
                # Add new
                current_metadata['sites'].append(site)
                print(f"  Added new site: {site['site_id']}")

        save_updated_metadata(current_metadata)

        print("\n" + "="*60)
        print("EXPANSION COMPLETE")
        print("="*60)
        print(f"New sites added: {len(new_sites)}")
        print(f"Total reference sites: {len(current_metadata['sites'])}")

        # Show distribution
        by_country = {}
        by_status = {}
        for s in current_metadata['sites']:
            by_country[s.get('country', 'Unknown')] = by_country.get(s.get('country', 'Unknown'), 0) + 1
            by_status[s.get('status', 'Unknown')] = by_status.get(s.get('status', 'Unknown'), 0) + 1

        print("\nBy country:")
        for country, count in sorted(by_country.items()):
            print(f"  {country}: {count}")

        print("\nBy status:")
        for status, count in sorted(by_status.items()):
            print(f"  {status}: {count}")
    else:
        print("\nNo new sites added")


if __name__ == '__main__':
    main()
