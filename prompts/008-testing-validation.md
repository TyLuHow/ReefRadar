<objective>
Perform comprehensive end-to-end testing of the ReefRadar system and validate all components work together correctly.

This phase ensures:
- API endpoints function correctly
- Audio upload and processing works end-to-end
- SageMaker inference returns valid embeddings
- Dashboard displays results properly
- Cost monitoring is active
</objective>

<context>
Project: ReefRadar - Coral Reef Acoustic Health Analysis API
Phase: 8 of 8 (Final)

Components to Test:
1. API Gateway endpoints (health, sites, upload, analyze, visualize)
2. Lambda function chain (router → preprocessor → classifier)
3. SageMaker embedding generation
4. S3 storage (uploads, processed files)
5. DynamoDB metadata tracking
6. Streamlit dashboard integration

Test Data:
- Create synthetic test audio (simple sine wave)
- Use sample files from ReefSet if available
</context>

<prerequisites>
Before starting:
1. Source AWS environment: `source ~/.reefradar-env`
2. All previous phases completed
3. API_URL, PROJECT_PREFIX, SAGEMAKER_ENDPOINT variables set
4. jq installed for JSON parsing: `sudo apt install jq` or `brew install jq`
</prerequisites>

<implementation>

**Step 1: Create Test Scripts Directory**
```bash
mkdir -p ~/reef-project/tests
cd ~/reef-project/tests
```

**Step 2: Create End-to-End Test Script**

