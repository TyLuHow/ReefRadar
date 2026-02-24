# ReefRadar Dashboard - Vercel Deployment Guide

**Last Updated:** 2026-02-22
**Dashboard Framework:** Next.js 14.2.5 (App Router)
**Dashboard Location:** `dashboard-next/` (subdirectory of monorepo)
**Backend API:** `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Deployment (Step-by-Step)](#initial-deployment-step-by-step)
- [Environment Variables](#environment-variables)
- [Vercel Project Configuration](#vercel-project-configuration)
- [Automatic Deployments (GitHub Integration)](#automatic-deployments-github-integration)
- [Manual Redeployment](#manual-redeployment)
- [Custom Domain (Optional)](#custom-domain-optional)
- [Troubleshooting](#troubleshooting)
- [Architecture Notes](#architecture-notes)

---

## Prerequisites

1. **Node.js 18+** and **npm** installed locally
2. A **GitHub account** with the ReefRadar repository pushed to it
3. A **Vercel account** (free Hobby tier is sufficient for personal/portfolio use)
   - Sign up at [vercel.com](https://vercel.com) using "Continue with GitHub" for easiest integration
4. The Next.js dashboard builds successfully:
   ```bash
   cd dashboard-next
   npm install
   npm run build
   ```

---

## Initial Deployment (Step-by-Step)

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

Verify the installation:

```bash
vercel --version
```

### Step 2: Log In to Vercel (MANUAL - Requires Browser)

This step requires browser-based OAuth authentication and cannot be fully automated.

```bash
vercel login
```

This command will:
1. Display a URL in the terminal
2. Open your default browser (or prompt you to open the URL manually)
3. Ask you to authenticate with GitHub, GitLab, Bitbucket, or email
4. After successful authentication, the terminal will confirm you are logged in

**Recommended:** Choose "Continue with GitHub" so your Vercel account is linked to the same GitHub account that hosts the ReefRadar repository.

Verify login:

```bash
vercel whoami
```

This should display your Vercel username.

### Step 3: Link the Project to Vercel

Navigate to the dashboard-next directory and link it:

```bash
cd dashboard-next
vercel link
```

When prompted, answer as follows:

| Prompt | Answer |
|--------|--------|
| Set up and develop? | **Y** |
| Which scope? | Select your Vercel account/team |
| Link to existing project? | **N** (creates a new project) |
| What's your project's name? | **reefradar-dashboard** (or press Enter for default) |
| In which directory is your code located? | **./** (current directory, i.e., `dashboard-next/`) |

This creates a `.vercel/` directory with project configuration (already in `.gitignore`).

### Step 4: Set Environment Variables

The dashboard requires one environment variable. Set it in Vercel for all environments:

```bash
# Set for Production, Preview, and Development environments
vercel env add NEXT_PUBLIC_API_URL
```

When prompted:
- **Value:** `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`
- **Environments:** Select all three (Production, Preview, Development)

**Alternative: Set via Vercel Dashboard (MANUAL)**

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click on the **reefradar-dashboard** project
3. Go to **Settings** > **Environment Variables**
4. Add:
   - **Key:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`
   - **Environments:** Check all three (Production, Preview, Development)
5. Click **Save**

### Step 5: Deploy to Preview

From the `dashboard-next/` directory:

```bash
vercel
```

This creates a preview deployment. Vercel will:
1. Upload the source code
2. Install dependencies (`npm install`)
3. Build the project (`npm run build`)
4. Deploy to a preview URL (e.g., `reefradar-dashboard-xxxxx.vercel.app`)

**Verify the preview deployment:**

```bash
# Replace with the actual preview URL from the output
curl -s -o /dev/null -w "%{http_code}" https://reefradar-dashboard-xxxxx.vercel.app/
```

Expected result: `200`

You can also open the URL in your browser to visually verify the dashboard loads correctly.

### Step 6: Deploy to Production

Once the preview looks good, deploy to production:

```bash
vercel --prod
```

This will deploy to the production URL (e.g., `reefradar-dashboard.vercel.app`).

