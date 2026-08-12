# WhatsApp Bot — Launch Runbook

State as of 2026-08-12: the entire WhatsApp scan pipeline is built, tested
(23 unit tests), and deployed, and the database tables exist in production.
The ONLY thing between "coming soon" and "live" is Meta credentials — seven
environment variables. The site markets the bot as **coming soon** everywhere
(pricing page, landing page, account page) and flips to live automatically
once configuration is complete: no code change or redeploy logic is involved
beyond setting the vars and redeploying.

## How the bot works (already implemented)

1. **Linking** (account page → `/api/user/whatsapp`): a Pro subscriber enters
   their phone number; we send a 6-digit code via a Meta authentication
   template; they enter the code on the site (never in chat). The number is
   stored encrypted (AES-256-GCM) with an HMAC lookup hash — no plain-text
   numbers anywhere.
2. **Scanning** (`/api/webhooks/whatsapp`): Meta delivers inbound messages,
   signature-verified (HMAC-SHA256). `AAPL` or `scan AAPL` from a linked,
   entitled (PAID, unexpired) number runs the scan and replies with the
   verdict. Unknown numbers and free accounts get a polite decline.
3. **Retention** (`/api/cron/whatsapp-retention`): inbound events are purged
   after 7 days.

## Environment variables (set in Vercel → Project → Settings → Environment Variables, Production)

| Variable | Where it comes from |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta Business → WhatsApp → API Setup → permanent System User token with `whatsapp_business_messaging` permission |
| `WHATSAPP_PHONE_NUMBER_ID` | Same API Setup page — the ID of the business phone number (NOT the number itself) |
| `WHATSAPP_VERIFICATION_TEMPLATE` | Name of an approved **Authentication** template with one body variable (the code), e.g. `scamdunk_verify` |
| `WHATSAPP_APP_SECRET` | Meta App → Settings → Basic → App Secret (used to verify webhook signatures) |
| `WHATSAPP_VERIFY_TOKEN` | Any random string you choose; pasted into Meta's webhook subscription form |
| `WHATSAPP_ENCRYPTION_KEY` | Generate: `openssl rand -base64 32` (encrypts stored message text + phone numbers) |
| `WHATSAPP_IDENTITY_HASH_KEY` | Generate: `openssl rand -base64 32` (HMAC key for phone-number lookups) — MUST never change once bindings exist |

## Meta setup steps

1. In [Meta for Developers](https://developers.facebook.com): create (or use)
   a Business-type app, add the **WhatsApp** product.
2. Add and verify the business phone number the bot will use.
3. Create an **Authentication** message template with a single `{{1}}` code
   parameter, submit for approval (usually minutes–hours). Its name goes in
   `WHATSAPP_VERIFICATION_TEMPLATE`.
4. Configuration → Webhooks:
   - Callback URL: `https://scamdunk.com/api/webhooks/whatsapp`
   - Verify token: the value you chose for `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the `messages` field.
   Meta will call our GET endpoint with the token; the subscription only
   saves if the env var is already deployed — set the vars first.
5. Generate the permanent System User access token (Business Settings →
   System Users → Add → assign the app + `whatsapp_business_messaging`).

## Verification checklist (after setting vars + redeploy)

```bash
# 1. All seven vars present:
curl -s "https://scamdunk.com/api/health?verbose=true" | jq .whatsapp

# 2. Webhook signature layer alive (401 = configured; 503 = APP_SECRET missing):
curl -s -o /dev/null -w '%{http_code}' -X POST \
  https://scamdunk.com/api/webhooks/whatsapp \
  -H 'x-hub-signature-256: sha256=0000000000000000000000000000000000000000000000000000000000000000' \
  -d '{}'

# 3. Meta webhook GET verification (do via Meta's UI — saving the webhook
#    subscription succeeds only if WHATSAPP_VERIFY_TOKEN matches).
```

Then the end-to-end test: on a Pro account, link a real number on
`/account` (code should arrive in WhatsApp), send `AAPL` to the business
number, and expect the risk verdict as a reply. The account page and pricing
surfaces flip from "coming soon" automatically once
`/api/health?verbose=true` shows all seven vars true — the UI keys off the
same check (`isWhatsAppConfigured`).

## History / fixes applied 2026-08-12

- **Root cause the bot never worked**: the `WhatsAppIdentityBinding` /
  `WhatsAppInboundEvent` tables were never created in the production
  database (the migration existed in the repo only). Applied via Supabase on
  2026-08-12. Every webhook delivery and linking attempt before that date
  failed at the first database write.
- Missing env vars confirmed via the webhook probe (503 on signed POST =
  signature verification threw = no `WHATSAPP_APP_SECRET`).
- Added `isWhatsAppConfigured()` gating: linking API returns a friendly
  coming-soon message, the account page shows a Coming Soon card, and
  `/api/health?verbose=true` exposes the per-variable checklist.
