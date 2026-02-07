"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { ScanInput } from "@/components/ScanInput";
import { RiskCard } from "@/components/RiskCard";
import { LimitReached } from "@/components/LimitReached";
import { LoadingStepper } from "@/components/LoadingStepper";
import { Shield, TrendingUp, AlertTriangle, Zap, Sparkles, ArrowRight, BarChart3, Eye, Brain } from "lucide-react";
import { RiskResponse, LimitReachedResponse, UsageInfo, AssetType } from "@/lib/types";
import { getRandomTagline, taglines } from "@/lib/taglines";
import { useToast } from "@/components/ui/toast";
import { Step } from "@/components/LoadingStepper";

// Scanning tips derived from taglines for rotation during analysis
const scanningTips = taglines.map(t => t.headline);

export default function HomePage() {
  const { data: session, status } = useSession();
  const { addToast } = useToast();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RiskResponse | null>(null);
  const [limitReached, setLimitReached] = useState<LimitReachedResponse | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [currentTicker, setCurrentTicker] = useState("");

  const [steps, setSteps] = useState<Step[]>([
    { label: "Validating ticker symbol", status: "pending" },
    { label: "Fetching market data", status: "pending" },
    {
      label: "Running risk analysis",
      status: "pending",
      subSteps: [
        { label: "Analyzing price patterns", status: "pending" },
        { label: "Checking volume anomalies", status: "pending" },
        { label: "Scanning for pump-and-dump signals", status: "pending" },
      ]
    },
    { label: "Checking regulatory alerts", status: "pending" },
    { label: "Generating risk report", status: "pending" },
  ]);
  const [currentTip, setCurrentTip] = useState<string>("");
  const [tipIndex, setTipIndex] = useState(0);

  // Get random tagline on mount (changes on refresh)
  const [tagline] = useState(() => getRandomTagline());

  // Fetch initial usage
  useEffect(() => {
    if (session?.user) {
      fetchUsage();
    }
  }, [session]);

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


  const handleSubmit = async (data: {
    ticker: string;
    assetType: AssetType;
    pitchText?: string;
    context?: {
      unsolicited: boolean;
      promisesHighReturns: boolean;
      urgencyPressure: boolean;
      secrecyInsideInfo: boolean;
    };
  }) => {
    // Check if user is logged in
    if (!session) {
      window.location.href = "/login?callbackUrl=/";
      return;
    }

    setError("");
    setResult(null);
    setLimitReached(null);
    setIsLoading(true);
    setCurrentTicker(data.ticker);

    // Reset steps with enhanced granular progress
    const initialSteps: Step[] = [
      { label: "Validating ticker symbol", status: "loading" },
      { label: "Fetching market data", status: "pending" },
      {
        label: "Running risk analysis",
        status: "pending",
        subSteps: [
          { label: "Analyzing price patterns", status: "pending" },
          { label: "Checking volume anomalies", status: "pending" },
          { label: "Scanning for pump-and-dump signals", status: "pending" },
        ]
      },
      { label: "Checking regulatory alerts", status: "pending" },
      { label: "Generating risk report", status: "pending" },
    ];
    setSteps(initialSteps);

    // Start rotating tips
    const startTipIndex = Math.floor(Math.random() * scanningTips.length);
    setTipIndex(startTipIndex);
    setCurrentTip(scanningTips[startTipIndex]);

    // Rotate tips every 3 seconds
    const tipInterval = setInterval(() => {
      setTipIndex((prev) => {
        const nextIndex = (prev + 1) % scanningTips.length;
        setCurrentTip(scanningTips[nextIndex]);
        return nextIndex;
      });
    }, 3000);

    try {
      // Simulate step progress with enhanced details
      const simulateSteps = async () => {
        // Step 1: Validating ticker - quick
        await new Promise((r) => setTimeout(r, 300));
        setSteps((s) => [
          { ...s[0], status: "complete", detail: `${data.ticker.toUpperCase()} is valid` },
          { ...s[1], status: "loading" },
          s[2],
          s[3],
          s[4],
        ]);

        // Step 2: Fetching market data
        await new Promise((r) => setTimeout(r, 600));
        setSteps((s) => [
          s[0],
          { ...s[1], status: "complete", detail: "Retrieved price history and company data" },
          {
            ...s[2],
            status: "loading",
            subSteps: [
              { label: "Analyzing price patterns", status: "loading" },
              { label: "Checking volume anomalies", status: "pending" },
              { label: "Scanning for pump-and-dump signals", status: "pending" },
            ]
          },
          s[3],
          s[4],
        ]);

        // Step 3a: Price patterns
        await new Promise((r) => setTimeout(r, 400));
        setSteps((s) => [
          s[0],
          s[1],
          {
            ...s[2],
            status: "loading",
            subSteps: [
              { label: "Analyzing price patterns", status: "complete" },
              { label: "Checking volume anomalies", status: "loading" },
              { label: "Scanning for pump-and-dump signals", status: "pending" },
            ]
          },
          s[3],
          s[4],
        ]);

        // Step 3b: Volume anomalies
        await new Promise((r) => setTimeout(r, 350));
        setSteps((s) => [
          s[0],
          s[1],
          {
            ...s[2],
            status: "loading",
            subSteps: [
              { label: "Analyzing price patterns", status: "complete" },
              { label: "Checking volume anomalies", status: "complete" },
              { label: "Scanning for pump-and-dump signals", status: "loading" },
            ]
          },
          s[3],
          s[4],
        ]);

        // Step 3c: Pump-and-dump signals
        await new Promise((r) => setTimeout(r, 350));
        setSteps((s) => [
          s[0],
          s[1],
          {
            ...s[2],
            status: "complete",
            detail: "Risk patterns analyzed",
            subSteps: [
              { label: "Analyzing price patterns", status: "complete" },
              { label: "Checking volume anomalies", status: "complete" },
              { label: "Scanning for pump-and-dump signals", status: "complete" },
            ]
          },
          { ...s[3], status: "loading" },
          s[4],
        ]);

        // Step 4: Regulatory alerts
        await new Promise((r) => setTimeout(r, 300));
        setSteps((s) => [
          s[0],
          s[1],
          s[2],
          { ...s[3], status: "complete", detail: "SEC and alert databases checked" },
          { ...s[4], status: "loading" },
        ]);
      };

      const [response] = await Promise.all([
        fetch("/api/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: data.ticker,
            assetType: data.assetType,
            pitchText: data.pitchText,
            context: data.context,
          }),
        }),
        simulateSteps(),
      ]);

      // Complete final step
      setSteps((s) => [
        s[0],
        s[1],
        s[2],
        s[3],
        { ...s[4], status: "complete", detail: "Analysis complete" }
      ]);

      // Stop tip rotation
      clearInterval(tipInterval);

      const responseData = await response.json();

      if (response.status === 429) {
        setLimitReached(responseData as LimitReachedResponse);
        setUsage({
          plan: responseData.usage.plan,
          scansUsedThisMonth: responseData.usage.scansUsedThisMonth,
          scansLimitThisMonth: responseData.usage.scansLimitThisMonth,
          limitReached: true,
        });
      } else if (!response.ok) {
        setError(responseData.error || "An error occurred");
      } else {
        setResult(responseData as RiskResponse);
        setUsage(responseData.usage);
      }
    } catch (err) {
      clearInterval(tipInterval);
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
      setCurrentTip("");
    }
  };

  const handleNewScan = () => {
    setResult(null);
    setLimitReached(null);
    setError("");
    setCurrentTicker("");
  };

  const handleShare = async () => {
    if (result) {
      const shareText = `ScamDunk Analysis: ${result.stockSummary.ticker} - ${result.riskLevel} RISK (Score: ${result.totalScore})\n\nCheck your stocks for scam red flags at ScamDunk.`;
      const shareUrl = typeof window !== "undefined" ? window.location.href : "";

      // Try native share API first
      if (navigator.share) {
        try {
          await navigator.share({
            title: "ScamDunk Analysis",
            text: shareText,
            url: shareUrl,
          });
          addToast({
            type: "success",
            title: "Shared successfully",
          });
        } catch (err) {
          // User cancelled or share failed, fall back to clipboard
          if ((err as Error).name !== "AbortError") {
            await copyToClipboard(shareText);
          }
        }
      } else {
        // Fall back to clipboard copy
        await copyToClipboard(shareText);
      }
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast({
        type: "success",
        title: "Copied to clipboard",
        description: "Analysis summary copied. Paste to share with others.",
      });
    } catch (err) {
      addToast({
        type: "error",
        title: "Failed to copy",
        description: "Please try again or manually copy the results.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onNewScan={handleNewScan}
      />

      {/* Main Content */}
      <div className="flex flex-col min-h-screen">
        {/* Header */}
        <Header
          onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
          usage={usage}
          onShare={handleShare}
          showShare={!!result}
        />

        {/* Content Area */}
        <main className="flex-1 flex flex-col">
          {/* Show limit reached message */}
          {limitReached && (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="max-w-md w-full">
                <LimitReached
                  plan={limitReached.usage.plan}
                  scansUsed={limitReached.usage.scansUsedThisMonth}
                  scansLimit={limitReached.usage.scansLimitThisMonth}
                />
                <div className="mt-4 text-center">
                  <Button variant="outline" onClick={handleNewScan}>
                    Go back
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex-1 flex items-center justify-center p-4">
              <div className="max-w-lg w-full animate-fade-in">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
                    <div className="h-2 w-2 rounded-full gradient-brand animate-pulse" />
                    <span className="text-sm font-semibold text-primary">Scanning</span>
                  </div>
                  <h2 className="text-title mb-1">
                    Analyzing <span className="gradient-brand-text">{currentTicker.toUpperCase()}</span>
                  </h2>
                  <p className="text-sm text-muted-foreground">Running multi-layer risk detection</p>
                </div>
                <LoadingStepper steps={steps} currentTip={currentTip} />
              </div>
            </div>
          )}

          {/* Results */}
          {result && !isLoading && (
            <div className="flex-1 overflow-y-auto p-4 pb-32">
              <div className="max-w-3xl mx-auto space-y-6 animate-slide-up">
                <RiskCard result={result} />
                <div className="flex justify-center gap-3">
                  <Button variant="outline" onClick={handleNewScan} className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    Check another
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Welcome State (no result, not loading) */}
          {!result && !isLoading && !limitReached && (
            <div className="flex-1 flex flex-col items-center justify-center p-4 pb-32 gradient-mesh">
              <div className="text-center mb-10 animate-fade-in">
                {/* Brand icon */}
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-2xl gradient-brand flex items-center justify-center shadow-lg shadow-primary/25 animate-gentle-float">
                      <Shield className="h-8 w-8 text-white" strokeWidth={2} />
                    </div>
                    <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success flex items-center justify-center border-2 border-background">
                      <Eye className="h-2.5 w-2.5 text-white" />
                    </div>
                  </div>
                </div>

                {/* Headline */}
                <h1 className="text-hero-sm sm:text-hero mb-3 max-w-lg mx-auto">
                  {tagline.headline}
                </h1>
                <p className="text-subtitle text-muted-foreground max-w-md mx-auto leading-relaxed">
                  {tagline.subtext}
                </p>
              </div>

              {/* Error message */}
              {error && (
                <div className="mb-6 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm max-w-md text-center animate-fade-in">
                  <AlertTriangle className="h-4 w-4 inline mr-2" />
                  {error}
                </div>
              )}

              {/* Quick Examples for non-logged in users */}
              {!session && status !== "loading" && (
                <div className="mb-10 animate-fade-in" style={{ animationDelay: "0.1s" }}>
                  <p className="text-xs font-semibold text-muted-foreground text-center mb-3 uppercase tracking-wider">
                    Try it out
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full gap-1.5 px-4 hover:border-primary/30 hover:bg-primary/5"
                      onClick={() => handleSubmit({ ticker: "AAPL", assetType: "stock" })}
                    >
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                      AAPL
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full gap-1.5 px-4 hover:border-primary/30 hover:bg-primary/5"
                      onClick={() => handleSubmit({ ticker: "TSLA", assetType: "stock" })}
                    >
                      <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                      TSLA
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full gap-1.5 px-4 hover:border-primary/30 hover:bg-primary/5"
                      onClick={() => handleSubmit({ ticker: "BTC", assetType: "crypto" })}
                    >
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      BTC
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Features */}
              {!session && status !== "loading" && (
                <div className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: "0.2s" }}>
                  <div className="card-interactive p-5 text-center group">
                    <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-200">
                      <BarChart3 className="h-5 w-5 text-blue-500" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">Market Analysis</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Price, volume, and market cap signals
                    </p>
                  </div>
                  <div className="card-interactive p-5 text-center group">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-200">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">Red Flag Detection</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Pump-and-dump patterns identified
                    </p>
                  </div>
                  <div className="card-interactive p-5 text-center group">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-200">
                      <Brain className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">AI-Powered</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Smart analysis with suggestions
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Bottom Input Bar */}
        {!isLoading && !limitReached && (
          <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-10 pb-5 px-4">
            <ScanInput
              onSubmit={handleSubmit}
              isLoading={isLoading}
              disabled={usage?.limitReached && !result}
            />
          </div>
        )}
      </div>
    </div>
  );
}
