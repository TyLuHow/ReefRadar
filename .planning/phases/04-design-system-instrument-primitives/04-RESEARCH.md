# Phase 4: Design System & Instrument Primitives - Research

**Researched:** 2026-10-03
**Domain:** Tailwind v3 to v4 migration with a pixel-identical legacy tree, token-driven themes ("directions"), React Aria Components kit, canvas spectrogram, Observable Plot / MapLibre token bridge, dev-only fixtures route, visual and a11y test strategy
**Confidence:** HIGH for the Tailwind migration, route gating, fonts, bundle cost and palette numbers (each executed or computed in scratch copies outside the repo); MEDIUM for the spectrogram renderer choice (headless software-GL measurements only) and for the alternate-direction token values (computed, not yet seen by the owner)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Visual direction (owner picked from three mockups, 2026-10-03)**
- **Direction C, "Atlas".** Mockup: https://claude.ai/artifact/5fCPDhDduZzbxJhZdF7xt1 (board "C: Atlas").
- White ground. Panels are a flat pale cool grey (`#F1F2F6` in the mockup) with no border and no shadow.
- Square corners (radius 0) on panels, wells, buttons and bars.
- A heavy 3 px ink rule under the header; 1 px mid-grey rules inside panels.
- Type: an editorial serif for display (Newsreader, italic for page headlines, large: about 48 px at desktop), a grotesk for UI and body (Hanken Grotesk), and a mono for identifiers, timestamps, numbers and eyebrow labels (Spline Sans Mono). Load through `next/font`.
- Site ids and other identifiers are set large in mono (about 44 px in the inspector).
- Eyebrow labels: mono, 11 px, uppercase, tracked.
- One cold accent, indigo (`#4338CA` in the mockup), for the current nav item, links and focus. The accent is never a status colour and no status colour is used as an accent.
- Generous spacing (about 32 px between major blocks at desktop).

**Data colour (owner picked from three options, 2026-10-03)**
- **Option 1: orange to blue ordinal status palette, with magma for spectrograms.** Mockup board "Colour 1".
- Status order and starting hexes: degraded `#B4520F`, restored_early `#E0A458`, restored_mid `#6FA8D6`, healthy `#1F5A99`, unknown `#7C828C` (neutral grey).
- Every status mark pairs colour with a shape and a text label: degraded = down triangle, restored_early = diamond, restored_mid = square, healthy = filled circle, unknown = hollow ring.
- The mockup hexes are a starting point. Final values must keep the warm-to-cool order, pass deuteranopia / protanopia / tritanopia simulation, differ in lightness as well as hue, and reach 3:1 against the light ground for marks (the two mid tones are too light on white as drawn; darken them or give marks an ink outline).
- Spectrograms and waveforms sit in dark wells (`#0B0D12` in the mockup) using the magma scale, with a dB colourbar and labelled frequency axis. Document the scale and the dB range next to the component.
- **Runner-up: Option 3 (single-hue teal ramp with viridis).** The owner rated it a close second. Use it as the fallback if Option 1 cannot be made to pass validation.

**Expressive range (owner feedback, 2026-10-03)**
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

**Alternative directions stay open (owner instruction, 2026-10-03)**
- The owner wants to keep seeing bold alternative design directions while the product is built. Direction C with colour option 1 is the working default, not a final lock.
- A design direction is therefore a swappable theme, not hardcoded values:
  - Components read semantic tokens only (surface, ink, rule, accent, display / body / mono font, radius, well, status-*). No component names a raw colour, font or radius.
  - Each direction is one token set selected by an attribute on the root of the new surfaces (for example `data-direction`). Default: `atlas`.
  - Ship two further heavy directions as token sets in this phase so the owner can compare on real components. Claude designs them; they must differ strongly from Atlas and from each other (for example a dark-first immersive direction where the spectrogram is the page, and a colour-blocked poster direction with oversized type). Both keep the integrity rules, the status shapes and passing contrast.
  - The `/dev/fixtures` route has a direction switcher. Screenshot baselines cover the default direction in every state; the alternates get a smaller representative set.
  - The status palette and spectrogram scale are data colour, chosen separately (option 1 + magma), and stay the same across directions unless a direction cannot meet contrast with them.
- At every later UI gate (each new screen in Phase 6+), show two or three bold alternatives beside the default before locking that screen.
- Legacy pages are not themed by any of this.

**Components and scope (owner accepted all recommendations)**
- React Aria Components for every interactive primitive listed in DS-04.
- Tailwind v3 → v4 CSS-first (`@theme` tokens in CSS). Legacy pages keep their dark look: the 33 existing Linux visual baselines must stay unchanged, so the new light tokens are scoped to new surfaces and the legacy dark tokens are carried over as-is.
- A dev-only `/dev/fixtures` route renders every primitive in every state from contract fixtures. It is excluded from production navigation and covered by screenshot tests and axe.
- Motion only for continuity (selection, layout morph, playhead, view transitions). With reduced motion enabled, nothing animates.
- Touch targets at least 44 px. Text contrast at least 4.5:1.

**Integrity rules that bind every primitive**
- ProbabilityBar shows the model's values as returned, and has an abstain state. It never implies a diagnosis.
- ProvenanceChip / Why panel show who assigned a label, its definition, dataset, DOI and licence.
- Fixtures use real contract data only (`contracts/bucket/v1/*`, `contracts/fixtures/*`). No invented sites, labels, counts or probabilities.
- Legend counts are computed from the data shown, never hardcoded.

### Claude's Discretion
- Exact token names and scale steps, the type scale, how the legacy dark tokens are namespaced under v4, the spectrogram renderer (canvas vs WebGL), how fixtures are organised, the plan split, and test tooling changes Tailwind v4 needs.
- Whether Newsreader / Hanken Grotesk / Spline Sans Mono are kept exactly or swapped for close equivalents if `next/font` loading, licensing or rendering quality argues for it. The serif-display + grotesk + mono structure is fixed.

### Deferred Ideas (OUT OF SCOPE)
- Restyling the live maps and the legacy pages in the new look (Phase 6+).
- Removing "classify reef health" copy on the Experience entry (copy pass with the new screens, Phase 7).
- Dark theme for the new system. Not requested. (Note: the "Nocturne" alternate direction below is a swappable direction owned by the "Alternative directions" instruction, not a dark theme for Atlas.)
- Production frontend merge (owner hold; preview first).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DS-01 | Single token source (Tailwind v4 CSS-first), consumed by UI, map style and chart scales | "Tailwind v4 migration" (proven legacy-neutral), "Token source and direction mechanism", "Token bridge to MapLibre and Plot" |
| DS-02 | One CVD-validated ordinal palette, distinct neutral for unknown, never an accent, always paired with shape or text | "Status palette: validation result and proposed values" with culori numbers; CVD + contrast gate as a Vitest test over the parsed CSS |
| DS-03 | Spectrograms and waveforms in dark wells with a documented perceptually uniform scale and dB colourbar | "Spectrogram and waveform rendering" (canvas 2D, magma LUT, real-clip dB statistics, deterministic fixtures) |
| DS-04 | Accessible RAC primitives: dialog, sheet, listbox, table, range/dual-range slider, toggle group, tooltip, command palette | "React Aria Components" (version, coverage map, bundle cost measured, SSR verified, keyboard test plan) |
| DS-05 | Instrument primitives: Transport, Spectrogram, WindowStrip, BandToggle, CompareRow, ProvenanceChip/Why, StripPlot, ProbabilityBar (abstain), DataTable, Legend, Empty/Error/Loading | "Primitive inventory and data sources", "Observable Plot marks", fixture data audit |
| DS-06 | Motion limited to continuity and fully respects reduced-motion | "Motion and reduced motion" (React 19.3 ViewTransition stable; one switch; Playwright test) |
| DS-08 | Dev-only fixtures route renders every primitive in every state | "The /dev/fixtures route" (flag gating verified: fixture code absent from a build without the flag) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

From `./CLAUDE.md` and `./.claude/CLAUDE.md`:
- Edit files only through a GSD command; no direct edits outside a GSD workflow. Do not commit (orchestrator commits); commit identity must be tylerlubyhoward@gmail.com; do not merge to `main`; production frontend merge is on owner hold (preview first).
- New UI code goes in `dashboard-next/src/features/*`; it may not import `@/components` (ESLint block + `scripts/check-feature-fence.mjs`). Only `features/contract` may reach contract artifacts or the contract CDN (`scripts/check-contract-fence.mjs`).
- Integrity: no synthetic or unattributed audio; no displayed probability that is not a probability; every label shows who assigned it and what it means; dataset attribution (CC BY 4.0) on every surface where audio or derived data appears. New copy must pass the banned-claims gate (`tests/unit/copy-claims.test.ts`).
- Legacy routes stay working and visually unchanged (33 Docker-pinned Linux baselines). Browser floor Safari >= 16.4 (Tailwind v4 baseline).
- Tooling in place: `cn()` for class merging; `'use client'` at the top of interactive files; props in a co-located `XProps` interface; heavy client-only components via `next/dynamic` with `ssr:false`. Tests: Vitest 5 + Testing Library (`tests/unit`), Playwright 1.63 + axe (`tests/e2e`, fixture-mocked by `mockApi`), visual baselines only in the CI Docker image (`PW_VISUAL=1`); CI cancels in-progress runs on the same ref and event, so do not push while a snapshot dispatch is running.
- Local runs are Windows; Linux baselines can only be produced by the CI `update_snapshots` dispatch.

## Summary

The Tailwind v3 to v4 migration is feasible without changing a legacy pixel. I did not trust the guide alone: I copied the committed tree to a scratch directory, built it on v3, ran `npx @tailwindcss/upgrade`, built again, then served both builds and diffed the **computed style of all 6,556 elements** on the 11 legacy states at 1440 and 390 px wide. The tool's output alone changed 6,350 elements. Five small, tested mitigations (a literal border colour, the button cursor rule, fixed rem line-heights in `@theme`, global rules moved into `@layer base`, sRGB gradients) reduce the differences to serialisation-only items (oklab instead of rgba text, `calc(infinity)` radius, individual transform properties, which margin side `space-*` uses). The one wrong move that looked right (putting `.glass-panel` and friends in `@layer components`) broke every element and must not be done: leave those classes unlayered. The migration must be its own first plan, with the 33 baselines passing untouched and no snapshot regeneration.

On top of v4, the safest way to hold two worlds is: legacy keeps its tokens and classes exactly as the upgrade tool leaves them; the new system lives in separate token files imported by the single `globals.css` entry, uses non-colliding names (`mark-*`, `ink`, `surface`, `well`), and reaches components only through `@theme inline` aliases of `--dir-*` variables that a `[data-direction="atlas|nocturne|poster"]` block sets. `@theme inline` is mandatory for runtime-swappable directions (verified: plain `@theme` resolves the alias once at `:root`, so nested direction overrides would not apply). JS consumers (MapLibre, canvas, continuous Plot scales) read tokens through a small bridge that requires **hex-only values for JS-visible tokens** (verified: `getPropertyValue` returns the authored text, so an `oklch()` token would reach MapLibre unparsed), while Plot marks and SVG use `var(--token)` directly and follow a direction change with no rebuild (verified in Chromium). A Vitest test that parses the CSS file is the single place that checks token completeness per direction, hex-only, WCAG 3:1 marks, WCAG 4.5:1 text and CVD separation.

The proposed status palette passes only after the two mid tones are darkened a lot more than "a bit". The mockup values fail 3:1 on white (restored_early 2.18, restored_mid 2.55). A constrained search gives `#8F3E0F`, `#AF8300`, `#2C6EA9`, `#053170`, `#7C828C`: warm-to-cool order kept, lightness differs between neighbours (L* 37, 58, 44, 21, unknown 54), CIEDE2000 minimum 17.4 across normal, protan, deutan and tritan simulation, all at least 3.46:1 on white and 3.09:1 on `#F1F2F6`. The owner's indigo accent sits only 14 to 15 delta-E from the healthy navy (10 from restored_mid under deuteranopia); it passes a 10 delta-E gate and the semantic rule, but the accent must stay out of data areas. On the dark well the palette fails 3:1 (healthy 2.35), so marks drawn over wells need a light outline or dark-ground variants.

