# Phase 4: Design System & Instrument Primitives - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

<domain>
## Phase Boundary

A light scientific-editorial design system and an accessible instrument component kit, reviewable in every state on a dev-only fixtures route, before any instrument screen is built.

In this phase:
- One Tailwind v4 CSS-first token source (typography, spacing, surfaces, rules, radii, elevation, focus) that also drives the map style and chart scales.
- The ordinal status palette and the spectrogram/waveform colour scale.
- React Aria primitives: dialog, sheet, listbox, table, range and dual-range slider, toggle group, tooltip, command palette.
- Instrument primitives: Transport, Spectrogram, WindowStrip, BandToggle, CompareRow, ProvenanceChip / Why panel, StripPlot, ProbabilityBar (with abstain), DataTable, Legend (data-driven, with counts), Empty / Error / Loading.
- The `/dev/fixtures` route, under screenshot visual regression.

Out of this phase:
- New instrument screens (Phase 6+). Legacy pages are not redesigned here.
- Restyling the live maps (Phase 6). Only the token-to-map-style wiring is proven here.
- Any production frontend merge (owner hold).
- Backend / Lambda changes.

</domain>

<decisions>
## Implementation Decisions

### Visual direction (owner picked from three mockups, 2026-10-03)
- **Direction C, "Atlas".** Mockup: https://claude.ai/artifact/5fCPDhDduZzbxJhZdF7xt1 (board "C: Atlas").
- White ground. Panels are a flat pale cool grey (`#F1F2F6` in the mockup) with no border and no shadow.
- Square corners (radius 0) on panels, wells, buttons and bars.
- A heavy 3 px ink rule under the header; 1 px mid-grey rules inside panels.
- Type: an editorial serif for display (Newsreader, italic for page headlines, large: about 48 px at desktop), a grotesk for UI and body (Hanken Grotesk), and a mono for identifiers, timestamps, numbers and eyebrow labels (Spline Sans Mono). Load through `next/font`.
- Site ids and other identifiers are set large in mono (about 44 px in the inspector).
- Eyebrow labels: mono, 11 px, uppercase, tracked.
- One cold accent, indigo (`#4338CA` in the mockup), for the current nav item, links and focus. The accent is never a status colour and no status colour is used as an accent.
- Generous spacing (about 32 px between major blocks at desktop).

### Data colour (owner picked from three options, 2026-10-03)
- **Option 1: orange to blue ordinal status palette, with magma for spectrograms.** Mockup board "Colour 1".
- Status order and starting hexes: degraded `#B4520F`, restored_early `#E0A458`, restored_mid `#6FA8D6`, healthy `#1F5A99`, unknown `#7C828C` (neutral grey).
- Every status mark pairs colour with a shape and a text label: degraded = down triangle, restored_early = diamond, restored_mid = square, healthy = filled circle, unknown = hollow ring.
- The mockup hexes are a starting point. Final values must keep the warm-to-cool order, pass deuteranopia / protanopia / tritanopia simulation, differ in lightness as well as hue, and reach 3:1 against the light ground for marks (the two mid tones are too light on white as drawn; darken them or give marks an ink outline).
- Spectrograms and waveforms sit in dark wells (`#0B0D12` in the mockup) using the magma scale, with a dB colourbar and labelled frequency axis. Document the scale and the dB range next to the component.
- **Runner-up: Option 3 (single-hue teal ramp with viridis).** The owner rated it a close second. Use it as the fallback if Option 1 cannot be made to pass validation.

### Expressive range (owner feedback, 2026-10-03)
- The owner found the single inspector mockup too quiet to be the whole product ("quite boring"). Three further boards in direction C ("Listen: front door", "Compare: two reefs", "Explore: partial map", same canvas) answered that, and the owner accepted the approach. The system must be able to reach that register, not only the quiet inspector one.
- The interest comes from real data shown large, not from decoration. No ambient or decorative layer returns.
- Tokens and primitives must therefore support:
  - A display type scale that runs up to about 128 px (fluid, `clamp`) in the italic serif, and very large serif numerals for counts.
  - Spectrogram wells at hero scale: full-bleed, edge to edge, about 440 px tall, with a playhead, on a dark section that can also carry the headline and transport in light text.
  - One solid accent-colour block surface (white text on the indigo accent) for a single call to action per screen.
  - Large transport controls (play button up to about 96 px) as well as the compact size.
  - CompareRow with two wells on one shared colour scale, a shared playhead and an A/B crossfader.
  - A status proportion band (segments sized by count, with shape, count and label under each).
  - A paired-mark (dumbbell) variant of StripPlot for two-recording comparisons.
  - A scatter of sites using status shapes and colours with an ink outline on every mark, a selected-site ring in the accent, and labels set on the plot.
