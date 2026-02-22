<objective>
Build the scrollytelling landing page for ReefRadar — a narrative-driven entry point that immerses visitors in the ocean, reveals the coral reef crisis, lets them HEAR the difference between healthy and degraded reefs, shows how the AI works, and drives them to the dashboard.

This REPLACES the current `dashboard-next/src/app/page.tsx` (which was the analyze page). The analyze functionality has been moved to `/dashboard/analyze` in the previous prompt.
</objective>

<context>
Read the project's CLAUDE.md for architecture context.

Previous prompts installed:
- 026: Design system (ocean depth CSS vars, Tailwind extensions), UI primitives (AnimatedCounter, GlowCard, WaveBackground, LoadingReef, ScrollProgress), hooks (useAnimateOnScroll, useScrollProgress, useSpectrogram, useAudioPlayer), Zustand store, CaveatsBanner, RegionWarning
- 027: Audio components (SyntheticAudioGenerator, SpectrogramCanvas, FrequencyBandLabels, ABCrossfader, AudioCompare), /dashboard/compare page, /dashboard/analyze page

The AudioCompare component from prompt 027 supports a `compact` prop for embedding in the landing page.

API: https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod
GET /sites returns 8 reference sites across Indonesia and Kenya.

Reference sites: 8 sites, 2 countries (Indonesia, Kenya), 4 health statuses (healthy, degraded, restored_early, restored_mid)
</context>

<research>
Before making changes, read these files:
- `dashboard-next/src/app/page.tsx` — current page (will be REPLACED)
- `dashboard-next/src/app/layout.tsx` — root layout (may need minor updates)
- `dashboard-next/src/components/layout/Header.tsx` — navigation header
- `dashboard-next/src/components/layout/Footer.tsx` — page footer
- `dashboard-next/src/components/ui/AnimatedCounter.tsx` — from prompt 026
- `dashboard-next/src/components/ui/GlowCard.tsx` — from prompt 026
- `dashboard-next/src/components/ui/WaveBackground.tsx` — from prompt 026
- `dashboard-next/src/components/ui/ScrollProgress.tsx` — from prompt 026
- `dashboard-next/src/hooks/useAnimateOnScroll.ts` — from prompt 026
- `dashboard-next/src/components/audio/AudioCompare.tsx` — from prompt 027
</research>

<requirements>

## 1. Landing Page Section Components

Create all in `dashboard-next/src/components/landing/`:

### HeroSection.tsx
- Full viewport height (100vh)
- Dark ocean background (var(--abyss)) with CSS particle animation
  - Small floating dots (white, low opacity) that drift upward slowly — simulating underwater particles
  - Pure CSS using @keyframes, no JS animation
- Center-aligned text:
  - Title: "The Ocean Has a Voice" (large, gradient text from --glow-cyan to --glow-green)
  - Subtitle: "AI-powered acoustic monitoring for the world's coral reefs" (var(--text-muted))
- Animated scroll indicator at bottom (bouncing chevron)
- Fade-in animation on mount using framer-motion

### ProblemSection.tsx
- Background: gradient from --abyss to --deep
- Main heading: "We've Lost Half the World's Coral Reefs in 70 Years" (animate on scroll)
- Three stat cards using GlowCard, each with AnimatedCounter:
  1. "84.4%" + "of reefs experiencing bleaching stress"
  2. "$9.9 trillion" + "in ecosystem services at risk"
  3. "2035" + "when many reefs face irreversible collapse"
- Cards animate in staggered on scroll (useAnimateOnScroll)
- Closing text: "But there's something we can do — we can listen." (fade in last)

### SoundSection.tsx
- Heading: "The Sound of a Reef"
- Subheading: "Healthy coral reefs are among the noisiest places in the ocean"
- Embeds the AudioCompare component in compact mode
- Brief explanation paragraph about reef acoustics:
  - Snapping shrimp create a constant crackling (2-200 kHz)
  - Fish use grunts and calls to communicate (50-1000 Hz)
  - Degraded reefs fall silent — the absence of sound signals ecosystem collapse
- CTA button: "Explore Full Comparison" → /dashboard/compare

### HowItWorks.tsx
- Heading: "How ReefRadar Works"
- Animated pipeline diagram — 5 steps that animate in sequence on scroll:
  1. "Underwater recording captured" (microphone icon)
  2. "Audio segmented into 5-second windows" (waveform icon)
  3. "SurfPerch AI extracts 1,280 acoustic features" (brain/neural icon)
  4. "Trained classifier determines reef health" (chart icon)
  5. "Geographic region adjusts confidence" (globe icon)
- Each step is a card connected by animated lines/arrows
- Use framer-motion for staggered animation
- Below pipeline: "AUC-ROC 0.933 | Trained on 45 sites in 5 countries"
- Uses the ocean depth color palette throughout

