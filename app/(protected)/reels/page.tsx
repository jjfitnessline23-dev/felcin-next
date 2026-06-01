"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, orderBy, limit, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

interface Reel { id: string; authorId: string; authorName?: string; authorPhoto?: string; mediaUrl?: string; caption?: string; likes?: number; }

export default function ReelsPage() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const currentRef = useRef(0);

  useEffect(() => {
    getDocs(query(collection(db, "reels"), orderBy("createdAt", "desc"), limit(20))).then(async (snap) => {
      const raw: Reel[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reel, "id">) })).filter((r) => r.mediaUrl);
      const enriched = await Promise.all(raw.map(async (r) => {
        try {
          const pub = await getDoc(doc(db, "users", r.authorId, "public", "profile"));
          if (pub.exists()) { const d = pub.data(); return { ...r, authorName: d.displayName || d.username || "User", authorPhoto: d.photoURL || "" }; }
          const root = await getDoc(doc(db, "users", r.authorId));
          if (root.exists()) { const d = root.data(); return { ...r, authorName: d.displayName || d.username || "User", authorPhoto: d.photoURL || "" }; }
        } catch {}
        return r;
      }));
      setReels(enriched);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const v = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) {
          currentRef.current = videoRefs.current.indexOf(v);
          setPaused(false);
          const tryPlay = () => v.play().catch(() => {});
          if (v.readyState >= 3) tryPlay();
          else v.addEventListener("canplay", tryPlay, { once: true });
        } else {
          v.pause();
          v.currentTime = 0;
        }
      });
    }, { threshold: 0.6 });

    videoRefs.current.forEach((v) => { if (v) obs.observe(v); });
    return () => obs.disconnect();
  }, [reels]);

  const togglePlay = (i: number) => {
    const v = videoRefs.current[i];
    if (!v) return;
    if (v.paused) { v.play(); setPaused(false); }
    else { v.pause(); setPaused(true); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="spinner" /></div>;

  if (reels.length === 0) return (
    <div className="text-center py-24">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(255,255,255,0.04)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#333" }}>play_circle</span>
      </div>
      <p className="font-semibold mb-1" style={{ color: "#f2f2f2" }}>No reels yet</p>
      <p className="text-sm" style={{ color: "#555" }}>Be the first to post a reel!</p>
    </div>
  );

  return (
    <div className="max-w-sm mx-auto" style={{ height: "calc(100dvh - 60px)", overflow: "hidden", width: "100%" }}>
      <div className="snap-y snap-mandatory overflow-y-scroll h-full" style={{ scrollbarWidth: "none" }}>
        {reels.map((reel, i) => {
          const init = (reel.authorName || "U").charAt(0).toUpperCase();
          return (
            <div key={reel.id} className="snap-start relative flex-shrink-0" style={{ height: "100%", background: "#000" }}>
              {errorIds.has(reel.id) ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                  <span className="material-symbols-outlined" style={{ fontSize: 40, color: "#333" }}>broken_image</span>
                  <p className="text-sm" style={{ color: "#555" }}>Video unavailable</p>
                </div>
              ) : (
              <video
                ref={(el) => { videoRefs.current[i] = el; if (el) { el.muted = true; el.setAttribute("muted", ""); } }}
                src={reel.mediaUrl}
                loop playsInline muted preload="metadata"
                className="w-full h-full object-cover"
                onClick={() => togglePlay(i)}
                onError={() => setErrorIds((prev) => new Set([...prev, reel.id]))}
              />
              )}

              {/* Pause indicator */}
              {paused && currentRef.current === i && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
                    <span className="material-symbols-outlined text-white" style={{ fontSize: 32, fontVariationSettings: "'FILL' 1" }}>pause</span>
                  </div>
                </div>
              )}

              {/* Gradient overlay */}
              <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: "55%", background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)" }} />

              {/* Author + caption */}
              <div className="absolute bottom-20 left-4 right-20 pointer-events-none">
                <div className="flex items-center gap-2.5 mb-2">
                  {reel.authorPhoto ? (
                    <img src={reel.authorPhoto} alt="" className="rounded-full object-cover border-2" style={{ width: 38, height: 38, borderColor: "rgba(255,255,255,0.3)" }} />
                  ) : (
                    <div className="rounded-full flex items-center justify-center font-bold text-sm border-2" style={{ width: 38, height: 38, background: "#222", color: "#aaa", borderColor: "rgba(255,255,255,0.3)" }}>
                      {init}
                    </div>
                  )}
                  <span className="font-semibold text-sm text-white pointer-events-auto">
                    <Link href={`/user-profile?uid=${reel.authorId}`}>{reel.authorName || "User"}</Link>
                  </span>
                </div>
                {reel.caption && <p className="text-sm text-white leading-relaxed opacity-90">{reel.caption}</p>}
              </div>

              {/* Right actions */}
              {!errorIds.has(reel.id) && (
              <div className="absolute right-4 bottom-24 flex flex-col items-center gap-5">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}>
                    <span className="material-symbols-outlined text-white" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>favorite</span>
                  </div>
                  <span className="text-xs font-semibold text-white">{reel.likes || 0}</span>
                </div>
                <Link href={`/comments?postId=${reel.id}&type=reel`}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}>
                    <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>chat_bubble</span>
                  </div>
                </Link>
              </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
