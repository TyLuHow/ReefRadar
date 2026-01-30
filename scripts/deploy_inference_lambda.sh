#!/bin/bash
# Deploy SurfPerch inference Lambda container to AWS
# This script builds and deploys the ML inference container

set -e

# Configuration
REGION="us-east-1"
ACCOUNT_ID="781978598306"
REPO_NAME="reefradar-2477-inference"
FUNCTION_NAME="reefradar-2477-inference"
IMAGE_TAG="latest"

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONTAINER_DIR="$PROJECT_ROOT/infrastructure/lambda_container"

echo "========================================="
echo "Deploying SurfPerch Inference Lambda"
echo "========================================="
echo "Region: $REGION"
echo "Account: $ACCOUNT_ID"
echo "Repository: $REPO_NAME"
echo "Function: $FUNCTION_NAME"
echo ""

# Step 1: Create ECR repository if it doesn't exist
echo "Step 1: Ensuring ECR repository exists..."
aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" 2>/dev/null || \
    aws ecr create-repository --repository-name "$REPO_NAME" --region "$REGION"

# Step 2: Login to ECR
echo "Step 2: Logging into ECR..."
aws ecr get-login-password --region "$REGION" | \
    docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# Step 3: Build the container image
# Note: --provenance=false prevents BuildKit attestation manifests that Lambda doesn't support
echo "Step 3: Building container image..."
cd "$CONTAINER_DIR"
docker build --platform linux/amd64 --provenance=false -t "$REPO_NAME:$IMAGE_TAG" .

# Step 4: Tag and push to ECR
echo "Step 4: Pushing image to ECR..."
docker tag "$REPO_NAME:$IMAGE_TAG" "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG"
docker push "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG"

# Step 5: Create or update Lambda function
echo "Step 5: Creating/updating Lambda function..."

# Check if function exists
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null; then
    echo "Updating existing function..."
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --image-uri "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG" \
        --region "$REGION"
else
    echo "Creating new function..."
    aws lambda create-function \
        --function-name "$FUNCTION_NAME" \
        --package-type Image \
        --code "ImageUri=$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG" \
        --role "arn:aws:iam::$ACCOUNT_ID:role/reefradar-2477-lambda-role" \
        --timeout 300 \
        --memory-size 3008 \
        --environment "Variables={KAGGLE_CONFIG_DIR=/tmp}" \
        --region "$REGION"
fi

# Step 6: Wait for function to be ready
echo "Step 6: Waiting for function to be ready..."
aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null || \
    aws lambda wait function-active --function-name "$FUNCTION_NAME" --region "$REGION"

# Step 7: Configure provisioned concurrency (optional, reduces cold starts)
# Uncomment if cold starts are problematic
# echo "Step 7: Configuring provisioned concurrency..."
# aws lambda put-provisioned-concurrency-config \
#     --function-name "$FUNCTION_NAME" \
#     --qualifier '$LATEST' \
#     --provisioned-concurrent-executions 1 \
#     --region "$REGION"

echo ""
echo "========================================="
echo "Deployment complete!"
echo "========================================="
echo "Function ARN: arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FUNCTION_NAME"
echo ""
echo "Test with:"
echo "aws lambda invoke --function-name $FUNCTION_NAME \\"
echo "  --payload '{\"segments\": [[0.1, 0.2, 0.3]]}' \\"
echo "  --cli-binary-format raw-in-base64-out \\"
echo "  response.json && cat response.json"
