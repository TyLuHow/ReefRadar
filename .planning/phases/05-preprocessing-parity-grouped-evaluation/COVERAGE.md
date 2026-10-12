# API Coverage — Phase 5 (ReefRadar API, figshare, Kaggle model pin, AWS)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
> The api-coverage detector did not fire for this phase's scope (2026-10-12). This record lists every service surface the Phase 5 plans touch so the decisions are on file: the ReefRadar API (live verification and the additive /visualize keys), the public MARRS figshare article (range reads for re-embedding), the Kaggle SurfPerch model (pinned and hash-checked, never called at runtime), and the AWS services the Lambdas, offline jobs and publishers use. /visualize keeps its legacy keys and adds windows, site_similarities, projection, ood and input_audio.

| capability | decision | reason |
|---|---|---|
| ReefRadar POST /upload | INTEGRATE | |
| ReefRadar POST /analyze | INTEGRATE | |
| ReefRadar GET /status/{id} | INTEGRATE | |
| ReefRadar GET /visualize/{id} (legacy keys plus additive per-window keys) | INTEGRATE | |
| ReefRadar GET /results/{id} (alias of /visualize) | INTEGRATE | |
| ReefRadar GET /sites (provenance check in verify_live_truth) | INTEGRATE | |
| ReefRadar GET /samples (real-audio check in verify_live_truth) | INTEGRATE | |
| ReefRadar GET /health | OPT-OUT | not needed — deploy verification runs full serial analyses, which subsume a health ping |
| figshare list files of article 29958062 | INTEGRATE | |
| figshare HTTP range reads of site zips (central directory, single entries) | INTEGRATE | |
| figshare full zip download | OPT-OUT | explicitly avoided — range reads fetch about 192 MB instead of 1-14 GB per site zip |
| figshare authenticated endpoints and uploads | OPT-OUT | not needed — the dataset is public, read-only, CC BY 4.0 |
| Kaggle download of pinned handle google/surfperch/tensorFlow2/1/1 | INTEGRATE | |
| Kaggle handle change inside the inference Lambda | OPT-OUT | explicitly out of scope — the inference container is not rebuilt in Phase 5 (deferred-items.md) |
| S3 GetObject including ranged reads | INTEGRATE | |
| S3 HeadObject (segment byte length, live model hashes) | INTEGRATE | |
| S3 PutObject (segments, sidecars, playback copy, embeddings, temp batches) | INTEGRATE | |
| S3 PutObject create-only with If-None-Match (contract v2, models/archive/) | INTEGRATE | |
| S3 DeleteObject (temp inference batches only) | INTEGRATE | |
| S3 presigned or multipart uploads | OPT-OUT | not needed yet — guarded public upload is Phase 10 |
| DynamoDB PutItem (conditional), GetItem, UpdateItem, DeleteItem | INTEGRATE | |
| DynamoDB transactions or streams | OPT-OUT | not needed — one RESULT or ERROR item per analysis with conditional writes |
| Lambda Invoke Event and RequestResponse | INTEGRATE | |
| Lambda UpdateFunctionCode via scripts/deploy-lambdas.py | INTEGRATE | |
| Lambda GetFunction and GetFunctionConfiguration (drift-check, state) | INTEGRATE | |
| Lambda configuration changes (memory, timeout, environment, concurrency) | OPT-OUT | not needed in Phase 5 — reachable uploads are at most 26 windows; 120-window timing is a Phase 10 prerequisite |
| STS GetCallerIdentity (account check before live work) | INTEGRATE | |
| AWS Budgets describe (publisher budget gate) | INTEGRATE | |
| CloudWatch embedded-metric log lines (UnstampedResults, ContextUnavailable) | INTEGRATE | |
| CloudFront contract CDN reads (verify_contract_live) | INTEGRATE | |
| CloudFront invalidation | OPT-OUT | not needed — versioned keys are immutable and latest.json has a 60 s TTL |
| CodeBuild and ECR (inference container rebuild) | OPT-OUT | explicitly out of scope — the container is not rebuilt in Phase 5 |
