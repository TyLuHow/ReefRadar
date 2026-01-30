#!/bin/bash
# ReefRadar AWS Environment Variables
# Source this file: source ./config/aws-env.sh

export PROJECT_PREFIX="reefradar-2477"
export AWS_ACCOUNT_ID="781978598306"
export ECR_URI="781978598306.dkr.ecr.us-east-1.amazonaws.com/reefradar-2477-preprocessor"
export LAMBDA_ROLE_ARN="arn:aws:iam::781978598306:role/reefradar-2477-lambda-role"
export SAGEMAKER_ROLE_ARN="arn:aws:iam::781978598306:role/reefradar-2477-sagemaker-role"
