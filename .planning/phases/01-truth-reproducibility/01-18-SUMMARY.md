---
phase: 01-truth-reproducibility
plan: 18
subsystem: ui
tags: [nextjs, react, playwright, vitest, audio-manifest, truth-reproducibility]

requires:
  - phase: 01-truth-reproducibility
    provides: "01-12 /samples router fix; 01-16 processing/stages rewire; 01-17 real MARRS audio manifest and audio-manifest.ts accessors"
provides:
  - "samples.ts fallback list generated from data/audio-manifest.json (no phl_D1, aus_R1 correctly restored_mid)"
  - "SampleCard and /experience sample view show a reference label assigned by MARRS, with attribution, no frequency-highlight chips"
  - "gallery.spec.ts e2e covering the /samples fixture path, the fallback path, and the sample view"
affects: [redesign-phases-touching-gallery-or-experience-sample-view]

actuals:
  tokens: 6300
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "samplesFromManifest(manifest) maps the manifest's gallery section to the UI Sample type -- the committed fallback can never drift from what the API serves"
    - "Reference label lookup: getExcerpt(sample.id).label.label_original with a try/catch fallback to formatStatus(category), mirrored identically in SampleCard.tsx and experience/page.tsx"

key-files:
  created:
    - dashboard-next/tests/unit/samples.test.ts
    - dashboard-next/tests/e2e/gallery.spec.ts
  modified:
    - dashboard-next/src/lib/samples.ts
    - dashboard-next/src/components/gallery/SampleCard.tsx
    - dashboard-next/src/components/gallery/SampleGallery.tsx
    - dashboard-next/src/app/experience/page.tsx
    - dashboard-next/tests/e2e/support/states.ts

key-decisions:
  - "Reference-label lookup keys on sample.id (== manifest excerpt_id for every manifest-derived sample) rather than adding a new site_id-keyed export to audio-manifest.ts, since audio-manifest.ts was not in this plan's files_modified and the existing getExcerpt(id) export already satisfies the lookup"
  - "SampleGallery.tsx's STORY_ORDER constant fixed from the pre-manifest 'restoration_timeline' key to 'restoration_ladder' (Rule 1 auto-fix) -- it silently dropped that story section once samples.ts switched to the manifest's actual story keys"

requirements-completed: [TRUTH-03, TRUTH-04, TRUTH-07, TRUTH-09]

coverage:
  - id: D1
    description: "FALLBACK_SAMPLES/SAMPLE_STORIES generated from data/audio-manifest.json gallery section; no phl_D1, aus_R1 is restored_mid"
    requirement: "TRUTH-03"
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/samples.test.ts"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/gallery.spec.ts#landing gallery"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fallback list generated from the same committed manifest the router bundles; every fallback clip plays"
    requirement: "TRUTH-04"
    verification:
      - kind: unit
        ref: "dashboard-next/tests/unit/samples.test.ts"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/gallery.spec.ts#falls back to the committed manifest-derived list when /samples 500s, and the first clip plays"
        status: pass
    human_judgment: false
  - id: D3
    description: "SampleCard and /experience sample view show a reference label assigned by MARRS, styled distinctly from a model-result badge, with attribution; no frequency-highlight chips"
    requirement: "TRUTH-07"
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/gallery.spec.ts#every card shows a reference label assigned by MARRS, an attribution line, and no frequency chips"
        status: pass
      - kind: e2e
        ref: "dashboard-next/tests/e2e/gallery.spec.ts#shows the sample, a reference label with attribution, no chips, and plays real audio"
        status: pass
    human_judgment: false
  - id: D4
    description: "Old synthetic sample id (idn_healthy_dawn) shows the not-found error state, not fallback content"
    requirement: "TRUTH-09"
    verification:
      - kind: e2e
        ref: "dashboard-next/tests/e2e/gallery.spec.ts#an old synthetic sample id shows the not-found error state, not fallback content"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-10-01
status: complete
---

# Phase 01 Plan 18: Gallery and Sample View Truth Summary

