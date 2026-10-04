# Phase 4: Design System & Instrument Primitives - Pattern Map

**Mapped:** 2026-10-03
**Files analyzed:** 40+ new/modified (primitives, token system, dev fixtures, tests)
**Analogs found:** 35 / 40 (strong feature-module and test patterns; token system and RAC wrappers use RESEARCH.md recipes)

All paths relative to `C:/Users/TylerLubyHoward/reefradar/dashboard-next/` unless prefixed with `../` (repo root).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/styles/tokens.css` (new) | config | n/a | `src/app/globals.css` (CSS variables pattern) | role-match |
| `src/styles/legacy.css` (new) | config | n/a | `src/app/globals.css` (legacy token preservation) | exact |
| `src/styles/system/tokens.css`, `theme.css`, `base.css` (new) | config | n/a | RESEARCH.md "Pattern 2: Token source and direction mechanism" | recipe |
| `src/app/globals.css` (modify: Tailwind v4 migration) | config | n/a | itself (upgrade in-place per RESEARCH migration pattern) | exact |
| `tailwind.config.js` (delete), `postcss.config.js` (update) | config | n/a | RESEARCH.md "Tailwind v4 migration" | recipe |
| `src/app/dev/layout.tsx` (new) | layout | request-response | `src/app/layout.tsx` (fonts, providers, metadata) + `src/app/experience/layout.tsx` (nested structure) | role-match |
| `src/app/dev/fixtures/page.tsx` (new) | page | request-response | `src/app/page.tsx` (page component structure) | role-match |
| `src/features/ui/index.ts` (new) | barrel | n/a | `src/features/contract/index.ts` (barrel export pattern) | exact |
| `src/features/ui/{Button,Dialog,Sheet,Listbox,Table,Slider,ToggleGroup,Tooltip,CommandPalette}.tsx` (new) | component | request-response | RESEARCH.md "Pattern 5: React Aria Components" + `src/features/contract/` module structure | recipe |
| `src/features/ui/{StatusMark,Skeleton,Empty,Error,Loading}.tsx` (new) | component | request-response | `src/components/` legacy state patterns (Error from `error.tsx` handling) | partial-match |
| `src/features/instrument/index.ts` (new) | barrel | n/a | `src/features/contract/index.ts` + `src/features/map/index.ts` | exact |
| `src/features/instrument/{Transport,Spectrogram,WindowStrip,BandToggle,CompareRow,ProvenanceChip,WhyPanel,StripPlot,ProbabilityBar,DataTable,Legend,StatusBand}.tsx` (new) | component | request-response/render | `src/features/charts/PlotFigure.tsx` (ResizeObserver, ref-based rendering); RESEARCH.md primitives inventory | recipe |
| `src/features/instrument/dsp/{stft.ts,colormap.ts}` (new) | utility | transform | RESEARCH.md "Pattern 6: Spectrogram rendering" (pure functions, no DOM) | recipe |
| `src/features/instrument/hooks.ts`, `useTransport.ts`, etc. (new) | hook | request-response | `src/features/contract/hooks.ts` (TanStack query patterns, custom hooks) | role-match |
| `src/app/layout.tsx` (modify: fonts, theme, providers) | layout | n/a | itself + RESEARCH.md "Pattern 4: Fonts per direction" | exact |
| `src/app/providers.tsx` (modify: add fonts, direction wrapper) | provider | n/a | itself (add `data-direction` wrapper, keep Providers structure) | exact |
| `package.json` (new deps: tailwindcss v4, react-aria-components, d3-scale-chromatic, fft.js) | config | n/a | itself (add to dependencies per RESEARCH.md versions) | exact |
| `tsconfig.json` (modify: source paths, strict mode for v4) | config | n/a | itself | exact |
| `next.config.js` (update: no changes required by v4, keep as-is) | config | n/a | itself | exact |
| `eslint.config.mjs` (modify: add UI/instrument fence if needed) | config | n/a | itself (already flat config per Phase 3) | exact |
| `.github/workflows/ci.yml` (add: token gates, fixtures test job) | config | CI | itself (add new jobs for token and fixture verification) | exact |
| `tests/unit/{tokens-contrast,status-palette,semantic-tokens}.test.ts` (new) | test | batch | `tests/unit/contract-fence.test.ts` (fs walk, CSS parsing, culori math) | role-match |
| `tests/unit/{ui-,instrument-}*.test.tsx` (new) | test | request-response | `tests/unit/api-poll.test.ts` (vi.fn, mocks, describe/it) + `tests/unit/feature-fence.test.ts` (RAC components testing) | role-match |
| `tests/e2e/fixtures.spec.ts` (new) | test | e2e | `tests/e2e/visual.spec.ts` (STATES, mockApi, blockMapTiles, snapshots) | exact |
| `tests/e2e/fixtures-alternate-directions.spec.ts` (new) | test | e2e | `tests/e2e/visual.spec.ts` (narrower baseline set for alternates) | role-match |

## Pattern Assignments

### Token System Files (`src/styles/tokens.css`, `legacy.css`, `system/*.css`)

**Analogs:** 
- Current CSS variables in `src/app/globals.css` (lines 6-40)
- Tailwind config color tokens in `tailwind.config.js` (lines 11-30)
- RESEARCH.md "Pattern 2: Token source and direction mechanism"

**Current CSS variables pattern** (lines 6-40 of globals.css):
```css
:root {
  --bg-abyss: #1a1714;
  --glass-bg: rgba(255, 255, 255, 0.05);
  --text-primary: #e5e1db;
  --status-healthy: #cd853f;
}
body { color: var(--text-primary); background: var(--bg-abyss); }
```

**New three-file structure (RESEARCH verified):**
- `tokens.css`: Per-direction blocks with `[data-direction="atlas|nocturne|poster"] { --dir-surface, --dir-ink, ... }`
- `theme.css`: Tailwind `@theme inline` aliases and fluid display scales (clamp values)
- `base.css`: Scoped resets inside `[data-direction]` to prevent legacy leakage (transition rule, focus, scrollbar)

**Entry point:** `globals.css` imports Tailwind, then system files: `@import './styles/legacy.css'; @import './styles/system/tokens.css';` etc. Single PostCSS pass ensures no duplicate preflight.

**Token names (semantic, never raw hex):**
- Colours: `surface`, `panel`, `panel-hover`, `ink`, `muted`, `rule`, `accent`, `focus`, `control`, `on-control`, `well`, `band`, `accent-block`, `scrim`, `mark-outline`, `hab-degraded/restored-early/restored-mid/healthy/unknown`
- Fonts: `display`, `body`, `data`, `numeral` (declared as `@theme inline` over `next/font` variables)
- Space: `--space-block`, `--gutter`
- Motion: `--duration-fast/base/morph/view`, `--ease`

**Gate test** (unit): parse CSS, assert key completeness per direction, hex-only for JS-visible tokens, WCAG 3:1 marks / 4.5:1 text contrast via `culori` package (already in dev dependencies).

---

### Nested Dev Layout (`src/app/dev/layout.tsx`)

**Analogs:** `src/app/layout.tsx` (root layout with fonts) + `src/app/experience/layout.tsx` (nested simple layout)

**Root layout pattern** (src/app/layout.tsx, lines 9-17):
```tsx
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' });

export const metadata: Metadata = { title: '...', description: '...' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

**New dev layout structure (RESEARCH Pattern 4):**
- Import Newsreader (italic, `axes: ['opsz']`), Hanken Grotesk, Spline Sans Mono via `next/font/google`
- Alternates (Fraunces, IBM Plex, Bricolage) imported with `preload: false` only
- `data-direction="atlas"` attribute on a wrapper div (or root of the surface section)
- `<RAC RouterProvider>` wraps the fixture app
- `noindex` in metadata (dev only)
- Font variables set on the wrapper, not `html` (so legacy routes load no new fonts)

**Key difference from root:** nested layout does not use `html`/`body`, only wraps children. Example:
```tsx
import { Newsreader, Hanken_Grotesk, Spline_Sans_Mono } from 'next/font/google';

const newsreader = Newsreader({ italic: true, axes: ['opsz'], variable: '--font-display', preload: true });
const hanken = Hanken_Grotesk({ variable: '--font-body', preload: true });
const spline = Spline_Sans_Mono({ variable: '--font-data', preload: true });

export const metadata = { robots: 'noindex' };

export default function DevLayout({ children }) {
  return (
    <div data-surface="instrument" data-direction="atlas" className={`${newsreader.variable} ${hanken.variable} ${spline.variable} bg-ground text-ink`}>
      <RAC RouterProvider>{children}</RAC>
    </div>
  );
}
```

---

### Dev Fixtures Page (`src/app/dev/fixtures/page.tsx`)

**Analog:** `src/app/page.tsx` + RESEARCH.md "Flag gating" pattern

**Build-time flag gating (RESEARCH verified as keeping fixture code out of production):**
```tsx
'use client';

const NEXT_PUBLIC_DEV_FIXTURES = process.env.NEXT_PUBLIC_DEV_FIXTURES === '1';

async function FixturesApp() {
  if (!NEXT_PUBLIC_DEV_FIXTURES) {
    return notFound();  // redundant, but belt-and-suspenders
  }
  const { FixturesApp: App } = await import('@/features/fixtures');  // dynamic
  return <App />;
}

export default FixturesApp;
```

The `features/fixtures` module is a separate React component tree (not in the main tree, so the code is truly dead-eliminated in production builds). If/when the flag is set, the Playwright CI job uses `webServer.env: { NEXT_PUBLIC_DEV_FIXTURES: '1' }` to enable it.

---

### Feature Module: RAC Primitives (`src/features/ui/`)

**Analogs:** `src/features/contract/index.ts` (barrel), `src/features/map/` (module structure)

**Barrel export pattern** (src/features/contract/index.ts, lines 1-27):
```tsx
/**
 * The UI primitives module's one public surface. Application code imports
 * from '@/features/ui' only; Button.tsx, Dialog.tsx etc. are internal.
 */
