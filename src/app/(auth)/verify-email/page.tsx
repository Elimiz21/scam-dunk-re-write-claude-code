"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Shield, Loader2, Check, XCircle, Mail } from "lucide-react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "no-token">(
    token ? "loading" : "no-token"
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) return;

    const verifyEmail = async () => {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok) {
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMessage(data.error || "Verification failed");
        }
      } catch {
        setStatus("error");
        setErrorMessage("An error occurred during verification");
      }
    };

    verifyEmail();
  }, [token]);

  if (status === "loading") {
    return (
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
          </div>
          <CardTitle>Verifying your email...</CardTitle>
          <CardDescription>
            Please wait while we verify your email address
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status === "success") {
    return (
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <CardTitle>Email verified!</CardTitle>
          <CardDescription>
            Your email has been successfully verified. You can now log in to your account.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => router.push("/login")} className="w-full">
            Continue to login
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30">
              <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <CardTitle>Verification failed</CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            The verification link may have expired or already been used.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button onClick={() => router.push("/login")} className="w-full">
            Go to login
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Need a new verification link?{" "}
            <Link href="/check-email" className="text-primary hover:underline">
              Request one here
            </Link>
          </p>
        </CardFooter>
      </Card>
    );
  }

  // No token provided
  return (
    <Card className="w-full max-w-md border-border bg-card">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
            <Mail className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
          </div>
        </div>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We&apos;ve sent you a verification link. Please check your email inbox and click the link to verify your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-sm text-muted-foreground">
          Didn&apos;t receive the email? Check your spam folder or request a new verification link.
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={() => router.push("/login")} variant="outline" className="w-full">
          Back to login
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Shield className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold">ScamDunk</span>
        </div>
        <Suspense
          fallback={
            <Card className="w-full max-w-md border-border bg-card">
              <CardHeader className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              </CardHeader>
            </Card>
          }
        >
          <VerifyEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
