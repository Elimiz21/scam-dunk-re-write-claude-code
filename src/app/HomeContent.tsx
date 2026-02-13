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
import { LandingOptionA } from "@/components/landing/LandingOptionA";
import { useToast } from "@/components/ui/toast";
import { Step } from "@/components/LoadingStepper";

// Scanning tips derived from taglines for rotation during analysis
const scanningTips = taglines.map(t => t.headline);

export default function HomeContent() {
  const { data: session, status } = useSession();
  const { addToast } = useToast();

  // Sidebar defaults closed for non-logged-in users (landing page)
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Open sidebar once session is confirmed
  useEffect(() => {
    if (session) setSidebarOpen(true);
  }, [session]);
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

  // Homepage hero content from admin DB
  const [heroContent, setHeroContent] = useState<{ headline?: string; subheadline?: string }>({});

  // Fetch landing page hero content
  useEffect(() => {
    if (!session) {
      fetch("/api/homepage")
        .then((res) => res.json())
        .then((data) => {
          if (!data.isDefault) {
            setHeroContent({ headline: data.headline, subheadline: data.subheadline });
          }
        })
        .catch(() => {});
    }
  }, [session]);

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
                  <h2 className="font-display text-title mb-1 italic">
                    Analyzing <span className="gradient-brand-text not-italic font-sans font-bold">{currentTicker.toUpperCase()}</span>
                  </h2>
                  <p className="text-sm text-muted-foreground">Running multi-layer risk detection</p>
                </div>
                <LoadingStepper steps={steps} currentTip={currentTip} />
              </div>
            </div>
          )}

          {/* Results */}
          {result && !isLoading && (
            <div className="flex-1 overflow-y-auto p-4 pb-8">
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
            <>
              {/* Logged-in users: simple welcome with ScanInput */}
              {session ? (
                <div className="flex-1 flex flex-col items-center p-4 pb-8 gradient-mesh overflow-y-auto">
                  <div className="text-center mb-8 mt-8 sm:mt-16 animate-fade-in">
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
                    <h1 className="font-display text-hero-sm sm:text-hero mb-4 max-w-xl mx-auto italic">
                      {tagline.headline}
                    </h1>
                    <p className="text-subtitle text-muted-foreground max-w-md mx-auto">
                      {tagline.subtext}
                    </p>
                  </div>

                  {error && (
                    <div className="mb-6 p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-sm max-w-md text-center animate-fade-in">
                      <AlertTriangle className="h-4 w-4 inline mr-2" />
                      {error}
                    </div>
                  )}

                  <div className="w-full max-w-3xl mx-auto mt-2 mb-12 animate-fade-in" style={{ animationDelay: "0.05s" }}>
                    <ScanInput
                      onSubmit={handleSubmit}
                      isLoading={isLoading}
                      disabled={usage?.limitReached && !result}
                    />
                  </div>
                </div>
              ) : status !== "loading" ? (
                <LandingOptionA
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                  disabled={usage?.limitReached && !result}
                  error={error}
                  headline={heroContent.headline}
                  subheadline={heroContent.subheadline}
                />
              ) : null}
            </>
          )}
        </main>

      </div>
    </div>
  );
}
