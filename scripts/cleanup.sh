#!/bin/bash
# ReefRadar - Resource Cleanup Script
# WARNING: This will delete ALL ReefRadar AWS resources!
# Usage: ./cleanup.sh [--confirm]

set -e

PROJECT_PREFIX="reefradar-2477"
REGION="us-east-1"
AWS_ACCOUNT_ID="781978598306"

echo "=============================================="
echo "       REEFRADAR CLEANUP SCRIPT"
echo "=============================================="
echo ""
echo "This will DELETE the following resources:"
echo "  - Lambda functions: ${PROJECT_PREFIX}-router, preprocessor, classifier"
echo "  - Lambda layer: ${PROJECT_PREFIX}-numpy"
echo "  - API Gateway: ${PROJECT_PREFIX}-api"
echo "  - SageMaker endpoint: ${PROJECT_PREFIX}-surfperch-endpoint"
echo "  - SageMaker model: ${PROJECT_PREFIX}-surfperch"
echo "  - S3 buckets: ${PROJECT_PREFIX}-audio, ${PROJECT_PREFIX}-embeddings"
echo "  - DynamoDB table: ${PROJECT_PREFIX}-metadata"
echo "  - IAM roles: ${PROJECT_PREFIX}-lambda-role, ${PROJECT_PREFIX}-sagemaker-role"
echo "  - ECR repository: ${PROJECT_PREFIX}-preprocessor"
echo ""

if [ "$1" != "--confirm" ]; then
    echo "To proceed, run: ./cleanup.sh --confirm"
    exit 1
fi

echo "Starting cleanup..."
echo ""

# 1. Delete API Gateway
echo "[1/9] Deleting API Gateway..."
API_ID=$(aws apigatewayv2 get-apis --region $REGION \
    --query "Items[?Name=='${PROJECT_PREFIX}-api'].ApiId" --output text 2>/dev/null || echo "")
if [ -n "$API_ID" ]; then
    aws apigatewayv2 delete-api --api-id $API_ID --region $REGION 2>/dev/null || echo "  Already deleted"
    echo "  Deleted API: $API_ID"
else
    echo "  No API found"
fi

# 2. Delete Lambda functions
echo "[2/9] Deleting Lambda functions..."
for func in router preprocessor classifier; do
    aws lambda delete-function --function-name ${PROJECT_PREFIX}-${func} --region $REGION 2>/dev/null || echo "  ${func} already deleted"
    echo "  Deleted: ${PROJECT_PREFIX}-${func}"
done

# 3. Delete Lambda layer
echo "[3/9] Deleting Lambda layer..."
aws lambda delete-layer-version --layer-name ${PROJECT_PREFIX}-numpy --version-number 1 --region $REGION 2>/dev/null || echo "  Layer already deleted"
echo "  Deleted: ${PROJECT_PREFIX}-numpy"

# 4. Delete SageMaker endpoint
echo "[4/9] Deleting SageMaker endpoint..."
aws sagemaker delete-endpoint --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint --region $REGION 2>/dev/null || echo "  Endpoint already deleted"
echo "  Deleted endpoint (may take a few minutes to fully terminate)"

# 5. Delete SageMaker endpoint config
echo "[5/9] Deleting SageMaker endpoint config..."
aws sagemaker delete-endpoint-config --endpoint-config-name ${PROJECT_PREFIX}-surfperch-config --region $REGION 2>/dev/null || echo "  Config already deleted"
echo "  Deleted endpoint config"

# 6. Delete SageMaker model
echo "[6/9] Deleting SageMaker model..."
aws sagemaker delete-model --model-name ${PROJECT_PREFIX}-surfperch --region $REGION 2>/dev/null || echo "  Model already deleted"
echo "  Deleted model"

# 7. Empty and delete S3 buckets
echo "[7/9] Deleting S3 buckets..."
for bucket in ${PROJECT_PREFIX}-audio ${PROJECT_PREFIX}-embeddings; do
    echo "  Emptying $bucket..."
    aws s3 rm s3://$bucket --recursive 2>/dev/null || echo "    Bucket empty or doesn't exist"
    aws s3 rb s3://$bucket 2>/dev/null || echo "    Bucket already deleted"
    echo "  Deleted: $bucket"
done

# 8. Delete DynamoDB table
echo "[8/9] Deleting DynamoDB table..."
aws dynamodb delete-table --table-name ${PROJECT_PREFIX}-metadata --region $REGION 2>/dev/null || echo "  Table already deleted"
echo "  Deleted: ${PROJECT_PREFIX}-metadata"

# 9. Delete IAM roles
echo "[9/9] Deleting IAM roles..."
for role in ${PROJECT_PREFIX}-lambda-role ${PROJECT_PREFIX}-sagemaker-role; do
    # Detach managed policies
    for policy in $(aws iam list-attached-role-policies --role-name $role --query 'AttachedPolicies[].PolicyArn' --output text 2>/dev/null); do
        aws iam detach-role-policy --role-name $role --policy-arn $policy 2>/dev/null || true
    done
    # Delete inline policies
    for policy in $(aws iam list-role-policies --role-name $role --query 'PolicyNames[]' --output text 2>/dev/null); do
        aws iam delete-role-policy --role-name $role --policy-name $policy 2>/dev/null || true
    done
    # Delete role
    aws iam delete-role --role-name $role 2>/dev/null || echo "  $role already deleted"
    echo "  Deleted: $role"
done

# 10. Delete ECR repository
echo "[10/10] Deleting ECR repository..."
aws ecr delete-repository --repository-name ${PROJECT_PREFIX}-preprocessor --region $REGION --force 2>/dev/null || echo "  Repository already deleted"
echo "  Deleted: ${PROJECT_PREFIX}-preprocessor"

echo ""
echo "=============================================="
echo "         CLEANUP COMPLETE"
echo "=============================================="
echo ""
echo "All ReefRadar AWS resources have been deleted."
echo "Note: Some resources (like SageMaker endpoints) may take a few minutes to fully terminate."
