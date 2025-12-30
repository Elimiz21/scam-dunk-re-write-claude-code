/**
 * Sentry Server Configuration
 *
 * This file configures Sentry for server-side error tracking.
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
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
      // Remove sensitive data from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data?.password) {
            breadcrumb.data.password = "[REDACTED]";
          }
          return breadcrumb;
        });
      }
      return event;
    },

    // Ignore common non-actionable errors
    ignoreErrors: [
      // Rate limiting (expected behavior)
      "Too many requests",
      // Auth errors (expected for invalid credentials)
      "Invalid email or password",
      "Unauthorized",
    ],
  });
}
