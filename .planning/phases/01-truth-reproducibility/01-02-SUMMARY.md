---
phase: 01-truth-reproducibility
plan: 02
subsystem: data
tags: [citations, figshare, arxiv, dryad, zenodo, provenance, nodejs]

# Dependency graph
requires:
  - phase: 01-truth-reproducibility (plan 01)
    provides: Vitest/pytest test harness (not used directly by this plan's checker, which is Node-built-ins-only by design)
provides:
  - "dashboard-next/src/data/citations.json — 5 canonical, registry-verified citation records (marrs, surfperch, irma, coralsoundexplorer, sanctsound)"
  - "dashboard-next/src/lib/citations.ts — typed CITATIONS export, getCitation(id), formatCitation(id, style)"
  - "scripts/check-citations.mjs — schema check, deterministic docs/CITATIONS.md render/compare, banned-pattern doc scanner (--scope docs|all, --paths)"
  - "docs/CITATIONS.md — generated, human-readable canonical citations"
affects: [01-17, 01-18, 01-19, 01-20, 01-06, 01-08]

actuals:
  tokens: 10076
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Citation data/paper split: a dataset's own registry record (figshare, Zenodo, Dryad) often lists fewer authors than its companion paper (bioRxiv/PLOS preprint) — citations.json records the dataset's own registered authors and links the fuller paper author list via a `related` entry, rather than conflating the two"
    - "check-citations.mjs excludes its own source file from the --scope docs/all scan, since BANNED_PATTERNS necessarily contains the banned substrings as literal pattern definitions"
    - "Banned-pattern regexes carry a one-line human-readable `reason` alongside each pattern, printed as file:line: reason on a hit, so a future regression is self-explanatory without re-reading DATA-MODEL.md"

key-files:
  created:
    - dashboard-next/src/data/citations.json
    - dashboard-next/src/lib/citations.ts
    - scripts/check-citations.mjs
    - docs/CITATIONS.md
  modified:
    - README.md
    - ARCHITECTURE.md
    - dashboard-next/public/audio/ATTRIBUTION.md
    - dashboard/app.py
    - scripts/prepare_demo_audio.py
    - docs/SCIENTIFIC_VALIDITY.md
    - docs/ML_RESEARCH.md
    - docs/DATA_PIPELINE.md

key-decisions:
  - "MARRS citations.json record uses the figshare dataset's own 2 registered authors (Ben Williams, Kate Jones), not the bioRxiv study paper's 16-author list — the paper is recorded as a `related` entry (10.1101/2025.09.24.678197), confirmed live via the bioRxiv API this session"
  - "SurfPerch citations.json record has doi: null (arXiv does not assign a DOI to this entry) and licence set to arXiv's default non-exclusive distribution license, since the API returned no author-declared open license tag"
  - "Irma's Dryad API (and its Zenodo mirror) both return a duplicated 'Kayelyn Simmons' author entry — de-duplicated to 3 authors per research assumption A7, documented in verification_note"
  - "CoralSoundExplorer's Zenodo record registers a single creator (Rouch, ENES Bioacoustic Lab); the fuller 'Minier, Rouch et al.' author list belongs to the related bioRxiv preprint (isSupplementTo relation), not the dataset record"
  - "SanctSound has no single collection-level DOI upstream (NCEI mints per-site, per-detection-type DOIs, e.g. 10.25921/PF0H-SQ72) — recorded doi: null and url pointing to the project landing page (sanctsound.ioos.us), per the plan's explicit fallback instruction"

patterns-established:
  - "formatCitation(id, style) supports short/apa/bibtex; UI surfaces (plans 01-17/01-18/01-19) should import from dashboard-next/src/lib/citations.ts rather than hardcoding citation text"

requirements-completed: [TRUTH-08]

coverage:
  - id: D1
    description: "Five canonical, registry-verified citation records exist with provenance (verified_from + verified_at), schema-checked by scripts/check-citations.mjs"
    requirement: TRUTH-08
    verification:
      - kind: unit
        ref: "node scripts/check-citations.mjs --check-md (schema + doc-parity check)"
        status: pass
      - kind: other
        ref: "node -e \"require('./dashboard-next/src/data/citations.json')\" and the 5-id verified_from presence check from the plan's acceptance criteria"
        status: pass
    human_judgment: false
  - id: D2
    description: "docs/CITATIONS.md is generated from citations.json and is byte-identical on re-render (--write-md run twice produces no diff)"
    requirement: TRUTH-08
    verification:
      - kind: unit
        ref: "node scripts/check-citations.mjs --write-md (twice) && git diff --stat docs/CITATIONS.md (empty)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No repository documentation outside .planning/ and prompts/ carries a known-wrong author list, DOI, arXiv id, or MARRS acronym expansion"
    requirement: TRUTH-08
    verification:
      - kind: unit
        ref: "node scripts/check-citations.mjs --scope docs (143 git-tracked, in-scope files scanned, exits 0)"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 02: Canonical Citations Summary

**Single canonical citations.json/citations.ts module (5 records, live registry-verified this session) plus a dependency-free Node checker that renders docs/CITATIONS.md and scans the whole repo for known-wrong MARRS/SurfPerch/Irma citations — all 9 previously-wrong citation instances across README, ARCHITECTURE, ATTRIBUTION, the Streamlit app, and three docs/ files corrected.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-10-01T06:03:09Z
- **Completed:** 2026-10-01T06:15:34Z
- **Tasks:** 3 (1 tracer/TDD + 2 auto)
- **Files modified:** 12

## Accomplishments
- Live-verified all 5 citation records against their authoritative registry APIs this session (figshare, arXiv, Dryad, Zenodo ×2, NCEI/IOOS) rather than relying on prior audit text alone — caught and documented two registry-level author-list discrepancies (MARRS dataset-vs-paper author split; Irma's duplicated "Kayelyn Simmons" entry on both Dryad and its Zenodo mirror) not previously flagged in DATA-MODEL.md
- `scripts/check-citations.mjs` built TDD-style: RED commit (checker exits 1 because `docs/CITATIONS.md` doesn't exist) → GREEN commit (citations.json + citations.ts land, checker passes)
- Banned-pattern scan (`--scope docs`) now covers 143 git-tracked files and is green; it previously flagged its own source file until `scripts/check-citations.mjs` was excluded from the scan it performs (see Deviations)
- Corrected 9 known-wrong citation instances: 3 MARRS author misattributions (Sherwen K.; Maynes/Sherwood; wrong zenodo 6024203 link), 3 SurfPerch wrong-arXiv-id instances (2505.03071 → 2404.16436), 1 "bird-vocalization-classifier" mischaracterization (×3 files), 2 wrong MARRS acronym expansions ("Monitoring And Restoration..." → "Mars Assisted Reef Restoration System")

## Task Commits

Each task was committed atomically (Task 1 is TDD-flagged, two commits):

1. **Task 1a (RED): citations schema checker** - `8950246` (test)
2. **Task 1b (GREEN): canonical citations records + generated CITATIONS.md** - `88933b4` (feat)
3. **Task 2: Correct citations in README/ARCHITECTURE/ATTRIBUTION/app.py/prepare_demo_audio.py** - `914e343` (fix)
4. **Task 3: Correct docs/ scientific citations; make docs-scope scan green** - `67945f1` (fix, includes the self-exclusion fix to check-citations.mjs)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `dashboard-next/src/data/citations.json` - 5 canonical records (marrs, surfperch, irma, coralsoundexplorer, sanctsound), each with verified_from/verified_at/verification_note
- `dashboard-next/src/lib/citations.ts` - CITATIONS, getCitation(id), formatCitation(id, 'short'|'apa'|'bibtex')
- `scripts/check-citations.mjs` - schema check, --write-md/--check-md, --scope docs|all, --paths; Node built-ins only
- `docs/CITATIONS.md` - generated human-readable canonical citations (do not hand-edit)
- `README.md` - Credits section: MARRS and SurfPerch citations corrected, pointer to docs/CITATIONS.md added
- `ARCHITECTURE.md` - SurfPerch source line corrected
- `dashboard-next/public/audio/ATTRIBUTION.md` - citation block corrected (file list/processing notes untouched; 01-17 regenerates the whole file)
- `dashboard/app.py` - Streamlit about-page SurfPerch description corrected
- `scripts/prepare_demo_audio.py` - the ATTRIBUTION.md-generating template corrected so re-running the script won't reintroduce the wrong citation
- `docs/SCIENTIFIC_VALIDITY.md` - MARRS acronym + citation corrected; SurfPerch arXiv id corrected
- `docs/ML_RESEARCH.md` - both SurfPerch arXiv references corrected
- `docs/DATA_PIPELINE.md` - MARRS acronym corrected

## Decisions Made
- MARRS: dataset-record authors (Ben Williams, Kate Jones per figshare) kept separate from the bioRxiv paper's 16-author list (linked as `related`) — see key-decisions above.
- SurfPerch: `doi: null`, licence recorded as arXiv's default non-exclusive license (no author-declared open license found in the API response).
- Irma: de-duplicated the registry's duplicated "Kayelyn Simmons" author entry (confirmed on both Dryad and its Zenodo mirror, not a one-off fetch artifact).
- CoralSoundExplorer: dataset record's single registered creator (Rouch) kept separate from the preprint's fuller author list.
- SanctSound: no collection-level DOI exists upstream; used the project landing page URL with `doi: null`, per the plan's explicit fallback rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] check-citations.mjs flagged its own source file**
- **Found during:** Task 3 (full `--scope docs` run)
- **Issue:** `BANNED_PATTERNS` in `scripts/check-citations.mjs` necessarily contains the banned substrings as literal regex/reason definitions (e.g. the string `"Sherwen, K."` appears in the pattern's `reason` text). Since the checker scans all git-tracked text files outside `.planning/`, `prompts/`, and `dashboard-next/src/`, it was matching 9 "hits" against itself.
- **Fix:** Added a `SELF_FILE` constant (`scripts/check-citations.mjs`) excluded in `isExcludedByDocsScope()`, and documented the exclusion in the generated `docs/CITATIONS.md` footer.
- **Files modified:** `scripts/check-citations.mjs`, `docs/CITATIONS.md` (regenerated)
- **Verification:** `node scripts/check-citations.mjs --scope docs` now scans 143 files and exits 0.
- **Committed in:** `67945f1` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - self-referential false positive in new tooling)
**Impact on plan:** No scope creep; the checker's own correctness was part of Task 1/3's acceptance criteria, and this fix was required for `--scope docs` to actually pass.

## Issues Encountered
- NCEI's geoportal/archive REST search endpoints used by the 01-RESEARCH session for SanctSound metadata (`ncei.noaa.gov/metadata/geoportal/rest/find/...`, `data.noaa.gov/api/3/action/package_search`) returned 404 this session — used the live `sanctsound.ioos.us` project portal and the NCEI passive-acoustic-data page's own SanctSound links instead, which were reachable and confirmed no single collection-level DOI exists (resolved, not a blocker).

## User Setup Required
None - no external service configuration required. All registry lookups were read-only GETs against public APIs (figshare, arXiv, Dryad, Zenodo, NCEI/IOOS); no credentials used.

## Next Phase Readiness
- `dashboard-next/src/lib/citations.ts` is ready for plans 01-17/01-18/01-19 to import directly into UI surfaces (replacing any remaining hardcoded citation text there).
- `scripts/check-citations.mjs --scope all` (which additionally scans `dashboard-next/src/`) is intentionally still red/unused until those UI plans land, per the plan's `success_criteria` — this is expected, not a gap.
- `tests/unit/citations.test.ts` (Vitest coverage for `formatCitation`) is explicitly deferred to plan 01-19 per the plan's own `<behavior>` note; no action needed from this plan.
- No blockers for subsequent Phase 01 plans.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All 12 claimed files found on disk (4 created, 8 modified); all 4 task commits (`8950246`, `88933b4`, `914e343`, `67945f1`) found in git history.
