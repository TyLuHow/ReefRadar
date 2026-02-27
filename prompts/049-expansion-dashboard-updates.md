<objective>
Update the dashboard and map to display the expanded site database (metadata v6.0) with new Caribbean and Pacific regions. Add Florida Keys and South Pacific region navigation, update country filters, site counts, and attribution.

This prompt runs AFTER prompt 048 (geographic-site-expansion-data) which creates metadata_v6.json with 50+ sites.
</objective>

<context>
Read CLAUDE.md for project conventions and architecture.

Key files to examine:
- `data/embeddings/metadata_v6.json` — Expanded metadata (created by prompt 048)
- `dashboard-next/src/lib/regions.ts` — Region definitions for map fly-to
- `dashboard-next/src/components/map/ReefMap.tsx` — Map with DeckGL, controlled viewState, fly-to, embedding distinction
- `dashboard-next/src/components/map/MapControls.tsx` — Region selector dropdown, country/status filters
- `dashboard-next/src/components/map/SitePopup.tsx` — Site detail popup with embedding badge
- `dashboard-next/src/components/map/index.ts` — Barrel exports
- `dashboard-next/src/app/dashboard/map/page.tsx` — Map page wiring
- `dashboard-next/src/types/index.ts` — Site type with has_embedding, region, source
- `dashboard-next/src/app/page.tsx` — Home page with site count
- `dashboard-next/src/components/experience/DemoState.tsx` — Has "Explore N Sites on Map"
- `dashboard-next/src/app/about/page.tsx` — About page with data attributions
- `lambdas/router/handler.py` — /sites endpoint (already loads metadata_v5, needs v6 update)

The map currently has 6 regions in `regions.ts`: Global, Indonesia, GBR, Kenya, Maldives, Mexico.
MapControls has 5 countries: Indonesia, Australia, Kenya, Maldives, Mexico.
The design system uses Golden Hour palette: abyss (#1a1714), bone (#e5e1db), ochre (#cd853f), dusty-rose (#c08081).
</context>

<requirements>

## Step 1: Add New Map Regions

Update `dashboard-next/src/lib/regions.ts` to add:

```typescript
{ id: 'florida', name: 'Florida Keys', center: { lat: 24.55, lon: -81.5 }, zoom: 9 },
{ id: 'pacific', name: 'South Pacific', center: { lat: -16.5, lon: -151.7 }, zoom: 8 },
```

Insert after Mexico and before the closing bracket, so the order is:
Global, Indonesia, GBR, Kenya, Maldives, Mexico, Florida Keys, South Pacific

## Step 2: Update Country Filters

Update `dashboard-next/src/components/map/MapControls.tsx`:
- Add 'USA' and 'French Polynesia' to the COUNTRIES array
- Order: Indonesia, Australia, Kenya, Maldives, Mexico, USA, French Polynesia

## Step 3: Update Lambda Router

Update `lambdas/router/handler.py`:
- Change metadata file from `metadata_v5.json` to `metadata_v6.json` (with fallback to v5)
- Ensure new countries (USA, French Polynesia) appear in the response

Do NOT deploy — just update the code.

## Step 4: Update Dashboard Site Counts

Search for and update all hardcoded site counts across the dashboard:
- Check `data/embeddings/metadata_v6.json` for the actual total_sites count
- Update `dashboard-next/src/app/page.tsx` — homepage references
- Update `dashboard-next/src/components/experience/DemoState.tsx` — "Explore N Sites on Map"
- Update any other files with hardcoded "45" site counts

## Step 5: Update Site Type Coordinates

Update `dashboard-next/src/types/index.ts`:
- Add the new site coordinate entries to SITE_COORDINATES for the expansion sites
- Add entries for French Polynesia sites (borabora_*)
- Add entries for Florida Keys sites (irma_*, sanctsound_fk*)
- Add 'unknown' to the ReefStatus type if not already present (for SanctSound sites)

## Step 6: Update About Page Attribution

Update `dashboard-next/src/app/about/page.tsx` to add data source attributions:

Add a "Data Sources" section (or update existing) with:

**MARRS Foundation** (existing)
- Mars Assisted Reef Restoration System
- 45 sites across Indo-Pacific

**Hurricane Irma Florida Keys Dataset**
- Simmons, K.R., Bohnenstiehl, D.R., & Eggleston, D.B. (2020)
- DOI: 10.5061/dryad.sxksn0319
- License: CC0 (Public Domain)

**CoralSoundExplorer Bora-Bora**
- Minier, L., et al. (2025). PLOS Computational Biology
- DOI: 10.5281/zenodo.14577064
- License: CC-BY 4.0

**NOAA SanctSound**
- NOAA Sanctuary Soundscape Monitoring Project
- Public Domain (U.S. Government Work)

Style the attribution section using the existing Golden Hour design. Use GlassPanel if the page uses them.

## Step 7: Handle 'unknown' Status in Map

If any sites have status "unknown" (SanctSound sites), ensure:
- `dashboard-next/src/components/map/ReefMap.tsx` handles unknown status gracefully
- Add a color for 'unknown' in STATUS_COLORS_RGB (suggest muted gray: [168, 162, 158])
- The HealthLegend shows 'Unknown' if any unknown-status sites exist
- SitePopup displays "Unknown" status properly

## Step 8: Verify Build

Run `cd dashboard-next && npm run build` and fix any TypeScript or build errors.
</requirements>

<constraints>
- Do NOT change existing map tile provider or marker colors for existing statuses
- Do NOT remove existing regions — only add new ones
- Do NOT deploy any Lambda functions — just update code
- All styling must use the Golden Hour palette
- Preserve all existing functionality (filters, popups, fly-to, WebGL fallback)
- The about page attribution must include proper academic citations with DOIs
</constraints>

<verification>
1. `cd dashboard-next && npm run build` passes with zero errors
2. `regions.ts` has 8 regions (6 existing + 2 new)
3. MapControls COUNTRIES array has 7 entries
4. Site counts in homepage and DemoState match metadata_v6.json total
5. About page includes all three new data source attributions
6. 'unknown' status has a color and renders without errors
</verification>

<success_criteria>
- Florida Keys and South Pacific appear in the map region dropdown
- USA and French Polynesia appear in country filters
- Site counts are accurate throughout the dashboard
- About page has proper academic citations
- Unknown-status sites render correctly on the map
- Build passes cleanly
</success_criteria>
