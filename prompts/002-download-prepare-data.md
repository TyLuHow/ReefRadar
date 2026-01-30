<objective>
Download the SurfPerch model and MARRS dataset subset, then prepare reference embeddings for the ReefRadar system.

This phase sets up the ML model and training data that powers reef health classification. Pre-computing reference embeddings creates a cache so the API doesn't re-embed reference data on every call.
</objective>

<context>
Project: ReefRadar - Coral Reef Acoustic Health Analysis API
Phase: 2 of 8

Key Resources:
- SurfPerch Model: Pre-trained bioacoustic neural network (127.9 MB)
  - Source: Kaggle (google/surfperch) or Zenodo
  - License: Apache-2.0
  - Input: 16 kHz audio, 1.88-second segments
  - Output: 1280-dimensional embeddings

- MARRS Dataset: Coral reef soundscapes from global restoration program
  - Full size: ~1 TB (we'll use a subset)
  - Alternative: ReefSet (~2-5 GB, pre-labeled, recommended for MVP)
  - License: CC-BY 4.0

Project Structure to Create:
```
~/reef-project/
├── models/
│   └── surfperch/
├── data/
│   ├── marrs/
│   └── embeddings/
└── scripts/
    └── prepare_embeddings.py
```
</context>

<prerequisites>
Before starting:
1. Source AWS environment: `source ./config/aws-env.sh`
2. Python 3.11+ installed
3. For Kaggle download: kaggle CLI configured with API key in ~/.kaggle/kaggle.json
</prerequisites>

<implementation>

**Step 1: Create Project Directory Structure**
```bash
mkdir -p ~/reef-project/{models,data/marrs,data/embeddings,scripts}
cd ~/reef-project
```

**Step 2: Download SurfPerch Model**

Option A - From Kaggle (requires Kaggle account):
```bash
pip install kaggle
kaggle models download google/surfperch -p ./models/surfperch
```

Option B - From Zenodo (direct download, no account needed):
```bash
cd ~/reef-project/models
wget https://zenodo.org/record/10873580/files/surfperch.zip
unzip surfperch.zip
```

Verify model:
```bash
ls -lh ~/reef-project/models/surfperch/
# Should show ~127 MB of model files
```

**Step 3: Download Dataset (ReefSet Recommended for MVP)**
```bash
cd ~/reef-project/data/marrs

# ReefSet - smaller, pre-labeled dataset (~2-5 GB)
wget https://zenodo.org/record/10873580/files/ReefSet.zip
unzip ReefSet.zip
```

**Step 4: Install Python Dependencies**
```bash
pip install tensorflow>=2.13.0 librosa numpy
# Optional: Install perch library for more features
# pip install git+https://github.com/google-research/perch.git
```

**Step 5: Create Embedding Preparation Script**

Create `./scripts/prepare_embeddings.py`:
```python
"""
Pre-compute SurfPerch embeddings for reference sites.
Creates a cache so we don't re-embed reference data on every API call.
"""

import os
import json
import numpy as np
from pathlib import Path
import tensorflow as tf

def load_surfperch_model(model_path):
    """Load the SurfPerch model from local files."""
    model = tf.saved_model.load(model_path)
    return model

def load_audio(audio_path, sample_rate=16000):
    """Load audio file and resample to target rate."""
    import librosa
    audio, sr = librosa.load(audio_path, sr=sample_rate, mono=True)
    return audio

def embed_audio_file(model, audio_path, sample_rate=16000, segment_length=1.88):
    """
    Embed a single audio file using SurfPerch.
    Returns: numpy array of shape (num_segments, 1280)
    """
    audio = load_audio(audio_path, sample_rate)

    # Segment into 1.88-second windows (SurfPerch requirement)
    segment_samples = int(segment_length * sample_rate)
    num_segments = len(audio) // segment_samples

    if num_segments == 0:
        print(f"  Warning: Audio too short for segmentation")
        return None

    embeddings = []
    for i in range(num_segments):
        start = i * segment_samples
        end = start + segment_samples
        segment = audio[start:end]

        # Get embedding from model
        embedding = model.signatures['serving_default'](
            tf.constant(segment[np.newaxis, :], dtype=tf.float32)
        )['embedding'].numpy()

        embeddings.append(embedding[0])

    return np.array(embeddings)

def parse_filename(filename):
    """
    Parse MARRS-style filename for metadata.
    Format: country_site_YYYYMMDD_HHMMSS.wav
    Example: aus_D1_20230207_120400.wav
    """
    parts = Path(filename).stem.split('_')
    if len(parts) >= 2:
        country = parts[0]
        site = parts[1]
        # Site codes: H=Healthy, D=Degraded, R=Restored(early), M=Restored(mid)
        site_type = site[0] if site else 'U'
    else:
        country, site, site_type = 'unknown', 'unknown', 'U'

    return {
        'country': country,
        'site': site,
        'site_type': site_type
    }

def process_reference_sites(data_dir, model, output_dir):
    """Process all reference audio files and save embeddings."""
    data_path = Path(data_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    metadata = []
    wav_files = list(data_path.glob('**/*.wav'))

    print(f"Found {len(wav_files)} WAV files to process")

    for i, wav_file in enumerate(wav_files):
        print(f"Processing [{i+1}/{len(wav_files)}]: {wav_file.name}")

        file_info = parse_filename(wav_file.name)

        try:
            embeddings = embed_audio_file(model, str(wav_file))

            if embeddings is None:
                continue

            # Save embeddings as numpy file
            output_file = output_path / f"{wav_file.stem}.npy"
            np.save(output_file, embeddings)

            # Aggregate to single vector (mean pooling)
            mean_embedding = embeddings.mean(axis=0)

            metadata.append({
                'filename': wav_file.name,
                'site_id': f"{file_info['country']}_{file_info['site']}",
                'country': file_info['country'],
                'site_type': file_info['site_type'],
                'num_segments': len(embeddings),
                'embedding_file': output_file.name,
                'mean_embedding': mean_embedding.tolist()
            })

        except Exception as e:
            print(f"  Error: {e}")

    # Save metadata index
    with open(output_path / 'metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"\nProcessed {len(metadata)} files successfully")
    print(f"Embeddings saved to: {output_path}")
    return metadata

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Prepare SurfPerch embeddings')
    parser.add_argument('--model', default='./models/surfperch', help='Path to SurfPerch model')
    parser.add_argument('--data', default='./data/marrs', help='Path to audio data')
    parser.add_argument('--output', default='./data/embeddings', help='Output directory')
    args = parser.parse_args()

    print("Loading SurfPerch model...")
    model = load_surfperch_model(args.model)

    print("Processing reference sites...")
    process_reference_sites(args.data, model, args.output)
```

**Step 6: Run Embedding Preparation**
```bash
cd ~/reef-project
python scripts/prepare_embeddings.py \
  --model ./models/surfperch \
  --data ./data/marrs \
  --output ./data/embeddings
```

**Step 7: Upload Reference Data to S3**
```bash
source ~/.reefradar-env

# Upload pre-computed embeddings
aws s3 sync ~/reef-project/data/embeddings s3://${PROJECT_PREFIX}-embeddings/reference/

# Upload a small sample of raw audio for testing
aws s3 sync ~/reef-project/data/marrs s3://${PROJECT_PREFIX}-audio/reference/ \
  --exclude "*" --include "*.wav" --max-items 10
```
</implementation>

<output>
Files created:
- `~/reef-project/models/surfperch/` - SurfPerch model files
- `~/reef-project/data/marrs/` - Raw audio dataset
- `~/reef-project/data/embeddings/` - Pre-computed embeddings
- `~/reef-project/data/embeddings/metadata.json` - Embedding index
- `~/reef-project/scripts/prepare_embeddings.py` - Embedding script
</output>

<verification>
```bash
# Check model exists
ls -la ~/reef-project/models/surfperch/

# Check embeddings were created
ls ~/reef-project/data/embeddings/*.npy | wc -l
cat ~/reef-project/data/embeddings/metadata.json | head -50

# Check S3 uploads
aws s3 ls s3://${PROJECT_PREFIX}-embeddings/reference/
aws s3 ls s3://${PROJECT_PREFIX}-audio/reference/
```
</verification>

<success_criteria>
- [ ] SurfPerch model downloaded (~127 MB in models/surfperch/)
- [ ] ReefSet or MARRS subset downloaded to data/marrs/
- [ ] prepare_embeddings.py script created and executes without errors
- [ ] Embedding .npy files generated in data/embeddings/
- [ ] metadata.json created with embedding index
- [ ] Reference embeddings uploaded to S3
- [ ] Sample audio files uploaded to S3
</success_criteria>

<notes>
- Processing time depends on dataset size. ReefSet (~57K clips) may take several hours.
- For initial testing, process a small subset first (e.g., 100 files)
- If you encounter memory issues, process in batches
- The mean_embedding in metadata.json allows quick similarity searches without loading all embeddings
</notes>

<next_phase>
After completing this phase, proceed to Phase 3: Build Lambda Functions (prompts/003-build-lambda-functions.md)
</next_phase>