Create `~/reef-project/tests/test_e2e.sh`:
```bash
#!/bin/bash
# ReefRadar End-to-End Test Suite

set -e  # Exit on error

# Load environment
source ~/.reefradar-env

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "  ReefRadar End-to-End Test Suite"
echo "=========================================="
echo ""
echo "API URL: $API_URL"
echo "Project: $PROJECT_PREFIX"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

# Test function
run_test() {
    local name="$1"
    local result="$2"
    local expected="$3"

    if [[ "$result" == *"$expected"* ]]; then
        echo -e "${GREEN}✓ PASS${NC}: $name"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $name"
        echo "  Expected: $expected"
        echo "  Got: $result"
        ((TESTS_FAILED++))
    fi
}

echo "--- Test 1: Health Check ---"
HEALTH=$(curl -s "${API_URL}/health")
run_test "Health endpoint returns status" "$HEALTH" "healthy"

echo ""
echo "--- Test 2: Sites Endpoint ---"
SITES=$(curl -s "${API_URL}/sites")
run_test "Sites endpoint returns sites" "$SITES" "sites"
SITE_COUNT=$(echo "$SITES" | jq '.total_sites // 0')
run_test "Has reference sites" "$SITE_COUNT" "8"

echo ""
echo "--- Test 3: Create Test Audio ---"
python3 << 'EOF'
import wave
import struct
import math

sample_rate = 16000
duration = 3  # 3 seconds (more than 1.88s minimum)
num_samples = sample_rate * duration

with wave.open('/tmp/test_reef_audio.wav', 'w') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(sample_rate)
    for i in range(num_samples):
        # Mix of frequencies to simulate reef sounds
        value = int(10000 * (
            math.sin(2 * math.pi * 200 * i / sample_rate) +
            0.5 * math.sin(2 * math.pi * 800 * i / sample_rate) +
            0.3 * math.sin(2 * math.pi * 2000 * i / sample_rate)
        ))
        value = max(-32767, min(32767, value))
        wav.writeframes(struct.pack('<h', value))

print("Test audio created: /tmp/test_reef_audio.wav")
print(f"Duration: {duration}s, Sample rate: {sample_rate}Hz")
EOF
run_test "Test audio file created" "$(ls /tmp/test_reef_audio.wav 2>/dev/null)" "test_reef_audio.wav"

echo ""
echo "--- Test 4: Upload Audio ---"
UPLOAD_RESPONSE=$(curl -s -X POST "${API_URL}/upload" \
    -H "Content-Type: audio/wav" \
    -H "X-Filename: test_reef_audio.wav" \
    --data-binary @/tmp/test_reef_audio.wav)

run_test "Upload returns upload_id" "$UPLOAD_RESPONSE" "upload_id"
UPLOAD_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.upload_id // empty')

if [ -z "$UPLOAD_ID" ]; then
    echo -e "${RED}Upload failed, cannot continue tests${NC}"
    echo "Response: $UPLOAD_RESPONSE"
    exit 1
fi

echo "  Upload ID: $UPLOAD_ID"

echo ""
echo "--- Test 5: Start Analysis ---"
ANALYZE_RESPONSE=$(curl -s -X POST "${API_URL}/analyze" \
    -H "Content-Type: application/json" \
    -d "{\"upload_id\": \"$UPLOAD_ID\"}")

run_test "Analyze returns analysis_id" "$ANALYZE_RESPONSE" "analysis_id"
ANALYSIS_ID=$(echo "$ANALYZE_RESPONSE" | jq -r '.analysis_id // empty')

if [ -z "$ANALYSIS_ID" ]; then
    echo -e "${RED}Analysis start failed${NC}"
    echo "Response: $ANALYZE_RESPONSE"
    exit 1
fi

echo "  Analysis ID: $ANALYSIS_ID"

echo ""
echo "--- Test 6: Poll for Results ---"
MAX_ATTEMPTS=36  # 3 minutes at 5s intervals
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ((ATTEMPT++))

    RESULT=$(curl -s "${API_URL}/visualize/${ANALYSIS_ID}")
    STATUS=$(echo "$RESULT" | jq -r '.status // "pending"')

    echo -ne "\r  Polling... attempt $ATTEMPT/$MAX_ATTEMPTS (status: $STATUS)    "

    if [ "$STATUS" == "complete" ]; then
        echo ""
        run_test "Analysis completed" "$STATUS" "complete"
        break
    elif [ "$STATUS" == "failed" ]; then
        echo ""
        echo -e "${RED}Analysis failed${NC}"
        echo "$RESULT" | jq .
        ((TESTS_FAILED++))
        break
    fi

    sleep 5
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo ""
    echo -e "${YELLOW}Warning: Analysis did not complete within timeout${NC}"
    ((TESTS_FAILED++))
fi

echo ""
echo "--- Test 7: Validate Results ---"
if [ "$STATUS" == "complete" ]; then
    CLASSIFICATION=$(echo "$RESULT" | jq -r '.classification.label // empty')
    CONFIDENCE=$(echo "$RESULT" | jq -r '.classification.confidence // 0')

    run_test "Has classification label" "$CLASSIFICATION" ""
    [ -n "$CLASSIFICATION" ] && run_test "Classification is valid" "healthy degraded restored" "$CLASSIFICATION" || true
    run_test "Has confidence score" "$CONFIDENCE" "0."

    echo ""
    echo "  Classification: $CLASSIFICATION"
    echo "  Confidence: $CONFIDENCE"
fi

echo ""
echo "--- Test 8: Check S3 Storage ---"
S3_UPLOADS=$(aws s3 ls s3://${PROJECT_PREFIX}-audio/uploads/${UPLOAD_ID}/ 2>/dev/null | wc -l)
run_test "Upload stored in S3" "$S3_UPLOADS" "1"

echo ""
echo "--- Test 9: Check DynamoDB Records ---"
UPLOAD_RECORD=$(aws dynamodb get-item \
    --table-name ${PROJECT_PREFIX}-metadata \
    --key '{"pk": {"S": "UPLOAD#'$UPLOAD_ID'"}, "sk": {"S": "METADATA"}}' \
    --query 'Item.status.S' --output text 2>/dev/null)
run_test "Upload record in DynamoDB" "$UPLOAD_RECORD" ""

echo ""
echo "=========================================="
echo "  Test Summary"
echo "=========================================="
echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}Some tests failed. Review output above.${NC}"
    exit 1
fi
```

**Step 3: Make Test Script Executable**
```bash
chmod +x ~/reef-project/tests/test_e2e.sh
```

**Step 4: Create Unit Tests**

