<objective>
Execute a systematic verification of the entire ReefRadar system after the remediation work.
This covers API endpoints, region detection, error handling, code integrity, dashboards, and CloudWatch logs.
Run every test, report results clearly, and flag any failures that need fixing.
</objective>

<context>
ReefRadar is a serverless coral reef acoustic health analysis system on AWS.
Recent remediation replaced synthetic embeddings with real SurfPerch ML inference,
added a trained MLP classifier, geographic region detection, a Next.js dashboard,
and rewrote documentation. This checklist verifies everything works correctly.

Read CLAUDE.md for full architecture context before starting.

API Base URL: https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod
AWS Region: us-east-1
</context>

<requirements>

<phase_1 name="API Endpoint Verification">
Test all API endpoints and verify correct responses:

1. GET /health - Should return {"status": "healthy", ...}
2. GET /sites - Verify:
   - Exactly 8 sites returned
   - All have `synthetic: false`
   - Countries include Indonesia and Kenya
   - All 4 status categories present (healthy, degraded, restored_early, restored_mid)
3. GET /status/{fake-id} - Test with a non-existent analysis ID, verify graceful response
4. Full upload-analyze-poll cycle:
   - Generate a 6-second 32kHz test WAV file
   - POST /upload with the WAV file
   - POST /analyze with the upload_id (no coordinates - tests null coordinate handling)
   - Poll GET /visualize/{analysis_id} until complete or failed
   - Verify result has: classification, similar_sites, visualization, embedding_summary, caveats
   - Verify embedding_summary.synthetic is false
   - Verify embedding_summary.classifier_model is "trained_mlp"
</phase_1>

<phase_2 name="Region Detection Edge Cases">
Run 5 separate end-to-end tests (upload + analyze + poll) with different coordinates.
You may reuse the same upload_id since only the /analyze call uses coordinates.

| Test | Latitude | Longitude | Expected Region | Expected in_training_distribution |
|------|----------|-----------|-----------------|-----------------------------------|
| Indonesia (in-dist) | -4.93 | 119.32 | INDO_PACIFIC_WEST | true |
| Caribbean (out-dist) | 18.4 | -64.9 | CARIBBEAN | false |
| Red Sea (out-dist) | 27.5 | 34.0 | RED_SEA | false |
| No coordinates | omit | omit | UNKNOWN | false |
| Invalid coords | 999 | 999 | UNKNOWN | false |

For each test verify:
- classification.region.detected matches expected
- classification.region.in_training_distribution matches expected
- confidence_adjusted is true when out-of-distribution, false when in-distribution
- Confidence values are lower for out-of-distribution than in-distribution (compare to Indonesia baseline)
- Caveats text includes appropriate geographic warning for out-of-distribution
- No crashes or 500 errors for any input
</phase_2>

<phase_3 name="Error Handling Verification">
Test failure modes by sending intentionally invalid requests:

1. Upload non-WAV data: POST /upload with Content-Type: audio/wav but body is plain text "not a wav file"
2. Invalid upload_id in analyze: POST /analyze with {"upload_id": "nonexistent-uuid-1234"}
3. Invalid analysis_id in visualize: GET /visualize/nonexistent-uuid-5678
4. Missing upload_id in analyze: POST /analyze with empty body {}

For each, verify:
- HTTP status code is 4xx (not 5xx)
- Response contains a meaningful error message
- No stack traces or internal details leaked
</phase_3>

<phase_4 name="Code Review Verification">
Verify critical code changes were applied correctly by reading files:

1. Region detection module exists and is correct:
   - Read lambdas/classifier/region_detection.py
   - Verify detect_region() and adjust_classification() functions exist
   - Verify all 7 region bounding boxes are defined

2. Classifier integrates region detection:
   - Read lambdas/classifier/handler.py
   - Verify it imports from region_detection
   - Verify it reads latitude/longitude from event
   - Verify it calls detect_region() and adjust_classification()

3. Reference embeddings are correct:
   - Read data/embeddings/metadata.json (just the structure, not full embeddings)
   - Verify 8 sites present
   - Verify each site has a mean_embedding array of length 1280
   - Verify version is "3.0"

