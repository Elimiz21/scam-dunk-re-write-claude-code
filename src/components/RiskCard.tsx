"use client";

import { RiskResponse, RiskLevel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  STOCK_SUMMARY_TERMS,
  RISK_LEVEL_TERMS,
  STRUCTURAL_SIGNAL_TERMS,
  PATTERN_SIGNAL_TERMS,
  ANOMALY_SIGNAL_TERMS,
  BEHAVIORAL_SIGNAL_TERMS,
} from "@/lib/glossary";
import {
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Users,
  Lightbulb,
  Info,
  Shield,
  BarChart3,
  MessageSquareOff,
} from "lucide-react";
import { formatNumber, formatPrice } from "@/lib/utils";

interface RiskCardProps {
  result: RiskResponse;
  hasChatData?: boolean;
}

function getRiskBadgeVariant(
  level: RiskLevel
): "low" | "medium" | "high" | "insufficient" {
  switch (level) {
    case "LOW":
      return "low";
    case "MEDIUM":
      return "medium";
    case "HIGH":
      return "high";
    case "INSUFFICIENT":
      return "insufficient";
  }
}

function getRiskIcon(level: RiskLevel) {
  const iconClasses = "h-5 w-5";
  switch (level) {
    case "LOW":
      return <CheckCircle className={`${iconClasses} text-emerald-500`} />;
    case "MEDIUM":
      return <AlertCircle className={`${iconClasses} text-amber-500`} />;
    case "HIGH":
      return <AlertTriangle className={`${iconClasses} text-red-500`} />;
    case "INSUFFICIENT":
      return <HelpCircle className={`${iconClasses} text-gray-400`} />;
  }
}

function getRiskFullBorderClass(level: RiskLevel) {
  switch (level) {
    case "LOW":
      return "risk-border-full-low";
    case "MEDIUM":
      return "risk-border-full-medium";
    case "HIGH":
      return "risk-border-full-high";
    case "INSUFFICIENT":
      return "risk-border-full-insufficient";
  }
}

function getRiskTickerClass(level: RiskLevel) {
  switch (level) {
    case "LOW":
      return "risk-ticker-low";
    case "MEDIUM":
      return "risk-ticker-medium";
    case "HIGH":
      return "risk-ticker-high";
    case "INSUFFICIENT":
      return "risk-ticker-insufficient";
  }
}

function getRiskGlowClass(level: RiskLevel) {
  switch (level) {
    case "LOW":
      return "risk-glow-low";
    case "MEDIUM":
      return "risk-glow-medium";
    case "HIGH":
      return "risk-glow-high";
    default:
      return "";
  }
}

function getRiskNarrativeClass(level: RiskLevel) {
  switch (level) {
    case "LOW":
      return "border-l-emerald-500/60 bg-emerald-500/5";
    case "MEDIUM":
      return "border-l-amber-500/60 bg-amber-500/5";
    case "HIGH":
      return "border-l-red-500/60 bg-red-500/5";
    case "INSUFFICIENT":
      return "border-l-gray-400/60 bg-gray-500/5";
  }
}

/**
 * Technical term patterns and their associated glossary definitions
 */
const TECHNICAL_TERM_PATTERNS = [
  { pattern: /penny stock/i, glossary: STRUCTURAL_SIGNAL_TERMS.pennyStock },
  { pattern: /market cap/i, glossary: STRUCTURAL_SIGNAL_TERMS.smallMarketCap },
  { pattern: /liquidity/i, glossary: STRUCTURAL_SIGNAL_TERMS.microLiquidity },
  { pattern: /OTC market/i, glossary: STRUCTURAL_SIGNAL_TERMS.otcMarket },
  { pattern: /OTC/i, glossary: STRUCTURAL_SIGNAL_TERMS.otcMarket },
  { pattern: /over-the-counter/i, glossary: STRUCTURAL_SIGNAL_TERMS.otcMarket },
  { pattern: /price spike/i, glossary: PATTERN_SIGNAL_TERMS.priceSpike },
  { pattern: /volume explosion/i, glossary: PATTERN_SIGNAL_TERMS.volumeExplosion },
  { pattern: /pump.?and.?dump/i, glossary: PATTERN_SIGNAL_TERMS.pumpAndDump },
  { pattern: /pump pattern/i, glossary: PATTERN_SIGNAL_TERMS.pumpAndDump },
  { pattern: /spike.+drop/i, glossary: PATTERN_SIGNAL_TERMS.spikeThenDrop },
  { pattern: /price anomaly/i, glossary: ANOMALY_SIGNAL_TERMS.priceAnomaly },
  { pattern: /volume anomaly/i, glossary: ANOMALY_SIGNAL_TERMS.volumeAnomaly },
  { pattern: /RSI/i, glossary: ANOMALY_SIGNAL_TERMS.rsi },
  { pattern: /overbought/i, glossary: ANOMALY_SIGNAL_TERMS.overbought },
  { pattern: /volatility/i, glossary: ANOMALY_SIGNAL_TERMS.volatility },
  { pattern: /extreme surge/i, glossary: ANOMALY_SIGNAL_TERMS.extremeSurge },
  { pattern: /statistically/i, glossary: ANOMALY_SIGNAL_TERMS.zScore },
  { pattern: /unsolicited/i, glossary: BEHAVIORAL_SIGNAL_TERMS.unsolicited },
  { pattern: /guaranteed return/i, glossary: BEHAVIORAL_SIGNAL_TERMS.promisedReturns },
  { pattern: /promise.+return/i, glossary: BEHAVIORAL_SIGNAL_TERMS.promisedReturns },
  { pattern: /urgency/i, glossary: BEHAVIORAL_SIGNAL_TERMS.urgencyPressure },
  { pattern: /time pressure/i, glossary: BEHAVIORAL_SIGNAL_TERMS.urgencyPressure },
  { pattern: /insider/i, glossary: BEHAVIORAL_SIGNAL_TERMS.secrecyInsider },
  { pattern: /secret/i, glossary: BEHAVIORAL_SIGNAL_TERMS.secrecyInsider },
  { pattern: /specific.+return/i, glossary: BEHAVIORAL_SIGNAL_TERMS.specificReturnClaim },
  { pattern: /percentage gain/i, glossary: BEHAVIORAL_SIGNAL_TERMS.specificReturnClaim },
];

