#!/usr/bin/env python3
"""
MARRS Cloud-to-Cloud Data Transfer Pipeline

Transfers coral reef audio data directly from UCL Figshare to AWS S3,
bypassing local machines entirely. Designed to run on EC2 spot instances.

MARRS Dataset: https://doi.org/10.5522/04/29958062
- 45 sites across 5 countries (Australia, Indonesia, Kenya, Maldives, Mexico)
- ~500k 1-minute WAV recordings (16kHz, ~1.92MB each)
- Total: ~527GB compressed, ~1TB uncompressed

This script implements smart sampling to transfer only 100-500 files per site,
keeping total transfer under $3 and runtime under 2 hours.

Usage:
    python3 marrs_cloud_transfer.py [--dry-run] [--sites SITE1,SITE2] [--samples-per-site N]
"""

import argparse
import boto3
import hashlib
import io
import json
import logging
import os
import random
import requests
import sys
import tempfile
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Configuration
FIGSHARE_ARTICLE_ID = "29958062"
FIGSHARE_API_URL = f"https://api.figshare.com/v2/articles/{FIGSHARE_ARTICLE_ID}/files"
DEFAULT_S3_BUCKET = "reefradar-2477-marrs-raw"
DEFAULT_SAMPLES_PER_SITE = 200  # Balance between coverage and cost
MAX_CONCURRENT_UPLOADS = 10
CHUNK_SIZE = 8 * 1024 * 1024  # 8MB chunks for streaming

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/tmp/marrs_transfer.log')
    ]
)
logger = logging.getLogger(__name__)


@dataclass
class SiteInfo:
    """Information about a MARRS recording site."""
    site_id: str
    country: str
    site_code: str
    status: str  # healthy, degraded, restored_early, restored_mid
    file_count: int
    zip_size_bytes: int
    download_url: str
    figshare_file_id: int


@dataclass
class TransferStats:
    """Statistics for the transfer operation."""
    sites_processed: int = 0
    files_transferred: int = 0
    bytes_downloaded: int = 0
    bytes_uploaded: int = 0
    errors: int = 0
    start_time: Optional[float] = None
    end_time: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            'sites_processed': self.sites_processed,
            'files_transferred': self.files_transferred,
            'bytes_downloaded': self.bytes_downloaded,
            'bytes_uploaded': self.bytes_uploaded,
            'errors': self.errors,
            'duration_seconds': (self.end_time - self.start_time) if self.end_time else None,
            'transfer_rate_mbps': (self.bytes_downloaded / (self.end_time - self.start_time) / 1e6 * 8)
                                   if self.end_time and self.start_time else None
        }


def get_figshare_files() -> List[dict]:
    """Fetch file listing from Figshare API with pagination."""
    logger.info("Fetching file list from Figshare API...")
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

    logger.info(f"Found {len(all_files)} files in Figshare dataset")
    return all_files


def get_manifest() -> Dict[str, dict]:
    """Download and parse the manifest.csv from Figshare."""
    logger.info("Downloading manifest.csv...")

    # Find manifest file
    files = get_figshare_files()
    manifest_file = next((f for f in files if f['name'] == 'manifest.csv'), None)

    if not manifest_file:
        raise ValueError("manifest.csv not found in Figshare dataset")

    # Download manifest (small file, direct download OK)
    response = requests.get(manifest_file['download_url'], allow_redirects=True)
    response.raise_for_status()

    manifest = {}
    # Handle Windows-style line endings
    lines = response.text.strip().replace('\r', '').split('\n')
    headers = [h.strip() for h in lines[0].split(',')]

    for line in lines[1:]:
        values = line.split(',')
        row = dict(zip(headers, values))
        site_id = row['zip_name'].replace('.zip', '')
        manifest[site_id] = {
            'country': row['country'],
            'site_code': row['site_code'],
            'file_count': int(row['file_count']),
            'total_bytes': int(row['total_bytes']),
            'sha256': row['sha256']
        }

    logger.info(f"Parsed manifest with {len(manifest)} sites")
    return manifest


