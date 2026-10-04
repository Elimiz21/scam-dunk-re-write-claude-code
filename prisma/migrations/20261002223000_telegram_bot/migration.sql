-- CreateTable
CREATE TABLE "TelegramIdentityBinding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "identityHash" TEXT NOT NULL,
    "identityEncrypted" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "boundAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramIdentityBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLinkToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramInboundEvent" (
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

    CONSTRAINT "TelegramInboundEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramIdentityBinding_identityHash_key" ON "TelegramIdentityBinding"("identityHash");

-- CreateIndex
CREATE INDEX "TelegramIdentityBinding_userId_active_idx" ON "TelegramIdentityBinding"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkToken_userId_key" ON "TelegramLinkToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkToken_tokenHash_key" ON "TelegramLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TelegramLinkToken_expiresAt_idx" ON "TelegramLinkToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramInboundEvent_providerMessageId_key" ON "TelegramInboundEvent"("providerMessageId");

-- CreateIndex
CREATE INDEX "TelegramInboundEvent_senderIdentityHash_createdAt_idx" ON "TelegramInboundEvent"("senderIdentityHash", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramInboundEvent_status_purgeAt_idx" ON "TelegramInboundEvent"("status", "purgeAt");

-- AddForeignKey
ALTER TABLE "TelegramIdentityBinding" ADD CONSTRAINT "TelegramIdentityBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLinkToken" ADD CONSTRAINT "TelegramLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramInboundEvent" ADD CONSTRAINT "TelegramInboundEvent_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "TelegramIdentityBinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Telegram identities, link tokens and payloads are server-only data.
ALTER TABLE "TelegramIdentityBinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramLinkToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TelegramInboundEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "TelegramIdentityBinding", "TelegramLinkToken", "TelegramInboundEvent" FROM anon, authenticated;
