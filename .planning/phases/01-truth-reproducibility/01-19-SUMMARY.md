---
phase: 01-truth-reproducibility
plan: 19
subsystem: legacy-ui-copy-provenance
tags: [truth-reproducibility, ui, citations, provenance]
status: complete
dependency-graph:
  requires: ["01-02", "01-06", "01-13", "01-15", "01-18"]
  provides:
    - "dashboard-next/src/lib/site-stats.ts (deriveSiteStats, formatList)"
    - "Provenance-aware SiteCard/SitePopup"
    - "dashboard-next/tests/unit/citations.test.ts"
  affects:
    - "dashboard-next/src/app/page.tsx"
    - "dashboard-next/src/app/dashboard/page.tsx"
    - "dashboard-next/src/app/sites/page.tsx"
    - "dashboard-next/src/app/about/page.tsx"
tech-stack:
  added: []
  patterns:
    - "deriveSiteStats(sitesResponse) as the single source for every site/country/category count, consumed via the shared ['sites'] React Query key"
    - "formatCitation/getCitation as the single source for every citation string on a UI surface"
key-files:
  created:
    - dashboard-next/src/lib/site-stats.ts
    - dashboard-next/tests/unit/label-provenance.test.tsx
    - dashboard-next/tests/unit/site-stats.test.ts
    - dashboard-next/tests/unit/citations.test.ts
  modified:
    - dashboard-next/src/types/index.ts
    - dashboard-next/src/components/SiteCard.tsx
    - dashboard-next/src/components/map/SitePopup.tsx
    - dashboard-next/src/app/page.tsx
    - dashboard-next/src/app/dashboard/page.tsx
    - dashboard-next/src/app/sites/page.tsx
    - dashboard-next/src/app/about/page.tsx
    - dashboard-next/src/components/about/ArchitectureDiagram.tsx
decisions:
  - "SiteCard/SitePopup use label_assigned_by (the per-site researcher/study attribution) as the primary 'assigned by' string, falling back to label_source_name (the dataset display name) when label_assigned_by is absent"
  - "When a site has no label_original (Irma/SanctSound sites), the provenance block shows status_basis's upstream-honesty text instead of a 'Label: Unknown' line, since the status badge already shows Unknown"
  - "sites/page.tsx stat cards expanded from 4 to 6 (Total, Healthy, Degraded, Restored Early, Restored Mid, Unknown) so the non-Total cards sum to the total, replacing the old early+mid merge that hid Unknown"
  - "ArchitectureDiagram's classifier tooltip drops the stale 'applies geographic region confidence adjustment' claim -- D-12 (01-12/01-15) already removed that multiplier from the API, so the tooltip was describing dead behavior"
  - "deriveSiteStats computes acousticReference from has_embedding across the sites array rather than trusting the fixture's own top-level sites_with_embeddings field, which is stale (44) against the per-site flags (48 true) -- the per-site source of truth wins"
metrics:
  duration: 55min
  completed: 2026-10-01
actuals:
  tokens: 46000
  tasks: 3
  commits: 3
---

# Phase 01 Plan 19: Legacy UI Evidence Copy -- Label Provenance, Derived Counts, Canonical Citations Summary

Finished the legacy UI's evidence copy: every site surface now states who assigned a label and what it means, every site/country/category count on the landing, dashboard, sites and about pages is derived from a live `/sites` response, and the about page plus architecture tooltips read from the canonical citations module and the live model's model card instead of hand-typed facts.

## What Was Built

**Task 1 -- Label provenance on SiteCard and SitePopup (D-17).** `Site` gained optional provenance fields (`label_source`, `label_source_name`, `label_assigned_by`, `label_original`, `label_definition`, `status_basis`, `period`, `label_note`). `SiteCard` no longer guesses a site type from the id substring or renders the old per-status biological-claim paragraph ("diverse fish communities", "snapping shrimp activity", "soundscapes approaching healthy"); it now shows `Label: <original> (assigned by <attribution>)` with the dataset's own definition, falling back to the site's `status_basis` text when no `label_original` exists (Irma, SanctSound), and surfacing `period` and `label_note` when present. `SitePopup` shows the same one-line provenance under the status dot. Both components fall back to `Label: <formatted status>` for old-shape sites with no provenance fields, without crashing. 9 component tests in `label-provenance.test.tsx` cover MARRS, Bora-Bora tourist, Irma Western Dry Rocks, a SanctSound site, the ken_D3 label note, the removed id-guess/biological-claim behavior, and the old-shape fallback for both components.