def build_site_catalog(figshare_files: List[dict], manifest: Dict[str, dict]) -> Dict[str, SiteInfo]:
    """Build a catalog of all sites with their metadata."""
    catalog = {}

    # Map site codes to health status
    status_map = {
        'H': 'healthy',
        'D': 'degraded',
        'R': 'restored_mid',
        'N': 'restored_early'
    }

    for f in figshare_files:
        name = f['name']
        if not name.endswith('.zip') or name.startswith('detections'):
            continue

        site_id = name.replace('.zip', '')
        if site_id not in manifest:
            logger.warning(f"Site {site_id} not in manifest, skipping")
            continue

        site_info = manifest[site_id]
        site_code = site_info['site_code']
        status = status_map.get(site_code[0], 'unknown')

        catalog[site_id] = SiteInfo(
            site_id=site_id,
            country=site_info['country'],
            site_code=site_code,
            status=status,
            file_count=site_info['file_count'],
            zip_size_bytes=f['size'],
            download_url=f['download_url'],
            figshare_file_id=f['id']
        )

    logger.info(f"Built catalog with {len(catalog)} sites")
    return catalog


def select_representative_sites(catalog: Dict[str, SiteInfo],
                                 max_sites: Optional[int] = None) -> List[SiteInfo]:
    """
    Select representative sites ensuring coverage of:
    - All 5 countries
    - All 4 health statuses
    - Mix of file counts (some small, some large)
    """
    # Group by country and status
    by_country = {}
    by_status = {}

    for site in catalog.values():
        by_country.setdefault(site.country, []).append(site)
        by_status.setdefault(site.status, []).append(site)

    selected = []

    # Ensure at least one site per country per status (where available)
    for country, sites in by_country.items():
        for status in ['healthy', 'degraded', 'restored_mid', 'restored_early']:
            matching = [s for s in sites if s.status == status]
            if matching:
                # Pick one with moderate file count (not smallest, not largest)
                matching.sort(key=lambda x: x.file_count)
                idx = len(matching) // 2
                if matching[idx] not in selected:
                    selected.append(matching[idx])

    # If we need more or want all sites
    if max_sites is None or len(selected) < max_sites:
        remaining = [s for s in catalog.values() if s not in selected]
        random.shuffle(remaining)
        selected.extend(remaining[:max_sites - len(selected)] if max_sites else remaining)

    logger.info(f"Selected {len(selected)} sites for transfer")
    return selected


def smart_sample_files(zip_file: zipfile.ZipFile,
                       samples_per_site: int) -> List[str]:
    """
    Smart sampling strategy: select files to maximize temporal diversity.

    Strategy:
    1. Parse timestamps from filenames (format: site_YYYYMMDD_HHMMSS.wav)
    2. Group by hour of day (0-23)
    3. Sample evenly across hours
    4. Within each hour, sample randomly
    """
    all_files = [n for n in zip_file.namelist() if n.endswith('.wav')]

    if len(all_files) <= samples_per_site:
        logger.info(f"  Site has {len(all_files)} files, taking all")
        return all_files

    # Group files by hour
    by_hour = {h: [] for h in range(24)}
    unparseable = []

    for filename in all_files:
        # Parse timestamp from filename: site_YYYYMMDD_HHMMSS.wav
        try:
            basename = os.path.basename(filename)
            parts = basename.replace('.wav', '').split('_')
            if len(parts) >= 3:
                time_part = parts[-1]  # HHMMSS
                hour = int(time_part[:2])
                by_hour[hour].append(filename)
            else:
                unparseable.append(filename)
        except (ValueError, IndexError):
            unparseable.append(filename)

    # Distribute samples across hours
    samples_per_hour = samples_per_site // 24
    extra_samples = samples_per_site % 24

    selected = []
    hours_with_files = [h for h in range(24) if by_hour[h]]

    for i, hour in enumerate(hours_with_files):
        n_samples = samples_per_hour + (1 if i < extra_samples else 0)
        hour_files = by_hour[hour]

        if len(hour_files) <= n_samples:
            selected.extend(hour_files)
        else:
            selected.extend(random.sample(hour_files, n_samples))

    # Fill remaining slots if needed
    if len(selected) < samples_per_site:
        remaining = [f for f in all_files if f not in selected]
        needed = samples_per_site - len(selected)
        selected.extend(random.sample(remaining, min(needed, len(remaining))))

    logger.info(f"  Sampled {len(selected)} files from {len(all_files)} " +
                f"(coverage: {len(hours_with_files)}/24 hours)")
    return selected


def get_fresh_download_url(figshare_file_id: int) -> str:
    """
    Get a fresh pre-signed URL for downloading.
    Figshare URLs expire after 10 seconds, so we need to request fresh ones.
    """
    response = requests.get(f"https://api.figshare.com/v2/file/download/{figshare_file_id}")
    if response.status_code == 200:
        # Returns a redirect, we need to follow it
        return response.url
    # Fallback to standard URL pattern
    return f"https://ndownloader.figshare.com/files/{figshare_file_id}"


