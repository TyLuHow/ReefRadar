---
phase: 01-truth-reproducibility
verified: 2026-10-01T20:00:00Z
status: passed
score: 5/5 roadmap success criteria verified (code, backend and CI); 1 owner decision outstanding before the phase goal holds for production visitors
behavior_unverified: 0
overrides_applied: 0
gaps: []
deferred:
  - truth: "Similar-site matching across the whole reference set / grouped leave-one-site-out evaluation"
    addressed_in: "Phase 5"
    evidence: "DEPLOY-LOG and TRAINING-REPORT both route grouped evaluation and all-site similarity to Phase 5; retraining with real restored_mid data to Phase 12"
  - truth: "restored_mid class served from a model with real training rows"
    addressed_in: "Phase 12"
    evidence: "TRAINING-REPORT.md: 'retraining on more real data is Phase 12'"
human_verification:
  - test: "Production frontend promotion. The live Vercel production deployment is still the pre-truth legacy UI (git ls-tree main shows public/audio/degraded-reef.wav, healthy-reef.wav and compare/aus/*.wav, the pre-truth audio set). Merge redesign/v2-discovery to main (or promote the preview) and open https://dashboard-next production in a browser."
    expected: "Landing, /sites, /about, /dashboard/analyze, /experience and the compare surfaces show only the 9 MARRS excerpts, 'assigned by MARRS' labels, the canonical DOI, no 'AI-powered' / species / scripted-processing copy, and integer class percentages summing to 100."
    why_human: "The backend (API, Lambdas, S3, model) is already truthful and verified live, but the product a visitor loads from production is the old frontend until the owner merges. By owner decision no merge was made this phase. The roadmap goal says everything the product serves is real; that is only literally true after this step."
  - test: "Review the 33 Linux visual baselines in dashboard-next/tests/e2e/visual.spec.ts-snapshots/ and the pre-truth screenshots in dashboard-next/tests/baseline/pre-truth/screenshots/ by eye."
    expected: "Each PNG shows a legible page (nav, titles, hero copy visible, no opaque magenta canvas block as in the first generated set) so they are a meaningful regression baseline."
    why_human: "CI proves the screenshots match themselves; only a person can judge that the stored baselines show the intended state."
  - test: "Run dashboard-next/tests/e2e/preview-truth-live.spec.ts against the Vercel preview with PW_VERCEL_BYPASS_SECRET set."
    expected: "3 of 3 pass against the real preview URL (landing card shows 'assigned by MARRS' and its audio plays with 200/206; about shows the DOI; Bora-Bora card shows Unknown with original label)."
    why_human: "The preview sits behind Deployment Protection. The spec was only run against a local production build of the same commit; the preview itself was checked with vercel curl (HTTP) only. Needs the owner's bypass secret."
  - test: "Optional residual: confirm AWS Service Quotas case for Lambda concurrency (10 -> 1000) is granted."
    expected: "Quota raised, so the router/inference path is not throttled when several visitors analyse at once."
    why_human: "External AWS review; not a code issue. Does not affect any Phase 1 truth."
---

# Phase 1: Truth and Reproducibility Verification Report

**Phase Goal:** Everything the product serves is real, attributed and honestly labelled, the deployed system is reproducible from git, and the pre-redesign app is captured as a regression baseline.
**Verified:** 2026-10-01
**Status:** human_needed
**Re-verification:** No, initial verification
**Commit verified:** 6a0c57b on redesign/v2-discovery (working tree clean)

