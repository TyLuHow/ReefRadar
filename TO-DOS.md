# TO-DOS

## Active Items


### Custom UI Instead of Streamlit - 2026-01-29

- **Replace Streamlit dashboard with custom web UI** - Build a more polished, custom frontend instead of using Streamlit. **Problem:** Streamlit is quick to prototype but has limited customization, generic appearance, and WSL2 networking issues. A custom solution would provide better UX, more design control, and easier deployment. **Files:** `dashboard/app.py:1-335`, `dashboard/requirements.txt`, `dashboard/start.sh`. **Solution:** Consider React/Next.js for rich interactivity, or vanilla HTML/CSS/JS for simplicity. Could deploy as static site on S3 + CloudFront, or use a lightweight framework like FastHTML.

### Enhanced Data Visualizations - 2026-01-29

- **Add map visualizations and richer data displays** - Create geographic maps showing reference site locations and more engaging ways to visualize acoustic analysis results. **Problem:** Current visualization is limited to a simple 2D scatter plot and probability bar chart. Lacks geographic context (where are these reefs?), temporal patterns, spectrograms, or interactive exploration. **Files:** `dashboard/app.py:180-280` (visualization section), `data/embeddings/metadata.json` (now has real coordinates), `lambdas/classifier/handler.py:484-513` (visualization data generation). **Solution:** Add world map with site markers (Leaflet/Mapbox), spectrograms of uploaded audio, interactive 3D embedding space, audio waveform displays. Reference sites now have real lat/lon coordinates from MARRS data.

### Create Research Documents for Claude Projects - 2026-01-30

- **Create exportable research documents with sources** - Generate markdown documents capturing key research findings, architectural decisions, and scientific validity assessments that can be imported into Claude Projects. **Problem:** Research conducted during development (SurfPerch model specs, MARRS dataset, coral reef acoustic monitoring literature) is scattered across conversation history and not easily reusable. Need persistent, sourced documents for future reference. **Files:** `docs/ML_RESEARCH.md` (to create), `docs/SCIENTIFIC_VALIDITY.md` (to create), `docs/ARCHITECTURE_DECISIONS.md` (to create). **Solution:** Create structured research docs with: (1) ML_RESEARCH.md - SurfPerch specs, deployment options, perch-hoplite usage; (2) SCIENTIFIC_VALIDITY.md - PAM limitations, acoustic index caveats, Williams et al. findings; (3) ARCHITECTURE_DECISIONS.md - Lambda vs SageMaker tradeoffs, preprocessing params, cost analysis. Include hyperlinked sources (Kaggle, Zenodo, arXiv, GitHub).

### Create AWS Architecture Diagram - 2026-01-30

- **Create AWS architecture diagram in Lucidchart or Miro** - Build visual diagrams showing current deployed architecture. **Problem:** No visual documentation of AWS infrastructure exists. Need diagrams for portfolio presentation and documentation. Current architecture includes API Gateway, multiple Lambda functions (router, preprocessor, classifier, inference container), S3 buckets, DynamoDB, and ECR. **Files:** `infrastructure/resources.json` (contains all ARNs), `ARCHITECTURE.md:1-200` (text description), `CLAUDE.md:70-100` (data flow description). **Note:** An ASCII diagram was added to the dashboard About tab; consider creating a proper Lucidchart/Miro version for portfolio use.

### Real Audio Integration & Reference Site Expansion - 2026-02-22

- **Replace all synthetic audio with real coral reef recordings and expand to 45 sites** - Two-part task: (1) Replace synthetic A/B demo audio with real recordings from ReefSet (CC-BY 4.0, Zenodo) and MARRS datasets. Remove SyntheticAudioGenerator.ts entirely. (2) Expand reference sites from 8 to all 45 MARRS sites across 5 countries. **Problem:** Current demo uses synthetically generated pink/brown noise that doesn't represent real reef sounds. Only 8 reference sites limits classification accuracy. **Data Sources:** ReefSet v1.0 (1.6 GB, 57K clips, Zenodo 11060189), MARRS Global (45 sites, Figshare DOI 10.5522/04/29958062), Hurricane Irma Florida Keys (CC0, Zenodo 4396323). **Part 1 Files:** `dashboard-next/src/components/audio/SyntheticAudioGenerator.ts` (DELETE), `dashboard-next/src/components/audio/AudioCompare.tsx`, `dashboard-next/public/audio/` (new real audio files), `dashboard-next/src/components/landing/SoundSection.tsx`. **Part 2 Files:** `data/embeddings/metadata.json` (8→45 sites), `lambdas/router/handler.py` (/sites endpoint), `lambdas/classifier/handler.py` (region detection for 5 countries), `scripts/generate_all_embeddings.py` (new). **Execution Order:** Download ReefSet → create demo MP3s → update dashboard → download MARRS metadata → download samples (30/site) → generate embeddings via Lambda → upload to S3 → update region detection → deploy Lambdas → test all. **Disk:** ~5-20 GB needed. **Success:** Real audio in /compare, 45 sites in /sites API, 5 countries, no "synthetic" warnings anywhere.

---

## Completed

### Train and Deploy Reef Health Classifier - 2026-02-03 ✓

- **COMPLETED 2026-02-03** - Trained MLP classifier on 100 MARRS samples achieving 90% test accuracy. Deployed to Lambda using pure NumPy inference (no PyTorch dependency). Model correctly classifies degraded, healthy, and restored_early reef sites. **Addressed by:** prompts 017-018, `scripts/train_classifier.py`, `lambdas/classifier/handler.py`. **Artifacts:** `models/reef_classifier_weights.npz`, `docs/MODEL_EVALUATION.md`.

### Cloud-to-Cloud MARRS Data Pipeline - 2026-02-01 ✓

- **COMPLETED 2026-02-02** - Built pipeline to transfer MARRS data directly to AWS without routing through local machine. Used EC2 instance to download from Figshare and upload to S3. Generated training embeddings (100 samples) and reference embeddings (6 validated sites). **Addressed by:** prompts 015-016, `scripts/generate_training_embeddings.py`, `scripts/marrs_cloud_transfer.py`

### Generate Initial MARRS Reference Embeddings - 2026-01-30 ✓

- **COMPLETED 2026-02-02** - Generated real SurfPerch embeddings for 6 MARRS sites (2 healthy, 2 degraded, 2 restored). Updated `metadata.json` to v2.0 format with real coordinates, country info, and 1280-dim embeddings. **Addressed by:** prompt 012 (partial), `data/embeddings/metadata.json`, training pipeline. **Note:** Expanded to 6 sites from original 8 synthetic sites; full 45-site expansion tracked separately above.