def transfer_site(site: SiteInfo,
                  s3_client,
                  bucket: str,
                  samples_per_site: int,
                  dry_run: bool = False) -> Tuple[int, int, int]:
    """
    Transfer sampled files from one site to S3.

    Returns: (files_transferred, bytes_downloaded, bytes_uploaded)
    """
    logger.info(f"Processing site: {site.site_id} ({site.country}, {site.status})")
    logger.info(f"  ZIP size: {site.zip_size_bytes / 1e9:.2f} GB, {site.file_count} total files")

    if dry_run:
        estimated_files = min(samples_per_site, site.file_count)
        estimated_bytes = estimated_files * 1.92e6  # ~1.92MB per file average
        logger.info(f"  [DRY RUN] Would transfer ~{estimated_files} files, ~{estimated_bytes/1e6:.1f} MB")
        return estimated_files, int(estimated_bytes), int(estimated_bytes)

    files_transferred = 0
    bytes_downloaded = 0
    bytes_uploaded = 0

    try:
        # Get fresh download URL (expires in 10 seconds!)
        download_url = get_fresh_download_url(site.figshare_file_id)
        logger.info(f"  Downloading ZIP from Figshare...")

        # Download ZIP to temp file (streaming would be ideal but ZIP requires seeking)
        with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp_file:
            tmp_path = tmp_file.name

            # Stream download with progress
            response = requests.get(download_url, stream=True, allow_redirects=True)
            response.raise_for_status()

            downloaded = 0
            for chunk in response.iter_content(chunk_size=CHUNK_SIZE):
                if chunk:
                    tmp_file.write(chunk)
                    downloaded += len(chunk)
                    if downloaded % (100 * 1024 * 1024) == 0:  # Log every 100MB
                        logger.info(f"  Downloaded {downloaded / 1e9:.2f} GB...")

            bytes_downloaded = downloaded
            logger.info(f"  Downloaded {bytes_downloaded / 1e9:.2f} GB")

        # Process ZIP and upload selected files
        with zipfile.ZipFile(tmp_path, 'r') as zf:
            selected_files = smart_sample_files(zf, samples_per_site)

            logger.info(f"  Uploading {len(selected_files)} sampled files to S3...")

            for i, filename in enumerate(selected_files):
                try:
                    # Extract file content
                    with zf.open(filename) as wav_file:
                        wav_data = wav_file.read()

                    # Upload to S3
                    s3_key = f"sites/{site.site_id}/{os.path.basename(filename)}"
                    s3_client.put_object(
                        Bucket=bucket,
                        Key=s3_key,
                        Body=wav_data,
                        ContentType='audio/wav'
                    )

                    bytes_uploaded += len(wav_data)
                    files_transferred += 1

                    if (i + 1) % 50 == 0:
                        logger.info(f"  Uploaded {i + 1}/{len(selected_files)} files...")

                except Exception as e:
                    logger.error(f"  Error uploading {filename}: {e}")

        # Clean up temp file
        os.unlink(tmp_path)

    except Exception as e:
        logger.error(f"  Error processing site {site.site_id}: {e}")
        raise

    logger.info(f"  Completed: {files_transferred} files, {bytes_uploaded / 1e6:.1f} MB uploaded")
    return files_transferred, bytes_downloaded, bytes_uploaded


def save_manifest(bucket: str,
                  s3_client,
                  sites: List[SiteInfo],
                  stats: TransferStats,
                  samples_per_site: int):
    """Save transfer manifest to S3."""
    manifest = {
        'transfer_date': datetime.utcnow().isoformat(),
        'source': f'https://doi.org/10.5522/04/{FIGSHARE_ARTICLE_ID}',
        'dataset': 'MARRS Coral Reef Soundscapes',
        'sampling_strategy': {
            'samples_per_site': samples_per_site,
            'method': 'temporal_stratified',
            'description': 'Files sampled evenly across 24 hours to maximize temporal diversity'
        },
        'sites': [
            {
                'site_id': s.site_id,
                'country': s.country,
                'status': s.status,
                'original_file_count': s.file_count,
                'original_zip_size_bytes': s.zip_size_bytes
            }
            for s in sites
        ],
        'statistics': stats.to_dict()
    }

    s3_client.put_object(
        Bucket=bucket,
        Key='manifest.json',
        Body=json.dumps(manifest, indent=2),
        ContentType='application/json'
    )

    logger.info(f"Saved manifest to s3://{bucket}/manifest.json")


