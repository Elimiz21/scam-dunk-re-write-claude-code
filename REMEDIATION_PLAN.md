# ScamDunk Security Remediation Plan

**Date:** February 14, 2026
**Branch:** `claude/security-scalability-audit-bVtb4`
**Reference:** `SECURITY_SCALABILITY_AUDIT.md`

---

## Prerequisites & Tooling Setup

### MCP Servers (Configured)

| Server | Purpose | Status |
|--------|---------|--------|
| **GitHub** | PR management, issue tracking | Configured |
| **Supabase** | Direct DB management, schema inspection | Configured |
| **Vercel** | Preview deployments, env var management | Configured |

### Plugins (Installed)

Three official Anthropic plugins are installed in `.claude/plugins/`:

| Plugin | Slash Command | Purpose |
|--------|--------------|---------|
| **frontend-design** | `/frontend-design` | Production-grade UI/UX skill (auto-invokes for frontend work) |
| **code-review** | `/code-review` | Multi-agent PR review — 5 parallel agents for bugs & CLAUDE.md compliance |
| **pr-review-toolkit** | `/pr-review-toolkit:review-pr` | 6 specialized agents: code-reviewer, code-simplifier, comment-analyzer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer |

These plugins are used in every batch prompt below:
- **code-simplifier** agent runs after each implementation to refine code clarity
- **code-reviewer** agent runs after simplification to catch bugs and standards violations
- **silent-failure-hunter** agent validates error handling changes (Batches 2b, 3a, 3c)

### Hooks (Already Configured)

The SessionStart hook is active (npm install + prisma generate). No additional hooks needed for this remediation — testing is built into each agent prompt.

---

## Agent Team Architecture

Each batch runs as a **5-stage multi-agent pipeline**. The prompt orchestrates these agents sequentially — each stage must pass before proceeding to the next:

```
┌─────────────┐    ┌──────────────┐    ┌───────────────┐    ┌───────────────┐    ┌─────────────┐
│ 1. IMPLEMENT│───>│ 2. TEST      │───>│ 3. SIMPLIFY   │───>│ 4. REVIEW     │───>│ 5. COMMIT   │
│    Agent    │    │    Agent     │    │    Agent      │    │    Agent      │    │   & Push    │
│             │    │              │    │               │    │               │    │             │
│ Makes code  │    │ Per-fix:     │    │ code-simplifier│   │ code-reviewer │    │ Commits if  │
│ changes for │    │  tsc check   │    │ agent from    │    │ agent from    │    │ all stages  │
│ each issue  │    │  npm test    │    │ pr-review-    │    │ pr-review-    │    │ passed      │
│ one at a    │    │  prisma val. │    │ toolkit runs  │    │ toolkit runs  │    │             │
│ time        │    │ Per-fix:     │    │ on full diff  │    │ on full diff  │    │ Push to     │
│             │    │  fix before  │    │               │    │               │    │ remote      │
│             │    │  next issue  │    │               │    │               │    │             │
└─────────────┘    └──────────────┘    └───────────────┘    └───────────────┘    └─────────────┘
```

### Stage Details

**Stage 1 — IMPLEMENT:** Fix each issue one at a time. Read the file, make the change, then immediately move to Stage 2 testing for that fix before starting the next issue.

**Stage 2 — TEST (per-fix):** After each individual fix, run:
- `npx tsc --noEmit 2>&1 | head -50` — catch type errors immediately
- `npm test 2>&1` — catch broken tests immediately
- `npx prisma validate 2>&1` — if schema was touched
- If any check fails, fix it **before** moving to the next issue. Never batch up broken code.

**Stage 3 — SIMPLIFY:** After all fixes pass testing, launch the **code-simplifier** agent (from pr-review-toolkit) on the full diff. This agent refines clarity, consistency, and maintainability while preserving all functionality. Re-run Stage 2 tests after any simplification changes.

**Stage 4 — REVIEW:** Launch the **code-reviewer** agent (from pr-review-toolkit) on the full diff. This agent checks for bugs, security issues, and project guideline violations with confidence scoring (only flags issues >= 80% confidence). Fix any Critical (90-100) or Important (80-89) issues found, then re-run tests.

**Stage 5 — COMMIT & PUSH:** Only after Stages 1-4 all pass. Commit with the batch-specific message and push to the remote branch.

### Additional Specialized Agents (triggered when relevant)

| Agent | When to Use | Batches |
|-------|-------------|---------|
| **silent-failure-hunter** | When error handling, catch blocks, or fallback logic is modified | 1, 2a, 2b, 3a, 3c |
| **type-design-analyzer** | When new types or interfaces are introduced | 2b (CircuitBreaker), 3b (Zod schemas) |
| **comment-analyzer** | When significant comments or documentation are added | 2b (H-11 TODO), 4 (L-01 documentation) |
| **pr-test-analyzer** | When new test files are added or existing tests modified | Any batch that adds tests |

