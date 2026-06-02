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
  const [blocked, setBlocked] = useState(false);
  const [blockedByThem, setBlockedByThem] = useState(false);
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
      getDoc(doc(db, "users", user.uid, "blockedBy", uid)).then((s) => setBlockedByThem(s.exists()));
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
    const myBlockRef = doc(db, "users", user.uid, "blocked", uid);
    const theirBlockedByRef = doc(db, "users", uid, "blockedBy", user.uid);
    if (blocked) {
      await Promise.all([
        deleteDoc(myBlockRef),
        deleteDoc(theirBlockedByRef),
      ]).catch(() => {});
      setBlocked(false);
    } else {
      await Promise.all([
        setDoc(myBlockRef, { blockedAt: serverTimestamp() }),
        setDoc(theirBlockedByRef, { blockedAt: serverTimestamp() }),
      ]).catch(() => {});
      await addDoc(collection(db, "reports"), {
        type: "block", blockedUid: uid, blockerId: user.uid,
        createdAt: serverTimestamp(), status: "pending",
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

  // This account has blocked the viewer — show a minimal wall
  if (blockedByThem && !isSelf) return (
    <div className="max-w-2xl mx-auto pb-10">
      <div className="sticky z-20 flex items-center gap-3 px-4 py-3"
        style={{ top: "env(safe-area-inset-top,0px)", background: "rgba(9,9,9,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => router.back()} className="icon-btn" style={{ width: 36, height: 36 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#f2f2f2" }}>arrow_back</span>
        </button>
        <div className="font-bold text-base truncate" style={{ color: "#f2f2f2" }}>{displayName}</div>
      </div>
      <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#333" }}>lock</span>
        </div>
        <p className="font-semibold mb-2" style={{ color: "#f2f2f2" }}>This account is not available</p>
        <p className="text-sm" style={{ color: "#555" }}>You can&apos;t view this profile.</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto pb-10">

      {/* ── Top bar ── */}
      <div className="sticky z-20" style={{ top: "env(safe-area-inset-top,0px)", background: "rgba(9,9,9,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => router.back()} className="icon-btn" style={{ width: 36, height: 36 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#f2f2f2" }}>arrow_back</span>
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base truncate" style={{ color: "#f2f2f2" }}>{displayName}</div>
            {username && <div className="text-xs" style={{ color: "#555" }}>{username}</div>}
          </div>
        </div>
      </div>

      {/* ── Banner ── */}
      <div className="relative" style={{ height: 140, background: "linear-gradient(135deg, #1a1035 0%, #0d1f3c 50%, #111 100%)" }}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 30% 60%, rgba(167,139,250,0.18) 0%, transparent 65%)" }} />
        {/* Avatar anchored to bottom-left */}
        <div className="absolute" style={{ bottom: -52, left: 16 }}>
          <div className="relative inline-block">
            <div className="rounded-full" style={{ padding: 3, background: "#090909" }}>
              {profile.photoURL ? (
                <img src={profile.photoURL} alt="" className="rounded-full object-cover block"
                  style={{ width: 88, height: 88 }} />
              ) : (
                <div className="rounded-full flex items-center justify-center text-3xl font-bold"
                  style={{ width: 88, height: 88, background: "linear-gradient(135deg,#2a2a3e,#1a1a2e)", color: "#888" }}>
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

      {/* ── Row: avatar spacer + stats + action buttons ── */}
      <div className="flex items-center px-4 gap-3" style={{ height: 80 }}>
        <div style={{ width: 108, flexShrink: 0 }} />
        <div className="flex gap-6 flex-1">
          <div className="text-center">
            <div className="font-bold text-base" style={{ color: "#f2f2f2" }}>{posts.length}</div>
            <div className="text-xs" style={{ color: "#555" }}>Posts</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-base" style={{ color: "#f2f2f2" }}>{(profile.followersCount ?? 0).toLocaleString()}</div>
            <div className="text-xs" style={{ color: "#555" }}>Followers</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-base" style={{ color: "#f2f2f2" }}>{(profile.followingCount ?? 0).toLocaleString()}</div>
            <div className="text-xs" style={{ color: "#555" }}>Following</div>
          </div>
        </div>
        {!isSelf && (
          <div className="flex items-center gap-2">
            <button onClick={toggleFollow}
              className="px-5 py-2 rounded-full text-sm font-semibold border-none cursor-pointer transition-all"
              style={following
                ? { background: "rgba(255,255,255,0.08)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.14)" }
                : { background: "#fff", color: "#000" }}>
              {following ? "Following" : "Follow"}
            </button>
            <Link href={`/subscribe/${uid}`}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}
              title="Subscribe">
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#f2f2f2" }}>star</span>
            </Link>
            <Link href={`/private-chats?uid=${uid}`}
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
          </div>
        )}
      </div>

      {/* ── Profile completion banner (own profile only) ── */}
      {isSelf && (() => {
        const missing = [];
        if (!profile.photoURL) missing.push("photo");
        if (!profile.bio) missing.push("bio");
        if (posts.length === 0) missing.push("first post");
        if (missing.length === 0) return null;
        const pct = Math.round(((3 - missing.length) / 3) * 100);
        return (
          <div className="mx-4 mt-3 mb-1 p-4 rounded-2xl" style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold" style={{ color: "#f2f2f2" }}>Complete your profile</span>
              <span className="text-xs font-bold" style={{ color: "#555" }}>{pct}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full mb-3" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "#fff" }} />
            </div>
            <div className="flex flex-wrap gap-2">
              {missing.map((m) => (
                <Link key={m} href="/profile-settings"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold no-underline"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#888", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add</span>
                  Add {m}
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Profile info ── */}
      <div className="px-4 pt-1 pb-5">
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

        {/* Edit Profile + Share Profile — only for self */}
        {isSelf && (
          <div className="flex gap-2 mt-4">
            <Link href="/profile-settings"
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.09)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
              Edit Profile
            </Link>
            <button onClick={shareProfile}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
              style={{ background: "rgba(255,255,255,0.06)", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.09)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>ios_share</span>
              Share Profile
            </button>
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
