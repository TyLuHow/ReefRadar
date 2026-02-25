<objective>
Provide a comprehensive analysis of the current classifier metrics and create a scaling guide for the ReefRadar system. This covers both ML model performance and infrastructure scaling strategies.

This analysis will inform decisions about improving accuracy, expanding to more reference sites, and handling increased traffic.
</objective>

<context>
Read CLAUDE.md for project conventions.

Current classifier details:
@docs/MODEL_EVALUATION.md - Training results and metrics
@models/model_config.json - Model configuration
@lambdas/classifier/handler.py - Classification implementation

Training data:
@data/training/training_test_20.json - Training dataset (100 samples)

Infrastructure:
@infrastructure/resources.json - AWS resource configurations
@docs/ARCHITECTURE_DECISIONS.md - Cost and scaling decisions
@docs/PROJECT_STATUS.md - Current system state
</context>

<analysis_requirements>

## Part 1: Current Classifier Metrics

1. **Model Performance Metrics**
   - Overall accuracy (test set)
   - Per-class precision, recall, F1-score
   - Confusion matrix analysis
   - Confidence calibration (high confidence = correct?)

2. **Training Data Analysis**
   - Sample count per class
   - Class balance/imbalance
   - Geographic distribution of training samples
   - Temporal coverage of recordings

3. **Inference Performance**
   - Cold start latency
   - Warm invocation latency
   - Memory usage
   - Embedding generation time vs classification time

4. **Model Limitations**
   - Classes not represented (restored_mid missing)
   - Geographic bias (mostly Indonesia)
   - Temporal bias (single time period?)

## Part 2: Scaling Strategies

1. **Data Scaling**
   - How to expand from 100 to 1000+ training samples
   - Processing full MARRS dataset (45 sites, ~500k recordings)
   - Batch embedding generation pipeline
   - Estimated costs for full dataset processing

2. **Model Scaling**
   - Retraining with more data
   - Adding new classes (restored_mid, other categories)
   - Cross-validation approaches for robust evaluation
   - Transfer learning options

3. **Infrastructure Scaling**
   - Lambda concurrency limits and provisioned concurrency
   - API Gateway throttling configuration
   - S3 transfer acceleration for large uploads
   - Cost projections at different usage levels

4. **Geographic Scaling**
   - Adding sites from new regions
   - Handling audio from different recording equipment
   - Calibration for regional acoustic differences

</analysis_requirements>

<output>
Create a comprehensive report:
`./docs/CLASSIFIER_METRICS_AND_SCALING.md`

Structure:
```markdown
# ReefRadar Classifier Metrics & Scaling Guide

## Current Performance

### Model Metrics
[Detailed metrics with tables]

### Confusion Matrix
[Visual representation]

### Confidence Analysis
[Calibration analysis]

## Scaling Roadmap

### Phase 1: Data Expansion (Low Cost)
[Steps to expand training data]

### Phase 2: Model Improvement (Medium Effort)
[Retraining and validation strategies]

### Phase 3: Infrastructure Scaling (As Needed)
[Capacity planning and costs]

## Cost Projections
[Tables showing cost at different scales]

## Recommendations
[Prioritized action items]
```
</output>

<verification>
1. All current metrics are documented with sources
2. Scaling strategies include cost estimates
3. Recommendations are actionable and prioritized
4. Report is suitable for planning future development
</verification>

<success_criteria>
- Complete current metrics documented
- Clear scaling path from 100 to 10,000+ samples
- Cost projections for each scaling phase
- Prioritized recommendations
- Actionable next steps identified
</success_criteria>
