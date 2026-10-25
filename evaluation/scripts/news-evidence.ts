import { createHash } from "crypto";

export interface EvidenceWindow { from: string; through: string }
export interface SourceEvidence {
  source: string;
  status: "FOUND" | "EMPTY" | "ERROR" | "UNAVAILABLE";
  symbol: string;
  window: EvidenceWindow;
  retrievedAt: string;
  requests: number;
  errorCode?: string;
  items: Array<{ id: string; publishedDate: string | null; eligible: boolean; exclusion: string | null; raw: Record<string, unknown> }>;
}

function date(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) return null;
  return day;
}
export function evidenceWindow(through: string, lookbackDays = 7): EvidenceWindow {
  if (date(through) !== through || !Number.isInteger(lookbackDays) || lookbackDays < 0 || lookbackDays > 90) throw new Error("Invalid news evidence window");
  return { from: new Date(Date.parse(through) - lookbackDays * 86_400_000).toISOString().slice(0,10), through };
}

export async function retrieveEvidence(options: { source: string; symbol: string; window: EvidenceWindow; available: boolean; retrieve: () => Promise<unknown> }): Promise<SourceEvidence> {
  const result: SourceEvidence = { source: options.source, symbol: options.symbol, window: options.window, retrievedAt: new Date().toISOString(), requests: 0, status: "UNAVAILABLE", items: [] };
  if (!options.available) return result;
  result.requests = 1;
  try {
    const rows = await options.retrieve();
    if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("invalid_response");
    result.status = rows.length ? "FOUND" : "EMPTY";
    result.items = rows.map((raw: Record<string, unknown>) => {
      const publishedDate = date(raw.publishedDate ?? raw.acceptedDate ?? raw.fillingDate ?? raw.filingDate ?? raw.date);
      const identityConflict = typeof raw.symbol === "string" && !raw.symbol.toUpperCase().split(",").map(value => value.trim()).includes(options.symbol.toUpperCase());
      const exclusion = identityConflict ? "INSTRUMENT_MISMATCH" : !publishedDate ? "UNKNOWN_PUBLICATION_DATE" : publishedDate > options.window.through ? "FUTURE_EVIDENCE" : publishedDate < options.window.from ? "OUTSIDE_WINDOW" : null;
      return { id: createHash("sha256").update(JSON.stringify([options.source, options.symbol, raw])).digest("hex"), publishedDate, eligible: exclusion === null, exclusion, raw };
    });
  } catch (error) {
    // Provider exceptions may contain authenticated URLs. Retain a safe code.
    result.status = "ERROR";
    result.errorCode = error instanceof Error && /^(entitlement|missing_credential|budget_exhausted|invalid_response|provider_error|provider_http_\d+)$/.test(error.message) ? error.message : "RETRIEVAL_FAILED";
  }
  return result;
}

export function retrievalComplete(sources: SourceEvidence[]) {
  return sources.length === 3 && new Set(sources.map(source => source.source)).size === 3 && sources.every(source => ["news", "sec_filings", "press_releases"].includes(source.source)) && sources.every((source) => source.status === "FOUND" || source.status === "EMPTY");
}

/** FMP supports pages 0..100. A capped or stalled traversal stays incomplete. */
export async function retrievePagedEvidence(options: Omit<Parameters<typeof retrieveEvidence>[0], "retrieve"> & { pageSize?: number; maxPages?: number; retrieve: (page: number) => Promise<unknown> }): Promise<SourceEvidence> {
  const pageSize = options.pageSize ?? 100;
  const maxPages = Math.min(options.maxPages ?? 101, 101);
  let combined: SourceEvidence | undefined;
  for (let page = 0; page < maxPages; page++) {
    const next = await retrieveEvidence({ ...options, retrieve: () => options.retrieve(page) });
    if (!combined) combined = { ...next, requests: 0, items: [] };
    combined.requests += next.requests;
    if (next.status === "ERROR" || next.status === "UNAVAILABLE") return { ...combined, status: next.status, errorCode: next.errorCode };
    const seen = new Set(combined.items.map((item) => item.id));
    const additions = next.items.filter((item) => !seen.has(item.id));
    combined.items.push(...additions);
    if (next.items.length < pageSize) return { ...combined, status: combined.items.length ? "FOUND" : "EMPTY" };
    if (additions.length === 0) return { ...combined, status: "ERROR", errorCode: "PAGINATION_STALLED" };
  }
  return { ...combined!, status: "ERROR", errorCode: "PAGINATION_LIMIT" };
}

export function validClearance(ids: unknown, sources: SourceEvidence[]): ids is string[] {
  if (!retrievalComplete(sources) || !Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) return false;
  const eligible = new Set(sources.flatMap((source) => source.items.filter((item) => item.eligible).map((item) => item.id)));
  return new Set(ids).size === ids.length && ids.every((id) => eligible.has(id));
}

const materialEvents: Record<string,RegExp> = {
 EARNINGS:/earnings|financial results|quarterly results|revenue|net income|eps/i,
 GUIDANCE:/guidance|outlook|forecast/i, FDA_TRIAL:/fda|clinical|trial|drug approval/i,
 CONTRACT:/contract|agreement|partnership|purchase order/i,
 MERGER:/merger|acquisition|acquire[ds]?|takeover|tender offer/i,
 REGULATORY_APPROVAL:/approval|approved|authorization|licen[cs]e/i,
 PRODUCT_LAUNCH:/launch|unveil|new product/i,
 MANAGEMENT_CHANGE:/appoint|resign|ceo|chief executive|chair/i,
 CORPORATE_ACTION:/split|dividend|spin.off|buyback|repurchase/i,
 LEGAL_RESOLUTION:/settle|settlement|verdict|ruling|litigation|lawsuit/i,
 FINANCING:/financing|placement|offering|funding|capital rais|credit facility|convertible|debt|raises?\b/i,
};
export const MATERIAL_EVENT_TYPES=Object.keys(materialEvents);
/** Clearance needs literal substantive content; filing metadata alone cannot prove an event. */
export function groundedClearance(ids: unknown, quotes: unknown, eventType: unknown, sources: SourceEvidence[]): boolean {
 if(!validClearance(ids,sources)||typeof eventType!=="string"||!materialEvents[eventType]||!Array.isArray(quotes))return false;
 const normalize=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim();
 return (ids as string[]).every(id=>{
  const item=sources.flatMap(source=>source.items).find(row=>row.id===id&&row.eligible);
  const quote=quotes.find(row=>row && row.evidenceId===id)?.quote;
  if(!item || typeof quote!=="string" || quote.trim().length<12 || quote.length>240 || !materialEvents[eventType].test(quote))return false;
  const content=["title","text","description","body","content"].map(key=>typeof item.raw?.[key]==="string"?item.raw[key]:"").filter(Boolean).join(" ");
  return normalize(content).includes(normalize(quote));
 });
}
