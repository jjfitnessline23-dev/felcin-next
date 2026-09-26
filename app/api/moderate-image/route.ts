export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyToken } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";

// Real-time nudity / sexual-content gate.
// Called by the client BEFORE any image or video is attached to a post, reel,
// story, avatar, ad, DM, progress photo, etc. Returns { blocked: true } when the
// media contains disallowed nudity so the client can refuse to publish it.
//
// Felcin is a FITNESS network, so the prompt is deliberately tuned to allow
// normal athletic content (gym wear, sports bras, shirtless training, swimwear)
// while blocking actual nudity and sexual content. Anything the model can't
// inspect (unsupported format, extraction failure, API outage) fails OPEN here —
// the daily/hourly moderation cron is the backstop that catches those.

const NUDITY_PROMPT = `You are a nudity and sexual-content detector for Felcin, a FITNESS social network.

Your ONLY job is to decide whether an image contains disallowed nudity or sexual content.

BLOCK (nudity = true) when the image shows any of the following:
- Exposed genitals or anus (male or female)
- Exposed female nipples/areola
- Fully exposed buttocks (bare, not covered by clothing/underwear/swimwear)
- Sexual acts, masturbation, or simulated sexual activity
- Pornographic or sexually explicit content
- Sheer/see-through clothing that clearly exposes the above
- Content that is primarily sexual in nature regardless of coverage

ALLOW (nudity = false) — this is a fitness app, do NOT block normal fitness content:
- People in gym wear, athletic wear, leggings, shorts, tank tops
- Sports bras and workout tops
- Shirtless men training or posing (bodybuilding, sports)
- Women in sports bras / athletic tops showing a midriff
- Swimwear / bikinis in a non-sexual, athletic, or beach context
- Muscle poses, flexing, physique / progress photos in normal athletic attire
- Medical, educational, or clearly non-sexual body content

When genuinely unsure and the content is plausibly fitness-related, ALLOW it.

Respond ONLY with valid JSON, no other text:
{"nudity":boolean,"category":"nudity"|"sexual_content"|"none","severity":"low"|"medium"|"high","reason":"brief explanation, or empty string if clean"}`;

const MAX_IMAGES = 5;

type Analysis = { nudity: boolean; category: string; severity: string; reason: string };

function toImageBlock(raw: string): Anthropic.ImageBlockParam | null {
  // Accept full data URLs ("data:image/jpeg;base64,...") or bare base64.
  let mediaType = "image/jpeg";
  let data = raw;
  const m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/);
  if (m) {
    mediaType = m[1];
    data = m[2];
  } else if (raw.startsWith("data:")) {
    return null;
  }
  if (!data) return null;
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(mediaType)) mediaType = "image/jpeg";
  return {
    type: "image",
    source: { type: "base64", media_type: mediaType as "image/jpeg", data },
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  // Fail open when moderation isn't configured — the cron backstop still runs.
  if (!apiKey) return NextResponse.json({ blocked: false, error: "not-configured" });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ blocked: false, error: "bad-json" }, { status: 400 });

  const uid = await verifyToken(req.headers.get("authorization") ?? body?.token);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await rateLimit(`modimg:${uid}`, 40, 60_000))) {
    // Don't let a rate-limited caller silently bypass the gate: treat as
    // temporary failure the client should surface as "try again".
    return NextResponse.json({ blocked: false, error: "rate-limited" }, { status: 429 });
  }

  const rawImages: unknown = body.images;
  const images: string[] = Array.isArray(rawImages)
    ? rawImages.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, MAX_IMAGES)
    : [];
  if (!images.length) return NextResponse.json({ blocked: false });

  const content: Anthropic.MessageParam["content"] = [];
  for (const img of images) {
    const block = toImageBlock(img);
    if (block) content.push(block);
  }
  if (!content.length) return NextResponse.json({ blocked: false });

  content.push({
    type: "text",
    text:
      images.length > 1
        ? "These frames are sampled from a single video. If ANY frame contains disallowed nudity or sexual content, set nudity=true."
        : "Analyze this image.",
  });

  const anthropic = new Anthropic({ apiKey });
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: NUDITY_PROMPT,
      messages: [{ role: "user", content }],
    });
    const rawText = msg.content[0]?.type === "text" ? msg.content[0].text : "{}";
    let parsed: Analysis;
    try {
      const json = JSON.parse(rawText.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      parsed = {
        nudity: json.nudity === true,
        category: json.category ?? "none",
        severity: json.severity ?? "low",
        reason: json.reason ?? "",
      };
    } catch {
      // Couldn't parse — fail open, cron backstops.
      return NextResponse.json({ blocked: false, error: "parse-failed" });
    }
    return NextResponse.json({
      blocked: parsed.nudity,
      category: parsed.category,
      severity: parsed.severity,
      reason: parsed.reason,
    });
  } catch {
    // Anthropic outage / timeout — fail open, cron backstops.
    return NextResponse.json({ blocked: false, error: "analyze-failed" });
  }
}
