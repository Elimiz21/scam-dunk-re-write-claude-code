"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { Loader2, Mail } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Turnstile } from "@/components/turnstile";
import { MIN_PASSWORD_LENGTH, validatePasswordStrength } from "@/lib/config";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileAvailable, setTurnstileAvailable] = useState(true);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Shared password policy (FE-M8) — also enforces complexity client-side.
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (!turnstileToken) {
      setError("Please complete CAPTCHA verification before signing up.");
      return;
    }

    setIsLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      // Register the user
      const registerResponse = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, turnstileToken }),
        signal: controller.signal,
      });

      const registerData = await registerResponse.json();

      if (!registerResponse.ok) {
        setError(registerData.error || "Registration failed");
        return;
      }

      // Show success state - user needs to verify email
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Signup timed out. Please try again.");
      } else {
        setError("An error occurred. Please try again.");
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  // Success state - show verification email sent message
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4">
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
            <CardDescription className="text-base mt-2">
              We&apos;ve sent a verification link to <strong>{email}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-xl bg-secondary/50">
              <h3 className="font-medium mb-2">Next steps:</h3>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>Check your email inbox (and spam folder)</li>
                <li>Click the verification link in the email</li>
                <li>Log in to start using ScamDunk</li>
              </ol>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Didn&apos;t receive the email?{" "}
              <Link
                href={`/check-email?email=${encodeURIComponent(email)}`}
                className="text-primary hover:underline"
              >
                Resend verification email
              </Link>
            </p>
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => router.push("/login")}
              variant="outline"
              className="w-full"
            >
              Go to login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4">
      <Card className="w-full max-w-md rounded-2xl border-border bg-card shadow-none">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <Logo size={56} href="/" />
          </div>
          <CardTitle className="font-editorial text-2xl font-light">
            Create your account
          </CardTitle>
          <CardDescription>
            Start checking stocks for red flags - 5 manual scan credits per month
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
                aria-describedby="name-hint"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                aria-required="true"
                aria-describedby="password-hint"
              />
              <p id="password-hint" className="text-xs text-muted-foreground">
                Must be at least {MIN_PASSWORD_LENGTH} characters, with
                uppercase, lowercase, and a number
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                aria-required="true"
              />
            </div>
            <Turnstile
              onVerify={(token) => {
                setError("");
                setTurnstileAvailable(true);
                handleTurnstileVerify(token);
              }}
              onError={() => {
                setTurnstileToken("");
                setTurnstileAvailable(true);
                setError("CAPTCHA verification failed. Please try again.");
              }}
              onExpire={() => {
                setTurnstileToken("");
                setError("CAPTCHA expired. Please verify again.");
              }}
              onUnavailable={() => {
                setTurnstileToken("");
                setTurnstileAvailable(false);
                setError(
                  "CAPTCHA is currently unavailable. Please refresh and try again.",
                );
              }}
            />
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !turnstileAvailable || !turnstileToken}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Sign up free"
              )}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Log in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
