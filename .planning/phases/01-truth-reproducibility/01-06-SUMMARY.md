---
phase: 01-truth-reproducibility
plan: 06
subsystem: data
tags: [provenance, marrs, data-model, citations, fixtures, gallery, python, stdlib]

# Dependency graph
requires:
  - phase: 01-truth-reproducibility
    provides: pytest + moto offline Lambda test harness (lambdas/conftest.py) and lambdas/shared sys.path wiring from plan 01-01/01-05
  - phase: 01-truth-reproducibility
    provides: real MARRS excerpts + data/audio-manifest.json "excerpts" (9 sites, 30s @ 16kHz, D-06) from plan 01-03
  - phase: 01-truth-reproducibility
    provides: verified citations.json (marrs/surfperch/irma/coralsoundexplorer/sanctsound ids) from plan 01-02
provides:
  - "data/site-label-provenance.json: per-source label definitions and per-site provenance overrides (D-17)"
  - "lambdas/shared/site_provenance.py: apply_label_provenance(site, prov) + load_provenance(path), stdlib-only, importable by router/classifier/fixtures alike"
  - "data/audio-manifest.json gallery section: honest sample descriptions + 3 stories generated from real excerpts, enforced by tests (TRUTH-04)"
  - "dashboard-next/tests/fixtures/api/{sites,samples}.json: post-truth API shape for e2e tests (D-22)"
affects: [01-11, 01-12, 01-17, 01-18, 01-19, 01-08]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 27900
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "One stdlib-only apply_label_provenance(site, prov) function shared by lambdas/shared/site_provenance.py, scripts/build_gallery_manifest.py and scripts/build_api_fixtures.py, so label provenance can never drift between the router, the classifier, and test fixtures again"
    - "load_provenance(path=None) checks for a bundled site_label_provenance.json next to the module first (the Lambda package layout plans 01-11/01-12 will produce), falling back to the repo's data/site-label-provenance.json -- no env var needed to distinguish deployed vs. local"
    - "Generators (build_gallery_manifest.py, build_api_fixtures.py) write sorted-keys/2-space-indent/LF JSON and are proven idempotent by a test that re-runs the generator and diffs bytes against the committed file"
    - "build_api_fixtures.py --check reads the committed fixture via read_text() (universal-newline translation) and compares against an LF-joined fresh render, so the check is correct on a Windows core.autocrlf checkout without needing a normalize_text_bytes() helper"

key-files:
  created:
    - data/site-label-provenance.json
    - lambdas/shared/site_provenance.py
    - lambdas/shared/tests/test_site_provenance.py
    - data/gallery-stories.json
    - scripts/build_gallery_manifest.py
    - scripts/tests/test_build_gallery_manifest.py
    - scripts/tests/test_audio_manifest.py
    - scripts/build_api_fixtures.py
    - dashboard-next/tests/fixtures/api/sites.json
    - dashboard-next/tests/fixtures/api/samples.json
  modified:
    - data/audio-manifest.json

key-decisions:
  - "Applied the D-17 disturbance-context rationale to borabora_undisturbed as well as borabora_tourist/borabora_boat_traffic (status healthy -> unknown): CoralSoundExplorer frames all three Bora-Bora points as one disturbance-gradient study, not a MARRS-style health survey, so none of the three should carry a ReefRadar-invented health status. Recorded as a reversible 'decisions' note inside data/site-label-provenance.json per the plan's explicit instruction; the owner can delete that one override to revert it."
  - "load_provenance()'s bundled-package filename is site_label_provenance.json (underscores) while the repository file is data/site-label-provenance.json (hyphens), matching the plan's literal text verbatim -- the two names are intentionally different so a future accidental same-directory collision between the repo checkout and a deployed Lambda package layout is structurally impossible."
  - "gallery sample descriptions use label_assigned_by generically (not hardcoded 'MARRS') even though all 9 current excerpts are MARRS sites, so the generator keeps producing correct text unmodified if a non-MARRS excerpt is ever added to data/audio-manifest.json."
  - "scripts/build_api_fixtures.py's samples.json fixture intentionally drops excerpt_id and keeps only the documented Sample fields (id, site_id, name, country, country_code, category, description, duration_seconds, audio_url, frequency_highlights, coordinates) plus attribution, so downstream UI consumers (01-17/01-18/01-19) see exactly the shape they're meant to type against."

requirements-completed: [TRUTH-09, TRUTH-04]

