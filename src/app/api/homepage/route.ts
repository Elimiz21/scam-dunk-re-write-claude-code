/**
 * Public Homepage Content API
 * Returns the active hero headline for the landing page
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET - Fetch the active homepage hero
export async function GET() {
  try {
    const activeHero = await prisma.homepageHero.findFirst({
      where: { isActive: true },
      select: { headline: true, subheadline: true },
    });

    if (!activeHero) {
      // Return default content if no active hero in DB
      return NextResponse.json({
        headline: "Don't invest blind. Detect scams before they cost you.",
        subheadline:
          "Enter any stock or crypto ticker and get an instant risk analysis. We scan for pump-and-dump patterns, manipulation signals, and regulatory red flags in seconds.",
        isDefault: true,
      });
    }

    return NextResponse.json({
      headline: activeHero.headline,
      subheadline: activeHero.subheadline,
      isDefault: false,
    });
  } catch (error) {
    console.error("Fetch homepage content error:", error);
    // Return default on error
    return NextResponse.json({
      headline: "Don't invest blind. Detect scams before they cost you.",
      subheadline:
        "Enter any stock or crypto ticker and get an instant risk analysis. We scan for pump-and-dump patterns, manipulation signals, and regulatory red flags in seconds.",
      isDefault: true,
    });
  }
}
