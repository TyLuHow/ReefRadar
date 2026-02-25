<research_objective>
Research the MARRS coral reef soundscape dataset and generate real reference embeddings for 45 sites across 5 countries. This replaces the current 8 synthetic reference sites with scientifically valid data.

This requires working ML inference (prompt 010) and correct preprocessing (prompt 011).
</research_objective>

<context>
ReefRadar currently uses 8 synthetic reference sites. The MARRS dataset contains real reef recordings from:
- 45 sites across 5 countries: Australia, Indonesia, Kenya, Mexico, Maldives
- Categories: healthy, degraded, restored_early (≤3 months), restored_mid (32-53 months)
- Source: https://rdr.ucl.ac.uk/articles/dataset/_b_Coral_Reef_Soundscapes_from_a_Global_Restoration_Programme_b_/29958062

File naming convention:
```
{country}_{site}_{YYYYMMDD}_{HHMMSS}.wav
Example: aus_D1_20230207_120400.wav
         (Australia, Degraded site 1, Feb 7 2023, 12:04 PM)

Site codes: H = Healthy, D = Degraded, R = Restored (early), M = Restored (mid)
Countries: aus, ind, ken, mex, mdv
```

Examine:
@data/embeddings/metadata.json - Current synthetic reference data
@lambdas/classifier/handler.py - How references are loaded and used
</context>

<research_tasks>
1. **MARRS Dataset Structure**
   - Download the dataset documentation/README
   - Understand the file organization
   - Identify which files correspond to which sites
   - Note any metadata files (coordinates, dates, habitat assessments)

2. **Data Requirements**
   - How much audio per site is needed for representative embeddings?
   - Recommendation: 5-10 recordings per site, compute mean embedding
   - Total download needed: ~5-10GB (not the full 1TB)

3. **Pre-computed Embeddings**
   - Check if pre-computed embeddings exist on Zenodo
   - Check Williams et al. supplementary materials
   - If available, use those instead of recomputing
</research_tasks>

<implementation>
1. **Create download script:**
   `./scripts/download_marrs_subset.py`
   ```python
   """
   Download representative MARRS audio subset.

   Strategy:
   - 5 recordings per site minimum
   - Cover different times of day (dawn, day, dusk, night)
   - Total ~5GB download
   """
   ```

2. **Create embedding generation script:**
   `./scripts/generate_reference_embeddings.py`
   ```python
   """
   Process MARRS audio through SurfPerch to generate reference embeddings.

   For each site:
   1. Load all audio files for that site
   2. Preprocess to 16kHz, 1.88s segments
   3. Generate embeddings for each segment
   4. Compute mean embedding across all segments
   5. Save with metadata
   """
   ```

3. **Update reference data structure:**
   `./data/embeddings/metadata.json`
   ```json
   {
     "version": "2.0",
     "generated_date": "2026-01-30",
     "model": "surfperch_v1",
     "sites": [
       {
         "site_id": "aus_H1",
         "country": "Australia",
         "region": "Great Barrier Reef",
         "status": "healthy",
         "latitude": -18.2865,
         "longitude": 147.6890,
         "recordings_used": 8,
         "recording_dates": ["2023-02-07", "2023-02-08"],
         "embedding": [0.123, 0.456, ...]
       }
     ]
   }
   ```

4. **Update classifier to load new format:**
   Modify `./lambdas/classifier/handler.py` to handle expanded metadata

5. **Upload to S3:**
   ```bash
   aws s3 cp ./data/embeddings/metadata.json \
     s3://reefradar-2477-embeddings/reference/metadata.json
   ```
</implementation>

<site_inventory>
Document all 45 sites with their metadata. Expected breakdown:

**Australia (aus):** ~12 sites
- H1, H2, H3... (healthy)
- D1, D2... (degraded)
- R1, R2... (restored early)
- M1... (restored mid)

**Indonesia (ind):** ~10 sites
**Kenya (ken):** ~8 sites
**Mexico (mex):** ~8 sites
**Maldives (mdv):** ~7 sites

For each site, document:
- Exact coordinates (lat/lon)
- Recording dates available
- Habitat assessment from MARRS metadata
- Number of recordings used
</site_inventory>

<output>
Create these files:
- `./scripts/download_marrs_subset.py` - Download script
- `./scripts/generate_reference_embeddings.py` - Embedding generation
- `./data/embeddings/metadata.json` - Updated with 45 sites
- `./data/embeddings/*.npy` - Individual site embeddings (optional, for backup)

Update these files:
- `./lambdas/classifier/handler.py` - Load new metadata format
- `./dashboard/app.py` - Display all 45 sites on map
- `./API.md` - Update /sites endpoint documentation

Upload to S3:
```bash
aws s3 sync ./data/embeddings/ s3://reefradar-2477-embeddings/reference/
```
</output>

<verification>
1. **Verify site coverage:**
   ```bash
   curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites | jq '.total_sites'
   # Should return 45
   ```

2. **Verify country distribution:**
   ```bash
   curl .../sites | jq '.countries'
   # Should return ["Australia", "Indonesia", "Kenya", "Mexico", "Maldives"]
   ```

3. **Verify embeddings are real (not synthetic):**
   - Check embedding variance across sites (synthetic are too uniform)
   - Verify healthy sites cluster differently than degraded

4. **Test classification with real embeddings:**
   - Upload real reef audio
   - Verify classification uses real reference comparison
   - Check that similar_sites returns geographically sensible results
</verification>

<success_criteria>
- All 45 MARRS sites represented with real SurfPerch embeddings
- Embeddings generated from actual MARRS audio (documented provenance)
- Site metadata includes coordinates, dates, habitat type
- /sites endpoint returns complete information
- Classification compares against real reference distribution
- Dashboard map shows all 45 sites at correct locations
</success_criteria>
