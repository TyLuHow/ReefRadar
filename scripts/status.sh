#!/bin/bash
# ReefRadar - System Status Check
# Usage: ./status.sh

PROJECT_PREFIX="reefradar-2477"
REGION="us-east-1"
API_URL="https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod"

echo "=============================================="
echo "       REEFRADAR SYSTEM STATUS"
echo "=============================================="
echo ""

# API Health
echo "API HEALTH"
echo "----------"
HEALTH=$(curl -s -m 5 "${API_URL}/health" 2>/dev/null)
if echo "$HEALTH" | grep -q "healthy"; then
    echo "  Status: HEALTHY"
    echo "  Endpoint: $API_URL"
else
    echo "  Status: UNHEALTHY or UNREACHABLE"
fi
echo ""

# Lambda Functions
echo "LAMBDA FUNCTIONS"
echo "----------------"
for func in router preprocessor classifier; do
    STATUS=$(aws lambda get-function --function-name ${PROJECT_PREFIX}-${func} --region $REGION \
        --query 'Configuration.State' --output text 2>/dev/null || echo "NOT FOUND")
    MEMORY=$(aws lambda get-function --function-name ${PROJECT_PREFIX}-${func} --region $REGION \
        --query 'Configuration.MemorySize' --output text 2>/dev/null || echo "-")
    echo "  ${PROJECT_PREFIX}-${func}: $STATUS (${MEMORY} MB)"
done
echo ""

# SageMaker Endpoint
echo "SAGEMAKER ENDPOINT"
echo "------------------"
SM_STATUS=$(aws sagemaker describe-endpoint --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint --region $REGION \
    --query 'EndpointStatus' --output text 2>/dev/null || echo "NOT FOUND")
echo "  ${PROJECT_PREFIX}-surfperch-endpoint: $SM_STATUS"
if [ "$SM_STATUS" = "InService" ]; then
    echo "  WARNING: Endpoint running (~\$0.115/hr = \$2.76/day)"
fi
echo ""

# S3 Buckets
echo "S3 BUCKETS"
echo "----------"
for bucket in ${PROJECT_PREFIX}-audio ${PROJECT_PREFIX}-embeddings; do
    EXISTS=$(aws s3 ls s3://$bucket 2>/dev/null && echo "EXISTS" || echo "NOT FOUND")
    if [ "$EXISTS" = "EXISTS" ]; then
        COUNT=$(aws s3 ls s3://$bucket --recursive --summarize 2>/dev/null | grep "Total Objects" | awk '{print $3}')
        SIZE=$(aws s3 ls s3://$bucket --recursive --summarize 2>/dev/null | grep "Total Size" | awk '{print $3}')
        echo "  $bucket: $COUNT objects, $SIZE bytes"
    else
        echo "  $bucket: NOT FOUND"
    fi
done
echo ""

# DynamoDB
echo "DYNAMODB TABLE"
echo "--------------"
DB_STATUS=$(aws dynamodb describe-table --table-name ${PROJECT_PREFIX}-metadata --region $REGION \
    --query 'Table.TableStatus' --output text 2>/dev/null || echo "NOT FOUND")
ITEM_COUNT=$(aws dynamodb scan --table-name ${PROJECT_PREFIX}-metadata --region $REGION \
    --select COUNT --query 'Count' --output text 2>/dev/null || echo "-")
echo "  ${PROJECT_PREFIX}-metadata: $DB_STATUS ($ITEM_COUNT items)"
echo ""

# API Gateway
echo "API GATEWAY"
echo "-----------"
API_ID=$(aws apigatewayv2 get-apis --region $REGION \
    --query "Items[?Name=='${PROJECT_PREFIX}-api'].ApiId" --output text 2>/dev/null || echo "NOT FOUND")
if [ -n "$API_ID" ] && [ "$API_ID" != "None" ]; then
    echo "  API ID: $API_ID"
    echo "  Endpoint: https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod"
else
    echo "  Status: NOT FOUND"
fi
echo ""

# CloudWatch Logs (recent errors)
echo "RECENT ERRORS (last hour)"
echo "-------------------------"
for func in router preprocessor classifier; do
    LOG_GROUP="/aws/lambda/${PROJECT_PREFIX}-${func}"
    ERRORS=$(aws logs filter-log-events \
        --log-group-name "$LOG_GROUP" \
        --start-time $(($(date +%s) - 3600))000 \
        --filter-pattern "ERROR" \
        --region $REGION \
        --query 'events | length(@)' \
        --output text 2>/dev/null || echo "0")
    echo "  ${func}: $ERRORS errors"
done
echo ""

# Cost estimate
echo "COST ESTIMATE"
echo "-------------"
echo "  Lambda: Free tier (likely \$0)"
echo "  S3: ~\$0.01/month"
echo "  DynamoDB: Free tier (likely \$0)"
echo "  API Gateway: Free tier (likely \$0)"
if [ "$SM_STATUS" = "InService" ]; then
    echo "  SageMaker: ~\$83/month (ml.m5.large running)"
    echo "  TOTAL: ~\$83/month"
    echo ""
    echo "  TIP: Delete SageMaker endpoint to save costs:"
    echo "  aws sagemaker delete-endpoint --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint --region $REGION"
else
    echo "  SageMaker: \$0 (not running)"
    echo "  TOTAL: ~\$0.01/month"
fi
echo ""
echo "=============================================="
