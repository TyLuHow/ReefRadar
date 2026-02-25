<objective>
Adapt all existing dashboard pages and components to the Golden Hour Underwater palette. Every page must use the warm ochre/rose/gold color scheme with glassmorphism panels on dark charcoal backgrounds. No cyan, teal, neon green, or hot coral should remain anywhere in the rendered UI.

Read `./CLAUDE.md` for project context.
</objective>

<context>
This is prompt 4 of 5 in the Living Spectrogram Overhaul. Previous prompts established:
- 036: Golden Hour design system (globals.css, tailwind.config, glass components)
- 037: SpectrogramCanvas component
- 038: New landing page and Experience page

The dashboard is at `./dashboard-next/`. Glass components are at `src/components/ui/glass/`.

Pages to adapt:
- `/dashboard` — Dashboard home (`src/app/dashboard/page.tsx`)
- `/dashboard/analyze` — Upload & analysis flow (`src/app/dashboard/analyze/page.tsx`)
- `/dashboard/compare` — Audio A/B comparison (`src/app/dashboard/compare/page.tsx`)
- `/dashboard/map` — deck.gl reference map (`src/app/dashboard/map/page.tsx`)
- `/sites` — Reference sites listing (`src/app/sites/page.tsx`)
- `/about` — Methodology page (`src/app/about/page.tsx`)

Components to adapt:
- `src/components/audio/AudioCompare.tsx`
- `src/components/audio/ABCrossfader.tsx` (if exists)
- `src/components/audio/SpectrogramCanvas.tsx` (the OLD one — for the compare page)
- `src/components/map/ReefMap.tsx`
- `src/components/map/MapControls.tsx`
- `src/components/map/HealthLegend.tsx`
- `src/components/map/SitePopup.tsx` (if exists)
- `src/components/dashboard/CaveatsBanner.tsx`
- `src/components/dashboard/RegionWarning.tsx`
- `src/components/Navbar.tsx`
- `src/components/layout/Footer.tsx`
</context>

<requirements>

## 1. Dashboard Layout (`src/app/dashboard/layout.tsx`)

- Background: `bg-abyss` (or `bg-depths` for contrast)
- If there's a sidebar, style with glass-bg, ochre active indicators
- Text: bone primary, warm-gray secondary

## 2. Dashboard Home (`src/app/dashboard/page.tsx`)

- Background: `bg-abyss`
- Stat cards: Use GlassCard or glass-panel class
  - Accent borders: left border in ochre, dusty-rose, or pale-gold depending on stat type
  - Numbers: bone color, mono font
  - Labels: text-secondary (warm gray)
- Quick action buttons: glass-button style (pill shape)
- Any links: ochre color on hover

## 3. Dashboard Analyze (`src/app/dashboard/analyze/page.tsx`)

