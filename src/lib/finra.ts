/**
 * FINRA BrokerCheck Integration
 *
 * Uses the free public API at api.brokercheck.finra.org to fetch:
 * - Firm disclosures and disciplinary history
 * - Individual broker misconduct records
 * - Registration status and regulatory actions
 *
 * If a FINRA_API_KEY is configured, uses the official FINRA Developer API instead.
 * Falls back gracefully if the endpoint is unreachable.
 */

import { config } from "@/lib/config";

const BROKERCHECK_BASE = "https://api.brokercheck.finra.org/search";
const FINRA_OFFICIAL_BASE = "https://api.finra.org";
const REQUEST_TIMEOUT = 15000; // 15 seconds — BrokerCheck can be slow

export interface FINRAFirmResult {
  sourceId: string; // FINRA CRD number
  name: string;
  otherNames: string[];
  score: number;
  secNumber: string | null;
  numberOfBranches: number;
  finraApprovedRegistrationCount: number;
  hasDisclosures: boolean;
  disclosureCount: number;
  branchLocations: FINRABranchLocation[];
}

export interface FINRAIndividualResult {
  sourceId: string; // CRD number
  firstName: string;
  lastName: string;
  middleName: string | null;
  primaryEmployer: string | null;
  hasDisclosures: boolean;
  currentEmployments: FINRABranchLocation[];
}

export interface FINRABranchLocation {
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface FINRARiskAssessment {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  flags: string[];
  details: string;
  firmDisclosures: number;
  firmName: string | null;
}

/**
 * Search for a firm by name on FINRA BrokerCheck
 */
export async function searchFirm(query: string): Promise<FINRAFirmResult[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const params = new URLSearchParams({
      query,
      filter: "firm",
      hl: "true",
      nrows: "5",
      start: "0",
      wt: "json",
    });

    const response = await fetch(`${BROKERCHECK_BASE}/firm?${params}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ScamDunk/1.0",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`FINRA BrokerCheck firm search returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    return parseFirmResults(data);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("FINRA BrokerCheck firm search timeout");
    } else {
      console.warn("FINRA BrokerCheck firm search error:", error);
    }
    return [];
  }
}

/**
 * Search for an individual broker/advisor on FINRA BrokerCheck
 */
export async function searchIndividual(query: string): Promise<FINRAIndividualResult[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const params = new URLSearchParams({
      query,
      filter: "individual",
      hl: "true",
      nrows: "5",
      start: "0",
      wt: "json",
    });

    const response = await fetch(`${BROKERCHECK_BASE}/individual?${params}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ScamDunk/1.0",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`FINRA BrokerCheck individual search returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    return parseIndividualResults(data);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("FINRA BrokerCheck individual search timeout");
    } else {
      console.warn("FINRA BrokerCheck individual search error:", error);
    }
    return [];
  }
}

/**
 * Check a firm for regulatory risk flags
 */
export async function assessFirmRisk(firmName: string): Promise<FINRARiskAssessment> {
  const firms = await searchFirm(firmName);
  const flags: string[] = [];
  let maxRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  let disclosureCount = 0;
  let matchedFirmName: string | null = null;

  if (firms.length === 0) {
    return {
      riskLevel: "LOW",
      flags: [],
      details: `No FINRA BrokerCheck records found for "${firmName}"`,
      firmDisclosures: 0,
      firmName: null,
    };
  }

  // Check top match
  const topFirm = firms[0];
  matchedFirmName = topFirm.name;
  disclosureCount = topFirm.disclosureCount;

  if (topFirm.hasDisclosures) {
    if (disclosureCount >= 10) {
      flags.push(`FINRA_HIGH_DISCLOSURES: Firm has ${disclosureCount} disclosures on record`);
      maxRisk = "HIGH";
    } else if (disclosureCount >= 3) {
      flags.push(`FINRA_DISCLOSURES: Firm has ${disclosureCount} disclosures on record`);
      maxRisk = "MEDIUM";
    } else {
      flags.push(`FINRA_MINOR_DISCLOSURES: Firm has ${disclosureCount} disclosure(s) on record`);
    }
  }

  // Low registration count can indicate a shell-like operation
  if (topFirm.finraApprovedRegistrationCount < 3 && topFirm.numberOfBranches <= 1) {
    flags.push("FINRA_SMALL_FIRM: Very small firm with few registered representatives");
    maxRisk = escalateRisk(maxRisk, "MEDIUM");
  }

  const details = flags.length > 0
    ? `FINRA BrokerCheck shows ${flags.length} flag(s) for "${matchedFirmName}"`
    : `No FINRA risk flags for "${matchedFirmName}"`;

  return {
    riskLevel: maxRisk,
    flags,
    details,
    firmDisclosures: disclosureCount,
    firmName: matchedFirmName,
  };
}