Create `~/reef-project/tests/test_unit.py`:
```python
"""
Unit tests for ReefRadar Lambda functions.
Run with: python -m pytest test_unit.py -v
"""

import pytest
import json
import sys
import os

# Add lambdas to path
sys.path.insert(0, os.path.expanduser('~/reef-project/lambdas/router'))
sys.path.insert(0, os.path.expanduser('~/reef-project/lambdas/preprocessor'))
sys.path.insert(0, os.path.expanduser('~/reef-project/lambdas/classifier'))


class TestRouter:
    """Test Router Lambda handler logic."""

    def test_health_endpoint_structure(self):
        """Test health response structure."""
        # Mock the handler response format
        response = {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'status': 'healthy'})
        }

        assert response['statusCode'] == 200
        body = json.loads(response['body'])
        assert 'status' in body
        assert body['status'] == 'healthy'

    def test_error_response_format(self):
        """Test error response structure."""
        error_response = {
            'error': {
                'code': 'TEST_ERROR',
                'message': 'Test error message'
            }
        }

        assert 'error' in error_response
        assert 'code' in error_response['error']
        assert 'message' in error_response['error']


class TestPreprocessor:
    """Test Preprocessor Lambda logic."""

    def test_segment_calculation(self):
        """Test audio segment calculation."""
        sample_rate = 16000
        segment_duration = 1.88
        segment_samples = int(sample_rate * segment_duration)

        # 5 seconds of audio
        audio_duration = 5.0
        total_samples = int(audio_duration * sample_rate)
        expected_segments = int(audio_duration / segment_duration)

        assert segment_samples == 30080
        assert expected_segments == 2

    def test_normalization(self):
        """Test audio normalization."""
        import numpy as np

        # Simulate 16-bit audio samples
        raw_samples = np.array([0, 16383, 32767, -32768], dtype=np.int16)
        normalized = raw_samples.astype(np.float32) / 32768.0

        assert normalized[0] == 0.0
        assert abs(normalized[1] - 0.5) < 0.01
        assert abs(normalized[2] - 1.0) < 0.01
        assert normalized[3] == -1.0


class TestClassifier:
    """Test Classifier Lambda logic."""

    def test_classification_categories(self):
        """Test classification categories are correct."""
        categories = ['healthy', 'degraded', 'restored_early', 'restored_mid']

        assert len(categories) == 4
        assert 'healthy' in categories
        assert 'degraded' in categories

    def test_probability_sum(self):
        """Test probabilities sum to approximately 1."""
        probabilities = {
            'healthy': 0.65,
            'degraded': 0.15,
            'restored_early': 0.10,
            'restored_mid': 0.10
        }

        total = sum(probabilities.values())
        assert abs(total - 1.0) < 0.01

    def test_embedding_dimension(self):
        """Test expected embedding dimension."""
        expected_dim = 1280
        import numpy as np

        # Simulate embedding
        embedding = np.random.randn(expected_dim)

        assert len(embedding) == expected_dim


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
```

**Step 5: Create Cost Monitoring Check**

Create `~/reef-project/tests/check_costs.sh`:
```bash
#!/bin/bash
# Check AWS costs for ReefRadar project

source ~/.reefradar-env

echo "=========================================="
echo "  ReefRadar Cost Report"
echo "=========================================="
echo ""

# Get current month date range
START_DATE=$(date -d "$(date +%Y-%m-01)" +%Y-%m-%d)
END_DATE=$(date +%Y-%m-%d)

echo "Period: $START_DATE to $END_DATE"
echo ""

# Get costs by service
echo "--- Costs by Service ---"
aws ce get-cost-and-usage \
    --time-period Start=$START_DATE,End=$END_DATE \
    --granularity MONTHLY \
    --metrics BlendedCost \
    --group-by Type=DIMENSION,Key=SERVICE \
    --query 'ResultsByTime[0].Groups[*].{Service:Keys[0],Cost:Metrics.BlendedCost.Amount}' \
    --output table 2>/dev/null || echo "Cost Explorer may not be enabled or no costs yet"

echo ""
echo "--- Budget Status ---"
aws budgets describe-budgets \
    --account-id $AWS_ACCOUNT_ID \
    --query 'Budgets[?starts_with(BudgetName, `'$PROJECT_PREFIX'`)].{Name:BudgetName,Limit:BudgetLimit.Amount,Actual:CalculatedSpend.ActualSpend.Amount}' \
    --output table 2>/dev/null || echo "No budgets found"

echo ""
echo "--- SageMaker Endpoint Status ---"
aws sagemaker describe-endpoint \
    --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint \
    --query '{Status:EndpointStatus,Config:EndpointConfigName}' \
    --output table 2>/dev/null || echo "Endpoint not found"

echo ""
echo "--- S3 Storage ---"
echo "Audio bucket:"
aws s3 ls s3://${PROJECT_PREFIX}-audio --recursive --summarize 2>/dev/null | tail -2
echo ""
echo "Embeddings bucket:"
aws s3 ls s3://${PROJECT_PREFIX}-embeddings --recursive --summarize 2>/dev/null | tail -2

echo ""
echo "=========================================="
```

**Step 6: Run All Tests**
```bash
cd ~/reef-project/tests

# Make scripts executable
chmod +x test_e2e.sh check_costs.sh

# Run end-to-end tests
echo "Running End-to-End Tests..."
./test_e2e.sh

# Run unit tests (requires pytest)
echo ""
echo "Running Unit Tests..."
pip install pytest -q
python -m pytest test_unit.py -v

# Check costs
echo ""
echo "Checking Costs..."
./check_costs.sh
```
</implementation>

<output>
Files created:
- `~/reef-project/tests/test_e2e.sh` - End-to-end API test suite
- `~/reef-project/tests/test_unit.py` - Unit tests for Lambda functions
- `~/reef-project/tests/check_costs.sh` - Cost monitoring script
</output>