export { Button, LinkButton } from './Button';
export type { ButtonProps } from './Button';
export { Dialog, AlertDialog } from './Dialog';
// ... etc for all primitives
```

**Component file structure (RAC Button example):**
```tsx
'use client';

import { Button as RACButton } from 'react-aria-components';
import type { ComponentProps } from 'react';

export interface ButtonProps extends ComponentProps<typeof RACButton> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'inverse';
  size?: 'compact' | 'large';
}

export function Button({ variant = 'primary', size = 'compact', ...props }: ButtonProps) {
  const classes = cn(
    'min-h-11 min-w-11 px-5 rounded-0 font-body text-base font-600',  // base
    variant === 'primary' && 'bg-control text-on-control',             // variant
    size === 'large' && 'px-6 min-h-14'                               // size
  );
  return <RACButton {...props} className={cn(classes, props.className)} />;
}
```

**RAC integration notes** (RESEARCH Pattern 5, line 348):
- Bundle cost ~71 KB gzip for the full kit; import named exports only
- SSR renders static roles (`role="grid"`, `aria-label` etc); no `SSRProvider` needed on React 19
- Data attributes for styling: `data-hovered`, `data-focus-visible`, `data-pressed`, `data-selected`, `data-disabled` (Tailwind v4 `data-selected:bg-control` syntax)
- State selectors in fixtures route: `data-force-hover`, `data-force-focus`, `data-force-pressed` for static screenshots

---

### Feature Module: Instrument Primitives (`src/features/instrument/`)

**Analogs:** `src/features/charts/PlotFigure.tsx` (ResizeObserver, ref-based DOM insertion), RESEARCH.md primitives inventory

**PlotFigure ResizeObserver pattern** (src/features/charts/PlotFigure.tsx, lines 43-52):
```tsx
const hostRef = useRef<HTMLDivElement>(null);
const [width, setWidth] = useState(DEFAULT_WIDTH);

