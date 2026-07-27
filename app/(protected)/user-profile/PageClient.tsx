"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  collection, query, where, getDocs,
  doc, getDoc, setDoc, deleteDoc, onSnapshot, addDoc, serverTimestamp, updateDoc, increment,
} from "@/lib/db";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { sendNotification } from "@/lib/notify";
import Link from "next/link";
import InAppPaymentModal from "@/components/InAppPaymentModal";

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
  isStory?: boolean;
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
  const [tipModal, setTipModal] = useState(false);
  const [tipping, setTipping] = useState(false);
  const [tipAmount, setTipAmount] = useState(500);
  const [appStoreCountdown, setAppStoreCountdown] = useState<number | null>(null);

  /* iOS smart redirect — if page still visible after 1.5s, user doesn't have the app → send to App Store */
  useEffect(() => {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isLoggedIn = !!user;
    if (!isIOS || isLoggedIn) return; // logged-in users are already using the app
    let count = 3;
    setAppStoreCountdown(count);
    const tick = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(tick);
        if (!document.hidden) window.location.replace("https://apps.apple.com/app/id6763660775");
      } else {
        setAppStoreCountdown(count);
      }
    }, 1000);
    const onHide = () => { if (document.hidden) { clearInterval(tick); setAppStoreCountdown(null); } };
    document.addEventListener("visibilitychange", onHide);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", onHide); };
  }, [user]);
  const [tipPayment, setTipPayment] = useState<{ clientSecret: string; amount: number } | null>(null);
  const [supportModal, setSupportModal] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const isSelf = user?.uid === uid;

  const sendTip = async () => {
    if (!user || tipping || !profile) return;
    setTipping(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/tip-payment-intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ creatorUid: uid, creatorName: profile.displayName || "Creator", amountCents: tipAmount, token }) });
      const data = await res.json();
      if (data.clientSecret) { setTipModal(false); setTipPayment({ clientSecret: data.clientSecret, amount: tipAmount }); }
    } catch {}
    setTipping(false);
  };

  // Handle tip session return
  useEffect(() => {
    const tipSessionId = searchParams.get("tip_session_id");
    if (!tipSessionId) return;
    fetch(`/api/tip-verify?session_id=${tipSessionId}`).catch(() => {});
  }, [searchParams]);

  useEffect(() => {
    if (!uid) return;
    setProfile(null);
    setLoading(true);
    setPosts([]);
    setFollowing(false);
    setBlocked(false);
    setBlockedByThem(false);

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
      setPosts(all.filter((p) => p.mediaUrl && !p.isStory).sort((a, b) => ((b as any).createdAt?.seconds ?? 0) - ((a as any).createdAt?.seconds ?? 0)));
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
    if (following) {
      await deleteDoc(ref);
      updateDoc(doc(db, "users", uid), { followersCount: increment(-1) }).catch(() => {});
    } else {
      await setDoc(ref, { followerId: user.uid, createdAt: new Date() });
      updateDoc(doc(db, "users", uid), { followersCount: increment(1) }).catch(() => {});
      addDoc(collection(db, "notifications"), {
        recipientId: uid,
        senderId: user.uid,
        senderName: user.displayName || "Someone",
        senderPhoto: user.photoURL || "",
        type: "follow",
        read: false,
        createdAt: serverTimestamp(),
      }).catch(() => {});
      sendNotification({ recipientUid: uid, type: "follow", senderName: user.displayName || "Someone", senderId: user.uid });
    }
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

  const appStoreBanner = appStoreCountdown !== null && (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3"
      style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
      <div className="flex items-center gap-3">
        <img src="/logo512.png" alt="" className="rounded-xl" style={{ width: 36, height: 36 }} />
        <div>
          <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>Get the Felcin app</p>
          <p className="text-xs" style={{ color: "#555" }}>Opening App Store in {appStoreCountdown}…</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => setAppStoreCountdown(null)}
          className="text-xs border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>
          Stay
        </button>
        <a href="https://apps.apple.com/app/id6763660775"
          className="px-3 py-1.5 rounded-full text-xs font-bold no-underline"
          style={{ background: "#a78bfa", color: "#000" }}>
          Download
        </a>
      </div>
    </div>
  );

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
      {appStoreBanner}

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
      <div className="relative" style={{ height: 180, background: "linear-gradient(135deg, #0d0618 0%, #110828 40%, #0a1020 70%, #080810 100%)" }}>
        {/* Scan line — clipped inside banner, avatar lives outside via z-index */}
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.3),transparent)", animation: "scanLine 6s linear infinite", zIndex: 1 }} />
        {/* Radial spotlight */}
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "30%", transform: "translateX(-50%)", width: 420, height: 420, background: "radial-gradient(ellipse at center,rgba(124,58,237,0.3) 0%,rgba(80,0,180,0.1) 40%,transparent 68%)", animation: "heroGlow 5s ease-in-out infinite" }} />
        {/* Ghost watermark */}
        <div className="absolute inset-0 flex items-center justify-end pr-6 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 140, opacity: 0.055, filter: "grayscale(1) brightness(3)", animation: "floatLogo 9s ease-in-out infinite" }} />
        </div>
        {/* Avatar anchored to bottom-left */}
        <div className="absolute" style={{ bottom: -52, left: 16 }}>
          <div className="relative inline-block">
            <div className="rounded-full" style={{ padding: 4, background: "linear-gradient(135deg,#e9d5ff,#a78bfa,#7C3AED)", boxShadow: "0 0 40px rgba(124,58,237,0.7), 0 0 80px rgba(124,58,237,0.3)" }}>
              {profile.photoURL ? (
                <img src={profile.photoURL} alt="" className="rounded-full object-cover block"
                  style={{ width: 88, height: 88, border: "3px solid #090909" }} />
              ) : (
                <div className="rounded-full flex items-center justify-center text-3xl font-bold"
                  style={{ width: 88, height: 88, background: "linear-gradient(135deg,#3b2065,#1e1050)", color: "#e9d5ff", border: "3px solid #090909" }}>
                  {initial}
                </div>
              )}
            </div>
            {profile.badge && (() => {
              const BADGE_META: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
                verified:      { icon: "verified",            label: "Verified",      color: "#60a5fa", bg: "rgba(29,78,216,0.18)",   border: "rgba(96,165,250,0.4)" },
                creator:       { icon: "draw",                label: "Creator",       color: "#34d399", bg: "rgba(5,150,105,0.18)",   border: "rgba(52,211,153,0.4)" },
                fitness_coach: { icon: "fitness_center",      label: "Fitness Coach", color: "#22d3ee", bg: "rgba(8,145,178,0.18)",   border: "rgba(34,211,238,0.4)" },
                pro:           { icon: "workspace_premium",   label: "Pro Creator",   color: "#a78bfa", bg: "rgba(124,58,237,0.18)",  border: "rgba(167,139,250,0.4)" },
                athlete:       { icon: "sports",              label: "Athlete",       color: "#f87171", bg: "rgba(220,38,38,0.18)",   border: "rgba(248,113,113,0.4)" },
                star:          { icon: "star",                label: "Star Creator",  color: "#fbbf24", bg: "rgba(217,119,6,0.18)",   border: "rgba(251,191,36,0.4)" },
                brand:         { icon: "business",            label: "Brand",         color: "#94a3b8", bg: "rgba(71,85,105,0.18)",   border: "rgba(148,163,184,0.4)" },
                elite:         { icon: "diamond",             label: "Elite",         color: "#f472b6", bg: "rgba(190,24,93,0.18)",   border: "rgba(244,114,182,0.4)" },
              };
              const m = BADGE_META[profile.badge] ?? { icon: "workspace_premium", label: profile.badge, color: "#f2f2f2", bg: "rgba(255,255,255,0.1)", border: "rgba(255,255,255,0.25)" };
              return (
                <div className="absolute left-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap"
                  style={{ bottom: -20, background: m.bg, border: `1px solid ${m.border}`, color: m.color, transform: "translateX(-50%)", zIndex: 10, backdropFilter: "blur(6px)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 11, fontVariationSettings: "'FILL' 1" }}>{m.icon}</span>
                  {m.label}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── Row: avatar spacer + stats ── */}
      <div className="flex items-center px-4 gap-3" style={{ paddingTop: 12, paddingBottom: 8 }}>
        <div style={{ width: 108, flexShrink: 0 }} />
        <div className="flex gap-6 flex-1">
          <div className="text-center">
            <div className="font-black text-xl" style={{ color: "#f2f2f2" }}>{posts.length}</div>
            <div className="text-xs font-medium" style={{ color: "#555" }}>Posts</div>
          </div>
          <div className="text-center">
            <div className="font-black text-xl" style={{ color: "#a78bfa" }}>{(typeof profile.followersCount === "number" ? profile.followersCount : 0).toLocaleString()}</div>
            <div className="text-xs font-medium" style={{ color: "#555" }}>Followers</div>
          </div>
          <div className="text-center">
            <div className="font-black text-xl" style={{ color: "#06b6d4" }}>{(typeof profile.followingCount === "number" ? profile.followingCount : 0).toLocaleString()}</div>
            <div className="text-xs font-medium" style={{ color: "#555" }}>Following</div>
          </div>
        </div>
      </div>

      {/* ── Action buttons row (other users only) ── */}
      {!isSelf && (
        <div className="flex items-center gap-2 px-4 pb-3">
          <button onClick={toggleFollow}
            className="flex-1 py-2 rounded-full text-sm font-bold border-none cursor-pointer transition-all"
            style={following
              ? { background: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)" }
              : { background: "linear-gradient(135deg,#7C3AED,#a855f7)", color: "#fff", boxShadow: "0 0 18px rgba(124,58,237,0.35)" }}>
            {following ? "✓ Following" : "Follow"}
          </button>
          <button onClick={() => setSupportModal(true)}
            className="btn-glass flex-1 py-2 rounded-full text-sm font-semibold border-none cursor-pointer"
            style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}>
            Support
          </button>
          <Link href={`/private-chats?uid=${uid}`}
            className="btn-glass w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#f2f2f2" }}>chat</span>
          </Link>
          <button onClick={handleBlock} disabled={blocking}
            className="btn-glass w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-none cursor-pointer"
            style={{ background: blocked ? "rgba(239,68,68,0.12)" : undefined, border: blocked ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.12)" }}
            title={blocked ? "Unblock user" : "Block user"}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: blocked ? "#f87171" : "#888" }}>block</span>
          </button>
        </div>
      )}

      {/* Support modal */}
      {supportModal && (
        <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 9999, background: "rgba(0,0,0,0.6)" }} onClick={() => setSupportModal(false)}>
          <div className="w-full max-w-sm rounded-t-3xl overflow-y-auto" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "85dvh", marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)", padding: "24px 24px 28px" }} onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }} />
            <h3 className="text-lg font-bold mb-1" style={{ color: "#f2f2f2" }}>Support {profile?.displayName || "this creator"}</h3>
            <p className="text-sm mb-5" style={{ color: "#555" }}>Choose how you'd like to support</p>

            {/* Monetization lock notice */}
            {(typeof profile?.followersCount === "number" ? profile.followersCount : 0) < 10_000 && (
              <div className="flex items-center gap-3 p-3 rounded-2xl mb-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#555", fontVariationSettings: "'FILL' 1" }}>lock</span>
                <p className="text-xs" style={{ color: "#555" }}>
                  Monetization unlocks at 10K followers · {(typeof profile?.followersCount === "number" ? profile.followersCount : 0).toLocaleString()} / 10,000
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {/* Subscribe */}
              {(typeof profile?.followersCount === "number" ? profile.followersCount : 0) >= 10_000 ? (
                <Link href={`/subscribe/${uid}`} onClick={() => setSupportModal(false)}
                  className="flex items-center gap-4 p-4 rounded-2xl no-underline"
                  style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(167,139,250,0.15)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>star</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm" style={{ color: "#f2f2f2" }}>Subscribe</p>
                    <p className="text-xs" style={{ color: "#666" }}>Get exclusive content &amp; support monthly</p>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#444" }}>chevron_right</span>
                </Link>
              ) : (
                <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", opacity: 0.45 }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(167,139,250,0.08)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#555", fontVariationSettings: "'FILL' 1" }}>star</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm" style={{ color: "#555" }}>Subscribe</p>
                    <p className="text-xs" style={{ color: "#444" }}>Requires 10K followers</p>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#333" }}>lock</span>
                </div>
              )}

              {/* Tip */}
              {(typeof profile?.followersCount === "number" ? profile.followersCount : 0) >= 10_000 ? (
                <button onClick={() => { setSupportModal(false); setTipModal(true); }}
                  className="flex items-center gap-4 p-4 rounded-2xl border-none cursor-pointer text-left"
                  style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(251,191,36,0.15)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#fbbf24", fontVariationSettings: "'FILL' 1" }}>payments</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm" style={{ color: "#f2f2f2" }}>Send a tip</p>
                    <p className="text-xs" style={{ color: "#666" }}>One-time payment — any amount you choose</p>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#444" }}>chevron_right</span>
                </button>
              ) : (
                <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", opacity: 0.45 }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(251,191,36,0.08)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#555", fontVariationSettings: "'FILL' 1" }}>payments</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm" style={{ color: "#555" }}>Send a tip</p>
                    <p className="text-xs" style={{ color: "#444" }}>Requires 10K followers</p>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#333" }}>lock</span>
                </div>
              )}

              {/* Badges */}
              <Link href="/badges" onClick={() => setSupportModal(false)}
                className="flex items-center gap-4 p-4 rounded-2xl no-underline"
                style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(52,211,153,0.15)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#34d399", fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm" style={{ color: "#f2f2f2" }}>Get a badge</p>
                  <p className="text-xs" style={{ color: "#666" }}>Show your support with a creator badge</p>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#444" }}>chevron_right</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Tip modal */}
      {tipModal && (
        <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 9999, background: "rgba(0,0,0,0.6)" }} onClick={() => setTipModal(false)}>
          <div className="w-full max-w-sm rounded-t-3xl overflow-y-auto" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "85dvh", marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)", padding: "24px 24px 28px" }} onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }} />
            <h3 className="text-lg font-bold mb-1" style={{ color: "#f2f2f2" }}>Send a tip</h3>
            <p className="text-sm mb-5" style={{ color: "#555" }}>Support {profile?.displayName || "this creator"}</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[100, 300, 500, 1000, 2000, 5000, 10000, 0].map((amt) => (
                <button key={amt} onClick={() => amt > 0 && setTipAmount(amt)}
                  className="py-2.5 rounded-2xl text-sm font-bold border-none cursor-pointer"
                  style={{ background: tipAmount === amt && amt > 0 ? "#fbbf24" : "rgba(255,255,255,0.07)", color: tipAmount === amt && amt > 0 ? "#000" : "#f2f2f2" }}>
                  {amt === 0 ? "Other" : `$${(amt / 100).toFixed(0)}`}
                </button>
              ))}
            </div>
            <input type="number" placeholder="Custom amount ($)" min={1} max={1000}
              onChange={(e) => setTipAmount(Math.round(parseFloat(e.target.value || "0") * 100))}
              className="w-full px-4 py-3 rounded-2xl outline-none text-sm mb-4"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
            <button onClick={sendTip} disabled={tipping || tipAmount < 100}
              className="w-full py-3.5 rounded-2xl font-bold text-sm border-none cursor-pointer"
              style={{ background: tipAmount >= 100 ? "#fbbf24" : "rgba(255,255,255,0.08)", color: tipAmount >= 100 ? "#000" : "#444" }}>
              {tipping ? "Opening checkout…" : `Send $${(tipAmount / 100).toFixed(2)} tip`}
            </button>
          </div>
        </div>
      )}

      {/* ── Profile completion banner (own profile only) ── */}
      {isSelf && (() => {
        const missing = [];
        if (!profile.photoURL) missing.push("photo");
        if (!profile.bio) missing.push("bio");
        if (posts.length === 0) missing.push("first post");
        if (missing.length === 0) return null;
        const pct = Math.round(((3 - missing.length) / 3) * 100);
        return (
          <div className="mx-4 mt-3 mb-1 p-4 rounded-2xl relative overflow-hidden" style={{ background: "linear-gradient(135deg,#0d0618,#131313)", border: "1px solid rgba(167,139,250,0.18)" }}>
            <div className="absolute inset-0 pointer-events-none flex items-center justify-end pr-3">
              <img src="/static/logo-nav.svg" alt="" style={{ width: 60, opacity: 0.05, filter: "grayscale(1) brightness(3)" }} />
            </div>
            <div className="flex items-center justify-between mb-2 relative">
              <span className="text-xs font-bold" style={{ color: "#f2f2f2" }}>Complete your profile</span>
              <span className="text-xs font-bold" style={{ color: "#a78bfa" }}>{pct}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full mb-3 relative" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#7C3AED,#a78bfa)" }} />
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
              className="btn-glass flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold"
              style={{ color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.1)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
              Edit Profile
            </Link>
            <button onClick={shareProfile}
              className="btn-glass flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
              style={{ color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.1)" }}>
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
        <div className="ghost-bg text-center py-20 mx-4 rounded-3xl mt-4" style={{ color: "#555" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, display: "block", marginBottom: 10, color: "#2a2a2a" }}>photo_camera</span>
          <p className="font-semibold mb-3" style={{ color: "#aaa" }}>No posts yet</p>
          {isSelf && (
            <Link href="/creator"
              className="px-5 py-2.5 rounded-full text-sm font-bold"
              style={{ background: "linear-gradient(135deg,#7C3AED,#a78bfa)", color: "#fff", boxShadow: "0 0 18px rgba(124,58,237,0.3)" }}>
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
                    : <video
                        src={p.mediaUrl ? `${p.mediaUrl}#t=0.5` : undefined}
                        preload="metadata"
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                        style={{ pointerEvents: "none" }}
                      />
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

      {tipPayment && (
        <InAppPaymentModal
          clientSecret={tipPayment.clientSecret}
          title={`Send $${(tipPayment.amount / 100).toFixed(2)} tip`}
          subtitle={`Supporting ${profile?.displayName || "this creator"} · Secured by Stripe`}
          buttonLabel={`Send $${(tipPayment.amount / 100).toFixed(2)} tip`}
          onClose={() => setTipPayment(null)}
          onSuccess={() => { setTipPayment(null); }}
        />
      )}
    </div>
  );
}

