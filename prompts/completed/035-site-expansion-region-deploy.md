<objective>
Expand ReefRadar from 8 to 45 reference sites across 5 countries by downloading MARRS audio samples, generating SurfPerch embeddings via Lambda, updating the S3 reference data, expanding region detection with new biogeographic regions, and deploying everything to production (Lambda + Vercel).

This prompt requires AWS access (Lambda invoke, S3 upload, Lambda deploy) and Vercel CLI.
</objective>

<context>
Read `./CLAUDE.md` for full project context.

Current state:
- `./data/embeddings/metadata.json` is v3.0 with 8 reference sites (1280-dim SurfPerch embeddings)
- `./data/embeddings/marrs_sites.json` has all 45 MARRS sites with coordinates and metadata
- `./lambdas/classifier/region_detection.py` has 7 regions (Indo-Pacific, Caribbean, etc.) but no specific regions for Australia, Maldives, or Mexico
- Region detection uses smallest-area matching to resolve overlapping bounding boxes
- The inference Lambda (`reefradar-2477-inference`) generates SurfPerch embeddings from WAV audio
- The classifier Lambda (`reefradar-2477-classifier`) uses region_detection.py for geographic confidence

Prompt 034 (assumed complete) already updated all dashboard text to say "45 sites / 5 countries". This prompt makes the backend match.

Sites by country (from marrs_sites.json):
- Australia: 7 sites
- Indonesia: 21 sites
- Kenya: 5 sites
- Maldives: 5 sites
- Mexico: 7 sites
- Total: 45 sites
</context>

<requirements>

## Part 1: Download MARRS Audio Samples

### 1.1 Get Figshare File Manifest

```bash
mkdir -p data/marrs
curl -s "https://api.figshare.com/v2/articles/29958062/files" > data/marrs/figshare_files.json
```

Inspect the response to understand file naming and download URLs.

### 1.2 Create Download Script

Create `./scripts/download_marrs_samples.py` that:

1. Reads `./data/embeddings/marrs_sites.json` for the 45 site IDs and metadata
2. Reads `./data/marrs/figshare_files.json` for download URLs
3. Maps site IDs (e.g., `ind_D2`) to their Figshare zip archives
4. Downloads 5 sample WAV files per site (not the entire archive -- extract 5 random WAVs from each zip)
5. Saves to `./data/marrs/samples/{site_id}/` (e.g., `data/marrs/samples/aus_D1/*.WAV`)
6. Implements resumable progress tracking via `./data/marrs/download_progress.json`
7. Rate-limits requests (1 second between downloads)
8. Handles errors gracefully -- log failures but continue to next site

The script must handle the fact that each site's data may be in a large zip file (some are 500MB+). Stream the download and extract only 5 random WAVs without loading the entire zip into memory if possible. If memory streaming isn't feasible, use BytesIO but warn about large archives.

Skip sites that already have 5+ WAVs in their sample directory.

Run the script. This will download ~200 WAV files across 45 sites. Verify completion with:
```bash
find data/marrs/samples -name "*.WAV" -o -name "*.wav" | wc -l
# Should be ~220-225 files (5 per site, minus any failures)
```

### 1.3 Generate SurfPerch Embeddings via Lambda

Create `./scripts/generate_site_embeddings.py` that:

1. Iterates over all sites in `./data/marrs/samples/`
2. For each site's 5 WAV files, invokes `reefradar-2477-inference` Lambda with the audio
3. Averages the returned embeddings to create one 1280-dim mean embedding per site
4. Saves progress to `./data/marrs/embedding_progress.json` (resumable)
5. Outputs final metadata to `./data/embeddings/metadata_v4.json`

The Lambda payload format:
```json
{"audio_base64": "<base64-encoded WAV>", "sample_rate": 32000}
```

Check the actual Lambda response format by reading `./infrastructure/lambda_container/inference.py` before building the script. The response may return `embedding` (single) or `embeddings` (list of per-window embeddings). If a list, average them.

The output metadata_v4.json format should match the existing v3.0 structure:
```json
{
  "version": "4.0",
  "source": "MARRS dataset (DOI: 10.5522/04/29958062)",
  "embedding_dimension": 1280,
  "sites": [
    {
      "site_id": "ind_H4",
      "country": "Indonesia",
      "region": "healthy",
      "status": "healthy",
      "site_type": "healthy",
      "latitude": -4.930792,
      "longitude": 119.318102,
      "recordings_used": 5,
      "windows_processed": 15,
      "synthetic": false,
      "mean_embedding": [0.123, ...]
    }
  ]
}
```

