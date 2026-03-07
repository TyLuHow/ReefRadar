#!/bin/bash
#
# Launch MARRS Cloud-to-Cloud Transfer on EC2 Spot Instance
#
# This script launches a t3.medium spot instance that:
# 1. Downloads MARRS coral reef audio from UCL Figshare
# 2. Applies smart sampling (200 files per site)
# 3. Uploads directly to S3
# 4. Auto-terminates when complete
#
# Usage:
#   ./launch_transfer.sh [--dry-run] [--all-sites] [--samples N]
#
# Cost estimate: ~$1-3 total (EC2 + S3 storage)
#

set -e

# Configuration
AWS_REGION="us-east-1"
INSTANCE_TYPE="t3.medium"
SPOT_MAX_PRICE="0.05"  # Cap at $0.05/hr (on-demand is ~$0.04)
KEY_NAME=""  # Set if you need SSH access, otherwise leave empty
SECURITY_GROUP=""  # Set if you need specific rules
S3_BUCKET="reefradar-2477-marrs-raw"

# Parse arguments
DRY_RUN=""
ALL_SITES=""
SAMPLES_PER_SITE="200"

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN="--dry-run"
            shift
            ;;
        --all-sites)
            ALL_SITES="--all-sites"
            shift
            ;;
        --samples)
            SAMPLES_PER_SITE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "========================================"
echo "MARRS Cloud-to-Cloud Transfer Launcher"
echo "========================================"
echo ""
echo "Configuration:"
echo "  Region: $AWS_REGION"
echo "  Instance Type: $INSTANCE_TYPE"
echo "  Max Spot Price: \$$SPOT_MAX_PRICE/hr"
echo "  S3 Bucket: $S3_BUCKET"
echo "  Samples per site: $SAMPLES_PER_SITE"
echo "  Options: $DRY_RUN $ALL_SITES"
echo ""

# Check if running in dry-run mode locally
if [[ -n "$DRY_RUN" ]]; then
    echo "Running local dry-run test..."
    python3 "$(dirname "$0")/marrs_cloud_transfer.py" \
        --dry-run \
        --samples-per-site "$SAMPLES_PER_SITE" \
        --bucket "$S3_BUCKET" \
        $ALL_SITES
    exit 0
fi

# Get the transfer script content (base64 encoded for user data)
SCRIPT_PATH="$(dirname "$0")/marrs_cloud_transfer.py"
if [[ ! -f "$SCRIPT_PATH" ]]; then
    echo "Error: Transfer script not found at $SCRIPT_PATH"
    exit 1
fi

SCRIPT_B64=$(base64 -w0 "$SCRIPT_PATH")

# Create user data script that runs on instance boot
USER_DATA=$(cat << 'USERDATA'
#!/bin/bash
set -ex

# Log everything
exec > >(tee /var/log/marrs-transfer.log) 2>&1

echo "Starting MARRS transfer at $(date)"

# Install dependencies
yum update -y
yum install -y python3 python3-pip
pip3 install boto3 requests

# Write transfer script
echo "SCRIPT_B64_PLACEHOLDER" | base64 -d > /tmp/marrs_cloud_transfer.py
chmod +x /tmp/marrs_cloud_transfer.py

# Run transfer
cd /tmp
python3 marrs_cloud_transfer.py \
    --samples-per-site SAMPLES_PLACEHOLDER \
    --bucket BUCKET_PLACEHOLDER \
    ALLSITES_PLACEHOLDER \
    2>&1 | tee /tmp/transfer_output.log

# Upload log to S3
aws s3 cp /tmp/transfer_output.log s3://BUCKET_PLACEHOLDER/logs/transfer_$(date +%Y%m%d_%H%M%S).log

echo "Transfer complete at $(date)"

# Self-terminate
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region AWS_REGION_PLACEHOLDER

USERDATA
)

# Replace placeholders
USER_DATA="${USER_DATA//SCRIPT_B64_PLACEHOLDER/$SCRIPT_B64}"
USER_DATA="${USER_DATA//SAMPLES_PLACEHOLDER/$SAMPLES_PER_SITE}"
USER_DATA="${USER_DATA//BUCKET_PLACEHOLDER/$S3_BUCKET}"
USER_DATA="${USER_DATA//AWS_REGION_PLACEHOLDER/$AWS_REGION}"
USER_DATA="${USER_DATA//ALLSITES_PLACEHOLDER/$ALL_SITES}"

# Get latest Amazon Linux 2023 AMI
AMI_ID=$(aws ec2 describe-images \
    --region "$AWS_REGION" \
    --owners amazon \
    --filters "Name=name,Values=al2023-ami-2023*-x86_64" \
              "Name=state,Values=available" \
    --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
    --output text)

