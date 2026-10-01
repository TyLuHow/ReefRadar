---
phase: 01-truth-reproducibility
plan: 17
subsystem: ui
tags: [nextjs, react, audio, web-audio-api, playwright, vitest, python]

requires:
  - phase: 01-truth-reproducibility (plans 01-03, 01-06, 01-07, 01-08, 01-12, 01-15, 01-16)
    provides: >
      Real committed MARRS excerpts under dashboard-next/public/audio/marrs/, the
      audio manifest (data/audio-manifest.json) with labels and gallery stories,
      the canonical citations module, and the shared API-client/mock-api e2e
      harness this plan's new tests build on.
provides:
  - "scripts/build_audio_consumers.py: generates the Next.js audio-manifest mirror, the Location Compare manifest, and ATTRIBUTION.md from the one committed manifest; --check gate for CI (01-20)."
  - "dashboard-next/src/lib/audio-manifest.ts: typed accessors (getExcerpt, demoPair, excerptCaption, attributionLine, compareLocations) -- the single read path for audio-surface UI."
  - "Real, same-location, same-recorder-clock-time demo pair (ind_H1 vs ind_D1) wired into the A/B demo and Experience demo mode."
  - "Location Compare manifest limited to real files only (South Sulawesi + Great Barrier Reef)."
affects: [01-18, 01-20, phase-07-listen, phase-09-evidence]

actuals:
  tokens: 20046
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Single generated-manifest pattern: scripts/build_audio_consumers.py derives every audio-consumer artifact (TS mirror, compare manifest, ATTRIBUTION.md) from data/audio-manifest.json, with --check as the drift gate -- same shape as build_gallery_manifest.py."
    - "Fact-only caption builders (excerptCaption, DemoState/LocationCompare/compare-page descriptions) compose directly from excerpt.label fields; no UI component hand-writes a species/behaviour claim."

key-files:
  created:
    - scripts/build_audio_consumers.py
    - dashboard-next/src/data/audio-manifest.json
    - dashboard-next/src/lib/audio-manifest.ts
    - dashboard-next/tests/unit/audio-manifest.test.ts
    - dashboard-next/tests/e2e/audio-surfaces.spec.ts
  modified:
    - dashboard-next/src/components/experience/useDemoAudio.ts
    - dashboard-next/src/components/audio/AudioCompare.tsx
    - dashboard-next/src/components/audio/ABCrossfader.tsx
    - dashboard-next/src/components/experience/DemoState.tsx
    - dashboard-next/src/components/experience/LocationCompare.tsx
    - dashboard-next/src/components/experience/useLocationAudio.ts
    - dashboard-next/public/audio/compare/manifest.json
    - dashboard-next/public/audio/ATTRIBUTION.md
    - dashboard-next/src/app/dashboard/compare/page.tsx
    - dashboard-next/src/components/audio/FrequencyBandLabels.tsx
    - dashboard-next/src/components/spectrogram/FrequencyBands.ts
    - dashboard-next/tests/e2e/routes.spec.ts

key-decisions:
  - "Compare-manifest location coordinates are the centroid of each location's real reference sites (from data/snapshots/api-sites.json), since the manifest has no single canonical lat/lon per location."
  - "excerptCaption()'s 'region' is the excerpt's country (the only region-like field available on the manifest/gallery data) rather than a finer sub-region string."
  - "Deviation (Rule 2): extended the fix beyond the plan's <files> list to the /dashboard/compare explanation card and the shared FrequencyBands.ts/FrequencyBandLabels.tsx labels, which made unlabelled species/behaviour claims (snapping shrimp, fish vocalizations, grazing) on the same audio surfaces this plan's must_haves cover."

patterns-established:
  - "Audio-surface truth suite: dashboard-next/tests/e2e/audio-surfaces.spec.ts grows per-task (network-request assertions, banned-claims text scan, file-existence checks) rather than one spec per surface."

requirements-completed: [TRUTH-03, TRUTH-07, TRUTH-08]

coverage:
  - id: D1
    description: "A/B demo (/dashboard/compare, /experience?mode=demo) plays two real, same-location, same-recorder-clock-time MARRS excerpts via demoPair(), with no gain/normalisation applied in code."
    requirement: TRUTH-03
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/audio-manifest.test.ts#demoPair returns the ind_H1 vs ind_D1 healthy_vs_degraded story pair"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/audio-surfaces.spec.ts#/dashboard/compare requests exactly the demoPair excerpts"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/audio-surfaces.spec.ts#/experience?mode=demo requests exactly the demoPair excerpts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Crossfader, demo explanation, and A/B banner describe only recorded facts (site, date/time, MARRS label) with canonical attribution; no species/behaviour/spectrogram claims anywhere on the surface."
    requirement: TRUTH-07
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/audio-surfaces.spec.ts#/dashboard/compare contains no banned claims and discloses MARRS attribution"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/audio-surfaces.spec.ts#/experience?mode=demo contains no banned claims and discloses MARRS attribution"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/audio-surfaces.spec.ts#crossfader shows static endpoint captions regardless of slider position"
        status: pass
    human_judgment: false
  - id: D3
    description: "Location Compare manifest lists only South Sulawesi and Great Barrier Reef states with real committed files; every referenced path returns 200; ATTRIBUTION.md cites the canonical MARRS DOI; old peak-normalised WAVs deleted."
    requirement: TRUTH-08
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/audio-surfaces.spec.ts#the compare manifest lists only aus and ind, and every file path returns 200"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/audio-surfaces.spec.ts#/experience?mode=compare contains no banned claims and no invented biology"
        status: pass
      - kind: other
        ref: "py -3.12 scripts/build_audio_consumers.py --check"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 17: Legacy Audio Surfaces on Real Excerpts Summary

