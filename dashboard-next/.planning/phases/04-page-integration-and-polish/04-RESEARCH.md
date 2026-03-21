# Phase 4: Page Integration and Polish - Research

**Researched:** 2026-03-21
**Domain:** Vitality integration, mobile optimization, accessibility (CSS/JS media queries, Canvas 2D performance gating)
**Confidence:** HIGH

## Summary

Phase 4 is pure integration and polish -- no new libraries, no new visual systems. Every building block exists: the vitality store with `setVitality()`, the rAF-driven `useVitality` loop writing CSS variables, the Canvas 2D particle+caustic system in `useBackgroundCanvas`, and the `useAudioVisualBridge` FFT pipeline. The work is wiring these into the compare page crossfader (driving vitality from slider position), the experience page (driving vitality from ML classification results), and gallery cards (static glow based on category). Then gating the canvas system for mobile viewports and reduced-motion preferences.

The crossfader in `LocationCompare.tsx` already has a range input wired to `audio.crossfade` (0-1) -- but it currently only controls audio gain balance. Phase 4 adds a parallel `setVitality()` call so the same slider drives the visual system. The range input needs custom CSS for gradient track and glowing thumb. The `useBackgroundCanvas` hook needs two early-exit gates: one for `prefers-reduced-motion: reduce` (disable all canvas rendering) and one for viewport width < 768px (cap particles at 50, disable caustics). The `useVitality` hook needs a reduced-motion gate to skip lerp and write colors instantly.

**Primary recommendation:** Use `window.matchMedia` checked once at hook initialization (stored in ref) for both reduced-motion and mobile viewport gates. The crossfader vitality wiring is a single `setVitality(crossfadeValue, 'crossfader')` call. Gallery card glow is conditional `boxShadow` inline style keyed on `sample.category`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Compare page crossfader slider position (0-1) drives vitality score via `setVitality()`
- Gradient track: linear gradient from brown (left) to teal (right), track fills with color up to thumb position
- Glowing thumb: box-shadow glow matching current `--reef-primary` color, pulsing gently via CSS animation
- Transitioning labels: "Degraded" (left, fades as vitality rises) / "Healthy" (right, brightens) -- opacity inversely/directly proportional to vitality
- Audio playback already drives band energy via `useAudioVisualBridge` (Phase 3)
- ML classification result maps to vitality: healthy=1.0, restored_mid=0.7, restored_early=0.4, degraded=0.0
- Vitality driven by whichever source is active (audio energy for live playback, ML result for static display)
- Healthy cards: subtle teal border-glow (`box-shadow: 0 0 8px var(--reef-primary)`)
- Degraded cards: muted brown border, no glow
- Restored cards: proportional glow -- restored_early at 30% glow intensity, restored_mid at 60%
- Static treatment only -- no animation on gallery cards
- Particle count capped at 50 on viewports < 768px (via media query or JS check)
- Caustic effects disabled entirely on viewports < 768px
- Crossfader uses `touch-action: none` to prevent scroll conflicts on mobile
- `prefers-reduced-motion`: disable particles and caustics, instant color changes (no lerp animation)
- Nav bar uses fixed high-contrast colors -- never interpolated by vitality
- Data labels and numbers maintain fixed contrast at all vitality levels
- Media query check at hook initialization, not per-frame

