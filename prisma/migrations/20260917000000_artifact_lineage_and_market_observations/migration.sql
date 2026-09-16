-- Add append-only artifact lineage and resumable ingestion state.
-- This migration is intentionally data-preserving: legacy snapshots remain
-- unlinked and retain null provenance until an evidence-backed reconciliation.

ALTER TABLE "StockDailySnapshot"
  ALTER COLUMN "isLegitimate" DROP NOT NULL,
  ALTER COLUMN "isInsufficient" DROP NOT NULL,
  ALTER COLUMN "isInsufficient" DROP DEFAULT,
  ALTER COLUMN "dataSource" DROP NOT NULL,
  ADD COLUMN "sourceObservedAt" TIMESTAMP(3),
  ADD COLUMN "sourceVersion" TEXT,
  ADD COLUMN "artifactRevisionId" TEXT;

ALTER TABLE "DailyScanSummary"
  ADD COLUMN "artifactRevisionId" TEXT,
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "EvaluationArtifactRevision" (
  "id" TEXT NOT NULL,
  "scanDate" TIMESTAMP(3) NOT NULL,
  "producerRunId" TEXT NOT NULL,
  "producerExecutedAt" TIMESTAMP(3),
  "revisionHash" TEXT NOT NULL,
  "manifestPath" TEXT NOT NULL,
  "manifestJson" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
  "requiredPhases" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvaluationArtifactRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvaluationArtifactObject" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "logicalName" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvaluationArtifactObject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvaluationIngestionPhase" (
  "id" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvaluationIngestionPhase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvaluationArtifactRevision_revisionHash_key"
  ON "EvaluationArtifactRevision"("revisionHash");
CREATE UNIQUE INDEX "EvaluationArtifactRevision_manifestPath_key"
  ON "EvaluationArtifactRevision"("manifestPath");
CREATE INDEX "EvaluationArtifactRevision_scanDate_status_idx"
  ON "EvaluationArtifactRevision"("scanDate", "status");

CREATE UNIQUE INDEX "EvaluationArtifactObject_storagePath_key"
  ON "EvaluationArtifactObject"("storagePath");
CREATE UNIQUE INDEX "EvaluationArtifactObject_revisionId_logicalName_key"
  ON "EvaluationArtifactObject"("revisionId", "logicalName");
CREATE INDEX "EvaluationArtifactObject_sha256_idx"
  ON "EvaluationArtifactObject"("sha256");

CREATE UNIQUE INDEX "EvaluationIngestionPhase_revisionId_phase_key"
  ON "EvaluationIngestionPhase"("revisionId", "phase");
CREATE INDEX "EvaluationIngestionPhase_status_leaseExpiresAt_idx"
  ON "EvaluationIngestionPhase"("status", "leaseExpiresAt");

CREATE UNIQUE INDEX "DailyScanSummary_artifactRevisionId_key"
  ON "DailyScanSummary"("artifactRevisionId");
CREATE INDEX "StockDailySnapshot_artifactRevisionId_idx"
  ON "StockDailySnapshot"("artifactRevisionId");

ALTER TABLE "EvaluationArtifactObject"
  ADD CONSTRAINT "EvaluationArtifactObject_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "EvaluationArtifactRevision"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationIngestionPhase"
  ADD CONSTRAINT "EvaluationIngestionPhase_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "EvaluationArtifactRevision"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockDailySnapshot"
  ADD CONSTRAINT "StockDailySnapshot_artifactRevisionId_fkey"
  FOREIGN KEY ("artifactRevisionId") REFERENCES "EvaluationArtifactRevision"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DailyScanSummary"
  ADD CONSTRAINT "DailyScanSummary_artifactRevisionId_fkey"
  FOREIGN KEY ("artifactRevisionId") REFERENCES "EvaluationArtifactRevision"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- These tables are internal ingestion control-plane state. Direct Data API
-- access is denied; the app reaches them through its server-side DB role.
ALTER TABLE "EvaluationArtifactRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvaluationArtifactObject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvaluationIngestionPhase" ENABLE ROW LEVEL SECURITY;
DO $internal_table_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "EvaluationArtifactRevision" FROM anon;
    REVOKE ALL ON TABLE "EvaluationArtifactObject" FROM anon;
    REVOKE ALL ON TABLE "EvaluationIngestionPhase" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "EvaluationArtifactRevision" FROM authenticated;
    REVOKE ALL ON TABLE "EvaluationArtifactObject" FROM authenticated;
    REVOKE ALL ON TABLE "EvaluationIngestionPhase" FROM authenticated;
  END IF;
END
$internal_table_grants$;
