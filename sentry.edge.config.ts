/**
 * Sentry Edge Configuration
 *
 * This file configures Sentry for Edge Runtime (middleware, edge functions).
 * It is imported in the Next.js instrumentation file.
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Performance Monitoring
    tracesSampleRate: 0.1, // 10% of transactions for performance monitoring

    // Environment
    environment: process.env.NODE_ENV,

    // Only enable in production
    enabled: process.env.NODE_ENV === "production",

    // Filter out sensitive data
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
      // Scrub API keys from URLs in request and breadcrumbs
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/apikey=[^&]+/gi, "apikey=[REDACTED]");
      }
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data?.url) {
            breadcrumb.data.url = String(breadcrumb.data.url).replace(/apikey=[^&]+/gi, "apikey=[REDACTED]");
          }
          return breadcrumb;
        });
      }
      return event;
    },
  });
}
