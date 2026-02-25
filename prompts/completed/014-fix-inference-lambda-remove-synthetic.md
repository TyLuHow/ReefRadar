<objective>
Fix the inference Lambda and completely remove synthetic embedding fallback from the classifier.

The classifier currently falls back to synthetic (fake) embeddings when the inference Lambda fails, producing unreliable results. This fallback must be eliminated entirely - the system should either work correctly with real SurfPerch embeddings or fail gracefully with actionable error information.

This matters because: The current synthetic fallback produces scientifically meaningless results (we observed negative cosine similarities and wrong classifications). Users deserve accurate results or clear errors, not silently degraded fake data.
</objective>

<context>
Read CLAUDE.md for project conventions.

Current architecture:
- Classifier Lambda (`lambdas/classifier/handler.py`) orchestrates analysis
- Inference Lambda (`reefradar-2477-inference`) runs SurfPerch in a container
- Classifier invokes inference Lambda, falls back to synthetic if it fails

Recent test failure:
- Uploaded known degraded reef audio (ind_D2)
- Classifier returned "restored_early" with 60.9% confidence (wrong!)
- Response included: `"synthetic": true` and caveat "Demo mode: using synthetic embeddings"
- Similar sites showed negative similarities (impossible with proper cosine similarity)

Key files:
@lambdas/classifier/handler.py - Contains fallback logic around lines 53-97
@infrastructure/lambda_container/inference.py - SurfPerch inference handler
@infrastructure/resources.json - AWS resource ARNs and configuration
</context>

<research_phase>
Before making changes, thoroughly investigate the root cause:

1. **Check inference Lambda status and configuration**
   ```bash
   aws lambda get-function --function-name reefradar-2477-inference --query 'Configuration.{State:State,Timeout:Timeout,MemorySize:MemorySize,LastModified:LastModified}'
   ```

2. **Check recent CloudWatch logs for inference Lambda errors**
   ```bash
   aws logs filter-log-events \
     --log-group-name /aws/lambda/reefradar-2477-inference \
     --start-time $(date -d '1 hour ago' +%s000) \
     --filter-pattern "ERROR" \
     --limit 20
   ```

3. **Check classifier Lambda logs to see what error triggered fallback**
   ```bash
   aws logs filter-log-events \
     --log-group-name /aws/lambda/reefradar-2477-classifier \
     --start-time $(date -d '1 hour ago' +%s000) \
     --filter-pattern "Inference Lambda unavailable" \
     --limit 10
   ```

4. **Test inference Lambda directly** (if needed, create a test payload)
   ```bash
   # Create minimal test payload
   echo '{"test": true}' > /tmp/test_payload.json
   aws lambda invoke --function-name reefradar-2477-inference \
     --payload file:///tmp/test_payload.json \
     --cli-binary-format raw-in-base64-out \
     /tmp/inference_response.json
   cat /tmp/inference_response.json
   ```

5. **Review the exact error being caught** in classifier handler.py around the try/except block

Document findings before proceeding to implementation.
</research_phase>

<implementation_requirements>

1. **Remove ALL synthetic embedding generation code**
   - Delete the `generate_synthetic_embedding()` function entirely
   - Remove the `use_synthetic` flag and all related logic
   - Remove the synthetic fallback in the except block

2. **Implement proper error handling with three strategies:**

   a. **Return clear error to user** (immediate response)
      - If inference fails, return HTTP 503 with actionable error message
      - Include: error type, suggestion to retry, estimated recovery time if known

   b. **Queue for retry** (background retry)
      - On transient errors (timeout, cold start), save request to DynamoDB with retry flag
      - Implement exponential backoff (1s, 2s, 4s delays)
      - Max 3 retry attempts before final failure

   c. **Graceful degradation with warning**
      - If partial embeddings succeeded, return partial results
      - Include prominent warning: "Partial results - X of Y segments processed"
      - Never silently degrade to synthetic data

3. **Fix the inference Lambda if the issue is configuration**
   - If timeout: increase from current setting (check what it is)
   - If memory: inference needs ~3GB for SurfPerch model
   - If cold start: consider provisioned concurrency or keep-warm ping
   - If container issue: check ECR image and deployment logs

4. **Add diagnostic information to error responses**
   - Include Lambda request ID for debugging
   - Include which stage failed (preprocessing, inference, classification)
   - Log detailed errors to CloudWatch with correlation IDs

</implementation_requirements>

<constraints>
- NEVER generate synthetic/fake embeddings under any circumstances
- The API should fail loudly rather than return fake results (users need to trust the science)
- Maintain backward compatibility with existing API response structure
- Don't break the dashboard - update error handling there too if needed
- Keep costs reasonable - don't add provisioned concurrency without user approval
</constraints>

<output>
Modify these files:
- `lambdas/classifier/handler.py` - Remove synthetic fallback, add proper error handling
- `lambdas/router/handler.py` - Update error responses if needed
- `infrastructure/lambda_container/inference.py` - Fix any issues found

Create if needed:
- `scripts/test_inference_lambda.py` - Direct Lambda test script

After modifications, redeploy:
```bash
# Classifier
cd lambdas/classifier && zip -r function.zip handler.py && \
aws lambda update-function-code --function-name reefradar-2477-classifier --zip-file fileb://function.zip

# Router (if modified)
cd ../router && zip -r function.zip handler.py && \
aws lambda update-function-code --function-name reefradar-2477-router --zip-file fileb://function.zip
```
</output>

<verification>
After implementation, verify:

1. **Inference Lambda works directly**
   ```bash
   python scripts/test_inference_lambda.py
   ```

2. **End-to-end test with degraded reef audio**
   - Upload ind_D2 audio sample
   - Run analysis
   - Verify: `"synthetic": false` in response
   - Verify: classification is "degraded" or similar (not "restored_early")
   - Verify: all similarity scores are positive (0-1 range)

3. **Error handling test**
   - Temporarily break inference Lambda (e.g., wrong env var)
   - Verify API returns proper 503 error, NOT synthetic results
   - Verify error message is actionable

4. **Check no synthetic code remains**
   ```bash
   grep -r "synthetic" lambdas/classifier/handler.py
   # Should only show synthetic:false in responses, not generation logic
   ```
</verification>

<success_criteria>
- Inference Lambda invocations succeed (check CloudWatch)
- Classification of known degraded audio returns "degraded" status
- All similarity scores are in valid 0-1 range (no negatives)
- Response includes `"synthetic": false`
- No synthetic embedding generation code exists in codebase
- Proper error responses when inference fails (503, not fake results)
- Caveats text no longer mentions "Demo mode" or synthetic
</success_criteria>
</content>
</invoke>