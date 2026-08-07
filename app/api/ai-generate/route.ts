export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebaseAdmin";

const REPLICATE_API = "https://api.replicate.com/v1";

// Model paths — version resolved dynamically at runtime so it never goes stale
const IMAGE_MODEL = "stability-ai/stable-diffusion-img2img";
const VIDEO_MODEL = "anotherjesse/zeroscope-v2-xl";

async function verifyUser(req: NextRequest): Promise<string | null> {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return null;
    const app = getAdminApp();
    if (!app) return null;
    const decoded = await app.auth().verifyIdToken(token);
    return decoded.uid;
  } catch { return null; }
}

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const b64 = Buffer.from(buf).toString("base64");
  const mime = res.headers.get("content-type") || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

// Fetch the latest version hash for a model so we never use a stale hash
async function getLatestVersion(modelPath: string, key: string): Promise<string> {
  const res = await fetch(`${REPLICATE_API}/models/${modelPath}/versions`, {
    headers: { Authorization: `Token ${key}` },
  });
  if (!res.ok) throw new Error(`Could not fetch versions for ${modelPath}: ${res.status}`);
  const data = await res.json();
  const version = data.results?.[0]?.id;
  if (!version) throw new Error(`No versions found for ${modelPath}`);
  return version;
}

async function createPrediction(version: string, input: Record<string, unknown>, key: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`${REPLICATE_API}/predictions`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ version, input }),
    });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "10", 10);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    return res;
  }
  throw new Error("Rate limit exceeded. Please try again in a moment.");
}

export async function POST(req: NextRequest) {
  const uid = await verifyUser(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = process.env.REPLICATE_API_KEY;
  if (!key) return NextResponse.json({ error: "AI not configured" }, { status: 500 });

  const { type, imageUrl, prompt, style, strength } = await req.json();

  const stylePrompts: Record<string, string> = {
    anime:      "anime style, vibrant colors, detailed, Studio Ghibli inspired",
    cartoon:    "cartoon style, bold outlines, colorful, pixar style",
    cinematic:  "cinematic photography, dramatic lighting, film grain, 4k",
    oil:        "oil painting style, impressionist, thick brushstrokes, artistic",
    cyberpunk:  "cyberpunk style, neon lights, futuristic, dark city",
    watercolor: "watercolor painting, soft colors, artistic, flowing",
    sketch:     "pencil sketch, black and white, detailed linework",
    realistic:  "ultra realistic, 8k, photorealistic, detailed",
  };

  const fullPrompt = `${stylePrompts[style] || ""}, ${prompt || "transform this"}`.trim();

  try {
    if (type === "image") {
      if (!imageUrl) return NextResponse.json({ error: "No image provided" }, { status: 400 });

      const [b64, version] = await Promise.all([
        urlToBase64(imageUrl),
        getLatestVersion(IMAGE_MODEL, key),
      ]);

      const res = await createPrediction(version, {
        image: b64,
        prompt: fullPrompt,
        strength: strength ?? 0.7,
        guidance_scale: 7.5,
        num_inference_steps: 25,
      }, key);

      const prediction = await res.json();
      if (!res.ok) {
        console.error("[ai-generate] image prediction error:", prediction);
        return NextResponse.json({ error: prediction.detail || JSON.stringify(prediction) }, { status: 500 });
      }

      const result = await pollPrediction(prediction.id, key);
      return NextResponse.json(result);
    }

    if (type === "video") {
      const version = await getLatestVersion(VIDEO_MODEL, key);

      const res = await createPrediction(version, {
        prompt: fullPrompt,
        num_frames: 24,
        width: 576,
        height: 320,
        guidance_scale: 17.5,
        num_inference_steps: 40,
      }, key);

      const prediction = await res.json();
      if (!res.ok) {
        console.error("[ai-generate] video prediction error:", prediction);
        return NextResponse.json({ error: prediction.detail || JSON.stringify(prediction) }, { status: 500 });
      }

      const result = await pollPrediction(prediction.id, key);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (e: any) {
    console.error("[ai-generate] exception:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function pollPrediction(id: string, key: string, maxAttempts = 18): Promise<{ output: string | string[] | null; status: string; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${REPLICATE_API}/predictions/${id}`, {
      headers: { Authorization: `Token ${key}` },
    });
    const data = await res.json();
    if (data.status === "succeeded") return { output: data.output, status: "succeeded" };
    if (data.status === "failed") return { output: null, status: "failed", error: data.error };
  }
  return { output: null, status: "timeout", error: "Generation took too long. Try a lower strength or simpler style." };
}
