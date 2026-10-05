---
phase: 04-design-system-instrument-primitives
plan: 21
subsystem: ui
tags: [compositions, motion, view-transition, fixtures, haversine, attribution, integrity, a11y]
status: complete

requires:
  - phase: 04-design-system-instrument-primitives
    provides: kit primitives from 04-02 to 04-20 (BandSection, Stat, AccentBlock, Transport, Spectrogram, CompareDeck, ClipCard, StatusBand, Legend, ProbabilityBar, ProvenanceChip, StripPlot, useProjection), fixtures route and registry
provides:
  - "haversineKm, InstrumentHeader, AttributionFooter (features/instrument)"
  - "/dev/fixtures sections motion, composition-inspector, composition-listen, composition-compare, composition-explore"
  - "compositionCopy headline and sub-line templates; CompositionFrame, CompositionHeader, useCompareFixture fixture parts"
  - "motion-morph and motion-view view-transition durations in tokens.css"
affects: [04-22, 04-23, 04-24, phase-5, phase-6]

requirements: [DS-05, DS-06, DS-08]
requirements-completed: []

actuals:
  tokens: 28300
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A composition is one fixtures StateCell-free frame (data-screen, data-fixture-primitive and state markers) so the AccentBlock per-screen check and the manifest markers still apply"
    - "Headlines are templates over computed values (compositionCopy), tested against the real contract and manifest"
    - "ViewTransition names and classes (motion-morph, motion-view) get their durations from the --duration tokens through html:has(...) pseudo-element rules, so the reduced-motion zeroing already in tokens.css applies"

key-files:
  created:
    - dashboard-next/src/features/instrument/geo.ts
    - dashboard-next/src/features/instrument/InstrumentHeader.tsx
    - dashboard-next/src/features/instrument/AttributionFooter.tsx
    - dashboard-next/src/features/fixtures/sections/MotionSection.tsx
    - dashboard-next/src/features/fixtures/sections/CompositionInspector.tsx
    - dashboard-next/src/features/fixtures/sections/CompositionListen.tsx
    - dashboard-next/src/features/fixtures/sections/CompositionCompare.tsx
    - dashboard-next/src/features/fixtures/sections/CompositionExplore.tsx
    - dashboard-next/src/features/fixtures/parts/CompositionFrame.tsx
    - dashboard-next/src/features/fixtures/parts/compositionCopy.ts
    - dashboard-next/src/features/fixtures/parts/useCompareFixture.ts
    - dashboard-next/tests/unit/geo.test.ts
    - dashboard-next/tests/unit/composition-parts.test.tsx
    - dashboard-next/tests/unit/composition-copy.test.ts
    - dashboard-next/tests/e2e/fixtures-compositions.spec.ts
  modified:
    - dashboard-next/src/features/instrument/index.ts
    - dashboard-next/src/features/instrument/BandSection.tsx
    - dashboard-next/src/features/fixtures/registry.tsx
    - dashboard-next/src/features/fixtures/slugs.ts
    - dashboard-next/src/features/fixtures/data/analysis.ts
    - dashboard-next/src/features/fixtures/sections/ClipCardSection.tsx
    - dashboard-next/src/styles/tokens.css
    - dashboard-next/tests/e2e/fixtures-route.spec.ts

key-decisions:
  - "Compositions are frames, not state cells: each is a full-width bordered div on the ground carrying data-screen, data-fixture-primitive and data-fixture-state=default, because a StateCell's panel padding and eyebrow would fight a full-bleed band"
  - "Header destinations are in-page hashes prefixed page- (#page-compare), because #compare would scroll to the existing compare primitive section"
  - "Layout-morph rows are built from StatusMark and countBy, not Legend: Legend fixes its order and the plan needs a reorder; no primitive was edited for it"
  - "Explore country chips treat 'none pressed' as 'every country', so pressing a chip narrows rather than needing a clear control; the helper text says which is in effect"
  - "The captured live ind_H1 analysis returned similar_sites: [], so the Inspector shows the inline empty state; analysis.ts now exposes the analysis's own similarSites rather than the composition reading the JSON itself"

patterns-established:
  - "Static composition copy lives in compositionCopy.ts as pure functions, so a unit test can derive the expected sentence from the same contract data"

completed: 2026-10-05
---

# Phase 4 Plan 21: Motion section and the four accepted compositions Summary

**The Motion section and the Inspector, Listen, Compare and Explore compositions render from kit primitives on real contract, manifest and audio data in all three directions, with every count, distance and share computed and the MARRS attribution (DOI and licence) from the citations module on each.**

## Accomplishments

- `haversineKm` (mean Earth radius 6371.0088 km), `InstrumentHeader` (wordmark, five hash destinations, aria-current accent underline, computed "Contract v{n} · {sites} sites" chip, heavy rule) and `AttributionFooter` (formatCitation('marrs','apa') without its URL, licence and DOI links through `safeHttpsUrl`; an unknown id throws).
- Motion section: selection (toggle and listbox fills), layout morph (reorder in `startTransition`, each row a named `<ViewTransition>`), playhead (real ind_H1 through `useTransport`), crossfade (live CompareDeck ind_H1 vs ind_D1), view transition (keyed swap between two real sites), and the reduced-motion note. tokens.css gives `motion-morph` and `motion-view` their `--duration-morph` and `--duration-view`; the existing `!important` zeroing for reduced motion still wins.
- Inspector, Listen, Compare and Explore as specified. Headlines come from `compositionCopy`: "Healthy and degraded, 0.8 km apart." (haversine of the contract coordinates), "Both recorded 2022-08-30 at 12:00 on the recorder clock..." (manifest), "A partial map of 48 reef soundscapes." and the 33% caveat (projection). Listen counts 54 sites and 7 countries from the contract; one AccentBlock (no dev warning fired in any direction).
- `analysis.ts` now exposes each analysis's `similarSites` as returned.

