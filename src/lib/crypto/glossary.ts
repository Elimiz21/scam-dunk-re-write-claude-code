/**
 * Crypto Glossary of Technical Terms
 *
 * Contains definitions for technical cryptocurrency and DeFi terms
 * displayed in crypto scan results. Written for users without
 * a background in crypto or blockchain technology.
 */

export interface GlossaryTerm {
  term: string;
  definition: string;
}

/**
 * Crypto Summary Terms
 */
export const CRYPTO_SUMMARY_TERMS: Record<string, GlossaryTerm> = {
  marketCap: {
    term: "Market Cap",
    definition:
      "Market capitalization - the total value of all coins/tokens in circulation. Calculated by multiplying the price by the circulating supply. Larger market caps generally mean more established projects.",
  },
  volume24h: {
    term: "24h Volume",
    definition:
      "The total dollar value of trades in the last 24 hours. Higher volume means more liquidity - easier to buy and sell without affecting the price significantly.",
  },
  circulatingSupply: {
    term: "Circulating Supply",
    definition:
      "The number of coins/tokens currently available and trading in the market. Some projects have locked tokens that will be released later, which can dilute value.",
  },
  totalSupply: {
    term: "Total Supply",
    definition:
      "The total number of coins/tokens that currently exist, including those that are locked or not yet in circulation. A large gap between circulating and total supply means potential future dilution.",
  },
  maxSupply: {
    term: "Max Supply",
    definition:
      "The maximum number of coins/tokens that will ever exist. Bitcoin has a max supply of 21 million. Some tokens have unlimited supply, which can lead to inflation.",
  },
  priceChange: {
    term: "Price Change",
    definition:
      "The percentage change in price over a specific period. Large swings in either direction can indicate volatility, manipulation, or significant news events.",
  },
  ath: {
    term: "All-Time High (ATH)",
    definition:
      "The highest price the cryptocurrency has ever reached. Buying near ATH carries risk of significant pullback. Many cryptos never return to their ATH.",
  },
};

/**
 * Contract Security Terms
 */
export const CONTRACT_SECURITY_TERMS: Record<string, GlossaryTerm> = {
  honeypot: {
    term: "Honeypot",
    definition:
      "A scam token where you can buy but cannot sell. The smart contract is programmed to prevent sells or charge 100% tax on selling. Your investment becomes worthless.",
  },
  rugPull: {
    term: "Rug Pull",
    definition:
      "A scam where developers suddenly remove all liquidity from a token's trading pool, making it impossible to sell and the token worthless. Named because it's like 'pulling the rug out' from under investors.",
  },
  mintable: {
    term: "Mintable Token",
    definition:
      "A token where the owner/developer can create (mint) new tokens at will. This can dilute existing holders' value or be used to dump on the market.",
  },
  proxyContract: {
    term: "Proxy/Upgradeable Contract",
    definition:
      "A smart contract that can be modified after deployment. While sometimes legitimate, this means the rules can change at any time - including adding malicious code.",
  },
  hiddenOwner: {
    term: "Hidden Owner",
    definition:
      "When a contract appears to have renounced ownership but actually has hidden functions that allow the original owner to regain control. A deceptive practice.",
  },
  reclaimOwnership: {
    term: "Reclaim Ownership",
    definition:
      "A contract function that allows a developer to take back ownership after supposedly giving it up. This makes 'ownership renounced' claims meaningless.",
  },
  selfDestruct: {
    term: "Self-Destruct Function",
    definition:
      "A smart contract function that can permanently destroy the contract. If triggered, all tokens become worthless and funds may be lost.",
  },
  verifiedContract: {
    term: "Verified Contract",
    definition:
      "A smart contract whose source code has been published and verified on a block explorer (like Etherscan). Unverified contracts are suspicious because their code cannot be audited.",
  },
  blacklistFunction: {
    term: "Blacklist Function",
    definition:
      "A contract feature that allows the owner to prevent specific addresses from selling or transferring tokens. Can be used to trap investors.",
  },
};

