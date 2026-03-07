#!/bin/bash
# Delete SageMaker endpoint to save ~$83/month
# Run this AFTER deploying the inference Lambda and verifying it works

set -e

REGION="us-east-1"
ENDPOINT_NAME="reefradar-2477-surfperch-endpoint"
ENDPOINT_CONFIG="reefradar-2477-surfperch-config"
MODEL_NAME="reefradar-2477-surfperch"

echo "========================================="
echo "Deleting SageMaker Resources"
echo "========================================="
echo ""
echo "WARNING: This will delete the SageMaker endpoint."
echo "Make sure the inference Lambda is deployed and working first!"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Delete endpoint
echo "Deleting endpoint: $ENDPOINT_NAME..."
aws sagemaker delete-endpoint \
    --endpoint-name "$ENDPOINT_NAME" \
    --region "$REGION" 2>/dev/null || echo "Endpoint not found or already deleted"

# Delete endpoint config
echo "Deleting endpoint config: $ENDPOINT_CONFIG..."
aws sagemaker delete-endpoint-config \
    --endpoint-config-name "$ENDPOINT_CONFIG" \
    --region "$REGION" 2>/dev/null || echo "Endpoint config not found or already deleted"

# Optionally delete model (keep for reference)
# echo "Deleting model: $MODEL_NAME..."
# aws sagemaker delete-model \
#     --model-name "$MODEL_NAME" \
#     --region "$REGION" 2>/dev/null || echo "Model not found or already deleted"

echo ""
echo "========================================="
echo "SageMaker endpoint deleted!"
echo "========================================="
echo "Estimated monthly savings: ~\$83"
echo ""
echo "Note: The model artifact remains in S3 for reference:"
echo "  s3://reefradar-2477-embeddings/models/surfperch/model.tar.gz"