def save_sampling_strategy(bucket: str, s3_client, samples_per_site: int):
    """Document the sampling strategy."""
    strategy = {
        'strategy_name': 'temporal_stratified_sampling',
        'samples_per_site': samples_per_site,
        'description': '''
Smart sampling strategy for MARRS coral reef audio data.

Goal: Maximize temporal diversity while minimizing data transfer costs.

Method:
1. Parse timestamps from filenames (format: site_YYYYMMDD_HHMMSS.wav)
2. Group all files by hour of day (0-23)
3. Allocate samples evenly across available hours
4. Within each hour, select files randomly

Rationale:
- Coral reef soundscapes vary significantly by time of day
- Dawn/dusk choruses are acoustically distinct from midday
- Nocturnal fish species have different acoustic signatures
- Sampling across all hours ensures representative coverage

Expected Coverage:
- With 200 samples per site, approximately 8-9 files per hour
- Sites with <200 files get all files transferred
- Maintains scientific validity for acoustic analysis
        '''.strip(),
        'file_format': {
            'path_pattern': 'sites/{site_id}/{site_id}_{YYYYMMDD}_{HHMMSS}.wav',
            'audio_specs': {
                'sample_rate': 16000,
                'channels': 1,
                'duration_seconds': 60,
                'format': 'WAV PCM 16-bit'
            }
        }
    }

    s3_client.put_object(
        Bucket=bucket,
        Key='metadata/sampling_strategy.json',
        Body=json.dumps(strategy, indent=2),
        ContentType='application/json'
    )

    logger.info(f"Saved sampling strategy to s3://{bucket}/metadata/sampling_strategy.json")


def create_bucket_if_needed(s3_client, bucket: str, region: str = 'us-east-1'):
    """Create S3 bucket if it doesn't exist."""
    try:
        s3_client.head_bucket(Bucket=bucket)
        logger.info(f"Bucket {bucket} exists")
    except Exception:
        logger.info(f"Creating bucket {bucket}...")
        if region == 'us-east-1':
            s3_client.create_bucket(Bucket=bucket)
        else:
            s3_client.create_bucket(
                Bucket=bucket,
                CreateBucketConfiguration={'LocationConstraint': region}
            )

        # Add lifecycle policy to expire objects after 30 days (cost control)
        s3_client.put_bucket_lifecycle_configuration(
            Bucket=bucket,
            LifecycleConfiguration={
                'Rules': [
                    {
                        'ID': 'ExpireAfter30Days',
                        'Status': 'Enabled',
                        'Filter': {'Prefix': ''},
                        'Expiration': {'Days': 30}
                    }
                ]
            }
        )
        logger.info(f"Created bucket {bucket} with 30-day lifecycle policy")


def estimate_costs(sites: List[SiteInfo], samples_per_site: int) -> dict:
    """Estimate transfer costs."""
    total_files = sum(min(s.file_count, samples_per_site) for s in sites)
    avg_file_size = 1.92e6  # ~1.92MB per 1-minute 16kHz WAV

    total_data_gb = total_files * avg_file_size / 1e9

    # S3 storage cost: $0.023/GB/month
    storage_monthly = total_data_gb * 0.023

    # Data transfer into AWS: FREE
    transfer_in = 0

    # EC2 spot (t3.medium): ~$0.0125/hr typical spot price
    # Estimate 1-2 hours for transfer
    ec2_cost = 0.0125 * 2

    # S3 PUT requests: $0.005 per 1000
    put_requests = total_files * 0.005 / 1000

    return {
        'estimated_files': total_files,
        'estimated_data_gb': round(total_data_gb, 2),
        'costs': {
            's3_storage_30_days': round(storage_monthly, 3),
            'data_transfer_in': transfer_in,
            'ec2_spot_2hrs': round(ec2_cost, 3),
            's3_put_requests': round(put_requests, 3),
            'total_estimated': round(storage_monthly + transfer_in + ec2_cost + put_requests, 2)
        }
    }