**Landing gallery and /experience sample view now derive entirely from `data/audio-manifest.json`: the fallback list used when `/samples` fails can never drift from what the live router serves, and every sample card shows a reference label assigned by MARRS with attribution instead of an unlabelled frequency-chip-decorated badge.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-10-01T09:45:31Z
- **Completed:** 2026-10-01T10:40:00Z
- **Tasks:** 3
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments
- `samplesFromManifest()` maps the manifest's `gallery.samples` section to the UI `Sample` type; `FALLBACK_SAMPLES`/`SAMPLE_STORIES` are derived from it at import time, so the fallback is byte-provably in sync with the manifest the router bundles (no `phl_D1`, `aus_R1` correctly `restored_mid`)
- `SampleCard.tsx` and the `/experience` sample view both show `"Reference label: <label original> · assigned by MARRS"` (outlined badge, distinct from a filled model-result badge) plus an `attributionLine()` under the description; frequency-highlight chips removed from both surfaces
- `gallery.spec.ts` e2e covers: the gallery via the live `/samples` fixture, the gallery via a forced-500 fallback (with the first card's real MARRS clip actually playing and returning 200/206), reference-label + attribution text on every card, the "Analyze This" link target, the `/experience?sample=<id>` view's label/attribution/no-chips, and the old synthetic `idn_healthy_dawn` id correctly showing the not-found error state instead of any fallback content

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — manifest gallery section to fallback samples to a rendered, playable landing gallery** - `e7079d4` (feat)
2. **Task 2: SampleCard — reference-label wording, attribution, no frequency chips** - `80f9754` (feat)
3. **Task 3: /experience sample view — same honest label, attribution and description** - `4732ee1` (feat)

**Plan metadata:** see final commit in this batch

_Note: Task 1 is a `type="tracer"` task; its own `<verify>` (vitest + the gallery e2e) was re-run and passed before Tasks 2/3 proceeded, per the tracer feedback gate._

## Files Created/Modified
- `dashboard-next/src/lib/samples.ts` - `samplesFromManifest()`, manifest-derived `FALLBACK_SAMPLES`/`SAMPLE_STORIES`
- `dashboard-next/tests/unit/samples.test.ts` - TRUTH-04 rules on the fallback data (new)
- `dashboard-next/src/components/gallery/SampleGallery.tsx` - `STORY_ORDER` key fix (`restoration_ladder`)
- `dashboard-next/src/components/gallery/SampleCard.tsx` - reference-label badge + attribution, chips removed
- `dashboard-next/src/app/experience/page.tsx` - `SamplePlaybackState` mirrors SampleCard wording, chips removed
- `dashboard-next/tests/e2e/support/states.ts` - `experience-sample` state path uses a real manifest sample id
- `dashboard-next/tests/e2e/gallery.spec.ts` - e2e for both tasks above (new)

## Decisions Made
- Reference-label lookup uses `getExcerpt(sample.id)` from the existing `audio-manifest.ts` (sample id == manifest excerpt_id for every manifest-derived sample) rather than adding a new site_id-keyed export, since `audio-manifest.ts` was outside this plan's declared `files_modified` and the existing export already satisfies the "looked up by site" requirement for every sample this plan produces.
- `gallery.spec.ts` was authored as one complete file in the Task 1 commit (covering all three tasks' behavior bullets) rather than incrementally extended per task, since Tasks 1-3 all declare it as a shared target file; Task 2 and Task 3 commits touch only their respective source files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `SampleGallery.tsx`'s `STORY_ORDER` referenced a stale story key**
- **Found during:** Task 1, verifying the gallery e2e behavior bullet ("the landing page shows the three story titles from the manifest")
- **Issue:** `STORY_ORDER` was `['healthy_vs_degraded', 'restoration_timeline', 'geographic_diversity']`, a pre-manifest key. `data/audio-manifest.json`'s `gallery.stories` uses `restoration_ladder`, not `restoration_timeline`. With the stale key, that story section silently failed to render (`if (!story) return null`) and its samples fell into the generic "More Samples" section instead — only 2 of 3 titled stories would have shown.
- **Fix:** Changed the key to `restoration_ladder` to match the manifest.
- **Files modified:** `dashboard-next/src/components/gallery/SampleGallery.tsx`
- **Verification:** `gallery.spec.ts`'s "renders the manifest story titles from the live /samples fixture" test asserts all three titles are visible; passes.
- **Committed in:** `e7079d4` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for Task 1's own verify bullet to pass (all three story titles visible). No scope creep — single-line key fix in a file the task's behavior already exercised.

## Issues Encountered
- Playwright's `<audio>` element range-requests the WAV file, returning HTTP 206 (Partial Content) rather than 200 on the first request. Adjusted `gallery.spec.ts` assertions to accept `[200, 206]` rather than requiring exactly 200 — not a product issue, a correct HTTP range-request response.
- Next.js's `trailingSlash` config means internal links render as `/experience/?sample=...` (trailing slash before the query string). Adjusted the "Analyze This" href assertion regex accordingly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Landing gallery and `/experience` sample view are now fully truthful and manifest-derived; no stubs or known gaps remain on these surfaces.
- Plan 01-14 (production deploy, including the S3 audio upload and the live `/samples` route) has not yet run — these changes are verified locally against committed fixtures and the local build/e2e/a11y suites, not against the live deployment. The owner must run 01-14 before this plan's fixes are visible in production.

---
*Phase: 01-truth-reproducibility*
*Completed: 2026-10-01*

## Self-Check: PASSED

All created/modified files and all 3 task commits (`e7079d4`, `80f9754`, `4732ee1`) verified present.
