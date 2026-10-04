/** Run only against a disposable loopback PostgreSQL database, never production. */
import { prisma } from "@/lib/db";
import { beginTelegramBinding, confirmTelegramBinding, revokeTelegramBinding } from "@/lib/telegram/binding";
import { hashTelegramLinkToken, hashTelegramIdentity } from "@/lib/telegram/security";
import { resolveTelegramScanEntitlement } from "@/lib/telegram/entitlement";
const enabled = process.env.BOT_TEST_DATABASE === "local" && /^postgresql:\/\/[^@]+@(?:127\.0\.0\.1|localhost):\d+\/scamdunk_test(?:\?|$)/.test(process.env.DATABASE_URL || "");
(enabled ? describe : describe.skip)("Telegram links in PostgreSQL", () => {
  let userId: string;
  let otherId: string;
  beforeAll(async () => {
    process.env.TELEGRAM_BOT_USERNAME = "scamdunk_test_bot";
    process.env.TELEGRAM_ENCRYPTION_KEY = "local-encryption-test";
    process.env.TELEGRAM_IDENTITY_HASH_KEY = "local-hmac-test";
    const user = await prisma.user.create({ data: { email: `bot-test-${Date.now()}@example.test`, plan: "PAID", billingProvider: "MANUAL" } });
    const other = await prisma.user.create({ data: { email: `bot-test-other-${Date.now()}@example.test`, plan: "PAID", billingProvider: "MANUAL" } });
    userId = user.id; otherId = other.id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } }); await prisma.$disconnect();
  });
  async function token(id = userId) { const url = await beginTelegramBinding(id); expect(url).not.toBeNull(); return new URL(url!).searchParams.get("start")!; }
  it("stores only a hash and atomically accepts one use under concurrent requests", async () => {
    const value = await token();
    const stored = await prisma.telegramLinkToken.findUnique({ where: { userId } });
    expect(stored?.tokenHash).toBe(hashTelegramLinkToken(value));
    expect(JSON.stringify(stored)).not.toContain(value);
    const results = await Promise.all([confirmTelegramBinding(value, "987654321"), confirmTelegramBinding(value, "987654321")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await confirmTelegramBinding(value, "987654321")).toBe(false);
    expect(await resolveTelegramScanEntitlement(userId, hashTelegramIdentity("987654321"))).toEqual({ allowed: true });
  });
  it("cannot transfer a linked identity to another account", async () => {
    const value = await token(otherId);
    expect(await confirmTelegramBinding(value, "987654321")).toBe(false);
    expect((await prisma.telegramIdentityBinding.findUnique({ where: { identityHash: hashTelegramIdentity("987654321") } }))?.userId).toBe(userId);
  });
  it("invalidates older links and rejects expired links", async () => {
    const old = await token(), fresh = await token();
    expect(await confirmTelegramBinding(old, "987654322")).toBe(false);
    await prisma.telegramLinkToken.update({ where: { userId }, data: { expiresAt: new Date(0) } });
    expect(await confirmTelegramBinding(fresh, "987654322")).toBe(false);
  });
  it("unlinks and destroys outstanding links", async () => {
    const value = await token(); await revokeTelegramBinding(userId);
    expect(await confirmTelegramBinding(value, "987654323")).toBe(false);
    expect(await resolveTelegramScanEntitlement(userId, hashTelegramIdentity("987654321"))).toEqual({ allowed: false, reason: "NO_ACTIVE_ENTITLEMENT" });
  });
  it("refuses link creation after subscription expiry", async () => {
    await prisma.user.update({ where: { id: userId }, data: { subscriptionExpiresAt: new Date(0) } });
    expect(await beginTelegramBinding(userId)).toBeNull();
  });
});
