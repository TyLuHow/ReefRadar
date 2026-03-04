#!/usr/bin/env python3
"""
Download sample WAV files from Hurricane Irma Zenodo archives using HTTP range requests.

Instead of downloading entire 6-8 GB ZIP files, this script:
1. Reads the ZIP central directory from the end of each remote archive
2. Picks 10 random WAV files from the listing
3. Downloads only those files using HTTP range requests
4. Extracts them to local directories

This reduces download from ~22 GB to ~900 MB (10 files x ~90 MB x 3 archives,
but we only need 5-second segments so we can download partial WAVs).

Usage:
    python3 scripts/download_irma_samples.py
"""

import io
import os
import struct
import random
import urllib.request
from pathlib import Path

ARCHIVES = {
    'WDR_wav_July': 'https://zenodo.org/records/4396323/files/WDR_wav_July.zip?download=1',
    'ESB_wav_July': 'https://zenodo.org/records/4396323/files/ESB_wav_July.zip?download=1',
    'ESB_wav_Oct': 'https://zenodo.org/records/4396323/files/ESB_wav_Oct.zip?download=1',
}

# Map archive names to local extracted directory names matching generate script expectations
DIR_MAPPING = {
    'WDR_wav_July': 'WDR_wav_Jul',
    'ESB_wav_July': 'ESB_wav_Jul',
    'ESB_wav_Oct': 'ESB_wav_Oct',
}

SAMPLES_PER_ARCHIVE = 10
BASE_DIR = Path('data/audio/hurricane_irma/extracted')


def http_range_read(url, start, length):
    """Read a byte range from a remote URL."""
    req = urllib.request.Request(url)
    req.add_header('Range', f'bytes={start}-{start + length - 1}')
    with urllib.request.urlopen(req) as resp:
        return resp.read()


def get_file_size(url):
    """Get the total size of a remote file via HEAD request."""
    req = urllib.request.Request(url, method='HEAD')
    with urllib.request.urlopen(req) as resp:
        return int(resp.headers.get('Content-Length', 0))


def parse_zip_central_directory(url, file_size):
    """Read the ZIP central directory from the end of the file to list all entries."""
    # Read last 64KB to find End of Central Directory record
    eocd_search_size = min(65536, file_size)
    eocd_data = http_range_read(url, file_size - eocd_search_size, eocd_search_size)

    # Find EOCD signature (0x06054b50)
    eocd_sig = b'\x50\x4b\x05\x06'
    eocd_offset = eocd_data.rfind(eocd_sig)
    if eocd_offset < 0:
        raise ValueError("Cannot find End of Central Directory record")

    # Parse EOCD
    eocd = eocd_data[eocd_offset:]
    total_entries = struct.unpack('<H', eocd[10:12])[0]
    cd_size = struct.unpack('<I', eocd[12:16])[0]
    cd_offset = struct.unpack('<I', eocd[16:20])[0]

    print(f"  ZIP: {total_entries} entries, central directory at offset {cd_offset}, size {cd_size}")

    # Read the central directory
    cd_data = http_range_read(url, cd_offset, cd_size)

    entries = []
    pos = 0
    cd_sig = b'\x50\x4b\x01\x02'

    while pos < len(cd_data):
        if cd_data[pos:pos + 4] != cd_sig:
            break

        # Parse central directory entry
        compressed_size = struct.unpack('<I', cd_data[pos + 20:pos + 24])[0]
        uncompressed_size = struct.unpack('<I', cd_data[pos + 24:pos + 28])[0]
        name_len = struct.unpack('<H', cd_data[pos + 28:pos + 30])[0]
        extra_len = struct.unpack('<H', cd_data[pos + 30:pos + 32])[0]
        comment_len = struct.unpack('<H', cd_data[pos + 32:pos + 34])[0]
        compression = struct.unpack('<H', cd_data[pos + 10:pos + 12])[0]
        local_header_offset = struct.unpack('<I', cd_data[pos + 42:pos + 46])[0]

        name = cd_data[pos + 46:pos + 46 + name_len].decode('utf-8', errors='replace')

        entries.append({
            'name': name,
            'compressed_size': compressed_size,
            'uncompressed_size': uncompressed_size,
            'compression': compression,
            'local_header_offset': local_header_offset,
        })

        pos += 46 + name_len + extra_len + comment_len

    return entries


