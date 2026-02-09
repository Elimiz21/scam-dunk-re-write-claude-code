/**
 * Admin Homepage Content Generate API
 * Uses OpenAI to generate new hero headline/subheadline options
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { logApiUsage } from "@/lib/admin/metrics";
import OpenAI from "openai";

// POST - Generate new hero headline options using AI
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
    const { count = 5 } = body;

    // Get existing heroes for context
    const existingHeroes = await prisma.homepageHero.findMany({
      select: { headline: true, subheadline: true },
    });

    const openai = new OpenAI({ apiKey: config.openaiApiKey });
    const apiStartTime = Date.now();

    const prompt = buildPrompt(count, existingHeroes);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a senior conversion copywriter specializing in fintech and security products. You write compelling landing page headlines for ScamDunk, an AI-powered stock and crypto scam detection tool.

PRODUCT CONTEXT:
- ScamDunk lets users enter a stock ticker or crypto symbol and get an instant risk analysis
- It detects pump-and-dump patterns, volume anomalies, regulatory red flags
- Users can also paste suspicious chat messages or upload screenshots
- It's free to use (5 scans/month free, 200 on paid plan)
- The brand tone is: confident, slightly witty, protective, trustworthy

HEADLINE GUIDELINES:
- Max 80 characters for headlines
- Should evoke emotion: fear of loss, desire for protection, curiosity
- Use power words: protect, detect, expose, verify, check
- Reference real scenarios: unsolicited tips, "guaranteed returns", group chats
- Can be slightly humorous but never flippant about financial loss
- Must make the user want to try the tool immediately

SUBHEADLINE GUIDELINES:
- Max 150 characters
- Should explain what the product does in concrete terms
- Include a benefit and a feature
- Lower the friction: mention it's free, fast, or easy
- End with an action prompt if natural`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.85,
      response_format: { type: "json_object" },
    });

    const responseTime = Date.now() - apiStartTime;
    const tokensUsed = response.usage?.total_tokens || 0;
    const estimatedCost = tokensUsed * 0.0000003;

    // Log API usage (non-critical)
    logApiUsage({
      service: "OPENAI",
      endpoint: "chat/completions (homepage-hero)",
      tokensUsed,
      estimatedCost,
      responseTime,
      statusCode: 200,
    }).catch(() => {});

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);
    const suggestions = parsed.suggestions as Array<{
      headline: string;
      subheadline: string;
    }>;

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      throw new Error("Invalid response format from LLM");
    }

    // Audit log (non-critical)
    prisma.adminAuditLog
      .create({
        data: {
          adminUserId: session.id,
          action: "HOMEPAGE_HERO_AI_GENERATED",
          details: JSON.stringify({ count: suggestions.length, tokensUsed }),
        },
      })
      .catch(() => {});

    return NextResponse.json({
      suggestions,
      tokensUsed,
      estimatedCost,
    });
  } catch (error) {
    console.error("Generate homepage heroes error:", error);
    return NextResponse.json(
      { error: "Failed to generate homepage content" },
      { status: 500 }
    );
  }
}

function buildPrompt(
  count: number,
  existingHeroes: Array<{ headline: string; subheadline: string }>
): string {
  let prompt = `Generate ${count} different landing page hero headline + subheadline combinations for ScamDunk.

Each combination should take a different angle/approach:
- Trust/authority angle
- Fear/urgency angle
- Curiosity/intrigue angle
- Social proof angle
- Benefit-driven angle

`;

  if (existingHeroes.length > 0) {
    prompt += `EXISTING HEADLINES (generate different approaches, don't repeat):
${existingHeroes.map((h) => `- "${h.headline}" / "${h.subheadline}"`).join("\n")}

`;
  }

  prompt += `Return a JSON object with this structure:
{
  "suggestions": [
    { "headline": "...", "subheadline": "..." },
    ...
  ]
}

Generate exactly ${count} unique combinations. Each headline should be under 80 characters. Each subheadline should be under 150 characters.`;

  return prompt;
}