### ImpactStats.tsx
- Grid of key statistics about the project:
  - "8 Reference Sites" (AnimatedCounter)
  - "2 Countries" (AnimatedCounter)
  - "1,280 Acoustic Features" (AnimatedCounter)
  - "0.933 AUC-ROC" (AnimatedCounter with 3 decimals)
- Each stat in a GlowCard
- Animate on scroll

### CTASection.tsx
- Dark gradient background
- Heading: "Start Listening to the Ocean"
- Two primary CTA buttons:
  - "Analyze Audio" → /dashboard/analyze (primary, glowing green)
  - "Explore Dashboard" → /dashboard (secondary, outlined)
- Below buttons: "View Reference Sites" → /sites, "Learn More" → /about
- CaveatsBanner component at the bottom (the 5 scientific caveats)

## 2. Replace Landing Page

Replace `dashboard-next/src/app/page.tsx` with a scrollytelling page that assembles these sections:

```tsx
// Section order:
1. ScrollProgress (fixed at top)
2. HeroSection
3. ProblemSection
4. SoundSection (AudioCompare)
5. HowItWorks
6. ImpactStats
7. CTASection
```

The page should:
- Use 'use client' directive
- Import and render all sections in order
- Each section should be full-width
- Smooth scroll behavior (add `scroll-behavior: smooth` to html)
- No Header/Footer wrapping on landing page (it's immersive — the Header should be transparent/overlay on Hero, then appear normally as user scrolls)

## 3. Update Navigation

Update `dashboard-next/src/components/layout/Header.tsx`:
- Add navigation links for new routes:
  - "Dashboard" → /dashboard
  - "Analyze" → /dashboard/analyze
  - "Map" → /dashboard/map (will be built in prompt 029)
  - "Compare" → /dashboard/compare
  - "Sites" → /sites
  - "About" → /about
- On the landing page (/), Header should be transparent/overlay positioned over the Hero
- On other pages, Header should be normal (solid background)
- Use pathname detection to determine current behavior

## 4. Dashboard Layout

Create `dashboard-next/src/app/dashboard/layout.tsx`:
- Wraps all /dashboard/* pages
- Includes the standard Header and Footer
- Main content area with max-width constraint
- Dark background (var(--abyss) or var(--deep))

Create `dashboard-next/src/app/dashboard/page.tsx`:
- Dashboard home/overview page
- Cards linking to: Analyze, Compare, Map, Sites
- Brief stats about the system (8 reference sites, 2 countries)
- "Quick Start" section with upload instructions

## 5. Update Root Layout

Update `dashboard-next/src/app/layout.tsx`:
- The landing page (/) should NOT show the normal Header/Footer wrapper — it has its own immersive layout
- All other pages (/sites, /about) should still have Header/Footer
- Use conditional rendering based on pathname or nested layouts

</requirements>

<constraints>
- The landing page must be visually stunning — this is the portfolio showcase
- All animations must be performant — use CSS transforms/opacity, avoid layout thrashing
- Images: Do NOT use external image URLs. Use CSS gradients, SVG, and icon components only
- framer-motion animations should use `whileInView` for scroll-triggered effects
- Mobile responsive: all sections must work on 320px-1440px viewports
- Existing /sites and /about pages must continue to work
- `npm run build` must pass with zero errors
- Keep bundle size reasonable — lazy load heavy components (AudioCompare) with next/dynamic
</constraints>

<verification>
After completing all changes:

1. Run `cd dashboard-next && npm run build` — must succeed with no errors
2. Verify all new files exist:
   - src/components/landing/HeroSection.tsx
   - src/components/landing/ProblemSection.tsx
   - src/components/landing/SoundSection.tsx
   - src/components/landing/HowItWorks.tsx
   - src/components/landing/ImpactStats.tsx
   - src/components/landing/CTASection.tsx
   - src/app/page.tsx (replaced with scrollytelling)
   - src/app/dashboard/layout.tsx
   - src/app/dashboard/page.tsx
3. Start dev server and verify:
   - / loads the scrollytelling landing page
   - /dashboard loads the dashboard home
   - /dashboard/analyze loads the analyze page
   - /dashboard/compare loads the compare page
   - /sites still works
   - /about still works
4. No console errors on any page
</verification>

<success_criteria>
- Landing page has immersive ocean aesthetic with dark theme and glow effects
- Hero section fills viewport with animated particles and gradient text
- Problem section shows animated statistics on scroll
- Sound section embeds AudioCompare in compact mode
- How It Works shows animated pipeline with 5 correct steps (5-second windows, 1,280 features)
- Impact stats animate counters on scroll
- CTA section drives users to /dashboard/analyze and /dashboard
- Scientific caveats visible in CTA section footer
- Navigation updated with all new routes
- Dashboard layout wraps /dashboard/* pages
- Mobile responsive (320px-1440px)
- `npm run build` passes with zero errors
- No regressions on /sites and /about pages
</success_criteria>
