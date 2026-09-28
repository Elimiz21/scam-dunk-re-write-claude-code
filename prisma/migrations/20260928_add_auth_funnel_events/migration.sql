CREATE TABLE IF NOT EXISTS "AuthFunnelEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "method" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthFunnelEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuthFunnelEvent_userId_eventType_occurredAt_idx"
    ON "AuthFunnelEvent"("userId", "eventType", "occurredAt");

CREATE INDEX IF NOT EXISTS "AuthFunnelEvent_eventType_occurredAt_idx"
    ON "AuthFunnelEvent"("eventType", "occurredAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuthFunnelEvent_userId_fkey'
  ) THEN
    ALTER TABLE "AuthFunnelEvent"
      ADD CONSTRAINT "AuthFunnelEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "AuthFunnelEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "AuthFunnelEvent" FROM anon, authenticated;
