<objective>
Deploy the ReefRadar Next.js 14 dashboard to Vercel using the Vercel CLI with GitHub integration. The dashboard is in `./dashboard-next/` and connects to an existing AWS backend API.

This deployment should be production-ready with proper environment variables, build configuration, and GitHub integration for automatic deployments on push.
</objective>

<context>
Read `./CLAUDE.md` for project overview.

Key project details:
- **Dashboard location**: `./dashboard-next/`
- **Framework**: Next.js 14.2.5 with App Router
- **Backend API**: `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`
- **Environment**: The dashboard uses `.env.local` for the API URL
- **Build**: `npm run build` produces the production build
- **Special config**: `transpilePackages` in next.config.js for deck.gl
- **Repository**: GitHub repo at the root level (ReefRadar/)
- **Dashboard is a subdirectory**: `dashboard-next/` within the monorepo

Examine these files before starting:
- `./dashboard-next/package.json` — build scripts, dependencies
- `./dashboard-next/next.config.js` — Next.js config including transpilePackages
- `./dashboard-next/.env.local` — environment variables to set in Vercel
- `./dashboard-next/src/lib/api.ts` or similar — how the API URL is consumed

Also read `./docs/HOSTING_COMPARISON.md` if it exists — the research prompt may have produced useful context.
</context>

<requirements>
1. **Install Vercel CLI** if not already installed: `npm i -g vercel`
2. **Check if user is logged in**: `vercel whoami` — if not logged in, the user will need to run `vercel login` manually (requires browser interaction)
3. **Link the project to Vercel**:
   - Use `vercel link` from the `./dashboard-next/` directory
   - Configure as a Next.js project
   - Set the root directory to `dashboard-next` if linking from repo root
4. **Set environment variables** in Vercel:
   - Read `.env.local` to identify all required env vars
   - Use `vercel env add` for each variable, or document them for manual entry
5. **Deploy**:
   - First do a preview deployment: `vercel` (from dashboard-next/)
   - Verify the preview deployment works by checking the URL
   - Then promote to production: `vercel --prod`
6. **GitHub Integration**:
   - Ensure the Vercel project is connected to the GitHub repo
   - Verify that the root directory is set to `dashboard-next/` in Vercel project settings
   - This enables automatic deployments on push to main and preview deployments on PRs

IMPORTANT: Some steps require interactive authentication (browser-based login). For any step that requires manual user interaction, clearly document it with exact instructions rather than trying to automate it.
</requirements>

<implementation>
Step-by-step approach:

1. **Pre-flight checks**: Verify build works locally (`npm run build` in dashboard-next/)
2. **CLI setup**: Install Vercel CLI globally
3. **Authentication**: Check login status, document manual login step if needed
4. **Project linking**: Link dashboard-next/ to a Vercel project
5. **Environment variables**: Configure all env vars from .env.local
6. **Preview deploy**: Deploy and verify
7. **Production deploy**: Deploy to production
8. **GitHub integration verification**: Confirm auto-deploy is configured

For any step that fails or requires manual intervention:
- Clearly explain WHAT the user needs to do
- Provide the exact command or URL they need
- Explain WHY it can't be automated (e.g., browser-based OAuth)
</implementation>

<output>
After deployment, provide:
1. The live Vercel URL (e.g., `reefradar-dashboard.vercel.app` or similar)
2. A summary of what was automated vs what needs manual steps
3. Update `./README.md` with the live dashboard URL under a "Live Demo" section (if appropriate)
4. Create/update `./docs/DEPLOYMENT.md` with:
   - Vercel project configuration
   - Environment variables needed
   - How to redeploy manually
   - How automatic deployments work (push to main = production, PR = preview)
   - Any gotchas or known issues
</output>

<verification>
Before declaring complete, verify:
1. `npm run build` succeeds in `./dashboard-next/`
2. Vercel CLI is installed and accessible
3. Document the exact manual steps the user needs to perform
4. If deployment succeeds, curl the live URL to confirm it returns 200
5. If deployment requires manual steps, provide a clear checklist

Note: If Vercel login requires browser authentication, DO NOT consider this a failure. Document the manual step clearly and proceed with everything else that can be automated.
</verification>

<success_criteria>
- Vercel CLI installed
- Project linked to Vercel with correct root directory (dashboard-next/)
- Environment variables documented/configured
- At least one successful deployment (preview or production)
- GitHub integration enabled for automatic deployments
- Deployment documentation saved to `./docs/DEPLOYMENT.md`
- Clear list of any manual steps the user still needs to perform
</success_criteria>
