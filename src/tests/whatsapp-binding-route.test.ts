jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/rate-limit", () => ({ rateLimit: jest.fn() }));
jest.mock("@/lib/whatsapp/provider", () => ({ isWhatsAppConfigured: jest.fn(() => true) }));
jest.mock("@/lib/whatsapp/security", () => ({ normalizeWhatsAppPhoneNumber: jest.fn((v) => v.startsWith("+") ? v : null) }));
jest.mock("@/lib/whatsapp/binding", () => ({
  beginWhatsAppBinding: jest.fn(), confirmWhatsAppBinding: jest.fn(), getWhatsAppBindingStatus: jest.fn(),
  getPendingWhatsAppVerification: jest.fn(), isCurrentWhatsAppSubscriber: jest.fn(), revokeWhatsAppBinding: jest.fn(),
}));
import { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/user/whatsapp/route";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import * as binding from "@/lib/whatsapp/binding";
const request = (body: object) => new NextRequest("https://scamdunk.com/api/user/whatsapp", { method: "POST", body: JSON.stringify(body) });
const pending = { active: false, pending: true, maskedPhone: "+97••••55", retryAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString() };
describe("WhatsApp verification API recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue({ user: { id: "user-a" } });
    (binding.isCurrentWhatsAppSubscriber as jest.Mock).mockResolvedValue(true);
    (binding.getPendingWhatsAppVerification as jest.Mock).mockResolvedValue(pending);
    (rateLimit as jest.Mock).mockResolvedValue({ success: false, reset: Date.now() + 1800000 });
  });
  it("resumes an existing code without sending or consuming a rate limit", async () => {
    const response = await POST(request({ action: "begin", phoneNumber: "+972504975755" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ pending: true, resumed: true, maskedPhone: pending.maskedPhone });
    expect(rateLimit).not.toHaveBeenCalled();
    expect(binding.beginWhatsAppBinding).not.toHaveBeenCalled();
  });
  it("keeps explicit resends rate limited and returns recovery metadata and reset time", async () => {
    const response = await POST(request({ action: "begin", phoneNumber: "+972504975755", resend: true }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(1700);
    const result = await response.json();
    expect(result.pending).toBe(true);
    expect(Date.parse(result.retryAt)).toBeGreaterThan(Date.now());
    expect(binding.beginWhatsAppBinding).not.toHaveBeenCalled();
  });
  it("rejects invalid numbers before consuming the request allowance", async () => {
    const response = await POST(request({ action: "begin", phoneNumber: "invalid" }));
    expect(response.status).toBe(400);
    expect(rateLimit).not.toHaveBeenCalled();
  });
  it("code confirmation remains usable when send limits are exhausted", async () => {
    (binding.confirmWhatsAppBinding as jest.Mock).mockResolvedValue({ ok: true });
    const response = await POST(request({ action: "confirm", code: "123456" }));
    expect(response.status).toBe(200);
    expect(rateLimit).not.toHaveBeenCalled();
  });
  it("only returns verification status to an authenticated account", async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(binding.getWhatsAppBindingStatus).not.toHaveBeenCalled();
  });
});
