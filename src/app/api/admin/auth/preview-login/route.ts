/**
 * Preview Login API
 * Creates a temporary admin account, logs in, and seeds demo data.
 * ONLY works in Vercel preview deployments or local development.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, adminLogin } from "@/lib/admin/auth";
import { initializeIntegrations } from "@/lib/admin/integrations";
import { rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PREVIEW_EMAIL = "preview@scamdunk.com";
const PREVIEW_PASSWORD = "PreviewAdmin2026!";
const PREVIEW_NAME = "Preview Admin";

function isPreviewEnvironment(): boolean {
  // Never allow preview login in production (Vercel sets NODE_ENV=production for previews too)
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.VERCEL_ENV === "preview") return true;
  if (process.env.NODE_ENV === "development") return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: strict for preview login (5 requests per minute)
    const { success: rateLimitSuccess, headers: rateLimitHeaders } = await rateLimit(request, "strict");
    if (!rateLimitSuccess) {
      return rateLimitExceededResponse(rateLimitHeaders);
    }

    if (!isPreviewEnvironment()) {
      return NextResponse.json(
        { error: "Preview login is only available in preview deployments" },
        { status: 403 }
      );
    }

    // Create or reset the preview admin account
    let admin = await prisma.adminUser.findUnique({
      where: { email: PREVIEW_EMAIL },
    });

    if (!admin) {
      const hashedPassword = await hashPassword(PREVIEW_PASSWORD);
      admin = await prisma.adminUser.create({
        data: {
          email: PREVIEW_EMAIL,
          hashedPassword,
          name: PREVIEW_NAME,
          role: "OWNER",
          isActive: true,
        },
      });
    }

    // Log in
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    let result = await adminLogin(PREVIEW_EMAIL, PREVIEW_PASSWORD, ipAddress, userAgent);

    if (!result.success) {
      const hashedPassword = await hashPassword(PREVIEW_PASSWORD);
      await prisma.adminUser.update({
        where: { email: PREVIEW_EMAIL },
        data: { hashedPassword, isActive: true },
      });
      result = await adminLogin(PREVIEW_EMAIL, PREVIEW_PASSWORD, ipAddress, userAgent);
      if (!result.success) {
        return NextResponse.json({ error: "Preview login failed" }, { status: 500 });
      }
    }

    // Log the preview login for audit trail (non-fatal if it fails)
    if (result.admin?.id) {
      try {
        await prisma.adminAuditLog.create({
          data: {
            adminUserId: result.admin.id,
            action: "PREVIEW_LOGIN",
            resource: "preview-admin",
            details: JSON.stringify({ ip: ipAddress, userAgent }),
          },
        });
      } catch (auditError) {
        console.error("Preview login audit log error (non-fatal):", auditError);
      }
    }

    // Seed demo data before responding (must complete before Vercel
    // terminates the serverless function, so we await instead of fire-and-forget)
    try {
      await seedPreviewData();
    } catch (err) {
      console.error("Preview seed error (non-fatal):", err);
    }

    return NextResponse.json({
      success: true,
      admin: result.admin,
      isPreview: true,
      seeded: true,
    });
  } catch (error) {
    console.error("Preview login error:", error);
    return NextResponse.json({ error: "Preview login failed" }, { status: 500 });
  }
}

/**
 * Seeds demo data for all admin pages so they have something to display.
 * Idempotent - checks for existing data before inserting.
 */
async function seedPreviewData() {
  try {
    await Promise.allSettled([
      seedIntegrations(),
      seedBrowserPlatformConfigs(),
      seedBrowserAgentSessions(),
      seedSocialScanData(),
    ]);
  } catch (err) {
    console.error("Seed preview data error:", err);
  }
}

async function seedIntegrations() {
  try {
    await initializeIntegrations();
  } catch (err) {
    console.error("Seed integrations error:", err);
  }
}

