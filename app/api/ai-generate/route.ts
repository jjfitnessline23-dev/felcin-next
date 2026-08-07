export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebaseAdmin";

const REPLICATE_API = "https://api.replicate.com/v1";

// Use /models/{owner}/{name}/predictions — always runs the latest public version, no hash needed
const IMAGE_MODEL_PATH = "stability-ai/stable-diffusion-img2img";
const VIDEO_MODEL_PATH  = "anotherjesse/zeroscope-v2-xl";

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

async function createPrediction(modelPath: string, input: Record<string, unknown>, key: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`${REPLICATE_API}/models/${modelPath}/predictions`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json", "Prefer": "wait" },
      body: JSON.stringify({ input }),
    });
    if (res.status === 429) {
      // Rate limited — wait and retry
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

  const { type, imageUrl, videoUrl, prompt, style, strength } = await req.json();

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

      const b64 = await urlToBase64(imageUrl);

      const res = await createPrediction(IMAGE_MODEL_PATH, {
        image: b64,
        prompt: fullPrompt,
        strength: strength ?? 0.7,
        guidance_scale: 7.5,
        num_inference_steps: 30,
      }, key);

      const prediction = await res.json();
      if (!res.ok) return NextResponse.json({ error: prediction.detail || "Replicate error" }, { status: 500 });

      // If synchronous result (Prefer: wait), return immediately
      if (prediction.output) return NextResponse.json({ output: prediction.output, status: "succeeded" });

      const result = await pollPrediction(prediction.id, key);
      return NextResponse.json(result);
    }

    if (type === "video") {
      const res = await createPrediction(VIDEO_MODEL_PATH, {
        prompt: fullPrompt,
        num_frames: 24,
        width: 576,
        height: 320,
        guidance_scale: 17.5,
        num_inference_steps: 50,
      }, key);

      const prediction = await res.json();
      if (!res.ok) return NextResponse.json({ error: prediction.detail || "Replicate error" }, { status: 500 });

      if (prediction.output) return NextResponse.json({ output: prediction.output, status: "succeeded" });

      const result = await pollPrediction(prediction.id, key);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (e: any) {
    console.error("[ai-generate]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function pollPrediction(id: string, key: string, maxAttempts = 60): Promise<{ output: string | string[] | null; status: string; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${REPLICATE_API}/predictions/${id}`, {
      headers: { Authorization: `Token ${key}` },
    });
    const data = await res.json();
    if (data.status === "succeeded") return { output: data.output, status: "succeeded" };
    if (data.status === "failed") return { output: null, status: "failed", error: data.error };
  }
  return { output: null, status: "timeout" };
}
