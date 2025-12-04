import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUsageInfo } from "@/lib/usage";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const usage = await getUsageInfo(session.user.id);

    return NextResponse.json(usage);
  } catch (error) {
    console.error("Usage API error:", error);
    return NextResponse.json(
      { error: "An error occurred fetching usage" },
      { status: 500 }
    );
  }
}
