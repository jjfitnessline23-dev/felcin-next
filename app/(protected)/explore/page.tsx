"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { collection, query, orderBy, limit, getDocs, getDoc, doc, startAfter, QueryDocumentSnapshot, where } from "@/lib/db";
import { db } from "@/lib/firebase";
import PostCard from "@/components/PostCard";

interface Post {
  id: string; authorId: string; authorName?: string; authorPhoto?: string;
  mediaUrl?: string; contentType?: string; mimeType?: string;
  thumbnailUrl?: string; likes?: number; isStory?: boolean;
  status?: string; maxViews?: number | null; viewCount?: number;
  caption?: string; text?: string; likedBy?: string[]; comments?: number;
  createdAt?: { seconds: number } | null;
  collabUid?: string | null; collabName?: string | null; collabPhoto?: string | null;
  repostCount?: number; isRepost?: boolean; repostOf?: string | null;
  repostOriginalAuthorName?: string | null;
}
interface Creator { uid: string; displayName: string; photoURL?: string; }
interface GhostWorkout {
  id: string; title: string; description?: string; hostName: string;
  hostPhoto?: string; sessionCount?: number; exercises?: unknown[];
}
interface UserResult { uid: string; displayName?: string; photoURL?: string; followersCount?: number; }
interface PostResult { id: string; mediaUrl?: string; caption?: string; contentType?: string; }

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
  return <>{Array.from({ length: 9 }).map((_, i) => <div key={i} className="skeleton" style={{ aspectRatio: "1" }} />)}</>;
}

const PAGE_SIZE = 12;

