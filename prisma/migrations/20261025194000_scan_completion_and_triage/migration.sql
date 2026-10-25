-- AlterTable
ALTER TABLE "ScanHistory" ADD COLUMN IF NOT EXISTS "resultPayload" TEXT,
ADD COLUMN IF NOT EXISTS "scoringVersion" TEXT;

-- AlterTable
ALTER TABLE "StockDailySnapshot" ADD COLUMN IF NOT EXISTS "newsEvidence" TEXT,
ADD COLUMN IF NOT EXISTS "newsTriage" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN IF NOT EXISTS "scoringVersion" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScanOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "resultId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ScanOperation_resultId_key" ON "ScanOperation"("resultId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScanOperation_status_leaseUntil_idx" ON "ScanOperation"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ScanOperation_userId_requestKey_key" ON "ScanOperation"("userId", "requestKey");

-- AddForeignKey
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"ScanOperation"'::regclass AND conname='ScanOperation_userId_fkey') THEN
 ALTER TABLE "ScanOperation" ADD CONSTRAINT "ScanOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
 END IF;
END $$;

-- Scan payloads and reservations are accessed through authenticated server routes.
ALTER TABLE "ScanOperation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ScanOperation" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "ScanOperation" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "ScanOperation" FROM authenticated;
  END IF;
END $$;
