<objective>
Build the deck.gl interactive sensor map, finalize the dashboard, polish all features, ensure mobile responsiveness, and run comprehensive verification. This is the final prompt in the Experience Layer series — when complete, the entire enhanced dashboard should be production-ready.

You are enhancing an EXISTING working Next.js 14 dashboard at `dashboard-next/`. Do NOT modify backend code.
</objective>

<context>
Read the project's CLAUDE.md for architecture context.

Previous prompts installed:
- 026: Design system, UI primitives, hooks, stores, CaveatsBanner, RegionWarning
- 027: Audio components (SyntheticAudioGenerator, SpectrogramCanvas, FrequencyBandLabels, ABCrossfader, AudioCompare), /dashboard/compare, /dashboard/analyze
- 028: Scrollytelling landing page (Hero, Problem, Sound, HowItWorks, ImpactStats, CTA), Dashboard layout, Dashboard home, Updated navigation

API: https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod
GET /sites returns 8 reference sites:
- ind_H4 (Indonesia, healthy, -4.929, 119.317)
- ind_H5 (Indonesia, healthy, -4.936, 119.318)
- ken_H1 (Kenya, healthy, -2.216, 41.013)
- ind_N1 (Indonesia, restored_early, -4.931, 119.316)
- ind_D2 (Indonesia, degraded, -4.940, 119.319)
- ind_D3 (Indonesia, degraded, -4.931, 119.316)
- ind_R1 (Indonesia, restored_mid, -4.931, 119.316)
- ind_R2 (Indonesia, restored_mid, -4.931, 119.316)

Health status colors:
- healthy: #00ffa3
- degraded: #ff6b6b
- restored_early: #ffd700
- restored_mid: #00e5ff
</context>

<research>
Before making changes, thoroughly read these files to understand the current state:
- `dashboard-next/package.json` — verify deck.gl and maplibre-gl are installed
- `dashboard-next/src/types/index.ts` — Site type definition
- `dashboard-next/src/lib/api.ts` — API client (for fetching sites)
- `dashboard-next/src/components/sites/SiteMap.tsx` — existing basic map (to be replaced)
- `dashboard-next/src/app/sites/page.tsx` — existing sites page
- `dashboard-next/src/app/dashboard/layout.tsx` — dashboard layout from prompt 028
- `dashboard-next/src/components/layout/Header.tsx` — current navigation
- `dashboard-next/src/components/dashboard/CaveatsBanner.tsx` — from prompt 026
- `dashboard-next/src/app/page.tsx` — landing page from prompt 028
- `dashboard-next/src/app/dashboard/analyze/page.tsx` — analyze page from prompt 027
- `dashboard-next/src/app/dashboard/compare/page.tsx` — compare page from prompt 027
- `dashboard-next/next.config.js` — check for any needed config updates
</research>

<requirements>

## PART 1: deck.gl Sensor Map

### Map Components

Create in `dashboard-next/src/components/map/`:

#### ReefMap.tsx
Main deck.gl map component showing all reference sites.

**Implementation:**
```typescript
'use client';

import { useState, useMemo, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
```

