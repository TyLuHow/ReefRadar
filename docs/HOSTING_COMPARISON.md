# Next.js Dashboard Hosting Comparison

**Date:** 2026-02-22
**Project:** ReefRadar Next.js 14 Dashboard (`dashboard-next/`)
**Context:** Backend already deployed on AWS (Lambda, API Gateway, S3, DynamoDB, ECR) in us-east-1

---

## Executive Summary

**Recommendation: Deploy to Vercel (Hobby tier) for portfolio use. Migrate to AWS Amplify if the project goes commercial.**

For a portfolio project with low traffic, Vercel's free Hobby tier is the fastest path to deployment with zero cost. It provides the best Next.js support (Vercel created Next.js), automatic preview deployments, and zero infrastructure management. Cross-origin API calls to the existing AWS API Gateway work fine with proper CORS headers (already configured).

If the project scales to commercial use or if keeping all infrastructure within AWS becomes important, AWS Amplify Hosting is the best AWS-native alternative at ~$0.15/month for low traffic after the 12-month free tier expires. It supports Next.js SSR natively and keeps billing consolidated in one AWS account.

S3 + CloudFront (using the new flat-rate free plan) is the cheapest AWS option but requires giving up SSR. ECS Fargate and App Runner are overkill for a frontend dashboard and carry a minimum ~$6-27/month baseline cost even at zero traffic.

---

## Traffic Tier Definitions

| Tier | Visitors/Month | Page Views/Month | Est. Bandwidth | Est. SSR Requests |
|------|---------------|-------------------|----------------|-------------------|
| **Low (Portfolio)** | ~100 | ~1,000 | ~500 MB | ~1,000 |
| **Medium** | ~5,000 | ~50,000 | ~25 GB | ~50,000 |
| **High** | ~50,000 | ~500,000 | ~250 GB | ~500,000 |

**Assumptions:** Average page size ~500 KB (HTML + JS + CSS + assets), each page view = 1 SSR request, builds run ~5 times/month at ~3 minutes each (15 build minutes total).

---

## Option 1: Vercel (Baseline Comparison)

### How It Works

Vercel is the company behind Next.js. You connect your GitHub repo, push code, and Vercel automatically builds and deploys. SSR runs on Vercel's serverless functions. Static assets are served from their global CDN. Preview deployments are created for every pull request.

### SSR/SSG Support

- Full SSR, SSG, ISR, and App Router support (first-class)
- Server Components, streaming, middleware all work natively
- Image optimization built in
- Edge Functions and Serverless Functions both available

### Build & Deploy Pipeline

- Connect GitHub repo, auto-deploy on push
- Preview deployments for every PR
- Instant rollbacks
- Zero configuration for Next.js projects

### Pricing Details (February 2026)

#### Hobby (Free) Tier

| Resource | Included Free |
|----------|---------------|
| Fast Data Transfer (bandwidth) | 100 GB/month |
| Edge Requests | 1M/month |
| Function Invocations | 1M/month |
| Active CPU (Functions) | 4 hours/month |
| Provisioned Memory (Functions) | 360 GB-hrs/month |
| ISR Reads | 1M/month |
| ISR Writes | 200,000/month |
| Image Transformations | 5,000/month |
| Concurrent Builds | 1 |
| Team Members | 1 developer seat |

**Critical restriction:** Hobby tier is for personal, non-commercial use only. If you exceed limits, the site is paused -- there is no overage billing on Hobby. Violating the commercial restriction risks account suspension.

#### Pro Tier: $20/user/month

Includes a $20 usage credit applied toward overages. Key included amounts:

| Resource | Included | Overage Rate |
|----------|----------|-------------|
| Fast Data Transfer | 1 TB/month | ~$0.15/GB |
| Edge Requests | 10M/month | Usage-based |
| Function Invocations | Usage-based | $0.60/1M |
| Active CPU | Usage-based | $0.128/hour |
| Build Minutes | Usage-based | $0.014/min (standard) |
| ISR Reads | Usage-based | $0.40/1M |
| ISR Writes | Usage-based | $4.00/1M |
| Image Transformations | Usage-based | $0.05/1K |

#### Monthly Cost Estimates

| Traffic Tier | Hobby (Free) | Pro |
|-------------|-------------|-----|
| **Low** (100 visitors) | **$0.00** | $20.00 |
| **Medium** (5K visitors) | **$0.00** | $20.00 |
| **High** (50K visitors) | **$0.00** (within 100 GB / 1M request limits) | $20.00 |

