/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Stop `next dev` writing AGENTS.md / CLAUDE.md into this folder (Next 16 default is on).
  agentRules: false,
  // Transpile deck.gl ESM packages for Next.js compatibility.
  // Remove with deck.gl itself (plan 03-08).
  transpilePackages: [
    '@deck.gl/core',
    '@deck.gl/layers',
    '@deck.gl/react',
  ],
};

module.exports = nextConfig;
