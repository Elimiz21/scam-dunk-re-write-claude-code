# Findings: Public Frontend, Auth Pages, SEO, Misc (37 findings)

## HIGH
- FE-H1. Uploaded screenshots SILENTLY DISCARDED: ScanInput submits chatImages but HomeContent.handleSubmit has no such param; /api/check body sends only {ticker, assetType, pitchText, context}; route has zero image references. UI toasts "Screenshots will be analyzed for scam patterns" — product-integrity failure on a fraud tool (ScanInput.tsx:147 + HomeContent.tsx:126-136,308-317). FIX: wire multipart/base64 through, or remove the upload UI + toasts.
- FE-H2. EMAIL_NOT_VERIFIED detection never matches: login checks result.error but NextAuth v5 returns "CredentialsSignin" with the subclass code in result.code → unverified users always see "Invalid email or password"; resend-verification prompt is dead code; signup-funnel leak ((auth)/login/page.tsx:53-62 vs lib/auth.ts:26-27). FIX: check result.code.
- FE-H3. /admin pages NOT in middleware matcher — admin UI client-gated only (AdminLayout checkSession); any visitor loads every admin page shell/nav/bundles; middleware also only checks cookie PRESENCE for /api/admin (middleware.ts:146-157, 96-99). FIX: add "/admin/:path*" + server-side token validation.
- FE-H4. Sidebar recent-scan history items do nothing when clicked (onClick only closes the sidebar; no /scan/[id] route, no callback) (Sidebar.tsx:259-294). FIX: onSelectScan re-load stored result.

## MEDIUM
- FE-M1. ScanInput preview object URLs revoked while files still in use (cleanup keyed on [uploadedFiles] — adding image 2 revokes image 1; double-revoke in removeFile) (ScanInput.tsx:98-102). FIX: revoke on unmount only via ref.
- FE-M2. Ticker validation rejects BRK.B / BF-B / 1INCH (STOCK ^[A-Z]{1,5}$, CRYPTO ^[A-Z]{2,10}$) (ScanInput.tsx:52-53).
- FE-M3. Scan progress fully SIMULATED (~6.2s of setTimeouts; stamps "SEC and alert databases checked" regardless of outcome; on fetch reject the detached simulation keeps animating behind the error screen) (HomeContent.tsx:186-331). FIX: gate steps on real progress; cancel on catch; cap floor ~2s.
- FE-M4. ScanResultsLayout "Learn More" panels hover-only (incl. Disclaimer & Terms) — unreachable on touch/keyboard (ScanResultsLayout.tsx:67-118).
- FE-M5. LimitReached: PAID user told they used "free checks" + shown PayPal subscribe button for plan they already pay for (duplicate-subscription risk); no dark: variants → illegible in dark mode (LimitReached.tsx:20-44).
- FE-M6. PayPalButton: config refetch + button teardown (innerHTML="") on EVERY parent re-render (effects depend on unmemoized callbacks; account page passes fresh arrows) — flicker, request spam, mid-checkout reset (PayPalButton.tsx:29-163 + account/page.tsx:182-199). FIX: useCallback at call sites / refs inside.
- FE-M7. Turnstile widget destroyed/recreated on every keystroke in signup (effect cleanup calls turnstile.remove; fresh inline callbacks each render) — flicker, wasted challenges, lost completed verification (turnstile.tsx:43-86 + signup/page.tsx:229-251). FIX: callbacks in refs, deps [siteKey].
- FE-M8. Password policy inconsistent: signup 10 chars; reset-password + account change 8 chars ("bypassable via reset") (signup:47-48 vs reset-password:40-41 vs account:241-242).
- FE-M9. Account "% used" renders bare (guard short-circuits, literal "% used" remains); PAID user with failed usage fetch sees 0/5 free-plan numbers (account/page.tsx:642-654).
- FE-M10. Author byline links 404 for any author outside 2-entry hardcoded map (post-client.tsx:121 + authors/[author]/page.tsx:14-23 notFound()) — crawlable 404s from every affected article. FIX: DB-driven author pages + shared slugifier.
- FE-M11. layout.tsx references /og-image.png which DOES NOT EXIST in public/ — broken Twitter cards + 404 org logo in JSON-LD (layout.tsx:38-52,95). FIX: point at /opengraph-image or add the file.
- FE-M12. JsonLd: JSON.stringify without < escaping; articleSchema includes DB-sourced headline/description/articleBody → </script> breakout = stored XSS on public article pages (JsonLd.tsx:16). FIX: .replace(/</g,"\\u003c").
- FE-M13. SearchAction advertises /?q={search_term_string} but nothing reads q — fake structured data risks rich-result eligibility (layout.tsx:80-87).
- FE-M14. Admin invite-acceptance auto-login ALWAYS fails: posts {email:"", password} then silently bounces to blank login (admin/login/page.tsx:122-137). FIX: return invitee email from invite PUT.
- FE-M15. Admin login headings hardcoded text-white on bg-background → invisible in light theme (admin/login/page.tsx:162,165).
- FE-M16. All admin pages: no 401→login redirect after mount (session expiry shows "Failed to fetch X"); no AbortController; ad-hoc polling ignores visibility — extract useAdminFetch (public Sidebar.tsx:115-146 already has the correct AbortController pattern).

