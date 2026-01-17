"use client";

import { RiskLevel } from "@/lib/types";
import { CryptoRiskResponse, CryptoRiskSignal } from "@/lib/crypto/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  CRYPTO_SUMMARY_TERMS,
  CRYPTO_RISK_LEVEL_TERMS,
  CONTRACT_SECURITY_TERMS,
  TRADING_TERMS,
  LIQUIDITY_TERMS,
  DISTRIBUTION_TERMS,
  PATTERN_TERMS,
  BEHAVIORAL_TERMS,
} from "@/lib/crypto/glossary";
import {
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Shield,
  Users,
  Lightbulb,
  Info,
  FileCode,
  Droplets,
  Coins,
} from "lucide-react";
import { formatNumber, formatPrice } from "@/lib/utils";

interface CryptoRiskCardProps {
  result: CryptoRiskResponse;
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
 * Technical term patterns for crypto and their associated glossary definitions
 */
const CRYPTO_TECHNICAL_TERM_PATTERNS = [
  // Contract security terms
  { pattern: /honeypot/i, glossary: CONTRACT_SECURITY_TERMS.honeypot },
  { pattern: /rug\s*pull/i, glossary: CONTRACT_SECURITY_TERMS.rugPull },
  { pattern: /mintable/i, glossary: CONTRACT_SECURITY_TERMS.mintable },
  { pattern: /mint.*token/i, glossary: CONTRACT_SECURITY_TERMS.mintable },
  { pattern: /proxy/i, glossary: CONTRACT_SECURITY_TERMS.proxyContract },
  { pattern: /upgradeable/i, glossary: CONTRACT_SECURITY_TERMS.proxyContract },
  { pattern: /hidden owner/i, glossary: CONTRACT_SECURITY_TERMS.hiddenOwner },
  { pattern: /reclaim ownership/i, glossary: CONTRACT_SECURITY_TERMS.reclaimOwnership },
  { pattern: /self.?destruct/i, glossary: CONTRACT_SECURITY_TERMS.selfDestruct },
  { pattern: /verified/i, glossary: CONTRACT_SECURITY_TERMS.verifiedContract },
  { pattern: /open source/i, glossary: CONTRACT_SECURITY_TERMS.verifiedContract },
  { pattern: /blacklist/i, glossary: CONTRACT_SECURITY_TERMS.blacklistFunction },
  // Trading terms
  { pattern: /buy tax/i, glossary: TRADING_TERMS.buyTax },
  { pattern: /sell tax/i, glossary: TRADING_TERMS.sellTax },
  { pattern: /slippage/i, glossary: TRADING_TERMS.slippage },
  { pattern: /cooldown/i, glossary: TRADING_TERMS.tradingCooldown },
  { pattern: /anti.?whale/i, glossary: TRADING_TERMS.antiWhale },
  // Liquidity terms
  { pattern: /liquidity pool/i, glossary: LIQUIDITY_TERMS.liquidityPool },
  { pattern: /lp.*lock/i, glossary: LIQUIDITY_TERMS.lpLocked },
  { pattern: /liquidity.*lock/i, glossary: LIQUIDITY_TERMS.lpLocked },
  { pattern: /liquidity.*not locked/i, glossary: LIQUIDITY_TERMS.lpNotLocked },
  { pattern: /lp not locked/i, glossary: LIQUIDITY_TERMS.lpNotLocked },
  { pattern: /tvl/i, glossary: LIQUIDITY_TERMS.totalValueLocked },
  { pattern: /dex/i, glossary: LIQUIDITY_TERMS.dex },
  { pattern: /decentralized exchange/i, glossary: LIQUIDITY_TERMS.dex },
  // Distribution terms
  { pattern: /holder concentration/i, glossary: DISTRIBUTION_TERMS.holderConcentration },
  { pattern: /top.*holder/i, glossary: DISTRIBUTION_TERMS.holderConcentration },
  { pattern: /creator.*hold/i, glossary: DISTRIBUTION_TERMS.creatorHoldings },
  { pattern: /holder count/i, glossary: DISTRIBUTION_TERMS.holderCount },
  { pattern: /whale/i, glossary: DISTRIBUTION_TERMS.whale },
  // Pattern terms
  { pattern: /pump.?and.?dump/i, glossary: PATTERN_TERMS.pumpAndDump },
  { pattern: /volume explosion/i, glossary: PATTERN_TERMS.volumeExplosion },
  { pattern: /price spike/i, glossary: PATTERN_TERMS.priceSpike },
  { pattern: /RSI/i, glossary: PATTERN_TERMS.rsi },
  { pattern: /overbought/i, glossary: PATTERN_TERMS.rsi },
  { pattern: /volatility/i, glossary: PATTERN_TERMS.volatility },
  // Behavioral terms
  { pattern: /fomo/i, glossary: BEHAVIORAL_TERMS.fomo },
  { pattern: /alpha/i, glossary: BEHAVIORAL_TERMS.alpha },
  { pattern: /ape\s*in/i, glossary: BEHAVIORAL_TERMS.apeIn },
  { pattern: /dyor/i, glossary: BEHAVIORAL_TERMS.dyor },
];

function findCryptoTechnicalTerm(text: string): { term: string; definition: string } | null {
  for (const { pattern, glossary } of CRYPTO_TECHNICAL_TERM_PATTERNS) {
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
  iconColor: "green" | "orange" | "red" | "blue" | "purple";
}) {
  const technicalTerm = findCryptoTechnicalTerm(flag);

  const iconClasses = {
    green: "text-green-500",
    orange: "text-orange-500",
    red: "text-red-500",
    blue: "text-blue-500",
    purple: "text-purple-500",
  };

  const IconComponent = isPositive
    ? CheckCircle
    : iconColor === "red"
    ? AlertCircle
    : AlertTriangle;

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

export function CryptoRiskCard({ result }: CryptoRiskCardProps) {
  const { riskLevel, totalScore, signals, cryptoSummary, narrative } = result;

  const priceChangePositive = (cryptoSummary.priceChange24h ?? 0) >= 0;

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
                  term={CRYPTO_RISK_LEVEL_TERMS.riskScore.term}
                  definition={CRYPTO_RISK_LEVEL_TERMS.riskScore.definition}
                />
              </span>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="font-semibold">{cryptoSummary.symbol}</p>
            <p className="text-sm text-muted-foreground truncate max-w-[200px] sm:max-w-none">
              {cryptoSummary.name}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm sm:text-base">{narrative.header}</p>
      </CardHeader>

      <CardContent className="space-y-5 sm:space-y-6">
        {/* Crypto Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 p-3 sm:p-4 bg-secondary rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground inline-flex items-center">
              Price
              <InfoTooltip
                term="Price"
                definition="The current trading price of the cryptocurrency in USD."
              />
            </p>
            <p className="font-medium">
              {cryptoSummary.lastPrice
                ? `$${cryptoSummary.lastPrice < 0.01
                    ? cryptoSummary.lastPrice.toFixed(8)
                    : cryptoSummary.lastPrice.toFixed(4)}`
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground inline-flex items-center">
              24h Change
              <InfoTooltip
                term={CRYPTO_SUMMARY_TERMS.priceChange.term}
                definition={CRYPTO_SUMMARY_TERMS.priceChange.definition}
              />
            </p>
            <p className={`font-medium flex items-center gap-1 ${
              priceChangePositive ? "text-green-600" : "text-red-600"
            }`}>
              {priceChangePositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {cryptoSummary.priceChange24h !== undefined
                ? `${cryptoSummary.priceChange24h.toFixed(2)}%`
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground inline-flex items-center">
              Market Cap
              <InfoTooltip
                term={CRYPTO_SUMMARY_TERMS.marketCap.term}
                definition={CRYPTO_SUMMARY_TERMS.marketCap.definition}
              />
            </p>
            <p className="font-medium">
              {cryptoSummary.marketCap
                ? formatNumber(cryptoSummary.marketCap)
                : "N/A"}
              {cryptoSummary.marketCapRank && (
                <span className="text-xs text-muted-foreground ml-1">
                  (#{cryptoSummary.marketCapRank})
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground inline-flex items-center">
              24h Volume
              <InfoTooltip
                term={CRYPTO_SUMMARY_TERMS.volume24h.term}
                definition={CRYPTO_SUMMARY_TERMS.volume24h.definition}
              />
            </p>
            <p className="font-medium">
              {cryptoSummary.volume24h
                ? formatNumber(cryptoSummary.volume24h)
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground inline-flex items-center">
              Circulating Supply
              <InfoTooltip
                term={CRYPTO_SUMMARY_TERMS.circulatingSupply.term}
                definition={CRYPTO_SUMMARY_TERMS.circulatingSupply.definition}
              />
            </p>
            <p className="font-medium">
              {cryptoSummary.circulatingSupply
                ? formatNumber(cryptoSummary.circulatingSupply)
                : "N/A"}
            </p>
          </div>
          {cryptoSummary.blockchain && (
            <div>
              <p className="text-xs text-muted-foreground">Blockchain</p>
              <p className="font-medium capitalize">{cryptoSummary.blockchain}</p>
            </div>
          )}
        </div>

        {/* Contract Address (if available) */}
        {cryptoSummary.contractAddress && (
          <div className="p-3 bg-secondary/50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Contract Address</p>
            <p className="font-mono text-xs break-all">{cryptoSummary.contractAddress}</p>
          </div>
        )}

        {/* Market & Trading Red Flags */}
        {narrative.marketRedFlags.length > 0 && (
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-sm sm:text-base mb-2 sm:mb-3">
              <TrendingUp className="h-4 w-4 text-orange-500 flex-shrink-0" />
              Market & Trading Patterns
            </h3>
            <ul className="space-y-2">
              {narrative.marketRedFlags.map((flag, index) => {
                const isPositive =
                  flag.toLowerCase().includes("no concerning") ||
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

        {/* Contract Security Red Flags */}
        {narrative.contractRedFlags.length > 0 && (
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-sm sm:text-base mb-2 sm:mb-3">
              <FileCode className="h-4 w-4 text-purple-500 flex-shrink-0" />
              Smart Contract Security
            </h3>
            <ul className="space-y-2">
              {narrative.contractRedFlags.map((flag, index) => {
                const isPositive =
                  flag.toLowerCase().includes("no contract") ||
                  flag.toLowerCase().includes("no security") ||
                  flag.toLowerCase().includes("verified");
                return (
                  <FlagItem
                    key={index}
                    flag={flag}
                    isPositive={isPositive}
                    iconColor={isPositive ? "green" : "purple"}
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
                const isPositive =
                  flag.toLowerCase().includes("no behavioral") ||
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
