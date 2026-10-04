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