Use coordinates from `./data/embeddings/marrs_sites.json` for each site.

Rate-limit Lambda invocations: 0.5 second delay between calls to avoid throttling.

Run the script. This will invoke Lambda ~225 times (5 files x 45 sites). Monitor for errors.

### 1.4 Upload to S3

After generating metadata_v4.json:

```bash
# Backup existing
aws s3 cp s3://reefradar-2477-embeddings/reference/metadata.json \
  s3://reefradar-2477-embeddings/reference/metadata_v3_backup.json

# Upload new
aws s3 cp data/embeddings/metadata_v4.json \
  s3://reefradar-2477-embeddings/reference/metadata.json

# Also keep a local copy as the primary
cp data/embeddings/metadata_v4.json data/embeddings/metadata.json
```

## Part 2: Update Region Detection

### 2.1 Add New Biogeographic Regions

Update `./lambdas/classifier/region_detection.py` to add specific regions for new training countries while preserving the existing smallest-area-wins matching logic.

Add these NEW regions (keeping all existing ones):

```python
'EAST_AFRICA': {
    'lat_min': -12, 'lat_max': 5,
    'lon_min': 38, 'lon_max': 52,
    'name': 'East African Coast',
    'in_distribution': True  # Kenya training data
},
'GREAT_BARRIER_REEF': {
    'lat_min': -25, 'lat_max': -10,
    'lon_min': 142, 'lon_max': 155,
    'name': 'Great Barrier Reef',
    'in_distribution': True  # Australia training data
},
'MALDIVES': {
    'lat_min': -1, 'lat_max': 8,
    'lon_min': 71, 'lon_max': 75,
    'name': 'Maldives',
    'in_distribution': True  # Maldives training data
},
'MESOAMERICAN_REEF': {
    'lat_min': 15, 'lat_max': 22,
    'lon_min': -90, 'lon_max': -84,
    'name': 'Mesoamerican Barrier Reef',
    'in_distribution': True  # Mexico training data
},
```

CRITICAL CONSTRAINT: The Mesoamerican Reef bounding box overlaps with the Caribbean box. The existing smallest-area matching logic already handles this correctly -- Mesoamerican Reef is smaller than Caribbean, so Mexico coordinates will match Mesoamerican first. Verify this is working by testing.

Do NOT change `in_distribution` for the existing CARIBBEAN region -- it MUST remain `False`. Mexico training data only covers the Mesoamerican Reef, NOT Jamaica, Florida, Bahamas, etc.