echo "Using AMI: $AMI_ID"

# Create IAM instance profile if needed
INSTANCE_PROFILE="reefradar-2477-transfer-profile"
ROLE_NAME="reefradar-2477-transfer-role"

# Check if role exists
if ! aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
    echo "Creating IAM role and instance profile..."

    # Create trust policy
    cat > /tmp/trust-policy.json << 'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "ec2.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF

    # Create role
    aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document file:///tmp/trust-policy.json

    # Attach minimal policies
    cat > /tmp/s3-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:ListBucket",
                "s3:CreateBucket",
                "s3:PutLifecycleConfiguration"
            ],
            "Resource": [
                "arn:aws:s3:::$S3_BUCKET",
                "arn:aws:s3:::$S3_BUCKET/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "ec2:TerminateInstances"
            ],
            "Resource": "*",
            "Condition": {
                "StringEquals": {
                    "ec2:ResourceTag/Purpose": "marrs-transfer"
                }
            }
        }
    ]
}
EOF

    aws iam put-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-name "marrs-transfer-policy" \
        --policy-document file:///tmp/s3-policy.json

    # Create instance profile
    aws iam create-instance-profile --instance-profile-name "$INSTANCE_PROFILE" || true
    aws iam add-role-to-instance-profile \
        --instance-profile-name "$INSTANCE_PROFILE" \
        --role-name "$ROLE_NAME" || true

    echo "Waiting for instance profile to propagate..."
    sleep 10
fi

# Launch spot instance
echo "Launching EC2 spot instance..."

LAUNCH_SPEC=$(cat << EOF
{
    "ImageId": "$AMI_ID",
    "InstanceType": "$INSTANCE_TYPE",
    "IamInstanceProfile": {
        "Name": "$INSTANCE_PROFILE"
    },
    "UserData": "$(echo "$USER_DATA" | base64 -w0)",
    "TagSpecifications": [
        {
            "ResourceType": "instance",
            "Tags": [
                {"Key": "Name", "Value": "marrs-transfer"},
                {"Key": "Project", "Value": "ReefRadar"},
                {"Key": "Purpose", "Value": "marrs-transfer"}
            ]
        }
    ],
    "BlockDeviceMappings": [
        {
            "DeviceName": "/dev/xvda",
            "Ebs": {
                "VolumeSize": 50,
                "VolumeType": "gp3",
                "DeleteOnTermination": true
            }
        }
    ]
}
EOF
)

# Request spot instance
SPOT_REQUEST=$(aws ec2 request-spot-instances \
    --region "$AWS_REGION" \
    --spot-price "$SPOT_MAX_PRICE" \
    --instance-count 1 \
    --type "one-time" \
    --launch-specification "$LAUNCH_SPEC" \
    --query 'SpotInstanceRequests[0].SpotInstanceRequestId' \
    --output text)

echo "Spot request ID: $SPOT_REQUEST"
echo ""
echo "Waiting for spot instance to be fulfilled..."

# Wait for spot request to be fulfilled
for i in {1..30}; do
    STATUS=$(aws ec2 describe-spot-instance-requests \
        --region "$AWS_REGION" \
        --spot-instance-request-ids "$SPOT_REQUEST" \
        --query 'SpotInstanceRequests[0].Status.Code' \
        --output text)

    if [[ "$STATUS" == "fulfilled" ]]; then
        break
    elif [[ "$STATUS" == "price-too-low" ]]; then
        echo "Error: Spot price too low. Current market price is higher than $SPOT_MAX_PRICE"
        aws ec2 cancel-spot-instance-requests --spot-instance-request-ids "$SPOT_REQUEST"
        exit 1
    fi

    echo "  Status: $STATUS (waiting...)"
    sleep 10
done

# Get instance ID
INSTANCE_ID=$(aws ec2 describe-spot-instance-requests \
    --region "$AWS_REGION" \
    --spot-instance-request-ids "$SPOT_REQUEST" \
    --query 'SpotInstanceRequests[0].InstanceId' \
    --output text)

echo ""
echo "========================================"
echo "Transfer Instance Launched!"
echo "========================================"
echo ""
echo "Instance ID: $INSTANCE_ID"
echo "Spot Request: $SPOT_REQUEST"
echo ""
echo "Monitor progress:"
echo "  aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].State.Name'"
echo ""
echo "View logs (after ~5 min):"
echo "  aws s3 ls s3://$S3_BUCKET/logs/"
echo ""
echo "Check transferred data:"
echo "  aws s3 ls s3://$S3_BUCKET/sites/ --recursive | head -20"
echo ""
echo "Instance will auto-terminate when complete (~1-2 hours)"
echo ""
echo "Estimated cost: \$1-3 total"
