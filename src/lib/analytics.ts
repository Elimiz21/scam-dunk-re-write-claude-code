type AnalyticsValue = string | number | boolean;

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

export function trackEvent(
  eventName: string,
  parameters?: Record<string, AnalyticsValue>,
) {
  if (typeof window === "undefined") return;
  const analyticsWindow = window as AnalyticsWindow;
  const args = ["event", eventName, parameters || {}];
  if (typeof analyticsWindow.gtag === "function") {
    analyticsWindow.gtag(...args);
    return;
  }
  analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
  analyticsWindow.dataLayer.push(args);
}
