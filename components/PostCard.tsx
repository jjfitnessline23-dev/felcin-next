"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  doc, updateDoc, increment, arrayUnion, arrayRemove,
  getDoc, setDoc, deleteDoc, serverTimestamp, addDoc, collection,
  getDocs, query, orderBy, limit,
} from "firebase/firestore";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

interface Post {
  id: string;
  authorId: string;
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
  maxViews?: number | null;
  viewCount?: number;
  collabUid?: string | null;
  collabName?: string | null;
  collabPhoto?: string | null;
  repostCount?: number;
  isRepost?: boolean;
  repostOf?: string | null;
  repostOriginalAuthorName?: string | null;
  ppvPrice?: number | null;
}

function resolveMediaType(contentType?: string, mimeType?: string, url?: string): "video" | "image" {
  const t = contentType || mimeType || "";
  if (t === "video" || t.startsWith("video/")) return "video";
  if (/\.(mp4|webm|mov|avi|3gp)(\?|$)/i.test(url || "")) return "video";
  return "image";
}

function timeAgo(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  return Math.floor(diff / 86400) + "d";
}

export default function PostCard({ post, onBlock, boostEnabled = true }: { post: Post; onBlock?: (uid: string) => void; boostEnabled?: boolean }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(post.likedBy?.includes(user?.uid || "") ?? false);
  const [likeCount, setLikeCount] = useState(post.likes ?? 0);
  const [imgBroken, setImgBroken] = useState(false);
  const [videoPaused, setVideoPaused] = useState(false);
  const [videoMuted, setVideoMuted] = useState(true);
  const [liking, setLiking] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [dotMenu, setDotMenu] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgLightbox, setImgLightbox] = useState(false);
  const [videoLightbox, setVideoLightbox] = useState(false);
  const [ppvUnlocked, setPpvUnlocked] = useState(false);
  const [ppvBuying, setPpvBuying] = useState(false);

  const isLocked = !ppvUnlocked && !!post.ppvPrice && post.authorId !== user?.uid;

  const buyPPV = async () => {
    if (!user || ppvBuying || !post.ppvPrice) return;
    setPpvBuying(true);
    try {
      const token = await user.getIdToken();
      const col = post.contentType === "reel" ? "reels" : "posts";
      const res = await fetch("/api/ppv-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: post.id, postCol: col, authorId: post.authorId, authorName: post.authorName, priceCents: post.ppvPrice, caption: post.caption, token }) });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {}
    setPpvBuying(false);
  };
  interface LbComment { id: string; authorName: string; authorPhoto: string; text: string; }
  const [lbComments, setLbComments] = useState<LbComment[]>([]);
  const [lbText, setLbText] = useState("");
  const [lbSending, setLbSending] = useState(false);
  const lbVideoRef = useRef<HTMLVideoElement>(null);
  const [reposted, setReposted] = useState(false);
  const [repostCount, setRepostCount] = useState(post.repostCount ?? 0);
  const [reposting, setReposting] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [boosting, setBoosting] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const isOwner = user && OWNER_UIDS.includes(user.uid);
  const canDelete = user && (user.uid === post.authorId || isOwner);

  const handleDownload = async () => {
    if (!post.mediaUrl) return;
    setDotMenu(false);
    try {
      const res = await fetch(post.mediaUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ext = resolveMediaType(post.contentType, post.mimeType, post.mediaUrl) === "video" ? "mp4" : "jpg";
      a.href = url;
      a.download = `felcin-${post.id}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(post.mediaUrl, "_blank");
    }
  };

  useEffect(() => {
    setLiked(post.likedBy?.includes(user?.uid || "") ?? false);
    setLikeCount(post.likes ?? 0);
  }, [post.likedBy, post.likes, user?.uid]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid, "bookmarks", post.id)).then((snap) => setBookmarked(snap.exists()));
  }, [user, post.id]);

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !post.mediaUrl) return;
    v.muted = true;
    v.setAttribute("muted", "");

    // Start loading when video is 200px away from viewport, play when 50% visible
    const loadObs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (v.preload === "none") v.preload = "auto";
        } else {
          v.preload = "none";
        }
      },
      { rootMargin: "200px", threshold: 0 }
    );

    const playObs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          v.play().catch(() => {});
        } else {
          v.pause();
          v.currentTime = 0;
        }
      },
      { threshold: 0.5 }
    );

    loadObs.observe(v);
    playObs.observe(v);
    return () => { loadObs.disconnect(); playObs.disconnect(); v.pause(); };
  }, [post.mediaUrl]);

  const mediaType = resolveMediaType(post.contentType, post.mimeType, post.mediaUrl);
  const caption = post.caption || post.text || "";
  const displayName = post.authorName || "User";
  const initial = displayName.charAt(0).toUpperCase();
  const timeStr = post.createdAt?.seconds ? timeAgo(post.createdAt.seconds) : "";
  const viewsLeft = post.maxViews != null ? post.maxViews - (post.viewCount ?? 0) : null;

  const openLightbox = (isVid: boolean) => {
    if (isVid) setVideoLightbox(true); else setImgLightbox(true);
    const col = post.contentType === "reel" ? "reels" : "posts";
    getDocs(query(collection(db, col, post.id, "comments"), orderBy("createdAt", "asc"), limit(50)))
      .then((snap) => setLbComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LbComment, "id">) }))))
      .catch(() => {});
  };

  const sendLbComment = async () => {
    if (!lbText.trim() || !user || lbSending) return;
    setLbSending(true);
    const t = lbText.trim(); setLbText("");
    const col = post.contentType === "reel" ? "reels" : "posts";
    try {
      const ref = await addDoc(collection(db, col, post.id, "comments"), {
        authorId: user.uid, authorName: user.displayName || "User",
        authorPhoto: user.photoURL || "", text: t, createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, col, post.id), { comments: increment(1) });
      setLbComments((prev) => [...prev, { id: ref.id, authorName: user.displayName || "User", authorPhoto: user.photoURL || "", text: t }]);
      if (post.authorId && post.authorId !== user.uid) {
        addDoc(collection(db, "notifications"), { recipientId: post.authorId, senderId: user.uid, senderName: user.displayName || "Someone", senderPhoto: user.photoURL || "", type: "comment", postId: post.id, read: false, createdAt: serverTimestamp() }).catch(() => {});
      }
    } catch {}
    setLbSending(false);
  };

  const handleLike = async () => {
    if (!user || liking) return;
    setLiking(true);
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => c + (newLiked ? 1 : -1));
    try {
      await updateDoc(doc(db, "posts", post.id), {
        likes: increment(newLiked ? 1 : -1),
        likedBy: newLiked ? arrayUnion(user.uid) : arrayRemove(user.uid),
      });
      if (newLiked && post.authorId && post.authorId !== user.uid) {
        addDoc(collection(db, "notifications"), {
          recipientId: post.authorId,
          senderId: user.uid,
          senderName: user.displayName || "Someone",
          senderPhoto: user.photoURL || "",
          type: "like",
          postId: post.id,
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {});
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientUid: post.authorId, type: "like", senderName: user.displayName || "Someone", postId: post.id }),
        }).catch(() => {});
      }
    } catch {
      setLiked(!newLiked);
      setLikeCount((c) => c + (newLiked ? -1 : 1));
    }
    setLiking(false);
  };

  const handleBookmark = async () => {
    if (!user || bookmarking) return;
    setBookmarking(true);
    const ref = doc(db, "users", user.uid, "bookmarks", post.id);
    const newBookmarked = !bookmarked;
    setBookmarked(newBookmarked);
    try {
      if (newBookmarked) await setDoc(ref, { savedAt: serverTimestamp(), postId: post.id });
      else await deleteDoc(ref);
    } catch { setBookmarked(!newBookmarked); }
    setBookmarking(false);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/comments?postId=${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: caption || "Check this out on Felcin", url });
        return;
      }
    } catch {}
    try { await navigator.clipboard.writeText(url); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/comments?postId=${post.id}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setDotMenu(false);
  };

  const handleReport = async (reason: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "reports"), {
        type: "post",
        postId: post.id,
        authorId: post.authorId,
        reporterId: user.uid,
        reason,
        createdAt: serverTimestamp(),
        status: "pending",
      });
    } catch {}
    setReportDone(true);
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    if (!confirm("Delete this post?")) return;
    setDotMenu(false);
    await deleteDoc(doc(db, "posts", post.id)).catch(() => {});
    setDeleted(true);
  };

  const handleRepost = async () => {
    if (!user || reposting || reposted || post.isRepost) return;
    setReposting(true);
    try {
      await addDoc(collection(db, "posts"), {
        authorId: user.uid,
        authorName: user.displayName || "User",
        authorPhoto: user.photoURL || null,
        isRepost: true,
        repostOf: post.id,
        repostOriginalAuthorId: post.authorId,
        repostOriginalAuthorName: post.authorName || "User",
        mediaUrl: post.mediaUrl || null,
        caption: post.caption || post.text || null,
        contentType: post.contentType || null,
        createdAt: serverTimestamp(),
        likes: 0, comments: 0,
      });
      await updateDoc(doc(db, "posts", post.id), { repostCount: increment(1) });
      setReposted(true);
      setRepostCount((c) => c + 1);
      if (post.authorId !== user.uid) {
        fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientUid: post.authorId, type: "repost", senderName: user.displayName || "Someone", postId: post.id }) }).catch(() => {});
      }
    } catch {}
    setReposting(false);
  };

  const handleBoost = async (tier: string) => {
    if (!user || boosting) return;
    setBoosting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/boost-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, tier, token }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {}
    setBoosting(false);
  };

  const handleBlock = async () => {
    if (!user || user.uid === post.authorId) return;
    setDotMenu(false);
    await Promise.all([
      setDoc(doc(db, "users", user.uid, "blocked", post.authorId), { blockedAt: serverTimestamp() }),
      setDoc(doc(db, "users", post.authorId, "blockedBy", user.uid), { blockedAt: serverTimestamp() }),
    ]).catch(() => {});
    await addDoc(collection(db, "reports"), {
      type: "block",
      blockedUid: post.authorId,
      blockerId: user.uid,
      postId: post.id,
      createdAt: serverTimestamp(),
      status: "pending",
    }).catch(() => {});
    onBlock?.(post.authorId);
    setDeleted(true);
  };

  if (deleted) return null;

  return (
    <>
    {/* Copied toast */}
    {copied && mounted && createPortal(
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-full text-sm font-semibold pointer-events-none"
        style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}>
        Link copied
      </div>,
      document.body
    )}
    <article style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, overflow: "hidden" }}>
      {/* Repost header */}
      {post.isRepost && (
        <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-0">
          <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#555" }}>repeat</span>
          <span className="text-xs" style={{ color: "#555" }}>
            {post.authorName || "Someone"} reposted
          </span>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Primary author */}
          <Link href={`/user-profile?uid=${post.authorId}`} className="flex items-center gap-2 min-w-0">
            {post.authorPhoto ? (
              <img src={post.authorPhoto} alt="" className="rounded-full object-cover shrink-0" style={{ width: 36, height: 36 }} />
            ) : (
              <div className="rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                style={{ width: 36, height: 36, background: "#222", color: "#aaa" }}>
                {initial}
              </div>
            )}
          </Link>

          {/* Collab indicator */}
          {post.collabUid && (
            <>
              <span className="text-xs font-bold shrink-0" style={{ color: "#555" }}>×</span>
              <Link href={`/user-profile?uid=${post.collabUid}`} className="flex items-center shrink-0">
                {post.collabPhoto ? (
                  <img src={post.collabPhoto} alt="" className="rounded-full object-cover" style={{ width: 36, height: 36 }} />
                ) : (
                  <div className="rounded-full flex items-center justify-center font-bold text-sm"
                    style={{ width: 36, height: 36, background: "#222", color: "#aaa" }}>
                    {(post.collabName || "C").charAt(0).toUpperCase()}
                  </div>
                )}
              </Link>
            </>
          )}

          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm truncate" style={{ color: "#f2f2f2" }}>
              {post.collabUid
                ? <><Link href={`/user-profile?uid=${post.authorId}`}>{displayName}</Link><span style={{ color: "#555" }}> × </span><Link href={`/user-profile?uid=${post.collabUid}`}>{post.collabName || "Collaborator"}</Link></>
                : displayName
              }
            </div>
            {timeStr && <div className="text-xs" style={{ color: "#444" }}>{timeStr}</div>}
          </div>
        </div>
        <button onClick={() => setDotMenu(true)} className="icon-btn" style={{ width: 24, height: 24 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>more_horiz</span>
        </button>
      </div>

      {/* Media */}
      {post.mediaUrl && (
        <div className="relative" style={{ background: "#111", overflow: "hidden" }}>
          {isLocked ? (
            <div className="relative w-full flex flex-col items-center justify-center gap-3" style={{ aspectRatio: "1/1", background: "#111" }}>
              {post.mediaUrl && <img src={post.mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "blur(20px) brightness(0.3)" }} />}
              <div className="relative flex flex-col items-center gap-3 px-6 text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#fbbf24", fontVariationSettings: "'FILL' 1" }}>lock</span>
                </div>
                <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Premium content</p>
                <p className="text-xs" style={{ color: "#888" }}>Unlock for ${((post.ppvPrice ?? 0) / 100).toFixed(2)}</p>
                <button onClick={buyPPV} disabled={ppvBuying}
                  className="px-6 py-2.5 rounded-full text-sm font-bold border-none cursor-pointer"
                  style={{ background: "#fbbf24", color: "#000" }}>
                  {ppvBuying ? "Opening…" : `Unlock $${((post.ppvPrice ?? 0) / 100).toFixed(2)}`}
                </button>
              </div>
            </div>
          ) : imgBroken ? (
            <div className="w-full flex items-center justify-center" style={{ color: "#333", aspectRatio: "1/1" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48 }}>hide_image</span>
            </div>
          ) : mediaType === "video" ? (
            <div className="relative w-full" style={{ aspectRatio: "1/1" }}>
              <video
                ref={videoRef}
                src={post.mediaUrl}
                muted loop playsInline preload="none"
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => openLightbox(true)}
              />
              {/* Mute toggle — only control remaining */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const v = videoRef.current;
                  if (!v) return;
                  v.muted = !v.muted;
                  setVideoMuted(v.muted);
                }}
                className="absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer"
                style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
                <span className="material-symbols-outlined text-white" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>
                  {videoMuted ? "volume_off" : "volume_up"}
                </span>
              </button>
            </div>
          ) : (
            <div className="w-full cursor-pointer" onClick={() => openLightbox(false)}>
              <img src={post.mediaUrl} alt="Post" className="w-full h-auto block" loading="lazy" onError={() => setImgBroken(true)} />
            </div>
          )}
          {viewsLeft !== null && (
            <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full"
              style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
              <span className="material-symbols-outlined text-white" style={{ fontSize: 13 }}>visibility</span>
              <span className="text-white text-xs font-semibold">{Math.max(0, viewsLeft)} left</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-3 pt-2.5 pb-3.5">
        <div className="flex items-center gap-0.5 mb-2.5">
          <button onClick={handleLike}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border-none cursor-pointer transition-all"
            style={{ background: liked ? "rgba(239,68,68,0.1)" : "transparent", color: liked ? "#ef4444" : "#555" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: liked ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
            <span className="text-sm font-semibold">{likeCount}</span>
          </button>

          <Link href={`/comments?postId=${post.id}`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
            style={{ color: "#555" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chat_bubble</span>
            <span className="text-sm font-semibold">{Math.max(0, post.comments ?? 0)}</span>
          </Link>

          <button onClick={handleRepost} disabled={reposting || !!post.isRepost}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border-none cursor-pointer transition-all"
            style={{ background: reposted ? "rgba(74,222,128,0.1)" : "transparent", color: reposted ? "#4ade80" : "#555" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: reposted ? "'FILL' 1" : "'FILL' 0" }}>repeat</span>
            {repostCount > 0 && <span className="text-sm font-semibold">{repostCount}</span>}
          </button>

          <button onClick={handleShare}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border-none cursor-pointer"
            style={{ color: "#555", background: "transparent" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>ios_share</span>
          </button>

          {user?.uid === post.authorId && boostEnabled && (
            <button onClick={() => setShowBoostModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border-none cursor-pointer"
              style={{ background: "rgba(99,91,255,0.1)", color: "#635bff", border: "1px solid rgba(99,91,255,0.2)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
              <span className="text-xs font-bold">Boost</span>
            </button>
          )}

          <button onClick={handleBookmark}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border-none cursor-pointer ml-auto transition-all"
            style={{ background: bookmarked ? "rgba(255,255,255,0.1)" : "transparent", color: bookmarked ? "#fff" : "#555" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: bookmarked ? "'FILL' 1" : "'FILL' 0" }}>bookmark</span>
          </button>
        </div>

        {caption && (
          <p className="text-sm leading-relaxed px-1" style={{ color: "#aaa" }}>
            <Link href={`/user-profile?uid=${post.authorId}`}
              className="font-semibold mr-1" style={{ color: "#f2f2f2" }}>
              {displayName}
            </Link>
            {caption}
          </p>
        )}
      </div>
    </article>

    {/* 3-dot bottom sheet */}
    {dotMenu && mounted && createPortal(
      <>
        <div className="fixed inset-0" style={{ background: "rgba(0,0,0,0.5)", zIndex: 9998 }} onClick={() => setDotMenu(false)} />
        <div className="fixed bottom-0 left-0 right-0 rounded-t-2xl overflow-hidden"
          style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.08)", paddingBottom: "env(safe-area-inset-bottom,0px)", zIndex: 9999 }}>
          <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-4" style={{ background: "rgba(255,255,255,0.15)" }} />
          {[
            { icon: "ios_share", label: "Share post", action: () => { handleShare(); setDotMenu(false); }, danger: false },
            { icon: "link", label: "Copy link", action: copyLink, danger: false },
            ...(post.mediaUrl && (isOwner || user?.uid === post.authorId) ? [
              { icon: "download", label: "Download media", action: handleDownload, danger: false },
            ] : []),
            ...(!canDelete && user?.uid !== post.authorId ? [
              { icon: "flag", label: "Report", action: () => { setDotMenu(false); setReportModal(true); setReportDone(false); }, danger: true },
              { icon: "block", label: "Block user", action: handleBlock, danger: true },
            ] : []),
            ...(canDelete ? [{ icon: "delete", label: "Delete post", action: handleDelete, danger: true }] : []),
          ].map((item) => (
            <button key={item.label} onClick={item.action}
              className="flex items-center gap-4 w-full px-5 py-4 border-none cursor-pointer"
              style={{ background: "transparent", borderTop: "1px solid rgba(255,255,255,0.05)", color: item.danger ? "#f87171" : "#f2f2f2" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: item.danger ? "#f87171" : "#aaa" }}>{item.icon}</span>
              <span className="text-sm font-semibold">{item.label}</span>
            </button>
          ))}
          <button onClick={() => setDotMenu(false)}
            className="flex items-center justify-center w-full py-4 border-none cursor-pointer font-semibold text-sm"
            style={{ background: "transparent", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#555" }}>
            Cancel
          </button>
        </div>
      </>,
      document.body
    )}

    {/* Fullscreen lightbox — media fills entire screen, UI overlaid */}
    {[
      { open: imgLightbox, close: () => { setImgLightbox(false); setLbComments([]); }, isVideo: false },
      { open: videoLightbox, close: () => { setVideoLightbox(false); setLbComments([]); }, isVideo: true },
    ].map(({ open, close, isVideo }, idx) => open && mounted && post.mediaUrl && createPortal(
      <div key={idx} className="fixed inset-0" style={{ background: "#000", zIndex: 99999 }}>

        {/* Full-screen media */}
        {isVideo
          ? <video ref={lbVideoRef} src={post.mediaUrl} autoPlay loop playsInline
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          : <img src={post.mediaUrl} alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        }

        {/* Back button — top left */}
        <button onClick={close} className="absolute flex items-center justify-center border-none cursor-pointer"
          style={{ top: "calc(env(safe-area-inset-top, 16px) + 8px)", left: 16, width: 40, height: 40, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", borderRadius: "50%", zIndex: 2 }}>
          <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>arrow_back</span>
        </button>

        {/* Right side action buttons */}
        <div className="absolute right-4 flex flex-col items-center gap-6" style={{ bottom: "calc(env(safe-area-inset-bottom, 24px) + 80px)", zIndex: 2 }}>
          {/* Like */}
          <button onClick={handleLike} className="flex flex-col items-center gap-1 border-none bg-transparent cursor-pointer">
            <span className="material-symbols-outlined" style={{ fontSize: 30, color: liked ? "#ef4444" : "#fff", fontVariationSettings: liked ? "'FILL' 1" : "'FILL' 0", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }}>favorite</span>
            <span className="text-xs font-bold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{likeCount > 0 ? likeCount.toLocaleString() : ""}</span>
          </button>
          {/* Comment */}
          <button className="flex flex-col items-center gap-1 border-none bg-transparent cursor-pointer" onClick={() => document.getElementById(`lb-comment-input-${post.id}`)?.focus()}>
            <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#fff", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }}>chat_bubble</span>
            <span className="text-xs font-bold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{(post.comments ?? 0) > 0 ? (post.comments ?? 0).toLocaleString() : ""}</span>
          </button>
          {/* Repost */}
          <button onClick={handleRepost} disabled={reposting || !!post.isRepost} className="flex flex-col items-center gap-1 border-none bg-transparent cursor-pointer">
            <span className="material-symbols-outlined" style={{ fontSize: 30, color: reposted ? "#4ade80" : "#fff", fontVariationSettings: reposted ? "'FILL' 1" : "'FILL' 0", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }}>repeat</span>
            <span className="text-xs font-bold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{repostCount > 0 ? repostCount.toLocaleString() : ""}</span>
          </button>
          {/* Share */}
          <button onClick={handleShare} className="flex flex-col items-center gap-1 border-none bg-transparent cursor-pointer">
            <span className="material-symbols-outlined" style={{ fontSize: 30, color: "#fff", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }}>ios_share</span>
          </button>
          {/* Bookmark */}
          <button onClick={handleBookmark} className="flex flex-col items-center gap-1 border-none bg-transparent cursor-pointer">
            <span className="material-symbols-outlined" style={{ fontSize: 30, color: bookmarked ? "#fff" : "#fff", fontVariationSettings: bookmarked ? "'FILL' 1" : "'FILL' 0", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }}>bookmark</span>
          </button>
          {/* Author avatar */}
          {post.authorPhoto
            ? <img src={post.authorPhoto} alt="" className="rounded-full object-cover" style={{ width: 36, height: 36, border: "2px solid #fff" }} />
            : <div className="rounded-full flex items-center justify-center text-xs font-bold" style={{ width: 36, height: 36, background: "#333", color: "#fff", border: "2px solid #fff" }}>{(post.authorName || "U").charAt(0).toUpperCase()}</div>
          }
        </div>

        {/* Bottom left — author + caption */}
        <div className="absolute left-4 flex items-end gap-3" style={{ bottom: "calc(env(safe-area-inset-bottom, 24px) + 72px)", right: 72, zIndex: 2 }}>
          <div className="flex-1">
            <p className="text-sm font-bold text-white mb-1" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>{post.authorName || "User"}</p>
            {post.caption && <p className="text-sm text-white leading-snug" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>{post.caption.length > 80 ? post.caption.slice(0, 80) + "…" : post.caption}</p>}
          </div>
        </div>

        {/* Comment input bar — pinned to bottom */}
        <div className="absolute left-0 right-0 flex items-center gap-2 px-4 py-2"
          style={{ bottom: 0, paddingBottom: "calc(env(safe-area-inset-bottom, 8px) + 8px)", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)", zIndex: 2 }}>
          <input
            id={`lb-comment-input-${post.id}`}
            value={lbText} onChange={(e) => setLbText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendLbComment()}
            placeholder="Add a comment…"
            className="flex-1 px-4 py-2.5 rounded-full outline-none text-sm"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
          />
          {lbText.trim() && (
            <button onClick={sendLbComment} disabled={lbSending}
              className="font-bold text-sm border-none bg-transparent cursor-pointer text-white">
              Post
            </button>
          )}
        </div>
      </div>,
      document.body
    ))}

    {/* Report modal */}
    {reportModal && mounted && createPortal(
      <>
        <div className="fixed inset-0" style={{ background: "rgba(0,0,0,0.6)", zIndex: 9998 }} onClick={() => setReportModal(false)} />
        <div className="fixed bottom-0 left-0 right-0 rounded-t-2xl overflow-hidden"
          style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.08)", paddingBottom: "env(safe-area-inset-bottom,0px)", zIndex: 9999 }}>
          <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-1" style={{ background: "rgba(255,255,255,0.15)" }} />
          <div className="px-5 py-3">
            <h3 className="font-bold text-base" style={{ color: "#f2f2f2" }}>Report Post</h3>
            <p className="text-xs mt-0.5" style={{ color: "#555" }}>Why are you reporting this post?</p>
          </div>
          {reportDone ? (
            <div className="px-5 py-6 text-center">
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#4ade80", display: "block", marginBottom: 8 }}>check_circle</span>
              <p className="font-semibold text-sm" style={{ color: "#f2f2f2" }}>Report submitted</p>
              <p className="text-xs mt-1" style={{ color: "#555" }}>We'll review this within 24 hours.</p>
              <button onClick={() => setReportModal(false)}
                className="mt-4 px-6 py-2 rounded-full text-sm font-semibold border-none cursor-pointer"
                style={{ background: "rgba(255,255,255,0.08)", color: "#f2f2f2" }}>
                Close
              </button>
            </div>
          ) : (
            <>
              {["Spam", "Nudity or sexual content", "Hate speech or discrimination", "Violence or dangerous content", "Harassment or bullying", "Other"].map((reason, i, arr) => (
                <button key={reason} onClick={() => handleReport(reason)}
                  className="flex items-center w-full px-5 py-3.5 border-none cursor-pointer text-left"
                  style={{ background: "transparent", borderTop: "1px solid rgba(255,255,255,0.05)", color: "#f2f2f2" }}>
                  <span className="text-sm font-medium">{reason}</span>
                </button>
              ))}
              <button onClick={() => setReportModal(false)}
                className="flex items-center justify-center w-full py-4 border-none cursor-pointer font-semibold text-sm"
                style={{ background: "transparent", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#555" }}>
                Cancel
              </button>
            </>
          )}
        </div>
      </>,
      document.body
    )}

    {/* Boost modal */}
    {showBoostModal && mounted && createPortal(
      <>
        <div className="fixed inset-0" style={{ background: "rgba(0,0,0,0.75)", zIndex: 9998, backdropFilter: "blur(4px)" }} onClick={() => setShowBoostModal(false)} />
        <div className="fixed bottom-0 left-0 right-0 overflow-hidden"
          style={{ background: "#0e0e0e", border: "1px solid rgba(124,58,237,0.2)", borderBottom: "none", borderRadius: "24px 24px 0 0", paddingBottom: "env(safe-area-inset-bottom,16px)", zIndex: 9999 }}>
          {/* Drag handle */}
          <div style={{ width: 40, height: 4, borderRadius: 4, background: "rgba(255,255,255,0.12)", margin: "12px auto 0" }} />
          {/* Purple glow */}
          <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 200, height: 60, background: "radial-gradient(ellipse, rgba(124,58,237,0.2) 0%, transparent 70%)", pointerEvents: "none" }} />

          <div style={{ padding: "16px 16px 8px", position: "relative" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 800, color: "#f2f2f2", margin: 0 }}>Boost this post</p>
                <p style={{ fontSize: 12, color: "#555", margin: 0 }}>Amplify your reach beyond followers</p>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: "14px 0" }}>
              {[{ icon: "visibility", label: "More Views" }, { icon: "group_add", label: "New Followers" }, { icon: "trending_up", label: "More Engagement" }].map(s => (
                <div key={s.label} style={{ padding: "10px 8px", borderRadius: 12, background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.12)", textAlign: "center" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#7C3AED", fontVariationSettings: "'FILL' 1", display: "block", marginBottom: 4 }}>{s.icon}</span>
                  <p style={{ fontSize: 10, color: "#666", margin: 0, fontWeight: 600 }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Tiers */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {[
                { id: "basic",    label: "Basic",    price: "$5",  reach: "~1K views",  duration: "1 day",  color: "#635bff", bar: 30 },
                { id: "standard", label: "Standard", price: "$10", reach: "~2.1K views", duration: "2 days", color: "#7C3AED", bar: 60, recommended: true },
                { id: "plus",     label: "Plus",     price: "$15", reach: "~3.7K views", duration: "3 days", color: "#a855f7", bar: 100 },
              ].map((t) => (
                <button key={t.id} onClick={() => handleBoost(t.id)} disabled={boosting}
                  style={{
                    width: "100%", padding: "14px", borderRadius: 14, border: "none", cursor: "pointer", position: "relative", textAlign: "left",
                    background: t.recommended ? "rgba(124,58,237,0.1)" : "rgba(255,255,255,0.03)",
                    outline: t.recommended ? "1px solid rgba(124,58,237,0.35)" : "1px solid rgba(255,255,255,0.06)",
                  }}>
                  {t.recommended && (
                    <span style={{ position: "absolute", top: 10, right: 10, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 50, background: "#7C3AED", color: "#fff" }}>BEST VALUE</span>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "#f2f2f2", margin: "0 0 2px" }}>{t.label}</p>
                      <p style={{ fontSize: 12, color: "#555", margin: 0 }}>{t.reach} · {t.duration}</p>
                    </div>
                    <p style={{ fontSize: 20, fontWeight: 800, color: t.recommended ? "#a78bfa" : "#f2f2f2", margin: 0 }}>{t.price}</p>
                  </div>
                  {/* Reach bar */}
                  <div style={{ height: 3, borderRadius: 50, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${t.bar}%`, borderRadius: 50, background: `linear-gradient(90deg, ${t.color}, #a855f7)` }} />
                  </div>
                </button>
              ))}
            </div>

            {boosting && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 0" }}>
                <div className="spinner" style={{ width: 14, height: 14 }} />
                <p style={{ fontSize: 12, color: "#555", margin: 0 }}>Opening checkout…</p>
              </div>
            )}
          </div>
        </div>
      </>,
      document.body
    )}
    </>
  );
}
