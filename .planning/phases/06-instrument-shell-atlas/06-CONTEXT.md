# Phase 6: Instrument Shell & Atlas - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning

<domain>
## Phase Boundary

One instrument workspace where the Atlas (map or sound-space), a sortable site table, a persistent Inspector and a Bench area stay in sync. Selecting a site or cluster anywhere updates all of them, and every view state lives in the URL. Navigation is reduced to Listen · Explore · Analyze · Methods. Requirements: ATLAS-01 to ATLAS-08, PERSIST-01. The real Listening Bench (Phase 7), analysis-as-search (Phase 9), time views (Phase 14) and the command palette (ATLAS-09, Phase 15) are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Workspace layout
- **D-01:** Desktop is map-led with the Inspector docked:
  - a slim filter rail on the left;
  - the Atlas in the centre;
  - the Inspector permanently docked on the right;
  - the Bench as a strip along the bottom.
  - Provenance is always visible in the Inspector. Popups are not used (ATLAS-07).
- **D-02:** The centre slot toggles **Map | Table**.
  - One view shows at a time. Both use the same filtered sites and the same selection.
  - The table is the Phase 4 `DataTable`: sortable and keyboard-navigable (ATLAS-06).
  - The view choice is part of the URL state.
- **D-03:** On tablet and phone the Inspector becomes a **bottom sheet** (Phase 4 `Sheet`).
  - It opens at half height and drags to full height.
  - The map fills the screen and the filters move behind a button.
  - Keep 44 px targets, Escape to close and managed focus.
- **D-04:** At the Phase 6 design gate, show all four structural alternatives from `INSPIRATION-TEARDOWN.md` beside the Atlas default: **Sound-space First**, **Specimen Drawer**, **The Score** and **Investigation Docket**.
  - They are mockups for the owner to compare, not shipped features.
  - The Atlas layout above is the build target unless the owner picks an alternative at that gate.
  - This continues the standing instruction to show bold alternatives at every UI gate (04-CONTEXT).

### Map vs sound-space
- **D-05:** The Atlas opens on the **geographic map**. A "By place / By sound" toggle in the centre header switches the layout, and the lens is saved in the URL.
- **D-06:** In sound-space, the **6 location-only sites** move into a labelled tray beside the plot ("No acoustic position: N sites").
  - They show there as hollow marks, stay selectable and stay in the table.
  - They never get a fake position.
  - N is computed from the contract, never typed (ATLAS-04).
- **D-07:** Sound-space carries an **always-on method line** under the plot, read from the contract: "Position = PCA of SurfPerch embeddings, X% of variance, axes have no units, distance is approximate". The contract's projection currently explains about 33%.
  - The Inspector's nearest-site list, computed in full dimensions, is the authority. The scatter only illustrates it.
  - No modal and no first-time explainer.
- **D-08:** The morph between layouts:
  - Each site mark glides from its map position to its PCA position, about 600–800 ms. The basemap fades out while the plot axes fade in.
  - The selected site keeps its accent ring throughout so it can be followed.
  - Under reduced motion the switch is instant and focus stays on the selection (DS-06).
  - Marks are not grouped or staggered by label, which would imply the labels drive the positions.
- **D-09:** Hovering or keyboard-focusing a mark shows a **label chip only**: site id, status shape plus word, and dataset.
  - No sound and no thumbnail on hover.
  - Clicking selects, and the Inspector and Bench take over.

### Claude's Discretion
Not discussed; Claude decides within the constraints below:
- **Bench area before Phase 7:**
  - Show the selected site's real, attributed clip using the existing Phase 4 `Spectrogram` and `Transport`.
  - If the site has no clip in the contract, say so with `EmptyState`.
  - Never synthesise or substitute audio.
- **Routes:**
  - The workspace lives at a new route (expected `/explore`).
  - Legacy `/sites` and `/dashboard/map` keep working until their capabilities are confirmed rehomed per `CAPABILITY-MATRIX.md`, and only then redirect (PROJECT.md legacy-operability constraint).
  - The nav items Listen and Analyze point to their existing legacy surfaces until Phases 7 and 9 replace them.
- **URL format:**
  - Readable query parameters: layout, lens, filters, selection, compare set, zoom.
  - Use nuqs per the Key Decisions. It is not installed yet, so installing it falls under the standing package approval, subject to the package-age check.
  - Selection changes push history so Back undoes them. Pan and zoom replace history. Opening a copied URL in a fresh browser must restore the state exactly (success criterion 4).
- Semantic zoom thresholds, overlap offsets, cluster definitions, filter-rail card anatomy (per teardown P1: legend, live counts, ProvenanceChip, include/exclude), panel widths, and how the sound-space overlay renders over MapLibre (MapLibre cannot draw non-geographic coordinates, so use an SVG/Canvas overlay positioned by d3 scales).
- What the Inspector shows with nothing selected: an overview of counts computed from the contract.
- Cluster selection fills the Inspector with a site mini-table, each row with "add to compare" (teardown P2).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §Phase 6: goal and the 5 success criteria
- `.planning/REQUIREMENTS.md`: ATLAS-01 to ATLAS-08, PERSIST-01 (ATLAS-09 is Phase 15)
- `.planning/PROJECT.md`: Core Value, constraints (legacy operability, integrity, devices), Key Decisions (MapLibre only; Observable Plot + d3; React Aria; nuqs + zustand + TanStack Query; URL permalinks, no accounts; production merge hold)
- `.planning/audit/CAPABILITY-MATRIX.md`: anti-regression contract for retiring `/sites` and `/dashboard/map`