**Primary recommendation:** Do the Tailwind v4 migration first as a single legacy-neutral plan proved by a computed-style diff plus the untouched 33 baselines; then build one CSS token layer (`@theme inline` aliases over `[data-direction]` blocks, hex for JS-visible tokens, CSS-parsing Vitest gate) before any primitive; render spectrograms on Canvas 2D from a precomputed RGBA image with the playhead as a transformed DOM element; gate `/dev/fixtures` with a build-time `NEXT_PUBLIC_DEV_FIXTURES` flag around a dynamic import so production bundles contain none of the fixture code; add fixture screenshots in a new Playwright project whose file name does not match the legacy `visual\.spec\.ts` regex.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tailwind compilation, token CSS, direction attribute | Build (PostCSS) + Browser (CSS cascade) | Frontend Server (layout sets `data-direction` and font variable classes) | Pure CSS; direction is an attribute on a wrapper, no JS needed to render |
| Font loading (next/font) | Build (self-hosted at build time) + CDN/static | Frontend Server (preload scoped to the nested layout) | Fonts are static assets; preload scope follows the layout that calls the font function |
| Token bridge to JS (map, canvas, scales) | Browser | none | Reads computed style at runtime; client-only |
| Spectrogram STFT, colour mapping, canvas draw | Browser (Worker later) | none | Browser already holds the decoded file; no round trip (TECH-LANDSCAPE section 4) |
| Playback, A/B crossfade, playhead clock | Browser (Web Audio) | none | `AudioContext.currentTime` is the only trustworthy clock |
| RAC primitives (dialog, slider, table, command palette) | Browser (client components) | Frontend Server (SSR output verified) | Interaction and focus management; SSR renders the static roles |
| Fixture data (sites, probabilities, projection caveat, clips) | CDN/static (`contracts/` via `features/contract`, `public/audio`) | Browser | Real artifacts only; the contract module is the sole reader of contract data |
| Dev-only route exclusion | Build (env flag, dead-code elimination) | Frontend Server (`notFound()`, noindex) | Code absent from production bundles is safer than a runtime guard |
| Visual and a11y verification | CI (Playwright in the pinned Docker image) | Local (Vitest, Windows) | Baselines only compare inside the Linux image |

## Standard Stack

### Core (new or changed in this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tailwindcss` | 4.3.3 (registry modified 2026-09-25) | CSS-first tokens and utilities | Locked decision; official upgrade tool exists [VERIFIED: npm registry] |
| `@tailwindcss/postcss` | 4.3.3 | PostCSS integration | Works under Next 16.3.8 Turbopack with no extra config [VERIFIED: scratch build] |
| `react-aria-components` | 1.21.1 (registry modified 2026-10-03) | Accessible interactive primitives | Locked decision; peer `react ^16.8 \|\| ... \|\| ^19.0.0-rc.1`; deps `react-aria` 3.52.1, `react-stately` 3.50.0 [VERIFIED: npm registry] |
| `d3-scale-chromatic` (+ `@types/d3-scale-chromatic`) | 3.1.0 (ISC code; magma data CC0 from matplotlib via BIDS/colormap) | `interpolateMagma` 256-entry lookup for spectrograms and the dB colourbar | Source read: `magma` is a stepped 256-colour ramp, ideal as a LUT [VERIFIED: unpkg d3-scale-chromatic@3.1.0 src/sequential-multi/viridis.js; BIDS colormaps.py header states CC0] |
| `fft.js` | 4.0.4 (MIT, last published 2022; ~870k weekly downloads) | Real FFT for the STFT | 22 KB, no dependencies; hand-rolling an FFT is a Don't-Hand-Roll item |

### Supporting (dev dependencies)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `culori` | 4.0.2 (MIT) | `filterDeficiencyProt/Deuter/Trit` (Machado, Oliveira, Fernandes 2009 matrices), `differenceCiede2000`, `wcagContrast`, `clampChroma` | The palette gate test and the palette search script only; never shipped to the browser [CITED: culorijs.org/api] |
| `@testing-library/user-event` | 14.6.7 | Realistic keyboard and pointer events for RAC unit smoke tests | Vitest keyboard smoke; the authoritative keyboard gate is Playwright |
| `postcss` | already `^8.4.40` | Parse the token CSS in Vitest | Token manifest test; no new package |

### Not adopted (decisions)

| Instead of | Considered | Decision |
|------------|-----------|----------|
| `tailwindcss-react-aria-components` 2.2.0 (Apache-2.0, peer `tailwindcss ^4.0.0`) | Plugin that adds `selected:`/`focus-visible:` variants | Do not add. Tailwind v4 already supports `data-[selected]:` / `data-selected:` on the attributes RAC writes; one fewer dependency [VERIFIED: v4 compile output shows `.data-\[selected\]\:bg-b-ink[data-selected]`] |
| `motion` 14.0.0 / framer-motion 14.0.0 | Layout morph and crossfade | Do not adopt in Phase 4. Published 2026-10-02 (the legitimacy check flags it `too-new`); CSS, React `<ViewTransition>` and rAF cover every Phase 4 motion. Legacy keeps framer-motion 11 untouched |
| WebGL2 spectrogram | TECH-LANDSCAPE recommendation | Canvas 2D now (reasons below); the `Spectrogram` interface takes a matrix, so a renderer swap is local |
| `cmdk` 1.1.1 | Command palette | Not needed: RAC `Autocomplete` + `Menu` inside `Modal`/`Dialog` is the documented command-palette pattern [CITED: react-aria.adobe.com/Autocomplete.md] |
| wavesurfer.js | Waveform | Removed in Phase 3; own waveform is ~40 lines of canvas |

**Installation (one commit per plan that owns it):**
```bash
# plan 04-01 (Tailwind), run while v3 is still installed, from a clean tree:
npx @tailwindcss/upgrade          # then: git checkout -- tests/baseline .planning   (see Pitfall 2)
# plan 04-0x (primitives)
npm install react-aria-components@1.21.1 d3-scale-chromatic@3.1.0 fft.js@4.0.4 --save-exact
npm install -D @types/d3-scale-chromatic@3.1.0 culori@4.0.2 @testing-library/user-event@14.6.7 --save-exact
```

**Version verification:** every version above was read with `npm view <pkg> version` and `time.modified` on 2026-10-03 [VERIFIED: npm registry]. `autoprefixer` is removed by the upgrade tool (Tailwind 4 handles prefixes).

## Package Legitimacy Audit

Run with `gsd-tools query package-legitimacy check --ecosystem npm ...` on 2026-10-03.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| tailwindcss | npm | years | ~159M/wk | github.com/tailwindlabs/tailwindcss | OK | Approved |
| @tailwindcss/postcss | npm | years | ~48M/wk | github.com/tailwindlabs/tailwindcss | OK | Approved |
| @tailwindcss/upgrade | npm | years | ~11k/wk | github.com/tailwindlabs/tailwindcss | OK | Approved (run via npx, not a dependency) |
| react-aria-components | npm | 3+ yrs | ~5.8M/wk | github.com/adobe/react-spectrum | SUS (`too-new`: the latest release is recent) | Flagged: planner adds a `checkpoint:human-verify` before install. Context: maintained by Adobe, ~5.8M weekly downloads, same monorepo as the other approved react-aria packages; the flag is a recency artefact, not a provenance problem |
| tailwindcss-react-aria-components | npm | 1+ yr | ~700k/wk | github.com/adobe/react-spectrum | OK | Not used (see decisions) |
| d3-scale-chromatic | npm | years | ~28M/wk | github.com/d3/d3-scale-chromatic | OK | Approved |
| @types/d3-scale-chromatic | npm | years | ~26M/wk | github.com/DefinitelyTyped/DefinitelyTyped | OK | Approved |
| culori | npm | years | ~3.6M/wk | github.com/Evercoder/culori | OK | Approved (dev only) |
| fft.js | npm | 5 yrs | ~870k/wk | github.com/indutny/fft.js | OK | Approved; no postinstall script |
| motion | npm | days (latest) | ~27M/wk | github.com/motiondivision/motion | SUS (`too-new`) | Not adopted in this phase |

**Packages removed due to SLOP verdict:** none. **Packages flagged SUS:** react-aria-components (planner inserts `checkpoint:human-verify` before the install task), motion (not installed).
`@testing-library/user-event` 14.6.7 was confirmed on the registry but was not run through the legitimacy seam in this session: tagged `[ASSUMED]` until the planner's gate runs it. No package here has a `postinstall` script (seam reports `postinstall: null` for all checked).

## Architecture Patterns

### System Architecture Diagram

```
                         globals.css  (the ONE Tailwind entry)
                 @import 'tailwindcss'
                      |-- legacy @theme + :root dark tokens + .glass-* (unlayered)   -> legacy pages (unchanged)
                      |-- system/tokens.css   [data-direction=atlas|nocturne|poster] { --dir-* }
                      |-- system/theme.css    @theme inline { --color-surface: var(--dir-surface) ... }
                      '-- system/base.css     scoped resets under [data-direction] (focus, transition, scrollbar)

  /dev/fixtures (flag) --> app/dev/layout.tsx (server)
        |                     |- fonts (next/font variables; alternates preload:false)
        |                     |- <div data-direction=... class="font vars"> RAC <RouterProvider>
        |                     '- ConditionalShell hides legacy Navbar/Footer for /dev
        v
  FixturesApp (client, dynamic import behind the flag)
        |-- useReferenceSites() / useModelVersion()   <-- features/contract (mockContract in CI)
        |-- tests/fixtures/api/visualize-3class-*.json (probabilities)  | contracts projection note
        |-- public/audio/marrs/*.wav  --parse--> Float32 --STFT(fft.js)--> u8 dB matrix --magma LUT--> RGBA
        v
  primitives (features/ui, features/instrument)
        |-- Spectrogram well: offscreen RGBA image --drawImage--> canvas; playhead = transformed DOM node
        |-- Transport / CompareRow: AudioContext clock, 2 sources -> 2 GainNodes (equal power) -> destination
        |-- Plot figures: var(--color-mark-*) in marks; resolved hex for continuous scales
        '-- MapLibre token style: readTokens() --> setPaintProperty on token change (MutationObserver)

  CI: web job builds WITHOUT the flag + greps .next for fixture markers (must be absent)
      e2e/visual jobs build WITH NEXT_PUBLIC_DEV_FIXTURES=1 (webServer env, like NEXT_PUBLIC_E2E_HOOKS)
```

### Recommended Project Structure
```
dashboard-next/src/
├── app/
│   ├── globals.css                 # single Tailwind entry: tool output + @import of system files
│   ├── dev/layout.tsx              # flag gate, fonts, data-direction wrapper, noindex
│   └── dev/fixtures/page.tsx       # if (flag) await import('@/features/fixtures')
├── styles/system/                  # tokens.css, theme.css, base.css (tokens only; no component CSS)
└── features/
    ├── ui/                         # tokens bridge, RAC wrappers (Dialog, Sheet, Listbox, Table, Slider, ToggleGroup, Tooltip, CommandPalette), motion switch
    ├── instrument/                 # Spectrogram, Waveform, ColourBar, Transport, WindowStrip, BandToggle, CompareRow, ProvenanceChip, ProbabilityBar, Legend, StatusBand, states
    │   └── dsp/                    # stft.ts, colormap.ts (pure, no DOM: movable to a Worker)
    ├── charts/                     # existing; add StripPlot (+dumbbell), SiteScatter, token Plot theme
    ├── map/                        # existing; add token-style.ts (blank token style + status match expression)
    └── fixtures/                   # FixturesApp: sections, direction switcher, data wiring (dev only)
```

### Pattern 1: Tailwind v4 migration, legacy-neutral (Plan 04-01)

**What:** run the tool, revert what it must not touch, apply five tested mitigations, prove no change.
**Method and evidence** (scratch copy of the committed tree; both builds served; computed style of every element, all properties, plus transition/animation properties and bounding boxes, for the 11 states in `tests/e2e/support/states.ts` at 1440 and 390 wide):

