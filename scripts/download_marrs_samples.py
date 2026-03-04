#!/usr/bin/env python3
"""
Download 5 sample WAV files per MARRS site from Figshare.

Uses HTTP range requests to read the zip central directory and extract
individual files without downloading the entire archive. This is critical
since archives range from 1-17 GB each.

Usage:
    python scripts/download_marrs_samples.py
    python scripts/download_marrs_samples.py --max-sites 5  # test with fewer
"""

import argparse
import io
import json
import os
import random
import struct
import sys
import time
import zipfile
from pathlib import Path

import requests

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
MARRS_SITES_PATH = PROJECT_ROOT / 'data' / 'embeddings' / 'marrs_sites.json'
FIGSHARE_FILES_PATH = PROJECT_ROOT / 'data' / 'marrs' / 'figshare_files.json'
SAMPLES_DIR = PROJECT_ROOT / 'data' / 'marrs' / 'samples'
PROGRESS_PATH = PROJECT_ROOT / 'data' / 'marrs' / 'download_progress.json'

# Also check local audio directory for existing files
LOCAL_AUDIO_DIR = PROJECT_ROOT / 'data' / 'marrs_audio'

FILES_PER_SITE = 5
RANDOM_SEED = 42


def load_progress():
    """Load download progress from JSON file."""
    if PROGRESS_PATH.exists():
        with open(PROGRESS_PATH) as f:
            return json.load(f)
    return {'completed': {}, 'failed': {}}


def save_progress(progress):
    """Save download progress to JSON file."""
    PROGRESS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_PATH, 'w') as f:
        json.dump(progress, f, indent=2)


def check_existing_samples(site_id):
    """Check if we already have enough WAV files for a site."""
    site_dir = SAMPLES_DIR / site_id
    if site_dir.exists():
        wavs = list(site_dir.glob('*.WAV')) + list(site_dir.glob('*.wav'))
        if len(wavs) >= FILES_PER_SITE:
            return True
    return False


def copy_from_local_audio(site_id):
    """
    Try to copy WAV files from the local audio directory.
    Returns True if enough files were copied.
    """
    site_dir = SAMPLES_DIR / site_id
    site_dir.mkdir(parents=True, exist_ok=True)

    # Check subdirectory (e.g., data/marrs_audio/ind_H4/)
    local_subdir = LOCAL_AUDIO_DIR / site_id
    wav_files = []

    if local_subdir.exists() and local_subdir.is_dir():
        wav_files = sorted(local_subdir.glob('*.WAV'))
        if not wav_files:
            wav_files = sorted(local_subdir.glob('*.wav'))

    # Check flat structure (e.g., data/marrs_audio/ind_D2_*.WAV)
    if not wav_files:
        wav_files = sorted(LOCAL_AUDIO_DIR.glob(f'{site_id}_*.WAV'))
        if not wav_files:
            wav_files = sorted(LOCAL_AUDIO_DIR.glob(f'{site_id}_*.wav'))

    if len(wav_files) < FILES_PER_SITE:
        return False

    # Pick 5 random files
    rng = random.Random(RANDOM_SEED + hash(site_id))
    selected = rng.sample(wav_files, min(FILES_PER_SITE, len(wav_files)))

    for src in selected:
        dst = site_dir / src.name
        if not dst.exists():
            # Copy file
            import shutil
            shutil.copy2(str(src), str(dst))

    return len(list(site_dir.glob('*.WAV')) + list(site_dir.glob('*.wav'))) >= FILES_PER_SITE


