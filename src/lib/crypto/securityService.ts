/**
 * Crypto Security Service
 *
 * Integrates with GoPlus Security API for token security analysis.
 * Free API - no authentication required for basic usage.
 *
 * API Documentation: https://gopluslabs.io/token-security-api
 */

import {
  GoPlusTokenSecurity,
  CryptoSecurityData,
  SUPPORTED_CHAINS,
} from "./types";

// GoPlus Security API base URL
const GOPLUS_API_BASE = "https://api.gopluslabs.io/api/v1";

// Cache for API responses (10 minute TTL for security data)
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Rate limiting
let lastApiCall = 0;
const MIN_API_INTERVAL = 500; // 500ms between calls

/**
 * Wait for rate limit
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  if (timeSinceLastCall < MIN_API_INTERVAL) {
    await new Promise((resolve) =>
      setTimeout(resolve, MIN_API_INTERVAL - timeSinceLastCall)
    );
  }
  lastApiCall = Date.now();
}

/**
 * Get cached data if available and not expired
 */
function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  return null;
}

/**
 * Set cache
 */
function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Normalize chain name to supported format
 */
export function normalizeChainName(chain: string): string | null {
  const normalized = chain.toLowerCase().trim();

  // Common aliases
  const aliases: Record<string, string> = {
    eth: "ethereum",
    ether: "ethereum",
    bsc: "bsc",
    bnb: "bsc",
    "binance smart chain": "bsc",
    poly: "polygon",
    matic: "polygon",
    arb: "arbitrum",
    op: "optimism",
    avax: "avalanche",
    ftm: "fantom",
    sol: "solana",
  };

  return aliases[normalized] || (SUPPORTED_CHAINS[normalized] ? normalized : null);
}

/**
 * Fetch token security data from GoPlus
 */
