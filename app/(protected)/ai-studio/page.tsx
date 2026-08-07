"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/lib/auth";
import { logError } from "@/lib/logError";

const STYLES = [
  { id: "anime",      label: "Anime",      emoji: "⛩️" },
  { id: "cartoon",    label: "Cartoon",    emoji: "🎨" },
  { id: "cinematic",  label: "Cinematic",  emoji: "🎬" },
  { id: "oil",        label: "Oil Paint",  emoji: "🖼️" },
  { id: "cyberpunk",  label: "Cyberpunk",  emoji: "🌆" },
  { id: "watercolor", label: "Watercolor", emoji: "💧" },
  { id: "sketch",     label: "Sketch",     emoji: "✏️" },
  { id: "realistic",  label: "Realistic",  emoji: "📷" },
];

export default function AIStudioPage() {
  const { user } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"image" | "video">("image");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [style, setStyle] = useState("cinematic");
  const [prompt, setPrompt] = useState("");
  const [strength, setStrength] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    setPreview(URL.createObjectURL(f));
  };

  const generate = async () => {
    if (!user || (!file && tab === "image")) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      let mediaUrl = uploadedUrl;

      if (file && !uploadedUrl) {
        const storageRef = ref(storage, `ai-studio/${user.uid}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        mediaUrl = await getDownloadURL(storageRef);
        setUploadedUrl(mediaUrl);
      }

      const res = await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: tab,
          imageUrl: tab === "image" ? mediaUrl : undefined,
          videoUrl: tab === "video" ? mediaUrl : undefined,
          prompt,
          style,
          strength,
        }),
      });

      const data = await res.json();
      if (data.error) { setError(data.error); return; }

      const output = Array.isArray(data.output) ? data.output[0] : data.output;
      setResult(output);
    } catch (e: any) {
      logError("AIStudio.generate", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#090909", minHeight: "100dvh" }}>
      <div className="max-w-xl mx-auto px-4 py-6" style={{ paddingTop: "max(24px, env(safe-area-inset-top,24px) + 16px)" }}>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="border-none bg-transparent cursor-pointer p-0" style={{ color: "#666" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#f2f2f2" }}>AI Studio</h1>
            <p className="text-xs" style={{ color: "#444" }}>Transform any photo or video with AI</p>
          </div>
          <div className="ml-auto w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7c3aed,#a78bfa)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#fff" }}>auto_awesome</span>
          </div>
        </div>

        {/* Tab */}
        <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: "rgba(255,255,255,0.04)" }}>
          {(["image", "video"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setFile(null); setPreview(null); setResult(null); setUploadedUrl(null); }}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold border-none cursor-pointer capitalize"
              style={tab === t ? { background: "#fff", color: "#000" } : { background: "transparent", color: "#555" }}>
              {t === "image" ? "🖼️ Image" : "🎬 Video"}
            </button>
          ))}
        </div>

        {/* Upload area */}
        <div onClick={() => fileRef.current?.click()} className="rounded-2xl mb-4 flex flex-col items-center justify-center cursor-pointer overflow-hidden"
          style={{ minHeight: 200, background: "#111", border: "2px dashed rgba(124,58,237,0.3)", position: "relative" }}>
          {preview ? (
            tab === "image"
              ? <img src={preview} alt="" style={{ width: "100%", height: 220, objectFit: "cover" }} />
              : <video src={preview} controls style={{ width: "100%", height: 220, objectFit: "cover" }} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-10">
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: "#7c3aed" }}>
                {tab === "image" ? "add_photo_alternate" : "video_call"}
              </span>
              <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>
                Tap to upload {tab}
              </p>
              <p className="text-xs" style={{ color: "#444" }}>
                {tab === "image" ? "JPG, PNG, WEBP" : "MP4, MOV up to 30s"}
              </p>
            </div>
          )}
          <input ref={fileRef} type="file" accept={tab === "image" ? "image/*" : "video/*"} onChange={handleFile} style={{ display: "none" }} />
        </div>

        {/* Style picker */}
        <p className="text-xs font-bold tracking-widest mb-2" style={{ color: "#555" }}>STYLE</p>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {STYLES.map((s) => (
            <button key={s.id} onClick={() => setStyle(s.id)}
              className="flex flex-col items-center gap-1 py-3 rounded-xl border-none cursor-pointer"
              style={{
                background: style === s.id ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${style === s.id ? "rgba(124,58,237,0.5)" : "rgba(255,255,255,0.06)"}`,
              }}>
              <span style={{ fontSize: 20 }}>{s.emoji}</span>
              <span className="text-[10px] font-semibold" style={{ color: style === s.id ? "#a78bfa" : "#555" }}>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Prompt */}
        <p className="text-xs font-bold tracking-widest mb-2" style={{ color: "#555" }}>CUSTOM PROMPT (optional)</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. make me look like a superhero, add fire in the background..."
          rows={2}
          className="w-full rounded-xl px-4 py-3 text-sm mb-4 resize-none outline-none"
          style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }}
        />

        {/* Strength slider (image only) */}
        {tab === "image" && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold tracking-widest" style={{ color: "#555" }}>TRANSFORMATION STRENGTH</p>
              <p className="text-xs font-bold" style={{ color: "#a78bfa" }}>{Math.round(strength * 100)}%</p>
            </div>
            <input type="range" min={0.3} max={1} step={0.05} value={strength}
              onChange={(e) => setStrength(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#7c3aed" }} />
            <div className="flex justify-between mt-1">
              <span className="text-[10px]" style={{ color: "#444" }}>Subtle</span>
              <span className="text-[10px]" style={{ color: "#444" }}>Full transform</span>
            </div>
          </div>
        )}

        {/* Generate button */}
        <button onClick={generate} disabled={loading || (!file && tab === "image")}
          className="w-full py-4 rounded-2xl text-sm font-bold border-none cursor-pointer flex items-center justify-center gap-2 mb-5"
          style={{
            background: loading || (!file && tab === "image") ? "rgba(124,58,237,0.2)" : "linear-gradient(135deg,#7c3aed,#a78bfa)",
            color: loading || (!file && tab === "image") ? "#555" : "#fff",
          }}>
          {loading ? (
            <>
              <div className="spinner" style={{ width: 16, height: 16 }} />
              Generating... this takes ~30 seconds
            </>
          ) : (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span>
              Generate with AI
            </>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl mb-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <p className="text-sm" style={{ color: "#f87171" }}>{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-2xl overflow-hidden mb-4" style={{ border: "1px solid rgba(124,58,237,0.3)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: "rgba(124,58,237,0.08)" }}>
              <p className="text-sm font-bold" style={{ color: "#a78bfa" }}>✨ AI Result</p>
              <div className="flex gap-2">
                <a href={result} download target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer"
                  style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa", textDecoration: "none" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
                  Save
                </a>
                <button onClick={() => router.push(`/?aiResult=${encodeURIComponent(result)}`)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_circle</span>
                  Post
                </button>
              </div>
            </div>
            {tab === "image"
              ? <img src={result} alt="AI result" style={{ width: "100%", display: "block" }} />
              : <video src={result} controls autoPlay style={{ width: "100%", display: "block" }} />
            }
          </div>
        )}

      </div>
    </div>
  );
}