coverage:
  - id: D1
    description: "All 54 reference sites resolve to a label provenance record (which dataset assigned the label, the dataset's own term, and what it means) via one shared apply_label_provenance() function"
    requirement: TRUTH-09
    verification:
      - kind: unit
        ref: "lambdas/shared/tests/test_site_provenance.py (9 tests)"
        status: pass
      - kind: other
        ref: "py -3.12 -c \"...assert len(o)==54 and all(x['label_source'] for x in o)\" (plan acceptance criteria)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Bora-Bora disturbance-context sites and Hurricane Irma sites carry status unknown with original term/period shown; SanctSound stays unknown; MARRS statuses unchanged"
    requirement: TRUTH-09
    verification:
      - kind: unit
        ref: "lambdas/shared/tests/test_site_provenance.py::test_borabora_tourist_and_boat_traffic_become_unknown"
        status: pass
      - kind: unit
        ref: "lambdas/shared/tests/test_site_provenance.py::test_irma_western_dry_rocks_is_unknown_with_post_hurricane_period"
        status: pass
      - kind: unit
        ref: "lambdas/shared/tests/test_site_provenance.py::test_sanctsound_sites_are_unknown_with_null_label_original"
        status: pass
      - kind: unit
        ref: "lambdas/shared/tests/test_site_provenance.py::test_overlay_never_invents_a_non_unknown_status"
        status: pass
    human_judgment: false
  - id: D3
    description: "Gallery content (names, descriptions, stories) generated from real excerpts and site records: no sample references a site absent from the reference dataset, every sample's category equals its site's status (aus_R1 is restored_mid), descriptions state only site/label/definition/date-time/duration"
    requirement: TRUTH-04
    verification:
      - kind: unit
        ref: "scripts/tests/test_build_gallery_manifest.py (13 tests, incl. test_descriptions_avoid_banned_claims, test_aus_r1_category_is_restored_mid, test_regenerating_manifest_is_idempotent)"
        status: pass
      - kind: other
        ref: "py -3.12 -c \"...assert s['aus_R1']=='restored_mid' and not any(k.startswith('phl') for k in s) and len(g['stories'])==3\" (plan acceptance criteria)"
        status: pass
    human_judgment: false
  - id: D4
    description: "API fixtures (sites.json, samples.json) exist in the post-truth shape, provably generated by the same overlay the router will deploy, no presigned-URL markers"
    requirement: TRUTH-04
    verification:
      - kind: unit
        ref: "scripts/tests/test_build_gallery_manifest.py::test_build_api_fixtures_check_mode_passes"
        status: pass
      - kind: other
        ref: "py -3.12 scripts/build_api_fixtures.py --check (exit 0); grep -c 'X-Amz|AWSAccessKeyId' samples.json (0); node -e \"...s.length===54&&b.every(status==='unknown'&&label_original)\" (plan acceptance criteria)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-10-01
status: complete
---

# Phase 1 Plan 6: Site Label Provenance & Honest Gallery Content Summary

**One shared `apply_label_provenance()` function now overlays per-site label provenance onto all 54 reference sites (reclassifying 5 non-MARRS sites to `unknown`), and the sample gallery (9 samples, 3 stories) plus two post-truth API fixtures are generated from it and from real excerpts, with no banned biology/condition claims.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-10-01
- **Tasks:** 3
- **Files modified:** 11 (9 created, 1 heavily rewritten, 1 fixtures dir created)

## Accomplishments

- `data/site-label-provenance.json` + `lambdas/shared/site_provenance.py`: one stdlib-only `apply_label_provenance(site, prov)` function, tested against all 54 sites in the live snapshot, that adds `label_source`, `label_source_name`, `label_assigned_by`, `label_original`, `label_definition`, `status_basis`, `period`, `label_note` without ever inventing a non-`unknown` status or touching a MARRS status.
- `data/audio-manifest.json` gallery section: all 9 committed real MARRS excerpts now carry a `label` object; `gallery.samples` (9 entries) and `gallery.stories` (3 entries: `healthy_vs_degraded`, `restoration_ladder`, `geographic_diversity`) generated by `scripts/build_gallery_manifest.py`, which is proven idempotent and whose descriptions are tested against a banned-claims list.
- `scripts/tests/test_audio_manifest.py`: wraps the existing `validate_audio_manifest.py`/`check_audio_real.py` (from 01-03) as pytest so CI runs them automatically.
- `dashboard-next/tests/fixtures/api/sites.json` + `samples.json`: post-truth API fixtures generated by `scripts/build_api_fixtures.py --check`-verified against the same overlay code, with no presigned-URL markers in `samples.json`.

## Task Commits

Each task followed RED → GREEN (test="true" on every task):