## LOW
- FE-L1. aria-describedby points at nonexistent ids (ticker-error; name-hint) (ScanInput.tsx:775; signup:183).
- FE-L2. handleFileSelect/handleDrop ~60 duplicated lines; only errors[0] surfaced (ScanInput.tsx:163-226 vs 291-355).
- FE-L3. LoadingStepper rows click-only divs; progress bar no role=progressbar (LoadingStepper.tsx:54-78).
- FE-L4. normalizeRiskScore duplicated verbatim (HomeContent.tsx:28-33 + RiskCard.tsx:110-119, + mobile) — extract to lib.
- FE-L5. Dead local formatDate in Sidebar (89-102).
- FE-L6. verify-email effect has no run-once guard — StrictMode consumes single-use token twice; "already used" can overwrite success (verify-email/page.tsx:27-53).
- FE-L7. Post-deletion redirect /?deleted=true never consumed — no confirmation after irreversible action (account:309).
- FE-L8. Effects keyed on session OBJECT identity → duplicate usage/subscription fetches on every NextAuth update/refocus (account:114-120; HomeContent:108-112). FIX: [session?.user?.id].
- FE-L9. Read time computed over raw HTML (tags count as words) (post-client.tsx:48-52).
- FE-L10. News page DB failure renders empty "no posts" page that ISR caches 5 min; no pagination past 50 (news/page.tsx:92-95).
- FE-L11. Cover image bare <img> no dimensions → CLS on LCP image (post-client.tsx:107-111).
- FE-L12. sitemap lastModified=new Date() for all static routes; /authors/* missing (sitemap.ts:29-35).
- FE-L13. Hero content fetched client-side, invisible to crawlers, CLS flash, no res.ok check (HomeContent.tsx:88-102). FIX: fetch in server component.
- FE-L14. <button> nested inside <Link> (Sidebar nav/legal, Header dropdown) — invalid HTML, double tab stops.
- FE-L15. Header "Settings" and "Subscription" both link /account.
- FE-L16. /check is a client-only redirect stub in middleware matcher + robots (check/page.tsx:1-14).
- FE-L17. scan-status 30s polling never pauses on hidden tabs (348-354).

## TOP 10 (as ranked by reviewer)
1. Wire up or remove screenshot analysis (FE-H1)
2. Fix EMAIL_NOT_VERIFIED via result.code (FE-H2)
3. Add /admin/:path* to middleware + verify token (FE-H3)
4. Make sidebar history items load the scan (FE-H4)
5. Escape < in JsonLd (FE-M12)
6. LimitReached plan branch + dark mode (FE-M5)
7. Stabilize PayPalButton + Turnstile effects (FE-M6/M7)
8. Fix og-image refs + remove fake SearchAction (FE-M11/M13)
9. Unify password minimum (FE-M8)
10. DB-driven author pages (FE-M10)
