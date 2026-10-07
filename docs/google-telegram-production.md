# Google and Telegram production cutover

This release is based on production `58dfff4`. It includes Google sign-in and
Telegram scans from draft PR #267, with no WhatsApp provider changes or changes
to dashboard layout, root styles, or the production ticker.

## Preconditions and order

1. In the Google Cloud Web OAuth client already used in preview, add the exact
   authorized redirect URI `https://scamdunk.com/api/auth/callback/google`.
   Keep the preview URI. Confirm that the consent screen permits production
   users; preview test-user access alone is insufficient.
2. Apply `prisma/migrations/20261002223000_telegram_bot/migration.sql` to the
   production Supabase project `gwzcluijtbuglznwdqqk`. The three new tables
   must have RLS enabled and no `anon` or `authenticated` table privileges.
3. Extend the existing Vercel Preview Google and Telegram secrets to Production
   while preserving their Preview scope and values. Set `AUTH_URL` to
   `https://scamdunk.com` in Production if a shared `NEXTAUTH_URL` points elsewhere.
   Never promote the preview `AUTH_URL`, database URL, or Supabase keys.
4. Deploy this isolated release and verify the login page, Google callback,
   existing password login, and authenticated Telegram linking. The Telegram
   webhook will still point to preview until the next step.
5. The guarded cutover verified the production database, bot identity, and
   existing preview callback before registering
   `https://scamdunk.com/api/webhooks/telegram`; pending updates were retained.
6. From a subscribed production account, generate a new link and send
   `/start <token>` and `AAPL` to @Scamdunkagentbot. Check the web allowance,
   one scan history entry, and the Telegram reply. The temporary activation
   route is removed in the follow-up release; its secret must be deleted from
   Production configuration.

Do not merge the broader draft PR #267 to perform this release; it contains
unfinished WhatsApp work. Preview and production accounts and binding records
use separate databases, so preview Telegram links do not carry over.