def get_zip_central_directory(url, file_size):
    """
    Read the zip central directory from the end of a remote zip file
    using HTTP range requests. Returns a list of (filename, offset, comp_size, uncomp_size).
    """
    # Read the last 65KB to find End of Central Directory (EOCD)
    eocd_max_size = 65 * 1024
    range_start = max(0, file_size - eocd_max_size)

    headers = {'Range': f'bytes={range_start}-{file_size - 1}'}
    resp = requests.get(url, headers=headers, timeout=30)
    data = resp.content

    # Find EOCD signature (0x06054b50)
    eocd_sig = b'\x50\x4b\x05\x06'
    eocd_pos = data.rfind(eocd_sig)
    if eocd_pos == -1:
        raise ValueError("Could not find End of Central Directory record")

    # Parse EOCD
    eocd = data[eocd_pos:]
    if len(eocd) < 22:
        raise ValueError("EOCD too short")

    cd_size = struct.unpack('<I', eocd[12:16])[0]
    cd_offset = struct.unpack('<I', eocd[16:20])[0]

    # Check for ZIP64 EOCD
    if cd_offset == 0xFFFFFFFF or cd_size == 0xFFFFFFFF:
        # Look for ZIP64 End of Central Directory Locator
        zip64_locator_sig = b'\x50\x4b\x06\x07'
        loc_pos = data.rfind(zip64_locator_sig)
        if loc_pos != -1 and loc_pos + 20 <= len(data):
            zip64_eocd_offset = struct.unpack('<Q', data[loc_pos + 8:loc_pos + 16])[0]

            # Read the ZIP64 EOCD
            headers64 = {'Range': f'bytes={zip64_eocd_offset}-{zip64_eocd_offset + 100}'}
            resp64 = requests.get(url, headers=headers64, timeout=30)
            eocd64 = resp64.content

            if eocd64[:4] == b'\x50\x4b\x06\x06':
                cd_size = struct.unpack('<Q', eocd64[40:48])[0]
                cd_offset = struct.unpack('<Q', eocd64[48:56])[0]
            else:
                raise ValueError("ZIP64 EOCD not found at expected offset")

    # Now read the central directory
    headers_cd = {'Range': f'bytes={cd_offset}-{cd_offset + cd_size - 1}'}
    resp_cd = requests.get(url, headers=headers_cd, timeout=60)
    cd_data = resp_cd.content

    # Parse central directory entries
    entries = []
    pos = 0
    cd_sig = b'\x50\x4b\x01\x02'

    while pos < len(cd_data) - 46:
        if cd_data[pos:pos + 4] != cd_sig:
            break

        comp_method = struct.unpack('<H', cd_data[pos + 10:pos + 12])[0]
        comp_size = struct.unpack('<I', cd_data[pos + 20:pos + 24])[0]
        uncomp_size = struct.unpack('<I', cd_data[pos + 24:pos + 28])[0]
        fname_len = struct.unpack('<H', cd_data[pos + 28:pos + 30])[0]
        extra_len = struct.unpack('<H', cd_data[pos + 30:pos + 32])[0]
        comment_len = struct.unpack('<H', cd_data[pos + 32:pos + 34])[0]
        local_offset = struct.unpack('<I', cd_data[pos + 42:pos + 46])[0]

        fname = cd_data[pos + 46:pos + 46 + fname_len].decode('utf-8', errors='replace')

        # Handle ZIP64 extra fields
        if comp_size == 0xFFFFFFFF or uncomp_size == 0xFFFFFFFF or local_offset == 0xFFFFFFFF:
            extra_data = cd_data[pos + 46 + fname_len:pos + 46 + fname_len + extra_len]
            ep = 0
            while ep < len(extra_data) - 4:
                ext_id = struct.unpack('<H', extra_data[ep:ep + 2])[0]
                ext_size = struct.unpack('<H', extra_data[ep + 2:ep + 4])[0]
                if ext_id == 0x0001:  # ZIP64 extended info
                    ext_vals = extra_data[ep + 4:ep + 4 + ext_size]
                    idx = 0
                    if uncomp_size == 0xFFFFFFFF and idx + 8 <= len(ext_vals):
                        uncomp_size = struct.unpack('<Q', ext_vals[idx:idx + 8])[0]
                        idx += 8
                    if comp_size == 0xFFFFFFFF and idx + 8 <= len(ext_vals):
                        comp_size = struct.unpack('<Q', ext_vals[idx:idx + 8])[0]
                        idx += 8
                    if local_offset == 0xFFFFFFFF and idx + 8 <= len(ext_vals):
                        local_offset = struct.unpack('<Q', ext_vals[idx:idx + 8])[0]
                        idx += 8
                    break
                ep += 4 + ext_size

        entries.append({
            'filename': fname,
            'offset': local_offset,
            'comp_size': comp_size,
            'uncomp_size': uncomp_size,
            'comp_method': comp_method,
        })

        pos += 46 + fname_len + extra_len + comment_len

    return entries


def download_file_from_zip(url, entry):
    """
    Download a single file from a remote zip using HTTP range request.
    Returns the file content bytes.
    """
    offset = entry['offset']

    # Read local file header to get actual data offset
    # Local file header is at least 30 bytes
    header_resp = requests.get(
        url,
        headers={'Range': f'bytes={offset}-{offset + 300}'},
        timeout=30
    )
    header = header_resp.content

    if header[:4] != b'\x50\x4b\x03\x04':
        raise ValueError(f"Invalid local file header at offset {offset}")

    fname_len = struct.unpack('<H', header[26:28])[0]
    extra_len = struct.unpack('<H', header[28:30])[0]
    data_offset = offset + 30 + fname_len + extra_len

    # Download the file data
    comp_size = entry['comp_size']
    data_resp = requests.get(
        url,
        headers={'Range': f'bytes={data_offset}-{data_offset + comp_size - 1}'},
        timeout=120
    )

    if entry['comp_method'] == 0:  # Stored (no compression)
        return data_resp.content
    elif entry['comp_method'] == 8:  # Deflated
        import zlib
        return zlib.decompress(data_resp.content, -15)
    else:
        raise ValueError(f"Unsupported compression method: {entry['comp_method']}")


