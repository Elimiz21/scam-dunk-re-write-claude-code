"use client";

import { RiskResponse, RiskLevel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
              <span className="text-sm text-muted-foreground">
                Score: {totalScore}
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
            <p className="text-xs text-muted-foreground">Exchange</p>
            <p className="font-medium">{stockSummary.exchange || "N/A"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="font-medium">
              {stockSummary.lastPrice
                ? formatPrice(stockSummary.lastPrice)
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Market Cap</p>
            <p className="font-medium">
              {stockSummary.marketCap
                ? formatNumber(stockSummary.marketCap)
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg. Volume</p>
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
                  <li
                    key={index}
                    className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground"
                  >
                    {isPositive ? (
                      <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                    )}
                    {flag}
                  </li>
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
                  <li
                    key={index}
                    className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground"
                  >
                    {isPositive ? (
                      <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500 mt-0.5 flex-shrink-0" />
                    )}
                    {flag}
                  </li>
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