### Design system and prior decisions
- `.planning/phases/04-design-system-instrument-primitives/04-CONTEXT.md`: Atlas direction as a swappable theme (`data-direction`), status palette and shapes, magma wells with a fixed -120 to -50 dB scale, motion rules, alternatives at every UI gate, integrity rules for primitives
- `.planning/phases/04-design-system-instrument-primitives/04-UI-SPEC.md`: tokens, type scale and component specs the workspace composes

### Research for this phase
- `.planning/research/INSPIRATION-TEARDOWN.md`:
  - feature teardowns F1–F5 (GFW), F14 (Earth Index morph) and F15 (Restor panel);
  - patterns P1–P5, P13 and P19;
  - bold directions D1–D4 for the design gate;
  - patterns to avoid (blocking modals, clustered "1000+" pins, WebGL-only views, derived pseudo-health colours).
- `.planning/research/REFERENCE-PLATFORMS.md`: earlier platform profiles (sound-space §1.1; no clustering at n = 54)
- `.planning/research/FEATURES.md` and `.planning/research/PITFALLS.md`: anti-features and confound pitfalls

### Data
- `contracts/bucket/v2/` and `contracts/bucket/v1/sites.json`, `projection.json`: site records, coverage flags, PCA coordinates with explained variance (the source for every count and the method line)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `dashboard-next/src/features/map/`:
  - `MapShell`, `WorldMap`, `ReefMap` and `MiniMap`: MapLibre via react-map-gl;
  - `layers.ts` and `token-style.ts`: circle layers on GeoJSON with token-driven style;
  - `SiteList`.
  - `SitePopup` is superseded by the Inspector (ATLAS-07).
- `dashboard-next/src/features/instrument/`: `InstrumentHeader`, `DataTable`, `ProvenanceChip`, `Legend`, `Spectrogram`, `Transport`, `CompareRow`, `CompareDeck`, `ClipCard`, `AttributionFooter`, `RLabel`.
- `dashboard-next/src/features/ui/`:
  - primitives: `Sheet` (bottom sheet), `ToggleGroup` (Map | Table, By place / By sound, include/exclude), `Table`, `Listbox`, `Tooltip` (label chip), `EmptyState`, `StatusMark`;
  - helpers: `status-shapes.ts`, `count-by.ts` (live counts) and `motion.ts` (reduced-motion-aware tweening).
  - `CommandPalette` exists but ATLAS-09 is Phase 15.
- `dashboard-next/src/features/charts/`: `PlotFigure`, `StripPlot`, `encodings.ts`, `plot-theme.ts` (Observable Plot + d3).
- `dashboard-next/src/features/contract/`: the typed contract client and hooks (TanStack Query) for sites, projection and stamps.

### Established Patterns
- Feature fence: nothing under `src/features` imports `@/components` (ESLint plus `check-feature-fence.mjs`). Only `features/contract` reaches the contract CDN.
- New surfaces use the light Atlas tokens through `data-direction`. Legacy pages keep their dark look, and their 33 Linux visual baselines must not change.
- Components read semantic tokens only; no raw colours, fonts or radii.
- Fixtures and copy use real contract data; counts are computed, never hardcoded.
- Tests: Vitest units, Playwright e2e with axe (fixture-mocked), and Docker-pinned visual baselines. Phase 6 adds e2e plus a visual review at desktop and tablet widths (success criterion 5).

### Integration Points
- The new route under `dashboard-next/src/app/` (expected `explore/`) composes the features. `layout.tsx` and the `ConditionalShell` nav change to Listen · Explore · Analyze · Methods (ATLAS-08) without breaking legacy routes.
- A zustand store holds transient UI state. The URL (nuqs) holds all persisted view state (PERSIST-01).

</code_context>

<specifics>
## Specific Ideas

- The layout follows the GFW and Restor pattern: map in the centre, provenance in a docked panel, Bench along the bottom.
- The morph follows Earth Index's "By similarity / By location" toggle with a legend that states its method. It drops Earth Index's blocking explainer modal and its embedding-derived colour.
- The owner previously chose to keep Atlas as the default direction (2026-10-05). Nocturne and Poster remain token-level alternates.

</specifics>

<deferred>
## Deferred Ideas

- Hover-to-hear and spectrogram-thumbnail previews on marks were considered and not chosen for Phase 6 (label chip only). They could return with the Specimen Drawer direction or in Phase 7.
- A first-time sound-space explainer was not chosen; the always-on method line covers it.

</deferred>

---

*Phase: 06-instrument-shell-atlas*
*Context gathered: 2026-10-17*
