---
gsd_state_version: 1.0
milestone: v2
milestone_name: Reef Soundscape Research Instrument
current_phase: 3
current_phase_name: Platform Upgrade & Stack Consolidation
status: executing
stopped_at: Completed 03-03-PLAN.md
last_updated: "2026-10-02T18:19:53.807Z"
last_activity: 2026-10-02
last_activity_desc: Phase 3 execution started
state_head: 022623bd97707650675fdfce6ab9c56c8f79255b
progress:
  total_phases: 17
  completed_phases: 2
  total_plans: 48
  completed_plans: 36
  percent: 12
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-02)

**Core value:** Every sound, label and number shown is real, traceable to its source, and honestly qualified — and a visitor can hear a real reef within seconds.
**Current focus:** Phase 3 — Platform Upgrade & Stack Consolidation

## Current Position

Phase: 3 (Platform Upgrade & Stack Consolidation) — EXECUTING
Plan: 4 of 15
Status: Ready to execute
Last activity: 2026-10-02 — Phase 3 execution started

Progress: [████████████████████] 20/20 plans ([█░░░░░░░░░] 12%)

## Performance Metrics

**Velocity:**

- Total plans completed: 33
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 20 | - | - |
| 2 | 13 | - | - |

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
| Phase 02 P01 | 11min | 3 tasks | 26 files |
| Phase 02 P02 | 20min | 2 tasks | 4 files |
| Phase 02 P03 | 45min | 2 tasks | 31 files |
| Phase 02 P05 | 25min | 2 tasks | 8 files |
| Phase 02 P04 | 40min | 3 tasks | 4 files |
| Phase 02 P07 | 25 min | 3 tasks | 17 files |
| Phase 02 P06 | 65 min | 3 tasks | 2 files |
| Phase 02 P08 | 20 min | 2 tasks | 13 files |
| Phase 02 P09 | 40min | 3 tasks | 17 files |
| Phase 02 P10 | 35min | 2 tasks | 13 files |
| Phase 02 P11 | ~50min | 2 tasks | 4 files |
| Phase 02 P13 | 110 min | 3 tasks | 8 files |
| Phase 02 P12 | 45min active (plus pause for 02-13) | 2 tasks | 2 files |
| Phase 03 P01 | 12min | 2 tasks | 3 files |
| Phase 03 P02 | 15min | 2 tasks | 7 files |
| Phase 03 P03 | 20 min | 3 tasks | 3 files |

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

- [Owner, 2026-10-01]: Hold the merge of `redesign/v2-discovery` to `main` (production frontend) until the UI/UX overhaul is far enough along to be worth a visible launch (after Phases 4/6 at the earliest). Backend truth fixes are already live; production frontend stays on the legacy UI meanwhile.
- [Phase 01 review]: Router now answers CORS preflight (OPTIONS, 204); before 6aca641 every browser POST /upload was blocked (pre-existing). Experience entry copy "classify reef health" logged for the Phase 4/7 copy pass.
- [Phase 2]: 02-01: contracts/bucket/v1/sites.json is {schema_version, sites[]}; config_sha256 is over LF bytes and config_sha256_deployed records the CRLF hash of the deployed config
- [Phase 02]: 02-02: managed SimpleCORS (wildcard origin, no credentials) for the public contract CDN; storage confirm gated on a verified budget alarm; contract CloudFront domain d7dr1fzple2sg.cloudfront.net
- [Phase 2]: 02-03: once a version is in PUBLISHED.json its bundled schema copies are frozen; copy-equals-source and rebuild comparison are skipped for it, immutability guarded by manifest sha256 plus structural --additive
- [Phase 2]: 02-03: projection.json/embeddings.f32 reused unless --recompute-projection/--reference-metadata; PCA verified by tolerance (1e-8 components, 2e-6 coordinates), not hash, so numpy 1.26.4 and 2.5.3 agree
- [Phase 2]: [Phase 02] 02-05: stamp_for_model nulls contract/dataset/preprocessing versions unless the loaded model version equals the bundled stamp's model; an unloadable stamp writes nulls instead of failing the analysis
- [Phase 2]: [Phase 02] 02-04: contract publisher uses S3 If-None-Match for immutability with a read-only preflight, pointer last via If-Match on its ETag; --confirm is gated on the ceiling budget alarm; --set-latest rollback verifies the bucket against PUBLISHED.json
- [Phase 2]: [Phase 02] 02-04: clean-tree requirement applies to publish --confirm only; --set-latest and --dry-run are not blocked by an uncommitted tree
- [Phase 02]: 02-07: zod 4.4.3 pinned on the owner's standing approval; the contract module is the only web fetch path, verifying sha256 of every response and Zod-parsing it; Zod mirror equals Python verdicts on all 483 corpus entries
- [Phase 2]: [Phase 02] 02-08: ?cv pins an exact contract version via one Suspense leaf writing a store the hooks wait on; a missing or malformed pin shows an alert and never falls back to latest; unpinned pages follow latest.json with keepPreviousData so a flip does not blank the view
- [Phase 02]: 02-13: contract CDN uses custom wildcard CORS policy reefradar-2477-contract-cors (GET/HEAD/OPTIONS allowed, GET/HEAD cached); Managed-SimpleCORS answered only simple CORS requests so real browser reads were blocked
- [Phase 02]: 02-13 (owner 2026-10-02): accept that the CDN answers CORS preflights 403 (OPTIONS relayed to S3); verifier preflight probe is report-only and a unit guard (contract-no-preflight.test.ts) keeps the contract client from ever setting request headers
- [Phase 2]: 02-12: live contract proof runs against a local production build of the branch (Vercel preview protected); the tracer found the CDN browser CORS defect, fixed by 02-13
- [Phase 3]: [Phase 03] 03-01: PLAT-10 guard tests (api-client, query-defaults, security-headers) added with no source change; security-headers test requires the three headers with exact values but tolerates extra ones
- [Phase 3]: 03-02: stack-consolidation.test.ts is the single growing gate; REMOVED_PACKAGES is append-only for 03-08/03-10/03-11
- [Phase 03]: 03-03: Hop 1 (Next 15.5.26 / React 19.3.0) via official codemod; codemod's eslint 9, --turbopack dev script and @types overrides rejected; react-leaflet-scoped peer override is temporary (delete in 03-10); PLAT-01 stays open until Next 16

### Pending Todos

None yet.

### Blockers/Concerns

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

Last session: 2026-10-02T18:19:53.257Z
Stopped at: Completed 03-03-PLAN.md
Resume file: None