- Versions: `tailwindcss` / `@tailwindcss/postcss` / `@tailwindcss/upgrade` / `@tailwindcss/vite` all 4.3.3 [VERIFIED: npm registry].
- The tool **must run while v3 is installed**. If v4 is already installed it reports "Upgrading from Tailwind CSS v4.3.3" and skips config migration (observed) [VERIFIED: scratch run].
- What the tool did here: `@tailwind base/components/utilities` became `@import 'tailwindcss';`; `tailwind.config.js` became a `@theme { ... }` block in `globals.css` (colours, `--font-sans: var(--font-inter), system-ui, sans-serif;`, `--font-mono`, `--backdrop-blur-glass: 16px;`, `--animate-pulse-slow`, `--animate-wave`, `@keyframes wave`) and was **deleted**; `postcss.config.js` became `'@tailwindcss/postcss': {}` with `autoprefixer` removed; 25 source files rewritten (`flex-shrink-0` to `shrink-0`, bare `rounded` to `rounded-sm`, `drop-shadow-sm` to `drop-shadow-xs`, `backdrop-blur-sm` to `backdrop-blur-xs`, `bg-gradient-to-br` to `bg-linear-to-br`, `hover:border-[var(--x)]` to `hover:border-(--x)`); and a `@layer base` block `border-color: var(--color-gray-200, currentcolor);` [VERIFIED: scratch run, `git diff`].
- **Trap:** it also rewrote 10 JSON files under `tests/baseline/pre-truth/axe/` (class names in stored axe HTML) and Markdown under `.planning/`. Revert with `git checkout -- tests/baseline .planning` [VERIFIED: scratch run].
- `content` is gone (automatic source detection), so `tests/unit/tailwind-content.test.ts` (which regex-parses `tailwind.config.js`) cannot survive; `tests/unit/platform-versions.test.ts:53` asserts `expect(majorOf(pkg.devDependencies.tailwindcss)).toBe(3);` and must become 4; `tests/unit/vitality-removed.test.ts:152` reads `path.join(DASHBOARD_NEXT_ROOT, 'tailwind.config.js')` and must drop that path. Docs to update: `.claude/CLAUDE.md` lines 73 and 141 mention `tailwind.config.js` `content` [VERIFIED: grep this session].

**Computed-style result:** tool output alone: 6,350 of 6,556 elements differ (60,856 property differences).

| Difference | Cause | Mitigation (tested) |
|---|---|---|
| Colour strings become `lab()` / `oklab(... / .6)` instead of `rgb()/rgba()` | v4 opacity modifiers compile to `color-mix(in srgb, ...)` and the palette is oklch | Compare with a colour tolerance (per channel <= 1/255 after canvas normalisation); not a visible change |
| Default border colour `rgb(229,231,235)` became `lab(91.62 ...)` on ~6,000 elements | the tool's compat block uses `var(--color-gray-200)`, which is oklch in v4 | Replace with literal `#e5e7eb`. After: 42 elements differ, all oklab serialisation only |
| `cursor: pointer` became `default` on 798 elements (buttons) | v4 preflight | Add inside `@layer base`: `button:not(:disabled), [role='button']:not(:disabled) { cursor: pointer; }` (from the upgrade guide) |
| `text-xs` and other sized text: `line-height` 16px became 13.33px for nested text, 112 bounding boxes moved by 0.67 px (a 30 px button became 30.67 px) | v4 theme line-heights are unitless ratios (`--text-xs--line-height: calc(1 / 0.75)`) vs v3 fixed rem | In the legacy `@theme`: `--text-xs--line-height: 1rem; --text-sm--line-height: 1.25rem; --text-base--line-height: 1.5rem; --text-lg--line-height: 1.75rem; --text-xl--line-height: 1.75rem; --text-2xl--line-height: 2rem; --text-3xl--line-height: 2.25rem; --text-4xl--line-height: 2.5rem` |
| 456 elements: `transition-property` / duration replaced by the legacy global `* { transition ... 150ms }` rule (a `duration-300` utility silently becomes 150 ms); `body`, scrollbar and `:focus-visible` rules also beat utilities | v4 utilities live in `@layer utilities`; unlayered CSS beats any layer | Wrap `body`, scrollbar, the `*` transition rule, the `.animate-spin, .animate-pulse` reset and `:focus-visible` in `@layer base { ... }` |
| `space-x/y-*` margins appear on the other side (228 + 252 elements) | v4 selector is `:not(:last-child)` with `margin-bottom` | Same spacing; accept, or exclude `margin-*` from the comparison |
| `border-radius: 9999px` serialises as `3.35544e+07px` | v4 `rounded-full` is `calc(infinity * 1px)` | Same render; ignore |
| `sites` chevron `transform: matrix(-1,0,0,-1,0,0)` becomes `rotate: 180deg`; `translate: 0 -50%` | v4 individual transform properties | Same render; ignore |
| Visually hidden checkbox: `clip: rect(0,0,0,0)` becomes `clip-path: inset(50%)` | v4 `sr-only` | Same render |
| `scrollbar-width: thin` appears on the SampleGallery strip (`scrollbar-thin` was an undefined no-op class in v3 and is a real utility in 4.3) | v4 ships the utility | 6 elements. The one real behavioural change: remove the dead class (preferred) or add `scrollbar-width: auto` |
| `bg-linear-to-br` interpolates in oklab; mid-gradient colours shift on `analyze` (2 elements) | v4 default interpolation | `bg-linear-to-br/srgb` (class compiles; confirm in the Linux snapshot) |

After the border literal, cursor rule, line-heights, base layering and sRGB gradient: remaining differences are only the serialisation, `space-*` side, `rounded-full`, transform-property and `scrollbar-thin` items above [VERIFIED: scratch computed-style diff]. This is not yet a screenshot-level proof: the Linux baselines in CI remain the authority.

**Do not** move `.glass-panel`, `.glass-button`, `.heading`, `.hero-text`, `.mono` into `@layer components`: tested, every one of 6,556 elements changed (cause not isolated; presumably wholesale preflight/ordering damage). Keep them unlayered. Unlayered class rules also keep winning against utilities exactly as under v3, because under v3 they came later at equal specificity. A residual risk to check at review: an unlayered legacy class now also beats *variant* utilities of higher specificity (for example `hover:bg-x` on a `.glass-button`); grep found only `hover:border-opacity-50` on a `.glass-panel` (SiteCard; GlowCard has the same class) and `hover:border-warm-amber/50` on the GlassButton danger variant (`glass-button text-warm-amber border-warm-amber/30 hover:border-warm-amber/50`), and the diff showed no resulting change at rest. Hover states are not covered by screenshots: add a Playwright hover probe on those two components in plan 04-01.

**Proof that no baseline changed (layered):**
1. The 33 Linux baselines in `tests/e2e/visual.spec.ts-snapshots` pass **unchanged** in the `visual` job (`maxDiffPixelRatio: 0.01`). The plan must not run the `update_snapshots` dispatch; any failure is a defect to fix [VERIFIED: playwright.config.ts `toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' }`].
2. A one-off computed-style fingerprint (the script: `page.evaluate` over `document.querySelectorAll('body *')`, all properties, run on the pre-migration commit and the migrated commit, colour-tolerant diff). Raw dumps are 97 MB for 22 pages, so record the result in the plan SUMMARY and keep the script under `dashboard-next/scripts/`; do not commit dumps.
3. `npm ls tailwindcss` shows one 4.x; `npm run build` green; `next build` route table unchanged.

**Browser floor:** Tailwind docs state "Safari 16.4+, Chrome 111+, Firefox 128+" [CITED: tailwindcss.com/docs/upgrade-guide]; the project constraint is Safari >= 16.4; Firefox is therefore 128+, stricter than Next 16's 111.

### Pattern 2: Token source and direction mechanism (Plan 04-02)

**What:** raw per-direction variables (`--dir-*`) set by attribute blocks; Tailwind utilities alias them with `@theme inline`; components use only semantic utilities.

```css
/* system/theme.css  (verified compile behaviour, Tailwind 4.3.3) */
@theme inline {
  --color-surface: var(--dir-surface);
  --color-panel: var(--dir-panel);
  --color-well: var(--dir-well);
  --color-ink: var(--dir-ink);
  --color-ink-muted: var(--dir-ink-muted);
  --color-rule: var(--dir-rule);
  --color-accent: var(--dir-accent);
  --font-display: var(--dir-font-display);
  --font-body: var(--dir-font-body);
  --font-mono-ui: var(--dir-font-mono);
}
@theme {                      /* data colour: static, direction-independent unless a direction overrides --dir-mark-* */
  --text-display: clamp(3rem, 1.5rem + 7.5vw, 8rem);   /* reaches 128px at about 1400px wide, never below 48px */
  --text-display--line-height: 0.95;
}
@custom-variant nocturne (&:where([data-direction='nocturne'], [data-direction='nocturne'] *));
```
```css
/* system/tokens.css */
[data-direction='atlas']    { --dir-surface:#FFFFFF; --dir-panel:#F1F2F6; --dir-well:#0B0D12; --dir-ink:#111318; --dir-accent:#4338CA; ... }
[data-direction='nocturne'] { --dir-surface:#07080C; ... }
[data-direction='poster']   { --dir-surface:#F6F2EA; ... }
```
Verified in a scratch compile: with `@theme inline` the utility is `.bg-b-surface { background-color: var(--surface); }` and the variable is **not** emitted into `:root`; with plain `@theme` it emits `--color-a-surface: var(--surface)` inside `:root, :host`, which resolves once at the root so a nested `[data-direction]` override cannot change it. The same compile produced `.poster\:underline:where([data-direction='poster'], [data-direction='poster'] *)` from `@custom-variant`, `.data-\[selected\]\:bg-b-ink[data-selected]`, and `motion-reduce:transition-none` inside a media query [VERIFIED: scratch compile]. The Next.js font docs also use `@theme inline` for font variables [CITED: nextjs.org/docs/app/api-reference/components/font "With Tailwind CSS"].

**Names that are safe.** Legacy `@theme` already defines `--color-status-healthy`, `-degraded`, `-restoring-early`, `-restoring-mid`, `--color-bg-surface`, `--font-sans`, `--font-mono`, and colours `abyss`, `depths`, `bone`, `ochre`, `dusty-rose`, `pale-gold`, `muted-tan`, `warm-gray`, `warm-amber`, `glass-*` [VERIFIED: tool output in scratch globals.css]. New names must not collide: use `surface`, `panel`, `well`, `ink`, `ink-muted`, `rule`, `rule-strong`, `accent`, `accent-ink`, `block`, `focus`, `mark-degraded`, `mark-restored-early`, `mark-restored-mid`, `mark-healthy`, `mark-unknown`, `mark-outline`; fonts `display`, `body`, `mono-ui`. Radius/elevation/rule width as semantic aliases: `--radius-control`, `--radius-panel`, `--radius-well` (0 in Atlas), `--shadow-raised`, `--shadow-overlay`, `--dir-rule-width`, `--dir-rule-width-strong` (1 px and 3 px in Atlas).

**Scoping so legacy is untouched.** Unused `@theme` variables are not emitted by default, and `inline` ones are never emitted to `:root`, so adding the system files changes no legacy rule. The scoped base block (inside `@layer base`, selector `[data-direction]` so it only applies to new surfaces) must reset what legacy globals leak onto new surfaces: the legacy `*` transition rule (would add a 150 ms transition to every primitive and break the reduced-motion guarantee), `:focus-visible { outline: 2px solid #cd853f }` (ochre focus ring; the system focus ring is the accent), the dark scrollbar rules, and `html.scroll-smooth` (`scroll-behavior: smooth` is motion; add `@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto } }`).

**One entry file.** Tailwind compiles one entry per PostCSS pass; a second file with `@import 'tailwindcss'` would duplicate preflight. Keep `globals.css` as the only entry and `@import './../styles/system/*.css'` from it, after the legacy block.

### Pattern 3: Token bridge to MapLibre, canvas and Plot (Plan 04-02, used by 04-07)

