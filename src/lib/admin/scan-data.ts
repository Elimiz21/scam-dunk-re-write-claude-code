/**
 * Shared data-fetching helpers for the scan intelligence dashboard.
 *
 * Reads evaluation data from the scam-dunk-data GitHub repo (public API)
 * with Supabase storage as fallback.
 */

const DATA_REPO = "Elimiz21/scam-dunk-data";
const RAW_BASE = `https://raw.githubusercontent.com/${DATA_REPO}/main`;
const API_BASE = `https://api.github.com/repos/${DATA_REPO}`;

// Cache for the repo file tree so we don't refetch on every request
let _treeCache: { files: RepoFile[]; fetchedAt: number } | null = null;
const TREE_CACHE_TTL = 5 * 60 * 1000; // 5 min

export interface RepoFile {
  path: string;
  size: number;
}

/**
 * Get the full file listing from the data repo.
 */
export async function getRepoTree(): Promise<RepoFile[]> {
  if (_treeCache && Date.now() - _treeCache.fetchedAt < TREE_CACHE_TTL) {
    return _treeCache.files;
  }
  try {
    const res = await fetch(`${API_BASE}/git/trees/main?recursive=1`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`Tree fetch failed: ${res.status}`);
    const data = await res.json();
    const files: RepoFile[] = (data.tree || [])
      .filter((f: { type: string }) => f.type === "blob")
      .map((f: { path: string; size: number }) => ({
        path: f.path,
        size: f.size,
      }));
    _treeCache = { files, fetchedAt: Date.now() };
    return files;
  } catch (err) {
    console.error("Failed to fetch repo tree:", err);
    return _treeCache?.files || [];
  }
}

/**
 * Get all scan dates that have enhanced evaluation results.
 */
export async function getScanDates(): Promise<string[]> {
  const files = await getRepoTree();
  const dates: string[] = [];
  for (const f of files) {
    const m = f.path.match(/evaluation-results\/enhanced-evaluation-(\d{4}-\d{2}-\d{2})\.json/);
    if (m) dates.push(m[1]);
  }
  // Also check for legacy fmp-evaluation files
  for (const f of files) {
    const m = f.path.match(/evaluation-results\/fmp-evaluation-(\d{4}-\d{2}-\d{2})\.json/);
    if (m && !dates.includes(m[1])) dates.push(m[1]);
  }
  return dates.sort().reverse();
}

/**
 * Fetch a small JSON file from the repo using the GitHub Contents API (base64).
 * Best for files < 1MB.
 */
export async function fetchSmallFile<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}/contents/${path}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Fetch a large JSON file from the repo using raw.githubusercontent.com.
 * Supports range requests for partial reads.
 */
