import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { beginTelegramBinding, revokeTelegramBinding } from "@/lib/telegram/binding";
import { isTelegramConfigured } from "@/lib/telegram/provider";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const binding = await prisma.telegramIdentityBinding.findFirst({ where: { userId: session.user.id, active: true, revokedAt: null } });
    return NextResponse.json({ active: !!binding, available: isTelegramConfigured() });
  } catch { return NextResponse.json({ error: "Unable to load Telegram access" }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isTelegramConfigured()) return NextResponse.json({ error: "Telegram linking is not available yet." }, { status: 503 });
  try {
    const keyed = new NextRequest("http://internal/telegram-binding", { headers: { "x-real-ip": `telegram-binding:${session.user.id}` } });
    const [user, ip] = await Promise.all([rateLimit(keyed, "strict"), rateLimit(request, "strict")]);
    if (!user.success || !ip.success) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    const url = await beginTelegramBinding(session.user.id);
    if (!url) return NextResponse.json({ error: "An active subscription is required to link Telegram." }, { status: 403 });
    return NextResponse.json({ url, expiresIn: 600 }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Telegram linking is temporarily unavailable." }, { status: 503 }); }
}
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { await revokeTelegramBinding(session.user.id); return NextResponse.json({ success: true }); }
  catch { return NextResponse.json({ error: "Unable to unlink Telegram." }, { status: 503 }); }
}