4. Preprocessor uses correct SurfPerch parameters:
   - Read lambdas/preprocessor/handler.py
   - Verify sample rate is 32000 (not 16000)
   - Verify window size is 5.0 seconds / 160000 samples (not 1.88s / 30080)

5. Router forwards coordinates:
   - Read lambdas/router/handler.py
   - Verify /analyze handler reads latitude and longitude from body
   - Verify coordinates are passed to preprocessor payload
   - Verify /status endpoint exists

6. SiteCard is acoustics-focused:
   - Read dashboard-next/src/components/SiteCard.tsx
   - Verify NO references to "coral coverage" or "coral bleaching"
   - Verify descriptions reference acoustic/sound activity

7. Next.js About page is accurate:
   - Read dashboard-next/src/app/about/page.tsx
   - Verify references to 32kHz (not 16kHz)
   - Verify references to 5.0s windows (not 1.88s)
   - Verify "trained MLP" or "trained classifier" (not "cosine similarity" alone)

8. Inference container is fixed:
   - Read infrastructure/lambda_container/inference.py
   - Verify NO import of tensorflow_hub
   - Verify uses kagglehub for model download
   - Read infrastructure/lambda_container/requirements.txt
   - Verify tensorflow-hub is NOT listed
   - Read infrastructure/lambda_container/Dockerfile
   - Verify force-reinstall setuptools step exists
</phase_4>

<phase_5 name="Dashboard Build Verification">
1. Next.js dashboard:
   - Run `npm run build` in dashboard-next/
   - Verify build completes with zero errors
   - Verify all 3 pages generated (/, /about, /sites)
   - Note any warnings

2. Streamlit dashboard:
   - Verify dashboard/app.py exists and has coordinate input section
   - Verify dashboard/app.py references all 8 sites in SITE_COORDINATES
   - Verify no references to SageMaker in the app
</phase_5>

<phase_6 name="CloudWatch Logs Review">
Check recent Lambda logs for errors:

1. Classifier logs: Look for any errors in the last 2 hours
2. Inference logs: Look for any errors in the last 2 hours (especially pkg_resources)
3. Router logs: Check for any 5xx errors
4. Preprocessor logs: Check for any errors

Use: aws logs filter-log-events --log-group-name "/aws/lambda/reefradar-2477-{name}" --region us-east-1 --start-time {2_hours_ago_ms} --filter-pattern "ERROR" --max-items 10
</phase_6>

</requirements>

<output>
Present results as a structured test report with clear PASS/FAIL for each test.
Use this format:

## Test Report: ReefRadar Systematic Verification

### Phase 1: API Endpoints
- [PASS/FAIL] Health check: {details}
- [PASS/FAIL] Sites endpoint: {details}
...

### Phase 2: Region Detection
| Test | Region | in_dist | conf_adjusted | Confidence | Status |
|------|--------|---------|---------------|------------|--------|
| Indonesia | ... | ... | ... | ... | PASS/FAIL |
...

### Phase 3: Error Handling
...

### Phase 4: Code Review
...

### Phase 5: Dashboard Builds
...

### Phase 6: CloudWatch Logs
...

### Summary
- Total tests: X
- Passed: X
- Failed: X
- Warnings: X

### Issues Found (if any)
1. [Issue description and suggested fix]

Save this report to ./docs/TEST_REPORT.md
</output>

<constraints>
- Always specify --region us-east-1 for all AWS CLI commands
- For end-to-end tests, allow up to 60 seconds polling (inference cold starts can take 30s+)
- Do NOT modify any code - this is a read-only verification pass
- If a test fails, document the failure clearly but continue with remaining tests
- For Phase 2, you can run multiple /analyze calls against the same upload_id to save time
- For parallel efficiency, run independent API calls and file reads simultaneously where possible
</constraints>

<success_criteria>
- Every test in every phase has a clear PASS or FAIL result
- All API endpoints respond without 5xx errors
- Region detection returns correct results for all 5 coordinate sets
- Code review confirms all remediation changes are in place
- Next.js dashboard builds without errors
- CloudWatch logs show no persistent errors
- Complete test report saved to ./docs/TEST_REPORT.md
</success_criteria>