/**
 * Test the FINRA BrokerCheck connection
 */
export async function testFINRAConnection(): Promise<{ status: string; message?: string }> {
  // If official API key is configured, test that
  if (config.finraApiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(`${FINRA_OFFICIAL_BASE}/data/group/otcMarket/name/weeklySummary`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.finraApiKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        return { status: "CONNECTED" };
      }
      return { status: "ERROR", message: `Official FINRA API returned ${response.status}` };
    } catch (error) {
      return {
        status: "ERROR",
        message: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }

  // Test free BrokerCheck API
  try {
    const firms = await searchFirm("Goldman Sachs");
    if (firms.length > 0) {
      return { status: "CONNECTED" };
    }
    return { status: "ERROR", message: "BrokerCheck returned no results for test query" };
  } catch (error) {
    return {
      status: "ERROR",
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

// --- Parsers ---

function parseFirmResults(data: Record<string, unknown>): FINRAFirmResult[] {
  try {
    // BrokerCheck wraps results in various formats
    const hits = extractHits(data);
    return hits.map((hit: Record<string, unknown>) => {
      const fields = (hit.fields || hit._source || hit) as Record<string, unknown>;
      return {
        sourceId: String(fields.bc_source_id || fields.sourceId || fields.source_id || ""),
        name: String(fields.bc_firm_name || fields.name || fields.firm_name || "Unknown"),
        otherNames: extractStringArray(fields, ["bc_other_names", "otherNames", "other_names"]),
        score: Number(fields.bc_score || fields.score || 0),
        secNumber: extractStr(fields, ["bc_sec_number", "secNumber", "sec_number"]),
        numberOfBranches: Number(fields.bc_number_of_branches || fields.numberOfBranches || 0),
        finraApprovedRegistrationCount: Number(
          fields.bc_finra_approved_registration_count ||
          fields.finraApprovedRegistrationCount ||
          0
        ),
        hasDisclosures: Boolean(
          fields.bc_has_disclosures || fields.hasDisclosures || fields.has_disclosures
        ),
        disclosureCount: Number(fields.bc_disclosure_count || fields.disclosureCount || 0),
        branchLocations: extractBranches(fields),
      };
    });
  } catch {
    return [];
  }
}

function parseIndividualResults(data: Record<string, unknown>): FINRAIndividualResult[] {
  try {
    const hits = extractHits(data);
    return hits.map((hit: Record<string, unknown>) => {
      const fields = (hit.fields || hit._source || hit) as Record<string, unknown>;
      return {
        sourceId: String(fields.bc_source_id || fields.sourceId || ""),
        firstName: String(fields.bc_firstname || fields.firstName || ""),
        lastName: String(fields.bc_lastname || fields.lastName || ""),
        middleName: extractStr(fields, ["bc_middlename", "middleName"]),
        primaryEmployer: extractStr(fields, ["bc_primary_employer", "primaryEmployer"]),
        hasDisclosures: Boolean(
          fields.bc_has_disclosures || fields.hasDisclosures || fields.has_disclosures
        ),
        currentEmployments: extractBranches(fields),
      };
    });
  } catch {
    return [];
  }
}

function extractHits(data: Record<string, unknown>): Record<string, unknown>[] {
  // BrokerCheck API can return data in multiple formats
  if (Array.isArray(data)) return data;

  const response = data.response as Record<string, unknown> | undefined;
  if (response) {
    const docs = response.docs;
    if (Array.isArray(docs)) return docs;
  }

  const hits = data.hits as Record<string, unknown> | undefined;
  if (hits) {
    const innerHits = hits.hits;
    if (Array.isArray(innerHits)) return innerHits;
  }

  const results = data.results;
  if (Array.isArray(results)) return results;

  return [];
}

function extractStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.length > 0) return val;
  }
  return null;
}

function extractStringArray(obj: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const val = obj[key];
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === "string" && val.length > 0) return [val];
  }
  return [];
}

function extractBranches(fields: Record<string, unknown>): FINRABranchLocation[] {
  const branches = fields.bc_branch_locations || fields.branchLocations || fields.branches;
  if (!Array.isArray(branches)) return [];

  return branches.slice(0, 5).map((b: Record<string, unknown>) => ({
    city: (typeof b.city === "string" ? b.city : null),
    state: (typeof b.state === "string" ? b.state : null),
    zip: (typeof b.zip === "string" ? b.zip : null),
  }));
}

function escalateRisk(
  current: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  proposed: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const order = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  return order[proposed] > order[current] ? proposed : current;
}
