"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, Check } from "lucide-react";
import { Logo } from "@/components/Logo";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const emailFromParams = searchParams.get("email") || "";

  const [email, setEmail] = useState(emailFromParams);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.error || "Failed to send verification email");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="w-full max-w-md rounded-2xl border-border bg-card shadow-none">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full border border-success/30 bg-success/10">
              <Check className="h-7 w-7 text-success" />
            </div>
          </div>
          <CardTitle className="font-editorial text-2xl font-light">
            Check your inbox
          </CardTitle>
          <CardDescription>
            If an account exists for {email}, we&apos;ve sent a new verification
            link.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            The link will expire in 24 hours. Check your spam folder if you
            don&apos;t see it.
          </p>
        </CardContent>
        <CardFooter>
          <Button onClick={() => router.push("/login")} className="w-full">
            Back to login
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md rounded-2xl border-border bg-card shadow-none">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 rounded-full border border-border bg-secondary">
            <Mail className="h-7 w-7 text-teal" />
          </div>
        </div>
        <CardTitle className="font-editorial text-2xl font-light">
          Resend verification email
        </CardTitle>
        <CardDescription>
          Enter your email address and we&apos;ll send you a new verification
          link
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleResendVerification}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send verification email"
            )}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Remember your password?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Log in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function CheckEmailPage() {
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
          <CheckEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
