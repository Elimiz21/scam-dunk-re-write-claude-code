/**
 * Admin Scan Messages Generate API
 * Uses OpenAI to generate new scan messages
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { logApiUsage } from "@/lib/admin/metrics";
import OpenAI from "openai";

// POST - Generate new messages using AI
export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!config.openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key is not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { count = 15 } = body;

    // Get existing messages for context (avoid duplicates)
    const existingMessages = await prisma.scanMessage.findMany({
      where: { isActive: true },
      select: { headline: true, subtext: true },
    });

    // Get recent discarded feedback to improve generation
    const recentGenerations = await prisma.scanMessageGeneration.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      where: {
        discardedMessages: { not: null },
      },
      select: {
        discardedMessages: true,
        feedbackNotes: true,
      },
    });

    // Build feedback context
    const feedbackContext = recentGenerations
      .filter((g) => g.discardedMessages)
      .map((g) => {
        try {
          return JSON.parse(g.discardedMessages as string);
        } catch {
          return [];
        }
      })
      .flat();

    const openai = new OpenAI({ apiKey: config.openaiApiKey });
    const apiStartTime = Date.now();

    const prompt = buildGenerationPrompt(count, existingMessages, feedbackContext);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a creative copywriter for ScamDunk, a financial scam detection app. Your job is to write witty, engaging, and slightly humorous loading messages that keep users entertained while their stock analysis runs.

STYLE GUIDELINES:
- Be clever and witty, but not cheesy
- Light humor is good, but don't be offensive or insensitive about financial losses
- Messages should be about stock scams, investing, or financial vigilance
- Keep headlines punchy (under 60 characters ideally)
- Subtexts should be supportive and action-oriented (under 50 characters ideally)
- Vary the tone: some can be playful, some more serious but still engaging
- Reference common scam tactics (guaranteed returns, hot tips, time pressure)
- Use relatable scenarios (uncle's stock tip, friend's "sure thing")

AVOID:
- Being preachy or condescending
- Making fun of people who got scammed
- Anything that could be financial advice
- Generic boring messages
- Repeating the same joke structure`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.8, // Higher creativity for variety
      response_format: { type: "json_object" },
    });

    const responseTime = Date.now() - apiStartTime;
    const tokensUsed = response.usage?.total_tokens || 0;
    const estimatedCost = tokensUsed * 0.0000003;

    // Log API usage
    await logApiUsage({
      service: "OPENAI",
      endpoint: "chat/completions (scan-messages)",
      tokensUsed,
      estimatedCost,
      responseTime,
      statusCode: 200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);
    const generatedMessages = parsed.messages as Array<{
      headline: string;
      subtext: string;
    }>;

    if (!Array.isArray(generatedMessages) || generatedMessages.length === 0) {
      throw new Error("Invalid response format from LLM");
    }

    // Create generation record
    const generation = await prisma.scanMessageGeneration.create({
      data: {
        prompt,
        model: "gpt-4o-mini",
        generatedCount: generatedMessages.length,
        tokensUsed,
        estimatedCost,
        createdBy: session.id,
      },
    });

    // Log the action
    await prisma.adminAuditLog.create({
      data: {
        adminUserId: session.id,
        action: "SCAN_MESSAGES_GENERATED",
        resource: generation.id,
        details: JSON.stringify({ count: generatedMessages.length }),
      },
    });

    return NextResponse.json({
      generationId: generation.id,
      messages: generatedMessages,
      tokensUsed,
      estimatedCost,
    });
  } catch (error) {
    console.error("Generate scan messages error:", error);
    return NextResponse.json(
      { error: "Failed to generate scan messages" },
      { status: 500 }
    );
  }
}

function buildGenerationPrompt(
  count: number,
  existingMessages: Array<{ headline: string; subtext: string }>,
  feedbackContext: Array<{ headline: string; subtext: string; reason?: string }>
): string {
  let prompt = `Generate ${count} new loading screen messages for our financial scam detection app.

Each message needs:
- headline: The main catchy phrase (max 60 chars)
- subtext: Supporting action-oriented text (max 50 chars)

`;

  if (existingMessages.length > 0) {
    prompt += `EXISTING MESSAGES (do not duplicate these themes):
${existingMessages.slice(0, 10).map((m) => `- "${m.headline}"`).join("\n")}

`;
  }

  if (feedbackContext.length > 0) {
    prompt += `PREVIOUSLY REJECTED MESSAGES (learn from what didn't work):
${feedbackContext.slice(0, 10).map((m) => `- "${m.headline}" ${m.reason ? `(Reason: ${m.reason})` : ""}`).join("\n")}

`;
  }

  prompt += `Return a JSON object with this structure:
{
  "messages": [
    { "headline": "...", "subtext": "..." },
    ...
  ]
}

Generate exactly ${count} unique, creative messages.`;

  return prompt;
}
