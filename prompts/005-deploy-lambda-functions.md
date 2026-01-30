<objective>
Deploy all three Lambda functions to AWS:
1. Router Lambda - Standard Python deployment package
2. Preprocessor Lambda - Container image (requires Docker)
3. Classifier Lambda - Standard Python deployment package

After deployment, each function will be configured with the correct environment variables to communicate with S3, DynamoDB, and SageMaker.
</objective>

<context>
Project: ReefRadar - Coral Reef Acoustic Health Analysis API
Phase: 5 of 8

Lambda Configurations:
| Function | Type | Memory | Timeout | Trigger |
|----------|------|--------|---------|---------|
| Router | ZIP | 256 MB | 30s | API Gateway |
| Preprocessor | Container | 1024 MB | 300s | Router (async) |
| Classifier | ZIP | 512 MB | 300s | Preprocessor (async) |

Note: IAM role propagation can take up to 10 seconds after creation. If you get permission errors, wait and retry.
</context>

<prerequisites>
Before starting:
1. Source AWS environment: `source ~/.reefradar-env`
2. Phase 3 completed (Lambda code written)
3. Phase 4 completed (SageMaker endpoint deployed)
4. Docker installed and running (for preprocessor container)
5. All environment variables set: PROJECT_PREFIX, LAMBDA_ROLE_ARN, ECR_URI, SAGEMAKER_ENDPOINT
</prerequisites>

<implementation>

**Step 1: Deploy Router Lambda**
```bash
source ~/.reefradar-env
cd ~/reef-project/lambdas/router

# Create deployment package
rm -rf package router.zip
pip install -r requirements.txt -t package/ --quiet
cp handler.py package/
cd package
zip -r ../router.zip . -q
cd ..

# Create Lambda function
aws lambda create-function \
  --function-name ${PROJECT_PREFIX}-router \
  --runtime python3.11 \
  --handler handler.handler \
  --role $LAMBDA_ROLE_ARN \
  --zip-file fileb://router.zip \
  --timeout 30 \
  --memory-size 256 \
  --environment "Variables={
    AUDIO_BUCKET=${PROJECT_PREFIX}-audio,
    METADATA_TABLE=${PROJECT_PREFIX}-metadata,
    PREPROCESSOR_FUNCTION=${PROJECT_PREFIX}-preprocessor
  }" \
  --region us-east-1

echo "Router Lambda deployed: ${PROJECT_PREFIX}-router"
```

**Step 2: Build and Push Preprocessor Container**
```bash
source ~/.reefradar-env
cd ~/reef-project/lambdas/preprocessor

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_URI

# Build container image
docker build -t ${PROJECT_PREFIX}-preprocessor .

# Tag for ECR
docker tag ${PROJECT_PREFIX}-preprocessor:latest ${ECR_URI}:latest

# Push to ECR
docker push ${ECR_URI}:latest

echo "Container pushed to: ${ECR_URI}:latest"
```

**Step 3: Deploy Preprocessor Lambda**
```bash
source ~/.reefradar-env

# Create Lambda from container
aws lambda create-function \
  --function-name ${PROJECT_PREFIX}-preprocessor \
  --package-type Image \
  --code ImageUri=${ECR_URI}:latest \
  --role $LAMBDA_ROLE_ARN \
  --timeout 300 \
  --memory-size 1024 \
  --environment "Variables={
    AUDIO_BUCKET=${PROJECT_PREFIX}-audio,
    EMBEDDINGS_BUCKET=${PROJECT_PREFIX}-embeddings,
    METADATA_TABLE=${PROJECT_PREFIX}-metadata,
    CLASSIFIER_FUNCTION=${PROJECT_PREFIX}-classifier
  }" \
  --region us-east-1

echo "Preprocessor Lambda deployed: ${PROJECT_PREFIX}-preprocessor"
```

**Step 4: Deploy Classifier Lambda**
```bash
source ~/.reefradar-env
cd ~/reef-project/lambdas/classifier

# Create deployment package
rm -rf package classifier.zip
pip install -r requirements.txt -t package/ --quiet
cp handler.py package/
cd package
zip -r ../classifier.zip . -q
cd ..

# Create Lambda function
aws lambda create-function \
  --function-name ${PROJECT_PREFIX}-classifier \
  --runtime python3.11 \
  --handler handler.handler \
  --role $LAMBDA_ROLE_ARN \
  --zip-file fileb://classifier.zip \
  --timeout 300 \
  --memory-size 512 \
  --environment "Variables={
    AUDIO_BUCKET=${PROJECT_PREFIX}-audio,
    EMBEDDINGS_BUCKET=${PROJECT_PREFIX}-embeddings,
    METADATA_TABLE=${PROJECT_PREFIX}-metadata,
    SAGEMAKER_ENDPOINT=${PROJECT_PREFIX}-surfperch-endpoint
  }" \
  --region us-east-1

echo "Classifier Lambda deployed: ${PROJECT_PREFIX}-classifier"
```

