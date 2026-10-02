# Google login and messaging bots: review and activation

This change is for review on a feature branch. Do not merge or deploy to production until the owner has reviewed it. No live provider activation has been performed.

## Implemented behavior

- Google login and signup use Auth.js with the Prisma adapter and JWT sessions. Only a Google `email_verified: true` claim is accepted. New users default to Free and do not opt into marketing. Provider tokens are discarded instead of stored. Existing accounts with the same email must log in first and connect Google from Account; unsafe automatic email linking is disabled. Existing plan and session revocation rules apply to Google sessions.
- Telegram subscribers create a 10-minute, single-use private link on Account. Pressing Start in the bot links the human sender's private chat. Tokens are hashed in the linking table; chat identities and event payloads are encrypted with independent Telegram keys. Concurrent attempts consume at most one link. Group chats, channel posts, bots, expired subscriptions, and unlinked senders cannot scan. `AAPL` and `scan AAPL` use the existing server scan pipeline and allowance.
- Both bots store replies before sending. Provider failures retry the saved reply without rerunning a scan or charging quota again. Atomic retry claims prevent parallel workers from delivering the same retry. Delivery after a provider timeout remains at-least-once: a provider may accept a message before the client loses its response. A stale scan is failed without automatically rescanning. Retention crons clear encrypted event data after seven days.
- WhatsApp Authentication templates send the code in both the body and the copy-code URL button. Template language is configurable. Both providers have bounded send timeouts. Duplicate Meta deliveries can resume failed sends.

## Preview prerequisites

Use an isolated preview PostgreSQL database and distinct preview bots/phone numbers. Do not point a preview at production's database or change a production bot's webhook. Set the variables in `.env.example` in the preview deployment's server environment. Persistent encryption/HMAC keys must be generated independently per channel (`openssl rand -base64 32`) and retained across deploys. Never commit credentials.

Apply `npm run db:migrate:deploy` to the preview database. The Telegram migration adds three server-only tables with RLS enabled and revokes Supabase client-role access. The existing WhatsApp migrations must also be present.

Google: create a Web application OAuth client in Google Cloud Console, configure the consent screen and preview test users, and allow the exact URI `https://<stable-preview-host>/api/auth/callback/google`. Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` (legacy `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are also supported). Configure the correct external auth URL/host for the preview.

WhatsApp: provision a Meta WhatsApp business phone, a permanent System User token, and an approved Authentication template with a copy-code button. Set the seven required WhatsApp variables. Register `https://<stable-preview-host>/api/webhooks/whatsapp` with the matching verify token and subscribe to `messages`. The Meta console/account approval and template approval cannot be completed using GitHub repository access alone.

Telegram: create a separate preview bot with @BotFather. Set its token, username (without `@`), webhook secret (32–256 URL-safe characters), encryption key, and HMAC key. Externally called webhook routes must be reachable through preview deployment protection. Run the readiness check without printing secret values:

```sh
node scripts/check-messaging-integrations.mjs
```

The optional registration command refuses a production environment, requires a Vercel preview URL, probes the protected webhook, and refuses to replace an existing different callback:

```sh
BOT_ACTIVATION_ENV=preview node scripts/check-messaging-integrations.mjs \
  --register-preview --url https://<stable-preview-host>.vercel.app
```

Keep Vercel's hourly retention crons and `CRON_SECRET` enabled. Vercel preview deployments do not automatically run production cron schedules; exercise the two authenticated cron endpoints manually in preview tests or arrange a preview-only scheduler.

## Live acceptance tests still required

1. Google: finish real consent and callback for a new user, log out/in, verify a paid existing account connects only after password login, and verify an incorrect/expired OAuth callback is rejected.
2. WhatsApp: link a real preview number via the delivered code, scan AAPL and scan AAPL, verify a Free/expired account cannot scan, unlink, and verify a replay does not consume another allowance.
3. Telegram: link from Account, press Start, receive the link confirmation, scan AAPL, check usage on the web, unlink, and verify that future messages are declined.
4. Provider outage: restore delivery and confirm saved replies retry while scan counts stay unchanged. Test both authenticated retention endpoints.
5. Check `/api/health?verbose=true` and provider dashboard webhook delivery status. Configuration presence alone does not prove a successful live flow.

## Access limitation in this session

GitHub code access is available. The managed environment reports no application credentials; the connected Vercel account lists no teams. Google OAuth credentials, the Meta business account/approved template, Telegram bot credentials, and writable preview deployment/database access are unavailable. Implementation and local automated tests can be completed; live activation and real provider acceptance cannot be claimed until those accounts/credentials are accessible.

## Verification performed in this session (2026-10-02)

- `npm run typecheck`: pass.
- `npm run lint`: pass with existing warnings in unrelated files.
- `npm run build`: pass; existing Sentry bundler and font optimization warnings.
- `npm test -- --runInBand`: 624 passed; 27 database-dependent tests skipped in the default run.
- Dedicated disposable-PostgreSQL run: all 29 Google/Telegram integration cases passed, including all five real database linking tests that are skipped in the default suite.
- Complete Prisma migration history applied successfully to a fresh local PostgreSQL database with Supabase client roles present. SQL verification confirmed RLS is enabled on all three Telegram tables and neither `anon` nor `authenticated` has SELECT access.
- Chromium desktop and mobile: verified Google login/signup controls, existing password login, authenticated account bot controls, and Telegram link generation. Browser console reported no application errors during these checks.
- Built server Google initiation: verified the authorization redirect goes to `accounts.google.com`, uses PKCE, and sets `/api/auth/callback/google` as the callback path. This used fixture client credentials; real Google consent/token exchange was not tested. Node in this managed environment needed `NODE_USE_ENV_PROXY=1` for OIDC discovery.
- Provider send/scan outcomes were mocked in automated tests. Live WhatsApp OTP delivery, real bot responses, and real OAuth token exchange remain the acceptance checks listed above.