## Task Commits

1. Parts: `7120a63` (geo, InstrumentHeader, AttributionFooter; RED confirmed first, 14 of 14 failed)
2. Sections, parts, copy, CSS, registry: `53e8a44`
3. e2e spec: `8ffec10`

Tasks 1 to 3 share commits 2 and 3 because the registry lists all five sections at once and could not be staged per section without interactive staging.

## Verification

- `npm test`: 85 files, 1493 tests pass. geo, composition-parts and composition-copy each run 5x: 23 of 23 each time. semantic-tokens, copy-claims, fixtures-registry, feature-fence pass.
- `npm run lint` 0 errors (the 20 pre-existing warnings, none in new files); `npm run typecheck` clean; `check-feature-fence.mjs` and `check-contract-fence.mjs` OK.
- Flag-less `npm run build` exit 0; `check-dev-fixtures-excluded.mjs` OK (marker absent from 486 files, both fixtures routes 404).
- e2e through an untracked local config on port 3204 (fresh server, never reused, deleted before the final commit): full project 334 passed. New `fixtures-compositions.spec.ts` 39 passed, `--repeat-each=5` 195 of 195 passed, including axe (zero serious or critical) for motion and the four compositions in atlas, nocturne and poster and a 390 px overflow check. `fixtures-route.spec.ts --repeat-each=3` passed after the one test change below.
- `check-citations.mjs` reports `docs/CITATIONS.md` out of date only because of Windows CRLF (autocrlf); nothing here touches citations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Eyebrow overlapped the display headline in BandSection**
- **Found during:** screenshot review of Listen
- **Issue:** `type-display` leading is tight and BandSection put the headline directly under the eyebrow with no gap, so the eyebrow ran into the headline's ascenders.
- **Fix:** headline gets `mt-4` when an eyebrow is present (one class in `BandSection.tsx`; its unit tests still pass).
- **Commit:** 53e8a44

**2. [Rule 1 - Bug] Poster Explore overflowed the page at 390 px**
- **Found during:** e2e overflow check (scrollWidth 483)
- **Issue:** the unbreakable word "soundscapes." at the poster display minimum exceeds the column.
- **Fix:** `[overflow-wrap:anywhere]` on the Explore and Compare display headlines.
- **Commit:** 53e8a44

**3. [Rule 1 - Bug] Inspector facts column stretched into tall gaps; place line repeated the country**
- **Found during:** screenshot review
- **Fix:** `content-start` on the facts grid; the place line is the contract `location_label` alone (it already ends with the country).
- **Commit:** 53e8a44

**4. [Rule 3 - Blocking] fixtures-route index test counted exactly one nav and no footer**
- **Issue:** each composition has its own "Primary" header navigation and attribution footer inside its section.
- **Fix:** the test now allows `nav[aria-label="Primary"]` and footers inside sections; it still proves no legacy navbar or page footer. Commit 8ffec10.

### Plan wording adapted

- The layout-morph cell uses StatusMark rows, not the Legend component (Legend has a fixed order).
- Header hrefs are `#page-{name}`, not `#{name}`, so `#compare` does not jump to the compare primitive section.
- Each composition's AttributionFooter uses `formatCitation('marrs','apa')` as specified; the other fixtures sections still use `attributionLine()`.

## Edits to shared files

`registry.tsx` and `slugs.ts` (five entries in FINAL_ORDER between `numerals` and `token-probe`), `instrument/index.ts` (parts appended), `tokens.css` (view-transition duration block before the reduced-motion block), `BandSection.tsx` (one class), `ClipCardSection.tsx` (`export` added to `LiveCard`), `data/analysis.ts` (`similarSites` field and `SimilarSite` type), `fixtures-route.spec.ts` (one test).

## Visual review (screenshots at 1440, 768 and 390, all three directions, reviewed by eye)

All four compositions and Motion render without layout breakage in atlas, nocturne and poster. Concerns for the owner:

- Explore scatter: country labels and the selected id label overlap marks and each other (UA/French Polynesia/Mexico cluster); at 390 px the plot is small and crowded. This is the known Plot limit recorded in 04-19; the table disclosure and the listbox are the reliable paths.
- Poster direction at phone width: very large display type (Listen headline runs five lines); intentional but heavy.
- Listen cards leave an empty third cell in the last row (eight cards in a three-column grid at desktop).
- Nav links wrap to a second line at 390 px; Compare pages are long on a phone (two full CompareRow blocks).
- Sound itself, the view-transition and morph animations and Safari were not verifiable headless; a human check on a device is still needed.

## Known Stubs

None. The Inspector's similar-sites list is empty because the captured live analysis returned none; it shows the inline empty state and says so.

## Threat Flags

None.

## Self-Check: PASSED

Created files exist, commits 7120a63, 53e8a44 and 8ffec10 are on the branch, and the working tree is clean.
