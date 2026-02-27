#!/usr/bin/env python3
"""
Generate SurfPerch embeddings for expansion sites using the inference Lambda.

Processes downloaded audio from:
- CoralSoundExplorer (French Polynesia / Bora-Bora)
- Hurricane Irma (Florida Keys / Western Dry Rocks)

Handles Lambda's 6 MB payload limit by extracting 5-second segments
from each WAV file before base64-encoding and sending.

Usage:
    python3 scripts/generate_expansion_embeddings.py

Requirements:
    - AWS credentials configured (us-east-1)
    - Downloaded audio in data/audio/french_polynesia/ and data/audio/hurricane_irma/
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

        # Parse chunks until we find 'fmt ' and 'data'
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

    # Lambda wraps response in statusCode/body
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

    # Sample randomly
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
    results = {}

    # === French Polynesia (CoralSoundExplorer) ===
    print("\n=== French Polynesia (Bora-Bora) ===")
    fp_base = Path('data/audio/french_polynesia/extracted/audio')

    # Directory mapping:
    #   naturel = undisturbed (healthy)
    #   touriste = tourist area (degraded)
    #   passe = boat traffic channel (degraded)
    # Each has 3 replicates; we combine all replicates per site type
    fp_site_dirs = {
        'borabora_undisturbed': ['2022_naturel_1', '2022_naturel_2', '2022_naturel_3'],
        'borabora_tourist': ['2022_touriste_1', '2022_touriste_2', '2022_touriste_3'],
        'borabora_boat_traffic': ['2022_passe_1', '2022_passe_2', '2022_passe_3'],
    }

    if fp_base.exists():
        for site_id, dir_names in fp_site_dirs.items():
            # Collect WAV files from all replicates
            all_wavs = []
            for dn in dir_names:
                d = fp_base / dn
                if d.exists():
                    all_wavs.extend(find_wav_files(d))

            if not all_wavs:
                print(f"  {site_id}: No WAV files found")
                continue

            selected = random.sample(all_wavs, min(SAMPLES_PER_SITE, len(all_wavs)))
            print(f"  {site_id}: Processing {len(selected)} of {len(all_wavs)} files...")

            embeddings = []
            for wav_path in selected:
                try:
                    emb = get_embedding(wav_path)
                    embeddings.append(emb)
                    print(f"    OK: {wav_path.parent.parent.name}/{wav_path.name} ({len(emb)} dims)")
                except Exception as e:
                    print(f"    FAIL: {wav_path.name}: {e}")
                time.sleep(RATE_LIMIT_SECONDS)

            if embeddings:
                n = len(embeddings)
                dim = len(embeddings[0])
                mean_emb = [sum(embeddings[i][j] for i in range(n)) / n for j in range(dim)]
                results[site_id] = mean_emb
                print(f"  {site_id}: Mean embedding from {n} samples (dim={dim})")
            else:
                print(f"  {site_id}: No embeddings generated")
    else:
        print("  French Polynesia audio not found, skipping")

    # === Hurricane Irma (Western Dry Rocks, October = post-hurricane) ===
    print("\n=== Hurricane Irma (Western Dry Rocks) ===")
    irma_dir = Path('data/audio/hurricane_irma/extracted/WDR_wav_Oct')

    if irma_dir.exists():
        emb = process_site('irma_western_dry_rocks', irma_dir)
        if emb:
            results['irma_western_dry_rocks'] = emb
    else:
        print("  Hurricane Irma audio not found, skipping")

    # Save results
    output_path = Path('data/embeddings/expansion_embeddings.json')
    with open(output_path, 'w') as f:
        json.dump(results, f)

    print(f"\n=== Summary ===")
    print(f"Sites with embeddings: {len(results)}")
    for site_id in results:
        print(f"  {site_id}: {len(results[site_id])} dims")
    print(f"\nSaved to {output_path}")

    if results:
        print(f"\nTo merge into metadata_v6.json, run:")
        print(f"  python3 scripts/merge_expansion_embeddings.py")


if __name__ == '__main__':
    main()
