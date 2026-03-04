#!/usr/bin/env python3
"""
Generate SurfPerch embeddings for 3 new Hurricane Irma sites using the inference Lambda.

Sites:
- irma_western_dry_rocks_pre: WDR July 2017 (before Hurricane Irma)
- irma_eastern_sambo_pre: ESB July 2017 (before Hurricane Irma)
- irma_eastern_sambo_post: ESB October 2017 (after Hurricane Irma)

Reuses wav_to_float_samples and Lambda invocation pattern from
generate_expansion_embeddings.py.

Usage:
    python3 scripts/generate_irma_embeddings.py

Requirements:
    - AWS credentials configured (us-east-1)
    - Downloaded & extracted audio in data/audio/hurricane_irma/extracted/
    - Inference Lambda: reefradar-2477-inference
"""

import json
import boto3
import struct
import time
import random
from pathlib import Path

LAMBDA_FUNCTION = 'reefradar-2477-inference'
REGION = 'us-east-1'
SAMPLES_PER_SITE = 10
RATE_LIMIT_SECONDS = 0.5
SEGMENT_SECONDS = 5.0  # SurfPerch window size

lambda_client = boto3.client('lambda', region_name=REGION)


def read_wav_info(wav_path):
    """Read WAV header info: sample_rate, channels, bits_per_sample, data_offset, data_size."""
    with open(wav_path, 'rb') as f:
        riff = f.read(4)
        if riff != b'RIFF':
            return None
        f.read(4)  # file size
        wave = f.read(4)
        if wave != b'WAVE':
            return None

        fmt_info = None
        data_offset = None
        data_size = None

        while True:
            chunk_id = f.read(4)
            if len(chunk_id) < 4:
                break
            chunk_size = struct.unpack('<I', f.read(4))[0]

            if chunk_id == b'fmt ':
                fmt_data = f.read(chunk_size)
                audio_fmt = struct.unpack('<H', fmt_data[0:2])[0]
                channels = struct.unpack('<H', fmt_data[2:4])[0]
                sample_rate = struct.unpack('<I', fmt_data[4:8])[0]
                bits_per_sample = struct.unpack('<H', fmt_data[14:16])[0]
                fmt_info = {
                    'audio_format': audio_fmt,
                    'channels': channels,
                    'sample_rate': sample_rate,
                    'bits_per_sample': bits_per_sample,
                }
            elif chunk_id == b'data':
                data_offset = f.tell()
                data_size = chunk_size
                break
            else:
                f.seek(chunk_size, 1)

        if fmt_info and data_offset:
            fmt_info['data_offset'] = data_offset
            fmt_info['data_size'] = data_size
            return fmt_info
    return None


def wav_to_float_samples(wav_path):
    """Read a WAV file and return a 5-second segment as float samples + sample rate."""
    info = read_wav_info(wav_path)
    if not info:
        raise ValueError(f"Cannot parse WAV: {wav_path}")

    sr = info['sample_rate']
    channels = info['channels']
    bps = info['bits_per_sample']
    bytes_per_sample = bps // 8
    frame_size = channels * bytes_per_sample
    total_frames = info['data_size'] // frame_size

    # Pick a random 5-second segment
    segment_frames = int(SEGMENT_SECONDS * sr)
    if total_frames <= segment_frames:
        start_frame = 0
        segment_frames = total_frames
    else:
        max_start = total_frames - segment_frames
        start_frame = random.randint(0, max_start)

    # Read raw audio bytes
    with open(wav_path, 'rb') as f:
        f.seek(info['data_offset'] + start_frame * frame_size)
        raw_data = f.read(segment_frames * frame_size)

    # Convert to float samples [-1, 1]
    if bps == 16:
        fmt = f'<{len(raw_data) // 2}h'
        int_samples = struct.unpack(fmt, raw_data)
        samples = [s / 32768.0 for s in int_samples]
    elif bps == 24:
        samples = []
        for i in range(0, len(raw_data), 3):
            b = raw_data[i:i+3]
            val = int.from_bytes(b, 'little', signed=True)
            samples.append(val / 8388608.0)
    elif bps == 32:
        fmt = f'<{len(raw_data) // 4}i'
        int_samples = struct.unpack(fmt, raw_data)
        samples = [s / 2147483648.0 for s in int_samples]
    else:
        raise ValueError(f"Unsupported bits_per_sample: {bps}")

    # If stereo, average channels to mono
    if channels == 2:
        mono = []
        for i in range(0, len(samples), 2):
            mono.append((samples[i] + samples[i + 1]) / 2.0)
        samples = mono

    return samples, sr


