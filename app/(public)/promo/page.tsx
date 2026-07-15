"use client";

import { useEffect, useState, useRef, useCallback } from "react";

const TOTAL_DURATION = 57000;

const scenes = [
  { id: "cold",     start: 0,     end: 3000  },
  { id: "alone",    start: 3000,  end: 11000 },
  { id: "ghost",    start: 11000, end: 25000 },
  { id: "features", start: 25000, end: 36000 },
  { id: "tagline",  start: 36000, end: 46000 },
  { id: "outro",    start: 46000, end: 57000 },
];

const VOICEOVER_SRC = "/static/promo-vo.mp3";

function useTime() {
  const [t, setT] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const [playing, setPlaying] = useState(false);
  const [done, setDone] = useState(false);

  const start = useCallback((offset = 0) => {
    setDone(false);
    startRef.current = performance.now() - offset;
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      const elapsed = now - (startRef.current ?? now);
      setT(elapsed);
      if (elapsed >= TOTAL_DURATION) {
        setT(TOTAL_DURATION);
        setPlaying(false);
        setDone(true);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  const scene = scenes.find((s) => t >= s.start && t < s.end)?.id ?? (done ? "outro" : "cold");
  const sceneT = (id: string) => {
    const s = scenes.find((x) => x.id === id);
    if (!s) return 0;
    return Math.max(0, t - s.start) / (s.end - s.start);
  };

  return { t, scene, sceneT, playing, done, start };
}

function fade(p: number, delay = 0, dur = 0.25) {
  return Math.min(1, Math.max(0, p - delay) / dur);
}

/* ── MP3 voiceover — Google Cloud TTS ── */
function useVoiceover() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startVoiceover = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    const audio = new Audio(VOICEOVER_SRC);
    audio.volume = 1;
    audioRef.current = audio;
    audio.play().catch(() => {});
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  return { startVoiceover, stop };
}

/* ── Screen-capture download ── */
function useRecorder(onStartAd: () => void) {
  const [recording, setRecording] = useState(false);
  const [recDone, setRecDone] = useState(false);
  const [recFile, setRecFile] = useState<string>("felcin-promo.mp4");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await (navigator.mediaDevices as MediaDevices & {
        getDisplayMedia: (c: object) => Promise<MediaStream>;
      }).getDisplayMedia({ video: { frameRate: 30 }, audio: true, preferCurrentTab: true } as object);

      // Try MP4 first — works on Safari and some Chrome builds.
      // Google Ads and YouTube both accept MP4; webm requires conversion.
      const mimeType =
        MediaRecorder.isTypeSupported("video/mp4")              ? "video/mp4" :
        MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" :
                                                                   "video/webm";
      const ext = mimeType.includes("mp4") ? "mp4" : "webm";
      const filename = `felcin-promo.${ext}`;

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        stream.getTracks().forEach((t) => t.stop());
        setRecFile(filename);
        setRecording(false);
        setRecDone(true);
      };

      recorderRef.current = recorder;
      recorder.start(100);
      setRecording(true);
      setRecDone(false);

      setTimeout(() => {
        onStartAd();
        setTimeout(() => recorder.stop(), TOTAL_DURATION + 800);
      }, 2000);
    } catch {
      // User cancelled screen share
    }
  };

  return { recording, recDone, recFile, startRecording };
}

