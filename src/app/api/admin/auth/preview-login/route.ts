/** Automatic preview credentials are retired. Use an individually provisioned admin. */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Automatic preview login is disabled. Sign in with your own admin credentials." },
    { status: 410 },
  );
}
