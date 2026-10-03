import { NextResponse } from "next/server";
import { googleCredentials } from "@/lib/google-auth";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ google: !!googleCredentials(), environment: process.env.VERCEL_ENV || "development" });
}