def get_embedding(wav_path):
    """Get SurfPerch embedding for a WAV file via Lambda (sends float samples)."""
    samples, sample_rate = wav_to_float_samples(wav_path)

    payload = json.dumps({
        'segments': [samples],
        'sample_rate': sample_rate,
    })

    payload_size = len(payload)
    if payload_size > 6_000_000:
        raise ValueError(f"Payload too large: {payload_size} bytes")

    response = lambda_client.invoke(
        FunctionName=LAMBDA_FUNCTION,
        InvocationType='RequestResponse',
        Payload=payload,
    )

    result = json.loads(response['Payload'].read())

    if 'errorMessage' in result:
        raise Exception(result['errorMessage'])

    body = result.get('body', result)
    if isinstance(body, str):
        body = json.loads(body)

    if body.get('error'):
        raise Exception(body['error'])

    if 'embeddings' in body:
        embs = body['embeddings']
        if len(embs) == 1:
            return embs[0]
        n = len(embs)
        dim = len(embs[0])
        mean = [sum(embs[i][j] for i in range(n)) / n for j in range(dim)]
        return mean
    elif 'embedding' in body:
        return body['embedding']

    raise Exception(f"Unexpected Lambda response body: {list(body.keys())}")


def find_wav_files(directory):
    """Recursively find WAV files in directory."""
    wavs = sorted(directory.rglob('*.wav')) + sorted(directory.rglob('*.WAV'))
    return wavs


def process_site(site_id, audio_dir):
    """Generate mean embedding for a site from its audio directory."""
    wav_files = find_wav_files(audio_dir)

    if not wav_files:
        print(f"  {site_id}: No WAV files found in {audio_dir}")
        return None

    selected = random.sample(wav_files, min(SAMPLES_PER_SITE, len(wav_files)))
    print(f"  {site_id}: Processing {len(selected)} of {len(wav_files)} files...")

    embeddings = []
    for wav_path in selected:
        try:
            emb = get_embedding(wav_path)
            embeddings.append(emb)
            print(f"    OK: {wav_path.name} ({len(emb)} dims)")
        except Exception as e:
            print(f"    FAIL: {wav_path.name}: {e}")
        time.sleep(RATE_LIMIT_SECONDS)

    if not embeddings:
        print(f"  {site_id}: No embeddings generated")
        return None

    # Compute mean
    n = len(embeddings)
    dim = len(embeddings[0])
    mean_emb = [sum(embeddings[i][j] for i in range(n)) / n for j in range(dim)]

    print(f"  {site_id}: Mean embedding from {n} samples (dim={dim})")
    return mean_emb


def main():
    base = Path('data/audio/hurricane_irma/extracted')

    # Directory mapping for the 3 new sites
    # Note: zip files from Zenodo use "July" not "Jul" in directory names
    site_dirs = {
        'irma_western_dry_rocks_pre': base / 'WDR_wav_July',
        'irma_eastern_sambo_pre': base / 'ESB_wav_July',
        'irma_eastern_sambo_post': base / 'ESB_wav_Oct',
    }

    # Check what directories actually exist
    print("=== Checking audio directories ===")
    for site_id, audio_dir in site_dirs.items():
        if audio_dir.exists():
            wavs = find_wav_files(audio_dir)
            print(f"  {site_id}: {audio_dir} ({len(wavs)} WAV files)")
        else:
            print(f"  {site_id}: {audio_dir} NOT FOUND")

    results = {}

    print("\n=== Generating embeddings ===")
    for site_id, audio_dir in site_dirs.items():
        if not audio_dir.exists():
            print(f"\n  SKIP {site_id}: directory not found")
            continue

        print(f"\n--- {site_id} ---")
        emb = process_site(site_id, audio_dir)
        if emb:
            results[site_id] = emb

    # Save results
    output_path = Path('data/embeddings/irma_expansion_embeddings.json')
    with open(output_path, 'w') as f:
        json.dump(results, f)

    print(f"\n=== Summary ===")
    print(f"Sites with embeddings: {len(results)}")
    for site_id in results:
        print(f"  {site_id}: {len(results[site_id])} dims")
    print(f"\nSaved to {output_path}")

    if results:
        print(f"\nTo merge into metadata_v6.json, run:")
        print(f"  python3 scripts/merge_irma_embeddings.py")


if __name__ == '__main__':
    main()