- Motion carries much of the life: playhead sweep, spectrogram scroll during playback, and crossfade. These are continuity motion and stay within DS-06; all stop under reduced motion.
- Every fixture for these stays real: shared-scale spectrograms, counts from the contract, and the projection's own caveat (the plane shows 33% of the variance; near does not mean similar).

### Alternative directions stay open (owner instruction, 2026-10-03)
- The owner wants to keep seeing bold alternative design directions while the product is built. Direction C with colour option 1 is the working default, not a final lock.
- A design direction is therefore a swappable theme, not hardcoded values:
  - Components read semantic tokens only (surface, ink, rule, accent, display / body / mono font, radius, well, status-*). No component names a raw colour, font or radius.
  - Each direction is one token set selected by an attribute on the root of the new surfaces (for example `data-direction`). Default: `atlas`.
  - Ship two further heavy directions as token sets in this phase so the owner can compare on real components. Claude designs them; they must differ strongly from Atlas and from each other (for example a dark-first immersive direction where the spectrogram is the page, and a colour-blocked poster direction with oversized type). Both keep the integrity rules, the status shapes and passing contrast.
  - The `/dev/fixtures` route has a direction switcher. Screenshot baselines cover the default direction in every state; the alternates get a smaller representative set.
  - The status palette and spectrogram scale are data colour, chosen separately (option 1 + magma), and stay the same across directions unless a direction cannot meet contrast with them.
- At every later UI gate (each new screen in Phase 6+), show two or three bold alternatives beside the default before locking that screen.
- Legacy pages are not themed by any of this.

### Components and scope (owner accepted all recommendations)
- React Aria Components for every interactive primitive listed in DS-04.
- Tailwind v3 → v4 CSS-first (`@theme` tokens in CSS). Legacy pages keep their dark look: the 33 existing Linux visual baselines must stay unchanged, so the new light tokens are scoped to new surfaces and the legacy dark tokens are carried over as-is.
- A dev-only `/dev/fixtures` route renders every primitive in every state from contract fixtures. It is excluded from production navigation and covered by screenshot tests and axe.
- Motion only for continuity (selection, layout morph, playhead, view transitions). With reduced motion enabled, nothing animates.
- Touch targets at least 44 px. Text contrast at least 4.5:1.

### Integrity rules that bind every primitive
- ProbabilityBar shows the model's values as returned, and has an abstain state. It never implies a diagnosis.
- ProvenanceChip / Why panel show who assigned a label, its definition, dataset, DOI and licence.
- Fixtures use real contract data only (`contracts/bucket/v1/*`, `contracts/fixtures/*`). No invented sites, labels, counts or probabilities.
- Legend counts are computed from the data shown, never hardcoded.

### Decisions after research (2026-10-03)
Where 04-UI-SPEC.md and 04-RESEARCH.md differ, these settle it:
- **Status palette:** the UI-SPEC values are the contract (`#914615`, `#B47F24`, `#1D77AD`, `#124068`, `#85888D`, token names `hab-*`). The research's alternative set is the fallback only if the automated palette gate fails. Both are darker than the mockup; the owner has been told and reviews them on the fixtures route.
- **Teal option 3 is dropped as a fallback.** As drawn it fails contrast and colour-vision separation.
- **Fixtures gate:** build-time flag `NEXT_PUBLIC_DEV_FIXTURES=1` around a dynamic import (verified to keep fixture code out of production bundles). `notFound()` alone is not enough. Never set the flag in Vercel.
- **Spectrogram level scale:** one fixed shared range for every well, -120 to -50 dB re full scale, labelled uncalibrated. No per-clip auto-scaling. This replaces the mockups' per-board relative scale.
- **Renderer:** Canvas 2D from a precomputed image; the playhead is a DOM element. WebGL is deferred.
- **Reduced motion and the playhead:** the playhead steps once per second and on seek or pause; no scroll mode; the time readout stays live.
- **WindowStrip fixtures:** unclassified and measured-energy cells only. No "illustrative" model output; per-window output arrives in Phase 5.
- **Accent:** stays out of data areas (it sits close to the healthy blue under colour-vision simulation).
- **Fonts:** Newsreader italic with the optical-size axis (about 147 KB) is accepted on new surfaces only; legacy routes load none of the new fonts. Revisit at the performance pass.
- **Tailwind v4 lands alone first** (plan 04-01) with the 33 Linux baselines passing unchanged and no snapshot dispatch. Nothing else lands until that is green in CI.
- **React Aria Components:** covered by the owner's standing package approval, so no human checkpoint for the install. Use the newest release that passes the package-age check and supports React 19.3; if none does, pin 1.21.1 exactly and record the flag in the plan summary.
- **Checkpoints that remain:** the fixtures snapshot dispatch (run by the orchestrator; do not push while it runs) and the owner's visual review of Atlas plus the two alternates at the end of the phase.
- Execution is sequential on the main checkout (no worktrees).

