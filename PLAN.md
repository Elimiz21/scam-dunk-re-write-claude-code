# Admin Dashboard Redesign: Scan Intelligence Hub

## Overview

Redesign the admin dashboard's Market Intelligence section to provide a comprehensive,
intuitive view into the daily stock scan pipeline, AI backend results, suspicious stock
monitoring, and scheme tracking. The goal is to give admin users the ability to:

1. See at a glance what happened on the latest scan
2. Drill down into individual stocks with full AI layer data
3. Track active schemes across days with timeline visualization
4. Explore promoted/suspicious stocks with filtering and sorting
5. Compare scan results across dates

All work will be done on a new branch: `claude/admin-scan-intelligence-Y9d4k`

---

## Design Direction

**Aesthetic:** Refined data intelligence dashboard — dark-mode-forward, data-dense but
breathable. Leverages the existing warm guardian palette (coral/amber/teal) with the
Playfair Display + DM Sans type pairing already in place.

**Principles from frontend-design skill:**
- Bold risk-level color coding (already established with risk-glow classes)
- Dense data grids with generous whitespace between sections
- Animated number transitions and staggered card reveals on load
- Glass-card layering for drill-down panels
- No generic layouts — asymmetric grids where it adds clarity

**Libraries:** No new dependencies. The existing stack (Tailwind + Lucide + custom
components) is sufficient. We'll enhance the existing ChartCard and DataTable components
rather than adding new chart libraries.

---

## Architecture: New API Routes

### 1. `/api/admin/scan-intelligence` (NEW)
Fetches the latest scan results directly from the scam-dunk-data GitHub repo or Supabase.
Returns:
- Latest daily-report summary
- Risk distribution
- AI layer statistics (how many stocks used backend, layer coverage)
- Top suspicious stocks (by risk score, with aiLayers data)
- Scheme status summary
- Comparison with previous scan date

### 2. `/api/admin/scan-intelligence/stocks` (NEW)
Paginated, filterable stock list from the latest enhanced-evaluation file.
Query params: `riskLevel`, `minScore`, `hasAiBackend`, `hasPumpPattern`,
`sortBy`, `page`, `limit`
Returns full stock objects with aiLayers, signals, news, social data.

### 3. `/api/admin/scan-intelligence/stock/[symbol]` (NEW)
Deep drill-down for a single stock across all scan dates.
Returns: All historical snapshots, scheme membership, social evidence,
news timeline, AI layer score progression.

### 4. `/api/admin/scan-intelligence/schemes` (NEW)
Returns the full scheme database with timeline data for each active scheme.

### 5. `/api/admin/scan-intelligence/history` (NEW)
Returns scan-over-scan comparison data: date, stocks scanned, HIGH count,
suspicious count, schemes detected, processing time — for every scan date.

### 6. Enhance existing `/api/admin/pipeline-health`
Add the scan history comparison data to the existing endpoint.

---

## Pages & Components

### Page 1: Scan Intelligence Dashboard (`/admin/scan-intelligence`)

This becomes the primary "what happened today" page. Replaces nothing — it's a new
page added to the Market Intelligence nav category.

**Layout (top to bottom):**

**A. Scan Status Bar** (full-width, compact)
- Latest scan date + time
- Pipeline status badge (healthy/degraded/failing)
- Processing duration
- "Compare with previous" toggle
- Link to GitHub Actions run

**B. Key Metrics Row** (4 cards)
- Stocks Scanned (with delta from previous)
- HIGH Risk Count (with delta, red-tinted if increased)
- Suspicious After Filters (the actionable number)
- Active Schemes (with scheme count badge)

