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
          <AlertTitle>You&apos;ve used all your free checks this month</AlertTitle>
          <AlertDescription>
            Plan: {plan} ({scansUsed}/{scansLimit} checks used)
          </AlertDescription>
        </Alert>

        <p className="text-sm text-muted-foreground">
          Your monthly check limit resets at the beginning of each month. Upgrade
          to Pro to get 200 checks per month and continue analyzing stocks.
        </p>

        <div className="mt-4">
          <PayPalButton />
        </div>

        <div className="pt-4 border-t">
          <h4 className="font-medium mb-2">Pro Plan Benefits:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• 200 stock checks per month</li>
            <li>• Full risk analysis for each check</li>
            <li>• Detailed red flag explanations</li>
            <li>• Priority support</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
