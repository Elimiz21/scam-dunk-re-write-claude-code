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
 * @returns Narrative object with header, red flags, suggestions, and disclaimers
 */
export async function generateNarrative(
  riskLevel: RiskLevel,
  totalScore: number,
  signals: RiskSignal[],
  stockSummary: StockSummary
): Promise<Narrative> {
  // If OpenAI is not configured, use fallback narrative
  if (!config.openaiApiKey) {
    return generateFallbackNarrative(riskLevel, totalScore, signals, stockSummary);
  }

  try {
    const openai = getOpenAI();
    const { structural, pattern, behavioral, alert } = getSignalsByCategory(signals);

    const prompt = buildPrompt(riskLevel, totalScore, signals, stockSummary, {
      structural,
      pattern,
      behavioral,
      alert,
    });

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
    return generateFallbackNarrative(riskLevel, totalScore, signals, stockSummary);
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
  }
): string {
  return `Generate a narrative for a stock risk analysis with the following data:

RISK LEVEL: ${riskLevel}
TOTAL SCORE: ${totalScore}

STOCK SUMMARY:
- Ticker: ${stockSummary.ticker}
- Company: ${stockSummary.companyName || "Unknown"}
- Exchange: ${stockSummary.exchange || "Unknown"}
- Price: ${stockSummary.lastPrice ? `$${stockSummary.lastPrice.toFixed(2)}` : "N/A"}
- Market Cap: ${stockSummary.marketCap ? `$${(stockSummary.marketCap / 1_000_000).toFixed(1)}M` : "N/A"}

SIGNALS DETECTED:
${signals.map((s) => `- [${s.category}] ${s.code}: ${s.description} (weight: ${s.weight})`).join("\n")}

Generate a JSON response with this exact structure:
{
  "header": "A one-sentence summary appropriate for the ${riskLevel} risk level",
  "stockRedFlags": ["Array of bullet points about stock/market signals - one per signal from STRUCTURAL, PATTERN, and ALERT categories"],
  "behaviorRedFlags": ["Array of bullet points about behavioral signals - one per signal from BEHAVIORAL category"],
  "suggestions": ["3-4 actionable suggestions for the user, like 'Verify this through official SEC filings' or 'Be wary of time pressure tactics'"],
  "disclaimers": ["1-2 short disclaimers reminding this is not financial advice"]
}

IMPORTANT:
- The header should reflect the ${riskLevel} level appropriately
- Each red flag should be a clear, simple explanation
- Suggestions should be practical and educational
- Do not recommend buying or selling
- Do not say the stock is safe or a scam definitively`;
}

/**
 * Generate fallback narrative without LLM
 * Used when OpenAI is not configured or fails
 */
function generateFallbackNarrative(
  riskLevel: RiskLevel,
  totalScore: number,
  signals: RiskSignal[],
  stockSummary: StockSummary
): Narrative {
  const { structural, pattern, behavioral, alert } = getSignalsByCategory(signals);

  // Generate header based on risk level
  let header: string;
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
      header = `Unable to provide a complete risk assessment for ${stockSummary.ticker}. Limited data available or this is a large, established company with no behavioral red flags.`;
      break;
  }

  // Stock red flags from structural, pattern, and alert signals
  const stockRedFlags: string[] = [...structural, ...pattern, ...alert].map(
    (s) => s.description
  );

  // Behavioral red flags
  const behaviorRedFlags: string[] = behavioral.map((s) => s.description);

  // Generate suggestions based on signals present
  const suggestions: string[] = [
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
