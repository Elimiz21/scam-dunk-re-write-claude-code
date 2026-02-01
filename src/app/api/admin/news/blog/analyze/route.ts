/**
 * API to analyze blog content using OpenAI
 * Extracts: title, brief description, and image suggestion
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { config } from "@/lib/config";
import OpenAI from "openai";

export async function POST(request: NextRequest) {
    const session = await getAdminSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { content } = await request.json();

        if (!content || typeof content !== "string") {
            return NextResponse.json(
                { error: "Content is required" },
                { status: 400 }
            );
        }

        if (!config.openaiApiKey) {
            return NextResponse.json(
                { error: "OpenAI is not configured" },
                { status: 500 }
            );
        }

        const openai = new OpenAI({ apiKey: config.openaiApiKey });

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a blog content analyzer. Given a blog post content, extract:
1. A compelling title (if not explicitly provided, generate one based on the content)
2. A brief description/excerpt (2-3 sentences summarizing the key points)
3. A visual suggestion describing what kind of cover image would work well for this post

Output must be valid JSON with this exact structure:
{
  "title": "string",
  "excerpt": "string", 
  "visualSuggestion": "string",
  "suggestedCategory": "string (one of: General, Security Tips, Industry News, Product Updates, Case Studies, Guides)"
}`,
                },
                {
                    role: "user",
                    content: `Analyze this blog post content and extract the title, description, and visual suggestion:\n\n${content.substring(0, 8000)}`,
                },
            ],
            temperature: 0.3,
            response_format: { type: "json_object" },
        });

        const responseContent = response.choices[0]?.message?.content;
        if (!responseContent) {
            throw new Error("No content in OpenAI response");
        }

        const parsed = JSON.parse(responseContent);

        return NextResponse.json({
            title: parsed.title || "",
            excerpt: parsed.excerpt || "",
            visualSuggestion: parsed.visualSuggestion || "",
            suggestedCategory: parsed.suggestedCategory || "General",
        });
    } catch (error) {
        console.error("Error analyzing blog content:", error);
        return NextResponse.json(
            { error: "Failed to analyze content" },
            { status: 500 }
        );
    }
}
