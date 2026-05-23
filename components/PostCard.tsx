"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  doc, updateDoc, increment, arrayUnion, arrayRemove,
  getDoc, setDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
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

export default function PostCard({ post }: { post: Post }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(post.likedBy?.includes(user?.uid || "") ?? false);
  const [likeCount, setLikeCount] = useState(post.likes ?? 0);
  const [liking, setLiking] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [dotMenu, setDotMenu] = useState(false);

  useEffect(() => {
    setLiked(post.likedBy?.includes(user?.uid || "") ?? false);
    setLikeCount(post.likes ?? 0);
  }, [post.likedBy, post.likes, user?.uid]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid, "bookmarks", post.id)).then((snap) => setBookmarked(snap.exists()));
  }, [user, post.id]);

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
    if (navigator.share) navigator.share({ url }).catch(() => {});
    else await navigator.clipboard.writeText(url).catch(() => {});
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/comments?postId=${post.id}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setDotMenu(false);
  };

  return (
    <>
    <article style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, overflow: "hidden" }}>
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
        <button onClick={() => setDotMenu(true)} className="icon-btn" style={{ width: 32, height: 32 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>more_horiz</span>
        </button>
      </div>

      {/* Media */}
      {post.mediaUrl && (
        <Link href={`/comments?postId=${post.id}`}>
          <div className="relative" style={{ background: "#000", aspectRatio: "1/1", overflow: "hidden" }}>
            {mediaType === "video" ? (
              <>
                <video src={post.mediaUrl} className="w-full h-full object-cover" muted loop playsInline
                  onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
                  onMouseLeave={(e) => (e.currentTarget as HTMLVideoElement).pause()} />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}>
                    <span className="material-symbols-outlined text-white" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                  </div>
                </div>
              </>
            ) : (
              <img src={post.mediaUrl} alt="Post" className="w-full h-full object-cover" loading="lazy" />
            )}
            {viewsLeft !== null && (
              <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full"
                style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
                <span className="material-symbols-outlined text-white" style={{ fontSize: 13 }}>visibility</span>
                <span className="text-white text-xs font-semibold">{Math.max(0, viewsLeft)} left</span>
              </div>
            )}
          </div>
        </Link>
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
            <span className="text-sm font-semibold">{post.comments ?? 0}</span>
          </Link>

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
    {dotMenu && (
      <>
        <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setDotMenu(false)} />
        <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden pb-safe"
          style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.08)", paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
          <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-4" style={{ background: "rgba(255,255,255,0.15)" }} />
          {[
            { icon: "ios_share", label: "Share post", action: () => { handleShare(); setDotMenu(false); } },
            { icon: "link", label: "Copy link", action: copyLink },
            { icon: "flag", label: "Report", action: () => setDotMenu(false) },
          ].map((item) => (
            <button key={item.label} onClick={item.action}
              className="flex items-center gap-4 w-full px-5 py-4 border-none cursor-pointer"
              style={{ background: "transparent", borderTop: "1px solid rgba(255,255,255,0.05)", color: item.label === "Report" ? "#f87171" : "#f2f2f2" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: item.label === "Report" ? "#f87171" : "#aaa" }}>{item.icon}</span>
              <span className="text-sm font-semibold">{item.label}</span>
            </button>
          ))}
          <button onClick={() => setDotMenu(false)}
            className="flex items-center justify-center w-full py-4 border-none cursor-pointer font-semibold text-sm"
            style={{ background: "transparent", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#555" }}>
            Cancel
          </button>
        </div>
      </>
    )}
    </>
  );
}
