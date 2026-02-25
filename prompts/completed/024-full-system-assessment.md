<objective>
Perform a comprehensive assessment of the entire ReefRadar system to verify all components are working as designed. This validates the complete stack after recent changes including the new React dashboard, map visualizations, trained classifier, and research documentation.

The assessment should identify any issues, verify integrations, and produce a detailed status report suitable for portfolio presentation.
</objective>

<context>
Read CLAUDE.md for project conventions.

System components to assess:

**Backend (AWS)**
- API Gateway: https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod
- Lambda Functions: router, preprocessor, classifier, inference (container)
- S3 Buckets: reefradar-2477-audio, reefradar-2477-embeddings
- DynamoDB: reefradar-2477-metadata

**Frontend**
- New React Dashboard: dashboard-next/
- Old Streamlit Dashboard: dashboard/ (deprecated but should still work)

**ML Pipeline**
- Trained classifier: s3://reefradar-2477-embeddings/models/reef_classifier_weights.npz
- Reference embeddings: s3://reefradar-2477-embeddings/reference/metadata.json
- Inference Lambda with SurfPerch model

**Documentation**
- docs/ML_RESEARCH.md
- docs/SCIENTIFIC_VALIDITY.md
- docs/ARCHITECTURE_DECISIONS.md
- docs/ARCHITECTURE_DIAGRAMS.md
- docs/PROJECT_STATUS.md
- docs/MODEL_EVALUATION.md
</context>

<assessment_requirements>

1. **API Health Check**
   - Test all endpoints: /health, /sites, /upload, /analyze, /visualize
   - Verify response formats match expected schemas
   - Check error handling for invalid inputs

2. **End-to-End Analysis Flow**
   - Upload a test WAV file (use data/marrs_audio if available, or generate synthetic)
   - Complete full analysis pipeline
   - Verify trained classifier returns meaningful results
   - Check that classification uses trained model (not similarity fallback)

3. **Lambda Function Status**
   - Verify all 4 Lambdas are deployed and active
   - Check memory/timeout configurations match design
   - Verify inference Lambda container is using latest image

4. **Data Integrity**
   - Verify reference embeddings exist in S3
   - Check metadata.json has correct site coordinates
   - Verify trained model weights are accessible

5. **Frontend Validation**
   - Check dashboard-next builds without errors
   - Verify package.json dependencies are correct
   - Test static export works (if possible)

6. **Documentation Review**
   - Verify all new docs exist and are well-formatted
   - Check Mermaid diagrams render (validate syntax)
   - Ensure links between documents work

7. **Cost Verification**
   - Confirm SageMaker endpoint is deleted
   - Verify no unexpected AWS resources running

</assessment_requirements>

<test_commands>
Run these commands to gather system state:

```bash
# API tests
curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health
curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites

# Lambda status (use --region us-east-1)
aws lambda list-functions --region us-east-1 --query "Functions[?starts_with(FunctionName, 'reefradar-2477')].{Name:FunctionName,State:State,Memory:MemorySize,Timeout:Timeout}" --output table

# S3 contents
aws s3 ls s3://reefradar-2477-embeddings/models/ --region us-east-1
aws s3 ls s3://reefradar-2477-embeddings/reference/ --region us-east-1

# SageMaker check (should be empty)
aws sagemaker list-endpoints --region us-east-1 --query "Endpoints[?starts_with(EndpointName, 'reefradar')]"

# Dashboard build test
cd dashboard-next && npm run build 2>&1 | tail -20

# Documentation files
ls -la docs/*.md
```
</test_commands>

<output>
Create a comprehensive assessment report:
`./docs/SYSTEM_ASSESSMENT.md`

Structure:
```markdown
# ReefRadar System Assessment

**Assessment Date:** [Date]
**Status:** [PASS/PARTIAL/FAIL]

## Executive Summary
[2-3 sentence overview of system health]

## Component Status

### Backend Services
| Component | Status | Details |
|-----------|--------|---------|
| API Gateway | ✅/⚠️/❌ | [notes] |
| Router Lambda | ✅/⚠️/❌ | [notes] |
| ...

### Frontend
[Status of dashboard-next]

### ML Pipeline
[Status of classifier, inference, embeddings]

### Documentation
[Status of all docs]

## Test Results

### API Endpoint Tests
[Results of each endpoint test]

### End-to-End Analysis Test
[Results of full pipeline test]

## Issues Found
[List any problems discovered]

## Recommendations
[Suggested fixes or improvements]

## Verification Checklist
- [ ] All API endpoints responding
- [ ] Full analysis pipeline works
- [ ] Trained classifier in use
- [ ] Dashboard builds successfully
- [ ] No orphaned AWS resources
- [ ] Documentation complete
```
</output>

<verification>
Before completing the assessment:
1. Every component has been tested (not just checked to exist)
2. At least one end-to-end analysis has been attempted
3. All issues are documented with specific details
4. Report is actionable (clear what needs fixing, if anything)
</verification>

<success_criteria>
- Comprehensive assessment report created at docs/SYSTEM_ASSESSMENT.md
- All major components tested and status documented
- End-to-end analysis flow verified
- Any issues clearly identified with severity
- Recommendations provided for any problems found
- Report suitable for portfolio/demo preparation
</success_criteria>