useEffect(() => {
  const host = hostRef.current;
  if (!host || typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver((entries) => {
    const measured = Math.floor(entries[0]?.contentRect.width ?? 0);
    if (measured > 0) setWidth(measured);
  });
  observer.observe(host);
  return () => observer.disconnect();
}, [hasData]);
```

**Spectrogram canvas pattern (RESEARCH Pattern 6, lines 368-387):**
- Off-screen RGBA image from STFT + magma LUT (precomputed, deterministic)
- Canvas `drawImage` per resize only (no per-frame repaint)
- Playhead is a DOM element with `transform: translateX(...)` (compositor)
- `aria-label` on canvas, hidden data table with spectrum values
- Under reduced motion: playhead jumps once per second (no animation)

**Transport component (RESEARCH Pattern 7, lines 388-395):**
- Three sizes: `compact` (44 px button), `medium` (64 px), `large` (96 px)
- Play button icon 34% of button size
- Scrub slider with RangeSlider + label "Playback position"
- Time readout "00:12.4 / 00:30.0" with denominator in `muted` colour
- Keyboard: Space play/pause, arrows seek, Home/End skip

**A/B CompareRow (RESEARCH Pattern 7, lines 388-395):**
- Two wells on one `SpectrogramSpec` (shared range, shared time axis)
- Crossfader: one Slider, equal-power gains `gainA = cos(x * PI/2)`, `gainB = sin(x * PI/2)`
- Shared playhead clock from `AudioContext.currentTime`

**DSP module** (pure, no DOM — movable to Worker in Phase 8):
- `stft(samples: Float32Array, {fftSize, hop, window}): Float32Array` using `fft.js` FFT
- Hann window, magnitude to dB (20 log10), quantised to `Uint8Array` over fixed display range
- `colormap.ts`: sample `interpolateMagma` 256 times into a LUT, deterministic

**Props pattern (co-located interface):**
```tsx
export interface SpectrogramProps {
  matrix: Uint8Array;   // quantised dB matrix from stft
  spec: SpectrogramSpec;
  variant: 'panel' | 'hero' | 'compare' | 'thumb';
}

export function Spectrogram({ matrix, spec, variant }: SpectrogramProps) { ... }
```

---

### Tailwind v4 Migration (`src/app/globals.css`, `tailwind.config.js` deletion, `postcss.config.js`)

**Analog:** RESEARCH.md "Pattern 1: Tailwind v4 migration, legacy-neutral" (tested in scratch, baselines verified)

**Migration steps (RESEARCH verified, lines 239-273):**

1. **Run tool while v3 is installed:**
   ```bash
   npx @tailwindcss/upgrade  # tool must see v3 first, else skips config migration
   git checkout -- tests/baseline .planning  # revert JSON/Markdown rewrites
   ```

2. **Mitigations (after tool, before test):**
   - Border colour literal: `#e5e7eb` on ~6,000 elements (from the tool's `var(--color-gray-200)`)
   - Cursor rule in `@layer base`: `button:not(:disabled), [role='button']:not(:disabled) { cursor: pointer; }`
   - Line-heights fixed rem (v3 style): `--text-xs--line-height: 1rem;` etc. in legacy `@theme` block
   - Global rules in `@layer base`: `body`, scrollbar, `*` transition, `.animate-spin/pulse` reset, `:focus-visible`
   - sRGB gradient: `bg-linear-to-br/srgb` (Tailwind v4 `.../srgb` suffix works, verified in scratch)

3. **Do NOT do:**
   - Move `.glass-panel`, `.glass-button` into `@layer components` (every element breaks)
   - Keep them unlayered; they beat utilities at equal specificity just as under v3

4. **Tests:**
   - `tests/unit/tailwind-content.test.ts` (regex over v3 config) → replaced with v4 source detection
   - `tests/unit/platform-versions.test.ts:53` asserts `tailwindcss: 4.x`
   - `tests/unit/vitality-removed.test.ts:152` no longer reads `tailwind.config.js` (deleted)
   - Baselines pass **unchanged** (`maxDiffPixelRatio: 0.01`)

**Config structure after migration:**
- `postcss.config.js`: `{ '@tailwindcss/postcss': {} }` (autoprefixer removed by tool)
- No `tailwind.config.js` (deleted by tool; legacy `@theme` block moved into `globals.css`)
- `globals.css` single entry: `@import 'tailwindcss'` then system files

---

### Token Bridge to MapLibre and Plot

**Analog:** RESEARCH.md "Pattern 3: Token bridge", existing `src/features/map/style.ts` + `layers.ts`

**Constraint** (RESEARCH verified, lines 315-322): `getComputedStyle(el).getPropertyValue('--x')` returns **authored text**. An `oklch()` token comes back as-is. Rule: **JS-visible tokens must be sRGB hex literals** (marks, surface, ink, rule, accent, well, accent-ink).

**Bridge utility pattern:**
```ts
// src/features/ui/tokens.ts
export interface Tokens {
  surface: string;     // hex: '#FFFFFF'
  panel: string;       // hex: '#F1F2F6'
  ink: string;         // hex: '#0D0F14'
  markDegraded: string; // hex: '#914615'
  // ... etc
}

export function readTokens(root: Element): Tokens {
  const style = getComputedStyle(root);
  const surface = style.getPropertyValue('--color-surface').trim();
  if (!surface.match(/^#[0-9a-f]{6}$/i)) throw new Error(`Non-hex token: surface=${surface}`);
  return { surface, ... };
}

export function useTokens(rootRef: RefObject<Element>) {
  const [version, setVersion] = useState(0);
  const [tokens, setTokens] = useState<Tokens>(readTokens(...));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new MutationObserver(() => {
      setTokens(readTokens(root));
      setVersion(v => v + 1);
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-direction', 'style'] });
    return () => observer.disconnect();
  }, []);

  return { tokens, version };
}
```

**Plot usage** (SVG marks take `var(--color-mark-degraded)` directly; continuous scales need hex):
```ts
// Categorical mark: SVG fill attribute, follows live token change
{ ...Plot.dot({ fill: 'var(--color-mark-degraded)' }) }

// Continuous scale: needs resolved hex (from useTokens hook)
Plot.scale({ color: Plot.scales.linear({ range: [tokens.markDegraded, tokens.markHealthy] }) })
```

**MapLibre usage** (read tokens on mount, apply to paint properties):
```ts
const tokens = readTokens(root);
map.setPaintProperty('sites-layer', 'circle-color', statusColorExpression(tokens));
// statusColorExpression returns:
// ['match', ['get','status'], 'degraded', tokens.markDegraded, ..., tokens.markUnknown]
```

---

### Test Patterns

**Unit tests (Vitest)** — Analog: `tests/unit/api-poll.test.ts`

**Header + setup** (lines 1-48):
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('MyComponent', () => {
  let mock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mock = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does something', () => {
    expect(result).toBe(expected);
  });
});
```

**Token contrast gate test** (new, using `culori` package):
```ts
// @vitest-environment node
import postcss from 'postcss';
import * as fs from 'node:fs';
import { wcagContrast, filterDeficiencyProt } from 'culori';

