-- CreateTable
CREATE TABLE "WatchlistEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "lastDataAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveMonitor" (
    "id" TEXT NOT NULL,
    "watchlistEntryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastEvaluatedAt" TIMESTAMP(3),
    "nextEvaluationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActiveMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorExecution" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "publicationKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "creditReserved" BOOLEAN NOT NULL DEFAULT false,
    "creditCharged" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" TEXT,
    "errorReason" TEXT,
    "notificationIdempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitorExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "errorReason" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistEntry_userId_ticker_key" ON "WatchlistEntry"("userId", "ticker");

-- CreateIndex
CREATE INDEX "WatchlistEntry_userId_createdAt_idx" ON "WatchlistEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WatchlistEntry_ticker_idx" ON "WatchlistEntry"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveMonitor_watchlistEntryId_kind_key" ON "ActiveMonitor"("watchlistEntryId", "kind");

-- CreateIndex
CREATE INDEX "ActiveMonitor_status_nextEvaluationAt_idx" ON "ActiveMonitor"("status", "nextEvaluationAt");

-- CreateIndex
CREATE INDEX "ActiveMonitor_expiresAt_idx" ON "ActiveMonitor"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorExecution_notificationIdempotencyKey_key" ON "MonitorExecution"("notificationIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MonitorExecution_monitorId_publicationKey_key" ON "MonitorExecution"("monitorId", "publicationKey");

-- CreateIndex
CREATE INDEX "MonitorExecution_status_createdAt_idx" ON "MonitorExecution"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_userId_executionId_channel_key" ON "NotificationDelivery"("userId", "executionId", "channel");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "WatchlistEntry" ADD CONSTRAINT "WatchlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveMonitor" ADD CONSTRAINT "ActiveMonitor_watchlistEntryId_fkey" FOREIGN KEY ("watchlistEntryId") REFERENCES "WatchlistEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorExecution" ADD CONSTRAINT "MonitorExecution_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "ActiveMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "MonitorExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
