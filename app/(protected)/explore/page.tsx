"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { collection, query, orderBy, limit, getDocs, getDoc, doc, startAfter, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Post {
  id: string;
  authorId: string;
  authorName?: string;
  authorPhoto?: string;
  mediaUrl?: string;
  contentType?: string;
  mimeType?: string;
  thumbnailUrl?: string;
  likes?: number;
}

interface Creator {
  uid: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  followersCount?: number;
  postCount?: number;
}

interface GhostWorkout {
  id: string;
  title: string;
  description?: string;
  hostName: string;
  hostPhoto?: string;
  sessionCount?: number;
  exercises?: unknown[];
}

function resolveMediaType(contentType?: string, mimeType?: string, url?: string) {
  const t = contentType || mimeType || "";
  if (t === "video" || t.startsWith("video/")) return "video";
  if (/\.(mp4|webm|mov|avi|3gp)(\?|$)/i.test(url || "")) return "video";
  return "image";
}

function CreatorSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 shrink-0" style={{ width: 80 }}>
      <div className="skeleton rounded-full" style={{ width: 64, height: 64 }} />
      <div className="skeleton rounded-full" style={{ width: 56, height: 10 }} />
    </div>
  );
}

function GridSkeleton() {
  return (
    <>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ aspectRatio: "1" }} />
      ))}
    </>
  );
}

const PAGE_SIZE = 12;

