"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  collection, query, orderBy, limit, getDocs, onSnapshot,
  doc, getDoc, startAfter, QueryDocumentSnapshot, where, setDoc, deleteDoc, addDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PostCard from "@/components/PostCard";
import { PostCardSkeleton } from "@/components/SkeletonCard";
import Link from "next/link";
import StoriesStrip from "@/components/StoriesStrip";
import FelcinLogo from "@/components/FelcinLogo";
import { useUnreadCount } from "@/hooks/useUnreadCount";

interface Post {
  id: string;
  authorId: string;
  isStory?: boolean;
  authorName?: string;
  authorPhoto?: string;
  caption?: string;
  text?: string;
  mediaUrl?: string;
  contentType?: string;
  mimeType?: string;
  likes?: number;
  comments?: number;
  likedBy?: string[];
  createdAt?: { seconds: number } | null;
  status?: string;
  maxViews?: number | null;
  viewCount?: number;
}

const PAGE_SIZE = 12;

const authorCache = new Map<string, { name: string; photo: string }>();
const AUTHOR_CACHE_MAX = 400;

async function fetchProfile(uid: string): Promise<{ name: string; photo: string }> {
  try {
    const pub = await getDoc(doc(db, "users", uid, "public", "profile"));
    if (pub.exists()) {
      const d = pub.data();
      return { name: d.displayName || d.username || "User", photo: d.photoURL || "" };
    }
    const root = await getDoc(doc(db, "users", uid));
    if (root.exists()) {
      const d = root.data();
      return { name: d.displayName || d.username || "User", photo: d.photoURL || "" };
    }
  } catch {}
  return { name: "User", photo: "" };
}

