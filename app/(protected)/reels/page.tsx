"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, orderBy, limit, getDocs, doc, getDoc, updateDoc, setDoc, increment, arrayUnion, arrayRemove, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Reel {
  id: string; authorId: string; authorName?: string; authorPhoto?: string;
  mediaUrl?: string; caption?: string; likes?: number; likedBy?: string[];
  comments?: number; repostCount?: number;
}

export default function ReelsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set());
  const [bufferingIds, setBufferingIds] = useState<Set<string>>(new Set());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [repostedIds, setRepostedIds] = useState<Set<string>>(new Set());
  const [repostingId, setRepostingId] = useState<string | null>(null);
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [sendingComment, setSendingComment] = useState<string | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const currentRef = useRef(0);

  useEffect(() => {
    getDocs(query(collection(db, "reels"), orderBy("createdAt", "desc"), limit(20))).then(async (snap) => {
      const raw: Reel[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reel, "id">) })).filter((r) => r.mediaUrl);
      const enriched = await Promise.all(raw.map(async (r) => {
        try {
          const pub = await getDoc(doc(db, "users", r.authorId, "public", "profile"));
          if (pub.exists()) { const d = pub.data(); return { ...r, authorName: d.displayName || "User", authorPhoto: d.photoURL || "" }; }
          const root = await getDoc(doc(db, "users", r.authorId));
          if (root.exists()) { const d = root.data(); return { ...r, authorName: d.displayName || "User", authorPhoto: d.photoURL || "" }; }
        } catch {}
        return r;
      }));
      setReels(enriched);
      // Seed like state
      if (user) {
        const liked = new Set<string>();
        enriched.forEach((r) => { if (r.likedBy?.includes(user.uid)) liked.add(r.id); });
        setLikedIds(liked);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  // Intersection observer — autoplay current reel
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const v = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) {
          const idx = videoRefs.current.indexOf(v);
          currentRef.current = idx;
          const tryPlay = () => v.play().catch(() => {});
          if (v.readyState >= 2) { tryPlay(); }
          else { v.load(); v.addEventListener("loadeddata", tryPlay, { once: true }); }
          // View tracking
          const reel = reels[idx];
          if (reel && user && reel.authorId !== user.uid) {
            const key = `viewed_${reel.id}`;
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, "1");
              const month = new Date().toISOString().slice(0, 7);
              Promise.all([
                updateDoc(doc(db, "reels", reel.id), { viewCount: increment(1) }),
                updateDoc(doc(db, "users", reel.authorId), { totalViews: increment(1) }),
                setDoc(doc(db, "users", reel.authorId, "monthlyViews", month), { views: increment(1) }, { merge: true }),
              ]).catch(() => {});
            }
          }
        } else {
          v.pause(); v.currentTime = 0;
        }
      });
    }, { threshold: 0.6 });
    videoRefs.current.forEach((v) => { if (v) obs.observe(v); });
    return () => obs.disconnect();
  }, [reels, user]);

  async function handleLike(reel: Reel) {
    if (!user) return;
    const liked = likedIds.has(reel.id);
    setLikedIds((prev) => { const n = new Set(prev); liked ? n.delete(reel.id) : n.add(reel.id); return n; });
    setReels((prev) => prev.map((r) => r.id !== reel.id ? r : { ...r, likes: Math.max(0, (r.likes ?? 0) + (liked ? -1 : 1)) }));
    await updateDoc(doc(db, "reels", reel.id), {
      likes: increment(liked ? -1 : 1),
      likedBy: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
    }).catch(() => {});
  }

  async function handleBookmark(reel: Reel) {
    if (!user) return;
    const bm = bookmarkedIds.has(reel.id);
    setBookmarkedIds((prev) => { const n = new Set(prev); bm ? n.delete(reel.id) : n.add(reel.id); return n; });
    const ref = doc(db, "users", user.uid, "bookmarks", reel.id);
    if (bm) { await ref && import("firebase/firestore").then(({ deleteDoc }) => deleteDoc(ref)).catch(() => {}); }
    else { await setDoc(ref, { reelId: reel.id, savedAt: serverTimestamp() }).catch(() => {}); }
  }

  async function handleRepost(reel: Reel) {
    if (!user || repostingId || repostedIds.has(reel.id)) return;
    setRepostingId(reel.id);
    try {
      await addDoc(collection(db, "reels"), {
        authorId: user.uid,
        authorName: user.displayName || "User",
        authorPhoto: user.photoURL || null,
        isRepost: true,
        repostOf: reel.id,
        repostOriginalAuthorId: reel.authorId,
        repostOriginalAuthorName: reel.authorName || "User",
        mediaUrl: reel.mediaUrl || null,
        caption: reel.caption || null,
        createdAt: serverTimestamp(),
        likes: 0, comments: 0,
      });
      await updateDoc(doc(db, "reels", reel.id), { repostCount: increment(1) }).catch(() => {});
      setRepostedIds((prev) => new Set([...prev, reel.id]));
      setReels((prev) => prev.map((r) => r.id !== reel.id ? r : { ...r, repostCount: (r.repostCount ?? 0) + 1 }));
      if (reel.authorId !== user.uid) {
        fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientUid: reel.authorId, type: "repost", senderName: user.displayName || "Someone", postId: reel.id }) }).catch(() => {});
      }
    } catch {}
    setRepostingId(null);
  }

  async function sendComment(reel: Reel) {
    const text = (commentTexts[reel.id] || "").trim();
    if (!text || !user || sendingComment) return;
    setSendingComment(reel.id);
    try {
      await addDoc(collection(db, "reels", reel.id, "comments"), {
        authorId: user.uid, authorName: user.displayName || "User",
        authorPhoto: user.photoURL || null, text, createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "reels", reel.id), { comments: increment(1) }).catch(() => {});
      setCommentTexts((p) => ({ ...p, [reel.id]: "" }));
      setReels((prev) => prev.map((r) => r.id !== reel.id ? r : { ...r, comments: (r.comments ?? 0) + 1 }));
    } catch {}
    setSendingComment(null);
  }

  if (loading) return <div className="flex justify-center py-20"><div className="spinner" /></div>;

  if (reels.length === 0) return (
    <div className="ghost-bg text-center py-24 rounded-3xl mx-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(255,255,255,0.04)" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#333" }}>play_circle</span>
      </div>
      <p className="font-semibold mb-1" style={{ color: "#f2f2f2" }}>No reels yet</p>
      <p className="text-sm" style={{ color: "#555" }}>Be the first to post a reel!</p>
    </div>
  );

  return (
    <div style={{ height: "calc(100dvh - env(safe-area-inset-top, 0px) - 64px)", overflow: "hidden", width: "100%" }}>
      <div className="snap-y snap-mandatory overflow-y-scroll h-full" style={{ scrollbarWidth: "none" }}>
        {reels.map((reel, i) => {
          const init = (reel.authorName || "U").charAt(0).toUpperCase();
          const liked = likedIds.has(reel.id);
          const bookmarked = bookmarkedIds.has(reel.id);

          return (
            <div key={reel.id} className="snap-start relative flex-shrink-0" style={{ height: "100%", background: "#000" }}>

              {errorIds.has(reel.id) ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                  <span className="material-symbols-outlined" style={{ fontSize: 40, color: "#333" }}>broken_image</span>
                  <p className="text-sm" style={{ color: "#555" }}>Video unavailable</p>
                </div>
              ) : (
                <>
                  <video
                    ref={(el) => { videoRefs.current[i] = el; if (el) { el.muted = true; el.setAttribute("muted", ""); } }}
                    src={reel.mediaUrl}
                    loop playsInline muted preload="none"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    onError={() => setErrorIds((prev) => new Set([...prev, reel.id]))}
                    onWaiting={() => setBufferingIds((prev) => new Set([...prev, reel.id]))}
                    onPlaying={() => setBufferingIds((prev) => { const n = new Set(prev); n.delete(reel.id); return n; })}
                    onCanPlay={() => setBufferingIds((prev) => { const n = new Set(prev); n.delete(reel.id); return n; })}
                  />
                  {bufferingIds.has(reel.id) && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 1 }}>
                      <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
                    </div>
                  )}
                </>
              )}

              {/* Back button — top left */}
              <button onClick={() => router.back()}
                className="absolute flex items-center justify-center border-none cursor-pointer"
                style={{ top: "calc(env(safe-area-inset-top, 16px) + 8px)", left: 16, width: 40, height: 40, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", borderRadius: "50%", zIndex: 2 }}>
                <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>arrow_back</span>
              </button>

              {/* Right side action buttons */}
              <div className="absolute right-4 flex flex-col items-center gap-6" style={{ bottom: "calc(env(safe-area-inset-bottom, 24px) + 80px)", zIndex: 2 }}>
                {/* Like */}
                <button onClick={() => handleLike(reel)} className="flex flex-col items-center gap-1 border-none bg-transparent cursor-pointer">
                  <span className="material-symbols-outlined" style={{ fontSize: 30, color: liked ? "#ef4444" : "#fff", fontVariationSettings: liked ? "'FILL' 1" : "'FILL' 0", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }}>favorite</span>
                  <span className="text-xs font-bold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{(reel.likes ?? 0) > 0 ? (reel.likes ?? 0).toLocaleString() : ""}</span>
                </button>
                {/* Comment */}
                <button className="flex flex-col items-center gap-1 border-none bg-transparent cursor-pointer"
                  onClick={() => document.getElementById(`reel-comment-${reel.id}`)?.focus()}>
                  <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#fff", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }}>chat_bubble</span>
                  <span className="text-xs font-bold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{(reel.comments ?? 0) > 0 ? (reel.comments ?? 0).toLocaleString() : ""}</span>
                </button>
                {/* Repost */}
                <button onClick={() => handleRepost(reel)} disabled={!!repostingId || repostedIds.has(reel.id)}
                  className="flex flex-col items-center gap-1 border-none bg-transparent cursor-pointer">
                  <span className="material-symbols-outlined" style={{ fontSize: 30, color: repostedIds.has(reel.id) ? "#4ade80" : "#fff", fontVariationSettings: repostedIds.has(reel.id) ? "'FILL' 1" : "'FILL' 0", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }}>repeat</span>
                  {(reel.repostCount ?? 0) > 0 && <span className="text-xs font-bold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{(reel.repostCount ?? 0).toLocaleString()}</span>}
                </button>
                {/* Share */}
                <button onClick={() => { if (navigator.share) navigator.share({ url: `${window.location.origin}/reels` }).catch(() => {}); }}
                  className="flex flex-col items-center gap-1 border-none bg-transparent cursor-pointer">
                  <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#fff", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }}>ios_share</span>
                </button>
                {/* Bookmark */}
                <button onClick={() => handleBookmark(reel)} className="flex flex-col items-center gap-1 border-none bg-transparent cursor-pointer">
                  <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#fff", fontVariationSettings: bookmarked ? "'FILL' 1" : "'FILL' 0", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }}>bookmark</span>
                </button>
                {/* Author avatar */}
                <Link href={`/user-profile?uid=${reel.authorId}`}>
                  {reel.authorPhoto
                    ? <img src={reel.authorPhoto} alt="" className="rounded-full object-cover" style={{ width: 36, height: 36, border: "2px solid #fff" }} />
                    : <div className="rounded-full flex items-center justify-center text-xs font-bold" style={{ width: 36, height: 36, background: "#333", color: "#fff", border: "2px solid #fff" }}>{init}</div>}
                </Link>
              </div>

              {/* Bottom gradient */}
              <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: "55%", background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)", zIndex: 1 }} />

              {/* Bottom left — author + caption */}
              <div className="absolute left-4 flex items-end gap-3" style={{ bottom: "calc(env(safe-area-inset-bottom, 24px) + 72px)", right: 72, zIndex: 2 }}>
                <div className="flex-1">
                  <Link href={`/user-profile?uid=${reel.authorId}`}>
                    <p className="text-sm font-bold text-white mb-1" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>{reel.authorName || "User"}</p>
                  </Link>
                  {reel.caption && <p className="text-sm text-white leading-snug" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>{reel.caption.length > 80 ? reel.caption.slice(0, 80) + "…" : reel.caption}</p>}
                </div>
              </div>

              {/* Comment input bar — pinned to bottom */}
              <div className="absolute left-0 right-0 flex items-center gap-2 px-4 py-2"
                style={{ bottom: 0, paddingBottom: "calc(env(safe-area-inset-bottom, 8px) + 8px)", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)", zIndex: 2 }}>
                <input
                  id={`reel-comment-${reel.id}`}
                  value={commentTexts[reel.id] || ""}
                  onChange={(e) => setCommentTexts((p) => ({ ...p, [reel.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && sendComment(reel)}
                  placeholder="Add a comment…"
                  className="flex-1 px-4 py-2.5 rounded-full outline-none text-sm"
                  style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
                />
                {(commentTexts[reel.id] || "").trim() && (
                  <button onClick={() => sendComment(reel)} disabled={sendingComment === reel.id}
                    className="font-bold text-sm border-none bg-transparent cursor-pointer text-white">
                    Post
                  </button>
                )}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