def main():
    parser = argparse.ArgumentParser(
        description='Transfer MARRS coral reef audio from Figshare to S3'
    )
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be transferred without actually doing it')
    parser.add_argument('--sites', type=str, default=None,
                        help='Comma-separated list of site IDs to transfer (e.g., ind_H1,aus_D1)')
    parser.add_argument('--samples-per-site', type=int, default=DEFAULT_SAMPLES_PER_SITE,
                        help=f'Number of files to sample per site (default: {DEFAULT_SAMPLES_PER_SITE})')
    parser.add_argument('--bucket', type=str, default=DEFAULT_S3_BUCKET,
                        help=f'S3 bucket for output (default: {DEFAULT_S3_BUCKET})')
    parser.add_argument('--all-sites', action='store_true',
                        help='Transfer from all 45 sites (default: representative subset)')
    parser.add_argument('--max-sites', type=int, default=None,
                        help='Maximum number of sites to transfer')

    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("MARRS Cloud-to-Cloud Data Transfer")
    logger.info("=" * 60)

    # Initialize
    stats = TransferStats()
    stats.start_time = time.time()

    s3_client = boto3.client('s3')

    try:
        # Get file listing and manifest
        figshare_files = get_figshare_files()
        manifest = get_manifest()
        catalog = build_site_catalog(figshare_files, manifest)

        # Select sites
        if args.sites:
            site_ids = args.sites.split(',')
            sites = [catalog[sid] for sid in site_ids if sid in catalog]
            if len(sites) != len(site_ids):
                missing = set(site_ids) - set(catalog.keys())
                logger.warning(f"Sites not found: {missing}")
        elif args.all_sites:
            sites = list(catalog.values())
        else:
            max_sites = args.max_sites or 20  # Default to 20 representative sites
            sites = select_representative_sites(catalog, max_sites)

        # Show cost estimate
        costs = estimate_costs(sites, args.samples_per_site)
        logger.info("\nCost Estimate:")
        logger.info(f"  Sites to process: {len(sites)}")
        logger.info(f"  Estimated files: {costs['estimated_files']:,}")
        logger.info(f"  Estimated data: {costs['estimated_data_gb']:.1f} GB")
        logger.info(f"  S3 storage (30 days): ${costs['costs']['s3_storage_30_days']:.3f}")
        logger.info(f"  EC2 spot (~2 hrs): ${costs['costs']['ec2_spot_2hrs']:.3f}")
        logger.info(f"  S3 PUT requests: ${costs['costs']['s3_put_requests']:.3f}")
        logger.info(f"  TOTAL ESTIMATED: ${costs['costs']['total_estimated']:.2f}")
        logger.info("")

        if args.dry_run:
            logger.info("[DRY RUN MODE - No actual transfers will occur]")
            logger.info("")
        else:
            # Create bucket
            create_bucket_if_needed(s3_client, args.bucket)

            # Save sampling strategy
            save_sampling_strategy(args.bucket, s3_client, args.samples_per_site)

        # Process each site
        for site in sites:
            try:
                files, downloaded, uploaded = transfer_site(
                    site=site,
                    s3_client=s3_client,
                    bucket=args.bucket,
                    samples_per_site=args.samples_per_site,
                    dry_run=args.dry_run
                )
                stats.sites_processed += 1
                stats.files_transferred += files
                stats.bytes_downloaded += downloaded
                stats.bytes_uploaded += uploaded

            except Exception as e:
                logger.error(f"Failed to process {site.site_id}: {e}")
                stats.errors += 1

        stats.end_time = time.time()

        # Save manifest
        if not args.dry_run:
            save_manifest(args.bucket, s3_client, sites, stats, args.samples_per_site)

        # Summary
        logger.info("\n" + "=" * 60)
        logger.info("Transfer Complete")
        logger.info("=" * 60)
        logger.info(f"Sites processed: {stats.sites_processed}")
        logger.info(f"Files transferred: {stats.files_transferred:,}")
        logger.info(f"Data downloaded: {stats.bytes_downloaded / 1e9:.2f} GB")
        logger.info(f"Data uploaded: {stats.bytes_uploaded / 1e6:.1f} MB")
        logger.info(f"Errors: {stats.errors}")
        logger.info(f"Duration: {(stats.end_time - stats.start_time) / 60:.1f} minutes")

        if stats.bytes_downloaded > 0:
            rate = stats.bytes_downloaded / (stats.end_time - stats.start_time) / 1e6 * 8
            logger.info(f"Avg download rate: {rate:.1f} Mbps")

        if not args.dry_run:
            logger.info(f"\nData available at: s3://{args.bucket}/sites/")

    except Exception as e:
        logger.error(f"Transfer failed: {e}")
        raise


if __name__ == '__main__':
    main()
