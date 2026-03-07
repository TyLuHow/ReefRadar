#!/bin/bash
# Deploy updated preprocessor Lambda with correct SurfPerch parameters

set -e

REGION="us-east-1"
FUNCTION_NAME="reefradar-2477-preprocessor"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "========================================="
echo "Deploying Preprocessor Lambda"
echo "========================================="
echo ""
echo "Updated parameters:"
echo "  Sample rate: 16kHz (was 32kHz)"
echo "  Segment duration: 1.88s (was 5s)"
echo "  Samples per segment: 30,080 (was 160,000)"
echo ""

cd "$PROJECT_ROOT/lambdas/preprocessor"

# Create deployment package
echo "Creating deployment package..."
zip -r function.zip handler.py

# Deploy
echo "Deploying to Lambda..."
aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file fileb://function.zip \
    --region "$REGION"

# Wait for update
echo "Waiting for deployment to complete..."
aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"

# Cleanup
rm function.zip

echo ""
echo "========================================="
echo "Preprocessor deployed successfully!"
echo "========================================="
echo ""
echo "Test with:"
echo "  curl -X POST https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/upload \\"
echo "    -H 'Content-Type: audio/wav' \\"
echo "    --data-binary @test.wav"
