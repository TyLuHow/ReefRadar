<objective>
Deploy the SurfPerch model to AWS SageMaker as a serverless endpoint for generating audio embeddings.

This endpoint receives 1.88-second audio segments and returns 1280-dimensional embedding vectors. The serverless configuration keeps costs low by only charging for actual inference time.
</objective>

<context>
Project: ReefRadar - Coral Reef Acoustic Health Analysis API
Phase: 4 of 8

SageMaker Serverless Constraints:
- Maximum memory: 6 GB (SurfPerch needs ~128MB model + inference overhead)
- CPU only (no GPU) - sufficient for this model size
- Cold start: 30-43 seconds for first request
- Timeout: 60 seconds default
- Concurrency: 1-200 simultaneous requests
- Cost: ~$0.0001 per second of inference time

Model Details:
- SurfPerch: ~127 MB TensorFlow SavedModel
- Input: Float32 array of audio samples (1.88s × 16kHz = 30,080 samples)
- Output: 1280-dimensional embedding vector
</context>

<prerequisites>
Before starting:
1. Source AWS environment: `source ~/.reefradar-env`
2. Phase 2 completed (SurfPerch model downloaded to ~/reef-project/models/surfperch/)
3. SAGEMAKER_ROLE_ARN environment variable set
</prerequisites>

<implementation>

**Step 1: Create SageMaker Inference Script**

Create `~/reef-project/sagemaker/code/inference.py`:
```python
"""
SageMaker inference script for SurfPerch model.
Handles model loading, input deserialization, prediction, and output serialization.
"""

import json
import numpy as np
import tensorflow as tf
import os


def model_fn(model_dir):
    """
    Load the SurfPerch model from the model directory.
    Called once when the endpoint starts.
    """
    model_path = os.path.join(model_dir, 'surfperch')
    print(f"Loading model from: {model_path}")
    model = tf.saved_model.load(model_path)
    print("Model loaded successfully")
    return model


def input_fn(request_body, request_content_type):
    """
    Deserialize input data from the request body.
    Expects JSON with 'inputs' key containing audio samples.
    """
    if request_content_type == 'application/json':
        data = json.loads(request_body)
        inputs = data.get('inputs', data)
        return np.array(inputs, dtype=np.float32)
    raise ValueError(f'Unsupported content type: {request_content_type}')


def predict_fn(input_data, model):
    """
    Run prediction using the loaded model.
    Input should be audio samples, output is embedding vector.
    """
    # Ensure input is right shape (batch, samples)
    if len(input_data.shape) == 1:
        input_data = input_data[np.newaxis, :]

    # Get embedding from model
    embedding = model.signatures['serving_default'](
        tf.constant(input_data, dtype=tf.float32)
    )['embedding'].numpy()

    return embedding


def output_fn(prediction, accept):
    """
    Serialize prediction output to JSON.
    Returns embedding as a list of floats.
    """
    if accept == 'application/json':
        # prediction shape: (1, 1280)
        embedding = prediction[0].tolist()
        return json.dumps({'embedding': embedding})
    raise ValueError(f'Unsupported accept type: {accept}')
```

Create `~/reef-project/sagemaker/code/requirements.txt`:
```
tensorflow>=2.13.0
numpy>=1.24.0
```

**Step 2: Package Model for SageMaker**
```bash
cd ~/reef-project

# Create package directory structure
mkdir -p sagemaker-package/code

# Copy inference script and requirements
cp sagemaker/code/inference.py sagemaker-package/code/
cp sagemaker/code/requirements.txt sagemaker-package/code/

# Copy SurfPerch model
cp -r models/surfperch sagemaker-package/

# Create model archive
cd sagemaker-package
tar -czvf model.tar.gz code/ surfperch/
cd ..

echo "Model package created: sagemaker-package/model.tar.gz"
ls -lh sagemaker-package/model.tar.gz
```

**Step 3: Upload Model to S3**
```bash
source ~/.reefradar-env

aws s3 cp sagemaker-package/model.tar.gz \
  s3://${PROJECT_PREFIX}-embeddings/models/surfperch/model.tar.gz

# Verify upload
aws s3 ls s3://${PROJECT_PREFIX}-embeddings/models/surfperch/
```

**Step 4: Create SageMaker Model**
```bash
source ~/.reefradar-env

aws sagemaker create-model \
  --model-name ${PROJECT_PREFIX}-surfperch \
  --primary-container \
    Image=763104351884.dkr.ecr.us-east-1.amazonaws.com/tensorflow-inference:2.13-cpu,ModelDataUrl=s3://${PROJECT_PREFIX}-embeddings/models/surfperch/model.tar.gz \
  --execution-role-arn $SAGEMAKER_ROLE_ARN \
  --region us-east-1

echo "SageMaker model created: ${PROJECT_PREFIX}-surfperch"
```

