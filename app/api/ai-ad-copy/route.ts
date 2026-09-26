export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/firebaseAdmin";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const uid = await verifyToken(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { description, audience, goal } = await req.json();
  if (!description?.trim()) return NextResponse.json({ error: "Description required" }, { status: 400 });

  const prompt = `You are an expert ad copywriter for Felcin, a fitness social app with an active community of runners, gym-goers, and fitness enthusiasts.

A business wants to advertise on Felcin. Here's what they told us:
Business/Product: ${description}
${audience ? `Target audience: ${audience}` : ""}
${goal ? `Campaign goal: ${goal}` : ""}

Write an ad for the Felcin feed. Return ONLY a valid JSON object with exactly these two fields:
{
  "headline": "A punchy headline under 60 characters that grabs attention",
  "body": "A short compelling description under 120 characters with a clear benefit and subtle call to action"
}

Rules:
- Headline must be under 60 characters
- Body must be under 120 characters
- Make it feel native to a fitness community — energetic, motivating, authentic
- Do not use excessive punctuation or all caps
- Return ONLY the JSON object, nothing else`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (message.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "Failed to generate copy" }, { status: 500 });

    const result = JSON.parse(jsonMatch[0]);
    if (!result.headline || !result.body) return NextResponse.json({ error: "Invalid response from AI" }, { status: 500 });

    return NextResponse.json({
      headline: result.headline.slice(0, 80),
      body: result.body.slice(0, 200),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
