<objective>
Add interactive map visualizations and enhanced data displays to the React dashboard. This provides geographic context for the reference sites and makes the analysis results more engaging.

Users will be able to see where reference reefs are located globally and understand the geographic distribution of reef health data.
</objective>

<context>
Read CLAUDE.md for project conventions.

Dashboard location (from prompt 020):
@dashboard-next/src/ - React/Next.js dashboard

Reference site data with coordinates:
@data/embeddings/metadata.json - Contains sites with lat/lon, country, status

Sample site structure:
```json
{
  "site_id": "ind_H4",
  "country": "Indonesia",
  "latitude": -4.929463,
  "longitude": 119.316792,
  "status": "healthy"
}
```

API endpoint for sites:
- GET /sites - Returns list of reference sites with all metadata
</context>

<requirements>
1. **Interactive World Map** (Sites Page):
   - Use React-Leaflet or Mapbox GL JS
   - Display all reference sites as markers
   - Color-code markers by status (green=healthy, red=degraded, yellow=restored)
   - Popup on click showing site details (ID, country, status)
   - Zoom to fit all markers on load
   - Allow filtering by status/country

2. **Enhanced Results Visualization** (Analyze Page):
   - Mini-map showing closest matching reference sites
   - Highlight the top 3 similar sites on map
   - Show distance/similarity relationship visually

3. **Improved Charts**:
   - Replace basic scatter plot with interactive embedding visualization
   - Probability distribution as animated bar chart
   - Add chart tooltips with detailed info

4. **Site Details Panel**:
   - Expandable cards for each reference site
   - Show site metadata, embedding stats
   - Visual indicator of health status
   - Country flag icons (optional)

5. **Responsive Design**:
   - Map works on mobile (touch gestures)
   - Collapsible sidebar for filters on small screens
</requirements>

<implementation>
Recommended libraries:
- `react-leaflet` + `leaflet` for maps (free, no API key needed)
- `recharts` or `visx` for charts
- Map tiles from OpenStreetMap (free)

New components to create:
```
src/components/
├── maps/
│   ├── WorldMap.tsx         # Full interactive map
│   ├── SiteMarker.tsx       # Custom marker component
│   └── MiniMap.tsx          # Small map for results
├── charts/
│   ├── EmbeddingScatter.tsx # Interactive scatter plot
│   └── ProbabilityBars.tsx  # Animated probability bars
└── sites/
    ├── SiteCard.tsx         # Site detail card
    └── SiteFilters.tsx      # Filter controls
```

Leaflet setup notes:
- Import Leaflet CSS in layout or page
- Use dynamic import to avoid SSR issues: `const Map = dynamic(() => import('./WorldMap'), { ssr: false })`
</implementation>

<constraints>
- Maps must work without paid API keys (use OpenStreetMap)
- Keep bundle size reasonable (leaflet ~40KB gzipped)
- Must remain static-export compatible
- Graceful fallback if geolocation not available
</constraints>

<output>
Modify/create files in:
- `./dashboard-next/src/components/maps/` - Map components
- `./dashboard-next/src/components/charts/` - Enhanced charts
- `./dashboard-next/src/app/sites/page.tsx` - Update sites page
- `./dashboard-next/src/app/page.tsx` - Add mini-map to results

Update package.json with new dependencies.
</output>

<verification>
1. Map renders with all reference sites visible
2. Markers are correctly positioned (check Indonesia sites ~longitude 119)
3. Popup shows correct site information
4. Filtering works (show only healthy/degraded/restored)
5. Mobile touch gestures work on map
6. Static export still works after changes
</verification>

<success_criteria>
- Interactive world map on sites page
- Color-coded markers by reef health status
- Filter/search functionality
- Mini-map on results page showing similar sites
- Improved probability visualization
- All visualizations work on mobile
</success_criteria>
