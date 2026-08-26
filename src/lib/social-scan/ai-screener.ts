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

/** Batch size for GPT-4o-mini requests — small enough that a 10-item response
 * fits comfortably under max_tokens so the JSON is never truncated (SOC-M2). */
const BATCH_SIZE = 10;

/** Max concurrent GPT-4o-mini requests to avoid rate limiting */
const MAX_CONCURRENCY = 5;

/** Per-request client timeout for the OpenAI call (SOC-M2). */
const REQUEST_TIMEOUT_MS = 20_000;

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

  // Classify a batch, retrying ONCE on failure/empty before giving up — a
  // truncated or rate-limited response used to silently drop the whole batch
  // (up to 25 classifications). Smaller batches + a retry recover them (SOC-M2).
  async function classifyWithRetry(
    mentionsToClassify: SocialMention[],
  ): Promise<ScreeningResult[]> {
    try {
      const first = await classifyBatch(mentionsToClassify);
      if (first.length > 0) return first;
    } catch (err: any) {
      console.warn(
        `[AI Screener] Batch failed (${err?.message || err}) — retrying once`,
      );
    }
    // Retry once (covers transient timeouts/rate limits and empty parses)
    return classifyBatch(mentionsToClassify);
  }

  // Process batches in parallel (MAX_CONCURRENCY at a time)
  for (let i = 0; i < batches.length; i += MAX_CONCURRENCY) {
    const chunk = batches.slice(i, i + MAX_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((batch) => classifyWithRetry(batch.map((b) => b.mention))),
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

  const response = await openai.chat.completions.create(
    {
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 1500,
      // Force valid JSON so a stray prose preamble can't break parsing (SOC-M2).
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a financial fraud classifier. For each social media mention about a stock, classify it as:
- "scam": Clearly designed to manipulate — paid alerts, pump-and-dump coordination, fake DD, bot spam, guaranteed returns, urgency pressure
- "suspicious": Could be manipulation but unclear — new accounts hyping, aggressive price targets, promo-adjacent language
- "legitimate": Normal stock discussion — trader sharing a thesis, technical analysis, earnings discussion, news commentary, even if enthusiastic

IMPORTANT: Legitimate traders can be bullish and use casual language ("loading the boat", "this is going to run"). That's NOT a scam.
A scam involves DECEPTION or MANIPULATION — fake credentials, coordinated pumping, selling alert services, promising guaranteed returns.

Respond with ONLY a JSON object of the form: {"classifications":[{"index":0,"classification":"scam|suspicious|legitimate","reason":"brief reason"}]}`,
        },
        {
          role: "user",
          content: `Classify these ${mentions.length} social media stock mentions and return a JSON object with a "classifications" array:\n\n${JSON.stringify(mentionSummaries)}`,
        },
      ],
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );

  const content = response.choices?.[0]?.message?.content || "";
  if (!content.trim()) {
    console.warn("[AI Screener] Empty response content");
    return [];
  }

  // With response_format the model returns an object; accept either the wrapped
  // {classifications:[...]} shape or a bare array as a fallback.
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) {
      console.warn(
        `[AI Screener] No JSON in response: ${content.substring(0, 100)}`,
      );
      return [];
    }
    try {
      parsed = JSON.parse(
        match[0]
          .replace(/,\s*]/g, "]")
          .replace(/,\s*}/g, "}")
          .replace(/[\u201c\u201d]/g, '"'),
      );
    } catch {
      console.warn(
        `[AI Screener] JSON parse failed: ${content.substring(0, 100)}`,
      );
      return [];
    }
  }

  const arr: any[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.classifications)
      ? parsed.classifications
      : [];

  return arr
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
}
