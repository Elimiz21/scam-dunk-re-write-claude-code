type AnalyticsValue = string | number | boolean | null | AnalyticsValue[] | { [key: string]: AnalyticsValue };

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-377T7N93Q6";
const DEDUPE_PREFIX = "scamdunk:ga4:event:";

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

/** Tracks an event once per browser session, avoiding double-click and refresh duplicates. */
export function trackEventOnce(
  eventName: string,
  idempotencyKey: string,
  parameters?: Record<string, AnalyticsValue>,
) {
  if (typeof window === "undefined") return false;
  const storageKey = `${DEDUPE_PREFIX}${eventName}:${idempotencyKey}`;
  try {
    if (window.sessionStorage.getItem(storageKey)) return false;
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    // Tracking must remain non-blocking when session storage is unavailable.
  }
  trackEvent(eventName, parameters);
  return true;
}

export function getAnalyticsClientId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("_ga="))
    ?.split("=")[1];
  if (!cookie) return undefined;
  const match = cookie.match(/^GA\d+\.\d+\.(\d+\.\d+)$/);
  return match?.[1];
}

export function setAnalyticsIdentity(input: {
  userId: string;
  userProperties: {
    user_type: "free" | "paid";
    subscription_plan: "free" | "pro" | "pro_max";
    funnel_stage: "signed_up" | "email_verified" | "started_scanning" | "paid";
  };
}) {
  if (typeof window === "undefined") return;
  const analyticsWindow = window as AnalyticsWindow;
  const userProperties = input.userProperties;
  const setArgs = ["set", "user_properties", userProperties];
  const configArgs = ["config", MEASUREMENT_ID, { user_id: input.userId, user_properties: userProperties, update: true }];
  if (typeof analyticsWindow.gtag === "function") {
    analyticsWindow.gtag(...setArgs);
    analyticsWindow.gtag(...configArgs);
    return;
  }
  analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
  analyticsWindow.dataLayer.push(setArgs, configArgs);
}