**Every legacy listening surface (A/B demo, crossfader, Experience demo mode, Location Compare) now plays real, same-location MARRS excerpts sourced from one generated manifest, with fact-only captions and no fabricated species/behaviour claims.**

## Performance

- **Duration:** 70 min
- **Started:** 2026-10-01T04:28:00Z
- **Completed:** 2026-10-01T04:46:00Z
- **Tasks:** 3
- **Files modified:** 21 (across 3 commits)

## Accomplishments

- `scripts/build_audio_consumers.py` generates every audio-consumer artifact (the Next.js manifest mirror, the Location Compare manifest, ATTRIBUTION.md) from the single committed `data/audio-manifest.json`, with a `--check` drift gate.
- `dashboard-next/src/lib/audio-manifest.ts` is the one typed read path for audio UI: `getExcerpt`, `demoPair`, `excerptCaption`, `attributionLine`, `compareLocations`.
- The A/B demo (`/dashboard/compare`) and Experience demo mode (`/experience?mode=demo`) now fetch `demoPair().a/.b.url_path` -- the real `ind_H1`/`ind_D1` excerpts, same site, same recorder-clock time (12:00), no gain/normalisation applied in code.
- `ABCrossfader` no longer fabricates a range-based description; it shows static `leftCaption`/`rightCaption` endpoint captions that never change with slider position.
- `DemoState`, `LocationCompare`, and the `/dashboard/compare` explanation card now state only site id, recorder-clock date/time (timezone unverified), and the MARRS label definition -- no species, behaviour, or invented intermediate soundscapes anywhere on these surfaces.
- Location Compare's manifest (`public/audio/compare/manifest.json`) lists exactly two locations -- South Sulawesi (degraded/restored_early/restored_mid/healthy) and Great Barrier Reef (degraded/restored_mid/healthy) -- every file path verified to return 200; the `01-17` `KNOWN_DEFECTS` entry in `routes.spec.ts` is gone.
- The four old peak-normalised, cross-country demo WAVs (`healthy-reef.wav`, `degraded-reef.wav`, `compare/aus/healthy.wav`, `compare/aus/degraded.wav`) are deleted from the repository.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): manifest mirror and accessor drive the A/B demo** - `7fabd40` (feat)
2. **Task 2: Honest copy on the demo, crossfader and A/B banner** - `5b0fe64` (feat)
3. **Task 3: Location Compare on real files only, regenerated attribution, old demo WAVs deleted** - `1fa0fbd` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `scripts/build_audio_consumers.py` - Generates the TS manifest mirror, the Location Compare manifest, and ATTRIBUTION.md from `data/audio-manifest.json`; `--check` drift gate
- `dashboard-next/src/data/audio-manifest.json` - Byte-for-byte mirror of `data/audio-manifest.json`
- `dashboard-next/src/lib/audio-manifest.ts` - Typed accessors: `getExcerpt`, `demoPair`, `excerptCaption`, `attributionLine`, `compareLocations`
- `dashboard-next/tests/unit/audio-manifest.test.ts` - Unit coverage for the accessors
- `dashboard-next/src/components/experience/useDemoAudio.ts` - Fetches `demoPair()` URLs instead of hard-coded WAVs
- `dashboard-next/src/components/audio/AudioCompare.tsx` - Fetches `demoPair()`, banner uses `attributionLine()`, passes captions to `ABCrossfader`
- `dashboard-next/src/components/audio/ABCrossfader.tsx` - Removed fabricated `getDescription`; added static `leftCaption`/`rightCaption` props
- `dashboard-next/src/components/experience/DemoState.tsx` - Rewrote "What You Are Hearing" from the manifest; honest band-toggle and map-CTA copy
- `dashboard-next/src/app/dashboard/compare/page.tsx` - Rewrote "What am I hearing?" card from the demo pair's real labels
- `dashboard-next/src/components/audio/FrequencyBandLabels.tsx` - Renamed band labels to neutral Hz ranges (was species/behaviour names)
- `dashboard-next/src/components/spectrogram/FrequencyBands.ts` - Same renaming for the shared band-toggle labels used by DemoState/LocationCompare
- `dashboard-next/public/audio/compare/manifest.json` - Regenerated: real files only (aus, ind)
- `dashboard-next/public/audio/ATTRIBUTION.md` - Regenerated from the manifest and canonical citation
- `dashboard-next/src/components/experience/LocationCompare.tsx` - Per-status invented descriptions replaced with excerpt-metadata facts; spectrogram/country-count sentences removed
- `dashboard-next/src/components/experience/useLocationAudio.ts` - `LocationInfo` gains additive `excerpts` map
- `dashboard-next/tests/e2e/audio-surfaces.spec.ts` - New e2e suite covering Tasks 1-3
- `dashboard-next/tests/e2e/routes.spec.ts` - Removed the `01-17` `KNOWN_DEFECTS` entry
- `dashboard-next/public/audio/healthy-reef.wav`, `degraded-reef.wav`, `compare/aus/healthy.wav`, `compare/aus/degraded.wav` - Deleted (old peak-normalised, cross-country demo files)

