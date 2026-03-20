# Phase 1: Vitality Engine and Color System - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the core vitality state system (0.0-1.0 float), HSL color interpolation engine between degraded and healthy palettes, CSS custom property pipeline, and performance architecture (refs over state, rAF, batched writes, dynamic imports). This phase delivers the foundation that all subsequent visual effects build on. No particles, no caustics, no audio analysis — just the state engine, color math, and CSS variable output.

</domain>

<decisions>
## Implementation Decisions

### Color Palette Endpoints
- **Degraded (vitality=0.0):** Current Golden Hour palette — the existing CSS vars in globals.css (`--bg-abyss: #1a1714`, `--status-healthy: #cd853f`, `--text-primary: #e5e1db`, etc.) become the degraded baseline
- **Healthy (vitality=1.0):** Bioluminescent palette derived from UV reef photography inspiration:
  - Primary: teal ~HSL(175, 80%, 50%) — dominant reef glow
  - Accent: magenta ~HSL(320, 75%, 55%) — coral fluorescence
  - Secondary: deep blue ~HSL(220, 70%, 45%) — ocean depth
  - Highlight: gold ~HSL(45, 85%, 60%) — dinoflagellate bioluminescence
  - Background shifts from warm brown (#1a1714) to deep ocean (#0a1520)
- HSL interpolation between endpoints — not RGB (avoids muddy grays at midpoints)
- All existing Golden Hour hex values converted to HSL for interpolation

### Vitality Source Priority
- Page-specific single source — no mixing or blending between sources
- Compare page: crossfader slider position (0-1 maps directly to vitality)
- Experience page: will be driven by audio/ML in Phase 3-4 (this phase just exposes the setter)
- Gallery page: static per-card vitality based on category (healthy=1.0, degraded=0.0, restored=0.5)
- Default vitality when no source: 0.0 (degraded state — current look preserved as default)
- VitalityProvider exposes `setVitality(value)` and `vitality` ref — pages call setter

### Transition Curve Shape
- Ease-out cubic easing for vitality lerp: fast initial response, gentle settling
- Minimum transition duration: 300ms (accessibility — prevents seizure-triggering flashes)
- Non-linear stagger for color tokens:
  - Shrimp-band colors (teal) begin transitioning at vitality 0.2
  - Fish-band colors (magenta) begin at vitality 0.4
  - Complex ecosystem colors (gold, deep blue) begin at vitality 0.7
- Each token has its own effective vitality = `clamp((rawVitality - threshold) / (1 - threshold), 0, 1)`

### CSS Variable Naming
- New variables prefixed `--reef-` to namespace separately from existing `--bg-`/`--text-` vars
- Existing CSS variables remain untouched in this phase (Phase 4 bridges them)
- Variable set: `--reef-primary`, `--reef-accent`, `--reef-secondary`, `--reef-highlight`, `--reef-bg`, `--reef-surface`, `--reef-glow`, `--reef-text`
- Tailwind extended with `reef-*` color tokens pointing to these CSS vars
- CSSVariableWriter updates `:root` custom properties via `document.documentElement.style.setProperty()`

### Claude's Discretion
- Exact HSL values — tune during implementation for visual quality
- Internal lerp implementation (linear interp or spring physics)
- Hook API design (single useVitality hook vs separate useVitalityColors)
- File organization within src/ (new hooks/ vs lib/ vs context/)
- Whether to use React Context or simpler ref-based approach for the provider

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Color System
- `src/app/globals.css` — Current Golden Hour CSS custom properties (lines 8-42). These ARE the degraded palette endpoints.
- `tailwind.config.js` — Current Tailwind color tokens. Some already reference CSS vars (glass-*, status-*). Extend pattern for reef-* tokens.

### Audio/Animation Patterns
- `src/hooks/useSpectrogram.ts` — Established AudioContext + AnalyserNode + rAF pattern. Vitality engine should follow same ref/cleanup conventions.
- `src/components/experience/useAudioPlayback.ts` — Band filtering with BiquadFilterNodes. Already has low/mid/high band concept.

### Project Spec
- `prompts/055-bioluminescent-ui-system.md` — Full bioluminescent UI spec with color values, transition behavior, and architecture details.

### Research
- `.planning/research/STACK.md` — Stack recommendations (no new deps needed)
- `.planning/research/ARCHITECTURE.md` — Component architecture diagram and data flow
- `.planning/research/PITFALLS.md` — Performance pitfalls (React re-renders, HSL hue direction, memory leaks)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useSpectrogram` hook: AudioContext creation, AnalyserNode setup, rAF loop with cleanup — reuse pattern for vitality animation loop
- `useAudioPlayback` hook: Band filtering (low/mid/high), gain nodes — maps to frequency band concept
- `globals.css` CSS variables: Already structured as design tokens — extend with reef-* namespace
- `tailwind.config.js`: Already uses CSS var references for some colors — extend pattern

### Established Patterns
- Ref-based audio state (`audioCtxRef`, `analyserRef`, `sourceRef`) — follow for vitality animation state
- `useCallback` for lazy initialization — use for AudioContext/animation setup
- Dynamic imports with `next/dynamic` and `{ ssr: false }` — already used for map components, apply to all canvas/audio

### Integration Points
- `globals.css :root` block — where new `--reef-*` variables will be declared with initial (degraded) values
- `tailwind.config.js` colors — where `reef-*` tokens get added
- `src/app/layout.tsx` or `providers.tsx` — where VitalityProvider wraps the app
- Component `className` attributes — will reference `reef-*` Tailwind tokens

</code_context>

<specifics>
## Specific Ideas

- The degraded state should be "beautiful in its emptiness" (Blade Runner 2049 desert) — not an error state
- The healthy state should evoke UV/fluorescence reef photography where coral pigments glow
- The "whoa" moment is dragging the crossfader from 0 to 1 and watching the whole UI transform
- Stagger timing matches reef biology: shrimp return first to restoration sites, then fish, then complex behaviors

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-vitality-engine-and-color-system*
*Context gathered: 2026-03-20*
