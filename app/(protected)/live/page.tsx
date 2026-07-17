"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, serverTimestamp } from "@/lib/db";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Privacy = "public" | "followers";
interface Stream {
  id: string;
  hostId: string;
  hostName?: string;
  hostPhoto?: string;
  title?: string;
  viewerCount?: number;
  startedAt?: { seconds: number };
  privacy?: Privacy;
}

function WaveformBars({ playing = true, count = 9, color = "rgba(239,68,68,0.6)", height = 36 }: {
  playing?: boolean; count?: number; color?: string; height?: number;
}) {
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          width: 3,
          height: playing ? "100%" : `${30 + (i % 3) * 20}%`,
          background: color,
          borderRadius: 2,
          animation: playing ? `liveBar${(i % 4) + 1} ${0.7 + i * 0.05}s ease-in-out infinite` : "none",
          animationDelay: `${i * 0.09}s`,
          transition: "height 0.3s ease",
        }} />
      ))}
    </div>
  );
}

export default function LivePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(true);
  const [followers, setFollowers] = useState<number | null>(null);
  const [showGoLive, setShowGoLive] = useState(false);
  const [streamTitle, setStreamTitle] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("public");
  const [starting, setStarting] = useState(false);
  const [hoveredStream, setHoveredStream] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const isOwner = !authLoading && !!user && OWNER_UIDS.includes(user.uid);
  const canGoLive = isOwner || (followers !== null && followers >= 1000);
  const totalViewers = streams.reduce((sum, s) => sum + (s.viewerCount ?? 0), 0);

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
    const q = query(collection(db, "streams"), where("status", "==", "live"));
    return onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Stream, "id">) }));
      all.sort((a, b) => (b.startedAt?.seconds ?? 0) - (a.startedAt?.seconds ?? 0));
      setStreams(all);
      setStreamsLoading(false);
    }, () => setStreamsLoading(false));
  }, []);

  useEffect(() => {
    if (!showGoLive) return;
    const y = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${y}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, y);
    };
  }, [showGoLive]);

  async function startStream() {
    if (!user || starting) return;
    setStarting(true);
    try {
      await setDoc(doc(db, "streams", user.uid), {
        hostId: user.uid,
        hostName: user.displayName || "User",
        hostPhoto: user.photoURL || null,
        title: streamTitle.trim() || null,
        status: "live",
        privacy,
        viewerCount: 0,
        startedAt: serverTimestamp(),
      });
      fetch("/api/notify-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostUid: user.uid,
          hostName: user.displayName || "Someone",
          title: streamTitle.trim() || null,
          privacy,
        }),
      }).catch(() => {});
      router.push(`/live/${user.uid}`);
    } catch {
      setStarting(false);
    }
  }

  if (authLoading) return <div className="flex justify-center py-32"><div className="spinner" /></div>;

  return (
    <>
      <style>{`
        @keyframes liveBar1  { 0%,100%{height:15%} 50%{height:100%} }
        @keyframes liveBar2  { 0%,100%{height:65%} 50%{height:25%} }
        @keyframes liveBar3  { 0%,100%{height:35%} 50%{height:85%} }
        @keyframes liveBar4  { 0%,100%{height:85%} 50%{height:20%} }
        @keyframes onAirPulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes onAirRing  { 0%{transform:scale(.8);opacity:.9} 100%{transform:scale(2.4);opacity:0} }
        @keyframes floatLogo  { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-14px) rotate(2deg)} }
        @keyframes scanLine   { from{top:0%} to{top:100%} }
        @keyframes slideUp    { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes heroGlow   { 0%,100%{opacity:.45} 50%{opacity:.8} }
        @keyframes tvFlicker  { 0%,97%,100%{opacity:1} 98%{opacity:.85} 99%{opacity:.95} }
        .stream-card { transition: border-color .2s, box-shadow .2s, transform .2s; }
        .stream-card:hover { border-color: rgba(239,68,68,0.5) !important; box-shadow: 0 0 32px rgba(239,68,68,0.2) !important; transform: translateY(-3px); }
      `}</style>

      {/* ── Go Live modal ── */}
      {showGoLive && (
        <div className="fixed inset-0 z-[60] flex flex-col sm:items-center sm:justify-center"
          style={{ background: "#0a0008" }}>
          <div ref={modalRef} className="flex flex-col flex-1 sm:flex-none w-full sm:max-w-sm sm:rounded-2xl overflow-y-auto relative"
            style={{ background: "linear-gradient(135deg,#0d0005,#130008)", border: "1px solid rgba(239,68,68,0.25)", paddingTop: "max(24px, env(safe-area-inset-top, 24px))", paddingLeft: 24, paddingRight: 24, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>

            {/* Red glow bg */}
            <div className="absolute pointer-events-none" style={{ top: -40, left: "50%", transform: "translateX(-50%)", width: 300, height: 300, background: "radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)" }} />

            <div style={{ flex: "0 0 12vh" }} />
            <div className="flex items-center justify-between mb-6 relative">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center relative"
                  style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#ef4444", fontVariationSettings: "'FILL' 1" }}>sensors</span>
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ background: "#ef4444", animation: "onAirPulse 1s infinite" }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Go Live</p>
                  <p className="text-xs" style={{ color: "#555" }}>Broadcast to your followers now</p>
                </div>
              </div>
              <button onClick={() => { setShowGoLive(false); setPrivacy("public"); }}
                className="w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer"
                style={{ background: "rgba(255,255,255,0.07)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#888" }}>close</span>
              </button>
            </div>

            {/* Live warning badge */}
            <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-xl"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
              <div className="relative w-2 h-2 shrink-0">
                <div className="absolute inset-0 rounded-full" style={{ background: "#ef4444", animation: "onAirPulse 1s infinite" }} />
                <div className="absolute rounded-full" style={{ inset: -3, border: "1.5px solid rgba(239,68,68,0.5)", animation: "onAirRing 1.2s ease-out infinite" }} />
              </div>
              <span className="text-xs font-bold" style={{ color: "#ef4444" }}>YOUR STREAM GOES LIVE INSTANTLY</span>
            </div>

            <input type="text" placeholder="Stream title (optional)"
              value={streamTitle} onChange={(e) => setStreamTitle(e.target.value)} maxLength={80}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-3"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }}
              onKeyDown={(e) => { if (e.key === "Enter") startStream(); }} />

            <div className="flex gap-2 mb-5">
              <button onClick={() => setPrivacy("public")}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
                style={{
                  background: privacy === "public" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
                  color: privacy === "public" ? "#ef4444" : "#555",
                  border: `1px solid ${privacy === "public" ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.08)"}`,
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>public</span>
                Public
              </button>
              <button onClick={() => setPrivacy("followers")}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
                style={{
                  background: privacy === "followers" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
                  color: privacy === "followers" ? "#ef4444" : "#555",
                  border: `1px solid ${privacy === "followers" ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.08)"}`,
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>lock</span>
                Followers Only
              </button>
            </div>

            <button onClick={startStream} disabled={starting}
              className="w-full py-3.5 rounded-xl font-bold text-sm border-none cursor-pointer flex items-center justify-center gap-2"
              style={{ background: starting ? "rgba(239,68,68,0.4)" : "#ef4444", color: "#fff", fontSize: 15, boxShadow: starting ? "none" : "0 0 24px rgba(239,68,68,0.4)" }}>
              {starting
                ? <><div className="spinner" style={{ width: 16, height: 16 }} /> Starting…</>
                : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>sensors</span> Start Broadcast</>}
            </button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 pb-10">

        {/* ════════════════════════════════
            CINEMATIC HERO BANNER
        ════════════════════════════════ */}
        <div className="relative w-full rounded-3xl overflow-hidden mb-6"
          style={{ background: "linear-gradient(135deg,#120005 0%,#1a0008 50%,#120005 100%)", border: "1px solid rgba(239,68,68,0.22)", minHeight: 240 }}>

          {/* Scan line */}
          <div className="absolute left-0 w-full pointer-events-none" style={{
            height: 2, background: "linear-gradient(90deg,transparent,rgba(239,68,68,0.4),transparent)",
            animation: "scanLine 5s linear infinite", zIndex: 1,
          }} />

          {/* Radial spotlight glow */}
          <div className="absolute pointer-events-none" style={{
            top: "-20%", left: "50%", transform: "translateX(-50%)",
            width: 480, height: 480,
            background: "radial-gradient(ellipse at center, rgba(239,68,68,0.32) 0%, rgba(180,0,40,0.1) 40%, transparent 68%)",
            animation: "heroGlow 3.5s ease-in-out infinite",
          }} />

          {/* Ghost logo watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <img src="/static/logo-nav.svg" alt=""
              style={{ width: 220, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(300deg)", animation: "floatLogo 8s ease-in-out infinite" }} />
          </div>

          {/* TV flicker overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{ animation: "tvFlicker 8s infinite", background: "transparent" }} />

          {/* Content */}
          <div className="relative z-10 p-6 flex flex-col justify-between" style={{ minHeight: 240 }}>
            <div className="flex items-start justify-between">
              <div style={{ animation: "slideUp .7s ease both" }}>
                {/* Studio label */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(239,68,68,0.25)", border: "1px solid rgba(239,68,68,0.4)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#ef4444", fontVariationSettings: "'FILL' 1" }}>sensors</span>
                  </div>
                  <span className="text-xs font-black tracking-widest" style={{ color: "#ef4444", letterSpacing: "0.2em" }}>LIVE STUDIO</span>
                </div>

                {/* Main title */}
                <h1 className="font-black mb-1" style={{
                  fontSize: "clamp(2rem,8vw,2.8rem)", letterSpacing: -1.5, lineHeight: 1,
                  background: "linear-gradient(135deg,#fff 0%,#fca5a5 55%,#ef4444 100%)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}>
                  {streams.length > 0 ? "On Air" : "Live Studio"}
                </h1>
                <p className="text-sm mt-1.5" style={{ color: "#666" }}>
                  {streams.length > 0
                    ? `${streams.length} stream${streams.length > 1 ? "s" : ""} broadcasting right now`
                    : "Where fitness creators go live"}
                </p>
              </div>

              {/* Right — On Air badge + waveform */}
              <div className="flex flex-col items-end gap-3">
                {streams.length > 0 ? (
                  <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-full"
                    style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)" }}>
                    <div className="relative w-2 h-2">
                      <div className="absolute inset-0 rounded-full" style={{ background: "#ef4444", animation: "onAirPulse 1.2s ease-in-out infinite" }} />
                      <div className="absolute rounded-full" style={{ inset: -3, border: "1.5px solid rgba(239,68,68,0.5)", animation: "onAirRing 1.2s ease-out infinite" }} />
                    </div>
                    <span className="text-xs font-black" style={{ color: "#ef4444" }}>ON AIR</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                    style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#ef4444" }}>live_tv</span>
                    <span className="text-xs font-bold" style={{ color: "#ef4444" }}>STUDIO</span>
                  </div>
                )}
                <WaveformBars playing={streams.length > 0} count={9} color={streams.length > 0 ? "rgba(239,68,68,0.7)" : "rgba(239,68,68,0.25)"} height={40} />
              </div>
            </div>

            {/* Stats row */}
            {!streamsLoading && (
              <div className="flex items-center gap-5 mt-4 mb-4">
                <div>
                  <span className="text-lg font-black" style={{ color: "#ef4444" }}>{streams.length}</span>
                  <span className="text-xs ml-1.5 font-medium" style={{ color: "#555" }}>live now</span>
                </div>
                <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.07)" }} />
                <div>
                  <span className="text-lg font-black" style={{ color: "#ef4444" }}>{totalViewers}</span>
                  <span className="text-xs ml-1.5 font-medium" style={{ color: "#555" }}>watching</span>
                </div>
                {!isOwner && followers !== null && (
                  <>
                    <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.07)" }} />
                    <div>
                      <span className="text-lg font-black" style={{ color: canGoLive ? "#ef4444" : "#555" }}>{followers}</span>
                      <span className="text-xs ml-1.5 font-medium" style={{ color: "#555" }}>/ 1K to go live</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Go Live button */}
            {canGoLive && (
              <div className="flex items-center gap-2">
                <button onClick={() => setShowGoLive(true)}
                  className="flex items-center gap-2 px-5 py-2 rounded-full font-bold text-sm border-none cursor-pointer"
                  style={{ background: "#ef4444", color: "#fff", boxShadow: "0 0 24px rgba(239,68,68,0.45)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>sensors</span>
                  Go Live
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ════════════════════════════════
            STREAM CARDS
        ════════════════════════════════ */}
        {streamsLoading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>

        ) : streams.length === 0 ? (
          /* Empty state */
          <div className="text-center py-16 rounded-3xl relative overflow-hidden"
            style={{ background: "linear-gradient(135deg,#120005,#1a0008)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <img src="/static/logo-nav.svg" alt="" style={{ width: 180, opacity: 0.04, filter: "grayscale(1) brightness(3)" }} />
            </div>
            <div className="relative z-10">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#ef4444", fontVariationSettings: "'FILL' 1" }}>live_tv</span>
              </div>
              <p className="text-lg font-bold mb-1" style={{ color: "#f2f2f2" }}>The studio is dark</p>
              <p className="text-sm mb-6" style={{ color: "#555" }}>No one is live right now. Streams appear here in real time.</p>
              {canGoLive && (
                <button onClick={() => setShowGoLive(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm border-none cursor-pointer"
                  style={{ background: "#ef4444", color: "#fff", boxShadow: "0 0 24px rgba(239,68,68,0.4)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sensors</span>
                  Be the first — Go Live
                </button>
              )}
            </div>
          </div>

        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <div className="relative w-2 h-2">
                <div className="absolute inset-0 rounded-full" style={{ background: "#ef4444", animation: "onAirPulse 1s infinite" }} />
                <div className="absolute rounded-full" style={{ inset: -3, border: "1.5px solid rgba(239,68,68,0.5)", animation: "onAirRing 1.2s ease-out infinite" }} />
              </div>
              <span className="text-sm font-black tracking-wide" style={{ color: "#f2f2f2" }}>LIVE NOW</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
                {streams.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {streams.map((s) => {
                const init = (s.hostName || "U").charAt(0).toUpperCase();
                const isMe = user?.uid === s.hostId;
                const isPrivate = s.privacy === "followers";
                const isHovered = hoveredStream === s.id;

                return (
                  <Link key={s.id} href={`/live/${s.id}`}
                    className="stream-card rounded-2xl overflow-hidden block"
                    style={{ background: "linear-gradient(135deg,#120005,#0d0003)", border: `1px solid ${isMe ? "rgba(239,68,68,0.45)" : "rgba(239,68,68,0.15)"}`, boxShadow: isMe ? "0 0 28px rgba(239,68,68,0.18)" : "none" }}
                    onMouseEnter={() => setHoveredStream(s.id)}
                    onMouseLeave={() => setHoveredStream(null)}>

                    {/* 16:9 thumbnail */}
                    <div className="relative overflow-hidden" style={{ aspectRatio: "16/9", background: "#0a0003" }}>
                      {/* Ghost logo watermark behind video */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <img src="/static/logo-nav.svg" alt="" style={{ width: "55%", opacity: 0.05, filter: "grayscale(1) brightness(3)" }} />
                      </div>
                      {/* Red glow */}
                      <div className="absolute pointer-events-none" style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "120%", height: "120%", background: "radial-gradient(ellipse at center, rgba(239,68,68,0.12) 0%, transparent 65%)" }} />
                      {/* TV icon */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="material-symbols-outlined" style={{ fontSize: 52, color: "rgba(239,68,68,0.12)", fontVariationSettings: "'FILL' 1" }}>live_tv</span>
                      </div>

                      {/* LIVE badge */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                        style={{ background: "#ef4444", boxShadow: "0 0 12px rgba(239,68,68,0.5)" }}>
                        <div className="w-1.5 h-1.5 rounded-full bg-white" style={{ animation: "onAirPulse 1s infinite" }} />
                        <span className="text-xs font-black text-white tracking-wide">{isMe ? "YOU" : "LIVE"}</span>
                      </div>

                      {/* Viewer / privacy badge */}
                      <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full"
                        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
                        {isPrivate ? (
                          <>
                            <span className="material-symbols-outlined" style={{ fontSize: 11, color: "#fff" }}>lock</span>
                            <span className="text-xs text-white font-semibold">Followers</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined" style={{ fontSize: 11, color: "#fff" }}>visibility</span>
                            <span className="text-xs text-white font-semibold">{s.viewerCount ?? 0}</span>
                          </>
                        )}
                      </div>

                      {/* Hover waveform overlay */}
                      {isHovered && (
                        <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                          <WaveformBars playing count={12} color="rgba(239,68,68,0.8)" height={28} />
                        </div>
                      )}

                      {/* Join CTA on hover */}
                      <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-200"
                        style={{ opacity: isHovered ? 1 : 0 }}>
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm"
                          style={{ background: "#ef4444", color: "#fff", boxShadow: "0 0 20px rgba(239,68,68,0.5)" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                          Join Stream
                        </div>
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="p-3.5">
                      <div className="flex items-center gap-2.5 mb-1">
                        {s.hostPhoto ? (
                          <img src={s.hostPhoto} alt="" className="rounded-full object-cover shrink-0" style={{ width: 30, height: 30, border: "1.5px solid rgba(239,68,68,0.3)" }} />
                        ) : (
                          <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ width: 30, height: 30, background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>{init}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: "#f2f2f2" }}>{isMe ? "You (Live)" : (s.hostName || "User")}</p>
                          {s.title && <p className="text-xs truncate mt-0.5" style={{ color: "#666" }}>{s.title}</p>}
                        </div>
                        <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20, color: "#ef4444", fontVariationSettings: "'FILL' 1" }}>sensors</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
