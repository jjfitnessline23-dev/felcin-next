"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PostCard from "@/components/PostCard";
import PageHeader from "@/components/PageHeader";

interface Post { id: string; authorId: string; authorName?: string; authorPhoto?: string; caption?: string; text?: string; mediaUrl?: string; contentType?: string; mimeType?: string; likes?: number; comments?: number; likedBy?: string[]; createdAt?: { seconds: number } | null; }

export default function BookmarksPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "users", user.uid, "bookmarks"), orderBy("savedAt", "desc"));
    return onSnapshot(q, async (snap) => {
      const fetched = await Promise.all(snap.docs.map(async (d) => {
        try {
          const s = await getDoc(doc(db, "posts", d.id));
          return s.exists() ? { id: s.id, ...(s.data() as Omit<Post, "id">) } : null;
        } catch { return null; }
      }));
      setPosts(fetched.filter(Boolean) as Post[]);
      setLoading(false);
    }, () => setLoading(false));
  }, [user]);

  return (
    <div className="max-w-xl mx-auto pb-10 overflow-x-hidden">
      <PageHeader title="Bookmarks" />

      {/* ── Cinematic Hero ── */}
      <div className="relative mx-4 mt-2 mb-5 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#1a1200 0%,#241900 50%,#1a1200 100%)", border: "1px solid rgba(245,158,11,0.22)", minHeight: 150 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(245,158,11,0.4),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(245,158,11,0.18) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 130, opacity: 0.05, filter: "grayscale(1) brightness(3)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#f59e0b", fontVariationSettings: "'FILL' 1" }}>bookmark</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#f59e0b", letterSpacing: "0.18em" }}>SAVED POSTS</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.5rem,5vw,2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#fcd34d 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Bookmarks</h1>
          <p className="text-sm mb-3" style={{ color: "#555" }}>Posts you've saved for later</p>
          {!loading && (
            <div className="flex items-center gap-2">
              <span className="text-base font-black" style={{ color: "#f59e0b" }}>{posts.length}</span>
              <span className="text-xs" style={{ color: "#555" }}>saved {posts.length === 1 ? "post" : "posts"}</span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4">
        {loading ? (
          <div className="ghost-bg flex justify-center py-24 rounded-3xl"><div className="spinner" /></div>
        ) : posts.length === 0 ? (
          <div className="ghost-bg text-center py-20 rounded-3xl">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#f59e0b", fontVariationSettings: "'FILL' 1" }}>bookmark</span>
            </div>
            <p className="font-bold mb-2" style={{ color: "#f2f2f2" }}>Nothing saved yet</p>
            <p className="text-sm mb-5" style={{ color: "#555" }}>Tap the bookmark icon on any post to save it here.</p>
            <a href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm border-none cursor-pointer"
              style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)", color: "#000", boxShadow: "0 0 20px rgba(245,158,11,0.35)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>home</span>
              Browse Feed
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Section label */}
            <div className="flex items-center gap-3">
              <div style={{ flex: 1, height: 1, background: "rgba(245,158,11,0.15)" }} />
              <span className="text-xs font-black tracking-widest" style={{ color: "#444" }}>SAVED · {posts.length}</span>
              <div style={{ flex: 1, height: 1, background: "rgba(245,158,11,0.15)" }} />
            </div>
            {posts.map((p) => <PostCard key={p.id} post={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
