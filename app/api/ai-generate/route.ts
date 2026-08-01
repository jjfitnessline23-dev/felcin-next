export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAdminApp } from "@/lib/firebaseAdmin";

const REPLICATE_API = "https://api.replicate.com/v1";

// Image model: stability-ai img2img
const IMAGE_MODEL = "stability-ai/stable-diffusion-img2img:15a3689ee13b0d2616e98820eca31d4af4b51808d3547c73e4b9462b6ecd8ea5";
// Video model: zeroscope
const VIDEO_MODEL  = "anotherjesse/zeroscope-v2-xl:9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351";

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

      const res = await fetch(`${REPLICATE_API}/predictions`, {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          version: IMAGE_MODEL,
          input: {
            image: b64,
            prompt: fullPrompt,
            strength: strength ?? 0.7,
            guidance_scale: 7.5,
            num_inference_steps: 30,
          },
        }),
      });

      const prediction = await res.json();
      if (!res.ok) return NextResponse.json({ error: prediction.detail || "Replicate error" }, { status: 500 });

      // Poll for result
      const result = await pollPrediction(prediction.id, key);
      return NextResponse.json(result);
    }

    if (type === "video") {
      const res = await fetch(`${REPLICATE_API}/predictions`, {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          version: VIDEO_MODEL,
          input: {
            prompt: fullPrompt,
            num_frames: 24,
            width: 576,
            height: 320,
            guidance_scale: 17.5,
            num_inference_steps: 50,
          },
        }),
      });

      const prediction = await res.json();
      if (!res.ok) return NextResponse.json({ error: prediction.detail || "Replicate error" }, { status: 500 });

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
