/**
 * Narrative Generation Module
 *
 * Uses an LLM to generate human-readable narrative text from risk signals.
 * The LLM does NOT change the risk score or level - those are computed deterministically.
 * The LLM only generates explanatory text.
 */

import OpenAI from "openai";
import { config } from "./config";
import { RiskLevel, RiskSignal, StockSummary, Narrative } from "./types";
import { getSignalsByCategory } from "./scoring";

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
 * Generate narrative from risk analysis results
 *
 * @param riskLevel - Predetermined risk level (LOW/MEDIUM/HIGH/INSUFFICIENT)
 * @param totalScore - Numeric risk score
 * @param signals - List of triggered risk signals
 * @param stockSummary - Basic stock information
 * @param isLegitimate - Whether this is a well-established legitimate company
 * @returns Narrative object with header, red flags, suggestions, and disclaimers
 */
export async function generateNarrative(
  riskLevel: RiskLevel,
  totalScore: number,
  signals: RiskSignal[],
  stockSummary: StockSummary,
  isLegitimate: boolean = false
): Promise<Narrative> {
  // If OpenAI is not configured, use fallback narrative
  if (!config.openaiApiKey) {
    return generateFallbackNarrative(riskLevel, totalScore, signals, stockSummary, isLegitimate);
  }

  try {
    const openai = getOpenAI();
    const { structural, pattern, behavioral, alert } = getSignalsByCategory(signals);

    const prompt = buildPrompt(riskLevel, totalScore, signals, stockSummary, {
      structural,
      pattern,
      behavioral,
      alert,
    }, isLegitimate);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a financial risk communication assistant for ScamDunk, a tool that helps retail investors identify potential scam red flags in stock pitches.

Your job is to generate clear, helpful narrative text that explains risk signals to users.

IMPORTANT RULES:
1. NEVER change the risk level or score - those are predetermined
2. NEVER give buy/sell advice or recommendations
3. NEVER say a stock is "safe" or "a good investment"
4. Always be factual and educational
5. Keep language simple and accessible to retail investors
6. Emphasize that this is informational only, not financial advice

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

    const parsed = JSON.parse(content) as Narrative;

    // Validate response has required fields
    if (
      !parsed.header ||
      !Array.isArray(parsed.stockRedFlags) ||
      !Array.isArray(parsed.behaviorRedFlags) ||
      !Array.isArray(parsed.suggestions) ||
      !Array.isArray(parsed.disclaimers)
    ) {
      throw new Error("Invalid narrative structure from LLM");
    }

    return parsed;
  } catch (error) {
    console.error("Error generating narrative with LLM:", error);
    // Fall back to deterministic narrative
    return generateFallbackNarrative(riskLevel, totalScore, signals, stockSummary, isLegitimate);
  }
}

/**
 * Build the prompt for the LLM
 */
function buildPrompt(
  riskLevel: RiskLevel,
  totalScore: number,
  signals: RiskSignal[],
  stockSummary: StockSummary,
  categorizedSignals: {
    structural: RiskSignal[];
    pattern: RiskSignal[];
    behavioral: RiskSignal[];
    alert: RiskSignal[];
  },
  isLegitimate: boolean = false
): string {
  const legitimateNote = isLegitimate
    ? `\n\nNOTE: This is a well-established, large-cap company traded on a major exchange with high liquidity. No scam red flags were detected. The tone should be reassuring but still encourage due diligence.`
    : `\n\nNOTE: "isLegitimate: false" does NOT mean the company is illegitimate or a scam. It simply means we haven't confirmed it as a well-known blue-chip stock. Many perfectly normal companies have this flag as false. Do NOT say the company is "not recognized as legitimate" or anything similar - that would be misleading.`;

  const signalsSection = signals.length > 0
    ? `SIGNALS DETECTED:\n${signals.map((s) => `- [${s.category}] ${s.code}: ${s.description} (weight: ${s.weight})`).join("\n")}`
    : "SIGNALS DETECTED: None - no risk signals were triggered for this stock.";

  const headerInstruction = isLegitimate
    ? "A one-sentence summary with positive tone since this is a well-established company"
    : `A one-sentence summary appropriate for the ${riskLevel} risk level`;

  const stockRedFlagsInstruction = isLegitimate
    ? "No concerning market signals detected for this well-established company"
    : "Array of bullet points about stock/market signals - one per signal from STRUCTURAL, PATTERN, and ALERT categories";

  const hasBehavioralSignals = signals.filter(s => s.category === 'BEHAVIORAL').length > 0;
  const behaviorRedFlagsInstruction = hasBehavioralSignals
    ? "Array of bullet points about behavioral signals - one per signal from BEHAVIORAL category"
    : "No behavioral red flags detected";

  const suggestionsInstruction = isLegitimate
    ? "3-4 actionable suggestions focusing on general investment best practices"
    : "3-4 actionable suggestions like 'Verify this through official SEC filings' or 'Be wary of time pressure tactics'";

  const finalImportant = isLegitimate
    ? "For legitimate companies with no red flags, the tone should be positive and reassuring"
    : "Do not say the stock is safe or a scam definitively";

  return `Generate a narrative for a stock risk analysis with the following data:

RISK LEVEL: ${riskLevel}
TOTAL SCORE: ${totalScore}
IS CONFIRMED BLUE-CHIP: ${isLegitimate}${legitimateNote}

STOCK SUMMARY:
- Ticker: ${stockSummary.ticker}
- Company: ${stockSummary.companyName || "Unknown"}
- Exchange: ${stockSummary.exchange || "Unknown"}
- Price: ${stockSummary.lastPrice ? `$${stockSummary.lastPrice.toFixed(2)}` : "N/A"}
- Market Cap: ${stockSummary.marketCap ? `$${(stockSummary.marketCap / 1_000_000).toFixed(1)}M` : "N/A"}

${signalsSection}

Generate a JSON response with this exact structure:
{
  "header": "${headerInstruction}",
  "stockRedFlags": ["${stockRedFlagsInstruction}"],
  "behaviorRedFlags": ["${behaviorRedFlagsInstruction}"],
  "suggestions": ["${suggestionsInstruction}"],
  "disclaimers": ["1-2 short disclaimers reminding this is not financial advice"]
}

IMPORTANT:
- The header should reflect the ${riskLevel} level appropriately
- Each red flag should be a clear, simple explanation
- Suggestions should be practical and educational
- Do not recommend buying or selling
- ${finalImportant}`;
}

