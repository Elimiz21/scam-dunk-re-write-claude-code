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
  "publicationGeneration" INTEGER NOT NULL DEFAULT 1,
  "parentRevisionHash" TEXT,
  "producerKind" TEXT NOT NULL DEFAULT 'LEGACY_RETAINED',
  "qualityStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
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

CREATE TABLE "EvaluationArtifactPublicationHead" (
  "scanDate" TIMESTAMP(3) NOT NULL,
  "publicationGeneration" INTEGER NOT NULL,
  "revisionHash" TEXT NOT NULL,
  "parentRevisionHash" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvaluationArtifactPublicationHead_pkey" PRIMARY KEY ("scanDate")
);
CREATE UNIQUE INDEX "EvaluationArtifactPublicationHead_revisionHash_key"
  ON "EvaluationArtifactPublicationHead"("revisionHash");

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
CREATE UNIQUE INDEX "EvaluationArtifactRevision_scanDate_publicationGeneration_key"
  ON "EvaluationArtifactRevision"("scanDate", "publicationGeneration");

CREATE INDEX "EvaluationArtifactObject_storagePath_idx"
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
ALTER TABLE "EvaluationArtifactPublicationHead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvaluationArtifactObject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvaluationIngestionPhase" ENABLE ROW LEVEL SECURITY;
DO $internal_table_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "EvaluationArtifactRevision" FROM anon;
    REVOKE ALL ON TABLE "EvaluationArtifactPublicationHead" FROM anon;
    REVOKE ALL ON TABLE "EvaluationArtifactObject" FROM anon;
    REVOKE ALL ON TABLE "EvaluationIngestionPhase" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "EvaluationArtifactRevision" FROM authenticated;
    REVOKE ALL ON TABLE "EvaluationArtifactPublicationHead" FROM authenticated;
    REVOKE ALL ON TABLE "EvaluationArtifactObject" FROM authenticated;
    REVOKE ALL ON TABLE "EvaluationIngestionPhase" FROM authenticated;
  END IF;
END
$internal_table_grants$;

-- Atomic compare-and-swap used by server-side uploaders before replacing
-- Storage current.json. Same-parent siblings cannot both win this row lock.
CREATE OR REPLACE FUNCTION public.claim_evaluation_artifact_publication(
  scan_date_input TIMESTAMP(3),
  generation_input INTEGER,
  parent_revision_hash_input TEXT,
  revision_hash_input TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $claim$
DECLARE current_head "EvaluationArtifactPublicationHead"%ROWTYPE;
BEGIN
  IF scan_date_input IS NULL
    OR scan_date_input <> date_trunc('day', scan_date_input)
    OR generation_input IS NULL
    OR generation_input < 1
    OR revision_hash_input IS NULL
    OR revision_hash_input !~ '^[0-9a-f]{64}$'
    OR (parent_revision_hash_input IS NOT NULL AND parent_revision_hash_input !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'invalid publication claim input';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(scan_date_input::text));
  SELECT * INTO current_head
  FROM "EvaluationArtifactPublicationHead"
  WHERE "scanDate" = scan_date_input
  FOR UPDATE;
  IF FOUND AND current_head."revisionHash" = revision_hash_input
    AND current_head."publicationGeneration" = generation_input THEN
    RETURN TRUE;
  END IF;
  IF NOT FOUND THEN
    IF generation_input <> 1 OR parent_revision_hash_input IS NOT NULL THEN
      RAISE EXCEPTION 'stale publication parent';
    END IF;
    INSERT INTO "EvaluationArtifactPublicationHead" (
      "scanDate", "publicationGeneration", "revisionHash", "parentRevisionHash", "updatedAt"
    ) VALUES (scan_date_input, generation_input, revision_hash_input, NULL, CURRENT_TIMESTAMP);
    RETURN TRUE;
  END IF;
  IF current_head."revisionHash" IS DISTINCT FROM parent_revision_hash_input
    OR generation_input <> current_head."publicationGeneration" + 1 THEN
    RAISE EXCEPTION 'stale publication parent';
  END IF;
  UPDATE "EvaluationArtifactPublicationHead"
  SET "publicationGeneration" = generation_input,
      "revisionHash" = revision_hash_input,
      "parentRevisionHash" = parent_revision_hash_input,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "scanDate" = scan_date_input;
  RETURN TRUE;
END
$claim$;
REVOKE ALL ON FUNCTION public.claim_evaluation_artifact_publication(TIMESTAMP, INTEGER, TEXT, TEXT) FROM PUBLIC;
DO $service_role_function_grant$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_evaluation_artifact_publication(TIMESTAMP, INTEGER, TEXT, TEXT) TO service_role;
  END IF;
END
$service_role_function_grant$;