### Claude's Discretion
- Exact crossfader CSS styling (track height, thumb size, glow radius)
- How ML classification result is accessed on experience page (store vs prop)
- Whether to create a new compare page crossfader component or enhance existing
- Exact reduced-motion implementation (CSS media query vs JS matchMedia)
- Gallery card glow CSS specifics (blur radius, spread, color opacity)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PAGE-01 | Compare page crossfader position drives vitality score | LocationCompare.tsx has `audio.crossfade` (0-1) + `audio.setCrossfade()`. Add `setVitality(crossfadeValue, 'crossfader')` call alongside existing audio crossfade. |
| PAGE-02 | Crossfader has gradient track, glowing thumb, transitioning labels | Custom CSS on `input[type=range]` via `::-webkit-slider-*` and `::-moz-range-*` pseudo-elements. Labels are existing "Degraded"/"Healthy" spans with opacity tied to crossfade value. |
| PAGE-03 | Experience page audio playback + ML result drive vitality score | `useAudioVisualBridge` already writes bandEnergy to store. ML result from `AnalysisResult.classification.label` maps to vitality via lookup. Call `setVitality()` in ResultsState. |
| PAGE-04 | Gallery sample cards show static vitality hints | SampleCard.tsx `sample.category` prop determines box-shadow. Inline style based on category-to-glow mapping. |
| PERF-05 | `prefers-reduced-motion` respected | `window.matchMedia('(prefers-reduced-motion: reduce)')` checked once in useBackgroundCanvas and useVitality. Stored in ref. Canvas skips all rendering; useVitality skips lerp. |
| PERF-06 | Nav bar and data labels use fixed high-contrast colors | Navbar.tsx already uses fixed `text-white`, `text-white/60`, `bg-abyss/80` -- never references `--reef-*` variables. Verify and lock. |
| MOBL-01 | Particle count reduced to max 50 on viewports < 768px | `useBackgroundCanvas` checks `window.innerWidth < 768` at init, stored in ref. Caps `targetCount` in `spawnParticles`. |
| MOBL-02 | Caustic effects disabled on viewports < 768px | Same viewport check gates `drawCaustics()` call. |
| MOBL-03 | Touch-friendly crossfader with touch-action: none | Add `touch-action: none` CSS to the range input in LocationCompare crossfader. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^18.3.1 | UI framework | Already installed |
| Next.js | 14.2.5 | App Router, SSR | Already installed |
| zustand | ^4.5 | Vitality store | Already installed, `useVitalityStore` in use |
| framer-motion | ^11.0 | Page transitions | Already installed, used in experience page |

### Supporting
No new libraries needed. Phase 4 uses only existing dependencies.

### Alternatives Considered
None -- all tools already in the project.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Current Architecture (unchanged)
```
src/
  stores/vitality-store.ts       # zustand store: target, source, bandEnergy, activeBands
  hooks/useVitality.ts           # rAF loop: lerps toward target, writes --reef-* CSS vars
  hooks/useBackgroundCanvas.ts   # Canvas 2D: particles + caustics, reads store via getState()
  hooks/useAudioVisualBridge.ts  # FFT decomposition -> bandEnergy to store
  lib/color-engine.ts            # Pure HSL interpolation, computeReefColors()
  components/BackgroundCanvas.tsx # Fixed-position canvas element
  app/providers.tsx              # Mounts useVitality() + BackgroundCanvas globally
```

### Pattern 1: Vitality Source Wiring
**What:** Each page calls `setVitality(value, source)` to drive the global visual system.
**When to use:** Whenever a page has a user interaction or data result that should change reef visuals.
**Example:**
```typescript
// In LocationCompare crossfader onChange handler:
import { useVitalityStore } from '@/stores/vitality-store';

const setVitality = useVitalityStore(s => s.setVitality);
// Inside the setCrossfade handler or alongside it:
setVitality(crossfadeValue, 'crossfader');
```

### Pattern 2: matchMedia Gate at Init
**What:** Check media query once at hook mount, store result in ref, use ref in rAF loop.
**When to use:** Performance-critical loops that need to branch on user preference or viewport.
**Example:**
```typescript
// In useBackgroundCanvas or useVitality:
const prefersReducedMotion = useRef(false);
const isMobile = useRef(false);

useEffect(() => {
  prefersReducedMotion.current = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;
  isMobile.current = window.innerWidth < 768;
  // ...rest of hook
}, []);
```

### Pattern 3: Category-to-Glow Mapping (Static)
**What:** Map reef health category to box-shadow style for gallery cards.
**When to use:** Gallery cards that need visual health indicators without animation.
**Example:**
```typescript
const CATEGORY_GLOW: Record<ReefStatus, string> = {
  healthy: '0 0 8px 2px hsla(175, 80%, 50%, 0.4)',
  restored_mid: '0 0 8px 2px hsla(175, 80%, 50%, 0.24)',
  restored_early: '0 0 8px 2px hsla(175, 80%, 50%, 0.12)',
  degraded: 'none',
  unknown: 'none',
};
// In SampleCard render:
<GlassPanel style={{ boxShadow: CATEGORY_GLOW[sample.category] }}>
```

### Pattern 4: Custom Range Input Styling
**What:** Cross-browser CSS for gradient track and glowing thumb using vendor pseudo-elements.
**When to use:** Crossfader slider needs visual treatment beyond default browser styling.
**Example:**
```css
/* Track gradient */
input[type=range].vitality-slider::-webkit-slider-runnable-track {
  background: linear-gradient(to right, hsl(30, 59%, 53%), hsl(175, 80%, 50%));
  height: 6px;
  border-radius: 3px;
}
input[type=range].vitality-slider::-moz-range-track {
  background: linear-gradient(to right, hsl(30, 59%, 53%), hsl(175, 80%, 50%));
  height: 6px;
  border-radius: 3px;
}

/* Glowing thumb */
input[type=range].vitality-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--reef-primary);
  box-shadow: 0 0 12px 4px var(--reef-glow);
  cursor: pointer;
  margin-top: -7px; /* center on track */
}

/* Pulse animation for thumb */
@keyframes thumb-pulse {
  0%, 100% { box-shadow: 0 0 12px 4px var(--reef-glow); }
  50% { box-shadow: 0 0 18px 6px var(--reef-glow); }
}
```