### Testing Constraints

**What we CAN verify locally:**
- TypeScript compilation (`npx tsc --noEmit`)
- Jest unit tests (`npm test`)
- ESLint on specific files (`npx eslint <file>`)
- Prisma schema validity (`npx prisma validate`)

**What requires Vercel preview deploy:**
- `next build` (no network access to Google Fonts locally)
- `next lint` (requires `.eslintrc.json` which breaks Vercel build)
- Full E2E integration testing

---

## Batch 1: CRITICAL Issues (12 items)

All 12 critical issues fixed in a single coordinated commit. These are security-blocking issues.

### C-01: Remove Hardcoded JWT Fallback Secret
**File:** `src/lib/mobile-auth.ts:13`
**Change:** Replace fallback `"fallback-secret-change-me"` with a startup check that throws if `JWT_SECRET` and `NEXTAUTH_SECRET` are both missing.
```typescript
const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET or NEXTAUTH_SECRET must be set");
}
```

### C-02: Fix Middleware Bearer Token Bypass
**File:** `src/middleware.ts:20-24`
**Change:** Instead of blindly passing through, validate the JWT signature before allowing the request. Import `verifyAccessToken` from mobile-auth and reject invalid tokens with 401.
**Note:** The middleware runs in Edge runtime — must use edge-compatible JWT verification. We'll use `jose` (already available via NextAuth) instead of `jsonwebtoken`.

### C-03: Protect Admin Init/Setup Endpoints
**Files:** `src/app/api/admin/init/route.ts`, `src/app/api/admin/setup/route.ts`
**Change:**
- `init`: Require `ADMIN_SETUP_KEY` env var. Reject if not set or doesn't match.
- `setup`: Make `ADMIN_SETUP_KEY` mandatory (remove the "skip if not set" logic).
- Both: Return generic error messages, no internal state leaks.

### C-04: Remove Hardcoded Admin Credentials
**File:** `prisma/seed/admin-seed.ts`
**Change:** Replace hardcoded email/password with `process.env.ADMIN_SEED_EMAIL` and `process.env.ADMIN_SEED_PASSWORD`. Throw if not set. Remove console.log of password.

### C-05: Fix Mobile Registration Email Bypass
**File:** `src/app/api/auth/mobile/register/route.ts:69`
**Change:** Remove `emailVerified: new Date()`. Generate a verification code, send it via email, and require verification before the account is usable.
**Simpler alternative (recommended for speed):** Set `emailVerified: null` and send verification email, same as web registration flow.

### C-06: Fix Password Reset Token Race Condition
**File:** `src/lib/tokens.ts:97-131`
**Change:** Use Prisma `$transaction` to atomically find + delete the token. If delete fails (already consumed), reject the request.

### C-07: Make PayPal Webhook Verification Required
**File:** `src/lib/paypal.ts:189-197`
**Change:** If `PAYPAL_WEBHOOK_ID` is not set, reject all webhook events with 503. Log a warning.

### C-08: Fix PayPal Activate IDOR
**File:** `src/app/api/billing/paypal/activate/route.ts`
**Change:** After getting subscription details from PayPal, verify that the subscription's `custom_id` or `subscriber.email_address` matches the authenticated user's email/ID. Reject mismatches.

### C-09: Add Environment Variable Validation
**File:** `src/lib/config.ts`
**Change:** Create a `validateRequiredEnvVars()` function that throws on missing required secrets. Call it from `instrumentation.ts` (runs once on startup). Required vars: `NEXTAUTH_SECRET`, `DATABASE_URL`.
**Note:** Other vars (FMP_API_KEY, etc.) can warn but not throw — they have graceful degradation.

### C-10: Add Python AI API Authentication
**File:** `python_ai/api_server.py`
**Change:** Add API key middleware that checks `X-API-Key` header against `AI_API_SECRET` env var. Apply to all endpoints except `/health`.

### C-11: Fix Python CORS Configuration
**File:** `python_ai/api_server.py:40-46`
**Change:** Replace `allow_origins=["*"]` with `allow_origins=[os.environ.get("ALLOWED_ORIGIN", "https://scamdunk.com")]`. Set `allow_credentials=False`.

### C-12: Make Redis Required for Rate Limiting
**File:** `src/lib/rate-limit.ts`
**Change:** In production (`NODE_ENV === "production"`), if Redis is not configured, throw an error instead of falling back to in-memory. In development, keep in-memory fallback.

---

## Batch 2: HIGH Issues (18 items)

