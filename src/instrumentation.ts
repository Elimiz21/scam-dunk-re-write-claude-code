/**
 * Next.js Instrumentation
 *
 * This file is used to initialize Sentry for error monitoring.
 * It's called once when the Next.js server starts.
 */
import * as Sentry from "@sentry/nextjs";

export const onRequestError = Sentry.captureRequestError;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateRequiredEnvVars } = await import("@/lib/config");
    validateRequiredEnvVars();
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
