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
import { Loader2, Check, XCircle, Mail } from "lucide-react";
import { Logo } from "@/components/Logo";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<
    "loading" | "success" | "error" | "no-token"
  >(token ? "loading" : "no-token");
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
      <Card className="w-full max-w-md rounded-2xl border-border bg-card shadow-none">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Loader2 className="h-10 w-10 text-teal animate-spin" />
          </div>
          <CardTitle className="font-editorial text-2xl font-light">
            Verifying your email...
          </CardTitle>
          <CardDescription>
            Please wait while we verify your email address
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status === "success") {
    return (
      <Card className="w-full max-w-md rounded-2xl border-border bg-card shadow-none">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full border border-success/30 bg-success/10">
              <Check className="h-7 w-7 text-success" />
            </div>
          </div>
          <CardTitle className="font-editorial text-2xl font-light">
            Email verified!
          </CardTitle>
          <CardDescription>
            Your email has been successfully verified. You can now log in to
            your account.
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
      <Card className="w-full max-w-md rounded-2xl border-border bg-card shadow-none">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full border border-destructive/30 bg-destructive/10">
              <XCircle className="h-7 w-7 text-destructive" />
            </div>
          </div>
          <CardTitle className="font-editorial text-2xl font-light">
            Verification failed
          </CardTitle>
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
    <Card className="w-full max-w-md rounded-2xl border-border bg-card shadow-none">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 rounded-full border border-border bg-secondary">
            <Mail className="h-7 w-7 text-teal" />
          </div>
        </div>
        <CardTitle className="font-editorial text-2xl font-light">
          Check your email
        </CardTitle>
        <CardDescription>
          We&apos;ve sent you a verification link. Please check your email inbox
          and click the link to verify your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-sm text-muted-foreground">
          Didn&apos;t receive the email? Check your spam folder or request a new
          verification link.
        </p>
      </CardContent>
      <CardFooter>
        <Button
          onClick={() => router.push("/login")}
          variant="outline"
          className="w-full"
        >
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
        <div className="flex items-center justify-center mb-8">
          <Logo size={56} href="/" />
        </div>
        <Suspense
          fallback={
            <Card className="w-full max-w-md rounded-2xl border-border bg-card shadow-none">
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