**Verify the production deployment:**

```bash
curl -s -o /dev/null -w "%{http_code}" https://reefradar-dashboard.vercel.app/
```

### Step 7: Connect GitHub Repository (MANUAL - Vercel Dashboard)

To enable automatic deployments on push, connect the GitHub repository:

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click on the **reefradar-dashboard** project
3. Go to **Settings** > **Git**
4. Click **Connect Git Repository**
5. Select your GitHub account and the **ReefRadar** repository
6. **IMPORTANT:** Set the **Root Directory** to `dashboard-next`
   - This tells Vercel that the Next.js project is in a subdirectory, not the repo root
7. Click **Save**

After this, Vercel will:
- **Auto-deploy to production** on every push to `main`
- **Create preview deployments** for every pull request
- Only trigger builds when files in `dashboard-next/` change (if you configure "Ignored Build Step" -- see below)

---

## Environment Variables

| Variable | Value | Required | Description |
|----------|-------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod` | Yes | Backend API endpoint. The `NEXT_PUBLIC_` prefix makes it available in client-side code. |

**Note:** Since `NEXT_PUBLIC_API_URL` is a public environment variable (embedded in the client-side JavaScript bundle), it does not contain any secrets. The API endpoint is publicly accessible by design.

---

## Vercel Project Configuration

### vercel.json

The `dashboard-next/vercel.json` file configures the Vercel deployment:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "outputDirectory": ".next",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

### Key Settings

| Setting | Value | Reason |
|---------|-------|--------|
| Framework | Next.js | Auto-detected by Vercel |
| Root Directory | `dashboard-next` | Monorepo subdirectory |
| Build Command | `npm run build` | Standard Next.js build |
| Output Directory | `.next` | Default Next.js output |
| Node.js Version | 18.x (default) | Compatible with Next.js 14.2.5 |

### next.config.js Notes

The following configurations in `next.config.js` are Vercel-compatible:

- `trailingSlash: true` -- Vercel respects this setting and serves pages with trailing slashes
- `images: { unoptimized: true }` -- Disables Vercel's built-in image optimization (not needed for this project)
- `transpilePackages` for deck.gl -- Works correctly during Vercel's build step

---

## Automatic Deployments (GitHub Integration)

Once the GitHub repository is connected to Vercel (Step 7 above):

### Production Deployments

- **Trigger:** Push to `main` branch
- **URL:** `reefradar-dashboard.vercel.app` (or your custom domain)
- **What happens:** Vercel pulls the latest code, runs `npm install` and `npm run build` in the `dashboard-next/` directory, and deploys the result

### Preview Deployments

- **Trigger:** Open a Pull Request targeting `main`
- **URL:** Auto-generated unique URL (e.g., `reefradar-dashboard-git-feature-branch.vercel.app`)
- **What happens:** Vercel creates an isolated deployment for the PR, adds a comment on the PR with the preview URL
- **Cleanup:** Preview deployments are automatically cleaned up when the PR is closed

### Optional: Ignore Builds for Non-Dashboard Changes

To avoid unnecessary builds when only non-dashboard files change (e.g., Lambda code, docs), add an "Ignored Build Step" script:

1. Go to **Settings** > **Git** in the Vercel dashboard
2. Under **Ignored Build Step**, select **Custom**
3. Enter: `git diff HEAD^ HEAD --quiet -- .`

This tells Vercel to skip builds if no files in `dashboard-next/` changed (since the root directory is already set to `dashboard-next/`, the `.` refers to that directory).

---

## Manual Redeployment

### Via CLI

```bash
# Preview deployment
cd dashboard-next
vercel