async function seedBrowserPlatformConfigs() {
  const platforms = [
    { platform: "discord", isEnabled: true, dailyPageLimit: 100, dailyPagesUsed: 34 },
    { platform: "reddit", isEnabled: true, dailyPageLimit: 150, dailyPagesUsed: 67 },
    { platform: "twitter", isEnabled: true, dailyPageLimit: 75, dailyPagesUsed: 12 },
    { platform: "instagram", isEnabled: false, dailyPageLimit: 75, dailyPagesUsed: 0 },
    { platform: "facebook", isEnabled: false, dailyPageLimit: 50, dailyPagesUsed: 0 },
    { platform: "tiktok", isEnabled: false, dailyPageLimit: 50, dailyPagesUsed: 0 },
  ];

  for (const p of platforms) {
    const existing = await prisma.browserPlatformConfig.findUnique({
      where: { platform: p.platform },
    });
    if (!existing) {
      await prisma.browserPlatformConfig.create({
        data: {
          platform: p.platform,
          isEnabled: p.isEnabled,
          dailyPageLimit: p.dailyPageLimit,
          dailyPagesUsed: p.dailyPagesUsed,
          dailyResetDate: new Date().toISOString().split("T")[0],
          lastLoginAt: p.isEnabled ? new Date() : null,
          lastLoginStatus: p.isEnabled ? "SUCCESS" : null,
        },
      });
    }
  }
}

async function seedBrowserAgentSessions() {
  // Only seed if no sessions exist
  const count = await prisma.browserAgentSession.count();
  if (count > 0) return;

  const now = new Date();
  const tickers = ["ACME", "DEFG", "PUMP", "XYZZ", "SCAM"];

  // Create demo sessions across the past week
  const demoSessions = [
    {
      scanDate: new Date(now.getTime() - 0.5 * 3600000), // 30 min ago
      platform: "discord",
      status: "COMPLETED",
      tickersSearched: JSON.stringify(tickers.slice(0, 3)),
      pagesVisited: 47,
      mentionsFound: 12,
      screenshotsTaken: 4,
      browserMinutes: 8.3,
      memoryPeakMb: 312,
      suspensionCount: 0,
    },
    {
      scanDate: new Date(now.getTime() - 0.5 * 3600000),
      platform: "reddit",
      status: "COMPLETED",
      tickersSearched: JSON.stringify(tickers.slice(0, 3)),
      pagesVisited: 63,
      mentionsFound: 19,
      screenshotsTaken: 7,
      browserMinutes: 11.2,
      memoryPeakMb: 445,
      suspensionCount: 1,
    },
    {
      scanDate: new Date(now.getTime() - 0.5 * 3600000),
      platform: "twitter",
      status: "COMPLETED",
      tickersSearched: JSON.stringify(tickers.slice(0, 3)),
      pagesVisited: 28,
      mentionsFound: 8,
      screenshotsTaken: 3,
      browserMinutes: 6.1,
      memoryPeakMb: 287,
      suspensionCount: 0,
    },
    {
      scanDate: new Date(now.getTime() - 24 * 3600000), // Yesterday
      platform: "discord",
      status: "COMPLETED",
      tickersSearched: JSON.stringify(tickers.slice(2, 5)),
      pagesVisited: 52,
      mentionsFound: 15,
      screenshotsTaken: 5,
      browserMinutes: 9.7,
      memoryPeakMb: 398,
      suspensionCount: 0,
    },
    {
      scanDate: new Date(now.getTime() - 24 * 3600000),
      platform: "reddit",
      status: "SUSPENDED",
      tickersSearched: JSON.stringify(tickers.slice(2, 5)),
      pagesVisited: 31,
      mentionsFound: 6,
      screenshotsTaken: 2,
      browserMinutes: 4.8,
      memoryPeakMb: 523,
      suspensionCount: 1,
      errors: JSON.stringify(["Memory limit exceeded at 523MB, session saved and suspended"]),
    },
    {
      scanDate: new Date(now.getTime() - 48 * 3600000), // 2 days ago
      platform: "twitter",
      status: "FAILED",
      tickersSearched: JSON.stringify(["ACME"]),
      pagesVisited: 5,
      mentionsFound: 0,
      screenshotsTaken: 0,
      browserMinutes: 1.2,
      memoryPeakMb: 198,
      suspensionCount: 0,
      errors: JSON.stringify(["Login failed: CAPTCHA_REQUIRED"]),
    },
    {
      scanDate: new Date(now.getTime() - 72 * 3600000), // 3 days ago
      platform: "discord",
      status: "COMPLETED",
      tickersSearched: JSON.stringify(tickers),
      pagesVisited: 89,
      mentionsFound: 24,
      screenshotsTaken: 9,
      browserMinutes: 15.4,
      memoryPeakMb: 467,
      suspensionCount: 0,
    },
    {
      scanDate: new Date(now.getTime() - 96 * 3600000), // 4 days ago
      platform: "reddit",
      status: "COMPLETED",
      tickersSearched: JSON.stringify(tickers),
      pagesVisited: 112,
      mentionsFound: 31,
      screenshotsTaken: 11,
      browserMinutes: 18.9,
      memoryPeakMb: 489,
      suspensionCount: 2,
    },
  ];

  for (const sessionData of demoSessions) {
    const session = await prisma.browserAgentSession.create({
      data: sessionData,
    });

    // Create evidence items for completed sessions with mentions
    if (sessionData.status === "COMPLETED" && sessionData.mentionsFound > 0) {
      const sessionTickers = JSON.parse(sessionData.tickersSearched) as string[];
      const evidenceCount = Math.min(sessionData.mentionsFound, 5);

      const sampleAuthors = [
        "StockGuru2026", "PennyKing_", "MoonShot_Trades", "CryptoStockz",
        "WallStreetWhale", "PumpAlert_Bot", "DiamondHands99", "TickerSniper",
      ];

      const sampleContent = [
        "This stock is about to EXPLODE! Load up before it's too late. 10x potential easy! Not financial advice but you'd be crazy to miss this one.",
        "Been watching $TICKER for weeks. Insider info says big announcement coming Monday. Get in NOW while it's still under $1.",
        "Just bought 500k shares of $TICKER. This company is completely undervalued. DD inside: revenue up 300%, new patent pending.",
        "URGENT: $TICKER breaking out RIGHT NOW! Volume is insane. This is the next GME. Don't miss the rocket!",
        "$TICKER to the moon! Join our Discord for daily picks that have been hitting 200%+ gains. Link in bio.",
      ];

      for (let i = 0; i < evidenceCount; i++) {
        const ticker = sessionTickers[i % sessionTickers.length];
        const score = Math.floor(Math.random() * 60) + 30; // 30-90

        await prisma.browserEvidence.create({
          data: {
            sessionId: session.id,
            ticker,
            platform: sessionData.platform,
            textContent: sampleContent[i % sampleContent.length].replace("$TICKER", `$${ticker}`),
            author: sampleAuthors[Math.floor(Math.random() * sampleAuthors.length)],
            promotionScore: score,
            redFlags: JSON.stringify(
              score >= 60
                ? ["Urgency language", "Unrealistic gains claim", "Low-cap pump pattern"]
                : score >= 40
                ? ["Urgency language", "Price target without basis"]
                : ["Promotional tone"]
            ),
            engagement: JSON.stringify({
              upvotes: Math.floor(Math.random() * 500) + 10,
              comments: Math.floor(Math.random() * 80) + 2,
              views: Math.floor(Math.random() * 5000) + 100,
            }),
            postDate: new Date(sessionData.scanDate.getTime() - Math.random() * 86400000),
            url: `https://${sessionData.platform}.com/example/${ticker.toLowerCase()}/${Math.floor(Math.random() * 99999)}`,
          },
        });
      }
    }
  }
}

