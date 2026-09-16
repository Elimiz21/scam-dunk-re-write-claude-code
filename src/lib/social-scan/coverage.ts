export type PlatformCoverageStatus =
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "SKIPPED";

export interface PlatformCoverage {
  scanner: string;
  platform: string;
  status: PlatformCoverageStatus;
  submittedTickers: string[];
  attemptedTickers: string[];
  searchedTickers: string[];
  failedTickers: string[];
  rateLimitedTickers: string[];
  skippedTickers: string[];
  error?: string;
}

export class CoverageTracker {
  private readonly submitted: string[];
  private readonly attemptedSet = new Set<string>();
  private readonly searchedSet = new Set<string>();
  private readonly failedSet = new Set<string>();
  private readonly rateLimitedSet = new Set<string>();
  private readonly errors: string[] = [];

  constructor(
    private readonly scanner: string,
    private readonly platform: string,
    submittedTickers: string[],
  ) {
    this.submitted = stringArray(submittedTickers);
  }

  attempt(ticker: string): void {
    this.attemptedSet.add(ticker.trim().toUpperCase());
  }

  searched(ticker: string): void {
    const normalized = ticker.trim().toUpperCase();
    this.attemptedSet.add(normalized);
    this.searchedSet.add(normalized);
  }

  searchedAll(): void {
    for (const ticker of this.submitted) this.searched(ticker);
  }

  partialAll(error: string): void {
    for (const ticker of this.submitted) {
      this.failed(ticker, { error });
    }
  }

  failed(
    ticker: string,
    options: { rateLimited?: boolean; error?: string } = {},
  ): void {
    const normalized = ticker.trim().toUpperCase();
    this.attemptedSet.add(normalized);
    this.failedSet.add(normalized);
    if (options.rateLimited) this.rateLimitedSet.add(normalized);
    if (options.error && !this.errors.includes(options.error)) {
      this.errors.push(options.error);
    }
  }

  finish(): PlatformCoverage {
    const attemptedTickers = this.submitted.filter((ticker) =>
      this.attemptedSet.has(ticker),
    );
    const searchedTickers = this.submitted.filter((ticker) =>
      this.searchedSet.has(ticker),
    );
    const failedTickers = this.submitted.filter((ticker) =>
      this.failedSet.has(ticker),
    );
    const rateLimitedTickers = this.submitted.filter((ticker) =>
      this.rateLimitedSet.has(ticker),
    );
    const accounted = new Set([...searchedTickers, ...failedTickers]);
    const skippedTickers = this.submitted.filter(
      (ticker) => !accounted.has(ticker),
    );
    const status: PlatformCoverageStatus =
      searchedTickers.length === this.submitted.length &&
      failedTickers.length === 0
        ? "COMPLETED"
        : searchedTickers.length === 0 && failedTickers.length > 0
          ? "FAILED"
          : attemptedTickers.length === 0
            ? "SKIPPED"
            : "PARTIAL";
    return {
      scanner: this.scanner,
      platform: this.platform,
      status,
      submittedTickers: [...this.submitted],
      attemptedTickers,
      searchedTickers,
      failedTickers,
      rateLimitedTickers,
      skippedTickers,
      error: this.errors.length > 0 ? this.errors.join("; ") : undefined,
    };
  }
}

export interface SocialRunMetadata {
  version: 2;
  scanners: string[];
  stats: Record<string, unknown>;
  submittedTickers: string[];
  persistence: {
    submitted: number;
    inserted: number;
    duplicates: number;
    rejected: number;
    unprocessed: number;
    timedOut: boolean;
    transientRetries: number;
  };
  coverage: PlatformCoverage[];
}

export type TickerCoverageStatus =
  | "COMPLETE"
  | "PARTIAL"
  | "NOT_SEARCHED"
  | "NOT_TARGETED"
  | "UNKNOWN";

export interface TickerCoverage {
  status: TickerCoverageStatus;
  searchedPlatforms: string[];
  incompletePlatforms: string[];
  rateLimitedPlatforms: string[];
}

