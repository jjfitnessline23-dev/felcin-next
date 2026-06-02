"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  doc, updateDoc, increment, arrayUnion, arrayRemove,
  getDoc, setDoc, deleteDoc, serverTimestamp, addDoc, collection,
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

export default function PostCard({ post, onBlock }: { post: Post; onBlock?: (uid: string) => void }) {
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
  const [reposted, setReposted] = useState(false);
  const [repostCount, setRepostCount] = useState(post.repostCount ?? 0);
  const [reposting, setReposting] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const isOwner = user && OWNER_UIDS.includes(user.uid);
  const canDelete = user && (user.uid === post.authorId || isOwner);

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
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 }
    );
    obs.observe(v);
    return () => { obs.disconnect(); v.pause(); };
  }, [post.mediaUrl]);

  const mediaType = resolveMediaType(post.contentType, post.mimeType, post.mediaUrl);
  const caption = post.caption || post.text || "";
  const displayName = post.authorName || "User";
  const initial = displayName.charAt(0).toUpperCase();
  const timeStr = post.createdAt?.seconds ? timeAgo(post.createdAt.seconds) : "";
  const viewsLeft = post.maxViews != null ? post.maxViews - (post.viewCount ?? 0) : null;

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
      // Send push notification to post author (not to yourself)
      if (newLiked && post.authorId && post.authorId !== user.uid) {
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientUid: post.authorId,
            type: "like",
            senderName: user.displayName || "Someone",
            postId: post.id,
          }),
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

  const handleBlock = async () => {
    if (!user || user.uid === post.authorId) return;
    setDotMenu(false);
    const ref = doc(db, "users", user.uid, "blocked", post.authorId);
    await setDoc(ref, { blockedAt: new Date() }).catch(() => {});
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
        <div className="relative" style={{ background: "#111", aspectRatio: "1/1", overflow: "hidden" }}>
          {imgBroken ? (
            <div className="w-full h-full flex items-center justify-center" style={{ color: "#333" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48 }}>hide_image</span>
            </div>
          ) : mediaType === "video" ? (
            <div className="relative w-full h-full">
              <video
                ref={videoRef}
                src={post.mediaUrl}
                muted loop playsInline preload="auto"
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => {
                  const v = videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
                  if (!v) return;
                  v.play().catch(() => {});
                  if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
                  else if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
                }}
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
            <div className="w-full h-full cursor-pointer" onClick={() => setImgLightbox(true)}>
              <img src={post.mediaUrl} alt="Post" className="w-full h-full object-cover" loading="lazy" onError={() => setImgBroken(true)} />
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

    {/* Image lightbox */}
    {imgLightbox && mounted && post.mediaUrl && createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: "#000", zIndex: 99999 }}>
        <img
          src={post.mediaUrl}
          alt=""
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          onClick={() => setImgLightbox(false)}
        />
        <button
          onClick={() => setImgLightbox(false)}
          className="absolute left-4 flex items-center justify-center border-none cursor-pointer"
          style={{ top: "calc(env(safe-area-inset-top, 16px) + 8px)", width: 40, height: 40, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", borderRadius: "50%" }}>
          <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>arrow_back</span>
        </button>
      </div>,
      document.body
    )}

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
    </>
  );
}