async function seedSocialScanData() {
  // Only seed if no scan runs exist
  const count = await prisma.socialScanRun.count();
  if (count > 0) return;

  const now = new Date();

  // Create a couple of API-based scan runs
  const scanRun1 = await prisma.socialScanRun.create({
    data: {
      scanDate: new Date(now.getTime() - 2 * 3600000),
      status: "COMPLETED",
      tickersScanned: 5,
      tickersWithMentions: 3,
      totalMentions: 14,
      platformsUsed: JSON.stringify(["google_cse", "reddit_oauth", "youtube_api", "discord_bot"]),
      duration: 45000,
      triggeredBy: "scheduled",
    },
  });

  const scanRun2 = await prisma.socialScanRun.create({
    data: {
      scanDate: new Date(now.getTime() - 26 * 3600000),
      status: "COMPLETED",
      tickersScanned: 5,
      tickersWithMentions: 2,
      totalMentions: 8,
      platformsUsed: JSON.stringify(["google_cse", "perplexity", "reddit_oauth", "stocktwits"]),
      duration: 38000,
      triggeredBy: "scheduled",
    },
  });

  // Sample mentions for scan run 1
  const mentions = [
    {
      scanRunId: scanRun1.id,
      ticker: "ACME",
      stockName: "Acme Corp",
      platform: "Reddit",
      source: "r/pennystocks",
      discoveredVia: "reddit_oauth",
      title: "ACME is ready to blow up next week - DD inside",
      content: "I've been researching ACME Corp for months. Revenue is up 300% QoQ, new FDA approval pending, and insider buying detected. Price target: $5 by end of month. Currently at $0.12. This is the play of the year.",
      author: "StockGuru2026",
      postDate: new Date(now.getTime() - 3 * 3600000),
      sentiment: "bullish",
      isPromotional: true,
      promotionScore: 78,
      redFlags: JSON.stringify(["Unrealistic price target", "Urgency language", "Low-cap stock promotion"]),
      url: "https://reddit.com/r/pennystocks/example_acme",
      engagement: JSON.stringify({ upvotes: 234, comments: 67 }),
    },
    {
      scanRunId: scanRun1.id,
      ticker: "ACME",
      stockName: "Acme Corp",
      platform: "YouTube",
      source: "PennyStockKing Channel",
      discoveredVia: "youtube_api",
      title: "ACME Stock Analysis - 1000% Potential Gains (Must Watch)",
      content: "In today's video we look at ACME Corp and why I think this penny stock could deliver massive returns...",
      author: "PennyStockKing",
      postDate: new Date(now.getTime() - 5 * 3600000),
      sentiment: "bullish",
      isPromotional: true,
      promotionScore: 85,
      redFlags: JSON.stringify(["Clickbait title", "Unrealistic gains claim", "Pump pattern detected"]),
      url: "https://youtube.com/watch?v=example_acme",
      engagement: JSON.stringify({ views: 12400, likes: 890, comments: 234 }),
    },
    {
      scanRunId: scanRun1.id,
      ticker: "DEFG",
      stockName: "DefG Holdings",
      platform: "Discord",
      source: "Penny Stock Alerts Server",
      discoveredVia: "discord_bot",
      title: null,
      content: "NEW ALERT: $DEFG breaking out! Volume surge detected. Entry under $0.05. Target $0.50. DYOR but this looks prime.",
      author: "AlertBot",
      postDate: new Date(now.getTime() - 4 * 3600000),
      sentiment: "bullish",
      isPromotional: true,
      promotionScore: 72,
      redFlags: JSON.stringify(["Alert-style promotion", "10x target without basis"]),
      engagement: JSON.stringify({ reactions: 45 }),
    },
    {
      scanRunId: scanRun1.id,
      ticker: "PUMP",
      stockName: "Pump Industries",
      platform: "Web",
      source: "Google CSE",
      discoveredVia: "google_cse",
      title: "Pump Industries: The Hidden Gem Wall Street Doesn't Want You to Know About",
      content: "Sponsored article discussing PUMP Industries' revolutionary technology and massive growth potential...",
      author: null,
      postDate: new Date(now.getTime() - 8 * 3600000),
      sentiment: "bullish",
      isPromotional: true,
      promotionScore: 91,
      redFlags: JSON.stringify(["Paid promotion suspected", "Sensational headline", "No disclosure"]),
      url: "https://example-finance-blog.com/pump-industries-hidden-gem",
      engagement: JSON.stringify({}),
    },
    {
      scanRunId: scanRun1.id,
      ticker: "ACME",
      stockName: "Acme Corp",
      platform: "StockTwits",
      source: "StockTwits Feed",
      discoveredVia: "stocktwits",
      title: null,
      content: "$ACME looking bullish. Chart setup is clean. Watching for breakout above $0.15 resistance.",
      author: "TechnicalTrader42",
      postDate: new Date(now.getTime() - 6 * 3600000),
      sentiment: "bullish",
      isPromotional: false,
      promotionScore: 22,
      redFlags: JSON.stringify([]),
      engagement: JSON.stringify({ likes: 12 }),
    },
    {
      scanRunId: scanRun2.id,
      ticker: "XYZZ",
      stockName: "XYZ Corp",
      platform: "Reddit",
      source: "r/wallstreetbets",
      discoveredVia: "reddit_oauth",
      title: "XYZZ YOLO - putting my life savings in",
      content: "This is not financial advice but XYZZ is about to go parabolic. Shorted to oblivion, low float, high SI%...",
      author: "YOLO_Trader_69",
      postDate: new Date(now.getTime() - 28 * 3600000),
      sentiment: "bullish",
      isPromotional: true,
      promotionScore: 65,
      redFlags: JSON.stringify(["YOLO culture promotion", "Short squeeze narrative"]),
      url: "https://reddit.com/r/wallstreetbets/example_xyzz",
      engagement: JSON.stringify({ upvotes: 1200, comments: 456 }),
    },
  ];

  for (const mention of mentions) {
    await prisma.socialMention.create({ data: mention });
  }
}
