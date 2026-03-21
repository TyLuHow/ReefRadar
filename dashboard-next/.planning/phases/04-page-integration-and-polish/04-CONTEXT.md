# Phase 4: Page Integration and Polish - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire vitality-driven visuals into every page with page-specific input sources. Enhance the crossfader with gradient track and glowing thumb. Add static vitality hints to gallery sample cards. Implement mobile optimization (reduced particles, no caustics <768px, touch-friendly crossfader). Add accessibility support (prefers-reduced-motion, fixed high-contrast nav/labels). No new visual effects — integration and polish of existing Phase 1-3 outputs.

</domain>

<decisions>
## Implementation Decisions

### Crossfader Enhancement (PAGE-01, PAGE-02)
- Compare page crossfader slider position (0-1) drives vitality score via `setVitality()`
- Gradient track: linear gradient from brown (left) to teal (right), track fills with color up to thumb position
- Glowing thumb: box-shadow glow matching current `--reef-primary` color, pulsing gently via CSS animation
- Transitioning labels: "Degraded" (left, fades as vitality rises) / "Healthy" (right, brightens) — opacity inversely/directly proportional to vitality

### Experience Page Integration (PAGE-03)
- Audio playback already drives band energy via `useAudioVisualBridge` (Phase 3)
- ML classification result maps to vitality: healthy=1.0, restored_mid=0.7, restored_early=0.4, degraded=0.0
- Vitality driven by whichever source is active (audio energy for live playback, ML result for static display)

### Gallery Card Vitality Hints (PAGE-04)
- Healthy cards: subtle teal border-glow (`box-shadow: 0 0 8px var(--reef-primary)`)
- Degraded cards: muted brown border, no glow — matches degraded palette naturally
- Restored cards: proportional glow — restored_early at 30% glow intensity, restored_mid at 60%
- Static treatment only — no animation on gallery cards

### Mobile Optimization (MOBL-01, MOBL-02, MOBL-03)
- Particle count capped at 50 on viewports < 768px (via media query or JS check)
- Caustic effects disabled entirely on viewports < 768px
- Crossfader uses `touch-action: none` to prevent scroll conflicts on mobile
- Check viewport width in useBackgroundCanvas rAF loop or via resize observer

### Accessibility (PERF-05, PERF-06)
- `prefers-reduced-motion`: disable particles and caustics, instant color changes (no lerp animation)
- Nav bar uses fixed high-contrast colors — never interpolated by vitality
- Data labels and numbers maintain fixed contrast at all vitality levels
- Media query check at hook initialization, not per-frame

### Claude's Discretion
- Exact crossfader CSS styling (track height, thumb size, glow radius)
- How ML classification result is accessed on experience page (store vs prop)
- Whether to create a new compare page crossfader component or enhance existing
- Exact reduced-motion implementation (CSS media query vs JS matchMedia)
- Gallery card glow CSS specifics (blur radius, spread, color opacity)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Compare Page
- `src/app/experience/page.tsx` — Experience page with crossfader state machine, sample playback
- `src/components/experience/LocationCompare.tsx` — Existing compare/crossfader component (if present)

### Gallery
- `src/components/gallery/SampleCard.tsx` — Existing sample card component with category badge
- `src/components/gallery/SampleGallery.tsx` — Gallery layout with story sections

### Vitality System
- `src/stores/vitality-store.ts` — Store with setVitality(), bandEnergy, activeBands
- `src/hooks/useBackgroundCanvas.ts` — Particle + caustic system (needs mobile/a11y gates)
- `src/hooks/useVitality.ts` — rAF loop (needs reduced-motion gate)

### Phase 1-3 Outputs
- `.planning/phases/01-vitality-engine-and-color-system/01-CONTEXT.md` — Vitality source priority decisions
- `.planning/phases/02-visual-effects/02-CONTEXT.md` — Canvas layering decisions
- `.planning/phases/03-audio-reactive-system/03-CONTEXT.md` — Band-to-visual mapping

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SampleCard.tsx`: Has `category` prop — can derive glow treatment from category
- `vitality-store.ts`: `setVitality()` already exposed — crossfader just calls it
- `useBackgroundCanvas.ts`: Particle count and caustic rendering — add viewport/motion gates

### Established Patterns
- Dynamic import with `{ ssr: false }` for canvas components
- CSS custom properties for theming — `var(--reef-*)` tokens already in Tailwind
- `useRef` + rAF for animation state

### Integration Points
- Compare page crossfader → `setVitality(sliderValue)`
- Experience page ML result → `setVitality(classificationToVitality(result))`
- Gallery SampleCard → conditional `box-shadow` based on category
- useBackgroundCanvas → `window.matchMedia('(prefers-reduced-motion: reduce)')` check
- useBackgroundCanvas → viewport width check for mobile particle/caustic caps

</code_context>

<specifics>
## Specific Ideas

- The crossfader should feel satisfying to drag — the whole UI transforms as you slide
- Gallery cards should give an at-a-glance sense of reef health before you even click
- On mobile the experience should still feel alive, just with fewer particles
- Users with motion sensitivity should still see the color transformation, just without moving elements

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-page-integration-and-polish*
*Context gathered: 2026-03-21*
