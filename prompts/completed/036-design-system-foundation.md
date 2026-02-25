<objective>
Replace ReefRadar's entire visual design system with the "Golden Hour Underwater" palette. This is the foundation for a complete visual overhaul — every subsequent prompt depends on these changes being correct.

The current palette uses electric cyan (#00e5ff), neon green (#00ffa3), hot coral (#ff6b6b), and pure black backgrounds. Replace ALL of these with a warm, organic palette: ochre, dusty rose, pale gold on deep warm charcoal. The emotional target is "submerged underwater at dusk."

Read `./CLAUDE.md` for project context.
</objective>

<context>
The Next.js 14 dashboard is at `./dashboard-next/`. The current design system lives in:
- `./dashboard-next/src/app/globals.css` — CSS custom properties (ocean depth palette, bioluminescent accents, health colors)
- `./dashboard-next/tailwind.config.js` — Extended colors referencing CSS vars
- `./dashboard-next/src/app/layout.tsx` — Root layout with Inter font
- `./dashboard-next/package.json` — Dependencies (already has framer-motion, Inter via next/font)

The app has ~20 components across landing, dashboard, map, audio, and UI directories. This prompt ONLY changes the design system foundation — individual component adaptations happen in later prompts.
</context>

<requirements>

## 1. Replace globals.css Color System

Replace the ENTIRE `:root` block in `globals.css` with this exact palette:

```css
:root {
  /* Backgrounds */
  --bg-abyss: #1a1714;
  --bg-depths: #0f0d0b;
  --bg-surface: #252220;

  /* Glassmorphism */
  --glass-bg: rgba(255, 255, 255, 0.05);
  --glass-bg-hover: rgba(255, 255, 255, 0.08);
  --glass-bg-active: rgba(255, 255, 255, 0.12);
  --glass-border: rgba(229, 225, 219, 0.1);
  --glass-border-bright: rgba(229, 225, 219, 0.2);

  /* Text */
  --text-primary: #e5e1db;
  --text-secondary: #a8a29e;
  --text-muted: #6b6560;
  --text-dim: #4a4542;

  /* Frequency Bands */
  --freq-low: #cd853f;
  --freq-mid: #c08081;
  --freq-high: #e9dcc9;

  /* Health Status */
  --status-healthy: #cd853f;
  --status-degraded: #6b6560;
  --status-restoring-early: #8b7355;
  --status-restoring-mid: #c08081;

  /* Accents */
  --accent-glow: rgba(205, 133, 63, 0.4);
  --accent-warning: #b8860b;
  --accent-info: #a8a29e;
}
```

Remove ALL old variables: `--abyss`, `--deep`, `--mid`, `--surface`, `--glow-cyan`, `--glow-green`, `--glow-coral`, `--glow-gold`, `--healthy`, `--degraded`, `--restored-early`, `--restored-mid`, `--text-primary` (old), `--text-muted` (old), `--text-dim` (old), `--spec-*`, `--in-distribution`, `--out-of-distribution`, `--foreground-rgb`, `--background-start-rgb`, `--background-end-rgb`.

Update the `body` styles to use `--bg-abyss` as background and `--text-primary` as text color.

Add these utility classes to globals.css:

```css
/* Glass components */
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
}

.glass-button {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: 9999px;
  transition: all 0.2s ease;
}

.glass-button:hover {
  background: var(--glass-bg-hover);
  border-color: var(--glass-border-bright);
}

/* Typography */
.heading {
  font-weight: 300;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.hero-text {
  font-size: clamp(2.5rem, 8vw, 5rem);
  font-weight: 200;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.mono {
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

/* Custom spinner */
@keyframes spin-clockwise {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes spin-counter {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}
```

## 2. Update tailwind.config.js

Replace ALL extended colors with:

```javascript
colors: {
  abyss: '#1a1714',
  depths: '#0f0d0b',
  'bg-surface': '#252220',
  bone: '#e5e1db',
  ochre: '#cd853f',
  'dusty-rose': '#c08081',
  'pale-gold': '#e9dcc9',
  'muted-tan': '#8b7355',
  'warm-gray': '#a8a29e',
  'warm-amber': '#b8860b',
  // Glass
  'glass-bg': 'var(--glass-bg)',
  'glass-hover': 'var(--glass-bg-hover)',
  'glass-active': 'var(--glass-bg-active)',
  'glass-border': 'var(--glass-border)',
  // Health status
  'status-healthy': 'var(--status-healthy)',
  'status-degraded': 'var(--status-degraded)',
  'status-restoring-early': 'var(--status-restoring-early)',
  'status-restoring-mid': 'var(--status-restoring-mid)',
},
```

Remove the old `reef`, `status`, `abyss` (old), `deep`, `mid`, `surface`, `glow-*`, `health-*`, `text-*`, `spec-*` color entries.

Add font families:
```javascript
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
},
```

Add backdrop blur:
```javascript
backdropBlur: {
  glass: '16px',
},
```

Keep the existing `animation` and `keyframes` entries for `pulse-slow` and `wave`.

## 3. Create Glass UI Components

Create 4 reusable glass components at `./dashboard-next/src/components/ui/glass/`:

**GlassPanel.tsx:**
```typescript
// Props: children, className?, as? (HTML element tag)
// Renders glass-panel with backdrop blur
// Supports custom className merge via clsx
```

**GlassButton.tsx:**
```typescript
// Props: children, className?, onClick?, href?, variant ('primary' | 'ghost' | 'danger')
// Primary: glass-button base style
// Ghost: transparent bg, bone text, hover glass-bg
// If href provided, render as Link; otherwise button
// Pill shape (rounded-full)
```

**GlassCard.tsx:**
```typescript
// Props: children, className?, title?, subtitle?
// Larger glass panel with optional title/subtitle header
// Title: text-primary, font-light
// Subtitle: text-secondary, text-sm
```

**GlassInput.tsx:**
```typescript
// Props: standard input props + label?, error?
// Glass background, bone text, ochre focus ring
// Error state: warm-amber border + error text
```

Create an `index.ts` barrel export in the glass/ directory.

## 4. Update layout.tsx

- Keep Inter font (already imported)
- Add JetBrains Mono as secondary font: `import { JetBrains_Mono } from 'next/font/google'`
- Apply both font variables to html element
- Set body className to include `bg-abyss text-bone`
- Keep existing Navbar, Footer, ToastProvider, Providers structure

## 5. FORBIDDEN Colors Enforcement

After all changes, run a comprehensive search across `dashboard-next/src/` for ANY of these forbidden patterns:
- `#00FFFF`, `#00E5FF`, `#00FFA3`, `#FF6B6B`, `#FF00FF`, `#000000`
- `cyan`, `teal`, `emerald`, `green-400`, `green-500` (as Tailwind classes)
- `glow-cyan`, `glow-green`, `glow-coral`
- Any `--healthy:` or `--degraded:` using old hex values

If any component directly uses old color values (inline styles or hardcoded hex), update those references to use the new CSS variables or Tailwind classes. Components that will be fully rewritten in later prompts (landing page sections) can be left as-is if they'll be replaced.

**Do NOT delete or rewrite entire components** — only update color references that would cause visual breakage with the new palette.

</requirements>

<constraints>
- Do NOT delete any components or pages — only modify the design system files
- Do NOT add new pages or routes
- Do NOT modify any logic, API calls, or data handling
- Preserve all existing animations (pulse-slow, wave)
- The build must pass with zero errors after changes
- If a component uses an old CSS variable that's been removed, update the reference to the new equivalent
</constraints>

<verification>
After completing all changes:

1. Run `cd dashboard-next && npm run build` — must pass with zero errors
2. Grep for forbidden colors:
   ```bash
   grep -rn '#00FFFF\|#00E5FF\|#00FFA3\|#FF6B6B\|#FF00FF' dashboard-next/src/
   grep -rn 'glow-cyan\|glow-green\|glow-coral' dashboard-next/src/
   grep -rn '\-\-healthy:\|--degraded:' dashboard-next/src/app/globals.css
   ```
   All should return zero results.
3. Verify new CSS variables exist in globals.css
4. Verify tailwind.config.js has new color scheme
5. Verify all 4 glass components exist and export correctly
</verification>

<success_criteria>
- globals.css has ONLY Golden Hour palette variables — zero old variables remain
- tailwind.config.js references new palette with correct hex values
- 4 glass components created with proper TypeScript props
- layout.tsx includes JetBrains Mono font
- Build passes with zero errors
- No forbidden colors found in grep search
- Existing functionality is preserved (no deleted components, no broken imports)
</success_criteria>