async function enrichWithAuthor(posts: Post[]): Promise<Post[]> {
  const uncached = [...new Set(posts.map((p) => p.authorId).filter(Boolean))].filter(
    (uid) => !authorCache.has(uid)
  );
  await Promise.all(
    uncached.map(async (uid) => {
      const profile = await fetchProfile(uid);
      if (authorCache.size >= AUTHOR_CACHE_MAX) {
        authorCache.delete(authorCache.keys().next().value!);
      }
      authorCache.set(uid, profile);
    })
  );
  return posts.map((p) => ({
    ...p,
    authorName: authorCache.get(p.authorId)?.name || p.authorName || "User",
    authorPhoto: authorCache.get(p.authorId)?.photo || p.authorPhoto || "",
  }));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export default function HomePage() {
  const { user } = useAuth();
  const unread = useUnreadCount();
  const [tab, setTab] = useState<"foryou" | "following">("foryou");
  const [blockedUids, setBlockedUids] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "users", user.uid, "blocked"), (snap) => {
      setBlockedUids(new Set(snap.docs.map((d) => d.id)));
    }, () => {});
  }, [user]);

  // For You feed
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Following feed
  const [followingPosts, setFollowingPosts] = useState<Post[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [followingIds, setFollowingIds] = useState<string[] | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // For You: real-time first page
  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(PAGE_SIZE));
    return onSnapshot(q, async (snap) => {
      const raw: Post[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) }))
        .filter((p) => p.status !== "scheduled" && !p.isStory && (p.maxViews == null || (p.viewCount ?? 0) < p.maxViews));
      const enriched = await enrichWithAuthor(raw);
      setPosts(enriched);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
      setLoading(false);
    });
  }, []);

  const loadMore = useCallback(async () => {
    if (!lastDoc || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const q = query(
      collection(db, "posts"),
      orderBy("createdAt", "desc"),
      startAfter(lastDoc),
      limit(PAGE_SIZE)
    );
    const snap = await getDocs(q);
    const raw: Post[] = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) }))
      .filter((p) => p.status !== "scheduled" && !p.isStory && (p.maxViews == null || (p.viewCount ?? 0) < p.maxViews));
    const enriched = await enrichWithAuthor(raw);
    setPosts((prev) => {
      const ids = new Set(prev.map((p) => p.id));
      return [...prev, ...enriched.filter((p) => !ids.has(p.id))];
    });
    setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    setHasMore(snap.docs.length === PAGE_SIZE);
    setLoadingMore(false);
  }, [lastDoc, loadingMore, hasMore]);

  // Infinite scroll
  useEffect(() => {
    if (tab !== "foryou") return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "300px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, loadMore]);

  // Following feed — load once when tab is first opened
  useEffect(() => {
    if (tab !== "following" || !user || followingIds !== null) return;
    setFollowingLoading(true);
    (async () => {
      try {
        const followSnap = await getDocs(collection(db, "users", user.uid, "following"));
        const ids = followSnap.docs.map((d) => d.id);
        setFollowingIds(ids);
        if (ids.length === 0) { setFollowingLoading(false); return; }

        const results = await Promise.all(
          chunkArray(ids, 30).map((c) =>
            getDocs(query(collection(db, "posts"), where("authorId", "in", c), limit(100)))
          )
        );
        const raw: Post[] = results
          .flatMap((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) })))
          .filter((p) => p.status !== "scheduled" && !p.isStory && (p.maxViews == null || (p.viewCount ?? 0) < p.maxViews))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        const enriched = await enrichWithAuthor(raw);
        setFollowingPosts(enriched);
      } catch {}
      setFollowingLoading(false);
    })();
  }, [tab, user, followingIds]);

  return (
    <div className="max-w-xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="shrink-0">
            <FelcinLogo size={28} />
          </div>
          <span className="font-bold text-xl tracking-tight" style={{ color: "#f2f2f2" }}>Felcin</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <Link href="/notifications" className="relative flex items-center justify-center" style={{ width: 36, height: 36 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: unread > 0 ? "#f2f2f2" : "#555", fontVariationSettings: unread > 0 ? "'FILL' 1" : "'FILL' 0" }}>
              notifications
            </span>
            {unread > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white px-0.5"
                style={{ background: "#ef4444" }}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>

          {/* For You / Following slide toggle */}
          <div className="relative flex items-center rounded-full cursor-pointer select-none"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", padding: 2 }}
          onClick={() => setTab(tab === "foryou" ? "following" : "foryou")}>
          <div style={{
            position: "absolute", top: 2, bottom: 2,
            left: tab === "foryou" ? 2 : "calc(50% + 1px)",
            width: "calc(50% - 3px)",
            background: "#fff", borderRadius: 999,
            transition: "left 0.2s ease",
          }} />
          <span className="relative z-10 text-xs font-semibold"
            style={{ width: 68, textAlign: "center", padding: "4px 0", color: tab === "foryou" ? "#000" : "#555", transition: "color 0.15s" }}>
            For You
          </span>
          <span className="relative z-10 text-xs font-semibold"
            style={{ width: 68, textAlign: "center", padding: "4px 0", color: tab === "following" ? "#000" : "#555", transition: "color 0.15s" }}>
            Following
          </span>
          </div>
        </div>
      </div>

      {/* Stories strip */}
      <StoriesStrip />

      {/* Ghost Workouts banner */}
      <Link href="/ghost" className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-4 no-underline"
        style={{ background: "linear-gradient(135deg, rgba(167,139,250,0.12), rgba(139,92,246,0.06))", border: "1px solid rgba(167,139,250,0.2)" }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(167,139,250,0.15)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>sprint</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: "#c4b5fd" }}>Ghost Workouts</p>
          <p className="text-xs" style={{ color: "#6d51c4" }}>Train alongside real people — on your schedule</p>
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#6d51c4" }}>chevron_right</span>
      </Link>

      {/* For You */}
      {tab === "foryou" && (
        loading ? (
          <div className="flex flex-col gap-5">
            {[1,2,3].map((i) => <PostCardSkeleton key={i} />)}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col gap-3 py-8">
            <div className="text-center pb-4" style={{ color: "#888" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, display: "block", marginBottom: 10, color: "#333" }}>photo_camera</span>
              <p className="text-base font-semibold mb-1" style={{ color: "#f1f1f1" }}>Nothing here yet</p>
              <p className="text-sm">Be the first to share something or explore creators.</p>
            </div>
            {/* Discover prompt */}
            <Link href="/explore" className="flex items-center gap-3 px-4 py-3.5 rounded-2xl no-underline"
              style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#888", fontVariationSettings: "'FILL' 1" }}>explore</span>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Discover creators</p>
                <p className="text-xs" style={{ color: "#555" }}>Find fitness creators to follow</p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#444" }}>chevron_right</span>
            </Link>
            <Link href="/challenges" className="flex items-center gap-3 px-4 py-3.5 rounded-2xl no-underline"
              style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#888", fontVariationSettings: "'FILL' 1" }}>link</span>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Join a challenge</p>
                <p className="text-xs" style={{ color: "#555" }}>Compete and stay accountable</p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#444" }}>chevron_right</span>
            </Link>
            <Link href="/creator" className="flex items-center gap-3 px-4 py-3.5 rounded-2xl no-underline"
              style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#888", fontVariationSettings: "'FILL' 1" }}>add_circle</span>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Share your first post</p>
                <p className="text-xs" style={{ color: "#555" }}>Be the first creator on Felcin</p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#444" }}>chevron_right</span>
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-5">
              {posts.filter((p) => !blockedUids.has(p.authorId)).map((post) => (
                <PostCard key={post.id} post={post} onBlock={(uid) => setBlockedUids((prev) => new Set([...prev, uid]))} />
              ))}
            </div>
            <div ref={sentinelRef} className="flex justify-center py-6">
              {loadingMore && <div className="spinner" />}
            </div>
          </>
        )
      )}

      {/* Following */}
      {tab === "following" && (
        followingLoading ? (
          <div className="flex flex-col gap-5">
            {[1,2,3].map((i) => <PostCardSkeleton key={i} />)}
          </div>
        ) : followingIds?.length === 0 ? (
          <div className="text-center py-20" style={{ color: "#888" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, display: "block", marginBottom: 12 }}>group</span>
            <p className="text-lg font-semibold" style={{ color: "#f1f1f1" }}>Follow someone first</p>
            <p className="text-sm mt-1">Explore creators and follow them to see their posts here.</p>
          </div>
        ) : followingPosts.length === 0 ? (
          <div className="text-center py-20" style={{ color: "#888" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, display: "block", marginBottom: 12 }}>photo_camera</span>
            <p className="text-lg font-semibold" style={{ color: "#f1f1f1" }}>No posts yet</p>
            <p className="text-sm mt-1">People you follow haven&apos;t posted yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {followingPosts.filter((p) => !blockedUids.has(p.authorId)).map((post) => (
              <PostCard key={post.id} post={post} onBlock={(uid) => setBlockedUids((prev) => new Set([...prev, uid]))} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
