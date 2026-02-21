<objective>
Run a comprehensive verification of all post-testing fixes for ReefRadar.

This is the final validation step after fixing:
1. Red Sea region detection overlap (already fixed — smallest-area matching)
2. /status endpoint returning 404 for unknown IDs
3. Upload WAV validation
4. Next.js dashboard rendering and polish

Generate a verification report documenting pass/fail for each test.
</objective>

<context>
Read `CLAUDE.md` for project conventions.

API base: `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`
AWS region: us-east-1
Dashboard: `dashboard-next/` (Next.js 14)
Previous test report: `docs/TEST_REPORT.md`
</context>

<requirements>

## API Endpoint Tests

Run each test and record the result:

```bash
# 1. Health check
curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health | python3 -m json.tool

# 2. Sites (should be 8, all synthetic:false)
curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites | python3 -c "
import sys, json
data = json.load(sys.stdin)
sites = data['sites']
print(f'Sites: {len(sites)}')
for s in sites:
    print(f'  {s[\"site_id\"]}: synthetic={s.get(\"synthetic\", \"N/A\")}')
"

# 3. Status with fake ID (should be 404 ANALYSIS_NOT_FOUND)
curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/status/fake-verification-id-999 | python3 -m json.tool

# 4. Status with a real analysis ID from recent tests
# (Check DynamoDB or use a known ID from the session)
```

## Region Detection Tests

Upload a test WAV and run analysis with each region's coordinates:

```bash
# Generate a 6-second test WAV
python3 -c "
import struct, math
sr, dur = 32000, 6
n = sr * dur
samples = [int(16000 * math.sin(2 * math.pi * 440 * t / sr)) for t in range(n)]
data = struct.pack('<' + 'h' * n, *samples)
with open('/tmp/verify_test.wav', 'wb') as f:
    f.write(b'RIFF')
    f.write(struct.pack('<I', 36 + len(data)))
    f.write(b'WAVE')
    f.write(b'fmt ')
    f.write(struct.pack('<IHHIIHH', 16, 1, 1, sr, sr*2, 2, 16))
    f.write(b'data')
    f.write(struct.pack('<I', len(data)))
    f.write(data)
print('Created /tmp/verify_test.wav')
"
```

For each test, upload the WAV, analyze with coordinates, poll for results, and check:

| Test | Coordinates | Expected Region | Expected in_distribution |
|------|-------------|-----------------|--------------------------|
| Indonesia | -4.93, 119.32 | INDO_PACIFIC_WEST | true |
| Red Sea (Egypt) | 27.5, 34.0 | RED_SEA | false |
| Caribbean (USVI) | 18.4, -64.9 | CARIBBEAN | false |
| Kenya | -2.216, 41.013 | INDIAN_OCEAN | true |
| No coordinates | null, null | UNKNOWN | false |

## Upload Validation Tests

```bash
# Non-WAV data (should fail with INVALID_AUDIO_FORMAT)
echo "this is not a wav file at all" > /tmp/not_a_wav.txt
# Upload via the API and check response

# Tiny file (should fail with FILE_TOO_SMALL)
echo "hi" > /tmp/tiny.txt
# Upload via the API and check response

# Valid WAV (should succeed)
# Use the test WAV from above
```

## Dashboard Verification

```bash
cd /home/yler_uby_oward/ReefRadar/dashboard-next

# 1. Build succeeds
npm run build 2>&1 | tail -10

# 2. Scripts load
npm run start -- -H 0.0.0.0 &
sleep 5
SCRIPTS=$(curl -s http://localhost:3000 | grep -c "script")
echo "Script tags: $SCRIPTS"
kill %1 2>/dev/null

# 3. Check file size text
grep -rn "50MB\|10MB" src/

# 4. Check region warning exists
grep -rn "in_training_distribution\|Geographic Limitation" src/
```
</requirements>

<output>
Save the verification report to: `./docs/VERIFICATION_REPORT.md`

Format:
```markdown
# ReefRadar Post-Fix Verification Report

**Date:** [current date]
**Tester:** Claude Code

## Summary
- Total tests: X
- Passed: X
- Failed: X
- Warnings: X

## Results

### API Endpoints
| Test | Result | Details |
|------|--------|---------|
| ... | PASS/FAIL | ... |

### Region Detection
| Coordinates | Expected | Actual | Result |
|-------------|----------|--------|--------|
| ... | ... | ... | PASS/FAIL |

### Upload Validation
| Test | Expected | Actual | Result |
|------|----------|--------|--------|
| ... | ... | ... | PASS/FAIL |

### Dashboard
| Check | Result | Details |
|-------|--------|---------|
| ... | PASS/FAIL | ... |

## Issues Found
[Any remaining issues]

## Conclusion
[Overall assessment]
```
</output>

<verification>
The verification report itself IS the deliverable. Ensure:
- Every test has a clear PASS/FAIL result
- Failed tests include the actual vs expected output
- The report is saved to `./docs/VERIFICATION_REPORT.md`
</verification>

<success_criteria>
- All API endpoint tests pass (health, sites, status 404)
- Red Sea correctly detected as out-of-distribution
- Kenya correctly detected as in-distribution
- Caribbean correctly detected as out-of-distribution
- Indonesia correctly detected as in-distribution
- Upload validation rejects non-WAV files
- Next.js dashboard builds and renders with JavaScript
- Verification report saved to docs/VERIFICATION_REPORT.md
</success_criteria>
