/**
 * Glossary of Technical Terms
 *
 * Contains definitions for technical financial and statistical terms
 * displayed in the scan results. These definitions are written for
 * users without a background in finance or statistics.
 */

export interface GlossaryTerm {
  term: string;
  definition: string;
}

/**
 * Stock Summary Terms
 */
export const STOCK_SUMMARY_TERMS: Record<string, GlossaryTerm> = {
  exchange: {
    term: "Exchange",
    definition:
      "The marketplace where the stock is traded. Major exchanges like NYSE and NASDAQ have stricter listing requirements and more regulatory oversight than OTC (over-the-counter) markets.",
  },
  marketCap: {
    term: "Market Cap",
    definition:
      "Market capitalization - the total value of all shares of the company. Calculated by multiplying the stock price by the number of shares. Larger market caps generally mean more established companies.",
  },
  avgVolume: {
    term: "Average Volume",
    definition:
      "The average dollar amount of shares traded per day over the last 30 days. Higher volume means more people are buying and selling, making it harder to manipulate the price.",
  },
  lastPrice: {
    term: "Price",
    definition:
      "The most recent trading price of one share. Stocks under $5 are often called 'penny stocks' and carry higher manipulation risk.",
  },
};

/**
 * Risk Signal Terms - Structural
 */
export const STRUCTURAL_SIGNAL_TERMS: Record<string, GlossaryTerm> = {
  pennyStock: {
    term: "Penny Stock",
    definition:
      "A stock trading below $5 per share. Penny stocks are often targeted by scammers because their low prices and small market caps make them easier to manipulate.",
  },
  smallMarketCap: {
    term: "Small Market Cap",
    definition:
      "Companies valued under $300 million. Smaller companies have fewer shares traded, making it easier for bad actors to artificially inflate or deflate the price.",
  },
  microLiquidity: {
    term: "Low Liquidity",
    definition:
      "When very few shares are traded daily (under $150K). Low liquidity means a single large purchase can dramatically move the price, making manipulation easier.",
  },
  otcMarket: {
    term: "OTC Market",
    definition:
      "Over-the-Counter market - a decentralized market where stocks are traded directly between parties rather than on a major exchange. OTC stocks have less regulatory oversight and disclosure requirements.",
  },
};

/**
 * Risk Signal Terms - Pattern Detection
 */
export const PATTERN_SIGNAL_TERMS: Record<string, GlossaryTerm> = {
  priceSpike: {
    term: "Price Spike",
    definition:
      "A rapid, dramatic increase in stock price over a short period (often 7 days or less). Sudden spikes without clear news or catalysts are often signs of artificial price manipulation.",
  },
  volumeExplosion: {
    term: "Volume Explosion",
    definition:
      "When trading volume suddenly increases to many times (5-10x) its normal average. This can indicate coordinated buying by scammers trying to drive up the price.",
  },
  pumpAndDump: {
    term: "Pump-and-Dump",
    definition:
      "A fraud scheme where scammers artificially inflate (pump) a stock's price through misleading promotion, then sell their shares at the peak (dump), causing the price to crash and leaving other investors with losses.",
  },
  spikeThenDrop: {
    term: "Spike Then Drop",
    definition:
      "A pattern where the price rises dramatically (50%+) then falls sharply (40%+). This is the signature pattern of a pump-and-dump scheme after the scammers have sold.",
  },
};

/**
 * Risk Signal Terms - Anomaly Detection
 */
export const ANOMALY_SIGNAL_TERMS: Record<string, GlossaryTerm> = {
  priceAnomaly: {
    term: "Price Anomaly",
    definition:
      "A price movement that is statistically unusual compared to the stock's historical behavior. Our system uses mathematical analysis to detect movements that are highly unlikely to occur naturally.",
  },
  volumeAnomaly: {
    term: "Volume Anomaly",
    definition:
      "Trading volume that is statistically abnormal. Unusual volume spikes can indicate coordinated buying or selling, often seen in manipulation schemes.",
  },
  rsi: {
    term: "RSI (Relative Strength Index)",
    definition:
      "A momentum indicator measuring how fast prices are changing. RSI above 70 means 'overbought' - the price may have risen too quickly and could be due for a correction.",
  },
  overbought: {
    term: "Overbought",
    definition:
      "When a stock's price has risen rapidly and may be higher than its true value. Overbought conditions often precede price drops as the market corrects itself.",
  },
  volatility: {
    term: "Volatility",
    definition:
      "How much a stock's price fluctuates over time. High volatility means unpredictable price swings, which increases both risk and the potential for manipulation.",
  },
  extremeSurge: {
    term: "Extreme Surge",
    definition:
      "A very rapid price increase that lacks an obvious explanation (like earnings news or a product launch). Unexplained surges are often driven by artificial hype.",
  },
  zScore: {
    term: "Statistical Analysis",
    definition:
      "We use mathematical methods to compare current price/volume behavior to historical patterns. Movements that are highly unusual (statistically speaking) may indicate manipulation.",
  },
};

