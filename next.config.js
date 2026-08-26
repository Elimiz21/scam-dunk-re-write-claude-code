const { withSentryConfig } = require("@sentry/nextjs");

// Security headers applied to every response. CSP is intentionally permissive
// for the third-party widgets this app embeds (Turnstile, PayPal, Vercel
// analytics, Sentry) while still blocking framing and forcing HTTPS.
const ContentSecurityPolicy = [
  "default-src 'self'",
  // Next.js requires 'unsafe-inline'/'unsafe-eval' for its runtime; the third
  // parties below are the script origins actually loaded by the app.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://www.paypal.com https://www.paypalobjects.com https://*.vercel-scripts.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "frame-src 'self' https://challenges.cloudflare.com https://www.paypal.com https://www.youtube.com https://www.youtube-nocookie.com",
  "connect-src 'self' https://challenges.cloudflare.com https://www.paypal.com https://api.paypal.com https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://vitals.vercel-insights.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: ContentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    instrumentationHook: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // Suppresses source map uploading logs during build
  silent: true,
  // Organization and project are set via environment variables
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
};

// Only wrap with Sentry if DSN is configured
const config = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions, {
      // Upload source maps to Sentry
      widenClientFileUpload: true,
      // Hides source maps from generated client bundles
      hideSourceMaps: true,
      // Automatically tree-shake Sentry logger statements
      disableLogger: true,
    })
  : nextConfig;

module.exports = config;
