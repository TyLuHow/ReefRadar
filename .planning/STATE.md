---
gsd_state_version: 1.0
milestone: v2
milestone_name: Reef Soundscape Research Instrument
current_phase: 2
current_phase_name: Data Contract v1
status: planning
stopped_at: Phase 1 complete, ready to plan Phase 2
last_updated: "2026-10-01T20:09:43.986Z"
last_activity: 2026-10-01
last_activity_desc: Phase 1 complete, transitioned to Phase 2
state_head: 27d95f5774b35008ca7b489015fc0bf5eaa9946d
progress:
  total_phases: 17
  completed_phases: 1
  total_plans: 20
  completed_plans: 20
  percent: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-30)

**Core value:** Every sound, label and number shown is real, traceable to its source, and honestly qualified — and a visitor can hear a real reef within seconds.
**Current focus:** Phase 01 — Truth & Reproducibility

## Current Position

Phase: 2 — Data Contract v1
Plan: Not started
Status: Ready to plan
Last activity: 2026-10-01 — Phase 1 complete, transitioned to Phase 2

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 20
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 20 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 15min | 3 tasks | 14 files |
| Phase 01 P02 | 15min | 3 tasks | 12 files |
| Phase 01 P03 | 35min | 2 tasks | 15 files |
| Phase 01 P04 | 12min | 2 tasks | 48 files |
| Phase 01 P05 | 14min | 3 tasks | 15 files |
| Phase 01 P06 | 35min | 3 tasks | 11 files |
| Phase 01 P07 | 38min | 3 tasks | 11 files |
| Phase 01 P08 | 55min | 3 tasks | 14 files |
| Phase 01 P09 | 25min | 3 tasks | 3 files |
| Phase 01 P10 | 45min | 2 tasks | 4 files |
| Phase 01 P11 | 50min | 2 tasks | 6 files |
| Phase 01-truth-reproducibility P12 | 35min | 2 tasks | 4 files |
| Phase 01 P13 | 20min | 2 tasks | 7 files |
| Phase 01 P15 | 55min | 3 tasks | 14 files |
| Phase 01-truth-reproducibility P16 | 70min | 3 tasks | 11 files |
| Phase 01 P17 | 70min | 3 tasks | 21 files |
| Phase 01-truth-reproducibility P18 | 55min | 3 tasks | 7 files |
| Phase 01-truth-reproducibility P19 | 55min | 3 tasks | 11 files |
| Phase 01 P14 | 25min | 3 tasks | 6 files |
| Phase 01 P20 | 100min | 3 tasks | 49 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Two tracks joined by a versioned data contract — UI/product (3, 4, 6, 7, 9, 10, 13–17) and Data & ML (5, 8, 11, 12); Data & ML phases run in parallel once their Depends on is met.
- [Roadmap]: Phase 2 (Data Contract v1) is the load-bearing gate for all instrument/bench/analysis/evidence UI; UI builds against contract fixtures.
- [Roadmap]: Leave-one-site-out harness lands in Phase 5 (before batch embedding and retrain); retrain is Phase 12.
- [Roadmap]: Analysis-as-search split into results (Phase 9, via precomputed sample analyses) then guarded public upload (Phase 10).
- [Roadmap]: Time features (Phase 14) build against coverage flags; the phase completes only when Phase 11 aggregates are published and activation is verified.
- [Phase 01]: Cleared Task 1 package-legitimacy gate via owner standing approval recorded in DRIVING-QUESTIONS.md, cross-verified against live npm/PyPI lookups
- [Phase 01]: Bumped @types/node to 24.13.6 to satisfy vitest@5.0.3 peer dependency (Rule 3 blocking-issue fix)
- [Phase 01]: Used oxc.jsx.runtime automatic instead of esbuild.jsx in vitest.config.ts (Vite 8 ignores esbuild JSX option)
- [Phase 01]: MARRS citations.json uses the figshare dataset's own 2 registered authors (Williams, Jones), not the bioRxiv paper's 16-author list; paper linked as a related entry
- [Phase 01]: Irma and CoralSoundExplorer dataset registry records list fewer/different authors than their companion papers; de-duplicated a registry-level duplicate author entry on Irma (Dryad + Zenodo mirror both affected)
- [Phase 01]: SanctSound has no single collection-level DOI upstream; recorded doi: null with the project landing page as url, per plan fallback
- [Phase 01]: Spectral synthetic-audio checker requires low flatness AND high concentration jointly (not OR), calibrated against real MARRS excerpt data to avoid false-flagging real fish-chorus tonality
- [Phase 01]: .gitignore marrs WAV exception added in Task 1 (not Task 2 as planned) since Task 1's done-criteria requires a committed WAV
- [Phase 01]: Captured pre-truth baseline (TRUTH-10) from the live production deployment, not a local build, since repo HEAD cannot build until plan 01-07 restores the gallery source
- [Phase 01]: Redaction of presigned-S3 query strings applies unconditionally to every axe report, not just gallery-adjacent routes, closing any gap in the T-01-04-01 mitigation
- [Phase 01]: normalize_text_bytes() (CRLF->LF) added to every lambda_packaging.py reader after discovering Windows core.autocrlf checkouts differ byte-for-byte from committed git blobs, which would have broken D-03/D-04's cross-platform build-determinism guarantee
- [Phase 01]: Fixed a conftest.py bare-module-name collision in lambdas/classifier/tests/test_load_lambda.py (plan 01-01) surfaced by adding scripts/tests/conftest.py, by loading lambdas/conftest.py via explicit importlib path
- [Phase 01]: Extended D-17's Bora-Bora reclassification to borabora_undisturbed (healthy->unknown), not just tourist/boat_traffic, recorded as a reversible note in data/site-label-provenance.json
- [Phase 01]: One shared apply_label_provenance() (lambdas/shared/site_provenance.py) overlays per-site label provenance for router, classifier and fixtures alike; load_provenance() prefers a bundled site_label_provenance.json next to the module, falling back to data/site-label-provenance.json
- [Phase 01]: Recovered SampleGallery.tsx directly from the live deployed bundle chunk (page-2432347ba7caadef.js), confirming SampleCard.tsx was never actually missing (byte-identical to git)
- [Phase 01]: Patched Next.js to exactly 14.2.35 (nextjs.org advisory's confirmed Fixed In version for the 14.x line, CVE-2025-55184), staying within 14.2.x; Vercel installCommand switched to npm ci
- [Phase 01]: Playwright e2e project testIgnore replaces (not merges) top-level testIgnore, so -live specs and gallery-parity.spec.ts must be explicitly re-excluded in each project that should stay fixture-mocked
- [Phase 01]: check-citations.mjs --scope docs excludes dashboard-next/tests/baseline/ — a frozen D-20 capture of the live deployment, not live documentation to hold to current citation standards
- [Phase 01]: D-01 recovery found drift only in router (/samples route); preprocessor, classifier, and inference already matched git byte-for-byte, confirmed via drift-check before committing anything
- [Phase 01]: [Phase 01] D-10 audit confirms deployed v2.0 model's restored_mid class has zero real training rows anywhere in S3 (training_with_restored_mid.json was never uploaded); interim_required=true, interim_num_classes=3 (degraded, healthy, restored_early)
- [Phase 01]: [Phase 01] 5 real training sites confirmed (ind_D2, ind_D3, ind_H4, ind_N1, ken_H1 — Indonesia and Kenya only) for plan 01-11's region-coverage fix
- [Phase 01]: [Phase 01] D-12 fix: training_countries is a global property of training_sites (not scoped to the matched region); in_training_region requires scope=='specific' AND a training site inside the matched box
- [Phase 01]: [Phase 01] D-13/D-17: generate_visualization() deleted entirely (legacy UI already handles its absence); find_similar_sites() routes every match through the shared apply_label_provenance()
- [Phase 01]: Deleted CURATED_SAMPLES/SAMPLE_STORIES outright instead of keeping as fallback -- missing audio manifest now returns 500 SAMPLES_UNAVAILABLE per D-05/D-09
- [Phase 01]: router.json's 3 new bundled members (site_provenance.py, site_label_provenance.json, audio_manifest.json) added incrementally, one task's worth per commit
- [Phase 01]: D-11 interim model: trained interim-real-only 3-class MLP (degraded, healthy, restored_early) on the 100 real rows in training_test_20.json, dropping restored_mid (zero real rows); weights proven byte-compatible with the deployed classifier's forward pass
- [Phase 01]: [Phase 01] vitest.setup.ts needed an explicit afterEach(cleanup) -- vitest.config.ts has no test.globals, so Testing Library's auto-cleanup detection never fired and multi-render component tests leaked DOM across tests in the same file
- [Phase 01]: [Phase 01] 01-15 D-12 UI half: toIntegerPercentages renormalises by the input's own sum (not assumed 1) so legacy multiplied probability payloads still render the correct percentages
- [Phase 01]: pollAnalysis reads request_id from GET /visualize's error payload (not /status's, which omits it) when an analysis fails
- [Phase 01]: AnalysisProgress error-step highlighting: 'uploading' marked complete, 'analyzing' marked as the errored step (fixes pre-existing dead error-branch bug)
- [Phase 01]: [Phase 01] 01-17: Location Compare manifest coordinates are the centroid of each location's real reference sites (data/snapshots/api-sites.json); no single canonical lat/lon existed per location
- [Phase 01]: [Phase 01] 01-17: excerptCaption()'s region slot uses the excerpt's country (only region-like field available) rather than a finer sub-region string
- [Phase 01]: [Phase 01] 01-17 Rule 2 deviation: extended the honest-copy fix beyond Task 2's declared files to dashboard/compare/page.tsx and the shared FrequencyBands.ts/FrequencyBandLabels.tsx, which made unlabelled species/behaviour claims on the same audio surfaces
- [Phase 01]: [Phase 01] 01-18: Reference-label lookup uses existing getExcerpt(sample.id) from audio-manifest.ts (sample id == manifest excerpt_id) rather than adding a new site_id-keyed export outside the plan's declared files
- [Phase 01]: [Phase 01] 01-18 Rule 1 fix: SampleGallery.tsx's STORY_ORDER referenced the pre-manifest 'restoration_timeline' key instead of 'restoration_ladder', silently dropping that story section
- [Phase 01]: [Phase 01] 01-19 D-17/D-18 UI: SiteCard/SitePopup use label_assigned_by as the primary 'assigned by' attribution, falling back to label_source_name; sites with no label_original show status_basis instead of a redundant 'Label: Unknown' line
- [Phase 01]: [Phase 01] 01-20: visual baselines hide canvases (visibility:hidden) instead of masking, since a masked fixed background canvas hid all top-of-page content; preview verified via vercel curl + local prod build because Deployment Protection is on

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Uncommitted gallery/samples files currently break a clean-clone build; deployed `/samples` route source is not in git.
- [Phase 1+]: Owner credentials (AWS, Vercel, GitHub) required for drift checks and deploys; AWS CLI v2 needs admin install (CLI v1 via `py -3.12 -m awscli` available).
- [Phase 8]: Owner must set the AWS spend ceiling before any transfer or compute job; MARRS filename timezone unverified (correctness gate for diel features).
- [Phase 11/12]: GPU vs CPU embedding throughput, Spot pricing and the Perch 2.0 Kaggle handle need re-verification before committing budget; calibration method at 5–10 real sites per class unresolved.
- [Phase 14/16/17]: If the Data & ML track stalls (budget, credentials), Phase 14 cannot complete, which holds Phases 16 and 17.
- [Ops]: AWS Lambda account concurrency limit is 10; Service Quotas request 4b8d23edbdcf43d9a9eee46fddc7b589IQUhYJr5 (to 1000) pending. Warm the inference container and run analyses serially until granted (see docs/deploy/DEPLOY-LOG.md).

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-01T17:15:23.508Z
Stopped at: Phase 1 complete, ready to plan Phase 2
Resume file: None