## Decisions Made

- Compare-manifest location coordinates are the centroid of each location's real reference sites (`data/snapshots/api-sites.json`), since the manifest has no single canonical lat/lon per location.
- `excerptCaption()`'s "region" slot uses the excerpt's country (the only region-like field present on the manifest/gallery data) rather than a finer sub-region string.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Fabricated species/behaviour claims found outside the plan's `<files>` list, on the same audio surfaces**
- **Found during:** Task 2 verify run (e2e banned-claims scan failed)
- **Issue:** `/dashboard/compare`'s "What am I hearing?" explanation card and the shared `FrequencyBands.ts`/`FrequencyBandLabels.tsx` band labels (rendered directly as DemoState's/LocationCompare's band-toggle button text and as the AudioCompare spectrogram overlay) made unattributed claims -- "snapping shrimp produce continuous broadband crackles", "fish vocalizations", "grazing" -- not backed by the manifest. These files were not in the plan's Task 2 `<files>` list but are squarely covered by the plan's own must_have truth ("No audio surface describes species, behaviour or invented intermediate soundscapes").
- **Fix:** Rewrote the compare-page card from `demoPair()`'s real labels; renamed the three frequency bands to neutral Hz-range labels (`Low (< 800 Hz)`, `Mid (800-3500 Hz)`, `High (> 3500 Hz)`) in both files.
- **Files modified:** `dashboard-next/src/app/dashboard/compare/page.tsx`, `dashboard-next/src/components/audio/FrequencyBandLabels.tsx`, `dashboard-next/src/components/spectrogram/FrequencyBands.ts`
- **Verification:** `dashboard-next/tests/e2e/audio-surfaces.spec.ts`'s banned-claims scan passes on both `/dashboard/compare` and `/experience?mode=demo`
- **Committed in:** `5b0fe64` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing-critical)
**Impact on plan:** Necessary to satisfy the plan's own TRUTH-07 must_have on surfaces adjacent to the ones explicitly listed. No scope creep beyond audio-surface copy.

## Issues Encountered

- TypeScript build failed on `[...map.keys()]` spread (`--downlevelIteration` required by the project's `tsconfig.json` target) in the new `audio-manifest.ts` -- switched to `Array.from(...)`.
- The Task-2 e2e test for `/experience?mode=demo` initially read page text before the `landing -> DemoState` transition completed, seeing landing-page copy instead; added an explicit wait on the Play button's visibility before reading text.
- A trailing comment referencing `01-17` in the rewritten `routes.spec.ts` `KNOWN_DEFECTS` block initially tripped the `grep -c "01-17" ... returns 0` acceptance check; removed the plan-id reference from the comment.
- `npm run build` flagged a new `react-hooks/exhaustive-deps` warning on `AudioCompare.tsx`'s `initAudio` callback (missing `pair.a/.b.url_path` deps) -- added them to the dependency array. A pre-existing, unrelated warning in `LocationCompare.tsx` (`audio.crossfade`) was left as out-of-scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Audio manifest mirror, accessors, and generator (`scripts/build_audio_consumers.py --check`) are ready for 01-18 (gallery) and 01-20 (CI gate) to reuse.
- `compareLocations()` in `audio-manifest.ts` is exported but not yet consumed outside tests -- `useLocationAudio.ts` still fetches the generated JSON directly, which is correct for now (no change needed), but a future phase could consolidate onto the TS accessor if a non-fetch consumer appears.
- Plan 01-14 (production deploy, including S3 audio upload) has not run; this plan only touched committed local files (`dashboard-next/public/audio/marrs/`) and fixtures, per the orchestrator's scope note -- no deploy or AWS write was performed or required.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All created files found on disk (`scripts/build_audio_consumers.py`, `dashboard-next/src/data/audio-manifest.json`, `dashboard-next/src/lib/audio-manifest.ts`, `dashboard-next/tests/unit/audio-manifest.test.ts`, `dashboard-next/tests/e2e/audio-surfaces.spec.ts`, `dashboard-next/public/audio/compare/manifest.json`, `dashboard-next/public/audio/ATTRIBUTION.md`). All three task commits (`7fabd40`, `5b0fe64`, `1fa0fbd`) found in git log. Old demo WAVs confirmed deleted (`healthy-reef.wav`, `compare/aus/healthy.wav`).
