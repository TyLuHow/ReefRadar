<objective>
Add region-based navigation to the reef map: a dropdown/button bar that lets users jump to specific geographic regions (Indonesia, Great Barrier Reef, Kenya Coast, Maldives, Mesoamerican Reef, Caribbean) with smooth fly-to animation. Also add marker clustering so zoomed-out views show aggregated clusters that expand into individual sites when zooming in.
</objective>

<context>
Read CLAUDE.md for project conventions and architecture.

Key files to examine and modify:
- `dashboard-next/src/components/map/ReefMap.tsx` — Main map with DeckGL + MapLibre, ScatterplotLayer, WebGL detection/fallback
- `dashboard-next/src/components/map/MapControls.tsx` — Country and status filter checkboxes (top-right)
- `dashboard-next/src/components/map/HealthLegend.tsx` — Status color legend
- `dashboard-next/src/components/map/SitePopup.tsx` — Site detail popup
- `dashboard-next/src/components/map/index.ts` — Barrel exports
- `dashboard-next/src/app/dashboard/map/page.tsx` — Map page
- `dashboard-next/src/types/index.ts` — Site type
- `dashboard-next/package.json` — Current deps (deck.gl v9, react-map-gl v7, maplibre-gl v4)

The map currently uses:
- `initialViewState` (not controlled) with zoom 2, centered at lat 0, lon 80
- ScatterplotLayer with glow + core layers
- MapControls with country checkboxes and status checkboxes
- Golden Hour design system: abyss (#1a1714), bone (#e5e1db), ochre (#cd853f), dusty-rose (#c08081)

deck.gl v9 provides `FlyToInterpolator` for smooth animated transitions.
</context>

<requirements>

## Step 1: Create Region Data Module

Create `dashboard-next/src/lib/regions.ts`:

```typescript
export interface RegionBounds {
  id: string;
  name: string;
  center: { lat: number; lon: number };
  zoom: number;
}

export const REGIONS: RegionBounds[] = [
  { id: 'global', name: 'Global View', center: { lat: 0, lon: 80 }, zoom: 2 },
  { id: 'indonesia', name: 'Indonesia', center: { lat: -2.5, lon: 118 }, zoom: 5 },
  { id: 'gbr', name: 'Great Barrier Reef', center: { lat: -18, lon: 147 }, zoom: 6 },
  { id: 'kenya', name: 'Kenya Coast', center: { lat: -3, lon: 40 }, zoom: 8 },
  { id: 'maldives', name: 'Maldives', center: { lat: 4, lon: 73 }, zoom: 7 },
  { id: 'mexico', name: 'Mesoamerican Reef', center: { lat: 18.5, lon: -87 }, zoom: 7 },
];
```

## Step 2: Convert Map to Controlled ViewState

Update `dashboard-next/src/components/map/ReefMap.tsx`:

1. Change from `initialViewState` to controlled `viewState` + `onViewStateChange`
2. Store viewState in useState, initialized to the global view
3. Import `FlyToInterpolator` from `@deck.gl/core`
4. Add `handleRegionSelect(region)` that calls `setViewState` with:
   - latitude: region.center.lat
   - longitude: region.center.lon
   - zoom: region.zoom
   - transitionDuration: 1500
   - transitionInterpolator: new FlyToInterpolator()
5. Preserve existing pitch (30) and bearing (0) during transitions
6. Accept `onViewStateChange` from DeckGL and update local state (so manual pan/zoom still works)
7. Track `selectedRegion` state so the dropdown shows which region is active

## Step 3: Add Region Selector to MapControls

Update `dashboard-next/src/components/map/MapControls.tsx`:

1. Add new props: `onRegionSelect`, `selectedRegion`
2. Add a "Jump to Region" section at the TOP of the controls panel (before Country filters)
3. Use a `<select>` dropdown styled with the Golden Hour palette:
   - Background: rgba(26, 23, 20, 0.5) (semi-transparent abyss)
   - Text: bone color
   - Border: glass-border style
   - Rounded corners
4. When user selects a region, call `onRegionSelect(region)`
5. Keep existing country and status filters below the region selector

Alternative: If the dropdown looks too cramped, use small pill buttons instead (one per region), similar to the country checkboxes but clickable to navigate.

## Step 4: Wire Region Selection Through Map Page

Update `dashboard-next/src/app/dashboard/map/page.tsx`:
- The MapControls region selector should communicate with ReefMap
- This may require lifting state up or passing callbacks through
- Examine the current page structure to determine the best wiring approach

## Step 5: Add Marker Clustering (Optional but Recommended)

If the expanded site count (44+) makes the map cluttered at low zoom:

1. Install `supercluster` as a dependency: `npm install supercluster` and `npm install -D @types/supercluster`
2. Create a `useSiteClusters` hook that:
   - Takes sites array and current zoom level
   - Creates a Supercluster index with radius 40, maxZoom 14
   - Returns clustered features for the current viewport
3. Render clusters as larger circles with a count label
4. Individual sites render as they do now (glow + core ScatterplotLayer)
5. Clicking a cluster zooms in to expand it

If clustering adds too much complexity or the 44 sites aren't enough to warrant it, skip this step and note it as a future enhancement.

## Step 6: Ensure Responsive Behavior

- On mobile (< 768px), the region selector should stack above the map
- The controls panel should be collapsible on mobile
- Fly-to animations should respect reduced-motion preferences: check `window.matchMedia('(prefers-reduced-motion: reduce)')` and skip animation if true

</requirements>

<constraints>
- Do NOT change the map tile provider (keep CartoDBn dark-matter style)
- Do NOT change the site marker colors or the status color scheme
- The FlyToInterpolator must come from @deck.gl/core (already installed as dep)
- The only new npm dependency allowed is `supercluster` + `@types/supercluster` (and only if implementing clustering)
- Preserve the existing WebGL detection and error boundary in ReefMap.tsx
- Preserve the existing SitePopup functionality
- All styling must use the Golden Hour palette — no new colors
</constraints>

<verification>
1. `cd dashboard-next && npm run build` passes with zero errors
2. The region dropdown appears in MapControls
3. Selecting "Indonesia" from the dropdown smoothly zooms the map to Indonesia
4. Selecting "Global View" zooms back out to the world view
5. Manual pan/zoom still works after a fly-to animation
6. Country and status filters still work correctly
7. Site click popups still work
</verification>

<success_criteria>
- Region dropdown with 6 options (Global, Indonesia, GBR, Kenya, Maldives, Mexico)
- Smooth fly-to animation (1-2 seconds) when selecting a region
- Manual pan/zoom unaffected
- All existing map features preserved (filters, popups, legend, WebGL fallback)
- Responsive on mobile
- Build passes cleanly
</success_criteria>
