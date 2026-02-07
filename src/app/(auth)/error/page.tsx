"use client";

import { Suspense } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, AlertTriangle } from "lucide-react";

function AuthErrorContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const error = searchParams.get("error");

    // Map NextAuth error codes to user-friendly messages
    const getErrorMessage = (errorCode: string | null): string => {
        switch (errorCode) {
            case "Configuration":
                return "There's a problem with the server configuration. Please try again later.";
            case "AccessDenied":
                return "Access denied. You don't have permission to access this resource.";
            case "Verification":
                return "The verification link has expired or has already been used.";
            case "OAuthSignin":
            case "OAuthCallback":
            case "OAuthCreateAccount":
            case "OAuthAccountNotLinked":
                return "There was a problem with the authentication provider. Please try again.";
            case "EmailCreateAccount":
                return "Could not create account with this email. Please try a different method.";
            case "Callback":
                return "There was a problem during the authentication process. Please try again.";
            case "CredentialsSignin":
                return "Invalid email or password. Please check your credentials and try again.";
            case "SessionRequired":
                return "You need to be logged in to access this page.";
            case "Default":
            default:
                return "An authentication error occurred. Please try again.";
        }
    };

    const errorMessage = getErrorMessage(error);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4">
            <Card className="w-full max-w-md border-border bg-card">
                <CardHeader className="text-center">
                    <Link href="/" className="flex items-center justify-center gap-2 mb-4">
                        <Shield className="h-8 w-8 text-primary" />
                        <span className="text-2xl font-bold">ScamDunk</span>
                    </Link>
                    <div className="flex justify-center mb-4">
                        <div className="p-3 rounded-full bg-destructive/10">
                            <AlertTriangle className="h-8 w-8 text-destructive" />
                        </div>
                    </div>
                    <CardTitle>Authentication Error</CardTitle>
                    <CardDescription>
                        Something went wrong during authentication
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Alert variant="destructive">
                        <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                    {error === "CredentialsSignin" && (
                        <p className="text-sm text-muted-foreground text-center">
                            Forgot your password?{" "}
                            <Link href="/forgot-password" className="text-primary hover:underline">
                                Reset it here
                            </Link>
                        </p>
                    )}
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                    <Button onClick={() => router.push("/login")} className="w-full">
                        Back to Login
                    </Button>
                    <p className="text-sm text-muted-foreground text-center">
                        Need help?{" "}
                        <a href="mailto:support@scamdunk.com" className="text-primary hover:underline">
                            Contact support
                        </a>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}

export default function AuthErrorPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="p-6 text-center">Loading...</div>
            </div>
        }>
            <AuthErrorContent />
        </Suspense>
    );
}
