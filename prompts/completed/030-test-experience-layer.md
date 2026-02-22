<objective>
Run a comprehensive testing checklist for the ReefRadar Experience Layer. The dev server is already running at http://localhost:3000 (accessible via WSL2 at http://172.23.248.161:3000). Systematically verify every page, component, and interaction across all 7 routes.

This is a TESTING prompt — do NOT write new features or make code changes. Only read files to diagnose issues, and report a pass/fail checklist with details on any failures.
</objective>

<context>
The ReefRadar Experience Layer was built across 4 sequential prompts (026-029) enhancing an existing Next.js 14 dashboard at `dashboard-next/`. The backend API is live at https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod.

Read the project's CLAUDE.md for architecture context.

The dev server is running on port 3000 bound to 0.0.0.0.
</context>

<test_procedure>

## Phase 1: Build Verification

1. Run `cd dashboard-next && npm run build` and confirm zero errors
2. List all routes in the build output
3. Check for any TypeScript warnings or unused imports

## Phase 2: Landing Page (/)

Test by reading source files and verifying component structure:

1. **Read `dashboard-next/src/app/page.tsx`** — Verify it imports and renders all 6 landing sections in order:
   - ScrollProgress
   - HeroSection
   - ProblemSection
   - SoundSection
   - HowItWorks
   - ImpactStats
   - CTASection

2. **Read `dashboard-next/src/components/landing/HeroSection.tsx`** — Verify:
   - [ ] Uses 'use client' directive
   - [ ] Has dark ocean background (var(--abyss) or similar)
   - [ ] Title text: "The Ocean Has a Voice"
   - [ ] Has CSS particle animation (floating dots)
   - [ ] Has scroll indicator

3. **Read `dashboard-next/src/components/landing/ProblemSection.tsx`** — Verify:
   - [ ] Uses AnimatedCounter components
   - [ ] Contains stat: "84.4%" bleaching stress
   - [ ] Contains stat: "$9.9 trillion" ecosystem services
   - [ ] Contains stat: "2035" collapse timeline
   - [ ] Uses GlowCard for stat cards
   - [ ] Has scroll-triggered animations

4. **Read `dashboard-next/src/components/landing/SoundSection.tsx`** — Verify:
   - [ ] Embeds AudioCompare component (compact mode)
   - [ ] Has lazy loading (next/dynamic)
   - [ ] CTA link to /dashboard/compare

5. **Read `dashboard-next/src/components/landing/HowItWorks.tsx`** — Verify:
   - [ ] 5-step pipeline (not 4, not 6)
   - [ ] Step 2 says "5-second windows" (NOT 1.88 seconds)
   - [ ] Step 3 says "1,280 acoustic features" (NOT 1,024)
   - [ ] Step 5 mentions geographic region confidence adjustment
   - [ ] Has framer-motion animations

6. **Read `dashboard-next/src/components/landing/ImpactStats.tsx`** — Verify:
   - [ ] "8 Reference Sites" counter
   - [ ] "2 Countries" counter
   - [ ] "1,280 Acoustic Features" counter
   - [ ] "0.933 AUC-ROC" counter (3 decimals)
   - [ ] Uses GlowCard and AnimatedCounter

7. **Read `dashboard-next/src/components/landing/CTASection.tsx`** — Verify:
   - [ ] CTA button links to /dashboard/analyze
   - [ ] CTA button links to /dashboard
   - [ ] Links to /sites and /about
   - [ ] Includes CaveatsBanner component

## Phase 3: Dashboard Compare (/dashboard/compare)

8. **Read `dashboard-next/src/app/dashboard/compare/page.tsx`** — Verify:
   - [ ] Imports and renders AudioCompare component (full mode, not compact)
   - [ ] Has CaveatsBanner
   - [ ] Dark ocean theme styling

9. **Read `dashboard-next/src/components/audio/AudioCompare.tsx`** — Verify:
   - [ ] Creates AudioContext only after user interaction
   - [ ] Uses SyntheticAudioGenerator for demo audio
   - [ ] Has ABCrossfader for crossfade control
   - [ ] Renders SpectrogramCanvas for each source
   - [ ] Play/Pause button toggles both sources
   - [ ] Shows "Demo audio" banner
   - [ ] Supports compact prop
   - [ ] Cleans up AudioContext on unmount

10. **Read `dashboard-next/src/components/audio/ABCrossfader.tsx`** — Verify:
    - [ ] Slider range 0-1
    - [ ] Labels: "Healthy" left, "Degraded" right
    - [ ] Dynamic description text based on position

11. **Read `dashboard-next/src/components/audio/SpectrogramCanvas.tsx`** — Verify:
    - [ ] Uses canvas element
    - [ ] getFloatFrequencyData from AnalyserNode
    - [ ] Waterfall display (shifts left)
    - [ ] Color palette support (ocean/thermal/grayscale)
    - [ ] requestAnimationFrame cleanup on unmount
    - [ ] ResizeObserver for responsive width

12. **Read `dashboard-next/src/components/audio/SyntheticAudioGenerator.ts`** — Verify:
    - [ ] Exports generateHealthyReef and generateDegradedReef
    - [ ] Healthy: pink noise + shrimp clicks + fish grunts
    - [ ] Degraded: low-amplitude brown noise, sparse
    - [ ] Returns AudioBuffer

