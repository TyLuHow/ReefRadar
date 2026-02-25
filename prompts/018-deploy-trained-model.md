<objective>
Deploy the trained reef health classifier to replace the current cosine-similarity approach, integrating it into the existing Lambda infrastructure.

This completes the ML pipeline by putting the trained model into production, where it will provide accurate, meaningful classifications with proper confidence scores.

Budget: Deployment should add minimal ongoing cost (model is small, runs on existing Lambda)
</objective>

<context>
Read CLAUDE.md for project conventions.

Trained model (from prompt 017):
- `s3://reefradar-2477-embeddings/models/reef_classifier.onnx`
- `s3://reefradar-2477-embeddings/models/model_config.json`
- Input: 1280-dim embedding, Output: 4-class probabilities

Current classifier Lambda:
@lambdas/classifier/handler.py - Contains classify_embedding() using cosine similarity

Current inference Lambda:
@infrastructure/lambda_container/inference.py - Generates SurfPerch embeddings

Deployment options (evaluate which is best):
1. **Add classifier to inference Lambda container** - One Lambda does embedding + classification
2. **Keep separate** - Inference Lambda for embedding, classifier Lambda loads model from S3
3. **Embed in classifier Lambda** - Bundle small ONNX model directly
</context>

<research_phase>
Evaluate deployment architecture options:

1. **Option A: Bundle with inference Lambda (container)**
   - Pros: Single invocation, no network hop, container can hold model
   - Cons: Larger container, longer cold start, couples embedding + classification

2. **Option B: Load ONNX in classifier Lambda**
   - Pros: Separation of concerns, can update model without rebuilding container
   - Cons: Need ONNX runtime in Lambda, model download on cold start

3. **Option C: Pure NumPy classifier in Lambda**
   - Pros: No new dependencies, tiny model, fastest cold start
   - Cons: Manual implementation, no ONNX ecosystem benefits

Recommendation: Option C (NumPy) is likely best for this use case:
- Model is just matrix multiplications + ReLU
- Avoids ONNX runtime dependency
- Smallest possible Lambda size
- Easiest to understand and maintain
</research_phase>

<requirements>

1. **Update classifier Lambda** (`lambdas/classifier/handler.py`):
   - Remove old cosine-similarity classify_embedding() function
   - Add new classify_with_model() using trained weights
   - Load model weights from S3 on cold start (cache in /tmp)
   - Return proper probability distribution and confidence

2. **Model loading**:
   ```python
   def load_classifier_model():
       """Load trained classifier weights from S3."""
       # Check /tmp cache first
       cache_path = '/tmp/reef_classifier_weights.npz'
       if os.path.exists(cache_path):
           return np.load(cache_path)

       # Download from S3
       s3.download_file(
           EMBEDDINGS_BUCKET,
           'models/reef_classifier_weights.npz',
           cache_path
       )
       return np.load(cache_path)
   ```

3. **NumPy inference** (no PyTorch needed):
   ```python
   def classify_with_model(embedding):
       """Classify embedding using trained MLP weights."""
       weights = load_classifier_model()

       # Forward pass through MLP
       x = np.array(embedding)
       x = np.maximum(0, x @ weights['w1'] + weights['b1'])  # ReLU
       x = np.maximum(0, x @ weights['w2'] + weights['b2'])  # ReLU
       logits = x @ weights['w3'] + weights['b3']

       # Softmax for probabilities
       exp_logits = np.exp(logits - np.max(logits))
       probs = exp_logits / exp_logits.sum()

       labels = ['healthy', 'degraded', 'restored_mid', 'restored_early']
       pred_idx = np.argmax(probs)

       return {
           'label': labels[pred_idx],
           'confidence': float(probs[pred_idx]),
           'probabilities': {l: float(p) for l, p in zip(labels, probs)}
       }
   ```

4. **Update API response**:
   - Keep same response structure for backward compatibility
   - Add model version info to metadata
   - Update caveats to reflect trained model (remove similarity-based caveats)

5. **Update reference sites endpoint** (`/sites`):
   - Keep for visualization purposes
   - But classification no longer depends on reference embeddings
</requirements>

<implementation>
Steps:
1. Export PyTorch model weights to NumPy format (npz)
2. Upload weights to S3
3. Update classifier Lambda handler
4. Deploy updated Lambda
5. Test end-to-end
</implementation>

<constraints>
- Maintain API backward compatibility (same response structure)
- Lambda package size must stay under 50MB
- Cold start should remain under 5 seconds
- No new Lambda layers or dependencies (use existing NumPy)
</constraints>

<output>
Modify files:
- `lambdas/classifier/handler.py` - New classification logic
- `scripts/export_model_to_numpy.py` - Convert PyTorch to NumPy (if needed)

Deploy:
```bash
cd lambdas/classifier && zip -r function.zip handler.py
aws lambda update-function-code --function-name reefradar-2477-classifier --zip-file fileb://function.zip
```
</output>

<verification>
1. **Unit test**: Verify classify_with_model() produces valid output
2. **Integration test**: Full API flow with sample audio
3. **Accuracy test**: Re-test the ind_D2 sample - should now classify as "degraded"
4. **Cold start test**: Invoke Lambda after 15min idle, verify reasonable latency
5. **Comparison test**: Compare old vs new classification on 10 sample files
</verification>

<success_criteria>
- Classifier Lambda updated and deployed
- ind_D2 audio sample now classifies as "degraded" (not "healthy")
- Confidence scores are meaningful (high confidence = correct)
- API response structure unchanged (backward compatible)
- Cold start latency <10 seconds
- Model version visible in response metadata
</success_criteria>
</content>
</invoke>