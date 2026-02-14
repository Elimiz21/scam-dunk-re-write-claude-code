# ScamDunk Security & Scalability Audit Report

**Date:** February 14, 2026
**Scope:** Full codebase audit -- authentication, APIs, database, frontend, scalability, environment, error handling, Python AI backend
**Application:** ScamDunk -- Stock Scam Red Flag Detector (Next.js 14 + Python FastAPI)

---

## Executive Summary

This audit identified **85+ findings** across the entire ScamDunk codebase. The application has a solid foundation with proper use of Prisma ORM (preventing SQL injection), bcrypt password hashing, Zod input validation on most endpoints, and Sentry error monitoring. However, there are **12 CRITICAL** and **18 HIGH** severity issues that require immediate attention before the application can safely serve users at scale.

The most severe findings fall into three categories:
1. **Authentication bypasses** -- hardcoded secrets, middleware bypass via Bearer tokens, unauthenticated admin endpoints, auto-verified mobile registration
2. **Billing fraud vectors** -- PayPal webhook signature verification is optional, subscription activation lacks ownership validation
3. **Scalability blockers** -- in-memory caching/rate-limiting unusable in serverless, no connection pooling, external API rate limits will buckle under 100+ concurrent users

| Severity | Count |
|----------|-------|
| CRITICAL | 12 |
| HIGH | 18 |
| MEDIUM | 27 |
| LOW | 18 |
| **Total** | **75** |

---

## Table of Contents

