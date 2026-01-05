"use client";

import { useState } from "react";
import { Shield, TrendingUp, AlertTriangle, Zap, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

// New styled components for preview
const GradientText = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <span className={`bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent ${className}`}>
    {children}
  </span>
);

const GlowInput = ({ placeholder }: { placeholder: string }) => (
  <input
    type="text"
    placeholder={placeholder}
    className="w-full h-11 px-4 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground transition-all duration-200 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20"
  />
);

const LiftCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`p-6 rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-blue-500/20 ${className}`}>
    {children}
  </div>
);

const RiskGauge = ({ score, maxScore = 100 }: { score: number; maxScore?: number }) => {
  const percentage = (score / maxScore) * 100;
  const angle = (percentage / 100) * 180 - 90; // -90 to 90 degrees

  const getColor = () => {
    if (percentage < 33) return "#22C55E";
    if (percentage < 66) return "#F59E0B";
    return "#EF4444";
  };

  return (
    <div className="relative w-40 h-24">
      {/* Background arc */}
      <svg viewBox="0 0 100 50" className="w-full h-full">
        <path
          d="M 5 50 A 45 45 0 0 1 95 50"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted"
        />
        {/* Colored arc */}
        <path
          d="M 5 50 A 45 45 0 0 1 95 50"
          fill="none"
          stroke={getColor()}
          strokeWidth="8"
          strokeDasharray={`${percentage * 1.41} 141`}
          className="transition-all duration-1000"
        />
      </svg>
      {/* Needle */}
      <div
        className="absolute bottom-0 left-1/2 w-1 h-12 bg-foreground origin-bottom transition-transform duration-1000"
        style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
      />
      {/* Center dot */}
      <div className="absolute bottom-0 left-1/2 w-3 h-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-foreground" />
      {/* Labels */}
      <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-xs text-muted-foreground px-2">
        <span>LOW</span>
        <span>MED</span>
        <span>HIGH</span>
      </div>
    </div>
  );
};

const SocialProofBadge = ({ count }: { count: number }) => (
  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20">
    <Check className="h-4 w-4 text-green-500" />
    <span className="text-sm font-medium text-green-600 dark:text-green-400">
      {count.toLocaleString()} scans performed
    </span>
  </div>
);

