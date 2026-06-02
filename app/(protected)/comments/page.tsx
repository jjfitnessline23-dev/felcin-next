"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  doc, getDoc, collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, updateDoc, increment, deleteDoc,
  arrayUnion, arrayRemove, setDoc, getDocs, limit, startAfter, QueryDocumentSnapshot,
} from "firebase/firestore";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

interface Post {
  authorId: string; authorName?: string; authorPhoto?: string;
  caption?: string; text?: string; mediaUrl?: string;
  contentType?: string; mimeType?: string;
  maxViews?: number | null; viewCount?: number;
  likes?: number; likedBy?: string[]; comments?: number;
}
interface Comment {
  id: string; authorId: string; authorName?: string; authorPhoto?: string;
  text: string; createdAt?: { seconds: number };
}

function resolveMediaType(ct?: string, mime?: string, url?: string) {
  const t = ct || mime || "";
  if (t === "video" || t.startsWith("video/")) return "video";
  if (/\.(mp4|webm|mov|avi|3gp)(\?|$)/i.test(url || "")) return "video";
  return "image";
}

function timeAgo(s: number) {
  const d = Math.floor(Date.now() / 1000) - s;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m";
  if (d < 86400) return Math.floor(d / 3600) + "h";
  return Math.floor(d / 86400) + "d";
}

