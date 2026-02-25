<objective>
Complete the ReefRadar remediation by strengthening scientific caveats, improving error handling, and optimizing costs. These tasks can be done together as they don't have dependencies on each other.

This is the final remediation prompt - after this, ReefRadar should be scientifically rigorous and production-ready.
</objective>

<context>
ReefRadar now has working ML inference, correct preprocessing, and real reference embeddings. Three issues remain:

1. **Weak scientific caveats** - API responses don't adequately communicate limitations
2. **Basic error handling** - Errors lack structure and context
3. **Cost optimization** - Need to ensure monthly costs stay under $20

Repository: https://github.com/TyLuHow/ReefRadar
API: https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod

Examine:
@lambdas/router/handler.py - Error response handling
@lambdas/classifier/handler.py - Classification output with caveats
@dashboard/app.py - How results are displayed
@COSTS.md - Current cost analysis
</context>

<part_1_scientific_caveats>
## Strengthen Scientific Caveats

**Problem:** The current caveats are too weak given the scientific limitations of acoustic monitoring.

**Scientific Reality (from peer-reviewed literature):**
1. No universal acoustic index works across all reef types
2. Correlations between acoustics and reef health are often site-specific
3. Models trained on Indo-Pacific reefs may not transfer to Caribbean
4. Single recordings cannot represent overall reef health
5. PAM cannot replace visual surveys - only complement them
6. ACI (Acoustic Complexity Index) has repeatedly failed in marine applications

**Tasks:**

1. **Update classification response caveats:**
   ```json
   {
     "classification": {...},
     "methodology": {
       "model": "SurfPerch v1 (Williams et al. 2024)",
       "reference_sites": 45,
       "geographic_coverage": ["Indo-Pacific", "Caribbean"],
       "embedding_dimension": 1280
     },
     "caveats": {
       "summary": "Results are indicative, not diagnostic.",
       "limitations": [
         "Acoustic profiles vary by time of day, season, and lunar phase",
         "Model not validated for sites outside training distribution",
         "Single recording cannot capture full reef acoustic diversity",
         "Acoustic monitoring complements but does not replace visual surveys",
         "Confidence reflects model certainty, not ecological precision"
       ],
       "recommendation": "Combine with visual surveys and local expertise for management decisions."
     },
     "confidence_band": "medium"  // "high" (>0.7), "medium" (0.4-0.7), "low" (<0.4)
   }
   ```

2. **Add /methodology endpoint:**
   ```
   GET /methodology

   Returns detailed explanation of:
   - How classification works
   - What SurfPerch embeddings represent
   - Reference site selection criteria
   - Known limitations
   - Recommended use cases
   - Inappropriate use cases
   ```

3. **Update dashboard About tab:**
   - Move caveats to prominent position
   - Add expandable "Scientific Limitations" section
   - Include links to papers (Williams et al., Lamont et al.)

4. **Add confidence bands:**
   - High (>0.7): "Strong acoustic similarity to reference sites"
   - Medium (0.4-0.7): "Moderate similarity - interpret with caution"
   - Low (<0.4): "Weak similarity - low confidence classification"
</part_1_scientific_caveats>

<part_2_error_handling>
## Improve Error Handling

**Tasks:**

1. **Structured error responses:**
   ```python
   def make_error(code, message, details=None):
       return {
           "error": {
               "code": code,
               "message": message,
               "details": details or {},
               "timestamp": datetime.utcnow().isoformat()
           }
       }
   ```

2. **Implement error codes:**
   | Code | HTTP | Description |
   |------|------|-------------|
   | INVALID_AUDIO_FORMAT | 400 | Not a valid audio file |
   | AUDIO_TOO_SHORT | 400 | Less than 1.88s |
   | AUDIO_TOO_LONG | 400 | Exceeds 10 minutes |
   | UPLOAD_NOT_FOUND | 404 | Invalid upload_id |
   | ANALYSIS_NOT_FOUND | 404 | Invalid analysis_id |
   | PROCESSING_FAILED | 500 | Internal processing error |
   | MODEL_UNAVAILABLE | 503 | ML inference failed |
   | RATE_LIMITED | 429 | Too many requests |

3. **Add retry logic with exponential backoff:**
   ```python
   import time
   import random

   def retry_with_backoff(func, max_retries=3):
       for attempt in range(max_retries):
           try:
               return func()
           except TransientError as e:
               if attempt == max_retries - 1:
                   raise
               wait = (2 ** attempt) + random.uniform(0, 1)
               time.sleep(wait)
   ```

4. **Add /status/{analysis_id} endpoint:**
   ```json
   {
     "analysis_id": "abc123",
     "status": "preprocessing",
     "stages": {
       "upload": {"status": "complete", "completed_at": "..."},
       "preprocessing": {"status": "in_progress", "started_at": "..."},
       "classification": {"status": "pending"},
       "completed": {"status": "pending"}
     },
     "estimated_completion": "2026-01-30T04:15:00Z"
   }
   ```

