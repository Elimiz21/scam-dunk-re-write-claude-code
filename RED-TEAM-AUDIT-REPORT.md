# RED TEAM AUDIT REPORT: Next.js 14 App Router Route & Component Compatibility

**Date:** 2026-03-03  
**Project:** ScamDunk  
**Scope:** New routes and components compatibility audit

---

## CRITICAL ISSUES FOUND

### 🔴 CRITICAL BUG #1: "use client" Boundary Violation in post-client.tsx

**File:** `src/app/news/post-client.tsx`  
**Severity:** CRITICAL  
**Impact:** Runtime Error - Component rendering failure

**Issue:**
The file has `"use client"` directive at the top. However, it imports and renders `JsonLd` component:

```typescript
import { JsonLd } from "@/components/JsonLd";
// ... later in JSX:
{articleSchema && <JsonLd data={articleSchema} />}
```

**Root Cause:**
`JsonLd` is a server component (no "use client" directive in `/src/components/JsonLd.tsx`). Client components **cannot render server components** directly in Next.js 14.

**Current JsonLd.tsx:**

```typescript
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

**Error Message (Expected at Runtime):**

```
Error: Cannot render server component in a client component
```

**Fix Required:**
Either:

1. Add `"use client"` to JsonLd.tsx (allows use in client components), OR
2. Remove JsonLd rendering from post-client.tsx and move it to the parent server component, OR
3. Move the JSON-LD script injection to the parent server component

**Recommended Fix:** Add `"use client"` to JsonLd.tsx since it's just rendering a script tag.

---

### 🔴 CRITICAL BUG #2: Missing onNewScan Handler Parameter in Hub Pages

**Files:**

- `src/app/investment-scams/page.tsx`
- `src/app/social-media-scams/page.tsx`
- `src/app/how-to-detect-stock-scams/page.tsx`
- `src/app/authors/[author]/page.tsx`

**Severity:** CRITICAL  
**Impact:** Runtime Error if sidebar tries to call onNewScan

**Issue:**
All hub pages instantiate Sidebar with:

```typescript
<Sidebar isOpen={false} onToggle={() => {}} onNewScan={() => {}} />
```

However, checking the HomeContent and AboutContent, the `onNewScan` handler is used to navigate:

```typescript
const handleNewScan = () => {
  window.location.href = "/";
};
```

The hub pages pass empty handler `() => {}` which **prevents navigation when user clicks "New Scan"** button in sidebar.

**Impact:**

- Users on hub pages cannot initiate a new scan from the sidebar
- Silent failure - no error logged, feature just doesn't work

**Fix Required:**

```typescript
// Instead of:
onNewScan={() => {}}

// Use:
onNewScan={() => window.location.href = "/"}
```

---

## LOGIC ERRORS & EDGE CASES

### 🟠 ISSUE #3: Authors Page - Missing Author Slug Transformation in Prisma Query

**File:** `src/app/authors/[author]/page.tsx`  
**Severity:** HIGH  
**Impact:** Wrong posts returned or none returned

**Issue - Slug Transformation Mismatch:**

The page transforms the author name from slug to display format:

```typescript
const authorSlug = decodeURIComponent(params.author); // e.g., "scam-dunk-team"
const authorName = authorSlug
  .split("-")
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(" ");
// Result: "Scam Dunk Team"
```

However, the Prisma query searches for the **author field** using `authorName`:

```typescript
author: authorName,  // Searches for "Scam Dunk Team"
```

**The Problem:**
In the schema, `author` field default is `"Scam Dunk Team"`. But what if:

- The database contains posts with author: "John Smith"
- User tries to access `/authors/john-smith`
- authorName becomes "John Smith" ✓
- But if it's stored as "john smith" (lowercase) or "JOHN SMITH" → **NO MATCH**

**Edge Case Not Handled:**
If a blog post's author field uses different casing than the slug transformation, the query will fail silently.

**Fix Required:**
Make the Prisma query case-insensitive:

```typescript
where: {
  isPublished: true,
  author: {
    equals: authorName,
    mode: 'insensitive'  // Add this
  },
}
```

**Secondary Issue:**
The `authorBios` object is hardcoded with slugs:

```typescript
const authorBios: Record<string, string> = {
  "scam-dunk-team": "...",
  "security-analyst": "...",
};
```

If a real author ("John Smith") writes posts but isn't in `authorBios`, the page returns `notFound()` even if posts exist. This creates a **discrepancy between static pages** (only those in authorBios) **and potential blog posts** (from database).

---

### 🟠 ISSUE #4: Hub Pages - Sidebar/Header Props Don't Match Component Signature

**Files:**

- `src/app/investment-scams/page.tsx`
- `src/app/social-media-scams/page.tsx`
- `src/app/how-to-detect-stock-scams/page.tsx`

**Severity:** MEDIUM  
**Impact:** Type mismatch, potential runtime behavior issues

**Issue:**

Hub pages are server components but use Sidebar/Header with no state management:

```typescript
<Sidebar isOpen={false} onToggle={() => {}} onNewScan={() => {}} />
<Header onSidebarToggle={() => {}} />
```

**Problem:**

- `isOpen={false}` is hardcoded, but `onToggle` does nothing
- User clicks sidebar toggle → does nothing (silent failure)
- Sidebar UI shows closed state but is unresponsive
- Header's `onSidebarToggle` is also non-functional

**Comparison to Working Pages:**

In HomeContent and AboutContent (client components with state):

```typescript
const [sidebarOpen, setSidebarOpen] = useState(false);

