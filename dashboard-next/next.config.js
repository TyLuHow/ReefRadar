/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Stop `next dev` writing AGENTS.md / CLAUDE.md into this folder (Next 16 default is on).
  agentRules: false,
};

module.exports = nextConfig;
