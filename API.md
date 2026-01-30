# ReefRadar API Reference

## Base URL

```
https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod
```

## Authentication

**Current:** None (open API)

**Headers:** No authentication headers required.

## CORS Configuration

- **Allowed Origins:** `*` (all)
- **Allowed Methods:** `GET`, `POST`, `OPTIONS`
- **Allowed Headers:** `Content-Type`, `X-Filename`

---

## Endpoints

### GET /health

Health check endpoint to verify API availability.

**Request:**
```bash
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health
```

**Response (200 OK):**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-30T03:01:43.855765"
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| status | string | Always "healthy" if API is up |
| timestamp | string | ISO 8601 UTC timestamp |

---

### GET /sites

List all reference sites used for comparison.

**Request:**
```bash
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites
```

**Response (200 OK):**
```json
{
  "sites": [
    {
      "site_id": "aus_H1",
      "country": "Australia",
      "status": "healthy"
    },
    {
      "site_id": "aus_H2",
      "country": "Australia",
      "status": "healthy"
    },
    {
      "site_id": "idn_H1",
      "country": "Indonesia",
      "status": "healthy"
    },
    {
      "site_id": "aus_D1",
      "country": "Australia",
      "status": "degraded"
    },
    {
      "site_id": "phl_D1",
      "country": "Philippines",
      "status": "degraded"
    },
    {
      "site_id": "mex_R1",
      "country": "Mexico",
      "status": "restored_early"
    },
    {
      "site_id": "aus_R1",
      "country": "Australia",
      "status": "restored_early"
    },
    {
      "site_id": "idn_M1",
      "country": "Indonesia",
      "status": "restored_mid"
    }
  ],
  "total_sites": 8,
  "countries": ["Australia", "Indonesia", "Philippines", "Mexico"]
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| sites | array | List of reference site objects |
| sites[].site_id | string | Unique site identifier |
| sites[].country | string | Country name |
| sites[].status | string | Health status (healthy/degraded/restored_early/restored_mid) |
| total_sites | integer | Total count of reference sites |
| countries | array | List of unique countries |

---

### POST /upload

Upload an audio file for analysis.

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| Content-Type | Yes | `audio/wav` |
| X-Filename | No | Original filename (default: `upload_{id}.wav`) |

**Request Body:** Raw binary WAV file data

**Constraints:**
- Maximum file size: 50 MB
- Format: WAV (PCM)
- Minimum duration: 5 seconds

**Request Example:**
```bash
curl -X POST https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/upload \
  -H "Content-Type: audio/wav" \
  -H "X-Filename: my_reef_recording.wav" \
  --data-binary @my_reef_recording.wav
