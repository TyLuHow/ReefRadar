<objective>
Create an HTTP API Gateway that exposes the ReefRadar Lambda functions as REST endpoints.

The API Gateway provides:
- Public HTTPS endpoint for the API
- CORS configuration for browser access
- Request routing to the Router Lambda
- Binary media type support for audio uploads
</objective>

<context>
Project: ReefRadar - Coral Reef Acoustic Health Analysis API
Phase: 6 of 8

API Endpoints:
| Method | Path | Description |
|--------|------|-------------|
| POST | /upload | Upload audio file |
| POST | /analyze | Start analysis |
| GET | /sites | List reference sites |
| GET | /visualize/{analysis_id} | Get analysis results |
| GET | /health | Health check |

API Gateway HTTP API (v2) is used instead of REST API (v1) because:
- Lower latency
- Lower cost ($1.00 per million requests vs $3.50)
- Simpler configuration
- Built-in CORS support
</context>

<prerequisites>
Before starting:
1. Source AWS environment: `source ~/.reefradar-env`
2. Phase 5 completed (Lambda functions deployed)
3. Router Lambda function is active
</prerequisites>

<implementation>

**Step 1: Create HTTP API**
```bash
source ~/.reefradar-env

# Create the API
API_ID=$(aws apigatewayv2 create-api \
  --name ${PROJECT_PREFIX}-api \
  --protocol-type HTTP \
  --cors-configuration '{
    "AllowOrigins": ["*"],
    "AllowMethods": ["GET", "POST", "OPTIONS"],
    "AllowHeaders": ["Content-Type", "X-Filename", "Authorization"],
    "MaxAge": 86400
  }' \
  --query 'ApiId' \
  --output text \
  --region us-east-1)

echo "API created with ID: $API_ID"
echo "export API_ID=$API_ID" >> ~/.reefradar-env
```

**Step 2: Create Lambda Integration**
```bash
source ~/.reefradar-env

# Get Router Lambda ARN
ROUTER_ARN=$(aws lambda get-function \
  --function-name ${PROJECT_PREFIX}-router \
  --query 'Configuration.FunctionArn' \
  --output text)

# Create integration
INTEGRATION_ID=$(aws apigatewayv2 create-integration \
  --api-id $API_ID \
  --integration-type AWS_PROXY \
  --integration-uri $ROUTER_ARN \
  --payload-format-version 2.0 \
  --query 'IntegrationId' \
  --output text \
  --region us-east-1)

echo "Integration created with ID: $INTEGRATION_ID"
```

**Step 3: Create Routes**
```bash
source ~/.reefradar-env

# Create all routes pointing to the Router Lambda integration
ROUTES=(
  "POST /upload"
  "POST /analyze"
  "GET /sites"
  "GET /visualize/{analysis_id}"
  "GET /health"
)

for route in "${ROUTES[@]}"; do
  echo "Creating route: $route"
  aws apigatewayv2 create-route \
    --api-id $API_ID \
    --route-key "$route" \
    --target integrations/$INTEGRATION_ID \
    --region us-east-1 > /dev/null
done

echo "All routes created"

# List routes to verify
aws apigatewayv2 get-routes \
  --api-id $API_ID \
  --query 'Items[].RouteKey' \
  --output table
```

**Step 4: Create Default Stage with Auto-Deploy**
```bash
source ~/.reefradar-env

aws apigatewayv2 create-stage \
  --api-id $API_ID \
  --stage-name '$default' \
  --auto-deploy \
  --region us-east-1

echo "Default stage created with auto-deploy enabled"
```

**Step 5: Grant API Gateway Permission to Invoke Lambda**
```bash
source ~/.reefradar-env

# Allow API Gateway to invoke the Router Lambda
aws lambda add-permission \
  --function-name ${PROJECT_PREFIX}-router \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:${AWS_ACCOUNT_ID}:${API_ID}/*" \
  --region us-east-1 2>/dev/null || echo "Permission may already exist"

echo "Lambda invoke permission granted to API Gateway"
```

**Step 6: Get API URL**
```bash
source ~/.reefradar-env

API_URL=$(aws apigatewayv2 get-api \
  --api-id $API_ID \
  --query 'ApiEndpoint' \
  --output text)

echo ""
echo "=========================================="
echo "API URL: $API_URL"
echo "=========================================="
echo ""
echo "export API_URL=$API_URL" >> ~/.reefradar-env
```

