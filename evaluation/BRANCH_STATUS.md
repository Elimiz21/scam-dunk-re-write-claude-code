# Enhanced Daily Scanning Pipeline - Branch Status

**Branch:** `feature/enhanced-daily-scanning-pipeline`
**Last Updated:** 2026-02-03 17:19 IST
**Status:** Ready for Testing with API Keys

---

## 📋 Overview

This branch implements a comprehensive 5-phase daily scanning pipeline for detecting potential pump-and-dump schemes across all US-listed stocks.

### Pipeline Phases
1. **Risk Scoring** - 4 AI layers (Deterministic, Anomaly, Random Forest, LSTM)
2. **Size/Volume Filtering** - Removes stocks >$10B market cap or >$10M daily volume
3. **News Analysis** - Filters stocks with legitimate news (earnings, FDA, M&A, etc.)
4. **Social Media Scanning** - Scans 8 platforms for promotion patterns
5. **Scheme Tracking** - Creates numbered scheme records with lifecycle management

---

## ✅ Work Completed

### Files Added (4,086+ lines)
| File | Lines | Purpose |
|------|-------|---------|
| `.github/workflows/enhanced-daily-evaluation.yml` | 451 | GitHub Actions for automated daily runs at 11 PM UTC |
| `evaluation/ENHANCED_PIPELINE.md` | 203 | Complete documentation |
| `evaluation/scheme-database/scheme-database.json` | 560+ | Pre-populated scheme database with 10 active schemes |
| `evaluation/scripts/enhanced-daily-pipeline.ts` | 1,131 | Main pipeline orchestrator |
| `evaluation/scripts/real-time-social-scanner.ts` | 758 | Social media scanning (8 platforms) |
| `evaluation/scripts/scheme-tracker.ts` | 675 | Scheme lifecycle management |
| `evaluation/scripts/test-enhanced-pipeline.ts` | 318 | Local testing script |

### Commits on this Branch
```
6e44793 fix: Add volume filter to test script for completeness
7313df7 fix: Type casting for Python AI signals to match TypeScript types
f236070 feat: Integrate all 4 AI layers and fix scheduling time
826ab23 feat: Add enhanced daily scanning pipeline with scheme tracking
```

### Testing Summary (2026-02-03)
- Test ran successfully with existing high-risk data
- 10 stocks scanned from 1,454 high-risk stocks
- 10 schemes updated (transitioned from NEW → ONGOING)
- Scheme database updated with day 2 activity

---

## 🔧 Setup Required (To Continue From Another Computer)

### Step 1: Clone and Checkout Branch
```bash
git clone https://github.com/Elimiz21/scam-dunk-re-write-claude-code.git
cd scam-dunk-re-write-claude-code
git checkout feature/enhanced-daily-scanning-pipeline
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Create `.env.local` with API Keys
Create file `.env.local` in the root directory:

```bash
# Financial Modeling Prep (REQUIRED for stock data)
# Get from: Vercel → scamdunk project → Settings → Environment Variables
FMP_API_KEY=your-key-here

# OpenAI (REQUIRED for AI-powered social media analysis)
# Get from: Vercel → scamdunk project → Settings → Environment Variables
OPENAI_API_KEY=sk-your-key-here

# Python AI Backend on Railway (OPTIONAL - for full 4-layer ML analysis)
# Get from: Railway dashboard → Your Project → Settings → Domains
AI_BACKEND_URL=https://your-app.up.railway.app

# Supabase (OPTIONAL - for results upload)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**Where to find API keys:**
- **Vercel**: https://vercel.com → scamdunk project → Settings → Environment Variables
- **Railway**: https://railway.app/dashboard → Your project → Settings → Domains
- **GitHub Secrets**: https://github.com/Elimiz21/scam-dunk-re-write-claude-code → Settings → Secrets and variables → Actions

### Step 4: Run Test Pipeline
```bash
cd evaluation
npx ts-node --project tsconfig.json scripts/test-enhanced-pipeline.ts
```

Expected output:
- Without OPENAI_API_KEY: Promotion scores will be ~20 (minimal social scanning)
- With OPENAI_API_KEY: AI-powered analysis of Twitter, YouTube, Discord, etc.
- With AI_BACKEND_URL: Full 4-layer ML analysis (Random Forest + LSTM)

---

## 📋 Next Steps

### Immediate (Before Merge)

1. **[ ] Fill in API keys in `.env.local`**
   - Get FMP_API_KEY from Vercel
   - Get OPENAI_API_KEY from Vercel
   - Get AI_BACKEND_URL from Railway

