<research_objective>
Research the SurfPerch model architecture and determine the best approach to get real ML inference working for ReefRadar. The current SageMaker endpoint fails with XLA compilation errors, and the system falls back to synthetic embeddings.

This is a BLOCKING issue - all other remediation depends on getting real inference working.
</research_objective>

<context>
ReefRadar is a coral reef acoustic health analysis system on AWS. The infrastructure works, but classification uses fake embeddings because:

1. SurfPerch model was saved with XLA JIT compilation enabled
2. TensorFlow Serving on SageMaker doesn't support XLA-compiled models
3. Error: `XLA compilation disabled [[{{function_node __inference_signature_wrapper_21994}}]]`

Current cost: SageMaker ml.m5.large = $83/month (unacceptable for student budget)

Examine these files:
@lambdas/classifier/handler.py - Current fallback logic
@infrastructure/resources.json - Current AWS resources
@COSTS.md - Budget constraints
</context>

<research_tasks>
Thoroughly research each of the following before implementing:

1. **SurfPerch Model Architecture**
   - Visit https://www.kaggle.com/models/google/surfperch
   - What is the exact input tensor shape expected?
   - What preprocessing does it expect (PCEN? raw waveform? mel spectrogram?)
   - What is the output embedding dimension?
   - How is the model packaged (SavedModel, TFHub, checkpoint)?

2. **Deployment Options** (evaluate all, recommend one)

   Option A: Re-export model without XLA
   - Can the model be loaded and re-saved without XLA?
   - Does this require the original training code?

   Option B: Lambda container inference (RECOMMENDED for cost)
   - Lambda containers can be up to 10GB, model is ~127MB
   - TensorFlow Lite or full TensorFlow?
   - Cold start implications?

   Option C: SageMaker Serverless Inference
   - Pay per request instead of 24/7
   - Does it have the same XLA issue?

   Option D: Use google-research/perch directly
   - https://github.com/google-research/perch
   - Does it have inference utilities we can use?
   - Can we run it in Lambda?

3. **Existing Implementations**
   - Search for SurfPerch REST API implementations
   - Check CoralSoundExplorer's approach
   - Look for community solutions to the XLA issue

4. **Alternative Models** (if SurfPerch proves intractable)
   - BirdNET - cross-domain transfer possibility?
   - Perch base model vs SurfPerch
   - Lighter-weight alternatives for Lambda?
</research_tasks>

<implementation>
After research, implement the chosen solution:

1. **If Lambda container chosen:**
   - Create `./infrastructure/lambda_container/Dockerfile`
   - Create `./infrastructure/lambda_container/inference.py`
   - Create `./scripts/deploy_lambda_container.sh`
   - Update `lambdas/classifier/handler.py` to call container

2. **If SageMaker Serverless chosen:**
   - Re-export model without XLA
   - Update endpoint configuration
   - Update classifier to use serverless endpoint

3. **Document your findings:**
   - Create `./docs/ML_RESEARCH.md` with research results
   - Update `./ARCHITECTURE.md` with new inference approach
   - Update `./COSTS.md` with new cost projections
</implementation>

<constraints>
- Student AWS budget: ~$100-200 total for semester
- Monthly cost target: under $20
- Lambda container limit: 10GB image size
- SurfPerch model: ~127MB
- Prefer solutions with no always-on compute
</constraints>

<output>
Save research findings to: `./docs/ML_RESEARCH.md`

Modify/create implementation files based on chosen approach:
- Infrastructure files in `./infrastructure/`
- Deployment scripts in `./scripts/`
- Updated Lambda code in `./lambdas/`

Update documentation:
- `./ARCHITECTURE.md`
- `./COSTS.md`
- `./README.md`
</output>

<verification>
Before declaring complete:

1. Research documented with sources cited
2. Decision rationale clearly explained
3. Implementation deployed and testable
4. Can generate a real embedding from a test audio file:
   ```bash
   # Test with a simple audio file
   python3 -c "
   import numpy as np
   # Create test audio: 2 seconds at 16kHz
   audio = np.random.randn(32000).astype(np.float32)
   # Call your inference endpoint/function
   # Should return 1280-dim embedding, NOT synthetic
   "
   ```
5. Cost projections updated
6. No synthetic fallback in the production code path
</verification>

<success_criteria>
- Real SurfPerch embeddings generated from audio input
- Inference latency under 5 seconds for a 10-second audio clip
- Monthly cost projection under $20
- Clear documentation of approach and rationale
- No XLA errors
</success_criteria>