export default function CommentsPage() {
  const searchParams = useSearchParams();
  const postId = searchParams.get("postId") || "";
  const isReel = searchParams.get("type") === "reel";
  const col = isReel ? "reels" : "posts";
  const { user } = useAuth();
  const router = useRouter();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [authorData, setAuthorData] = useState<{ name: string; photo: string } | null>(null);

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [liking, setLiking] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [dotMenu, setDotMenu] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [postDeleted, setPostDeleted] = useState(false);
  const [imgLightbox, setImgLightbox] = useState(false);
  const [prevPostId, setPrevPostId] = useState<string | null>(null);
  const [nextPostId, setNextPostId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const videoRef = useRef<HTMLVideoElement>(null);
  const initialLoadDone = useRef(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!postId) return;
    const postRef = doc(db, col, postId);
    getDoc(postRef).then(async (snap) => {
      if (!snap.exists()) { router.replace("/"); return; }
      const p = snap.data() as Post;
      setPost(p);
      setLikeCount(p.likes ?? 0);
      if (user) setLiked(p.likedBy?.includes(user.uid) ?? false);

      if (!isReel && p.maxViews != null && user?.uid !== p.authorId) {
        const viewedKey = `viewed_${postId}`;
        const alreadyViewed = typeof window !== "undefined" && sessionStorage.getItem(viewedKey);
        if (!alreadyViewed) {
          if (typeof window !== "undefined") sessionStorage.setItem(viewedKey, "1");
          const newCount = (p.viewCount ?? 0) + 1;
          if (newCount >= p.maxViews) { await deleteDoc(postRef); router.replace("/"); return; }
          else await updateDoc(postRef, { viewCount: increment(1) });
        }
      }

      if (p.authorId) {
        try {
          const pub = await getDoc(doc(db, "users", p.authorId, "public", "profile"));
          if (pub.exists()) {
            const d = pub.data();
            setAuthorData({ name: d.displayName || d.username || "User", photo: d.photoURL || "" });
          } else {
            const root = await getDoc(doc(db, "users", p.authorId));
            if (root.exists()) {
              const d = root.data();
              setAuthorData({ name: d.displayName || d.username || "User", photo: d.photoURL || "" });
            }
          }
        } catch {}
      }

      // Load adjacent posts for swipe navigation (posts only, not reels)
      if (!isReel) {
        try {
          const [newerSnap, olderSnap] = await Promise.all([
            getDocs(query(collection(db, "posts"), orderBy("createdAt", "asc"), startAfter(snap), limit(1))),
            getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), startAfter(snap), limit(1))),
          ]);
          setPrevPostId(newerSnap.docs[0]?.id ?? null);
          setNextPostId(olderSnap.docs[0]?.id ?? null);
        } catch {}
      }
    }).catch(() => router.replace("/"));

    initialLoadDone.current = false;
    const q = query(collection(db, col, postId, "comments"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Comment, "id">) })));
      if (initialLoadDone.current) {
        clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
      }
      initialLoadDone.current = true;
    });
    return () => { unsub(); clearTimeout(scrollTimer.current); };
  }, [postId, col, isReel, router, user]);

  useEffect(() => {
    if (!user || !postId) return;
    getDoc(doc(db, "users", user.uid, "bookmarks", postId)).then((s) => setBookmarked(s.exists()));
  }, [user, postId]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !post?.mediaUrl) return;
    v.muted = true;
    v.setAttribute("muted", "");
    v.play().catch(() => {});
  }, [post?.mediaUrl]);

  const sendComment = async () => {
    if (!text.trim() || !user || sending) return;
    setSending(true);
    const t = text.trim(); setText("");
    try {
      await addDoc(collection(db, col, postId, "comments"), {
        authorId: user.uid,
        authorName: user.displayName || user.email || "User",
        authorPhoto: user.photoURL || "",
        text: t,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, col, postId), { comments: increment(1) });
      // Notify post author (not if commenting on own post)
      if (post && post.authorId && post.authorId !== user.uid) {
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientUid: post.authorId,
            type: "comment",
            senderName: user.displayName || "Someone",
            postId,
          }),
        }).catch(() => {});
      }
    } catch {}
    setSending(false);
  };

  const handleLike = async () => {
    if (!user || liking || !post) return;
    setLiking(true);
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => c + (newLiked ? 1 : -1));
    try {
      await updateDoc(doc(db, col, postId), {
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
    if (!user) return;
    const ref = doc(db, "users", user.uid, "bookmarks", postId);
    const newVal = !bookmarked;
    setBookmarked(newVal);
    try {
      if (newVal) await setDoc(ref, { savedAt: serverTimestamp(), postId });
      else await deleteDoc(ref);
    } catch { setBookmarked(!newVal); }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/comments?postId=${postId}`;
    if (navigator.share) navigator.share({ url }).catch(() => {});
    else navigator.clipboard?.writeText(url).catch(() => {});
  };

  const handleReport = async (reason: string) => {
    if (!user || !post) return;
    try {
      await addDoc(collection(db, "reports"), {
        type: "post", postId, authorId: post.authorId,
        reporterId: user.uid, reason,
        createdAt: serverTimestamp(), status: "pending",
      });
    } catch {}
    setReportDone(true);
  };

  const handleDelete = async () => {
    if (!post || !user) return;
    if (!confirm("Delete this post?")) return;
    setDotMenu(false);
    await deleteDoc(doc(db, col, postId)).catch(() => {});
    setPostDeleted(true);
    router.replace("/");
  };

  const handleBlock = async () => {
    if (!user || !post) return;
    setDotMenu(false);
    await setDoc(doc(db, "users", user.uid, "blocked", post.authorId), { blockedAt: serverTimestamp() }).catch(() => {});
    await addDoc(collection(db, "reports"), {
      type: "block", blockedUid: post.authorId, blockerId: user.uid,
      postId, createdAt: serverTimestamp(), status: "pending",
    }).catch(() => {});
    router.replace("/");
  };

  if (postDeleted) return null;

  const mediaType = resolveMediaType(post?.contentType, post?.mimeType, post?.mediaUrl);
  const displayName = authorData?.name || post?.authorName || "User";
  const photo = authorData?.photo || post?.authorPhoto || "";
  const caption = post?.caption || post?.text || "";
  const initial = displayName.charAt(0).toUpperCase();
  const myInitial = (user?.displayName || user?.email || "U").charAt(0).toUpperCase();
  const isOwner = user && OWNER_UIDS.includes(user.uid);
  const canDelete = post && user && (user.uid === post.authorId || isOwner);
  const canDotMenu = !!post && !!user;

  return (
    <>
    {/* Image lightbox */}
    {imgLightbox && post?.mediaUrl && (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#000", zIndex: 99999 }}
        onClick={() => setImgLightbox(false)}>
        <img src={post.mediaUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />
        <button onClick={() => setImgLightbox(false)}
          className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center border-none cursor-pointer"
          style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}>
          <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>close</span>
        </button>
      </div>
    )}

    <div className="max-w-xl mx-auto flex flex-col w-full" style={{ minHeight: "100dvh", background: "#090909" }}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = touchStartX.current - e.changedTouches[0].clientX;
        touchStartX.current = null;
        if (Math.abs(delta) < 60) return;
        if (delta > 0 && nextPostId) router.replace(`/comments?postId=${nextPostId}`);
        else if (delta < 0 && prevPostId) router.replace(`/comments?postId=${prevPostId}`);
      }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 sticky z-10"
        style={{ top: "env(safe-area-inset-top,0px)", background: "rgba(9,9,9,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => router.back()} className="icon-btn" style={{ width: 36, height: 36 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#f2f2f2" }}>arrow_back</span>
        </button>
        <h1 className="font-bold text-base flex-1" style={{ color: "#f2f2f2" }}>Post</h1>
        {/* Prev / Next post navigation */}
        {prevPostId && (
          <button onClick={() => router.replace(`/comments?postId=${prevPostId}`)}
            className="icon-btn" style={{ width: 32, height: 32 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#555" }}>chevron_left</span>
          </button>
        )}
        {nextPostId && (
          <button onClick={() => router.replace(`/comments?postId=${nextPostId}`)}
            className="icon-btn" style={{ width: 32, height: 32 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#555" }}>chevron_right</span>
          </button>
        )}
        {canDotMenu && (
          <button onClick={() => setDotMenu(true)} className="icon-btn" style={{ width: 36, height: 36 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#f2f2f2" }}>more_horiz</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {post && (
          <>
            {/* Author row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <Link href={`/user-profile?uid=${post.authorId}`} className="flex items-center gap-3 flex-1 min-w-0">
                {photo ? (
                  <img src={photo} alt="" className="rounded-full object-cover shrink-0" style={{ width: 38, height: 38 }} />
                ) : (
                  <div className="rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ width: 38, height: 38, background: "#222", color: "#aaa" }}>{initial}</div>
                )}
                <span className="font-semibold text-sm truncate" style={{ color: "#f2f2f2" }}>{displayName}</span>
              </Link>
            </div>

            {/* Media */}
            {post.mediaUrl && (
              <div style={{ background: "#000" }}>
                {mediaType === "video" ? (
                  <div className="relative">
                    <video ref={videoRef} src={post.mediaUrl} muted playsInline preload="auto"
                      className="w-full object-contain" style={{ maxHeight: 480, display: "block" }}
                      onClick={() => {
                        const v = videoRef.current;
                        if (!v) return;
                        if (v.paused) v.play().catch(() => {}); else v.pause();
                      }}
                    />
                    {/* Fullscreen button */}
                    <button
                      onClick={() => {
                        const v = videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
                        if (!v) return;
                        if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
                        else if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
                      }}
                      className="absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer"
                      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}>
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 18 }}>fullscreen</span>
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <img src={post.mediaUrl} alt="" className="w-full object-contain" style={{ maxHeight: 480 }}
                      onClick={() => setImgLightbox(true)} />
                    <button onClick={() => setImgLightbox(true)}
                      className="absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer"
                      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}>
                      <span className="material-symbols-outlined text-white" style={{ fontSize: 18 }}>fullscreen</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Action bar */}
            <div className="flex items-center gap-0.5 px-3 pt-2 pb-1">
              <button onClick={handleLike}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border-none cursor-pointer transition-all"
                style={{ background: liked ? "rgba(239,68,68,0.1)" : "transparent", color: liked ? "#ef4444" : "#555" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: liked ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
                <span className="text-sm font-semibold">{likeCount}</span>
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

            {/* Caption */}
            {caption && (
              <p className="px-4 py-2 text-sm leading-relaxed" style={{ color: "#aaa", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="font-semibold mr-1" style={{ color: "#f2f2f2" }}>{displayName}</span>{caption}
              </p>
            )}
          </>
        )}

        {/* Comments */}
        <div className="px-4 pt-4">
          {comments.length === 0 ? (
            <p className="text-center py-10 text-sm" style={{ color: "#444" }}>No comments yet — be the first!</p>
          ) : (
            <div className="flex flex-col gap-4">
              {comments.map((c) => {
                const cInitial = (c.authorName || "U").charAt(0).toUpperCase();
                return (
                  <div key={c.id} className="flex items-start gap-3">
                    {c.authorPhoto ? (
                      <img src={c.authorPhoto} alt="" className="rounded-full object-cover shrink-0" style={{ width: 32, height: 32 }} />
                    ) : (
                      <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ width: 32, height: 32, background: "#1a1a1a", color: "#666" }}>{cInitial}</div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm leading-relaxed" style={{ color: "#ccc" }}>
                        <span className="font-semibold mr-1" style={{ color: "#f2f2f2" }}>{c.authorName || "User"}</span>
                        {c.text}
                      </p>
                      {c.createdAt?.seconds && (
                        <p className="text-xs mt-1" style={{ color: "#444" }}>{timeAgo(c.createdAt.seconds)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Comment input */}
      <div className="fixed bottom-0 left-0 right-0 px-4 py-3 lg:relative lg:bottom-auto"
        style={{ background: "rgba(9,9,9,0.96)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.06)", zIndex: 80, paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex items-center gap-3 max-w-xl mx-auto">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 32, height: 32 }} />
          ) : (
            <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ width: 32, height: 32, background: "#222", color: "#aaa" }}>{myInitial}</div>
          )}
          <input ref={inputRef} type="text" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendComment()}
            placeholder="Add a comment…" className="flex-1 px-4 py-2.5 rounded-full outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2", fontSize: 16 }} />
          <button onClick={sendComment} disabled={!text.trim() || sending}
            className="font-semibold text-sm border-none bg-transparent cursor-pointer transition-colors"
            style={{ color: text.trim() ? "#fff" : "#333" }}>
            Post
          </button>
        </div>
      </div>
    </div>

    {/* 3-dot bottom sheet */}
    {dotMenu && (
      <>
        <div className="fixed inset-0" style={{ background: "rgba(0,0,0,0.5)", zIndex: 90 }} onClick={() => setDotMenu(false)} />
        <div className="fixed bottom-0 left-0 right-0 rounded-t-2xl overflow-hidden"
          style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.08)", paddingBottom: "env(safe-area-inset-bottom,0px)", zIndex: 95 }}>
          <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-4" style={{ background: "rgba(255,255,255,0.15)" }} />
          {[
            { icon: "ios_share", label: "Share post", action: () => { handleShare(); setDotMenu(false); }, danger: false },
            { icon: "link", label: "Copy link", action: () => { navigator.clipboard?.writeText(`${window.location.origin}/comments?postId=${postId}`).catch(() => {}); setDotMenu(false); }, danger: false },
            ...(canDelete ? [{ icon: "delete", label: "Delete post", action: handleDelete, danger: true }] : []),
            ...(!canDelete && post && user?.uid !== post.authorId ? [
              { icon: "flag", label: "Report", action: () => { setDotMenu(false); setReportModal(true); setReportDone(false); }, danger: true },
              { icon: "block", label: "Block user", action: handleBlock, danger: true },
            ] : []),
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
      </>
    )}

    {/* Report modal */}
    {reportModal && (
      <>
        <div className="fixed inset-0" style={{ background: "rgba(0,0,0,0.6)", zIndex: 90 }} onClick={() => setReportModal(false)} />
        <div className="fixed bottom-0 left-0 right-0 rounded-t-2xl overflow-hidden"
          style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.08)", paddingBottom: "env(safe-area-inset-bottom,0px)", zIndex: 95 }}>
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
                style={{ background: "rgba(255,255,255,0.08)", color: "#f2f2f2" }}>Close</button>
            </div>
          ) : (
            <>
              {["Spam", "Nudity or sexual content", "Hate speech or discrimination", "Violence or dangerous content", "Harassment or bullying", "Other"].map((reason) => (
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
      </>
    )}
    </>
  );
}