**Constraint found:** `getComputedStyle(el).getPropertyValue('--x')` returns the **authored text**: an `oklch(60% 0.2 30)` token comes back as `oklch(60% 0.2 30)` and `#B4520F` comes back as `#B4520F` (observed in Chromium) [VERIFIED: scratch Playwright]. MapLibre's colour parser and canvas `fillStyle` need a parseable string. Rule: **every token JS reads is an sRGB hex literal** (`mark-*`, `surface`, `ink`, `rule`, `accent`, `well`, `accent-ink`). Derived UI tints (hover, selected wash) may use `color-mix()` in CSS only. A Vitest test enforces the rule over the parsed CSS.

- `readTokens(root: Element): Tokens` calls `getComputedStyle(root)` for a fixed key list, trims, and throws on a missing or non-hex value.
- `useTokens(rootRef)` subscribes with a `MutationObserver` on the nearest `[data-direction]` element (`attributes: true, attributeFilter: ['data-direction', 'style']`) and bumps a version, so a direction switch or a `root.style.setProperty('--dir-mark-degraded', ...)` in a test re-renders consumers.
- **Plot:** categorical marks and strokes take `var(--color-mark-degraded)` strings: verified that an SVG `fill="var(--c)"` follows a live custom-property change with no rebuild (computed `rgb(255,0,0)` then `rgb(0,255,0)`) [VERIFIED: scratch Playwright]. Continuous scales (a magma colourbar, `scaleLinear` interpolation) need resolved hex, so those builders take `Tokens` and the figure rebuilds on the version bump (`PlotFigure.build` already re-runs when its identity changes, `PlotFigure.tsx` effect deps `[build, width, ariaLabel, ariaDescription, hasData]`).
- **MapLibre:** a pure `buildTokenMapStyle(tokens)` returns a blank `StyleSpecification` (a `background` layer plus an optional `circle` layer) and `statusColorExpression(tokens)` returns `['match', ['get','status'], 'degraded', tokens.markDegraded, ... , tokens.markUnknown]`. On a token change call `map.setPaintProperty(layerId, prop, value)` (no `setStyle`, which flashes). The existing `window.__reefMap` hook under `NEXT_PUBLIC_E2E_HOOKS` lets Playwright read `getPaintProperty` [VERIFIED: playwright.config.ts `env: { NEXT_PUBLIC_E2E_HOOKS: '1' }`; maps.spec uses it per its header comment]. Phase 4 restyles no live map: the legacy `layers.ts` keeps `STATUS_COLORS` from `@/types`.
- **"Changing a token visibly changes all three" test (Playwright, on the fixtures route):** set `--dir-mark-degraded` to a sentinel hex on the surface root, then assert (1) a `bg-mark-degraded` swatch computed background equals it, (2) the first Plot mark for `degraded` has computed `fill` equal to it, (3) `__reefMap.getPaintProperty('fixture-sites','circle-color')` contains it. The same test is the direction-switch test when run with `data-direction` changed.
- **Unit-level (Vitest, no browser):** parse `tokens.css` with `postcss`, assert key completeness per direction, hex-only for the JS-visible set, and run contrast and CVD maths with `culori` directly on the parsed hex. One CSS file is the only place values live; no TS duplicate.

### Pattern 4: Fonts per direction (Plan 04-02)

Built in scratch with `next build` (Next 16.3.8), fonts fetched at build time and self-hosted; the web CI job already builds with network access (`Inter`, `JetBrains_Mono` load today), so no CI change [VERIFIED: scratch build; CI `web` job runs `npm run build`].

| Family | Axes available (read from the emitted woff2 with fontkit) | Latin woff2 size | OFL | Tabular figures |
|---|---|---|---|---|
| Newsreader italic, `axes:['opsz']` | wght 200-800, opsz 6-72 | 147 KB (italic), 132 KB (roman) | OFL (Production Type) | `tnum` present but the font's default digits are not uniform (digit `7` advance 1300 vs 1100 for others even with `tnum`): do not rely on it for columns |
| Newsreader italic, wght only | wght 200-800 (opsz fixed at default) | 64.5 KB (italic), 58 KB (roman) | OFL | same |
| Hanken Grotesk | wght 100-900 | 34.7 KB | OFL (Hanken Design Co.) | no `tnum` feature, but all ten digits have the same advance (560) so figures are tabular by default |
| Spline Sans Mono | wght 300-700 | 36.5 KB | OFL | monospace, inherently tabular |

[VERIFIED: fontkit on emitted files; google/fonts METADATA.pb license "OFL" for all three; sizes from `.next/static/media`]. Only the file whose `unicode-range` starts `U+??,U+131` (latin) is preloaded; the latin-ext and cyrillic files download only when characters need them.

- Recommendation: Newsreader **italic with `axes: ['opsz']`** (147 KB) for display, because the 128 px headline wants the opsz 72 cut (`font-optical-sizing: auto` maps size to opsz and the axis tops out at 72); roman Newsreader only if serif numerals are set roman at hero scale, with `preload: false` (58 KB without opsz). Hanken Grotesk and Spline Sans Mono variable, latin. First-load cost for an Atlas surface about 218 KB of woff2 beyond the legacy fonts, which is why the font calls live in the **nested `/dev` layout (and later the system layouts), not the root layout**: Next preloads a font "only on the related routes" by where the function is called [CITED: nextjs.org/docs/app/api-reference/components/font "Preloading"], so legacy routes pay nothing.
- `display: 'swap'` (default) plus Next's automatic metric-matched fallback (the build emitted `Newsreader Fallback`, `Hanken Grotesk Fallback`, `Spline Sans Mono Fallback`). `optional` would hide a 128 px headline; do not use it. Tests wait for `document.fonts.ready`.
- Because new font CSS variables are set on a nested wrapper (not `html`), `--font-display` etc. **must** be `@theme inline` aliases of `var(--font-newsreader)` ..., otherwise `:root` resolves them with the variable undefined. The tool's legacy `--font-sans: var(--font-inter), ...` is fine only because `inter.variable` is on `html`.
- Per-direction fonts without shipping every family: declare alternates' families in the `/dev` layout with `preload: false`. An `@font-face` rule that no rendered text uses is not downloaded by browsers, so Atlas pays only its own three; verify with a Playwright network assertion (no request for alternate-direction font files while `data-direction="atlas"`) `[ASSUMED]` browser behaviour, to be confirmed by that test.
- Alternate-direction families (all OFL in google/fonts METADATA; confirm the `next/font/google` export names at plan time): Nocturne display Fraunces (axes opsz, wght, SOFT, WONK), body IBM Plex Sans, mono IBM Plex Mono; Poster display Bricolage Grotesque (opsz, wdth, wght) or Anton, body Space Grotesk, mono JetBrains Mono (already loaded by the root layout, zero extra cost).
- Fluid display type: `clamp(3rem, 1.5rem + 7.5vw, 8rem)` keeps a rem component so browser zoom still scales it (WCAG 1.4.4); test at 200% zoom and at 320 px width.

### Pattern 5: React Aria Components (Plans 04-03, 04-04)

- `react-aria-components` 1.21.1, React 19 compatible by peer range; v1.9.0 added "support for React 19's ref cleanup behavior" [CITED: react-aria.adobe.com/llms.txt]. No `SSRProvider` is needed on React 18+/19.
- **SSR verified:** a client-component page using Button, Dialog, Modal, ListBox, Table, Slider (two thumbs), ToggleButtonGroup, Tooltip and Autocomplete+Menu built under Next 16.3.8 Turbopack and the prerendered HTML carried `role="grid"`, `columnheader`, `rowheader`, `gridcell`, `listbox`, `option`, `toolbar`, `group` [VERIFIED: scratch build + curl].
- **Bundle cost measured** with `.next/diagnostics/route-bundle-stats.json`: legacy routes 238-293 KB gzip first load (`/about` 248 KB); a route importing all those RAC components 319 KB gzip, i.e. **about +71 KB gzip** for the whole kit [VERIFIED: scratch build]. Import named exports from `react-aria-components` (tree-shaken); do not import the package barrel into legacy routes; fixture-only code stays behind the flag.

| Need | RAC pieces | Notes |
|---|---|---|
| Dialog | `DialogTrigger`, `Modal`, `ModalOverlay`, `Dialog` | `isDismissable`, `isKeyboardDismissDisabled`; focus trap, `aria-hidden`/`inert` handled; `role="alertdialog"` available [CITED: react-aria.adobe.com/Modal.md] |
| Sheet (bottom tray / side panel) | No dedicated component: `ModalOverlay` + `Modal` + `Dialog` styled as a tray, enter/exit with `data-entering` / `data-exiting` CSS | the docs show a gesture-driven sheet using Motion; the CSS-only variant needs no library; under reduced motion the CSS transition is zero |
| Listbox | `ListBox`, `ListBoxItem`, `selectionMode` | typeahead and arrow keys built in |
| Table | `Table`, `TableHeader`, `Column`, `TableBody`, `Row`, `Cell`; `Virtualizer` available | sortable columns via `allowsSorting`; DataTable wraps it |
| Range slider | `Slider` + `SliderTrack` + `SliderThumb index={0|1}` with `defaultValue={[lo, hi]}` | dual thumb verified to SSR; `aria-label` per thumb required; `SliderOutput` for `aria-valuetext` (use mm:ss or Hz text) |
| Toggle group | `ToggleButtonGroup`, `ToggleButton`, `selectionMode` | BandToggle |
| Tooltip | `TooltipTrigger`, `Tooltip` | hover and focus; no interactive content inside |
| Command palette | `ModalOverlay` > `Modal` > `Dialog` > `Autocomplete` (+ `SearchField`) > `Menu` | documented pattern with a global shortcut; `renderEmptyState` for no matches; `useFilter` for the matcher [CITED: react-aria.adobe.com/Autocomplete.md] |

