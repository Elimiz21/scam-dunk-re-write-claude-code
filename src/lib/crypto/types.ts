/**
 * Crypto Scanning Module - Types
 *
 * Type definitions for the crypto scanning feature.
 * Separate from stock types to maintain modularity.
 */

import { RiskLevel, SignalCategory, UsageInfo, Narrative } from "../types";

// Crypto-specific signal categories
export type CryptoSignalCategory = SignalCategory | "CONTRACT" | "LIQUIDITY" | "DISTRIBUTION";

export interface CryptoRiskSignal {
  code: string;
  category: CryptoSignalCategory;
  description: string;
  weight: number;
}

// CoinGecko market data
export interface CryptoQuote {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  marketCap: number;
  marketCapRank: number | null;
  fullyDilutedValuation: number | null;
  totalVolume24h: number;
  priceChange24h: number;
  priceChangePercentage24h: number;
  priceChangePercentage7d: number | null;
  priceChangePercentage30d: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number;
  athChangePercentage: number;
  athDate: string | null;
  atl: number;
  atlChangePercentage: number;
  atlDate: string | null;
  lastUpdated: string;
}

export interface CryptoPriceHistory {
  timestamp: number;
  price: number;
  marketCap: number;
  volume: number;
}

// GoPlus Security API response types
export interface GoPlusTokenSecurity {
  // Contract security
  isOpenSource: boolean;
  isProxy: boolean;
  isMintable: boolean;
  canTakeBackOwnership: boolean;
  ownerChangeBalance: boolean;
  hiddenOwner: boolean;
  selfDestruct: boolean;
  externalCall: boolean;

  // Trading security
  isHoneypot: boolean;
  buyTax: number;
  sellTax: number;
  cannotBuy: boolean;
  cannotSellAll: boolean;
  tradingCooldown: boolean;
  isAntiWhale: boolean;
  slippageModifiable: boolean;
  isBlacklisted: boolean;

  // Holder info
  holderCount: number;
  totalSupply: string;
  creatorAddress: string;
  creatorPercent: number;
  ownerAddress: string;
  ownerPercent: number;
  lpHolderCount: number;
  lpTotalSupply: string;
  isLpLocked: boolean;
  lpLockedPercent: number;

  // Trust indicators
  trustList: boolean;
  isInDex: boolean;
  dexInfo: Array<{
    name: string;
    liquidity: string;
    pair: string;
  }>;

  // Top holders
  topHolders: Array<{
    address: string;
    percent: number;
    isContract: boolean;
    isLocked: boolean;
  }>;
}

export interface CryptoSecurityData {
  tokenSecurity: GoPlusTokenSecurity | null;
  securityAvailable: boolean;
  chain: string;
  contractAddress?: string;
}

export interface CryptoMarketData {
  quote: CryptoQuote | null;
  priceHistory: CryptoPriceHistory[];
  securityData: CryptoSecurityData | null;
  dataAvailable: boolean;
}

// Crypto Summary for display
export interface CryptoSummary {
  symbol: string;
  name: string;
  blockchain?: string;
  lastPrice?: number;
  marketCap?: number;
  marketCapRank?: number | null;
  volume24h?: number;
  priceChange24h?: number;
  priceChange7d?: number | null;
  circulatingSupply?: number | null;
  totalSupply?: number | null;
  contractAddress?: string;
}

// Crypto request/response types
export interface CryptoCheckRequest {
  symbol: string;
  contractAddress?: string;
  blockchain?: string; // ethereum, bsc, polygon, etc.
  pitchText?: string;
  context?: {
    unsolicited?: boolean;
    promisesHighReturns?: boolean;
    urgencyPressure?: boolean;
    secrecyInsideInfo?: boolean;
  };
}

export interface CryptoNarrative {
  header: string;
  marketRedFlags: string[];
  contractRedFlags: string[];
  behaviorRedFlags: string[];
  suggestions: string[];
  disclaimers: string[];
}

export interface CryptoRiskResponse {
  riskLevel: RiskLevel;
  totalScore: number;
  signals: CryptoRiskSignal[];
  cryptoSummary: CryptoSummary;
  narrative: CryptoNarrative;
  usage: UsageInfo;
  isLegitimate?: boolean;
}

// Scoring types
export interface CryptoScoringInput {
  marketData: CryptoMarketData;
  pitchText: string;
  context: {
    unsolicited: boolean;
    promisesHighReturns: boolean;
    urgencyPressure: boolean;
    secrecyInsideInfo: boolean;
  };
}

export interface CryptoScoringResult {
  signals: CryptoRiskSignal[];
  totalScore: number;
  riskLevel: RiskLevel;
  isInsufficient: boolean;
  isLegitimate: boolean;
}

// Supported blockchains for GoPlus Security API
export const SUPPORTED_CHAINS: Record<string, { chainId: string; name: string }> = {
  ethereum: { chainId: "1", name: "Ethereum" },
  bsc: { chainId: "56", name: "BNB Smart Chain" },
  polygon: { chainId: "137", name: "Polygon" },
  arbitrum: { chainId: "42161", name: "Arbitrum" },
  optimism: { chainId: "10", name: "Optimism" },
  avalanche: { chainId: "43114", name: "Avalanche" },
  fantom: { chainId: "250", name: "Fantom" },
  base: { chainId: "8453", name: "Base" },
  solana: { chainId: "solana", name: "Solana" },
};

// Major cryptocurrencies that are considered established/legitimate
export const ESTABLISHED_CRYPTOS = [
  "bitcoin", "ethereum", "tether", "bnb", "solana", "xrp",
  "usd-coin", "dogecoin", "cardano", "avalanche-2", "tron",
  "polkadot", "chainlink", "polygon", "litecoin", "shiba-inu",
  "dai", "uniswap", "cosmos", "ethereum-classic"
];