Split into two sub-batches for manageability.

### Batch 2a: Auth & Security Hardening (H-01 through H-09)

#### H-01: Rate Limiting Fails Open
**File:** `src/app/api/check/route.ts:193-201`
**Change:** On Redis error, return 503 "Service temporarily unavailable" instead of proceeding without limits.

#### H-02: Add Rate Limiting to Sensitive Endpoints
**Files:** Multiple API routes
**Change:** Apply rate limiter to: `/api/contact`, `/api/ai-analyze`, `/api/billing/paypal/activate`, `/api/billing/paypal/cancel`, `/api/auth/verify-email`, `/api/auth/resend-verification`, `/api/auth/mobile/refresh`, `/api/inbound-email`. Use existing `rateLimit` function with appropriate limits per endpoint.

#### H-03: Protect Preview Login
**File:** `src/app/api/admin/auth/preview-login/route.ts`
**Change:** Add explicit check that `NODE_ENV !== "production"`. Add rate limiting. Add audit log entry.

#### H-04: Sanitize Health Check Errors
**File:** `src/app/api/health/route.ts`
**Change:** Replace raw error message with generic "Database connection failed". Log full error server-side only.

#### H-05: Remove Backend URL Leak
**File:** `src/app/api/ai-analyze/route.ts:322-333`
**Change:** Return `{ available: true/false }` only, not the URL.

#### H-06: Enforce Email Verification on Mobile Login
**File:** `src/app/api/auth/mobile/login/route.ts:74-76`
**Change:** Check `user.emailVerified` and reject unverified users with a message to verify their email first.

#### H-07: Add CAPTCHA to Mobile Endpoints
**Files:** `src/app/api/auth/mobile/register/route.ts`, `src/app/api/auth/mobile/login/route.ts`
**Change:** Accept a `turnstileToken` field in the request body and verify it. For mobile, this uses Cloudflare Turnstile's invisible mode.

#### H-08: Separate Access/Refresh Token Secrets
**File:** `src/lib/mobile-auth.ts`
**Change:** Use `JWT_SECRET` for access tokens, `JWT_SECRET + "_REFRESH"` (or a separate `JWT_REFRESH_SECRET` env var) for refresh tokens.

#### H-09: Sanitize sortBy Parameter
**File:** `src/app/api/admin/users/route.ts`
**Change:** Whitelist allowed sort fields: `["createdAt", "email", "name", "plan"]`. Reject any `sortBy` not in the whitelist.

### Batch 2b: Infrastructure & Security (H-10 through H-18)

#### H-10: Replace `$executeRawUnsafe`
**File:** `src/app/api/admin/db-status/route.ts`
**Change:** Replace with `$queryRaw` using tagged template literals (parameterized).

#### H-11: Note — OAuth Token Encryption
**File:** `prisma/schema.prisma`
**Scope:** This requires a data migration strategy. For now, add a TODO and flag for future work. Encrypting existing tokens requires a migration script.

#### H-12: Configure Database Connection Pooling
**File:** `src/lib/db.ts`
**Change:** Add `connection_limit=1` for serverless. Cache PrismaClient globally in all environments (not just non-production).
**Note:** PgBouncer configuration is in the DATABASE_URL connection string — document this.

#### H-13: Bound In-Memory Cache
**File:** `src/lib/marketData.ts`
**Change:** Add LRU eviction: limit cache to 1000 entries, evict oldest on overflow. Add TTL-based expiry.

#### H-14: Add Circuit Breaker for External APIs
**Files:** `src/lib/marketData.ts`, `src/lib/finra.ts`, `src/lib/otcMarkets.ts`
**Change:** Implement a simple circuit breaker: track consecutive failures, open circuit after 5 failures, half-open after 30 seconds. Return cached/default data when circuit is open.

#### H-15 & H-16: Model File Safety
**Files:** `python_ai/lstm_model.py:565`, `python_ai/ml_model.py:387-388`
**Change:** Add file hash verification before loading. Compute SHA-256 of model files and compare against known-good hashes stored in a config file.

#### H-17: Python Input Validation
**File:** `python_ai/api_server.py`
**Change:** Add `max_length=10` on ticker, `le=365` on days parameter. Add Pydantic model validation.

#### H-18: Fix Open Redirect
**File:** `src/app/(auth)/login/page.tsx`
**Change:** Validate `callbackUrl` is a relative path or matches the application's domain. Reject absolute URLs to external domains.

---

## Batch 3: MEDIUM Issues (27 items)

Split into three sub-batches.

### Batch 3a: Auth & Session (M-01 through M-09)

