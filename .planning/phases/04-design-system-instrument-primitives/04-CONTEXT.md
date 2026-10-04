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
