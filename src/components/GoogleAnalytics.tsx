"use client";

import { useEffect } from "react";

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-377T7N93Q6";
const SCRIPT_ID = "scamdunk-google-analytics-script";

type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: (...args: unknown[]) => void;
};

/** Initializes GA4 after hydration so the executable code always runs. */
export function GoogleAnalytics() {
  useEffect(() => {
    const analyticsWindow = window as AnalyticsWindow;
    analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
    function gtag(...args: unknown[]) {
      analyticsWindow.dataLayer?.push(args);
    }
    analyticsWindow.gtag = analyticsWindow.gtag || gtag;
    analyticsWindow.gtag("js", new Date());
    analyticsWindow.gtag("config", MEASUREMENT_ID);

    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(script);
  }, []);

  return null;
}