At all three traffic tiers, the Hobby plan's 100 GB bandwidth and 1M function invocations are more than sufficient. Even at 500K page views x 500 KB = ~250 GB, much of this is cached static assets not counted against function invocations. The Pro plan's $20/month base (with included credit) covers far beyond 500K page views.

### Pros

- Zero cost for portfolio use
- Best-in-class Next.js support (they built the framework)
- Zero configuration needed
- Automatic preview deployments and instant rollbacks
- Global edge network with excellent performance
- Built-in analytics (50K events/month on Hobby)
- Generous free tier handles well over 50K visitors

### Cons

- Hobby tier is non-commercial only (violating this risks account suspension)
- Vendor lock-in to Vercel's platform
- Backend API is on AWS, so cross-cloud data transfer (adds ~10-50ms latency per API call)
- Pro tier jumps to $20/month minimum, expensive for a side project
- Less control over infrastructure
- Some Next.js optimizations are Vercel-specific

### Manual Steps Required

1. Create a Vercel account at [vercel.com](https://vercel.com)
2. Install Vercel CLI: `npm i -g vercel`
3. Connect your GitHub repository to Vercel
4. Set the root directory to `dashboard-next/` in project settings
5. Set environment variable: `NEXT_PUBLIC_API_URL=https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`
6. Remove `output: 'export'` from `next.config.js` if you want SSR (or leave it for static export)
7. Push to `main` branch -- Vercel auto-deploys
8. (Optional) Configure custom domain in Vercel dashboard

**Estimated time to first deploy: ~5 minutes**

---

## Option 2: AWS Amplify Hosting

### How It Works

AWS Amplify Hosting is Amazon's managed hosting service for modern web frameworks including Next.js. It detects Next.js automatically, builds the app, deploys SSR functions to Lambda@Edge or CloudFront Functions, and serves static assets via CloudFront. It supports Git-based continuous deployment similar to Vercel.

### SSR/SSG Support

- Full SSR support for Next.js 12-15 (including App Router)
- SSG, ISR, middleware, image optimization all supported
- Server Components supported
- Uses Lambda@Edge for SSR compute
- **Limitation:** No Edge API Routes support; must use non-edge APIs and middleware
- **Limitation:** No On-Demand ISR support
- **Limitation:** Max build output size of 220 MB for SSR apps
- **Limitation:** Max optimized image output of 4.3 MB

### Build & Deploy Pipeline

- Connect GitHub/GitLab/Bitbucket repo
- Auto-build and deploy on push
- Preview deployments for PRs (branch deployments)
- Managed SSL certificates
- Custom domain support with Route 53 integration
- Auto-detects Next.js framework

### Pricing Details (February 2026)

| Resource | Free Tier (12 months for new accounts) | After Free Tier |
|----------|---------------------------------------|-----------------|
| Build minutes (standard 8GB/4vCPU) | 1,000 min/month | $0.01/min |
| Build minutes (large 16GB/8vCPU) | N/A | $0.025/min |
| SSR requests | 500,000/month | $0.30/1M requests |
| SSR duration | 100 GB-hours/month | $0.20/GB-hour |
| Data transfer out | 15 GB/month | $0.15/GB |
| Hosting storage | 5 GB/month | $0.023/GB/month |
| WAF (optional) | N/A | $15/month per app + WAF charges |

**Important note on free tier:** The Amplify free tier is "Free for 12 months" for new AWS accounts, not perpetually free. After 12 months, the always-free allowances (build minutes, storage, data transfer, SSR requests, SSR duration) are the baseline amounts shown above. The pricing page lists these as included free amounts even after the 12-month promotional period.

### Monthly Cost Estimates

**During first 12 months (new AWS account):**

All three traffic tiers are fully covered by the free tier.

**After 12-month promotional period (ongoing costs):**

| Traffic Tier | Build | SSR Requests | SSR Duration | Data Transfer | Storage | **Total** |
|-------------|-------|-------------|-------------|---------------|---------|-----------|
| **Low** (100 visitors) | $0.15 (15 min x $0.01) | $0.00 (1K under 500K free) | $0.00 (under 100 GB-hrs) | $0.00 (0.5 GB under 15 GB free) | $0.00 (under 5 GB) | **~$0.15** |
| **Medium** (5K visitors) | $0.15 | $0.00 (50K under 500K free) | $0.00 (under 100 GB-hrs) | $0.00 (under 15 GB free with caching) | $0.00 | **~$0.15** |
| **High** (50K visitors) | $0.15 | $0.00 (500K at free limit) | ~$0.10 | ~$3.75 (25 GB cached, only ~25 GB SSR transfer) | $0.00 | **~$4.00** |

Note on high-traffic data transfer: CloudFront caching means static assets (JS, CSS, images) are served from cache. With effective caching, only ~10-20% of bandwidth comes from SSR origin responses. The 15 GB free data transfer covers much of the SSR traffic; the estimate above assumes 25 GB of non-cached transfer at $0.15/GB.

### Pros

- Keeps everything in AWS (single bill, single cloud provider)
- Native Next.js SSR support with auto-detection
- Very low cost (essentially free at low-medium traffic)
- Free SSL certificates
- Git-based CI/CD with preview deployments
- Integrates with existing AWS resources (same IAM, same region)
- No cross-cloud latency for API calls (both in us-east-1)
- No per-seat pricing for team collaboration

### Cons

- Not as polished as Vercel for Next.js (occasional SSR compatibility issues reported)
- Build times can be slower than Vercel
- Debugging SSR issues is harder (CloudWatch logs vs Vercel's dashboard)
- Preview deployments less seamless than Vercel
- Less community documentation for Next.js-specific issues
- Node.js runtime deprecation cycles (only Node 20+ supported after Sep 2025)
- No Edge API Routes or On-Demand ISR support
- 220 MB max build output for SSR apps
- 12-month free tier expires (Vercel Hobby is free forever for personal use)

### Manual Steps Required

1. Open AWS Amplify console at `https://us-east-1.console.aws.amazon.com/amplify/`
2. Click "New app" > "Host web app"
3. Connect your GitHub repository and authorize access
4. Select the repository and branch (`main`)
5. Set the app root directory to `dashboard-next/`
6. Amplify auto-detects Next.js and configures build settings
7. Verify or customize the build settings. Default `amplify.yml`:
   ```yaml
   version: 1
   frontend:
     phases:
       preBuild:
         commands:
           - npm ci
       build:
         commands:
           - npm run build
     artifacts:
       baseDirectory: .next
       files:
         - '**/*'
     cache:
       paths:
         - node_modules/**/*
         - .next/cache/**/*
   ```
8. Add environment variable: `NEXT_PUBLIC_API_URL` = `https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod`
9. Click "Save and deploy" -- Amplify builds and deploys automatically
10. (Optional) Configure custom domain in Amplify console or via Route 53

**Estimated time to first deploy: ~15 minutes**

---

## Option 3: S3 + CloudFront (Static Export)

### How It Works

Next.js can be configured to export a fully static site (`output: 'export'` in `next.config.js`). The static HTML/CSS/JS files are uploaded to an S3 bucket and served globally through CloudFront CDN. No server-side rendering occurs; all rendering happens client-side.

The current project already has a static export in `dashboard-next/out/` (1.9 MB) and the config already has `images: { unoptimized: true }`.

### SSR/SSG Support

- **No SSR** -- static export only
- No API routes
- No middleware
- No ISR (Incremental Static Regeneration)
- No Server Components
- Client-side data fetching only (useEffect, React Query, etc.)
- Image optimization requires external service or `unoptimized: true` (already configured)

### Build & Deploy Pipeline

- Build locally or in CI: `next build` (with `output: 'export'`)
- Upload `out/` directory to S3: `aws s3 sync out/ s3://bucket-name/`
- Invalidate CloudFront cache: `aws cloudfront create-invalidation`
- No automatic PR preview deployments (would need custom CI/CD via GitHub Actions)

### Pricing Details (February 2026)

AWS introduced **CloudFront flat-rate pricing plans** in November 2025. These replace the traditional pay-as-you-go model with simple monthly subscriptions and no overage charges.

#### CloudFront Flat-Rate Plans

| Feature | Free Plan | Pro Plan |
|---------|-----------|----------|
| **Monthly cost** | $0/month | $15/month |
| **Requests** | 1M/month | 10M/month |
| **Data transfer** | 100 GB/month | 50 TB/month |
| **S3 storage credit** | 5 GB/month | 50 GB/month |
| **Distributions** | 1 (max 3 free per account) | 1 |
| **WAF rules** | 5 | 25 |
| **Cache behaviors** | 5 | 10 |
| **DDoS protection** | Basic (always-on) | Advanced (AntiDDoS AMR) |
| **Bot management** | No | Yes |
| **Origin Shield** | No | Yes |
| **DNS records** | 50 per hosted zone | 100 per hosted zone |
| **DNS queries** | 1M/month | 5M/month |
| **Overage charges** | **None** | **None** |
| **TLS certificate** | Free (auto-renewal) | Free (auto-renewal) |
| **Route 53 DNS** | Included | Included |

Key advantage: **No overage charges on any flat-rate plan.** DDoS attacks and WAF-blocked requests do not count against allowances.

#### Legacy Pay-As-You-Go Pricing (still available)

| Resource | Always-Free Tier | Pay-as-you-go Rate |
|----------|-----------------|-------------------|
| CloudFront data transfer | 1 TB/month (always free, not 12-month) | $0.085/GB (first 10 TB, US/EU) |
| CloudFront HTTPS requests | 10M/month (always free) | $0.010/10K requests |
| CloudFront Functions | 2M invocations/month | $0.10/1M invocations |
| S3 Standard storage | 5 GB (12-month free tier) | $0.023/GB/month |
| S3 GET requests | 20,000/month (12-month) | $0.0004/1,000 requests |
| S3 PUT requests | 2,000/month (12-month) | $0.005/1,000 requests |

**Important:** The CloudFront always-free tier (1 TB/month, 10M requests/month) is permanent and does not expire after 12 months. This is separate from the new flat-rate plans and applies per AWS account on pay-as-you-go distributions.

### Monthly Cost Estimates

**Using CloudFront Flat-Rate Free Plan (recommended for this project):**

| Traffic Tier | CloudFront | S3 Storage | S3 Requests | **Total** |
|-------------|-----------|------------|-------------|-----------|
| **Low** (100 visitors) | $0.00 (under 100 GB / 1M requests) | $0.00 (1.9 MB under 5 GB credit) | $0.00 | **$0.00** |
| **Medium** (5K visitors) | $0.00 (under 100 GB / 1M requests) | $0.00 | $0.00 | **$0.00** |
| **High** (50K visitors) | $0.00 (250 GB exceeds 100 GB but no overages) | $0.00 | $0.00 | **$0.00** |

Wait -- the flat-rate free plan caps at 100 GB/month and 1M requests/month. At high traffic (250 GB), this exceeds the free plan limit. However, there are **no overage charges**, so the site would still be served, but AWS reserves the right to throttle or contact you. For guaranteed coverage at high traffic, use the **legacy pay-as-you-go** model (1 TB free) or the **Pro flat-rate plan** ($15/month).

**Using Legacy Pay-As-You-Go (1 TB always-free tier):**

| Traffic Tier | CloudFront Transfer | CloudFront Requests | S3 Storage | **Total** |
|-------------|--------------------|--------------------|------------|-----------|
| **Low** (100 visitors) | $0.00 (under 1 TB) | $0.00 (under 10M) | ~$0.05 | **~$0.05** |
| **Medium** (5K visitors) | $0.00 (under 1 TB) | $0.00 (under 10M) | ~$0.05 | **~$0.05** |
| **High** (50K visitors) | $0.00 (250 GB under 1 TB) | $0.00 (under 10M) | ~$0.05 | **~$0.05** |

The legacy always-free tier's 1 TB/month bandwidth easily covers all three traffic tiers. The only cost is S3 storage for ~2 MB of static files, which rounds to ~$0.05/month. This is the cheapest hosting option available.

### Pros

- Cheapest possible hosting (effectively $0.00-$0.05/month at all traffic tiers)
- Maximum reliability (S3 = 99.999999999% durability, CloudFront = global CDN)
- No servers to manage, no cold starts, no compute costs
- Fastest possible page loads (static files from CDN edge)
- Scales to very high traffic with zero concern (1 TB free)
- Keeps everything in AWS
- New flat-rate free plan includes Route 53 DNS, WAF, DDoS protection
- No overage charges on flat-rate plans

### Cons

- **No SSR** -- must use fully static export
- No server-side API routes
- No middleware (authentication, redirects at server level)
- No ISR -- content is stale until redeployed
- No Server Components (everything becomes client components)
- Must set up CI/CD pipeline manually (GitHub Actions or CodePipeline)
- No automatic preview deployments
- CloudFront invalidations needed on every deploy
- SPAs require custom error page configuration for client-side routing
- Development and production behavior diverge significantly
- More initial setup work than Vercel or Amplify

### Manual Steps Required

1. Add `output: 'export'` to `next.config.js` (or verify it is present)
2. Convert any Server Components to Client Components
3. Remove any middleware, API routes, or SSR-dependent features
4. Build: `cd dashboard-next && npm run build`
5. Create S3 bucket:
   ```bash
   aws s3 mb s3://reefradar-2477-dashboard --region us-east-1
   ```
6. **Option A -- Flat-Rate Free Plan (recommended):**
   - Go to CloudFront console > "Flat-rate pricing" tab
   - Create a new distribution on the Free plan
   - Set S3 bucket as origin
   - Configure Origin Access Control (OAC)
   - Set default root object to `index.html`
   - Configure custom error responses: 403 and 404 -> `/index.html` with 200 status (for SPA routing)

   **Option B -- Pay-As-You-Go (legacy):**
   ```bash
   aws cloudfront create-distribution \
     --origin-domain-name reefradar-2477-dashboard.s3.amazonaws.com \
     --default-root-object index.html
   ```
7. Update S3 bucket policy to allow CloudFront OAC access:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Sid": "AllowCloudFrontServicePrincipal",
       "Effect": "Allow",
       "Principal": {"Service": "cloudfront.amazonaws.com"},
       "Action": "s3:GetObject",
       "Resource": "arn:aws:s3:::reefradar-2477-dashboard/*",
       "Condition": {
         "StringEquals": {
           "AWS:SourceArn": "arn:aws:cloudfront::<account-id>:distribution/<distribution-id>"
         }
       }
     }]
   }
   ```
8. Upload static files:
   ```bash
   aws s3 sync dashboard-next/out/ s3://reefradar-2477-dashboard/ --delete
   ```
9. Invalidate CloudFront cache:
   ```bash
   aws cloudfront create-invalidation --distribution-id XXXX --paths "/*"
   ```
10. (Optional) Set up GitHub Actions for automated deploy on push:
    ```yaml
    # .github/workflows/deploy-dashboard.yml
    name: Deploy Dashboard
    on:
      push:
        branches: [main]
        paths: ['dashboard-next/**']
    jobs:
      deploy:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with: { node-version: '20' }
          - run: cd dashboard-next && npm ci && npm run build
          - uses: aws-actions/configure-aws-credentials@v4
            with:
              aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
              aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
              aws-region: us-east-1
          - run: aws s3 sync dashboard-next/out/ s3://reefradar-2477-dashboard/ --delete
          - run: aws cloudfront create-invalidation --distribution-id ${{ secrets.CF_DIST_ID }} --paths "/*"
    ```
11. (Optional) Configure custom domain with Route 53 and ACM certificate

**Estimated time to first deploy: ~1-2 hours**

---

## Option 4: ECS Fargate / App Runner (Containerized)

### How It Works

The Next.js app is packaged into a Docker container and run as a long-lived server process. **ECS Fargate** runs the container in a managed cluster with fine-grained networking control. **App Runner** is a simpler abstraction that auto-scales containers based on traffic. Both support full SSR since the Next.js server runs continuously.

### SSR/SSG Support

- Full SSR, SSG, ISR, middleware, API routes -- everything works
- Server Components, streaming, all Next.js features supported
- No limitations; the app runs exactly as in development
- Any Node.js version, any system dependencies

### Build & Deploy Pipeline

**App Runner:**
- Connect GitHub repo directly, or push Docker image to ECR
- Auto-deploy on push (with $1/month automatic deployment charge)
- Auto-scaling from 1 to N containers based on traffic
- Built-in health checks and SSL

**ECS Fargate:**
- Build Docker image, push to ECR
- Define task definition and ECS service
- Set up Application Load Balancer (ALB) for routing
- Requires more manual orchestration (or CloudFormation/CDK)
- No built-in CI/CD

### Pricing Details (February 2026)

**App Runner (us-east-1):**

| Resource | Cost |
|----------|------|
| Provisioned memory (idle, always charged) | $0.007/GB-hour |
| Active vCPU (processing requests) | $0.064/vCPU-hour |
| Active memory (processing requests) | $0.007/GB-hour |
| Automatic deployments | $1/app/month |
| Build minutes (from source) | $0.005/min |

Minimum config: 0.25 vCPU / 0.5 GB memory. Billing per second with 1-minute minimum.

**ECS Fargate (us-east-1, Linux/x86):**

| Resource | Cost |
|----------|------|
| vCPU | $0.04048/vCPU-hour ($0.000011244/vCPU-second) |
| Memory | $0.004445/GB-hour ($0.000001235/GB-second) |
| Ephemeral storage (beyond free 20 GB) | $0.000111/GB-hour |

No scale-to-zero. Tasks run 24/7. Billing per second with 1-minute minimum.

**ECS Fargate (Graviton/ARM -- 20% cheaper):**

| Resource | Cost |
|----------|------|
| vCPU | $0.03238/vCPU-hour |
| Memory | $0.003556/GB-hour |

### Monthly Cost Estimates

**App Runner** (0.25 vCPU / 1 GB memory, 1 provisioned instance):

| Traffic Tier | Provisioned Memory (idle) | Active Compute | Deploy | **Total** |
|-------------|--------------------------|---------------|--------|-----------|
| **Low** (100 visitors) | 1 GB x 730 hrs x $0.007 = $5.11 | ~$0.02 | $1.03 | **~$6.16** |
| **Medium** (5K visitors) | $5.11 | ~$0.50 | $1.03 | **~$6.64** |
| **High** (50K visitors) | $5.11 | ~$5.00 | $1.03 | **~$11.14** |

App Runner charges for provisioned memory even when idle (to keep instances warm for fast response). Active compute charges are added only when handling requests.

**ECS Fargate** (0.25 vCPU / 0.5 GB memory, 1 task running 24/7):

| Traffic Tier | vCPU | Memory | ALB (base + LCU) | **Total** |
|-------------|------|--------|-------------------|-----------|
| **Low** (100 visitors) | 0.25 x 730 x $0.04048 = $7.39 | 0.5 x 730 x $0.004445 = $1.62 | ~$16.20 + $2.00 = $18.20 | **~$27.21** |
| **Medium** (5K visitors) | $7.39 | $1.62 | ~$16.20 + $2.50 = $18.70 | **~$27.71** |
| **High** (50K visitors) | $7.39 | $1.62 | ~$16.20 + $6.00 = $22.20 | **~$31.21** |

ECS Fargate has no scale-to-zero; you pay for running tasks 24/7. The ALB adds ~$16.20/month base cost plus ~$0.008/LCU-hour for traffic. For a frontend dashboard, this overhead is significant and unjustifiable.

### Pros

- Full Next.js compatibility (absolutely no limitations)
- Full control over runtime environment (Node.js version, system deps, environment variables)
- App Runner: simpler setup, auto-scaling, built-in health checks, SSL
- ECS Fargate: fine-grained networking, VPC integration, service mesh capability
- Docker container is portable to any cloud or on-premises
- Familiar DevOps patterns for teams experienced with containers

### Cons

- **Expensive baseline cost** ($6-27+/month even at zero traffic)
- Massive overkill for a frontend dashboard
- App Runner: limited regional availability, smaller community
- ECS Fargate: complex setup (task definitions, services, ALB, target groups, security groups)
- Cold starts on App Runner when scaling from zero active instances
- Must manage Docker image builds and ECR repository
- No built-in preview deployments
- No CDN included -- need to add CloudFront separately for static asset caching
- Ongoing container maintenance (base image updates, security patches)

### Manual Steps Required

**App Runner:**

1. Create a `Dockerfile` in `dashboard-next/`:
   ```dockerfile
   FROM node:20-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   ENV NEXT_PUBLIC_API_URL=https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod
   RUN npm run build

   FROM node:20-alpine AS runner
   WORKDIR /app
   ENV NODE_ENV=production
   COPY --from=builder /app/.next/standalone ./
   COPY --from=builder /app/.next/static ./.next/static
   COPY --from=builder /app/public ./public
   EXPOSE 3000
   CMD ["node", "server.js"]
   ```
2. Create ECR repository:
   ```bash
   aws ecr create-repository --repository-name reefradar-2477-dashboard --region us-east-1
   ```
3. Build and push Docker image:
   ```bash
   cd dashboard-next
   docker build -t reefradar-2477-dashboard .
   docker tag reefradar-2477-dashboard:latest 781978598306.dkr.ecr.us-east-1.amazonaws.com/reefradar-2477-dashboard:latest
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 781978598306.dkr.ecr.us-east-1.amazonaws.com
   docker push 781978598306.dkr.ecr.us-east-1.amazonaws.com/reefradar-2477-dashboard:latest
   ```
4. Create IAM role for App Runner to access ECR
5. Create App Runner service:
   ```bash
   aws apprunner create-service \
     --service-name reefradar-dashboard \
     --source-configuration '{
       "ImageRepository": {
         "ImageIdentifier": "781978598306.dkr.ecr.us-east-1.amazonaws.com/reefradar-2477-dashboard:latest",
         "ImageRepositoryType": "ECR",
         "ImageConfiguration": {
           "Port": "3000",
           "RuntimeEnvironmentVariables": {
             "NEXT_PUBLIC_API_URL": "https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod"
           }
         }
       },
       "AuthenticationConfiguration": {
         "AccessRoleArn": "<app-runner-ecr-access-role-arn>"
       }
     }' \
     --instance-configuration '{"Cpu":"0.25 vCPU","Memory":"0.5 GB"}'
   ```
6. Configure auto-scaling settings (min 1, max instances based on budget)
7. (Optional) Add custom domain in App Runner console
8. (Optional) Add CloudFront distribution in front for CDN caching of static assets

**ECS Fargate** (abbreviated -- significantly more steps):

1. Steps 1-3 from App Runner (Dockerfile, ECR, push image)
2. Create ECS cluster: `aws ecs create-cluster --cluster-name reefradar-dashboard`
3. Create task definition with container port 3000, CPU 256, memory 512
4. Create Application Load Balancer, target group, and listener rules
5. Create security groups (ALB: 80/443 inbound; Task: 3000 from ALB)
6. Create ECS service with desired count=1, ALB integration, health checks
7. Set up ACM certificate for SSL
8. (Optional) Add CloudFront distribution, Route 53 for custom domain
9. Set up CI/CD pipeline (CodePipeline, GitHub Actions, or similar)

**Estimated time to first deploy: App Runner ~1-2 hours, ECS Fargate ~3-5 hours**

---

## Cost Comparison Table

### Monthly Cost by Traffic Tier

| Option | Low (~100 visitors) | Medium (~5K visitors) | High (~50K visitors) | Notes |
|--------|--------------------|-----------------------|----------------------|-------|
| **Vercel Hobby** | **$0.00** | **$0.00** | **$0.00** | Non-commercial only; hard limits |
| **Vercel Pro** | $20.00 | $20.00 | $20.00 | Commercial use allowed |
| **AWS Amplify** (after free tier) | ~$0.15 | ~$0.15 | ~$4.00 | 12-month free tier for new accounts |
| **S3 + CloudFront** (flat-rate free) | **$0.00** | **$0.00** | **$0.00** | No SSR; 100 GB / 1M req limits, no overages |
| **S3 + CloudFront** (pay-as-you-go) | ~$0.05 | ~$0.05 | ~$0.05 | No SSR; 1 TB / 10M req always-free |
| **App Runner** | ~$6.16 | ~$6.64 | ~$11.14 | Idle memory charges 24/7 |
| **ECS Fargate** | ~$27.21 | ~$27.71 | ~$31.21 | Runs 24/7; ALB adds ~$18/month |

### Feature Comparison

| Feature | Vercel | AWS Amplify | S3 + CloudFront | App Runner / Fargate |
|---------|--------|-------------|-----------------|---------------------|
| **SSR Support** | Full | Full (with limitations) | None | Full |
| **Server Components** | Yes | Yes | No | Yes |
| **Middleware** | Yes | Yes (non-edge only) | No | Yes |
| **ISR** | Yes | Yes (no on-demand) | No | Yes |
| **Auto-deploy on push** | Yes | Yes | Manual/CI needed | App Runner: Yes |
| **Preview deployments** | Yes (automatic) | Yes (branch-based) | No | No |
| **Custom domain** | Easy (dashboard) | Easy (console) | Moderate (Route 53 + ACM) | Moderate |
| **SSL** | Automatic | Automatic | ACM + CloudFront | ACM or automatic |
| **CDN** | Global edge | CloudFront | CloudFront | Must add separately |
| **DDoS protection** | Included | Included | Included (flat-rate) | Must add separately |
| **Setup complexity** | Minimal | Low | Moderate | High |
| **Stays in AWS** | No | Yes | Yes | Yes |
| **Cold starts** | Minimal | Possible (Lambda@Edge) | None (static) | App Runner: Yes |
| **Scale to zero cost** | Yes | Yes | N/A (static) | App Runner: Partial ($5.11/mo idle) |
| **Commercial use** | Hobby: No; Pro: Yes | Yes | Yes | Yes |

### Setup Effort Comparison

| Option | Time to First Deploy | Ongoing Maintenance | CI/CD Included | Config Changes Needed |
|--------|---------------------|--------------------|--------------------|----------------------|
| **Vercel** | ~5 minutes | None | Yes | None (or remove `output: 'export'`) |
| **AWS Amplify** | ~15 minutes | Minimal | Yes | None (or remove `output: 'export'`) |
| **S3 + CloudFront** | ~1-2 hours | Low (deploy script) | No (GitHub Actions) | Add `output: 'export'` to config |
| **App Runner** | ~1-2 hours | Moderate (Docker) | Partial | Create Dockerfile, remove `output: 'export'` |
| **ECS Fargate** | ~3-5 hours | High | No (CodePipeline) | Create Dockerfile, remove `output: 'export'` |

---

## Recommendation

### For This Project (Portfolio / Personal Use)

**Use Vercel Hobby tier.** It costs nothing, deploys in 5 minutes, and provides the best possible Next.js experience. The cross-cloud latency between Vercel's edge and the AWS API Gateway backend is negligible -- the API already handles audio processing that takes seconds, so an extra 10-50ms on the dashboard fetch is imperceptible. The Hobby tier's 100 GB bandwidth and 1M function invocations can handle well over 50K visitors/month.

### If You Need Commercial Use

**Switch to AWS Amplify.** At ~$0.15/month for low-medium traffic (after the 12-month free tier expires), it is nearly free and keeps everything in AWS. The deploy experience is slightly rougher than Vercel but still straightforward: connect GitHub, auto-detect Next.js, deploy. This eliminates concerns about Vercel's non-commercial restriction and keeps the entire stack in one cloud provider with consolidated billing.

### If You Want Maximum Cost Savings on AWS

**Use S3 + CloudFront with static export on the flat-rate free plan.** At $0.00/month with no overage charges (up to 100 GB / 1M requests), or ~$0.05/month on pay-as-you-go (1 TB always-free), this is the absolute cheapest option. The current project already generates a static export in `out/` (1.9 MB) and has `images: { unoptimized: true }`. This option is viable if SSR features are not critical to the dashboard experience. The new CloudFront flat-rate free plan also includes Route 53 DNS, WAF, and DDoS protection at no cost.

### Avoid for This Project

**ECS Fargate and App Runner** are designed for backend services and containerized applications. Using them to host a frontend dashboard is disproportionate -- the $6-27/month baseline cost for zero traffic is not justifiable when Vercel and Amplify offer equivalent or better functionality for free or near-free.

---

## Decision Matrix

| Priority | Best Option | Monthly Cost |
|----------|------------|-------------|
| Fastest deployment | Vercel Hobby | $0 |
| Lowest cost (any traffic) | S3 + CloudFront (static) | $0-0.05 |
| Lowest cost with SSR | AWS Amplify | $0.15 |
| Best developer experience | Vercel | $0 (Hobby) / $20 (Pro) |
| Keep everything in AWS | AWS Amplify | $0.15 |
| Full Next.js compatibility (zero limitations) | Vercel or App Runner | $0 / $6.16 |
| Portfolio showcase | Vercel Hobby (free, fast, polished) | $0 |
| Production commercial app | AWS Amplify or Vercel Pro | $0.15 / $20 |
| Maximum infrastructure control | ECS Fargate | $27+ |

---

## Configuration Notes for This Project

The current `next.config.js` has:
- `trailingSlash: true` -- compatible with all options
- `images: { unoptimized: true }` -- compatible with all options (no Next.js image optimization server needed)
- `transpilePackages` for deck.gl -- standard build-time config, works everywhere

The current `.env.local` has:
- `NEXT_PUBLIC_API_URL=https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod` -- must be set as environment variable in any hosting platform

The project uses ~4000 modules with deck.gl, maplibre-gl, wavesurfer.js, framer-motion, recharts, and React Query. Build time is expected to be 2-4 minutes on standard build instances.

---

## Sources

- [AWS Amplify Pricing](https://aws.amazon.com/amplify/pricing/) -- Build minutes, SSR request/duration pricing, free tier details
- [Vercel Pricing](https://vercel.com/pricing) -- Hobby and Pro plan limits, included amounts, overage rates
- [Vercel Pricing Documentation](https://vercel.com/docs/pricing) -- Detailed resource breakdowns and billing model
- [Vercel Hobby Plan](https://vercel.com/docs/plans/hobby) -- Non-commercial restriction details
- [AWS CloudFront Pricing](https://aws.amazon.com/cloudfront/pricing/) -- Flat-rate plans (Nov 2025) and pay-as-you-go rates
- [CloudFront Flat-Rate Pricing Plans Documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html) -- Free/Pro/Business/Premium plan details
- [AWS S3 Pricing](https://aws.amazon.com/s3/pricing/) -- Storage and request costs for us-east-1
- [AWS App Runner Pricing](https://aws.amazon.com/apprunner/pricing/) -- Provisioned/active compute costs
- [AWS Fargate Pricing](https://aws.amazon.com/fargate/pricing/) -- vCPU/memory per-second billing
- [AWS CloudFront Free Tier Expansion](https://aws.amazon.com/blogs/aws/aws-free-tier-data-transfer-expansion-100-gb-from-regions-and-1-tb-from-amazon-cloudfront-per-month/) -- 1 TB always-free data transfer
- [Amplify Next.js SSR Support](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html) -- Supported versions and limitations
- [Amplify SSR Supported Features](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-supported-features.html) -- Edge API Routes, On-Demand ISR limitations
- [Vercel Limits](https://vercel.com/docs/limits) -- Function duration, bandwidth caps, invocation limits