const tokenCss = fs.readFileSync('src/styles/tokens.css', 'utf8');
const root = postcss.parse(tokenCss);

// Parse [data-direction] blocks, extract --color-* values, compute WCAG 3:1 on ground / panel
// Assert all pairs pass
```

**E2E tests (Playwright)** — Analog: `tests/e2e/visual.spec.ts`

**Snapshot structure** (lines 49-60):
```ts
import { test, expect } from '@playwright/test';
import { mockApi, expectNoUnhandledApiCalls } from './support/mock-api';
import { STATES, WIDTHS } from './support/states';

test.afterEach(({ page }) => {
  expectNoUnhandledApiCalls(page);
});

for (const state of STATES) {
  for (const w of WIDTHS) {
    test(`${state.name} @ ${w.label}`, async ({ page }) => {
      await mockApi(page);
      await page.goto(state.path);
      await page.setViewportSize({ width: w.width, height: w.height });
      await expect(page).toHaveScreenshot(`${state.name}-${w.label}.png`, {
        maxDiffPixelRatio: 0.01,
      });
    });
  }
}
```

**Fixture-specific test** (`tests/e2e/fixtures.spec.ts`, new):
- Adds `/dev/fixtures` states to STATES (or a separate list)
- Baseline set: Atlas in every section/state/width; alternates (Nocturne, Poster) in representative sections only
- Direction switcher test: assert `data-direction` attribute change updates all three renders (swatches, Plot mark, MapLibre paint)
- Reduced-motion test: `reducedMotion: 'reduce'` playwright context, assert no animations, no frame callbacks

---

### Modified Files (`src/app/layout.tsx`, `src/app/providers.tsx`)

**App layout modification** (src/app/layout.tsx):
- Root fonts (Inter, JetBrains_Mono) stay for legacy routes
- New fonts (Newsreader, Hanken Grotesk, Spline Sans Mono) loaded only in the `/dev` nested layout, not here
- Add `SpeedInsights` if not already present (Phase 3 change)
- `data-scroll-behavior` attribute (from Phase 3) stays

**Providers modification** (src/app/providers.tsx):
- Keep `QueryClient` defaults unchanged (tested by `query-defaults.test.ts`)
- Add `data-direction="atlas"` wrapper for new surfaces (or set on specific page layouts)
- Keep `ContractVersionSync` leaf pattern

---

## Shared Patterns

### Feature Module Barrel
**Source:** `src/features/contract/index.ts`, `src/features/map/index.ts`
**Pattern:** Doc comment, named exports, no deep imports. Apply to `features/ui`, `features/instrument`, `features/fixtures`.

### Semantic Token Names
**Source:** 04-UI-SPEC.md "Token Architecture"
**Pattern:** `surface`, `panel`, `ink`, `accent`, `mark-degraded` (never `#B4520F` raw hex in component code). CSS `var()` only. One source: `tokens.css`.

