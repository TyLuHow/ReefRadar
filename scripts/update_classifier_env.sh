#!/bin/bash
# Update classifier Lambda to use inference Lambda instead of SageMaker

set -e

REGION="us-east-1"
FUNCTION_NAME="reefradar-2477-classifier"

echo "Updating classifier Lambda environment variables..."

aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --environment 'Variables={AUDIO_BUCKET=reefradar-2477-audio,EMBEDDINGS_BUCKET=reefradar-2477-embeddings,METADATA_TABLE=reefradar-2477-metadata,INFERENCE_FUNCTION=reefradar-2477-inference}' \
    --region "$REGION"

echo "Waiting for update to complete..."
aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"

echo "Classifier Lambda updated successfully!"
echo ""
echo "Now redeploy the classifier code:"
echo "  cd lambdas/classifier && zip -r function.zip handler.py"
echo "  aws lambda update-function-code --function-name $FUNCTION_NAME --zip-file fileb://function.zip --region $REGION"
