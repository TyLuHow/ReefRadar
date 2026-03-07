#!/bin/bash
# ReefRadar - Complete API Test Suite
# Usage: ./test-all.sh

set -e

API_URL="https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod"
PASS=0
FAIL=0

echo "=============================================="
echo "       REEFRADAR API TEST SUITE"
echo "=============================================="
echo ""

# Test 1: Health Check
echo "TEST 1: Health Check"
echo "--------------------"
HEALTH=$(curl -s "${API_URL}/health")
if echo "$HEALTH" | grep -q '"status": "healthy"'; then
    echo "PASS: Health endpoint responding"
    echo "Response: $HEALTH"
    ((PASS++))
else
    echo "FAIL: Health endpoint not healthy"
    echo "Response: $HEALTH"
    ((FAIL++))
fi
echo ""

# Test 2: Sites Endpoint
echo "TEST 2: Reference Sites"
echo "-----------------------"
SITES=$(curl -s "${API_URL}/sites")
SITE_COUNT=$(echo "$SITES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total_sites', 0))" 2>/dev/null || echo "0")
if [ "$SITE_COUNT" -gt 0 ]; then
    echo "PASS: Sites endpoint returning $SITE_COUNT sites"
    ((PASS++))
else
    echo "FAIL: Sites endpoint not working"
    echo "Response: $SITES"
    ((FAIL++))
fi
echo ""

# Test 3: Create Test Audio
echo "TEST 3: Creating Test Audio File"
echo "---------------------------------"
python3 << 'EOF'
import numpy as np
import struct
sr, dur = 32000, 6
t = np.linspace(0, dur, sr * dur)
audio = (np.sin(2*np.pi*500*t) * 0.5 * 32767).astype(np.int16)
with open('/tmp/reefradar_test.wav', 'wb') as f:
    f.write(b'RIFF' + struct.pack('<I', 36 + len(audio)*2) + b'WAVE')
    f.write(b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 1, sr, sr*2, 2, 16))
    f.write(b'data' + struct.pack('<I', len(audio)*2) + audio.tobytes())
print("Created /tmp/reefradar_test.wav (6 seconds, 32kHz)")
EOF
if [ -f /tmp/reefradar_test.wav ]; then
    echo "PASS: Test audio created"
    ((PASS++))
else
    echo "FAIL: Could not create test audio"
    ((FAIL++))
fi
echo ""

# Test 4: Upload
echo "TEST 4: File Upload"
echo "-------------------"
UPLOAD=$(curl -s -X POST "${API_URL}/upload" \
    -H "Content-Type: audio/wav" \
    -H "X-Filename: test_audio.wav" \
    --data-binary @/tmp/reefradar_test.wav)

UPLOAD_ID=$(echo "$UPLOAD" | python3 -c "import sys,json; print(json.load(sys.stdin).get('upload_id', ''))" 2>/dev/null)
if [ -n "$UPLOAD_ID" ] && [ "$UPLOAD_ID" != "None" ]; then
    echo "PASS: Upload successful"
    echo "Upload ID: $UPLOAD_ID"
    ((PASS++))
else
    echo "FAIL: Upload failed"
    echo "Response: $UPLOAD"
    ((FAIL++))
    exit 1
fi
echo ""

# Test 5: Start Analysis
echo "TEST 5: Start Analysis"
echo "----------------------"
ANALYZE=$(curl -s -X POST "${API_URL}/analyze" \
    -H "Content-Type: application/json" \
    -d "{\"upload_id\": \"$UPLOAD_ID\"}")

ANALYSIS_ID=$(echo "$ANALYZE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('analysis_id', ''))" 2>/dev/null)
if [ -n "$ANALYSIS_ID" ] && [ "$ANALYSIS_ID" != "None" ]; then
    echo "PASS: Analysis started"
    echo "Analysis ID: $ANALYSIS_ID"
    ((PASS++))
else
    echo "FAIL: Analysis start failed"
    echo "Response: $ANALYZE"
    ((FAIL++))
    exit 1
fi
echo ""

# Test 6: Poll for Results
echo "TEST 6: Polling for Results (max 60 seconds)"
echo "---------------------------------------------"
for i in {1..12}; do
    sleep 5
    RESULT=$(curl -s "${API_URL}/visualize/${ANALYSIS_ID}")
    STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status', ''))" 2>/dev/null)

    echo "  Attempt $i: Status = $STATUS"

    if [ "$STATUS" = "complete" ]; then
        echo "PASS: Analysis completed!"
        LABEL=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('classification', {}).get('label', 'unknown'))" 2>/dev/null)
        CONFIDENCE=$(echo "$RESULT" | python3 -c "import sys,json; print(f\"{json.load(sys.stdin).get('classification', {}).get('confidence', 0)*100:.1f}%\")" 2>/dev/null)
        echo "  Classification: $LABEL ($CONFIDENCE confidence)"
        ((PASS++))
        break
    elif [ "$STATUS" = "failed" ]; then
        echo "FAIL: Analysis failed"
        ERROR=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error', 'Unknown'))" 2>/dev/null)
        echo "  Error: $ERROR"
        ((FAIL++))
        break
    fi

    if [ $i -eq 12 ]; then
        echo "FAIL: Analysis timed out"
        ((FAIL++))
    fi
done
echo ""

# Summary
echo "=============================================="
echo "               TEST SUMMARY"
echo "=============================================="
echo "PASSED: $PASS"
echo "FAILED: $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "All tests passed!"
    exit 0
else
    echo "Some tests failed."
    exit 1
fi
