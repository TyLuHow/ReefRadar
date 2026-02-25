<research_objective>
Brainstorm and evaluate approaches for expanding ReefRadar's reference site embeddings from 6 to 45 using the complete MARRS coral reef acoustic dataset.

The goal is to identify the optimal strategy balancing:
- Data quality (real embeddings vs synthetic approximations)
- Cost efficiency (EC2 time, Lambda invocations, data transfer)
- Time to completion
- Classification improvement potential
</research_objective>

<current_state>
Current reference sites: 6 (with real SurfPerch embeddings)
- ind_H4, ind_H5 (healthy, Indonesia)
- ken_H1 (healthy, Kenya)
- ind_N1 (restored_early, Indonesia)
- ind_D2, ind_D3 (degraded, Indonesia)

Missing sites: 39 across 5 countries
- Indonesia: 16 sites (4 degraded, 4 healthy, 2 restored_early, 6 restored_mid)
- Australia: 7 sites (3 degraded, 3 healthy, 1 restored_mid)
- Mexico: 7 sites (2 degraded, 3 healthy, 1 restored_early, 1 restored_mid)
- Maldives: 5 sites (2 degraded, 2 healthy, 1 restored_early)
- Kenya: 4 sites (2 degraded, 1 healthy, 1 restored_early)

Key files:
- `data/embeddings/marrs_sites.json` - Complete site metadata (45 sites with coordinates)
- `scripts/generate_marrs_embeddings.py` - Script to process local audio files
- `scripts/add_restored_mid_and_retrain.py` - Example of synthetic audio approach
</current_state>

<approaches_to_evaluate>

<approach_1>
<name>EC2 Cloud-to-Cloud Pipeline (Real Audio)</name>
<description>
Launch EC2 instance that downloads MARRS audio from Figshare, processes through inference Lambda, generates real embeddings. Same approach used for initial 6 sites.
</description>
<evaluate>
- Estimated data download size per country
- EC2 instance type and estimated runtime
- Lambda invocation costs (39 sites x ~50 files x inference calls)
- Quality: Real SurfPerch embeddings from actual reef recordings
- Complexity: Moderate (infrastructure exists)
</evaluate>
</approach_1>

<approach_2>
<name>Representative Synthetic Audio (Real Embeddings)</name>
<description>
Generate synthetic audio that mimics each reef type's acoustic characteristics, then get real SurfPerch embeddings via inference Lambda. Similar to add_restored_mid_and_retrain.py approach.
</description>
<evaluate>
- Acoustic profile differences: healthy vs degraded vs restored reefs
- Embedding quality: Are synthetic-source embeddings meaningfully different?
- Cost: Only Lambda invocations, no data download
- Speed: Can be done in minutes
- Risk: May not capture true site-specific acoustic signatures
</evaluate>
</approach_2>

<approach_3>
<name>Hybrid Approach</name>
<description>
Use real audio for a subset of sites per country/status, synthetic for the rest. Prioritize sites that add geographic diversity.
</description>
<evaluate>
- Which sites add most value? (new countries vs more of same)
- Minimum viable coverage per classification category
- Cost vs quality tradeoff
</evaluate>
</approach_3>

<approach_4>
<name>Prioritized Subset</name>
<description>
Only expand to sites that provide maximum classification improvement - focus on underrepresented categories (restored_mid has few real samples) and new countries.
</description>
<evaluate>
- Current class distribution in training data
- Which additions would most improve classifier balance?
- Geographic diversity for visualization value
</evaluate>
</approach_4>

</approaches_to_evaluate>

<analysis_tasks>
1. Calculate estimated costs for each approach
2. Assess impact on classifier accuracy (current: 90.5% with 4 classes)
3. Consider visualization benefits (more sites on world map)
4. Identify any technical blockers or risks
5. Recommend a specific strategy with rationale
</analysis_tasks>

<output_format>
Produce a structured analysis with:

1. **Approach Comparison Table** - Cost, time, quality, complexity for each approach
2. **Recommended Strategy** - Which approach and why
3. **Implementation Plan** - Specific steps if we proceed
4. **Risk Assessment** - What could go wrong, mitigations

Save analysis to: `./docs/REFERENCE_SITE_EXPANSION_PLAN.md`
</output_format>

<constraints>
- Do NOT implement anything - this is research/planning only
- Consider the existing trained classifier (v2.0, 4 classes, 140 samples)
- Remember MARRS data source: Figshare DOI 10.5522/04/29958062
- Current inference Lambda: ~20s cold start, ~2s warm, $0.00002 per invocation
- EC2 t3.medium: ~$0.04/hour
</constraints>
