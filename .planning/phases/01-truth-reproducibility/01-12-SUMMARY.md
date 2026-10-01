---
phase: 01-truth-reproducibility
plan: 12
subsystem: backend
tags: [router, lambda, moto, boto3, label-provenance, audio-manifest, tdd]

# Dependency graph
requires:
  - phase: 01-truth-reproducibility
    provides: "lambdas/router/handler.py recovered deployed router (plan 01-09) -- the /sites and /samples routes this plan fixes"
  - phase: 01-truth-reproducibility
    provides: "lambdas/shared/site_provenance.py and data/site-label-provenance.json (plan 01-06), already wired into the classifier (plan 01-11)"
  - phase: 01-truth-reproducibility
    provides: "data/audio-manifest.json real-MARRS-excerpt gallery (plan 01-06)"
provides:
  - "lambdas/router/handler.py: handle_get_sites overlays apply_label_provenance on every site record (main path and S3-failure fallback); handle_get_samples reads the real-audio gallery from data/audio-manifest.json via get_audio_manifest() instead of the static CURATED_SAMPLES catalog"
  - "infrastructure/lambda-packages/router.json: bundles site_provenance.py, site_label_provenance.json and audio_manifest.json alongside handler.py -- one deterministic drift-checked package"
  - "lambdas/router/tests/test_sites.py, test_samples.py: first moto end-to-end tests for the router handler"
affects: [01-14, 01-15, 01-16, 01-20]

# Actuals (#2632)
actuals:
  tokens: 6643
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Router mirrors the classifier's module-level cache + loader pattern exactly: get_label_provenance()/_label_provenance (new in this plan) and get_audio_manifest()/_audio_manifest both cache-once-per-warm-container, with get_audio_manifest() reusing site_provenance.load_provenance()'s bundled-then-repo-relative path resolution strategy"
    - "/samples' presigned S3 key is built only from the manifest's own audio_path file name (os.path.basename), never from request input -- closes the information-disclosure threat (T-01-12-01) by construction"
    - "Gallery samples already carry the full Sample-shape attribution object and SampleStory-shape stories dict verbatim in data/audio-manifest.json -- handle_get_samples passes both through unchanged rather than reconstructing them"

key-files:
  created:
    - lambdas/router/tests/test_sites.py
    - lambdas/router/tests/test_samples.py
  modified:
    - lambdas/router/handler.py
    - infrastructure/lambda-packages/router.json

key-decisions:
  - "Deleted CURATED_SAMPLES/SAMPLE_STORIES entirely rather than keeping them as a fallback -- the plan's behavior spec requires a 500 SAMPLES_UNAVAILABLE when the manifest is missing, not a silent drop to the old (partly synthetic-provenance, partly mislabeled) static list"
  - "router.json's three new members (site_provenance.py, site_label_provenance.json from Task 1; audio_manifest.json from Task 2) are added incrementally per-task so each commit's package spec matches exactly what that task's code needs, instead of bundling audio_manifest.json a task early"
  - "Fallback /sites list (S3 unavailable) is passed through apply_label_provenance too -- the plan's must_haves explicitly require the fallback to carry the same provenance as the main path, not a reduced-truth version"

requirements-completed: [TRUTH-09, TRUTH-03, TRUTH-04]

