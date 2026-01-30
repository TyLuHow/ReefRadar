<objective>
Set up the foundational AWS infrastructure for the ReefRadar coral reef acoustic health analysis system.

This is Phase 1 of 8 in building a serverless API that analyzes underwater coral reef audio recordings to classify reef health using the SurfPerch ML model. The AWS resources created here will be used by all subsequent phases.

CRITICAL: Budget alerts must be configured BEFORE deploying any billable resources. This project targets $15-90/month on student credits.
</objective>

<context>
Project: ReefRadar - Coral Reef Acoustic Health Analysis API
Target User: Graduate student with Python experience, new to AWS
Budget: ~$100-200 in AWS student credits over 6 months
Region: us-east-1 (recommended for best service availability)

This phase creates:
- S3 buckets for audio storage and embeddings cache
- DynamoDB table for metadata
- ECR repository for Lambda container images
- IAM roles for Lambda and SageMaker
- Budget alerts for cost monitoring
</context>

<prerequisites>
Before starting, verify:
1. AWS account is active with student credits applied
2. AWS CLI v2 is installed (run `aws --version` to check)
3. You have Access Key ID and Secret Access Key ready

If AWS CLI is not installed:
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```
</prerequisites>

<implementation>
Execute these steps in order. Each command block should be run sequentially.

**Step 1: Configure AWS CLI**
```bash
aws configure
# Enter: Access Key ID, Secret Access Key, us-east-1, json
```

Verify configuration:
```bash
aws sts get-caller-identity
```

**Step 2: Set Project Variables**
Create a consistent naming prefix used throughout the project:
```bash
export PROJECT_PREFIX="reefradar-$(date +%s | tail -c 5)"
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "PROJECT_PREFIX: $PROJECT_PREFIX"
echo "AWS_ACCOUNT_ID: $AWS_ACCOUNT_ID"
```

Save these to a file for later sessions:
```bash
echo "export PROJECT_PREFIX=$PROJECT_PREFIX" > ~/.reefradar-env
echo "export AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID" >> ~/.reefradar-env
```

**Step 3: Create S3 Buckets**
```bash
# Audio storage bucket
aws s3 mb s3://${PROJECT_PREFIX}-audio --region us-east-1

# Embeddings cache bucket
aws s3 mb s3://${PROJECT_PREFIX}-embeddings --region us-east-1

# Enable versioning on audio bucket
aws s3api put-bucket-versioning \
  --bucket ${PROJECT_PREFIX}-audio \
  --versioning-configuration Status=Enabled