### Observable Plot with ResizeObserver and Refs
**Source:** `src/features/charts/PlotFigure.tsx` (lines 39-62)
**Pattern:** ref host, ResizeObserver for width, useEffect to append node, cleanup on unmount. Apply to Spectrogram canvas, StripPlot, Legend.

### Reduced Motion Respect
**Source:** RESEARCH.md "Motion and reduced motion" (lines 350-357), CLAUDE.md error-handling
**Pattern:** `@media (prefers-reduced-motion: reduce) { --duration-*: 0ms; }`, `[data-reduced-motion="true"]` in fixtures for testing. All loops pause, animations disabled, playhead jumps.

### RAC Component Styling
**Source:** RESEARCH.md "Pattern 5: React Aria Components" (lines 346-365)
**Pattern:** Data attributes `data-hovered`, `data-selected`, `data-focus-visible`; Tailwind v4 `data-selected:bg-control`; touch targets `min-h-11` (44 px). Props interface co-located above component.

### Axe + Playwright Visual
**Source:** `tests/e2e/visual.spec.ts`, existing axe runs
**Pattern:** Legacy baseline set 33 × (11 states × 3 widths). New fixtures baseline: Atlas all states/widths + alternates representative set. `maxDiffPixelRatio: 0.01` tolerance.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/styles/system/{tokens,theme,base}.css` | config | n/a | New token system; use RESEARCH.md Patterns 2–3 recipes and 04-UI-SPEC.md token table |
| `src/features/ui/` (all RAC wrappers) | component | request-response | No RAC precedent in repo; use RESEARCH.md Pattern 5 and RAC docs |
| `src/features/instrument/` (all primitives) | component | request-response/render | No instrument primitives exist; use RESEARCH.md inventory and 04-UI-SPEC.md specs |
| `src/features/instrument/dsp/` | utility | transform | No DSP module exists; use RESEARCH.md Pattern 6 STFT/colormap specs |
| Token bridge utilities (`readTokens`, `useTokens`) | utility/hook | request-response | New pattern; use RESEARCH.md Pattern 3 implementation |
| `src/app/dev/layout.tsx` | layout | n/a | Dev surface layout is new; use root layout fonts + RESEARCH.md Pattern 4 direction wrapper |
| `/dev/fixtures` route and FixturesApp | page/app | request-response | New; use RESEARCH.md flag gating and 04-CONTEXT.md fixture scope |

---

## Metadata

**Analog search scope:** `dashboard-next/src/{app,features,styles,lib,types}`, `tests/{unit,e2e}`, `tailwind.config.js`, `tsconfig.json`, `next.config.js`, `.github/workflows/ci.yml`, `package.json`
**Files read:** 04-CONTEXT.md (full), 04-RESEARCH.md (full), 04-UI-SPEC.md (sections 1–466, token/primitive specs), 03-PATTERNS.md (format), contract/index.ts, map/index.ts, app/layout.tsx, globals.css, tailwind.config.js, PlotFigure.tsx, experience/layout.tsx, eslint.config.mjs (header), tests/unit/api-poll.test.ts, tests/e2e/visual.spec.ts, tests/e2e/support/states.ts, features/contract/hooks.ts
**Pattern extraction date:** 2026-10-03
**Browser floor:** Safari 16.4+ (Tailwind v4 baseline), modern Web Audio API (AudioContext.currentTime, decodeAudioData)
