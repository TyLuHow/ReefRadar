<objective>
Train a classification head on top of SurfPerch embeddings to accurately classify coral reef health status.

This replaces the current cosine-similarity approach with a learned classifier that can:
1. Learn the decision boundary between healthy/degraded/restored
2. Handle within-site variance properly
3. Provide meaningful confidence scores
4. Generalize to new recordings

Budget: Training should cost under $5 (can run locally or on small EC2 spot)
</objective>

<context>
Read CLAUDE.md for project conventions.

Input (from prompt 016):
- Training dataset: s3://reefradar-2477-embeddings/training/training_dataset.json
- ~5,000-25,000 labeled 1280-dimensional embeddings
- 4 classes: healthy, degraded, restored_mid, restored_early

Current classification approach (to replace):
@lambdas/classifier/handler.py - Lines 170-240, classify_embedding() function

The classifier head will be:
- Input: 1280-dim SurfPerch embedding
- Output: 4-class probability distribution
- Architecture: Simple MLP (embeddings are already good features)
</context>

<research_phase>
Thoroughly analyze the best approach for this specific problem:

1. **Model architecture options**:
   - Simple logistic regression (baseline)
   - 2-layer MLP: 1280 → 256 → 4
   - 3-layer MLP: 1280 → 512 → 128 → 4
   - With/without dropout, batch norm

2. **Training considerations**:
   - Class imbalance handling (weighted loss or oversampling)
   - Train/validation/test split (stratified by site to prevent leakage)
   - Cross-validation across sites (leave-one-site-out for robust evaluation)

3. **Deployment format**:
   - PyTorch → ONNX for Lambda deployment (smaller, faster)
   - Or pure NumPy weights for minimal dependencies
   - Model size should be <10MB for Lambda cold start

4. **Evaluation metrics**:
   - Per-class precision, recall, F1
   - Confusion matrix
   - Calibration (are confidence scores meaningful?)
</research_phase>

<requirements>

1. **Training script** (`scripts/train_classifier.py`):
   - Load training data from S3 or local
   - Implement stratified train/val/test split (80/10/10)
   - Train MLP classifier with early stopping
   - Save best model checkpoint
   - Generate evaluation report

2. **Model architecture**:
   ```python
   class ReefClassifier(nn.Module):
       def __init__(self, input_dim=1280, num_classes=4):
           super().__init__()
           self.layers = nn.Sequential(
               nn.Linear(input_dim, 256),
               nn.ReLU(),
               nn.Dropout(0.3),
               nn.Linear(256, 64),
               nn.ReLU(),
               nn.Dropout(0.2),
               nn.Linear(64, num_classes)
           )

       def forward(self, x):
           return self.layers(x)
   ```

3. **Training configuration**:
   - Optimizer: Adam, lr=1e-3 with scheduler
   - Loss: CrossEntropyLoss with class weights
   - Epochs: 100 with early stopping (patience=10)
   - Batch size: 64

4. **Export for deployment**:
   - Save as ONNX for Lambda (or PyTorch if ONNX too complex)
   - Also save as pure NumPy weights (backup option)
   - Include label mapping and normalization params

5. **Evaluation report** (`docs/MODEL_EVALUATION.md`):
   - Overall accuracy
   - Per-class metrics
   - Confusion matrix (ASCII or save as image)
   - Example predictions with confidence
   - Comparison to old cosine-similarity baseline
</requirements>

<implementation>
Training can run:
- **Locally** (preferred if you have Python/PyTorch) - FREE
- **EC2 spot t3.medium** (~$0.01/hr) - if local not available
- **SageMaker** - overkill for this small dataset

The model is small (~1.3M parameters) and dataset is small (~25k samples).
Training should complete in <5 minutes on CPU.
</implementation>

<constraints>
- Model file must be <10MB (Lambda deployment)
- Must work with pure CPU inference (no GPU required)
- Training must complete in <30 minutes
- Use PyTorch or sklearn (common, well-supported)
- No exotic dependencies that would bloat Lambda
</constraints>

<output>
Create files:
- `scripts/train_classifier.py` - Training script
- `models/reef_classifier.onnx` - Trained model (or .pt)
- `models/reef_classifier_weights.npz` - NumPy backup
- `models/model_config.json` - Architecture, labels, normalization
- `docs/MODEL_EVALUATION.md` - Evaluation report

Upload to S3:
- `s3://reefradar-2477-embeddings/models/reef_classifier.onnx`
- `s3://reefradar-2477-embeddings/models/model_config.json`
</output>

<verification>
1. Test model loads correctly
2. Test inference on held-out test set
3. Verify accuracy >70% (should be achievable with good embeddings)
4. Verify confidence scores are calibrated (high confidence = usually correct)
5. Test on the specific ind_D2 sample that was misclassified earlier
</verification>

<success_criteria>
- Model trained successfully
- Test accuracy >70% overall
- Per-class F1 >0.6 for all classes
- Model exported and uploaded to S3
- Evaluation report documents performance
- The ind_D2 sample from earlier now classifies as "degraded"
</success_criteria>
</content>
</invoke>