**Step 5: Grant Invoke Permissions**
```bash
source ~/.reefradar-env

# Allow Router to invoke Preprocessor
aws lambda add-permission \
  --function-name ${PROJECT_PREFIX}-preprocessor \
  --statement-id router-invoke \
  --action lambda:InvokeFunction \
  --principal lambda.amazonaws.com \
  --source-arn $(aws lambda get-function --function-name ${PROJECT_PREFIX}-router --query 'Configuration.FunctionArn' --output text) \
  --region us-east-1 2>/dev/null || echo "Permission may already exist"

# Allow Preprocessor to invoke Classifier
aws lambda add-permission \
  --function-name ${PROJECT_PREFIX}-classifier \
  --statement-id preprocessor-invoke \
  --action lambda:InvokeFunction \
  --principal lambda.amazonaws.com \
  --source-arn $(aws lambda get-function --function-name ${PROJECT_PREFIX}-preprocessor --query 'Configuration.FunctionArn' --output text) \
  --region us-east-1 2>/dev/null || echo "Permission may already exist"

echo "Lambda invoke permissions configured"
```

**Step 6: Test Lambda Functions**
```bash
source ~/.reefradar-env

echo "Testing Router Lambda..."
aws lambda invoke \
  --function-name ${PROJECT_PREFIX}-router \
  --payload '{"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}' \
  /tmp/router_test.json \
  --region us-east-1

cat /tmp/router_test.json
echo ""

echo "Testing Classifier Lambda (will fail without SageMaker, that's OK)..."
aws lambda invoke \
  --function-name ${PROJECT_PREFIX}-classifier \
  --payload '{"upload_id": "test", "analysis_id": "test", "segments_key": "test", "num_segments": 1}' \
  /tmp/classifier_test.json \
  --region us-east-1 2>&1 | head -5

echo ""
echo "Lambda functions deployed and responding!"
```
</implementation>

<output>
AWS Resources created:
- Lambda Function: `${PROJECT_PREFIX}-router` (256 MB, 30s timeout)
- Lambda Function: `${PROJECT_PREFIX}-preprocessor` (1024 MB container, 300s timeout)
- Lambda Function: `${PROJECT_PREFIX}-classifier` (512 MB, 300s timeout)
- ECR Image: `${ECR_URI}:latest`
</output>

<verification>
```bash
source ~/.reefradar-env

# List all project Lambda functions
aws lambda list-functions \
  --query "Functions[?starts_with(FunctionName, '${PROJECT_PREFIX}')].{Name:FunctionName,Runtime:Runtime,Memory:MemorySize,Timeout:Timeout}" \
  --output table

# Check each function's configuration
for fn in router preprocessor classifier; do
  echo "=== ${PROJECT_PREFIX}-${fn} ==="
  aws lambda get-function \
    --function-name ${PROJECT_PREFIX}-${fn} \
    --query 'Configuration.{State:State,Memory:MemorySize,Timeout:Timeout}' \
    --output table
done

# Verify environment variables are set
echo "=== Router Environment ==="
aws lambda get-function-configuration \
  --function-name ${PROJECT_PREFIX}-router \
  --query 'Environment.Variables' \
  --output json
```
</verification>

<success_criteria>
- [ ] Router Lambda deployed with State=Active
- [ ] Preprocessor container built and pushed to ECR
- [ ] Preprocessor Lambda deployed from container with State=Active
- [ ] Classifier Lambda deployed with State=Active
- [ ] All functions have correct environment variables
- [ ] Router can invoke Preprocessor (permission granted)
- [ ] Preprocessor can invoke Classifier (permission granted)
- [ ] Router /health endpoint returns 200 status
</success_criteria>

<troubleshooting>
**"Role cannot be assumed" error:**
Wait 10-30 seconds for IAM role propagation, then retry.

**Container build fails:**
- Ensure Docker daemon is running: `sudo systemctl start docker`
- Check Dockerfile syntax

**"Function not found" when adding permissions:**
Wait for function creation to complete, then retry.

**Memory/Timeout errors in tests:**
Increase values in aws lambda update-function-configuration
</troubleshooting>

<update_functions>
To update a function after code changes:

Router/Classifier (ZIP):
```bash
cd ~/reef-project/lambdas/router  # or classifier
rm -rf package *.zip
pip install -r requirements.txt -t package/ --quiet
cp handler.py package/
cd package && zip -r ../function.zip . -q && cd ..
aws lambda update-function-code \
  --function-name ${PROJECT_PREFIX}-router \
  --zip-file fileb://function.zip
```

Preprocessor (Container):
```bash
cd ~/reef-project/lambdas/preprocessor
docker build -t ${PROJECT_PREFIX}-preprocessor .
docker tag ${PROJECT_PREFIX}-preprocessor:latest ${ECR_URI}:latest
docker push ${ECR_URI}:latest
aws lambda update-function-code \
  --function-name ${PROJECT_PREFIX}-preprocessor \
  --image-uri ${ECR_URI}:latest
```
</update_functions>

<next_phase>
After completing this phase, proceed to Phase 6: Create API Gateway (prompts/006-create-api-gateway.md)
</next_phase>