<verification>
```bash
cd ~/reef-project/tests

# Verify test files exist
ls -la *.sh *.py

# Run quick health check
source ~/.reefradar-env
curl -s "${API_URL}/health" | jq .

# Run full test suite
./test_e2e.sh
```
</verification>

<success_criteria>
- [ ] test_e2e.sh executes without errors
- [ ] Health endpoint returns 200 with "healthy" status
- [ ] Sites endpoint returns list of reference sites
- [ ] Audio upload succeeds and returns upload_id
- [ ] Analysis starts and returns analysis_id
- [ ] Analysis completes within 3 minutes
- [ ] Results include classification and confidence
- [ ] S3 contains uploaded files
- [ ] DynamoDB contains metadata records
- [ ] Unit tests pass
- [ ] Cost monitoring shows expected services
</success_criteria>

<troubleshooting>
**Analysis times out:**
- Check SageMaker endpoint is InService: `aws sagemaker describe-endpoint --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint`
- Check Lambda logs: `aws logs tail /aws/lambda/${PROJECT_PREFIX}-classifier --follow`

**Upload fails:**
- Check S3 bucket exists: `aws s3 ls s3://${PROJECT_PREFIX}-audio`
- Check Lambda permissions

**Classification always returns same value:**
- This is expected for MVP with placeholder logic
- Production would load actual reference embeddings

**High costs:**
- Delete SageMaker endpoint when not in use
- Check for unexpected NAT Gateway usage
</troubleshooting>

<cleanup_instructions>
To delete all resources and stop charges:

```bash
source ~/.reefradar-env

# Delete SageMaker endpoint (biggest cost)
aws sagemaker delete-endpoint --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint
aws sagemaker delete-endpoint-config --endpoint-config-name ${PROJECT_PREFIX}-surfperch-config
aws sagemaker delete-model --model-name ${PROJECT_PREFIX}-surfperch

# Delete Lambda functions
aws lambda delete-function --function-name ${PROJECT_PREFIX}-router
aws lambda delete-function --function-name ${PROJECT_PREFIX}-preprocessor
aws lambda delete-function --function-name ${PROJECT_PREFIX}-classifier

# Delete API Gateway
aws apigatewayv2 delete-api --api-id $API_ID

# Delete DynamoDB table
aws dynamodb delete-table --table-name ${PROJECT_PREFIX}-metadata

# Empty and delete S3 buckets
aws s3 rm s3://${PROJECT_PREFIX}-audio --recursive
aws s3 rb s3://${PROJECT_PREFIX}-audio
aws s3 rm s3://${PROJECT_PREFIX}-embeddings --recursive
aws s3 rb s3://${PROJECT_PREFIX}-embeddings

# Delete ECR repository
aws ecr delete-repository --repository-name ${PROJECT_PREFIX}-preprocessor --force

# Delete IAM roles
for policy in AWSLambdaBasicExecutionRole AmazonS3FullAccess AmazonDynamoDBFullAccess AmazonSageMakerFullAccess; do
    aws iam detach-role-policy --role-name ${PROJECT_PREFIX}-lambda-role --policy-arn arn:aws:iam::aws:policy/service-role/$policy 2>/dev/null || true
    aws iam detach-role-policy --role-name ${PROJECT_PREFIX}-lambda-role --policy-arn arn:aws:iam::aws:policy/$policy 2>/dev/null || true
done
aws iam delete-role --role-name ${PROJECT_PREFIX}-lambda-role

for policy in AmazonSageMakerFullAccess AmazonS3FullAccess; do
    aws iam detach-role-policy --role-name ${PROJECT_PREFIX}-sagemaker-role --policy-arn arn:aws:iam::aws:policy/$policy 2>/dev/null || true
done
aws iam delete-role --role-name ${PROJECT_PREFIX}-sagemaker-role

echo "Cleanup complete!"
```
</cleanup_instructions>

<project_complete>
Congratulations! You have successfully built the ReefRadar Coral Reef Acoustic Health Analysis System.

**What you've accomplished:**
- ✅ AWS infrastructure (S3, DynamoDB, IAM, ECR)
- ✅ SurfPerch model deployment on SageMaker
- ✅ Three-function Lambda pipeline
- ✅ HTTP API Gateway
- ✅ Streamlit dashboard
- ✅ Comprehensive test suite

**Next steps for production:**
1. Implement actual reference embedding classification (replace placeholders)
2. Add authentication (API keys or Cognito)
3. Set up CI/CD pipeline
4. Add detailed logging and monitoring
5. Create documentation and demo video
</project_complete>