### Anti-Patterns to Avoid
- **Reading matchMedia every frame:** Check once at init, not in rAF loop. The preference does not change mid-session in practice.
- **Driving vitality from React state in rAF:** Always use `useVitalityStore.getState()` in animation loops, never subscribe via React render.
- **Adding `--reef-*` to Navbar:** The Navbar uses fixed colors (`text-white`, `bg-abyss/80`). Do not change this. PERF-06 requires fixed high-contrast nav.
- **Animating gallery card glow:** CONTEXT.md explicitly says "static treatment only -- no animation on gallery cards."
- **Using ResizeObserver for mobile check:** `window.innerWidth < 768` at init is sufficient. Users don't resize below/above mobile breakpoint mid-session on actual mobile devices.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vitality state management | Custom Context + reducer | `useVitalityStore` (zustand) | Already built in Phase 1, getState() for rAF perf |
| CSS variable pipeline | Manual DOM updates | `useVitality` hook (already running in providers.tsx) | Already built, 30fps throttled CSS writes |
| Audio-to-visual bridge | New FFT analysis | `useAudioVisualBridge` hook | Already built in Phase 3, writes bandEnergy to store |
| Color interpolation | Custom color math | `computeReefColors()` in color-engine.ts | Already built, handles stagger thresholds + hue direction |

**Key insight:** Every Phase 4 requirement connects existing pieces. No new systems need to be built from scratch.

## Common Pitfalls

### Pitfall 1: Crossfader Driving Two Systems
**What goes wrong:** The crossfader in LocationCompare already drives `audio.setCrossfade()` for audio gain. Adding `setVitality()` means the slider drives two systems. If the handler only calls one, the visuals or audio will be out of sync.
**Why it happens:** The crossfade value (0-1) is audio L/R balance, not directly vitality. Left track might be "healthy" and right "degraded", meaning crossfade=0 should be vitality=1.0.
**How to avoid:** The vitality mapping must account for which track is left and which is right. If leftTrack='healthy' and rightTrack='degraded', then `vitality = 1 - crossfade`. If leftTrack='degraded' and rightTrack='healthy', then `vitality = crossfade`. Need a mapping function that considers track assignments.
**Warning signs:** Sliding right makes the UI look more degraded when it should look more healthy (or vice versa).

### Pitfall 2: Range Input CSS Cross-Browser Inconsistency
**What goes wrong:** WebKit and Firefox use completely different pseudo-elements for range inputs. Styling only `-webkit-` leaves Firefox unstyled.
**Why it happens:** No standard CSS pseudo-element for range tracks/thumbs exists.
**How to avoid:** Always style both `::-webkit-slider-thumb` / `::-webkit-slider-runnable-track` AND `::-moz-range-thumb` / `::-moz-range-track`. Use `-webkit-appearance: none` and `appearance: none` on the input itself.
**Warning signs:** Slider looks styled in Chrome but default in Firefox.

### Pitfall 3: Reduced Motion Disabling Color Transitions
**What goes wrong:** Aggressively disabling all transitions for reduced-motion removes the color transformation, which is the core UX.
**Why it happens:** Blanket `transition: none` or skipping `useVitality` entirely.
**How to avoid:** CONTEXT.md is clear: "Users with motion sensitivity should still see the color transformation, just without moving elements." Disable particles and caustics (motion). Keep CSS variable color writes active, but skip the lerp (instant jumps). The color change itself is not motion -- it's a state change.
**Warning signs:** Reduced-motion users see a static degraded-state UI regardless of vitality input.

### Pitfall 4: Mobile Canvas Still Running (Just Fewer Particles)
**What goes wrong:** On mobile, reducing particles to 50 but keeping caustics causes unnecessary GPU work and battery drain.
**Why it happens:** Only gating particle count without gating caustic rendering.
**How to avoid:** CONTEXT.md specifies: particles capped at 50 AND caustics disabled on < 768px. Both gates needed.
**Warning signs:** Mobile performance issues, battery drain, thermal throttling.