**Task 2 -- Every site/country/category count derived from `/sites` (D-18).** `dashboard-next/src/lib/site-stats.ts` implements `deriveSiteStats(sitesResponse)`: total, distinct countries (and count), `acousticReference` (count of `has_embedding === true`), `byStatus` (including `unknown`), `labelCategories` (distinct non-unknown statuses -- dataset label categories, not model classes), and the distinct dataset display names present. Landing, dashboard hub and sites page all read this via the shared `['sites']` React Query key; counters show an em dash while loading, never `0`. The landing hero and dashboard header no longer describe the tool as "AI-powered reef health analysis" -- they describe listening to and comparing labelled reference recordings. The sites page stat-card row grew from 4 to 6 cards (Total, Healthy, Degraded, Restored Early, Restored Mid, Unknown) so the non-Total cards sum to the total; the country sentence and the dataset-source footer are both derived from the live data instead of a hard-coded 5-country, MARRS-only sentence. 3 tests in `site-stats.test.ts` cover the fixture's full derivation and the empty/undefined-input case.

**Task 3 -- About page and architecture tooltips cite canonical sources (D-19).** The about page's ML Model, Reference Data, Data Sources and Credits sections now render every author list, DOI and licence string through `formatCitation`/`getCitation` (`dashboard-next/src/lib/citations.ts`) instead of hand-typed text; the MARRS entry states its real country list (Indonesia, Australia, Kenya, Maldives, Mexico) instead of "Indo-Pacific". "What this tool measures" lists only the three claims DATA-MODEL.md section 6 ("Claims the UI may honestly make") licenses: SurfPerch acoustic features of 5-second windows, similarity to labelled reference recordings, and probabilities from a small exploratory classifier; "What it cannot measure" adds definitive reef health diagnosis. Limitations state the live model's real training data (version, training rows, site count, countries, evaluation note) from `model-card.json`, plus reference-site counts from `deriveSiteStats`, replacing the old hard-coded "54 reference sites across 7 countries" and a region-list that didn't match the actual training set. `ArchitectureDiagram`'s classifier tooltip now reads architecture and version from `model-card.json` with no accuracy figure and no region-multiplier claim (that multiplier was already removed from the API by D-12); the embeddings tooltip drops its hard-coded site/country count. `citations.test.ts` covers schema completeness across every citation record, `formatCitation`'s short/apa/bibtex styles, and `getCitation`'s throw on an unknown id.

## Verification

All three tasks' `<verify>` chains passed:
- `npx vitest run` -- 9 test files, 56 tests passed (includes the 3 new files: label-provenance 9, site-stats 3, citations 6).
- `npx tsc --noEmit` -- clean.
- `npx playwright test --project=e2e` -- 39 tests passed (routes, gallery, audio-surfaces, a11y, analysis-flow).
- `npm run build` -- compiled successfully (one pre-existing, unrelated ESLint warning in `LocationCompare.tsx`).
- `node scripts/check-citations.mjs --scope all` -- schema valid, no banned-pattern hits across 304 scanned files.

Acceptance-criteria greps (all plan-specified thresholds met):
- `assigned by` present in both `SiteCard.tsx` and `SitePopup.tsx`.
- `label_assigned_by` present once in `types/index.ts`.
- `deriveSiteStats` used in both `dashboard/page.tsx` and `sites/page.tsx`.
- No `value: (54|7|4),` literal remains in `dashboard/page.tsx`.
- `formatCitation`/`getCitation` appear 20 times in `about/page.tsx` (threshold was 4).
- `model-card` referenced in both `ArchitectureDiagram.tsx` and `about/page.tsx`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed a stale region-confidence claim from the ArchitectureDiagram classifier tooltip**
- **Found during:** Task 3
- **Issue:** The tooltip said the classifier "Applies geographic region confidence adjustment" -- the 0.6/0.7 region multiplier this described was already removed from the API by D-12 (prior plans 01-12/01-15). The tooltip was describing dead behavior.
- **Fix:** Tooltip now states architecture, version and "not validated on new sites or regions" from `model-card.json`, with no accuracy figure and no multiplier claim.
- **Files modified:** `dashboard-next/src/components/about/ArchitectureDiagram.tsx`
- **Commit:** 0fe2c23

No other deviations -- plan executed as written.

## Known Stubs

None. No placeholder data, hardcoded empty values, or unwired components were introduced.

## Self-Check: PASSED

- `dashboard-next/src/lib/site-stats.ts` -- FOUND
- `dashboard-next/tests/unit/label-provenance.test.tsx` -- FOUND
- `dashboard-next/tests/unit/site-stats.test.ts` -- FOUND
- `dashboard-next/tests/unit/citations.test.ts` -- FOUND
- Commit `e11654b` (Task 1) -- FOUND in `git log`
- Commit `e71bd2b` (Task 2) -- FOUND in `git log`
- Commit `0fe2c23` (Task 3) -- FOUND in `git log`
