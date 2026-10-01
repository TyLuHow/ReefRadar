# Phase 1: Truth & Reproducibility - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning
**Mode:** `--auto` (recommended options selected; see 01-DISCUSSION-LOG.md)

<domain>
## Phase Boundary

Make everything the *existing* product serves real, attributed and honestly labelled; make the deployed system reproducible from git; and capture the pre-redesign app as a regression baseline with CI. This phase corrects data, backend behaviour and copy inside the **legacy UI** — it does not redesign any screen (redesign starts Phase 3+).

Requirements: TRUTH-01 … TRUTH-10, PLAT-04.

</domain>

<decisions>
## Implementation Decisions

### Recovering uncommitted / drifted source (TRUTH-01, TRUTH-02)
- **D-01:** Recover the deployed `/samples` router code with `aws lambda get-function` (download the deployed zip for every `reefradar-2477-*` function), diff against git, and commit the deployed versions as the starting point before changing anything. Git becomes the source of truth from this commit on.
- **D-02:** Recreate `SampleGallery.tsx`, `lib/samples.ts`, the `Sample` type and `api.getSamples()` from (a) the deployed Vercel bundle (source maps if available, else de-minified behaviour), (b) callers (`app/page.tsx`, `app/experience/page.tsx`, `SampleCard.tsx`), and (c) `prompts/054-sample-audio-gallery.md`. Faithful behaviour, not redesign. If the owner later supplies the original files, prefer them.
- **D-03:** Add a drift check script (`scripts/drift-check.py`) that builds each Lambda package from git deterministically and compares its SHA-256 / file manifest with the deployed function's `CodeSha256`/downloaded package; exits non-zero on mismatch. Runs locally now; a scheduled GitHub Action (OIDC role) is added when AWS↔GitHub OIDC exists.
- **D-04:** All Lambda deployments go through one scripted path (`scripts/deploy-lambdas.sh` or Python equivalent) that builds from git; no console edits.

### Real audio replacement (TRUTH-03, TRUTH-04)
- **D-05:** Replace every synthetic clip (gallery `/samples`, `public/audio/*`, Location Compare files) with excerpts of **real MARRS recordings** from the figshare dataset (DOI 10.5522/04/29958062) — and only for sites present in the reference dataset. `phl_D1` is deleted. Sample labels are taken from the site record (fixes `aus_R1`).
- **D-06:** Excerpt selection is rule-based and documented in a committed manifest (`data/audio-manifest.json` or similar): source file name, recording timestamp (raw filename stamp, timezone marked *unverified* until Phase 8), offset, duration (default 30 s), site id, dataset, DOI, licence. Prefer matched time-of-day across sites being compared; record the time of day in the manifest so confounds are visible.
- **D-07:** Serve excerpts at the **native sample rate (16 kHz)** — no upsampling. No peak normalization in this phase; record the applied gain (0 dB) in the manifest. Fair level matching is Phase 7 (LISTEN-05).
- **D-08:** Location Compare: ship real audio only for locations/states with real recordings; remove manifest entries without files rather than leaving 404s. South Sulawesi (H/D/N/R) is the priority set.
- **D-09:** Sample descriptions are rewritten to state only what is known (site, dataset label and its definition, date/time, duration). No species, behaviour or "bleached" claims. Frequency-highlight chips removed.

### Model truth (TRUTH-05, TRUTH-06)
- **D-10:** First record the deployed model exactly: download `models/model_config.json` and weights from S3, hash them, and write `docs/model/DEPLOYED-MODEL-AUDIT.md` (version, classes, training rows by site/source, synthetic rows if any).
- **D-11:** If any class was trained on synthetic audio, retrain an **interim** classifier on the existing *real* training embeddings only (drop synthetic rows), same MLP architecture, versioned `interim-real-only`, and deploy it. Its evaluation is disclosed as limited; the proper grouped evaluation and retrain are Phases 5 and 12. If `restored_mid` has no real training data, the interim model is 3-class and the UI stops rendering a `restored_mid` probability.
- **D-12:** Remove the 0.6/0.7 region multiplier from probabilities and confidence. The API returns raw softmax probabilities (sum to 1) plus a separate `region` object (detected region, whether coordinates were provided, `in_training_region` computed from the actual training-site countries — Indonesia/Kenya only). The legacy UI renders probabilities as integers summing to 100 and shows region status as a separate note.

