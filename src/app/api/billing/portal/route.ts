import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createPortalSession } from "@/lib/billing";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await createPortalSession(session.user.id);

    if (!result.url) {
      return NextResponse.json(
        { error: result.error || "Failed to create portal session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: result.url });
  } catch (error) {
    console.error("Portal error:", error);
    return NextResponse.json(
      { error: "An error occurred creating portal session" },
      { status: 500 }
    );
  }
}
