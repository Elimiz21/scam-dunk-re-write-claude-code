/**
 * Crypto Narrative Generation Module
 *
 * Uses an LLM to generate human-readable narrative text from crypto risk signals.
 * The LLM does NOT change the risk score or level - those are computed deterministically.
 */

import OpenAI from "openai";
import { config } from "../config";
import { RiskLevel } from "../types";
import { CryptoRiskSignal, CryptoSummary, CryptoNarrative } from "./types";
import { getCryptoSignalsByCategory } from "./scoring";

// Initialize OpenAI client (lazy initialization)
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!config.openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openaiClient = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }
  return openaiClient;
}

/**
 * Generate narrative from crypto risk analysis results
 */
export async function generateCryptoNarrative(
  riskLevel: RiskLevel,
  totalScore: number,
  signals: CryptoRiskSignal[],
  cryptoSummary: CryptoSummary,
  isLegitimate: boolean = false
): Promise<CryptoNarrative> {
  // If OpenAI is not configured, use fallback narrative
  if (!config.openaiApiKey) {
    return generateFallbackNarrative(
      riskLevel,
      totalScore,
      signals,
      cryptoSummary,
      isLegitimate
    );
  }

  try {
    const openai = getOpenAI();
    const categorizedSignals = getCryptoSignalsByCategory(signals);

    const prompt = buildPrompt(
      riskLevel,
      totalScore,
      signals,
      cryptoSummary,
      categorizedSignals,
      isLegitimate
    );

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a cryptocurrency risk communication assistant for ScamDunk, a tool that helps retail investors identify potential scam red flags in crypto pitches.

Your job is to generate clear, helpful narrative text that explains risk signals to users.

IMPORTANT RULES:
1. NEVER change the risk level or score - those are predetermined
2. NEVER give buy/sell advice or recommendations
3. NEVER say a token is "safe" or "a good investment"
4. Always be factual and educational
5. Keep language simple and accessible to retail investors
6. Emphasize that this is informational only, not financial advice
7. For crypto specifically, highlight the unique risks: rug pulls, honeypots, contract exploits

Output must be valid JSON matching the exact schema provided.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content) as CryptoNarrative;

    // Validate response has required fields
    if (
      !parsed.header ||
      !Array.isArray(parsed.marketRedFlags) ||
      !Array.isArray(parsed.contractRedFlags) ||
      !Array.isArray(parsed.behaviorRedFlags) ||
      !Array.isArray(parsed.suggestions) ||
      !Array.isArray(parsed.disclaimers)
    ) {
      throw new Error("Invalid narrative structure from LLM");
    }

    return parsed;
  } catch (error) {
    console.error("Error generating crypto narrative with LLM:", error);
    return generateFallbackNarrative(
      riskLevel,
      totalScore,
      signals,
      cryptoSummary,
      isLegitimate
    );
  }
}

/**
 * Build the prompt for the LLM
 */
function buildPrompt(
  riskLevel: RiskLevel,
  totalScore: number,
  signals: CryptoRiskSignal[],
  cryptoSummary: CryptoSummary,
  categorizedSignals: ReturnType<typeof getCryptoSignalsByCategory>,
  isLegitimate: boolean
): string {
  const legitimateNote = isLegitimate
    ? `\n\nNOTE: This is a well-established cryptocurrency with significant market cap and volume. No major scam red flags were detected. The tone should be reassuring but still encourage due diligence.`
    : "";

  const signalsSection =
    signals.length > 0
      ? `SIGNALS DETECTED:\n${signals
          .map(
            (s) =>
              `- [${s.category}] ${s.code}: ${s.description} (weight: ${s.weight})`
          )
          .join("\n")}`
      : "SIGNALS DETECTED: None - no risk signals were triggered for this cryptocurrency.";

  const marketRedFlagsInstruction =
    isLegitimate ||
    (categorizedSignals.structural.length === 0 &&
      categorizedSignals.pattern.length === 0)
      ? "No concerning market signals detected"
      : "Array of bullet points about market/trading pattern signals";

  const contractRedFlagsInstruction =
    categorizedSignals.contract.length === 0 &&
    categorizedSignals.liquidity.length === 0 &&
    categorizedSignals.distribution.length === 0
      ? "No contract security issues detected (or security data not available)"
      : "Array of bullet points about smart contract, liquidity, and token distribution issues";

  const hasBehavioralSignals = categorizedSignals.behavioral.length > 0;
  const behaviorRedFlagsInstruction = hasBehavioralSignals
    ? "Array of bullet points about behavioral signals from the pitch"
    : "No behavioral red flags detected";

  return `Generate a narrative for a cryptocurrency risk analysis with the following data:

RISK LEVEL: ${riskLevel}
TOTAL SCORE: ${totalScore}
IS LEGITIMATE/ESTABLISHED: ${isLegitimate}${legitimateNote}

CRYPTO SUMMARY:
- Symbol: ${cryptoSummary.symbol}
- Name: ${cryptoSummary.name}
- Blockchain: ${cryptoSummary.blockchain || "Unknown"}
- Price: ${cryptoSummary.lastPrice ? `$${cryptoSummary.lastPrice.toFixed(6)}` : "N/A"}
- Market Cap: ${cryptoSummary.marketCap ? `$${formatLargeNumber(cryptoSummary.marketCap)}` : "N/A"}
- 24h Volume: ${cryptoSummary.volume24h ? `$${formatLargeNumber(cryptoSummary.volume24h)}` : "N/A"}
- 24h Change: ${cryptoSummary.priceChange24h !== undefined ? `${cryptoSummary.priceChange24h.toFixed(2)}%` : "N/A"}
- Contract: ${cryptoSummary.contractAddress || "N/A (not a token)"}

${signalsSection}

Generate a JSON response with this exact structure:
{
  "header": "A one-sentence summary appropriate for the ${riskLevel} risk level",
  "marketRedFlags": ["${marketRedFlagsInstruction}"],
  "contractRedFlags": ["${contractRedFlagsInstruction}"],
  "behaviorRedFlags": ["${behaviorRedFlagsInstruction}"],
  "suggestions": ["3-4 actionable suggestions like 'Check if liquidity is locked on DEX tools' or 'Verify contract on block explorer'"],
  "disclaimers": ["1-2 short disclaimers about crypto volatility and not being financial advice"]
}

IMPORTANT:
- The header should reflect the ${riskLevel} level appropriately
- Each red flag should be a clear, simple explanation
- Suggestions should be practical and crypto-specific
- Do not recommend buying or selling
- Crypto has unique risks (rug pulls, honeypots) - address these if relevant`;
}

