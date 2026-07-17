"use client";

import { useState, useEffect, useRef } from "react";
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  serverTimestamp, query, orderBy, where, onSnapshot,
} from "@/lib/db";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

interface Episode {
  id: string;
  title: string;
  description?: string;
  audioUrl: string;
  coverUrl?: string;
  hostId: string;
  hostName: string;
  hostPhoto?: string;
  duration?: number;
  publishedAt?: { seconds: number };
  plays?: number;
}

interface LivePodcast {
  id: string;
  hostId: string;
  hostName: string;
  hostPhoto?: string;
  title?: string;
  listenerCount?: number;
  startedAt?: { seconds: number };
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function timeAgo(seconds: number) {
  const diff = Date.now() / 1000 - seconds;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function WaveformBars({
  playing = false, count = 5, color = "#7C3AED", height = 24,
}: { playing?: boolean; count?: number; color?: string; height?: number }) {
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          width: 3,
          height: playing ? "100%" : `${30 + (i % 3) * 20}%`,
          background: color,
          borderRadius: 2,
          animation: playing ? `studioBar${(i % 4) + 1} 0.8s ease-in-out infinite` : "none",
          animationDelay: `${i * 0.1}s`,
          transition: "height 0.3s ease",
        }} />
      ))}
    </div>
  );
}

/* Animated EQ bars — paused by default, animated when hovered */
function EQBars({ count = 8, color = "#a78bfa", height = 20, active = false }: {
  count?: number; color?: string; height?: number; active?: boolean;
}) {
  const patterns = [
    ["20%", "80%", "40%"], ["60%", "25%", "90%"], ["40%", "100%", "30%"],
    ["80%", "35%", "70%"], ["30%", "90%", "50%"], ["70%", "20%", "85%"],
    ["50%", "75%", "20%"], ["90%", "45%", "65%"],
  ];
  return (
    <div className="flex items-end gap-[2px]" style={{ height }}>
      {Array.from({ length: count }).map((_, i) => {
        const p = patterns[i % patterns.length];
        return (
          <div key={i} style={{
            width: 3,
            height: active ? "100%" : p[0],
            background: color,
            borderRadius: 1.5,
            animation: active ? `eqBar${(i % 4) + 1} ${0.5 + (i % 4) * 0.08}s ease-in-out infinite` : "none",
            animationDelay: `${i * 0.07}s`,
            transition: "height 0.25s ease",
          }} />
        );
      })}
    </div>
  );
}

/* Gradient colour palettes for episode art thumbnails */
const EP_GRADIENTS = [
  "linear-gradient(135deg,#1a0533,#0a0a1a)",
  "linear-gradient(135deg,#001a33,#060618)",
  "linear-gradient(135deg,#1a1000,#060610)",
  "linear-gradient(135deg,#001a12,#060618)",
  "linear-gradient(135deg,#1a0020,#060618)",
  "linear-gradient(135deg,#170f00,#060618)",
];

