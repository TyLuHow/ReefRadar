# Reference Site Expansion Plan: 6 to 45 Sites

**Date:** 2026-02-06
**Version:** 1.0
**Status:** Research/Planning Document

## Executive Summary

This document evaluates approaches for expanding ReefRadar's reference site embeddings from 6 to 45 using the complete MARRS coral reef acoustic dataset. The recommended strategy is a **Prioritized Hybrid Approach** that balances cost efficiency (~$3-5), quality (real SurfPerch embeddings), and classifier improvement potential.

---

## 1. Current State Analysis

### 1.1 Existing Reference Sites (6)

| Site ID | Country | Status | Recordings | Source |
|---------|---------|--------|------------|--------|
| ind_H4 | Indonesia | healthy | 30 | Real SurfPerch |
| ind_H5 | Indonesia | healthy | 30 | Real SurfPerch |
| ken_H1 | Kenya | healthy | 30 | Real SurfPerch |
| ind_N1 | Indonesia | restored_early | 30 | Real SurfPerch |
| ind_D2 | Indonesia | degraded | 30 | Real SurfPerch |
| ind_D3 | Indonesia | degraded | 30 | Real SurfPerch |

### 1.2 Current Classifier Performance
- **Model Version:** 2.0 (4-class)
- **Training Samples:** 140 total
- **Test Accuracy:** 90.5%
- **Classes:** healthy (35), degraded (35), restored_early (35), restored_mid (35)

### 1.3 Missing Sites Analysis (39 Total)

| Country | Total Sites | Missing | Status Distribution |
|---------|-------------|---------|---------------------|
| Indonesia | 20 | 14 | 4D, 4H, 2N (restored_early), 6R (restored_mid) |
| Australia | 7 | 7 | 3D, 3H, 1R |
| Mexico | 7 | 7 | 2D, 3H, 1N, 1R |
| Maldives | 5 | 5 | 2D, 2H, 1N |
| Kenya | 5 | 4 | 2D, 1H, 1N |

**Key Insight:** The missing sites provide significant geographic diversity (4 new countries!) and additional samples for the underrepresented `restored_mid` class.

### 1.4 MARRS Dataset Statistics

From `data/embeddings/marrs_sites.json`:

| Metric | Value |
|--------|-------|
| Total sites | 45 |
| Total audio files | ~500,000 |
| Average files/site | ~11,000 |
| File size | ~1.92 MB each (1-minute WAV, 16kHz) |
| Total dataset size | ~527 GB compressed, ~1 TB uncompressed |
| Figshare DOI | 10.5522/04/29958062 |

---

## 2. Approach Comparison

### 2.1 Approach Summary Table

| Approach | Cost | Time | Quality | Complexity | Classifier Impact |
|----------|------|------|---------|------------|-------------------|
| **EC2 Cloud-to-Cloud** | $3-5 | 2-4 hours | Excellent (real audio) | Moderate | High |
| **Synthetic Audio** | $0.10 | 30 minutes | Poor (approximation) | Low | Low/Negative |
| **Hybrid (Recommended)** | $2-4 | 1-2 hours | Good (strategic real) | Moderate | High |
| **Prioritized Subset** | $1-2 | 30-60 min | Good (focused real) | Low | Moderate |

### 2.2 Detailed Approach Analysis

---

#### Approach 1: EC2 Cloud-to-Cloud Pipeline (Real Audio)

**Description:** Launch EC2 spot instance to download MARRS audio from Figshare, process through inference Lambda, generate real embeddings for all 39 missing sites.

**Cost Breakdown:**
```
EC2 Spot (t3.small, 2-4 hrs):              $0.02 - $0.04
S3 Storage (16GB, 30 days):                $0.37
S3 PUT requests (~9,000):                  $0.05
Lambda Invocations (39 sites x 50 files):  $0.04
  - 1,950 invocations x $0.00002 = $0.04
Data Transfer (Figshare -> EC2): FREE
Data Transfer (EC2 -> S3): FREE
----------------------------------------------
TOTAL:                                     $0.48 - $0.50
```

