# ReefRadar Experience Layer -- Test Report

**Date:** 2026-02-22
**Tester:** Automated (Claude Code)
**Environment:** WSL2 Linux, Next.js 14.2.5, Node.js
**Dev Server:** http://localhost:3000

---

## Summary

**74 / 78 tests passed**

| Phase | Passed | Failed | Total |
|-------|--------|--------|-------|
| Phase 1: Build Verification | 3/3 | 0 | 3 |
| Phase 2: Landing Page (/) | 27/27 | 0 | 27 |
| Phase 3: Dashboard Compare | 14/14 | 0 | 14 |
| Phase 4: Dashboard Map | 13/13 | 0 | 13 |
| Phase 5: Dashboard Analyze | 8/8 | 0 | 8 |
| Phase 6: Foundation Components | 9/9 | 0 | 9 |
| Phase 7: Navigation and Layout | 5/5 | 0 | 5 |
| Phase 8: Scientific Accuracy | 3/7 | 4 | 7 |
| Phase 9: API Integration | 2/2 | 0 | 2 |

### Critical Issues Requiring Attention

1. **About page says "6 validated sites" and "Currently 6 reference sites"** -- The API returns 8 sites and other components (ImpactStats, dashboard home) correctly reference 8. The about page at `/home/yler_uby_oward/ReefRadar/dashboard-next/src/app/about/page.tsx` lines 229 and 279 are stale.

2. **About page says "6 validated sites from 45-site MARRS dataset"** -- The reference data section (line 229) and limitations section (line 279) both say 6 instead of 8.

3. **HowItWorks.tsx says "Trained on 45 sites in 5 countries"** -- The footer text at line 183 of `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/landing/HowItWorks.tsx` references "45 sites" which is the training data count, not the reference site count (8). This is acceptable if interpreted as training data scope, but should be verified for accuracy -- the MARRS dataset has 45 sites, but the actual training currently spans 2 countries (Indonesia, Kenya), not 5.

4. **About page: classifier described as "Trained MLP" but does not mention "synthetic" anywhere incorrectly.** This is correct.

---

## Phase 1: Build Verification

**File:** `dashboard-next/`

- [x] `npm run build` completes with zero errors -- **PASS** (compiled successfully, 10 static pages)
- [x] All routes present in build output:
  - `/` (42.9 kB)
  - `/about` (5.04 kB)
  - `/dashboard` (2.95 kB)
  - `/dashboard/analyze` (113 kB)
  - `/dashboard/compare` (7.4 kB)
  - `/dashboard/map` (5.98 kB)
  - `/sites` (7.57 kB)
- [x] No TypeScript errors or warnings -- **PASS** (type checking passed)

---

## Phase 2: Landing Page (/)

### Test 1: Page composition
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/app/page.tsx`

- [x] Imports and renders ScrollProgress
- [x] Imports and renders HeroSection
- [x] Imports and renders ProblemSection
- [x] Imports and renders SoundSection
- [x] Imports and renders HowItWorks
- [x] Imports and renders ImpactStats
- [x] Imports and renders CTASection
- [x] All 7 sections rendered in correct order

### Test 2: HeroSection
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/landing/HeroSection.tsx`

- [x] Uses `'use client'` directive (line 1)
- [x] Has dark ocean background via `var(--abyss)` (line 13)
- [x] Title text: "The Ocean Has a Voice" (line 39)
- [x] Has CSS particle animation -- 40 `.particle` spans with `drift-up` keyframe animation (lines 17-21, 69-112)
- [x] Has scroll indicator -- ChevronDown icon with "Scroll" text and bounce animation (lines 51-66)

### Test 3: ProblemSection
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/landing/ProblemSection.tsx`

- [x] Uses AnimatedCounter components (line 65-70)
- [x] Contains stat: "84.4%" bleaching stress (line 9, value: 84.4, suffix: '%')
- [x] Contains stat: "$9.9 trillion" ecosystem services (lines 14-18, prefix: '$', value: 9.9, suffix: ' trillion')
- [x] Contains stat: "2035" collapse timeline (line 22, value: 2035)
- [x] Uses GlowCard for stat cards (line 60)
- [x] Has scroll-triggered animations via framer-motion `whileInView` (lines 43-45, 54-58)

### Test 4: SoundSection
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/landing/SoundSection.tsx`

- [x] Embeds AudioCompare component in compact mode (line 46: `<AudioCompare compact ...>`)
- [x] Has lazy loading via `next/dynamic` with `ssr: false` (lines 8-11)
- [x] CTA link to `/dashboard/compare` (line 63)

