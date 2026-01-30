# ReefRadar - Cost Analysis

## Current Resource Costs

### Summary (January 2026)

| Service | Status | Monthly Cost |
|---------|--------|--------------|
| Lambda | 3 functions | ~$0 (free tier) |
| API Gateway | HTTP API | ~$0 (free tier) |
| S3 | ~120 MB storage | ~$0.01 |
| DynamoDB | On-demand, ~9 items | ~$0 (free tier) |
| SageMaker | ml.m5.large running | **~$83** |
| CloudWatch | Log storage | ~$0.10 |
| **TOTAL** | | **~$83/month** |

### Critical Cost Item: SageMaker Endpoint

The SageMaker endpoint is the dominant cost:
- Instance type: ml.m5.large
- Hourly rate: $0.115/hour
- Daily cost: $2.76/day
- Monthly cost: **$82.80/month**

**The endpoint has an XLA error and isn't functional.** The system falls back to synthetic embeddings, so this cost provides no value.

### Recommended Action

Delete the SageMaker endpoint to save $83/month:

```bash
# Delete the endpoint
aws sagemaker delete-endpoint \
  --endpoint-name reefradar-2477-surfperch-endpoint \
  --region us-east-1

# Also delete the endpoint config
aws sagemaker delete-endpoint-config \
  --endpoint-config-name reefradar-2477-surfperch-config \
  --region us-east-1

# Model can stay (no ongoing cost)
```

## Service-by-Service Breakdown

### AWS Lambda

| Resource | Pricing |
|----------|---------|
| Free tier | 1M requests/month, 400,000 GB-seconds |
| After free tier | $0.20 per 1M requests |
| Compute | $0.0000166667 per GB-second |

**Current Usage:**
- Router: 256 MB × 30s max = 7.5 GB-seconds/request
- Preprocessor: 1024 MB × 180s max = 184 GB-seconds/request
- Classifier: 512 MB × 120s max = 61 GB-seconds/request

**Cost per full analysis:** ~253 GB-seconds = $0.004

**Monthly projection:**
| Usage | Requests | Lambda Cost |
|-------|----------|-------------|
| Dev (10/day) | 300 | $0 (free tier) |
| Demo (100/day) | 3,000 | $0.01 |
| Light prod (1000/day) | 30,000 | $1.20 |

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

### SageMaker

| Instance | On-Demand Price |
|----------|-----------------|
| ml.t2.medium | $0.056/hour |
| ml.m5.large | $0.115/hour |
| ml.m5.xlarge | $0.230/hour |
| Serverless | $0.0001/second of compute |

**Alternatives:**
1. **Delete endpoint:** $0 (use synthetic fallback)
2. **Serverless Inference:** ~$0.10/1000 requests
3. **Smaller instance:** ml.t2.medium = $40/month

### CloudWatch Logs

| Resource | Pricing |
|----------|---------|
| Ingestion | $0.50/GB |
| Storage | $0.03/GB/month |

**Estimated:** $0.10/month for development usage

## Cost Scenarios

### Scenario 1: Development/Demo (Current - No Changes)
```
SageMaker endpoint running but unused: $83.00
Everything else: $0.15
TOTAL: $83.15/month
```

### Scenario 2: Development/Demo (Delete SageMaker)
```
Lambda: $0.00
API Gateway: $0.00
S3: $0.01
DynamoDB: $0.00
CloudWatch: $0.10
TOTAL: $0.11/month
```

### Scenario 3: Light Production (1000 requests/day)
```
Lambda: $1.20
API Gateway: $0.10
S3: $0.50
DynamoDB: $0.15
CloudWatch: $0.50
TOTAL: $2.45/month
```

### Scenario 4: Production with Working ML
If the SageMaker XLA issue is fixed:
```
Option A - Real-time endpoint (ml.m5.large): $83/month base
Option B - Serverless Inference: ~$3/month at 1000 req/day
Option C - Lambda + local model: ~$5/month (larger Lambda memory)
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

**ReefRadar fits comfortably within free tier** at demo usage levels (excluding SageMaker).

## Cost Optimization Recommendations

### Immediate Actions

1. **Delete SageMaker Endpoint** - Save $83/month
   ```bash
   aws sagemaker delete-endpoint --endpoint-name reefradar-2477-surfperch-endpoint --region us-east-1
   ```

2. **Set Up Billing Alerts**
   ```bash
   aws budgets create-budget --account-id 781978598306 \
     --budget '{"BudgetName":"ReefRadar-Monthly","BudgetLimit":{"Amount":"10","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
     --notifications-with-subscribers '[{"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80},"Subscribers":[{"SubscriptionType":"EMAIL","Address":"your-email@example.com"}]}]'
   ```

### Future Optimizations

1. **Use S3 Intelligent-Tiering** for audio files
2. **Enable S3 Lifecycle Rules** to delete old uploads after 30 days
3. **Use Lambda ARM64** for 20% cost reduction
4. **Consider SageMaker Serverless** if ML is needed
5. **Implement caching** for repeated reference site queries

## Monitoring Costs

### AWS Cost Explorer

View costs in AWS Console:
https://us-east-1.console.aws.amazon.com/cost-management/home#/dashboard

### CLI Command
```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-01-01,End=2026-01-31 \
  --granularity MONTHLY \
  --metrics "BlendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE
```

### Set Up Cost Anomaly Detection
```bash
aws ce create-anomaly-monitor \
  --anomaly-monitor '{"MonitorName":"ReefRadar-Costs","MonitorType":"DIMENSIONAL","MonitorDimension":"SERVICE"}'
```