export default function DesignPreviewPage() {
  const [activeSection, setActiveSection] = useState<string | null>("hero");

  const sections = [
    { id: "hero", label: "Hero Section" },
    { id: "cards", label: "Feature Cards" },
    { id: "input", label: "Input Bar" },
    { id: "buttons", label: "Buttons" },
    { id: "badges", label: "Risk Badges" },
    { id: "gauge", label: "Risk Gauge" },
    { id: "typography", label: "Typography" },
    { id: "colors", label: "Colors" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-500" />
            <span className="font-bold">Design Preview</span>
          </div>
          <Badge variant="outline">Development Only</Badge>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Navigation */}
        <nav className="mb-8 flex flex-wrap gap-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeSection === section.id
                  ? "bg-blue-500 text-white"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {section.label}
            </button>
          ))}
        </nav>

        {/* Hero Section */}
        {(activeSection === "hero" || activeSection === null) && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <ChevronRight className="h-5 w-5" />
              Hero Section
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Current */}
              <div className="space-y-4">
                <Badge variant="outline" className="mb-2">Current</Badge>
                <div className="p-8 rounded-xl border border-border bg-card text-center">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 rounded-2xl bg-secondary">
                      <Shield className="h-12 w-12 text-primary" />
                    </div>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                    Don't Get Dunked On
                  </h1>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Check any stock or crypto for scam red flags before you invest
                  </p>
                </div>
              </div>

              {/* New */}
              <div className="space-y-4">
                <Badge className="mb-2 bg-blue-500">New Design</Badge>
                <div className="p-8 rounded-xl border border-border bg-card text-center">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/30">
                      <Shield className="h-12 w-12 text-white" />
                    </div>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold mb-2">
                    <GradientText>Don't Get Dunked On</GradientText>
                  </h1>
                  <p className="text-muted-foreground max-w-md mx-auto mb-4">
                    Check any stock or crypto for scam red flags before you invest
                  </p>
                  <SocialProofBadge count={12847} />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Feature Cards */}
        {(activeSection === "cards" || activeSection === null) && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <ChevronRight className="h-5 w-5" />
              Feature Cards
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Current */}
              <div className="space-y-4">
                <Badge variant="outline" className="mb-2">Current</Badge>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-card border border-border text-center">
                    <TrendingUp className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                    <h3 className="font-medium text-sm mb-1">Market Analysis</h3>
                    <p className="text-xs text-muted-foreground">Price, volume signals</p>
                  </div>
                  <div className="p-4 rounded-xl bg-card border border-border text-center">
                    <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-orange-500" />
                    <h3 className="font-medium text-sm mb-1">Red Flags</h3>
                    <p className="text-xs text-muted-foreground">Pump-dump patterns</p>
                  </div>
                  <div className="p-4 rounded-xl bg-card border border-border text-center">
                    <Shield className="h-6 w-6 mx-auto mb-2 text-green-500" />
                    <h3 className="font-medium text-sm mb-1">AI-Powered</h3>
                    <p className="text-xs text-muted-foreground">Smart analysis</p>
                  </div>
                </div>
              </div>

              {/* New */}
              <div className="space-y-4">
                <Badge className="mb-2 bg-blue-500">New Design</Badge>
                <div className="grid grid-cols-3 gap-4">
                  <LiftCard className="text-center cursor-pointer">
                    <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-blue-500" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">Market Analysis</h3>
                    <p className="text-xs text-muted-foreground">Price, volume signals</p>
                  </LiftCard>
                  <LiftCard className="text-center cursor-pointer">
                    <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-orange-500/10 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-orange-500" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">Red Flags</h3>
                    <p className="text-xs text-muted-foreground">Pump-dump patterns</p>
                  </LiftCard>
                  <LiftCard className="text-center cursor-pointer">
                    <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-green-500/10 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-green-500" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">AI-Powered</h3>
                    <p className="text-xs text-muted-foreground">Smart analysis</p>
                  </LiftCard>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Input Bar */}
        {(activeSection === "input" || activeSection === null) && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <ChevronRight className="h-5 w-5" />
              Input Bar
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Current */}
              <div className="space-y-4">
                <Badge variant="outline" className="mb-2">Current</Badge>
                <div className="p-4 rounded-2xl border border-border bg-card">
                  <div className="flex gap-2">
                    <Input placeholder="Enter ticker symbol..." className="flex-1" />
                    <Button>Check</Button>
                  </div>
                </div>
              </div>

              {/* New */}
              <div className="space-y-4">
                <Badge className="mb-2 bg-blue-500">New Design</Badge>
                <div className="p-2 rounded-2xl border border-border bg-card shadow-lg">
                  <div className="flex gap-2">
                    <GlowInput placeholder="Enter ticker symbol..." />
                    <button className="px-6 py-2 rounded-xl bg-blue-500 text-white font-medium transition-all duration-200 hover:bg-blue-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/25 active:translate-y-0">
                      Check
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Click in the input to see the glow effect</p>
              </div>
            </div>
          </section>
        )}

        {/* Buttons */}
        {(activeSection === "buttons" || activeSection === null) && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <ChevronRight className="h-5 w-5" />
              Buttons
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Current */}
              <div className="space-y-4">
                <Badge variant="outline" className="mb-2">Current</Badge>
                <div className="flex flex-wrap gap-3">
                  <Button>Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Destructive</Button>
                </div>
              </div>

              {/* New */}
              <div className="space-y-4">
                <Badge className="mb-2 bg-blue-500">New Design</Badge>
                <div className="flex flex-wrap gap-3">
                  <button className="px-4 py-2 rounded-lg bg-blue-500 text-white font-medium transition-all duration-200 hover:bg-blue-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/25 active:translate-y-0 active:shadow-none">
                    Primary
                  </button>
                  <button className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground font-medium transition-all duration-200 hover:bg-secondary/80 hover:-translate-y-0.5 active:translate-y-0">
                    Secondary
                  </button>
                  <button className="px-4 py-2 rounded-lg border border-border bg-transparent font-medium transition-all duration-200 hover:bg-muted hover:-translate-y-0.5 active:translate-y-0">
                    Outline
                  </button>
                  <button className="px-4 py-2 rounded-lg bg-transparent text-muted-foreground font-medium transition-all duration-200 hover:bg-muted hover:text-foreground active:bg-muted/80">
                    Ghost
                  </button>
                  <button className="px-4 py-2 rounded-lg bg-red-500 text-white font-medium transition-all duration-200 hover:bg-red-600 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-red-500/25 active:translate-y-0">
                    Destructive
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Hover to see lift effect and shadows</p>
              </div>
            </div>
          </section>
        )}

        {/* Risk Badges */}
        {(activeSection === "badges" || activeSection === null) && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <ChevronRight className="h-5 w-5" />
              Risk Badges
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Current */}
              <div className="space-y-4">
                <Badge variant="outline" className="mb-2">Current</Badge>
                <div className="flex flex-wrap gap-3">
                  <Badge className="bg-risk-low text-white">LOW RISK</Badge>
                  <Badge className="bg-risk-medium text-white">MEDIUM RISK</Badge>
                  <Badge className="bg-risk-high text-white">HIGH RISK</Badge>
                  <Badge className="bg-risk-insufficient text-white">INSUFFICIENT</Badge>
                </div>
              </div>

              {/* New */}
              <div className="space-y-4">
                <Badge className="mb-2 bg-blue-500">New Design</Badge>
                <div className="flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 border border-green-200 dark:border-green-500/30">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Low Risk
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Medium Risk
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border border-red-200 dark:border-red-500/30 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    High Risk
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border border-gray-200 dark:border-gray-500/30">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    Insufficient
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Note the pulse animation on LOW and HIGH risk badges</p>
              </div>
            </div>
          </section>
        )}

        {/* Risk Gauge */}
        {(activeSection === "gauge" || activeSection === null) && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <ChevronRight className="h-5 w-5" />
              Risk Gauge (New Component)
            </h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="p-6 rounded-xl border border-border bg-card text-center">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Low Risk (15/100)</h3>
                <div className="flex justify-center">
                  <RiskGauge score={15} />
                </div>
              </div>
              <div className="p-6 rounded-xl border border-border bg-card text-center">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Medium Risk (52/100)</h3>
                <div className="flex justify-center">
                  <RiskGauge score={52} />
                </div>
              </div>
              <div className="p-6 rounded-xl border border-border bg-card text-center">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">High Risk (85/100)</h3>
                <div className="flex justify-center">
                  <RiskGauge score={85} />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Typography */}
        {(activeSection === "typography" || activeSection === null) && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <ChevronRight className="h-5 w-5" />
              Typography
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Current */}
              <div className="space-y-4">
                <Badge variant="outline" className="mb-2">Current (System Fonts)</Badge>
                <div className="p-6 rounded-xl border border-border bg-card space-y-4">
                  <h1 className="text-3xl font-bold">Heading 1</h1>
                  <h2 className="text-2xl font-semibold">Heading 2</h2>
                  <h3 className="text-xl font-medium">Heading 3</h3>
                  <p className="text-base">Body text - The quick brown fox jumps over the lazy dog.</p>
                  <p className="text-sm text-muted-foreground">Small text - Secondary information</p>
                </div>
              </div>

              {/* New */}
              <div className="space-y-4">
                <Badge className="mb-2 bg-blue-500">New Design (Custom Fonts)</Badge>
                <div className="p-6 rounded-xl border border-border bg-card space-y-4">
                  <h1 className="text-4xl font-extrabold tracking-tight">
                    <GradientText>Heading 1</GradientText>
                  </h1>
                  <h2 className="text-2xl font-bold">Heading 2</h2>
                  <h3 className="text-xl font-semibold">Heading 3</h3>
                  <p className="text-base leading-relaxed">Body text - The quick brown fox jumps over the lazy dog.</p>
                  <p className="text-sm text-muted-foreground">Small text - Secondary information</p>
                </div>
                <p className="text-xs text-muted-foreground">Recommend: Plus Jakarta Sans for headings, Inter for body</p>
              </div>
            </div>
          </section>
        )}

        {/* Colors */}
        {(activeSection === "colors" || activeSection === null) && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <ChevronRight className="h-5 w-5" />
              Brand Colors
            </h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-3">Proposed Primary Color</h3>
                <div className="flex gap-2">
                  <div className="w-20 h-20 rounded-xl bg-blue-400 flex items-center justify-center text-white text-xs font-medium">400</div>
                  <div className="w-20 h-20 rounded-xl bg-blue-500 flex items-center justify-center text-white text-xs font-medium">500</div>
                  <div className="w-20 h-20 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xs font-medium">600</div>
                  <div className="w-20 h-20 rounded-xl bg-blue-700 flex items-center justify-center text-white text-xs font-medium">700</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Electric Blue (#3B82F6) - Trust, technology, security</p>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3">Risk Colors</h3>
                <div className="flex gap-2">
                  <div className="w-20 h-20 rounded-xl bg-green-500 flex items-center justify-center text-white text-xs font-medium">Low</div>
                  <div className="w-20 h-20 rounded-xl bg-amber-500 flex items-center justify-center text-white text-xs font-medium">Medium</div>
                  <div className="w-20 h-20 rounded-xl bg-red-500 flex items-center justify-center text-white text-xs font-medium">High</div>
                  <div className="w-20 h-20 rounded-xl bg-gray-500 flex items-center justify-center text-white text-xs font-medium">N/A</div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3">Gradient Options</h3>
                <div className="flex gap-2">
                  <div className="w-32 h-20 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs font-medium">Blue → Cyan</div>
                  <div className="w-32 h-20 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center text-white text-xs font-medium">Blue → Purple</div>
                  <div className="w-32 h-20 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 flex items-center justify-center text-white text-xs font-medium">Emerald → Cyan</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          <p>This is a development preview page. Not visible in production.</p>
          <p className="mt-2">
            <a href="/docs/DESIGN-RECOMMENDATIONS.md" className="text-blue-500 hover:underline">
              View full design recommendations →
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