export async function fetchTokenSecurity(
  contractAddress: string,
  chain: string
): Promise<CryptoSecurityData> {
  const normalizedChain = normalizeChainName(chain);

  if (!normalizedChain || !SUPPORTED_CHAINS[normalizedChain]) {
    return {
      tokenSecurity: null,
      securityAvailable: false,
      chain: chain,
      contractAddress,
    };
  }

  const chainId = SUPPORTED_CHAINS[normalizedChain].chainId;
  const cacheKey = `security:${chainId}:${contractAddress.toLowerCase()}`;
  const cached = getCached<CryptoSecurityData>(cacheKey);
  if (cached) return cached;

  await waitForRateLimit();

  try {
    const url = `${GOPLUS_API_BASE}/token_security/${chainId}?contract_addresses=${contractAddress}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`GoPlus API error: ${response.status}`);
      return {
        tokenSecurity: null,
        securityAvailable: false,
        chain: normalizedChain,
        contractAddress,
      };
    }

    const data = await response.json();

    if (data.code !== 1 || !data.result) {
      console.log("GoPlus: No security data available");
      return {
        tokenSecurity: null,
        securityAvailable: false,
        chain: normalizedChain,
        contractAddress,
      };
    }

    const tokenData = data.result[contractAddress.toLowerCase()];

    if (!tokenData) {
      return {
        tokenSecurity: null,
        securityAvailable: false,
        chain: normalizedChain,
        contractAddress,
      };
    }

    // Parse GoPlus response into our type
    const tokenSecurity: GoPlusTokenSecurity = {
      // Contract security
      isOpenSource: tokenData.is_open_source === "1",
      isProxy: tokenData.is_proxy === "1",
      isMintable: tokenData.is_mintable === "1",
      canTakeBackOwnership: tokenData.can_take_back_ownership === "1",
      ownerChangeBalance: tokenData.owner_change_balance === "1",
      hiddenOwner: tokenData.hidden_owner === "1",
      selfDestruct: tokenData.selfdestruct === "1",
      externalCall: tokenData.external_call === "1",

      // Trading security
      isHoneypot: tokenData.is_honeypot === "1",
      buyTax: parseFloat(tokenData.buy_tax || "0") * 100,
      sellTax: parseFloat(tokenData.sell_tax || "0") * 100,
      cannotBuy: tokenData.cannot_buy === "1",
      cannotSellAll: tokenData.cannot_sell_all === "1",
      tradingCooldown: tokenData.trading_cooldown === "1",
      isAntiWhale: tokenData.is_anti_whale === "1",
      slippageModifiable: tokenData.slippage_modifiable === "1",
      isBlacklisted: tokenData.is_blacklisted === "1",

      // Holder info
      holderCount: parseInt(tokenData.holder_count || "0"),
      totalSupply: tokenData.total_supply || "0",
      creatorAddress: tokenData.creator_address || "",
      creatorPercent: parseFloat(tokenData.creator_percent || "0") * 100,
      ownerAddress: tokenData.owner_address || "",
      ownerPercent: parseFloat(tokenData.owner_percent || "0") * 100,
      lpHolderCount: parseInt(tokenData.lp_holder_count || "0"),
      lpTotalSupply: tokenData.lp_total_supply || "0",
      isLpLocked: tokenData.is_in_dex === "1" && parseFloat(tokenData.lp_holders?.[0]?.percent || "0") < 0.5,
      lpLockedPercent: 0, // Calculated from lp_holders

      // Trust indicators
      trustList: tokenData.trust_list === "1",
      isInDex: tokenData.is_in_dex === "1",
      dexInfo: (tokenData.dex || []).map((dex: { name?: string; liquidity?: string; pair?: string }) => ({
        name: dex.name || "Unknown",
        liquidity: dex.liquidity || "0",
        pair: dex.pair || "",
      })),

      // Top holders
      topHolders: (tokenData.holders || []).slice(0, 10).map((holder: {
        address?: string;
        percent?: string;
        is_contract?: string;
        is_locked?: string;
      }) => ({
        address: holder.address || "",
        percent: parseFloat(holder.percent || "0") * 100,
        isContract: holder.is_contract === "1",
        isLocked: holder.is_locked === "1",
      })),
    };

    // Calculate LP locked percentage from LP holders
    if (tokenData.lp_holders && Array.isArray(tokenData.lp_holders)) {
      const lockedLp = tokenData.lp_holders
        .filter((h: { is_locked?: string }) => h.is_locked === "1")
        .reduce((sum: number, h: { percent?: string }) => sum + parseFloat(h.percent || "0"), 0);
      tokenSecurity.lpLockedPercent = lockedLp * 100;
      tokenSecurity.isLpLocked = lockedLp >= 0.5; // At least 50% locked
    }

    const result: CryptoSecurityData = {
      tokenSecurity,
      securityAvailable: true,
      chain: normalizedChain,
      contractAddress,
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Error fetching token security:", error);
    return {
      tokenSecurity: null,
      securityAvailable: false,
      chain: normalizedChain || chain,
      contractAddress,
    };
  }
}

/**
 * Detect if token is a honeypot
 */
export function isHoneypot(security: GoPlusTokenSecurity): boolean {
  return (
    security.isHoneypot ||
    security.cannotBuy ||
    security.cannotSellAll ||
    security.sellTax >= 50 // 50%+ sell tax is effectively a honeypot
  );
}

/**
 * Calculate holder concentration risk
 * Returns percentage held by top 10 holders
 */
export function calculateHolderConcentration(
  security: GoPlusTokenSecurity
): number {
  if (!security.topHolders || security.topHolders.length === 0) {
    return 0;
  }

  return security.topHolders.reduce((sum, holder) => sum + holder.percent, 0);
}

/**
 * Check for rug pull risk indicators
 */
export function hasRugPullRisks(security: GoPlusTokenSecurity): {
  hasRisks: boolean;
  risks: string[];
} {
  const risks: string[] = [];

  // Contract risks
  if (!security.isOpenSource) {
    risks.push("Contract source code is not verified");
  }
  if (security.isProxy) {
    risks.push("Contract is upgradeable (proxy pattern)");
  }
  if (security.isMintable) {
    risks.push("Owner can mint unlimited tokens");
  }
  if (security.canTakeBackOwnership) {
    risks.push("Owner can reclaim ownership after renouncing");
  }
  if (security.ownerChangeBalance) {
    risks.push("Owner can modify token balances");
  }
  if (security.hiddenOwner) {
    risks.push("Contract has hidden owner functions");
  }
  if (security.selfDestruct) {
    risks.push("Contract can self-destruct");
  }

  // Trading risks
  if (security.isHoneypot) {
    risks.push("Token is detected as honeypot");
  }
  if (security.sellTax > 10) {
    risks.push(`High sell tax: ${security.sellTax.toFixed(1)}%`);
  }
  if (security.buyTax > 10) {
    risks.push(`High buy tax: ${security.buyTax.toFixed(1)}%`);
  }
  if (security.tradingCooldown) {
    risks.push("Trading cooldown enabled");
  }
  if (security.isBlacklisted) {
    risks.push("Blacklist function detected");
  }
  if (security.slippageModifiable) {
    risks.push("Slippage can be modified by owner");
  }

  // Liquidity risks
  if (!security.isLpLocked && security.isInDex) {
    risks.push("Liquidity pool is not locked");
  }
  if (security.lpLockedPercent > 0 && security.lpLockedPercent < 50) {
    risks.push(`Only ${security.lpLockedPercent.toFixed(1)}% of LP is locked`);
  }

  // Holder concentration
  const topHolderPercent = calculateHolderConcentration(security);
  if (topHolderPercent > 50) {
    risks.push(`Top holders control ${topHolderPercent.toFixed(1)}% of supply`);
  }

  // Creator/owner risks
  if (security.creatorPercent > 20) {
    risks.push(`Creator holds ${security.creatorPercent.toFixed(1)}% of tokens`);
  }
  if (security.ownerPercent > 20) {
    risks.push(`Owner holds ${security.ownerPercent.toFixed(1)}% of tokens`);
  }

  return {
    hasRisks: risks.length > 0,
    risks,
  };
}

/**
 * Get liquidity info from DEX data
 */
export function getLiquidityInfo(security: GoPlusTokenSecurity): {
  totalLiquidity: number;
  isLow: boolean;
  dexCount: number;
} {
  if (!security.dexInfo || security.dexInfo.length === 0) {
    return {
      totalLiquidity: 0,
      isLow: true,
      dexCount: 0,
    };
  }

  const totalLiquidity = security.dexInfo.reduce(
    (sum, dex) => sum + parseFloat(dex.liquidity || "0"),
    0
  );

  return {
    totalLiquidity,
    isLow: totalLiquidity < 50000, // Less than $50k liquidity is considered low
    dexCount: security.dexInfo.length,
  };
}

/**
 * Calculate overall security score (0-100, higher is safer)
 */
export function calculateSecurityScore(security: GoPlusTokenSecurity): number {
  let score = 100;
  const deductions: { reason: string; points: number }[] = [];

  // Contract deductions (up to 50 points)
  if (!security.isOpenSource) {
    deductions.push({ reason: "Not open source", points: 15 });
  }
  if (security.isProxy) {
    deductions.push({ reason: "Proxy contract", points: 10 });
  }
  if (security.isMintable) {
    deductions.push({ reason: "Mintable", points: 15 });
  }
  if (security.hiddenOwner) {
    deductions.push({ reason: "Hidden owner", points: 20 });
  }
  if (security.selfDestruct) {
    deductions.push({ reason: "Self destruct", points: 15 });
  }
  if (security.canTakeBackOwnership) {
    deductions.push({ reason: "Can reclaim ownership", points: 15 });
  }
  if (security.ownerChangeBalance) {
    deductions.push({ reason: "Owner can change balances", points: 20 });
  }

  // Trading deductions (up to 40 points)
  if (security.isHoneypot) {
    deductions.push({ reason: "Honeypot", points: 40 });
  }
  if (security.sellTax > 10) {
    deductions.push({ reason: `High sell tax (${security.sellTax}%)`, points: Math.min(20, security.sellTax / 2) });
  }
  if (security.buyTax > 10) {
    deductions.push({ reason: `High buy tax (${security.buyTax}%)`, points: Math.min(10, security.buyTax / 2) });
  }
  if (security.cannotSellAll) {
    deductions.push({ reason: "Cannot sell all", points: 20 });
  }
  if (security.isBlacklisted) {
    deductions.push({ reason: "Blacklist function", points: 10 });
  }

  // Liquidity deductions (up to 20 points)
  if (!security.isLpLocked && security.isInDex) {
    deductions.push({ reason: "LP not locked", points: 15 });
  }

  // Holder concentration deductions (up to 20 points)
  const concentration = calculateHolderConcentration(security);
  if (concentration > 70) {
    deductions.push({ reason: `High holder concentration (${concentration.toFixed(0)}%)`, points: 15 });
  } else if (concentration > 50) {
    deductions.push({ reason: `Moderate holder concentration (${concentration.toFixed(0)}%)`, points: 10 });
  }

  // Apply deductions
  for (const d of deductions) {
    score -= d.points;
  }

  return Math.max(0, score);
}