<Sidebar
  isOpen={sidebarOpen}
  onToggle={() => setSidebarOpen(!sidebarOpen)}
  onNewScan={handleNewScan}
/>
<Header onSidebarToggle={() => setSidebarOpen(!sidebarOpen)} />
```

**Root Cause:**
Hub pages are static server components, not client components. They cannot manage state. But the design assumes interactive components. This is a **component architecture mismatch**.

**Fix Required:**
Option 1: Move hub page content to a client component wrapper:

```typescript
// page.tsx (server component)
import HubPageClient from './hub-page-client';
export default function HubPage() {
  return <HubPageClient />;
}

// hub-page-client.tsx (client component)
"use client";
export default function HubPageClient() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <Sidebar
      isOpen={sidebarOpen}
      onToggle={() => setSidebarOpen(!sidebarOpen)}
      onNewScan={() => window.location.href = "/"}
    />
    // ... rest of content
  );
}
```

Option 2: Create a wrapper component that handles this automatically.

---

### 🟠 ISSUE #5: News Post Related Articles - Empty Array Handling

**File:** `src/app/news/post-client.tsx`  
**Severity:** LOW  
**Impact:** Incorrect grid layout display when relatedPosts has <3 items

**Issue:**

The Related Articles section uses:

```typescript
{relatedPosts.length > 0 && (
  <section className="mt-16 pt-12 border-t border-border">
    <h2 className="text-2xl font-bold mb-8">Related Articles</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {relatedPosts.map((relatedPost) => (
        // ...
      ))}
    </div>
  </section>
)}
```

**The Problem:**

- Grid uses `lg:grid-cols-3` (3 columns)
- If only 1 post returned: shows 1 item in a 3-column grid (ugly, lots of white space)
- If 2 posts returned: shows 2 items in a 3-column grid (awkward alignment)

**Edge Case:**
News post has category "Investment Fraud" but only 2 other published posts in that category. Grid renders with 1 empty column on desktop. Layout is not responsive to actual item count.

**Fix Required:**

```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-cols-max">
  {relatedPosts.map((relatedPost) => (
    // ...
  ))}
</div>

// OR better:
<div className={cn(
  "grid gap-6",
  relatedPosts.length === 1 && "grid-cols-1",
  relatedPosts.length === 2 && "grid-cols-1 md:grid-cols-2",
  relatedPosts.length >= 3 && "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
)}>
```

---

### 🟠 ISSUE #6: Blog Post Prisma Query - What If Post Has No Category?

**File:** `src/app/news/[slug]/page.tsx`  
**Severity:** MEDIUM  
**Impact:** Related posts query may return unintended results

**Issue:**

Related posts fetch logic:

```typescript
const rawRelatedPosts = await prisma.blogPost.findMany({
  where: {
    isPublished: true,
    category: post.category, // <-- Searches by category
    NOT: { id: post.id },
  },
  orderBy: { publishedAt: "desc" },
  take: 3,
  select: {
    /* ... */
  },
});
```

**The Problem:**
From the schema:

```prisma
category    String    @default("General")
```

Every post **must** have a category (defaults to "General"). But what if:

1. A post's category is "General" (the default)
2. There are 50 other posts with category "General"
3. The related posts query returns a random 3 of those 50

This means **unrelated content** appears as "related". A post about "Pump and Dump Schemes" with category "General" will show other random "General" posts as related.

**Not a runtime bug**, but a **logic error in content recommendation**.

**Fix Required:**
Add a secondary sort or filter to improve relevancy:

```typescript
// Option 1: Include tags in matching
where: {
  isPublished: true,
  category: post.category,
  NOT: { id: post.id },
  // Only show if published (not draft)
}