/**
 * Trading/Tax Terms
 */
export const TRADING_TERMS: Record<string, GlossaryTerm> = {
  buyTax: {
    term: "Buy Tax",
    definition:
      "A percentage fee automatically deducted when you buy the token. High buy taxes (over 10%) significantly reduce what you receive. Some scams set this to 100%.",
  },
  sellTax: {
    term: "Sell Tax",
    definition:
      "A percentage fee automatically deducted when you sell the token. High sell taxes trap investors since selling costs more than the investment is worth.",
  },
  slippage: {
    term: "Slippage",
    definition:
      "The difference between the expected price of a trade and the actual price. Low liquidity or high taxes require high slippage tolerance, meaning you get less than expected.",
  },
  tradingCooldown: {
    term: "Trading Cooldown",
    definition:
      "A forced waiting period between trades. While sometimes used legitimately, it can prevent you from selling quickly during a crash.",
  },
  antiWhale: {
    term: "Anti-Whale Mechanism",
    definition:
      "Limits on how much one wallet can buy or sell at once. Can be legitimate (prevents manipulation) or malicious (prevents large sells during rug pull).",
  },
};

/**
 * Liquidity Terms
 */
export const LIQUIDITY_TERMS: Record<string, GlossaryTerm> = {
  liquidityPool: {
    term: "Liquidity Pool (LP)",
    definition:
      "A pool of tokens locked in a smart contract that enables trading on decentralized exchanges. When you trade, you're swapping with the pool, not another person.",
  },
  lpLocked: {
    term: "Liquidity Locked",
    definition:
      "When LP tokens are sent to a time-locked contract, preventing the developer from removing liquidity. CRITICAL for safety - unlocked liquidity means a rug pull can happen at any moment.",
  },
  lpNotLocked: {
    term: "Liquidity Not Locked",
    definition:
      "A MAJOR red flag. The developer can withdraw all liquidity at any time, instantly making your tokens unsellable and worthless. This is how rug pulls happen.",
  },
  totalValueLocked: {
    term: "Total Value Locked (TVL)",
    definition:
      "The total dollar value of assets deposited in a DeFi protocol or liquidity pool. Higher TVL generally means more trust and stability.",
  },
  dex: {
    term: "DEX (Decentralized Exchange)",
    definition:
      "A cryptocurrency exchange that operates without a central authority, using smart contracts to facilitate trades. Examples: Uniswap, PancakeSwap, SushiSwap.",
  },
};

/**
 * Token Distribution Terms
 */
export const DISTRIBUTION_TERMS: Record<string, GlossaryTerm> = {
  holderConcentration: {
    term: "Holder Concentration",
    definition:
      "How much of the token supply is held by the top wallets. High concentration (>50% in top 10 wallets) means 'whales' can manipulate the price or dump on smaller holders.",
  },
  creatorHoldings: {
    term: "Creator Holdings",
    definition:
      "The percentage of tokens held by the wallet that created the contract. High creator holdings (>20%) means they can dump on the market at any time.",
  },
  holderCount: {
    term: "Holder Count",
    definition:
      "The total number of unique wallets holding the token. Low holder count indicates limited adoption and potentially fake trading activity (wash trading).",
  },
  whale: {
    term: "Whale",
    definition:
      "A wallet holding a large percentage of a token's supply. Whales can dramatically move the price when they buy or sell, often at the expense of smaller holders.",
  },
};

/**
 * Pattern/Risk Terms
 */
export const PATTERN_TERMS: Record<string, GlossaryTerm> = {
  pumpAndDump: {
    term: "Pump and Dump",
    definition:
      "A scam where promoters artificially inflate the price through false hype and coordinated buying (pump), then sell their holdings at the peak (dump), crashing the price.",
  },
  volumeExplosion: {
    term: "Volume Explosion",
    definition:
      "When trading volume suddenly increases many times over the average. Can indicate coordinated buying by promoters or bots before a dump.",
  },
  priceSpike: {
    term: "Price Spike",
    definition:
      "A rapid, dramatic price increase over a short period. In crypto, extreme spikes without clear news often precede crashes or indicate manipulation.",
  },
  rsi: {
    term: "RSI (Relative Strength Index)",
    definition:
      "A momentum indicator showing if an asset is overbought (>70) or oversold (<30). Extremely high RSI in crypto often precedes sharp corrections.",
  },
  volatility: {
    term: "Volatility",
    definition:
      "How much the price swings up and down. Crypto is inherently volatile, but extreme volatility (>20% daily swings) significantly increases risk of losses.",
  },
};