## Phase 4: Dashboard Map (/dashboard/map)

13. **Read `dashboard-next/src/app/dashboard/map/page.tsx`** — Verify:
    - [ ] Fetches sites from API (GET /sites)
    - [ ] Loads ReefMap via next/dynamic with ssr: false
    - [ ] Has MapControls overlay
    - [ ] Has HealthLegend overlay
    - [ ] Has CaveatsBanner
    - [ ] Shows LoadingReef during data fetch

14. **Read `dashboard-next/src/components/map/ReefMap.tsx`** — Verify:
    - [ ] Uses DeckGL from @deck.gl/react
    - [ ] Uses Map from react-map-gl/maplibre
    - [ ] Map style: CARTO dark-matter (free, no API key)
    - [ ] Initial view centered on Indo-Pacific (~lat -4.5, lon ~100)
    - [ ] ScatterplotLayer with correct status colors:
      - healthy: green (#00ffa3 or [0, 255, 163])
      - degraded: red (#ff6b6b or [255, 107, 107])
      - restored_early: gold (#ffd700 or [255, 215, 0])
      - restored_mid: cyan (#00e5ff or [0, 229, 255])
    - [ ] Click handler shows SitePopup
    - [ ] Glow effect layer (larger radius, lower opacity)

15. **Read `dashboard-next/src/components/map/MapControls.tsx`** — Verify:
    - [ ] Country filter checkboxes
    - [ ] Status filter checkboxes
    - [ ] Reset button

16. **Read `dashboard-next/src/components/map/HealthLegend.tsx`** — Verify:
    - [ ] Shows all 4 status types with colored indicators
    - [ ] Positioned in corner of map

## Phase 5: Dashboard Analyze (/dashboard/analyze)

17. **Read `dashboard-next/src/app/dashboard/analyze/page.tsx`** — Verify:
    - [ ] Has file upload functionality (WAV files)
    - [ ] Shows spectrogram preview after file upload
    - [ ] Uses SpectrogramCanvas component
    - [ ] Includes RegionWarning component for results
    - [ ] Includes CaveatsBanner after results
    - [ ] Sends upload to API POST /upload
    - [ ] Sends analysis request to API POST /analyze
    - [ ] Polls GET /status/{id} for progress
    - [ ] Fetches results from GET /visualize/{id}

## Phase 6: Foundation Components

18. **Read `dashboard-next/src/components/dashboard/RegionWarning.tsx`** — Verify:
    - [ ] Returns null when in_training_distribution is true
    - [ ] Shows amber warning when out-of-distribution
    - [ ] Mentions 40% confidence reduction
    - [ ] Has AlertTriangle icon

19. **Read `dashboard-next/src/components/dashboard/CaveatsBanner.tsx`** — Verify:
    - [ ] Contains all 5 scientific caveats
    - [ ] Collapsible with toggle
    - [ ] Amber/warning aesthetic

20. **Read `dashboard-next/src/components/ui/AnimatedCounter.tsx`** — Verify:
    - [ ] Uses IntersectionObserver
    - [ ] requestAnimationFrame animation
    - [ ] Formats numbers with commas

## Phase 7: Navigation and Layout

21. **Read the navbar/header component** (check for Navbar.tsx or Header.tsx) — Verify:
    - [ ] Links to: Dashboard, Analyze, Map, Compare, Sites, About
    - [ ] Mobile responsive (hamburger menu)

22. **Read `dashboard-next/src/app/dashboard/layout.tsx`** — Verify:
    - [ ] Wraps /dashboard/* pages
    - [ ] Dark background

23. **Read `dashboard-next/src/app/dashboard/page.tsx`** — Verify:
    - [ ] Dashboard home page with feature cards
    - [ ] Links to all dashboard sub-routes

## Phase 8: Scientific Accuracy Check

24. Verify across ALL components that reference SurfPerch specs:
    - [ ] Sample rate: 32,000 Hz (32 kHz) — NOT 16 kHz
    - [ ] Window duration: 5.0 seconds — NOT 1.88 seconds
    - [ ] Embedding dimensions: 1,280 — NOT 1,024
    - [ ] Classifier: "Trained MLP" — NOT "synthetic"
    - [ ] Reference sites: 8 sites — NOT 45 (45 is training data)

## Phase 9: API Integration Check

25. Test the live API endpoints:
    ```bash
    curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health | python3 -m json.tool
    curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites | python3 -m json.tool
    ```
    - [ ] /health returns {"status": "healthy"}
    - [ ] /sites returns 8 sites with correct structure

</test_procedure>

<output>
Save the test results to: `./docs/EXPERIENCE_LAYER_TEST_REPORT.md`

Format as a markdown checklist with:
- Section headers matching the phases above
- [x] for passing tests, [ ] for failures
- For any failures: explain what's wrong and which file needs fixing
- Summary at the top: X/Y tests passed
- List of any critical issues that need immediate attention
</output>

<success_criteria>
- All source files exist and contain expected components
- Build passes with zero errors
- All 7 routes compile
- Scientific specs are correct throughout (32kHz, 5.0s, 1280-dim)
- CaveatsBanner appears in all required locations (analyze results, landing footer, map page)
- RegionWarning returns null for in-distribution regions
- API endpoints respond correctly
- Navigation includes all routes
- No TypeScript errors or missing imports
</success_criteria>
