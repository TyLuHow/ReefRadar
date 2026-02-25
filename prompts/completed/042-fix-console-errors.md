<objective>
Fix three console errors in the ReefRadar Next.js 14 dashboard: (1) unused font preload warnings, (2) a SyntaxError in layout.js from an unterminated string literal, and (3) a missing favicon.ico returning 404.

Read `./CLAUDE.md` for project context.
</objective>

<context>
The Next.js 14 dashboard is at `./dashboard-next/`. These errors appear in the browser console on every page load.

**Error 1 — Font preload warnings:**
```
The resource at ".../_next/static/media/bb3ef058b751a6ad-s.p.woff2" preloaded with link preload was not used within a few seconds.
The resource at ".../_next/static/media/e4af272ccee01ff0-s.p.woff2" preloaded with link preload was not used within a few seconds.
```
This means fonts are being preloaded in `<head>` but not actually applied via CSS `font-family`. Likely caused by `next/font` loading fonts that aren't referenced in the rendered components, or a mismatch between font variable names and CSS usage.

**Error 2 — SyntaxError in layout.js:**
```
Uncaught SyntaxError: "" literal not terminated before end of script layout.js:401:17836
```
This is a build/compilation error in the layout chunk. An unterminated string literal in a source file (likely `layout.tsx` or a component it imports) is producing broken JavaScript output. This could be caused by an unescaped backtick, quote, or template literal in a string.

**Error 3 — Missing favicon:**
```
GET http://localhost:3001/favicon.ico [HTTP/1.1 404 Not Found]
```
No favicon.ico exists in `./dashboard-next/public/` or `./dashboard-next/src/app/`.

Key files to examine:
- `src/app/layout.tsx` — Root layout with font imports and metadata
- `src/app/globals.css` — Where font variables should be applied
- `tailwind.config.js` — Font family configuration
- `public/` directory — Static assets including favicon
</context>

<requirements>

## Fix 1: Font Preload Warnings

1. Read `src/app/layout.tsx` and identify all `next/font` imports (likely `next/font/google`)
2. Check what CSS variable names the fonts create (e.g., `--font-inter`, `--font-jetbrains-mono`)
3. Verify these variables are actually used in `globals.css` and/or `tailwind.config.js`
4. If fonts are imported but never applied to any element's `className`, either:
   - Apply the font variable classes to the `<body>` or `<html>` element
   - Or remove the unused font import entirely
5. The fix should ensure every preloaded font is actually used in rendering

## Fix 2: Unterminated String Literal

1. Read `src/app/layout.tsx` carefully — look for unescaped characters in template literals, JSX strings, or metadata objects
2. Check all components imported by layout.tsx (Navbar, Footer, ConditionalShell, etc.)
3. Search for problematic patterns: unescaped quotes inside strings, unclosed template literals, or special characters in metadata/descriptions
4. Common culprits: smart quotes (curly quotes), unescaped apostrophes in text content, or broken multi-line template literals
5. Fix the source so the compiled layout.js has no syntax errors

## Fix 3: Missing Favicon

1. Check if `public/favicon.ico` exists. If not, create a simple one.
2. For a reef/ocean-themed project, generate a minimal SVG favicon and place it at `src/app/favicon.ico` (Next.js App Router convention) or `public/favicon.ico`
3. Alternatively, add a `<link rel="icon">` in the metadata export of `layout.tsx` pointing to an existing icon
4. If the project has no icon assets at all, create a simple SVG favicon using the reef/ocean theme colors (ochre #cd853f on dark background)

</requirements>

<constraints>
- Use the Golden Hour color palette for any new UI elements (ochre, dusty-rose, bone, etc.)
- Do not add new npm dependencies for favicon generation — use a simple SVG or static .ico file
- Do not remove fonts that ARE being used — only fix the connection between preload and usage
- Build must pass with zero errors after all changes
</constraints>

<verification>
After fixing all three issues:

1. **Build check:**
   ```bash
   cd dashboard-next && npm run build
   ```
   Must pass with zero errors.

2. **Font verification:**
   - Read `layout.tsx` and confirm every `next/font` import has its variable class applied to an element
   - Or confirm unused font imports have been removed

3. **Layout syntax verification:**
   - Search for unescaped special characters in layout.tsx and its imports
   - The build passing confirms no syntax errors in compiled output

4. **Favicon verification:**
   - Confirm a favicon file exists at either `src/app/favicon.ico` or `public/favicon.ico`
   - Or confirm metadata in layout.tsx references an icon

5. **Forbidden color check:**
   ```bash
   grep -rn '#00FFFF\|#00E5FF\|#00FFA3\|#FF6B6B' dashboard-next/src/ --include='*.tsx' --include='*.ts'
   ```
   Should return zero results.
</verification>

<success_criteria>
- No font preload warnings in browser console
- No SyntaxError in layout.js
- favicon.ico returns 200 instead of 404
- Build passes with zero errors
- No forbidden colors in new/modified code
</success_criteria>
