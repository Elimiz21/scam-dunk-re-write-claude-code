import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

async function resolveUserId(request: NextRequest): Promise<string | null> {
  // Support both session (web) and JWT (mobile) auth
  const session = await auth();
  if (session?.user?.id) {
    return session.user.id;
  }
  return authenticateMobileRequest(request);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.watchlistItem.findMany({
      where: { userId },
      orderBy: [{ isHidden: "asc" }, { lastScannedAt: "desc" }],
      select: {
        id: true,
        ticker: true,
        assetType: true,
        lastRiskLevel: true,
        lastScore: true,
        scanCount: true,
        isHidden: true,
        lastScannedAt: true,
      },
    });

    return NextResponse.json({ items }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("Fetch watchlist error:", error);
    return NextResponse.json(
      { error: "Failed to fetch watchlist" },
      { status: 500 },
    );
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  isHidden: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const validation = patchSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 },
      );
    }

    // updateMany so the userId filter enforces ownership — a foreign id is a
    // silent no-op (count 0), never a cross-user write.
    const { count } = await prisma.watchlistItem.updateMany({
      where: { id: validation.data.id, userId },
      data: { isHidden: validation.data.isHidden },
    });

    if (count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update watchlist error:", error);
    return NextResponse.json(
      { error: "Failed to update watchlist item" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { count } = await prisma.watchlistItem.deleteMany({
      where: { id, userId },
    });

    if (count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete watchlist error:", error);
    return NextResponse.json(
      { error: "Failed to remove watchlist item" },
      { status: 500 },
    );
  }
}