**Time Estimate:**
- Figshare download: ~15 min/site (200 files sampled from ZIP)
- Lambda processing: ~2s/segment warm, ~20s cold start
- Total: 2-4 hours for 39 sites

**Pros:**
- Real SurfPerch embeddings from actual coral reef recordings
- Infrastructure already exists (`ec2_transfer_template.yaml`, `marrs_cloud_transfer.py`)
- Highest quality embeddings for classifier training
- Geographic acoustic diversity captured

**Cons:**
- Longer processing time
- Requires EC2 spot instance management
- Small risk of spot interruption (mitigated by self-termination)

**Quality Score: 10/10**

---

#### Approach 2: Synthetic Audio (Real Embeddings)

**Description:** Generate synthetic audio that mimics reef acoustic characteristics, then get real SurfPerch embeddings via inference Lambda.

**Implementation Reference:** `scripts/add_restored_mid_and_retrain.py`

**Cost Breakdown:**
```
Lambda Invocations (39 sites x 20 samples):  $0.016
S3 Storage (temporary):                      $0.001
----------------------------------------------
TOTAL:                                       ~$0.02
```

**Time Estimate:** 20-30 minutes

**Synthetic Audio Characteristics by Status:**
```python
# From add_restored_mid_and_retrain.py - generate_synthetic_audio()
# Healthy: High biophonic activity (fish, snapping shrimp, coral)
#   - 200-800 Hz: Strong fish sounds
#   - 1-4 kHz: High biological sounds
#   - High click density (snapping shrimp)

# Degraded: Low biophonic activity
#   - Reduced fish sounds
#   - Minimal snapping shrimp
#   - More background noise dominance

# Restored (early/mid): Intermediate characteristics
#   - Moderate fish sounds
#   - Some snapping shrimp recovery
#   - Transitional acoustic signature
```

**Pros:**
- Very fast and cheap
- No external dependencies
- Good for proof-of-concept

**Cons:**
- **Does NOT capture site-specific acoustic signatures**
- Synthetic audio lacks real-world complexity (weather, boat noise, diurnal patterns)
- SurfPerch designed for real audio patterns
- May degrade classifier accuracy by introducing artificial patterns
- All sites of same status would have similar embeddings

**Quality Score: 3/10** - Not recommended for production

---

#### Approach 3: Hybrid Approach (Recommended)

**Description:** Use real audio for strategic sites that maximize geographic and class diversity, skip redundant sites (e.g., multiple Indonesia degraded sites when we already have 2).

**Site Selection Strategy:**
```
MUST HAVE (Real Audio) - New Countries:
  Australia: aus_H1, aus_D1, aus_R1 (3 sites)
  Mexico: mex_H1, mex_D1, mex_R1, mex_N1 (4 sites)
  Maldives: mal_H1, mal_D1, mal_N1 (3 sites)
  Kenya: ken_D1, ken_N1 (2 sites - H1 already done)

SHOULD HAVE (Real Audio) - Class Balance:
  Indonesia restored_mid: ind_R1, ind_R2, ind_R3 (3 sites)

OPTIONAL (Skip or synthetic):
  Additional Indonesia D/H sites (already well-represented)
  Redundant same-country same-status sites

TOTAL: 15 priority sites with real audio
```

**Cost Breakdown:**
```
EC2 Spot (t3.small, 1-1.5 hrs):            $0.01 - $0.02
S3 Storage (8GB, 30 days):                 $0.18
S3 PUT requests (~4,500):                  $0.02
Lambda Invocations (15 sites x 50 files):  $0.015
----------------------------------------------
TOTAL:                                     ~$0.22 - $0.24
```

**Time Estimate:** 45-90 minutes

**Pros:**
- Maximum classifier improvement per dollar
- Adds 4 new countries (huge visualization value)
- Fills class gaps (restored_mid underrepresented)
- Faster than full transfer
- Real embeddings for all strategic sites

