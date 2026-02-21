/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // WSL2: dev and start scripts bind to 0.0.0.0 via -H flag in package.json
  // If upgrading to Next.js 15+, add allowedDevOrigins for CORS support
};

module.exports = nextConfig;
