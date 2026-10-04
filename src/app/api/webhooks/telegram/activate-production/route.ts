import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isTelegramConfigured } from "@/lib/telegram/provider";
import { PRODUCTION_SUPABASE_PROJECT_REF } from "@/lib/server/ingestion-safety";

export const dynamic = "force-dynamic";

// Temporary cutover endpoint. Remove after registration is verified.
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production")
    return new NextResponse("Not Found", { status: 404 });

  const expected = process.env.TELEGRAM_ACTIVATION_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || !actual || expected.length < 32 ||
      Buffer.byteLength(expected) !== Buffer.byteLength(actual) ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual)))
    return new NextResponse("Unauthorized", { status: 401 });
  if (!isTelegramConfigured()) return new NextResponse("Unavailable", { status: 503 });

  let databaseRef: string | undefined;
  try {
    const database = new URL(process.env.DATABASE_URL || "");
    if (database.hostname.endsWith(".pooler.supabase.com"))
      databaseRef = decodeURIComponent(database.username).match(/^postgres\.([a-z0-9]{20})$/)?.[1];
    else databaseRef = database.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/)?.[1];
  } catch { /* Refuse a database that cannot be identified. */ }
  if (databaseRef !== PRODUCTION_SUPABASE_PROJECT_REF)
    return new NextResponse("Production database required", { status: 503 });

  const callback = "https://scamdunk.com/api/webhooks/telegram";
  const previousPreview = "https://scam-dunk-re-write-claude-code-git-85587c-eli-mizrochs-projects.vercel.app/api/webhooks/telegram";
  const call = async (method: string, body: Record<string, unknown> = {}) => {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error("PROVIDER_FAILED");
    return data.result;
  };
  try {
    const bot = await call("getMe");
    if (bot.username !== process.env.TELEGRAM_BOT_USERNAME)
      return new NextResponse("Bot identity mismatch", { status: 409 });
    const previous = await call("getWebhookInfo");
    if (previous.url && previous.url !== previousPreview && previous.url !== callback)
      return new NextResponse("Different webhook preserved", { status: 409 });
    await call("setWebhook", {
      url: callback, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message"], max_connections: 1, drop_pending_updates: false,
    });
    const registered = await call("getWebhookInfo");
    if (registered.url !== callback) throw new Error("PROVIDER_FAILED");
    return NextResponse.json({ connected: true, botUsername: bot.username, callback });
  } catch {
    return new NextResponse("Telegram registration could not be confirmed", { status: 502 });
  }
}
