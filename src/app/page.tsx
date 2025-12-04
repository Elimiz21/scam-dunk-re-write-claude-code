"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, TrendingUp, Users, Loader2, Check } from "lucide-react";

export default function LandingPage() {
  const { data: session, status } = useSession();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
            <span className="text-xl sm:text-2xl font-bold">ScamDunk</span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-4">
            {status === "loading" ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : session ? (
              <>
                <Link href="/check">
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex">Check Stock</Button>
                  <Button variant="ghost" size="sm" className="sm:hidden">Check</Button>
                </Link>
                <Link href="/account">
                  <Button variant="outline" size="sm">Account</Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm">Log in</Button>
                </Link>
                <Link href="/signup">
                  <Button size="sm">Sign up</Button>
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12 sm:py-20 text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 sm:mb-6">
          Got a stock tip?
          <br />
          <span className="text-primary">Check it for red flags.</span>
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-6 sm:mb-8 px-2">
          Paste the stock ticker and the pitch you received. ScamDunk highlights
          potential scam patterns so you can make informed decisions.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
          {session ? (
            <Link href="/check">
              <Button size="lg" className="px-8 w-full sm:w-auto">
                Check a stock now
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/signup" className="w-full sm:w-auto">
                <Button size="lg" className="px-8 w-full">
                  Try free (5 checks/month)
                </Button>
              </Link>
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full">
                  Log in
                </Button>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-12 sm:py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">How it works</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-3">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <CardTitle className="text-lg">Enter the stock</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Type the US stock ticker you received a tip about. We check
                price, volume, market cap, and exchange data.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle className="text-lg">Paste the pitch</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Copy-paste the message from WhatsApp, Telegram, email, or
                wherever you received the stock tip.
              </p>
            </CardContent>
          </Card>

          <Card className="sm:col-span-2 md:col-span-1">
            <CardHeader>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-orange-100 mb-3">
                <AlertTriangle className="h-6 w-6 text-orange-600" />
              </div>
              <CardTitle className="text-lg">See red flags</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Get an instant risk assessment: LOW, MEDIUM, or HIGH, with
                specific red flags and what to watch out for.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* What We Check */}
      <section className="bg-gray-50 py-12 sm:py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">
            What we look for
          </h2>
          <div className="grid sm:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  Stock & Market Signals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Penny stocks (price under $5)
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Small market cap (under $300M)
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Low liquidity / trading volume
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    OTC / Pink Sheet listings
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Recent price spikes (50%+ in 7 days)
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Pump-and-dump patterns
                  </li>
                </ul>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Users className="h-5 w-5 text-orange-500" />
                  Pitch & Behavior Patterns
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Unsolicited stock tips
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Guaranteed or high return promises
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Time pressure / urgency tactics
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Claims of secret or insider info
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Specific % gains in timeframes
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    Get-rich-quick language
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="container mx-auto px-4 py-12 sm:py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">Simple pricing</h2>
        <div className="grid sm:grid-cols-2 gap-6 sm:gap-8 max-w-3xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Free</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl sm:text-4xl font-bold mb-4">$0</p>
              <ul className="space-y-3 text-sm text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  5 stock checks per month
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Full risk analysis
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Red flag explanations
                </li>
              </ul>
              <Link href="/signup">
                <Button variant="outline" className="w-full">
                  Get started free
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-primary border-2 relative">
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</Badge>
            <CardHeader>
              <CardTitle className="text-lg">Pro</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl sm:text-4xl font-bold mb-4">
                $9<span className="text-base sm:text-lg font-normal text-muted-foreground">/month</span>
              </p>
              <ul className="space-y-3 text-sm text-muted-foreground mb-6">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <strong className="text-foreground">200</strong> stock checks per month
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Full risk analysis
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Red flag explanations
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  Priority support
                </li>
              </ul>
              <Link href="/signup">
                <Button className="w-full">Upgrade to Pro</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="bg-gray-100 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p className="max-w-2xl mx-auto">
            <strong>Disclaimer:</strong> ScamDunk provides informational risk
            analysis only. It does not provide financial advice, buy/sell
            recommendations, or guarantee the safety of any investment. Always
            do your own research and consult a licensed financial advisor.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} ScamDunk. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
