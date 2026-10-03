import { NextRequest } from "next/server";
import { POST } from "@/app/api/webhooks/telegram/activate-preview/route";

jest.mock("@/lib/server/ingestion-safety", () => ({
  PRODUCTION_SUPABASE_PROJECT_REF: "gwzcluijtbuglznwdqqk",
}));

describe("Telegram preview activation", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  const callback = "https://scamdunk-test.vercel.app/api/webhooks/telegram";
  let fetchMock: jest.Mock;
  const request = (secret = "s".repeat(64)) => new NextRequest("https://scamdunk-test.vercel.app/api/webhooks/telegram/activate-preview", {
    method: "POST", headers: { "x-telegram-bot-api-secret-token": secret },
  });
  const reply = (result: unknown) => ({ ok: true, json: async () => ({ ok: true, result }) });

  beforeEach(() => {
    process.env = { ...originalEnv, VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "scamdunk-test.vercel.app",
      DATABASE_URL: "postgresql://postgres:password@db.iwbewmdeotcnqtpazezi.supabase.co/postgres",
      TELEGRAM_BOT_TOKEN: "123:private-token", TELEGRAM_BOT_USERNAME: "Scamdunkagentbot",
      TELEGRAM_WEBHOOK_SECRET: "s".repeat(64), TELEGRAM_ENCRYPTION_KEY: "e".repeat(64),
      TELEGRAM_IDENTITY_HASH_KEY: "h".repeat(64) };
    fetchMock = jest.fn(); global.fetch = fetchMock;
  });
  afterEach(() => { process.env = originalEnv; global.fetch = originalFetch; });

  it("is unavailable in production even with the correct secret", async () => {
    process.env.VERCEL_ENV = "production";
    expect((await POST(request())).status).toBe(404); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires the operator secret", async () => {
    expect((await POST(request("wrong"))).status).toBe(401); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    "postgresql://postgres@db.gwzcluijtbuglznwdqqk.supabase.co/postgres",
    "postgresql://postgres.gwzcluijtbuglznwdqqk@aws-0-eu-central-1.pooler.supabase.com/postgres",
    "postgresql://localhost/postgres", "invalid",
  ])("refuses production or unidentifiable databases: %s", async (url) => {
    process.env.DATABASE_URL = url;
    expect((await POST(request())).status).toBe(503); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preserves a different existing webhook", async () => {
    fetchMock.mockResolvedValueOnce(reply({ username: "Scamdunkagentbot" }))
      .mockResolvedValueOnce(reply({ url: "https://example.com/production" }));
    expect((await POST(request())).status).toBe(409); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("refuses a token belonging to a different bot", async () => {
    fetchMock.mockResolvedValueOnce(reply({ username: "OtherBot" }));
    expect((await POST(request())).status).toBe(409); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("registers and confirms the stable preview without dropping messages", async () => {
    process.env.DATABASE_URL = "postgresql://postgres.iwbewmdeotcnqtpazezi@aws-0-eu-central-1.pooler.supabase.com/postgres";
    fetchMock.mockResolvedValueOnce(reply({ username: "Scamdunkagentbot" }))
      .mockResolvedValueOnce(reply({ url: "" })).mockResolvedValueOnce(reply(true))
      .mockResolvedValueOnce(reply({ url: callback }));
    const response = await POST(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ connected: true, botUsername: "Scamdunkagentbot", callback });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ url: callback,
      secret_token: "s".repeat(64), allowed_updates: ["message"], max_connections: 1, drop_pending_updates: false });
  });
  it("does not expose credential-bearing provider errors", async () => {
    fetchMock.mockRejectedValue(new Error("https://api.telegram.org/bot123:private-token/getMe"));
    const response = await POST(request());
    expect(response.status).toBe(502); expect(await response.text()).not.toContain("private-token");
  });
});