SUMMARY.md and PHASE-1-EXIT.md claims were treated as unverified. I re-ran the cheap checks myself and read the code. All five roadmap success criteria hold in the codebase and in the live backend. The only open item is a decision, not a defect: production Vercel still serves the legacy frontend until the owner merges.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Fresh clone installs, builds and runs (gallery and samples included) with no uncommitted local files; CI runs unit, component, e2e, axe, visual suites on every push; visual, a11y and bundle-size baselines stored in repo | VERIFIED | `git status` clean at 6a0c57b. `src/components/gallery/{SampleCard,SampleGallery}.tsx` and `src/lib/samples.ts` are tracked (the files CLAUDE.md said were missing). `.github/workflows/ci.yml` triggers on `push` and defines web (lint, typecheck, `npm test`, build), e2e (Playwright routes + axe), python (pytest + generator `--check`s + manifest validation), citations, visual (Docker-pinned, `PW_VISUAL=1`). `gh run view 36914944442`: web, python, citations, e2e, visual all success on 6a0c57b (live-smoke correctly skipped; it is dispatch-only). Local re-run: `npx vitest run` 11 files / 71 tests pass; `pytest -p no:warnings` all pass. Baselines present: `tests/baseline/pre-truth/{axe/*.json (11 routes + summary), screenshots/*.jpg, routes.json}`, `tests/baseline/bundle-sizes.json` (Next 14.2.5 per-route raw/gzip), 33 Linux PNGs in `tests/e2e/visual.spec.ts-snapshots/`. Component tests exist as vitest + testing-library (`results-components.test.tsx`, `label-provenance.test.tsx`, `sites-page.test.tsx`). |
| 2 | Every deployed Lambda, including `/samples`, is built from repository source; a drift check reports deployed code matches git | VERIFIED | I ran `py -3.12 scripts/drift-check.py --function all`: router MATCH, preprocessor MATCH, classifier MATCH, inference MATCH, exit 0. The script builds each package deterministically from git via `scripts/lambda_packaging.py` and `infrastructure/lambda-packages/*.json`, then compares to the live function; AWS or network failures exit 2, never reported as match. `/samples` is `handle_get_samples` in `lambdas/router/handler.py` (route table line 75) and I confirmed `GET /samples` live returns the 9 manifest clips. Post-review redeploys (router @1efa3a1, classifier @6e2e962) are recorded in `docs/deploy/DEPLOY-LOG.md` and are consistent with the MATCH result. |
| 3 | Every playable clip is a real recording from a cited dataset; no sample references a site absent from the reference dataset (phl_D1 gone); sample labels match site labels (aus_R1) | VERIFIED | Live `GET /samples` returns 9 clips (aus_D1/H1/H2/R1, ind_D1/H1/N1/R1, mex_R1) with MARRS attribution; no `phl_*`. Live `GET /sites` returns 54 sites, `synthetic: false` for all, no `phl` id. `scripts/check_audio_real.py dashboard-next/public/audio` run by me: 9 WAVs, exit 0 (16 kHz, 30 s, no flag). `data/audio-manifest.json` carries per-clip figshare file id, source zip/file, offset, sha256, `gain_db: 0`, `normalized: false`, label and who assigned it. aus_R1 is `restored_mid` in both manifest and live `/sites`. The 8 retired synthetic clips are under `retired/` in S3 and return HTTP 403 publicly (checked); `samples/phl_degraded_reef.wav` returns 403. `/audio` in the frontend contains only `marrs/` plus `compare/manifest.json` (a pointer file, no audio). Remaining `phl_D1` strings in the repo are regression tests (`samples.test.ts`, `test_samples.py`), planning docs and legacy docs only, not served code. Streamlit legacy app only plays user-uploaded audio. `Math.sin` hits in `src` are equal-power crossfade gain curves and decorative canvas animation, not audio sources. |
| 4 | Live classifier's version, classes and training data are recorded; no synthetic-trained class is served; displayed class probabilities are unmodified model outputs summing to 100% | VERIFIED | Record: `docs/model/DEPLOYED-MODEL-AUDIT.md` and `docs/model/deployed-model.lock.json` (v2.0 weights/config sha256, S3 listing, `synthetic_class_detected: true`, `restored_mid` has zero real rows, code evidence trail to `add_restored_mid_and_retrain.py`). Interim replacement `models/interim-real-only/` (3 classes, 100 real rows over ind_D2/D3/H4/N1 + ken_H1, 0 synthetic) with `TRAINING-REPORT.md`; v2.0 archived at `models/archive/2.0-20261001/` per DEPLOY-LOG. I ran `scripts/verify_live_truth.py` once: exit 0, 5 PASS, 0 failures; two real analyses (ids adc4f593..., 23907c3a...) returned `model_version: interim-real-only`, probability sum 0.999999999, similar_sites 3, region detected as descriptive info only. Code: `classify_embedding` returns the raw softmax and raises if the sum is not 1 within 1e-6; `validate_model` rejects weight/label mismatches; `region_detection.adjust_classification` copies the classification and never scales label/confidence/probabilities (`confidence_adjusted` always False); the 0.6/0.7 multiplier is removed and pinned absent by `test_old_multiplier_behaviour_is_removed`. Frontend: `lib/probabilities.ts` largest-remainder rounding to exactly 100 and `presentClasses` never renders a class the model did not return (no fake `restored_mid` row). |
| 5 | A reviewer reading every route finds no unmeasured claim; corrected, consistent citations/DOIs; dataset-specific labels shown with who assigned them and what they mean | VERIFIED | `tests/unit/copy-claims.test.ts` bans about 45 phrases (species names, "snapping shrimp", "AI-powered", "real-time processing", fabricated reduced-confidence copy, hard-coded site counts, 90% accuracy, living-spectrogram) across all src ts/tsx/json plus served manifest and attribution; its ALLOW list is limited to two negative statements on About and fails if stale. It passes in my local vitest run. Greps for scripted processing text ("Identifying", "Measuring", "chorus") in src return nothing. The only fish/grazing/shrimp strings left are internal band identifiers in `useAudioVisualBridge`/`vitality-store`/comments, never rendered text (INFO). Citations: single source `src/data/citations.json` via `lib/citations.ts`; MARRS DOI 10.5522/04/29958062 (figshare record), SurfPerch arXiv 2404.16436, Irma 10.5061/dryad.5tb2rbp38 (de-duplicated author list), each with `verified_from` registry URL and a note on author discrepancies; `node scripts/check-citations.mjs --scope all` run by me: OK, 314 files, no banned pattern. Labels: live `/sites` carries `label_source`, `label_assigned_by`, `label_original`, `label_definition`, `status_basis` for all 54 sites; the 3 Bora-Bora sites are `unknown` with original term ("tourist", "boat traffic", "undisturbed") and a "not a coral-condition assessment" definition; the 2 Irma and 4 SanctSound sites are `unknown`, not healthy/degraded; MARRS definitions are the dataset's own. |

