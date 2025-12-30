/**
 * Sentry Client Configuration
 *
 * This file configures Sentry for client-side error tracking.
 * It is imported in the Next.js instrumentation file.
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Performance Monitoring
    tracesSampleRate: 0.1, // 10% of transactions for performance monitoring

    // Session Replay (optional - for debugging user sessions)
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

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
      return event;
    },

    // Ignore common non-actionable errors
    ignoreErrors: [
      // Browser extensions
      /extensions\//i,
      /^chrome:\/\//i,
      // Network errors that are often user-side
      "Network request failed",
      "Failed to fetch",
      "Load failed",
      // User navigation
      "AbortError",
      // Hydration errors (often caused by browser extensions)
      /Hydration failed/i,
      /There was an error while hydrating/i,
    ],
  });
}
