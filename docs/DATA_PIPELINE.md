# MARRS Data Pipeline - Cloud-to-Cloud Transfer

This document describes the data pipeline for transferring MARRS coral reef audio data from UCL Figshare directly to AWS S3, bypassing local machines entirely.

## Overview

The MARRS (Monitoring And Restoration of Reef Soundscapes) dataset is a large-scale coral reef acoustic monitoring dataset:

- **Source:** UCL Figshare (DOI: 10.5522/04/29958062)
- **Size:** ~527GB compressed, ~1TB uncompressed
- **Sites:** 45 monitoring locations across 5 countries
- **Files:** ~500,000 one-minute WAV recordings at 16kHz
- **Categories:** Healthy, Degraded, Restored (early/mid-stage)

### Why Cloud-to-Cloud?

1. **No local storage needed** - Dataset is too large for most laptops
2. **Faster transfer** - AWS internal networks vs home internet
3. **Cost efficient** - Data transfer INTO AWS is free
4. **Resumable** - Can stop/restart without losing progress
5. **Portfolio value** - Demonstrates AWS data engineering skills

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌────────────────┐
│   UCL Figshare  │         │  EC2 Spot        │         │  S3 Bucket     │
│   (eu-west-1)   │────────▶│  Instance        │────────▶│  us-east-1     │
│                 │         │  t3.small        │         │                │
│  45 ZIP files   │  HTTP   │  - Download ZIP  │  S3 API │  - Raw audio   │
│  ~527GB total   │         │  - Smart sample  │         │  - Manifest    │
│                 │         │  - Stream upload │         │  - Metadata    │
└─────────────────┘         └──────────────────┘         └────────────────┘
                                    │
                                    │ Auto-terminate
                                    ▼ on completion
```

## Smart Sampling Strategy

Instead of transferring all ~500k files (~1TB), we use smart sampling:

### Temporal Stratification

1. Parse timestamps from filenames: `site_YYYYMMDD_HHMMSS.wav`
2. Group files by hour of day (0-23)
3. Sample evenly across hours
4. Within each hour, select randomly

### Why This Works

- Coral reef soundscapes vary significantly by time of day
- Dawn/dusk choruses are acoustically distinct
- Nocturnal species have different signatures
- Even sampling ensures representative coverage

### Default Configuration

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Files per site | 200 | ~8 files per hour of day |
| Total sites | 45 | All sites for full coverage |
| Total files | ~9,000 | Sufficient for ML training |
| Data size | ~16GB | Under $0.40/month storage |

## Cost Analysis

### One-Time Transfer Costs

| Item | Cost |
|------|------|
| EC2 spot (t3.small, 2hr) | ~$0.02 |
| Data transfer IN | FREE |
| S3 PUT requests (~9000) | ~$0.05 |
| **Total one-time** | **~$0.07** |

### Monthly Storage Costs

| Item | Cost |
|------|------|
| S3 Standard (16GB) | ~$0.37/month |
| S3 GET requests | ~$0.004/1000 |
| **Total monthly** | **~$0.40/month** |

### Cost Controls

1. **30-day lifecycle policy** - Automatic deletion after 30 days
2. **Spot instance** - 70-90% cheaper than on-demand
3. **Auto-termination** - Instance terminates itself when done
4. **CloudWatch alarm** - Alert if charges exceed $5

## Files Created

### Infrastructure

```
infrastructure/
└── ec2_transfer_template.yaml   # CloudFormation template
```

### Scripts

```
scripts/
├── marrs_cloud_transfer.py      # Main transfer script
└── launch_transfer.sh           # One-command launcher
```

### Output in S3

```
s3://reefradar-2477-marrs-raw/
├── manifest.json                # Transfer metadata
├── sites/
│   ├── aus_D1/
│   │   ├── aus_D1_20220501_060000.wav
│   │   └── ...
│   ├── ind_H1/
│   └── ...
├── metadata/
│   └── sampling_strategy.json   # How files were selected
└── logs/
    └── transfer_YYYYMMDD.log    # Transfer logs
