ALTER TABLE "User" ADD COLUMN "billingProvider" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "User" ADD COLUMN "trialStartedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
-- subscriptionExpiresAt, subscriptionStore, and appleOriginalTransactionId
-- are already added by 20260611000000_audit_remediation.

UPDATE "User"
SET "billingProvider" = CASE
  WHEN LOWER(COALESCE("subscriptionStore", '')) = 'apple' THEN 'APPLE'
  WHEN LOWER(COALESCE("subscriptionStore", '')) = 'stripe' THEN 'STRIPE'
  WHEN LOWER(COALESCE("subscriptionStore", '')) = 'paypal' THEN 'PAYPAL'
  ELSE "billingProvider"
END
WHERE "billingProvider" = 'NONE'
  AND "plan" <> 'FREE'
  AND ("subscriptionExpiresAt" IS NULL OR "subscriptionExpiresAt" > CURRENT_TIMESTAMP);

CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingEvent_provider_eventId_key" ON "BillingEvent"("provider", "eventId");
CREATE INDEX "BillingEvent_userId_createdAt_idx" ON "BillingEvent"("userId", "createdAt");
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
