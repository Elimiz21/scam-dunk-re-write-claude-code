/**
 * AI Scam Screener
 *
 * Post-processes social media mentions using GPT-4o-mini to classify
 * whether content is a genuine scam/pump-and-dump vs legitimate stock discussion.
 *
 * Runs AFTER pattern-based scoring and BEFORE DB storage.
 * Only screens mentions with promotionScore >= 30 (saves API calls on obvious low-risk).
 */

import OpenAI from "openai";
import { config } from "@/lib/config";
import { SocialMention } from "./types";

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!config.openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return openaiClient;
}

/** Minimum pattern score to warrant AI screening (saves API calls) */
const SCREENING_THRESHOLD = 40;

/** Batch size for GPT-4o-mini requests */
const BATCH_SIZE = 25;

/** Max concurrent GPT-4o-mini requests to avoid rate limiting */
const MAX_CONCURRENCY = 5;

interface ScreeningResult {
  /** Index in the batch */
  index: number;
  /** AI classification */
  classification: "scam" | "suspicious" | "legitimate";
  /** Brief reason for the classification */
  reason: string;
}

/**
 * Screen social mentions for scam vs legitimate content using GPT-4o-mini.
 *
 * Mentions with score < SCREENING_THRESHOLD are returned unchanged.
 * Mentions classified as "legitimate" get their score halved and
 * isPromotional set to false.
 *
 * Returns the same array with adjusted scores.
 */
export async function screenMentionsWithAI(
  mentions: SocialMention[],
): Promise<SocialMention[]> {
  if (!config.openaiApiKey) {
    console.warn(
      "[AI Screener] OPENAI_API_KEY not configured — skipping AI screening",
    );
    return mentions;
  }

  // Split into mentions that need screening vs those that don't
  const toScreen: { mention: SocialMention; originalIndex: number }[] = [];
  const result = [...mentions];

  for (let i = 0; i < mentions.length; i++) {
    if (mentions[i].promotionScore >= SCREENING_THRESHOLD) {
      toScreen.push({ mention: mentions[i], originalIndex: i });
    }
  }

  if (toScreen.length === 0) {
    console.log("[AI Screener] No mentions above threshold — skipping");
    return result;
  }

  console.log(
    `[AI Screener] Screening ${toScreen.length}/${mentions.length} mentions (score >= ${SCREENING_THRESHOLD})`,
  );

  // Process in batches
  const batches: { mention: SocialMention; originalIndex: number }[][] = [];
  for (let i = 0; i < toScreen.length; i += BATCH_SIZE) {
    batches.push(toScreen.slice(i, i + BATCH_SIZE));
  }

  let screened = 0;
  let scamCount = 0;
  let suspiciousCount = 0;
  let legitimateCount = 0;
  let errorsCount = 0;

  // Process batches in parallel (MAX_CONCURRENCY at a time)
  for (let i = 0; i < batches.length; i += MAX_CONCURRENCY) {
    const chunk = batches.slice(i, i + MAX_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((batch) => classifyBatch(batch.map((b) => b.mention))),
    );

    for (let j = 0; j < settled.length; j++) {
      const outcome = settled[j];
      const batch = chunk[j];

      if (outcome.status === "rejected") {
        errorsCount++;
        console.error(
          `[AI Screener] Batch error: ${outcome.reason?.message || outcome.reason}`,
        );
        continue;
      }

      for (const classification of outcome.value) {
        if (classification.index < 0 || classification.index >= batch.length)
          continue;

        const { mention, originalIndex } = batch[classification.index];
        screened++;

        if (classification.classification === "legitimate") {
          legitimateCount++;
          result[originalIndex] = {
            ...mention,
            promotionScore: Math.round(mention.promotionScore / 2),
            isPromotional: false,
            redFlags: [
              ...mention.redFlags,
              `[AI] Classified as legitimate: ${classification.reason}`,
            ],
          };
        } else if (classification.classification === "scam") {
          scamCount++;
          result[originalIndex] = {
            ...mention,
            promotionScore: Math.min(mention.promotionScore + 10, 100),
            isPromotional: true,
            redFlags: [
              ...mention.redFlags,
              `[AI] Confirmed scam: ${classification.reason}`,
            ],
          };
        } else {
          suspiciousCount++;
          result[originalIndex] = {
            ...mention,
            redFlags: [
              ...mention.redFlags,
              `[AI] Suspicious: ${classification.reason}`,
            ],
          };
        }
      }
    }
  }

  console.log(
    `[AI Screener] Done: ${screened} screened — ${scamCount} scam, ${suspiciousCount} suspicious, ${legitimateCount} legitimate, ${errorsCount} errors`,
  );

  return result;
}

/**
 * Classify a batch of mentions using GPT-4o-mini.
 */
async function classifyBatch(
  mentions: SocialMention[],
): Promise<ScreeningResult[]> {
  const openai = getOpenAI();

  // Build a compact representation of each mention for the prompt
  const mentionSummaries = mentions.map((m, i) => ({
    index: i,
    platform: m.platform,
    author: m.author,
    title: (m.title || "").substring(0, 100),
    content: (m.content || "").substring(0, 300),
    patternScore: m.promotionScore,
    patternFlags: m.redFlags.slice(0, 5).join("; "),
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 1500,
    messages: [
      {
        role: "system",
        content: `You are a financial fraud classifier. For each social media mention about a stock, classify it as:
- "scam": Clearly designed to manipulate — paid alerts, pump-and-dump coordination, fake DD, bot spam, guaranteed returns, urgency pressure
- "suspicious": Could be manipulation but unclear — new accounts hyping, aggressive price targets, promo-adjacent language
- "legitimate": Normal stock discussion — trader sharing a thesis, technical analysis, earnings discussion, news commentary, even if enthusiastic

IMPORTANT: Legitimate traders can be bullish and use casual language ("loading the boat", "this is going to run"). That's NOT a scam.
A scam involves DECEPTION or MANIPULATION — fake credentials, coordinated pumping, selling alert services, promising guaranteed returns.

Respond with ONLY a JSON array: [{"index":0,"classification":"scam|suspicious|legitimate","reason":"brief reason"}]`,
      },
      {
        role: "user",
        content: `Classify these ${mentions.length} social media stock mentions:\n\n${JSON.stringify(mentionSummaries)}`,
      },
    ],
  });

  const content = response.choices?.[0]?.message?.content || "";

  // Parse the JSON response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn(
      `[AI Screener] No JSON array in response: ${content.substring(0, 100)}`,
    );
    return [];
  }

  try {
    const parsed = JSON.parse(
      jsonMatch[0]
        .replace(/,\s*]/g, "]")
        .replace(/,\s*}/g, "}")
        .replace(/[\u201c\u201d]/g, '"'),
    );
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item: any) =>
          typeof item.index === "number" &&
          ["scam", "suspicious", "legitimate"].includes(item.classification),
      )
      .map((item: any) => ({
        index: item.index,
        classification: item.classification as
          | "scam"
          | "suspicious"
          | "legitimate",
        reason: String(item.reason || "").substring(0, 200),
      }));
  } catch {
    console.warn(
      `[AI Screener] JSON parse failed: ${content.substring(0, 100)}`,
    );
    return [];
  }
}