### Claude's Discretion
- Exact token names and scale steps, the type scale, how the legacy dark tokens are namespaced under v4, the spectrogram renderer (canvas vs WebGL), how fixtures are organised, the plan split, and test tooling changes Tailwind v4 needs.
- Whether Newsreader / Hanken Grotesk / Spline Sans Mono are kept exactly or swapped for close equivalents if `next/font` loading, licensing or rendering quality argues for it. The serif-display + grotesk + mono structure is fixed.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `dashboard-next/src/features/{contract,map,charts,monitoring}/`: the feature-module pattern. New primitives go under `src/features/` (for example `features/ui`, `features/instrument`) and may not import `@/components`.
- `src/features/charts/PlotFigure`: the Observable Plot wrapper. It has no consumer yet; StripPlot is its first.
- `src/features/map/{style,layers}.ts`: where map colours live today. Token wiring lands here.
- Test infrastructure: Vitest + Testing Library, Playwright with `mockApi` / `mockContract` fixtures, axe, 33 Docker-pinned Linux baselines, and the CI `update_snapshots` dispatch.
- Contract fixtures and the published v1 sites (54 sites: 15 degraded, 6 restored_early, 8 restored_mid, 16 healthy, 9 unknown).

### Established Patterns
- Tailwind 3.4 with `tailwind.config.js`; `content` must list every source directory (`tests/unit/tailwind-content.test.ts`). Tailwind v4 replaces this with CSS-first config; the test must be updated or retired to match.
- Legacy styling: `globals.css` tokens (`--bg-*`, `--glass-*`, `--text-*`, `--status-*`), `.glass-panel`, `.glass-button`, a global `*` transition rule, and a global `:focus-visible` outline.
- Status-to-colour mapping exists in `@/types` (`STATUS_COLORS`) and `@/lib/utils`. The new palette gets one source in the token layer; do not add a third mapping for legacy code.
- CI cancels in-progress runs on the same ref and event. Do not push while a snapshot dispatch is running.

### Integration Points
- `dashboard-next/package.json`, `postcss.config.*`, `tailwind.config.js`, `src/app/globals.css`, `src/app/layout.tsx` (fonts), `eslint.config.mjs`, `.github/workflows/ci.yml`, `tests/e2e/visual.spec.ts`.

</code_context>

<specifics>
## Specific Ideas

- The mockup screen is the reference composition: a site inspector on the left (id, label with assigner and definition, recording facts, source with DOI and licence), a spectrogram well with transport and band toggles, then model output bars and a similar-sites list.
- The mockup shows a real disagreement (dataset label Healthy, model output 95.6% degraded). Primitives must make that kind of disagreement plain, with the model's limits stated beside it.
- Follow `.planning/research/TECH-LANDSCAPE.md` for versions.
- Browser floor: Safari 16.4 (Tailwind v4 baseline).

</specifics>

<deferred>
## Deferred Ideas

- Restyling the live maps and the legacy pages in the new look (Phase 6+).
- Removing "classify reef health" copy on the Experience entry (copy pass with the new screens, Phase 7).
- Dark theme for the new system. Not requested.
- Production frontend merge (owner hold; preview first).

</deferred>
