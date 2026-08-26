-- Watchlist: one row per (user, ticker), auto-maintained on every logged-in
-- scan. Backfilled below from ScanHistory so returning users see their
-- previously scanned stocks immediately.

CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "assetType" TEXT NOT NULL DEFAULT 'stock',
    "lastRiskLevel" TEXT,
    "lastScore" INTEGER,
    "scanCount" INTEGER NOT NULL DEFAULT 1,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "lastScannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WatchlistItem_userId_ticker_key" ON "WatchlistItem"("userId", "ticker");

CREATE INDEX "WatchlistItem_userId_isHidden_lastScannedAt_idx" ON "WatchlistItem"("userId", "isHidden", "lastScannedAt" DESC);

ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from existing scan history: latest scan result per (user, ticker).
-- The User join skips orphaned userIds left behind by old account deletions.
INSERT INTO "WatchlistItem"
    ("id", "userId", "ticker", "assetType", "lastRiskLevel", "lastScore",
     "scanCount", "lastScannedAt", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    s."userId",
    upper(s."ticker"),
    (array_agg(s."assetType" ORDER BY s."createdAt" DESC))[1],
    (array_agg(s."riskLevel" ORDER BY s."createdAt" DESC))[1],
    (array_agg(s."totalScore" ORDER BY s."createdAt" DESC))[1],
    count(*)::int,
    max(s."createdAt"),
    min(s."createdAt"),
    now()
FROM "ScanHistory" s
JOIN "User" u ON u.id = s."userId"
WHERE s."userId" IS NOT NULL
GROUP BY s."userId", upper(s."ticker")
ON CONFLICT ("userId", "ticker") DO NOTHING;
