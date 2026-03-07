"""
Drafting Agent: Generates contextually appropriate reply drafts for discovered
growth opportunities using OpenAI GPT-4o with voice templates.
"""

import random
from typing import Optional

from openai import AsyncOpenAI

from config import settings
from db import (
    get_opportunities_by_status,
    get_active_voice_template,
    ensure_default_voice_template,
    insert_draft,
    update_opportunity_status,
)


def build_system_prompt(voice: dict) -> str:
    """Build the system prompt using the voice template."""
    examples = voice.get("exampleReplies", [])
    examples_text = "\n\n".join(f"Example {i+1}:\n{ex}" for i, ex in enumerate(examples))

    avoid_words = voice.get("avoidWords", [])
    vocabulary = voice.get("vocabulary", [])

    return f"""You are a social media reply writer for ScamDunk.com, a stock scam detection tool.

TONE: {voice.get('tone', 'Helpful and educational')}

PREFERRED VOCABULARY: {', '.join(vocabulary)}

WORDS/PHRASES TO NEVER USE: {', '.join(avoid_words)}

EXAMPLE REPLIES (match this style):
{examples_text}

RULES:
1. Provide genuine educational value FIRST — the reply must stand on its own as helpful advice
2. Never be salesy, pushy, or spammy
3. Match the emotional context of the original post (empathetic for victims, informative for questions, cautionary for promoters)
4. Keep replies concise — 2-4 short paragraphs max
5. Use plain language, no financial jargon unless explaining it
6. If including a ScamDunk.com reference, weave it in naturally as "a tool I've found useful" or similar
7. Never give specific financial advice — always frame as "things to check" or "red flags to watch for"
8. Be authentic — you're a real person who cares about protecting investors"""


def build_user_prompt(opportunity: dict, include_link: bool) -> str:
    """Build the user prompt with the opportunity context."""
    platform = opportunity.get("platform", "reddit")
    source = opportunity.get("source", "")
    title = opportunity.get("postTitle", "") or ""
    body = opportunity.get("postBody", "") or ""

    link_instruction = ""
    if include_link:
        link_instruction = (
            "\n\nNATURALLY include a reference to ScamDunk.com — "
            "for example: 'There are tools like ScamDunk.com that can run these checks automatically' "
            "or 'I ran this through ScamDunk.com and it flagged several red flags'. "
            "Make it feel like a genuine recommendation, not an advertisement."
        )
    else:
        link_instruction = "\n\nDo NOT mention ScamDunk.com in this reply. Focus purely on educational value."

    return f"""Write a reply to this {platform} post in r/{source}:

TITLE: {title}

POST CONTENT: {body[:1500]}
{link_instruction}

Write ONLY the reply text, nothing else. No greeting like "Great question!" — just dive into helpful content."""


async def generate_draft(opportunity: dict, voice: dict, include_link: bool) -> Optional[str]:
    """Generate a single draft reply using OpenAI."""
    if not settings.openai_api_key:
        print("[Drafting] No OPENAI_API_KEY set, skipping")
        return None

    client = AsyncOpenAI(api_key=settings.openai_api_key)

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": build_system_prompt(voice)},
                {"role": "user", "content": build_user_prompt(opportunity, include_link)},
            ],
            temperature=0.8,
            max_tokens=500,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"[Drafting] OpenAI error: {e}")
        return None


async def run_drafting():
    """Generate drafts for all discovered opportunities that don't have drafts yet."""
    print("[Drafting] Starting drafting run...")

    voice = ensure_default_voice_template()
    if not voice:
        print("[Drafting] No voice template found, aborting")
        return

    link_frequency = voice.get("linkFrequency", 0.4)

    # Get opportunities waiting for drafts
    opportunities = get_opportunities_by_status("discovered")
    if not opportunities:
        print("[Drafting] No new opportunities to draft for")
        return

    print(f"[Drafting] Generating drafts for {len(opportunities)} opportunities")

    drafted = 0
    for opp in opportunities:
        # Decide whether to include ScamDunk link based on frequency setting
        include_link = random.random() < link_frequency

        reply_text = await generate_draft(opp, voice, include_link)
        if reply_text:
            insert_draft(
                opportunity_id=opp["id"],
                reply_text=reply_text,
                includes_link=include_link,
                variant=1,
            )
            update_opportunity_status(opp["id"], "draft_ready")
            drafted += 1

    print(f"[Drafting] Generated {drafted} drafts")
    return drafted
