"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Shield, User, CreditCard, LogOut, Zap, Check, Loader2 } from "lucide-react";
import { UsageInfo } from "@/lib/types";

function AccountAlerts() {
  const searchParams = useSearchParams();
  const upgraded = searchParams.get("upgraded");
  const canceled = searchParams.get("canceled");

  return (
    <>
      {upgraded && (
        <Alert className="bg-green-50 border-green-200">
          <Check className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800">
            Welcome to ScamDunk Pro!
          </AlertTitle>
          <AlertDescription className="text-green-700">
            Your account has been upgraded. You now have 200 checks per
            month.
          </AlertDescription>
        </Alert>
      )}

      {canceled && (
        <Alert>
          <AlertTitle>Upgrade canceled</AlertTitle>
          <AlertDescription>
            No changes were made to your account.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}

function AccountContent() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/account");
    }
  }, [status, router]);

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

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    setError("");

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
      });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to start upgrade process");
        setIsUpgrading(false);
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      setIsUpgrading(false);
    }
  };

  const handleManageSubscription = async () => {
    setIsManaging(true);
    setError("");

    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });
      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Failed to open billing portal");
        setIsManaging(false);
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      setIsManaging(false);
    }
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
            <span className="text-xl sm:text-2xl font-bold">ScamDunk</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <span className="hidden sm:inline">New Scan</span>
                <span className="sm:hidden">Scan</span>
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
          <h1 className="text-2xl sm:text-3xl font-bold">Account</h1>

          {/* Success/Canceled alerts */}
          <Suspense fallback={null}>
            <AccountAlerts />
          </Suspense>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{session?.user?.email}</p>
              </div>
              {session?.user?.name && (
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{session.user.name}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Plan & Usage Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Plan & Usage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">Current Plan</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      variant={usage?.plan === "PAID" ? "default" : "secondary"}
                    >
                      {usage?.plan === "PAID" ? "Pro" : "Free"}
                    </Badge>
                  </div>
                </div>
                {usage?.plan === "FREE" && (
                  <Button onClick={handleUpgrade} disabled={isUpgrading} size="sm">
                    {isUpgrading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Zap className="mr-2 h-4 w-4" />
                        Upgrade to Pro
                      </>
                    )}
                  </Button>
                )}
              </div>

              <div>
                <p className="text-sm text-muted-foreground">
                  Checks Used This Month
                </p>
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">
                      {usage?.scansUsedThisMonth ?? 0} /{" "}
                      {usage?.scansLimitThisMonth ?? 5}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {usage?.scansLimitThisMonth &&
                        usage.scansUsedThisMonth !== undefined &&
                        Math.round(
                          (usage.scansUsedThisMonth /
                            usage.scansLimitThisMonth) *
                            100
                        )}
                      % used
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${
                          usage?.scansLimitThisMonth
                            ? Math.min(
                                ((usage.scansUsedThisMonth ?? 0) /
                                  usage.scansLimitThisMonth) *
                                  100,
                                100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Resets at the beginning of each month
                </p>
              </div>

              {usage?.plan === "PAID" && (
                <div className="pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={handleManageSubscription}
                    disabled={isManaging}
                  >
                    {isManaging ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Opening...
                      </>
                    ) : (
                      "Manage Subscription"
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upgrade CTA for free users */}
          {usage?.plan === "FREE" && (
            <Card className="border-primary bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Upgrade to Pro
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Get 200 stock checks per month and never worry about limits.
                </p>
                <ul className="text-sm space-y-2 mb-6">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    200 stock checks per month
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    Full risk analysis
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    Detailed red flag explanations
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    Priority support
                  </li>
                </ul>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <p className="text-2xl font-bold">
                    $9<span className="text-base font-normal">/month</span>
                  </p>
                  <Button onClick={handleUpgrade} disabled={isUpgrading} className="w-full sm:w-auto">
                    {isUpgrading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Upgrade Now"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AccountPage() {
  return <AccountContent />;
}
