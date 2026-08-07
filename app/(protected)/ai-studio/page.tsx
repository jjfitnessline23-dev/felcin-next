"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, storage, db } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/auth";
import { logError } from "@/lib/logError";
import PageHeader from "@/components/PageHeader";

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

  const [enabled, setEnabled] = useState<boolean | null>(null);
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

  useEffect(() => {
    getDoc(doc(db, "config", "features"))
      .then((snap) => {
        const data = snap.exists() ? snap.data() : {};
        setEnabled(data.aiStudioEnabled ?? false);
      })
      .catch(() => setEnabled(false));
  }, []);

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
        body: JSON.stringify({ type: tab, imageUrl: tab === "image" ? mediaUrl : undefined, videoUrl: tab === "video" ? mediaUrl : undefined, prompt, style, strength }),
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

  if (enabled === null) {
    return (
      <div style={{ background: "#090909", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div style={{ background: "#090909", minHeight: "100dvh" }}>
        <PageHeader title="AI Studio" />
        {/* Background watermark */}
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden",
          background: "radial-gradient(ellipse 80% 60% at 60% 40%, rgba(124,58,237,0.06) 0%, transparent 70%)" }}>
          <img src="/static/logo-full.svg" alt="" style={{ position: "absolute", right: "-5%", top: "50%", transform: "translateY(-50%)", width: "55vw", maxWidth: 520, opacity: 0.04, userSelect: "none" }} />
        </div>
        <div className="relative z-10 flex flex-col items-center text-center py-24 px-6">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
            style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.15),rgba(167,139,250,0.08))", border: "1px solid rgba(124,58,237,0.25)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 38, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: "#f2f2f2" }}>AI Studio</h2>
          <p className="text-sm" style={{ color: "#555" }}>This feature is temporarily unavailable. Check back soon.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#090909", minHeight: "100dvh" }}>
      <PageHeader title="AI Studio" />

      {/* Background watermark — same pattern as Ghost, Dashboard etc */}
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden",
        background: "radial-gradient(ellipse 80% 60% at 65% 35%, rgba(124,58,237,0.08) 0%, transparent 70%)" }}>
        <img src="/static/logo-full.svg" alt="" style={{ position: "absolute", right: "-5%", top: "50%", transform: "translateY(-50%)", width: "55vw", maxWidth: 520, opacity: 0.045, userSelect: "none" }} />
        <img src="/static/logo-full.svg" alt="" style={{ position: "absolute", left: "-10%", bottom: "10%", width: "30vw", maxWidth: 280, opacity: 0.025, userSelect: "none" }} />
      </div>

      <div className="relative z-10 max-w-xl mx-auto px-4 pb-10">

        {/* Hero banner */}
        <div className="rounded-2xl mb-5 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg,#0c0818 0%,#110c22 60%,#0a0814 100%)", border: "1px solid rgba(124,58,237,0.3)", minHeight: 120 }}>
          <div style={{ position: "absolute", top: -30, right: 30, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle,rgba(124,58,237,0.2) 0%,transparent 70%)", pointerEvents: "none" }} />
          <img src="/static/logo-full.svg" alt="" aria-hidden="true"
            style={{ position: "absolute", right: -16, top: "50%", transform: "translateY(-50%)", width: 140, height: 140, opacity: 0.1, pointerEvents: "none" }} />
          <div className="relative p-5" style={{ zIndex: 1 }}>
            <div className="flex items-center gap-2 mb-2">
              <img src="/static/logo-nav.svg" alt="" style={{ width: 24, height: 24, borderRadius: 7 }} />
              <span className="text-[10px] font-bold tracking-[0.2em]" style={{ color: "#7c3aed" }}>AI STUDIO</span>
            </div>
            <p className="font-bold mb-1" style={{ fontSize: 20, color: "#f3e8ff", letterSpacing: "-0.3px" }}>Transform with AI.</p>
            {/* Heartbeat line */}
            <svg width="100" height="18" viewBox="0 0 100 18" style={{ display: "block", marginBottom: 10 }}>
              <path d="M 0,9 L 18,9 L 22,6 L 26,9 L 30,9 L 33,12 L 38,2 L 43,14 L 47,9 C 52,9 54,5 58,9 L 100,9"
                fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
            </svg>
            <p className="text-xs" style={{ color: "#6b5a8a" }}>Pick a style · upload a photo · watch it transform</p>
          </div>
        </div>

        {/* Image / Video tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {(["image", "video"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setFile(null); setPreview(null); setResult(null); setUploadedUrl(null); }}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold border-none cursor-pointer capitalize transition-all"
              style={tab === t ? { background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff" } : { background: "transparent", color: "#555" }}>
              {t === "image" ? "🖼️  Image" : "🎬  Video"}
            </button>
          ))}
        </div>

        {/* Upload area */}
        <div onClick={() => fileRef.current?.click()} className="rounded-2xl mb-5 flex flex-col items-center justify-center cursor-pointer overflow-hidden"
          style={{ minHeight: 200, background: "#0d0d0d", border: `2px dashed ${preview ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.08)"}`, position: "relative", transition: "border-color 0.2s" }}>
          {preview ? (
            tab === "image"
              ? <img src={preview} alt="" style={{ width: "100%", maxHeight: 280, objectFit: "cover" }} />
              : <video src={preview} controls style={{ width: "100%", maxHeight: 280, objectFit: "cover" }} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-12">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#7c3aed" }}>
                  {tab === "image" ? "add_photo_alternate" : "video_call"}
                </span>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Tap to upload {tab}</p>
                <p className="text-xs mt-1" style={{ color: "#444" }}>{tab === "image" ? "JPG, PNG, WEBP" : "MP4, MOV up to 30s"}</p>
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" accept={tab === "image" ? "image/*" : "video/*"} onChange={handleFile} style={{ display: "none" }} />
        </div>

        {/* Style picker */}
        <p className="text-[10px] font-bold tracking-widest mb-3" style={{ color: "#555" }}>STYLE</p>
        <div className="grid grid-cols-4 gap-2 mb-5">
          {STYLES.map((s) => (
            <button key={s.id} onClick={() => setStyle(s.id)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl border-none cursor-pointer transition-all"
              style={{
                background: style === s.id ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${style === s.id ? "rgba(124,58,237,0.45)" : "rgba(255,255,255,0.06)"}`,
              }}>
              <span style={{ fontSize: 22 }}>{s.emoji}</span>
              <span className="text-[10px] font-semibold" style={{ color: style === s.id ? "#a78bfa" : "#555" }}>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Custom prompt */}
        <p className="text-[10px] font-bold tracking-widest mb-2" style={{ color: "#555" }}>CUSTOM PROMPT (optional)</p>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. make me look like a superhero, add fire in the background..."
          rows={2} className="w-full rounded-xl px-4 py-3 text-sm mb-5 resize-none outline-none"
          style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />

        {/* Strength slider (image only) */}
        {tab === "image" && (
          <div className="mb-6 p-4 rounded-xl" style={{ background: "rgba(124,58,237,0.05)", border: "1px solid rgba(124,58,237,0.12)" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold tracking-widest" style={{ color: "#7c3aed" }}>TRANSFORMATION STRENGTH</p>
              <p className="text-xs font-bold" style={{ color: "#a78bfa" }}>{Math.round(strength * 100)}%</p>
            </div>
            <input type="range" min={0.3} max={1} step={0.05} value={strength}
              onChange={(e) => setStrength(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "#7c3aed" }} />
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px]" style={{ color: "#444" }}>Subtle</span>
              <span className="text-[10px]" style={{ color: "#444" }}>Full transform</span>
            </div>
          </div>
        )}

        {/* Generate button */}
        <button onClick={generate} disabled={loading || (!file && tab === "image")}
          className="w-full py-4 rounded-2xl text-sm font-bold border-none cursor-pointer flex items-center justify-center gap-2 mb-5"
          style={{
            background: loading || (!file && tab === "image")
              ? "rgba(124,58,237,0.15)"
              : "linear-gradient(135deg,#7c3aed,#a78bfa)",
            color: loading || (!file && tab === "image") ? "#555" : "#fff",
            boxShadow: loading || (!file && tab === "image") ? "none" : "0 4px 24px rgba(124,58,237,0.35)",
          }}>
          {loading ? (
            <><div className="spinner" style={{ width: 16, height: 16, borderColor: "rgba(255,255,255,0.2)", borderTopColor: "#a78bfa" }} />
            Generating… this takes ~30 seconds</>
          ) : (
            <><span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            Generate with AI</>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl mb-5" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18, color: "#f87171", marginTop: 1 }}>error</span>
              <p className="text-sm" style={{ color: "#f87171" }}>{error}</p>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-2xl overflow-hidden mb-5" style={{ border: "1px solid rgba(124,58,237,0.3)", boxShadow: "0 8px 32px rgba(124,58,237,0.15)" }}>
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.12),rgba(167,139,250,0.06))", borderBottom: "1px solid rgba(124,58,237,0.15)" }}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                <p className="text-sm font-bold" style={{ color: "#a78bfa" }}>AI Result</p>
              </div>
              <div className="flex gap-2">
                <a href={result} download target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer"
                  style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa", textDecoration: "none" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>download</span>Save
                </a>
                <button onClick={() => router.push(`/?aiResult=${encodeURIComponent(result)}`)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer"
                  style={{ background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add_circle</span>Post
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