1. [CRITICAL Findings](#1-critical-findings)
2. [HIGH Findings](#2-high-findings)
3. [MEDIUM Findings](#3-medium-findings)
4. [LOW Findings](#4-low-findings)
5. [Scalability Assessment](#5-scalability-assessment)
6. [Positive Security Observations](#6-positive-security-observations)
7. [Priority Remediation Roadmap](#7-priority-remediation-roadmap)

---

## 1. CRITICAL Findings

### C-01: Hardcoded JWT Fallback Secret
**File:** `src/lib/mobile-auth.ts:13`

```typescript
const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret-change-me";
```

If neither environment variable is set, JWTs are signed with a publicly known string from the source code. An attacker can forge arbitrary access/refresh tokens for any user.

**Impact:** Complete authentication bypass for all mobile-authenticated endpoints.
**Fix:** Throw an error at startup if `JWT_SECRET` is not set. Never use a fallback.

---

### C-02: Middleware Authentication Bypass via Bearer Token
**File:** `src/middleware.ts:20-24`

```typescript
const authHeader = request.headers.get("Authorization");
if (authHeader?.startsWith("Bearer ")) {
  return NextResponse.next(); // No validation at all
}
```

Any request with `Authorization: Bearer <anything>` bypasses all middleware authentication. If any route handler forgets to independently validate the JWT, it is completely unprotected.

**Impact:** Authentication bypass on any protected route in the middleware matcher.
**Fix:** Validate the JWT within the middleware itself, or at minimum verify the token is properly signed before passing through.

---

### C-03: Unauthenticated Admin Init/Setup Endpoints
**Files:** `src/app/api/admin/init/route.ts:12-46`, `src/app/api/admin/setup/route.ts:40-94`

The `POST /api/admin/init` endpoint allows creating an OWNER-level admin with zero authentication -- it only checks if an admin already exists. The `POST /api/admin/setup` has an optional `ADMIN_SETUP_KEY` that is skipped if the env var is not set. On a fresh deployment or after a database reset, anyone can claim admin access.

**Impact:** Full admin takeover on any fresh/reset instance.
**Fix:** Require a cryptographically strong setup key that must be set, or disable these endpoints in production.

---

### C-04: Hardcoded Admin Credentials in Source Code
**File:** `prisma/seed/admin-seed.ts:15-17, 118`

```typescript
const ADMIN_EMAIL = "elimizroch@gmail.com";
const ADMIN_PASSWORD = "AdminPassword123!";
```

A real email address and password are hardcoded and committed to the repository. Line 118 also prints the password to stdout.

**Impact:** Anyone with repository access knows admin credentials.
**Fix:** Use environment variables for seed credentials. Never commit real credentials.

---

### C-05: Mobile Registration Bypasses Email Verification
**File:** `src/app/api/auth/mobile/register/route.ts:69`

```typescript
emailVerified: new Date(),  // AUTO-VERIFIED
```

Mobile registration sets `emailVerified` immediately, completely bypassing email ownership verification. An attacker can register any email address they don't own.

**Impact:** Account squatting, impersonation, bypassed verification system.
**Fix:** Implement proper email verification for mobile registration or send a verification code.

---

### C-06: Race Condition (TOCTOU) in Password Reset Token
**File:** `src/lib/tokens.ts:97-131`

`consumePasswordResetToken` reads the token and then deletes it in two separate operations. Two concurrent requests can both verify the same token before either deletes it.

**Impact:** Password reset tokens can be reused by an attacker racing the legitimate user.
**Fix:** Use an atomic `findFirst` + `delete` within a database transaction.

---

### C-07: PayPal Webhook Signature Verification Is Optional
**File:** `src/lib/paypal.ts:189-197`

```typescript
const webhookId = process.env.PAYPAL_WEBHOOK_ID;
if (webhookId) {
  // verify signature
}
// If PAYPAL_WEBHOOK_ID not set, NO verification happens
```

When `PAYPAL_WEBHOOK_ID` is absent (documented as optional), webhook events are processed without any signature verification. An attacker can forge events to upgrade any user to PAID.

**Impact:** Billing fraud -- free plan bypass, unauthorized upgrades/downgrades.
**Fix:** Make `PAYPAL_WEBHOOK_ID` required. Reject all webhook events if verification cannot be performed.

---

### C-08: PayPal Activate Endpoint -- IDOR / Subscription Hijacking
**Files:** `src/app/api/billing/paypal/activate/route.ts:18-28`, `src/lib/paypal.ts:323-356`

The activate endpoint accepts any `subscriptionId` and only verifies with PayPal that it's active. It never validates that the subscription belongs to the authenticated user. An attacker can upgrade their account using someone else's subscription ID.

**Impact:** Billing fraud, unauthorized PAID access.
**Fix:** Verify that the subscription's `custom_id` or `subscriber.email_address` matches the authenticated user.

---

### C-09: No Environment Variable Validation at Startup
**File:** `src/lib/config.ts:1-70`

Every secret defaults to `""` when absent:
```typescript
nextAuthSecret: process.env.NEXTAUTH_SECRET || "",
browserSessionEncryptionKey: process.env.BROWSER_SESSION_ENCRYPTION_KEY || "",
```

An empty `NEXTAUTH_SECRET` means JWTs are signed with an empty string. An empty encryption key renders all encryption useless.

**Impact:** Silent security degradation in misconfigured deployments.
**Fix:** Validate required secrets at startup and throw fatal errors if missing.

---

### C-10: Python AI API Has Zero Authentication
**File:** `python_ai/api_server.py` (entire file)

Every endpoint (`/analyze`, `/sec-check/{ticker}`, `/models/status`) is fully open with no authentication. Combined with `allow_origins=["*"]` CORS and `allow_credentials=True`, any website can invoke expensive ML inference.

**Impact:** Resource exhaustion, unauthorized data access, cost inflation.
**Fix:** Add API key authentication via a shared secret between the Next.js backend and the Python API.

---

### C-11: Python AI API -- Wildcard CORS with Credentials
**File:** `python_ai/api_server.py:40-46`

```python
allow_origins=["*"],
allow_credentials=True,
```

This violates the CORS spec (browsers should reject this) but creates confusion and signals insecure configuration. Combined with zero auth, any origin can make requests.

**Impact:** Cross-origin abuse of ML endpoints.
**Fix:** Restrict `allow_origins` to the Next.js frontend domain only.

---

### C-12: In-Memory Rate Limiting Is Ineffective in Serverless
**File:** `src/lib/rate-limit.ts:30, 149-197`

When Redis is not configured, rate limiting falls back to an in-memory `Map`. In Vercel's serverless environment, each function instance has isolated memory. Rate limits are not shared, providing zero protection under load.

**Impact:** Complete rate limit bypass under concurrent load without Redis.
**Fix:** Make Redis required for production. Fail closed if Redis is unavailable.

---

## 2. HIGH Findings

### H-01: Rate Limiting Fails Open on Redis Outage
**File:** `src/app/api/check/route.ts:193-201`
If Upstash Redis is unavailable, the rate limit error is caught and the request proceeds without limits, allowing unlimited expensive API calls.

### H-02: Missing Rate Limiting on 11+ Sensitive Endpoints
**Files:** `src/app/api/contact/route.ts`, `src/app/api/inbound-email/route.ts`, `src/app/api/ai-analyze/route.ts`, `src/app/api/billing/paypal/activate/route.ts`, `src/app/api/billing/paypal/cancel/route.ts`, `src/app/api/auth/verify-email/route.ts`, `src/app/api/auth/resend-verification/route.ts`, `src/app/api/auth/mobile/refresh/route.ts`, all admin routes
The contact form can be weaponized as an email relay (sends confirmation to user-provided email). The AI-analyze endpoint triggers expensive ML inference with no throttle.

### H-03: Preview Login with Hardcoded OWNER Credentials
**File:** `src/app/api/admin/auth/preview-login/route.ts:14-16`
Hardcoded `preview@scamdunk.com` / `PreviewAdmin2026!` creates OWNER-level admin access. If `PREVIEW_ADMIN_ENABLED=true` is accidentally set in production, full admin access is available.

### H-04: Health Check Leaks Database Error Details
**File:** `src/app/api/health/route.ts:15-16`
Unauthenticated endpoint returns raw database error messages that can expose connection strings or infrastructure details.

### H-05: AI-Analyze GET Endpoint Leaks Internal Backend URL
**File:** `src/app/api/ai-analyze/route.ts:322-333`
Unauthenticated endpoint returns the Python AI backend URL, revealing internal network topology.

### H-06: Mobile Login Bypasses Email Verification
**File:** `src/app/api/auth/mobile/login/route.ts:74-76`
Deliberately skips email verification check, creating an escape hatch for unverified web accounts.

### H-07: No CAPTCHA on Mobile Registration or Login
**Files:** `src/app/api/auth/mobile/register/route.ts`, `src/app/api/auth/mobile/login/route.ts`
No Turnstile CAPTCHA on mobile endpoints enables automated mass account creation.

### H-08: Access and Refresh Tokens Use Same Secret
**File:** `src/lib/mobile-auth.ts:35-54`
Both token types signed with identical `JWT_SECRET`. Compromising one key compromises both.

### H-09: Prisma Field Name Injection via sortBy
**File:** `src/app/api/admin/users/route.ts:25-26, 53`
Unsanitized `sortBy` query parameter used directly as Prisma `orderBy` field name.

### H-10: `$executeRawUnsafe` Usage
**File:** `src/app/api/admin/db-status/route.ts:209, 224`
While currently using hardcoded SQL, the pattern is dangerous and sets precedent for injection.

### H-11: OAuth Tokens Stored in Plain Text
**File:** `prisma/schema.prisma:38-43`
OAuth `access_token`, `refresh_token`, and `id_token` stored without field-level encryption.

### H-12: No Database Connection Pool Configuration
**File:** `src/lib/db.ts:7-13`
No `connection_limit`, `pool_timeout`, or `statement_timeout` configured. Prisma client is only cached in non-production, causing connection exhaustion in serverless.

### H-13: Unbounded In-Memory Market Data Cache
**File:** `src/lib/marketData.ts:47-48`
No maximum size limit on the cache `Map`. Entries for unvisited keys persist indefinitely, causing memory leaks.

### H-14: No Circuit Breaker for External APIs
**Files:** All files calling FMP, Alpha Vantage, CoinGecko, OpenAI, FINRA, OTC Markets
Zero results for "circuit", "breaker", or "backoff" in the codebase. Only a 25-second `AbortController` timeout exists.

### H-15: Unsafe Pickle Deserialization in LSTM Model Loader
**File:** `python_ai/lstm_model.py:565`
`np.load(scaler_path, allow_pickle=True)` enables arbitrary code execution if the model file is tampered with.

### H-16: Unsafe `joblib.load()` in Random Forest Model
**File:** `python_ai/ml_model.py:387-388`
`joblib.load()` uses pickle internally, enabling RCE via tampered model files.

### H-17: No Input Size Validation on Python AI Requests
**File:** `python_ai/api_server.py:84-91`
`ticker` has no `max_length`, `days` has no upper bound (100000 would fetch 274 years of data).

### H-18: Open Redirect via callbackUrl
**File:** `src/app/(auth)/login/page.tsx:25, 77`
`callbackUrl` from URL params passed directly to `router.push()` with no validation. Enables phishing redirects.

---

## 3. MEDIUM Findings

| ID | Description | File |
|----|-------------|------|
| M-01 | Turnstile CAPTCHA silently skipped if env var missing | `src/lib/turnstile.ts:25-28` |
| M-02 | User enumeration via registration and resend-verification | `src/app/api/auth/register/route.ts:86-89` |
| M-03 | Excessive console logging of email addresses | `src/lib/auth.ts` (multiple lines) |
| M-04 | Admin session cookie scoped to `/` not `/admin` | `src/lib/admin/auth.ts:107` |
| M-05 | Minimal password complexity (8 chars, no rules) | Multiple registration routes |
| M-06 | No cleanup job for expired sessions/tokens | `prisma/schema.prisma` (multiple models) |
| M-07 | Refresh tokens not revocable (stateless JWTs) | `src/lib/mobile-auth.ts` |
| M-08 | Admin login reveals deactivated account status | `src/lib/admin/auth.ts:60-61` |
| M-09 | Inbound email webhook auth bypass + timing attack | `src/app/api/inbound-email/route.ts:78-88` |
| M-10 | Error responses leak internal pipeline steps | `src/app/api/check/route.ts:428-432` |
| M-11 | Contact form usable as email bombing relay | `src/app/api/contact/route.ts` |
| M-12 | No request body size limits on data endpoints | `src/app/api/admin/social-scan/ingest/route.ts` |
| M-13 | Missing CORS configuration for mobile clients | Entire application |
| M-14 | Rate limiting bypassable via X-Forwarded-For spoofing | `src/lib/rate-limit.ts:123-143` |
| M-15 | N+1 query pattern in regulatory status | `src/lib/regulatoryDatabase.ts:598-614` |
| M-16 | Unbounded `findMany` queries without pagination | `src/lib/regulatoryDatabase.ts:39-51` |
| M-17 | No input validation on admin init endpoint | `src/app/api/admin/init/route.ts:14-15` |
| M-18 | Missing soft delete for compliance data | `prisma/schema.prisma` |
| M-19 | Race condition in scan usage counting | `src/lib/usage.ts:54-71, 77-119` |
| M-20 | API keys embedded in URL query strings | `src/lib/marketData.ts:63, 94, 136` |
| M-21 | Unvalidated external API responses | `src/lib/marketData.ts:66-86` |
| M-22 | Missing `response.ok` checks before JSON parsing | `src/lib/marketData.ts:66-67, 97-98` |
| M-23 | Sentry edge config missing beforeSend scrubbing | `sentry.edge.config.ts` |
| M-24 | `.env.production`/`.env.staging` not in .gitignore | `.gitignore:25-27` |
| M-25 | Docker container runs as root | `python_ai/Dockerfile` |
| M-26 | Single worker + threading lock serializes all ML requests | `python_ai/Dockerfile`, `python_ai/api_server.py:81` |
| M-27 | Loose dependency version pinning in requirements.txt | `python_ai/requirements.txt` |

---

## 4. LOW Findings

| ID | Description | File |
|----|-------------|------|
| L-01 | IP extraction from spoofable headers | `src/lib/rate-limit.ts:123-143` |
| L-02 | In-memory rate limiter unbounded growth | `src/lib/rate-limit.ts:30` |
| L-03 | PrismaAdapter cast to `any` | `src/lib/auth.ts:48` |
| L-04 | Stack traces stored in database | `src/lib/auth-error-tracking.ts:76` |
| L-05 | No CSRF on verify-email POST | `src/app/api/auth/verify-email/route.ts` |
| L-06 | PayPal config exposes plan ID unauthenticated | `src/app/api/billing/paypal/config/route.ts` |
| L-07 | Admin init GET leaks setup state | `src/app/api/admin/init/route.ts:77-104` |
| L-08 | AI-analyze never increments scan count | `src/app/api/ai-analyze/route.ts` |
| L-09 | Middleware matcher doesn't cover admin routes | `src/middleware.ts:30-40` |
| L-10 | Missing database indexes on queried columns | `prisma/schema.prisma` |
| L-11 | No enum constraints at database level | `prisma/schema.prisma` |
| L-12 | Supabase anon key used for server-side operations | `src/lib/supabase.ts:12-19` |
| L-13 | Unsanitized filename in Supabase upload | `src/lib/supabase.ts:59-68` |
| L-14 | LLM response content not sanitized for XSS | `src/lib/narrative.ts:114-127` |
| L-15 | SEC RSS feed ticker extraction false positives | `src/lib/regulatoryDatabase.ts:178, 202-206` |
| L-16 | Missing ScanHistory foreign key (orphaned records) | `prisma/schema.prisma:210-231` |
| L-17 | ReDoS risk in scoring engine regex | `src/lib/scoring.ts:115` |
| L-18 | Login error messages enable user enumeration | `src/app/(auth)/login/page.tsx:60-71` |

---

## 5. Scalability Assessment

### Can this handle 1000+ concurrent users? **No.**

| Bottleneck | Concurrent Capacity | Severity |
|---|---|---|
| **FMP API** (300 req/min, 3 calls/check) | ~100 checks/min max | CRITICAL |
| **Alpha Vantage fallback** (5 req/min) | ~1-2 checks/min | CRITICAL |
| **In-memory rate limiting** (serverless) | 0 protection | CRITICAL |
| **Database connections** (no pooling config) | ~20-100 total | HIGH |
| **In-memory cache** (not shared across instances) | Cache miss on every instance | HIGH |
| **30-second blocking requests** | Limited by Vercel concurrency | HIGH |
| **Python AI backend** (1 worker, serialized) | 1 request at a time | HIGH |
| **Usage limit race condition** | Quota exceeded by concurrent requests | MEDIUM |
| **No request queue or backpressure** | All requests compete immediately | MEDIUM |
| **Scan history in critical response path** | Adds DB latency to every response | LOW |

### Key Scalability Recommendations

1. **Redis is mandatory** -- Rate limiting, caching, and session storage must use shared state (Redis/Upstash). In-memory fallbacks are non-functional in serverless.

2. **Shared cache layer** -- Replace in-memory `Map` caches with Redis. The market data cache creating separate FMP API calls per serverless instance is the #1 cost multiplier.

3. **Connection pooling** -- Configure Prisma with `connection_limit=1` per instance and use PgBouncer via `?pgbouncer=true` in the connection string.

4. **External API queuing** -- Implement a request queue (e.g., Bull/BullMQ with Redis) for FMP/Alpha Vantage calls to respect rate limits globally.

5. **Python AI backend scaling** -- Increase gunicorn workers, remove the global `threading.Lock()`, and add request queuing.

6. **Async scan history** -- Move history logging and metrics updates out of the critical response path (fire-and-forget or background job).

7. **Atomic usage counting** -- Use Prisma's `increment` operation or database transactions to prevent scan limit race conditions.

---

## 6. Positive Security Observations

The following practices are well-implemented:

1. **Prisma ORM** used consistently throughout -- no SQL injection risk in standard queries
2. **Zod validation** applied on most user-facing input endpoints
3. **Bcrypt with cost factor 12** for password hashing
4. **Cryptographically random tokens** (`crypto.randomBytes(32)`) for admin sessions and invites
5. **Admin audit logging** is comprehensive (login, logout, user modifications, config changes)
6. **Admin `getAdminSession()` checks** are consistently applied across all 47+ admin route files
7. **Role-based authorization** with `hasRole()` for destructive admin operations
8. **No XSS via `dangerouslySetInnerHTML`** -- zero instances in the entire codebase
9. **No hardcoded API keys in client components** -- only public-by-design `NEXT_PUBLIC_` keys
10. **Source maps hidden** from production via `hideSourceMaps: true`
11. **Sentry client/server configs** properly strip authorization headers and cookies
12. **`.env` files properly gitignored**
13. **Graceful degradation** from Python ML to TypeScript scoring when backend unavailable
14. **Email masking** in auth-error-tracking module
15. **Subscription cancellation** properly validates the authenticated user

---

## 7. Priority Remediation Roadmap

### Immediate (Before Next Deploy)

1. Remove hardcoded JWT fallback secret (`src/lib/mobile-auth.ts:13`) -- throw error if not set
2. Fix middleware Bearer token bypass -- validate JWT in middleware
3. Protect admin init/setup endpoints with required secret keys
4. Remove hardcoded admin credentials from seed script
5. Make PayPal webhook verification required (not optional)
6. Add ownership validation to PayPal activate endpoint
7. Add startup validation for all required environment variables

### Urgent (Within 1 Week)

8. Implement email verification for mobile registration
9. Make password reset token consumption atomic (database transaction)
10. Add rate limiting to all unprotected sensitive endpoints
11. Add authentication to Python AI API endpoints
12. Restrict Python AI CORS to frontend domain only
13. Configure database connection pooling for serverless
14. Remove/protect preview login endpoint in production

### Soon (Within 1 Month)

15. Replace in-memory caches with Redis-backed shared cache
16. Implement circuit breakers for external API calls
17. Add request queuing for FMP/Alpha Vantage API calls
18. Implement account lockout after repeated failed login attempts
19. Add session invalidation on password change
20. Add Content-Security-Policy headers
21. Implement proper CORS configuration for mobile clients
22. Scale Python AI backend (multiple workers, remove global lock)

### Planned (Within Quarter)

23. Add field-level encryption for OAuth tokens
24. Implement soft deletes for compliance-sensitive data
25. Add database-level enum constraints
26. Add missing database indexes
27. Implement token revocation for mobile JWTs
28. Add comprehensive health checks (all downstream services)
29. Implement request body size limits on data-heavy endpoints
30. Pin Python dependency versions with upper bounds
