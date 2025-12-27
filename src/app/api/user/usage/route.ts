import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authenticateMobileRequest } from "@/lib/mobile-auth";
import { getUsageInfo } from "@/lib/usage";

export async function GET(request: NextRequest) {
  try {
    // Support both session (web) and JWT (mobile) auth
    let userId: string | null = null;

    const session = await auth();
    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      userId = await authenticateMobileRequest(request);
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const usage = await getUsageInfo(userId);

    return NextResponse.json(usage);
  } catch (error) {
    console.error("Usage API error:", error);
    return NextResponse.json(
      { error: "An error occurred fetching usage" },
      { status: 500 }
    );
  }
}
