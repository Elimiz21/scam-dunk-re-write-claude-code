# Findings: Adversarial Security Review

Reviewer: adversarial line-by-line audit, 2026-06-11
Scope: middleware, all API routes (65 admin route files audited), auth flows, billing, webhooks, encryption, uploads, XSS/injection/secret sweeps.

## CRITICAL

### SEC-C1. Live production DB credentials committed to git (VERIFIED)
[Secret Exposure] scripts/query-blogs-pg.mjs:6
- `postgresql://postgres.gwzcluijtbuglznwdqqk:Scammers2232%21@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres` — tracked in git; password also lives in git history.
- Exploit: anyone with repo read access connects directly to production Postgres: all user data, password hashes, billing IDs, support tickets — bypassing the app entirely.
- FIX: Rotate the Supabase DB password IMMEDIATELY. Replace literal with process.env.DATABASE_URL (sibling query-blogs.mjs already does). Purge from git history (filter-repo). Audit DB logs for unknown access.

## HIGH

### SEC-H1. /api/ai-analyze: scan-quota bypass — full ML product free, unmetered
[Broken Access Control/Billing] src/app/api/ai-analyze/route.ts (+ src/lib/usage.ts:58)
- Calls canUserScan (read-only) at line 193 but never reserveScanSlot/incrementScanCount; no scan history logged; absent from middleware matcher (does its own auth()).
- Exploit: FREE user POSTs unlimited times; gets riskLevel/score/signals/RF/LSTM/explanations while counter stays 0.
- FIX: reserveScanSlot before work; 429 when not reserved; add to middleware matcher.

### SEC-H2. Apple receipt replay/sharing → unlimited PAID accounts from one purchase
[Auth/Billing] src/app/api/billing/apple/validate/route.ts
- Sets plan PAID with billingCustomerId = original_transaction_id; no uniqueness check across users; no receipt record; no stored expiry; no downgrade path.
- Exploit: one purchased receiptData blob shared → every account that POSTs it upgraded to PAID; never expires server-side.
- FIX: enforce uniqueness of original_transaction_id; persist entitlement with expiresAt; App Store Server Notifications; downgrade on expiry.

### SEC-H3. Unescaped user input in transactional email HTML (phishing primitive from trusted domain)
[Injection/Phishing] src/lib/email.ts:783,792,805 (admin notification), 898,915,921 (confirmation to attacker-controlled address)
- sendSupportTicketNotification/Confirmation interpolate ${subject}/${name}/${email}/${message} raw into HTML; isomorphic-dompurify is a dep but never imported here. Source: public /api/contact (3/hour/IP).
- Exploit: HTML in admin inbox; attacker-authored HTML email sent from ScamDunk-branded sender to arbitrary recipient.
- FIX: HTML-escape every interpolated value; don't echo user subject/name into confirmation.

