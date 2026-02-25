<objective>
Final polish pass on the Living Spectrogram Overhaul. Add state transitions, mobile responsive fixes, verify all routes work end-to-end, and ensure the build is clean. This is the testing and integration prompt — fix anything broken by the previous 4 prompts.

Read `./CLAUDE.md` for project context.
</objective>

<context>
This is prompt 5 of 5 in the Living Spectrogram Overhaul. Previous prompts:
- 036: Golden Hour design system (globals.css, tailwind, glass components)
- 037: SpectrogramCanvas (canvas animation, particles, audio reactivity)
- 038: Experience page + new landing page (state machine, upload flow, demo mode)
- 039: Feature adaptation (all dashboard pages → Golden Hour palette)

The dashboard is at `./dashboard-next/`. The API is at `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`.

This prompt focuses on: build fixes, transitions, mobile, navigation, and comprehensive verification.
</context>

<requirements>

## 1. Build Verification & Fixes

Run `cd dashboard-next && npm run build` FIRST. If there are any errors:
- Fix TypeScript errors (missing imports, type mismatches, undefined variables)
- Fix missing module references (glass components, spectrogram components)
- Fix any CSS/Tailwind class errors
- Repeat build until it passes with zero errors

This is the MOST IMPORTANT task. Nothing else matters if the build doesn't pass.

## 2. State Transitions (framer-motion)

Add smooth transitions to the Experience page states. The project already has `framer-motion` installed.

**Landing → Uploading:**
- Hero text: fade out, scale down slightly (duration 500ms)
- Coordinate modal: fade in, slide up from bottom (duration 500ms)

**Uploading → Processing:**
- Modal: fade out (300ms)
- Spinner: fade in (300ms)
- Canvas: smoothly increase amplitude (handled by state change)

**Processing → Results:**
- Spinner: fade out (300ms)
- Side panels: slide in from left/right respectively (800ms, staggered by 200ms)
- Canvas: reach full amplitude

**Error → Landing:**
- Error panel: fade out (300ms)
- Landing content: fade in (300ms)

Use framer-motion's `AnimatePresence` and `motion.div` for these transitions. Keep animations subtle — this should feel organic, not flashy.

## 3. Mobile Responsive Fixes

Test and fix layout at these breakpoints:
- **Desktop (1024px+):** Two-panel layout on experience results (left + canvas + right)
- **Tablet (768-1023px):** Stack panels above/below canvas, reduce canvas height
- **Mobile (< 768px):** Single column, panels stack vertically, canvas as header element

**Specific mobile fixes:**

**Landing page (/):**
- Choice cards stack vertically
- Hero text scales down (clamp already handles this)
- Padding adjustments (px-4 on mobile, px-8 on desktop)

**Experience page (/experience):**
- Results panels stack vertically below the canvas on mobile
- Canvas height: min-h-[40vh] on mobile, min-h-[60vh] on tablet, full viewport on desktop
- Floating nav stays visible and doesn't overlap content
- Upload dropzone: full width on mobile
- Coordinate modal: full width with px-4 padding

**Dashboard pages:**
- Navbar hamburger menu works correctly with new colors
- Map page: controls collapse or use a bottom sheet on mobile
- Sites page: cards switch to single column
- About page: comfortable reading width (max-w-prose or similar)

## 4. Navigation Fixes

Verify the Navbar links are correct and complete:

Expected links:
- Dashboard → /dashboard
- Analyze → /dashboard/analyze
- Compare → /dashboard/compare
- Map → /dashboard/map
- Sites → /sites
- About → /about

Add "Experience" link to Navbar that goes to `/experience`.

Verify the Experience page floating nav works:
- Back button → navigates to /
- "ReefRadar" text visible on right
- Status dot: ochre when playing, gray when idle

## 5. Region Warning Integration

Verify the RegionWarning component appears correctly in:
- `/dashboard/analyze` results
- `/experience` results state

It should:
- Show nothing when `in_training_distribution` is true
- Show warm amber glass panel when `in_training_distribution` is false
- Mention "40% confidence reduction"
- List the actual detected region name

## 6. CaveatsBanner Integration

Verify CaveatsBanner appears in:
- `/dashboard/analyze` (after results)
- `/dashboard/compare`
- `/dashboard/map`
- `/experience` (as CaveatsFooter at bottom of results)

All should use the warm amber glass styling from the Golden Hour palette.

## 7. Forbidden Colors Final Sweep

Run comprehensive search and fix any remaining forbidden colors:

```bash
# Hex values
grep -rn '#00FFFF\|#00E5FF\|#00FFA3\|#FF6B6B\|#FF00FF' dashboard-next/src/ --include='*.tsx' --include='*.ts' --include='*.css'

# Tailwind classes
grep -rn 'text-cyan\|bg-cyan\|border-cyan\|text-teal\|bg-teal\|text-emerald\|bg-emerald' dashboard-next/src/ --include='*.tsx'

# Old CSS variables still in use
grep -rn 'var(--glow-\|var(--healthy)\|var(--degraded)\|var(--restored-' dashboard-next/src/ --include='*.tsx' --include='*.ts'

# Old Tailwind color utilities
grep -rn 'glow-cyan\|glow-green\|glow-coral\|health-healthy\|health-degraded' dashboard-next/src/ --include='*.tsx'
```

Fix ANY results from these searches. Replace with appropriate Golden Hour palette equivalents.

## 8. Old Landing Components Cleanup

The old landing components at `src/components/landing/` are no longer imported by the new landing page. Verify they are truly unused:

```bash
grep -rn "from.*components/landing" dashboard-next/src/ --include='*.tsx' --include='*.ts'
```

If no imports found, delete the entire `src/components/landing/` directory:
- HeroSection.tsx
- ProblemSection.tsx
- SoundSection.tsx
- HowItWorks.tsx
- ImpactStats.tsx
- CTASection.tsx
- ScrollProgress.tsx (if exists)
- AnimatedCounter.tsx (check if used elsewhere first!)
- GlowCard.tsx (check if used elsewhere first!)

**IMPORTANT:** Before deleting AnimatedCounter or GlowCard, grep the entire src/ directory to check if they're imported by any non-landing component. If they are, keep them.

## 9. Final Build & Route Verification

After all fixes:

1. Run `npm run build` — must pass with zero errors
2. List all routes in the build output
3. Verify these routes exist in the build:
   - `/` — Choice screen
   - `/experience` — Living Spectrogram
   - `/dashboard` — Dashboard home
   - `/dashboard/analyze` — Analysis flow
   - `/dashboard/compare` — Audio comparison
   - `/dashboard/map` — Reference map
   - `/sites` — Reference sites
   - `/about` — Methodology

4. Test API endpoints still respond:
   ```bash
   curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health
   curl -s https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/sites | head -c 200
   ```

</requirements>

<output>
Save a test report to `./docs/LIVING_SPECTROGRAM_TEST_REPORT.md` with:
- Build status (pass/fail)
- Route verification checklist
- Forbidden color search results
- Mobile responsive notes
- Any issues found and how they were fixed
- Summary: X/Y checks passed
</output>

<success_criteria>
- Build passes with zero errors and zero warnings
- All 8 routes compile and are listed in build output
- Zero forbidden colors remain in any source file
- State transitions are smooth (framer-motion)
- Mobile layout works at 375px, 768px, and 1024px widths
- Navigation links are complete and correct
- RegionWarning and CaveatsBanner appear in all required locations
- Old landing components deleted (if confirmed unused)
- API endpoints respond correctly
- Test report saved to docs/
</success_criteria>
