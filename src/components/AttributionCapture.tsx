"use client";

import { useEffect } from "react";

import { captureFirstTouchAttribution } from "@/lib/first-touch-attribution";

/** Persists non-PII first-touch source data before a visitor creates an account. */
export function AttributionCapture() {
  useEffect(() => {
    captureFirstTouchAttribution();
  }, []);

  return null;
}
