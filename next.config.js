/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  env: {
    // Auto-detect NEXTAUTH_URL for Vercel deployments (preview and production)
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  },
};

module.exports = nextConfig;