// Option 2: Fallback to same author if few related by category
// Option 3: Use tags for better matching (not currently implemented)
```

---

### 🟠 ISSUE #7: Authors Page - Static Params Don't Update When DB Changes

**File:** `src/app/authors/[author]/page.tsx`  
**Severity:** MEDIUM  
**Impact:** New authors won't have pages until rebuild

**Issue:**

The `generateStaticParams` uses hardcoded `authorBios`:

```typescript
export async function generateStaticParams(): Promise<PageParams[]> {
  return Object.keys(authorBios).map((author) => ({ author }));
}
```

This means:

- Only 2 pages generated: `scam-dunk-team` and `security-analyst`
- If you add a new blog post by "John Smith", the author page won't exist
- The route will 404 because it's not in static params
- (Unless ISR revalidation catches it, but that's not configured)

**Fix Required:**
Query the database for actual authors:

```typescript
export async function generateStaticParams(): Promise<PageParams[]> {
  if (!process.env.DATABASE_URL) {
    return Object.keys(authorBios).map((author) => ({ author }));
  }

  try {
    const { prisma } = await import("@/lib/db");
    const posts = await prisma.blogPost.findMany({
      where: { isPublished: true },
      select: { author: true },
      distinct: ["author"],
    });

    return posts.map((post) => ({
      author: post.author.toLowerCase().replace(/\s+/g, "-"),
    }));
  } catch (error) {
    console.error("Failed to generate author params:", error);
    return Object.keys(authorBios).map((author) => ({ author }));
  }
}
```

---

## COMPONENT COMPATIBILITY CHECKS

### ✅ PASS: All Lucide Icons Imported Are Available

**Files Checked:**

- investment-scams: AlertTriangle, TrendingUp, Shield, CheckCircle ✓
- social-media-scams: MessageCircle, AlertTriangle, Shield, CheckCircle ✓
- how-to-detect-stock-scams: Search, TrendingUp, AlertTriangle, CheckCircle, Shield ✓
- authors page: ArrowLeft, Calendar ✓

**Status:** All icons exist in lucide-react. No issues.

---

### ✅ PASS: Button Component Exists

**Path:** `src/components/ui/button.tsx` exists and is properly exported.

**Status:** All imports of `@/components/ui/button` will resolve correctly.

---

### ✅ PASS: Header and Sidebar Components Exist

**Locations:**

- Header: `src/components/Header.tsx` ✓
- Sidebar: `src/components/Sidebar.tsx` ✓

**Status:** Components exist. Props match interface definitions (when used correctly).

---

### ⚠️ WARN: JsonLd Export

**File:** `src/components/JsonLd.tsx`  
**Status:** Exported correctly and used correctly in server components

**Note:** This component MUST be marked as server component (no "use client") to work properly in client component boundaries when imported. Currently it has no directive, making it a server component by default - which is correct but will cause runtime error when imported into post-client.tsx.

---

## OPENGRAPH IMAGE FILES

### ✅ PASS: OG Image Files Use Correct Next.js 14 API

**File:** `src/app/opengraph-image.tsx`

- Exports `async` function named `Image` ✓
- Sets `runtime = "edge"` ✓
- Returns `ImageResponse` ✓
- Sets size and contentType ✓

**File:** `src/app/news/[slug]/opengraph-image.tsx`

- Exports `async` function named `Image` ✓
- Has `generateImageMetadata` function
- Uses Prisma query inside edge runtime (OK with node build output)

**Status:** Both files follow Next.js 14 Image Generation API correctly.

**Note on generateImageMetadata:**
The function is defined but Next.js 14's Image Generation API doesn't use `generateImageMetadata` by default for dynamic routes. The function exists but is **not called by the framework**. Remove it to avoid confusion:

```typescript
// This function is never called - can be removed
export async function generateImageMetadata({
  params,
}: {
  params: PageParams;
}) {
  return [
    {
      /* ... */
    },
  ];
}
```

**Fix:** Remove the unused function.

---

## SITEMAP ROUTE VERIFICATION

### ✅ PASS: All Hub Page Routes Exist

**File:** `src/app/sitemap.ts`

Routes defined in sitemap:

- `/investment-scams` → `src/app/investment-scams/page.tsx` ✓
- `/social-media-scams` → `src/app/social-media-scams/page.tsx` ✓
- `/how-to-detect-stock-scams` → `src/app/how-to-detect-stock-scams/page.tsx` ✓

**Status:** All routes in sitemap match actual files. No mismatches.

---

## PRISMA SCHEMA COMPATIBILITY

### ✅ PASS: BlogPost Schema Matches Query Usage

**Schema fields used:**

- `id` ✓
- `title` ✓
- `slug` ✓
- `excerpt` (nullable) ✓
- `content` ✓
- `coverImage` (nullable) ✓
- `author` ✓
- `category` ✓ (has default "General")
- `tags` (nullable, comma-separated) ✓
- `isPublished` ✓
- `publishedAt` (nullable) ✓
- `updatedAt` ✓

**Status:** All fields used in queries exist in schema. No field type mismatches.

---

## SUMMARY TABLE

| #   | Issue                                    | Severity | File                            | Type            | Status      |
| --- | ---------------------------------------- | -------- | ------------------------------- | --------------- | ----------- |
| 1   | "use client" boundary violation (JsonLd) | CRITICAL | post-client.tsx                 | Runtime Error   | MUST FIX    |
| 2   | Empty onNewScan handler in hub pages     | CRITICAL | 4 hub pages                     | Feature Break   | MUST FIX    |
| 3   | Author slug case sensitivity mismatch    | HIGH     | authors/[author]/page.tsx       | Logic Error     | SHOULD FIX  |
| 4   | Static params hardcoded in authors page  | MEDIUM   | authors/[author]/page.tsx       | Content Issue   | SHOULD FIX  |
| 5   | Hub pages Sidebar/Header non-functional  | MEDIUM   | 4 hub pages                     | UX/Architecture | SHOULD FIX  |
| 6   | Related posts grid layout for <3 items   | LOW      | post-client.tsx                 | UI Layout       | NICE TO FIX |
| 7   | Related posts relevancy (all "General")  | MEDIUM   | news/[slug]/page.tsx            | Logic Error     | SHOULD FIX  |
| 8   | Unused generateImageMetadata function    | LOW      | news/[slug]/opengraph-image.tsx | Code Quality    | NICE TO FIX |

---

## QUICK FIX CHECKLIST

### CRITICAL (Must fix before deploy):

- [ ] Add `"use client"` to `src/components/JsonLd.tsx`
- [ ] Fix `onNewScan={() => {}}` to `onNewScan={() => window.location.href = "/"}` in all 4 hub pages

### HIGH Priority (Fix before merge):

- [ ] Add case-insensitive search in authors page Prisma query
- [ ] Query database for actual authors in generateStaticParams

### MEDIUM Priority (Fix in next sprint):

- [ ] Refactor hub pages to use client component wrapper for interactive features
- [ ] Improve related posts matching logic

### LOW Priority (Nice to have):

- [ ] Remove unused generateImageMetadata function
- [ ] Improve grid layout for <3 related articles

---

## FINAL ASSESSMENT

**Overall Status:** MULTIPLE CRITICAL ISSUES - NOT PRODUCTION READY

**Critical Blockers:** 2
**High Priority Issues:** 2
**Medium Priority Issues:** 3
**Low Priority Issues:** 2

The new routes have **good SEO structure and proper component setup** but suffer from **critical runtime errors** and **missing state management** in interactive pages. The main issues are:

1. **Component boundary violation** (post-client.tsx + JsonLd)
2. **Non-functional handlers** (empty onNewScan in hub pages)
3. **Architecture mismatch** (server components using interactive UI patterns)

These must be resolved before deployment.
