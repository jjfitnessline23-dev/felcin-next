"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  collection, query, orderBy, limit, getDocs, getDoc, onSnapshot,
  doc, startAfter, QueryDocumentSnapshot, where, setDoc, deleteDoc, addDoc, serverTimestamp,
} from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PostCard from "@/components/PostCard";
import AdCard, { Ad } from "@/components/AdCard";
import InviteBanner from "@/components/InviteBanner";
import { PostCardSkeleton } from "@/components/SkeletonCard";
import Link from "next/link";
import StoriesStrip from "@/components/StoriesStrip";
import FelcinLogo from "@/components/FelcinLogo";
import StreakChip from "@/components/StreakChip";
import { useStreak } from "@/hooks/useStreak";
import { useUnreadCount } from "@/hooks/useUnreadCount";
import { sanitizePost } from "@/lib/sanitize";

export interface Post {
  id: string; authorId: string; isStory?: boolean; authorName?: string; authorPhoto?: string;
  caption?: string; text?: string; mediaUrl?: string; contentType?: string; mimeType?: string;
  likes?: number; comments?: number; likedBy?: string[]; createdAt?: { seconds: number } | null;
  status?: string; maxViews?: number | null; viewCount?: number;
}
interface HomeCreator { uid: string; displayName: string; photoURL?: string; }
interface HomeGhost { id: string; title: string; hostName: string; hostPhoto?: string; sessionCount?: number; exercises?: unknown[]; }

const PAGE_SIZE = 12;
const FEED_CACHE_KEY = "felcin_home_v3";
const FEED_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days — show last-seen feed when offline
const authorCache = new Map<string, { name: string; photo: string }>();
const AUTHOR_CACHE_MAX = 400;

async function fetchProfile(uid: string): Promise<{ name: string; photo: string }> {
  try {
    const pub = await getDoc(doc(db, "users", uid, "public", "profile"));
    if (pub.exists()) { const d = pub.data(); return { name: d.displayName || d.username || "User", photo: d.photoURL || "" }; }
    const root = await getDoc(doc(db, "users", uid));
    if (root.exists()) { const d = root.data(); return { name: d.displayName || d.username || "User", photo: d.photoURL || "" }; }
  } catch {}
  return { name: "User", photo: "" };
}

