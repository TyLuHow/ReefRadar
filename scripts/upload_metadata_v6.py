#!/usr/bin/env python3
"""
Upload metadata_v6.json to S3.

Usage:
    python3 scripts/upload_metadata_v6.py

This script:
1. Reads data/embeddings/metadata_v6.json
2. Validates: all sites have lat/lon, no duplicate site_ids
3. Uploads to s3://reefradar-2477-embeddings/reference/metadata_v6.json (versioned)
4. Uploads to s3://reefradar-2477-embeddings/reference/metadata.json (replaces current)
5. Prints summary

DO NOT run this automatically -- run manually when ready to deploy.
"""

import json
import boto3
from pathlib import Path

V6_PATH = Path('data/embeddings/metadata_v6.json')
BUCKET = 'reefradar-2477-embeddings'
REGION = 'us-east-1'


def main():
    # Load and validate
    with open(V6_PATH) as f:
        metadata = json.load(f)

    sites = metadata['sites']
    total = len(sites)

    # Validate no duplicates
    ids = [s['site_id'] for s in sites]
    dupes = [sid for sid in ids if ids.count(sid) > 1]
    if dupes:
        print(f"ERROR: Duplicate site_ids: {set(dupes)}")
        return

    # Validate all have coordinates
    for s in sites:
        if s.get('latitude') is None or s.get('longitude') is None:
            print(f"ERROR: {s['site_id']} missing coordinates")
            return

    print(f"Validated {total} sites, no issues.")

    # Count stats
    by_country = {}
    with_emb = 0
    without_emb = 0
    for s in sites:
        c = s.get('country', 'Unknown')
        by_country[c] = by_country.get(c, 0) + 1
        if s.get('has_embedding', True):
            with_emb += 1
        else:
            without_emb += 1

    print(f"\nTotal sites: {total}")
    print(f"With embeddings: {with_emb}")
    print(f"Without embeddings: {without_emb}")
    print(f"\nBy country:")
    for country, count in sorted(by_country.items(), key=lambda x: -x[1]):
        print(f"  {country}: {count}")

    # Upload
    s3 = boto3.client('s3', region_name=REGION)
    body = json.dumps(metadata).encode()

    # Versioned upload
    print(f"\nUploading to s3://{BUCKET}/reference/metadata_v6.json ...")
    s3.put_object(Bucket=BUCKET, Key='reference/metadata_v6.json', Body=body, ContentType='application/json')

    # Replace current metadata.json
    print(f"Uploading to s3://{BUCKET}/reference/metadata.json ...")
    s3.put_object(Bucket=BUCKET, Key='reference/metadata.json', Body=body, ContentType='application/json')

    print("\nDone! Verify with:")
    print(f"  curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d['total_sites'], d['countries'])\"")


if __name__ == '__main__':
    main()
