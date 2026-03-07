# ReefRadar - Cost Analysis

## Current Resource Costs

### Summary (March 2026)

| Service | Status | Monthly Cost |
|---------|--------|--------------|
| Lambda | 4 functions (incl. container) | ~$0 (free tier) |
| API Gateway | HTTP API | ~$0 (free tier) |
| S3 | ~120 MB storage | ~$0.01 |
| DynamoDB | On-demand, ~9 items | ~$0 (free tier) |
| SageMaker | **DELETED** (2026-02-20) | $0 |
| CloudWatch | Log storage | ~$0.10 |
| ECR | Container image | ~$0 (free tier) |
| **TOTAL** | | **~$0.11/month** |

### SageMaker Endpoint (DELETED)

The SageMaker endpoint was deleted on 2026-02-20. ML inference now runs entirely on a Lambda container image (reefradar-2477-inference) with no idle costs.

- Previous cost: $82.80/month (ml.m5.large, $0.115/hour)
- Current cost: $0 (Lambda container inference included in Lambda free tier)
- Savings: $82.80/month

## Service-by-Service Breakdown

### AWS Lambda

| Resource | Pricing |
|----------|---------|
| Free tier | 1M requests/month, 400,000 GB-seconds |
| After free tier | $0.20 per 1M requests |
| Compute | $0.0000166667 per GB-second |

**Current Usage:**
- Router: 256 MB x 30s max = 7.5 GB-seconds/request
- Preprocessor: 1024 MB x 180s max = 184 GB-seconds/request
- Classifier: 512 MB x 120s max = 61 GB-seconds/request
- Inference: 3008 MB x 300s max = 902 GB-seconds/request

**Cost per full analysis:** ~1,155 GB-seconds = $0.019

**Monthly projection:**
| Usage | Requests | Lambda Cost |
|-------|----------|-------------|
| Dev (10/day) | 300 | $0 (free tier) |
| Demo (100/day) | 3,000 | $0.50 |
| Light prod (1000/day) | 30,000 | $18.00 |

### API Gateway (HTTP API)

| Resource | Pricing |
|----------|---------|
| Free tier | 1M requests/month (12 months) |
| After free tier | $1.00 per million requests |

**Monthly projection:**
| Usage | Requests | API GW Cost |
|-------|----------|-------------|
| Dev | ~1,000 | $0 |
| Demo | ~10,000 | $0 |
| Light prod | ~100,000 | $0.10 |

### Amazon S3

| Resource | Pricing |
|----------|---------|
| Storage | $0.023/GB/month |
| PUT requests | $0.005/1,000 |
| GET requests | $0.0004/1,000 |

**Current storage:** ~120 MB = $0.003/month

**Monthly projection (including data):**
| Usage | Storage | Requests | S3 Cost |
|-------|---------|----------|---------|
| Dev | 200 MB | 500 | $0.01 |
| Demo | 1 GB | 5,000 | $0.05 |
| Light prod | 10 GB | 50,000 | $0.50 |

### DynamoDB (On-Demand)

| Resource | Pricing |
|----------|---------|
| Write | $1.25 per million WRUs |
| Read | $0.25 per million RRUs |
| Storage | $0.25/GB/month |

**Current usage:** 9 items, minimal reads/writes

**Monthly projection:**
| Usage | Operations | DynamoDB Cost |
|-------|------------|---------------|
| Dev | 1,000 | $0 |
| Demo | 10,000 | $0.01 |
| Light prod | 100,000 | $0.15 |

### CloudWatch Logs

| Resource | Pricing |
|----------|---------|
| Ingestion | $0.50/GB |
| Storage | $0.03/GB/month |

**Estimated:** $0.10/month for development usage

## Cost Scenarios

### Scenario 1: Development/Demo (Current)
```
Lambda (4 functions): $0.00
API Gateway: $0.00
S3: $0.01
DynamoDB: $0.00
CloudWatch: $0.10
TOTAL: $0.11/month
```

### Scenario 2: Light Production (1000 requests/day)
```
Lambda: $18.00
API Gateway: $0.10
S3: $0.50
DynamoDB: $0.15
CloudWatch: $0.50
TOTAL: $19.25/month
```

### Scenario 3: Optimized Production
If cold starts are an issue at scale:
```
Option A - Provisioned concurrency (inference): ~$30/month base
Option B - Current on-demand: ~$19/month (with cold starts)
```

## AWS Free Tier Coverage

The following free tier applies for 12 months after account creation:

| Service | Free Tier |
|---------|-----------|
| Lambda | 1M requests, 400K GB-seconds |
| API Gateway | 1M HTTP API calls |
| DynamoDB | 25 GB storage, 25 WCU, 25 RCU |
| S3 | 5 GB storage, 20K GET, 2K PUT |
| CloudWatch | 10 custom metrics, 10 alarms |

**ReefRadar fits comfortably within free tier** at demo usage levels.

## Cost Optimization Recommendations

### Completed Actions

1. **Deleted SageMaker Endpoint** (2026-02-20) - Saved $83/month
   - Replaced with Lambda container inference at zero idle cost

### Future Optimizations

1. **Use S3 Intelligent-Tiering** for audio files
2. **Enable S3 Lifecycle Rules** to delete old uploads after 30 days
3. **Use Lambda ARM64** for 20% cost reduction
4. **Consider provisioned concurrency** for inference Lambda if cold starts are problematic
5. **Implement caching** for repeated reference site queries

## Monitoring Costs

### AWS Cost Explorer

View costs in AWS Console:
https://us-east-1.console.aws.amazon.com/cost-management/home#/dashboard

### CLI Command
```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-03-01,End=2026-03-31 \
  --granularity MONTHLY \
  --metrics "BlendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE
```

### Set Up Cost Anomaly Detection
```bash
aws ce create-anomaly-monitor \
  --anomaly-monitor '{"MonitorName":"ReefRadar-Costs","MonitorType":"DIMENSIONAL","MonitorDimension":"SERVICE"}'
```