/**
 * Generate fallback narrative without LLM
 * Used when OpenAI is not configured or fails
 */
function generateFallbackNarrative(
  riskLevel: RiskLevel,
  totalScore: number,
  signals: RiskSignal[],
  stockSummary: StockSummary,
  isLegitimate: boolean = false
): Narrative {
  const { structural, pattern, behavioral, alert } = getSignalsByCategory(signals);

  // Generate header based on risk level and legitimacy
  let header: string;

  if (isLegitimate) {
    header = `${stockSummary.ticker} appears to be a well-established company. No scam red flags detected. As always, do your own research before investing.`;
  } else {
    switch (riskLevel) {
      case "HIGH":
        header = `Multiple high-risk signals detected for ${stockSummary.ticker}. This pitch shows patterns commonly associated with stock scams.`;
        break;
      case "MEDIUM":
        header = `Some risk signals detected for ${stockSummary.ticker}. Exercise caution and do additional research before considering any investment.`;
        break;
      case "LOW":
        header = `Few risk signals detected for ${stockSummary.ticker}. However, always conduct your own due diligence before investing.`;
        break;
      case "INSUFFICIENT":
        header = `Unable to provide a complete risk assessment for ${stockSummary.ticker}. Limited market data available for analysis.`;
        break;
    }
  }

  // Stock red flags from structural, pattern, and alert signals
  let stockRedFlags: string[];
  if (isLegitimate || (structural.length === 0 && pattern.length === 0 && alert.length === 0)) {
    stockRedFlags = ["No concerning market signals detected for this stock"];
  } else {
    stockRedFlags = [...structural, ...pattern, ...alert].map((s) => s.description);
  }

  // Behavioral red flags
  let behaviorRedFlags: string[];
  if (behavioral.length === 0) {
    behaviorRedFlags = ["No behavioral red flags detected"];
  } else {
    behaviorRedFlags = behavioral.map((s) => s.description);
  }

  // Generate suggestions based on legitimacy and signals present
  let suggestions: string[];

  if (isLegitimate) {
    suggestions = [
      "Even established companies can be overvalued - check current valuation metrics",
      "Review recent quarterly earnings and guidance",
      "Consider how this fits your overall portfolio diversification",
      "Never invest money you cannot afford to lose",
    ];
  } else {
    suggestions = [
      "Research the company through official SEC filings at sec.gov",
      "Check for recent news from reputable financial sources",
      "Never invest money you cannot afford to lose",
    ];

    if (behavioral.length > 0) {
      suggestions.unshift(
        "Be skeptical of unsolicited stock tips and high-pressure tactics"
      );
    }

    if (structural.length > 0 || pattern.length > 0) {
      suggestions.push(
        "Penny stocks and OTC stocks have higher manipulation risk"
      );
    }
  }

  // Disclaimers
  const disclaimers: string[] = [
    "ScamDunk provides informational analysis only. This is not financial advice.",
    "Always consult a licensed financial advisor before making investment decisions.",
  ];

  return {
    header,
    stockRedFlags,
    behaviorRedFlags,
    suggestions,
    disclaimers,
  };
}

/**
 * Get a simple header without LLM
 * Useful for quick responses
 */
export function getQuickHeader(riskLevel: RiskLevel, ticker: string): string {
  switch (riskLevel) {
    case "HIGH":
      return `High-risk signals detected for ${ticker}`;
    case "MEDIUM":
      return `Moderate risk signals detected for ${ticker}`;
    case "LOW":
      return `Low risk signals for ${ticker}`;
    case "INSUFFICIENT":
      return `Insufficient data to assess ${ticker}`;
  }
}
