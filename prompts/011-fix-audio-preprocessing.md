<objective>
Fix the audio preprocessing parameters in the ReefRadar preprocessor Lambda to match SurfPerch model requirements. The current parameters are wrong, producing incompatible audio segments.

This must be done after ML inference is working (prompt 010) so you can verify the output is correct.
</objective>

<context>
ReefRadar preprocesses uploaded audio before classification. The current parameters are incorrect:

**Current (WRONG):**
- Sample rate: 32 kHz
- Segment length: 5 seconds
- Samples per segment: 160,000

**Required (SurfPerch spec):**
- Sample rate: 16 kHz (model was trained on this)
- Segment length: 1.88 seconds (exact model window)
- Samples per segment: 30,080 (16000 * 1.88)

Examine these files:
@lambdas/preprocessor/handler.py - Current preprocessing code
@docs/ML_RESEARCH.md - Research from prompt 010 (confirms correct params)
</context>

<requirements>
1. **Update preprocessing parameters**
   ```python
   TARGET_SAMPLE_RATE = 16000  # Changed from 32000
   SEGMENT_DURATION = 1.88    # Changed from 5.0
   SEGMENT_SAMPLES = 30080    # Changed from 160000
   ```

2. **Audio conversion pipeline**
   - Accept WAV files (required), MP3 if possible (nice-to-have)
   - Convert to mono (average channels if stereo)
   - Resample to 16 kHz using proper interpolation
   - Normalize to float32 in range [-1.0, 1.0]
   - Segment into non-overlapping 1.88s chunks

3. **Edge case handling**
   - Audio shorter than 1.88s: Return error with clear message
   - Audio with unusual sample rates: Resample gracefully
   - Corrupted files: Detect and return meaningful error
   - Very long audio (>10 min): Process in chunks, warn about cost

4. **Logging improvements**
   - Log input audio properties (sample rate, duration, channels)
   - Log conversion steps taken
   - Log output segment count and properties
</requirements>

<implementation>
Update `./lambdas/preprocessor/handler.py`:

```python
# Key changes needed:

# 1. Update constants
TARGET_SAMPLE_RATE = 16000
SEGMENT_DURATION = 1.88
SEGMENT_SAMPLES = 30080
MIN_DURATION = 1.88  # Minimum audio length

# 2. Improve resampling (use proper interpolation, not linear)
def resample_audio(samples, orig_rate, target_rate):
    """Resample using sinc interpolation for quality."""
    # numpy-based sinc interpolation or use scipy if available
    pass

# 3. Add duration validation
def validate_audio(duration):
    if duration < MIN_DURATION:
        raise AudioTooShortError(
            f"Audio must be at least {MIN_DURATION}s, got {duration:.2f}s"
        )
```

WHY these parameters matter:
- SurfPerch was trained on 16kHz audio - using 32kHz produces meaningless embeddings
- The 1.88s window is the model's receptive field - different lengths cause shape mismatches
- Proper resampling preserves audio quality; linear interpolation introduces artifacts
</implementation>

<output>
Modify these files:
- `./lambdas/preprocessor/handler.py` - Updated preprocessing
- `./lambdas/preprocessor/requirements.txt` - If new dependencies needed

Update documentation:
- `./API.md` - Update audio requirements section
- `./ARCHITECTURE.md` - Update preprocessing pipeline description
- `./README.md` - Update quick start with correct audio specs

Redeploy Lambda:
```bash
cd lambdas/preprocessor
zip -r function.zip handler.py
aws lambda update-function-code \
  --function-name reefradar-2477-preprocessor \
  --zip-file fileb://function.zip \
  --region us-east-1
```
</output>

<verification>
Before declaring complete:

1. **Unit test the preprocessing:**
   ```python
   # Test with known audio
   import numpy as np

   # Create 5 seconds of 44.1kHz stereo audio
   test_audio = np.random.randn(2, 44100 * 5).astype(np.float32)

   # After preprocessing should be:
   # - Mono (1 channel)
   # - 16kHz sample rate
   # - Multiple 30080-sample segments
   # - Float32 in [-1, 1]
   ```

2. **Integration test via API:**
   ```bash
   # Create proper test audio
   python3 -c "
   import numpy as np
   import struct
   sr = 16000
   dur = 5  # 5 seconds = 2 full segments + partial
   audio = (np.sin(2*np.pi*440*np.linspace(0,dur,sr*dur)) * 16000).astype(np.int16)
   with open('/tmp/test.wav', 'wb') as f:
       f.write(b'RIFF' + struct.pack('<I',36+len(audio)*2) + b'WAVE')
       f.write(b'fmt ' + struct.pack('<IHHIIHH',16,1,1,sr,sr*2,2,16))
       f.write(b'data' + struct.pack('<I',len(audio)*2) + audio.tobytes())
   "

   # Upload and verify segments
   curl -X POST https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/upload \
     -H "Content-Type: audio/wav" \
     --data-binary @/tmp/test.wav
   ```

3. **Verify error handling:**
   - Upload audio < 1.88s, confirm clear error message
   - Upload non-audio file, confirm rejection

4. **Check CloudWatch logs for proper logging**
</verification>

<success_criteria>
- Preprocessor outputs 30,080-sample segments at 16kHz
- Audio too short returns `AUDIO_TOO_SHORT` error with details
- Logs show conversion steps clearly
- End-to-end test produces real embeddings (not synthetic)
- Documentation updated with correct specs
</success_criteria>
