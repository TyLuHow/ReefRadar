<objective>
Fix two bugs in the ReefRadar API router Lambda:

1. `/status/{analysis_id}` returns a default "preprocessing" response for non-existent IDs instead of 404
2. `/upload` accepts any data without validation — add WAV header check and file size limit

These fixes address failures found during systematic testing (see `docs/TEST_REPORT.md`).
The router Lambda is the API Gateway entry point for all requests.
</objective>

<context>
Read `CLAUDE.md` for project conventions and architecture overview.

Key files:
- `lambdas/router/handler.py` — The router Lambda that handles all API routes
- `docs/TEST_REPORT.md` — Full systematic test results showing the failures
- `infrastructure/resources.json` — AWS resource ARNs

Tech stack: Python 3.11, AWS Lambda, API Gateway, DynamoDB, S3
API base: `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`
AWS region: us-east-1
</context>

<research>
Before making changes, read `lambdas/router/handler.py` completely to understand:
1. How `/status/{analysis_id}` currently works — find where it falls through to a default response
2. How `/upload` currently works — find where it accepts the request body
3. The DynamoDB query patterns (pk/sk schema: `ANALYSIS#{id}` / `METADATA`, `RESULT`, etc.)
4. The existing error response format used elsewhere in the file
</research>

<requirements>

## Fix 1: /status Returns 404 for Unknown IDs

The `/status/{analysis_id}` endpoint must:
1. First check for a RESULT record (`sk: RESULT`) — if found, return complete status
2. Then check for a METADATA record (`sk: METADATA`) — if found, return processing stage
3. If NEITHER record exists, return 404 with `ANALYSIS_NOT_FOUND` error code

The 404 response format should match existing error patterns in the codebase:
```python
{
    'error': {
        'code': 'ANALYSIS_NOT_FOUND',
        'message': f'No analysis found with ID: {analysis_id}'
    }
}
```

## Fix 2: Upload WAV Validation

Add early validation to the upload handler to reject non-WAV files before storing in S3:

1. Check minimum file size (at least 44 bytes for WAV header)
2. Check WAV magic bytes: first 4 bytes must be `RIFF`, bytes 8-12 must be `WAVE`
3. Check maximum file size (50MB limit)

Error responses:
- Too small: `FILE_TOO_SMALL` / "File is too small to be a valid audio file"
- Not WAV: `INVALID_AUDIO_FORMAT` / "File does not appear to be a WAV file. Please upload a standard WAV audio file."
- Too large: `FILE_TOO_LARGE` / "File exceeds 50MB limit"

WHY early validation matters: Without it, invalid files are stored in S3 and only fail at the preprocessing stage, wasting storage and compute time. Early rejection gives users immediate feedback.
</requirements>

<implementation>
1. Read `lambdas/router/handler.py` to understand current patterns
2. Modify the status handler to add the 404 check
3. Modify the upload handler to add WAV validation at the top
4. Match existing error response patterns exactly — consistency matters for API consumers
5. Do NOT change any other endpoints or behavior
6. Package and deploy:
   ```bash
   python3 -c "
   import zipfile
   with zipfile.ZipFile('/tmp/router.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
       zf.write('lambdas/router/handler.py', 'handler.py')
   "
   aws lambda update-function-code --function-name reefradar-2477-router --zip-file fileb:///tmp/router.zip --region us-east-1
   ```
</implementation>

<verification>
After deploying, run these tests:

```bash
# Test 1: Unknown analysis ID should return 404
curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/status/nonexistent-fake-id-12345 | python3 -m json.tool
# Expected: {"error": {"code": "ANALYSIS_NOT_FOUND", ...}}

# Test 2: Health endpoint still works
curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health | python3 -m json.tool
# Expected: {"status": "healthy", ...}

# Test 3: Sites endpoint still works
curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"sites\"])} sites')"
# Expected: 8 sites
```
</verification>

<success_criteria>
- `/status/fake-id` returns HTTP 404 with ANALYSIS_NOT_FOUND error code
- `/upload` with non-WAV data returns HTTP 400 with INVALID_AUDIO_FORMAT
- All existing endpoints (/health, /sites, /upload with valid WAV, /analyze, /visualize) continue working
- Router Lambda deployed to us-east-1 without errors
</success_criteria>