export default function PromoPage() {
  const { t, scene, sceneT, playing, done, start } = useTime();
  const { startVoiceover, stop } = useVoiceover();
  const [started, setStarted] = useState(false);

  const handleStart = useCallback(() => {
    setStarted(true);
    start();
    // Fire voiceover 3s in, aligned with the "alone" scene
    setTimeout(() => startVoiceover(), 3000);
  }, [start, startVoiceover]);

  const handleReplay = () => { stop(); start(); setTimeout(() => startVoiceover(), 3000); };

  const { recording, recDone, recFile, startRecording } = useRecorder(handleStart);

  /* Stop speech when ad ends */
  useEffect(() => {
    if (done) stop();
  }, [done, stop]);

  const p0 = sceneT("cold");
  const p1 = sceneT("alone");
  const p2 = sceneT("ghost");
  const p3 = sceneT("features");
  const p4 = sceneT("tagline");
  const p5 = sceneT("outro");

  const features = [
    { icon: "live_tv",             color: "#ef4444", label: "LIVE STUDIO",     sub: "Stream in real time" },
    { icon: "compare",             color: "#a78bfa", label: "PROGRESS PHOTOS", sub: "Before & after" },
    { icon: "link",                color: "#f59e0b", label: "CHALLENGES",       sub: "Compete together" },
    { icon: "sports_martial_arts", color: "#06b6d4", label: "FIND TRAINERS",   sub: "Book real coaches" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", fontFamily: "'Inter', system-ui, sans-serif",
    }}>

      {/* Ambient glow */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: scene === "ghost"
          ? "radial-gradient(ellipse at 50% 40%,rgba(124,58,237,0.18) 0%,transparent 65%)"
          : scene === "features"
          ? "radial-gradient(ellipse at 50% 50%,rgba(6,182,212,0.1) 0%,transparent 65%)"
          : scene === "outro"
          ? "radial-gradient(ellipse at 50% 50%,rgba(167,139,250,0.22) 0%,transparent 55%)"
          : "none",
        transition: "background 1.2s ease",
      }} />

      {/* ══ COLD OPEN ══ */}
      {scene === "cold" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              position: "absolute", width: 12, height: 12, borderRadius: "50%",
              border: "1.5px solid rgba(255,255,255,0.3)",
              animation: `pulse-ring 1.8s ${i * 0.3}s ease-out infinite`,
              opacity: fade(p0, 0, 0.3),
            }} />
          ))}
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff", opacity: fade(p0, 0, 0.2), boxShadow: "0 0 20px rgba(255,255,255,0.8)" }} />
        </div>
      )}

      {/* ══ ALONE ══ */}
      {scene === "alone" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px", textAlign: "center" }}>
          <p style={{ fontSize: "clamp(1.6rem,5vw,3.2rem)", fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.2, opacity: fade(p1, 0, 0.2), transform: `translateY(${(1 - fade(p1, 0, 0.25)) * 30}px)`, maxWidth: 600 }}>
            Most people work out
          </p>
          <p style={{ fontSize: "clamp(1.6rem,5vw,3.2rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2, background: "linear-gradient(90deg,#666,#444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", opacity: fade(p1, 0.15, 0.2), transform: `translateY(${(1 - fade(p1, 0.15, 0.25)) * 30}px)`, maxWidth: 600 }}>
            alone.
          </p>
          <p style={{ marginTop: 24, fontSize: "clamp(0.85rem,2.5vw,1.1rem)", color: "#555", letterSpacing: "0.3em", textTransform: "uppercase", fontWeight: 600, opacity: fade(p1, 0.4, 0.2) }}>
            Until now.
          </p>
        </div>
      )}

      {/* ══ GHOST WORKOUT ══ */}
      {scene === "ghost" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 32 }}>
          <div style={{ width: "min(220px,40vw)", borderRadius: 32, background: "#0a0a0a", border: "2px solid rgba(124,58,237,0.5)", boxShadow: "0 0 60px rgba(124,58,237,0.3),0 0 120px rgba(124,58,237,0.1)", overflow: "hidden", opacity: fade(p2, 0, 0.15), transform: `scale(${0.88 + fade(p2, 0, 0.2) * 0.12}) translateY(${(1 - fade(p2, 0, 0.2)) * 40}px)` }}>
            <div style={{ padding: "18px 14px 14px", background: "#080808" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ width: 30, height: 30, borderRadius: 10, background: "rgba(124,58,237,0.3)", border: "1px solid rgba(124,58,237,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>sprint</span>
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#f2f2f2", margin: 0 }}>Ghost Workout</p>
                  <p style={{ fontSize: 9, color: "#555", margin: 0 }}>2,341 training with you</p>
                </div>
                <div style={{ marginLeft: "auto", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 6, padding: "2px 7px" }}>
                  <span style={{ fontSize: 8, fontWeight: 800, color: "#ef4444", letterSpacing: "0.1em" }}>LIVE</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 3, height: 40, marginBottom: 12 }}>
                {Array.from({ length: 18 }, (_, i) => {
                  const h = 8 + Math.sin(i * 0.8 + t / 200) * 14 + Math.sin(i * 1.7 + t / 150) * 8;
                  return <div key={i} style={{ flex: 1, borderRadius: 3, background: i < 18 * p2 ? "rgba(124,58,237,0.8)" : "rgba(255,255,255,0.08)", height: `${Math.max(6, h)}px` }} />;
                })}
              </div>
              {[
                { name: "Squat",    sets: "4×8",  done: p2 > 0.3,  weight: "80kg"  },
                { name: "Deadlift", sets: "3×5",  done: p2 > 0.55, weight: "100kg" },
                { name: "Press",    sets: "3×10", done: false,     weight: "60kg"  },
              ].map((ex) => (
                <div key={ex.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, marginBottom: 6, background: ex.done ? "rgba(124,58,237,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${ex.done ? "rgba(124,58,237,0.3)" : "rgba(255,255,255,0.06)"}` }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", background: ex.done ? "rgba(124,58,237,0.3)" : "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {ex.done && <span className="material-symbols-outlined" style={{ fontSize: 10, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>check</span>}
                  </div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: ex.done ? "#a78bfa" : "#888", flex: 1, margin: 0 }}>{ex.name}</p>
                  <p style={{ fontSize: 9, color: "#555", margin: 0 }}>{ex.sets}</p>
                  <p style={{ fontSize: 9, color: "#444", margin: 0 }}>{ex.weight}</p>
                </div>
              ))}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "clamp(0.65rem,2vw,0.8rem)", fontWeight: 800, letterSpacing: "0.3em", color: "#a78bfa", opacity: fade(p2, 0.25, 0.2), marginBottom: 8 }}>GHOST WORKOUTS</p>
            <p style={{ fontSize: "clamp(1.2rem,3.5vw,2rem)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", opacity: fade(p2, 0.3, 0.2), transform: `translateY(${(1 - fade(p2, 0.3, 0.25)) * 20}px)` }}>Train alongside real people.</p>
            <p style={{ fontSize: "clamp(0.85rem,2vw,1rem)", color: "#555", opacity: fade(p2, 0.4, 0.2) }}>Live or on-demand. Any time.</p>
          </div>
        </div>
      )}

      {/* ══ FEATURES ══ */}
      {scene === "features" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", gap: 20 }}>
          <p style={{ fontSize: "clamp(0.65rem,2vw,0.75rem)", fontWeight: 800, letterSpacing: "0.3em", color: "#444", textTransform: "uppercase", opacity: fade(p3, 0, 0.15) }}>Everything you need</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%", maxWidth: 480 }}>
            {features.map((f, i) => {
              const o = fade(p3, i * 0.12, 0.2);
              const rgb = f.color === "#ef4444" ? "239,68,68" : f.color === "#a78bfa" ? "167,139,250" : f.color === "#f59e0b" ? "245,158,11" : "6,182,212";
              return (
                <div key={f.label} style={{ padding: "18px 16px", borderRadius: 20, background: `rgba(${rgb},0.07)`, border: `1px solid ${f.color}30`, opacity: o, transform: `translateY(${(1 - o) * 24}px) scale(${0.92 + o * 0.08})` }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 26, color: f.color, display: "block", marginBottom: 10, fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
                  <p style={{ fontSize: "clamp(0.65rem,1.8vw,0.75rem)", fontWeight: 800, color: "#f2f2f2", letterSpacing: "0.08em", margin: "0 0 4px" }}>{f.label}</p>
                  <p style={{ fontSize: "clamp(0.7rem,1.8vw,0.8rem)", color: "#555", margin: 0 }}>{f.sub}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ TAGLINE ══ */}
      {scene === "tagline" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px", textAlign: "center" }}>
          <p style={{ fontSize: "clamp(1.5rem,5vw,3rem)", fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.25, maxWidth: 620, opacity: fade(p4, 0, 0.2), transform: `translateY(${(1 - fade(p4, 0, 0.25)) * 30}px)` }}>
            The fitness platform built for people who{" "}
            <span style={{ background: "linear-gradient(90deg,#7C3AED,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              actually show up.
            </span>
          </p>
        </div>
      )}

      {/* ══ OUTRO ══ */}
      {(scene === "outro" || done) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
          <div style={{ opacity: fade(p5, 0, 0.25), transform: `scale(${0.85 + fade(p5, 0, 0.3) * 0.15})` }}>
            <img src="/static/logo-nav.svg" alt="Felcin" style={{ width: 72, height: 72, borderRadius: 20 }} />
          </div>
          <div style={{ textAlign: "center", opacity: fade(p5, 0.15, 0.2) }}>
            <p style={{ fontSize: "clamp(2rem,7vw,4rem)", fontWeight: 900, color: "#fff", letterSpacing: "-0.04em", margin: "0 0 8px" }}>Felcin.</p>
            <p style={{ fontSize: "clamp(1rem,3vw,1.5rem)", color: "#555", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase" }}>Train together.</p>
          </div>

          {/* felcin.com */}
          <p style={{ fontSize: "clamp(0.8rem,2vw,1rem)", color: "#333", fontWeight: 500, letterSpacing: "0.08em", opacity: fade(p5, 0.3, 0.2) }}>felcin.com</p>

          {/* Store badges */}
          <div style={{ display: "flex", gap: 12, opacity: fade(p5, 0.38, 0.22), transform: `translateY(${(1 - fade(p5, 0.38, 0.25)) * 16}px)` }}>
            {/* Apple App Store */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderRadius: 12, background: "#fff", cursor: "pointer" }}>
              <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
                <path d="M16.462 12.748c-.026-3.026 2.47-4.494 2.583-4.564-1.408-2.057-3.597-2.338-4.377-2.366-1.862-.19-3.634 1.1-4.577 1.1-.944 0-2.394-1.074-3.93-1.047C4.074 5.9 2.05 7.196 .944 9.197c-2.243 3.895-.574 9.666 1.61 12.823 1.065 1.547 2.334 3.283 3.997 3.22 1.61-.065 2.217-1.047 4.163-1.047 1.946 0 2.5 1.047 4.19 1.02 1.729-.025 2.822-1.572 3.874-3.127 1.218-1.793 1.724-3.54 1.75-3.63-.038-.013-3.36-1.29-3.386-5.108z" fill="#000"/>
                <path d="M13.332 3.9C14.19 2.847 14.77 1.403 14.61 0c-1.22.052-2.703.82-3.583 1.857-.787.914-1.48 2.397-1.294 3.807 1.364.106 2.757-.693 3.6-1.764z" fill="#000"/>
              </svg>
              <div>
                <p style={{ fontSize: 9, color: "#000", margin: 0, opacity: 0.6 }}>Download on the</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#000", margin: 0 }}>App Store</p>
              </div>
            </div>
            {/* Google Play */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderRadius: 12, background: "#fff", cursor: "pointer" }}>
              <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
                <path d="M.333 1.13C.12 1.36 0 1.72 0 2.19v17.62c0 .47.12.83.34 1.06l.06.06L9.56 11.1v-.22L.4 1.07l-.07.06z" fill="url(#gp1)"/>
                <path d="M12.7 14.23l-3.14-3.14v-.22l3.14-3.14.07.04 3.72 2.12c1.06.6 1.06 1.58 0 2.18l-3.72 2.12-.07.04z" fill="url(#gp2)"/>
                <path d="M12.77 14.19L9.56 11 .33 20.21c.35.37.93.42 1.58.05l10.86-6.07z" fill="url(#gp3)"/>
                <path d="M12.77 7.81L1.91 1.74C1.26 1.37.68 1.42.33 1.79L9.56 11l3.21-3.19z" fill="url(#gp4)"/>
                <defs>
                  <linearGradient id="gp1" x1="8.77" y1="2.05" x2="-3.6" y2="14.4" gradientUnits="userSpaceOnUse"><stop stopColor="#00A0FF"/><stop offset="1" stopColor="#00679E"/></linearGradient>
                  <linearGradient id="gp2" x1="17.4" y1="11" x2="-.19" y2="11" gradientUnits="userSpaceOnUse"><stop stopColor="#FFD600"/><stop offset="1" stopColor="#FF9C00"/></linearGradient>
                  <linearGradient id="gp3" x1="10.98" y1="13.07" x2="-.81" y2="24.85" gradientUnits="userSpaceOnUse"><stop stopColor="#FF3A44"/><stop offset="1" stopColor="#C31162"/></linearGradient>
                  <linearGradient id="gp4" x1="-1.35" y1="-.65" x2="7.97" y2="8.68" gradientUnits="userSpaceOnUse"><stop stopColor="#32A071"/><stop offset="1" stopColor="#2DA771"/></linearGradient>
                </defs>
              </svg>
              <div>
                <p style={{ fontSize: 9, color: "#000", margin: 0, opacity: 0.6 }}>Get it on</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#000", margin: 0 }}>Google Play</p>
              </div>
            </div>
          </div>

          {done && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 8, opacity: fade(p5, 0.55, 0.25) }}>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleReplay} style={{ padding: "10px 24px", borderRadius: 50, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#888", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  ↺ Replay
                </button>
                <button onClick={startRecording} disabled={recording}
                  style={{ padding: "10px 24px", borderRadius: 50, background: recording ? "rgba(167,139,250,0.12)" : "rgba(167,139,250,0.2)", border: "1px solid rgba(167,139,250,0.4)", color: recording ? "#888" : "#a78bfa", fontSize: 13, fontWeight: 600, cursor: recording ? "not-allowed" : "pointer" }}>
                  {recording ? "Recording…" : recDone ? "✓ Downloaded" : "⬇ Download"}
                </button>
              </div>

              {recDone && (
                <div style={{ marginTop: 8, padding: "16px 20px", borderRadius: 14, background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", maxWidth: 340, textAlign: "left" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", margin: "0 0 10px", letterSpacing: "0.06em" }}>
                    ✓ {recFile} saved — next steps for Google Ads:
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { n: "1", text: "Upload the file to YouTube (can be Unlisted)", link: "https://youtube.com/upload", label: "Open YouTube Upload" },
                      { n: "2", text: "Copy the YouTube URL after it finishes processing", link: null, label: null },
                      { n: "3", text: "In Google Ads → your App campaign → Video assets → paste the YouTube URL", link: "https://ads.google.com", label: "Open Google Ads" },
                    ].map((s) => (
                      <div key={s.n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(124,58,237,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: "#a78bfa" }}>{s.n}</span>
                        </div>
                        <div>
                          <p style={{ fontSize: 11, color: "#888", margin: "0 0 3px", lineHeight: 1.4 }}>{s.text}</p>
                          {s.link && <a href={s.link} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, textDecoration: "none" }}>{s.label} →</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {recFile.endsWith(".webm") && (
                    <p style={{ fontSize: 10, color: "#555", margin: "10px 0 0", lineHeight: 1.5 }}>
                      Got a .webm file? YouTube accepts it. If you need MP4, use{" "}
                      <a href="https://cloudconvert.com/webm-to-mp4" target="_blank" rel="noreferrer" style={{ color: "#a78bfa" }}>cloudconvert.com</a> to convert first.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      {playing && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.06)" }}>
          <div style={{ height: "100%", width: `${(t / TOTAL_DURATION) * 100}%`, background: "linear-gradient(90deg,#7C3AED,#a78bfa)", transition: "width 0.1s linear" }} />
        </div>
      )}

      {/* Recording indicator */}
      {recording && (
        <div style={{ position: "absolute", top: 20, right: 20, display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 50, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "pulse-ring 1.2s ease-out infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", letterSpacing: "0.1em" }}>REC</span>
        </div>
      )}

      {/* START SCREEN */}
      {!started && (
        <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#000", gap: 32 }}>
          <img src="/static/logo-nav.svg" alt="Felcin" style={{ width: 64, height: 64, borderRadius: 18, opacity: 0.9 }} />
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "clamp(1.4rem,5vw,2.5rem)", fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", margin: "0 0 8px" }}>Train With Someone.</p>
            <p style={{ fontSize: "clamp(0.85rem,2vw,1rem)", color: "#444", margin: "0 0 20px" }}>45-second Felcin promo · with voiceover</p>
            <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 20px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(124,58,237,0.2)", borderLeft: "3px solid #7C3AED", textAlign: "left" }}>
              <p style={{ fontSize: "clamp(0.75rem,2vw,0.85rem)", fontWeight: 700, color: "#a78bfa", margin: "0 0 6px", letterSpacing: "0.06em" }}>FELCIN <span style={{ fontWeight: 400, fontStyle: "italic", color: "#555" }}>n.</span></p>
              <p style={{ fontSize: "clamp(0.72rem,1.8vw,0.82rem)", color: "#666", lineHeight: 1.65, margin: 0 }}>
                An original coined term with no prior meaning, adopted as the exclusive brand identity of a next-generation fitness and social platform. Felcin represents the moment a person commits to their transformation — not alone, but alongside a community that trains, grows, and wins together.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <button onClick={handleStart} style={{ padding: "16px 48px", borderRadius: 50, background: "#fff", color: "#000", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 0 40px rgba(255,255,255,0.15)" }}>
              ▶ Play Ad
            </button>
            <button
              onClick={startRecording}
              style={{ padding: "12px 36px", borderRadius: 50, background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.35)", color: "#a78bfa", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              ⬇ Record & Download
            </button>
            <p style={{ fontSize: 11, color: "#333", margin: 0, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
              Records the full 57s ad and saves it as MP4 (or WebM on Chrome). Then upload to YouTube and paste the link into Google Ads.
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(8); opacity: 0;   }
        }
        .material-symbols-outlined {
          font-family: 'Material Symbols Outlined';
          font-weight: normal;
          font-style: normal;
          display: inline-block;
          line-height: 1;
          text-transform: none;
          letter-spacing: normal;
          word-wrap: normal;
          white-space: nowrap;
          direction: ltr;
        }
      `}</style>
    </div>
  );
}
