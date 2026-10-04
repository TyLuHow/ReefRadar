# ReefRadar Dashboard (Next.js)

A modern React/Next.js web dashboard for the ReefRadar coral reef acoustic health analysis API.

## Features

- **Audio Analysis**: Upload underwater audio recordings for AI-powered health classification
- **Drag & Drop Upload**: Easy file upload with validation (WAV format, max 10MB)
- **Real-time Progress**: Visual feedback during upload and analysis
- **Results Visualization**: Classification display with confidence scores and probability distribution
- **Embedding Chart**: 2D visualization of acoustic embedding space
- **Reference Sites**: Browse reference reef sites used for comparison
- **API Status**: Real-time API health monitoring

## Tech Stack

- **Framework**: Next.js 16 (React 19) with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Data Fetching**: TanStack Query (React Query)
- **Charts**: Observable Plot and d3 modules (`src/features/charts`)
- **Maps**: MapLibre (`maplibre-gl` with `react-map-gl/maplibre`, `src/features/map`)
- **Icons**: Lucide React
- **Notifications**: Sonner

## Getting Started

### Prerequisites

- Node.js 20.9+
- npm or yarn

### Installation

```bash
# Navigate to the dashboard directory
cd dashboard-next

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Start development server
npm run dev
```

The dashboard will be available at [http://localhost:3000](http://localhost:3000).

### Environment Variables

Create a `.env.local` file with:

```env
NEXT_PUBLIC_API_URL=https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod
```

## Project Structure

```
dashboard-next/
├── src/
│   ├── app/
│   │   ├── page.tsx          # Main analyze page
│   │   ├── sites/page.tsx    # Reference sites gallery
│   │   ├── about/page.tsx    # About and architecture
│   │   ├── layout.tsx        # Root layout with nav
│   │   ├── providers.tsx     # React Query provider
│   │   └── globals.css       # Global styles
│   ├── components/
│   │   ├── Navbar.tsx        # Navigation bar
│   │   ├── FileUpload.tsx    # Drag & drop upload
│   │   ├── AnalysisProgress.tsx  # Progress indicator
│   │   ├── AnalysisResults.tsx   # Results display
│   │   ├── EmbeddingChart.tsx    # 2D scatter plot
│   │   ├── SiteCard.tsx      # Site info card
│   │   ├── LoadingSpinner.tsx    # Loading states
│   │   └── Toast.tsx         # Notifications
│   ├── lib/
│   │   ├── api.ts            # API client
│   │   └── utils.ts          # Utility functions
│   └── types/
│       └── index.ts          # TypeScript types
├── package.json
├── tailwind.config.js
├── next.config.js
├── tsconfig.json
└── README.md
```

## Building for Production

### Static Export (for S3 + CloudFront)

```bash
# Build the static export
npm run build

# The output will be in the 'out' directory
```

### Deployment to S3 + CloudFront

1. **Create S3 Bucket**:
   ```bash
   aws s3 mb s3://reefradar-dashboard --region us-east-1
   ```

2. **Configure for Static Website Hosting**:
   ```bash
   aws s3 website s3://reefradar-dashboard \
     --index-document index.html \
     --error-document 404.html
   ```

3. **Deploy Static Files**:
   ```bash
   # Sync the built files
   aws s3 sync out/ s3://reefradar-dashboard --delete

   # Set cache headers for assets
   aws s3 cp s3://reefradar-dashboard s3://reefradar-dashboard \
     --recursive \
     --metadata-directive REPLACE \
     --cache-control "max-age=31536000,public" \
     --exclude "*" \
     --include "*.js" \
     --include "*.css" \
     --include "*.woff2"
   ```

4. **Create CloudFront Distribution**:
   ```bash
   aws cloudfront create-distribution \
     --origin-domain-name reefradar-dashboard.s3.amazonaws.com \
     --default-root-object index.html
   ```

5. **Configure CloudFront for SPA Routing**:
   - Create custom error response for 403/404 -> /index.html with 200 status

### Quick Deploy Script

```bash
#!/bin/bash
# deploy.sh

# Build
npm run build

# Deploy to S3
aws s3 sync out/ s3://reefradar-dashboard --delete

# Invalidate CloudFront cache (replace DISTRIBUTION_ID)
aws cloudfront create-invalidation \
  --distribution-id DISTRIBUTION_ID \
  --paths "/*"

echo "Deployed successfully!"
```

## API Integration

The dashboard connects to the ReefRadar API:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/sites` | GET | List reference sites |
| `/upload` | POST | Upload audio file |
| `/analyze` | POST | Start analysis |
| `/visualize/{id}` | GET | Get results |

## Development

### Running Tests

```bash
npm run lint
```

### Code Style

- TypeScript for type safety
- ESLint for code quality
- Prettier for formatting (recommended)

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Performance

- Static export for optimal loading
- Code splitting via Next.js
- Image optimization disabled for static export
- Target initial bundle < 500KB

## Dev fixtures route

`/dev/fixtures/` is a dev-only review surface that renders every design-system primitive in every state. It exists only in builds made with `NEXT_PUBLIC_DEV_FIXTURES=1`:

```bash
NEXT_PUBLIC_DEV_FIXTURES=1 npm run dev
# then open http://localhost:3000/dev/fixtures/
```

- **Never set `NEXT_PUBLIC_DEV_FIXTURES` in Vercel.** The Playwright config sets it for the e2e and visual builds only.
- `next.config.js` always defines the flag at build time (`'1'` or `'0'`). Next.js only substitutes a `NEXT_PUBLIC_` variable that is defined, so without that line the flag-gated dynamic import is not eliminated and the fixtures ship in production.
- CI proves the production build excludes it: after the flag-less `npm run build`, `node ../scripts/check-dev-fixtures-excluded.mjs` fails if the fixtures marker string appears anywhere in `.next/static` or `.next/server`, or if `/dev/fixtures/` or `/dev/fixtures/tokens/` answer anything but HTTP 404.
- URL parameters (closed allowlists): `?direction=atlas|nocturne|poster`, `?reduced=1`, and `?tok=--dir-<name>:%23RRGGBB` (hex values only, at most 8) to probe a token.
- The route is `noindex` (page metadata and an `X-Robots-Tag` header for `/dev/*`) and is not linked from the product.

## Troubleshooting

### CORS Issues
The API is configured to allow requests from any origin. If you encounter CORS issues, verify the API Gateway CORS configuration.

### Build Errors
Ensure you have Node.js 18+ installed:
```bash
node --version
```

### API Connection Issues
Check the API health endpoint:
```bash
curl https://rgoe4pqatf.execute-api.us-east-1.amazonaws.com/prod/health
```

## License

MIT