**Step 5: Create Serverless Endpoint Configuration**
```bash
aws sagemaker create-endpoint-config \
  --endpoint-config-name ${PROJECT_PREFIX}-surfperch-config \
  --production-variants '[{
    "VariantName": "default",
    "ModelName": "'${PROJECT_PREFIX}'-surfperch",
    "ServerlessConfig": {
      "MemorySizeInMB": 6144,
      "MaxConcurrency": 5
    }
  }]' \
  --region us-east-1

echo "Endpoint config created: ${PROJECT_PREFIX}-surfperch-config"
```

**Step 6: Create and Wait for Endpoint**
```bash
aws sagemaker create-endpoint \
  --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint \
  --endpoint-config-name ${PROJECT_PREFIX}-surfperch-config \
  --region us-east-1

echo "Creating endpoint... This takes 5-10 minutes."
echo "Waiting for endpoint to be InService..."

aws sagemaker wait endpoint-in-service \
  --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint \
  --region us-east-1

echo "Endpoint is ready: ${PROJECT_PREFIX}-surfperch-endpoint"

# Save endpoint name to environment
echo "export SAGEMAKER_ENDPOINT=${PROJECT_PREFIX}-surfperch-endpoint" >> ~/.reefradar-env
```

**Step 7: Test the Endpoint**
```bash
source ~/.reefradar-env

# Create test input (random audio segment)
python3 << 'EOF'
import json
import numpy as np

# Generate random audio segment (1.88s at 16kHz = 30080 samples)
samples = np.random.randn(30080).astype(np.float32)
test_input = {'inputs': samples.tolist()}

with open('/tmp/test_input.json', 'w') as f:
    json.dump(test_input, f)

print("Test input created: /tmp/test_input.json")
print(f"Input shape: {len(samples)} samples")
EOF

# Invoke endpoint
aws sagemaker-runtime invoke-endpoint \
  --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint \
  --content-type application/json \
  --body fileb:///tmp/test_input.json \
  /tmp/response.json

# Check response
echo "Response:"
python3 -c "import json; r=json.load(open('/tmp/response.json')); print(f'Embedding dimension: {len(r[\"embedding\"])}')"
```
</implementation>

<output>
Files created:
- `~/reef-project/sagemaker/code/inference.py` - SageMaker inference handler
- `~/reef-project/sagemaker/code/requirements.txt` - Python dependencies
- `~/reef-project/sagemaker-package/model.tar.gz` - Packaged model archive

AWS Resources created:
- S3: `s3://${PROJECT_PREFIX}-embeddings/models/surfperch/model.tar.gz`
- SageMaker Model: `${PROJECT_PREFIX}-surfperch`
- SageMaker Endpoint Config: `${PROJECT_PREFIX}-surfperch-config`
- SageMaker Endpoint: `${PROJECT_PREFIX}-surfperch-endpoint`
</output>

<verification>
```bash
source ~/.reefradar-env

# Check model exists
aws sagemaker describe-model --model-name ${PROJECT_PREFIX}-surfperch --query 'ModelName'

# Check endpoint status
aws sagemaker describe-endpoint \
  --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint \
  --query '{Status: EndpointStatus, Config: EndpointConfigName}'

# Test endpoint returns 1280-dimension embedding
aws sagemaker-runtime invoke-endpoint \
  --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint \
  --content-type application/json \
  --body '{"inputs": [0.1, 0.2, 0.3]}' \
  /tmp/quick_test.json

python3 -c "import json; r=json.load(open('/tmp/quick_test.json')); print(f'Embedding size: {len(r[\"embedding\"])}'); assert len(r['embedding']) == 1280, 'Wrong embedding size!'"
```
</verification>

<success_criteria>
- [ ] inference.py created with model_fn, input_fn, predict_fn, output_fn
- [ ] model.tar.gz packaged and uploaded to S3
- [ ] SageMaker model created successfully
- [ ] Endpoint configuration created with serverless config (6GB, 5 concurrency)
- [ ] Endpoint status is "InService"
- [ ] Test invocation returns 1280-dimensional embedding
- [ ] SAGEMAKER_ENDPOINT saved to ~/.reefradar-env
</success_criteria>

<cost_notes>
Serverless endpoint costs:
- No charge when idle (unlike provisioned endpoints)
- ~$0.0001 per second of inference
- Cold start adds 30-43 seconds to first request after idle period
- For constant traffic, consider Provisioned Concurrency (~$8.64/month minimum)

To delete endpoint (saves money when not in use):
```bash
aws sagemaker delete-endpoint --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint
```

To recreate:
```bash
aws sagemaker create-endpoint \
  --endpoint-name ${PROJECT_PREFIX}-surfperch-endpoint \
  --endpoint-config-name ${PROJECT_PREFIX}-surfperch-config
```
</cost_notes>

<next_phase>
After completing this phase, proceed to Phase 5: Deploy Lambda Functions (prompts/005-deploy-lambda-functions.md)
</next_phase>