**C. AI Backend Status Panel** (2-column)
Left: Layer activation status — 4 horizontal bars showing Layer 1-4 coverage
(% of stocks that received each layer's score). Visual indicator of which
layers are online/offline/partial.
Right: Combined score distribution — mini histogram showing distribution of
AI combined scores across all stocks (helps understand if scoring is
well-distributed or clustered).

**D. Risk Funnel** (visual pipeline)
A horizontal funnel visualization showing:
`6,557 evaluated → 1,031 HIGH → 15 filtered (cap) → 252 filtered (news) → 764 suspicious`
Each stage is a card with the count, and arrows between them. This tells the
story of how we narrowed down.

**E. Top Suspicious Stocks Table** (sortable, filterable)
Shows the top 20 stocks by risk score from the remaining suspicious pool.
Columns: Symbol, Company, Risk Score (heat-colored), AI Combined, Layer 2,
Layer 4, Signals (tag chips), 7d Price Change, Market Cap, Pump Pattern flag
Click a row → opens drill-down panel.

**F. Active Schemes Tracker** (cards)
Each active scheme gets a card showing:
- Ticker + company name
- Status badge (ONGOING / COOLING / NEW)
- Risk score + promotion score
- Price at detection → current price (with % change)
- Days active
- Mini sparkline of risk score over time
- Platform icons where promotion was detected

**G. Scan History Timeline** (bottom)
A compact horizontal timeline showing the last 10 scan dates.
Each date shows: stock count, HIGH count, suspicious count.
Click a date to load that scan's data into the page above.

---

### Page 2: Stock Deep Dive (`/admin/scan-intelligence/stock/[symbol]`)

Accessed by clicking a stock in the table above or via direct URL.

**Layout:**

**A. Stock Header**
- Symbol (large), company name, exchange badge, sector/industry
- Current risk level (full-width colored banner)
- Current price, 7d change, 30d change

**B. AI Analysis Panel** (the unique value prop)
- 4-column layout showing each AI layer's score for this stock
- Layer 1: Deterministic score + signal list
- Layer 2: Anomaly score + which anomalies fired
- Layer 3: RF probability (or "Not trained" indicator)
- Layer 4: LSTM probability
- Combined ensemble score with confidence indicator

**C. Signal Breakdown**
- Visual grid of all detected signals, grouped by category (STRUCTURAL, PATTERN, ALERT)
- Each signal shows: name, weight, description
- Color-coded by severity

**D. News & SEC Analysis**
- Timeline of recent news articles
- OpenAI classification result (LEGITIMATE / SUSPICIOUS)
- News analysis text

**E. Social Media Evidence**
- Platform-by-platform breakdown
- Mention counts, activity levels, promotion risk
- Links to external evidence

**F. Scheme Membership** (if applicable)
- Which scheme this stock belongs to
- Full scheme timeline
- Related stocks in same scheme

**G. Historical Charts**
- Risk score over time (line)
- Price over time (line)
- Volume over time (bar)

---

### Enhanced Existing Pages

**Dashboard page (`/admin/dashboard`)**
- Keep the Pipeline Health section we already added
- Add a "Latest Scan Quick Stats" card linking to the full Scan Intelligence page

**Market Analysis (`/admin/market-analysis`)**
- Add a link/button: "View Full Scan Intelligence →"

---

## Implementation Plan (Ordered Steps)

### Step 1: Create the feature branch
Branch off from current branch, create `claude/admin-scan-intelligence-Y9d4k`

### Step 2: Build API routes (backend first)
1. `/api/admin/scan-intelligence` - Main dashboard data
2. `/api/admin/scan-intelligence/stocks` - Paginated stock list
3. `/api/admin/scan-intelligence/stock/[symbol]` - Single stock deep dive
4. `/api/admin/scan-intelligence/schemes` - Scheme database
5. `/api/admin/scan-intelligence/history` - Scan date comparison

Data source: Fetch from Supabase storage (evaluation-data bucket) and the
GitHub raw content API for the scam-dunk-data repo as fallback.

### Step 3: Build reusable components
1. `RiskFunnel` - The pipeline visualization
2. `AILayerPanel` - 4-layer score display with coverage bars
3. `SchemeCard` - Individual scheme tracker card
4. `StockRow` - Enhanced table row with expandable detail
5. `ScanTimeline` - Horizontal date timeline
6. `SignalGrid` - Visual signal breakdown by category
7. Enhance existing `ChartCard` to support sparklines

### Step 4: Build the Scan Intelligence page
Wire up all components with API data. Implement loading states,
error handling, empty states.

### Step 5: Build the Stock Deep Dive page
Full drill-down page for individual stocks.

### Step 6: Add navigation
Add "Scan Intelligence" to the Market Intelligence category in AdminLayout.
Add quick-link cards from existing dashboard and market-analysis pages.

### Step 7: Apply frontend-design skill polish
- Staggered card reveal animations on page load
- Risk-level glow effects on high-risk items
- Glass-card overlays for drill-down panels
- Spring-eased number transitions
- Responsive layout adjustments for mobile/tablet

### Step 8: Test, commit, push
Verify all pages load correctly with real data from Supabase/GitHub.
Commit to feature branch and push for review.

---

## Files to Create/Modify

**New files:**
- `src/app/api/admin/scan-intelligence/route.ts`
- `src/app/api/admin/scan-intelligence/stocks/route.ts`
- `src/app/api/admin/scan-intelligence/stock/[symbol]/route.ts`
- `src/app/api/admin/scan-intelligence/schemes/route.ts`
- `src/app/api/admin/scan-intelligence/history/route.ts`
- `src/app/admin/scan-intelligence/page.tsx`
- `src/app/admin/scan-intelligence/stock/[symbol]/page.tsx`
- `src/components/admin/RiskFunnel.tsx`
- `src/components/admin/AILayerPanel.tsx`
- `src/components/admin/SchemeCard.tsx`
- `src/components/admin/ScanTimeline.tsx`
- `src/components/admin/SignalGrid.tsx`

**Modified files:**
- `src/components/admin/AdminLayout.tsx` (add nav item)
- `src/components/admin/ChartCard.tsx` (add sparkline support)
- `src/app/admin/dashboard/page.tsx` (add quick-link card)