```

Set lifecycle policy for cost optimization:
```bash
cat > /tmp/lifecycle.json << 'EOF'
{
  "Rules": [
    {
      "ID": "TransitionToIntelligentTiering",
      "Status": "Enabled",
      "Filter": {"Prefix": ""},
      "Transitions": [
        {"Days": 30, "StorageClass": "INTELLIGENT_TIERING"}
      ]
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket ${PROJECT_PREFIX}-audio \
  --lifecycle-configuration file:///tmp/lifecycle.json
```

**Step 4: Create DynamoDB Table**
```bash
aws dynamodb create-table \
  --table-name ${PROJECT_PREFIX}-metadata \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Wait for table to be active
aws dynamodb wait table-exists --table-name ${PROJECT_PREFIX}-metadata
```

**Step 5: Create ECR Repository**
```bash
aws ecr create-repository \
  --repository-name ${PROJECT_PREFIX}-preprocessor \
  --region us-east-1

# Save the repository URI
export ECR_URI=$(aws ecr describe-repositories \
  --repository-names ${PROJECT_PREFIX}-preprocessor \
  --query 'repositories[0].repositoryUri' \
  --output text)
echo "ECR_URI: $ECR_URI"
echo "export ECR_URI=$ECR_URI" >> ~/.reefradar-env
```

**Step 6: Create IAM Roles**

Lambda execution role:
```bash
cat > /tmp/lambda-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name ${PROJECT_PREFIX}-lambda-role \
  --assume-role-policy-document file:///tmp/lambda-trust.json

# Attach required policies
aws iam attach-role-policy \
  --role-name ${PROJECT_PREFIX}-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam attach-role-policy \
  --role-name ${PROJECT_PREFIX}-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

aws iam attach-role-policy \
  --role-name ${PROJECT_PREFIX}-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess

aws iam attach-role-policy \
  --role-name ${PROJECT_PREFIX}-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSageMakerFullAccess
```

SageMaker execution role:
```bash
cat > /tmp/sagemaker-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"Service": "sagemaker.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name ${PROJECT_PREFIX}-sagemaker-role \
  --assume-role-policy-document file:///tmp/sagemaker-trust.json

aws iam attach-role-policy \
  --role-name ${PROJECT_PREFIX}-sagemaker-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSageMakerFullAccess

aws iam attach-role-policy \
  --role-name ${PROJECT_PREFIX}-sagemaker-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
```

Save role ARNs:
```bash
export LAMBDA_ROLE_ARN=$(aws iam get-role --role-name ${PROJECT_PREFIX}-lambda-role --query 'Role.Arn' --output text)
export SAGEMAKER_ROLE_ARN=$(aws iam get-role --role-name ${PROJECT_PREFIX}-sagemaker-role --query 'Role.Arn' --output text)
echo "export LAMBDA_ROLE_ARN=$LAMBDA_ROLE_ARN" >> ~/.reefradar-env
echo "export SAGEMAKER_ROLE_ARN=$SAGEMAKER_ROLE_ARN" >> ~/.reefradar-env
```

**Step 7: Set Up Budget Alerts (CRITICAL)**
```bash
cat > /tmp/budget.json << EOF
{
  "BudgetName": "${PROJECT_PREFIX}-budget",
  "BudgetLimit": {"Amount": "50", "Unit": "USD"},
  "BudgetType": "COST",
  "TimeUnit": "MONTHLY",
  "CostFilters": {}
}
EOF

aws budgets create-budget \
  --account-id $AWS_ACCOUNT_ID \
  --budget file:///tmp/budget.json
```
</implementation>

<output>
Save environment variables to a project config file:

Create `./config/aws-env.sh`:
```bash
#!/bin/bash
# ReefRadar AWS Environment Variables
# Source this file: source ./config/aws-env.sh

export PROJECT_PREFIX="[value from setup]"
export AWS_ACCOUNT_ID="[value from setup]"
export ECR_URI="[value from setup]"
export LAMBDA_ROLE_ARN="[value from setup]"
export SAGEMAKER_ROLE_ARN="[value from setup]"
```
</output>

<verification>
Run these commands to verify all resources were created:

```bash
# Check S3 buckets
aws s3 ls | grep $PROJECT_PREFIX

# Check DynamoDB table
aws dynamodb describe-table --table-name ${PROJECT_PREFIX}-metadata --query 'Table.TableStatus'

# Check ECR repository
aws ecr describe-repositories --repository-names ${PROJECT_PREFIX}-preprocessor --query 'repositories[0].repositoryUri'

# Check IAM roles
aws iam get-role --role-name ${PROJECT_PREFIX}-lambda-role --query 'Role.Arn'
aws iam get-role --role-name ${PROJECT_PREFIX}-sagemaker-role --query 'Role.Arn'

# Check budget
aws budgets describe-budgets --account-id $AWS_ACCOUNT_ID --query 'Budgets[?BudgetName==`'${PROJECT_PREFIX}'-budget`].BudgetName'
```

All commands should return valid values without errors.
</verification>

<success_criteria>
- [ ] AWS CLI configured and `aws sts get-caller-identity` returns account info
- [ ] Two S3 buckets created: ${PROJECT_PREFIX}-audio and ${PROJECT_PREFIX}-embeddings
- [ ] DynamoDB table ${PROJECT_PREFIX}-metadata is ACTIVE
- [ ] ECR repository ${PROJECT_PREFIX}-preprocessor exists
- [ ] Lambda IAM role created with S3, DynamoDB, SageMaker permissions
- [ ] SageMaker IAM role created with S3, SageMaker permissions
- [ ] Budget alert configured at $50/month
- [ ] Environment variables saved to ./config/aws-env.sh
</success_criteria>

<next_phase>
After completing this phase, proceed to Phase 2: Download and Prepare Data (prompts/002-download-prepare-data.md)
</next_phase>
