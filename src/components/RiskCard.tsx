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
} from "lucide-react";
import { formatNumber, formatPrice } from "@/lib/utils";

interface RiskCardProps {
  result: RiskResponse;
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
  switch (level) {
    case "LOW":
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    case "MEDIUM":
      return <AlertCircle className="h-5 w-5 text-yellow-600" />;
    case "HIGH":
      return <AlertTriangle className="h-5 w-5 text-red-600" />;
    case "INSUFFICIENT":
      return <HelpCircle className="h-5 w-5 text-gray-600" />;
  }
}

/**
 * Technical term patterns and their associated glossary definitions
 * These patterns are matched against flag descriptions to add inline tooltips
 */
const TECHNICAL_TERM_PATTERNS = [
  // Structural terms
  { pattern: /penny stock/i, glossary: STRUCTURAL_SIGNAL_TERMS.pennyStock },
  { pattern: /market cap/i, glossary: STRUCTURAL_SIGNAL_TERMS.smallMarketCap },
  { pattern: /liquidity/i, glossary: STRUCTURAL_SIGNAL_TERMS.microLiquidity },
  { pattern: /OTC market/i, glossary: STRUCTURAL_SIGNAL_TERMS.otcMarket },
  { pattern: /OTC/i, glossary: STRUCTURAL_SIGNAL_TERMS.otcMarket },
  { pattern: /over-the-counter/i, glossary: STRUCTURAL_SIGNAL_TERMS.otcMarket },
  // Pattern terms
  { pattern: /price spike/i, glossary: PATTERN_SIGNAL_TERMS.priceSpike },
  { pattern: /volume explosion/i, glossary: PATTERN_SIGNAL_TERMS.volumeExplosion },
  { pattern: /pump.?and.?dump/i, glossary: PATTERN_SIGNAL_TERMS.pumpAndDump },
  { pattern: /pump pattern/i, glossary: PATTERN_SIGNAL_TERMS.pumpAndDump },
  { pattern: /spike.+drop/i, glossary: PATTERN_SIGNAL_TERMS.spikeThenDrop },
  // Anomaly terms
  { pattern: /price anomaly/i, glossary: ANOMALY_SIGNAL_TERMS.priceAnomaly },
  { pattern: /volume anomaly/i, glossary: ANOMALY_SIGNAL_TERMS.volumeAnomaly },
  { pattern: /RSI/i, glossary: ANOMALY_SIGNAL_TERMS.rsi },
  { pattern: /overbought/i, glossary: ANOMALY_SIGNAL_TERMS.overbought },
  { pattern: /volatility/i, glossary: ANOMALY_SIGNAL_TERMS.volatility },
  { pattern: /extreme surge/i, glossary: ANOMALY_SIGNAL_TERMS.extremeSurge },
  { pattern: /statistically/i, glossary: ANOMALY_SIGNAL_TERMS.zScore },
  // Behavioral terms
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

/**
 * Find the first matching technical term in a flag description
 * Returns the glossary term if found, null otherwise
 */
function findTechnicalTerm(text: string): { term: string; definition: string } | null {
  for (const { pattern, glossary } of TECHNICAL_TERM_PATTERNS) {
    if (pattern.test(text)) {
      return { term: glossary.term, definition: glossary.definition };
    }
  }
  return null;
}

/**
 * Renders a flag item with an optional technical term tooltip
 */
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
    green: "text-green-500",
    orange: "text-orange-500",
    red: "text-red-500",
    blue: "text-blue-500",
  };

  const IconComponent = isPositive ? CheckCircle : iconColor === "red" ? AlertCircle : AlertTriangle;

  return (
    <li className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground">
      <IconComponent
        className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${iconClasses[iconColor]} mt-0.5 flex-shrink-0`}
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

export function RiskCard({ result }: RiskCardProps) {
  const { riskLevel, totalScore, signals, stockSummary, narrative } = result;

  return (
    <Card className="w-full">
      {/* Header with Risk Level */}
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            {getRiskIcon(riskLevel)}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={getRiskBadgeVariant(riskLevel)} className="text-sm">
                {riskLevel} RISK
              </Badge>
              <span className="text-sm text-muted-foreground inline-flex items-center">
                Score: {totalScore}
                <InfoTooltip
                  term={RISK_LEVEL_TERMS.riskScore.term}
                  definition={RISK_LEVEL_TERMS.riskScore.definition}
                />
              </span>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="font-semibold">{stockSummary.ticker}</p>
            <p className="text-sm text-muted-foreground truncate max-w-[200px] sm:max-w-none">
              {stockSummary.companyName}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm sm:text-base">{narrative.header}</p>
      </CardHeader>

      <CardContent className="space-y-5 sm:space-y-6">
        {/* Stock Summary */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 bg-secondary rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground inline-flex items-center">
              Exchange
              <InfoTooltip
                term={STOCK_SUMMARY_TERMS.exchange.term}
                definition={STOCK_SUMMARY_TERMS.exchange.definition}
              />
            </p>
            <p className="font-medium">{stockSummary.exchange || "N/A"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground inline-flex items-center">
              Price
              <InfoTooltip
                term={STOCK_SUMMARY_TERMS.lastPrice.term}
                definition={STOCK_SUMMARY_TERMS.lastPrice.definition}
              />
            </p>
            <p className="font-medium">
              {stockSummary.lastPrice
                ? formatPrice(stockSummary.lastPrice)
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground inline-flex items-center">
              Market Cap
              <InfoTooltip
                term={STOCK_SUMMARY_TERMS.marketCap.term}
                definition={STOCK_SUMMARY_TERMS.marketCap.definition}
              />
            </p>
            <p className="font-medium">
              {stockSummary.marketCap
                ? formatNumber(stockSummary.marketCap)
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground inline-flex items-center">
              Avg. Volume
              <InfoTooltip
                term={STOCK_SUMMARY_TERMS.avgVolume.term}
                definition={STOCK_SUMMARY_TERMS.avgVolume.definition}
              />
            </p>
            <p className="font-medium">
              {stockSummary.avgDollarVolume30d
                ? formatNumber(stockSummary.avgDollarVolume30d)
                : "N/A"}
            </p>
          </div>
        </div>

        {/* Stock & Market Red Flags */}
        {narrative.stockRedFlags.length > 0 && (
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-sm sm:text-base mb-2 sm:mb-3">
              <TrendingUp className="h-4 w-4 text-orange-500 flex-shrink-0" />
              Stock & Market Behavior
            </h3>
            <ul className="space-y-2">
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

        {/* Behavioral Red Flags */}
        {narrative.behaviorRedFlags.length > 0 && (
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-sm sm:text-base mb-2 sm:mb-3">
              <Users className="h-4 w-4 text-red-500 flex-shrink-0" />
              Pitch & Behavior Patterns
            </h3>
            <ul className="space-y-2">
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

        {/* Suggestions */}
        {narrative.suggestions.length > 0 && (
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-sm sm:text-base mb-2 sm:mb-3">
              <Lightbulb className="h-4 w-4 text-blue-500 flex-shrink-0" />
              What You Can Do Now
            </h3>
            <ul className="space-y-2">
              {narrative.suggestions.map((suggestion, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground"
                >
                  <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Disclaimers */}
        <div className="pt-4 border-t">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              {narrative.disclaimers.map((disclaimer, index) => (
                <p key={index}>{disclaimer}</p>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