**Score:** 5/5 truths verified, 0 present-but-behavior-unverified.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | Grouped (leave-one-site-out) model evaluation; similarity quality beyond the interim result | Phase 5 | TRAINING-REPORT.md caveat; DEPLOY-LOG "Observation for Phase 5/12" |
| 2 | Real `restored_mid` training data and 4-class model | Phase 12 | TRAINING-REPORT.md; REQUIREMENTS lists retrain as later work |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `dashboard-next/src/components/gallery/SampleGallery.tsx`, `SampleCard.tsx`, `src/lib/samples.ts` | Previously uncommitted gallery sources | VERIFIED | Tracked in git; imported by `app/page.tsx` and experience page; built in CI |
| `data/audio-manifest.json` + `dashboard-next/public/audio/marrs/*.wav` | Real, provenanced clips | VERIFIED | 9 WAVs, sha256, figshare ids, validator OK |
| `scripts/drift-check.py`, `scripts/lambda_packaging.py`, `infrastructure/lambda-packages/*.json`, `scripts/deploy-lambdas.py` | Reproducible deploy and drift | VERIFIED | Drift check exits 0 against live |
| `docs/model/DEPLOYED-MODEL-AUDIT.md`, `deployed-model.lock.json`, `models/interim-real-only/` | Model record and real-only replacement | VERIFIED | Present, consistent with live behaviour |
| `dashboard-next/src/data/citations.json`, `lib/citations.ts`, `scripts/check-citations.mjs`, `docs/CITATIONS.md` | Canonical citations | VERIFIED | Gate passes at `--scope all` |
| `data/site-label-provenance.json`, `lambdas/shared/site_provenance.py` | Label provenance | VERIFIED | Reflected in live `/sites` |
| `tests/baseline/*`, `tests/e2e/visual.spec.ts-snapshots/*` (33) | Baselines | VERIFIED (content needs human eyes) | See human verification item 2 |
| `.github/workflows/ci.yml` | CI for all suites on push | VERIFIED | Last push run all green |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Router `/samples` | `data/gallery-stories.json` / S3 `samples/marrs/` | `handle_get_samples` presigns real object keys | WIRED | Live response has 9 real URLs, hash-matched by `verify_live_truth.py` |
| Classifier handler | S3 `models/model_config.json` + weights | `load_classifier_model` + `validate_model` | WIRED | Live model_version `interim-real-only` |
| Classifier output | `adjust_classification` | called at handler.py:172 | WIRED | Returns region object only; no scaling |
| API `/sites` | provenance overlay | `apply_label_provenance` | WIRED | All 54 sites carry provenance fields live |
| Frontend results | `toIntegerPercentages` / `presentClasses` | `AnalysisResults.tsx`, `ProbabilityBars.tsx` | WIRED | Unit-tested |
| UI pages | `citations.ts` | `about/page.tsx`, `audio-manifest.ts`, `label-source.ts` | WIRED | |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| Gallery cards | samples + attribution | `/samples` (live) and `audio-manifest.ts` (committed fixture of the same manifest) | Yes, real MARRS excerpts | FLOWING |
| Analysis results | `classification.probabilities`, `region` | classifier softmax, unscaled | Yes | FLOWING |
| Site cards | label provenance | `/sites` live | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Drift check all four functions | `py -3.12 scripts/drift-check.py --function all` | 4 x MATCH, exit 0 | PASS |
| Live truth end to end (run once) | `py -3.12 scripts/verify_live_truth.py` | 5 PASS, 0 failures, exit 0 | PASS |
| Audio is real | `py -3.12 scripts/check_audio_real.py dashboard-next/public/audio` | 9 OK, exit 0 | PASS |
| Manifest valid | `py -3.12 scripts/validate_audio_manifest.py` | 9 excerpts validated | PASS |
| Citations | `node scripts/check-citations.mjs --scope all` | OK, 314 files | PASS |
| Unit and component | `npx vitest run` (dashboard-next) | 71 / 71 | PASS |
| Python | `pytest -p no:warnings` | all pass, no failures | PASS |
| Live `/samples`, `/sites`, `/health` | curl GET | 9 clips, 54 sites no phl, 200 | PASS |
| Retired synthetic audio not public | curl HEAD retired/ and old samples/ keys | 403 | PASS |

