---
phase: 03-platform-upgrade-stack-consolidation
plan: 02
subsystem: testing
tags: [vitest, stack-consolidation, streamlit-removal, docs]

requires:
  - phase: 03-platform-upgrade-stack-consolidation
    provides: none (wave 1, independent of 03-01)
provides:
  - Legacy Streamlit dashboard (dashboard/) deleted from the tree; git history keeps it
  - stack-consolidation.test.ts gate (removed directory, config references, REMOVED_PACKAGES helper)
  - Streamlit-free live docs (CLAUDE.md, .claude/CLAUDE.md, ARCHITECTURE.md)
affects: [03-08, 03-10, 03-11, 03-15]

actuals:
  tokens: 2400
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Gate test builds the forbidden directory name from parts so the test file never matches its own scan"
    - "Reusable removed-package check (package.json, lockfile packages, src imports) driven by an append-only REMOVED_PACKAGES array"

key-files:
  created:
    - dashboard-next/tests/unit/stack-consolidation.test.ts
  modified:
    - CLAUDE.md
    - .claude/CLAUDE.md
    - ARCHITECTURE.md
  deleted:
    - dashboard/app.py
    - dashboard/requirements.txt
    - dashboard/start.sh

key-decisions:
  - "REMOVED_PACKAGES stays empty in this plan; later plans (03-08 deck.gl, 03-10 Leaflet, 03-11 recharts/wavesurfer.js) only append names"
  - "Package assertions use toHaveProperty([name]) array form so names containing dots or slashes (wavesurfer.js, @deck.gl/core) are not parsed as property paths"
  - "The legacy-directory reference matcher uses a lookbehind so dashboard-next/ and src/app/dashboard/ are not false positives"

patterns-established:
  - "Stack gate: one growing test file is the single CI fact for 'this was removed and stays removed'"

requirements-completed: []  # PLAT-02 is only partly delivered here (Streamlit); deck.gl, Leaflet, recharts, wavesurfer.js removals land in 03-08/03-10/03-11

coverage:
  - id: D1
    description: "The Streamlit dashboard directory no longer exists and no config references it; dashboard-next is untouched"
    requirement: PLAT-02
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/stack-consolidation.test.ts#stack consolidation: removed directory (PLAT-02)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Live docs no longer describe a Streamlit app (zero case-insensitive matches in CLAUDE.md, .claude/CLAUDE.md, ARCHITECTURE.md)"
    requirement: PLAT-02
    verification:
      - kind: other
        ref: "grep -ci streamlit CLAUDE.md ARCHITECTURE.md .claude/CLAUDE.md -> 0 each; copy-claims.test.ts and check-citations.mjs --scope all pass"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-10-02
status: complete
---

# Phase 3 Plan 02: Streamlit Deletion and Stack Gate Summary

**The legacy Streamlit dashboard is removed from the tree and a vitest gate fails if it, or any config reference to it, returns; the three live docs describe only the Next.js dashboard.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-10-02
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files:** 1 created, 3 modified, 3 deleted

## Accomplishments

- `stack-consolidation.test.ts` (7 tests today): repo root resolves (dashboard-next/package.json present), `dashboard/` absent, pytest.ini / ci.yml / check-citations.mjs contain no `dashboard/` path segment (matcher proven on positive and negative samples), plus the removed-packages helper with its source-scan and import-matcher self-checks. Run red with `dashboard/` present (1 failure, the directory assertion), then green after `git rm -r dashboard`.
- `dashboard/` removed (`app.py`, `requirements.txt`, `start.sh`); `git ls-files dashboard` is empty and `git ls-files dashboard-next/package.json` still prints one line. History keeps the app (restore with `git checkout 1c74f86 -- dashboard`).
- Docs: CLAUDE.md tree entry removed; .claude/CLAUDE.md lost the language, framework, folium, pandas/plotly/requests, platform, component-table and four-bullet Layers entries for the app; ARCHITECTURE.md diagram now shows one Next.js box and the Streamlit section (port 8501) is gone. Next.js, Leaflet, deck.gl and vitality wording left for 03-15.

## Task Commits

1. **Task 1 (tracer): delete dashboard/, add the gate** - `d7c8c03` (feat)
2. **Task 2: factual doc edits** - `f77999d` (docs)

Tracer gate (auto mode active): tracer verify was green end to end before expansion, so `Tracer verified end-to-end - expanding`.

## Verification

- `npm --prefix dashboard-next test`: 24 files, 272 tests passed.
- `npm --prefix dashboard-next run typecheck`: exit 0.
- `npm --prefix dashboard-next run lint`: exit 0 (the same pre-existing exhaustive-deps warning in `LocationCompare.tsx`, out of scope).
- `node scripts/check-citations.mjs --scope all`: exit 0 (399 files scanned).
- `grep -ci streamlit` on the three docs: 0 each.
- CI result for the pushed head is reported in the orchestrator return.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Ignored `dashboard/__pycache__` left the directory on disk after `git rm`**
- **Found during:** Task 1, first green run (the existence assertion failed although no files were tracked)
- **Issue:** `git rm -r dashboard` removes only tracked files; an untracked, gitignored `__pycache__` kept the directory present.
- **Fix:** removed that single generated directory and the empty `dashboard/` (specific paths; no `git clean`).
- **Files modified:** none tracked
- **Commit:** n/a (working-tree only)

The plan said the three tracked files are all that exist under the directory; the ignored cache was the only extra.

## Issues Encountered

None. No auth gates, no package installs, no checkpoints.

## Known Stubs

None.

## Threat Flags

None. Threat T-03-02-01 mitigated: `git rm -r dashboard` named the exact directory, the test asserts dashboard-next exists, and `git ls-files dashboard-next/package.json` was checked.

## Next Phase Readiness

03-08, 03-10 and 03-11 append package names to `REMOVED_PACKAGES` without new logic; 03-15 edits the stack-version lines in the same three docs.

## Self-Check: PASSED

- FOUND: dashboard-next/tests/unit/stack-consolidation.test.ts
- MISSING (as intended): dashboard/
- FOUND commits: d7c8c03, f77999d