function findTechnicalTerm(text: string): { term: string; definition: string } | null {
  for (const { pattern, glossary } of TECHNICAL_TERM_PATTERNS) {
    if (pattern.test(text)) {
      return { term: glossary.term, definition: glossary.definition };
    }
  }
  return null;
}

function FlagItem({
  flag,
  isPositive,
  iconColor,
}: {
  flag: string;
  isPositive: boolean;
  iconColor: "green" | "orange" | "red" | "blue";
}) {
  const technicalTerm = findTechnicalTerm(flag);

  const iconClasses = {
    green: "text-emerald-500",
    orange: "text-amber-500",
    red: "text-red-500",
    blue: "text-primary",
  };

  const IconComponent = isPositive ? CheckCircle : iconColor === "red" ? AlertCircle : AlertTriangle;

  return (
    <li className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed">
      <IconComponent
        className={`h-4 w-4 ${iconClasses[iconColor]} mt-0.5 flex-shrink-0`}
      />
      <span className="inline-flex items-start flex-wrap">
        {flag}
        {technicalTerm && (
          <InfoTooltip term={technicalTerm.term} definition={technicalTerm.definition} />
        )}
      </span>
    </li>
  );
}

export function RiskCard({ result, hasChatData = true }: RiskCardProps) {
  const { riskLevel, totalScore, signals, stockSummary, narrative } = result;

  return (
    <Card className={`w-full card-elevated overflow-hidden ${getRiskFullBorderClass(riskLevel)} ${getRiskGlowClass(riskLevel)}`}>
      {/* Header with Risk Level */}
      <CardHeader className="pb-3">
        {/* Top row: badge + score on left, ticker + company on right */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {getRiskIcon(riskLevel)}
            <Badge variant={getRiskBadgeVariant(riskLevel)} className="text-xs">
              {riskLevel} RISK
            </Badge>
            <span className="text-sm text-muted-foreground inline-flex items-center gap-1 font-medium">
              Score: <span className="font-bold text-foreground">{totalScore}</span>
              <InfoTooltip
                term={RISK_LEVEL_TERMS.riskScore.term}
                definition={RISK_LEVEL_TERMS.riskScore.definition}
              />
            </span>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`font-bold text-lg ${getRiskTickerClass(riskLevel)}`}>
              {stockSummary.ticker}
            </p>
            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
              {stockSummary.companyName}
            </p>
          </div>
        </div>
        {/* Narrative summary — full width, risk-accented, sits between header row and content */}
        <p className={`text-sm font-medium leading-relaxed text-foreground/85 border-l-[3px] rounded-md pl-3 py-2 mt-3 ${getRiskNarrativeClass(riskLevel)}`}>
          {narrative.header}
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Stock Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-secondary/50 rounded-xl border border-border/50">
          <div>
            <p className="text-xs text-muted-foreground font-medium inline-flex items-center gap-0.5 mb-1">
              Exchange
              <InfoTooltip
                term={STOCK_SUMMARY_TERMS.exchange.term}
                definition={STOCK_SUMMARY_TERMS.exchange.definition}
              />
            </p>
            <p className="font-semibold text-sm">{stockSummary.exchange || "N/A"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium inline-flex items-center gap-0.5 mb-1">
              Price
              <InfoTooltip
                term={STOCK_SUMMARY_TERMS.lastPrice.term}
                definition={STOCK_SUMMARY_TERMS.lastPrice.definition}
              />
            </p>
            <p className="font-semibold text-sm">
              {stockSummary.lastPrice
                ? formatPrice(stockSummary.lastPrice)
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium inline-flex items-center gap-0.5 mb-1">
              Market Cap
              <InfoTooltip
                term={STOCK_SUMMARY_TERMS.marketCap.term}
                definition={STOCK_SUMMARY_TERMS.marketCap.definition}
              />
            </p>
            <p className="font-semibold text-sm">
              {stockSummary.marketCap
                ? formatNumber(stockSummary.marketCap)
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium inline-flex items-center gap-0.5 mb-1">
              Avg. Volume
              <InfoTooltip
                term={STOCK_SUMMARY_TERMS.avgVolume.term}
                definition={STOCK_SUMMARY_TERMS.avgVolume.definition}
              />
            </p>
            <p className="font-semibold text-sm">
              {stockSummary.avgDollarVolume30d
                ? formatNumber(stockSummary.avgDollarVolume30d)
                : "N/A"}
            </p>
          </div>
        </div>

        {/* Stock & Market Red Flags */}
        {narrative.stockRedFlags.length > 0 && (
          <div className="space-y-3">
            <h3 className="flex items-center gap-2.5 font-semibold text-sm">
              <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <BarChart3 className="h-3.5 w-3.5 text-amber-500" />
              </div>
              Stock & Market Behavior
            </h3>
            <ul className="space-y-2 ml-9">
              {narrative.stockRedFlags.map((flag, index) => {
                const isPositive = flag.toLowerCase().includes("no concerning") ||
                                   flag.toLowerCase().includes("no red flags") ||
                                   flag.toLowerCase().includes("no signals");
                return (
                  <FlagItem
                    key={index}
                    flag={flag}
                    isPositive={isPositive}
                    iconColor={isPositive ? "green" : "orange"}
                  />
                );
              })}
            </ul>
          </div>
        )}

        {/* Behavioral Red Flags — show real flags when chat data was provided */}
        {hasChatData && narrative.behaviorRedFlags.length > 0 && (
          <div className="space-y-3">
            <h3 className="flex items-center gap-2.5 font-semibold text-sm">
              <div className="h-7 w-7 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <Users className="h-3.5 w-3.5 text-red-500" />
              </div>
              Pitch & Behavior Patterns
            </h3>
            <ul className="space-y-2 ml-9">
              {narrative.behaviorRedFlags.map((flag, index) => {
                const isPositive = flag.toLowerCase().includes("no behavioral") ||
                                   flag.toLowerCase().includes("no red flags") ||
                                   flag.toLowerCase().includes("no concerning");
                return (
                  <FlagItem
                    key={index}
                    flag={flag}
                    isPositive={isPositive}
                    iconColor={isPositive ? "green" : "red"}
                  />
                );
              })}
            </ul>
          </div>
        )}

        {/* No Chat / Pitch Data Notices — orangey-red */}
        {!hasChatData && (
          <div className="space-y-4">
            {/* Pitch & Behavior — not analyzed */}
            <div className="space-y-3">
              <h3 className="flex items-center gap-2.5 font-semibold text-sm">
                <div className="h-7 w-7 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                  <Users className="h-3.5 w-3.5 text-orange-500" />
                </div>
                <span className="text-orange-700 dark:text-orange-400">Pitch & Behavior Patterns</span>
              </h3>
              <div className="ml-9 p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-orange-800 dark:text-orange-200 leading-relaxed">
                    <span className="font-semibold">Not analyzed.</span> No pitch text, red flags, or behavioral context was provided for this scan.
                    Without this information, we cannot evaluate the language or tactics used to promote this investment.
                    To get a pitch analysis, scan again and describe the tip you received or paste the message.
                  </p>
                </div>
              </div>
            </div>

            {/* Social / Chat — not analyzed */}
            <div className="space-y-3">
              <h3 className="flex items-center gap-2.5 font-semibold text-sm">
                <div className="h-7 w-7 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                  <MessageSquareOff className="h-3.5 w-3.5 text-orange-500" />
                </div>
                <span className="text-orange-700 dark:text-orange-400">Social & Promotion Analysis</span>
              </h3>
              <div className="ml-9 p-3 rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-orange-800 dark:text-orange-200 leading-relaxed">
                    <span className="font-semibold">Not analyzed.</span> No chat history, messages, or screenshots were uploaded.
                    Without this data, we cannot detect social behavior patterns such as unsolicited promotion,
                    urgency tactics, or manipulative language. For a more complete analysis, scan again with
                    any suspicious messages or screenshots attached.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Suggestions */}
        {narrative.suggestions.length > 0 && (
          <div className="space-y-3">
            <h3 className="flex items-center gap-2.5 font-semibold text-sm">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Lightbulb className="h-3.5 w-3.5 text-primary" />
              </div>
              What You Can Do Now
            </h3>
            <ul className="space-y-2 ml-9">
              {narrative.suggestions.map((suggestion, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed"
                >
                  <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