**Step 7: Test API Endpoints**
```bash
source ~/.reefradar-env

echo "Testing API endpoints..."
echo ""

# Health check
echo "1. Health check:"
curl -s "${API_URL}/health" | python3 -m json.tool
echo ""

# Get sites
echo "2. Get reference sites:"
curl -s "${API_URL}/sites" | python3 -m json.tool
echo ""

# Test upload (with sample audio)
echo "3. Test upload (using test data):"
# Create a simple test WAV file
python3 << 'EOF'
import wave
import struct
import os

# Create a 2-second test audio file (16kHz, mono, 16-bit)
sample_rate = 16000
duration = 2
num_samples = sample_rate * duration

with wave.open('/tmp/test_audio.wav', 'w') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(sample_rate)
    for i in range(num_samples):
        # Simple sine wave
        import math
        value = int(32767 * math.sin(2 * math.pi * 440 * i / sample_rate))
        wav.writeframes(struct.pack('<h', value))

print("Test audio created: /tmp/test_audio.wav")
EOF

# Upload test file
UPLOAD_RESPONSE=$(curl -s -X POST "${API_URL}/upload" \
  -H "Content-Type: audio/wav" \
  -H "X-Filename: test_audio.wav" \
  --data-binary @/tmp/test_audio.wav)

echo "$UPLOAD_RESPONSE" | python3 -m json.tool
UPLOAD_ID=$(echo "$UPLOAD_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('upload_id',''))")
echo "Upload ID: $UPLOAD_ID"
echo ""

# Start analysis (if upload succeeded)
if [ -n "$UPLOAD_ID" ]; then
  echo "4. Start analysis:"
  curl -s -X POST "${API_URL}/analyze" \
    -H "Content-Type: application/json" \
    -d "{\"upload_id\": \"$UPLOAD_ID\"}" | python3 -m json.tool
fi
```
</implementation>

<output>
AWS Resources created:
- API Gateway HTTP API: `${PROJECT_PREFIX}-api`
- Integration: Lambda proxy to Router function
- Routes: /upload, /analyze, /sites, /visualize/{id}, /health
- Stage: $default with auto-deploy

Environment variables added to ~/.reefradar-env:
- API_ID
- API_URL
</output>

<verification>
```bash
source ~/.reefradar-env

echo "API Configuration:"
echo "=================="
echo "API ID: $API_ID"
echo "API URL: $API_URL"
echo ""

# List all routes
echo "Routes:"
aws apigatewayv2 get-routes \
  --api-id $API_ID \
  --query 'Items[].{Route:RouteKey,Target:Target}' \
  --output table

# Check stage
echo ""
echo "Stage:"
aws apigatewayv2 get-stages \
  --api-id $API_ID \
  --query 'Items[].{Name:StageName,AutoDeploy:AutoDeploy}' \
  --output table

# Verify endpoints work
echo ""
echo "Endpoint Tests:"
echo "  Health: $(curl -s -o /dev/null -w '%{http_code}' ${API_URL}/health)"
echo "  Sites:  $(curl -s -o /dev/null -w '%{http_code}' ${API_URL}/sites)"
```
</verification>

<success_criteria>
- [ ] HTTP API created with CORS enabled
- [ ] Lambda integration created with payload format 2.0
- [ ] All 5 routes created and mapped to integration
- [ ] Default stage created with auto-deploy
- [ ] API Gateway has permission to invoke Router Lambda
- [ ] /health endpoint returns 200
- [ ] /sites endpoint returns site list
- [ ] /upload endpoint accepts audio file
- [ ] API_URL saved to environment
</success_criteria>

<api_documentation>
Save this to `./docs/API.md`:

# ReefRadar API

Base URL: `${API_URL}`

## Endpoints

### Health Check
```
GET /health
Response: {"status": "healthy", "timestamp": "2024-01-01T00:00:00Z"}
```

### Upload Audio
```
POST /upload
Headers: Content-Type: audio/wav, X-Filename: myfile.wav
Body: [binary audio data]
Response: {"upload_id": "uuid", "filename": "...", "status": "uploaded"}
```

### Start Analysis
```
POST /analyze
Body: {"upload_id": "uuid"}
Response: {"analysis_id": "uuid", "status": "processing"}
```

### Get Results
```
GET /visualize/{analysis_id}
Response: {"status": "complete", "classification": {...}, ...}
```

### List Sites
```
GET /sites
Response: {"sites": [...], "total_sites": 45}
```
</api_documentation>

<next_phase>
After completing this phase, proceed to Phase 7: Build Streamlit Dashboard (prompts/007-build-streamlit-dashboard.md)
</next_phase>