```

**Response (200 OK):**
```json
{
  "upload_id": "038bf9da-b260-4f95-bf04-20ab191e9b6c",
  "filename": "my_reef_recording.wav",
  "s3_key": "uploads/038bf9da-b260-4f95-bf04-20ab191e9b6c/my_reef_recording.wav",
  "size_bytes": 384044,
  "status": "uploaded"
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| upload_id | string | UUID for this upload (use in /analyze) |
| filename | string | Stored filename |
| s3_key | string | S3 object path |
| size_bytes | integer | File size in bytes |
| status | string | Always "uploaded" on success |

**Error Responses:**

*File Too Large (400):*
```json
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File exceeds 50 MB limit",
    "details": {
      "size_bytes": 52428800
    }
  }
}
```

*Server Error (500):*
```json
{
  "error": {
    "code": "UPLOAD_FAILED",
    "message": "Error description"
  }
}
```

---

### POST /analyze

Start analysis of an uploaded audio file.

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| Content-Type | Yes | `application/json` |

**Request Body:**
```json
{
  "upload_id": "038bf9da-b260-4f95-bf04-20ab191e9b6c"
}
```

**Request Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| upload_id | string | Yes | Upload ID from /upload response |

**Request Example:**
```bash
curl -X POST https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/analyze \
  -H "Content-Type: application/json" \
  -d '{"upload_id": "038bf9da-b260-4f95-bf04-20ab191e9b6c"}'
```

**Response (202 Accepted):**
```json
{
  "analysis_id": "a1d941dd-5d28-4486-ad45-09c214aca530",
  "upload_id": "038bf9da-b260-4f95-bf04-20ab191e9b6c",
  "status": "processing",
  "message": "Analysis started. Poll GET /visualize/{analysis_id} for results."
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| analysis_id | string | UUID for this analysis (use in /visualize) |
| upload_id | string | Associated upload ID |
| status | string | "processing" |
| message | string | Instructions for next step |

**Error Responses:**

*Missing Upload ID (400):*
```json
{
  "error": {
    "code": "MISSING_UPLOAD_ID",
    "message": "upload_id is required"
  }
}
```

*Upload Not Found (404):*
```json
{
  "error": {
    "code": "UPLOAD_NOT_FOUND",
    "message": "No upload found with ID: invalid-id"
  }
}
```

---

### GET /visualize/{analysis_id}

Get analysis results. Poll this endpoint until status is "complete" or "failed".

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| analysis_id | string | Analysis ID from /analyze response |

**Request Example:**
```bash
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/visualize/a1d941dd-5d28-4486-ad45-09c214aca530
```

**Response - Processing (200 OK):**
```json
{
  "analysis_id": "a1d941dd-5d28-4486-ad45-09c214aca530",
  "status": "processing"
}
```

**Response - Complete (200 OK):**
```json
{
  "analysis_id": "36d93866-d414-4a60-a562-68a72eed219a",
  "status": "complete",
  "classification": {
    "label": "degraded",
    "confidence": 0.261377,
    "probabilities": {
      "healthy": 0.241853,
      "degraded": 0.261377,
      "restored_early": 0.250283,
      "restored_mid": 0.246488
    }
  },
  "similar_sites": [
    {
      "site_id": "phl_D1",
      "country": "phl",
      "similarity": 0.223476,
      "status": "degraded"
    },
    {
      "site_id": "aus_D1",
      "country": "aus",
      "similarity": 0.20864,
      "status": "degraded"
    },
    {
      "site_id": "aus_R1",
      "country": "aus",
      "similarity": 0.20801,
      "status": "restored_early"
    }
  ],
  "visualization": {
    "type": "projection_2d",
    "coordinates": {
      "x": 0.662955,
      "y": 0.318253
    },
    "reference_sites": [
      {
        "site_id": "aus_H1",
        "x": 0.017611,
        "y": 0.018041,
        "status": "healthy"
      }
    ]
  },
  "embedding_summary": {
    "dimension": 1280,
    "num_segments": 1,
    "aggregation": "mean",
    "synthetic": true
  },
  "caveats": "Classification based on acoustic similarity to reference sites. Not a definitive health diagnosis. Complements but does not replace visual surveys. (Demo mode: using synthetic embeddings)"
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| analysis_id | string | Analysis identifier |
| status | string | "processing", "complete", or "failed" |
| classification | object | Classification results (when complete) |
| classification.label | string | Predicted health status |
| classification.confidence | number | Confidence score (0-1) |
| classification.probabilities | object | Probability for each category |
| similar_sites | array | Top 3 most similar reference sites |
| similar_sites[].site_id | string | Reference site ID |
| similar_sites[].country | string | Country code |
| similar_sites[].similarity | number | Cosine similarity (0-1) |
| similar_sites[].status | string | Site health status |
| visualization | object | 2D projection data |
| visualization.type | string | Always "projection_2d" |
| visualization.coordinates | object | User sample position |
| visualization.reference_sites | array | Reference site positions |
| embedding_summary | object | Technical details |
| embedding_summary.dimension | integer | Embedding size (1280) |
| embedding_summary.num_segments | integer | Audio segments processed |
| embedding_summary.aggregation | string | Aggregation method ("mean") |
| embedding_summary.synthetic | boolean | True if using fallback embeddings |
| caveats | string | Important disclaimers |

**Response - Failed (200 OK):**
```json
{
  "analysis_id": "a1d941dd-5d28-4486-ad45-09c214aca530",
  "status": "failed",
  "error": "Audio too short: 2.50s (minimum: 5.00s)"
}
```

**Error Responses:**

*Analysis Not Found (404):*
```json
{
  "error": {
    "code": "ANALYSIS_NOT_FOUND",
    "message": "No analysis found with ID: invalid-id"
  }
}
```

---

## Complete Workflow Example

```bash
#!/bin/bash
API="https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod"

# 1. Upload audio file
echo "Uploading..."
UPLOAD=$(curl -s -X POST "$API/upload" \
  -H "Content-Type: audio/wav" \
  -H "X-Filename: reef.wav" \
  --data-binary @reef.wav)

UPLOAD_ID=$(echo $UPLOAD | jq -r '.upload_id')
echo "Upload ID: $UPLOAD_ID"

# 2. Start analysis
echo "Starting analysis..."
ANALYZE=$(curl -s -X POST "$API/analyze" \
  -H "Content-Type: application/json" \
  -d "{\"upload_id\": \"$UPLOAD_ID\"}")

ANALYSIS_ID=$(echo $ANALYZE | jq -r '.analysis_id')
echo "Analysis ID: $ANALYSIS_ID"

# 3. Poll for results
echo "Waiting for results..."
while true; do
  sleep 5
  RESULT=$(curl -s "$API/visualize/$ANALYSIS_ID")
  STATUS=$(echo $RESULT | jq -r '.status')

  if [ "$STATUS" = "complete" ]; then
    echo "Complete!"
    echo $RESULT | jq '.classification'
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Failed: $(echo $RESULT | jq -r '.error')"
    break
  fi

  echo "Still processing..."
done
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| NOT_FOUND | 404 | Route or resource not found |
| FILE_TOO_LARGE | 400 | Upload exceeds 50 MB |
| MISSING_UPLOAD_ID | 400 | upload_id not provided |
| UPLOAD_NOT_FOUND | 404 | Invalid upload_id |
| ANALYSIS_NOT_FOUND | 404 | Invalid analysis_id |
| UPLOAD_FAILED | 500 | Server error during upload |
| ANALYZE_FAILED | 500 | Server error starting analysis |

---

## Rate Limits

No rate limits currently configured.

**Recommended client behavior:**
- Maximum 10 requests/second
- Exponential backoff on 5xx errors
- Minimum 2 seconds between /visualize polls

---

## SDKs & Examples

### Python
```python
import requests
import time

API = "https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod"

# Upload
with open("reef.wav", "rb") as f:
    resp = requests.post(f"{API}/upload",
        data=f.read(),
        headers={"Content-Type": "audio/wav"})
upload_id = resp.json()["upload_id"]

# Analyze
resp = requests.post(f"{API}/analyze",
    json={"upload_id": upload_id})
analysis_id = resp.json()["analysis_id"]

# Poll
while True:
    resp = requests.get(f"{API}/visualize/{analysis_id}")
    result = resp.json()
    if result["status"] == "complete":
        print(result["classification"])
        break
    time.sleep(5)
```

### JavaScript
```javascript
const API = "https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod";

async function analyzeReef(file) {
  // Upload
  const uploadRes = await fetch(`${API}/upload`, {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: file
  });
  const { upload_id } = await uploadRes.json();

  // Analyze
  const analyzeRes = await fetch(`${API}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload_id })
  });
  const { analysis_id } = await analyzeRes.json();

  // Poll
  while (true) {
    const resultRes = await fetch(`${API}/visualize/${analysis_id}`);
    const result = await resultRes.json();
    if (result.status === "complete") return result;
    if (result.status === "failed") throw new Error(result.error);
    await new Promise(r => setTimeout(r, 5000));
  }
}
```
