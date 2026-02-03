# Quick Start - Social Media Scanning (Continue Feb 4, 2026)

## 🚀 Start Here Tomorrow

You have successfully replaced the AI social scanner with a **Real API Scanner** (Reddit, StockTwits, YouTube). The code is ready, but it needs an API key to be fully effective.

### Step 1: Get YouTube API Key (5 minutes)
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (e.g., "ScamDunk-Scanner").
3. Enable **"YouTube Data API v3"**.
4. Create an **API Key**.

### Step 2: Configure Environment
1. Open `.env.local`
2. Add the key:
   ```env
   YOUTUBE_API_KEY=your_key_here
   ```

### Step 3: Run the Pipeline Test
Run the scanner on a specific stock to verify Reddit and YouTube are working:

```bash
# Test scanning AAPL (or any ticker)
cd evaluation
npx ts-node scripts/real-social-scanner.ts AAPL "Apple Inc"
```

### Step 4: Verify & Merge
If the JSON output looks good (shows real Reddit posts and YouTube videos):
1. Merge the branch:
   ```bash
   git checkout main
   git merge feature/real-social-media-scanning
   git push origin main
   ```

## 📋 Work Status
- **Branch**: `feature/real-social-media-scanning`
- **Reddit Scanning**: ✅ Working (Free API)
- **StockTwits**: ⚠️ Working but limited (Cloudflare blocks mostly)
- **YouTube**: ⏳ Ready for Key
- **Pipeline Integration**: ✅ Complete (`enhanced-daily-pipeline.ts` updated)

## ⚠️ Notes
- The "Scam Dunk" scheme status logic has been updated to use `hadSocialMediaPromotion` flag from this real scanner.
- No more OpenAI costs for social scanning! 