| ID | Fix Summary | Complexity |
|----|-------------|------------|
| M-01 | Make Turnstile verification fail closed in production | Small |
| M-02 | Return generic "check your email" message for registration/resend | Small |
| M-03 | Remove console.log of email addresses, use structured logging | Medium |
| M-04 | Scope admin session cookie path to `/admin` | Small |
| M-05 | Add password complexity rules (uppercase, lowercase, number, 10+ chars) | Small |
| M-06 | Add a cron/scheduled cleanup for expired sessions/tokens | Medium |
| M-07 | Document stateless JWT limitation; add short expiry (15min access) | Small |
| M-08 | Return generic "invalid credentials" for admin login | Small |
| M-09 | Fix timing-safe comparison for inbound email webhook | Small |

### Batch 3b: API & Data (M-10 through M-18)

| ID | Fix Summary | Complexity |
|----|-------------|------------|
| M-10 | Sanitize error responses — remove internal step names | Small |
| M-11 | Add rate limit to contact form (3/hour per IP) | Small |
| M-12 | Add body size validation on data ingestion endpoints | Small |
| M-13 | Add CORS headers for mobile API responses | Medium |
| M-14 | Use Vercel's `x-real-ip` header (trusted by platform) for rate limiting | Small |
| M-15 | Batch regulatory status queries (use `findMany` with `where IN`) | Medium |
| M-16 | Add pagination with `take` limit to unbounded queries | Small |
| M-17 | Add Zod validation to admin init endpoint body | Small |
| M-18 | Add `deletedAt` soft delete field to compliance models | Medium (schema change) |

### Batch 3c: Infrastructure & Python (M-19 through M-27)

| ID | Fix Summary | Complexity |
|----|-------------|------------|
| M-19 | Use Prisma `$transaction` + `increment` for atomic scan counting | Medium |
| M-20 | Move API keys to headers instead of URL query strings | Small |
| M-21 | Add Zod schema for external API response validation | Medium |
| M-22 | Add `response.ok` checks before parsing JSON | Small |
| M-23 | Add `beforeSend` scrubbing to Sentry edge config | Small |
| M-24 | Add `.env.production`/`.env.staging` to `.gitignore` | Trivial |
| M-25 | Add non-root user to Python Dockerfile | Small |
| M-26 | Increase gunicorn workers, remove global threading lock | Small |
| M-27 | Pin Python dependency versions with `==` | Small |

---

## Batch 4: LOW Issues (18 items)

All LOW items in a single batch.

| ID | Fix Summary | Complexity |
|----|-------------|------------|
| L-01 | Document IP extraction limitation (Vercel trusted proxy) | Trivial |
| L-02 | Add size limit to in-memory rate limiter (dev-only now after C-12) | Small |
| L-03 | Replace `as any` PrismaAdapter cast with proper typing | Trivial |
| L-04 | Hash stack traces before storing in DB | Small |
| L-05 | Add CSRF token check to verify-email endpoint | Small |
| L-06 | Add authentication to PayPal config endpoint | Small |
| L-07 | Remove admin init GET state leak (only return `{ needsSetup: bool }`) | Small |
| L-08 | Increment scan count in ai-analyze endpoint | Small |
| L-09 | Add `/admin` and `/api/admin` to middleware matcher | Small |
| L-10 | Add database indexes on frequently queried columns | Medium (schema) |
| L-11 | Convert string fields to Prisma enums where applicable | Medium (schema) |
| L-12 | Use Supabase service role key for server-side operations | Small |
| L-13 | Sanitize filenames in Supabase upload (strip path traversal) | Small |
| L-14 | Sanitize LLM response content before rendering | Small |
| L-15 | Improve SEC RSS ticker regex precision | Small |
| L-16 | Add foreign key from ScanHistory to User | Medium (schema) |
| L-17 | Simplify scoring regex to prevent ReDoS | Small |
| L-18 | Use generic "invalid credentials" for login errors | Small |

---

## Execution Prompts

### How to Run Each Batch

Each batch is a single prompt you give to Claude Code. The prompt implements the **5-stage multi-agent pipeline** described above. Copy the prompt, run it, and monitor progress via the todo list.

**Pipeline enforced in every prompt:**
1. **IMPLEMENT** — Fix issues one at a time
2. **TEST (per-fix)** — Validate each fix immediately before moving to the next
3. **SIMPLIFY** — Launch code-simplifier agent on full diff, then re-test
4. **REVIEW** — Launch code-reviewer agent on full diff, fix any findings, re-test
5. **COMMIT & PUSH** — Only after all stages pass

---

### Prompt: Batch 1 — CRITICAL Issues