### Probe Execution

No probe scripts are declared by the phase. The equivalent runnable checks (`verify_live_truth.py`, `drift-check.py`) are listed above.

### Requirements Coverage

All 11 IDs appear in PLAN frontmatter (checked across 01-01..01-20) and in REQUIREMENTS.md (all marked Complete, mapped to Phase 1). No orphaned requirements.

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| TRUTH-01 | 07, 08, 09, 20 | SATISFIED | Gallery/samples committed; CI builds from clean checkout |
| TRUTH-02 | 05, 09, 14, 20 | SATISFIED | Scripted deploy + drift check MATCH x4 |
| TRUTH-03 | 03, 12, 14, 17, 18, 20 | SATISFIED | 9 real clips, synthetic retired and private |
| TRUTH-04 | 03, 06, 12, 18 | SATISFIED | No phl_D1; aus_R1 label equal |
| TRUTH-05 | 10, 13, 14 | SATISFIED | Audit, lock file, interim real-only model live |
| TRUTH-06 | 11, 14, 15 | SATISFIED | Multiplier removed; sums verified live and in tests |
| TRUTH-07 | 11, 15, 16, 17, 18, 19, 20 | SATISFIED | Banned-claims gate in CI |
| TRUTH-08 | 02, 17, 19, 20 | SATISFIED | citations.json + gate |
| TRUTH-09 | 06, 11, 12, 14, 18, 19 | SATISFIED | Live provenance fields; Bora-Bora/Irma/SanctSound `unknown` |
| TRUTH-10 | 04, 07, 20 | SATISFIED | Pre-truth axe, screenshots, bundle sizes stored |
| PLAT-04 | 01, 08, 20 | SATISFIED | CI covers unit, component, e2e, axe, visual on push |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (changed lambdas/scripts/src/infrastructure/.github files) | n/a | TBD/FIXME/XXX scan | none | Zero unreferenced debt markers |
| `lambdas/classifier/handler.py` and others | n/a | 12 INFO items in 01-REVIEW.md (iteration 3, status clean, 0 critical, 0 warning) | INFO | Non-blocking (e.g. IN-09 eventual-consistency window, IN-01 refresh fallback) |
| `models/model_config.json`, `models/reef_classifier_weights.npz` (repo root) | n/a | Still the archived 4-class v2.0 model, which has the synthetic `restored_mid` class | INFO | Not served (live S3 is interim; deploy specs do not package it) but not marked archived in-tree; risk of someone re-publishing it. `publish_model.py` and the lock file guard this |
| `src/hooks/useAudioVisualBridge.ts`, `stores/vitality-store.ts`, `useBackgroundCanvas.ts` | various | Internal band ids named fish/grazing/shrimp; "shrimp burst" particles keyed to high-band energy | INFO | Not rendered text, so the banned-claims gate does not see it, but the decorative visual implies a biological attribution. Candidate for the Phase 2+ redesign |
| `.planning/phases/01-truth-reproducibility/01-VERIFICATION` consumers | n/a | MARRS short cite is "Williams & Jones 2025" (dataset record, 2 authors) while label strings read "MARRS research team (Williams, Jones et al. 2025)" and ROADMAP says "Williams et al. 2025" | INFO | The dataset-vs-paper author split is documented in `citations.json`; the "et al." wording on label strings is a cosmetic inconsistency |