def download_site_samples(site_id, figshare_url, file_size):
    """
    Download 5 random WAV files from a site's Figshare zip archive.
    Uses HTTP range requests to avoid downloading the entire archive.
    """
    site_dir = SAMPLES_DIR / site_id
    site_dir.mkdir(parents=True, exist_ok=True)

    print(f"  Reading zip directory for {site_id} ({file_size / (1024*1024):.0f} MB)...")

    # Get file listing from zip central directory
    entries = get_zip_central_directory(figshare_url, file_size)

    # Filter for WAV files only
    wav_entries = [e for e in entries
                   if e['filename'].upper().endswith('.WAV')
                   and not e['filename'].startswith('__MACOSX')]

    if not wav_entries:
        print(f"  No WAV files found in zip for {site_id}")
        return 0

    print(f"  Found {len(wav_entries)} WAV files in archive")

    # Pick 5 random WAVs
    rng = random.Random(RANDOM_SEED + hash(site_id))
    selected = rng.sample(wav_entries, min(FILES_PER_SITE, len(wav_entries)))

    downloaded = 0
    for entry in selected:
        fname = os.path.basename(entry['filename'])
        dst = site_dir / fname

        if dst.exists() and dst.stat().st_size > 0:
            downloaded += 1
            continue

        try:
            print(f"    Downloading {fname} ({entry['uncomp_size'] / (1024*1024):.1f} MB)...")
            content = download_file_from_zip(figshare_url, entry)

            with open(dst, 'wb') as f:
                f.write(content)

            downloaded += 1
            time.sleep(0.5)  # Rate limit

        except Exception as e:
            print(f"    Error downloading {fname}: {e}")
            # Remove partial file
            if dst.exists():
                dst.unlink()
            continue

    return downloaded


def main():
    parser = argparse.ArgumentParser(description='Download MARRS audio samples from Figshare')
    parser.add_argument('--max-sites', type=int, default=0,
                        help='Max sites to process (0 = all)')
    parser.add_argument('--site', type=str, default=None,
                        help='Process a single site')
    args = parser.parse_args()

    # Load data
    with open(MARRS_SITES_PATH) as f:
        sites = json.load(f)

    with open(FIGSHARE_FILES_PATH) as f:
        figshare_files = json.load(f)

    # Build figshare lookup: site_id -> (download_url, size)
    figshare_lookup = {}
    for ff in figshare_files:
        name = ff['name'].replace('.zip', '')
        if name.startswith('detections_') or name in ('manifest', 'study_sites_map'):
            continue
        figshare_lookup[name] = (ff['download_url'], ff['size'])

    progress = load_progress()
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)

    # Filter sites
    if args.site:
        sites = [s for s in sites if s['site_id'] == args.site]

    total = len(sites)
    succeeded = 0
    failed = 0
    skipped = 0

    if args.max_sites > 0:
        sites = sites[:args.max_sites]

    for i, site in enumerate(sites):
        site_id = site['site_id']
        print(f"\n[{i+1}/{len(sites)}] Processing {site_id} ({site['country']})...")

        # Skip if already completed
        if site_id in progress['completed']:
            print(f"  Already completed ({progress['completed'][site_id]} files)")
            skipped += 1
            succeeded += 1
            continue

        # Skip if already have enough samples
        if check_existing_samples(site_id):
            print(f"  Already have {FILES_PER_SITE}+ samples")
            progress['completed'][site_id] = FILES_PER_SITE
            save_progress(progress)
            skipped += 1
            succeeded += 1
            continue

        # Try copying from local audio directory first
        if copy_from_local_audio(site_id):
            count = len(list((SAMPLES_DIR / site_id).glob('*.WAV')) +
                       list((SAMPLES_DIR / site_id).glob('*.wav')))
            print(f"  Copied {count} files from local audio")
            progress['completed'][site_id] = count
            save_progress(progress)
            succeeded += 1
            continue

        # Check if site has no audio (like ken_D3 with file_count=0)
        if site.get('file_count', 0) == 0:
            print(f"  Site has 0 recordings, skipping")
            progress['failed'][site_id] = 'no_recordings'
            save_progress(progress)
            failed += 1
            continue

        # Download from Figshare
        if site_id not in figshare_lookup:
            print(f"  No Figshare zip available, skipping")
            progress['failed'][site_id] = 'no_figshare_file'
            save_progress(progress)
            failed += 1
            continue

        download_url, file_size = figshare_lookup[site_id]

        try:
            count = download_site_samples(site_id, download_url, file_size)
            if count >= FILES_PER_SITE:
                progress['completed'][site_id] = count
                succeeded += 1
                print(f"  Downloaded {count} files")
            else:
                progress['failed'][site_id] = f'only_{count}_files'
                failed += 1
                print(f"  Only got {count}/{FILES_PER_SITE} files")
        except Exception as e:
            print(f"  Error: {e}")
            progress['failed'][site_id] = str(e)[:200]
            failed += 1

        save_progress(progress)
        time.sleep(1.0)  # Rate limit between sites

    print(f"\n{'='*60}")
    print(f"COMPLETE: {succeeded} succeeded, {failed} failed, {skipped} skipped")
    print(f"Progress saved to: {PROGRESS_PATH}")
    print('='*60)

    save_progress(progress)


if __name__ == '__main__':
    main()