coverage:
  - id: D1
    description: "GET /sites returns every site with label_source, label_original, label_definition, label_assigned_by, status_basis and, where relevant, period and label_note"
    requirement: TRUTH-09
    verification:
      - kind: integration
        ref: "lambdas/router/tests/test_sites.py::test_sites_returns_all_54_with_label_provenance"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bora-Bora disturbance-context sites and Hurricane Irma sites are served with status unknown; MARRS statuses are unchanged; the S3 failure fallback list carries the same provenance"
    requirement: TRUTH-09
    verification:
      - kind: integration
        ref: "lambdas/router/tests/test_sites.py::test_borabora_disturbance_sites_are_unknown_with_label_original, ::test_irma_sites_are_unknown_with_period_where_applicable, ::test_marrs_statuses_are_unchanged, ::test_s3_failure_fallback_carries_provenance_and_error_note"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /samples is served from the committed real-audio manifest: only real MARRS excerpts, only sites in the reference dataset, labels equal to the site records, same response shape as before"
    requirement: TRUTH-03
    verification:
      - kind: integration
        ref: "lambdas/router/tests/test_samples.py::test_samples_match_manifest_gallery_ids_and_fields, ::test_samples_stories_match_manifest_stories, ::test_no_phl_sample_in_gallery, ::test_aus_r1_category_is_restored_mid, ::test_no_sample_site_id_outside_reference_dataset, ::test_samples_unavailable_when_manifest_missing"
        status: pass
    human_judgment: false
  - id: D4
    description: "Router source, the provenance data and the audio manifest are bundled in one deterministic package, so the drift check covers them"
    requirement: TRUTH-04
    verification:
      - kind: unit
        ref: "scripts/tests (regression, unaffected -- router.json's real spec grows by 3 members, no stale exact-set assertion existed for it)"
        status: pass
      - kind: other
        ref: "py -3.12 scripts/deploy-lambdas.py --function router --dry-run (4-member build succeeds)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 12: Router Truth Fixes (Sites Provenance + Real Audio Samples) Summary

**Overlaid dataset label provenance on every `/sites` record (Bora-Bora and Hurricane Irma sites now honestly `unknown`, MARRS statuses untouched, fallback list included) and replaced `/samples`'s static synthetic-provenance catalog with the committed real-MARRS-audio manifest, keeping both response shapes unchanged for the current production frontend.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-10-01 (this session)
- **Completed:** 2026-10-01
- **Tasks:** 2/2
- **Files modified:** 4 (`lambdas/router/handler.py`, `infrastructure/lambda-packages/router.json`, `lambdas/router/tests/test_sites.py` [new], `lambdas/router/tests/test_samples.py` [new])

## Accomplishments
- `handle_get_sites` now routes every site record (main S3 path and the hard-coded S3-failure fallback) through the shared `apply_label_provenance()` -- the same function the classifier (plan 01-11) and fixtures already use, so the router can never drift from the single source of truth on label semantics
- `get_label_provenance()` added to the router, mirroring the classifier's identically-named cache helper exactly
- `handle_get_samples` rewritten: `get_audio_manifest()` loads and caches `data/audio-manifest.json`'s `gallery` section (bundled-copy-first, repo-relative fallback -- same strategy as `site_provenance.load_provenance()`); every sample's `audio_url` is a presigned GET built only from the manifest's own file name under the fixed `samples/marrs/` prefix; `attribution` and `stories` pass through verbatim from the manifest
- `CURATED_SAMPLES`/`SAMPLE_STORIES` (the recovered-but-partly-wrong static catalog from plan 01-09 -- included deleted `phl_D1`, mislabeled `aus_R1` as `restored_early`) deleted entirely; missing manifest now returns `500 SAMPLES_UNAVAILABLE` instead of any hard-coded fallback
- `infrastructure/lambda-packages/router.json` grew from 1 to 4 members across the two tasks: `site_provenance.py`/`site_label_provenance.json` (Task 1) then `audio_manifest.json` (Task 2) -- router source, provenance data and the audio manifest are now one deterministic, drift-checked package
- First moto end-to-end tests for the router handler: `test_sites.py` (6 tests, built from the real 54-site `data/snapshots/api-sites.json` snapshot) and `test_samples.py` (7 tests, built from the real `data/audio-manifest.json`)
- Verified against the real deployed router: `py -3.12 scripts/deploy-lambdas.py --function router --dry-run` builds a clean 4-member package; full `lambdas` suite (69 tests) and `scripts/tests` suite (unaffected) both green

## Task Commits

1. **Task 1 (tracer, TDD): GET /sites through the router handler with label provenance (moto S3)** - `f658a6a` (feat)
2. **Task 2: Serve /samples from the committed real-audio manifest** - `7ce75f7` (feat)

**Plan metadata:** this commit.