### Pitfall 5: Gallery Card Glow Using reef-primary at Wrong Vitality
**What goes wrong:** Gallery cards reference `var(--reef-primary)` for their glow, but --reef-primary changes with global vitality. If the user has the crossfader at vitality=0 (degraded), the "healthy" card glow would be brown instead of teal.
**Why it happens:** CSS variables are global and driven by the vitality system.
**How to avoid:** Use hardcoded HSL values for gallery card glow, not CSS variable references. The glow represents the card's own health status, not the global vitality state. Use `hsla(175, 80%, 50%, 0.4)` for healthy teal directly.
**Warning signs:** Gallery card glows change color as user moves crossfader on compare page.

### Pitfall 6: ML Classification Vitality Overwriting Audio Vitality
**What goes wrong:** On the experience page results state, setting vitality from ML result (e.g., 0.7 for restored_mid) while audio is still playing causes the visuals to snap to 0.7 and ignore band energy.
**Why it happens:** `setVitality()` overwrites the target regardless of source.
**How to avoid:** Use the `source` parameter: `setVitality(0.7, 'ml')`. When audio is playing, audio energy should drive visuals via `useAudioVisualBridge`. ML result only drives vitality when audio is NOT playing (static display of results).
**Warning signs:** Playing audio on results page doesn't affect visuals because ML-set vitality overrides.

## Code Examples

### Crossfader Vitality Wiring
```typescript
// In LocationCompare or a wrapper component:
// Compute vitality from crossfade position + track assignments
function crossfadeToVitality(
  crossfade: number,
  leftTrack: HealthStatus,
  rightTrack: HealthStatus
): number {
  const VITALITY_MAP: Record<HealthStatus, number> = {
    healthy: 1.0,
    restored_mid: 0.7,
    restored_early: 0.4,
    degraded: 0.0,
  };
  const leftV = VITALITY_MAP[leftTrack];
  const rightV = VITALITY_MAP[rightTrack];
  // Linear interpolation between left and right track vitality values
  return leftV + (rightV - leftV) * crossfade;
}

// In the setCrossfade handler:
const handleCrossfade = (v: number) => {
  audio.setCrossfade(v); // audio balance
  const vitality = crossfadeToVitality(v, audio.leftTrack, audio.rightTrack);
  setVitality(vitality, 'crossfader'); // visual system
};
```

### Mobile + Reduced Motion Gates in useBackgroundCanvas
```typescript
// At top of useEffect in useBackgroundCanvas:
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

if (prefersReducedMotion) {
  // Do not start rAF loop at all -- no particles, no caustics
  runningRef.current = false;
  return;
}

const isMobile = window.innerWidth < 768;
const mobileParticleCap = 50;

// Inside animate():
function animate() {
  // ... existing code ...
  // Modify particle target count for mobile:
  // In spawnParticles or before calling it:
  if (isMobile) {
    // Override targetCount cap
  }
  // Skip caustics on mobile:
  if (!isMobile) {
    drawCaustics(ctx!, width, height, vitality, timeRef.current, bandEnergy.fish, fishActive);
  }
  // ... rest of animate
}
```

### Reduced Motion Gate in useVitality
```typescript
// In useVitality useEffect:
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

const tick = (timestamp: number) => {
  const target = useVitalityStore.getState().target;

  if (prefersReducedMotion) {
    // Instant: skip lerp, write directly
    currentRef.current = target;
  } else {
    // Normal ease-out
    currentRef.current += (target - currentRef.current) * 0.08;
    if (Math.abs(target - currentRef.current) < 0.001) {
      currentRef.current = target;
    }
  }

  // Still write CSS variables (color changes are not motion)
  if (timestamp - lastWriteRef.current > 33) {
    const colors = computeReefColors(currentRef.current);
    writeCSSVariables(colors);
    lastWriteRef.current = timestamp;
  }

  rafRef.current = requestAnimationFrame(tick);
};
```