1. **Task 1: Tracer — provenance record to overlay function to one overlaid site in each source**
   - `81fcf85` test(01-06): add failing test for site label provenance overlay
   - `5acb5b4` feat(01-06): implement site label provenance overlay (D-17)
   - Tracer feedback gate: re-ran `py -3.12 -m pytest lambdas/shared/tests/test_site_provenance.py -x` after commit — 9/9 passed, expanded to Task 2 (auto mode active, `_auto_chain_active: true`).
2. **Task 2: Generate gallery content from real excerpts and site records (D-05, D-09, TRUTH-04)**
   - `849a91b` test(01-06): add failing tests for gallery manifest generation
   - `a978ad8` feat(01-06): generate gallery content from real excerpts (D-05, D-09)
3. **Task 3: Post-truth API fixtures for /sites and /samples generated by the shared code**
   - `b181172` test(01-06): add failing test for API fixtures --check mode
   - `9f8b0ee` feat(01-06): generate post-truth /sites and /samples API fixtures (D-22, D-17)

**Plan metadata:** committed via final `docs(01-06)` commit (see below).

## Files Created/Modified

- `data/site-label-provenance.json` — per-source definitions (MARRS class definitions + original terms) and per-site overrides for Bora-Bora, Irma, SanctSound, ken_D3.
- `lambdas/shared/site_provenance.py` — `load_provenance()` + `apply_label_provenance()`, stdlib only.
- `lambdas/shared/tests/test_site_provenance.py` — 9 tests covering all behaviour bullets.
- `data/gallery-stories.json` — 3 story definitions (title/subtitle/site list), resolved to excerpt ids by the generator.
- `scripts/build_gallery_manifest.py` — generates `excerpts[*].label` and `gallery.{samples,stories}` into `data/audio-manifest.json`.
- `data/audio-manifest.json` — now carries label objects + gallery section (438 insertions, 132 deletions from the 01-03 baseline).
- `scripts/tests/test_build_gallery_manifest.py` — 14 tests (gallery shape, banned claims, idempotency, API-fixtures `--check`).
- `scripts/tests/test_audio_manifest.py` — 3 tests wrapping `validate_audio_manifest.py`/`check_audio_real.py`.
- `scripts/build_api_fixtures.py` — renders both fixtures deterministically; `--check` mode.
- `dashboard-next/tests/fixtures/api/sites.json` — 54 sites, post-overlay.
- `dashboard-next/tests/fixtures/api/samples.json` — `{samples, stories}` in the `/samples` response shape.

## Decisions Made

See `key-decisions` in frontmatter. Most consequential: extending the D-17 Bora-Bora reclassification to `borabora_undisturbed` (not just `tourist`/`boat_traffic`), recorded as a reversible note inside `data/site-label-provenance.json` per the plan's explicit "Claude's discretion" instruction.

## Sites Whose Status Changed (base snapshot -> post-overlay fixture)

| site_id | before | after | label_original |
|---|---|---|---|
| `borabora_undisturbed` | healthy | unknown | "undisturbed" |
| `borabora_tourist` | degraded | unknown | "tourist" |
| `borabora_boat_traffic` | degraded | unknown | "boat traffic" |
| `irma_eastern_sambo` | healthy | unknown | null |
| `irma_western_dry_rocks` | healthy | unknown | null (carries `period`: embedding is from October 2017, after Hurricane Irma) |

SanctSound's 4 sites were already `unknown` in the base snapshot and remain `unknown` (now with `status_basis` explaining why). All 44 MARRS sites (including `aus_R1` = `restored_mid` and `ken_D3`, which now carries a `label_note` about the ken_D2/D3 naming mismatch) are untouched by the overlay.

## Deviations from Plan

None - plan executed exactly as written. One piece of explicit "Claude's discretion" was exercised (the `borabora_undisturbed` extension), which the plan itself anticipated and required to be recorded as a reversible note — done inside `data/site-label-provenance.json`'s top-level `decisions` array.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. All work in this plan is AWS-independent (pure data/Python, no credentials needed).

## Next Phase Readiness

- `lambdas/shared/site_provenance.py` is ready for plans 01-11 (classifier) and 01-12 (router) to import and bundle — `load_provenance()`'s bundled-path fallback already anticipates the Lambda package layout those plans will produce.
- `dashboard-next/tests/fixtures/api/{sites,samples}.json` are ready for 01-08 (e2e harness) and 01-17/01-18/01-19 (legacy UI label/gallery fixes) to consume.
- No blockers. `py -3.12 -m pytest lambdas/shared scripts/tests -x` (68 tests) and `py -3.12 scripts/build_api_fixtures.py --check` both green at hand-off.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All 10 claimed files found on disk; all 6 claimed commit hashes found in `git log --all`.
