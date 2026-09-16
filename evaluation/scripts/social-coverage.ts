export interface SocialRunMetadata {
  submittedTickers: string[];
  persistence?: {
    rejected: number;
    unprocessed: number;
    timedOut: boolean;
    lossTickers?: string[];
  } | null;
  readbackComplete?: boolean;
  coverage: Array<{
    platform: string;
    submittedTickers: string[];
    searchedTickers: string[];
    failedTickers: string[];
    rateLimitedTickers: string[];
    skippedTickers: string[];
  }>;
}

export function getTickerCoverage(metadata: SocialRunMetadata, ticker: string) {
  const normalized = ticker.trim().toUpperCase();
  if (!metadata.submittedTickers.map((item) => item.toUpperCase()).includes(normalized)) {
    return {
      status: "NOT_TARGETED" as const,
      searchedPlatforms: [] as string[],
      incompletePlatforms: [] as string[],
      rateLimitedPlatforms: [] as string[],
    };
  }
  const applicable = metadata.coverage.filter((entry) =>
    entry.submittedTickers.map((item) => item.toUpperCase()).includes(normalized),
  );
  if (applicable.length === 0) {
    return {
      status: "UNKNOWN" as const,
      searchedPlatforms: [] as string[],
      incompletePlatforms: [] as string[],
      rateLimitedPlatforms: [] as string[],
    };
  }
  const searchedPlatforms = applicable
    .filter((entry) =>
      entry.searchedTickers.map((item) => item.toUpperCase()).includes(normalized),
    )
    .map((entry) => entry.platform);
  const incompletePlatforms = applicable
    .filter(
      (entry) =>
        !entry.searchedTickers.map((item) => item.toUpperCase()).includes(normalized) ||
        entry.failedTickers.map((item) => item.toUpperCase()).includes(normalized) ||
        entry.skippedTickers.map((item) => item.toUpperCase()).includes(normalized),
    )
    .map((entry) => entry.platform);
  const rateLimitedPlatforms = applicable
    .filter((entry) =>
      entry.rateLimitedTickers
        .map((item) => item.toUpperCase())
        .includes(normalized),
    )
    .map((entry) => entry.platform);
  const persistenceLoss = Boolean(
    metadata.persistence &&
      (metadata.persistence.rejected > 0 ||
        metadata.persistence.unprocessed > 0 ||
        metadata.persistence.timedOut),
  );
  const lossTickers = metadata.persistence?.lossTickers || [];
  const evidenceIncomplete =
    metadata.readbackComplete === false ||
    (persistenceLoss &&
      (lossTickers.length === 0 || lossTickers.includes(normalized)));
  const status =
    searchedPlatforms.length === 0
      ? ("NOT_SEARCHED" as const)
      : incompletePlatforms.length > 0 || evidenceIncomplete
        ? ("PARTIAL" as const)
        : ("COMPLETE" as const);
  return {
    status,
    searchedPlatforms: Array.from(new Set(searchedPlatforms)),
    incompletePlatforms: Array.from(new Set(incompletePlatforms)),
    rateLimitedPlatforms: Array.from(new Set(rateLimitedPlatforms)),
    ...(evidenceIncomplete ? { evidenceIncomplete: true } : {}),
  };
}

export async function fetchMentionPagesWithStatus<T>(
  fetchPage: (
    page: number,
    limit: number,
  ) => Promise<{
    mentions: T[];
    pagination: { totalPages: number };
    readback?: { complete: boolean };
  }>,
  options: { pageSize: number },
): Promise<{
  mentions: T[];
  complete: boolean;
  failedPage: number | null;
  error?: string;
}> {
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize), 1), 500);
  const mentions: T[] = [];
  let page = 1;
  let totalPages = 1;
  let complete = true;
  let firstIncompletePage: number | null = null;
  do {
    try {
      const response = await fetchPage(page, pageSize);
      mentions.push(...response.mentions);
      totalPages = Math.max(1, Math.trunc(response.pagination.totalPages));
      if (response.readback?.complete === false) {
        complete = false;
        firstIncompletePage ??= page;
      }
      page += 1;
    } catch (error) {
      return {
        mentions,
        complete: false,
        failedPage: page,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } while (page <= totalPages);
  return {
    mentions,
    complete,
    failedPage: firstIncompletePage,
    error: firstIncompletePage
      ? `Mention page ${firstIncompletePage} contained incomplete readback data`
      : undefined,
  };
}

export async function fetchAllMentionPages<T>(
  fetchPage: (
    page: number,
    limit: number,
  ) => Promise<{ mentions: T[]; pagination: { totalPages: number } }>,
  options: { pageSize: number },
): Promise<T[]> {
  const result = await fetchMentionPagesWithStatus(fetchPage, options);
  if (!result.complete) {
    throw new Error(result.error || `Mention page ${result.failedPage} failed`);
  }
  return result.mentions;
}

export function assessSocialPhase(input: {
  runStatus: string;
  submitted: number;
  searched: number;
  persistence?: {
    rejected: number;
    unprocessed: number;
    timedOut: boolean;
  } | null;
  readbackComplete: boolean;
  coverage: Array<{
    platform?: string;
    submittedTickers: string[];
    searchedTickers: string[];
    failedTickers: string[];
    rateLimitedTickers?: string[];
    skippedTickers: string[];
  }>;
}): "completed" | "degraded" {
  const persistenceLoss = Boolean(
    input.persistence &&
      (input.persistence.rejected > 0 ||
        input.persistence.unprocessed > 0 ||
        input.persistence.timedOut),
  );
  const platformIncomplete = input.coverage.some(
    (entry) =>
      entry.failedTickers.length > 0 ||
      entry.skippedTickers.length > 0 ||
      entry.searchedTickers.length < entry.submittedTickers.length,
  );
  return input.runStatus !== "COMPLETED" ||
    input.searched < input.submitted ||
    persistenceLoss ||
    !input.readbackComplete ||
    platformIncomplete
    ? "degraded"
    : "completed";
}