### Human Verification Required

1. **Production frontend promotion.** Production Vercel still serves the legacy UI until `redesign/v2-discovery` is merged or the preview is promoted (`main` still contains `degraded-reef.wav`, `healthy-reef.wav`, `compare/aus/*.wav` and pre-truth copy). Test: merge/promote, then load production routes. Expected: only MARRS excerpts, provenance labels, canonical DOI, no banned copy, integer percentages summing to 100. Why human: owner decision, deliberately deferred; the literal goal "everything the product serves" depends on it.
2. **Visual baseline review.** Open the 33 Linux PNGs and the pre-truth screenshots. Expected: legible, intended pages (the first generated set was an opaque magenta canvas block and was regenerated). Why human: CI only proves self-consistency.
3. **Preview-truth spec against the real preview** with `PW_VERCEL_BYPASS_SECRET`. Expected 3/3 pass. Why human: needs the owner's secret; only run against a local build so far.
4. **AWS concurrency quota** (case pending). Operational, not a Phase 1 truth.

### Gaps Summary

No gaps. Every roadmap success criterion is backed by code I read and checks I executed (drift check, live-truth script, audio check, citation gate, vitest, pytest, live GETs, CI run 36914944442 all green on HEAD 6a0c57b). Status is `human_needed` rather than `passed` only because the product a production visitor sees is still the legacy frontend until the owner merges, and the stored visual baselines and preview-hosted e2e need a human or the owner's bypass secret. Known honest residuals, all out of Phase 1 scope: interim model labels the healthy-labelled ind_H1 excerpt as degraded (0.956), `restored_mid` not served until Phase 12, similar-site list includes the query's own site (Phase 5).

---

_Verified: 2026-10-01_
_Verifier: Claude (gsd-verifier)_

## Human Verification Outcome

Owner approved all human verification items on 2026-10-01 (see 01-UAT.md). Merge of `redesign/v2-discovery` to `main` follows the owner's preview of the redesign.
