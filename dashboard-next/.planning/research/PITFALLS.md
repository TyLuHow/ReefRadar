# Pitfalls Research: Audio-Reactive Bioluminescent UI

## 1. React Re-Renders Killing 60fps

**What goes wrong:** Storing animation state (vitality, colors, particle positions) in React state triggers re-renders every frame. At 60fps, this creates garbage collection pressure and layout thrashing.

**Warning signs:** Janky animations, dropped frames visible in Chrome DevTools Performance tab, React DevTools showing constant re-renders on VitalityProvider consumers.

**Prevention:**
- Store mutable animation state in `useRef`, not `useState`
- Write to Canvas and CSS variables directly via refs, bypassing React render cycle
- Only use `useState` for discrete state changes (page transitions, user interactions)
- VitalityProvider should expose refs, not state, for continuous values

**Phase:** Core state system (Phase 1)

## 2. Canvas Context Thrashing

**What goes wrong:** Creating new Canvas 2D contexts, clearing and redrawing entire canvas every frame, or layering multiple canvases without compositing strategy.

**Warning signs:** High GPU memory usage, canvas flickering, increasing frame times over session duration.

**Prevention:**
- Single canvas element, reused across frames
- `clearRect` only the dirty region, not full canvas (or accept full clear for particle systems)
- Use `globalCompositeOperation` for layering effects (particles + caustics on same canvas)
- Never create/destroy canvas elements in render loop

**Phase:** Particle/caustic rendering (Phase 2-3)

## 3. AnalyserNode FFT Bin Mapping Errors

**What goes wrong:** Incorrectly mapping FFT bins to frequency ranges. Common mistake: assuming linear bin spacing when it IS linear (unlike mel scale), but using wrong sample rate for calculation.

**Warning signs:** "Shrimp" band showing energy when fish are calling, or bands not responding to expected audio content.

**Prevention:**
- Bin frequency = `binIndex * sampleRate / fftSize`
- For 32kHz sample rate, fftSize 2048: each bin = 15.625 Hz
- Shrimp (2-20kHz) = bins 128-1280
- Fish (200-2000Hz) = bins 13-128
- Verify with known test tones before integrating with visuals

**Phase:** Audio analysis pipeline (Phase 2)

## 4. HSL Interpolation Through Wrong Hue Direction

**What goes wrong:** Interpolating hue linearly from degraded (warm, ~30°) to healthy (teal, ~180°) goes through green (120°) which looks unnatural. Or worse, going the long way around through purple/red.

**Warning signs:** Ugly green or purple intermediate states when crossfader is at 50%.

**Prevention:**
- Choose shortest arc on hue wheel (or deliberate long arc if desired)
- For 30° → 180°: linear interpolation works (passes through green briefly but stays short)
- Consider clamping saturation during mid-transition to mask muddy intermediates
- Test at 25%, 50%, 75% vitality positions — the middle is where problems show

**Phase:** Color engine (Phase 1)

## 5. Next.js SSR Conflicts with Canvas/Web Audio

**What goes wrong:** Canvas 2D and Web Audio API are browser-only. Server-side rendering attempts to access `document`, `window`, or `AudioContext` and crashes.

**Warning signs:** `ReferenceError: window is not defined` during build or SSR.

**Prevention:**
- Dynamic imports with `{ ssr: false }` for all canvas/audio components (already used in codebase)
- Guard all browser API access with `typeof window !== 'undefined'`
- Use `useEffect` (client-only) for all Web Audio and Canvas initialization

**Phase:** All phases — enforce from start

## 6. Memory Leaks from Animation Loops

**What goes wrong:** `requestAnimationFrame` callbacks not cancelled on unmount. AudioContext not closed. Event listeners not removed. Over time, multiple animation loops stack up.

**Warning signs:** Frame rate degrading over time, memory usage climbing in Task Manager, console warnings about detached DOM nodes.

**Prevention:**
- Store rAF ID in ref, cancel in useEffect cleanup: `cancelAnimationFrame(rafId.current)`
- Close AudioContext on component unmount
- Remove all event listeners in cleanup
- Single animation loop per page, not per component

**Phase:** Core hooks (Phase 1), enforce throughout

## 7. Mobile Performance Trap

**What goes wrong:** Desktop visual fidelity (150 particles + caustics + band analysis) cripples mobile devices. Touch events conflict with crossfader interaction.

**Warning signs:** <30fps on mobile, battery drain, crossfader unresponsive.

**Prevention:**
- Feature detection: `navigator.hardwareConcurrency` and viewport width
- Mobile profile: 50 particles max, no caustics, reduced analysis frequency (15fps)
- Test on real mid-range Android device, not just iPhone
- `touch-action: none` on crossfader to prevent scroll conflicts

**Phase:** Mobile optimization (final phase)

## 8. Accessibility: Seizure Risk and Lost Contrast

**What goes wrong:** Rapid color transitions or flashing particles trigger photosensitive seizures (WCAG 2.3.1). Dynamic colors reduce text contrast below 4.5:1 (WCAG 1.4.3).

**Warning signs:** Vitality transitions faster than 3 flashes/second, text becoming unreadable at mid-vitality states.

**Prevention:**
- Lerp vitality changes over 300-500ms minimum — never instant jumps
- Nav bar and data labels use fixed high-contrast colors, not interpolated
- Respect `prefers-reduced-motion`: disable particles, disable caustics, instant color (no animation)
- Test contrast ratios at vitality 0.0, 0.3, 0.5, 0.7, 1.0

**Phase:** Core system (Phase 1 for lerping), final phase for audit

## 9. CSS Custom Property Performance

**What goes wrong:** Updating 20+ CSS custom properties at 60fps causes style recalculation cascade. Each `setProperty` call on `:root` triggers full-page style recalc.

**Warning signs:** Long "Recalculate Style" blocks in Performance timeline, layout shifts.

**Prevention:**
- Batch all `setProperty` calls in single rAF callback
- Limit to ~10 CSS variables max (primary, accent, bg, surface, glow — not per-component)
- Components read via `var()` in Tailwind — they don't need re-renders, CSS handles it
- Debounce CSS updates to 30fps (every other animation frame)

**Phase:** CSS variable writer (Phase 1)