### SEC-H4. No rate limit on primary web login (NextAuth credentials)
[Broken Auth] src/app/api/auth/[...nextauth]/route.ts + src/lib/auth.ts authorize()
- No rateLimit in authorize(); /api/auth/* not in middleware matcher; mobile login IS rate-limited, web is not. No lockout, no CAPTCHA on this path (only bcrypt cost 12 slows guessing).
- FIX: rateLimit "strict" keyed IP+email in/around authorize; lockout/backoff; Turnstile on web login like registration.

### SEC-H5. preview-login: default OWNER credential + auto-session; shared DB → production admin takeover
[Privilege Escalation] src/app/api/admin/auth/preview-login/route.ts
- PREVIEW_PASSWORD = env || "PreviewAdmin2026!"; creates role OWNER preview@scamdunk.com + real admin session; in ADMIN_PUBLIC_PATHS; enabled when NODE_ENV==="development" or preview VERCEL_ENV. Preview and production share one Supabase DB (proven by SEC-C1) → the OWNER account persists and works against production /admin/login.
- FIX: never create persistent OWNER from preview route against shared DB; require strong unique PREVIEW_ADMIN_PASSWORD (fail if unset); isolated preview DB; delete preview admin after session.

## MEDIUM

### SEC-M1. Register doesn't normalize email case (login lowercases) → users who register MixedCase can never log in; case-variant duplicate accounts (src/app/api/auth/register/route.ts vs auth.ts:77)
### SEC-M2. CAPTCHA optional on forgot-password (token optional; verified only if present) → reset email bombing (forgot-password/route.ts:12,38)
### SEC-M3. Mobile refresh tokens: stateless 7d JWTs, no rotation/revocation/jti store; secret falls back to JWT_SECRET+"_REFRESH"; algorithms not pinned (mobile-auth.ts:25, mobile/refresh)
### SEC-M4. No security headers at all: no CSP, X-Frame-Options, HSTS, nosniff, Referrer-Policy, Permissions-Policy (next.config.js) — admin/account clickjackable; no XSS backstop
### SEC-M5. Upload route allows SVG with client-declared MIME, no magic-byte check, public bucket; any admin role incl. VIEWER can upload (admin/news/media/upload/route.ts)
### SEC-M6. Admin blog preview renders post.content with dangerouslySetInnerHTML WITHOUT DOMPurify (admin/news/blog/[id]/page.tsx:633) while public renderer sanitizes — stored/self-XSS for admins
### SEC-M7. Credential-encryption key falls back to NEXTAUTH_SECRET (single-round HMAC); only console.warn in prod (admin/encryption.ts:26-35) — auth-secret compromise exposes all stored integration credentials
### SEC-M8. Credential sync fans all secrets to GitHub Actions repo secrets + Vercel preview+production envs (sync-credentials/sync-github/sync-vercel) — broad blast radius; preview gets production secrets
### SEC-M9. Server-side privileged Supabase storage writes use the public ANON key; security depends entirely on bucket RLS; public-read buckets implied (lib/supabase.ts) — if buckets permit anon insert, anyone can upload directly
### SEC-M10. Password reset does not invalidate existing sessions/mobile refresh tokens (stateless JWTs survive) — bump per-user sessionVersion checked in JWT callback

## LOW

### SEC-L1. admin/init GET + admin/setup GET unauthenticated; reveal adminExists/setupRequired; init GET returns raw err.message
### SEC-L2. Non-constant-time comparisons: setup key (init:55, setup:72), social-scan API key (social-scan/route.ts:29,298) — others already use timingSafeEqual
### SEC-L3. JsonLd JSON.stringify not </script>-escaped (components/JsonLd.tsx:16) — harden with < replacement
### SEC-L4. ticker interpolated into FMP/AV URLs without encodeURIComponent (marketData.ts:133 etc.) — query-param injection; restrict charset
### SEC-L5. delete-account calls /api/billing/paypal/cancel via unauthenticated server-to-server fetch → 401 swallowed → PayPal subscription NOT cancelled on account deletion (continued billing!) (delete-account/route.ts:72) — call cancelSubscription(userId) directly
### SEC-L6. Password policy inconsistent: register/reset 10+complexity vs profile PUT 8 vs admin setup 8
### SEC-L7. Sentry Session Replay on authenticated sessions (PII-adjacent); confirm masking; consider disabling for /admin,/account
### SEC-L8. prismaRateLimit read-then-write (not atomic) → limit overrun under burst; in-memory fallback per-instance
### SEC-L9. integrations listing returns BROWSER_* usernames/emails plaintext (showFullKey:true) to any admin incl. VIEWER
### SEC-L10. auth.ts logs DATABASE_URL prefix (first 20 chars) on DB errors

## VERIFIED-SECURE (checked, not vulnerable)
- PayPal webhook signature verified via verify-webhook-signature; rejects if PAYPAL_WEBHOOK_ID unset.
- Billing activate/cancel/subscription + /api/user/* use session user id (no IDOR); activateSubscription verifies PayPal ownership via custom_id/subscriber email.
- Password reset tokens 32-byte CSPRNG, single-use atomic consume; verification tokens single-use; admin session tokens stored as SHA-256; admin invites 32-byte + expiry.
- inbound-email webhook: timingSafeEqual on header, fails closed.
- Turnstile fails closed in production; login callbackUrl sanitized to relative paths; no SQLi ($queryRaw`SELECT 1` only; $executeRawUnsafe only hardcoded DDL); no child_process/eval; admin routes never return password hashes; mutations enforce hasRole.

## Admin route tally
65 admin route files audited; 0 state-changing handlers missing auth; 3 weak handlers (init GET, setup GET info disclosure; preview-login default OWNER credential).

## Top 5 urgent (by exploitability)
1. Rotate leaked Supabase DB password; purge from history (SEC-C1).
2. Make /api/ai-analyze consume quota (SEC-H1).
3. Bind/dedupe Apple receipts; persist expiry (SEC-H2).
4. Rate-limit + CAPTCHA web credentials login (SEC-H4).
5. Escape email HTML; neutralize preview-login OWNER backdoor (SEC-H3/H5).