def download_wav_from_zip(url, entry, output_dir):
    """Download a single uncompressed WAV file from a remote ZIP archive."""
    # Read local file header first (30 bytes + variable)
    local_header = http_range_read(url, entry['local_header_offset'], 30)

    if local_header[:4] != b'\x50\x4b\x03\x04':
        raise ValueError(f"Invalid local header for {entry['name']}")

    local_name_len = struct.unpack('<H', local_header[26:28])[0]
    local_extra_len = struct.unpack('<H', local_header[28:30])[0]

    data_offset = entry['local_header_offset'] + 30 + local_name_len + local_extra_len

    if entry['compression'] != 0:
        # File is compressed - we'd need to decompress
        # For WAV files, they're typically stored uncompressed in ZIP
        print(f"    WARNING: {entry['name']} is compressed (method {entry['compression']}), skipping")
        return False

    # Download the file data
    file_data = http_range_read(url, data_offset, entry['compressed_size'])

    # Save to disk
    output_path = output_dir / Path(entry['name']).name
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'wb') as f:
        f.write(file_data)

    return True


def process_archive(archive_name, url, output_dir_name):
    """Download sample WAV files from a remote ZIP archive."""
    output_dir = BASE_DIR / output_dir_name
    output_dir.mkdir(parents=True, exist_ok=True)

    # Check if we already have enough files
    existing_wavs = list(output_dir.glob('*.wav')) + list(output_dir.glob('*.WAV'))
    if len(existing_wavs) >= SAMPLES_PER_ARCHIVE:
        print(f"\n=== {archive_name}: Already have {len(existing_wavs)} WAV files, skipping ===")
        return True

    print(f"\n=== {archive_name} ===")
    print(f"  URL: {url}")

    # Get file size
    file_size = get_file_size(url)
    print(f"  Archive size: {file_size / (1024**3):.2f} GB")

    # Parse central directory
    entries = parse_zip_central_directory(url, file_size)

    # Filter WAV files only
    wav_entries = [e for e in entries
                   if e['name'].lower().endswith('.wav')
                   and not e['name'].startswith('__MACOSX')
                   and e['uncompressed_size'] > 1000]

    print(f"  WAV files found: {len(wav_entries)}")

    if not wav_entries:
        print("  ERROR: No WAV files found in archive")
        return False

    # Sample randomly
    selected = random.sample(wav_entries, min(SAMPLES_PER_ARCHIVE, len(wav_entries)))

    print(f"  Downloading {len(selected)} sample files...")

    downloaded = 0
    for i, entry in enumerate(selected):
        name = Path(entry['name']).name
        size_mb = entry['uncompressed_size'] / (1024 * 1024)
        print(f"  [{i+1}/{len(selected)}] {name} ({size_mb:.1f} MB)...", end=' ', flush=True)

        try:
            success = download_wav_from_zip(url, entry, output_dir)
            if success:
                downloaded += 1
                print("OK")
            else:
                print("SKIP (compressed)")
        except Exception as e:
            print(f"FAIL: {e}")

    print(f"  Downloaded: {downloaded}/{len(selected)} files to {output_dir}")
    return downloaded > 0


def main():
    print("=== Hurricane Irma Sample Downloader ===")
    print(f"Downloading {SAMPLES_PER_ARCHIVE} sample WAV files from each archive\n")

    BASE_DIR.mkdir(parents=True, exist_ok=True)

    results = {}
    for archive_name, url in ARCHIVES.items():
        dir_name = DIR_MAPPING[archive_name]
        try:
            success = process_archive(archive_name, url, dir_name)
            results[archive_name] = success
        except Exception as e:
            print(f"  ERROR: {e}")
            results[archive_name] = False

    print(f"\n=== Summary ===")
    for name, success in results.items():
        dir_name = DIR_MAPPING[name]
        dir_path = BASE_DIR / dir_name
        wav_count = len(list(dir_path.glob('*.wav')) + list(dir_path.glob('*.WAV'))) if dir_path.exists() else 0
        status = "OK" if success else "FAILED"
        print(f"  {name} -> {dir_name}/: {wav_count} WAV files [{status}]")


if __name__ == '__main__':
    main()