# Production deployment
cd dashboard-next
vercel --prod
```

### Via Vercel Dashboard

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click on the **reefradar-dashboard** project
3. Go to **Deployments** tab
4. Click the three-dot menu on any previous deployment
5. Click **Redeploy**

### Via Git Push

Simply push to `main` for production, or open a PR for preview:

```bash
git add dashboard-next/
git commit -m "Update dashboard"
git push origin main
```

---

## Custom Domain (Optional)

To use a custom domain (e.g., `dashboard.reefradar.com`):

1. Go to **Settings** > **Domains** in the Vercel dashboard
2. Enter your domain name and click **Add**
3. Vercel will provide DNS records to add at your domain registrar:
   - **A Record:** `76.76.21.21` (for apex domain)
   - **CNAME:** `cname.vercel-dns.com` (for subdomains)
4. Vercel automatically provisions and renews SSL/TLS certificates

---

## Troubleshooting

### Build Fails on Vercel

**Symptom:** Build succeeds locally but fails on Vercel.

**Common causes:**
1. **Missing environment variables:** Verify `NEXT_PUBLIC_API_URL` is set in Vercel project settings
2. **Node.js version mismatch:** Ensure Vercel uses Node.js 18.x or 20.x (set in Settings > General > Node.js Version)
3. **deck.gl transpilation:** The `transpilePackages` config in `next.config.js` should handle this, but check build logs for ESM-related errors

**Debug steps:**
```bash
# Check build logs
vercel logs <deployment-url>

# Test build locally with same env
NEXT_PUBLIC_API_URL=https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod npm run build
```

### API Calls Fail (CORS)

**Symptom:** Dashboard loads but API calls to AWS return CORS errors.

**Cause:** The AWS API Gateway must have CORS configured to allow requests from the Vercel domain.

**Fix:** The API Gateway at `rgoe4pqatf.execute-api.us-east-1.amazonaws.com` already has CORS enabled with `Access-Control-Allow-Origin: *`. If this changes, update the API Gateway CORS settings to include the Vercel domain:

```
Access-Control-Allow-Origin: https://reefradar-dashboard.vercel.app
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Filename
```

### Preview Deployment Shows Stale Data

**Symptom:** Preview deployment uses old environment variable values.

**Fix:** Environment variables set in Vercel apply to new deployments only. After changing an env var, redeploy:

```bash
vercel --prod
```

### Cold Start Latency on First API Call

**Symptom:** First analysis takes 30+ seconds after the dashboard loads.

**Cause:** This is expected behavior. The AWS Lambda inference container has cold starts of 5-30 seconds. This is a backend issue, not a Vercel issue.

**Mitigation:** The dashboard UI includes a progress indicator and polling mechanism that handles this gracefully.

---

## Architecture Notes

### Cross-Cloud Data Flow

```
User Browser
     |
     v
Vercel CDN (dashboard static assets + SSR)
     |
     v (HTTPS API calls)
AWS API Gateway (us-east-1)
     |
     v
AWS Lambda (router -> preprocessor -> classifier -> inference)
     |
     v
AWS S3 + DynamoDB (storage)
```

### Latency Considerations

- **Dashboard loading:** Served from Vercel's global edge network (<50ms)
- **API calls:** Cross-cloud from Vercel to AWS us-east-1 (~10-50ms additional latency)
- **Analysis processing:** 5-60 seconds (dominated by Lambda execution time, not network latency)

The cross-cloud latency between Vercel and AWS is negligible relative to the audio analysis processing time.

### Cost

Vercel Hobby tier is free for personal/non-commercial use. The free tier includes:
- 100 GB bandwidth/month
- 1M function invocations/month
- Automatic SSL
- Preview deployments

This is more than sufficient for a portfolio project. See `docs/HOSTING_COMPARISON.md` for a detailed cost analysis of all hosting options.

---

## Quick Reference

| Item | Value |
|------|-------|
| **Vercel Project** | `reefradar-dashboard` |
| **Production URL** | `https://reefradar-dashboard.vercel.app` (after deployment) |
| **Root Directory** | `dashboard-next` |
| **Framework** | Next.js 14.2.5 |
| **Build Command** | `npm run build` |
| **Environment Variable** | `NEXT_PUBLIC_API_URL=https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod` |
| **Auto-deploy (production)** | Push to `main` branch |
| **Auto-deploy (preview)** | Open a Pull Request |
| **Vercel Dashboard** | [vercel.com/dashboard](https://vercel.com/dashboard) |