5. **Update DynamoDB to track stages:**
   - Add `ANALYSIS#{id}#STAGE#preprocessing` items
   - Update on each stage transition
</part_2_error_handling>

<part_3_cost_optimization>
## Cost Optimization

**Current state (assuming Lambda inference from prompt 010):**
- SageMaker endpoint should be DELETED
- All compute should be Lambda-based (pay per request)

**Tasks:**

1. **Delete SageMaker endpoint if still exists:**
   ```bash
   aws sagemaker delete-endpoint \
     --endpoint-name reefradar-2477-surfperch-endpoint \
     --region us-east-1

   aws sagemaker delete-endpoint-config \
     --endpoint-config-name reefradar-2477-surfperch-config \
     --region us-east-1
   ```

2. **Add S3 lifecycle policies:**
   ```bash
   aws s3api put-bucket-lifecycle-configuration \
     --bucket reefradar-2477-audio \
     --lifecycle-configuration '{
       "Rules": [
         {
           "ID": "TransitionToIntelligentTiering",
           "Status": "Enabled",
           "Filter": {"Prefix": "uploads/"},
           "Transitions": [{"Days": 30, "StorageClass": "INTELLIGENT_TIERING"}]
         },
         {
           "ID": "DeleteFailedProcessing",
           "Status": "Enabled",
           "Filter": {"Prefix": "failed/"},
           "Expiration": {"Days": 7}
         }
       ]
     }'
   ```

3. **Verify DynamoDB on-demand:**
   ```bash
   aws dynamodb describe-table \
     --table-name reefradar-2477-metadata \
     --query 'Table.BillingModeSummary.BillingMode'
   # Should return "PAY_PER_REQUEST"
   ```

4. **Set up cost alerting:**
   ```bash
   aws budgets create-budget \
     --account-id 781978598306 \
     --budget '{
       "BudgetName": "ReefRadar-Monthly",
       "BudgetLimit": {"Amount": "20", "Unit": "USD"},
       "TimeUnit": "MONTHLY",
       "BudgetType": "COST"
     }' \
     --notifications-with-subscribers '[{
       "Notification": {
         "NotificationType": "ACTUAL",
         "ComparisonOperator": "GREATER_THAN",
         "Threshold": 80
       },
       "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "your-email@example.com"}]
     }]'
   ```

5. **Update COSTS.md with new projections:**

   | Service | Demo Usage | Light Prod |
   |---------|------------|------------|
   | Lambda (inference) | $0.10 | $1.00 |
   | Lambda (other) | $0 | $0.50 |
   | API Gateway | $0 | $0.10 |
   | S3 | $0.05 | $0.50 |
   | DynamoDB | $0 | $0.15 |
   | CloudWatch | $0.10 | $0.50 |
   | **TOTAL** | **~$0.25** | **~$2.75** |
</part_3_cost_optimization>

<output>
Modify these files:

**Caveats:**
- `./lambdas/classifier/handler.py` - Enhanced response structure
- `./lambdas/router/handler.py` - Add /methodology endpoint
- `./dashboard/app.py` - Prominent caveat display
- `./docs/METHODOLOGY.md` - New file with full methodology

**Errors:**
- `./lambdas/router/handler.py` - Structured errors, /status endpoint
- `./lambdas/preprocessor/handler.py` - Proper error codes
- `./lambdas/classifier/handler.py` - Retry logic, error codes
- `./API.md` - Document error codes

**Costs:**
- `./COSTS.md` - Updated projections
- `./scripts/cleanup.sh` - Ensure SageMaker cleanup included

Redeploy all Lambdas after changes.
</output>

<verification>
**Caveats:**
1. Classification response includes full caveat structure
2. /methodology endpoint returns detailed explanation
3. Dashboard shows limitations prominently
4. Confidence bands display correctly

**Errors:**
1. All errors follow structured format:
   ```bash
   # Test invalid upload
   curl .../visualize/invalid-id | jq '.error.code'
   # Should return "ANALYSIS_NOT_FOUND"
   ```
2. /status endpoint shows processing stages
3. Retry logic handles transient failures

**Costs:**
1. No SageMaker endpoint running:
   ```bash
   aws sagemaker list-endpoints --region us-east-1
   # Should not include reefradar-*
   ```
2. Budget alert configured
3. Projected monthly cost < $20
</verification>

<success_criteria>
- All classification responses include comprehensive caveats
- /methodology endpoint documents limitations clearly
- Dashboard displays methodology prominently
- Confidence bands provide qualitative interpretation
- All errors return structured JSON with codes
- /status endpoint shows processing progress
- Retry logic implemented for transient failures
- No SageMaker endpoint running
- S3 lifecycle policies configured
- Monthly cost projection < $20
- Budget alerting configured
</success_criteria>
