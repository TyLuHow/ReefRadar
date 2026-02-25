<objective>
Integrate the validated real MARRS embeddings into production, replacing all 8 synthetic reference sites with the 4 real SurfPerch embeddings.

This updates the ReefRadar system to use scientifically valid reference data from actual coral reef recordings instead of synthetic placeholders.
</objective>

<prerequisite>
This prompt should only be run AFTER prompt 014 (embedding validation) confirms the data is production-ready.

Check: `./docs/embedding_validation_report.md` should exist with a "Ready for Production: Yes" recommendation.
</prerequisite>

<context>
**Current state:**
- Production uses `data/embeddings/metadata.json` with 8 synthetic sites
- Real embeddings in `data/embeddings/real_embeddings.json` with 4 MARRS sites
- Sites with real data: ind_H4, ind_H5 (healthy), ind_N1 (restored_early), ken_H1 (healthy)
- Metadata for all 45 MARRS sites in `data/embeddings/marrs_sites.json`

**Target state:**
- Replace metadata.json with 4 real MARRS sites
- Update format to include all metadata (coordinates, country, recordings used)
- Upload to S3
- Ensure classifier and dashboard work with new data

Examine:
@data/embeddings/real_embeddings.json - source of real embeddings
@data/embeddings/metadata.json - current production format (to understand schema)
@lambdas/classifier/handler.py - how embeddings are loaded and used
@dashboard/app.py - how sites are displayed
@CLAUDE.md - deployment instructions
</context>

<requirements>

<data_transformation>
1. **Create new metadata.json** with schema:
```json
{
  "version": "2.0",
  "generated_date": "2026-01-31",
  "model": "surfperch_v1",
  "source": "MARRS dataset (UCL Figshare DOI: 10.5522/04/29958062)",
  "sites": [
    {
      "site_id": "ind_H4",
      "country": "Indonesia",
      "region": "South Sulawesi",
      "status": "healthy",
      "latitude": -4.929463,
      "longitude": 119.316792,
      "recordings_used": 30,
      "windows_processed": 30,
      "synthetic": false,
      "embedding": [...]
    }
  ]
}
```

2. **Include all 4 sites** from real_embeddings.json:
   - ind_H4 (healthy)
   - ind_H5 (healthy)
   - ind_N1 (restored_early)
   - ken_H1 (healthy)

3. **Preserve backward compatibility** - classifier expects `mean_embedding` or `embedding` field
</data_transformation>

<classifier_updates>
Review and update `lambdas/classifier/handler.py` if needed:

1. Check embedding loading code handles new schema
2. Ensure `status` field mapping works:
   - "healthy" maps to healthy category
   - "restored_early" maps to restored_early category
   - (Note: no degraded sites in current 4 - this is a limitation to document)
3. Update any hardcoded site counts or expectations
</classifier_updates>

<dashboard_updates>
Review and update `dashboard/app.py` if needed:

1. Reference Sites tab should display all 4 sites
2. Map visualization (if present) should show correct coordinates
3. Site metadata display should work with new fields
</dashboard_updates>

<deployment>
After local changes verified:

1. **Upload to S3:**
```bash
aws s3 cp ./data/embeddings/metadata.json s3://reefradar-2477-embeddings/reference/metadata.json
```

2. **Redeploy classifier Lambda** (if code changed):
```bash
cd lambdas/classifier && zip -r function.zip handler.py
aws lambda update-function-code --function-name reefradar-2477-classifier --zip-file fileb://function.zip
```

3. **Verify API still works:**
```bash
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites | jq '.total_sites'
# Should return 4
```
</deployment>

</requirements>

<constraints>
- Do NOT delete real_embeddings.json - keep as backup
- Do NOT modify marrs_sites.json - it's the source of truth for all 45 sites
- Document the limitation: only 3 healthy + 1 restored_early sites (no degraded sites yet)
- If classifier changes are needed, ensure backward compatibility with old metadata format during transition
</constraints>

<output>
Files to create/modify:
- `./data/embeddings/metadata.json` - Replace with new v2.0 schema
- `./lambdas/classifier/handler.py` - Update if schema changes break loading
- `./dashboard/app.py` - Update if display breaks

After deployment, verify:
- /sites endpoint returns 4 sites with correct metadata
- Classification still works (test with sample audio if available)
- Dashboard displays sites correctly
</output>

<verification>
Before declaring complete:

1. **Local verification:**
   - Load new metadata.json in Python, verify 4 sites with embeddings
   - Run classifier handler locally if possible

2. **API verification (after deployment):**
```bash
# Check sites endpoint
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites | jq '.'

# Verify site count
curl .../sites | jq '.total_sites'  # Should be 4

# Verify health check
curl .../health
```

3. **Document in commit message:**
   - What changed: synthetic → real embeddings
   - Source: MARRS dataset
   - Limitation: 4 sites only (3 healthy, 1 restored_early, 0 degraded)
</verification>

<success_criteria>
- metadata.json replaced with 4 real MARRS site embeddings
- Classifier loads and uses new format correctly
- Dashboard displays sites with correct metadata
- S3 updated with new reference data
- API /sites endpoint returns 4 sites
- Limitations documented (no degraded sites in current set)
</success_criteria>