**Cons:**
- Some sites remain without embeddings
- Requires manual site selection

**Quality Score: 8/10**

---

#### Approach 4: Prioritized Subset

**Description:** Focus only on sites that provide maximum classifier improvement - new countries and underrepresented classes.

**Minimum Viable Selection (10 sites):**
```
New Countries (1 each status):
  Australia: aus_H1, aus_D1 (2)
  Mexico: mex_H1, mex_D1 (2)
  Maldives: mal_H1, mal_D1 (2)

Class Balance:
  Indonesia restored_mid: ind_R1, ind_R2 (2)

Kenya (complete coverage):
  ken_D1, ken_N1 (2)
```

**Cost Breakdown:**
```
EC2 Spot (t3.small, 30-45 min):           $0.01
S3 Storage (4GB, 30 days):                $0.09
S3 PUT requests (~2,500):                 $0.01
Lambda Invocations (10 sites x 50 files): $0.01
----------------------------------------------
TOTAL:                                    ~$0.12
```

**Time Estimate:** 30-45 minutes

**Pros:**
- Fastest implementation
- Lowest cost
- Addresses key classifier gaps

**Cons:**
- Limited geographic coverage
- Fewer visualization points

**Quality Score: 7/10**

---

## 3. Recommended Strategy

### 3.1 Primary Recommendation: Hybrid Approach

**Execute in two phases:**

#### Phase 1: Priority Sites (Week 1)
Process 15 strategic sites covering all countries and key status categories.

**Sites:**
1. Australia: aus_H1, aus_D1, aus_R1
2. Mexico: mex_H1, mex_D1, mex_R1, mex_N1
3. Maldives: mal_H1, mal_D1, mal_N1
4. Kenya: ken_D1, ken_N1
5. Indonesia: ind_R1, ind_R2, ind_R3

**Expected Outcomes:**
- Reference sites: 6 -> 21
- Countries represented: 2 -> 5
- Classifier training data: +300 samples (15 sites x 20 samples)
- Estimated accuracy improvement: +2-4% (from geographic diversity)

#### Phase 2: Optional Expansion (Week 2+)
If Phase 1 shows classifier improvement, expand to remaining sites.

**Remaining 24 sites:** Lower priority, mostly Indonesia redundant sites

### 3.2 Decision Matrix

| Factor | Weight | EC2 Full | Synthetic | Hybrid | Subset |
|--------|--------|----------|-----------|--------|--------|
| Cost | 15% | 7 | 10 | 9 | 10 |
| Time | 10% | 5 | 10 | 8 | 9 |
| Quality | 35% | 10 | 3 | 8 | 7 |
| Classifier Impact | 25% | 9 | 2 | 9 | 7 |
| Visualization Value | 15% | 10 | 5 | 9 | 6 |
| **WEIGHTED SCORE** | **100%** | **8.5** | **4.7** | **8.6** | **7.3** |

**Winner: Hybrid Approach (8.6/10)**

---

## 4. Implementation Plan

### 4.1 Prerequisites
- [ ] Verify inference Lambda is deployed and functional
- [ ] Ensure S3 buckets have sufficient permissions
- [ ] Review AWS account limits for EC2 spot instances

### 4.2 Phase 1 Implementation Steps

