import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { mentionId, url, ticker, platform } = await request.json();
    if (!mentionId || !url || !ticker || !platform) {
      return NextResponse.json(
        { error: "mentionId, url, ticker, and platform are required" },
        { status: 400 },
      );
    }

    const today = new Date();
    let sessionRow = await prisma.browserAgentSession.findFirst({
      where: {
        platform,
        status: "COMPLETED",
        scanDate: {
          gte: new Date(today.toISOString().slice(0, 10) + "T00:00:00.000Z"),
          lte: new Date(today.toISOString().slice(0, 10) + "T23:59:59.999Z"),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!sessionRow) {
      sessionRow = await prisma.browserAgentSession.create({
        data: {
          scanDate: today,
          platform,
          status: "COMPLETED",
          tickersSearched: JSON.stringify([ticker]),
          pagesVisited: 1,
          mentionsFound: 1,
          screenshotsTaken: 0,
          browserMinutes: 0,
          errors: JSON.stringify([]),
        },
      });
    }

    const screenshotUrl = `https://image.thum.io/get/png/noanimate/width/1400/${encodeURIComponent(url)}`;

    const evidence = await prisma.browserEvidence.create({
      data: {
        sessionId: sessionRow.id,
        ticker,
        platform,
        url,
        screenshotPath: `social-mention:${mentionId}`,
        screenshotUrl,
        textContent: `Auto-captured for social mention ${mentionId}`,
      },
      select: { id: true, screenshotUrl: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, evidence });
  } catch (error) {
    console.error("Capture screenshot error:", error);
    return NextResponse.json(
      { error: "Failed to capture screenshot" },
      { status: 500 },
    );
  }
}