/**
 * Format large numbers for display
 */
function formatLargeNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }
  return num.toFixed(2);
}

/**
 * Generate fallback narrative without LLM
 */
function generateFallbackNarrative(
  riskLevel: RiskLevel,
  totalScore: number,
  signals: CryptoRiskSignal[],
  cryptoSummary: CryptoSummary,
  isLegitimate: boolean
): CryptoNarrative {
  const categorizedSignals = getCryptoSignalsByCategory(signals);

  // Generate header based on risk level and legitimacy
  let header: string;

  if (isLegitimate) {
    header = `${cryptoSummary.symbol} appears to be an established cryptocurrency. No major scam red flags detected. As always, crypto is volatile - do your own research.`;
  } else {
    switch (riskLevel) {
      case "HIGH":
        header = `Multiple high-risk signals detected for ${cryptoSummary.symbol}. This token shows patterns commonly associated with crypto scams or rug pulls.`;
        break;
      case "MEDIUM":
        header = `Some risk signals detected for ${cryptoSummary.symbol}. Exercise caution and thoroughly research before considering any investment.`;
        break;
      case "LOW":
        header = `Few risk signals detected for ${cryptoSummary.symbol}. However, all crypto investments carry significant risk - always do your due diligence.`;
        break;
      case "INSUFFICIENT":
        header = `Unable to provide a complete risk assessment for ${cryptoSummary.symbol}. Limited market or security data available.`;
        break;
    }
  }

  // Market red flags from structural and pattern signals
  let marketRedFlags: string[];
  if (
    isLegitimate ||
    (categorizedSignals.structural.length === 0 &&
      categorizedSignals.pattern.length === 0)
  ) {
    marketRedFlags = ["No concerning market signals detected for this cryptocurrency"];
  } else {
    marketRedFlags = [
      ...categorizedSignals.structural,
      ...categorizedSignals.pattern,
    ].map((s) => s.description);
  }

  // Contract red flags from contract, liquidity, and distribution signals
  let contractRedFlags: string[];
  if (
    categorizedSignals.contract.length === 0 &&
    categorizedSignals.liquidity.length === 0 &&
    categorizedSignals.distribution.length === 0
  ) {
    contractRedFlags = [
      "No contract security issues detected (or security data unavailable)",
    ];
  } else {
    contractRedFlags = [
      ...categorizedSignals.contract,
      ...categorizedSignals.liquidity,
      ...categorizedSignals.distribution,
    ].map((s) => s.description);
  }

  // Behavioral red flags
  let behaviorRedFlags: string[];
  if (categorizedSignals.behavioral.length === 0) {
    behaviorRedFlags = ["No behavioral red flags detected from the pitch"];
  } else {
    behaviorRedFlags = categorizedSignals.behavioral.map((s) => s.description);
  }

  // Generate suggestions based on signals
  let suggestions: string[];

  if (isLegitimate) {
    suggestions = [
      "Even established cryptocurrencies can be highly volatile",
      "Consider your risk tolerance and investment timeline",
      "Never invest more than you can afford to lose",
      "Use reputable exchanges and secure wallets",
    ];
  } else {
    suggestions = [
      "Check if liquidity is locked using tools like DEXTools or GeckoTerminal",
      "Verify the contract on the block explorer (Etherscan, BSCScan, etc.)",
      "Research the team - anonymous teams are higher risk",
      "Never invest more than you can afford to lose completely",
    ];

    if (categorizedSignals.contract.length > 0) {
      suggestions.unshift(
        "Contract has security concerns - consider consulting a security audit"
      );
    }

    if (categorizedSignals.behavioral.length > 0) {
      suggestions.unshift(
        "Be extremely skeptical of unsolicited crypto tips and guaranteed return claims"
      );
    }
  }

  // Crypto-specific disclaimers
  const disclaimers: string[] = [
    "ScamDunk provides informational analysis only. This is not financial advice.",
    "Cryptocurrency investments are highly volatile and can result in total loss of funds.",
  ];

  return {
    header,
    marketRedFlags,
    contractRedFlags,
    behaviorRedFlags,
    suggestions,
    disclaimers,
  };
}

/**
 * Get a simple header without LLM
 */
export function getCryptoQuickHeader(
  riskLevel: RiskLevel,
  symbol: string
): string {
  switch (riskLevel) {
    case "HIGH":
      return `High-risk signals detected for ${symbol}`;
    case "MEDIUM":
      return `Moderate risk signals detected for ${symbol}`;
    case "LOW":
      return `Low risk signals for ${symbol}`;
    case "INSUFFICIENT":
      return `Insufficient data to assess ${symbol}`;
  }
}