export default function ExplorePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchTab, setSearchTab] = useState<"people" | "tags">("people");
  const [searchUsers, setSearchUsers] = useState<UserResult[]>([]);
  const [searchPosts, setSearchPosts] = useState<PostResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [blockedUids, setBlockedUids] = useState<Set<string>>(new Set());
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

  // Auto-focus search when navigated from /search
  useEffect(() => {
    if (searchParams.get("tab") === "search") {
      setTimeout(() => searchInputRef.current?.focus(), 200);
    }
  }, [searchParams]);

  // ── Search ──────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = searchQ.trim();
      if (!q) { setSearchUsers([]); setSearchPosts([]); return; }
      setSearchLoading(true);
      try {
        if (searchTab === "people") {
          // Server-side prefix range query — works at any user count.
          // Run two queries (original case + lowercase) so "mia" and "Mia" both find "Mia Sterling".
          const RANGE_SUFFIX = "";
          const qLow = q.toLowerCase();
          const [s1, s2] = await Promise.all([
            getDocs(query(collection(db, "users"), where("displayName", ">=", q), where("displayName", "<=", q + RANGE_SUFFIX), limit(15))),
            getDocs(query(collection(db, "users"), where("displayName", ">=", qLow), where("displayName", "<=", qLow + RANGE_SUFFIX), limit(15))),
          ]);
          const seen = new Set<string>();
          const results: UserResult[] = [];
          [...s1.docs, ...s2.docs].forEach((d) => {
            if (!seen.has(d.id)) { seen.add(d.id); results.push({ uid: d.id, ...(d.data() as Omit<UserResult, "uid">) }); }
          });
          setSearchUsers(results.slice(0, 20));
        } else {
          const tag = q.replace(/^#/, "").toLowerCase();
          const snap = await getDocs(query(collection(db, "posts"), where("tags", "array-contains", tag), orderBy("createdAt", "desc"), limit(30)));
          setSearchPosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PostResult, "id">) })));
        }
      } catch {}
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, searchTab]);

  // ── Explore load ─────────────────────────────────────
  const fetchPage = useCallback(async (after: QueryDocumentSnapshot | null) => {
    const q = after
      ? query(collection(db, "posts"), orderBy("createdAt", "desc"), startAfter(after), limit(PAGE_SIZE))
      : query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
    const snap = await getDocs(q);
    const raw = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) })).filter((p) => p.mediaUrl && !p.isStory && p.status !== "scheduled" && (p.maxViews == null || (p.viewCount ?? 0) < p.maxViews));
    setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    setHasMore(snap.docs.length === PAGE_SIZE);
    const authorIds = [...new Set(raw.map((p) => p.authorId).filter(Boolean))];
    const profileMap = new Map<string, { name: string; photo: string }>();
    await Promise.all(authorIds.map(async (uid) => {
      try {
        const s = await getDoc(doc(db, "users", uid, "public", "profile"));
        if (s.exists()) { const d = s.data(); profileMap.set(uid, { name: d.displayName || "User", photo: d.photoURL || "" }); }
      } catch {}
    }));
    return { raw, profileMap, authorIds };
  }, []);

  useEffect(() => {
    fetchPage(null).then(({ raw, profileMap, authorIds }) => {
      setPosts(raw.map((p) => ({ ...p, authorName: profileMap.get(p.authorId)?.name || p.authorName || "User", authorPhoto: profileMap.get(p.authorId)?.photo || p.authorPhoto || "" })));
      setCreators(authorIds.slice(0, 12).map((uid) => ({ uid, displayName: profileMap.get(uid)?.name || "User", photoURL: profileMap.get(uid)?.photo })).filter((c) => c.displayName !== "User" || c.photoURL));
      setCreatorsLoading(false); setLoading(false);
    }).catch(() => { setLoading(false); setCreatorsLoading(false); });
  }, [fetchPage]);

  useEffect(() => {
    getDocs(query(collection(db, "ghostWorkouts"), orderBy("createdAt", "desc"), limit(6)))
      .then((snap) => setGhosts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GhostWorkout, "id">) }))))
      .catch(() => {});
  }, []);

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

  useEffect(() => {
    if (searchQ) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore(); }, { rootMargin: "400px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore, searchQ]);

  const filtered = posts.filter((p) => {
    if (filter === "image") return resolveMediaType(p.contentType, p.mimeType, p.mediaUrl) === "image";
    if (filter === "video") return resolveMediaType(p.contentType, p.mimeType, p.mediaUrl) === "video";
    return true;
  });

  const isSearching = !!searchQ.trim();

  return (
    <div className="max-w-3xl mx-auto pb-10">

      {/* Sticky header */}
      <div className="sticky z-10 px-4 pt-4 pb-3"
        style={{ top: "env(safe-area-inset-top,0px)", background: "rgba(9,9,9,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>

        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => router.back()} className="icon-btn shrink-0" style={{ width: 36, height: 36, color: "#f2f2f2" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
          </button>
          <h1 className="font-bold text-base" style={{ color: "#f2f2f2" }}>Explore</h1>
        </div>

        {/* Search bar */}
        <div className="relative mb-3">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2" style={{ fontSize: 20, color: "#555" }}>search</span>
          <input
            type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
            ref={searchInputRef}
            placeholder="Search people, #hashtags…"
            className="w-full pl-10 pr-10 py-2.5 rounded-2xl outline-none text-sm"
            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }}
          />
          {searchQ && (
            <button onClick={() => setSearchQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 border-none bg-transparent cursor-pointer">
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#555" }}>close</span>
            </button>
          )}
        </div>

        {isSearching ? (
          /* Search mode: people / tags tabs */
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
            {(["people", "tags"] as const).map((t) => (
              <button key={t} onClick={() => setSearchTab(t)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold border-none cursor-pointer"
                style={searchTab === t ? { background: "#fff", color: "#000" } : { background: "transparent", color: "#555" }}>
                {t === "people" ? "People" : "Hashtags"}
              </button>
            ))}
          </div>
        ) : (
          /* Explore mode: media filter pills */
          <div className="flex gap-2">
            {[["all", "All"], ["image", "Photos"], ["video", "Videos"]].map(([val, label]) => (
              <button key={val} onClick={() => setFilter(val)} className={`btn-pill${filter === val ? " is-active" : ""}`}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Search results ── */}
      {isSearching && (
        <div className="px-4 pt-4">
          {searchLoading && <div className="flex justify-center py-12"><div className="spinner" /></div>}

          {!searchLoading && searchTab === "people" && (
            <>
              {!searchUsers.length && (
                <div className="text-center py-16">
                  <span className="material-symbols-outlined" style={{ fontSize: 44, display: "block", marginBottom: 12, color: "#222" }}>person_search</span>
                  <p className="text-sm" style={{ color: "#555" }}>No users found for &ldquo;{searchQ}&rdquo;</p>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {searchUsers.map((u) => (
                  <Link key={u.uid} href={`/user-profile?uid=${u.uid}`}
                    className="flex items-center gap-3 p-3 rounded-2xl"
                    style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                    {u.photoURL
                      ? <img src={u.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 46, height: 46 }} />
                      : <div className="rounded-full flex items-center justify-center font-bold shrink-0" style={{ width: 46, height: 46, background: "#222", color: "#aaa" }}>{(u.displayName || "U").charAt(0).toUpperCase()}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: "#f2f2f2" }}>{u.displayName || "User"}</p>
                      {typeof u.followersCount === "number" && <p className="text-xs" style={{ color: "#555" }}>{u.followersCount.toLocaleString()} followers</p>}
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#333" }}>chevron_right</span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {!searchLoading && searchTab === "tags" && (
            <>
              {!searchPosts.length && (
                <div className="text-center py-16">
                  <span className="material-symbols-outlined" style={{ fontSize: 44, display: "block", marginBottom: 12, color: "#222" }}>tag</span>
                  <p className="text-sm" style={{ color: "#555" }}>No posts found for #{searchQ.replace(/^#/, "")}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-1">
                {searchPosts.map((p) => (
                  <Link key={p.id} href={`/comments?postId=${p.id}`}
                    className="relative block" style={{ aspectRatio: "1", background: "#131313", overflow: "hidden", borderRadius: 4 }}>
                    {p.mediaUrl
                      ? <img src={p.mediaUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center p-2 text-xs text-center" style={{ color: "#888" }}>{p.caption?.slice(0, 60)}</div>}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Explore content ── */}
      {!isSearching && (
        <>
          {/* Cinematic Hero */}
          <div className="relative mx-4 mt-3 mb-3 rounded-3xl overflow-hidden"
            style={{ background: "linear-gradient(135deg,#00080f 0%,#001520 50%,#00080f 100%)", border: "1px solid rgba(6,182,212,0.2)", minHeight: 130 }}>
            <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(6,182,212,0.35),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
            <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(6,182,212,0.18) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
            <div className="absolute inset-0 flex items-center justify-end pr-5 pointer-events-none select-none">
              <img src="/static/logo-nav.svg" alt="" style={{ width: 120, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(160deg)", animation: "floatLogo 9s ease-in-out infinite" }} />
            </div>
            <div className="relative z-10 p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(6,182,212,0.2)", border: "1px solid rgba(6,182,212,0.4)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#06b6d4", fontVariationSettings: "'FILL' 1" }}>explore</span>
                </div>
                <span className="text-xs font-black tracking-widest" style={{ color: "#06b6d4", letterSpacing: "0.18em" }}>EXPLORE</span>
              </div>
              <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.5rem,5vw,2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#67e8f9 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Discover Felcin</h1>
              <p className="text-sm" style={{ color: "#555" }}>Creators, workouts, challenges &amp; more</p>
            </div>
          </div>

          {/* Featured Creators */}
          <div className="px-4 pt-3 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Featured Creators</p>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {creatorsLoading
                ? Array.from({ length: 6 }).map((_, i) => <CreatorSkeleton key={i} />)
                : creators.length === 0
                ? (
                  <div className="flex flex-col items-center justify-center py-4 px-2 text-center" style={{ minWidth: 200 }}>
                    <span className="material-symbols-outlined mb-2" style={{ fontSize: 28, color: "#222" }}>group</span>
                    <p className="text-xs font-semibold mb-1" style={{ color: "#444" }}>No creators yet</p>
                    <p className="text-xs" style={{ color: "#333" }}>Be the first — create a post to appear here</p>
                  </div>
                )
                : creators.map((c) => (
                  <Link key={c.uid} href={`/user-profile?uid=${c.uid}`}
                    className="flex flex-col items-center gap-2 shrink-0 no-underline" style={{ width: 76 }}>
                    {c.photoURL
                      ? <img src={c.photoURL} alt="" className="rounded-full object-cover" style={{ width: 64, height: 64, border: "2px solid rgba(255,255,255,0.1)" }} />
                      : <div className="rounded-full flex items-center justify-center text-lg font-bold" style={{ width: 64, height: 64, background: "#1a1a1a", color: "#555", border: "2px solid rgba(255,255,255,0.08)" }}>{c.displayName.charAt(0).toUpperCase()}</div>}
                    <span className="text-xs font-medium text-center truncate w-full" style={{ color: "#aaa" }}>{c.displayName.split(" ")[0]}</span>
                  </Link>
                ))}
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 2 }} />

          {/* Post grid */}
          {loading ? (
            <div className="flex flex-col gap-5 px-4">
              {[1,2,3].map((i) => <div key={i} className="skeleton rounded-2xl" style={{ height: 420 }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="ghost-bg text-center py-16 px-6 rounded-3xl">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#2a2a2a", fontVariationSettings: "'FILL' 1" }}>photo_library</span>
              </div>
              <p className="text-lg font-bold mb-2" style={{ color: "#f2f2f2" }}>Felcin is just getting started</p>
              <p className="text-sm mb-2" style={{ color: "#555" }}>Be one of the first creators and build your audience from day one.</p>
              <p className="text-xs mb-6" style={{ color: "#333" }}>Early creators grow fastest — the platform is yours to shape.</p>
              <div className="flex flex-col gap-3">
                <Link href="/creator" className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold no-underline" style={{ background: "#fff", color: "#000" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                  Create your first post
                </Link>
                <Link href="/ghost" className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold no-underline" style={{ background: "rgba(167,139,250,0.1)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.2)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>sprint</span>
                  Try a Ghost Workout
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-5 px-4">
                {filtered
                  .filter((p) => !blockedUids.has(p.authorId))
                  .map((post) => (
                    <PostCard key={post.id} post={post} onBlock={(uid) => setBlockedUids((prev) => new Set([...prev, uid]))} />
                  ))}
              </div>
              <div ref={sentinelRef} className="flex justify-center py-6">
                {loadingMore && <div className="spinner" />}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
