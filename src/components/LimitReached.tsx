"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { PayPalButton } from "@/components/PayPalButton";
import Link from "next/link";

interface LimitReachedProps {
  plan: "FREE" | "PAID" | "PRO_MAX";
  scansUsed: number;
  scansLimit: number;
}

export function LimitReached({
  plan,
  scansUsed,
  scansLimit,
}: LimitReachedProps) {
  const planLabel = plan === "PRO_MAX" ? "Pro Max" : plan === "PAID" ? "Pro" : "Free";
  const isProMax = plan === "PRO_MAX";

  return (
    <Card className="w-full border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-yellow-800">
          <AlertTriangle className="h-5 w-5" />
          Monthly Limit Reached
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
            <Alert variant="warning">
              <AlertTitle>
                You&apos;ve used all your {planLabel} scan credits this month
              </AlertTitle>
          <AlertDescription>
            Plan: {planLabel} ({scansUsed}/{scansLimit} checks used)
          </AlertDescription>
        </Alert>

        <p className="text-sm text-muted-foreground">
          {isProMax
            ? "Your Pro Max plan is active. Your monthly scan credits reset at the beginning of each month."
            : "Your monthly scan credits reset at the beginning of each month."}
        </p>

        {plan === "FREE" && (
          <div className="mt-4">
            <PayPalButton plan="PAID" />
          </div>
        )}
        {plan === "PAID" && (
          <p className="text-sm text-muted-foreground">
            To discuss moving from Pro to Pro Max, visit your account or{" "}
            <Link href="/contact" className="font-medium text-foreground underline underline-offset-2">
              contact support
            </Link>
            .
          </p>
        )}

        <div className="pt-4 border-t">
          <h4 className="font-medium mb-2">Plan benefits:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• More monthly analysis credits</li>
            <li>• Full and price-monitoring slots</li>
            <li>• Price monitoring is checked after market close — not live</li>
            <li>• Full monitors rerun risk analysis; price monitors check movement only</li>
            <li>• Priority support</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