2. **[ ] Run full test with API keys**
   ```bash
   cd evaluation
   npx ts-node --project tsconfig.json scripts/test-enhanced-pipeline.ts
   ```

3. **[ ] Verify Python AI Backend is running**
   ```bash
   curl https://your-railway-url/health
   ```
   Should return: `{"status":"healthy",...}`

4. **[ ] Test the main pipeline (small batch)**
   ```bash
   TEST_MODE=true npx ts-node --project tsconfig.json scripts/enhanced-daily-pipeline.ts
   ```

### Before Merging to Main

5. **[ ] Add AI_BACKEND_URL to GitHub Secrets**
   - Go to: Repository → Settings → Secrets → Actions
   - Add: `AI_BACKEND_URL` = `https://your-railway-url`

6. **[ ] Run full production test**
   - Manually trigger the GitHub Action with `test_mode=true`
   - Verify no errors in the workflow run

7. **[ ] Create Pull Request**
   - Review all changes
   - Merge to main

### Post-Merge

8. **[ ] Build Admin Dashboard Integration**
   - Create API endpoint: `GET /api/admin/schemes`
   - Create UI page: `/admin/scheme-tracking`
   - Add real-time alerting for CRITICAL urgency

9. **[ ] Set up email/Slack alerts for high-priority schemes**

10. **[ ] Monitor first automated runs**
    - Check daily at 11 PM UTC (6 PM EST)
    - Review scheme reports

---

## 📁 Key File Locations

```
evaluation/
├── ENHANCED_PIPELINE.md          # Full documentation
├── scheme-database/
│   └── scheme-database.json      # Active scheme tracking database
├── scripts/
│   ├── enhanced-daily-pipeline.ts  # Main pipeline
│   ├── real-time-social-scanner.ts # Social media scanner
│   ├── scheme-tracker.ts           # Scheme management
│   └── test-enhanced-pipeline.ts   # Local testing
└── results/
    ├── fmp-high-risk-*.json        # Daily high-risk stocks
    ├── test-enhanced-results-*.json # Test results
    └── test-scheme-report-*.md      # Human-readable reports

.github/workflows/
└── enhanced-daily-evaluation.yml   # Automated daily run
```

---

## 🔍 Troubleshooting

### "Python AI Backend not running"
- The AI_BACKEND_URL is not set or unreachable
- Solution: Set the Railway URL in `.env.local`
- Or: Pipeline will use Layer 1 (TypeScript scorer) only

### "No high-risk files found"
- Need to run the FMP evaluation first
- Solution: Set FMP_API_KEY and run the main pipeline

### "OpenAI API key required for Twitter analysis"
- Social media AI analysis won't work without OPENAI_API_KEY
- Solution: Add the key to `.env.local`
- Platform scanning will show "low" for all platforms without this key

### Push fails with authentication error
- GitHub requires token authentication for HTTPS
- Solution: Use SSH or create a personal access token
```bash
# Create a PAT at: https://github.com/settings/tokens
# Then push with:
git push https://YOUR_GITHUB_TOKEN@github.com/Elimiz21/scam-dunk-re-write-claude-code.git feature/enhanced-daily-scanning-pipeline
```

---

## 📊 Current Scheme Status

As of 2026-02-03, 10 active schemes are being tracked:

| Priority | Symbol | Status | Risk | Promo | Days Active |
|----------|--------|--------|------|-------|-------------|
| 🟡 HIGH | SXTC | ONGOING | 14 | 20 | 2 |
| 🟢 MEDIUM | EVTV | ONGOING | 16 | 20 | 2 |
| 🟢 MEDIUM | BCARW | ONGOING | 16 | 20 | 2 |
| 🟢 MEDIUM | PTHL | ONGOING | 15 | 20 | 2 |
| 🟢 MEDIUM | XAIR | ONGOING | 15 | 20 | 2 |
| 🟢 MEDIUM | PELIR | ONGOING | 15 | 20 | 2 |
| 🟢 MEDIUM | THH | ONGOING | 14 | 20 | 2 |
| 🟢 MEDIUM | MTEN | ONGOING | 14 | 20 | 2 |
| 🟢 MEDIUM | DRTSW | ONGOING | 14 | 20 | 2 |
| 🟢 MEDIUM | JDZG | ONGOING | 14 | 20 | 2 |

Note: Low promotion scores (20) are due to testing without OPENAI_API_KEY. With the key, AI-powered social media analysis will produce more accurate scores.

---

*Document generated: 2026-02-03 17:19 IST*