export default function ExplorePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [ghosts, setGhosts] = useState<GhostWorkout[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [creatorsLoading, setCreatorsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (after: QueryDocumentSnapshot | null) => {
    const q = after
      ? query(collection(db, "posts"), orderBy("createdAt", "desc"), startAfter(after), limit(PAGE_SIZE))
      : query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
    const snap = await getDocs(q);
    const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) })).filter((p) => p.mediaUrl);
    setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    setHasMore(snap.docs.length === PAGE_SIZE);
    const authorIds = [...new Set(raw.map((p) => p.authorId).filter(Boolean))];
    const profileMap = new Map<string, { name: string; photo: string }>();
    await Promise.all(
      authorIds.slice(0, 12).map(async (uid) => {
        try {
          const s = await getDoc(doc(db, "users", uid, "public", "profile"));
          if (s.exists()) { const d = s.data(); profileMap.set(uid, { name: d.displayName || "User", photo: d.photoURL || "" }); }
        } catch {}
      })
    );
    return { raw, profileMap, authorIds };
  }, []);

  // Initial load
  useEffect(() => {
    fetchPage(null).then(({ raw, profileMap, authorIds }) => {
      setPosts(raw.map((p) => ({ ...p, authorName: profileMap.get(p.authorId)?.name || p.authorName || "User", authorPhoto: profileMap.get(p.authorId)?.photo || p.authorPhoto || "" })));
      const creatorList: Creator[] = authorIds.slice(0, 12).map((uid) => ({ uid, displayName: profileMap.get(uid)?.name || "User", photoURL: profileMap.get(uid)?.photo }));
      setCreators(creatorList.filter((c) => c.displayName !== "User" || c.photoURL));
      setCreatorsLoading(false);
      setLoading(false);
    }).catch(() => { setLoading(false); setCreatorsLoading(false); });
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !lastDoc) return;
    setLoadingMore(true);
    try {
      const { raw, profileMap } = await fetchPage(lastDoc);
      const enriched = raw.map((p) => ({ ...p, authorName: profileMap.get(p.authorId)?.name || p.authorName || "User", authorPhoto: profileMap.get(p.authorId)?.photo || p.authorPhoto || "" }));
      setPosts((prev) => { const ids = new Set(prev.map((p) => p.id)); return [...prev, ...enriched.filter((p) => !ids.has(p.id))]; });
    } catch {}
    setLoadingMore(false);
  }, [loadingMore, hasMore, lastDoc, fetchPage]);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore(); }, { rootMargin: "400px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  // Fetch ghost workouts
  useEffect(() => {
    getDocs(query(collection(db, "ghostWorkouts"), orderBy("createdAt", "desc"), limit(6)))
      .then((snap) => setGhosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GhostWorkout, "id">) }))))
      .catch(() => {});
  }, []);

  const filtered = posts.filter((p) => {
    if (filter === "image") return resolveMediaType(p.contentType, p.mimeType, p.mediaUrl) === "image";
    if (filter === "video") return resolveMediaType(p.contentType, p.mimeType, p.mediaUrl) === "video";
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto pb-10">

      {/* Sticky header */}
      <div className="sticky z-10 px-4 pt-4 pb-3"
        style={{ top: "env(safe-area-inset-top,0px)", background: "rgba(9,9,9,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <h1 className="text-lg font-bold mb-3" style={{ color: "#f2f2f2" }}>Explore</h1>
        <div className="flex gap-2">
          {[["all", "All"], ["image", "Photos"], ["video", "Videos"]].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`btn-pill${filter === val ? " is-active" : ""}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Featured Creators ── */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Featured Creators</p>
          <Link href="/search" className="text-xs font-semibold" style={{ color: "#555" }}>See all</Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {creatorsLoading
            ? Array.from({ length: 6 }).map((_, i) => <CreatorSkeleton key={i} />)
            : creators.length === 0
            ? <p className="text-sm py-2" style={{ color: "#444" }}>No creators yet — be the first to post!</p>
            : creators.map((c) => (
                <Link key={c.uid} href={`/user-profile?uid=${c.uid}`}
                  className="flex flex-col items-center gap-2 shrink-0 no-underline" style={{ width: 76 }}>
                  {c.photoURL
                    ? <img src={c.photoURL} alt="" className="rounded-full object-cover"
                        style={{ width: 64, height: 64, border: "2px solid rgba(255,255,255,0.1)" }} />
                    : <div className="rounded-full flex items-center justify-center text-lg font-bold"
                        style={{ width: 64, height: 64, background: "#1a1a1a", color: "#555", border: "2px solid rgba(255,255,255,0.08)" }}>
                        {c.displayName.charAt(0).toUpperCase()}
                      </div>
                  }
                  <span className="text-xs font-medium text-center truncate w-full" style={{ color: "#aaa" }}>
                    {c.displayName.split(" ")[0]}
                  </span>
                </Link>
              ))
          }
        </div>
      </div>

      {/* ── Ghost Workouts ── */}
      {ghosts.length > 0 && (
        <div className="px-4 pb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>
              <span style={{ color: "#a78bfa" }}>Ghost</span> Workouts
            </p>
            <Link href="/ghost" className="text-xs font-semibold" style={{ color: "#555" }}>See all</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {ghosts.map((w) => (
              <Link key={w.id} href={`/ghost/${w.id}`}
                className="shrink-0 p-3 rounded-2xl no-underline"
                style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", width: 180 }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2"
                  style={{ background: "rgba(167,139,250,0.15)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>sprint</span>
                </div>
                <p className="text-sm font-semibold mb-0.5 truncate" style={{ color: "#f2f2f2" }}>{w.title}</p>
                <p className="text-xs" style={{ color: "#6d51c4" }}>
                  {w.exercises ? `${(w.exercises as unknown[]).length} exercises` : "Workout"}
                  {(w.sessionCount ?? 0) > 0 ? ` · ${w.sessionCount} trained` : ""}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 2 }} />

      {/* ── Posts grid ── */}
      {loading ? (
        <div className="grid grid-cols-3" style={{ gap: 2 }}>
          <GridSkeleton />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 px-4">
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#222", display: "block", marginBottom: 12 }}>photo_library</span>
          <p className="text-base font-semibold mb-1" style={{ color: "#f2f2f2" }}>Nothing here yet</p>
          <p className="text-sm mb-5" style={{ color: "#555" }}>Be the first to post on Felcin.</p>
          <Link href="/creator" className="px-5 py-2.5 rounded-xl text-sm font-bold no-underline"
            style={{ background: "#fff", color: "#000" }}>Create a post</Link>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-3" style={{ gap: 2 }}>
          {filtered.map((post) => {
            const type = resolveMediaType(post.contentType, post.mimeType, post.mediaUrl);
            return (
              <Link key={post.id} href={`/comments?postId=${post.id}`}
                className="relative block group" style={{ aspectRatio: "1", overflow: "hidden", background: "#0f0f0f" }}>
                {type === "video" ? (
                  post.thumbnailUrl
                    ? <img src={post.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    : <div className="w-full h-full flex items-center justify-center" style={{ background: "#111" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#333" }}>play_circle</span>
                      </div>
                ) : (
                  <img src={post.mediaUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                )}
                {/* Author overlay on hover */}
                {post.authorPhoto && (
                  <div className="absolute bottom-1.5 left-1.5">
                    <img src={post.authorPhoto} alt="" className="rounded-full object-cover"
                      style={{ width: 22, height: 22, border: "1.5px solid rgba(255,255,255,0.3)" }} />
                  </div>
                )}
                {type === "video" && (
                  <span className="material-symbols-outlined absolute top-2 right-2 text-white"
                    style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                )}
                {/* Like count overlay */}
                {(post.likes ?? 0) > 0 && (
                  <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(0,0,0,0.6)" }}>
                    <span className="material-symbols-outlined text-white" style={{ fontSize: 10, fontVariationSettings: "'FILL' 1" }}>favorite</span>
                    <span className="text-white" style={{ fontSize: 9, fontWeight: 700 }}>{post.likes}</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
        <div ref={sentinelRef} className="flex justify-center py-4">
          {loadingMore && <div className="spinner" />}
        </div>
        </>
      )}
    </div>
  );
}
