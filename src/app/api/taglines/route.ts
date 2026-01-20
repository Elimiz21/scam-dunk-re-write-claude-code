/**
 * Public API to fetch scan taglines/messages
 * Returns taglines from database, with fallback to static defaults
 */

import { NextResponse } from "next/server";
import { getTaglinesFromDB, Tagline } from "@/lib/taglines";

// Cache the taglines for 5 minutes to reduce DB calls
let cachedTaglines: Tagline[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  try {
    const now = Date.now();

    // Return cached taglines if still valid
    if (cachedTaglines && now - cacheTimestamp < CACHE_TTL) {
      return NextResponse.json({ taglines: cachedTaglines });
    }

    // Fetch fresh taglines
    const taglines = await getTaglinesFromDB();

    // Update cache
    cachedTaglines = taglines;
    cacheTimestamp = now;

    return NextResponse.json({ taglines });
  } catch (error) {
    console.error("Error fetching taglines:", error);
    // Import static fallback
    const { taglines: staticTaglines } = await import("@/lib/taglines");
    return NextResponse.json({ taglines: staticTaglines });
  }
}