function emptyMetadata(): SocialRunMetadata {
  return {
    version: 2,
    scanners: [],
    stats: {},
    submittedTickers: [],
    persistence: {
      submitted: 0,
      inserted: 0,
      duplicates: 0,
      rejected: 0,
      unprocessed: 0,
      timedOut: false,
      transientRetries: 0,
    },
    coverage: [],
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

export function parseRunMetadata(value: unknown): SocialRunMetadata {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return emptyMetadata();
    }
  }
  if (Array.isArray(parsed)) {
    return {
      ...emptyMetadata(),
      scanners: parsed.filter(
        (scanner): scanner is string => typeof scanner === "string",
      ),
    };
  }
  if (!parsed || typeof parsed !== "object") return emptyMetadata();

  const source = parsed as Record<string, unknown>;
  const persistenceSource =
    source.persistence && typeof source.persistence === "object"
      ? (source.persistence as Record<string, unknown>)
      : {};
  const numberValue = (key: string): number => {
    const number = Number(persistenceSource[key]);
    return Number.isFinite(number) && number >= 0 ? number : 0;
  };
  const coverage = Array.isArray(source.coverage)
    ? source.coverage.flatMap((entry): PlatformCoverage[] => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        if (typeof item.scanner !== "string" || typeof item.platform !== "string") {
          return [];
        }
        const allowedStatuses: PlatformCoverageStatus[] = [
          "COMPLETED",
          "PARTIAL",
          "FAILED",
          "SKIPPED",
        ];
        const status = allowedStatuses.includes(
          item.status as PlatformCoverageStatus,
        )
          ? (item.status as PlatformCoverageStatus)
          : "FAILED";
        return [
          {
            scanner: item.scanner,
            platform: item.platform,
            status,
            submittedTickers: stringArray(item.submittedTickers),
            attemptedTickers: stringArray(item.attemptedTickers),
            searchedTickers: stringArray(item.searchedTickers),
            failedTickers: stringArray(item.failedTickers),
            rateLimitedTickers: stringArray(item.rateLimitedTickers),
            skippedTickers: stringArray(item.skippedTickers),
            error: typeof item.error === "string" ? item.error : undefined,
          },
        ];
      })
    : [];

  return {
    version: 2,
    scanners: Array.isArray(source.scanners)
      ? source.scanners.filter(
          (scanner): scanner is string => typeof scanner === "string",
        )
      : [],
    stats:
      source.stats && typeof source.stats === "object"
        ? (source.stats as Record<string, unknown>)
        : {},
    submittedTickers: stringArray(source.submittedTickers),
    persistence: {
      submitted: numberValue("submitted"),
      inserted: numberValue("inserted"),
      duplicates: numberValue("duplicates"),
      rejected: numberValue("rejected"),
      unprocessed: numberValue("unprocessed"),
      timedOut: persistenceSource.timedOut === true,
      transientRetries: numberValue("transientRetries"),
    },
    coverage,
  };
}

export function getTickerCoverage(
  metadata: SocialRunMetadata,
  ticker: string,
): TickerCoverage {
  const normalized = ticker.trim().toUpperCase();
  if (metadata.coverage.length === 0 || metadata.submittedTickers.length === 0) {
    return {
      status: "UNKNOWN" as const,
      searchedPlatforms: [] as string[],
      incompletePlatforms: [] as string[],
      rateLimitedPlatforms: [] as string[],
    };
  }
  if (!metadata.submittedTickers.includes(normalized)) {
    return {
      status: "NOT_TARGETED" as const,
      searchedPlatforms: [] as string[],
      incompletePlatforms: [] as string[],
      rateLimitedPlatforms: [] as string[],
    };
  }

  const applicable = metadata.coverage.filter((entry) =>
    entry.submittedTickers.includes(normalized),
  );
  const searchedPlatforms = Array.from(
    new Set(
      applicable
        .filter((entry) => entry.searchedTickers.includes(normalized))
        .map((entry) => entry.platform),
    ),
  );
  const incompletePlatforms = Array.from(
    new Set(
      applicable
        .filter(
          (entry) =>
            !entry.searchedTickers.includes(normalized) ||
            entry.failedTickers.includes(normalized) ||
            entry.skippedTickers.includes(normalized),
        )
        .map((entry) => entry.platform),
    ),
  );
  const rateLimitedPlatforms = Array.from(
    new Set(
      applicable
        .filter((entry) => entry.rateLimitedTickers.includes(normalized))
        .map((entry) => entry.platform),
    ),
  );
  const status: TickerCoverageStatus =
    searchedPlatforms.length === 0
      ? "NOT_SEARCHED"
      : incompletePlatforms.length > 0
        ? "PARTIAL"
        : "COMPLETE";
  return {
    status,
    searchedPlatforms,
    incompletePlatforms,
    rateLimitedPlatforms,
  };
}

export async function fetchAllMentionPages<T>(
  fetchPage: (
    page: number,
    limit: number,
  ) => Promise<{
    mentions: T[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>,
  options: { pageSize: number },
): Promise<T[]> {
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize), 1), 500);
  const mentions: T[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await fetchPage(page, pageSize);
    mentions.push(...response.mentions);
    totalPages = Math.max(1, Math.trunc(response.pagination.totalPages));
    page += 1;
  } while (page <= totalPages);
  return mentions;
}