- Styling: data attributes on RAC elements (`data-selected`, `data-focus-visible`, `data-pressed`, `data-hovered`, `data-disabled`, `data-entering`, `data-exiting`) with Tailwind v4 `data-[selected]:` or `data-selected:` variants. `tailwindcss-react-aria-components` 2.2.0 exists for v4 but is unnecessary.
- 44 px touch targets: Tailwind `min-h-11 min-w-11` (`--spacing` is 0.25 rem, so 11 units is 44 px); slider thumbs keep a 44 px hit area with a smaller painted dot (pseudo-element). A Playwright test asserts every `button, [role=slider], [role=option], [role=row]` on the fixtures page has a bounding box >= 44 px on the interactive axis (WCAG 2.5.8 only requires 24 px; 44 px is the owner's rule).
- Router: wrap the dev layout (and later system layouts) in RAC `RouterProvider` with `useRouter` from `next/navigation` so RAC links navigate client-side `[ASSUMED: pattern from RAC docs, not exercised in this session]`.
- Legacy chrome leak: `ConditionalShell` hides Navbar/Footer only when `pathname.startsWith('/experience')` [VERIFIED: src/components/layout/ConditionalShell.tsx]. Add `/dev` to that check in the plan that creates the dev layout, or the legacy dark nav and footer will frame the light surface.

### Pattern 6: Spectrogram and waveform rendering (Plan 04-05, 04-06)

**Decision: Canvas 2D, precomputed RGBA image, DOM playhead.** Reasons for deviating from TECH-LANDSCAPE's WebGL2 recommendation (section 4):
- The matrix is small: the repo's real clips are 30 s at 16 kHz native rate [VERIFIED: public/audio/ATTRIBUTION.md "duration 30.0s, ... native sample rate 16000 Hz"; files are 960,044 bytes]. fft 512, hop 256 gives 1874 frames x 257 bins (computed from the real files with numpy), about 1.9 MB as RGBA.
- Hero well: 1440 css px x 440 px at devicePixelRatio 2 is a 2880 x 880 backing store (2.5 MP). One `drawImage` of the offscreen image per resize; nothing per frame. The playhead is a DOM element moved with `transform: translateX()` (compositor-only, zero canvas repaint). Scrolling-window mode is one `drawImage(offscreen, sx, 0, sw, nBins, 0, 0, W, H)` per frame. In headless Chromium with software GL the call cost measured 0.1 ms median, 0.2 ms p95 over 120 frames; that is call overhead, not raster time, so treat as MEDIUM evidence and keep a rAF frame-interval check in the plan's manual review `[ASSUMED]` beyond that.
- Determinism: colour mapping is a CPU LUT, so output pixels do not depend on GPU shaders, float precision or `MAX_TEXTURE_SIZE` (software WebGL reported 8192 here, which would force tiling beyond 8192 columns) [VERIFIED: scratch Chromium `webgl2`, `MAX_TEXTURE_SIZE`]. Canvas screenshots are stable inside the Docker image; the legacy spec hides `canvas`, the fixtures spec must not.
- WebGL is the later upgrade for recordings of many minutes or per-frame filters; keep `dsp/` and the matrix type renderer-agnostic.
- HiDPI: size the backing store with a `ResizeObserver` on the well (`devicePixelContentBoxSize` where available, else `cssSize * devicePixelRatio`), cap total pixels (for example width x dpr <= 8192); axis labels and band highlight are DOM text and absolutely positioned rects, so they stay crisp and are readable by assistive tech.

**STFT:** a pure `stft(samples: Float32Array, {fftSize, hop, window}): Float32Array` using `fft.js` (`FFT(size).realTransform`), Hann window, magnitude to dB relative to full scale of the file, quantised to `Uint8Array` over a fixed display range. No DOM, so it moves into a Worker unchanged for uploads (Phase 8). `AnalyserNode`/`OfflineAudioContext` are not suitable: the analyser gives timing-dependent, smoothed frames. The WAV is parsed directly (16-bit PCM, mono) rather than `decodeAudioData`, which would resample to the context rate and make the matrix machine-dependent. Compute cost for a 30 s clip is a few milliseconds of FFTs, so a Worker is not needed in Phase 4; make the Worker move a Phase 8 task. Pin the output with a checksum unit test of the quantised matrix for one real clip.

**dB range, from the real clips** (STFT as above, dB relative to the file's full scale, uncalibrated): percentiles over the nine clips, 1st percentile -117.1 to -106.7 dBFS, median -98.0 to -85.1, 99.5th percentile -72.9 to -51.6; clip peaks only 0.012 to 0.201 of full scale [VERIFIED: py -3.12 numpy over `public/audio/marrs/*.wav`]. Recommended **fixed shared range -120 to -50 dBFS (70 dB)** for every well and every clip; never per-clip auto-scaling, because shared scale is what makes a comparison fair. State on the colourbar "dB re full scale of the file (uncalibrated; hydrophone sensitivity not applied)": absolute SPL is unknown. Because raw clips differ in level by up to 24 dB, A/B comparison of audio needs the level-match disclosure from REDESIGN-THESIS; Phase 4's Crossfader takes per-side trim gains and the fixture shows both.
**Axis:** the frequency axis ends at the Nyquist of the data (8 kHz for these clips), not at 16 kHz.

**Magma:** `interpolateMagma(t)` from `d3-scale-chromatic` is `ramp(colors("0000040100050101..."))`, a stepped lookup of 256 hex colours [VERIFIED: source read], the colour data is CC0 (matplotlib's viridis family by Smith, van der Walt, Firing) and the package code is ISC (the d3 LICENSE in the package also carries the ColorBrewer Apache-2.0 notice for other schemes) [VERIFIED: unpkg LICENSE + BIDS/colormap header]. Sample it 256 times once into a `Uint8ClampedArray(256*4)` LUT; the colourbar uses the same LUT (canvas strip) with DOM tick labels (-120, -100, -80, -60, -50). Document the scale, range and parameters next to the component (a `SpectrogramSpec` caption row: FFT size, hop, window, range, scale). Parameters shown must be the parameters used; a shared STFT spec with the Python pipeline is a Phase 5 item (TECH-LANDSCAPE pitfall P10).

**Waveform:** min/max peak envelope per output pixel column from the decoded samples, drawn as 1 px vertical strokes on the same well, in the direction's `ink-on-well` token. Deterministic and about 40 lines.

**Accessibility of the canvas:** `role="img"` + `aria-label` stating duration, frequency range, dB range, plus a text summary computed from the matrix (for example the frequency of peak median energy), with a "data table" disclosure like `PlotFigure`'s hidden table pattern. Never describe the sound as healthy or degraded.

### Pattern 7: Hero-scale wells, shared scale, playhead, A/B crossfade (Plan 04-06)

- Two wells, **one `SpectrogramSpec`** (same range, same LUT, same time axis length): CompareRow takes `[a, b]` matrices and asserts equal spec; mismatch renders an explicit "different scales" state rather than silently rescaling.
- Shared playhead: one clock, `audioContext.currentTime - startedAt`, written to both playhead nodes through refs inside `requestAnimationFrame` (never React state per frame; this was P2 in PITFALLS). Pause the rAF loop when the well is off-screen (`IntersectionObserver`) and under reduced motion.
- A/B crossfade: one `AudioContext` created on the first user gesture; decode both clips with `decodeAudioData`; two `AudioBufferSourceNode`s started with the same `start(when)` into two `GainNode`s; equal-power gains `gainA = cos(x * PI/2)`, `gainB = sin(x * PI/2)` for slider position `x` in [0,1]; apply with `gain.setTargetAtTime(v, ctx.currentTime, 0.015)` to avoid zipper noise. `equalPowerGains(x)` is a pure unit-tested function; the engine is thin. Both buffers are equal length here (30 s), so sync is by construction; unequal lengths must be rejected, not stretched.
- The crossfader is an RAC `Slider` (single thumb) with `aria-valuetext` such as "70% recording B"; keyboard step 0.05, page step 0.25.
- Hero well CSS: full-bleed wrapper (`w-screen` breakout or a section at the layout root), `h-[440px]`, `bg-well`; headline and transport in `text-ink-inverse`. Large transport: the 96 px play button is a `size` variant (`compact` 44 px, `large` 96 px) of the same RAC `Button`, never a different component.
- Reduced motion: playhead jumps to the new position on seek, pause and a once-per-second tick (see Open Question 1); scroll mode is disabled; crossfader still works (it is input, not animation).

### Pattern 8: Observable Plot marks (Plan 04-07)

Plot 0.6.17 in `node_modules` supports what the owner's expressive range needs [VERIFIED: node_modules/@observablehq/plot/src/marks/dot.js:31 `const {x, y, r, rotate, symbol = symbolCircle, frameAnchor} = options;`; src/symbol.js:39-40 `function isSymbolObject(value) { return value && typeof value.draw === "function"; }`; symbol names include `"triangle"` and `"triangle2"`]:
- Status shapes: `Plot.dot` with a `symbol` channel; the five shapes are `triangle` rotated 180 (`rotate: 180` channel, since `triangle` points up) for degraded, `diamond`, `square`, `circle` (filled) and a hollow ring (`circle` with `fill: 'none'`, `stroke`). A custom symbol object `{ draw(context, size) { ... } }` is accepted if a cleaner down-triangle is wanted. Ink outline on every mark: `stroke: 'var(--color-mark-outline)'`, `strokeWidth: 1.5`.
- Dumbbell StripPlot: `Plot.link` (x1, x2 at the same y) plus two `Plot.dot` layers; selection ring: an extra `Plot.dot` with `fill: 'none'`, `stroke: 'var(--color-accent)'`, larger `r`.
- On-plot labels: `Plot.text`; Plot has no label-collision handling, so fixtures label only the selected site and a small, fixed set (explicit `dx`/`dy`), and every figure keeps `PlotFigure`'s hidden `<table>` as the keyboard equivalent. Plot's pointer tips are not keyboard accessible; do not rely on them.
- Scatter data are real: `projection: {x, y}` per site and the projection note [VERIFIED: contracts/bucket/v1/sites.json site `aus_D1` has `"projection": {"x": -0.162614, "y": 0.872352}`; projection.json `"cumulative_explained_variance_ratio": 0.32993314` and `"note": "A 2-D linear (PCA) projection ... This plane shows 33.0% of the variance ... sites that are far apart in the embedding can look close on the plane."`]. The caveat sentence must sit beside the scatter in the fixture.
- `PlotFigure` has no consumer yet; StripPlot is its first. It must stop using `RULE_COLOR = 'rgba(229,225,219,0.1)'` and `TEXT_COLOR = 'var(--text-secondary)'` (legacy dark constants in `encodings.ts`); the new figures use a token Plot theme (`var(--color-rule)`, `var(--color-ink-muted)`). Leave the legacy encodings alone.
- StatusBand (proportion): plain DOM flex segments sized by count with `flex-grow`, shape glyph (inline SVG), count and label under each; not a Plot figure.
- Legend: computed from the data (`countsByStatus(sites)`), with the shape, label and count; **the published v1 counts are 15 degraded, 6 restored_early, 8 restored_mid, 16 healthy, 9 unknown (54)** [VERIFIED: Counter over contracts/bucket/v1/sites.json this session]; a test asserts the Legend text equals those computed counts, never hardcoded numbers in the component.

### Pattern 9: Motion and reduced motion (Plan 04-03)

- React 19.3 `<ViewTransition>` is **stable** and exported from `'react'`; "We're excited to announce that both of these [View Transitions and Fragment Refs] are now stable in React 19.3" [CITED: react.dev/blog/2026/09/09/react-19-3]. In the Next 16.3 App Router it needs no configuration; it animates only inside Transitions (`startTransition`, Suspense, `useDeferredValue`, and route navigation), never plain `setState` [CITED: nextjs.org/docs/app/guides/view-transitions]. Without browser support the app works, the transition does not animate. So the TECH-LANDSCAPE claim holds. The guide also states `<Link transitionTypes>` exists and shows the reduced-motion CSS below.
- Use for: selection to detail morph (shared `name`), Suspense reveal, same-route crossfade. Use CSS transitions for hover/selection colour and `data-entering`/`data-exiting` for RAC overlays. Use rAF only for the playhead and scroll. No motion library in Phase 4.
- **Single switch.** One root attribute `data-motion="reduce"` set by a tiny client hook that combines `matchMedia('(prefers-reduced-motion: reduce)')` (the only source in Phase 4; an owner toggle is a later feature) and mirrors it to CSS and JS:
  1. CSS: tokens `--dir-dur-fast/base/slow` become `0ms` under `@media (prefers-reduced-motion: reduce)` and `[data-motion='reduce']`; every system transition uses those tokens; `::view-transition-old(*), ::view-transition-new(*), ::view-transition-group(*) { animation-duration: 0s !important; animation-delay: 0s !important }` from the Next guide; `html { scroll-behavior: auto }`.
  2. JS: `useReducedMotion()` gates the playhead tick, scroll mode and the crossfader's smoothing; no `requestAnimationFrame` loop starts when true.
  3. Playwright test with `use: { reducedMotion: 'reduce' }` [VERIFIED: playwright-core types.d.ts `reducedMotion?: null|"reduce"|"no-preference";`]: on the fixtures page, start playback, wait 600 ms, assert `document.getAnimations().length === 0`, assert every `[data-direction] *` has computed `transition-duration` of `0s`, and assert the playhead's transform is unchanged between two samples taken 500 ms apart while "playing" (or changes only on the 1 Hz tick if Open Question 1 is answered that way).
- Pitfall for the legacy `*` transition rule: it is inside `@layer base` after plan 04-01 and would leak onto new surfaces; the scoped base block must set `transition: none` for `[data-direction] *` before any primitive sets its own tokenised transition.

### Pattern 10: The /dev/fixtures route (Plan 04-09)

Tested in scratch with a build without and with the flag:
- Gate with a build-time flag around a **dynamic import**:
  ```tsx
  // app/dev/fixtures/page.tsx
  import { notFound } from 'next/navigation';
  export default async function Page() {
    if (process.env.NEXT_PUBLIC_DEV_FIXTURES === '1') {
      const { FixturesApp } = await import('@/features/fixtures');
      return <FixturesApp />;
    }
    notFound();
  }
  ```
  Result: build without the flag: `/dev/fixtures/` returned **404** and a unique marker string from the fixtures module was present in **0** files under `.next/static` and `.next/server`; build with `NEXT_PUBLIC_DEV_FIXTURES=1`: **200** and the marker in 4 files [VERIFIED: scratch builds]. Having only `notFound()` in the layout (tested first) returned 404 but still shipped the page's chunks, so the dynamic-import form is required.
- `app/dev/layout.tsx` also exports `metadata = { robots: { index: false, follow: false } }` (emitted `<meta name="robots" content="noindex, nofollow"/>` with the flag; `noindex` alone without it) [VERIFIED: scratch curl]. Add an `X-Robots-Tag: noindex` header for `/dev/:path*` in `vercel.json` (defence in depth; the route 404s in production anyway).
- No link to `/dev` anywhere in `Navbar`; `ConditionalShell` must hide chrome for `/dev` (see Pattern 5).
- CI wiring: `playwright.config.ts` `webServer.env` adds `NEXT_PUBLIC_DEV_FIXTURES: '1'` next to `NEXT_PUBLIC_E2E_HOOKS: '1'` (also in `playwright.review.config.ts` if it should see the route); never set it in Vercel (same rule as the E2E hook); add `scripts/check-dev-fixtures-excluded.mjs` to the `web` CI job: after the flag-less `npm run build`, grep `.next` for a marker constant exported by the fixtures module and fail if found.
- Data: the page reads sites and the model version through `@/features/contract` hooks (`useReferenceSites`, `useModelVersion`), which the e2e `mockApi` serves from `contracts/` on disk with request assertions (see `contract-dashboard.spec.ts`: `contract.requests` equals `['contract/latest.json', 'contract/v1.json', 'v1/sites.json']`). The ESLint fence blocks importing `**/contracts/fixtures/**` outside `features/contract`, so the fixtures module must not import contract fixture JSON directly. The 3-class probabilities come from `tests/fixtures/api/visualize-3class-in-region.json` (label degraded, probabilities `{"healthy": 0.22, "degraded": 0.49, "restored_early": 0.29}`) and `visualize-3class-stamped.json` (label healthy, probabilities `{"healthy": 0.58, "degraded": 0.27, "restored_early": 0.15}`) [VERIFIED: read with python this session]; import them by relative path from the dev-only module (not blocked by the fence; excluded from production by the flag). Audio: `fetch('/audio/marrs/<id>.wav')` from `public/audio`.
- Query params for the harness: `?direction=atlas|nocturne|poster` and `?only=<section>` read client-side with `useSearchParams` inside `Suspense` (the same pattern as `ContractVersionSync`), so the route stays static.

### Pattern 11: Alternate directions (Plan 04-10)

Computed with `culori` (WCAG ratios, CIEDE2000 under Machado simulations). These are designs for the owner to react to, validated mechanically:

| Token | Atlas (default) | Nocturne (dark-first, "the spectrogram is the page") | Poster (colour-blocked, oversized type) |
|---|---|---|---|
| surface | `#FFFFFF` | `#07080C` | `#F6F2EA` (paper) |
| panel | `#F1F2F6` | `#12141B` | `#F6F2EA` with hard 3 px ink rules, no fill |
| well | `#0B0D12` | `#07080C` (well and page merge; hairline rule only) | `#151515` |
| ink / muted | `#111318` (18.6:1 on white) / `#5A606C` (6.3:1 on white, 5.65:1 on panel) | `#E8E9EE` (16.5:1) / `#9AA0AE` (7.6:1 on surface, 7.0:1 on panel) | `#151515` (15.9:1 on paper) / `#5A5348` (6.6:1) |
| accent | `#4338CA` (7.9:1 on white, white on it 7.9:1) | `#5EEAD4` teal (13.5:1 on surface; delta-E >= 14 from every dark-ground status under deuteranopia except unknown 12) | violet block `#5B3DF5` (white on it 6.1:1) plus lime block `#D4F23A` (ink on it 14.4:1); blocks are surfaces, never marks |
| status marks | proposed Atlas palette below | lightened: degraded `#F87446`, restored_early `#FCDB77`, restored_mid `#6BC5F9`, healthy `#3B7EE4`, unknown `#969BA2` (min CIEDE2000 18.8 across simulations; 4.63 to 13.6:1 on `#12141B`, 4.90 to 14.4:1 on `#0B0D12`) | Atlas palette (3.02 to 10.9:1 on `#F3EFE7`; restored_early is the tightest at 3.02, so use `#F6F2EA` or darken `#AF8300` by 2 L* steps) |
| radius | 0 | 0 to 2 px | 0 |
| rules | 3 px ink header rule, 1 px mid-grey | 1 px `#2A2E3A` hairlines only | 6 px ink rules, hard offset shadow `6px 6px 0 ink` for overlays |
| fonts | Newsreader italic + Hanken Grotesk + Spline Sans Mono | Fraunces + IBM Plex Sans + IBM Plex Mono | Bricolage Grotesque (or Anton) + Space Grotesk + JetBrains Mono |
| display scale | up to 128 px italic serif | up to 128 px, light weight, wide tracking | up to 192 px (`clamp(4rem, 2rem + 12vw, 12rem)`), uppercase, heavy |

Every direction must pass the same gate (token completeness, hex-only JS tokens, 4.5:1 text, 3:1 marks against that direction's own grounds, CVD, accent vs marks >= 10, status shapes present). The gate runs per `[data-direction]` block of `tokens.css`. The status palette is data colour and identical across directions unless a direction cannot meet contrast with it (Nocturne cannot: the Atlas navy is 2.35:1 on the well), in which case the per-direction `--dir-mark-*` override is the mechanism.

### Anti-Patterns to Avoid
- **Plain `@theme` aliases of runtime variables:** resolved once at `:root`; use `@theme inline`.
- **`oklch()`/`color-mix()` in a JS-visible token:** MapLibre and canvas get the raw string; hex only.
- **Moving legacy `.glass-*` classes into `@layer components`:** tested to break every element.
- **Running the upgrade tool after installing v4, or leaving its `tests/baseline` and `.planning` rewrites in the commit.**
- **A fixtures spec named `*visual.spec.ts`:** the legacy `visual` project's `testMatch: /visual\.spec\.ts/` would pick it up and its baselines would join the 33 (and the e2e `testIgnore` regex would hide it).
- **Per-frame React state for the playhead or scroll:** use refs and transforms.
- **Per-clip automatic dB scaling:** breaks the shared scale; fixed -120 to -50 dBFS.
- **Hiding canvases on the fixtures route** the way the legacy visual spec does: it would make the spectrogram baselines meaningless.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dialog, sheet, listbox, table, sliders, toggle group, tooltip, command palette focus and keyboard behaviour | Custom ARIA widgets | `react-aria-components` | Focus trapping, typeahead, virtual focus, `inert`, touch/pen/keyboard parity |
| FFT | A radix-2 loop | `fft.js` | Edge cases (real transform packing, scaling); test against a naive DFT on a short vector |
| Magma/viridis ramp | Hand-typed hex lists | `d3-scale-chromatic` `interpolateMagma` (sample once into a LUT) | Perceptually uniform data already vetted (CC0 origin) |
| Colour-vision simulation, delta-E, contrast ratio | Own matrices and formulae | `culori` (Machado 2009 matrices, CIEDE2000, WCAG contrast) | Easy to get gamma and matrices subtly wrong; dev-only dependency |
| CSS color resolution for JS | Parsing `oklch`/`color-mix` strings | Author JS-visible tokens as hex | Removes the need to parse at all |
| Route-level dev gating | Runtime env checks in components | Build-time flag around a dynamic import | Verified: removes the code from production bundles |
| Visual diffing | Own pixel comparison | Playwright `toHaveScreenshot` in the pinned Docker image | Existing infrastructure and baselines workflow |

**Key insight:** the only things worth writing by hand here are the STFT glue (windowing, dB quantisation, matrix type), the LUT rendering, and the token bridge. Everything else has a vetted library or platform feature.

## Runtime State Inventory

Not a rename or migration phase for runtime data. The Tailwind migration is a build-tooling change with no stored data, live service config, OS-registered state or secrets. Explicit answers:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None: no database keys carry class names or tokens | none |
| Live service config | None: Vercel project settings contain no Tailwind-specific values; `vercel.json` only has headers and build commands | add the `X-Robots-Tag` header for `/dev/:path*` (code edit) |
| OS-registered state | None | none |
| Secrets/env vars | `NEXT_PUBLIC_DEV_FIXTURES` is new and must NOT be set in Vercel (same rule as `NEXT_PUBLIC_E2E_HOOKS`) | document in `docs/` and the CI notes |
| Build artifacts | `tailwind.config.js` is deleted by the tool; `autoprefixer` removed; `.next/` caches are stale after the switch; `package-lock.json` changes | `npm ci` after the commit; CI uses `npm ci` so it picks the lockfile up |
| Stored audit baselines | `tests/baseline/pre-truth/axe/*.json` contain old class names | leave untouched (revert the tool's rewrite); they are historical evidence |

## Common Pitfalls

### Pitfall 1: The upgrade tool run order
**What goes wrong:** run after `npm install tailwindcss@4`, it skips config migration and leaves `tailwind.config.js` unlinked.
**Why:** it detects the installed version. **How to avoid:** run on a clean tree with v3 installed; the tool installs v4 itself. **Warning signs:** the log says "Upgrading from Tailwind CSS v4".

### Pitfall 2: The tool touches files it should not
**What goes wrong:** 10 axe baseline JSONs under `tests/baseline/pre-truth/axe/` and `.planning/**/*.md` are rewritten, polluting the diff and altering historical evidence. **How to avoid:** `git checkout -- tests/baseline .planning` straight after, and review `git status` before committing.

### Pitfall 3: Cascade layer inversion
**What goes wrong:** every unlayered global rule (`*`, `body`, `:focus-visible`, scrollbar) now beats utilities, so durations and focus rings silently change. **How to avoid:** put exactly those in `@layer base`; keep component-like classes unlayered. **Warning signs:** the computed-style diff shows `transition-duration` differences.

### Pitfall 4: Legacy leaks onto new surfaces
**What goes wrong:** the legacy `*` transition (150 ms), the ochre `:focus-visible`, dark scrollbars and `scroll-smooth` apply on the light system and break reduced motion and the accent-only-focus rule. **How to avoid:** the scoped reset in `system/base.css`, asserted by the reduced-motion test and a focus-ring colour test.

### Pitfall 5: Name collisions between legacy and system tokens
**What goes wrong:** `--color-status-*`, `--color-bg-surface`, `--font-mono` already exist. **How to avoid:** the `mark-*`, `surface`, `ink`, `mono-ui` names above; a unit test fails if a system `@theme` key duplicates a legacy key.

### Pitfall 6: Font variables on a nested wrapper
**What goes wrong:** a plain `@theme` `--font-display: var(--font-newsreader)` resolves at `:root` where the variable is undefined. **How to avoid:** `@theme inline`.

### Pitfall 7: Baselines cannot be generated locally and CI fails closed
**What goes wrong:** `visual.spec.ts` throws in CI when its baseline directory is empty (WR-20). A new fixtures screenshot spec committed before baselines exist would fail CI; regenerating via the same dispatch would also re-write the 33 legacy files if the same project is used. **How to avoid:** a separate project and spec (see Validation Architecture), skip-with-annotation while its directory is empty, one dispatch to create baselines, then tighten to fail-if-missing in a later commit.

### Pitfall 8: Pushing during a snapshot dispatch
CI cancels in-progress runs of the same event on the same ref; do not push while the dispatch runs [CITED: CONTEXT.md; ci.yml concurrency block].

### Pitfall 9: Safari canvas and audio
iOS Safari limits total canvas area; keep the backing store capped. `AudioContext` must be created or resumed inside a user gesture. Test the crossfader in headless Chromium with a click first.

### Pitfall 10: WindowStrip data does not exist yet
There is no per-window model output in any API fixture (`classification` has `label`, `confidence`, `probabilities`, `region`; no window list) [VERIFIED: fixtures read this session]. Do not invent readings. See Open Question 3.

## Code Examples

### Palette gate (Vitest, parses the CSS; culori dev dependency)
```ts
// Source: culorijs.org/api (filterDeficiency*, differenceCiede2000, wcagContrast)
import { differenceCiede2000, filterDeficiencyDeuter, filterDeficiencyProt, filterDeficiencyTrit, parse, wcagContrast } from 'culori';
const de = differenceCiede2000();
const sims = [(c: any) => c, filterDeficiencyProt(1), filterDeficiencyDeuter(1), filterDeficiencyTrit(1)];
// for each [data-direction] block: marks = ['degraded','restored-early','restored-mid','healthy','unknown'].map(k => tokens[`--dir-mark-${k}`])
// expect(min pairwise de under every sim).toBeGreaterThanOrEqual(10)
// expect(wcagContrast(mark, ground)).toBeGreaterThanOrEqual(3) for ground in [surface, panel]
// expect(wcagContrast(ink, surface)).toBeGreaterThanOrEqual(4.5)
```

### Dev-only route (verified build behaviour)
See Pattern 10.

### Spectrogram well draw (shape of the code; pure canvas)
```ts
// offscreen: nFrames x nBins RGBA built once from the u8 matrix and the 256-entry LUT
const off = new OffscreenCanvas(nFrames, nBins); off.getContext('2d')!.putImageData(image, 0, 0);
// on resize / scroll:
ctx.imageSmoothingEnabled = true;
ctx.drawImage(off, sx, 0, sw, nBins, 0, 0, canvas.width, canvas.height); // low frequencies at the bottom: flip once when building `image`
// playhead: <div style="transform: translateX(...)"> in a sibling layer; updated in rAF via ref, not state
```
`OffscreenCanvas` availability in Safari 16.4 is `[ASSUMED]`; fall back to `document.createElement('canvas')`, which the benchmark used.

### Equal-power crossfade
```ts
// Source: Web Audio equal-power law; engine uses gain.setTargetAtTime(v, ctx.currentTime, 0.015)
export const equalPowerGains = (x: number) => ({ a: Math.cos(x * Math.PI / 2), b: Math.sin(x * Math.PI / 2) });
```

### Reduced-motion probe (Playwright)
```ts
test.use({ reducedMotion: 'reduce' });
// expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailwind.config.js` + `content` globs | `@theme` in CSS, automatic source detection, `@source` for extras | Tailwind 4 (4.3.3 now) | the content-coverage test is obsolete; a compiled-CSS test replaces it |
| Plugin + `autoprefixer` | `@tailwindcss/postcss` alone | v4 | smaller PostCSS config |
| `framer-motion` for layout morphs | React `<ViewTransition>` (stable in 19.3) + CSS | React 19.3 (2026-09-09) | no motion library needed for continuity animations |
| Custom command palette (`cmdk`) | RAC `Autocomplete` + `Menu` in a `Modal` | RAC 1.x | one primitive layer |

**Deprecated/outdated:** `@tailwind` directives; `theme()` in CSS (use `var(--...)`); `bg-opacity-*`, `flex-shrink-*`, bare `rounded`/`shadow`/`blur` names [CITED: tailwindcss.com/docs/upgrade-guide].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@testing-library/user-event` 14.6.7 passes the legitimacy gate (registry version confirmed, seam not run on it) | Package audit | Planner's gate catches it; low |
| A2 | Browsers do not download an `@font-face` file that no rendered text uses, so alternate-direction fonts with `preload:false` cost nothing under Atlas | Pattern 4 | Atlas would download extra fonts; caught by the planned network assertion |
| A3 | RAC `RouterProvider` with `next/navigation` `useRouter` gives client-side navigation for RAC links | Pattern 5 | Links do full reloads; low impact in Phase 4 (no screens) |
| A4 | `OffscreenCanvas` is available in Safari 16.4; otherwise a detached `<canvas>` is used (the fallback is already specified) | Code Examples | none if the fallback is used |
| A5 | True raster cost of `drawImage` per frame on real GPUs is low (only call overhead was measured, in headless software GL) | Pattern 6 | Scroll mode janks on weak tablets; mitigated by sweep mode as default and the WebGL fallback path |
| A6 | CIEDE2000 >= 10 as the "distinguishable under CVD" gate (project threshold chosen here, not an industry standard) | Palette | Owner may want stricter; the proposed palette scores 17.4 so a stricter gate also passes |
| A7 | Alternate-direction values (Nocturne, Poster) and their font choices are design proposals, mechanically validated only | Pattern 11 | Owner dislikes them; they are token sets, cheap to change |
| A8 | `Bricolage_Grotesque` / `IBM_Plex_*` / `Fraunces` are exported by `next/font/google` under those names | Pattern 4 | Rename at plan time; Anton and Fraunces confirmed in Next's font-data.json (grep), the others not checked |

## Open Questions (RESOLVED)

All six resolved: see 04-CONTEXT.md "Decisions after research" and the 04-01 gate.

1. **Reduced motion and the playhead.**
   - What we know: DS-06 says nothing animates under reduced motion; a moving playhead is functional, not decorative.
   - What's unclear: the owner's reading.
   - Recommendation: under reduced motion, step the playhead once per second and on seek/pause; keep the time readout live as text; no scroll mode. Owner decision requested.
2. **Palette values differ visibly from the mockup.** The proposed Atlas marks (`#8F3E0F`, `#AF8300`, `#2C6EA9`, `#053170`, `#7C828C`) are noticeably darker than the mockup's mid tones because 3:1 on white forces it. The alternative offered in CONTEXT (keep lighter fills, add an ink outline) cannot fix CVD lightness steps by itself. Recommendation: adopt the darker set; owner to confirm by looking at the fixtures swatches.
3. **WindowStrip with model readings.** No per-window model output exists until Phase 5. Recommendation: build the primitive with `reading: null | {status, confidence}`; fixtures show unclassified cells and measured band-energy cells (real, from the clips), and add the model-reading state only when real per-window output exists. Owner to accept or to approve an explicitly labelled "illustrative structure" state (not recommended; it conflicts with the integrity rule).
4. **Accent vs healthy blue.** Indigo `#4338CA` is 14 to 15 delta-E from healthy navy and 10 from restored_mid under deuteranopia. It satisfies the semantic rule; the gate is 10. Recommendation: accent never inside data areas (marks, bars, strips), enforced by review; owner to accept.
5. **Newsreader weight on the wire.** 147 KB for italic with opsz on every system-surface first load. Alternative: italic without opsz (64.5 KB), losing the optical cut at 128 px. Recommendation: keep opsz for italic display; roman `preload:false`.
6. **Scratch evidence is not the Linux baseline.** Everything about legacy pixel identity is proven at computed-style level on Windows; only the CI `visual` job gives the screenshot proof. If it fails, plan 04-01 iterates before anything else lands.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build, tests | yes | 24.18.0 local (CI uses 22; `engines >=20.9.0`) | none needed |
| npm | installs | yes | 11.16.0 | none |
| Playwright Chromium | e2e, fingerprint, benchmarks | yes | chromium 1217 and 1243 in ms-playwright (project pins 1.63.0) | CI image `mcr.microsoft.com/playwright:v1.63.0-noble` |
| Docker | regenerate Linux baselines | no (not on PATH) | none | CI `update_snapshots` dispatch (existing path) |
| `gh` CLI | dispatching the snapshot workflow | yes | 2.102.0 | none |
| `py -3.12` + numpy | dB-range statistics script | yes (numpy 1.26.4); `python3` is NOT on PATH | | none |
| Network at build | `next/font/google` | yes locally and in CI (the current build already needs it) | | none |
| WebGL2 in headless Chromium | map fixture (the spectrogram does not need it) | yes (software; `MAX_TEXTURE_SIZE` 8192) | | mask or skip the map in screenshots |

**Missing dependencies with no fallback:** none. **With fallback:** Docker (use the CI dispatch).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.3 + Testing Library (unit); Playwright 1.63.0 + `@axe-core/playwright` 4.13.0 (e2e, a11y, visual) |
| Config file | `dashboard-next/vitest.config.ts`, `playwright.config.ts` (projects `e2e`, `visual`) |
| Quick run command | `cd dashboard-next && npx vitest run tests/unit/<file>` |
| Full suite command | `cd dashboard-next && npm test && npm run lint && npm run typecheck && npm run build` (then `npx playwright test --project=e2e` and, in CI, `--project=visual`) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DS-01 | Tokens exist per direction; JS-visible tokens are hex; no key collides with legacy | unit (parses CSS) | `npx vitest run tests/unit/tokens.test.ts` | Wave 0 |
| DS-01 | Changing a token changes UI, Plot and map | e2e | `npx playwright test tests/e2e/token-bridge.spec.ts --project=e2e` | Wave 0 |
| DS-01 | Legacy untouched | visual (existing 33) + one-off fingerprint | `PW_VISUAL=1 npx playwright test --project=visual` (CI) | exists |
| DS-01 | A class used only under `src/features` is generated by v4 | unit (compiles `globals.css` with `@tailwindcss/postcss`) | `npx vitest run tests/unit/tailwind-v4-sources.test.ts` | Wave 0 (replaces `tailwind-content.test.ts`) |
| DS-02 | Palette: 3:1 on grounds, CIEDE2000 >= 10 under all simulations, adjacent L* steps, accent vs marks >= 10 | unit | `npx vitest run tests/unit/palette-gate.test.ts` | Wave 0 |
| DS-02 | Shape and text label present for every status mark | unit (RTL) + e2e axe | component tests | Wave 0 |
| DS-03 | STFT matches a naive DFT; matrix checksum for one real clip; magma LUT endpoints; colourbar ticks | unit | `npx vitest run tests/unit/stft.test.ts tests/unit/colormap.test.ts` | Wave 0 |
| DS-03 | Well renders (non-blank canvas, expected size at DPR 2) | e2e | fixtures spec | Wave 0 |
| DS-04 | Each RAC primitive keyboard-operable | e2e (Playwright keyboard) + RTL smoke with `user-event` | `npx playwright test tests/e2e/fixtures-keyboard.spec.ts` | Wave 0 |
| DS-04 | axe: no serious or critical violations per section and per direction | e2e | `tests/e2e/fixtures-a11y.spec.ts` | Wave 0 |
| DS-05 | ProbabilityBar shows model values as returned; abstain state shows no numbers | unit | `tests/unit/probability-bar.test.tsx` | Wave 0 |
| DS-05 | Legend counts equal counts computed from `sites.json` (15/6/8/16/9) | unit + e2e | `tests/unit/legend.test.tsx` | Wave 0 |
| DS-05 | Equal-power gains; unequal-length buffers rejected | unit | `tests/unit/crossfade.test.ts` | Wave 0 |
| DS-06 | Reduced motion: zero animations and zero transition durations | e2e with `reducedMotion: 'reduce'` | `tests/e2e/reduced-motion.spec.ts` | Wave 0 |
| DS-08 | Flag-less build excludes fixtures; flagged build serves them | build check + unit | `node ../scripts/check-dev-fixtures-excluded.mjs` after `npm run build` | Wave 0 |
| DS-08 | Screenshots: default direction every section, alternates representative subset | visual (new project) | `PW_VISUAL=1 npx playwright test --project=fixtures-shots` (CI) | Wave 0 |
| all | 44 px targets, 4.5:1 text, focus ring is accent | e2e | `tests/e2e/fixtures-targets.spec.ts` | Wave 0 |

### Visual strategy (do not touch the 33 legacy baselines)
- **File and project:** `tests/e2e/fixtures-shots.spec.ts` in a new Playwright project `fixtures-shots` with its own `snapshotPathTemplate` and directory (`fixtures-shots.spec.ts-snapshots`). The name must **not** contain `visual.spec.ts`: the legacy project uses `testMatch: /visual\.spec\.ts/` and the e2e project `testIgnore: /visual\.spec\.ts|-live\.spec\.ts|gallery-parity\.spec\.ts|review\.spec\.ts/` [VERIFIED: playwright.config.ts]. Add `fixtures-shots\.spec\.ts` to the e2e `testIgnore`.
- **CI:** the `visual` job's update step runs `npx playwright test --project=visual --update-snapshots` and uploads `visual.spec.ts-snapshots`; add a second step and artifact for `fixtures-shots` so a dispatch for fixtures cannot rewrite the legacy directory (and vice versa). The shot spec skips with an annotation while its directory is empty (unlike the legacy spec, which throws in CI), until baselines are committed; then switch to fail-if-missing.
- **Granularity:** element screenshots of `[data-fixture="<section>/<state>"]` (stable, small diffs) rather than full pages. Atlas: every section and state at 1280 px, plus the six responsive-critical sections (sheet, table, command palette, transport compact, CompareRow, hero well) at 390 px. Nocturne and Poster: the same eight representative sections each at 1280 px (hero well, CompareRow, Transport large, ProbabilityBar abstain, StatusBand, DataTable, ProvenanceChip, scatter), so alternates add about 16 shots to roughly 60 for Atlas.
- **Determinism:** `animations: 'disabled'` (already in config) plus `reducedMotion: 'reduce'`; every animated component takes a controlled `time` prop so fixtures freeze the playhead; wait for `document.fonts.ready` and a `data-ready` attribute set after the spectrogram image is drawn; spectrogram data are computed from real WAV files by a pure function (deterministic in the pinned image); the MapLibre fixture is excluded from screenshots (mask) and verified through `getPaintProperty` instead; `blockMapTiles` as in the legacy spec if a raster base is ever used.
- **Axe on fixtures:** one test per direction (`?direction=`) over the whole page, tags `wcag2a, wcag2aa, wcag22aa`; the existing a11y spec compares against stored baselines for legacy states, so keep fixtures in their own file with a zero-serious/critical assertion.

### Sampling Rate
- **Per task commit:** the relevant unit test file plus `npm run lint`.
- **Per wave merge:** `npm test && npm run typecheck && npm run build`, then `npx playwright test --project=e2e` in the Linux container via CI.
- **Phase gate:** full CI green on the `web`, `e2e`, `visual` (33 unchanged), `fixtures-shots`, `python`, `citations` jobs before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/tokens.test.ts`, `palette-gate.test.ts`, `tailwind-v4-sources.test.ts` (and retire `tailwind-content.test.ts`; update `platform-versions.test.ts:53`, `vitality-removed.test.ts:152`)
- [ ] `tests/unit/stft.test.ts`, `colormap.test.ts`, `crossfade.test.ts`, `probability-bar.test.tsx`, `legend.test.tsx`
- [ ] `tests/e2e/token-bridge.spec.ts`, `fixtures-keyboard.spec.ts`, `fixtures-a11y.spec.ts`, `fixtures-targets.spec.ts`, `reduced-motion.spec.ts`, `fixtures-shots.spec.ts` and the new Playwright project
- [ ] `scripts/check-dev-fixtures-excluded.mjs` wired into the CI `web` job; `playwright.config.ts` `webServer.env` flag
- [ ] Framework installs: `culori`, `@testing-library/user-event` (dev)

### Keyboard operability per primitive (Playwright, real browser)
| Primitive | Required keyboard behaviour asserted |
|---|---|
| Dialog / Sheet | Enter on trigger opens; focus moves inside; Tab cycles inside; Escape closes and returns focus to the trigger; background has `inert` or `aria-hidden` |
| Listbox | Arrow keys move; typeahead jumps; Space/Enter select; `aria-selected` updates |
| Table / DataTable | Arrow cell navigation; Enter activates a sortable header; `aria-sort` updates; row selection by Space |
| Slider / range | Arrow +- step, PageUp/Down large step, Home/End bounds; each thumb has a name; `aria-valuetext` is mm:ss or Hz text; thumbs cannot cross |
| Toggle group (BandToggle) | Arrow/Tab per RAC toolbar semantics; Space toggles; `aria-pressed` |
| Tooltip | Appears on focus, dismisses on Escape, no focus trap |
| Command palette | Shortcut opens; typing filters; Arrow moves virtual focus; Enter runs; Escape closes; `renderEmptyState` text shown when no match |
| Transport | Space toggles play; Left/Right seek by a step (window length); Home/End |
| Crossfader | Arrow 5% steps; value text names the recording |

## Security Domain

`security_enforcement` is enabled (ASVS level 1, block on high).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | no auth in this phase |
| V3 Session Management | no | none |
| V4 Access Control | yes (limited) | the dev route is excluded from production by build flag plus `notFound()`; verified by a CI grep and a flag-less build 404 |
| V5 Input Validation | yes | `?direction` and `?only` are parsed against a closed allowlist (`atlas|nocturne|poster`, known section ids); anything else falls back to the default; never interpolated into HTML or CSS |
| V6 Cryptography | no | none |
| V12/V14 Files and configuration | yes | audio and JSON fixtures are first-party static files; no user uploads; `NEXT_PUBLIC_DEV_FIXTURES` must never be set in Vercel (documented, enforced by the flag-less CI build check) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Fixtures route reachable in production | Information disclosure | build-time flag + dynamic import; CI check that the flag-less build contains no fixture marker; `X-Robots-Tag: noindex` |
| Query-param driven styling (`?direction=`) injecting CSS or attributes | Tampering | closed allowlist; value only ever selects among known token blocks |
| `dangerouslySetInnerHTML` for legends or provenance text | XSS | none: all text via React children; DOIs and licence URLs rendered as links only after allowing `https:` schemes; provenance strings come from the verified contract |
| Third-party font/network at runtime | Tampering | `next/font` self-hosts at build; no runtime Google request |
| Clipboard / share of dev URLs | none in scope | n/a |

## Plan Split and Dependency Order

Eleven plans in four waves, sized for sequential execution by one sonnet executor each; every plan leaves CI green. A plan that adds a visual test never lands before its baselines can exist (see Pitfall 7).

**Wave 1: platform (blocks everything)**
- **04-01 Tailwind v4 migration, legacy-neutral.** Run the tool (v3 installed, clean tree), revert `tests/baseline` and `.planning`, apply the five mitigations in `globals.css`, keep glass classes unlayered, update the three tests and `.claude/CLAUDE.md` lines 73 and 141, replace the content test with a compiled-CSS test, run the one-off computed-style fingerprint script and record the result in the SUMMARY, add a hover probe for `SiteCard` and `GlassButton`. Gate: the 33 Linux baselines pass unchanged; no `update_snapshots`. Highest risk, alone.

**Wave 2: tokens and shell (depends on 01)**
- **04-02 Token layer, directions, fonts, bridge, palette gate.** `styles/system/*.css`, `features/ui/tokens` (`readTokens`, `useTokens`), Atlas tokens with the proposed palette, `tokens.test.ts`, `palette-gate.test.ts`, nested `/dev` layout skeleton (fonts, `data-direction`, `ConditionalShell` `/dev` carve-out, scoped base reset), `useReducedMotion` + `data-motion`. No primitives yet.
- **04-03 RAC foundation A.** Install RAC (human-verify checkpoint for the SUS flag), `Button` (compact/large), `ToggleGroup`, `Tooltip`, `Dialog`, `Sheet`, `Listbox`; keyboard unit smoke; tokenised transitions.

**Wave 3: instrument core (depends on 02, 03)**
- **04-04 RAC foundation B.** `Slider` and dual-range `RangeSlider`, `Table`/`DataTable`, `CommandPalette` (Autocomplete + Menu in Modal), plus `EmptyState`/`ErrorState`/`LoadingState` and `ProvenanceChip`/`WhyPanel`.
- **04-05 DSP and Spectrogram well.** `dsp/stft.ts`, `dsp/colormap.ts`, WAV parser, `Spectrogram`, `Waveform`, `ColourBar`, frequency/time axes, playhead node, `SpectrogramSpec` caption, unit tests with a real-clip checksum.
- **04-06 Transport and CompareRow.** `Transport` (compact and 96 px), audio engine, `BandToggle`, `WindowStrip` (null readings), `CompareRow` with shared scale, shared playhead and equal-power crossfader; reduced-motion gating.
- **04-07 Plot and map wiring.** Token Plot theme, `StripPlot` + dumbbell, `SiteScatter` with shapes, ink outlines, selection ring, labels, `StatusBand`, data-driven `Legend`, `ProbabilityBar` with abstain, `features/map/token-style.ts` and the bridge subscription.

**Wave 4: review surface and gates (depends on all)**
- **04-08 Fixtures route.** Flagged dynamic import, `FixturesApp`, sections for every primitive and state, direction switcher, query allowlist, data wiring, `check-dev-fixtures-excluded.mjs` in CI, `NEXT_PUBLIC_DEV_FIXTURES` in `webServer.env`, noindex header.
- **04-09 Alternate directions.** Nocturne and Poster token sets, their font declarations (`preload:false`), per-direction gate runs, per-direction `--dir-mark-*` overrides where contrast demands.
- **04-10 e2e, a11y, motion gates.** `token-bridge`, `fixtures-keyboard`, `fixtures-a11y`, `fixtures-targets`, `reduced-motion` specs.
- **04-11 Fixtures screenshots and owner review.** New `fixtures-shots` project and spec (skips until baselines exist), CI step and artifact, one `update_snapshots` dispatch (human checkpoint; do not push while it runs), commit baselines, tighten to fail-if-missing, owner review of Atlas plus the two alternates.

Parallelism note: 04-04 to 04-07 are independent after 04-03 and could run in parallel worktrees, but the stated execution is sequential; keep each plan's files disjoint (`features/ui`, `features/instrument/dsp`, `features/instrument`, `features/charts` + `features/map`) so order does not matter.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`, 2026-10-03): tailwindcss 4.3.3, @tailwindcss/postcss 4.3.3, @tailwindcss/upgrade 4.3.3, react-aria-components 1.21.1, tailwindcss-react-aria-components 2.2.0, d3-scale-chromatic 3.1.0, culori 4.0.2, fft.js 4.0.4, motion 14.0.0, @testing-library/user-event 14.6.7, next 16.3.8, react 19.3.0
- Scratch executions on a copy of the committed tree (outside the repo): upgrade tool run, v3/v4 builds, computed-style diffs, `next/font` builds, RAC route build and SSR, flag-gated route builds, canvas and WebGL probe in Chromium, SVG `var()` probe, Tailwind compile of `@theme` vs `@theme inline`
- `dashboard-next/package.json`, `playwright.config.ts`, `eslint.config.mjs`, `globals.css`, `layout.tsx`, `ConditionalShell.tsx`, `visual.spec.ts`, `tests/unit/platform-versions.test.ts`, `.github/workflows/ci.yml`, `contracts/bucket/v1/sites.json`, `projection.json`, `tests/fixtures/api/*.json`, `public/audio/ATTRIBUTION.md` (read this session)
- `node_modules/@observablehq/plot/src/marks/dot.js`, `src/symbol.js` (0.6.17)
- google/fonts `METADATA.pb` (OFL, axes) for Newsreader, Hanken Grotesk, Spline Sans Mono, Fraunces, IBM Plex Sans/Mono, Anton, Bricolage Grotesque, Space Grotesk

### Secondary (MEDIUM confidence, official docs fetched)
- tailwindcss.com/docs/upgrade-guide (behavioural changes, browser floor)
- nextjs.org/docs/app/api-reference/components/font (axes, preload scope, `@theme inline`), nextjs.org/docs/app/guides/view-transitions
- react.dev/blog/2026/09/09/react-19-3 (ViewTransition stable)
- react-aria.adobe.com/llms.txt, Modal.md, Autocomplete.md
- culorijs.org/api (Machado 2009 matrices, CIEDE2000, WCAG contrast)
- unpkg d3-scale-chromatic@3.1.0 LICENSE and source; github.com/BIDS/colormap `colormaps.py` header (CC0)

### Tertiary (LOW confidence, marked `[ASSUMED]` in the text)
- Browser behaviour for unused `@font-face`, `OffscreenCanvas` in Safari 16.4, `RouterProvider` pattern, raster cost on real GPUs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, versions registry-checked; RAC bundle cost and SSR measured
- Tailwind migration: HIGH for computed-style equivalence on Windows Chromium, MEDIUM until the Linux baselines confirm
- Architecture (tokens, bridge, route gating): HIGH, each pattern built or compiled in scratch
- Spectrogram renderer choice: MEDIUM (software-GL benchmark only)
- Palette: HIGH for the numbers (culori); owner approval pending for the look
- Alternate directions: MEDIUM (mechanically validated designs, unseen by the owner)
- Pitfalls: HIGH

**Research date:** 2026-10-03
**Valid until:** 2026-10-17 for registry versions (RAC, Tailwind, motion move weekly); the migration findings hold while Next stays at 16.3.8 and Tailwind at 4.3.x
