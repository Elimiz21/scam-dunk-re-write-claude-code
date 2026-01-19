/**
 * Admin Email Configuration API - Check email setup status
 */

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { validateEmailConfig } from "@/lib/email";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = validateEmailConfig();

    return NextResponse.json({
      status: config.isValid ? "configured" : "error",
      isTestMode: config.isTestMode,
      fromEmail: config.fromEmail,
      appUrl: config.appUrl,
      warnings: config.warnings,
      errors: config.errors,
      recommendations: config.isTestMode
        ? [
            "Emails can only be sent to the Resend account owner in test mode",
            "Verify a custom domain at https://resend.com/domains",
            "Set EMAIL_FROM environment variable to your verified domain",
          ]
        : [],
    });
  } catch (error) {
    console.error("Email config API error:", error);
    return NextResponse.json(
      { error: "Failed to check email configuration" },
      { status: 500 }
    );
  }
}
