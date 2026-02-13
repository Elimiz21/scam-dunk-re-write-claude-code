/**
 * OTC Markets Integration
 *
 * Uses the free public backend API at backend.otcmarkets.com to fetch:
 * - Market tier (OTCQX, OTCQB, Pink, Grey Market, Expert Market)
 * - Caveat Emptor (Buyer Beware) flag
 * - Shell risk designation
 * - Compliance status
 *
 * If an OTC_MARKETS_API_KEY is configured, uses the paid API instead.
 * Falls back gracefully if the endpoint is unreachable.
 */

import { config } from "@/lib/config";

const OTC_PUBLIC_BASE = "https://backend.otcmarkets.com/otcapi";
const REQUEST_TIMEOUT = 10000; // 10 seconds

export interface OTCCompanyProfile {
  symbol: string;
  companyName: string | null;
  tierCode: string | null; // QX, QB, PS (Pink Current), PN (Pink Limited), PC (Pink No Info), EM (Expert Market)
  tierName: string | null; // Full display name of the tier
  caveatEmptor: boolean;
  shellRisk: boolean;
  isDelinquent: boolean;
  isShell: boolean;
  isDarkOrDefunct: boolean;
  complianceStatus: string | null;
  market: string | null;
  securityType: string | null;
  stateOfIncorporation: string | null;
  countryOfIncorporation: string | null;
  numberOfEmployees: number | null;
  outstandingShares: number | null;
  hasPromotion: boolean;
  // Raw data for debugging
  raw?: Record<string, unknown>;
}

export interface OTCRiskAssessment {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  flags: string[];
  tierWarning: string | null;
  details: string;
}

/**
 * Tier risk mapping — higher tiers are safer
 */
const TIER_RISK: Record<string, { level: string; warning: string | null }> = {
  QX: { level: "LOW", warning: null },
  QB: { level: "LOW", warning: null },
  PS: { level: "MEDIUM", warning: "Pink Current Information — limited reporting" },
  PN: { level: "HIGH", warning: "Pink Limited Information — minimal disclosure" },
  PC: { level: "HIGH", warning: "Pink No Information — no public disclosure" },
  EM: { level: "CRITICAL", warning: "Expert Market — restricted, high risk" },
  GM: { level: "CRITICAL", warning: "Grey Market — no market maker quotes, unsolicited only" },
};

/**
 * Fetch company profile from OTC Markets free public API
 */