export async function fetchLargeFile<T>(
  path: string,
  maxBytes?: number
): Promise<T | null> {
  try {
    const headers: Record<string, string> = {};
    if (maxBytes) {
      headers["Range"] = `bytes=0-${maxBytes}`;
    }
    const res = await fetch(`${RAW_BASE}/${path}`, {
      headers,
      next: { revalidate: 300 },
    });
    if (!res.ok && res.status !== 206) return null;
    const text = await res.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Fetch and parse a partial JSON array (for very large stock arrays).
 * Reads first N bytes and extracts complete objects from the array.
 */
export async function fetchPartialArray<T>(
  path: string,
  maxBytes: number = 500_000
): Promise<T[]> {
  try {
    const res = await fetch(`${RAW_BASE}/${path}`, {
      headers: { Range: `bytes=0-${maxBytes}` },
      next: { revalidate: 300 },
    });
    if (!res.ok && res.status !== 206) return [];
    let text = await res.text();

    // Try to parse complete objects from the partial response
    // Find the last complete object (ends with },)
    const lastComplete = text.lastIndexOf("},");
    if (lastComplete > 0) {
      text = text.substring(0, lastComplete + 1) + "]";
    }
    // Ensure it starts with [
    if (!text.startsWith("[")) {
      text = "[" + text;
    }
    return JSON.parse(text) as T[];
  } catch {
    return [];
  }
}

// ── Types for scan data ──────────────────────────────────────────────

export interface DailyReport {
  date: string;
  totalStocksScanned: number;
  byRiskLevel: { LOW: number; MEDIUM: number; HIGH: number; INSUFFICIENT: number };
  highRiskBeforeFilters: number;
  filteredByMarketCap: number;
  filteredByVolume: number;
  filteredByNews: number;
  remainingSuspicious: number;
  activeSchemes: number;
  newSchemes: number;
  processingTimeMinutes: number;
}

export interface FmpSummary {
  totalStocks: number;
  evaluated: number;
  skippedNoData: number;
  byRiskLevel: { LOW: number; MEDIUM: number; HIGH: number; INSUFFICIENT: number };
  byExchange: Record<string, { total: number; LOW: number; MEDIUM: number; HIGH: number }>;
  startTime: string;
  endTime?: string;
  durationMinutes: number;
  apiCallsMade: number;
}

export interface AILayers {
  layer1_deterministic: number | null;
  layer2_anomaly: number | null;
  layer3_rf: number | null;
  layer4_lstm: number | null;
  combined: number | null;
  usedPythonBackend: boolean;
}

export interface StockSignal {
  code: string;
  category: string;
  weight: number;
  description: string;
}

export interface SocialMention {
  platform: string;
  source: string;
  mentionsFound: number;
  activityLevel: string;
  promotionRisk: string;
}

export interface EnhancedStock {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  marketCap: number | null;
  lastPrice: number | null;
  avgDailyVolume: number | null;
  avgDollarVolume: number | null;
  riskLevel: string;
  totalScore: number;
  signals: StockSignal[];
  aiLayers: AILayers;
  isFiltered: boolean;
  filterReason: string | null;
  hasLegitimateNews: boolean;
  newsAnalysis: string | null;
  recentNews: { title: string; date: string; source: string; url: string }[];
  secFilings: { type: string; date: string; url: string }[];
  socialMediaScanned: boolean;
  socialMediaFindings: {
    socialMediaMentions?: SocialMention[];
    overallPromotionScore?: number;
    promotionRiskLevel?: string;
    overallAssessment?: string;
  } | null;
  schemeId: string | null;
  schemeStatus: string | null;
  evaluatedAt: string;
}

export interface SchemeRecord {
  schemeId: string;
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  firstDetected: string;
  lastSeen: string;
  daysActive: number;
  status: string;
  peakRiskScore: number;
  currentRiskScore: number;
  peakPromotionScore: number;
  currentPromotionScore: number;
  priceAtDetection: number;
  peakPrice: number;
  currentPrice: number;
  priceChangeFromDetection: number;
  priceChangeFromPeak: number;
  promotionPlatforms: string[];
  signalsDetected: string[];
  timeline: { date: string; event: string; category?: string; details?: string; significance?: string }[];
}

export interface SchemeDatabase {
  lastUpdated: string;
  totalSchemes: number;
  activeSchemes: number;
  resolvedSchemes: number;
  confirmedFrauds: number;
  schemes: Record<string, SchemeRecord>;
}

export interface PromotedStock {
  symbol: string;
  name: string;
  riskScore: number;
  price: number;
  marketCap: string;
  tier: string;
  platforms: string[];
  redFlags: string[];
  sources: string[];
  assessment: string;
}

export interface PromotedStocksFile {
  date: string;
  totalHighRiskStocks: number;
  promotedStocks: PromotedStock[];
}

export interface SocialScanFile {
  scanDate: string;
  totalScanned: number;
  socialMediaScannedCount: number;
  highPromotionCount: number;
  mediumPromotionCount: number;
  results: Array<{
    symbol: string;
    name: string;
    riskScore: number;
    signals: string[];
    hasLegitimateNews: boolean;
    newsAnalysis: string;
    recentNews: { title: string; date: string; source: string; url: string }[];
    socialMediaMentions: SocialMention[];
    overallPromotionScore: number;
    promotionRiskLevel: string;
    overallAssessment: string;
  }>;
}

// ── Helper to get the latest scan date ──────────────────────────────

export async function getLatestScanDate(): Promise<string | null> {
  const dates = await getScanDates();
  return dates[0] || null;
}

/**
 * Get the file path for a scan date, preferring enhanced format over legacy.
 */
export function getEvalPath(date: string, files: RepoFile[]): string | null {
  const enhanced = `evaluation-results/enhanced-evaluation-${date}.json`;
  const legacy = `evaluation-results/fmp-evaluation-${date}.json`;
  if (files.some((f) => f.path === enhanced)) return enhanced;
  if (files.some((f) => f.path === legacy)) return legacy;
  return null;
}

export function getHighRiskPath(date: string, files: RepoFile[]): string | null {
  const enhanced = `evaluation-results/enhanced-high-risk-${date}.json`;
  const legacy = `evaluation-results/fmp-high-risk-${date}.json`;
  if (files.some((f) => f.path === enhanced)) return enhanced;
  if (files.some((f) => f.path === legacy)) return legacy;
  return null;
}
