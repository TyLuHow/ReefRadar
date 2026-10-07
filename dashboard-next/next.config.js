// The dev fixtures route and its synthetic or fixture content must never ship to production. Fail the
// build loudly when the flag is on for a Vercel production deployment (VERCEL_ENV is set by Vercel:
// 'production', 'preview' or 'development'). Previews and local or CI builds may still enable it.
if (process.env.NEXT_PUBLIC_DEV_FIXTURES === '1' && process.env.VERCEL_ENV === 'production') {
  throw new Error(
    'NEXT_PUBLIC_DEV_FIXTURES=1 must not be set for a production build: it would ship the /dev/fixtures route. ' +
      'Remove the variable from the Vercel Production environment.',
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Stop `next dev` writing AGENTS.md / CLAUDE.md into this folder (Next 16 default is on).
  agentRules: false,
  // Always define the dev-fixtures flag at build time (04-06). Next only substitutes a NEXT_PUBLIC_
  // variable when it is defined; left undefined, the `=== '1'` branch in app/dev/fixtures/page.tsx
  // is not eliminated and the fixtures chunk ships in production. Only the exact value '1' enables
  // the route. Never set NEXT_PUBLIC_DEV_FIXTURES in Vercel.
  env: {
    NEXT_PUBLIC_DEV_FIXTURES: process.env.NEXT_PUBLIC_DEV_FIXTURES === '1' ? '1' : '0',
  },
};

module.exports = nextConfig;