export async function fetchOTCProfile(ticker: string): Promise<OTCCompanyProfile | null> {
  const symbol = ticker.toUpperCase().trim();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const url = `${OTC_PUBLIC_BASE}/company/profile/full/${encodeURIComponent(symbol)}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "ScamDunk/1.0",
    };

    // If paid API key is configured, add it
    if (config.otcMarketsApiKey) {
      headers["Authorization"] = `Bearer ${config.otcMarketsApiKey}`;
    }

    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 404) {
        // Stock not found on OTC Markets — not an OTC stock
        return null;
      }
      console.warn(`OTC Markets API returned ${response.status} for ${symbol}`);
      return null;
    }

    const data = await response.json();

    return parseOTCProfile(symbol, data);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`OTC Markets API timeout for ${symbol}`);
    } else {
      console.warn(`OTC Markets API error for ${symbol}:`, error);
    }
    return null;
  }
}

/**
 * Parse the OTC Markets API response into a structured profile
 */
function parseOTCProfile(symbol: string, data: Record<string, unknown>): OTCCompanyProfile {
  // The API returns nested data — extract from various possible structures
  const profile = (data as Record<string, Record<string, unknown>>).profileData || data;
  const security = (data as Record<string, Record<string, unknown>>).securityData || data;

  return {
    symbol,
    companyName: extractString(profile, ["name", "companyName", "issuerName"]),
    tierCode: extractString(security, ["tierCode", "tierName", "tier"]),
    tierName: extractString(security, ["tierDisplayName", "tierGroupName", "tierName"]),
    caveatEmptor: extractBoolean(security, ["caveatEmptor", "isCaveatEmptor"]),
    shellRisk: extractBoolean(security, ["shellRisk", "isShellRisk", "isShell"]),
    isDelinquent: extractBoolean(security, ["isDelinquent", "delinquent"]),
    isShell: extractBoolean(security, ["isShell", "shellStatus"]),
    isDarkOrDefunct: extractBoolean(security, ["isDark", "isDefunct", "isDarkOrDefunct"]),
    complianceStatus: extractString(security, ["complianceStatus", "reportingStatus"]),
    market: extractString(security, ["market", "marketName"]),
    securityType: extractString(security, ["securityType", "type"]),
    stateOfIncorporation: extractString(profile, ["stateOfIncorporation", "state"]),
    countryOfIncorporation: extractString(profile, ["countryOfIncorporation", "country"]),
    numberOfEmployees: extractNumber(profile, ["numberOfEmployees", "employees"]),
    outstandingShares: extractNumber(security, ["outstandingShares", "sharesOutstanding"]),
    hasPromotion: extractBoolean(security, ["hasPromotion", "isPromoted", "promotionStatus"]),
    raw: data as Record<string, unknown>,
  };
}

/**
 * Assess OTC risk based on profile data
 */
export function assessOTCRisk(profile: OTCCompanyProfile): OTCRiskAssessment {
  const flags: string[] = [];
  let maxRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";

  // Caveat Emptor — highest risk flag
  if (profile.caveatEmptor) {
    flags.push("CAVEAT_EMPTOR: OTC Markets has issued a Buyer Beware warning");
    maxRisk = "CRITICAL";
  }

  // Shell risk
  if (profile.shellRisk || profile.isShell) {
    flags.push("SHELL_RISK: Company identified as a shell or blank-check entity");
    maxRisk = escalateRisk(maxRisk, "HIGH");
  }

  // Dark or defunct
  if (profile.isDarkOrDefunct) {
    flags.push("DARK_DEFUNCT: Company is dark (no quotes) or defunct");
    maxRisk = escalateRisk(maxRisk, "HIGH");
  }

  // Delinquent reporting
  if (profile.isDelinquent) {
    flags.push("DELINQUENT: Company is delinquent in required filings");
    maxRisk = escalateRisk(maxRisk, "MEDIUM");
  }

  // Promotion activity
  if (profile.hasPromotion) {
    flags.push("PROMOTED: Active stock promotion detected");
    maxRisk = escalateRisk(maxRisk, "HIGH");
  }

  // Tier-based risk
  let tierWarning: string | null = null;
  if (profile.tierCode) {
    const tierInfo = TIER_RISK[profile.tierCode];
    if (tierInfo) {
      tierWarning = tierInfo.warning;
      if (tierInfo.level === "CRITICAL") maxRisk = escalateRisk(maxRisk, "CRITICAL");
      else if (tierInfo.level === "HIGH") maxRisk = escalateRisk(maxRisk, "HIGH");
      else if (tierInfo.level === "MEDIUM") maxRisk = escalateRisk(maxRisk, "MEDIUM");
    }
  }

  const details = flags.length > 0
    ? `OTC Markets data shows ${flags.length} risk flag(s) for ${profile.symbol}`
    : `No OTC Markets risk flags found for ${profile.symbol}`;

  return { riskLevel: maxRisk, flags, tierWarning, details };
}

/**
 * Test the OTC Markets connection
 */
export async function testOTCMarketsConnection(): Promise<{ status: string; message?: string }> {
  try {
    // Test with a well-known OTC stock
    const profile = await fetchOTCProfile("TCEHY");
    if (profile) {
      return { status: "CONNECTED" };
    }

    // Try the screener endpoint as fallback test
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(
      `${OTC_PUBLIC_BASE}/company/profile/full/AAPL`,
      {
        headers: { Accept: "application/json", "User-Agent": "ScamDunk/1.0" },
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (response.ok || response.status === 404) {
      // 404 is fine — means the API is reachable but AAPL isn't OTC-listed
      return { status: "CONNECTED" };
    }

    return { status: "ERROR", message: `API returned status ${response.status}` };
  } catch (error) {
    return {
      status: "ERROR",
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

// --- Helpers ---

function extractString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.length > 0) return val;
  }
  return null;
}

function extractBoolean(obj: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "boolean") return val;
    if (val === "true" || val === "Y" || val === 1) return true;
  }
  return false;
}

function extractNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "number" && !isNaN(val)) return val;
  }
  return null;
}

function escalateRisk(
  current: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  proposed: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const order = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  return order[proposed] > order[current] ? proposed : current;
}