Tracer feedback gate: ran Task 1's full `<verify>` (`py -3.12 -m pytest lambdas/router/tests/test_sites.py -x`, 6 tests) plus both acceptance-criteria greps immediately after committing Task 1 (autonomous run, `_auto_chain_active: true`) -- all green, so Task 2 proceeded without a checkpoint.

## Files Created/Modified
- `lambdas/router/handler.py` - `apply_label_provenance`/`load_provenance` imported from `site_provenance`; `get_label_provenance()` and `get_audio_manifest()` module-level caches added; `handle_get_sites` overlays provenance on the main path and fallback; `handle_get_samples` rewritten to read the real-audio manifest gallery; `CURATED_SAMPLES`/`SAMPLE_STORIES` deleted
- `infrastructure/lambda-packages/router.json` - 3 new bundled members across the two task commits (`site_provenance.py`, `site_label_provenance.json`, `audio_manifest.json`)
- `lambdas/router/tests/test_sites.py` - new, 6 tests: full-54-site provenance, Bora-Bora/Irma unknown status, MARRS unchanged, `?has_embedding` filter, S3-failure fallback
- `lambdas/router/tests/test_samples.py` - new, 7 tests: manifest-shape parity, presigned `samples/marrs/` URLs, no `phl_` sample, `aus_R1` is `restored_mid`, no out-of-reference-dataset site, missing-manifest 500

## Decisions Made
- Deleted the static `CURATED_SAMPLES`/`SAMPLE_STORIES` catalog outright rather than keeping it as a secondary fallback -- the plan's behavior spec requires a `500 SAMPLES_UNAVAILABLE` on a missing manifest, and keeping the old catalog around as a silent fallback would have reintroduced exactly the synthetic-provenance/mislabeled-category problem this plan exists to fix
- Added `router.json`'s three new members incrementally, one task's worth at a time, so each task's commit bundles only what that task's code actually needs (Task 1: provenance members; Task 2: the audio manifest) rather than front-loading all three in Task 1
- `get_audio_manifest()`'s presigned key is built from `os.path.basename(sample['audio_path'])` (not a separately-stored file-name field) since the manifest's own `audio_path` is already the authoritative file name and this avoids a second place for the two to drift apart

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<behavior>` and `<acceptance_criteria>` were met without any Rule 1-3 fixes; no architectural changes (Rule 4) were needed.

## Issues Encountered
- moto/boto3 presigned URLs use virtual-hosted-style addressing (`https://<bucket>.s3.amazonaws.com/<key>...`), not path-style (`https://s3.amazonaws.com/<bucket>/<key>`) -- an initial test assertion checking `url.path.startswith(f"/{BUCKET}/")` failed; fixed to accept either form (checking the bucket in `netloc` or `path`), which also matches real AWS S3's default virtual-hosted-style behavior for a bucket name without dots.

## User Setup Required
None - no AWS access was needed for this plan; all verification was moto-mocked S3 and a local dry-run package build (`scripts/deploy-lambdas.py --function router --dry-run` makes no AWS call).

## Next Phase Readiness
- **Plan 01-14** (deploy): `router.json` is ready to build and deploy exactly as specified by this plan's response contract; the S3 objects under `samples/marrs/` must be uploaded by 01-14 before this code is deployed (per the plan's `<action>` note), otherwise `/samples`'s presigned URLs will point at objects that don't yet exist.
- **Plan 01-15** (UI): `/sites`' additive provenance fields (`label_source`, `label_source_name`, `label_assigned_by`, `label_original`, `label_definition`, `status_basis`, `period`, `label_note`) and `/samples`' additive `attribution` field are stable and ready for the legacy UI to render ("Label: <original> (assigned by <dataset>)" per D-17).
- No blockers for any dependent plan.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All 4 created/modified files found on disk (`lambdas/router/handler.py`, `infrastructure/lambda-packages/router.json`, `lambdas/router/tests/test_sites.py`, `lambdas/router/tests/test_samples.py`); both commits (`f658a6a`, `7ce75f7`) found in git history.