```

## Usage

### Option 1: Quick Launch (Recommended)

```bash
# Dry run - see what would be transferred
./scripts/launch_transfer.sh --dry-run

# Launch actual transfer
./scripts/launch_transfer.sh

# With custom samples per site
./scripts/launch_transfer.sh --samples 300
```

### Option 2: CloudFormation Stack

```bash
# Deploy infrastructure
aws cloudformation create-stack \
    --stack-name reefradar-marrs-transfer \
    --template-body file://infrastructure/ec2_transfer_template.yaml \
    --capabilities CAPABILITY_IAM

# Launch transfer instance
aws ec2 run-instances \
    --launch-template LaunchTemplateName=reefradar-2477-transfer-template
```

### Option 3: Local Testing

```bash
# Test with one site
python3 scripts/marrs_cloud_transfer.py \
    --dry-run \
    --sites ind_H1 \
    --samples-per-site 10

# Run actual transfer locally (for debugging)
python3 scripts/marrs_cloud_transfer.py \
    --sites ind_H1 \
    --samples-per-site 50
```

## Monitoring

### Check Instance Status

```bash
# Get instance state
aws ec2 describe-instances \
    --filters "Name=tag:Purpose,Values=marrs-transfer" \
    --query 'Reservations[].Instances[].[InstanceId,State.Name]'
```

### View Transfer Logs

```bash
# List log files
aws s3 ls s3://reefradar-2477-marrs-raw/logs/

# Download and view
aws s3 cp s3://reefradar-2477-marrs-raw/logs/transfer_latest.log - | tail -100
```

### Check Transferred Data

```bash
# Count files
aws s3 ls s3://reefradar-2477-marrs-raw/sites/ --recursive | wc -l

# Check size
aws s3 ls s3://reefradar-2477-marrs-raw/ --recursive --summarize

# View manifest
aws s3 cp s3://reefradar-2477-marrs-raw/manifest.json -
```

## Troubleshooting

### Spot Instance Terminated Early

Spot instances can be interrupted if capacity is needed. The transfer script is resumable:

```bash
# Re-run - it will skip already-uploaded files
./scripts/launch_transfer.sh
```

### Transfer Taking Too Long

For faster transfer, use a larger instance:

```bash
./scripts/launch_transfer.sh --instance-type t3.medium
```

### Cost Concerns

Check current charges:

```bash
aws ce get-cost-and-usage \
    --time-period Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
    --granularity DAILY \
    --metrics UnblendedCost \
    --filter '{"Tags":{"Key":"Project","Values":["ReefRadar"]}}'
```

## Data Quality

### File Integrity

Each ZIP file from Figshare includes MD5 checksums. The transfer script verifies these after download.

### Sampling Validation

The `manifest.json` in S3 records:
- Which files were selected
- Timestamp distribution
- Any errors during transfer

### Audio Format

All files are validated to be:
- Format: WAV PCM 16-bit mono
- Sample rate: 16kHz
- Duration: ~60 seconds
- Size: ~1.92MB each

## Portfolio Highlights

This pipeline demonstrates several AWS data engineering skills:

1. **Infrastructure as Code** - CloudFormation template for reproducibility
2. **Cost Optimization** - Spot instances, lifecycle policies, auto-termination
3. **Serverless Design** - No long-running servers required
4. **Data Engineering** - Smart sampling, streaming transfers
5. **Monitoring** - CloudWatch alarms, S3 logging
6. **Security** - Minimal IAM permissions, encrypted storage

## References

- [MARRS Dataset on Figshare](https://doi.org/10.5522/04/29958062)
- [MARRS Project Website](https://www.marrs.org/)
- [EC2 Spot Instances](https://aws.amazon.com/ec2/spot/)
- [S3 Lifecycle Policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
