"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  collection, query, where, getDocs,
  doc, getDoc, setDoc, deleteDoc, onSnapshot, addDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

interface UserProfile {
  displayName?: string;
  username?: string;
  photoURL?: string;
  bio?: string;
  website?: string;
  followersCount?: number;
  followingCount?: number;
  badge?: string;
}
interface Post {
  id: string;
  mediaUrl?: string;
  contentType?: string;
  mimeType?: string;
  thumbnailUrl?: string;
  collabUid?: string | null;
}

function resolveMediaType(ct?: string, mime?: string, url?: string) {
  const t = ct || mime || "";
  if (t === "video" || t.startsWith("video/")) return "video";
  if (/\.(mp4|webm|mov|avi|3gp)(\?|$)/i.test(url || "")) return "video";
  return "image";
}

export default function UserProfilePage() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid") || "";
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const isSelf = user?.uid === uid;

  useEffect(() => {
    if (!uid) return;

    // Try /public/profile first; fall back to root user doc (some users only have root doc)
    getDoc(doc(db, "users", uid, "public", "profile"))
      .then((snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
          setLoading(false);
        } else {
          return getDoc(doc(db, "users", uid))
            .then((rootSnap) => {
              if (rootSnap.exists()) {
                setProfile(rootSnap.data() as UserProfile);
              } else if (user?.uid === uid) {
                setProfile({ displayName: user.displayName ?? undefined, photoURL: user.photoURL ?? undefined });
              }
              setLoading(false);
            })
            .catch(() => setLoading(false));
        }
      })
      .catch(() => setLoading(false));

    // Fetch authored posts + collab posts, merge and dedupe
    Promise.all([
      getDocs(query(collection(db, "posts"), where("authorId", "==", uid))),
      getDocs(query(collection(db, "posts"), where("collabUid", "==", uid))),
    ]).then(([authorSnap, collabSnap]) => {
      const seen = new Set<string>();
      const all: Post[] = [];
      [...authorSnap.docs, ...collabSnap.docs].forEach((d) => {
        if (!seen.has(d.id)) { seen.add(d.id); all.push({ id: d.id, ...(d.data() as Omit<Post, "id">) }); }
      });
      setPosts(all.filter((p) => p.mediaUrl).sort((a, b) => ((b as any).createdAt?.seconds ?? 0) - ((a as any).createdAt?.seconds ?? 0)));
    }).catch(() => {});

    if (user && user.uid !== uid) {
      getDoc(doc(db, "users", user.uid, "blocked", uid)).then((s) => setBlocked(s.exists()));
      const ref = doc(db, "users", uid, "followers", user.uid);
      return onSnapshot(ref, (snap) => setFollowing(snap.exists()));
    }
  }, [uid, user]);

  const toggleFollow = async () => {
    if (!user || isSelf) return;
    const ref = doc(db, "users", uid, "followers", user.uid);
    if (following) await deleteDoc(ref);
    else await setDoc(ref, { followerId: user.uid, createdAt: new Date() });
  };

  const handleBlock = async () => {
    if (!user || blocking) return;
    setBlocking(true);
    const ref = doc(db, "users", user.uid, "blocked", uid);
    if (blocked) {
      await deleteDoc(ref).catch(() => {});
      setBlocked(false);
    } else {
      await setDoc(ref, { blockedAt: serverTimestamp() }).catch(() => {});
      await addDoc(collection(db, "reports"), {
        type: "block",
        blockedUid: uid,
        blockerId: user.uid,
        createdAt: serverTimestamp(),
        status: "pending",
      }).catch(() => {});
      setBlocked(true);
    }
    setBlocking(false);
  };

  const shareProfile = () => {
    const url = `${window.location.origin}/user-profile?uid=${uid}`;
    if (navigator.share) navigator.share({ url, title: displayName }).catch(() => {});
    else navigator.clipboard?.writeText(url).catch(() => {});
  };

  const displayName = profile?.displayName || profile?.username || "User";
  const username = profile?.username ? `@${profile.username}` : "";
  const initial = displayName.charAt(0).toUpperCase();

  if (loading) return <div className="flex justify-center py-32"><div className="spinner" /></div>;
  if (!profile) return <div className="text-center py-32" style={{ color: "#555" }}>User not found</div>;

  return (
    <div className="max-w-2xl mx-auto pb-10">

      {/* ── Top bar ── */}
      <div className="sticky z-20" style={{ top: "env(safe-area-inset-top,0px)", background: "rgba(9,9,9,0.95)", backdropFilter: "blur(20px)", borderBottom: menuOpen ? "none" : "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => router.back()} className="icon-btn" style={{ width: 36, height: 36 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#f2f2f2" }}>arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base truncate" style={{ color: "#f2f2f2" }}>{displayName}</div>
            {username && <div className="text-xs" style={{ color: "#555" }}>{username}</div>}
          </div>
          <button onClick={() => setMenuOpen((v) => !v)} className="icon-btn" style={{ width: 36, height: 36 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#f2f2f2" }}>
              {menuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>

        {/* Slide-down menu */}
        {menuOpen && (
          <div className="mx-4 mb-3 rounded-2xl overflow-hidden" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
            {[
              { href: "/live", icon: "live_tv", label: "Live", sub: "Watch live streams", dot: true },
              { href: "/podcasts", icon: "podcasts", label: "Podcasts", sub: "Audio shows coming soon", dot: false },
              { href: "/reels", icon: "play_circle", label: "Reels", sub: "Short videos", dot: false },
              { href: "/stories", icon: "auto_stories", label: "Stories", sub: "24-hour stories", dot: false },
              { href: "/profile-settings", icon: "settings", label: "Settings", sub: "Edit profile & account", dot: false },
            ].map((item, i, arr) => (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors"
                style={{ borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "rgba(255,255,255,0.08)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 19, color: "#fff" }}>{item.icon}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm" style={{ color: "#f2f2f2" }}>{item.label}</span>
                    {item.dot && <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#ef4444" }} />}
                  </div>
                  <span className="text-xs" style={{ color: "#555" }}>{item.sub}</span>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: 17, color: "#333" }}>chevron_right</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Banner ── avatar sits inside using absolute, buttons row follows */}
      <div className="relative" style={{ height: 100, background: "#141414" }}>
        {/* Avatar anchored to bottom-left of banner */}
        <div className="absolute" style={{ bottom: -40, left: 16 }}>
          <div className="relative inline-block">
            <div className="rounded-full" style={{ padding: 3, background: "#090909" }}>
              {profile.photoURL ? (
                <img src={profile.photoURL} alt="" className="rounded-full object-cover block"
                  style={{ width: 76, height: 76 }} />
              ) : (
                <div className="rounded-full flex items-center justify-center text-2xl font-bold"
                  style={{ width: 76, height: 76, background: "#222", color: "#aaa" }}>
                  {initial}
                </div>
              )}
            </div>
            {profile.badge && (
              <div className="absolute left-1/2 -bottom-3 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap"
                style={{ background: "#1c1c1c", border: "1px solid rgba(255,255,255,0.15)", color: "#f2f2f2", transform: "translateX(-50%)" }}>
                {profile.badge}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row: spacer for avatar + action buttons on right ── */}
      {/* Height = 40px (avatar extends below banner) + 8px gap = 48px */}
      <div className="flex items-end justify-end gap-2 px-4" style={{ height: 52 }}>
        {isSelf ? (
          <>
            <Link href="/profile-settings"
              className="px-4 py-2 rounded-full text-sm font-semibold"
              style={{ background: "rgba(255,255,255,0.08)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.14)" }}>
              Edit Profile
            </Link>
            <button onClick={shareProfile}
              className="w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer shrink-0"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#f2f2f2" }}>ios_share</span>
            </button>
          </>
        ) : (
          <>
            <button onClick={toggleFollow}
              className="px-5 py-2 rounded-full text-sm font-semibold border-none cursor-pointer transition-all"
              style={following
                ? { background: "rgba(255,255,255,0.08)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.14)" }
                : { background: "#fff", color: "#000" }}>
              {following ? "Following" : "Follow"}
            </button>
            <Link href="/private-chats"
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#f2f2f2" }}>chat</span>
            </Link>
            <button onClick={handleBlock} disabled={blocking}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-none cursor-pointer"
              style={{ background: blocked ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.08)", border: blocked ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.14)" }}
              title={blocked ? "Unblock user" : "Block user"}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: blocked ? "#f87171" : "#f2f2f2" }}>block</span>
            </button>
          </>
        )}
      </div>

      {/* ── Profile info ── */}
      <div className="px-4 pt-2 pb-5">
        <h1 className="text-lg font-bold leading-tight" style={{ color: "#f2f2f2" }}>{displayName}</h1>
        {username && <p className="text-sm mt-0.5" style={{ color: "#555" }}>{username}</p>}
        {profile.bio ? (
          <p className="text-sm leading-relaxed mt-2" style={{ color: "#999" }}>{profile.bio}</p>
        ) : isSelf ? (
          <Link href="/profile-settings" className="text-sm mt-2 inline-block" style={{ color: "#aaa" }}>+ Add bio</Link>
        ) : null}
        {profile.website && (
          <a href={profile.website} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 mt-2 text-sm font-medium w-fit"
            style={{ color: "#aaa" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>link</span>
            {profile.website.replace(/^https?:\/\//, "")}
          </a>
        )}

        {/* Stats */}
        <div className="flex gap-7 mt-4">
          <div>
            <div className="font-bold text-base" style={{ color: "#f2f2f2" }}>{posts.length}</div>
            <div className="text-xs" style={{ color: "#555" }}>Posts</div>
          </div>
          <div>
            <div className="font-bold text-base" style={{ color: "#f2f2f2" }}>{profile.followersCount ?? 0}</div>
            <div className="text-xs" style={{ color: "#555" }}>Followers</div>
          </div>
          <div>
            <div className="font-bold text-base" style={{ color: "#f2f2f2" }}>{profile.followingCount ?? 0}</div>
            <div className="text-xs" style={{ color: "#555" }}>Following</div>
          </div>
        </div>

        {/* Dashboard + Settings pills — only for self */}
        {isSelf && (
          <div className="flex gap-2 mt-4">
            <Link href="/dashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: "#aaa", border: "1px solid rgba(255,255,255,0.09)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>bar_chart</span>
              Dashboard
            </Link>
            <Link href="/profile-settings"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: "#aaa", border: "1px solid rgba(255,255,255,0.09)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>settings</span>
              Settings
            </Link>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

      {/* ── Posts grid ── */}
      {posts.length === 0 ? (
        <div className="text-center py-20" style={{ color: "#555" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, display: "block", marginBottom: 10, color: "#222" }}>photo_camera</span>
          <p className="font-semibold mb-3" style={{ color: "#aaa" }}>No posts yet</p>
          {isSelf && (
            <Link href="/creator"
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-white"
              style={{ background: "#fff", color: "#000" }}>
              Create first post
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3" style={{ gap: 2 }}>
          {posts.map((p) => {
            const type = resolveMediaType(p.contentType, p.mimeType, p.mediaUrl);
            return (
              <Link key={p.id} href={`/comments?postId=${p.id}`}
                className="relative block" style={{ aspectRatio: "1", overflow: "hidden", background: "#0f0f0f" }}>
                {type === "video" ? (
                  p.thumbnailUrl
                    ? <img src={p.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    : <div className="w-full h-full flex items-center justify-center" style={{ background: "#111" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#333" }}>play_circle</span>
                      </div>
                ) : (
                  <img src={p.mediaUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                )}
                {type === "video" && (
                  <span className="material-symbols-outlined absolute top-2 right-2 text-white"
                    style={{ fontSize: 15, opacity: 0.9, fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