```
You are fixing the 12 CRITICAL security issues from SECURITY_SCALABILITY_AUDIT.md on branch claude/security-scalability-audit-bVtb4. Follow the implementation details in REMEDIATION_PLAN.md Batch 1 exactly.

## STAGE 1 — IMPLEMENT (one issue at a time)

Fix these issues in order: C-01, C-02, C-03, C-04, C-05, C-06, C-07, C-08, C-09, C-10, C-11, C-12.
Use TodoWrite to track each issue as a separate task. Mark each in_progress before starting, completed after passing tests.

For each issue:
1. Read the target file BEFORE editing
2. Make the minimal change needed — no refactoring, no extra comments
3. Immediately proceed to Stage 2 testing for this fix

For C-02 (middleware JWT validation), use the `jose` library (already installed via NextAuth) for Edge-compatible JWT verification. Import `jwtVerify` from 'jose'.
For C-09 (env validation), add the validation function to src/lib/config.ts and call it from src/instrumentation.ts.
For C-10 and C-11 (Python changes), edit files in python_ai/ directory.

## STAGE 2 — TEST (after EACH individual fix)

After fixing each issue, run ALL of these before moving to the next issue:
- npx tsc --noEmit 2>&1 | head -50
- npm test 2>&1
- npx prisma validate 2>&1

If any check fails, fix it NOW before proceeding to the next issue. Never accumulate broken code.

## STAGE 3 — SIMPLIFY (after all 12 fixes pass)

After all 12 fixes are implemented and individually tested:
1. Launch the code-simplifier agent (from .claude/plugins/pr-review-toolkit/agents/code-simplifier.md) using the Task tool
2. The agent should review the full git diff of all changes in this batch
3. Apply any simplification suggestions that improve clarity without changing functionality
4. Re-run ALL Stage 2 tests after any simplification changes

## STAGE 4 — REVIEW (after simplification)

1. Launch the code-reviewer agent (from .claude/plugins/pr-review-toolkit/agents/code-reviewer.md) using the Task tool
2. The agent reviews the full git diff for bugs, security issues, and standards violations
3. Additionally, launch the silent-failure-hunter agent (from .claude/plugins/pr-review-toolkit/agents/silent-failure-hunter.md) since this batch modifies error handling and fallback logic
4. Fix any Critical (90-100) or Important (80-89) confidence issues found
5. Re-run ALL Stage 2 tests after any review-driven fixes

## STAGE 5 — COMMIT & PUSH

Only after Stages 1-4 all pass:
1. Commit: "fix(security): resolve all 12 CRITICAL audit findings (C-01 through C-12)"
2. Push to origin/claude/security-scalability-audit-bVtb4

IMPORTANT: Do NOT add or modify .eslintrc.json — this breaks the Vercel build.
```

---

### Prompt: Batch 2a — HIGH Auth & Security (H-01 through H-09)

```
You are fixing HIGH severity auth/security issues H-01 through H-09 from SECURITY_SCALABILITY_AUDIT.md on branch claude/security-scalability-audit-bVtb4. Follow REMEDIATION_PLAN.md Batch 2a.

## STAGE 1 — IMPLEMENT (one issue at a time)

Fix issues in order: H-01, H-02, H-03, H-04, H-05, H-06, H-07, H-08, H-09.
Use TodoWrite to track each issue. Mark in_progress before starting, completed after passing tests.

For each issue:
1. Read the target file BEFORE editing
2. Make the minimal change needed
3. Immediately proceed to Stage 2 testing for this fix

For H-02 (rate limiting), import the existing rateLimit function from src/lib/rate-limit.ts. Use sensible defaults: auth endpoints 5/min, contact 3/hour, billing 10/min, ai-analyze 5/min.
For H-09 (sortBy), use a const array whitelist and check with .includes().

## STAGE 2 — TEST (after EACH individual fix)

After fixing each issue, run ALL of these before moving to the next issue:
- npx tsc --noEmit 2>&1 | head -50
- npm test 2>&1

If any check fails, fix it NOW before proceeding to the next issue.

## STAGE 3 — SIMPLIFY (after all 9 fixes pass)

1. Launch the code-simplifier agent (from .claude/plugins/pr-review-toolkit/agents/code-simplifier.md) using the Task tool
2. Review the full git diff, apply clarity improvements
3. Re-run ALL Stage 2 tests after any changes

## STAGE 4 — REVIEW (after simplification)

1. Launch the code-reviewer agent (from .claude/plugins/pr-review-toolkit/agents/code-reviewer.md) using the Task tool
2. Launch the silent-failure-hunter agent (from .claude/plugins/pr-review-toolkit/agents/silent-failure-hunter.md) — this batch modifies rate limiting fallback behavior (H-01) and error responses
3. Fix any Critical or Important issues found, re-run tests

## STAGE 5 — COMMIT & PUSH

Only after Stages 1-4 all pass:
1. Commit: "fix(security): resolve HIGH auth/security issues H-01 through H-09"
2. Push to origin/claude/security-scalability-audit-bVtb4

IMPORTANT: Do NOT add or modify .eslintrc.json.
```

