# Driving Questions — Product-Owner Decisions

**Date:** 2026-09-30 · **Context:** `.planning/research/REDESIGN-THESIS.md`

| # | Question | Decision | Recommended was | Consequence for planning |
|---|---|---|---|---|
| Q1 | Primary audience | **Research instrument with a public front door** | same | Hold every number to scientist standard; landing still plays real reef audio within 5 s. |
| Q2 | Science depth this milestone | **Truth pass + retrain** | Truth pass, no retrain | ML track in scope: remove synthetic audio/class, verify deployed model, leave-one-site-out evaluation, model card, then retrain on real data (more sites, no synthetic, evaluate Perch 2.0 vs SurfPerch embeddings). Needs AWS compute. |
| Q3 | Data scope / time | **Large ingestion** | Targeted ingestion | Data-pipeline track in scope: MARRS timestamped series (~542k one-minute files, ~9,000 h) + sonotype detections (~66 GB) + Irma pre/post. Time becomes first-class: diel cycle, deployment effort, detection timelines, pre/post event. Requires cloud-to-cloud transfer, batch embedding, precomputed aggregates; timezone of MARRS filenames must be verified. |
| Q4 | Classifier role | **Evidence-first** | same | Upload = search: nearest playable references, per-window readings, probabilities secondary with explicit abstain; training coverage shown separately. |
| Q5 | Persistence | **URL permalinks + local saved investigations/notes/history, no accounts** | same | nuqs URL state; `/analyses/[id]` permalinks; IndexedDB/localStorage investigations; export carries context. |
| Q6 | Uploads | **Public with guardrails** | same | Presigned S3 upload, size/duration caps, per-IP rate limiting, budget alarm. |
| Q7 | Vitality / atmosphere layer | **Retire** | Opt-in listening mode | Remove vitality store, color engine, background canvas, decorative spectrogram, caustics/particles. Emotional weight carried by real audio, real spectrograms and the recovery ladder. Capability-matrix rows CAP-25, 47, 76–80, 83–84 become `retire` with this decision as justification (CAP-81 reduced-motion and CAP-82 mobile gating principles carry over to remaining canvases). |
| Q8 | Visual character | **Light scientific-editorial** | Dark instrument + light reading | Light, paper-like editorial system throughout (Climate Central / VACS lineage); spectrograms and waveform views render in dark "wells" for colour-scale range. Thesis §6 "dark-first" is superseded. Dark theme not required this milestone (tokens should not preclude it). |
| Q9 | Where backend/AWS work runs | **This machine, autonomously** — owner will provide Vercel/AWS/GitHub access and any tooling | — | Installed 2026-09-30 (user scope): Vercel CLI 62, GitHub CLI 2.102, ffmpeg 9, uv 0.12, AWS CLI v1 (`py -3.12 -m awscli`), boto3/numpy/scipy/soundfile/pandas/pyarrow. Pending owner: logins/credentials, AWS CLI v2 (needs admin), spend ceiling for ingestion. |

## Thesis amendments implied

- §2 product model unchanged; the classifier now has a real retraining track behind it.
- §4 Time: diel cycle, deployment effort and detection timelines move from "conditional" to **in scope**; the unified timebar becomes meaningful at site level (calendar + time-of-day), alongside the within-recording playhead.
- §4 Lenses: add **Sonotype detections** (MARRS's 15 sound types) as the scientifically grounded biological-guild lens; **diel phase** as a lens.
- §6 Visual direction: replace with light scientific-editorial (see Q8).
- §8 Tech: data volume rises from ~300 KB to precomputed aggregates over ~9,000 h — still serve **precomputed aggregates** (per-site × hour-of-day × day, per-detection-class counts, embedding summaries) as static/CDN data or small query endpoints; raw audio streamed per clip on demand. Re-evaluate DuckDB-WASM/Parquet for the aggregate layer during data-contract research.
- §10 Roadmap: add parallel **Data & Model track** (ingestion → embedding/detections → evaluation → retrain → publish versioned dataset/model) feeding the UI tracks; UI phases consume a versioned data contract so they are not blocked on ingestion.

## Budget decision (2026-09-30)

| # | Question | Decision | Consequence for planning |
|---|---|---|---|
| Q10 | AWS spend ceiling | **$25 (interpreted as monthly; owner to correct if total)** | AWS Budget alarm + automated stop action at $25/month before any batch job. Large ingestion (Q3) is redesigned as **stream-process-discard**: figshare files are streamed, windowed, embedded and aggregated without persisting the ~1 TB raw archive; only embeddings (float16), detections, aggregates and curated listening clips are stored (~16–33 GB, ≈$1/month). Embedding runs on Spot capacity only after a pilot shard measures cost; if projected compute exceeds the remaining monthly budget, ingestion is sharded across months or sub-sampled (stratified by site × hour-of-day) with the sampling disclosed. |
