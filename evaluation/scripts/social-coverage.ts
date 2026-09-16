export interface SocialRunMetadata {
  submittedTickers: string[];
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
  const status =
    searchedPlatforms.length === 0
      ? ("NOT_SEARCHED" as const)
      : incompletePlatforms.length > 0
        ? ("PARTIAL" as const)
        : ("COMPLETE" as const);
  return {
    status,
    searchedPlatforms: Array.from(new Set(searchedPlatforms)),
    incompletePlatforms: Array.from(new Set(incompletePlatforms)),
    rateLimitedPlatforms: Array.from(new Set(rateLimitedPlatforms)),
  };
}

export async function fetchAllMentionPages<T>(
  fetchPage: (
    page: number,
    limit: number,
  ) => Promise<{ mentions: T[]; pagination: { totalPages: number } }>,
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
