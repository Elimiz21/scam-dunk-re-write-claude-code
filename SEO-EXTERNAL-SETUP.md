# ScamDunk SEO External Setup Instructions

This document contains step-by-step instructions for manual setup tasks that cannot be automated via code changes. All Priority 2, 3, 4, and 9 items from the SEO audit require external configuration or one-time setup.

---

## 1. Google Search Console Verification & Submission

**Priority 2 - Site Ownership Verification**

### Step 1: Verify Site Ownership

1. Go to [Google Search Console](https://search.google.com/search-console/)
2. Click **"Add property"** in the left sidebar
3. Enter your domain: `https://scamdunk.com`
4. Click **"Continue"**
5. Choose verification method: **DNS record** (recommended for admin access)

### Step 2: Add DNS Record

1. In Search Console, look for the TXT record (e.g., `google-site-verification=...`)
2. Copy the full verification string
3. Log into your domain registrar (GoDaddy, Namecheap, etc.)
4. Go to **DNS Settings**
5. Add a new **TXT record**:
   - Host: `@` (or leave blank)
   - Value: Paste the full verification string from Search Console
6. Save the DNS record (may take 15-30 minutes to propagate)
7. Return to Search Console and click **"Verify"**

### Step 3: Submit Sitemap

1. In Search Console, go to **Sitemaps** (left sidebar)
2. Click **"Add/test sitemap"**
3. Enter: `scamdunk.com/sitemap.xml`
4. Click **"Submit"**
5. Verify the sitemap appears in the list with status "Success"

### Step 4: Request Indexing for Priority Pages

1. In Search Console, go to **URL Inspection** (search bar at top)
2. For each priority page below, paste the URL and click **Enter**:
   - `https://scamdunk.com`
   - `https://scamdunk.com/about`
   - `https://scamdunk.com/how-it-works`
   - `https://scamdunk.com/news`
   - `https://scamdunk.com/investment-scams` (new hub)

3. Click **"Request indexing"** if the button appears
4. Wait for the notification: "Requested indexing for https://..."
5. Repeat for each page

---

## 2. Robots.txt & Noindex Audit

**Priority 3 - Robots.txt Configuration & Noindex Verification**

### Review Current Noindex Settings

The following pages are **correctly noindexed** (should remain as-is):

**Auth Pages (correctly noindexed):**
- `/auth/login` — Login page
- `/auth/signup` — Signup page
- `/auth/forgot-password` — Password reset
- `/auth/reset-password` — Password reset
- `/auth/verify-email` — Email verification
- `/auth/check-email` — Email check
- `/auth/error` — Auth error page

**Protected Pages (correctly noindexed):**
- `/protected/account` — User account
- `/protected/check` — Analysis check page

**Admin Pages (correctly noindexed):**
- `/admin/*` — All admin pages

**Design Pages (correctly noindexed):**
- `/design-preview` — Design preview

### Verify Noindex in Code

All auth/protected/admin pages should have this in their metadata:

```typescript
robots: { index: false, follow: false }
```

**Action:** Search the codebase for `robots: { index: true }` or `robots:` to verify no unintended pages are indexed.

### Pages That SHOULD Be Indexed (verify these exist in code):

- `/` (homepage)
- `/about`
- `/how-it-works`
- `/news`
- `/news/[slug]` (blog posts)
- `/help`
- `/contact`
- `/privacy`
- `/terms`
- `/disclaimer`
- `/investment-scams` (new)
- `/social-media-scams` (new)
- `/how-to-detect-stock-scams` (new)
- `/authors/[author]` (new)

All should have: `robots: { index: true, follow: true }` OR no robots override (defaults to index).

### Robots.txt Configuration

Create or update `/public/robots.txt` (if not already present):

```
User-agent: *
Allow: /

Disallow: /admin/
Disallow: /protected/
Disallow: /auth/
Disallow: /design-preview

Sitemap: https://scamdunk.com/sitemap.xml
```

---

## 3. Google Analytics 4 Setup

**Priority 4 - GA4 Configuration**

### Step 1: Create GA4 Property

1. Go to [Google Analytics](https://analytics.google.com/)
2. Click **Admin** (bottom left)
3. In the **Property** column, click **Create property**
4. Name: `ScamDunk`
5. Reporting timezone: `America/New_York` (or your timezone)
6. Click **Create**

### Step 2: Create Web Data Stream

1. In the **Data streams** section, click **Add stream**
2. Platform: **Web**
3. Website URL: `https://scamdunk.com`
4. Stream name: `ScamDunk Web`
5. Click **Create stream**

### Step 3: Get Measurement ID

1. You'll see a page with your **Measurement ID** (looks like `G-XXXXXXXXXX`)
2. Copy this ID — you'll need it for the Next.js code

### Step 4: Configure in Next.js

1. Create `.env.local` in the project root (if not already present):

```
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

Replace `G-XXXXXXXXXX` with your actual Measurement ID.

2. Update `src/app/layout.tsx` to add the GA4 script:

Find the existing `<head>` section and add:

```typescript
{/* Google Analytics */}
{process.env.NEXT_PUBLIC_GA_ID && (
  <>
    <script
      async
      src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
    />
    <script
      dangerouslySetInnerHTML={{
        __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
            page_path: window.location.pathname,
          });
        `,
      }}
    />
  </>
)}
```

(NOTE: GA script should go in `<head>` tag, not `<body>`)

### Step 5: Verify Installation

1. Deploy the changes to Vercel
2. Go back to Google Analytics
3. Visit your site in a new tab
4. In GA4, go to **Real-time** report
5. You should see your visit appear within 1-2 minutes
6. If you see your session, GA4 is working!

---

## 4. Static OG Image Creation

**Priority 9 - Fallback Static OG Image**

### About OG Images

The codebase now includes:
- **Dynamic OG images** via `opengraph-image.tsx` routes (automatically generated at request time)
- **Static fallback** at `/public/og-image.png` (for email clients and old crawlers)

### Create Static OG Image

The static OG image should be:
- **Filename:** `/public/og-image.png`
- **Dimensions:** 1200x630 pixels
- **Format:** PNG
- **Design:** Dark background (#0f0f23), ScamDunk logo/shield, white text

### Option 1: Using Canva (Free)

1. Go to [Canva](https://www.canva.com)
2. Create new design → Custom size → `1200 x 630` px
3. Design elements:
   - Background: Dark blue/navy gradient (similar to site theme)
   - Add a shield icon (search "shield" in elements)
   - Add checkmark inside shield
   - Text: "ScamDunk" (large, white, bold)
   - Subtitle: "Detect Stock Scam Red Flags" (white, smaller)
4. Download as PNG
5. Upload to `/public/og-image.png`

### Option 2: Using Figma (Free)

1. Go to [Figma](https://www.figma.com)
2. Create new file
3. Create new frame: 1200x630
4. Follow design guidelines above
5. Export as PNG
6. Upload to `/public/og-image.png`

### Option 3: Using SVG → PNG Export Tool

1. Use the existing `favicon.svg` as inspiration
2. Create a larger version (1200x630)
3. Use [CloudConvert](https://cloudconvert.com/svg-to-png) to export as PNG
4. Upload to `/public/og-image.png`

### Verify OG Image Works

1. Deploy the changes
2. Open any page (e.g., `https://scamdunk.com`)
3. Use [Open Graph Debugger](https://www.opengraphcheck.com/)
4. Paste your URL
5. Verify:
   - OG image displays correctly
   - Dimensions are 1200x630
   - No broken image errors

---

## Summary Checklist

After completing all external tasks, check these boxes:

- [ ] Google Search Console verified and sitemap submitted
- [ ] Priority 5 pages requested for indexing in GSC
- [ ] Noindex audit completed and verified
- [ ] GA4 property created and Measurement ID noted
- [ ] `.env.local` updated with `NEXT_PUBLIC_GA_ID`
- [ ] Layout.tsx GA4 script added and deployed
- [ ] GA4 real-time tracking verified working
- [ ] Static OG image created and uploaded to `/public/og-image.png`
- [ ] OG image verified via Open Graph Debugger

---

## Troubleshooting

### GSC Not Verifying DNS

- DNS records can take 15-30 minutes to propagate
- Try waiting 30 minutes, then click "Verify" again
- If still failing, check your DNS provider's DNS records are saved
- Alternative: Use HTML file verification method instead

### GA4 Not Showing Data

- Verify `NEXT_PUBLIC_GA_ID` is set correctly in `.env.local`
- Make sure you redeployed to Vercel after updating `.env.local`
- Clear browser cache and revisit the site
- Check GA4 real-time report (data appears there first, then in main reports after 24 hours)

### OG Image Not Updating

- OG images are cached by social media platforms for 24 hours
- Use debugger tools to force refresh:
  - [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/sharing)
  - [Twitter Card Validator](https://cards-dev.twitter.com/validator)
  - [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)

---

## Next Steps

After completing all external setup:

1. **Monitor Search Console** for the next 7 days — watch for crawl errors and indexing progress
2. **Check Analytics Daily** for the first week to ensure GA4 is tracking properly
3. **Test all hub pages** to ensure they're showing up in organic search within 2 weeks
4. **Review Sitemap** in GSC to ensure all pages are discovered
5. **Audit Backlinks** using tools like Ahrefs or Moz to identify link-building opportunities

---

**Generated:** March 3, 2026  
**Prepared for:** ScamDunk SEO Implementation