async function enrichWithAuthor(posts: Post[]): Promise<Post[]> {
  // Posts now carry a denormalized authorName/authorPhoto written at creation time,
  // so only legacy/un-backfilled posts (missing the name) still need a profile lookup.
  // In the common case this does ZERO extra Firestore reads.
  const needsLookup = posts.filter((p) => p.authorId && !p.authorName);
  const uncached = [...new Set(needsLookup.map((p) => p.authorId))].filter((uid) => !authorCache.has(uid));
  await Promise.all(uncached.map(async (uid) => {
    const profile = await fetchProfile(uid);
    if (authorCache.size >= AUTHOR_CACHE_MAX) authorCache.delete(authorCache.keys().next().value!);
    authorCache.set(uid, profile);
  }));
  return posts.map((p) => {
    if (p.authorName) return p; // already denormalized — no work needed
    const c = authorCache.get(p.authorId);
    return {
      ...p,
      authorName: c?.name || p.authorName || "User",
      authorPhoto: c?.photo || p.authorPhoto || "",
    };
  });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

const AD_INJECT_EVERY = 5;
function buildFeedItems(posts: Post[], ads: Ad[]): (Post | Ad)[] {
  if (ads.length === 0) return posts;
  const result: (Post | Ad)[] = [];
  let adIndex = 0;
  posts.forEach((post, i) => {
    result.push(post);
    if ((i + 1) % AD_INJECT_EVERY === 0 && adIndex < ads.length) {
      result.push(ads[adIndex % ads.length]);
      adIndex++;
    }
  });
  return result;
}

// Merge new creator data into the existing row WITHOUT reordering or removing
// anyone already shown — updates names/photos in place and only appends genuinely
// new creators (cap 12). This stops the "Creators" row from reshuffling as the
// cached → fresh → enriched data arrives on each open.
function mergeCreators(prev: HomeCreator[], incoming: HomeCreator[]): HomeCreator[] {
  const byId = new Map(prev.map((c) => [c.uid, c]));
  const order: string[] = prev.map((c) => c.uid);
  for (const c of incoming) {
    const ex = byId.get(c.uid);
    if (ex) {
      byId.set(c.uid, { uid: c.uid, displayName: c.displayName || ex.displayName, photoURL: c.photoURL || ex.photoURL });
    } else if (order.length < 12) {
      byId.set(c.uid, c);
      order.push(c.uid);
    }
  }
  // Return the same reference if nothing changed, so React skips a re-render.
  const next = order.map((id) => byId.get(id)!);
  const unchanged = next.length === prev.length && next.every((c, i) =>
    c.uid === prev[i].uid && c.displayName === prev[i].displayName && c.photoURL === prev[i].photoURL);
  return unchanged ? prev : next;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const QUICK_LINKS = [
  { href: "/ghost",      icon: "sprint",              label: "Ghost",      color: "#a78bfa" },
  { href: "/progress",   icon: "compare",             label: "Progress",   color: "#818cf8" },
  { href: "/live",       icon: "live_tv",             label: "Live",       color: "#ef4444" },
  { href: "/workouts",   icon: "fitness_center",      label: "Workouts",   color: "var(--fx-accent)" },
  { href: "/challenges", icon: "link",                label: "Challenges", color: "#f59e0b" },
  { href: "/trainers",   icon: "sports_martial_arts", label: "Trainers",   color: "#06b6d4" },
  { href: "/podcasts",   icon: "mic",                 label: "Podcast",    color: "#7C3AED" },
  { href: "/muscle-map", icon: "accessibility_new",   label: "Muscle Map", color: "#f97316" },
  { href: "/explore",    icon: "explore",             label: "Explore",    color: "#ec4899" },
  { href: "/schedule",   icon: "calendar_month",      label: "Schedule",   color: "#06b6d4" },
];

export default function HomeClient({ initialPosts = [] }: { initialPosts?: Post[] }) {
  const { user } = useAuth();
  const unread = useUnreadCount();
  const streak = useStreak();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<"foryou" | "following">("foryou");
  const [blockedUids, setBlockedUids] = useState<Set<string>>(new Set());
  const [blockedByUids, setBlockedByUids] = useState<Set<string>>(new Set());
  const [activeAds, setActiveAds] = useState<Ad[]>([]);
  const [boostEnabled, setBoostEnabled] = useState(true);
  const [userBadge, setUserBadge] = useState<string | null>(() => {
    try { return localStorage.getItem("felcin_badge"); } catch { return null; }
  });
  const processedBoostRef = useRef<string | null>(null);

  const rawFirst = user?.displayName?.split(" ")[0] || user?.email?.split("@")[0] || "there";
  const firstName = rawFirst.length > 16 ? rawFirst.slice(0, 16) + "…" : rawFirst;

  useEffect(() => {
    if (!user) return;
    const unsub1 = onSnapshot(collection(db, "users", user.uid, "blocked"), (s) => setBlockedUids(new Set(s.docs.map((d) => d.id))), () => {});
    const unsub2 = onSnapshot(collection(db, "users", user.uid, "blockedBy"), (s) => setBlockedByUids(new Set(s.docs.map((d) => d.id))), () => {});
    return () => { unsub1(); unsub2(); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((s) => {
      if (s.exists()) {
        const badge = s.data()?.badge ?? null;
        setUserBadge(badge);
        try { if (badge) localStorage.setItem("felcin_badge", badge); else localStorage.removeItem("felcin_badge"); } catch {}
      }
    }).catch(() => {});
  }, [user]);

  // Load ads immediately, in parallel — don't wait for the config snapshot to
  // round-trip first (removes a serial dependency on the startup critical path).
  useEffect(() => {
    getDocs(query(collection(db, "ads"), where("status", "==", "active"), orderBy("createdAt", "desc"), limit(5)))
      .then((s) => setActiveAds(s.docs.map((d) => ({ _isAd: true as const, id: d.id, ...(d.data() as Omit<Ad, "_isAd" | "id">) }))))
      .catch(() => {});
  }, []);

  // Config listener only toggles feature flags — if ads are disabled it clears them.
  useEffect(() => {
    return onSnapshot(doc(db, "config", "features"), (snap) => {
      if (snap.exists()) {
        setBoostEnabled(snap.data().boostEnabled ?? true);
        if ((snap.data().adsEnabled ?? true) === false) setActiveAds([]);
      }
    });
  }, []);

  useEffect(() => {
    const sessionId = searchParams.get("boost_session_id");
    if (!sessionId || !user || processedBoostRef.current === sessionId) return;
    router.replace("/");
    fetch(`/api/boost-verify?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => { if (r.ok) processedBoostRef.current = sessionId; })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  useEffect(() => {
    const sessionId = searchParams.get("premium_session_id");
    if (!sessionId || !user) return;
    router.replace("/");
    fetch(`/api/premium-verify?session_id=${encodeURIComponent(sessionId)}`).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  // Read cache synchronously so the first render already has data — eliminates layout shift
  function readFeedCache() {
    try {
      const stored = localStorage.getItem(FEED_CACHE_KEY);
      if (!stored) return null;
      const { posts: cached, ts } = JSON.parse(stored) as { posts: Post[]; ts: number };
      if (Date.now() - ts < FEED_CACHE_TTL && cached.length > 0) return cached;
    } catch {}
    return null;
  }
  function creatorsFromPosts(cached: Post[]): HomeCreator[] {
    const seen = new Set<string>(); const cs: HomeCreator[] = [];
    for (const p of cached) {
      if (!seen.has(p.authorId) && p.authorName && p.authorName !== "User") {
        seen.add(p.authorId); cs.push({ uid: p.authorId, displayName: p.authorName, photoURL: p.authorPhoto });
        if (cs.length >= 12) break;
      }
    }
    return cs;
  }

  // Prefer server-seeded posts (SSR, always fresh + same for everyone) over the
  // localStorage cache. Either one lets the feed paint instantly with no client
  // Firestore round-trip the moment auth resolves.
  const _cachedPosts = useState<Post[] | null>(() => (initialPosts.length ? initialPosts : readFeedCache()))[0];
  // Seed the Creators row instantly on every open: prefer creators from the
  // seeded/cached posts, otherwise fall back to the last-seen creators persisted
  // in localStorage. This keeps the row from popping in from empty (which shifts
  // the first avatar and everything below it) — it's always populated, then just
  // fills in place. Same pattern the Ghost Workouts row already uses.
  const [featuredCreators, setFeaturedCreators] = useState<HomeCreator[]>(() => {
    const fromPosts = _cachedPosts ? creatorsFromPosts(_cachedPosts) : [];
    if (fromPosts.length) return fromPosts;
    try {
      const stored = localStorage.getItem("felcin_creators");
      return stored ? (JSON.parse(stored) as HomeCreator[]) : [];
    } catch { return []; }
  });
  const [featuredGhosts, setFeaturedGhosts] = useState<HomeGhost[]>(() => {
    try {
      const stored = localStorage.getItem("felcin_ghosts");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  useEffect(() => {
    getDocs(query(collection(db, "ghostWorkouts"), orderBy("createdAt", "desc"), limit(8)))
      .then((snap) => {
        const ghosts = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HomeGhost, "id">) }));
        setFeaturedGhosts(ghosts);
        try { localStorage.setItem("felcin_ghosts", JSON.stringify(ghosts)); } catch {}
      })
      .catch(() => {});
  }, []);

  const [posts, setPosts] = useState<Post[]>(() => _cachedPosts ?? []);
  const [loading, setLoading] = useState<boolean>(() => !_cachedPosts);
  const [forYouError, setForYouError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [followingPosts, setFollowingPosts] = useState<Post[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [followingIds, setFollowingIds] = useState<string[] | null>(null);
  const [followingError, setFollowingError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadForYou = useCallback(async () => {
    try {
      setForYouError(false);
      const snap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(PAGE_SIZE)));
      const raw: Post[] = snap.docs.map((d) => sanitizePost(d.data() as Record<string, unknown>, d.id) as unknown as Post)
        .filter((p) => p.status !== "scheduled" && !p.isStory && (p.maxViews == null || (p.viewCount ?? 0) < p.maxViews));
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === PAGE_SIZE);
      setPosts(raw); setLoading(false);
      setFeaturedCreators((prev) => mergeCreators(prev, creatorsFromPosts(raw)));
      const enriched = await enrichWithAuthor(raw);
      setPosts(enriched);
      setFeaturedCreators((prev) => {
        const merged = mergeCreators(prev, creatorsFromPosts(enriched));
        try { localStorage.setItem("felcin_creators", JSON.stringify(merged)); } catch {}
        return merged;
      });
      try { localStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ posts: enriched, ts: Date.now() })); } catch {}
    } catch {
      setLoading(false);
      // Only surface the error screen if we have nothing to show — otherwise keep the
      // cached/seeded posts on screen rather than blanking the feed.
      setPosts((cur) => { if (cur.length === 0) setForYouError(true); return cur; });
    }
  }, []);

  useEffect(() => { loadForYou(); }, [loadForYou]);

  // Tapping the Home tab while already on Home fires this: jump to top + reload the feed.
  useEffect(() => {
    const onRefresh = () => {
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { window.scrollTo(0, 0); }
      setTab("foryou");
      setFollowingIds(null); // force the Following tab to reload next time it's opened
      loadForYou();
    };
    window.addEventListener("felcin:home-refresh", onRefresh);
    return () => window.removeEventListener("felcin:home-refresh", onRefresh);
  }, [loadForYou]);

  const loadMore = useCallback(async () => {
    if (!lastDoc || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const snap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), startAfter(lastDoc), limit(PAGE_SIZE)));
    const raw: Post[] = snap.docs.map((d) => sanitizePost(d.data() as Record<string, unknown>, d.id) as unknown as Post)
      .filter((p) => p.status !== "scheduled" && !p.isStory && (p.maxViews == null || (p.viewCount ?? 0) < p.maxViews));
    const enriched = await enrichWithAuthor(raw);
    setPosts((prev) => { const ids = new Set(prev.map((p) => p.id)); return [...prev, ...enriched.filter((p) => !ids.has(p.id))]; });
    setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    setHasMore(snap.docs.length === PAGE_SIZE);
    setLoadingMore(false);
  }, [lastDoc, loadingMore, hasMore]);

  useEffect(() => {
    if (tab !== "foryou") return;
    const el = sentinelRef.current; if (!el) return;
    const obs = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore(); }, { rootMargin: "300px" });
    obs.observe(el); return () => obs.disconnect();
  }, [tab, loadMore]);

  useEffect(() => {
    if (tab !== "following" || !user || followingIds !== null) return;
    setFollowingLoading(true);
    setFollowingError(false);
    (async () => {
      try {
        const followSnap = await getDocs(query(collection(db, "users", user.uid, "following"), limit(500)));
        const ids = followSnap.docs.map((d) => d.id);
        setFollowingIds(ids);
        if (ids.length === 0) { setFollowingLoading(false); return; }
        const results = await Promise.all(chunkArray(ids, 30).map((c) => getDocs(query(collection(db, "posts"), where("authorId", "in", c), limit(100)))));
        const raw: Post[] = results.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, "id">) })))
          .filter((p) => p.status !== "scheduled" && !p.isStory && (p.maxViews == null || (p.viewCount ?? 0) < p.maxViews))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setFollowingPosts(await enrichWithAuthor(raw));
      } catch { setFollowingError(true); }
      setFollowingLoading(false);
    })();
  }, [tab, user, followingIds]);

  const badgeIcons: Record<string, { icon: string; color: string }> = {
    verified: { icon: "verified", color: "#60a5fa" }, creator: { icon: "draw", color: "#34d399" },
    fitness_coach: { icon: "fitness_center", color: "#22d3ee" }, pro: { icon: "workspace_premium", color: "#a78bfa" },
    athlete: { icon: "sports", color: "#f87171" }, star: { icon: "star", color: "#fbbf24" },
    brand: { icon: "business", color: "#94a3b8" }, elite: { icon: "diamond", color: "#f472b6" },
  };
  const activeBadge = userBadge ? badgeIcons[userBadge] : null;

  return (
    <div className="max-w-xl mx-auto pb-10">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <FelcinLogo size={28} />
          <span className="font-bold text-xl tracking-tight" style={{ color: "#f2f2f2" }}>Felcin</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/notifications" className="relative flex items-center justify-center" style={{ width: 36, height: 36 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: unread > 0 ? "#f2f2f2" : "#555", fontVariationSettings: unread > 0 ? "'FILL' 1" : "'FILL' 0" }}>notifications</span>
            {unread > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white px-0.5" style={{ background: "#ef4444" }}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          {/* Tab toggle */}
          <div className="relative flex items-center rounded-full cursor-pointer select-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", padding: 2 }}
            onClick={() => setTab(tab === "foryou" ? "following" : "foryou")}>
            <div style={{ position: "absolute", top: 2, bottom: 2, left: tab === "foryou" ? 2 : "calc(50% + 1px)", width: "calc(50% - 3px)", background: "#fff", borderRadius: 999, transition: "left 0.2s ease" }} />
            <span className="relative z-10 text-xs font-semibold" style={{ width: 68, textAlign: "center", padding: "4px 0", color: tab === "foryou" ? "#000" : "#555", transition: "color 0.15s" }}>For You</span>
            <span className="relative z-10 text-xs font-semibold" style={{ width: 68, textAlign: "center", padding: "4px 0", color: tab === "following" ? "#000" : "#555", transition: "color 0.15s" }}>Following</span>
          </div>
        </div>
      </div>

      {/* Mobile invite prompt (hidden on desktop, which has the sidebar link) */}
      <div className="px-4"><InviteBanner /></div>

      {/* ── Greeting Banner ── */}
      <div className="relative mx-4 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#0c0618 0%,#130a24 50%,#0c0618 100%)", border: "1px solid rgba(167,139,250,0.18)", minHeight: 100 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.3),transparent)", animation: "scanLine 6s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-40%", left: "35%", width: 300, height: 300, background: "radial-gradient(ellipse at center,rgba(124,58,237,0.15) 0%,transparent 65%)", animation: "heroGlow 5s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 110, opacity: 0.04, filter: "grayscale(1) brightness(3)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-4">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-bold tracking-widest" style={{ color: "#444" }}>{getGreeting().toUpperCase()}</p>
            {activeBadge && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 10, color: activeBadge.color, fontVariationSettings: "'FILL' 1" }}>{activeBadge.icon}</span>
                <span className="text-[9px] font-bold capitalize" style={{ color: activeBadge.color }}>{userBadge?.replace("_", " ")}</span>
              </div>
            )}
            {!streak.loading && (
              <div className="ml-auto">
                <StreakChip current={streak.current} atRisk={streak.atRisk} activeToday={streak.activeToday} />
              </div>
            )}
          </div>
          <p className="font-black" style={{ fontSize: "clamp(1.2rem,4vw,1.5rem)", letterSpacing: -0.5, background: "linear-gradient(135deg,#fff 0%,#c4b5fd 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {firstName} 👋
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#444" }}>What are you training today?</p>
          <div className="flex items-center gap-3 mt-3">
            <Link href="/creator"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-none cursor-pointer"
              style={{ background: "#fff", color: "#000" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add_circle</span>
              Create
            </Link>
            <Link href="/ghost"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-none cursor-pointer"
              style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, fontVariationSettings: "'FILL' 1" }}>sprint</span>
              Ghost Workout
            </Link>
          </div>
        </div>
      </div>

      {/* ── Quick Links ── */}
      <div className="px-4 mb-4">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {QUICK_LINKS.map((ql) => (
            <Link key={ql.href} href={ql.href}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-2xl no-underline"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${ql.color}18` }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: ql.color, fontVariationSettings: "'FILL' 1" }}>{ql.icon}</span>
              </div>
              <span className="text-[10px] font-semibold" style={{ color: "#666" }}>{ql.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Stories ── */}
      <StoriesStrip />

      {/* ── Featured Creators ── */}
      {featuredCreators.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between px-4 mb-2.5">
            <p className="text-xs font-black tracking-widest" style={{ color: "#333" }}>CREATORS</p>
            <Link href="/explore" className="text-xs font-semibold" style={{ color: "#444" }}>See all</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
            {featuredCreators.map((c) => {
              const init = (c.displayName || "U").charAt(0).toUpperCase();
              return (
                <Link key={c.uid} href={`/user-profile?uid=${c.uid}`}
                  className="shrink-0 flex flex-col items-center gap-1.5 no-underline">
                  {/* Initials base is always present; while a photo is downloading the
                      circle shimmers (intentional "loading" look), then the photo fades
                      in over it. Cached photos load instantly and never show the shimmer,
                      so only a brand-new creator's uncached avatar reveals gently. */}
                  <div className="relative rounded-full overflow-hidden" style={{
                    width: 48, height: 48, border: "2px solid rgba(167,139,250,0.25)",
                    background: c.photoURL ? "linear-gradient(110deg,rgba(167,139,250,0.08) 30%,rgba(167,139,250,0.2) 50%,rgba(167,139,250,0.08) 70%)" : "rgba(167,139,250,0.1)",
                    backgroundSize: "200% 100%",
                    animation: c.photoURL ? "shimmer 1.4s linear infinite" : undefined,
                  }}>
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-bold rounded-full" style={{ color: "#a78bfa" }}>
                      {init}
                    </div>
                    {c.photoURL && (
                      <img src={c.photoURL} alt="" className="absolute inset-0 w-full h-full rounded-full object-cover"
                        style={{ opacity: 0, transition: "opacity 0.3s ease" }}
                        onLoad={(e) => { e.currentTarget.style.opacity = "1"; }} />
                    )}
                  </div>
                  <span className="text-[10px] font-medium max-w-[52px] truncate text-center" style={{ color: "#666" }}>
                    {c.displayName.split(" ")[0]}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Ghost Workouts ── */}
      {featuredGhosts.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between px-4 mb-2.5">
            <p className="text-xs font-black tracking-widest" style={{ color: "#333" }}>
              <span style={{ color: "#a78bfa" }}>GHOST</span> WORKOUTS
            </p>
            <Link href="/ghost" className="text-xs font-semibold" style={{ color: "#444" }}>See all</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: "none" }}>
            {featuredGhosts.map((w) => (
              <Link key={w.id} href={`/ghost/${w.id}`}
                className="shrink-0 rounded-2xl overflow-hidden no-underline"
                style={{ width: 150, background: "linear-gradient(135deg,#0c0818,#130a24)", border: "1px solid rgba(167,139,250,0.2)" }}>
                {/* Colour strip top */}
                <div style={{ height: 3, background: "linear-gradient(90deg,#7C3AED,#a78bfa)" }} />
                <div className="p-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-2.5" style={{ background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.25)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 17, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>sprint</span>
                  </div>
                  <p className="text-xs font-bold mb-1 truncate" style={{ color: "#f2f2f2" }}>{w.title}</p>
                  <p className="text-[10px]" style={{ color: "#555" }}>
                    {w.exercises ? `${(w.exercises as unknown[]).length} exercises` : "Workout"}
                  </p>
                  {(w.sessionCount ?? 0) > 0 && (
                    <div className="flex items-center gap-1 mt-2">
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#a78bfa" }} />
                      <span className="text-[9px] font-semibold" style={{ color: "#6d51c4" }}>{w.sessionCount} trained</span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Feed label ── */}
      <div className="flex items-center gap-3 px-4 mb-4">
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
        <span className="text-[10px] font-black tracking-widest" style={{ color: "#333" }}>
          {tab === "foryou" ? "FOR YOU" : "FOLLOWING"}
        </span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)" }} />
      </div>

      {/* ── For You feed ── */}
      <div className="px-4">
        {tab === "foryou" && (
          loading ? (
            <div className="flex flex-col gap-5">{[1,2,3].map((i) => <PostCardSkeleton key={i} />)}</div>
          ) : forYouError && posts.length === 0 ? (
            <div className="ghost-bg text-center py-20 rounded-3xl">
              <span className="material-symbols-outlined" style={{ fontSize: 48, display: "block", marginBottom: 12, color: "#4a3030" }}>error_outline</span>
              <p className="text-lg font-semibold mb-1" style={{ color: "#f1f1f1" }}>Couldn&apos;t load the feed</p>
              <p className="text-sm mb-5" style={{ color: "#555" }}>Check your connection and try again.</p>
              <button onClick={() => { setLoading(true); loadForYou(); }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm border-none cursor-pointer"
                style={{ background: "rgba(255,255,255,0.08)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.12)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                Retry
              </button>
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col gap-3 py-8">
              <div className="text-center pb-4">
                <span className="material-symbols-outlined" style={{ fontSize: 40, display: "block", marginBottom: 10, color: "#333" }}>photo_camera</span>
                <p className="text-base font-semibold mb-1" style={{ color: "#f1f1f1" }}>Nothing here yet</p>
                <p className="text-sm" style={{ color: "#888" }}>Be the first to share something or explore creators.</p>
              </div>
              {[
                { href: "/creator?mode=reel", icon: "movie",      title: "Share your first Reel", sub: "A 15–30s clip is the fastest way to get seen" },
                { href: "/explore",           icon: "explore",    title: "Discover creators",     sub: "Find fitness creators to follow" },
                { href: "/invite",            icon: "group_add",  title: "Invite your friends",   sub: "Felcin's better with your crew" },
                { href: "/challenges",        icon: "link",       title: "Join a challenge",      sub: "Compete and stay accountable" },
              ].map((l) => (
                <Link key={l.href} href={l.href} className="flex items-center gap-3 px-4 py-3.5 rounded-2xl no-underline"
                  style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#555", fontVariationSettings: "'FILL' 1" }}>{l.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{l.title}</p>
                    <p className="text-xs" style={{ color: "#555" }}>{l.sub}</p>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#333" }}>chevron_right</span>
                </Link>
              ))}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-5">
                {buildFeedItems(posts.filter((p) => !blockedUids.has(p.authorId) && !blockedByUids.has(p.authorId)), activeAds).map((item, i) =>
                  "_isAd" in item
                    ? <AdCard key={`ad-${item.id}-${i}`} ad={item as Ad} />
                    : <PostCard key={(item as Post).id} post={item as Post} boostEnabled={boostEnabled} onBlock={(uid) => setBlockedUids((prev) => new Set([...prev, uid]))} />
                )}
              </div>
              <div ref={sentinelRef} className="flex justify-center py-6">
                {loadingMore && <div className="spinner" />}
              </div>
            </>
          )
        )}

        {/* ── Following feed ── */}
        {tab === "following" && (
          followingError ? (
            <div className="ghost-bg text-center py-20 rounded-3xl">
              <span className="material-symbols-outlined" style={{ fontSize: 48, display: "block", marginBottom: 12, color: "#4a3030" }}>error_outline</span>
              <p className="text-lg font-semibold mb-1" style={{ color: "#f1f1f1" }}>Couldn&apos;t load your feed</p>
              <p className="text-sm mb-5" style={{ color: "#555" }}>Something went wrong. Please try again.</p>
              <button onClick={() => { setFollowingError(false); setFollowingIds(null); }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm border-none cursor-pointer"
                style={{ background: "rgba(255,255,255,0.08)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.12)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
                Retry
              </button>
            </div>
          ) : followingLoading ? (
            <div className="flex flex-col gap-5">{[1,2,3].map((i) => <PostCardSkeleton key={i} />)}</div>
          ) : followingIds?.length === 0 ? (
            <div className="ghost-bg text-center py-20 rounded-3xl">
              <span className="material-symbols-outlined" style={{ fontSize: 48, display: "block", marginBottom: 12, color: "#2a2a2a" }}>group</span>
              <p className="text-lg font-semibold mb-1" style={{ color: "#f1f1f1" }}>Follow someone first</p>
              <p className="text-sm" style={{ color: "#555" }}>Explore creators and follow them to see their posts here.</p>
              <Link href="/explore" className="inline-flex items-center gap-2 mt-5 px-6 py-3 rounded-full font-bold text-sm no-underline"
                style={{ background: "rgba(255,255,255,0.08)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.12)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>explore</span>
                Explore
              </Link>
            </div>
          ) : followingPosts.length === 0 ? (
            <div className="ghost-bg text-center py-20 rounded-3xl">
              <span className="material-symbols-outlined" style={{ fontSize: 48, display: "block", marginBottom: 12, color: "#2a2a2a" }}>photo_camera</span>
              <p className="text-lg font-semibold mb-1" style={{ color: "#f1f1f1" }}>No posts yet</p>
              <p className="text-sm" style={{ color: "#555" }}>People you follow haven&apos;t posted yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {followingPosts.filter((p) => !blockedUids.has(p.authorId) && !blockedByUids.has(p.authorId)).map((post) => (
                <PostCard key={post.id} post={post} onBlock={(uid) => setBlockedUids((prev) => new Set([...prev, uid]))} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
