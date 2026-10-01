---
phase: 01-truth-reproducibility
plan: 03
subsystem: data
tags: [marrs, figshare, audio, provenance, numpy, spectral-analysis, python]

# Dependency graph
requires:
  - phase: 01-truth-reproducibility (plan 02)
    provides: dashboard-next/src/lib/citations.ts (MARRS DOI/licence constants reused in data/audio-manifest.json's dataset block)
provides:
  - "9 real MARRS excerpts (ind_H1, ind_D1, ind_N1, ind_R1, aus_H1, aus_H2, aus_D1, aus_R1, mex_R1), 30s @ native 16kHz, 0dB gain, committed to dashboard-next/public/audio/marrs/"
  - "data/audio-manifest.json — canonical provenance manifest (source zip/file, recorder-clock timestamp marked unverified, offset, duration, sha256, dataset DOI/licence) for every excerpt"
  - "data/snapshots/api-sites.json — live GET /sites snapshot (54 sites, no secrets) used as the site-membership reference"
  - "scripts/extract_marrs_excerpts.py — deterministic, idempotent, rule-based excerpt selection + HTTP-range figshare extraction (select_file, extract_excerpt)"
  - "scripts/check_audio_real.py — numpy-only spectral checker distinguishing synthetic tone clips from real recordings (check_file, --self-test, --from-live-samples)"
  - "scripts/validate_audio_manifest.py — manifest schema/file/hash/header/site-membership validator"
affects: [01-06, 01-12, 01-14, 01-17, 01-18, 01-20]

actuals:
  tokens: 14033
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Extractor merge-upsert manifest write: loads any existing data/audio-manifest.json, recomputes only the requested --sites entries (idempotent skip via sha256 match against the output file), and upserts into the existing excerpt set keyed by site_id — enables incremental multi-invocation runs to converge to one byte-identical manifest"
    - "Synthetic-audio detection should combine spectral signals with AND, not OR, when spectral criteria risk colliding with legitimate tonal biological content (reef fish choruses) — see key-decisions"
    - "sys.path.insert(0, scripts_dir) + direct function import (get_zip_central_directory, download_file_from_zip) reuses download_marrs_samples.py's ZIP64/HTTP-Range reader rather than re-implementing it (Don't Hand-Roll)"

key-files:
  created:
    - scripts/extract_marrs_excerpts.py
    - scripts/check_audio_real.py
    - scripts/validate_audio_manifest.py
    - data/audio-manifest.json
    - data/snapshots/api-sites.json
    - dashboard-next/public/audio/marrs/ind_H1_20220830_120000.wav
    - dashboard-next/public/audio/marrs/ind_D1_20220830_120000.wav
    - dashboard-next/public/audio/marrs/ind_N1_20220907_120000.wav
    - dashboard-next/public/audio/marrs/ind_R1_20220830_120000.wav
    - dashboard-next/public/audio/marrs/aus_H1_20230208_120000.wav
    - dashboard-next/public/audio/marrs/aus_H2_20230208_120000.wav
    - dashboard-next/public/audio/marrs/aus_D1_20230208_120000.wav
    - dashboard-next/public/audio/marrs/aus_R1_20230208_120000.wav
    - dashboard-next/public/audio/marrs/mex_R1_20230529_120000.wav
  modified:
    - .gitignore

key-decisions:
  - "The plan's literal check_audio_real.py spec (flag if spectral_flatness<0.1 OR top50-bin-energy-fraction>0.5, each independently) false-flagged real MARRS excerpts with strong fish-chorus tonality (aus_H1 measured flatness 0.045, aus_R1 0.036 — both below the ~0.065 DATA-MODEL.md reference value for the actual synthetic clips). Measuring the live --from-live-samples synthetic clips confirmed sample_rate (32kHz) alone correctly flags all 8 regardless of spectral thresholds, so the spectral heuristic was recalibrated to require low flatness (<0.025) AND high concentration (>0.85) jointly — thresholds set outside the full real-excerpt calibration range this plan produced (max real flatness-trip 0.036, max real concentration 0.78)"
  - ".gitignore's marrs exception (!dashboard-next/public/audio/marrs/*.wav) was added during Task 1 rather than Task 2 as originally planned, since Task 1's own done-criteria requires a committed WAV and the file is unreachable by git add while *.wav is still blanket-ignored"
  - "excerpt_id is the source WAV basename without extension (e.g. ind_H1_20220830_120000); this doubles as the merge-upsert key alongside site_id for idempotent re-runs"

patterns-established:
  - "Manifest-producing extraction scripts should merge-upsert rather than overwrite, so partial/incremental invocations (one site, then eight more, then all nine again) converge to one deterministic, byte-identical output — verified directly (not via `git diff`, which only reflects staged/committed state) by diffing the manifest file across invocations"

requirements-completed: [TRUTH-03, TRUTH-04]

coverage:
  - id: D1
    description: "Nine real MARRS excerpts (ind_H1, ind_D1, ind_N1, ind_R1, aus_H1, aus_H2, aus_D1, aus_R1, mex_R1) committed at native 16kHz, 0dB gain, 30s each, selected by a documented deterministic rule matching time-of-day across sites"
    requirement: TRUTH-03
    verification:
      - kind: unit
        ref: "py -3.12 scripts/validate_audio_manifest.py (exit 0)"
        status: pass
      - kind: other
        ref: "python one-liner: site set == {ind_H1,ind_D1,ind_N1,ind_R1,aus_H1,aus_H2,aus_D1,aus_R1,mex_R1}, <=2 distinct time_of_day values, 9 .wav files on disk, manifest byte-identical across a full re-run"
        status: pass
    human_judgment: false
  - id: D2
    description: "Automated spectral check (scripts/check_audio_real.py) distinguishes the currently-served synthetic tone clips from real recordings"
    requirement: TRUTH-03
    verification:
      - kind: unit
        ref: "py -3.12 scripts/check_audio_real.py --self-test (exit 0, synthetic 200/500/1000Hz@32kHz mix flagged)"
        status: pass
      - kind: unit
        ref: "py -3.12 scripts/check_audio_real.py dashboard-next/public/audio/marrs (exit 0, all 9 real excerpts pass)"
        status: pass
      - kind: integration
        ref: "py -3.12 scripts/check_audio_real.py --from-live-samples (exit 1, all 8 live synthetic clips flagged via sample_rate; nothing downloaded into the repo)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every excerpt's site_id exists in the live 54-site /sites list (phl_D1 has no excerpt, confirmed absent from both figshare and the live site list)"
    requirement: TRUTH-04
    verification:
      - kind: unit
        ref: "python one-liner: data/snapshots/api-sites.json has 54 unique site_ids and does not contain phl_D1"
        status: pass
      - kind: unit
        ref: "py -3.12 scripts/validate_audio_manifest.py site_id-membership check (exit 0)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 03: Real MARRS Audio Extraction & Provenance Summary

**Nine real, native-16kHz MARRS excerpts with a committed provenance manifest, extracted deterministically from figshare via HTTP range requests, plus a recalibrated spectral checker that correctly separates real reef biophony from the 8 currently-served synthetic tone clips.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-10-01T06:20:00Z (approx)
- **Completed:** 2026-10-01T06:55:00Z (approx)
- **Tasks:** 2 (1 tracer/TDD + 1 auto)
- **Files modified:** 15 (3 scripts created, 1 manifest, 1 site snapshot, 9 WAV excerpts, .gitignore)

## Accomplishments
- Built `scripts/extract_marrs_excerpts.py`: a deterministic, idempotent excerpt selector (`select_file`) and byte-for-byte extractor (`extract_excerpt`, no resampling or gain change) reusing the existing HTTP-Range ZIP64 reader from `download_marrs_samples.py`
- Extracted and committed all 9 priority-set real excerpts at native 16kHz/0dB gain, all landing on the same 12:00 recorder-clock time of day across sites (one fall-forward variant: ind_N1)
- Verified determinism directly: re-running the extractor for all nine sites a second time (idempotent skip-on-sha256-match) produced a byte-identical `data/audio-manifest.json`
- Snapshotted the live `GET /sites` response (54 sites, no `phl_D1`, no secrets) to `data/snapshots/api-sites.json` as the site-membership reference
- Built `scripts/check_audio_real.py` (numpy-only Welch spectral analysis) and discovered + fixed a real false-positive problem against real data (see Deviations) before it could land in `main`
- Built `scripts/validate_audio_manifest.py`, validating every excerpt's file existence, sha256, WAV header, gain/normalization/timezone flags, and site-list membership
- Negative control: ran `--from-live-samples` against the live synthetic clips — all 8 flagged (via sample_rate 32kHz != 16000Hz), nothing downloaded into the repo (verified via `git status --porcelain`)

## Task Commits

1. **Task 1 (tracer/TDD): real excerpt (ind_H1) from figshare zip to validated, real-checked manifest entry** - `d5e2a57` (feat)
2. **Task 2: remaining eight sites, committed WAVs, checker recalibration against the live synthetic negative control** - `c641fb7` (feat)

**Plan metadata:** pending (this commit)

_Note: Task 1 is tagged `tdd="true"` in the plan, but its `<behavior>` block describes function contracts verified end-to-end via the task's own `<verify>` CLI chain (no standalone pytest files were specified by the plan), and it is also a `type="tracer"` task — per the executor's tracer-handling rules, tracer tasks are committed atomically with a real implementation and real `<verify>`, which is what was done. No separate RED/GREEN commits were made; see TDD Gate Compliance below._

## Files Created/Modified
- `scripts/extract_marrs_excerpts.py` - `select_file()` (deterministic time-of-day selection with fall-forward), `extract_excerpt()` (byte-for-byte slice, no gain change), figshare listing/pagination, manifest merge-upsert writer
- `scripts/check_audio_real.py` - `check_file()` (Welch-averaged spectral check), `--self-test`, `--from-live-samples`; see Deviations for the recalibration
- `scripts/validate_audio_manifest.py` - schema/file/hash/header/site-membership validator, one `FAIL` line per issue
- `data/audio-manifest.json` - 9 excerpts, dataset block (MARRS DOI/licence), selection_rule prose, timezone_note
- `data/snapshots/api-sites.json` - live `/sites` snapshot (54 sites) + `snapshot_at`
- `dashboard-next/public/audio/marrs/*.wav` (9 files) - real MARRS excerpts, 16kHz mono 16-bit, 30s, 0dB gain
- `.gitignore` - added `!dashboard-next/public/audio/marrs/*.wav` exception (moved up from Task 2, see Deviations)

## Decisions Made
- Spectral checker recalibrated to AND-combine flatness/concentration thresholds (see Deviations) — this is the single most consequential decision in this plan, since the literal plan spec would have produced a checker that incorrectly flags real reef recordings.
- `.gitignore` exception added one task earlier than planned (Task 1 instead of Task 2), since Task 1's own `<done>` criteria explicitly requires "a committed WAV."
- `excerpt_id` = source WAV basename without extension, doubling as the manifest's merge-upsert key.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] check_audio_real.py's literal OR-threshold spec false-flagged real reef audio**
- **Found during:** Task 2 (`check_audio_real.py dashboard-next/public/audio/marrs` run against all 9 real excerpts)
- **Issue:** The plan's `<behavior>` specified independent thresholds (`spectral_flatness < 0.1` OR `top50_bin_energy_fraction > 0.5`). Against the real data, this flagged 5 of 9 excerpts: `aus_D1` (top50 0.59), `aus_H1` (flatness 0.045, top50 0.78), `aus_H2` (top50 0.74), `aus_R1` (flatness 0.036, top50 0.77), `ind_N1` (top50 0.51). Investigation (inspecting the Welch spectrum directly) showed these are genuine fish-chorus tonal peaks in the 125–530 Hz band — real biological content, not synthetic tones. `aus_H1` and `aus_R1`'s measured flatness (0.045, 0.036) is actually *lower* (more tonal) than the ~0.065 DATA-MODEL.md reference value for the real synthetic clips, so flatness alone cannot separate them.
- **Fix:** Measured the actual 8 live synthetic clips via `--from-live-samples` and confirmed `sample_rate != 16000` alone correctly flags all 8 regardless of spectral criteria (DATA-MODEL.md's finding that currently-served synthetic clips are 32kHz holds exactly). Recalibrated the spectral heuristic to require `spectral_flatness < 0.025` AND `top50_bin_energy_fraction > 0.85` jointly — set outside the full real-excerpt calibration range this plan produced (max real flatness-trip observed: 0.036; max real concentration observed: 0.78) while still comfortably catching the self-test's extreme pure-tone case (flatness 0.0000, concentration 1.0000).
- **Files modified:** `scripts/check_audio_real.py`
- **Verification:** `--self-test` still flags (exit 0), `dashboard-next/public/audio/marrs` now passes clean (exit 0, 0/9 flagged), `--from-live-samples` still flags all 8 (exit 1)
- **Committed in:** `c641fb7` (Task 2 commit)

**2. [Rule 3 - Blocking] .gitignore marrs exception needed one task earlier than planned**
- **Found during:** Task 1 (attempting to stage the ind_H1 WAV)
- **Issue:** `*.wav` is blanket-gitignored; the `!dashboard-next/public/audio/marrs/*.wav` negation was specified under Task 2's `<files>`, but Task 1's `<done>` criteria requires "a committed WAV," which is impossible without the negation existing first.
- **Fix:** Added the negation to `.gitignore` during Task 1; confirmed via `git check-ignore -q` (single-path form) and `git add -n` dry-run that the file became trackable. Task 2's own `git check-ignore` verification then simply confirmed the rule still holds for all 9 files.
- **Files modified:** `.gitignore`
- **Verification:** `git check-ignore -q dashboard-next/public/audio/marrs/ind_H1_20220830_120000.wav; echo $?` → 1 (not ignored)
- **Committed in:** `d5e2a57` (Task 1 commit)

**3. [Rule 1 - Bug] Task 2's literal `<verify>` check-ignore command fails with 9 files present**
- **Found during:** Task 2 verification
- **Issue:** The plan's exact verify text `git check-ignore -q dashboard-next/public/audio/marrs/*.wav; test $? -eq 1` relies on unquoted shell glob expansion. With only 1 file present (Task 1) this expands to a single path and works; with 9 files present (Task 2) it expands to 9 paths, and `git check-ignore`'s `-q`/`--quiet` flag is documented to support only a single pathname, producing `fatal: --quiet is only valid with a single pathname` instead of a clean 0/1 exit.
- **Fix:** Used the equivalent unquoted multi-path form without `-q` (`git check-ignore dashboard-next/public/audio/marrs/*.wav; test $? -eq 1`), which git supports for multiple paths and expresses the identical assertion (exit 1 = none of the given paths are ignored). Confirmed exit 1 against all 9 committed WAVs.
- **Files modified:** none (verification-only; no script change)
- **Verification:** `git check-ignore dashboard-next/public/audio/marrs/*.wav; echo $?` → 1
- **Committed in:** n/a (verification-step adjustment only, documented here)

---

**Total deviations:** 3 (2 Rule 1 bug fixes, 1 Rule 3 blocking-issue reorder)
**Impact on plan:** All three were necessary for the plan's own acceptance criteria to actually pass against real data; none expand scope beyond the plan's stated deliverables. Deviation 1 is the substantive one — it directly affects detection quality and is documented in detail in `scripts/check_audio_real.py`'s module docstring for future maintainers.

## TDD Gate Compliance
Task 1 is flagged `tdd="true"` in plan frontmatter but is also `type="tracer"`. No separate `test(...)` (RED) commit was made before the `feat(...)` (GREEN) implementation commit `d5e2a57` — the task's `<behavior>` block describes function-level contracts (not a standalone pytest suite) and its own `<verify>` is an end-to-end CLI chain that was run and confirmed failing-then-passing manually during development, not via a committed failing test. This matches the executor's tracer-handling rule (execute and commit like `type="auto"`, with a real implementation and a real `<verify>`) rather than a literal RED/GREEN/REFACTOR commit pair. Flagged here for visibility per the plan-level TDD gate instructions.

## Issues Encountered
- Figshare zips for the priority set range 7.8–15.9 GB each; only the central directory (~tens of KB) and one ~0.94MB member per site were fetched via HTTP Range requests, confirming the Pattern-2/anti-DoS mitigation (T-01-03-04) works as designed in practice.
- `datetime.datetime.utcnow()` deprecation warning surfaced when snapshotting `/sites` (inline one-off command, not a committed script) — noted but not fixed since it's not part of a committed deliverable; any future committed script touching this should use `datetime.now(datetime.UTC)`.

## User Setup Required
None - all registry/API access was read-only GETs against public endpoints (figshare, the live ReefRadar API). No AWS credentials were required or used.

## Next Phase Readiness
- `dashboard-next/public/audio/marrs/*.wav` + `data/audio-manifest.json` are ready for plans 01-06 (gallery data), 01-14 (S3 sync), 01-17/01-18 (demo and compare UI wiring) to consume — nothing served by the product changes in this plan, per the plan's own objective.
- `scripts/check_audio_real.py` is ready for reuse in 01-14's live verification and 01-20's final sweep; its recalibrated thresholds should be re-validated if a materially different real-audio corpus is later checked against it (the thresholds were calibrated specifically against this plan's 9-excerpt sample).
- No blockers for subsequent Phase 01 plans.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All 9 claimed files found on disk (3 scripts created, manifest, site snapshot, 1 of 9 WAVs spot-checked + last-alphabetical spot-checked, .gitignore, this SUMMARY); both task commits (`d5e2a57`, `c641fb7`) found in git history.
