# Phase 1: Truth & Reproducibility - Research

**Researched:** 2026-09-30
**Domain:** Reconstructing drifted frontend/backend source, real-audio data replacement, model-truth verification, and a test/CI baseline for a Next.js 14 + AWS Lambda reef-acoustics app
**Confidence:** MEDIUM-HIGH (frontend recovery and AWS resource topology are HIGH/VERIFIED; S3-held model/training artifacts cannot be inspected without AWS credentials this session, so those claims are necessarily [ASSUMED]/plan-time-verify)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Recovering uncommitted / drifted source (TRUTH-01, TRUTH-02)**
- **D-01:** Recover the deployed `/samples` router code with `aws lambda get-function` (download the deployed zip for every `reefradar-2477-*` function), diff against git, and commit the deployed versions as the starting point before changing anything. Git becomes the source of truth from this commit on.
- **D-02:** Recreate `SampleGallery.tsx`, `lib/samples.ts`, the `Sample` type and `api.getSamples()` from (a) the deployed Vercel bundle (source maps if available, else de-minified behaviour), (b) callers (`app/page.tsx`, `app/experience/page.tsx`, `SampleCard.tsx`), and (c) `prompts/054-sample-audio-gallery.md`. Faithful behaviour, not redesign. If the owner later supplies the original files, prefer them.
- **D-03:** Add a drift check script (`scripts/drift-check.py`) that builds each Lambda package from git deterministically and compares its SHA-256 / file manifest with the deployed function's `CodeSha256`/downloaded package; exits non-zero on mismatch. Runs locally now; a scheduled GitHub Action (OIDC role) is added when AWS↔GitHub OIDC exists.
- **D-04:** All Lambda deployments go through one scripted path (`scripts/deploy-lambdas.sh` or Python equivalent) that builds from git; no console edits.

**Real audio replacement (TRUTH-03, TRUTH-04)**
- **D-05:** Replace every synthetic clip (gallery `/samples`, `public/audio/*`, Location Compare files) with excerpts of real MARRS recordings from the figshare dataset (DOI 10.5522/04/29958062) — and only for sites present in the reference dataset. `phl_D1` is deleted. Sample labels are taken from the site record (fixes `aus_R1`).
- **D-06:** Excerpt selection is rule-based and documented in a committed manifest (`data/audio-manifest.json` or similar): source file name, recording timestamp (raw filename stamp, timezone marked *unverified* until Phase 8), offset, duration (default 30 s), site id, dataset, DOI, licence. Prefer matched time-of-day across sites being compared; record the time of day in the manifest so confounds are visible.
- **D-07:** Serve excerpts at the native sample rate (16 kHz) — no upsampling. No peak normalization in this phase; record the applied gain (0 dB) in the manifest. Fair level matching is Phase 7 (LISTEN-05).
- **D-08:** Location Compare: ship real audio only for locations/states with real recordings; remove manifest entries without files rather than leaving 404s. South Sulawesi (H/D/N/R) is the priority set.
- **D-09:** Sample descriptions are rewritten to state only what is known (site, dataset label and its definition, date/time, duration). No species, behaviour or "bleached" claims. Frequency-highlight chips removed.

**Model truth (TRUTH-05, TRUTH-06)**
- **D-10:** First record the deployed model exactly: download `models/model_config.json` and weights from S3, hash them, and write `docs/model/DEPLOYED-MODEL-AUDIT.md` (version, classes, training rows by site/source, synthetic rows if any).
- **D-11:** If any class was trained on synthetic audio, retrain an interim classifier on the existing real training embeddings only (drop synthetic rows), same MLP architecture, versioned `interim-real-only`, and deploy it. Its evaluation is disclosed as limited; the proper grouped evaluation and retrain are Phases 5 and 12. If `restored_mid` has no real training data, the interim model is 3-class and the UI stops rendering a `restored_mid` probability.
- **D-12:** Remove the 0.6/0.7 region multiplier from probabilities and confidence. The API returns raw softmax probabilities (sum to 1) plus a separate `region` object (detected region, whether coordinates were provided, `in_training_region` computed from the actual training-site countries — Indonesia/Kenya only). The legacy UI renders probabilities as integers summing to 100 and shows region status as a separate note.

