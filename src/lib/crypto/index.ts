/**
 * Crypto Scanning Module
 *
 * Main entry point for the crypto scanning feature.
 * This module is isolated from the stock scanning feature
 * to ensure no regression or interference.
 */

// Types
export * from "./types";

// Data Services
export {
  searchCoin,
  fetchCryptoQuote,
  fetchCryptoPriceHistory,
  fetchCryptoMarketData,
  isEstablishedCrypto,
  calculateCryptoPriceChange,
  calculateCryptoVolumeRatio,
  detectCryptoSpikeThenDrop,
  calculateCryptoRSI,
  calculateCryptoVolatility,
} from "./dataService";

// Security Services
export {
  fetchTokenSecurity,
  normalizeChainName,
  isHoneypot,
  calculateHolderConcentration,
  hasRugPullRisks,
  getLiquidityInfo,
  calculateSecurityScore,
} from "./securityService";

// Scoring
export {
  computeCryptoRiskScore,
  getCryptoSignalsByCategory,
  CRYPTO_SIGNAL_CODES,
} from "./scoring";

// Narrative
export {
  generateCryptoNarrative,
  getCryptoQuickHeader,
} from "./narrative";

// Glossary
export {
  getCryptoTermDefinition,
  ALL_CRYPTO_GLOSSARY_TERMS,
  CRYPTO_SUMMARY_TERMS,
  CONTRACT_SECURITY_TERMS,
  TRADING_TERMS,
  LIQUIDITY_TERMS,
  DISTRIBUTION_TERMS,
  PATTERN_TERMS,
  BEHAVIORAL_TERMS,
  CRYPTO_RISK_LEVEL_TERMS,
} from "./glossary";