export default function PodcastsPage() {
  const { user, loading: authLoading } = useAuth();
  const [followers, setFollowers] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [liveShows, setLiveShows] = useState<LivePodcast[]>([]);
  const [hoveredEp, setHoveredEp] = useState<string | null>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showGoLive, setShowGoLive] = useState(false);
  const [liveTitle, setLiveTitle] = useState("");
  const [goingLive, setGoingLive] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);

  const isOwner = !authLoading && !!user && OWNER_UIDS.includes(user.uid);
  const isLive = liveShows.some((s) => s.hostId === user?.uid);

  useEffect(() => {
    if (!user || isOwner) return;
    getDoc(doc(db, "users", user.uid, "public", "profile")).then((snap) => {
      if (snap.exists()) {
        setFollowers(snap.data().followersCount ?? 0);
      } else {
        getDoc(doc(db, "users", user.uid)).then((rootSnap) => {
          setFollowers(rootSnap.exists() ? (rootSnap.data().followersCount ?? 0) : 0);
        }).catch(() => setFollowers(0));
      }
    }).catch(() => setFollowers(0));
  }, [user, isOwner]);

  useEffect(() => {
    const q = query(collection(db, "livePodcasts"), where("status", "==", "live"));
    return onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LivePodcast, "id">) }));
      all.sort((a, b) => (b.startedAt?.seconds ?? 0) - (a.startedAt?.seconds ?? 0));
      setLiveShows(all);
    }, () => {});
  }, []);

  useEffect(() => {
    const q = query(collection(db, "podcasts"), orderBy("publishedAt", "desc"));
    getDocs(q).then((snap) => {
      setEpisodes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Episode, "id">) })));
      setEpisodesLoading(false);
    }).catch(() => setEpisodesLoading(false));
  }, []);

  useEffect(() => {
    const isOpen = showGoLive || showUpload;
    if (!isOpen) { setKbOffset(0); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    const baseH = vv.height;
    const update = () => setKbOffset(Math.max(0, baseH - vv.height));
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, [showGoLive, showUpload]);

  async function startLive() {
    if (!user || goingLive) return;
    setGoingLive(true);
    try {
      await setDoc(doc(db, "livePodcasts", user.uid), {
        hostId: user.uid,
        hostName: user.displayName || "Host",
        hostPhoto: user.photoURL || null,
        title: liveTitle.trim() || null,
        status: "live",
        listenerCount: 0,
        startedAt: serverTimestamp(),
      });
      setShowGoLive(false);
      setLiveTitle("");
    } catch {}
    setGoingLive(false);
  }

  async function endLive() {
    if (!user) return;
    await updateDoc(doc(db, "livePodcasts", user.uid), { status: "ended" }).catch(() => {});
  }

  async function handleUpload() {
    if (!user || !uploadFile || !uploadTitle.trim() || uploading) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const ext = uploadFile.name.split(".").pop();
      const storageRef = ref(storage, `uploads/podcasts/${Date.now()}.${ext}`);
      const task = uploadBytesResumable(storageRef, uploadFile);
      await new Promise<void>((resolve, reject) => {
        task.on("state_changed",
          (snap) => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject, resolve
        );
      });
      const audioUrl = await getDownloadURL(storageRef);
      let duration: number | undefined;
      try {
        const audio = new Audio(audioUrl);
        await new Promise<void>((res) => {
          audio.addEventListener("loadedmetadata", () => { duration = audio.duration; res(); }, { once: true });
          setTimeout(res, 5000);
        });
      } catch {}
      const ep = await addDoc(collection(db, "podcasts"), {
        title: uploadTitle.trim(),
        description: uploadDesc.trim() || null,
        audioUrl,
        hostId: user.uid,
        hostName: user.displayName || "Host",
        hostPhoto: user.photoURL || null,
        duration: duration ?? null,
        plays: 0,
        publishedAt: serverTimestamp(),
      });
      setEpisodes((prev) => [{
        id: ep.id, title: uploadTitle.trim(),
        description: uploadDesc.trim() || undefined,
        audioUrl, hostId: user.uid,
        hostName: user.displayName || "Host",
        hostPhoto: user.photoURL || undefined,
        duration, plays: 0,
      }, ...prev]);
      setShowUpload(false);
      setUploadTitle(""); setUploadDesc(""); setUploadFile(null);
    } catch {}
    setUploading(false);
  }

  if (authLoading) return <div className="flex justify-center py-32"><div className="spinner" /></div>;

  if (!isOwner) {
    if (followers === null) return <div className="flex justify-center py-32"><div className="spinner" /></div>;
    if (followers < 300) {
      return (
        <div className="max-w-xl mx-auto px-4 py-6 flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
          <style>{`
            @keyframes lockGlow { 0%,100%{opacity:.55} 50%{opacity:.9} }
            @keyframes onAirPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
          `}</style>
          <div className="relative w-full rounded-3xl overflow-hidden mb-8 flex flex-col items-center justify-center py-14 px-6"
            style={{ background: "linear-gradient(135deg, #0d0618 0%, #130a24 100%)", border: "1px solid rgba(124,58,237,0.2)" }}>
            {/* Ghost logo watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <img src="/static/logo-nav.svg" alt="" style={{ width: 200, opacity: 0.05, filter: "grayscale(1) brightness(3)" }} />
            </div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)", filter: "blur(20px)", animation: "lockGlow 4s ease-in-out infinite" }} />
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#7C3AED", fontVariationSettings: "'FILL' 1" }}>lock</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-4"
                style={{ background: "rgba(124,58,237,0.12)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.25)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>group</span>
                300 FOLLOWERS TO UNLOCK STUDIO
              </div>
              <h1 className="text-2xl font-bold text-center mb-2" style={{ color: "#f2f2f2" }}>Podcast Studio</h1>
              <p className="text-sm text-center leading-relaxed mb-6" style={{ color: "#666", maxWidth: 260 }}>
                You have {followers} follower{followers !== 1 ? "s" : ""}. Reach 300 to start broadcasting.
              </p>
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-xs mb-2" style={{ color: "#555" }}>
                  <span>{followers}</span><span>300</span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full" style={{
                    width: `${Math.min(100, (followers / 300) * 100)}%`,
                    background: "linear-gradient(90deg, #7C3AED, #a78bfa)",
                  }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  const featuredEp = episodes[0] ?? null;
  const restEpisodes = episodes.slice(1);

  return (
    <>
      <style>{`
        @keyframes studioBar1 { 0%,100%{height:20%} 50%{height:100%} }
        @keyframes studioBar2 { 0%,100%{height:60%} 50%{height:30%} }
        @keyframes studioBar3 { 0%,100%{height:40%} 50%{height:90%} }
        @keyframes studioBar4 { 0%,100%{height:80%} 50%{height:20%} }
        @keyframes eqBar1 { 0%,100%{height:20%} 50%{height:100%} }
        @keyframes eqBar2 { 0%,100%{height:70%} 50%{height:25%} }
        @keyframes eqBar3 { 0%,100%{height:40%} 50%{height:85%} }
        @keyframes eqBar4 { 0%,100%{height:90%} 50%{height:30%} }
        @keyframes onAirPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes onAirRing  { 0%{transform:scale(.8);opacity:.8} 100%{transform:scale(2.2);opacity:0} }
        @keyframes studioGlow { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes floatLogo  { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-12px) rotate(2deg)} }
        @keyframes scanLine   { from{top:0%} to{top:100%} }
        @keyframes slideUp    { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes heroGlow   { 0%,100%{opacity:.5} 50%{opacity:.85} }
        .ep-card-hover:hover { border-color: rgba(124,58,237,0.45) !important; box-shadow: 0 0 28px rgba(124,58,237,0.18) !important; transform: translateY(-2px); }
        .ep-card-hover { transition: border-color .2s, box-shadow .2s, transform .2s; }
      `}</style>

      {/* ── Go Live modal ── */}
      {showGoLive && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.88)", paddingBottom: kbOffset }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowGoLive(false); }}>
          <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-y-auto"
            style={{ background: "#0d0618", border: "1px solid rgba(239,68,68,0.3)", maxHeight: "85dvh", marginBottom: "calc(env(safe-area-inset-bottom,0px) + 64px)", padding: "24px 24px calc(env(safe-area-inset-bottom,16px) + 24px)" }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: "#ef4444", fontVariationSettings: "'FILL' 1" }}>sensors</span>
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Go Live on Studio</p>
                <p className="text-xs" style={{ color: "#666" }}>Start broadcasting now</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-xl"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
              <div className="w-2 h-2 rounded-full" style={{ background: "#ef4444", animation: "onAirPulse 1s infinite" }} />
              <span className="text-xs font-bold" style={{ color: "#ef4444" }}>YOUR BROADCAST WILL BE LIVE INSTANTLY</span>
            </div>
            <input type="text" placeholder="What are you broadcasting today?"
              value={liveTitle} onChange={(e) => setLiveTitle(e.target.value)} maxLength={80}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-4"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }}
              onKeyDown={(e) => { if (e.key === "Enter") startLive(); }} />
            <button onClick={startLive} disabled={goingLive}
              className="w-full py-3.5 rounded-xl font-bold text-sm border-none cursor-pointer flex items-center justify-center gap-2"
              style={{ background: goingLive ? "rgba(239,68,68,0.4)" : "#ef4444", color: "#fff", fontSize: 15 }}>
              {goingLive
                ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Going Live…</>
                : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>sensors</span> Start Broadcast</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Upload modal ── */}
      {showUpload && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.88)", paddingBottom: kbOffset }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowUpload(false); }}>
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-y-auto"
            style={{ background: "#0d0618", border: "1px solid rgba(124,58,237,0.3)", maxHeight: "85dvh", marginBottom: "calc(env(safe-area-inset-bottom,0px) + 64px)", padding: "24px 24px calc(env(safe-area-inset-bottom,16px) + 24px)" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>mic</span>
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>New Episode</p>
                <p className="text-xs" style={{ color: "#666" }}>Drop it in the studio</p>
              </div>
            </div>
            <input type="text" placeholder="Episode title" value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)} maxLength={100}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-3"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
            <textarea placeholder="What's this episode about?" value={uploadDesc}
              onChange={(e) => setUploadDesc(e.target.value)} maxLength={500} rows={3}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-3 resize-none"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 rounded-xl text-sm mb-4 flex flex-col items-center justify-center gap-2"
              style={{ background: "rgba(124,58,237,0.08)", border: `2px dashed ${uploadFile ? "rgba(124,58,237,0.6)" : "rgba(124,58,237,0.25)"}`, color: uploadFile ? "#a78bfa" : "#555" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: uploadFile ? "#a78bfa" : "#444" }}>audio_file</span>
              <span>{uploadFile ? uploadFile.name : "Tap to select audio file"}</span>
            </button>
            {uploading && (
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1.5" style={{ color: "#666" }}>
                  <span>Uploading to studio…</span><span>{uploadProgress}%</span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "rgba(124,58,237,0.1)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${uploadProgress}%`, background: "linear-gradient(90deg, #7C3AED, #a78bfa)" }} />
                </div>
              </div>
            )}
            <button onClick={handleUpload} disabled={!uploadFile || !uploadTitle.trim() || uploading}
              className="w-full py-3.5 rounded-xl font-bold text-sm border-none cursor-pointer"
              style={{
                background: (!uploadFile || !uploadTitle.trim() || uploading) ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #7C3AED, #a78bfa)",
                color: (!uploadFile || !uploadTitle.trim() || uploading) ? "#444" : "#fff",
              }}>
              {uploading ? "Publishing…" : "Publish Episode"}
            </button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pb-10">

        {/* ════════════════════════════════
            CINEMATIC HERO BANNER
        ════════════════════════════════ */}
        <div className="relative w-full rounded-3xl overflow-hidden mb-6"
          style={{ background: "linear-gradient(135deg, #0a0114 0%, #110828 50%, #0a0114 100%)", border: "1px solid rgba(124,58,237,0.22)", minHeight: 240 }}>

          {/* Scan line */}
          <div className="absolute left-0 w-full pointer-events-none" style={{
            height: 2, background: "linear-gradient(90deg,transparent,rgba(168,85,247,0.35),transparent)",
            animation: "scanLine 6s linear infinite", zIndex: 1,
          }} />

          {/* Radial spotlight glow */}
          <div className="absolute pointer-events-none" style={{
            top: "-20%", left: "50%", transform: "translateX(-50%)",
            width: 480, height: 480,
            background: "radial-gradient(ellipse at center, rgba(124,58,237,0.38) 0%, rgba(80,0,180,0.12) 40%, transparent 68%)",
            animation: "heroGlow 4s ease-in-out infinite",
          }} />

          {/* Ghost logo watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <img src="/static/logo-nav.svg" alt=""
              style={{ width: 220, opacity: 0.05, filter: "grayscale(1) brightness(3)", animation: "floatLogo 8s ease-in-out infinite" }} />
          </div>

          {/* Content */}
          <div className="relative z-10 p-6 flex flex-col justify-between" style={{ minHeight: 240 }}>
            <div className="flex items-start justify-between">
              <div style={{ animation: "slideUp .7s ease both" }}>
                {/* Studio label */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(124,58,237,0.3)", border: "1px solid rgba(124,58,237,0.45)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>mic</span>
                  </div>
                  <span className="text-xs font-black tracking-widest" style={{ color: "#a78bfa", letterSpacing: "0.2em" }}>PODCAST STUDIO</span>
                </div>

                {/* Main title */}
                <h1 className="font-black mb-1" style={{
                  fontSize: "clamp(2rem,8vw,2.8rem)", letterSpacing: -1.5, lineHeight: 1,
                  background: "linear-gradient(135deg,#fff 0%,#c084fc 55%,#a78bfa 100%)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}>
                  {liveShows.length > 0 ? "On Air" : "Studio"}
                </h1>
                <p className="text-sm mt-1.5" style={{ color: "#666" }}>
                  {liveShows.length > 0
                    ? `${liveShows.length} live broadcast${liveShows.length > 1 ? "s" : ""} happening now`
                    : "Where fitness creators broadcast"}
                </p>
              </div>

              {/* Right — On Air badge + waveform */}
              <div className="flex flex-col items-end gap-3">
                {liveShows.length > 0 ? (
                  <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-full"
                    style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)" }}>
                    <div className="relative w-2 h-2">
                      <div className="absolute inset-0 rounded-full" style={{ background: "#ef4444", animation: "onAirPulse 1.2s ease-in-out infinite" }} />
                      <div className="absolute rounded-full" style={{ inset: -3, border: "1.5px solid rgba(239,68,68,0.5)", animation: "onAirRing 1.2s ease-out infinite" }} />
                    </div>
                    <span className="text-xs font-black" style={{ color: "#ef4444" }}>ON AIR</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                    style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#a78bfa" }}>radio</span>
                    <span className="text-xs font-bold" style={{ color: "#a78bfa" }}>STUDIO</span>
                  </div>
                )}
                <WaveformBars playing={liveShows.length > 0} count={9} color={liveShows.length > 0 ? "rgba(239,68,68,0.7)" : "rgba(124,58,237,0.5)"} height={40} />
              </div>
            </div>

            {/* Stats row */}
            {!episodesLoading && (
              <div className="flex items-center gap-5 mt-4 mb-4">
                <div>
                  <span className="text-lg font-black" style={{ color: "#a78bfa" }}>{episodes.length}</span>
                  <span className="text-xs ml-1.5 font-medium" style={{ color: "#555" }}>episodes</span>
                </div>
                <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.07)" }} />
                <div>
                  <span className="text-lg font-black" style={{ color: liveShows.length > 0 ? "#ef4444" : "#a78bfa" }}>{liveShows.length}</span>
                  <span className="text-xs ml-1.5 font-medium" style={{ color: "#555" }}>live now</span>
                </div>
                <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.07)" }} />
                <div>
                  <span className="text-lg font-black" style={{ color: "#a78bfa" }}>
                    {episodes.reduce((sum, ep) => sum + (ep.plays ?? 0), 0)}
                  </span>
                  <span className="text-xs ml-1.5 font-medium" style={{ color: "#555" }}>total plays</span>
                </div>
              </div>
            )}

            {/* Owner controls */}
            {isOwner && (
              <div className="flex items-center gap-2">
                {isLive ? (
                  <button onClick={endLive}
                    className="flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm border-none cursor-pointer"
                    style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: "#ef4444", animation: "onAirPulse 1s infinite" }} />
                    End Broadcast
                  </button>
                ) : (
                  <button onClick={() => setShowGoLive(true)}
                    className="flex items-center gap-2 px-5 py-2 rounded-full font-bold text-sm border-none cursor-pointer"
                    style={{ background: "#ef4444", color: "#fff", boxShadow: "0 0 20px rgba(239,68,68,0.35)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>sensors</span>
                    Go Live
                  </button>
                )}
                <button onClick={() => setShowUpload(true)}
                  className="flex items-center gap-2 px-5 py-2 rounded-full font-bold text-sm border-none cursor-pointer"
                  style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>upload</span>
                  Upload
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ════════════════════════════════
            LIVE NOW SECTION
        ════════════════════════════════ */}
        {liveShows.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative w-2 h-2">
                <div className="absolute inset-0 rounded-full" style={{ background: "#ef4444", animation: "onAirPulse 1s infinite" }} />
                <div className="absolute rounded-full" style={{ inset: -3, border: "1.5px solid rgba(239,68,68,0.5)", animation: "onAirRing 1.2s ease-out infinite" }} />
              </div>
              <span className="text-sm font-black tracking-wide" style={{ color: "#f2f2f2" }}>BROADCASTING NOW</span>
            </div>
            <div className="flex flex-col gap-3">
              {liveShows.map((show) => {
                const isMe = user?.uid === show.hostId;
                const init = (show.hostName || "H").charAt(0).toUpperCase();
                return (
                  <Link key={show.id} href={`/podcasts/live/${show.id}`}
                    className="relative flex items-center gap-4 p-4 rounded-2xl overflow-hidden ep-card-hover"
                    style={{ background: "#0d0618", border: `1px solid ${isMe ? "rgba(239,68,68,0.5)" : "rgba(239,68,68,0.25)"}`, boxShadow: isMe ? "0 0 24px rgba(239,68,68,0.15)" : "none" }}>
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ background: "radial-gradient(ellipse at left, rgba(239,68,68,0.08) 0%, transparent 60%)" }} />
                    <div className="relative flex-shrink-0">
                      {show.hostPhoto ? (
                        <img src={show.hostPhoto} alt="" className="rounded-full object-cover" style={{ width: 52, height: 52 }} />
                      ) : (
                        <div className="rounded-full flex items-center justify-center font-bold"
                          style={{ width: 52, height: 52, background: "rgba(124,58,237,0.2)", color: "#a78bfa", fontSize: 20, border: "1px solid rgba(124,58,237,0.3)" }}>{init}</div>
                      )}
                      <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full flex items-center gap-1"
                        style={{ background: "#ef4444" }}>
                        <div className="w-1.5 h-1.5 rounded-full bg-white" style={{ animation: "onAirPulse 1s infinite" }} />
                        <span className="text-white font-black" style={{ fontSize: 8 }}>{isMe ? "YOU" : "LIVE"}</span>
                      </div>
                    </div>
                    <div className="relative flex-1 min-w-0">
                      <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{isMe ? "You" : show.hostName}</p>
                      {show.title && <p className="text-xs mt-0.5 truncate" style={{ color: "#888" }}>{show.title}</p>}
                      <div className="flex items-center gap-3 mt-2">
                        {show.listenerCount !== undefined && (
                          <div className="flex items-center gap-1">
                            <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#ef4444" }}>headphones</span>
                            <span className="text-xs font-semibold" style={{ color: "#ef4444" }}>{show.listenerCount} listening</span>
                          </div>
                        )}
                        <WaveformBars playing count={5} color="rgba(239,68,68,0.7)" height={16} />
                      </div>
                    </div>
                    <div className="relative flex-shrink-0 flex flex-col items-center gap-1">
                      <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#ef4444", fontVariationSettings: "'FILL' 1", animation: "studioGlow 2s infinite" }}>sensors</span>
                      <span className="text-xs font-bold" style={{ color: "#ef4444" }}>JOIN</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════════════════════
            FEATURED EPISODE
        ════════════════════════════════ */}
        {!episodesLoading && featuredEp && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#a78bfa" }}>star</span>
              <span className="text-sm font-black tracking-wide" style={{ color: "#f2f2f2" }}>FEATURED EPISODE</span>
            </div>

            <Link href={`/podcasts/${featuredEp.id}`}
              className="relative block rounded-2xl overflow-hidden ep-card-hover"
              style={{ background: "linear-gradient(135deg,#0d0618,#130a24)", border: "1px solid rgba(124,58,237,0.25)", boxShadow: "0 0 48px rgba(124,58,237,0.12)" }}
              onMouseEnter={() => setHoveredEp(`featured-${featuredEp.id}`)}
              onMouseLeave={() => setHoveredEp(null)}>

              {/* Top art strip */}
              <div className="relative overflow-hidden flex items-center justify-center" style={{ height: 120, background: EP_GRADIENTS[0] }}>
                {/* Ghost logo watermark inside art */}
                <img src="/static/logo-nav.svg" alt=""
                  style={{ width: 90, opacity: 0.07, filter: "grayscale(1) brightness(3)", position: "absolute" }} />
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,rgba(124,58,237,0.3),rgba(0,0,0,0.4))" }} />
                {/* NEW badge */}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-black"
                  style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.4)", backdropFilter: "blur(8px)" }}>
                  ✦ LATEST
                </div>
                {/* Cover art or mic icon */}
                {featuredEp.coverUrl ? (
                  <img src={featuredEp.coverUrl} alt="" className="relative z-10 rounded-xl object-cover shadow-lg"
                    style={{ width: 72, height: 72, border: "1px solid rgba(124,58,237,0.3)" }} />
                ) : (
                  <div className="relative z-10 w-16 h-16 rounded-xl flex items-center justify-center"
                    style={{ background: "rgba(124,58,237,0.25)", border: "1px solid rgba(124,58,237,0.4)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>mic</span>
                  </div>
                )}
                {/* Play button overlay */}
                <div className="absolute right-4 bottom-4 z-10 w-11 h-11 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,#7C3AED,#a78bfa)", boxShadow: "0 0 20px rgba(124,58,237,0.5)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#fff", fontVariationSettings: "'FILL' 1", marginLeft: 2 }}>play_arrow</span>
                </div>
              </div>

              {/* Info panel */}
              <div className="p-4">
                <p className="text-base font-bold mb-1 leading-snug" style={{ color: "#f2f2f2" }}>{featuredEp.title}</p>
                {featuredEp.description && (
                  <p className="text-xs mb-3 line-clamp-2" style={{ color: "#555" }}>{featuredEp.description}</p>
                )}

                {/* EQ bars + meta row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {featuredEp.duration && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: "rgba(124,58,237,0.1)", color: "#a78bfa" }}>
                        {formatDuration(featuredEp.duration)}
                      </span>
                    )}
                    {featuredEp.plays !== undefined && (
                      <span className="text-xs flex items-center gap-1" style={{ color: "#555" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>headphones</span>
                        {featuredEp.plays} plays
                      </span>
                    )}
                  </div>
                  <EQBars count={10} color="#a78bfa" height={22}
                    active={hoveredEp === `featured-${featuredEp.id}`} />
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* ════════════════════════════════
            ALL EPISODES
        ════════════════════════════════ */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black tracking-wide" style={{ color: "#f2f2f2" }}>
                {featuredEp ? "MORE EPISODES" : "EPISODES"}
              </span>
              {!episodesLoading && episodes.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.2)" }}>
                  {episodes.length}
                </span>
              )}
            </div>
          </div>

          {episodesLoading ? (
            <div className="flex justify-center py-16"><div className="spinner" /></div>
          ) : episodes.length === 0 ? (
            <div className="text-center py-16 rounded-3xl relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #0d0618, #130a24)", border: "1px solid rgba(124,58,237,0.15)" }}>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <img src="/static/logo-nav.svg" alt="" style={{ width: 160, opacity: 0.04, filter: "grayscale(1) brightness(3)" }} />
              </div>
              <div className="relative z-10">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.25)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#7C3AED", fontVariationSettings: "'FILL' 1" }}>mic</span>
                </div>
                <p className="text-lg font-bold mb-1" style={{ color: "#f2f2f2" }}>The studio is quiet</p>
                <p className="text-sm mb-5" style={{ color: "#555" }}>No episodes yet. Be the first to broadcast.</p>
                {isOwner && (
                  <button onClick={() => setShowUpload(true)}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm border-none cursor-pointer"
                    style={{ background: "linear-gradient(135deg, #7C3AED, #a78bfa)", color: "#fff", boxShadow: "0 0 24px rgba(124,58,237,0.35)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload</span>
                    Drop First Episode
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(featuredEp ? restEpisodes : episodes).map((ep, index) => {
                const gradient = EP_GRADIENTS[(index + 1) % EP_GRADIENTS.length];
                const isHovered = hoveredEp === ep.id;
                return (
                  <Link key={ep.id} href={`/podcasts/${ep.id}`}
                    className="group relative flex items-center gap-4 p-4 rounded-2xl overflow-hidden ep-card-hover"
                    style={{ background: "#0d0618", border: "1px solid rgba(124,58,237,0.12)" }}
                    onMouseEnter={() => setHoveredEp(ep.id)}
                    onMouseLeave={() => setHoveredEp(null)}>

                    {/* Subtle left glow */}
                    <div className="absolute inset-0 pointer-events-none"
                      style={{ background: isHovered ? "radial-gradient(ellipse at left, rgba(124,58,237,0.08) 0%, transparent 60%)" : "none", transition: "background .2s" }} />

                    {/* Art thumbnail */}
                    <div className="relative flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden"
                      style={{ background: gradient, border: "1px solid rgba(124,58,237,0.2)" }}>
                      {ep.coverUrl ? (
                        <img src={ep.coverUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <>
                          <img src="/static/logo-nav.svg" alt="" style={{ width: 36, opacity: 0.12, filter: "grayscale(1) brightness(3)", position: "absolute" }} />
                          <span className="relative material-symbols-outlined" style={{ fontSize: 24, color: "#7C3AED", fontVariationSettings: "'FILL' 1" }}>mic</span>
                        </>
                      )}
                    </div>

                    {/* Info */}
                    <div className="relative flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: "#f2f2f2" }}>{ep.title}</p>
                      {ep.description && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: "#555" }}>{ep.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {ep.duration && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: "rgba(124,58,237,0.1)", color: "#a78bfa" }}>
                            {formatDuration(ep.duration)}
                          </span>
                        )}
                        {ep.plays !== undefined && (
                          <span className="text-xs flex items-center gap-1" style={{ color: "#444" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>headphones</span>
                            {ep.plays}
                          </span>
                        )}
                        {ep.publishedAt && (
                          <span className="text-xs" style={{ color: "#333" }}>{timeAgo(ep.publishedAt.seconds)}</span>
                        )}
                      </div>
                    </div>

                    {/* Right — EQ + play */}
                    <div className="relative flex-shrink-0 flex flex-col items-center gap-2">
                      <EQBars count={5} color={isHovered ? "#a78bfa" : "rgba(124,58,237,0.35)"} height={18} active={isHovered} />
                      <div className="w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: isHovered ? "linear-gradient(135deg,#7C3AED,#a78bfa)" : "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)", transition: "background .2s" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: isHovered ? "#fff" : "#a78bfa", fontVariationSettings: "'FILL' 1", marginLeft: 1, transition: "color .2s" }}>play_arrow</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