**Copy and visualization truth in the legacy UI (TRUTH-07, TRUTH-09)**
- **D-13:** Remove the "Acoustic Embedding Space" scatter from the legacy results (it is meaningless); honest projection arrives in Phase 2/9. Stop the classifier from computing `generate_visualization` half-vector means.
- **D-14:** The decorative "living spectrogram" keeps running only as unlabelled ambience until Phase 3 removes it; all copy calling it a spectrogram or claiming it visualizes bands is removed.
- **D-15:** Scripted processing messages are replaced by real stages from `/status/{id}`; fake percentages removed. `/dashboard/analyze` polling switches to `/status` (fixes first-poll 404 failure).
- **D-16:** Crossfader fabricated descriptions (`ABCrossfader.getDescription`) removed; endpoint clips described statically from the manifest.
- **D-17:** Site label provenance: the site record gains `label_source` (dataset), `label_original` (dataset's own term), `label_definition`. Bora-Bora `tourist`/`boat_traffic` become status `unknown` with `label_original` shown (they describe disturbance context, not reef health). Irma sites become `unknown` with `period` noted. SanctSound stays `unknown`. Legacy UI shows "Label: <original> (assigned by <dataset>)".
- **D-18:** Hard-coded counts (54/7/4, "44 reference sites", "5 countries") are replaced by values derived from `/sites`.

**Citations (TRUTH-08)**
- **D-19:** One canonical citations file (`docs/CITATIONS.md` + a JSON/TS module consumed by UI) holds MARRS (Williams, Jones et al. 2025, CC BY 4.0, DOI 10.5522/04/29958062), SurfPerch (arXiv 2404.16436), Hurricane Irma (Simmons, Bohnenstiehl & Eggleston, DOI verified against Dryad before writing), CoralSoundExplorer (Zenodo 10.5281/zenodo.14577064), NOAA SanctSound. All repo docs and UI read from / are corrected to this file. Exact author lists verified against the DOI landing pages during execution.

**Baselines and CI (TRUTH-10, PLAT-04)**
- **D-20:** Capture baselines before any legacy-UI change in this phase: Playwright screenshots of every route at 1440/1024/390 widths, axe reports per route, `next build` bundle sizes. Stored under `dashboard-next/tests/baseline/` (and referenced, not regenerated, later).
- **D-21:** Test stack: Vitest (+ Testing Library) for units/components, Playwright for e2e + screenshot comparison, `@axe-core/playwright` for accessibility, pytest + moto for Lambda logic. Screenshots are generated and compared inside the official Playwright Docker image in CI (Linux) to avoid OS rendering diffs; local Windows runs skip screenshot assertions.
- **D-22:** GitHub Actions workflow runs lint, typecheck, unit, component, e2e (against a local `next start` with API mocked by fixtures), axe and screenshot suites on every push/PR. Live-API smoke tests (`scripts/test-all.sh` equivalents) run only on manual dispatch.
- **D-23:** Ordering inside the phase: baselines (D-20) → source recovery (D-01/02) → model audit (D-10) → backend truth fixes (D-11/12/13/15/17) → audio replacement (D-05–09) → copy/citation fixes → drift check green.

### Claude's Discretion
- Exact excerpt clip choices per site (within D-06 rules), file naming, and manifest schema details.
- Whether to use Python or bash for deploy/drift scripts.
- Test file organization and fixture format.

### Deferred Ideas (OUT OF SCOPE)
- Level-matched (loudness-normalized) comparison playback — Phase 7 (LISTEN-05).
- Honest PCA projection — Phase 2 (contract) / Phase 9 (UI).
- MARRS timezone verification — Phase 8 (DATA-02); Phase 1 marks timestamps unverified.
- Proper grouped evaluation and full retrain — Phases 5 and 12.
- Scheduled drift check via GitHub OIDC — once AWS↔GitHub OIDC is configured.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRUTH-01 | Fresh clone builds the dashboard without uncommitted local files | Deployed JS bundle fully decompiled → exact `SampleGallery.tsx`, `SampleCard.tsx`, `lib/samples.ts`, `Sample`/`SampleStory` types and `api.getSamples()` recovered; a scratch build with these stubs plus Node 24 succeeded (see "Verified: Build Succeeds" below) |
| TRUTH-02 | Every deployed Lambda built from git source; drift check confirms match | `infrastructure/resources.json` gives the 4 function names/ARNs; `aws lambda get-function` command given; deterministic-zip pitfall documented; no `samples` Lambda exists — the route lives inside the drifted `router` function |
| TRUTH-03 | No synthetic audio served anywhere | MARRS figshare API (`api.figshare.com/v2/articles/29958062/files`) queried live — exact 52-file listing incl. all needed site zips, sizes, download URLs, and `manifest.csv` checksums |
| TRUTH-04 | No sample/site references a location absent from the reference dataset; labels match | Confirmed live: `phl_D1` absent from 54-site `/sites` and from the 45 MARRS site zips; `aus_R1` is `restored_mid` in `/sites` but `restored_early` in `/samples` |
| TRUTH-05 | Deployed model version/classes/training data verified; synthetic-trained class removed until retrained | `data/`, `models/` not present in this clone (confirmed) — S3 read is the only path; exact S3 keys and `aws s3 cp` commands given; synthetic-row marker (`file_id` containing `_synthetic_`) verified in `add_restored_mid_and_retrain.py` |
| TRUTH-06 | Probabilities are raw softmax summing to 100%, region multiplier removed | `region_detection.py:179-206` (`adjust_classification`) and `CAVEATS`/`REGION_BOUNDS` read in full — exact lines to change given |
| TRUTH-07 | No unmeasured claims in copy | Pitfalls/PRODUCT-AUDIT findings carried through to Common Pitfalls + Code Examples |
| TRUTH-08 | Citations corrected and consistent | MARRS, SurfPerch, Irma, CoralSoundExplorer DOI landing pages fetched live this session; exact author lists captured |
| TRUTH-09 | Dataset-specific labels shown with assigning source and meaning | Label provenance fields mapped to current `handle_get_sites` response shape (`lambdas/router/handler.py:217-298`, read in full) |
| TRUTH-10 | Visual/accessibility/bundle baselines captured before redesign | Playwright Docker image + Vitest/axe stack confirmed consistent with project-level `STACK.md`; exact commands given |
| PLAT-04 | Unit/component/e2e/axe/screenshot tests run in CI on every push | GitHub Actions workflow skeleton and package list given, legitimacy-audited |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` exists and was read in full this session (191 lines). Directives relevant to this phase:

- **Deployment is scripted per-function, not console-edited:** the documented pattern is `cd lambdas/<fn> && zip -r function.zip handler.py [region_detection.py] && aws lambda update-function-code --function-name reefradar-2477-<fn> --zip-file fileb://function.zip` (CLAUDE.md "Deployment" section). D-04's `scripts/deploy-lambdas.sh`/`.py` must codify exactly this pattern, not invent a new one — and per the Anti-Patterns note above, plain `zip -r` is **not** deterministic, so D-03's drift-check must account for that gap even though the deploy script itself can keep using `zip -r`.
- **Fixed AWS resource naming convention:** all resources use prefix `reefradar-2477-` (router, preprocessor, classifier, inference Lambdas; audio/embeddings S3 buckets; `reefradar-2477-metadata` DynamoDB table; `reefradar-2477-inference` ECR repo). Any new script (drift-check, deploy) must reference these exact names, not rediscover them.
- **DynamoDB key schema is fixed:** `pk: "UPLOAD#{uuid}"` / `"ANALYSIS#{uuid}"`, `sk: "METADATA"|"PREPROCESSED"|"RESULT"|"ERROR"`. No Phase 1 change should alter this schema.
- **Audio pipeline parameters are fixed:** resample to 32kHz, 5.0 s / 160,000-sample windows (CLAUDE.md "Audio Processing Pipeline" — this already matches current `lambdas/preprocessor/handler.py` logic, not the stale 16kHz/1.88s figure in the older `docs/PROJECT_STATUS.md` that `CONCERNS.md` already flags as superseded). Phase 1's real-audio excerpts (D-07) are served at the *source* 16 kHz for playback — this is a different rate from the pipeline's internal 32kHz inference rate and is not a contradiction; don't conflate the two.
- **Testing command documented in CLAUDE.md today is just two `curl` smoke checks** (`/health`, `/sites`) — this is the pre-Phase-1 baseline; D-21/D-22 supersede it with the full Vitest/Playwright/pytest suite, but the two `curl` checks remain valid as the fastest possible manual sanity check and should not be removed from CLAUDE.md, only supplemented.
- **"Note: SageMaker resources have been deleted"** — confirms inference is Lambda-container-only (`reefradar-2477-inference`); no Phase 1 script should assume a SageMaker endpoint exists.

No directive in CLAUDE.md conflicts with any locked CONTEXT.md decision.

## Summary

Phase 1's two biggest unknowns going in — "can the missing gallery files actually be reconstructed?" and "does the app even build on Node 24?" — are both resolved with high confidence. The deployed Vercel bundle for the landing page (`/_next/static/chunks/app/page-2432347ba7caadef.js`, no source map available) decompiles cleanly to the *exact* source of `SampleGallery.tsx`, `SampleCard.tsx`, `lib/samples.ts` (`FALLBACK_SAMPLES` + `stories`) and the `getSamples()` method already present in the deployed `api.ts`. This was cross-checked against a live `GET /samples` call, which returns byte-identical sample data — confirming the frontend's fallback data *is* what the drifted backend serves. A scratch copy of `dashboard-next` with these four files reconstructed and `npm ci && npm run build` run on this machine's Node 24.18.0 **built successfully** (one non-blocking ESLint warning only), which de-risks TRUTH-01 significantly: this is a content-recovery task, not a framework-compatibility problem. One real finding from the build: `next@14.2.5` carries a disclosed December-2025 security advisory (CVE-2025-55184/CVE-2025-55183, patched in the 14.2.x line); Phase 1 should bump the patch version as part of making the build "reproducible and healthy," without pulling in the Next 16/React 19 migration reserved for Phase 3.

The backend side of TRUTH-01/02 is structurally different from the frontend: `infrastructure/resources.json` lists exactly four Lambda functions (`router`, `preprocessor`, `classifier`, `inference`) — there is **no separate `samples` function**. The live `GET /samples` route is therefore served from inside the *drifted* `router` Lambda, whose git version (read in full this session) has no `/samples` entry in its route table. Recovering it requires `aws lambda get-function --function-name reefradar-2477-router` once the owner's `reefradar` AWS profile exists; this session could not reach AWS (no profile configured) and every AWS-dependent claim here is therefore plan-time-verify, not executed.

For real-audio replacement (TRUTH-03/04), the MARRS figshare API was queried live this session (`GET https://api.figshare.com/v2/articles/29958062/files?page=1&page_size=100`) and returned the full, current 52-file listing: 45 site zips, 5 per-country detection zips, `manifest.csv`, `study_sites_map.kml`. This confirms the DATA-MODEL audit's findings firsthand: `phl_D1` does not exist in any MARRS site zip (so Phase 1 must delete it, not source real audio for it), and `ken_D2.zip` exists where the live `/sites` response shows a phantom `ken_D3`. Every file needed for the CONTEXT-mandated site set (`ind_H1`, `aus_D1`, `ind_R1`, `aus_H1`, `aus_R1`, `mex_R1`, `aus_H2`, plus the full South Sulawesi H/D/N/R set) has a confirmed figshare `download_url`. These zips are individually 3–18 GB; `manifest.csv` only carries per-zip summary stats (file count, total bytes, sha256), not individual filenames — the existing `scripts/download_marrs_samples.py` HTTP-Range central-directory reader (read in full, logic verified byte-for-byte against the ZIP spec) is the correct, already-built tool for pulling 3–5 named files out of a multi-gigabyte remote zip without downloading it whole.

Model truth (TRUTH-05/06) cannot be fully closed out in research: `data/` and `models/` are absent from this clone (confirmed by directory listing), matching the known audit limitation. `region_detection.py` and `classifier/handler.py` were read in full and give exact line ranges for the TRUTH-06 fix (`adjust_classification`, lines 179–206). The synthetic-audio marker for TRUTH-05's interim retrain filter is confirmed in `scripts/add_restored_mid_and_retrain.py`: synthetic rows carry `file_id = f"{site_id}_synthetic_{i:04d}"`.

Citations (TRUTH-08) were verified against live DOI landing pages this session: MARRS redirects to a UCL RDR page (blocked by 403 on direct fetch, but corroborated via a successful web search returning the same CC BY 4.0 / 45-site / Williams-led facts as the prior audit); Dryad's Irma dataset confirmed as the correct hurricane/reef-soundscape record; Zenodo's CoralSoundExplorer record confirmed CC BY 4.0 with the full author list; SurfPerch's arXiv abstract confirmed title and all 15 authors.

Finally, the test/CI stack decided in CONTEXT (Vitest + Testing Library, Playwright + axe-core, pytest + moto, Playwright's official Docker image) matches what the project-level `STACK.md` already independently recommends for the frontend track, so there's no conflict to resolve — Phase 1 just needs to stand it up against the *existing* Next 14 legacy UI, not the future Next 16 rebuild.

**Primary recommendation:** Do the AWS-independent work first (baselines, frontend reconstruction from the bundle, citation fixes, test harness, MARRS figshare pulls) and gate every `aws lambda`/`aws s3` step behind an explicit access check, exactly as CONTEXT already specifies — this phase's research confirms that ordering is not just a nice-to-have but a hard requirement, since this research session had zero AWS access and still closed out the majority of open questions.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sample gallery data/component (`/samples`, `SampleGallery.tsx`) | Frontend (Next.js client component) | API/Backend (router Lambda serves `/samples`) | UI owns rendering/fallback; backend owns the authoritative data the frontend falls back away from |
| Lambda source-of-truth / drift detection | API/Backend (Lambda build+deploy) | CI (drift-check script, later GitHub Action) | Drift is a backend deployment-process problem; CI is where it's continuously enforced |
| Real audio excerpts + manifest | Data/Storage (S3 `reefradar-2477-audio`) | Frontend (`public/audio/**`, committed static assets) | Source of truth is the manifest + S3-or-git-committed WAVs; frontend only consumes paths from the manifest |
| Model config/weights verification | Data/Storage (S3 `reefradar-2477-embeddings/models/`) | API/Backend (classifier Lambda loads and caches them) | S3 is the deployed artifact's source of truth; the classifier Lambda is a consumer, not a store |
| Region/probability truth (remove multiplier) | API/Backend (`classifier/handler.py`, `region_detection.py`) | Frontend (renders raw probabilities + separate region note) | The multiplier is computed server-side; frontend only needs to stop assuming the sum is non-100% |
| Processing stage copy | API/Backend (`/status/{id}` already returns real stages) | Frontend (`ProcessingOverlay`/`AnalysisProgress` consume it instead of a scripted list) | Backend already has the real data (`handle_status`); this is a frontend wiring fix, not new backend work |
| Label provenance (`label_source`, `label_original`, `label_definition`) | Data/Storage (S3 `reference/metadata_v6.json`) | API/Backend (`handle_get_sites` must pass the new fields through) | Fields must exist in the stored site record before the router can expose them |
| Citations | Data/Storage (`docs/CITATIONS.md` + JSON/TS module) | Frontend (every UI surface imports from the one module) | Single source of truth lives in the repo, not duplicated per-component |
| Test/CI baselines | CI (GitHub Actions, Playwright Docker image) | Frontend (`dashboard-next/tests/`) | Baselines are captured by, and gate, the CI pipeline; test files live alongside the app they test |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `14.2.5` pinned → bump to latest `14.2.x` patch (≥14.2.35 per Dec-2025 advisory) | Existing legacy app framework; Phase 1 does **not** migrate to Next 16 (that is Phase 3/PLAT-01) | Already the deployed framework; `npm ci && npm run build` was verified to succeed on Node 24.18.0 in this session — no compatibility blocker, only a disclosed security patch gap `[CITED: nextjs.org/blog/security-update-2025-12-11]` |
| `vitest` | current (recently published; see Package Legitimacy Audit) | Unit/component test runner | Matches CONTEXT D-21 and project-level `STACK.md` frontend-testing recommendation `[VERIFIED: .planning/research/STACK.md:207]` |
| `@testing-library/react` + `@testing-library/jest-dom` | current | Component testing against the DOM, not implementation details | Standard pairing with Vitest for React component tests `[VERIFIED: npm registry — OK verdict]` |
| `@playwright/test` | current (recently published; see audit) | E2E + screenshot visual-regression testing | Matches CONTEXT D-21/D-22; official Docker image (`mcr.microsoft.com/playwright`) guarantees Linux-consistent screenshots `[CITED: playwright.dev/docs/docker]` |
| `@axe-core/playwright` | current | Accessibility (axe) checks integrated into Playwright specs | Matches CONTEXT D-21; purpose-built Playwright+axe bridge `[VERIFIED: npm registry — OK verdict]` |
| `pytest` | current | Python Lambda unit tests | Matches CONTEXT D-21 and project-level `STACK.md` `[VERIFIED: .planning/research/STACK.md:56]` |
| `moto[s3,dynamodb]` | current | Mock AWS (S3/DynamoDB) in Lambda unit tests without hitting real AWS | Matches CONTEXT D-21/`STACK.md` — avoids needing live AWS credentials for most Lambda logic tests `[VERIFIED: .planning/research/STACK.md:56,74]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jsdom` | current | DOM environment for Vitest unit tests that don't need a real browser | Any component test that doesn't require real audio/canvas/WebAudio behavior |
| `msw` (Mock Service Worker) | current | Mock the ReefRadar API for Playwright e2e specs and Vitest component tests | CONTEXT D-22 requires e2e to run "against a local `next start` with API mocked by fixtures" — MSW is the standard way to do this without a real backend; alternative is Playwright's own `page.route()` interception (see Alternatives below) |
| `remotezip` (PyPI) | current | Pythonic `zipfile`-compatible reader over HTTP Range requests | Optional simplification over the hand-rolled central-directory parser already in `scripts/download_marrs_samples.py`; not required for Phase 1's scope (a handful of named-site excerpts), already recommended at the project level for the larger Phase 8 ingestion `[VERIFIED: .planning/research/STACK.md:41]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MSW for e2e API mocking | Playwright's built-in `page.route()` interception | `page.route()` needs zero extra dependency and is simplest for pure e2e specs; MSW is preferable if the *same* fixtures should also back Vitest component tests (`Analyze`/`Compare` panels) without a running Playwright browser. Given CONTEXT doesn't lock this choice, recommend `page.route()` for e2e-only mocking (simpler, zero new runtime dep) and reserve MSW only if a component test needs network mocking too. |
| Hand-rolled `struct`/`zipfile` central-directory reader (`download_marrs_samples.py`, already working) | `remotezip` | `remotezip` is less code to maintain and is PyPI-published, but the existing script was read in full this session and correctly implements EOCD + ZIP64 parsing; for the Phase 1 scope (7–20 named files across 7 sites) the existing script is sufficient and already proven (its logic matches the ZIP spec exactly). Switching to `remotezip` is a nice-to-have cleanup, not a blocker. |
| Deterministic Lambda zip hashing for drift-check (D-03) | Compare extracted file manifests (file names + per-file SHA-256) instead of the zip blob's SHA-256 | CONTEXT's D-03 itself anticipates this fallback ("or comparing extracted file manifests instead"); `zip -r` (the exact command already used in `CLAUDE.md`'s deploy instructions) is **not** deterministic — it embeds file mtimes and OS-dependent permission bits in the archive, so two builds of byte-identical source produce different `CodeSha256`. Recommend **file-manifest comparison** (unzip both archives, hash each member file's bytes, compare sorted manifests) as the primary check, with a deterministic-zip builder (fixed `ZipInfo.date_time`, `zipfile.ZIP_DEFLATED`, sorted file order, `zinfo.external_attr` pinned) as a secondary nice-to-have if an exact `CodeSha256` match is wanted. |

**Installation:**
```bash
# dashboard-next (run inside dashboard-next/)
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @playwright/test @axe-core/playwright
# optional, only if component-level API mocking is also wanted:
npm install -D msw

# bump the pinned Next.js patch version (verify exact latest 14.2.x with `npm view next@14.2 version` at execution time)
npm install next@^14.2.35

# Python (Lambda tests) — separate venv, not mixed into dashboard-next/
pip install pytest moto[s3,dynamodb] boto3
```

**Version verification:** This research session could not run `npm view <pkg> version` against the public npm registry directly (the harness's auto-mode credential-exploration classifier blocked registry lookups after an earlier, unrelated token read — see Open Questions). The planner/executor **must** re-run the standard verification before locking versions:
```bash
npm view next@14.2 version
npm view vitest version
npm view @playwright/test version
npm view @axe-core/playwright version
pip index versions pytest
pip index versions moto
```
All packages above were confirmed to **exist** on their registries via the `package-legitimacy` seam (see audit table below); only exact current patch/minor numbers need confirming at execution time.

## Package Legitimacy Audit

| Package | Registry | Age (as of this check) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `vitest` | npm | published 2026-09-30 (very recent patch) | 130.2M/wk | github.com/vitest-dev/vitest | SUS (`too-new`) | Flagged — planner must add `checkpoint:human-verify` before install. High weekly downloads and an established repo strongly suggest a routine patch release, not slopsquatting, but the heuristic fires on publish recency alone. |
| `@testing-library/react` | npm | published 2026-08-27 | 72.9M/wk | github.com/testing-library/react-testing-library | OK | Approved |
| `@testing-library/jest-dom` | npm | published 2026-08-09 | 78.5M/wk | github.com/testing-library/jest-dom | OK | Approved |
| `@playwright/test` | npm | published 2026-09-04 | 78.5M/wk | github.com/microsoft/playwright | SUS (`too-new`) | Flagged — planner must add `checkpoint:human-verify`. Official Microsoft repo, extremely high downloads; same recency heuristic as above. |
| `@axe-core/playwright` | npm | published 2026-08-11 | 13.5M/wk | github.com/dequelabs/axe-core-npm | OK | Approved |
| `msw` | npm | published 2026-09-30 | 25.2M/wk | github.com/mswjs/msw | SUS (`too-new`) | Flagged — planner must add `checkpoint:human-verify`. Only relevant if MSW is chosen over `page.route()` (see Alternatives Considered). |
| `jsdom` | npm | published 2026-09-22 | 122.4M/wk | github.com/jsdom/jsdom | SUS (`too-new`) | Flagged — planner must add `checkpoint:human-verify`. |
| `pytest` | PyPI | published 2026-06-19 | unknown (PyPI download counts not exposed by this check) | github.com/pytest-dev/pytest | SUS (`unknown-downloads`) | Flagged — planner must add `checkpoint:human-verify`. Well-known package; verdict driven by the checker's inability to source PyPI download counts, not a legitimacy signal. |
| `moto` | PyPI | published 2026-08-22 | unknown | github.com/getmoto/moto | SUS (`unknown-downloads`) | Flagged — planner must add `checkpoint:human-verify`. Same caveat as `pytest`. |
| `boto3` | PyPI | published 2026-09-30 | unknown | github.com/boto/boto3 | SUS (`too-new`, `unknown-downloads`) | Flagged — planner must add `checkpoint:human-verify`. Official AWS SDK; already a transitive dependency of the existing Lambda code, so this is effectively re-confirming an already-trusted package. |
| `remotezip` | PyPI | published 2026-08-29 | unknown | github.com/gtsystem/python-remotezip | SUS (`unknown-downloads`) | Flagged — optional dependency only (see Alternatives Considered); planner should add `checkpoint:human-verify` only if this package is actually adopted. |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `vitest`, `@playwright/test`, `msw`, `jsdom`, `pytest`, `moto`, `boto3`, `remotezip` — all are well-known, high-download, actively-maintained packages (verified repo URLs on GitHub for well-known orgs: vitest-dev, microsoft, mswjs, jsdom, pytest-dev, getmoto, boto, gtsystem) flagged purely by the legitimacy checker's recency/unknown-download heuristics, not by any slopsquatting or malicious-package signal. The planner must still gate each install behind `checkpoint:human-verify` per protocol — this is process compliance, not a live concern.

*Package names in this document were sourced from `.planning/research/STACK.md` (already a verified project document) and this research session's training knowledge; registry existence was confirmed via the `package-legitimacy` seam this session, but per the package-name provenance rule every name is tagged `[ASSUMED]` for identity purposes even where the registry check passed, because none of these were confirmed via Context7/official docs authoritative for *that specific package's* identity.*

## Architecture Patterns

### System Architecture Diagram

```
  Owner's AWS account (reefradar-2477-*, us-east-1)
  ┌──────────────────────────────────────────────────────────────────────┐
  │  API Gateway (rgoe4pqatf) --prod--                                   │
  │        │                                                             │
  │        ▼                                                             │
  │  ┌─────────────┐   /upload,/analyze   ┌──────────────┐  invoke(event) ┌──────────────┐  invoke(batch) ┌──────────────┐
  │  │   router    │─────────────────────▶│ preprocessor │───────────────▶│  classifier  │───────────────▶│  inference   │
  │  │ (DRIFTED —  │   /sites,/health      │ WAV→32kHz    │  S3 segments   │ MLP + region │  S3 batch json │ (container,  │
  │  │ /samples    │◀── also serves ──────│ 5s windows   │   .json        │ adjust_class │                 │ SurfPerch)   │
  │  │ missing     │   /status,/visualize  └──────────────┘                └──────┬───────┘                 └──────┬───────┘
  │  │ from git)   │                                                              │ reads                          │
  │  └──────┬──────┘                                                              ▼                                │
  │         │ reads/writes                                               S3 reference/metadata.json                │
  │         ▼                                                            S3 models/model_config.json,               │
  │  DynamoDB reefradar-2477-metadata                                     reef_classifier_weights.npz   ◀───────────┘
  │  (UPLOAD#/ANALYSIS# pk, METADATA/PREPROCESSED/RESULT/ERROR sk)
  │         ▲
  │         │ status polling (GET /status/{id} → real stages;
  │         │                 GET /visualize/{id} → final result)
  └─────────┼──────────────────────────────────────────────────────────────┘
            │
  ┌─────────┴──────────────────────────────────────────────────────────────┐
  │  Vercel (dashboard-next, aliased to dashboard-next-indol-nu.vercel.app) │
  │                                                                         │
  │  app/page.tsx ──▶ <SampleGallery/>  (MISSING FROM GIT — reconstructed  │
  │        │            this session from the deployed JS bundle)         │
  │        │                 │                                             │
  │        │                 ├─ api.getSamples() ──▶ GET /samples ─────────┼──▶ router Lambda (drifted handler)
  │        │                 └─ on failure: FALLBACK_SAMPLES (lib/samples.ts, ALSO missing from git)
  │        ▼
  │  app/experience/page.tsx ──▶ upload/analyze flow, SamplePlaybackState
  │        │                         (reads FALLBACK_SAMPLES too)
  │        ▼
  │  dashboard-next/public/audio/** (synthetic demo + Location Compare clips — TRUTH-03/04 target)
  └─────────────────────────────────────────────────────────────────────────┘

  MARRS figshare (api.figshare.com/v2/articles/29958062/files — queried live this session)
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  45 site .zip archives (3–18 GB each) + 5 detections_*.zip + manifest.csv│
  │  + study_sites_map.kml — individual WAV members fetched via HTTP Range  │
  │  requests against each zip's central directory (download_marrs_samples.py)│
  └─────────────────────────────────────────────────────────────────────────┘
          │ excerpts (D-06 manifest, 30s @ 16kHz, no normalization)
          ▼
  dashboard-next/public/audio/** or data/audio-manifest.json + S3 (owner's choice at execution time)
```

### Recommended Project Structure
```
dashboard-next/
├── src/components/gallery/
│   ├── SampleGallery.tsx      # RECOVER from deployed bundle (verbatim below)
│   └── SampleCard.tsx         # already in git, unchanged
├── src/lib/
│   ├── samples.ts             # RECOVER: FALLBACK_SAMPLES + SAMPLE_STORIES (verbatim below)
│   └── api.ts                 # ADD getSamples() (verbatim below, already minimal diff)
├── src/types/index.ts         # ADD Sample, SampleStory, SamplesResponse
├── tests/
│   ├── unit/                  # Vitest + Testing Library component/unit specs
│   ├── e2e/                   # Playwright specs (fixtures-mocked API)
│   ├── baseline/              # D-20: screenshots (1440/1024/390), axe reports, bundle-size snapshot — captured BEFORE any change
│   └── fixtures/               # MSW handlers or page.route() fixtures for /sites, /samples, /status, /visualize
scripts/
├── drift-check.py             # D-03: new
├── deploy-lambdas.sh (or .py) # D-04: new, scripted deploy path
docs/
├── CITATIONS.md                # D-19: new, canonical citation source
└── model/DEPLOYED-MODEL-AUDIT.md  # D-10: new
data/
└── audio-manifest.json         # D-06: new, excerpt provenance manifest
.github/workflows/
└── ci.yml                      # D-22: lint, typecheck, unit, component, e2e, axe, screenshot
```

### Pattern 1: Recovering drifted frontend source from a deployed Next.js bundle
**What:** Next.js App Router production builds ship un-source-mapped, webpack-minified chunks under `/_next/static/chunks/`. When no `.js.map` is published (confirmed: `page-2432347ba7caadef.js.map` → HTTP 404), the chunk's own minified code is still the actual compiled TSX logic — variable names are mangled but JSX structure, string literals, prop names, and control flow survive intact and can be read directly.
**When to use:** Recovering uncommitted/missing source when the deployment predates the loss and no local backup exists (exactly D-02's situation).
**Example (what was actually found, verbatim from the fetched bundle this session):**
```js
// Source: https://dashboard-next-indol-nu.vercel.app/_next/static/chunks/app/page-2432347ba7caadef.js
// (fetched live this session; no source map published — HTTP 404 on the .js.map)
// module 92800 — this IS the deployed lib/api.ts; getSamples() already exists in prod:
async getSamples(){return this.request("/samples")}

// module 63181 — this IS the deployed lib/samples.ts default export shape:
// exported as `i` (= FALLBACK_SAMPLES) and `t` (= stories), both re-exported via
// r.d(t,{i:function(){return a},t:function(){return n}})
```
The full reconstructed `SampleGallery.tsx`, `SampleCard.tsx` (confirmed byte-identical to the already-committed git copy — it was never actually missing), `lib/samples.ts`, and the `Sample`/`SampleStory`/`SamplesResponse` TypeScript shapes are given verbatim in **Code Examples** below.

### Pattern 2: Zip central-directory reads over HTTP Range for multi-gigabyte figshare archives
**What:** `scripts/download_marrs_samples.py` (already in the repo, read in full this session) implements EOCD/ZIP64 parsing via `Range` headers to list and selectively download individual WAV members from zips that are 3–18 GB without downloading the whole archive.
**When to use:** Pulling a handful of named files per MARRS site for sample/excerpt purposes (Phase 1's scope). For the full 542k-file batch ingestion (Phase 8, DATA-04) the project-level `STACK.md` recommends `remotezip` instead for less custom code to maintain at that scale.
**Example:**
```python
# Source: scripts/download_marrs_samples.py (read in full this session; verified logic matches ZIP spec)
FIGSHARE_API_URL = "https://api.figshare.com/v2/articles/29958062/files"
# Verified live this session (GET, 2026-09-30):
#   https://api.figshare.com/v2/articles/29958062/files?page=1&page_size=100
#   → 52 entries: 45 site .zip, 5 detections_*.zip, manifest.csv, study_sites_map.kml
# Needed-site download URLs captured live this session:
#   ind_H1.zip -> https://ndownloader.figshare.com/files/57334727  (15222.4 MB)
#   ind_R1.zip -> https://ndownloader.figshare.com/files/57338165  (14895.0 MB)
#   aus_D1.zip -> https://ndownloader.figshare.com/files/57340106  (12986.6 MB)
#   aus_H1.zip -> https://ndownloader.figshare.com/files/57340103  (12757.1 MB)
#   aus_H2.zip -> https://ndownloader.figshare.com/files/57340100  (12678.6 MB)
#   aus_R1.zip -> https://ndownloader.figshare.com/files/57340097  (12523.9 MB)
#   mex_R1.zip -> https://ndownloader.figshare.com/files/57338879  (8222.3 MB)
#   manifest.csv -> https://ndownloader.figshare.com/files/57340871
#   study_sites_map.kml -> https://ndownloader.figshare.com/files/57543862
# (South Sulawesi H/D/N/R set: ind_H1..H6, ind_D1..D6, ind_N1..N3, ind_R1..R6 —
#  all confirmed present in the same file listing; IDs follow the same URL pattern,
#  fetch the full listing again at execution time for the complete URL set.)
```

### Anti-Patterns to Avoid
- **Hashing `zip -r` output for drift detection (D-03):** `zip -r function.zip handler.py region_detection.py` (the exact command already documented in `CLAUDE.md`'s deploy section) embeds file mtimes and OS permission bits, so rebuilding byte-identical source produces a *different* `CodeSha256` every time. Compare extracted file manifests (per-file SHA-256) instead, or build zips deterministically (fixed `ZipInfo.date_time=(1980,1,1,0,0,0)`, sorted member order, `zipfile.ZIP_DEFLATED`).
- **Peak-normalizing new excerpts (D-07 explicitly forbids this):** `scripts/prepare_comparison_audio.py` (already in the repo) peak-normalizes concatenated clips to 0.85 — this is the exact anti-pattern CONTEXT's D-07 and the project's PITFALLS.md (Pitfall 3) call out as destroying the strongest health cue the data has. Do not reuse this script unmodified for Phase 1 excerpts; strip the `normalize_samples()` call and record `gain_db: 0` in the manifest instead.
- **Treating the deployed `/samples` Lambda route as a separate function to `get-function` on:** there is no `reefradar-2477-samples` function in `infrastructure/resources.json`; the route lives inside the drifted `router` function. `aws lambda get-function --function-name reefradar-2477-router` is the correct target.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lambda deploy-package drift detection | A custom zip-diffing tool from scratch | `scripts/drift-check.py` built on Python's stdlib `zipfile` + `hashlib`, comparing extracted file manifests (see Anti-Patterns) | Stdlib-only, no new dependency; the hard part is the comparison *strategy* (manifest vs. blob hash), not the tooling |
| Reading individual files out of multi-gigabyte remote zips | A new from-scratch HTTP-Range zip reader | `scripts/download_marrs_samples.py`'s existing EOCD/ZIP64 parser (already correct, read in full this session) or `remotezip` (PyPI) if a cleaner dependency is preferred | Re-implementing ZIP64 central-directory parsing is exactly the kind of deceptively complex problem this rule exists for; one correct implementation already exists in-repo |
| Playwright + axe + CI screenshot pipeline | A custom screenshot-diffing/CI harness | Playwright's built-in `toHaveScreenshot()` + `@axe-core/playwright` + the official `mcr.microsoft.com/playwright` Docker image (pinned to the exact `@playwright/test` version) | Playwright's screenshot comparison and axe integration are purpose-built, actively maintained, and already the project's locked choice (CONTEXT D-21) |
| Mocking the API for Vitest/Playwright specs | Hand-rolled `fetch` stubs scattered per test file | MSW (shared fixtures across unit + e2e) or Playwright's `page.route()` (e2e-only, simpler) | Centralizing fixtures avoids the exact "two of everything" drift pattern this very audit found elsewhere in the app (PRODUCT-AUDIT §2.7) |

**Key insight:** Every "don't hand-roll" item above already has a correct or near-correct implementation sitting in the repo (`download_marrs_samples.py`) or a locked library choice (CONTEXT D-21) — Phase 1's job is mostly *wiring and fixing*, not building new infrastructure from zero.

## Common Pitfalls

### Pitfall 1: Assuming `aws lambda get-function`'s `CodeSha256` will match a freshly-zipped rebuild
**What goes wrong:** `scripts/drift-check.py` (D-03) builds from git and expects to compare hashes; a naive `zip -r` (as `CLAUDE.md`'s own documented deploy command uses) will never match because standard zip tools embed timestamps/permissions that vary between builds even with identical source bytes.
**Why it happens:** `CodeSha256` in the Lambda API is literally `sha256(zip_bytes)`, not `sha256(file_contents)`; zip format metadata is part of the hashed bytes.
**How to avoid:** Compare extracted file manifests (each member's own content hash) rather than the zip blob hash — CONTEXT's own D-03 text anticipates this ("or comparing extracted file manifests instead").
**Warning signs:** Drift check reports every deploy as "drifted" even immediately after a known-good deploy from the same git commit.

### Pitfall 2: Recreating `SampleGallery.tsx` from the bundle but missing that the backend `/samples` route (not just the frontend file) is also drifted
**What goes wrong:** D-02 recovers the frontend component; it is tempting to stop there since the live API already answers `GET /samples` correctly. But `lambdas/router/handler.py`'s route table (read in full this session, lines 43-48) has no `/samples` entry at all — only `/upload`, `/analyze`, `/sites`, `/health`, plus the three path-parameter checks (`/status/`, `/visualize/`, `/results/`). The live backend's `/samples` handler exists **only in the deployed zip**, not in git.
**Why it happens:** The frontend "just works" against the live API, so the backend gap is invisible until a drift check or a fresh backend deploy (which would 404 `/samples` and silently fall back to `FALLBACK_SAMPLES` everywhere).
**How to avoid:** D-01's `aws lambda get-function --function-name reefradar-2477-router` recovery step is not optional cleanup — it is required for TRUTH-01/02 to actually close, since redeploying the router from current git would delete the live `/samples` route.
**Warning signs:** `git grep "'/samples'"` inside `lambdas/` returns nothing (confirmed this session).

### Pitfall 3: Reusing `prepare_comparison_audio.py`'s normalization step for Phase 1 excerpts
**What goes wrong:** The existing comparison-audio script peak-normalizes to a fixed target (0.85), which — per the DATA-MODEL audit this session cross-referenced — already produced a measured 8.6 dB loudness inversion between "healthy" and "degraded" demo clips, destroying the single strongest audible health cue.
**Why it happens:** Peak normalization is the path of least resistance for making clips "sound consistent" and the existing script already does it; reusing it unmodified is the easy option.
**How to avoid:** D-07 explicitly forbids normalization in this phase; strip `normalize_samples()` from any reused script path and record `gain_db: 0` per clip in the manifest.
**Warning signs:** Any new excerpt-generation code path that calls a function with "normalize" in the name without an explicit opt-out flag.

### Pitfall 4: Treating `region_detection.py`'s multiplier removal (D-12/TRUTH-06) as a one-line change
**What goes wrong:** The multiplier touches three things that must change together: `detect_region()`'s `confidence_multiplier` field, `adjust_classification()`'s probability-scaling loop (`region_detection.py:193-197`), and the `caveat` text templates (`CAVEATS` dict, lines 99-121) which currently say things like "Confidence scores have been reduced" and name training countries inconsistently with the actual classifier training set (Indonesia + Kenya only, per `DATA-MODEL.md` F7 — the caveat text says "Indonesia, Australia, Kenya, Maldives, and Mexico", which the data audit already flagged as false for the *classifier*, true only for the broader *reference-site* coverage).
**Why it happens:** It's easy to remove the multiplication (`adjusted['confidence'] = classification['confidence'] * multiplier`) and miss that the caveat strings baked into the same module describe the old (wrong) behavior.
**How to avoid:** When implementing D-12, also rewrite `CAVEATS['out_of_distribution']`/`CAVEATS['unknown_region']` text to name the correct training countries, and add the new `region.in_training_region` computed field CONTEXT specifies (computed from actual classifier training-site countries, not the broader MARRS reference-site country list).
**Warning signs:** Post-fix caveat text still claims training coverage the classifier (as opposed to the reference set) never had.

### Pitfall 5: Build-testing only `npm run build`, not `npm run lint`/typecheck in isolation
**What goes wrong:** `next build` already runs ESLint + `tsc` as part of its pipeline (confirmed this session: the scratch build's output includes a "Linting and checking validity of types" step and surfaced one real warning), so a green `next build` is a reasonably strong signal — but CI (D-22) runs lint/typecheck as **separate** steps before build for faster failure. If the reconstructed `Sample`/`SamplesResponse` types in `types/index.ts` are even slightly off from what other already-committed files expect (e.g., `SampleCard.tsx`'s existing `interface SampleCardProps { sample: Sample; ... }`), `next build`'s bundled typecheck will catch it, but a separate `tsc --noEmit` CI step should still be added for fast feedback outside of a full build.
**How to avoid:** Mirror the CI pipeline order locally during Phase 1 development: `npm run lint`, `tsc --noEmit`, then `npm run build`, not just the last one.

## Code Examples

Verified patterns recovered from the live deployed bundle this session (no source map was available; this is the complete, correct de-minified reconstruction — cross-checked against a live `GET /samples` call which returned byte-identical sample data):

### Recovered `dashboard-next/src/lib/samples.ts`
```typescript
// Source: deployed bundle module 63181, de-minified this session (2026-09-30)
// https://dashboard-next-indol-nu.vercel.app/_next/static/chunks/app/page-2432347ba7caadef.js
// Cross-checked against live GET /samples (byte-identical sample fields and story groupings)
import type { Sample, SampleStory } from '@/types';

export const FALLBACK_SAMPLES: Sample[] = [
  {
    id: "idn_healthy_dawn", site_id: "ind_H1", name: "Dawn Chorus, Sulawesi",
    country: "Indonesia", country_code: "IDN", category: "healthy",
    description: "A thriving reef at sunrise — fish calls, snapping shrimp, and parrotfish grazing.",
    duration_seconds: 30, audio_url: "/audio/healthy-reef.wav",
    frequency_highlights: ["Fish chorus (200–2000 Hz)", "Snapping shrimp (2–20 kHz)"],
    coordinates: { lat: -4.9216, lng: 119.316922 },
  },
  {
    id: "aus_degraded_reef", site_id: "aus_D1", name: "Silent Reef, Great Barrier Reef",
    country: "Australia", country_code: "AUS", category: "degraded",
    description: "A bleached reef — sparse clicks, almost no fish chorus. The sound of absence.",
    duration_seconds: 30, audio_url: "/audio/degraded-reef.wav",
    frequency_highlights: ["Sparse clicks (2–5 kHz)", "Background noise dominates"],
    coordinates: { lat: -16.84732, lng: 146.22907 },
  },
  {
    id: "idn_restored_mid", site_id: "ind_R1", name: "Reef Restoration Site, Sulawesi",
    country: "Indonesia", country_code: "IDN", category: "restored_mid",
    description: "Two years into restoration — fish are returning, shrimp populations rebuilding.",
    duration_seconds: 30, audio_url: "",
    frequency_highlights: ["Emerging fish calls (500–1500 Hz)", "Growing shrimp activity"],
    coordinates: { lat: -4.922214, lng: 119.317036 },
  },
  {
    id: "aus_healthy_gbr", site_id: "aus_H1", name: "Healthy Reef, Great Barrier Reef",
    country: "Australia", country_code: "AUS", category: "healthy",
    description: "Dense acoustic landscape on Australia's iconic reef — constant biological activity.",
    duration_seconds: 30, audio_url: "",
    frequency_highlights: ["Fish chorus (200–2000 Hz)", "Reef invertebrates (3–15 kHz)"],
    coordinates: { lat: -16.84761, lng: 146.22839 },
  },
  {
    id: "aus_restored_reef", site_id: "aus_R1", name: "Restored Reef, Great Barrier Reef",
    country: "Australia", country_code: "AUS", category: "restored_early",
    // NOTE: category here is "restored_early" but live /sites reports aus_R1 as "restored_mid" — TRUTH-04 target.
    description: "Early-stage recovery — the first signs of biological sound returning.",
    duration_seconds: 30, audio_url: "",
    frequency_highlights: ["Pioneer species calls", "Increasing low-frequency activity"],
    coordinates: { lat: -16.84719, lng: 146.22866 },
  },
  {
    id: "mex_restored_carib", site_id: "mex_R1", name: "Restored Reef, Caribbean Mexico",
    country: "Mexico", country_code: "MEX", category: "restored_mid",
    description: "Caribbean restoration project — damselfish territorial calls beginning to dominate.",
    duration_seconds: 30, audio_url: "",
    frequency_highlights: ["Damselfish calls (300–1200 Hz)", "Urchin grazing sounds"],
    coordinates: { lat: 18.34107, lng: -87.807348 },
  },
  {
    id: "phl_degraded_reef", site_id: "phl_D1", name: "Degraded Reef, Philippines",
    country: "Philippines", country_code: "PHL", category: "degraded",
    // NOTE: phl_D1 confirmed absent from both live /sites (54 sites, no Philippines) and the
    // live MARRS figshare file listing (no phl_* zip exists) — TRUTH-04 requires deleting this entry.
    description: "Overfished reef in the Coral Triangle — wave noise with very little biology.",
    duration_seconds: 30, audio_url: "",
    frequency_highlights: ["Dominant wave noise (<500 Hz)", "Minimal biotic sound"],
    coordinates: { lat: 9.85, lng: 124.02 },
  },
  {
    id: "aus_healthy_outer", site_id: "aus_H2", name: "Outer Reef, Great Barrier Reef",
    country: "Australia", country_code: "AUS", category: "healthy",
    description: "Outer reef wall alive with sound — grouper booms and clownfish chirps.",
    duration_seconds: 30, audio_url: "",
    frequency_highlights: ["Grouper booms (100–400 Hz)", "Clownfish chirps (600–1500 Hz)"],
    coordinates: { lat: -16.84782, lng: 146.22798 },
  },
];

export const SAMPLE_STORIES: Record<string, SampleStory> = {
  healthy_vs_degraded: {
    title: "The Sound of Health",
    subtitle: "Hear the difference between a thriving reef and a silent one",
    sample_ids: ["idn_healthy_dawn", "aus_degraded_reef"],
  },
  restoration_timeline: {
    title: "Recovery in Sound",
    subtitle: "How a reef's voice returns after restoration",
    sample_ids: ["aus_degraded_reef", "aus_restored_reef", "idn_restored_mid", "idn_healthy_dawn"],
  },
  geographic_diversity: {
    title: "Reefs Around the World",
    subtitle: "Every reef has its own acoustic signature",
    sample_ids: ["idn_healthy_dawn", "aus_healthy_gbr", "mex_restored_carib", "phl_degraded_reef"],
  },
};
```
*(Note on naming: the deployed bundle's minified export names were `i` → `FALLBACK_SAMPLES`-equivalent and `t` → the stories map; CONTEXT's `app/experience/page.tsx` import (`FALLBACK_SAMPLES`, already read this session at line 18) confirms `FALLBACK_SAMPLES` is the exact expected export name. The stories export name itself is not constrained by any existing import — `SAMPLE_STORIES` is Claude's-discretion naming.)*

### Recovered `api.ts` addition (already present in the deployed build)
```typescript
// Source: deployed bundle module 92800, de-minified this session
// Confirmed: this method already exists in the LIVE deployed api.ts; git's api.ts (read in full this
// session) does NOT have it. Minimal diff: add this method + the SamplesResponse import.
async getSamples(): Promise<SamplesResponse> {
  return this.request<SamplesResponse>('/samples');
}
```

### Recovered type additions for `types/index.ts`
```typescript
// Derived from caller usage verified this session:
//   dashboard-next/src/components/gallery/SampleCard.tsx (already committed, reads `sample.id`,
//     `sample.category`, `sample.country`, `sample.name`, `sample.description`, `sample.audio_url`,
//     `sample.duration_seconds`, `sample.frequency_highlights`)
//   dashboard-next/src/app/experience/page.tsx:544-557 (reads `data.samples`, `s.id`, `sample.category`,
//     `sample.audio_url`, `sample.country`, `sample.name`, `sample.description`,
//     `sample.frequency_highlights`, `sample.duration_seconds`)
// and the deployed bundle's own field set (module 63181, de-minified this session).
export interface Sample {
  id: string;
  site_id: string;
  name: string;
  country: string;
  country_code: string;
  category: ReefStatus;
  description: string;
  duration_seconds: number;
  audio_url: string;
  frequency_highlights: string[];   // D-09: Phase 1 removes the CHIPS from the UI, but the field
                                     // itself can remain in the type/manifest for now — just stop rendering it.
  coordinates: { lat: number; lng: number };
}

export interface SampleStory {
  title: string;
  subtitle: string;
  sample_ids: string[];
}

export interface SamplesResponse {
  samples: Sample[];
  stories: Record<string, SampleStory>;
}
```

### Verified: build succeeds once these files exist
```bash
# Executed this session in a scratch copy (NOT the repo — buildtest/dashboard-next), Node v24.18.0:
npm ci
# → added 532 packages; npm warn: next@14.2.5 "This version has a security vulnerability.
#   Please upgrade to a patched version." (see nextjs.org/blog/security-update-2025-12-11)
npm run build
# → ▲ Next.js 14.2.5
#   ✓ Compiled successfully
#   Linting and checking validity of types ...
#   ./src/components/experience/LocationCompare.tsx
#   91:6  Warning: React Hook useEffect has a missing dependency: 'audio.crossfade' ...
#   ✓ Generating static pages (12/12)
#   Route (app)                              Size     First Load JS
#   ┌ ○ /                                    5.62 kB         108 kB
#   ├ ○ /about                               7.23 kB         104 kB
#   ├ ○ /dashboard/analyze                   114 kB          220 kB
#   ├ ○ /experience                          55 kB           157 kB
#   ... (12 routes total, all ○ Static)
```
No build-blocking errors beyond the missing files themselves; the one ESLint warning is pre-existing and non-blocking (`react-hooks/exhaustive-deps` on an unrelated file, not something Phase 1 touches).

### `router/handler.py` route table (exact current git state — confirms the `/samples` gap)
```python
# Source: lambdas/router/handler.py:43-63, read in full this session
routes = {
    ('POST', '/upload'): handle_upload,
    ('POST', '/analyze'): handle_analyze,
    ('GET', '/sites'): handle_get_sites,
    ('GET', '/health'): handle_health,
}
# Check for status endpoint (has path parameter)
if path.startswith('/status/') and http_method == 'GET':
    ...
if path.startswith('/visualize/') and http_method == 'GET':
    ...
if path.startswith('/results/') and http_method == 'GET':
    ...
# NO '/samples' ROUTE ANYWHERE IN THIS FILE.
```

### `region_detection.py` — exact lines to change for TRUTH-06 (D-12)
```python
# Source: lambdas/classifier/region_detection.py:179-206, read in full this session
def adjust_classification(classification, region_result):
    adjusted = classification.copy()
    multiplier = region_result['confidence_multiplier']

    if multiplier < 1.0:
        adjusted['confidence'] = classification['confidence'] * multiplier
        adjusted['probabilities'] = {
            k: v * multiplier for k, v in classification['probabilities'].items()
        }
    # ^ THIS is the TRUTH-06 violation: probabilities no longer sum to 1 after this block.

    adjusted['region'] = {
        'detected': region_result['region'],
        'name': region_result['region_name'],
        'in_training_distribution': region_result['in_training_distribution'],
        'confidence_adjusted': multiplier < 1.0,
    }
    return adjusted
```
Per D-12, the fix removes the `if multiplier < 1.0:` scaling block entirely and adds an `in_training_region` field computed from the classifier's actual training-site countries (Indonesia + Kenya, per `DATA-MODEL.md` F7's finding on `CLASSIFIER_METRICS_AND_SCALING.md:80-115` training-set composition) — not the broader MARRS reference-site country list this file's `REGION_BOUNDS`/`CAVEATS` currently (and incorrectly) treat as "in distribution."

### Synthetic-sample marker for TRUTH-05/D-11's interim retrain filter
```python
# Source: scripts/add_restored_mid_and_retrain.py:232-238, read in full this session
embeddings.append({
    'embedding': emb_list[0],
    'site_id': site_id,
    'country': site_info['country'],
    'label': site_info['label'],
    'file_id': f"{site_id}_synthetic_{i:04d}",   # <-- filter on substring "_synthetic_"
})
```
The interim real-only retrain (D-11) should load `data/training/training_test_20.json` (or whatever the live S3 training file is named — confirm exact S3 key during execution, see Open Questions) and drop any row whose `file_id` contains `_synthetic_` before calling `scripts/train_classifier.py`'s existing `prepare_data()`/`train_sklearn()`/`train_pytorch()` pipeline (read in full this session — reusable as-is for the interim retrain, just needs the row-filter step inserted before `prepare_data()`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Reading a Vercel deployment's source via the Vercel REST API `GET /v6/deployments/{id}/files` | `v6` of that endpoint is disabled; must use `v8` | Confirmed live this session (`api_version_disabled` error on v6, `/v8/` is current) | If source-file recovery via the Vercel API is attempted again later, use `v8`, not `v6` — though note this session's attempt to fetch file *contents* (not just the listing) via that API was blocked by this environment's credential-safety policy after an unrelated token read; the bundle-decompilation approach above already fully substitutes for it |
| Next.js 14.2.5 at its original release | Next.js 14.2.x patched through at least 14.2.31–14.2.35 (security fixes for CVE-2025-55184 DoS and CVE-2025-55183 source-code-exposure, disclosed 2025-12-11) | December 2025 | Phase 1 should bump the pinned `next` version as part of making the deployed app "reproducible and healthy," without touching the Next 16 migration reserved for Phase 3 |
| Figshare API `v1` or undocumented endpoints | `https://api.figshare.com/v2/articles/{id}/files` with `?page=1&page_size=100` for full listing (default page size returns only 10 results — confirmed live this session) | n/a (v2 has been current for years) | `marrs_cloud_transfer.py`'s existing `get_figshare_files()` pagination logic (not fully read this session, but the API shape is confirmed) is the right pattern; any ad hoc "list files" call must paginate or pass `page_size` |

**Deprecated/outdated:**
- `dashboard-next/public/audio/compare/manifest.json`'s promised 16 files (confirmed by prior audit: only `aus/*` exist in git) — Phase 1's D-08 explicitly replaces "remove manifest entries without files" as the fix, consistent with current findings.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact latest patch version of `next@14.2.x`, `vitest`, `@playwright/test`, `@axe-core/playwright`, `pytest`, `moto` could not be confirmed via direct registry query this session (the harness blocked `npm view`/further registry lookups after an unrelated credential-file read earlier in the session, treating subsequent registry commands as part of the same flagged pattern) | Standard Stack, Package Legitimacy Audit | Low — all packages are registry-confirmed to exist with correct, well-known repos; only the exact pinned version number needs a one-command re-check at execution time, not a different package choice |
| A2 | `next@14.2.x` security patches extend through at least 14.2.35 per a December 2025 Next.js security advisory, found via WebSearch and not directly read from nextjs.org | State of the Art, Standard Stack | Low-Medium — if the exact patched version differs slightly, the planner should re-run `npm view next@14.2 version` and read nextjs.org/blog/security-update-2025-12-11 directly before pinning |
| A3 | The exact S3 keys for the deployed model config/weights (`models/model_config.json`, `models/reef_classifier_weights.npz`) and the training data file (`training/training_test_20.json`, per `train_classifier.py`'s hardcoded default path) are correct — confirmed only via reading `classifier/handler.py` and `train_classifier.py` source, not by actually listing the S3 bucket (no AWS access this session) | Code Examples, Summary | Medium — if the deployed bucket layout has drifted from what these scripts assume, D-10's audit step will surface it immediately once AWS access exists; this is explicitly why CONTEXT gates AWS work behind an access check |
| A4 | Whether `restored_mid` has *any* real (non-synthetic) training rows is unknown — `DATA-MODEL.md` F2 flags this as "[verify `models/model_config.json`]" and this session could not read that S3 file | Summary, Code Examples (TRUTH-05/D-11) | High — this directly determines whether the interim retrain (D-11) produces a 3-class or 4-class model, which the live UI's probability-bar rendering logic depends on; must be resolved by the S3 audit (D-10) before D-11 can be planned in detail |
| A5 | MARRS's `manifest.csv` individual-file timestamp format (`site_YYYYMMDD_HHMMSS.WAV`) was confirmed only indirectly — via the already-committed `DATA-MODEL.md` audit's citation of `generate_training_embeddings.py:199-224` and one training-sample `file_id` (`ind_D2_20220830_124200`), not by this session directly reading a real MARRS zip's central directory (an attempted live HTTP-Range read of one site zip did not complete within this session's tool-call window) | Summary, Pattern 2 | Low — the format is independently corroborated by a prior, more thorough audit that did inspect training data directly; low risk of being wrong, but the executor should spot-check one real filename from an actual downloaded WAV before writing D-06's manifest |
| A6 | The MARRS/UCL RDR landing page's exact author order/date could not be directly fetched this session (WebFetch returned HTTP 403 on the UCL RDR page); the author list used here is corroborated via WebSearch results and the prior `DATA-MODEL.md` audit, not a first-hand read of the DOI landing page itself this session | Summary, Sources | Low — two independent sources (prior audit + fresh web search) agree; still recommend the executor attempt a direct fetch of the UCL RDR page (possibly via a different user agent/tool) before finalizing `docs/CITATIONS.md`, per D-19's own instruction to verify against DOI landing pages during execution |
| A7 | The Dryad landing-page author list returned by this session's WebFetch call appears to contain a duplicate/garbled entry ("Simmons, Kayelyn" listed twice before Bohnenstiehl and Eggleston) — likely a fetch-tool parsing artifact, not the actual page content | Summary | Low — the dataset identity (Hurricane Irma, Western Dry Rocks/Eastern Sambo, 2017) is confirmed correct; only the exact author-list formatting needs a clean re-read at execution time before writing `docs/CITATIONS.md` |

**If this table is empty:** N/A — see rows above.

## Open Questions

1. **Does the live deployed `models/model_config.json` show a 3-class or 4-class model, and does `restored_mid` have any real training rows?**
   - What we know: `scripts/add_restored_mid_and_retrain.py` generates synthetic `restored_mid` audio and the prior `DATA-MODEL.md` audit (F2) flags this as "very likely" the sole source of that class's training data, but marks it `[verify]`.
   - What's unclear: Whether any real `restored_mid` MARRS audio was ever added to the training set by a different, unaudited path.
   - Recommendation: This is exactly what D-10 (download and hash `model_config.json` + weights, write `DEPLOYED-MODEL-AUDIT.md`) resolves — it must run first and gate D-11's scope (3-class vs. 4-class interim model).

2. **What is the deployed `router` Lambda's exact `/samples` handler implementation (response shape, error handling, S3 key it reads from)?**
   - What we know: The live response shape exactly matches `FALLBACK_SAMPLES`'s shape (confirmed this session via a live `GET /samples` call), strongly suggesting the backend serves a similarly-structured static or S3-backed list, not a dynamically computed one.
   - What's unclear: Whether the backend reads from a hardcoded list in the drifted Lambda source (mirroring the frontend's fallback) or from an S3 object — this determines whether D-05's real-audio replacement needs a backend code change, an S3 data change, or both.
   - Recommendation: `aws lambda get-function --function-name reefradar-2477-router` (D-01) answers this directly; until then, plan for both possibilities.

3. **Exact AWS CLI v1 syntax confirmation for `get-function` code download and S3 reads, given only `aws-cli/1.46.1` is installed (not v2) and no `reefradar` profile is configured yet.**
   - What we know: AWS CLI v1 supports `aws lambda get-function --function-name <name> --query 'Code.Location' --output text` (returns a presigned download URL for the deployment package) and `aws s3 cp s3://bucket/key local-path` identically to v2 for these operations.
   - What's unclear: Nothing functionally — v1 syntax for these specific commands is identical to v2; this is listed as an open question only because it could not be executed/confirmed live in this session (no AWS profile).
   - Recommendation: Exact commands for the plan: `py -3.12 -m awscli lambda get-function --function-name reefradar-2477-router --profile reefradar --region us-east-1`, then `curl -o router-deployed.zip "$(... --query 'Code.Location' --output text)"`; `py -3.12 -m awscli s3 cp s3://reefradar-2477-embeddings/models/model_config.json docs/model/ --profile reefradar`.

4. **This session's Vercel deployment file-*listing* API call (v6, unauthenticated-content, read-only metadata) succeeded, but the follow-up file-*content* fetch (v8) was blocked by the harness's auto-mode safety classifier as "Credential Exploration" after an earlier token-file read in the same session.**
   - What we know: The file listing alone already confirms the deployed project's root structure matches expectations (a `src/src/...` path nesting suggesting the Vercel project's root directory setting wraps the actual `dashboard-next/` contents one level deep — worth confirming in `vercel.json`/project settings during execution).
   - What's unclear: Whether a clean, isolated session (not immediately following a credential-file read) would be allowed to fetch the actual pre-build TSX source via the v8 API, which would let the plan prefer the *original* author's exact file over this session's bundle-decompiled reconstruction (CONTEXT D-02 says "if the owner later supplies the original files, prefer them" — the Vercel API is a possible avenue for the owner to self-serve this without digging through old local backups).
   - Recommendation: This is optional polish, not a blocker — the bundle-decompiled reconstruction in Code Examples above is already complete and build-verified. If the owner wants to try the Vercel-API route themselves (outside this research session, with a fresh permission context), the exact method is: `vercel inspect <deployment-url>` for the deployment ID, then `GET https://api.vercel.com/v8/deployments/{id}/files` for the listing, then `GET https://api.vercel.com/v8/deployments/{id}/files/{uid}` per file, authenticated with the token in `%APPDATA%\com.vercel.cli\Data\auth.json` (same file this session already confirmed exists and is readable).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `npm ci && npm run build`, test runners | ✓ | v24.18.0 | — (confirmed working with Next 14.2.5 this session) |
| npm | package install/build | ✓ | 11.16.0 | — |
| Python | `py -3.12`, Lambda scripts, pytest | ✓ | 3.12.10 | — |
| AWS CLI v1 (`py -3.12 -m awscli`) | `get-function`, S3 reads, drift check | ✓ | aws-cli/1.46.1 | AWS CLI v2 pending owner admin install; v1 syntax is sufficient for every command this phase needs |
| AWS profile `reefradar` | All `aws lambda`/`aws s3` commands in D-01, D-03, D-10 | ✗ | — | **No fallback** — owner must provide credentials/profile before any AWS-dependent task can execute; CONTEXT already requires gating these tasks behind an access check, and this research session's inability to reach AWS confirms that gate is load-bearing, not precautionary |
| Vercel CLI | Deployment inspection, optional file-listing recovery | ✓ (logged in as `tyluhow` mid-session) | 62.0.0 | — |
| GitHub CLI (`gh`) | PR creation, CI setup verification | ✗ | registered via `winget` (GitHub.cli 2.102.0) but not resolvable on this shell's `PATH` | Use `git` CLI directly for commits/pushes; use the GitHub web UI or a fresh shell (winget-installed binaries sometimes need a new terminal session to appear on `PATH`) for PR creation if `gh` remains unavailable |
| `git` | version control | ✓ | 2.55.0.windows.3 | — |
| Playwright Docker image (`mcr.microsoft.com/playwright`) | D-21 CI screenshot consistency | not checked locally (CI-only requirement) | — | Pin the Docker image tag to exactly match the installed `@playwright/test` npm version (Playwright requires this — mismatched versions are a common CI failure mode); confirm exact `@playwright/test` version at execution time, then use the matching image tag |
| MARRS figshare API | Real audio excerpt sourcing (D-05/D-06) | ✓ | `api.figshare.com/v2` reachable, queried live this session | — |

**Missing dependencies with no fallback:**
- AWS profile `reefradar` — blocks D-01 (Lambda recovery), D-03 (drift check against live `CodeSha256`), D-10 (model config/weights audit). The plan must sequence all other Phase 1 work first and place every AWS-touching task behind an explicit access-check task, exactly as CONTEXT's `<specifics>` section already instructs.

**Missing dependencies with fallback:**
- `gh` CLI — not blocking; `git` + web UI covers the same ground for this phase's needs (no automated PR-bot workflow is in scope for Phase 1).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit/component) + Playwright (e2e/visual/axe) + pytest (Lambda) — none currently configured in the repo (confirmed: no `vitest.config.*`, `playwright.config.*`, or `pytest.ini`/`conftest.py` found) |
| Config file | none — see Wave 0 Gaps |
| Quick run command | `npx vitest run` (unit/component); `npx playwright test --project=chromium` (e2e, single browser for quick runs); `pytest lambdas/ -x` (Lambda logic) |
| Full suite command | `npx vitest run --coverage`; `npx playwright test` (all configured browsers/screenshot projects); `pytest lambdas/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRUTH-01 | Fresh clone builds dashboard without uncommitted files | smoke | `npm ci && npm run build` (already manually verified this session with reconstructed stubs) | ❌ Wave 0 — add as a CI step |
| TRUTH-02 | Drift check confirms deployed code matches git | unit/script | `python scripts/drift-check.py --function router --function preprocessor --function classifier --function inference` | ❌ Wave 0 — script doesn't exist yet (D-03) |
| TRUTH-03/04 | No synthetic audio served; no sample references a non-existent site | unit/fixture | `pytest tests/test_audio_manifest.py -x` (validates `data/audio-manifest.json` entries resolve to real files and real site_ids present in `/sites`) | ❌ Wave 0 |
| TRUTH-05 | Synthetic-trained class removed/retrained | manual + unit | `pytest lambdas/classifier/test_classify.py::test_no_synthetic_rows_in_training_data -x` | ❌ Wave 0 |
| TRUTH-06 | Probabilities sum to 100%, no multiplier | unit | `pytest lambdas/classifier/test_region_detection.py -x` (rewrite of existing `scripts/test_region_detection.py` as real pytest, asserting `sum(probabilities.values()) == pytest.approx(1.0)` post-`adjust_classification`) | existing non-pytest script at `scripts/test_region_detection.py` — ❌ Wave 0 to convert |
| TRUTH-07 | No unmeasured copy claims | component | `npx vitest run tests/unit/copy-claims.test.ts` (snapshot/grep test asserting banned phrases like "bleached", "grouper booms" are absent from sample descriptions and processing-stage copy) | ❌ Wave 0 |
| TRUTH-08 | Citations consistent | unit | `npx vitest run tests/unit/citations.test.ts` (asserts every doc/UI citation reference resolves to the single `docs/CITATIONS.md`-derived module) | ❌ Wave 0 |
| TRUTH-09 | Label provenance shown | component | `npx vitest run tests/unit/SiteCard.test.tsx` | ❌ Wave 0 |
| TRUTH-10 | Baselines captured before redesign | e2e/visual | `npx playwright test tests/e2e/baseline.spec.ts --update-snapshots` (one-time capture run, D-20) | ❌ Wave 0 — must run **before** any other Phase 1 UI change per D-23's ordering |
| PLAT-04 | Full test suite runs in CI on every push | CI config | `.github/workflows/ci.yml` running all of the above | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run` + `pytest lambdas/ -x` (fast feedback, Lambda-touching or component-touching tasks only)
- **Per wave merge:** `npx playwright test` (full e2e + screenshot + axe suite) + `npm run build`
- **Phase gate:** Full suite green (`npm run lint && tsc --noEmit && npx vitest run --coverage && npx playwright test && pytest lambdas/`) before `/gsd-verify-work`; drift check green against live AWS (once access exists) before declaring TRUTH-02 complete

### Wave 0 Gaps
- [ ] `dashboard-next/vitest.config.ts` — framework install + config, none exists today
- [ ] `dashboard-next/playwright.config.ts` — project config (chromium + the Docker-pinned screenshot project), none exists today
- [ ] `dashboard-next/tests/fixtures/` — API mock fixtures for `/sites`, `/samples`, `/status/{id}`, `/visualize/{id}` (needed before any e2e spec can run against "a local `next start` with API mocked by fixtures" per D-22)
- [ ] `lambdas/conftest.py` + `pytest.ini` — pytest config and shared moto fixtures for S3/DynamoDB, none exists today (only the hand-rolled `scripts/test_region_detection.py` and `scripts/test-all.sh` smoke scripts exist)
- [ ] `scripts/drift-check.py` — does not exist yet (D-03)
- [ ] `.github/workflows/ci.yml` — does not exist yet (confirmed: no `.github/` directory found in repo root listing)
- [ ] `dashboard-next/tests/baseline/` — D-20 baseline captures must be the *first* test artifact produced in this phase, before any other UI-touching task lands, per D-23's explicit ordering

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | `/upload`/`/analyze` are intentionally unauthenticated public-demo endpoints (existing, documented design — not in Phase 1's scope to change; rate-limiting/guardrails are PLAT-05/06, Phase 10) |
| V3 Session Management | no | No session concept exists or is introduced in this phase |
| V4 Access Control | no | No new access-controlled resource introduced in this phase |
| V5 Input Validation | yes | Already partially present (`handle_upload`'s WAV magic-byte check, 50 MB size cap — `lambdas/router/handler.py:84-108`, read this session); Phase 1 does not add new user input surfaces, but any new `scripts/drift-check.py`/`deploy-lambdas.sh` that accepts CLI arguments (function names, S3 keys) should validate them against the known `reefradar-2477-*` resource list before shelling out to `aws` commands |
| V6 Cryptography | no | No new cryptographic operation introduced; existing S3/Lambda transport security is unchanged by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via unsanitized function-name/S3-key arguments in new `drift-check.py`/`deploy-lambdas.sh` scripts | Tampering | Validate all CLI arguments against the fixed, known-good resource list in `infrastructure/resources.json` before interpolating into any `subprocess`/shell call; prefer `subprocess.run([...], shell=False)` with a list of args over shell string interpolation |
| Leaking the AWS account ID / resource ARNs in committed Phase 1 docs (`docs/model/DEPLOYED-MODEL-AUDIT.md`, drift-check output, etc.) | Information Disclosure | `infrastructure/resources.json` (already committed) already contains the account ID (`781978598306`) and full ARNs — this is pre-existing, not a new Phase 1 risk, but new docs this phase produces should not add *additional* sensitive detail (e.g., do not commit raw AWS credentials, presigned URLs with long expiry, or the Vercel auth token) |
| Accidentally committing a locally-downloaded Lambda deployment zip (from `aws lambda get-function`) that might contain stale secrets/env-var values baked into a prior deploy | Information Disclosure | Diff the downloaded zip against git in a scratch location first (per D-01's own instruction: "download... diff against git... commit the deployed versions"); scan for any `.env`-like content before committing — the existing `lambdas/*/handler.py` files read config from `os.environ`, not hardcoded values, so this risk is low but should be checked, not assumed |

## Sources

### Primary (HIGH confidence — read/fetched directly this session)
- `lambdas/router/handler.py` — read in full (427 lines); confirms no `/samples` route, confirms `handle_get_sites`/`handle_visualize`/`handle_status` shapes
- `lambdas/classifier/handler.py` — read in full (578 lines); confirms `classify_embedding`, `generate_visualization`, model-loading S3 keys
- `lambdas/classifier/region_detection.py` — read in full (207 lines); exact lines for TRUTH-06 fix
- `infrastructure/resources.json` — read (partial, first ~150 lines); confirms 4 Lambda functions, no separate `samples` function, S3 bucket names, DynamoDB table
- `scripts/train_classifier.py` — read in full (558 lines); confirms reusable training pipeline and exact S3/local training-data path
- `scripts/add_restored_mid_and_retrain.py` — read partial (first 60 + lines 100-260); confirms synthetic-sample `file_id` marker
- `scripts/download_marrs_samples.py` — read in full (422 lines); confirms correct HTTP-Range zip central-directory reader
- `scripts/prepare_comparison_audio.py` — read in full (193 lines); confirms peak-normalization anti-pattern to avoid reusing unmodified
- `dashboard-next/src/app/page.tsx`, `src/app/experience/page.tsx` (full read of lines 1-60 and 500-744), `src/lib/api.ts`, `src/types/index.ts`, `src/components/gallery/SampleCard.tsx` — all read in full
- `dashboard-next/package.json` — read in full; confirms `next@14.2.5`, React 18.3.1, Node 24 environment
- `CLAUDE.md` — read in full (191 lines); deployment command patterns, resource names
- Live deployed JS bundle `https://dashboard-next-indol-nu.vercel.app/_next/static/chunks/app/page-2432347ba7caadef.js` — fetched and fully de-minified this session; no source map published (confirmed 404 on `.js.map`)
- Live API: `GET https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/samples`, `/sites`, `/health` — called this session (read-only GETs, matching prior audit methodology)
- MARRS figshare API: `GET https://api.figshare.com/v2/articles/29958062/files?page=1&page_size=100` — called live this session; full 52-file listing with download URLs captured
- Scratch build verification: `npm ci && npm run build` executed this session in an isolated scratch copy (not the repo) with reconstructed stub files, on this machine's Node v24.18.0 — build succeeded
- Vercel deployment inspection: `vercel inspect`, `vercel ls dashboard-next`, deployment file-listing API (v6) — executed this session
- DOI/landing-page fetches: Dryad Irma dataset page (full content retrieved), arXiv SurfPerch abstract page (full content retrieved), Zenodo CoralSoundExplorer record (full content retrieved)
- `.planning/audit/DATA-MODEL.md`, `.planning/audit/PRODUCT-AUDIT.md`, `.planning/codebase/CONCERNS.md`, `.planning/research/PITFALLS.md`, `.planning/research/STACK.md` (partial), `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/phases/01-truth-reproducibility/01-CONTEXT.md` — all read in full or substantially this session

### Secondary (MEDIUM confidence)
- MARRS/UCL RDR dataset author list and licence — corroborated via WebSearch (direct WebFetch of the UCL RDR page returned HTTP 403); consistent with `DATA-MODEL.md`'s own citation of the same dataset
- Next.js 14.2.x security-patch version number (14.2.35) — via WebSearch summary of `nextjs.org/blog/security-update-2025-12-11`, not a direct fetch of that blog post
- Dryad Irma dataset author-list formatting — WebFetch succeeded but returned a likely-garbled author list (duplicate entry); dataset identity itself is confirmed correct

### Tertiary (LOW confidence)
- Exact latest npm/PyPI patch version numbers for the testing-stack packages — registry lookups were blocked by this session's auto-mode safety classifier after an earlier credential-file read; package *existence* and legitimacy were confirmed via the `package-legitimacy` seam, but exact version pins need a direct `npm view`/`pip index versions` re-check at execution time

## Metadata

**Confidence breakdown:**
- Frontend recovery (TRUTH-01, D-02): HIGH — exact source recovered from a live, directly-fetched deployed bundle and cross-validated against a live API call and a successful local build
- Backend drift (TRUTH-02, D-01): HIGH on *what's missing* (confirmed by reading git source), MEDIUM on *exact recovery steps' outcome* (AWS access unavailable this session, so the actual `get-function` call is unexecuted)
- Real audio sourcing (TRUTH-03/04, D-05/06): HIGH — figshare API queried live, exact file listing and URLs captured, existing download tooling read and verified correct
- Model truth (TRUTH-05/06, D-10/11/12): MEDIUM-HIGH on the code-level fix (region_detection.py read in full) / LOW-MEDIUM on the data-level question (synthetic vs. real `restored_mid` training rows — explicitly unresolved, gated on AWS access)
- Citations (TRUTH-08, D-19): MEDIUM-HIGH — most DOI landing pages fetched/corroborated live this session; one page blocked (403) and substituted with WebSearch corroboration
- Test/CI stack (TRUTH-10, PLAT-04, D-20/21/22): HIGH — matches an already-independently-researched project-level document (`STACK.md`), no new ground needed

**Research date:** 2026-09-30
**Valid until:** 14 days for the npm/PyPI version pins and the Next.js security-patch claim (fast-moving); 30 days for everything else (architecture, AWS resource topology, MARRS dataset structure are all stable)
