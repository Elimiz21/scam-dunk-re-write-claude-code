/**
 * Apple In-App Purchase Receipt Validation API
 *
 * POST /api/billing/apple/validate
 * Validates Apple IAP receipts and upgrades user plans.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authenticateMobileRequest } from "@/lib/mobile-auth";

// Apple's receipt validation endpoints
const APPLE_PRODUCTION_URL = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

// Environment variables
const APPLE_SHARED_SECRET = process.env.APPLE_SHARED_SECRET || "";

const validateSchema = z.object({
  receiptData: z.string().min(1, "Receipt data is required"),
  productId: z.string().optional(),
});

interface AppleReceiptResponse {
  status: number;
  receipt?: {
    bundle_id: string;
    in_app: Array<{
      product_id: string;
      transaction_id: string;
      original_transaction_id: string;
      purchase_date_ms: string;
      expires_date_ms?: string;
    }>;
  };
  latest_receipt_info?: Array<{
    product_id: string;
    transaction_id: string;
    original_transaction_id: string;
    purchase_date_ms: string;
    expires_date_ms?: string;
  }>;
  pending_renewal_info?: Array<{
    auto_renew_status: string;
    product_id: string;
  }>;
}

/**
 * Validate receipt with Apple's servers
 */
async function validateWithApple(
  receiptData: string,
  useSandbox: boolean = false
): Promise<AppleReceiptResponse> {
  const url = useSandbox ? APPLE_SANDBOX_URL : APPLE_PRODUCTION_URL;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "receipt-data": receiptData,
      password: APPLE_SHARED_SECRET,
      "exclude-old-transactions": true,
    }),
  });

  return response.json();
}

/**
 * Check if subscription is currently active
 */
function isSubscriptionActive(expiresDateMs: string | undefined): boolean {
  if (!expiresDateMs) return false;
  const expiresDate = parseInt(expiresDateMs, 10);
  return expiresDate > Date.now();
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate mobile request
    const userId = await authenticateMobileRequest(request);

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = validateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0].message },
        { status: 400 }
      );
    }

    const { receiptData, productId } = validation.data;

    // Check if Apple shared secret is configured
    if (!APPLE_SHARED_SECRET) {
      console.error("APPLE_SHARED_SECRET not configured");
      return NextResponse.json(
        { error: "Apple IAP not configured" },
        { status: 500 }
      );
    }

    // Validate with Apple (try production first)
    let appleResponse = await validateWithApple(receiptData, false);

    // If status 21007, receipt is from sandbox - retry with sandbox
    if (appleResponse.status === 21007) {
      appleResponse = await validateWithApple(receiptData, true);
    }

    // Check validation status
    // Status codes: https://developer.apple.com/documentation/appstorereceipts/status
    if (appleResponse.status !== 0) {
      console.error("Apple receipt validation failed:", appleResponse.status);
      return NextResponse.json(
        {
          valid: false,
          error: `Receipt validation failed (status: ${appleResponse.status})`,
        },
        { status: 400 }
      );
    }

    // Get latest receipt info (for subscriptions)
    const latestReceipts = appleResponse.latest_receipt_info || [];
    const inAppPurchases = appleResponse.receipt?.in_app || [];

    // Find active subscription
    const allPurchases = [...latestReceipts, ...inAppPurchases];
    const activeSubscription = allPurchases.find((purchase) =>
      isSubscriptionActive(purchase.expires_date_ms)
    );

    if (!activeSubscription) {
      // No active subscription found
      return NextResponse.json({
        valid: true,
        active: false,
        plan: "FREE",
        message: "No active subscription found",
      });
    }

    // Get subscription expiration
    const expiresAt = activeSubscription.expires_date_ms
      ? new Date(parseInt(activeSubscription.expires_date_ms, 10))
      : null;

    // Update user plan to PAID
    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: "PAID",
        // Store Apple transaction ID for reference
        billingCustomerId: activeSubscription.original_transaction_id,
      },
    });

    // Log the successful validation
    console.log(
      `Apple IAP validated for user ${userId}: ${activeSubscription.product_id}`
    );

    return NextResponse.json({
      valid: true,
      active: true,
      plan: "PAID",
      productId: activeSubscription.product_id,
      transactionId: activeSubscription.transaction_id,
      expiresAt: expiresAt?.toISOString(),
    });
  } catch (error) {
    console.error("Apple IAP validation error:", error);
    return NextResponse.json(
      { error: "Receipt validation failed" },
      { status: 500 }
    );
  }
}