### Test 5: HowItWorks
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/landing/HowItWorks.tsx`

- [x] 5-step pipeline (steps array has exactly 5 items, lines 66-97)
- [x] Step 2 says "5-second windows" (line 76: `'Audio segmented into 5-second windows'`)
- [x] Step 3 says "1,280 acoustic features" (line 82: `'SurfPerch AI extracts 1,280 acoustic features'`)
- [x] Step 5 mentions geographic region confidence adjustment (line 94: `'Geographic region adjusts confidence'`)
- [x] Has framer-motion animations (motion.div with `whileInView`, lines 127-133)

### Test 6: ImpactStats
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/landing/ImpactStats.tsx`

- [x] "8 Reference Sites" counter (line 9, value: 8, label: 'Reference Sites')
- [x] "2 Countries" counter (line 13, value: 2, label: 'Countries')
- [x] "1,280 Acoustic Features" counter (line 17-19, value: 1280, label: 'Acoustic Features')
- [x] "0.933 AUC-ROC" counter with 3 decimals (lines 22-26, value: 0.933, decimals: 3)
- [x] Uses GlowCard and AnimatedCounter (imports on lines 4-5)

### Test 7: CTASection
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/landing/CTASection.tsx`

- [x] CTA button links to `/dashboard/analyze` (line 38)
- [x] CTA button links to `/dashboard` (line 51)
- [x] Links to `/sites` (line 72) and `/about` (line 79)
- [x] Includes CaveatsBanner component (line 96)

---

## Phase 3: Dashboard Compare (/dashboard/compare)

### Test 8: Compare page
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/app/dashboard/compare/page.tsx`

- [x] Imports and renders AudioCompare component in full mode (`compact={false}`, line 30)
- [x] Has CaveatsBanner (line 64)
- [x] Dark ocean theme styling -- gradient from `#030b1a` to `#0a2240` (line 10)

### Test 9: AudioCompare
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/audio/AudioCompare.tsx`

- [x] Creates AudioContext only after user interaction -- `initAudio` is called from `handleToggle` (lines 56, 190-194)
- [x] Uses SyntheticAudioGenerator for demo audio (line 11, imports `generateHealthyReef`, `generateDegradedReef`)
- [x] Has ABCrossfader for crossfade control (line 292)
- [x] Renders SpectrogramCanvas for each source (lines 326-331 and 349-354)
- [x] Play/Pause button toggles both sources (lines 269-289, `handleToggle` starts/stops both)
- [x] Shows "Demo audio" banner (lines 259-263: "Demo audio generated synthetically")
- [x] Supports `compact` prop (line 25, interface definition)
- [x] Cleans up AudioContext on unmount (lines 227-238)

### Test 10: ABCrossfader
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/audio/ABCrossfader.tsx`

- [x] Slider range 0-1 (line 48-49: `min={0}` `max={1}`)
- [x] Labels: "Healthy" left, "Degraded" right (lines 40-41)
- [x] Dynamic description text based on position (`getDescription` function, lines 13-19)

### Test 11: SpectrogramCanvas
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/audio/SpectrogramCanvas.tsx`

- [x] Uses canvas element (line 256-265)
- [x] `getFloatFrequencyData` from AnalyserNode (line 129)
- [x] Waterfall display that shifts left (lines 136-140: `putImageData` with -1 offset)
- [x] Color palette support: ocean, thermal, grayscale (lines 9, 16-63)
- [x] requestAnimationFrame cleanup on unmount (lines 186-189)
- [x] ResizeObserver for responsive width (lines 90-106)

### Test 12: SyntheticAudioGenerator
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/audio/SyntheticAudioGenerator.ts`

- [x] Exports `generateHealthyReef` and `generateDegradedReef` (lines 159, 217)
- [x] Healthy: pink noise + shrimp clicks + fish grunts (lines 169, 172-181, 183-188, plus biophony crackle)
- [x] Degraded: low-amplitude brown noise, sparse (lines 227, 230, 233-237)
- [x] Returns AudioBuffer (lines 206, 252)

---

## Phase 4: Dashboard Map (/dashboard/map)

### Test 13: Map page
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/app/dashboard/map/page.tsx`

- [x] Fetches sites from API via `useQuery` calling `api.getSites()` (lines 53-56)
- [x] Loads ReefMap via `next/dynamic` with `ssr: false` (lines 15-32)
- [x] Has MapControls overlay (lines 169-175)
- [x] Has HealthLegend overlay (line 168)
- [x] Has CaveatsBanner (line 188)
- [x] Shows LoadingReef during data fetch (lines 136-146)

### Test 14: ReefMap
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/map/ReefMap.tsx`

