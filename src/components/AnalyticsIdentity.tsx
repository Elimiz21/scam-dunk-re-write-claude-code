"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

import { setAnalyticsIdentity } from "@/lib/analytics";

/** Sets non-PII GA4 user properties as soon as an authenticated session exists. */
export function AnalyticsIdentity() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    void fetch("/api/analytics/identity", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((identity) => {
        if (!cancelled && identity) setAnalyticsIdentity(identity);
      })
      .catch(() => {
        // Analytics must never interfere with application authentication.
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return null;
}