---

### Prompt: Batch 2b — HIGH Infrastructure (H-10 through H-18)

```
You are fixing HIGH severity infrastructure issues H-10 through H-18 from SECURITY_SCALABILITY_AUDIT.md on branch claude/security-scalability-audit-bVtb4. Follow REMEDIATION_PLAN.md Batch 2b.

## STAGE 1 — IMPLEMENT (one issue at a time)

Fix issues in order: H-10, H-11, H-12, H-13, H-14, H-15, H-16, H-17, H-18.
Use TodoWrite to track each issue.

For each issue:
1. Read the target file BEFORE editing
2. Make the minimal change needed
3. Immediately proceed to Stage 2 testing

For H-11 (OAuth encryption): Do NOT modify the schema now. Add a code comment documenting the need for a future migration.
For H-13 (bounded cache): Implement a simple LRU with a Map that deletes the oldest entry when size > 1000.
For H-14 (circuit breaker): Create a lightweight CircuitBreaker class in src/lib/circuit-breaker.ts with states: CLOSED, OPEN, HALF_OPEN. Configure: 5 failures to open, 30s recovery.
For H-15/H-16 (Python model safety): Add SHA-256 hash verification. Store expected hashes in python_ai/model_hashes.json.
For H-18 (open redirect): Validate that callbackUrl starts with "/" and doesn't start with "//".

## STAGE 2 — TEST (after EACH individual fix)

After fixing each issue:
- npx tsc --noEmit 2>&1 | head -50
- npm test 2>&1
- npx prisma validate 2>&1

If any check fails, fix it NOW.

## STAGE 3 — SIMPLIFY (after all fixes pass)

1. Launch the code-simplifier agent using the Task tool
2. Review full diff, apply clarity improvements
3. Re-run ALL Stage 2 tests

## STAGE 4 — REVIEW (after simplification)

1. Launch the code-reviewer agent using the Task tool
2. Launch the silent-failure-hunter agent — H-14 (circuit breaker) introduces significant fallback/error handling logic
3. Launch the type-design-analyzer agent (from .claude/plugins/pr-review-toolkit/agents/type-design-analyzer.md) — H-14 introduces a new CircuitBreaker class with state invariants
4. Fix any Critical or Important issues, re-run tests

## STAGE 5 — COMMIT & PUSH

Only after Stages 1-4 all pass:
1. Commit: "fix(security): resolve HIGH infrastructure issues H-10 through H-18"
2. Push to origin/claude/security-scalability-audit-bVtb4

IMPORTANT: Do NOT add or modify .eslintrc.json.
```

---

### Prompt: Batch 3a — MEDIUM Auth & Session (M-01 through M-09)

```
You are fixing MEDIUM severity auth/session issues M-01 through M-09 from SECURITY_SCALABILITY_AUDIT.md on branch claude/security-scalability-audit-bVtb4. Follow REMEDIATION_PLAN.md Batch 3a.

## STAGE 1 — IMPLEMENT (one issue at a time)

Fix issues in order: M-01, M-02, M-03, M-04, M-05, M-06, M-07, M-08, M-09.
Use TodoWrite to track each issue.

For each issue:
1. Read the target file BEFORE editing
2. Make the minimal change needed
3. Immediately proceed to Stage 2 testing

For M-03 (console logging): Replace console.log calls that include emails with structured logging that masks the email (show first 2 chars + domain).
For M-06 (token cleanup): Add a serverless-compatible cleanup to the health check endpoint (run cleanup if last run > 24h ago). Don't add a separate cron job.
For M-09 (timing-safe comparison): Use crypto.timingSafeEqual for webhook secret comparison.

## STAGE 2 — TEST (after EACH individual fix)

After fixing each issue:
- npx tsc --noEmit 2>&1 | head -50
- npm test 2>&1

If any check fails, fix it NOW.

## STAGE 3 — SIMPLIFY (after all fixes pass)

1. Launch the code-simplifier agent using the Task tool
2. Review full diff, apply clarity improvements
3. Re-run ALL Stage 2 tests

## STAGE 4 — REVIEW (after simplification)

1. Launch the code-reviewer agent using the Task tool
2. Launch the silent-failure-hunter agent — M-01 (Turnstile fail-closed) and M-09 (timing-safe comparison) modify error handling paths
3. Fix any Critical or Important issues, re-run tests

## STAGE 5 — COMMIT & PUSH

Only after Stages 1-4 all pass:
1. Commit: "fix(security): resolve MEDIUM auth/session issues M-01 through M-09"
2. Push to origin/claude/security-scalability-audit-bVtb4

IMPORTANT: Do NOT add or modify .eslintrc.json.
```

