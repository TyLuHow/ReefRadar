---
gsd_state_version: 1.0
milestone: v2
milestone_name: Reef Soundscape Research Instrument
current_phase: 01
current_phase_name: Truth & Reproducibility
status: executing
stopped_at: Completed 01-04-PLAN.md
last_updated: "2026-10-01T06:43:09.202Z"
last_activity: 2026-10-01
last_activity_desc: Phase 01 execution started
state_head: 78ebacfec9415000d37c8ae4883f0e9b90e4151e
progress:
  total_phases: 17
  completed_phases: 0
  total_plans: 20
  completed_plans: 4
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-30)

**Core value:** Every sound, label and number shown is real, traceable to its source, and honestly qualified — and a visitor can hear a real reef within seconds.
**Current focus:** Phase 01 — Truth & Reproducibility

## Current Position

Phase: 01 (Truth & Reproducibility) — EXECUTING
Plan: 5 of 20
Status: Ready to execute
Last activity: 2026-10-01 — Phase 01 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Uncommitted gallery/samples files currently break a clean-clone build; deployed `/samples` route source is not in git.
- [Phase 1+]: Owner credentials (AWS, Vercel, GitHub) required for drift checks and deploys; AWS CLI v2 needs admin install (CLI v1 via `py -3.12 -m awscli` available).
- [Phase 8]: Owner must set the AWS spend ceiling before any transfer or compute job; MARRS filename timezone unverified (correctness gate for diel features).
- [Phase 11/12]: GPU vs CPU embedding throughput, Spot pricing and the Perch 2.0 Kaggle handle need re-verification before committing budget; calibration method at 5–10 real sites per class unresolved.
- [Phase 14/16/17]: If the Data & ML track stalls (budget, credentials), Phase 14 cannot complete, which holds Phases 16 and 17.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-01T06:43:09.182Z
Stopped at: Completed 01-04-PLAN.md
Resume file: None
