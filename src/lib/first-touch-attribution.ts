export const FIRST_TOUCH_COOKIE = "scamdunk_first_touch";
const MAX_VALUE_LENGTH = 120;

export type FirstTouchAttribution = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrerHost: string | null;
  clientId: string | null;
};

type FirstTouchInput = {
  source?: unknown;
  medium?: unknown;
  campaign?: unknown;
  referrer?: unknown;
  referrerHost?: unknown;
  clientId?: unknown;
  siteHost?: unknown;
};

function cleanValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, MAX_VALUE_LENGTH);
  return cleaned ? cleaned.toLowerCase() : null;
}

function referrerHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

function storedHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const host = value.trim().toLowerCase();
  if (!host || host.length > MAX_VALUE_LENGTH || !/^[a-z0-9.-]+$/.test(host)) return null;
  try {
    return new URL(`https://${host}`).hostname === host ? host : null;
  } catch {
    return null;
  }
}

function validClientId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clientId = value.trim();
  return /^\d+\.\d+$/.test(clientId) && clientId.length <= 80 ? clientId : null;
}

/**
 * Produces a safe, first-party attribution record. Referrer paths and query
 * strings are intentionally discarded so neither personal data nor opaque
 * campaign payloads enter the user database.
 */
export function parseFirstTouchAttribution(input: FirstTouchInput): FirstTouchAttribution {
  const host = referrerHost(input.referrer) ?? storedHost(input.referrerHost);
  const siteHost = cleanValue(input.siteHost);
  const isInternalReferrer = Boolean(host && siteHost && host === siteHost);
  const source = cleanValue(input.source) ?? (isInternalReferrer ? "direct" : host ?? "direct");
  const medium = cleanValue(input.medium) ?? (isInternalReferrer || !host ? "none" : "referral");

  return {
    source,
    medium,
    campaign: cleanValue(input.campaign),
    referrerHost: host,
    clientId: validClientId(input.clientId),
  };
}

export function serializeFirstTouchAttribution(attribution: FirstTouchAttribution): string {
  return encodeURIComponent(JSON.stringify(attribution));
}

export function deserializeFirstTouchAttribution(value: string | undefined): FirstTouchAttribution | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as FirstTouchInput;
    return parseFirstTouchAttribution(parsed);
  } catch {
    return null;
  }
}

export function userAttributionData(attribution: FirstTouchAttribution) {
  return {
    firstTouchSource: attribution.source,
    firstTouchMedium: attribution.medium,
    firstTouchCampaign: attribution.campaign,
    firstTouchReferrerHost: attribution.referrerHost,
    firstTouchClientId: attribution.clientId,
  };
}

/** Captures first touch in a short-lived first-party cookie before signup. */
export function captureFirstTouchAttribution() {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const existing = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${FIRST_TOUCH_COOKIE}=`))
    ?.slice(FIRST_TOUCH_COOKIE.length + 1);
  const persisted = deserializeFirstTouchAttribution(existing);
  if (persisted) return persisted;

  const params = new URLSearchParams(window.location.search);
  const attribution = parseFirstTouchAttribution({
    source: params.get("utm_source"),
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
    referrer: document.referrer,
    clientId: document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("_ga="))
      ?.split("=")[1]
      ?.match(/^GA\d+\.\d+\.(\d+\.\d+)$/)?.[1],
    siteHost: window.location.hostname,
  });
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${FIRST_TOUCH_COOKIE}=${serializeFirstTouchAttribution(attribution)}; Path=/; Max-Age=7776000; SameSite=Lax${secure}`;
  return attribution;
}
