<research_objective>
Validate the quality and scientific validity of the 4 real SurfPerch embeddings generated from MARRS coral reef audio before integrating into production.

This analysis ensures we're not replacing synthetic reference data with flawed real data. The embeddings must demonstrate meaningful acoustic signatures that align with reef health status.
</research_objective>

<context>
ReefRadar uses SurfPerch (Google's bioacoustic ML model) to generate 1280-dimensional embeddings from coral reef audio. We have:

**Real embeddings (to validate):**
- `data/embeddings/real_embeddings.json` - 4 sites with real SurfPerch embeddings
- Sites: ind_H4, ind_H5 (healthy), ind_N1 (restored_early), ken_H1 (healthy)
- Each generated from 30 audio recordings processed through inference Lambda

**Synthetic embeddings (current production):**
- `data/embeddings/metadata.json` - 8 synthetic sites
- Sites: aus_H1, aus_H2, phl_D1, aus_R1, idn_H1, mex_R1, aus_D1, idn_M1

**Audio source:**
- `data/marrs_audio/` - 4 folders with original MARRS WAV files
- MARRS dataset: UCL Figshare DOI 10.5522/04/29958062

Examine:
@data/embeddings/real_embeddings.json
@data/embeddings/metadata.json
@data/embeddings/marrs_sites.json
@lambdas/classifier/handler.py - see how embeddings are used for classification
</context>

<analysis_requirements>

<statistical_validation>
Thoroughly analyze embedding quality:

1. **Embedding Distribution Analysis**
   - Check value ranges (SurfPerch outputs should be roughly normalized)
   - Compute mean, std, min, max for each site's embedding
   - Identify any anomalous values (NaN, inf, extreme outliers)
   - Compare distributions between real vs synthetic embeddings

2. **Inter-site Similarity Analysis**
   - Compute pairwise cosine similarity matrix for all 4 real sites
   - Do healthy sites (ind_H4, ind_H5, ken_H1) cluster together?
   - Does restored_early (ind_N1) show distinct separation?
   - Compare to pairwise similarities in synthetic data

3. **Dimensionality Analysis**
   - Verify all embeddings are 1280-dimensional
   - Check for dead dimensions (always zero/constant)
   - Compute variance per dimension - are embeddings using the full space?

4. **Consistency Check**
   - Are embeddings from same health status more similar than different statuses?
   - Expected: healthy sites cluster, degraded/restored separate
</statistical_validation>

<scientific_validation>
Assess alignment with bioacoustic science:

1. **SurfPerch Model Expectations**
   - SurfPerch trained on bird vocalizations but shown effective for marine bioacoustics
   - Embeddings should capture frequency patterns, temporal structure
   - Reference: perch-hoplite documentation, Williams et al. MARRS study

2. **Reef Health Acoustic Signatures**
   - Healthy reefs: higher biodiversity, more fish vocalizations, snapping shrimp
   - Degraded reefs: quieter, less diverse acoustic activity
   - Restored reefs: intermediate signatures, recovering biodiversity
   - Question: Do our embeddings reflect these expected patterns?

3. **Geographic Considerations**
   - Indonesia sites (ind_*) are all from same region (Sulawesi, ~119.3E, -4.9N)
   - Kenya site (ken_H1) is geographically distant (41E, -2.2N)
   - Should Indonesia sites be more similar to each other than to Kenya?
   - Or should health status dominate over geography?

4. **Sample Adequacy**
   - 30 recordings per site - is this sufficient for representative mean?
   - Check: standard deviation of embeddings within site (not available, but infer from mean stability)
   - MARRS has 1000-16000 recordings per site - are 30 representative?
</scientific_validation>

</analysis_requirements>

<output_format>
Create a comprehensive validation report:

Save to: `./docs/embedding_validation_report.md`

Structure:
```markdown
# MARRS Embedding Validation Report

## Executive Summary
[Pass/Fail assessment with key findings]

## Statistical Analysis

### Embedding Distributions
[Tables and findings]

### Inter-site Similarity Matrix
[4x4 cosine similarity matrix with interpretation]

### Dimensionality Health
[Analysis of embedding space usage]

## Scientific Validity

### Health Status Clustering
[Do embeddings align with reef health categories?]

### Geographic vs Health Patterns
[Which factor dominates similarity?]

### Alignment with Literature
[How do findings compare to expected bioacoustic patterns?]

## Recommendations

### Ready for Production?
[Yes/No with justification]

### Concerns or Caveats
[Any issues that should be documented]

### Suggestions for Improvement
[What would strengthen the reference dataset?]

## Raw Data
[Include computed metrics, matrices, etc.]
```
</output_format>

<implementation>
Use Python for numerical analysis. You may create a script or run inline calculations.

```python
# Key computations needed:
import json
import numpy as np

# Load embeddings
real = json.load(open('data/embeddings/real_embeddings.json'))
synthetic = json.load(open('data/embeddings/metadata.json'))

# Cosine similarity function
def cosine_sim(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# Compute pairwise similarity matrix
# Analyze distributions
# etc.
```

Do NOT modify any files except creating the report. This is analysis only.
</implementation>

<verification>
Before completing, verify:
- All 4 real embeddings analyzed
- Cosine similarity matrix computed and interpreted
- Statistical metrics (mean, std, range) reported
- Scientific validity assessment provided
- Clear recommendation on production readiness
- Report saved to docs/embedding_validation_report.md
</verification>

<success_criteria>
- Comprehensive statistical analysis with specific numbers
- Scientific interpretation connecting embeddings to reef biology
- Clear yes/no recommendation on production integration
- Actionable insights for next steps (more sites? different approach?)
- Report is self-contained and understandable without conversation context
</success_criteria>