```bash
# Step 1: Deploy CloudFormation stack (if not already done)
aws cloudformation create-stack \
  --stack-name reefradar-marrs-transfer \
  --template-body file://infrastructure/ec2_transfer_template.yaml \
  --capabilities CAPABILITY_IAM \
  --parameters ParameterKey=SamplesPerSite,ParameterValue=200

# Step 2: Modify marrs_cloud_transfer.py to process only priority sites
# Edit PRIORITY_SITES list in script

# Step 3: Launch transfer
./scripts/launch_transfer.sh

# Step 4: Monitor progress
aws s3 ls s3://reefradar-2477-marrs-raw/sites/ --recursive | wc -l

# Step 5: Generate embeddings
python scripts/generate_marrs_embeddings.py \
  --sites aus_H1 aus_D1 aus_R1 mex_H1 mex_D1 mex_R1 mex_N1 \
          mal_H1 mal_D1 mal_N1 ken_D1 ken_N1 ind_R1 ind_R2 ind_R3 \
  --audio-dir s3://reefradar-2477-marrs-raw/sites \
  --output data/embeddings/phase1_embeddings.json

# Step 6: Update metadata.json with new sites
python scripts/merge_embeddings.py

# Step 7: Retrain classifier
python scripts/train_classifier.py \
  --embeddings data/embeddings/metadata.json \
  --output models/reef_classifier_v3.npz
```

### 4.3 Verification Steps
1. Verify embedding dimensions (1280-dim for each site)
2. Calculate cosine similarity between new and existing embeddings
3. Run classifier evaluation on held-out test set
4. Compare accuracy before/after expansion

---

## 5. Risk Assessment

### 5.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Lambda cold starts causing timeouts | Medium | Low | Batch processing with delays |
| Spot instance interruption | Low | Medium | Self-termination, checkpoint files |
| S3 permission errors | Low | Low | Pre-verify IAM policies |
| Figshare rate limiting | Low | Medium | Implement backoff, respect limits |
| Embedding dimension mismatch | Low | High | Validate each batch |

### 5.2 Data Quality Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Corrupted audio files in MARRS | Low | Low | Skip and log errors |
| Empty sites (ken_D3 has 0 files) | Known | Low | Skip sites with <10 files |
| Biased sampling within sites | Medium | Medium | Random sampling, adequate sample size |

### 5.3 Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Classifier accuracy decreases | Low | High | A/B test before deploying |
| Cost overrun | Very Low | Low | CloudWatch alarm at $5 |
| Time overrun | Medium | Low | Phased approach allows stopping |

---

## 6. Success Metrics

### 6.1 Phase 1 Success Criteria
- [ ] 15+ new sites with real SurfPerch embeddings
- [ ] 5 countries represented in reference sites
- [ ] All 4 status categories have 3+ sites each
- [ ] Total cost < $1.00
- [ ] Classifier accuracy >= 90% (no regression)

### 6.2 Phase 2 Success Criteria (if pursued)
- [ ] 40+ total reference sites
- [ ] Classifier accuracy improvement of +2-5%
- [ ] Total cost < $5.00

---

## 7. Appendix

### 7.1 Complete Site Inventory