Also update EAST_AFRICA to be `in_distribution: True` since we now have Kenya training data. The existing INDIAN_OCEAN region (which covers the broader area including Kenya's longitude) should remain True -- but EAST_AFRICA is more specific so Kenya coordinates will match it first.

### 2.2 Update Caveat Text

Update the `CAVEATS` dict in region_detection.py:

- `in_distribution` caveat: Change "Indo-Pacific region" to "MARRS training regions (Indonesia, Australia, Kenya, Maldives, Mexico)"
- `out_of_distribution` caveat: Keep the template but update the training description

### 2.3 Update Router Lambda

Read `./lambdas/router/handler.py` to check how the /sites endpoint returns data. It likely reads metadata.json from S3. Verify it will automatically reflect the new 45-site data after the S3 upload, or if any code changes are needed.

### 2.4 Test Region Detection Locally

Create or update `./scripts/test_region_detection.py` to verify:

```python
# In-distribution (should all return in_training_distribution: True)
assert detect_region(-4.93, 119.32)['in_training_distribution']    # Indonesia
assert detect_region(-18.0, 147.0)['in_training_distribution']     # Australia GBR
assert detect_region(-2.22, 41.01)['in_training_distribution']     # Kenya
assert detect_region(4.17, 73.51)['in_training_distribution']      # Maldives
assert detect_region(20.5, -87.4)['in_training_distribution']      # Mexico (Mesoamerican)

# Out-of-distribution (should all return in_training_distribution: False)
assert not detect_region(18.1, -77.3)['in_training_distribution']  # Jamaica (Caribbean)
assert not detect_region(24.5, -81.8)['in_training_distribution']  # Florida Keys (Caribbean)
assert not detect_region(25.0, 37.0)['in_training_distribution']   # Red Sea
assert not detect_region(15.0, -17.0)['in_training_distribution']  # Eastern Atlantic

# Region name checks
assert detect_region(-18.0, 147.0)['region'] == 'GREAT_BARRIER_REEF'
assert detect_region(4.17, 73.51)['region'] == 'MALDIVES'
assert detect_region(20.5, -87.4)['region'] == 'MESOAMERICAN_REEF'
assert detect_region(-2.22, 41.01)['region'] == 'EAST_AFRICA'
assert detect_region(18.1, -77.3)['region'] == 'CARIBBEAN'  # NOT Mesoamerican

# Unknown
assert not detect_region(None, None)['in_training_distribution']
assert detect_region(None, None)['confidence_multiplier'] == 0.7
```

Run the test script and fix any failures.

## Part 3: Deploy

### 3.1 Deploy Classifier Lambda

```bash
cd lambdas/classifier
zip -r function.zip handler.py region_detection.py
aws lambda update-function-code \
  --function-name reefradar-2477-classifier \
  --zip-file fileb://function.zip \
  --region us-east-1
```

Wait for the update to complete:
```bash
aws lambda wait function-updated --function-name reefradar-2477-classifier --region us-east-1
```

### 3.2 Verify API

Test the live API endpoints:

```bash
# Health check
curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health

# Sites -- should return 45 sites across 5 countries
curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites | python3 -c "
import json, sys
data = json.load(sys.stdin)
sites = data.get('sites', [])
print(f'Total sites: {len(sites)}')
countries = set(s.get('country', 'unknown') for s in sites)
print(f'Countries: {sorted(countries)}')
for c in sorted(countries):
    count = sum(1 for s in sites if s.get('country') == c)
    print(f'  {c}: {count}')
"
```

If the /sites endpoint returns fewer than 45 sites, check if the router Lambda needs a code update to read the new metadata format.

### 3.3 Build and Deploy Dashboard

```bash
cd dashboard-next
npm run build
```

If the build passes, deploy to Vercel:
```bash
vercel --prod
```

If Vercel CLI is not authenticated, document the manual steps needed.

</requirements>

<constraints>
- Lambda invocations cost money. The inference Lambda runs TensorFlow on a 3GB container. ~225 invocations at ~5 seconds each = ~19 minutes of compute. This is acceptable.
- Total download size for 5 WAVs per 45 sites will be roughly 5-20 GB of zip archives (since each zip is the full site). Ensure adequate disk space.
- The Figshare API may rate-limit. If downloads fail with 429, increase delay between requests.
- Do NOT modify the inference Lambda or preprocessor Lambda -- only the classifier and router.
- Do NOT change the DynamoDB schema or S3 bucket structure.
</constraints>

<verification>
Before declaring complete, verify ALL of the following:

1. **Embeddings generated**: `data/embeddings/metadata_v4.json` exists with 40+ sites (some may fail, 40+ is acceptable)
2. **S3 updated**: `aws s3 ls s3://reefradar-2477-embeddings/reference/metadata.json` shows recent timestamp
3. **Region detection tests pass**: All 10+ assertions in test_region_detection.py pass
4. **Classifier deployed**: `aws lambda get-function --function-name reefradar-2477-classifier --query 'Configuration.LastModified'` shows today's date
5. **API returns 45 sites**: `curl .../prod/sites` returns the expanded dataset
6. **API /health**: Returns `{"status": "healthy"}`
7. **Dashboard builds**: `cd dashboard-next && npm run build` passes with zero errors
8. **Vercel deployed**: If Vercel deploy succeeded, curl the production URL for 200 status

Document any sites that failed embedding generation and why.
</verification>

<success_criteria>
- metadata_v4.json contains 40+ sites with real 1280-dim SurfPerch embeddings
- S3 reference data updated to v4.0
- Region detection correctly identifies: Australia (GBR, in-dist), Maldives (in-dist), Mexico/Mesoamerican (in-dist), Jamaica/Florida (Caribbean, out-of-dist)
- Classifier Lambda deployed with new region_detection.py
- /sites API returns 40+ sites across 5 countries
- Dashboard builds clean and is deployed to Vercel
- No regressions in existing functionality (/health, /upload, /analyze work)
</success_criteria>
