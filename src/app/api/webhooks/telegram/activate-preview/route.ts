import { NextRequest, NextResponse } from "next/server";
import { isTelegramConfigured } from "@/lib/telegram/provider";
import { verifyTelegramWebhookSecret } from "@/lib/telegram/security";
import { PRODUCTION_SUPABASE_PROJECT_REF } from "@/lib/server/ingestion-safety";

export const dynamic = "force-dynamic";

// Operator endpoint: requires the existing webhook secret and is unavailable
// in production. Credentials stay on the server, including during setup.
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview")
    return new NextResponse("Not Found", { status: 404 });
  if (!verifyTelegramWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token")))
    return new NextResponse("Unauthorized", { status: 401 });
  if (!isTelegramConfigured()) return new NextResponse("Unavailable", { status: 503 });

  let databaseRef: string | undefined;
  try {
    const database = new URL(process.env.DATABASE_URL || "");
    if (["postgres:", "postgresql:"].includes(database.protocol)) {
      databaseRef = database.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/)?.[1];
      if (database.hostname.endsWith(".pooler.supabase.com"))
        databaseRef = decodeURIComponent(database.username).match(/^postgres\.([a-z0-9]{20})$/)?.[1];
    }
  } catch { /* Fail closed when the isolated database cannot be identified. */ }
  if (!databaseRef || databaseRef === PRODUCTION_SUPABASE_PROJECT_REF)
    return new NextResponse("An isolated preview database is required", { status: 503 });

  const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL || "";
  if (!/^[a-z0-9][a-z0-9.-]*\.vercel\.app$/i.test(host))
    return new NextResponse("Preview URL is unavailable", { status: 503 });
  const callback = `https://${host}/api/webhooks/telegram`;
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
      return new NextResponse("Bot identity does not match configuration", { status: 409 });
    const previous = await call("getWebhookInfo");
    if (previous.url && previous.url !== callback)
      return new NextResponse("Existing different webhook was preserved", { status: 409 });
    await call("setWebhook", {
      url: callback, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message"], max_connections: 1, drop_pending_updates: false,
    });
    const registered = await call("getWebhookInfo");
    if (registered.url !== callback) throw new Error("PROVIDER_FAILED");
    return NextResponse.json({ connected: true, botUsername: bot.username, callback });
  } catch {
    // Provider errors may contain the token in a URL; never return or log them.
    return new NextResponse("Telegram registration could not be confirmed", { status: 502 });
  }
}
