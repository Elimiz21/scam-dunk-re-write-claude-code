/**
 * Admin Homepage Content API
 * CRUD operations for landing page hero headlines
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";

// GET - List all homepage hero variants
export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const heroes = await prisma.homepageHero.findMany({
      orderBy: { createdAt: "desc" },
    });

    const activeHero = heroes.find((h: { isActive: boolean }) => h.isActive) || null;

    return NextResponse.json({ heroes, activeHero });
  } catch (error) {
    console.error("Fetch homepage heroes error:", error);
    return NextResponse.json(
      { error: "Failed to fetch homepage content" },
      { status: 500 }
    );
  }
}

// POST - Create a new hero variant
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { headline, subheadline } = body;

    if (!headline?.trim() || !subheadline?.trim()) {
      return NextResponse.json(
        { error: "Headline and subheadline are required" },
        { status: 400 }
      );
    }

    const hero = await prisma.homepageHero.create({
      data: {
        headline: headline.trim(),
        subheadline: subheadline.trim(),
        createdBy: session.id,
      },
    });

    // Audit log (non-critical)
    prisma.adminAuditLog
      .create({
        data: {
          adminUserId: session.id,
          action: "HOMEPAGE_HERO_CREATED",
          resource: hero.id,
          details: JSON.stringify({ headline: hero.headline }),
        },
      })
      .catch(() => {});

    return NextResponse.json(hero);
  } catch (error) {
    console.error("Create homepage hero error:", error);
    return NextResponse.json(
      { error: "Failed to create homepage content" },
      { status: 500 }
    );
  }
}

// PUT - Update a hero variant or set it as active
export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, headline, subheadline, setActive } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    // If setting active, deactivate all others first
    if (setActive) {
      await prisma.homepageHero.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      const hero = await prisma.homepageHero.update({
        where: { id },
        data: { isActive: true },
      });

      // Audit log
      prisma.adminAuditLog
        .create({
          data: {
            adminUserId: session.id,
            action: "HOMEPAGE_HERO_ACTIVATED",
            resource: hero.id,
            details: JSON.stringify({ headline: hero.headline }),
          },
        })
        .catch(() => {});

      return NextResponse.json(hero);
    }

    // Otherwise update content
    const updateData: Record<string, string> = {};
    if (headline?.trim()) updateData.headline = headline.trim();
    if (subheadline?.trim()) updateData.subheadline = subheadline.trim();

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    const hero = await prisma.homepageHero.update({
      where: { id },
      data: updateData,
    });

    // Audit log
    prisma.adminAuditLog
      .create({
        data: {
          adminUserId: session.id,
          action: "HOMEPAGE_HERO_UPDATED",
          resource: hero.id,
          details: JSON.stringify(updateData),
        },
      })
      .catch(() => {});

    return NextResponse.json(hero);
  } catch (error) {
    console.error("Update homepage hero error:", error);
    return NextResponse.json(
      { error: "Failed to update homepage content" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a hero variant
export async function DELETE(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const hero = await prisma.homepageHero.findUnique({ where: { id } });
    if (!hero) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.homepageHero.delete({ where: { id } });

    // Audit log
    prisma.adminAuditLog
      .create({
        data: {
          adminUserId: session.id,
          action: "HOMEPAGE_HERO_DELETED",
          resource: id,
          details: JSON.stringify({ headline: hero.headline }),
        },
      })
      .catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete homepage hero error:", error);
    return NextResponse.json(
      { error: "Failed to delete homepage content" },
      { status: 500 }
    );
  }
}
