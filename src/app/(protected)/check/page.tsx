"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RiskCard } from "@/components/RiskCard";
import { LimitReached } from "@/components/LimitReached";
import { LoadingStepper } from "@/components/LoadingStepper";
import { Shield, Search, User, Loader2 } from "lucide-react";
import { RiskResponse, LimitReachedResponse, UsageInfo } from "@/lib/types";

type Step = {
  label: string;
  status: "pending" | "loading" | "complete";
};

export default function CheckPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [ticker, setTicker] = useState("");
  const [pitchText, setPitchText] = useState("");
  const [unsolicited, setUnsolicited] = useState(false);
  const [promisesHighReturns, setPromisesHighReturns] = useState(false);
  const [urgencyPressure, setUrgencyPressure] = useState(false);
  const [secrecyInsideInfo, setSecrecyInsideInfo] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RiskResponse | null>(null);
  const [limitReached, setLimitReached] = useState<LimitReachedResponse | null>(
    null
  );
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  const [steps, setSteps] = useState<Step[]>([
    { label: "Fetching stock data", status: "pending" },
    { label: "Analyzing price & volume patterns", status: "pending" },
    { label: "Checking regulatory alerts", status: "pending" },
    { label: "Scanning pitch patterns", status: "pending" },
  ]);

  // Fetch initial usage
  useEffect(() => {
    if (session?.user) {
      fetchUsage();
    }
  }, [session]);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/check");
    }
  }, [status, router]);

  const fetchUsage = async () => {
    try {
      const response = await fetch("/api/user/usage");
      if (response.ok) {
        const data = await response.json();
        setUsage(data);
      }
    } catch (err) {
      console.error("Failed to fetch usage:", err);
    }
  };

  const handleUpgrade = async () => {
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
      });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to start upgrade process");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);
    setLimitReached(null);
    setIsLoading(true);

    // Reset steps
    setSteps([
      { label: "Fetching stock data", status: "loading" },
      { label: "Analyzing price & volume patterns", status: "pending" },
      { label: "Checking regulatory alerts", status: "pending" },
      { label: "Scanning pitch patterns", status: "pending" },
    ]);

    try {
      // Simulate step progress for better UX
      const simulateSteps = async () => {
        await new Promise((r) => setTimeout(r, 500));
        setSteps((s) => [
          { ...s[0], status: "complete" },
          { ...s[1], status: "loading" },
          s[2],
          s[3],
        ]);

        await new Promise((r) => setTimeout(r, 400));
        setSteps((s) => [
          s[0],
          { ...s[1], status: "complete" },
          { ...s[2], status: "loading" },
          s[3],
        ]);

        await new Promise((r) => setTimeout(r, 300));
        setSteps((s) => [
          s[0],
          s[1],
          { ...s[2], status: "complete" },
          { ...s[3], status: "loading" },
        ]);
      };

      // Run API call and step simulation in parallel
      const [response] = await Promise.all([
        fetch("/api/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker,
            pitchText,
            context: {
              unsolicited,
              promisesHighReturns,
              urgencyPressure,
              secrecyInsideInfo,
            },
          }),
        }),
        simulateSteps(),
      ]);

      // Complete final step
      setSteps((s) => [
        s[0],
        s[1],
        s[2],
        { ...s[3], status: "complete" },
      ]);

      const data = await response.json();

      if (response.status === 429) {
        // Limit reached
        setLimitReached(data as LimitReachedResponse);
        setUsage({
          plan: data.usage.plan,
          scansUsedThisMonth: data.usage.scansUsedThisMonth,
          scansLimitThisMonth: data.usage.scansLimitThisMonth,
          limitReached: true,
        });
      } else if (!response.ok) {
        setError(data.error || "An error occurred");
      } else {
        // Success
        setResult(data as RiskResponse);
        setUsage(data.usage);
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
            <span className="text-xl sm:text-2xl font-bold">ScamDunk</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link href="/account">
              <Button variant="ghost" size="sm">
                <User className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Account</span>
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-3xl mx-auto">
          {/* Usage display */}
          {usage && (
            <div className="mb-4 sm:mb-6 text-xs sm:text-sm text-muted-foreground text-right">
              <span className="font-medium">{usage.plan}</span> plan
              <span className="mx-1">•</span>
              {usage.scansUsedThisMonth}/{usage.scansLimitThisMonth} checks used
            </div>
          )}

          {/* Check if limit already reached before submission */}
          {usage?.limitReached && !result && !isLoading && (
            <div className="mb-6">
              <LimitReached
                plan={usage.plan}
                scansUsed={usage.scansUsedThisMonth}
                scansLimit={usage.scansLimitThisMonth}
                onUpgrade={handleUpgrade}
              />
            </div>
          )}

          {/* Form - hide when limit reached, showing result, or showing limit reached message */}
          {!usage?.limitReached && !result && !limitReached && (
            <Card>
              <CardHeader>
                <CardTitle>Check a stock for red flags</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Paste the stock ticker and the pitch you received - we&apos;ll
                  surface potential scam red flags.
                </p>
              </CardHeader>
              <CardContent>
                {/* Loading state - show inside card when processing */}
                {isLoading ? (
                  <div className="py-4">
                    <h3 className="text-lg font-semibold mb-4">Analyzing {ticker}...</h3>
                    <LoadingStepper steps={steps} />
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                      <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="ticker">Stock Ticker</Label>
                      <Input
                        id="ticker"
                        placeholder="e.g., AAPL, MSFT, ABCD"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value.toUpperCase())}
                        required
                        disabled={isLoading}
                        maxLength={10}
                      />
                      <p className="text-xs text-muted-foreground">
                        US stocks only (NYSE, NASDAQ, OTC)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="pitchText">Pitch Text</Label>
                      <Textarea
                        id="pitchText"
                        placeholder="Paste the message or pitch you received about this stock..."
                        value={pitchText}
                        onChange={(e) => setPitchText(e.target.value)}
                        required
                        disabled={isLoading}
                        rows={6}
                        maxLength={10000}
                      />
                    </div>

                    <div className="space-y-4">
                      <Label>Context (check all that apply)</Label>

                      <div className="flex items-center justify-between py-2 border-b">
                        <div className="flex-1 pr-4">
                          <p className="text-sm font-medium">
                            Unsolicited tip?
                          </p>
                          <p className="text-xs text-muted-foreground">
                            You didn&apos;t ask for this stock recommendation
                          </p>
                        </div>
                        <Switch
                          checked={unsolicited}
                          onCheckedChange={setUnsolicited}
                          disabled={isLoading}
                        />
                      </div>

                      <div className="flex items-center justify-between py-2 border-b">
                        <div className="flex-1 pr-4">
                          <p className="text-sm font-medium">
                            Promises high/guaranteed returns?
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Claims like &quot;guaranteed 10x&quot; or &quot;can&apos;t lose&quot;
                          </p>
                        </div>
                        <Switch
                          checked={promisesHighReturns}
                          onCheckedChange={setPromisesHighReturns}
                          disabled={isLoading}
                        />
                      </div>

                      <div className="flex items-center justify-between py-2 border-b">
                        <div className="flex-1 pr-4">
                          <p className="text-sm font-medium">
                            Urgency or time pressure?
                          </p>
                          <p className="text-xs text-muted-foreground">
                            &quot;Act now&quot;, &quot;limited time&quot;, &quot;before it&apos;s too late&quot;
                          </p>
                        </div>
                        <Switch
                          checked={urgencyPressure}
                          onCheckedChange={setUrgencyPressure}
                          disabled={isLoading}
                        />
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <div className="flex-1 pr-4">
                          <p className="text-sm font-medium">
                            Claims inside/secret info?
                          </p>
                          <p className="text-xs text-muted-foreground">
                            &quot;Insider tip&quot;, &quot;confidential&quot;, &quot;don&apos;t tell anyone&quot;
                          </p>
                        </div>
                        <Switch
                          checked={secrecyInsideInfo}
                          onCheckedChange={setSecrecyInsideInfo}
                          disabled={isLoading}
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={isLoading || !ticker || !pitchText}
                    >
                      <Search className="mr-2 h-4 w-4" />
                      Check this stock for red flags
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          )}

          {/* Limit reached after attempt */}
          {limitReached && (
            <div className="mt-6">
              <LimitReached
                plan={limitReached.usage.plan}
                scansUsed={limitReached.usage.scansUsedThisMonth}
                scansLimit={limitReached.usage.scansLimitThisMonth}
                onUpgrade={handleUpgrade}
              />
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-6">
              <RiskCard result={result} />

              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setResult(null);
                    setTicker("");
                    setPitchText("");
                    setUnsolicited(false);
                    setPromisesHighReturns(false);
                    setUrgencyPressure(false);
                    setSecrecyInsideInfo(false);
                  }}
                >
                  Check another stock
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
