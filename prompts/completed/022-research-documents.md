<objective>
Create comprehensive research documents capturing key findings, architectural decisions, and scientific validity assessments for the ReefRadar project.

These documents serve as persistent, reusable knowledge for future development, portfolio presentation, and potential academic/scientific review.
</objective>

<context>
Read CLAUDE.md for project conventions.

Key information sources within the project:
@ARCHITECTURE.md - Current architecture documentation
@lambdas/classifier/handler.py - ML classification implementation
@infrastructure/lambda_container/inference.py - SurfPerch integration
@docs/MODEL_EVALUATION.md - Classifier training results
@prompts/010-research-fix-ml-inference.md - ML research notes
@prompts/012-generate-marrs-embeddings.md - MARRS dataset details

External sources to reference:
- SurfPerch: Kaggle model google-research-datasets/surfperch
- MARRS Dataset: UCL Figshare DOI 10.5522/04/29958062
- perch-hoplite: GitHub google-research/perch
- Passive Acoustic Monitoring (PAM) literature
</context>

<requirements>

1. **ML_RESEARCH.md** - Machine Learning Implementation:
   - SurfPerch model specifications (input format, output dimensions, sample rate)
   - perch-hoplite library usage and integration details
   - Lambda container deployment approach
   - Model performance characteristics (inference time, memory usage)
   - Comparison of deployment options (SageMaker vs Lambda container)
   - Links to original model sources and documentation

2. **SCIENTIFIC_VALIDITY.md** - Scientific Assessment:
   - Overview of Passive Acoustic Monitoring (PAM) for reef health
   - Limitations and caveats of acoustic-based classification
   - What the classification actually measures vs what users might assume
   - The MARRS dataset: source, methodology, geographic coverage
   - Comparison to other reef health assessment methods
   - Appropriate use cases and inappropriate extrapolations
   - Relevant academic citations (Williams et al., etc.)

3. **ARCHITECTURE_DECISIONS.md** - Technical Choices:
   - Why serverless Lambda vs traditional EC2/ECS
   - SageMaker endpoint elimination (cost savings analysis)
   - Async processing pattern with polling vs WebSocket
   - S3-based payload passing for large audio data
   - DynamoDB schema design decisions
   - Container Lambda for ML inference rationale
   - Cost optimization strategies applied

Each document should include:
- Clear section headers
- Hyperlinked sources (not just text citations)
- Code snippets where relevant
- Diagrams described in text (can reference mermaid from next prompt)
</requirements>

<implementation>
Document structure template:
```markdown
# [Title]

**Last Updated:** [Date]
**Author:** AI-assisted research compilation

## Overview
[Brief summary of what this document covers]

## [Section 1]
[Content with inline citations]

### [Subsection]
[Detailed content]

## References
- [Source Name](URL) - Brief description
```

Research approach:
1. Extract information from existing project files
2. Synthesize into coherent narratives
3. Add context from known external sources
4. Include honest assessments of limitations
</implementation>

<constraints>
- Only cite sources that actually exist and are accessible
- Clearly distinguish between verified facts and assumptions
- Don't overstate the scientific rigor of the implementation
- Keep documents focused and readable (not exhaustive literature reviews)
</constraints>

<output>
Create files in docs/:
- `./docs/ML_RESEARCH.md` - ML implementation research
- `./docs/SCIENTIFIC_VALIDITY.md` - Scientific assessment
- `./docs/ARCHITECTURE_DECISIONS.md` - Technical decisions

Each document should be 500-1500 words, well-structured with headers.
</output>

<verification>
1. All hyperlinks are valid URLs
2. Technical details match actual implementation
3. Caveats are clearly stated
4. Documents are self-contained and readable independently
5. No fabricated citations or sources
</verification>

<success_criteria>
- Three comprehensive research documents created
- Each document has clear structure with headers
- External sources are hyperlinked
- Technical accuracy verified against codebase
- Limitations and caveats honestly presented
- Documents suitable for portfolio or technical review
</success_criteria>
