import { NextRequest } from "next/server";
import { POST } from "@/app/api/webhooks/telegram/activate-production/route";

const previousEnv = { ...process.env };
const previousFetch = global.fetch;
const preview = "https://scam-dunk-re-write-claude-code-git-85587c-eli-mizrochs-projects.vercel.app/api/webhooks/telegram";
const production = "https://scamdunk.com/api/webhooks/telegram";
const secret = "activate-production-" + "x".repeat(32);

function request(token = secret) {
  return new NextRequest("https://scamdunk.com/api/webhooks/telegram/activate-production", {
    method: "POST", headers: { authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  Object.assign(process.env, {
    VERCEL_ENV: "production", TELEGRAM_ACTIVATION_SECRET: secret,
    DATABASE_URL: "postgresql://postgres.gwzcluijtbuglznwdqqk:password@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres",
    TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_BOT_USERNAME: "Scamdunkagentbot",
    TELEGRAM_WEBHOOK_SECRET: "s".repeat(32), TELEGRAM_ENCRYPTION_KEY: "encryption",
    TELEGRAM_IDENTITY_HASH_KEY: "identity",
  });
});
afterEach(() => { process.env = { ...previousEnv }; global.fetch = previousFetch; });

it("rejects unauthorized and nonproduction activation before contacting Telegram", async () => {
  global.fetch = jest.fn();
  expect((await POST(request("wrong"))).status).toBe(401);
  process.env.VERCEL_ENV = "preview";
  expect((await POST(request())).status).toBe(404);
  expect(global.fetch).not.toHaveBeenCalled();
});

it("preserves an unexpected existing webhook", async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { username: "Scamdunkagentbot" } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { url: "https://other.example/webhook" } })));
  expect((await POST(request())).status).toBe(409);
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

it("switches only the known preview webhook, retaining pending updates", async () => {
  global.fetch = jest.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { username: "Scamdunkagentbot" } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { url: preview } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { url: production } })));
  expect((await POST(request())).status).toBe(200);
  const body = JSON.parse(jest.mocked(fetch).mock.calls[2][1]!.body as string);
  expect(body).toMatchObject({ url: production, drop_pending_updates: false });
});
