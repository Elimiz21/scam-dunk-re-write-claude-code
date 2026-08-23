export interface SocialBatchResult {
  status: string;
  requestedTickers: number;
  tickersScanned: number;
  tickersWithMentions: number;
  totalMentions: number;
  errors?: string[];
}

export function chunkSocialTargets<T>(items: T[], batchSize: number): T[][] {
  const safeBatchSize =
    Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : 1;
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += safeBatchSize) {
    batches.push(items.slice(start, start + safeBatchSize));
  }
  return batches;
}

export function summarizeSocialBatches(
  eligibleTickers: number,
  selectedTickers: number,
  batches: SocialBatchResult[],
) {
  const errors = batches.flatMap((batch) => batch.errors || []);
  const completed = batches.every(
    (batch) =>
      batch.status === "COMPLETED" &&
      batch.tickersScanned === batch.requestedTickers &&
      (batch.errors || []).length === 0,
  );

  return {
    status: completed ? "completed" : "degraded",
    eligibleTickers,
    selectedTickers,
    batches: batches.length,
    tickersSubmitted: batches.reduce(
      (total, batch) => total + (batch.tickersScanned || 0),
      0,
    ),
    tickersCompleted: batches.reduce(
      (total, batch) =>
        total +
        (batch.status === "COMPLETED" &&
        batch.tickersScanned === batch.requestedTickers &&
        (batch.errors || []).length === 0
          ? batch.requestedTickers
          : 0),
      0,
    ),
    tickersWithMentions: batches.reduce(
      (total, batch) => total + (batch.tickersWithMentions || 0),
      0,
    ),
    totalMentions: batches.reduce(
      (total, batch) => total + (batch.totalMentions || 0),
      0,
    ),
    errors,
  };
}