/**
 * Risk Signal Terms - Behavioral
 */
export const BEHAVIORAL_SIGNAL_TERMS: Record<string, GlossaryTerm> = {
  unsolicited: {
    term: "Unsolicited Tip",
    definition:
      "A stock recommendation you received without asking for it - via email, text, social media, or from a stranger. Legitimate investment advice is rarely pushed on people unexpectedly.",
  },
  promisedReturns: {
    term: "Guaranteed Returns",
    definition:
      "When someone promises specific profits or guarantees you'll make money. No legitimate investment can guarantee returns - all investments carry risk.",
  },
  urgencyPressure: {
    term: "Urgency Tactics",
    definition:
      "Pressure to 'act now' or 'buy today before it's too late.' Scammers create false urgency to prevent you from researching or thinking critically about the investment.",
  },
  secrecyInsider: {
    term: "Insider Information Claims",
    definition:
      "Claims of 'secret' or 'insider' information. Trading on actual insider information is illegal, and 'tips' claiming to be insider info are almost always fabricated to create false credibility.",
  },
  specificReturnClaim: {
    term: "Specific Return Promises",
    definition:
      "Claims like '100% gains in 30 days' or '10x your money in a month.' Specific percentage promises are a major red flag - no one can predict exact returns.",
  },
};

/**
 * Risk Level Terms
 */
export const RISK_LEVEL_TERMS: Record<string, GlossaryTerm> = {
  riskScore: {
    term: "Risk Score",
    definition:
      "A number calculated by adding up all the warning signs (signals) we detected. Each signal has a weight based on how strongly it indicates potential fraud. Higher scores mean more or stronger red flags.",
  },
  lowRisk: {
    term: "Low Risk",
    definition:
      "Few warning signs detected. This doesn't mean the stock is safe or a good investment - it means our scan found limited red flags associated with common scams.",
  },
  mediumRisk: {
    term: "Medium Risk",
    definition:
      "Some warning signs detected. The stock shows characteristics that are sometimes associated with scams or manipulation. Additional research is strongly recommended.",
  },
  highRisk: {
    term: "High Risk",
    definition:
      "Multiple significant warning signs detected. The stock shows patterns commonly seen in pump-and-dump schemes or other manipulation tactics. Extreme caution advised.",
  },
  insufficient: {
    term: "Insufficient Data",
    definition:
      "We couldn't find enough market data to perform a complete analysis. This often happens with very new stocks or those not actively traded.",
  },
};

/**
 * General Financial Terms
 */
export const GENERAL_TERMS: Record<string, GlossaryTerm> = {
  regulatory: {
    term: "Regulatory Oversight",
    definition:
      "Supervision by government agencies like the SEC (Securities and Exchange Commission). More oversight means stricter rules, required disclosures, and better investor protection.",
  },
  secFilings: {
    term: "SEC Filings",
    definition:
      "Official documents companies must submit to the Securities and Exchange Commission. These include financial statements and are publicly available at sec.gov.",
  },
  dueDiligence: {
    term: "Due Diligence",
    definition:
      "The research and analysis you should do before investing. This includes reviewing financial statements, understanding the business, and verifying claims made about the company.",
  },
  alertList: {
    term: "Alert List",
    definition:
      "A list of stocks that regulators have flagged for potential problems, trading suspensions, or investor warnings. Being on this list is a serious red flag.",
  },
};

/**
 * Helper function to get a term definition by key
 */
export function getTermDefinition(key: string): GlossaryTerm | undefined {
  const allTerms = {
    ...STOCK_SUMMARY_TERMS,
    ...STRUCTURAL_SIGNAL_TERMS,
    ...PATTERN_SIGNAL_TERMS,
    ...ANOMALY_SIGNAL_TERMS,
    ...BEHAVIORAL_SIGNAL_TERMS,
    ...RISK_LEVEL_TERMS,
    ...GENERAL_TERMS,
  };
  return allTerms[key];
}

/**
 * All glossary terms combined
 */
export const ALL_GLOSSARY_TERMS = {
  ...STOCK_SUMMARY_TERMS,
  ...STRUCTURAL_SIGNAL_TERMS,
  ...PATTERN_SIGNAL_TERMS,
  ...ANOMALY_SIGNAL_TERMS,
  ...BEHAVIORAL_SIGNAL_TERMS,
  ...RISK_LEVEL_TERMS,
  ...GENERAL_TERMS,
};