---

### Prompt: Batch 3b — MEDIUM API & Data (M-10 through M-18)

```
You are fixing MEDIUM severity API/data issues M-10 through M-18 from SECURITY_SCALABILITY_AUDIT.md on branch claude/security-scalability-audit-bVtb4. Follow REMEDIATION_PLAN.md Batch 3b.

## STAGE 1 — IMPLEMENT (one issue at a time)

Fix issues in order: M-10, M-11, M-12, M-13, M-14, M-15, M-16, M-17, M-18.
Use TodoWrite to track each issue.

For each issue:
1. Read the target file BEFORE editing
2. Make the minimal change needed
3. Immediately proceed to Stage 2 testing

For M-15 (N+1 queries): Replace the loop with a single findMany using `where: { ticker: { in: tickers } }`.
For M-18 (soft delete): Add a `deletedAt DateTime?` field to RegulatoryFlag, ScanHistory, and User models.

## STAGE 2 — TEST (after EACH individual fix)

After fixing each issue:
- npx tsc --noEmit 2>&1 | head -50
- npm test 2>&1
- npx prisma validate 2>&1 (especially after M-18 schema change)

If any check fails, fix it NOW.

## STAGE 3 — SIMPLIFY (after all fixes pass)

1. Launch the code-simplifier agent using the Task tool
2. Review full diff, apply clarity improvements
3. Re-run ALL Stage 2 tests

## STAGE 4 — REVIEW (after simplification)

1. Launch the code-reviewer agent using the Task tool
2. Launch the type-design-analyzer agent — M-17 introduces Zod validation schemas with type invariants
3. Fix any Critical or Important issues, re-run tests

## STAGE 5 — COMMIT & PUSH

Only after Stages 1-4 all pass:
1. Commit: "fix(security): resolve MEDIUM API/data issues M-10 through M-18"
2. Push to origin/claude/security-scalability-audit-bVtb4

IMPORTANT: Do NOT add or modify .eslintrc.json.
```

---

### Prompt: Batch 3c — MEDIUM Infrastructure & Python (M-19 through M-27)

```
You are fixing MEDIUM severity infrastructure issues M-19 through M-27 from SECURITY_SCALABILITY_AUDIT.md on branch claude/security-scalability-audit-bVtb4. Follow REMEDIATION_PLAN.md Batch 3c.

## STAGE 1 — IMPLEMENT (one issue at a time)

Fix issues in order: M-19, M-20, M-21, M-22, M-23, M-24, M-25, M-26, M-27.
Use TodoWrite to track each issue.

For each issue:
1. Read the target file BEFORE editing
2. Make the minimal change needed
3. Immediately proceed to Stage 2 testing

For M-19 (atomic scan counting): Use prisma.$transaction with an increment operation.
For M-20 (API keys in URLs): Move to headers where the API supports it. For FMP, use the header method if available, otherwise document the limitation.
For M-25 (Docker non-root): Add `RUN adduser --disabled-password appuser` and `USER appuser` to the Dockerfile.

## STAGE 2 — TEST (after EACH individual fix)

After fixing each issue:
- npx tsc --noEmit 2>&1 | head -50
- npm test 2>&1

If any check fails, fix it NOW.

## STAGE 3 — SIMPLIFY (after all fixes pass)

1. Launch the code-simplifier agent using the Task tool
2. Review full diff, apply clarity improvements
3. Re-run ALL Stage 2 tests

## STAGE 4 — REVIEW (after simplification)

1. Launch the code-reviewer agent using the Task tool
2. Launch the silent-failure-hunter agent — M-22 (response.ok checks) and M-21 (Zod validation) introduce new error handling patterns
3. Fix any Critical or Important issues, re-run tests

## STAGE 5 — COMMIT & PUSH

Only after Stages 1-4 all pass:
1. Commit: "fix(security): resolve MEDIUM infrastructure issues M-19 through M-27"
2. Push to origin/claude/security-scalability-audit-bVtb4

IMPORTANT: Do NOT add or modify .eslintrc.json.
```

---

### Prompt: Batch 4 — LOW Issues (L-01 through L-18)