**Configuration:**
- Map style: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` (free, no API key)
- Initial view: latitude -4.5, longitude 100, zoom 4, pitch 30, bearing 0 (centered on Indo-Pacific)
- Two ScatterplotLayer instances:
  1. Glow layer: larger radius (2000m), lower opacity (0.3), creates glow effect
  2. Core layer: smaller radius (800m), full opacity, the actual dot
- Color by status: healthy=#00ffa3, degraded=#ff6b6b, restored_early=#ffd700, restored_mid=#00e5ff
- On click: show SitePopup
- On hover: highlight site (increase radius)

**Props:**
```typescript
interface ReefMapProps {
  sites: Site[];
  selectedSite?: Site | null;
  onSiteSelect?: (site: Site | null) => void;
  className?: string;
  height?: string; // Default: '600px'
}
```

#### SitePopup.tsx
Popup card that appears when a site is clicked on the map.

**Content:**
- Country flag emoji + Country name + Site ID
- Status indicator (colored dot + status name)
- Coordinates (lat, lon)
- Divider line
- "View Details" link to /sites page with filter
- Close button (X)

**Styling:** Dark card (var(--deep)), border matching status color, glass-morphism effect

#### HealthLegend.tsx
Map legend showing what each color means.

- Positioned in bottom-left of map (absolute)
- Four entries: Healthy, Degraded, Restored (Early), Restored (Mid)
- Each with colored dot and label
- Semi-transparent dark background

#### MapControls.tsx
Filter controls overlaid on the map.

- Positioned in top-right (absolute)
- Filter by country: checkboxes for Indonesia, Kenya
- Filter by status: checkboxes for each status
- "Reset" button to clear filters
- Semi-transparent dark background, matches ocean theme

### Map Page

Create `dashboard-next/src/app/dashboard/map/page.tsx`:

- Full-width map taking most of the viewport
- Fetches sites from API: GET /sites
- Passes sites to ReefMap component
- MapControls overlay for filtering
- HealthLegend overlay
- CaveatsBanner below the map
- Page title: "Monitoring Network"
- Brief description: "8 reference monitoring sites across Indonesia and Kenya"

### Update Existing Sites Page

Update `dashboard-next/src/app/sites/page.tsx`:
- Replace the existing basic SiteMap with the new ReefMap component
- Keep the existing SiteFilters and SiteCard components
- The map and card list should work together: clicking a site on the map highlights the corresponding card

## PART 2: Polish and Consistency

### Responsive Design Audit
Check and fix responsive design on ALL pages:
- Landing page sections should stack properly on mobile (<768px)
- AudioCompare: side-by-side on desktop, stacked on mobile
- deck.gl map: full width on all viewports, reduced height on mobile
- Dashboard layout: single column on mobile
- All text readable at 320px viewport width
- No horizontal scrolling on any page

### Loading States
- Add LoadingReef component to pages that fetch data (map, sites, analyze)
- Show skeleton/loading state while API calls are in progress

### Animation Performance
- Ensure all framer-motion animations use `transform` and `opacity` only
- Landing page particle animation should use `will-change: transform`
- Spectrogram canvas should not cause layout shifts
- Test that scroll animations don't cause jank

### Dark Theme Consistency
Ensure ALL pages use the ocean depth theme consistently:
- Landing page: full dark theme (var(--abyss), var(--deep))
- Dashboard pages: dark theme
- Sites page: update to dark theme if still using light colors
- About page: update to dark theme if still using light colors
- Header and Footer: dark theme

### Next.js Configuration
Update `dashboard-next/next.config.js` if needed:
- Add `transpilePackages` for deck.gl if needed (deck.gl ESM modules sometimes need it):
  ```js
  transpilePackages: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/react', 'maplibre-gl']
  ```
- Ensure no SSR issues with deck.gl/maplibre (use next/dynamic with ssr: false for map components)

## PART 3: Verification

Run comprehensive verification after all changes:

### Build Check
```bash
cd dashboard-next && npm run build
```
Must succeed with zero errors.

### Page Inventory
Verify ALL these routes render without errors:
- `/` — Scrollytelling landing page
- `/dashboard` — Dashboard home
- `/dashboard/analyze` — Enhanced analyze with spectrogram
- `/dashboard/compare` — Audio A/B comparison
- `/dashboard/map` — deck.gl sensor map
- `/sites` — Reference sites with new map
- `/about` — About/methodology page

### Component Verification
- [ ] AnimatedCounter triggers animation on scroll
- [ ] GlowCard shows glow effect on hover
- [ ] WaveBackground renders animated waves
- [ ] ScrollProgress shows scroll position
- [ ] AudioCompare generates synthetic audio and crossfades
- [ ] SpectrogramCanvas renders waterfall display
- [ ] ReefMap shows all 8 sites with correct status colors
- [ ] SitePopup shows site details on click
- [ ] RegionWarning renders for out-of-distribution regions
- [ ] CaveatsBanner shows all 5 scientific caveats

### Scientific Accuracy
- [ ] All references to SurfPerch use correct specs: 32kHz, 5.0s windows, 1280-dim
- [ ] Classifier described as "Trained MLP" not "synthetic"
- [ ] "8 reference sites" not "45 sites" (45 is total training data, 8 are deployed)
- [ ] CaveatsBanner appears below every analysis result AND in landing page footer AND in map page

</requirements>

<constraints>
- Do NOT modify backend code or Lambda functions
- deck.gl and maplibre must be loaded with `next/dynamic` and `ssr: false` to avoid SSR errors
- Map tile source must be free (CARTO dark-matter, no API key)
- All pages must work without JavaScript initially (graceful degradation where possible)
- No external image URLs — use CSS, SVG, or icon components only
- Final bundle size should be reasonable — use dynamic imports for heavy components (deck.gl, AudioCompare)
- `npm run build` must pass with zero errors as the FINAL check
</constraints>

<verification>
This is the final prompt in the series. Run thorough verification:

1. `cd dashboard-next && npm run build` — MUST pass with zero errors
2. Start dev server: `npm run dev -- -H 0.0.0.0`
3. Test every route listed above loads without console errors
4. Verify dark theme is consistent across all pages
5. Check mobile responsiveness (test at 375px viewport width mentally via code review)
6. Verify scientific caveats appear in all required locations
7. List any known issues or future improvements at the end

Report the final state:
- Total new files created across all 4 prompts
- Total routes available
- Any warnings or known limitations
</verification>

<success_criteria>
- deck.gl map renders with all 8 sites in correct positions and colors
- Map uses free CARTO tiles (no API key required)
- Site popups show correct information on click
- Map filters work (by country and status)
- Health legend clearly shows status colors
- All pages use consistent dark ocean theme
- Mobile responsive across all pages
- Loading states shown during data fetching
- Scientific caveats appear in all required locations
- `npm run build` passes with zero errors
- All 7+ routes render without console errors
- Production-ready quality throughout
</success_criteria>