- Background: `bg-abyss`
- Upload area: Glass panel with dashed border in glass-border color
- Progress indicators: ochre-colored
- Results panel: GlassCard
- Health classification colors:
  - healthy → ochre (#cd853f)
  - degraded → muted gray (#6b6560)
  - restored_early → muted tan (#8b7355)
  - restored_mid → dusty rose (#c08081)
- RegionWarning: warm amber border (already should be correct from globals)
- CaveatsBanner: Should use new palette

## 4. Audio Compare (`src/app/dashboard/compare/page.tsx` + `AudioCompare.tsx`)

- Page background: `bg-abyss`
- Audio cards: Glass panels
- Spectrogram visualization: If using the old SpectrogramCanvas, update its color palette:
  - Replace any ocean/thermal/grayscale palettes with Golden Hour gradient
  - Or: ochre → dusty-rose → pale-gold gradient for frequency intensity
- Crossfader (`ABCrossfader.tsx`):
  - Track: gradient from ochre (#cd853f) to muted gray (#6b6560)
  - Thumb: glass pill style
  - Labels: "Healthy" (ochre), "Degraded" (muted gray)
- Play button: glass-button with ochre accent
- "Demo audio" banner: glass panel with text-secondary text, MARRS attribution
- Replace any cyan/green/coral direct color references

## 5. deck.gl Map (`src/app/dashboard/map/page.tsx` + `ReefMap.tsx`)

**Page:**
- Background: `bg-abyss`
- Controls overlay: glass panels
- Legend overlay: glass panel

**ReefMap.tsx — Marker Colors:**
```typescript
const STATUS_COLORS: Record<string, [number, number, number]> = {
  healthy: [205, 133, 63],        // Ochre
  degraded: [107, 101, 96],       // Muted gray
  restored_early: [139, 115, 85], // Muted tan
  restored_mid: [192, 128, 129],  // Dusty rose
};
```

Replace the old colors:
- healthy was [0, 255, 163] → now [205, 133, 63]
- degraded was [255, 107, 107] → now [107, 101, 96]
- restored_early was [255, 215, 0] → now [139, 115, 85]
- restored_mid was [0, 229, 255] → now [192, 128, 129]

**Glow effect layer:** Update the glow radius colors to match new palette at 40% opacity.

**MapControls.tsx:**
- Glass panel background
- Checkbox labels: bone text
- Filter buttons: glass-button style
- Active filters: ochre text or ochre border indicator

**HealthLegend.tsx:**
- Glass panel background
- Colored dots matching new STATUS_COLORS
- Labels: bone text

**SitePopup (if exists):**
- Glass panel with backdrop blur
- Title: bone text
- Status: colored with new status colors
- Links: ochre hover

## 6. Reference Sites (`src/app/sites/page.tsx`)

- Background: `bg-abyss`
- Site cards: Glass panels
- Status badges:
  - healthy: `bg-ochre/20 text-ochre border-ochre/30`
  - degraded: `bg-warm-gray/20 text-warm-gray`
  - restored_early: `bg-muted-tan/20 text-muted-tan`
  - restored_mid: `bg-dusty-rose/20 text-dusty-rose`
- Country headers: bone text, heading style
- Filter/sort controls: glass-button pills
- Grid/list: glass cards with glass-border dividers

## 7. About / Methodology (`src/app/about/page.tsx`)

- Background: `bg-abyss`
- Section headings: bone, font-light (heading class)
- Body text: text-secondary (warm gray)
- Stats/numbers: mono class, ochre accent
- Links: ochre color, no underline, hover → slightly brighter
- Code blocks / technical details: bg-depths with bone text
- Section dividers: border using glass-border color
- Cards/callouts: Glass panels

## 8. Navbar (`src/components/Navbar.tsx`)

- Background: `bg-depths` or transparent with backdrop blur
- Logo/brand: bone text
- Nav links: text-secondary, hover → bone
- Active link: bone with ochre underline or left indicator
- Mobile hamburger: bone color
- Mobile drawer: glass panel from right, bg-depths backdrop
- Z-index: 40 (above page content)

## 9. Footer (`src/components/layout/Footer.tsx`)

- Background: `bg-depths`
- Text: text-muted
- Links: text-secondary, hover → bone
- Divider: glass-border color

## 10. CaveatsBanner (`src/components/dashboard/CaveatsBanner.tsx`)

- Glass panel background
- Border: warm-amber (--accent-warning)
- Icon: warm-amber color (not red, not cyan)
- Text: text-secondary
- Toggle button: glass-button style
- Expanded content: text-muted for detail text

## 11. RegionWarning (`src/components/dashboard/RegionWarning.tsx`)

- Glass panel background
- Border: warm-amber
- Icon (AlertTriangle): warm-amber color
- "40% confidence reduction" text: warm-amber
- Region name: bone text
- Still returns null when `in_training_distribution` is true

</requirements>

<constraints>
- Do NOT change any business logic, API calls, data handling, or component structure
- Only modify visual styling: colors, backgrounds, borders, text colors, component wrappers
- Do NOT delete any components or create new page routes
- Preserve all existing functionality (filters, toggles, links, modals)
- Every hex color in the codebase should be from the Golden Hour palette or a standard neutral
- The build must pass with zero errors after all changes
- Do NOT modify the new SpectrogramCanvas from prompt 037 or the Experience page from prompt 038
</constraints>

<verification>
After completing ALL adaptations:

1. Run `cd dashboard-next && npm run build` — must pass with zero errors

2. Comprehensive forbidden color search:
   ```bash
   grep -rn '#00FFFF\|#00E5FF\|#00FFA3\|#FF6B6B\|#FF00FF\|#00ffa3\|#00e5ff\|#ff6b6b' dashboard-next/src/
   grep -rn 'cyan-\|teal-\|emerald-\|green-400\|green-500' dashboard-next/src/ --include='*.tsx' --include='*.ts'
   grep -rn 'glow-cyan\|glow-green\|glow-coral' dashboard-next/src/
   ```
   All should return zero results (except possibly in comments or the old landing components that are no longer imported).

3. Verify each adapted page:
   - Check that page background is bg-abyss or bg-depths
   - Check that text uses bone/warm-gray/text-muted (not white, not blue-tinted)
   - Check that interactive elements use glass styles

4. Specifically verify map colors:
   ```bash
   grep -n '0, 255, 163\|255, 107, 107\|255, 215, 0\|0, 229, 255' dashboard-next/src/components/map/ReefMap.tsx
   ```
   Should return zero results.
</verification>

<success_criteria>
- All 6 dashboard pages use Golden Hour palette
- Navbar and Footer adapted to dark warm theme
- Map markers use ochre/gray/tan/rose instead of neon green/red/gold/cyan
- Audio compare uses glass panels with ochre/rose/gold accents
- CaveatsBanner and RegionWarning use warm amber styling
- Zero forbidden colors in grep search
- Build passes with zero errors
- All existing functionality preserved (no broken links, filters, or modals)
</success_criteria>
