/** Credential-safe, read-only provider checks. Optional Telegram registration is preview-only. */
import { randomBytes } from "node:crypto";
const args = process.argv.slice(2);
const required = {
  google: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"],
  whatsapp: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFICATION_TEMPLATE", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_ENCRYPTION_KEY", "WHATSAPP_IDENTITY_HASH_KEY"],
  telegram: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_ENCRYPTION_KEY", "TELEGRAM_IDENTITY_HASH_KEY"],
};
let failed = false;
for (const [provider, names] of Object.entries(required)) {
  const missing = names.filter(name => !process.env[name]);
  console.log(`${provider}: ${missing.length ? `missing ${missing.join(", ")}` : "configuration present"}`);
  if (missing.length) failed = true;
}
async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error("Telegram provider check failed");
  return data.result;
}
try {
  if (process.env.TELEGRAM_BOT_TOKEN) {
    const bot = await telegram("getMe");
    if (bot.username !== process.env.TELEGRAM_BOT_USERNAME) throw new Error("Telegram bot username does not match configuration");
    console.log("telegram: token and bot identity verified");
    if (args.includes("--register-preview")) {
      if (required.telegram.some(name => !process.env[name]) || process.env.BOT_ACTIVATION_ENV !== "preview") throw new Error("Preview registration requires complete configuration and BOT_ACTIVATION_ENV=preview");
      const index = args.indexOf("--url");
      const url = new URL(args[index + 1]);
      // Stable preview URLs are required for externally registered callbacks.
      if (url.protocol !== "https:" || url.username || url.password || !url.hostname.endsWith(".vercel.app") || process.env.VERCEL_ENV === "production")
        throw new Error("Registration requires an HTTPS Vercel preview URL");
      const readiness = await fetch(new URL("/api/auth/options", url), { signal: AbortSignal.timeout(10_000) });
      if (!readiness.ok || (await readiness.json()).environment !== "preview")
        throw new Error("Deployment did not identify itself as a preview; webhook was preserved");
      const info = await telegram("getWebhookInfo");
      const callback = new URL("/api/webhooks/telegram", url).href;
      if (info.url && info.url !== callback) throw new Error("Bot already has a different webhook. Use a separate preview bot; existing webhook was preserved");
      const response = await fetch(callback, { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": process.env.TELEGRAM_WEBHOOK_SECRET }, body: JSON.stringify({ update_id: randomBytes(4).readUInt32BE(0) }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("Preview webhook readiness probe failed");
      await telegram("setWebhook", { url: callback, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ["message"], max_connections: 1, drop_pending_updates: false });
      console.log("telegram: preview webhook registered");
    }
    const webhook = await telegram("getWebhookInfo");
    console.log(`telegram: webhook ${webhook.url ? "present" : "missing"}, pending updates ${webhook.pending_update_count}`);
    if (webhook.last_error_date) { console.log("telegram: provider reports a webhook delivery error"); failed = true; }
  }
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    const response = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=id`, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("WhatsApp token or phone identity check failed");
    console.log("whatsapp: token and phone identity verified");
  }
} catch (error) {
  // Never print fetch errors or provider payloads: they can contain token URLs.
  console.error(error instanceof Error && !error.cause ? error.message : "Provider connection check failed"); failed = true;
}
process.exitCode = failed ? 1 : 0;