### Copy and visualization truth in the legacy UI (TRUTH-07, TRUTH-09)
- **D-13:** Remove the "Acoustic Embedding Space" scatter from the legacy results (it is meaningless); honest projection arrives in Phase 2/9. Stop the classifier from computing `generate_visualization` half-vector means.
- **D-14:** The decorative "living spectrogram" keeps running only as unlabelled ambience until Phase 3 removes it; all copy calling it a spectrogram or claiming it visualizes bands is removed.
- **D-15:** Scripted processing messages are replaced by real stages from `/status/{id}`; fake percentages removed. `/dashboard/analyze` polling switches to `/status` (fixes first-poll 404 failure).
- **D-16:** Crossfader fabricated descriptions (`ABCrossfader.getDescription`) removed; endpoint clips described statically from the manifest.
- **D-17:** Site label provenance: the site record gains `label_source` (dataset), `label_original` (dataset's own term), `label_definition`. Bora-Bora `tourist`/`boat_traffic` become status `unknown` with `label_original` shown (they describe disturbance context, not reef health). Irma sites become `unknown` with `period` noted. SanctSound stays `unknown`. Legacy UI shows "Label: <original> (assigned by <dataset>)".
- **D-18:** Hard-coded counts (54/7/4, "44 reference sites", "5 countries") are replaced by values derived from `/sites`.

### Citations (TRUTH-08)
- **D-19:** One canonical citations file (`docs/CITATIONS.md` + a JSON/TS module consumed by UI) holds MARRS (Williams, Jones et al. 2025, CC BY 4.0, DOI 10.5522/04/29958062), SurfPerch (arXiv 2404.16436), Hurricane Irma (Simmons, Bohnenstiehl & Eggleston, DOI verified against Dryad before writing), CoralSoundExplorer (Zenodo 10.5281/zenodo.14577064), NOAA SanctSound. All repo docs and UI read from / are corrected to this file. Exact author lists verified against the DOI landing pages during execution.

### Baselines and CI (TRUTH-10, PLAT-04)
- **D-20:** Capture baselines **before** any legacy-UI change in this phase: Playwright screenshots of every route at 1440/1024/390 widths, axe reports per route, `next build` bundle sizes. Stored under `dashboard-next/tests/baseline/` (and referenced, not regenerated, later).
- **D-21:** Test stack: Vitest (+ Testing Library) for units/components, Playwright for e2e + screenshot comparison, `@axe-core/playwright` for accessibility, pytest + moto for Lambda logic. Screenshots are generated and compared inside the official Playwright Docker image in CI (Linux) to avoid OS rendering diffs; local Windows runs skip screenshot assertions.
- **D-22:** GitHub Actions workflow runs lint, typecheck, unit, component, e2e (against a local `next start` with API mocked by fixtures), axe and screenshot suites on every push/PR. Live-API smoke tests (`scripts/test-all.sh` equivalents) run only on manual dispatch.
- **D-23:** Ordering inside the phase: baselines (D-20) → source recovery (D-01/02) → model audit (D-10) → backend truth fixes (D-11/12/13/15/17) → audio replacement (D-05–09) → copy/citation fixes → drift check green.

### Claude's Discretion
- Exact excerpt clip choices per site (within D-06 rules), file naming, and manifest schema details.
- Whether to use Python or bash for deploy/drift scripts.
- Test file organization and fixture format.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Integrity findings
- `.planning/audit/DATA-MODEL.md` — findings F1–F12 (synthetic audio, synthetic class, evaluation, label semantics, citation errors, provenance per dataset §5)
- `.planning/audit/PRODUCT-AUDIT.md` §0, §4, §7 — misleading visualizations, copy, repo↔live discrepancies
- `.planning/audit/CAPABILITY-MATRIX.md` — preservation contract (rows CAP-13…CAP-18, CAP-26, CAP-35…CAP-46)
- `.planning/codebase/CONCERNS.md` — build blocker, security, stale docs
- `.planning/research/PITFALLS.md` — leakage, confounds, probability semantics

### Code to change
- `lambdas/router/handler.py` — routes; `/samples` missing from source; `/status`, `/visualize`
- `lambdas/classifier/handler.py` — `classify_embedding`, `generate_visualization`, mean embedding
- `lambdas/classifier/region_detection.py` — `adjust_classification` multipliers
- `scripts/add_restored_mid_and_retrain.py` — synthetic audio generation (evidence for D-11)
- `scripts/train_classifier.py` — MLP training (reuse for interim retrain)
- `dashboard-next/src/app/page.tsx`, `src/app/experience/page.tsx`, `src/components/gallery/SampleCard.tsx` — gallery callers
- `dashboard-next/src/lib/api.ts` — `pollAnalysis`
- `dashboard-next/public/audio/**` — synthetic/demo audio and compare manifest
- `infrastructure/resources.json` — resource inventory

### Project-level
- `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md` (TRUTH-*, PLAT-04), `.planning/research/DRIVING-QUESTIONS.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/train_classifier.py`: pure-NumPy-exportable MLP training — reuse for interim real-only retrain (D-11).
- `scripts/marrs_cloud_transfer.py`, `scripts/download_marrs_samples.py`, `scripts/prepare_comparison_audio.py`: prior MARRS download/excerpt logic — reuse for D-05/D-06 (fix normalization/upsampling).
- `lambdas/router/handler.py: handle_status`: real pipeline stages already implemented — wire into UI (D-15).
- `scripts/test-all.sh`, `scripts/test_region_detection.py`: seeds for smoke and pytest suites.

### Established Patterns
- DynamoDB `pk/sk` (`UPLOAD#`, `ANALYSIS#` / METADATA, PREPROCESSED, RESULT, ERROR).
- React Query for `/sites`; zustand stores; Tailwind tokens in `tailwind.config.js` + `globals.css`.

### Integration Points
- S3 `reefradar-2477-audio/samples/` (gallery clips), `reefradar-2477-embeddings/reference/` and `/models/`.
- Vercel auto-deploys `dashboard-next` from `main` (deploys happen only after merge).

</code_context>

<specifics>
## Specific Ideas

- The owner's Core Value: never present synthetic audio as real or a model output as a diagnosis.
- Requires owner-provided access: AWS profile `reefradar` (Lambda get-function, S3 read/write, Lambda update), GitHub auth (CI), Vercel (preview deploys). Plans must place AWS-dependent tasks behind an access check and order non-AWS work (baselines, test harness, frontend reconstruction, citations) first.

</specifics>

<deferred>
## Deferred Ideas

- Level-matched (loudness-normalized) comparison playback — Phase 7 (LISTEN-05).
- Honest PCA projection — Phase 2 (contract) / Phase 9 (UI).
- MARRS timezone verification — Phase 8 (DATA-02); Phase 1 marks timestamps unverified.
- Proper grouped evaluation and full retrain — Phases 5 and 12.
- Scheduled drift check via GitHub OIDC — once AWS↔GitHub OIDC is configured.

</deferred>

---

*Phase: 01-truth-reproducibility*
*Context gathered: 2026-09-30*