```
You are fixing all 18 LOW severity issues L-01 through L-18 from SECURITY_SCALABILITY_AUDIT.md on branch claude/security-scalability-audit-bVtb4. Follow REMEDIATION_PLAN.md Batch 4.

## STAGE 1 — IMPLEMENT (one issue at a time)

Fix issues in order: L-01 through L-18.
Use TodoWrite to track each issue.

For each issue:
1. Read the target file BEFORE editing
2. Make the minimal change needed
3. Immediately proceed to Stage 2 testing

For L-10 (indexes): Add @@index annotations to frequently queried fields: ScanHistory(userId), ApiUsageLog(createdAt), SupportTicket(status), AdminAuditLog(createdAt).
For L-11 (enums): Add Prisma enums for User.plan (FREE, PAID, ENTERPRISE), SupportTicket.status, AdminUser.role.
For L-16 (foreign key): Add a relation from ScanHistory to User with userId field.

## STAGE 2 — TEST (after EACH individual fix)

After fixing each issue:
- npx tsc --noEmit 2>&1 | head -50
- npm test 2>&1
- npx prisma validate 2>&1 (especially after L-10, L-11, L-16 schema changes)

If any check fails, fix it NOW.

## STAGE 3 — SIMPLIFY (after all fixes pass)

1. Launch the code-simplifier agent using the Task tool
2. Review full diff, apply clarity improvements
3. Re-run ALL Stage 2 tests

## STAGE 4 — REVIEW (after simplification)

1. Launch the code-reviewer agent using the Task tool
2. Launch the comment-analyzer agent (from .claude/plugins/pr-review-toolkit/agents/comment-analyzer.md) — L-01 adds documentation comments
3. Fix any Critical or Important issues, re-run tests

## STAGE 5 — COMMIT & PUSH

Only after Stages 1-4 all pass:
1. Commit: "fix(security): resolve all LOW severity issues L-01 through L-18"
2. Push to origin/claude/security-scalability-audit-bVtb4

IMPORTANT: Do NOT add or modify .eslintrc.json.
```

---

## Progress Monitoring

### After Each Batch

Run this prompt to check status:

```
Check the current state of the branch claude/security-scalability-audit-bVtb4:
1. Run: git log --oneline -10
2. Run: npx tsc --noEmit 2>&1 | tail -20
3. Run: npm test 2>&1 | tail -20
4. Run: npx prisma validate 2>&1
5. Summarize: which batches are done, what's the current state, any failures
```

### Full Status Dashboard

```
Generate a status report for the security remediation:
1. Read SECURITY_SCALABILITY_AUDIT.md for the full issue list
2. Read REMEDIATION_PLAN.md for the plan
3. Run: git log --oneline claude/security-scalability-audit-bVtb4 | head -20
4. For each commit, check which issues it addresses
5. Create a markdown table showing: Issue ID | Severity | Status (Done/Pending) | Commit
6. Output the table
```

---

## Risk Mitigation

### What Could Go Wrong

| Risk | Mitigation |
|------|------------|
| Schema changes break Vercel build | Prisma validate locally + preview deploy before merge |
| TypeScript errors from changes | `tsc --noEmit` check in every batch |
| Rate limiting changes break dev experience | In-memory fallback kept for `NODE_ENV !== "production"` |
| Python changes untestable locally | Python changes are isolated, manually verify syntax |
| Middleware JWT check blocks legitimate requests | Test with both web (session) and mobile (Bearer) auth flows |

### Rollback Plan

Each batch is a single commit. If a batch breaks the Vercel build:
```bash
git revert <commit-hash>
git push -u origin claude/security-scalability-audit-bVtb4
```

---

## Dependencies Between Batches

```
Batch 1 (CRITICAL) ─── must complete first
    │
    ├── Batch 2a (HIGH auth) ─── depends on C-01, C-02, C-12
    │
    ├── Batch 2b (HIGH infra) ─── depends on C-09, C-10, C-11
    │
    ├── Batch 3a (MEDIUM auth) ─── depends on Batch 2a
    │
    ├── Batch 3b (MEDIUM API) ─── depends on Batch 2a (rate limiting)
    │
    ├── Batch 3c (MEDIUM infra) ─── depends on Batch 2b
    │
    └── Batch 4 (LOW) ─── depends on all above
```

Batches 2a and 2b can run in parallel. Batches 3a, 3b, 3c can run in parallel after their dependencies.

---

## Estimated Scope

| Batch | Files Modified | New Files | Approx Lines Changed |
|-------|---------------|-----------|---------------------|
| 1 (CRITICAL) | ~12 | 0 | ~150 |
| 2a (HIGH auth) | ~12 | 0 | ~200 |
| 2b (HIGH infra) | ~8 | 2 | ~250 |
| 3a (MEDIUM auth) | ~9 | 0 | ~100 |
| 3b (MEDIUM API) | ~10 | 0 | ~150 |
| 3c (MEDIUM infra) | ~9 | 0 | ~120 |
| 4 (LOW) | ~15 | 0 | ~200 |
| **Total** | **~75** | **2** | **~1170** |