/**
 * Behavioral/Scam Terms
 */
export const BEHAVIORAL_TERMS: Record<string, GlossaryTerm> = {
  fomo: {
    term: "FOMO (Fear of Missing Out)",
    definition:
      "The anxiety that you'll miss a big profit opportunity. Scammers exploit FOMO with urgency tactics. Legitimate investments don't require immediate action.",
  },
  alpha: {
    term: "Alpha (in crypto context)",
    definition:
      "Slang for supposed 'insider' or exclusive information about upcoming tokens. Almost always fabricated to lure victims into scams.",
  },
  apeIn: {
    term: "Ape In",
    definition:
      "Crypto slang for investing impulsively without doing research. Scammers encourage this behavior. Never 'ape in' - always research first.",
  },
  dyor: {
    term: "DYOR (Do Your Own Research)",
    definition:
      "The most important rule in crypto. Never invest based solely on tips from others, especially strangers. Verify everything independently.",
  },
  nfa: {
    term: "NFA (Not Financial Advice)",
    definition:
      "A disclaimer used by promoters. Ironically, scammers often use this while clearly giving financial advice. The disclaimer doesn't protect them or you.",
  },
};

/**
 * Risk Level Terms
 */
export const CRYPTO_RISK_LEVEL_TERMS: Record<string, GlossaryTerm> = {
  riskScore: {
    term: "Risk Score",
    definition:
      "A number calculated by adding up all warning signals detected. Each signal has a weight based on severity. Higher scores indicate more or stronger red flags.",
  },
  lowRisk: {
    term: "Low Risk",
    definition:
      "Few warning signs detected. This does NOT mean the crypto is safe - it means our scan found limited red flags. All crypto investments carry significant risk.",
  },
  mediumRisk: {
    term: "Medium Risk",
    definition:
      "Some warning signs detected. The token shows characteristics sometimes associated with scams. Thorough research is strongly recommended before any investment.",
  },
  highRisk: {
    term: "High Risk",
    definition:
      "Multiple significant warning signs detected. The token shows patterns commonly seen in rug pulls, honeypots, or pump-and-dump schemes. Extreme caution advised.",
  },
  insufficient: {
    term: "Insufficient Data",
    definition:
      "We couldn't find enough data to perform a complete analysis. Very new tokens or those on unsupported chains may show this. Lack of data is itself a risk factor.",
  },
};

/**
 * Helper function to get a term definition by key
 */
export function getCryptoTermDefinition(key: string): GlossaryTerm | undefined {
  const allTerms = {
    ...CRYPTO_SUMMARY_TERMS,
    ...CONTRACT_SECURITY_TERMS,
    ...TRADING_TERMS,
    ...LIQUIDITY_TERMS,
    ...DISTRIBUTION_TERMS,
    ...PATTERN_TERMS,
    ...BEHAVIORAL_TERMS,
    ...CRYPTO_RISK_LEVEL_TERMS,
  };
  return allTerms[key];
}

/**
 * All crypto glossary terms combined
 */
export const ALL_CRYPTO_GLOSSARY_TERMS = {
  ...CRYPTO_SUMMARY_TERMS,
  ...CONTRACT_SECURITY_TERMS,
  ...TRADING_TERMS,
  ...LIQUIDITY_TERMS,
  ...DISTRIBUTION_TERMS,
  ...PATTERN_TERMS,
  ...BEHAVIORAL_TERMS,
  ...CRYPTO_RISK_LEVEL_TERMS,
};
