"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import {
  doc, getDoc, updateDoc, increment, collection, addDoc,
  arrayUnion, arrayRemove, serverTimestamp,
} from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { sendNotification } from "@/lib/notify";
import CommentThread from "@/components/CommentThread";
import Link from "next/link";

interface Reel {
  id: string; authorId: string; authorName?: string; authorPhoto?: string;
  mediaUrl?: string; caption?: string; likes?: number; likedBy?: string[];
  comments?: number; repostCount?: number; shareCount?: number; mimeType?: string; contentType?: string;
}

// Same detection used in the reels feed: a reel is a video unless it's clearly an image.
function isVideoReel(reel: Reel): boolean {
  const mil = (reel.mimeType || "").toLowerCase();
  if (mil) return mil.startsWith("video/");
  const ctl = (reel.contentType || "").toLowerCase();
  if (ctl && ctl !== "reel") return ctl === "video" || ctl.startsWith("video/");
  const url = reel.mediaUrl || "";
  // No type metadata (old reels / empty file.type) — respect explicit image signals,
  // otherwise a reel is a video by nature (defaulting to image → broken <img>).
  if (/\/image\/upload\//i.test(url) || /\.(jpg|jpeg|png|gif|webp|heic|avif)(\?|$)/i.test(url)) return false;
  return true;
}

export default function ReelDetailPage() {
  const params = useParams();
  const reelId = params.id as string;

  const [reel, setReel] = useState<Reel | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<{ name: string; photo: string } | null>(null);

  // Fetch the reel + the author's current profile.
  useEffect(() => {
    getDoc(doc(db, "reels", reelId)).then((snap) => {
      // Treat a still-scheduled reel as not-found so it isn't viewable before publish.
      if (snap.exists() && (snap.data() as { status?: string }).status !== "scheduled") {
        const data = { id: snap.id, ...(snap.data() as Omit<Reel, "id">) };
        setReel(data);
        setLikeCount(typeof data.likes === "number" ? data.likes : 0);
        if (data.authorId) {
          getDoc(doc(db, "users", data.authorId, "public", "profile")).then((p) => {
            if (p.exists()) {
              const d = p.data();
              setAuthorProfile({ name: d.displayName || d.username || data.authorName || "User", photo: d.photoURL || data.authorPhoto || "" });
            }
          }).catch(() => {});
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [reelId]);

  useEffect(() => {
    if (user && reel) setLiked(Array.isArray(reel.likedBy) && reel.likedBy.includes(user.uid));
  }, [user, reel]);

  // Notify the reel author (in-app doc + push), mirroring posts. No-op for self-actions.
  function notifyAuthor(type: "like") {
    if (!user || !reel || reel.authorId === user.uid) return;
    addDoc(collection(db, "notifications"), {
      recipientId: reel.authorId,
      senderId: user.uid,
      senderName: user.displayName || "Someone",
      senderPhoto: user.photoURL || "",
      type, postId: reelId, isReel: true, read: false, createdAt: serverTimestamp(),
    }).catch(() => {});
    sendNotification({ recipientUid: reel.authorId, type, senderName: user.displayName || "Someone", senderId: user.uid, postId: reelId, isReel: true });
  }

  async function toggleLike() {
    if (!user || !reel) return;
    const next = !liked;
    setLiked(next); setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    updateDoc(doc(db, "reels", reelId), {
      likes: increment(next ? 1 : -1),
      likedBy: next ? arrayUnion(user.uid) : arrayRemove(user.uid),
    }).catch(() => { setLiked(!next); setLikeCount((c) => Math.max(0, c + (next ? -1 : 1))); });
    if (next) notifyAuthor("like");
  }

  async function share() {
    setReel((r) => r ? { ...r, shareCount: (r.shareCount ?? 0) + 1 } : r); // optimistic
    updateDoc(doc(db, "reels", reelId), { shareCount: increment(1) }).catch(() => {});
    const url = typeof window !== "undefined" ? window.location.href : `https://felcin.com/reels/${reelId}`;
    const isVid = reel ? isVideoReel(reel) : true;
    const title = reel?.caption || (isVid ? "Felcin video" : "Felcin photo");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text: `Check this out on Felcin`, url });
        return;
      }
    } catch { return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  if (loading) return <div className="flex justify-center py-32"><div className="spinner" /></div>;
  if (!reel || !reel.mediaUrl) return (
    <div className="flex flex-col items-center justify-center py-32 px-4">
      <p className="text-lg font-semibold mb-3" style={{ color: "#f2f2f2" }}>Post not found</p>
      <Link href="/reels" className="text-sm" style={{ color: "#888" }}>← Back to Reels</Link>
    </div>
  );

  const isVid = isVideoReel(reel);
  const authorName = authorProfile?.name || reel.authorName || "User";
  const authorPhoto = authorProfile?.photo || reel.authorPhoto;
  const init = (authorName || "U").charAt(0).toUpperCase();

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <Link href="/reels" className="inline-flex items-center gap-1 text-sm mb-5" style={{ color: "#888" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Reels
      </Link>

      {/* Media */}
      <div className="relative w-full rounded-3xl overflow-hidden mb-5 mx-auto flex items-center justify-center"
        style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "70vh" }}>
        {isVid ? (
          <video
            src={reel.mediaUrl}
            controls
            playsInline
            autoPlay
            loop
            style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", background: "#000" }}
          />
        ) : (
          <img src={reel.mediaUrl} alt={reel.caption || "Photo"} style={{ width: "100%", maxHeight: "70vh", objectFit: "contain" }} />
        )}
      </div>

      {/* Author + caption */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          {authorPhoto ? (
            <img src={authorPhoto} alt="" className="rounded-full object-cover" style={{ width: 26, height: 26 }} />
          ) : (
            <div className="rounded-full flex items-center justify-center text-xs font-bold"
              style={{ width: 26, height: 26, background: "#222", color: "#aaa" }}>{init}</div>
          )}
          {reel.authorId ? (
            <Link href={`/user-profile?uid=${reel.authorId}`} className="text-sm font-semibold no-underline" style={{ color: "#ddd" }}>{authorName}</Link>
          ) : (
            <span className="text-sm font-semibold" style={{ color: "#ddd" }}>{authorName}</span>
          )}
        </div>
        {reel.caption && (
          <p className="text-sm leading-relaxed break-words" style={{ color: "#aaa" }}>{reel.caption}</p>
        )}
      </div>

      {/* Engagement — like / comment / share */}
      <div className="flex items-center gap-7 mt-4 mb-6">
        <button onClick={toggleLike} aria-label="Like"
          className="flex items-center gap-1.5 border-none bg-transparent cursor-pointer p-0"
          style={{ color: liked ? "#ef4444" : "#888" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 25, fontVariationSettings: liked ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
          {likeCount > 0 && <span className="text-sm font-semibold">{likeCount}</span>}
        </button>
        <div className="flex items-center gap-1.5" style={{ color: "#888" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 25 }}>mode_comment</span>
          {(reel.comments ?? 0) > 0 && <span className="text-sm font-semibold">{reel.comments}</span>}
        </div>
        <button onClick={share} aria-label="Share"
          className="flex items-center gap-1.5 border-none bg-transparent cursor-pointer p-0 ml-auto"
          style={{ color: copied ? "#34d399" : "#888" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{copied ? "check_circle" : "share"}</span>
          {copied && <span className="text-xs font-semibold">Link copied</span>}
        </button>
      </div>

      {/* Comments — full-featured shared thread (likes, replies, edit, delete, who-liked) */}
      <CommentThread col="reels" parentId={reelId} parentAuthorId={reel.authorId} />
    </div>
  );
}
