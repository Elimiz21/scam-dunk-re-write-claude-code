CREATE TABLE IF NOT EXISTS "ConversionFunnelEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "plan" TEXT,
    "provider" TEXT,
    "transactionId" TEXT,
    "valueCents" INTEGER,
    "currency" TEXT,
    "clientId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversionFunnelEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ConversionFunnelEvent_idempotencyKey_key"
    ON "ConversionFunnelEvent"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "ConversionFunnelEvent_eventType_occurredAt_idx"
    ON "ConversionFunnelEvent"("eventType", "occurredAt");
CREATE INDEX IF NOT EXISTS "ConversionFunnelEvent_userId_eventType_occurredAt_idx"
    ON "ConversionFunnelEvent"("userId", "eventType", "occurredAt");
CREATE INDEX IF NOT EXISTS "ConversionFunnelEvent_plan_occurredAt_idx"
    ON "ConversionFunnelEvent"("plan", "occurredAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ConversionFunnelEvent_userId_fkey'
  ) THEN
    ALTER TABLE "ConversionFunnelEvent"
      ADD CONSTRAINT "ConversionFunnelEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ConversionFunnelEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ConversionFunnelEvent" FROM anon, authenticated;
