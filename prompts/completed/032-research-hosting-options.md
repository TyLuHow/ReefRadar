<research_objective>
Research and compare hosting options for a Next.js 14 dashboard application, focusing on AWS options vs Vercel. The user already has AWS infrastructure (Lambda, API Gateway, S3, DynamoDB) for the backend API and wants to understand AWS frontend hosting costs and trade-offs before deploying the dashboard to Vercel.

Thoroughly explore multiple hosting approaches and provide clear cost comparisons with specific pricing for this project's scale.
</research_objective>

<context>
Read `./CLAUDE.md` for project overview.

The project is ReefRadar - a coral reef acoustic health analysis platform:
- **Backend**: Already deployed on AWS (Lambda, API Gateway, S3, DynamoDB)
- **Frontend**: Next.js 14 App Router dashboard in `./dashboard-next/`
- **Scale**: Portfolio project that should be able to scale to production
- **Current API**: `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`
- **Features**: SSR pages, client-side components (deck.gl maps, Web Audio API), ~4000 modules

Examine these files for project details:
- `./dashboard-next/package.json` — dependencies and build scripts
- `./dashboard-next/next.config.js` — Next.js configuration
- `./dashboard-next/.env.local` — environment variables needed
</context>

<scope>
Research these AWS hosting options for a Next.js app:

1. **AWS Amplify Hosting** — managed Next.js hosting (AWS's Vercel competitor)
   - SSR support, build pipeline, preview deployments
   - Pricing: build minutes, request count, data transfer, bandwidth

2. **S3 + CloudFront** (static export only)
   - Would require `output: 'export'` in next.config.js
   - Limitations: no SSR, no API routes, no middleware
   - Pricing: S3 storage, CloudFront requests/bandwidth

3. **ECS Fargate** or **App Runner** (containerized)
   - Full SSR support, Docker-based
   - Pricing: vCPU hours, memory hours

4. **Vercel** (for comparison baseline)
   - Free tier: what's included
   - Pro tier: what triggers it
   - Limits and gotchas

For each option, calculate monthly cost estimates for:
- **Low traffic** (portfolio): ~100 visitors/month, ~1000 page views
- **Medium traffic**: ~5,000 visitors/month, ~50,000 page views
- **High traffic**: ~50,000 visitors/month, ~500,000 page views
</scope>

<deliverables>
Save a comprehensive comparison document to `./docs/HOSTING_COMPARISON.md` with:

1. **Executive Summary** — Quick recommendation with reasoning
2. **Option-by-Option Breakdown** — For each hosting option:
   - How it works (brief)
   - SSR/SSG support
   - Build & deploy pipeline
   - Cost estimates at 3 traffic tiers
   - Pros and cons
   - Manual setup steps required
3. **Cost Comparison Table** — Side-by-side at each traffic tier
4. **Recommendation** — Best option for this project and why
5. **Manual Steps Required** — For EACH option, list exactly what the user would need to do manually (account setup, CLI installs, config changes, DNS, etc.)

Format the document with clear markdown tables, headers, and bullet points. Include specific dollar amounts, not vague ranges.
</deliverables>

<evaluation_criteria>
- All 4 hosting options researched with current pricing (2025-2026 rates)
- Cost estimates are specific and realistic, not hand-wavy
- Manual steps are concrete and actionable
- Clear recommendation with justification
- Trade-offs between AWS (keeping everything in one cloud) vs Vercel (optimized for Next.js) are honestly presented
</evaluation_criteria>

<verification>
Before completing, verify:
- All 4 options have cost estimates at all 3 traffic tiers
- Manual steps are listed for each option
- The comparison table is complete and formatted
- The recommendation accounts for the user's existing AWS backend
- File saved to `./docs/HOSTING_COMPARISON.md`
</verification>
