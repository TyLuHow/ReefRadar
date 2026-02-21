<objective>
Fix the Next.js dashboard (`dashboard-next/`) so it fully renders and works on WSL2.

Currently the dashboard shows unstyled HTML only — JavaScript bundles fail to load when accessed via the WSL2 internal IP. This prompt also addresses UI polish: file size limit text, region warning display, and loading states.

This is the user-facing dashboard for ReefRadar, a coral reef acoustic health analysis tool.
</objective>

<context>
Read `CLAUDE.md` for project conventions.

Key files to examine:
- `dashboard-next/package.json` — Scripts and dependencies
- `dashboard-next/next.config.js` or `dashboard-next/next.config.mjs` — Next.js configuration
- `dashboard-next/src/app/page.tsx` — Main page with upload functionality
- `dashboard-next/src/app/layout.tsx` — Root layout
- `dashboard-next/src/components/` — All components (SiteCard, Results, etc.)

The symptom: Scripts fail to load from `http://172.23.248.161:3000/_next/static/chunks/*.js`.
The environment is WSL2 on Windows, accessing via the WSL2 internal IP.

API base URL: `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`
</context>

<research>
Thoroughly investigate the Next.js dashboard before making changes:

1. Read `dashboard-next/package.json` — check Next.js version, scripts, dependencies
2. Read `dashboard-next/next.config.js` (or `.mjs`) — check for output mode, basePath, assetPrefix issues
3. Read `dashboard-next/src/app/page.tsx` — understand the upload flow and current UI
4. List all components: `dashboard-next/src/components/*.tsx`
5. Try a clean build to see if there are build errors:
   ```bash
   cd /home/yler_uby_oward/ReefRadar/dashboard-next
   rm -rf .next
   npm run build 2>&1
   ```
6. If build succeeds, check if scripts work via localhost:
   ```bash
   npm run start &
   sleep 3
   curl -s http://localhost:3000 | grep -c "script"
   kill %1
   ```
</research>

<requirements>

## Fix 1: Dashboard Build and Rendering

Diagnose WHY JavaScript bundles fail to load. Common causes on WSL2:
- `output: 'export'` in next.config without proper static file serving
- Missing hostname binding (default binds to localhost only)
- `assetPrefix` misconfiguration
- Build errors that produce incomplete output

Fix the root cause so the dashboard fully renders with JavaScript.

## Fix 2: WSL2 Network Binding

Update scripts in `package.json` to bind to all interfaces:
```json
"dev": "next dev -H 0.0.0.0",
"start": "next start -H 0.0.0.0"
```

If using Next.js 14+, also consider adding `allowedDevOrigins` in next.config.

## Fix 3: File Size Limit Text

Find where the upload UI mentions file size limit. If it says "10MB", update to "50MB" to match the actual API limit. Search for strings like "10MB", "10 MB", "maximum" in the page/component files.

## Fix 4: Region Warning Display

When analysis results include `region.in_training_distribution === false`, display a prominent warning banner. Check if this already exists in the results display component. If not, add it:
- Amber/yellow background
- Warning icon
- Text explaining the geographic limitation
- Region name from the API response

## Fix 5: Loading States

Ensure the upload and analysis flow shows loading indicators:
- During file upload: "Uploading audio..."
- During analysis polling: "Processing..." with stage updates if available
- Check if these already exist before adding
</requirements>

<implementation>
1. Diagnose and fix the build/rendering issue FIRST — nothing else matters if JS doesn't load
2. Fix WSL2 binding in package.json
3. Fix file size text (search and replace)
4. Add region warning to results display (if not already present)
5. Verify loading states exist (add if missing)
6. Do a final clean build and test:
   ```bash
   cd /home/yler_uby_oward/ReefRadar/dashboard-next
   rm -rf .next
   npm run build
   npm run dev &
   sleep 5
   # Test localhost
   curl -s http://localhost:3000 | grep -c "script"
   kill %1
   ```
</implementation>

<verification>
After all fixes:

1. `npm run build` completes without errors
2. `npm run dev` starts and `curl http://localhost:3000` returns HTML with multiple `<script>` tags
3. File size text says "50MB" (or whatever the intended limit is)
4. Components reference `region.in_training_distribution` for warning display
5. Loading states exist in the upload/analyze flow

```bash
# Verify build
cd /home/yler_uby_oward/ReefRadar/dashboard-next && npm run build 2>&1 | tail -5

# Verify scripts load
npm run start -- -H 0.0.0.0 &
sleep 3
SCRIPT_COUNT=$(curl -s http://localhost:3000 | grep -c "script")
echo "Script tags found: $SCRIPT_COUNT"
kill %1

# Verify file size text
grep -r "50MB\|50 MB\|10MB\|10 MB" dashboard-next/src/ || echo "No file size text found"

# Verify region warning component
grep -r "in_training_distribution\|Geographic Limitation\|out.of.distribution" dashboard-next/src/ || echo "No region warning found"
```
</verification>

<success_criteria>
- `npm run build` succeeds with zero errors
- Dashboard fully renders with JavaScript (not just unstyled HTML)
- File upload drag-and-drop functional
- File size limit text matches API limit (50MB)
- Region warning displays for out-of-distribution results
- Loading indicators shown during upload and analysis
- Works when accessed via both localhost and WSL2 IP
</success_criteria>
