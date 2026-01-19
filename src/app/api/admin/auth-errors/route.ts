/**
 * Admin Auth Errors API - View and manage authentication errors
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import {
  getRecentAuthErrors,
  getAuthErrorSummary,
  getTodayErrorStats,
  getErrorBreakdown,
  resolveAuthError,
  type AuthErrorType,
} from "@/lib/auth-error-tracking";

export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const view = searchParams.get("view") || "recent";

    switch (view) {
      case "recent": {
        const errorType = searchParams.get("errorType") as AuthErrorType | undefined;
        const isResolved = searchParams.get("isResolved");
        const limit = parseInt(searchParams.get("limit") || "50", 10);

        const errors = await getRecentAuthErrors({
          limit,
          errorType: errorType || undefined,
          isResolved: isResolved === "true" ? true : isResolved === "false" ? false : undefined,
        });

        return NextResponse.json({ errors });
      }

      case "summary": {
        const days = parseInt(searchParams.get("days") || "7", 10);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const summary = await getAuthErrorSummary(startDate, endDate);

        return NextResponse.json({ summary });
      }

      case "today": {
        const stats = await getTodayErrorStats();
        return NextResponse.json({ stats });
      }

      case "breakdown": {
        const errorType = searchParams.get("errorType") as AuthErrorType;
        if (!errorType) {
          return NextResponse.json(
            { error: "errorType is required for breakdown view" },
            { status: 400 }
          );
        }

        const days = parseInt(searchParams.get("days") || "7", 10);
        const breakdown = await getErrorBreakdown(errorType, days);

        return NextResponse.json({ breakdown });
      }

      case "overview": {
        // Get comprehensive overview with all stats
        const todayStats = await getTodayErrorStats();

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        const weeklySummary = await getAuthErrorSummary(startDate, endDate);

        const recentErrors = await getRecentAuthErrors({
          limit: 20,
          isResolved: false,
        });

        // Get top error codes for each type
        const signupBreakdown = await getErrorBreakdown("SIGNUP_FAILED", 7);
        const loginBreakdown = await getErrorBreakdown("LOGIN_FAILED", 7);
        const emailBreakdown = await getErrorBreakdown("EMAIL_SEND_FAILED", 7);

        return NextResponse.json({
          today: todayStats,
          weeklySummary,
          recentUnresolved: recentErrors,
          topErrors: {
            signup: signupBreakdown,
            login: loginBreakdown,
            email: emailBreakdown,
          },
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid view parameter. Use: recent, summary, today, breakdown, or overview" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Auth errors API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch auth errors" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, errorId, resolution } = body;

    if (action === "resolve") {
      if (!errorId) {
        return NextResponse.json(
          { error: "errorId is required" },
          { status: 400 }
        );
      }

      const resolved = await resolveAuthError(
        errorId,
        session.id,
        resolution
      );

      return NextResponse.json({ success: true, error: resolved });
    }

    return NextResponse.json(
      { error: "Invalid action. Use: resolve" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Auth errors action error:", error);
    return NextResponse.json(
      { error: "Failed to perform action" },
      { status: 500 }
    );
  }
}