| Site ID | Country | Status | File Count | Priority |
|---------|---------|--------|------------|----------|
| ind_D6 | Indonesia | degraded | 15,231 | Low |
| ind_D3 | Indonesia | degraded | 15,650 | DONE |
| ind_D4 | Indonesia | degraded | 15,374 | Low |
| ind_D5 | Indonesia | degraded | 17,921 | Low |
| ind_D2 | Indonesia | degraded | 15,486 | DONE |
| ind_D1 | Indonesia | degraded | 15,768 | Low |
| ind_R6 | Indonesia | restored_mid | 16,047 | Medium |
| ind_R1 | Indonesia | restored_mid | 15,477 | **HIGH** |
| ind_R2 | Indonesia | restored_mid | 14,815 | **HIGH** |
| ind_R3 | Indonesia | restored_mid | 15,489 | **HIGH** |
| ind_R4 | Indonesia | restored_mid | 15,850 | Medium |
| ind_H3 | Indonesia | healthy | 16,980 | Low |
| ind_H5 | Indonesia | healthy | 3,372 | DONE |
| ind_H6 | Indonesia | healthy | 15,730 | Low |
| ind_H4 | Indonesia | healthy | 3,414 | DONE |
| ind_H2 | Indonesia | healthy | 15,941 | Low |
| ind_N3 | Indonesia | restored_early | 4,217 | Low |
| ind_N1 | Indonesia | restored_early | 4,063 | DONE |
| ind_H1 | Indonesia | healthy | 16,220 | Low |
| ind_R5 | Indonesia | restored_mid | 16,024 | Medium |
| ind_N2 | Indonesia | restored_early | 4,106 | Low |
| aus_H3 | Australia | healthy | 14,041 | Medium |
| aus_H2 | Australia | healthy | 12,630 | Medium |
| aus_H1 | Australia | healthy | 13,664 | **HIGH** |
| aus_R1 | Australia | restored_mid | 14,287 | **HIGH** |
| aus_D1 | Australia | degraded | 13,738 | **HIGH** |
| aus_D2 | Australia | degraded | 14,084 | Medium |
| aus_D3 | Australia | degraded | 14,058 | Medium |
| ken_H1 | Kenya | healthy | 1,060 | DONE |
| ken_H2 | Kenya | healthy | 12,269 | Medium |
| ken_D1 | Kenya | degraded | 4,675 | **HIGH** |
| ken_N1 | Kenya | restored_early | 11,954 | **HIGH** |
| ken_D3 | Kenya | degraded | 0 | SKIP |
| mal_H2 | Maldives | healthy | 11,562 | Medium |
| mal_H1 | Maldives | healthy | 11,594 | **HIGH** |
| mal_D1 | Maldives | degraded | 11,538 | **HIGH** |
| mal_D2 | Maldives | degraded | 10,953 | Medium |
| mal_N1 | Maldives | restored_early | 11,481 | **HIGH** |
| mex_D2 | Mexico | degraded | 11,158 | Medium |
| mex_N1 | Mexico | restored_early | 10,206 | **HIGH** |
| mex_H2 | Mexico | healthy | 9,986 | Medium |
| mex_R1 | Mexico | restored_mid | 10,434 | **HIGH** |
| mex_D1 | Mexico | degraded | 10,741 | **HIGH** |
| mex_H1 | Mexico | healthy | 10,794 | **HIGH** |
| mex_H3 | Mexico | healthy | 10,188 | Medium |

### 7.2 Class Distribution After Expansion

**Current (6 sites):**
```
healthy:        3 sites (50%)
degraded:       2 sites (33%)
restored_early: 1 site  (17%)
restored_mid:   0 sites (0%)
```

**After Phase 1 (21 sites):**
```
healthy:        7 sites (33%)
degraded:       6 sites (29%)
restored_early: 4 sites (19%)
restored_mid:   4 sites (19%)
```

**After Full Expansion (44 sites, excluding ken_D3):**
```
healthy:        13 sites (30%)
degraded:       13 sites (30%)
restored_early: 8 sites  (18%)
restored_mid:   10 sites (22%)
```

### 7.3 Cost Monitoring Commands

```bash
# Check current S3 usage
aws s3 ls s3://reefradar-2477-marrs-raw --recursive --summarize

# Check Lambda invocation count
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=reefradar-2477-inference \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 3600 \
  --statistics Sum

# Check EC2 spot instance status
aws ec2 describe-instances \
  --filters "Name=tag:Purpose,Values=marrs-transfer" \
  --query 'Reservations[*].Instances[*].[InstanceId,State.Name]'
```

---

## 8. Conclusion

The **Hybrid Approach** is recommended for expanding ReefRadar's reference sites. This strategy:

1. **Maximizes value per dollar** by focusing on sites that add geographic diversity and fill class gaps
2. **Uses real SurfPerch embeddings** to ensure classifier quality
3. **Adds 4 new countries** to the visualization map (huge user value)
4. **Completes in 1-2 hours** with minimal cost (~$0.25)
5. **Enables phased rollout** to validate impact before full commitment

The existing infrastructure (`ec2_transfer_template.yaml`, `marrs_cloud_transfer.py`, `generate_marrs_embeddings.py`) is ready to support this approach with minor modifications.

---

*Document generated: 2026-02-06*
*Author: Claude Code AI Assistant*
