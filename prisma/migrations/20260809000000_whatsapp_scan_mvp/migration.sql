CREATE TABLE "WhatsAppIdentityBinding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "identityHash" TEXT NOT NULL,
    "identityEncrypted" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "verificationCodeHash" TEXT,
    "verificationExpiresAt" TIMESTAMP(3),
    "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastVerificationSentAt" TIMESTAMP(3),
    "bindingVersion" TEXT NOT NULL DEFAULT 'web-template-v1',
    "boundAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppIdentityBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppInboundEvent" (
    "id" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "senderIdentityHash" TEXT NOT NULL,
    "bindingId" TEXT,
    "messageType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "reasonCode" TEXT,
    "encryptedText" TEXT,
    "encryptedReply" TEXT,
    "senderIdentityEncrypted" TEXT,
    "providerReplyMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "purgeAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppInboundEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppIdentityBinding_identityHash_key" ON "WhatsAppIdentityBinding"("identityHash");
CREATE INDEX "WhatsAppIdentityBinding_userId_active_idx" ON "WhatsAppIdentityBinding"("userId", "active");
CREATE UNIQUE INDEX "WhatsAppInboundEvent_providerMessageId_key" ON "WhatsAppInboundEvent"("providerMessageId");
CREATE INDEX "WhatsAppInboundEvent_senderIdentityHash_createdAt_idx" ON "WhatsAppInboundEvent"("senderIdentityHash", "createdAt");
CREATE INDEX "WhatsAppInboundEvent_status_purgeAt_idx" ON "WhatsAppInboundEvent"("status", "purgeAt");
ALTER TABLE "WhatsAppIdentityBinding" ADD CONSTRAINT "WhatsAppIdentityBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppInboundEvent" ADD CONSTRAINT "WhatsAppInboundEvent_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "WhatsAppIdentityBinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
