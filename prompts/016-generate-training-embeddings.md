<objective>
Generate SurfPerch embeddings for the smart-sampled MARRS data in S3, creating a labeled training dataset for the classification model.

This builds on prompt 015 which transferred raw audio to S3. Now we process it through the existing inference Lambda to create embeddings with labels.

Budget: This step should cost under $5 (Lambda invocations + S3 storage)
</objective>

<context>
Read CLAUDE.md for project conventions.

Prerequisites (from prompt 015):
- Raw audio files in S3: s3://reefradar-2477-marrs-raw/sites/{site_id}/
- Manifest of downloaded files with site metadata
- ~100-500 files per site, ~45 sites = 4,500-22,500 total files

Existing infrastructure:
@lambdas/classifier/handler.py - Current inference invocation logic
@infrastructure/lambda_container/inference.py - SurfPerch inference Lambda
@scripts/generate_marrs_embeddings.py - Local embedding generation (adapt for S3)

Label mapping (from site codes):
- H* sites → "healthy"
- D* sites → "degraded"
- R* sites → "restored_mid" (32-53 months)
- N* sites → "restored_early" (<3 months)
</context>

<requirements>

1. **Batch embedding generation script**:
   - Read manifest from S3 to get list of files
   - Process in batches (10-50 files per Lambda invocation)
   - Use existing inference Lambda via S3-based payload (already implemented)
   - Store embeddings with labels in structured format

2. **Output format for training**:
   ```json
   {
     "version": "1.0",
     "model": "surfperch_v1",
     "generated_date": "2026-02-01",
     "total_samples": 15000,
     "samples": [
       {
         "file_id": "ind_H1_20220830_060000",
         "site_id": "ind_H1",
         "country": "Indonesia",
         "label": "healthy",
         "embedding": [0.123, -0.456, ...],  // 1280-dim
         "timestamp": "2022-08-30T06:00:00"
       },
       ...
     ],
     "label_distribution": {
       "healthy": 5000,
       "degraded": 4000,
       "restored_mid": 3500,
       "restored_early": 2500
     }
   }
   ```

3. **Progress tracking**:
   - Store intermediate results in S3 (resume if interrupted)
   - Log to CloudWatch with batch progress
   - Estimate and display cost as processing runs

4. **Cost optimization**:
   - Lambda: ~$0.0000166/request × 22,500 = ~$0.37
   - But each request processes 10 segments, so maybe 2,250 invocations = ~$0.04
   - S3 PUT requests: negligible
   - Main cost is Lambda compute time
</requirements>

<implementation>
Create/modify:
- `scripts/generate_training_embeddings.py` - Batch processing script
- Run locally but process S3 data via Lambda

The script should:
1. List all audio files from S3 manifest
2. Group by site for balanced processing
3. Invoke inference Lambda in batches
4. Aggregate results into training dataset
5. Upload final dataset to S3

Parallelization strategy:
- Can invoke multiple Lambdas concurrently (Lambda handles scaling)
- Use ThreadPoolExecutor with 10-20 workers
- Monitor for throttling, back off if needed
</implementation>

<constraints>
- Must use existing inference Lambda (don't duplicate SurfPerch deployment)
- Total Lambda cost under $2
- Handle Lambda cold starts gracefully (retry with backoff)
- Ensure balanced sampling across labels (stratified)
</constraints>

<output>
Create files:
- `scripts/generate_training_embeddings.py` - Main script
- `data/training/embeddings_manifest.json` - Output location spec

After running:
- `s3://reefradar-2477-embeddings/training/training_dataset.json` - Full training data
- `s3://reefradar-2477-embeddings/training/metadata.json` - Dataset statistics
</output>

<verification>
1. Verify inference Lambda is working (test with 1 file)
2. Check label distribution is reasonably balanced
3. Verify embedding dimensions are correct (1280)
4. Calculate and report actual costs after completion
5. Spot check a few embeddings for sanity (not all zeros, reasonable range)
</verification>

<success_criteria>
- Training dataset with 5,000-25,000 labeled embeddings
- All four labels represented (healthy, degraded, restored_mid, restored_early)
- Total cost under $2
- Dataset uploaded to S3
- Processing completed without errors
</success_criteria>
</content>
</invoke>