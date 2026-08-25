"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { PayPalButton } from "@/components/PayPalButton";

interface LimitReachedProps {
  plan: "FREE" | "PAID";
  scansUsed: number;
  scansLimit: number;
}

export function LimitReached({
  plan,
  scansUsed,
  scansLimit,
}: LimitReachedProps) {
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
            You&apos;ve used all your free checks this month
          </AlertTitle>
          <AlertDescription>
            Plan: {plan} ({scansUsed}/{scansLimit} checks used)
          </AlertDescription>
        </Alert>

        <p className="text-sm text-muted-foreground">
          Your monthly check limit resets at the beginning of each month.
          Upgrade from your account to increase monthly credits and add
          scheduled monitoring slots.
        </p>

        <div className="mt-4">
          <PayPalButton />
        </div>

        <div className="pt-4 border-t">
          <h4 className="font-medium mb-2">Paid-plan benefits:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• More monthly analysis credits</li>
            <li>• Full and price-monitoring slots</li>
            <li>• Price monitoring is checked after market close — not live</li>
            <li>• Full risk analysis for each check</li>
            <li>• Priority support</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