### ML Result to Vitality Mapping
```typescript
const ML_TO_VITALITY: Record<string, number> = {
  healthy: 1.0,
  restored_mid: 0.7,
  restored_early: 0.4,
  degraded: 0.0,
};

// In ResultsState, after analysis completes:
useEffect(() => {
  if (data.classification?.label) {
    const v = ML_TO_VITALITY[data.classification.label] ?? 0;
    useVitalityStore.getState().setVitality(v, 'ml');
  }
  return () => {
    // Reset to default when leaving results
    useVitalityStore.getState().setVitality(0, 'default');
  };
}, [data.classification?.label]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `appearance: none` prefix only | Both `-webkit-appearance: none` and `appearance: none` | Stable since 2023 | Cross-browser range input styling |
| ResizeObserver for breakpoints | `window.innerWidth` check at init for mobile gate | N/A (simpler is better for one-time check) | Avoid over-engineering mobile detection |
| CSS `@media (prefers-reduced-motion)` | JS `matchMedia` for rAF loops + CSS for static content | Stable since 2020 | JS needed because Canvas animations are not CSS |

**Deprecated/outdated:**
- None relevant. All APIs used are stable and well-supported.

## Open Questions

1. **Crossfader component extraction**
   - What we know: LocationCompare.tsx has the crossfader inline. DemoState has a separate but similar audio hook.
   - What's unclear: Whether to extract a reusable `<VitalityCrossfader>` component or enhance inline.
   - Recommendation: Extract a `<VitalityCrossfader>` component. It encapsulates the custom CSS, vitality mapping, label transitions, and touch-action. Reusable if DemoState also needs enhancement later.

2. **Vitality cleanup on page navigation**
   - What we know: Vitality persists in zustand store across page navigations.
   - What's unclear: Should navigating away from compare page reset vitality to 0?
   - Recommendation: Reset to 0 (degraded) on unmount via useEffect cleanup. Each page owns its vitality source.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (no test config found in project) |
| Config file | none -- see Wave 0 |
| Quick run command | `npm run build` (type-check + compile) |
| Full suite command | `npm run build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAGE-01 | Crossfader drives vitality | manual | Visual: drag slider, observe background color change | N/A |
| PAGE-02 | Gradient track + glow thumb | manual | Visual: inspect crossfader styling | N/A |
| PAGE-03 | Experience page ML + audio drive vitality | manual | Visual: analyze file, observe color; play audio, observe particles | N/A |
| PAGE-04 | Gallery cards show vitality hints | manual | Visual: inspect card borders on landing page | N/A |
| PERF-05 | prefers-reduced-motion respected | manual | Enable reduced motion in OS settings, verify no particles/caustics but colors still change | N/A |
| PERF-06 | Nav fixed high-contrast | manual | Drag crossfader to various positions, verify nav text remains readable | N/A |
| MOBL-01 | Mobile particle cap 50 | manual | Resize to < 768px or use DevTools mobile, observe fewer particles | N/A |
| MOBL-02 | Mobile caustics disabled | manual | Same mobile check, verify no caustic light patches | N/A |
| MOBL-03 | Touch-friendly crossfader | manual | Test on mobile or touch simulator, verify no scroll conflict | N/A |

### Sampling Rate
- **Per task commit:** `npm run build` (catches type errors)
- **Per wave merge:** `npm run build` + manual visual inspection
- **Phase gate:** Full build green + manual visual check of all 9 requirements

### Wave 0 Gaps
- No test framework is installed. All Phase 4 requirements are visual/interactive behaviors that require manual verification (canvas rendering, CSS styling, touch behavior, motion preferences). Automated testing would require Playwright/Cypress with visual regression, which is out of scope for this integration phase.
- `npm run build` serves as the automated gate for TypeScript correctness and compilation.

## Sources

### Primary (HIGH confidence)
- Codebase files: `vitality-store.ts`, `useVitality.ts`, `useBackgroundCanvas.ts`, `useAudioVisualBridge.ts`, `LocationCompare.tsx`, `SampleCard.tsx`, `Navbar.tsx`, `providers.tsx`, `color-engine.ts`, `globals.css`, `tailwind.config.js`, `package.json`
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) - Media query specification and values
- [W3C WCAG22 C39](https://www.w3.org/WAI/WCAG22/Techniques/css/C39) - Using prefers-reduced-motion to prevent motion

### Secondary (MEDIUM confidence)
- [web.dev: prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion) - matchMedia JS patterns for animation gating
- [Smashing Magazine: Motion Preferences](https://www.smashingmagazine.com/2021/10/respecting-users-motion-preferences/) - Best practices: keep color, remove motion
- [LogRocket: Custom CSS Range Slider](https://blog.logrocket.com/creating-custom-css-range-slider-javascript-upgrades/) - Cross-browser range input styling
- [CSS Portal: Range Slider Styling](https://www.cssportal.com/style-input-range/) - Vendor-specific pseudo-element reference

### Tertiary (LOW confidence)
None -- all findings verified against codebase or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, everything already installed and in use
- Architecture: HIGH - all hooks and stores inspected, integration points clear from codebase review
- Pitfalls: HIGH - derived from actual code inspection (crossfade-to-vitality mapping, CSS variable scoping, cross-browser pseudo-elements)

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable -- all APIs are mature, no fast-moving targets)
