#!/usr/bin/env python3
"""
Upload metadata_v5.json to S3 for use by the ReefRadar Lambda router.

This script uploads the expanded metadata (45 MARRS sites, 44 with embeddings)
to the S3 embeddings bucket. It uploads as both:
  - metadata_v5.json (versioned copy)
  - metadata.json (replaces current, used by Lambda)

Usage:
    python scripts/upload_metadata_v5.py

Prerequisites:
    - AWS CLI configured with appropriate credentials
    - boto3 installed (pip install boto3)
"""

import json
import os
import sys

import boto3

BUCKET = "reefradar-2477-embeddings"
LOCAL_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "embeddings", "metadata_v5.json")
S3_PREFIX = "reference"
REGION = "us-east-1"


def main():
    local_path = os.path.abspath(LOCAL_PATH)

    if not os.path.exists(local_path):
        print(f"ERROR: File not found: {local_path}")
        sys.exit(1)

    # Load and validate the metadata
    with open(local_path, "r") as f:
        metadata = json.load(f)

    version = metadata.get("version", "unknown")
    total_sites = metadata.get("total_sites", len(metadata.get("sites", [])))
    sites_with_embeddings = metadata.get("sites_with_embeddings", 0)
    file_size = os.path.getsize(local_path)

    print(f"Metadata v{version}")
    print(f"  Total sites: {total_sites}")
    print(f"  Sites with embeddings: {sites_with_embeddings}")
    print(f"  Sites without embeddings: {total_sites - sites_with_embeddings}")
    print(f"  File size: {file_size:,} bytes ({file_size / 1024 / 1024:.2f} MB)")
    print()

    # Validate all sites have coordinates
    for site in metadata.get("sites", []):
        if site.get("latitude") is None or site.get("longitude") is None:
            print(f"  WARNING: {site['site_id']} has no coordinates!")

    s3 = boto3.client("s3", region_name=REGION)

    # Upload as metadata_v5.json (versioned)
    key_v5 = f"{S3_PREFIX}/metadata_v5.json"
    print(f"Uploading to s3://{BUCKET}/{key_v5} ...")
    s3.upload_file(
        local_path,
        BUCKET,
        key_v5,
        ExtraArgs={"ContentType": "application/json"},
    )
    print(f"  Uploaded: s3://{BUCKET}/{key_v5}")

    # Upload as metadata.json (replaces current)
    key_main = f"{S3_PREFIX}/metadata.json"
    print(f"Uploading to s3://{BUCKET}/{key_main} ...")
    s3.upload_file(
        local_path,
        BUCKET,
        key_main,
        ExtraArgs={"ContentType": "application/json"},
    )
    print(f"  Uploaded: s3://{BUCKET}/{key_main}")

    print()
    print(f"Done. {total_sites} sites ({sites_with_embeddings} with embeddings) uploaded to S3.")


if __name__ == "__main__":
    main()