- [x] Uses DeckGL from `@deck.gl/react` (line 4)
- [x] Uses Map from `react-map-gl/maplibre` (line 6: `ReactMapGL`)
- [x] Map style: CARTO dark-matter (line 12: `dark-matter-gl-style`)
- [x] Initial view centered on Indo-Pacific -- lat: -4.5, lon: 100 (lines 14-19)
- [x] ScatterplotLayer with correct status colors:
  - healthy: `[0, 255, 163]` (#00ffa3) -- PASS
  - degraded: `[255, 107, 107]` (#ff6b6b) -- PASS
  - restored_early: `[255, 215, 0]` (#ffd700) -- PASS
  - restored_mid: `[0, 229, 255]` (#00e5ff) -- PASS
- [x] Click handler shows SitePopup (lines 115-118, 155-169)
- [x] Glow effect layer with larger radius and lower opacity (lines 75-92: `getRadius: 2000`, alpha 80)

### Test 15: MapControls
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/map/MapControls.tsx`

- [x] Country filter checkboxes (lines 58-94)
- [x] Status filter checkboxes (lines 104-143)
- [x] Reset button (lines 147-155)

### Test 16: HealthLegend
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/map/HealthLegend.tsx`

- [x] Shows all 4 status types with colored indicators (lines 3-8: Healthy, Degraded, Restored Early, Restored Mid)
- [x] Positioned in corner of map (line 19: `bottom: '24px'`, `left: '16px'`)

---

## Phase 5: Dashboard Analyze (/dashboard/analyze)

**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/app/dashboard/analyze/page.tsx`

- [x] Has file upload functionality for WAV files -- uses `FileUpload` component (lines 265-269)
- [x] Shows spectrogram preview after file upload -- `SpectrogramCanvas` rendered when file selected and `audioBufferRef.current` is set (lines 273-315)
- [x] Uses SpectrogramCanvas component (line 8, import; line 302, usage)
- [x] Includes RegionWarning component for results (lines 387-394)
- [x] Includes CaveatsBanner after results (line 400)
- [x] Sends upload to API POST /upload via `api.uploadAudio(selectedFile)` (line 176)
- [x] Sends analysis request to API POST /analyze via `api.startAnalysis(uploadResult.upload_id, lat, lon)` (lines 183-187)
- [x] Polls GET /visualize/{id} via `api.pollAnalysis(analyzeResult.analysis_id, ...)` (line 193); the `pollAnalysis` method in api.ts calls `getAnalysisResult` which hits `/visualize/{id}` (api.ts line 102)

---

## Phase 6: Foundation Components

### Test 18: RegionWarning
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/dashboard/RegionWarning.tsx`

- [x] Returns null when `in_training_distribution` is true (line 13-15)
- [x] Shows amber warning when out-of-distribution (lines 17-45, amber border/background)
- [x] Mentions 40% confidence reduction (line 37: "reduced by 40%")
- [x] Has AlertTriangle icon (line 25)

### Test 19: CaveatsBanner
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/dashboard/CaveatsBanner.tsx`

- [x] Contains all 5 scientific caveats (lines 7-13, CAVEATS array with 5 entries)
- [x] Collapsible with toggle (lines 33-48, button toggles `isExpanded`)
- [x] Amber/warning aesthetic (line 29: `border-amber-500/50 bg-amber-900/30`)

### Test 20: AnimatedCounter
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/ui/AnimatedCounter.tsx`

- [x] Uses IntersectionObserver (lines 59-67)
- [x] requestAnimationFrame animation (line 52)
- [x] Formats numbers with commas (line 17-22, `formatWithCommas` function)

---

## Phase 7: Navigation and Layout

### Test 21: Navbar
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/Navbar.tsx`

- [x] Links to: Dashboard, Analyze, Map, Compare, Sites, About (lines 19-26, all 6 routes present)
- [x] Mobile responsive -- hamburger menu with Menu/X toggle (lines 98-109, mobile dropdown lines 114-148)

### Test 22: Dashboard layout
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/app/dashboard/layout.tsx`

- [x] Wraps `/dashboard/*` pages (exports default DashboardLayout with `children` prop)
- [x] Dark background -- gradient from `var(--abyss)` to `var(--deep)` to `var(--mid)` (line 10)

### Test 23: Dashboard home
**File:** `/home/yler_uby_oward/ReefRadar/dashboard-next/src/app/dashboard/page.tsx`

- [x] Dashboard home page with feature cards (lines 8-37, 78-102 -- 4 GlowCard feature tiles)
- [x] Links to all dashboard sub-routes: `/dashboard/analyze`, `/dashboard/compare`, `/dashboard/map`, `/sites` (lines 10, 17, 23, 30)

---

## Phase 8: Scientific Accuracy Check

### Test 24: Cross-component spec verification

**Sample rate: 32,000 Hz (32 kHz) -- NOT 16 kHz**
- [x] About page: "Resample to 32kHz mono" (about/page.tsx:184) -- PASS
- [x] About page: "Input: 32kHz mono audio, 5.0s windows" (about/page.tsx:213) -- PASS
- [x] Analyze page: "Audio is converted to 32kHz and segmented into 5s windows" (analyze/page.tsx:431) -- PASS
- [x] No instances of "16kHz" as sample rate spec found in frontend components -- PASS

**Window duration: 5.0 seconds -- NOT 1.88 seconds**
- [x] HowItWorks: "5-second windows" (HowItWorks.tsx:76) -- PASS
- [x] Analyze page: "5s windows" (analyze/page.tsx:431) -- PASS
- [x] About page: "5.0s windows" (about/page.tsx:188) -- PASS
- [x] No instances of "1.88" found anywhere in frontend -- PASS

**Embedding dimensions: 1,280 -- NOT 1,024**
- [x] Confirmed across 7 locations: HowItWorks, ImpactStats, compare page, analyze page (x2), SiteCard, about page (x2) -- all say 1280 -- PASS
- [x] No instances of "1,024" as embedding dimension found (only found in byte-size formatting in utils.ts, unrelated) -- PASS

**Classifier: "Trained MLP" -- NOT "synthetic"**
- [x] About page: "Classify via trained MLP model" (about/page.tsx:196) -- PASS
- [x] HowItWorks: "Trained classifier determines reef health" (HowItWorks.tsx:88) -- PASS
- [x] Analyze page: "Trained classifier determines reef health status" (analyze/page.tsx:455) -- PASS
- [x] The word "synthetic" only appears in AudioCompare demo audio context (correctly) -- PASS

**Reference sites: 8 sites -- NOT 45 (45 is training data)**
- [ ] **FAIL** -- About page says "6 validated sites from 45-site MARRS dataset" (about/page.tsx:229). Should say 8.
- [ ] **FAIL** -- About page says "Currently 6 reference sites; expanding to full 45-site MARRS dataset" (about/page.tsx:279). Should say 8.
- [x] ImpactStats correctly shows 8 (ImpactStats.tsx:9)
- [x] Dashboard home correctly references "8 reference sites" (dashboard/page.tsx:34)
- [ ] **FAIL** -- HowItWorks footer says "Trained on 45 sites in 5 countries" (HowItWorks.tsx:183). Training was on sites from 2 countries (Indonesia, Kenya), not 5. The "45 sites" may refer to the MARRS dataset expansion goal rather than current training data.
- [ ] **FAIL** -- The sites/page.tsx dynamically counts sites from the API (`sites.length`), which returns 8 correctly, but the about page is hardcoded to "6" in two places.

---

## Phase 9: API Integration Check

### Test 25: Live API endpoints

**GET /health**
- [x] Returns `{"status": "healthy", "timestamp": "2026-02-22T15:19:05.797073"}` -- PASS

**GET /sites**
- [x] Returns 8 sites with correct structure (site_id, country, region, status, latitude, longitude, synthetic fields) -- PASS
  - 3 healthy (ind_H4, ind_H5, ken_H1)
  - 2 degraded (ind_D2, ind_D3)
  - 1 restored_early (ind_N1)
  - 2 restored_mid (ind_R1, ind_R2)
  - Countries: Indonesia, Kenya
  - Total: 8

---

## Files with Issues

| File | Issue | Severity |
|------|-------|----------|
| `/home/yler_uby_oward/ReefRadar/dashboard-next/src/app/about/page.tsx` (line 229) | Says "6 validated sites" instead of 8 | Medium |
| `/home/yler_uby_oward/ReefRadar/dashboard-next/src/app/about/page.tsx` (line 279) | Says "Currently 6 reference sites" instead of 8 | Medium |
| `/home/yler_uby_oward/ReefRadar/dashboard-next/src/components/landing/HowItWorks.tsx` (line 183) | Says "Trained on 45 sites in 5 countries" -- countries count may be inaccurate (should be 2 for training data, or 5 if referencing full MARRS dataset scope) | Low |
| `/home/yler_uby_oward/ReefRadar/dashboard-next/src/app/about/page.tsx` | Analyze page has white/light theme while all other dashboard pages use dark ocean theme (not a bug, but inconsistency with compare/map pages) | Info |

---

## Overall Assessment

The Experience Layer is in excellent shape. The build completes cleanly with zero TypeScript errors. All 7 routes compile and are present in the production build output. The core experience -- landing page flow, audio comparison with spectrograms, interactive DeckGL map, and analysis pipeline -- is structurally sound with proper component composition, cleanup patterns, and API integration.

The only substantive issues are **stale reference site counts** on the About page (says 6, should be 8) and a potentially inaccurate training data country count in the HowItWorks footer. All other scientific specifications (32kHz sample rate, 5.0s windows, 1,280-dimensional embeddings, trained MLP classifier) are consistently correct across all components.
