"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Shield,
  User,
  CreditCard,
  LogOut,
  Zap,
  Check,
  Loader2,
  Lock,
  Edit2,
  Eye,
  EyeOff,
  AlertTriangle,
  Calendar,
  XCircle,
} from "lucide-react";
import { UsageInfo } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { PayPalButton } from "@/components/PayPalButton";

interface SubscriptionInfo {
  plan: "FREE" | "PAID";
  subscriptionId?: string;
  status?: string;
  nextBillingDate?: string;
  startDate?: string;
}

function AccountAlerts() {
  const searchParams = useSearchParams();
  const upgraded = searchParams.get("upgraded");
  const canceled = searchParams.get("canceled");

  return (
    <>
      {upgraded && (
        <Alert className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
          <Check className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-800 dark:text-green-200">
            Welcome to ScamDunk Pro!
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            Your account has been upgraded. You now have 200 checks per month.
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
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const { addToast } = useToast();

  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [error, setError] = useState("");

  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password change
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Subscription management
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/account");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchUsage();
      fetchSubscriptionInfo();
      setEditName(session.user.name || "");
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

  const fetchSubscriptionInfo = async () => {
    setIsLoadingSubscription(true);
    try {
      const response = await fetch("/api/billing/paypal/subscription");
      if (response.ok) {
        const data = await response.json();
        setSubscriptionInfo(data);
      }
    } catch (err) {
      console.error("Failed to fetch subscription info:", err);
    } finally {
      setIsLoadingSubscription(false);
    }
  };

  const handleCancelSubscription = async () => {
    setIsCancelling(true);
    setError("");
    try {
      const response = await fetch("/api/billing/paypal/cancel", {
        method: "POST",
      });

      if (response.ok) {
        addToast({
          type: "success",
          title: "Subscription cancelled",
          description: "Your plan has been downgraded to Free. You can re-subscribe at any time.",
        });
        setShowCancelConfirm(false);
        // Refresh data
        await fetchUsage();
        await fetchSubscriptionInfo();
        // Trigger session refresh so the plan badge updates
        await update({});
        router.refresh();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to cancel subscription");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handlePayPalSuccess = () => {
    // Refresh usage and subscription data
    fetchUsage();
    fetchSubscriptionInfo();
    // Show success message
    addToast({
      type: "success",
      title: "Subscription activated!",
      description: "Welcome to ScamDunk Pro. You now have 200 checks per month.",
    });
    // Refresh the page to update UI
    router.refresh();
  };

  const handlePayPalError = (error: string) => {
    setError(`Payment failed: ${error}`);
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    setError("");

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        // Update session with new name
        await update({ name: editName.trim() });
        setIsEditingProfile(false);
        addToast({
          type: "success",
          title: "Profile updated",
          description: "Your profile has been updated successfully.",
        });
      } else {
        setError(data.error || "Failed to update profile");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError("");

    if (newPassword !== confirmNewPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }

    setIsSavingPassword(true);

    try {
      const response = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsChangingPassword(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
        addToast({
          type: "success",
          title: "Password changed",
          description: "Your password has been updated successfully.",
        });
      } else {
        setPasswordError(data.error || "Failed to change password");
      }
    } catch {
      setPasswordError("An error occurred. Please try again.");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleCancelProfileEdit = () => {
    setIsEditingProfile(false);
    setEditName(session?.user?.name || "");
  };

  const handleCancelPasswordChange = () => {
    setIsChangingPassword(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordError("");
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
            <span className="text-xl sm:text-2xl font-bold font-display italic">ScamDunk</span>
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
          <h1 className="text-2xl sm:text-3xl font-bold font-display italic">Account Settings</h1>

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
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile
                </CardTitle>
                {!isEditingProfile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingProfile(true)}
                  >
                    <Edit2 className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditingProfile ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Enter your name"
                      disabled={isSavingProfile}
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Email</Label>
                    <p className="text-sm mt-1">{session?.user?.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Email cannot be changed
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSaveProfile}
                      disabled={isSavingProfile}
                      size="sm"
                    >
                      {isSavingProfile ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Save
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCancelProfileEdit}
                      disabled={isSavingProfile}
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-medium">
                      {session?.user?.name || "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{session?.user?.email}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Security Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Security
                </CardTitle>
                {!isChangingPassword && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsChangingPassword(true)}
                  >
                    Change Password
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isChangingPassword ? (
                <div className="space-y-4">
                  {passwordError && (
                    <Alert variant="destructive">
                      <AlertDescription>{passwordError}</AlertDescription>
                    </Alert>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        disabled={isSavingPassword}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        disabled={isSavingPassword}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showNewPassword ? "Hide password" : "Show password"}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Must be at least 8 characters
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
                    <Input
                      id="confirmNewPassword"
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Confirm new password"
                      disabled={isSavingPassword}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleChangePassword}
                      disabled={isSavingPassword || !currentPassword || !newPassword || !confirmNewPassword}
                      size="sm"
                    >
                      {isSavingPassword ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Changing...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Change Password
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCancelPasswordChange}
                      disabled={isSavingPassword}
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">Password</p>
                  <p className="font-medium">••••••••</p>
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
                    {usage?.plan === "PAID" && (
                      <span className="text-sm text-muted-foreground">$4.99/month</span>
                    )}
                  </div>
                </div>
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

              {/* Subscription details for PAID users */}
              {usage?.plan === "PAID" && (
                <div className="pt-4 border-t space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Subscription Details</p>
                    {isLoadingSubscription ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading subscription info...
                      </div>
                    ) : subscriptionInfo?.nextBillingDate ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        Next billing date:{" "}
                        {new Date(subscriptionInfo.nextBillingDate).toLocaleDateString(
                          "en-US",
                          { year: "numeric", month: "long", day: "numeric" }
                        )}
                      </div>
                    ) : subscriptionInfo?.subscriptionId ? (
                      <p className="text-sm text-muted-foreground">
                        Subscription active via PayPal
                      </p>
                    ) : null}
                  </div>

                  {/* Cancel subscription */}
                  {!showCancelConfirm ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => setShowCancelConfirm(true)}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel Subscription
                    </Button>
                  ) : (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Cancel your Pro subscription?</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Your plan will be downgraded to Free immediately. You will
                            lose access to 200 monthly checks and be limited to 5 checks
                            per month. You can re-subscribe at any time.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-7">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleCancelSubscription}
                          disabled={isCancelling}
                        >
                          {isCancelling ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Cancelling...
                            </>
                          ) : (
                            "Yes, Cancel Subscription"
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCancelConfirm(false)}
                          disabled={isCancelling}
                        >
                          Keep Subscription
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upgrade CTA for free users */}
          {usage?.plan === "FREE" && (
            <Card className="border-primary gradient-brand-subtle">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display italic">
                  <span className="inline-flex items-center justify-center w-8 h-8 gradient-brand rounded-2xl"><Zap className="h-4 w-4 text-white" /></span>
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
                <div className="flex flex-col gap-3">
                  <p className="text-2xl font-bold">
                    $4.99<span className="text-base font-normal">/month</span>
                  </p>
                  <PayPalButton
                    onSuccess={handlePayPalSuccess}
                    onError={handlePayPalError}
                  />
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
