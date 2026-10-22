"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  doc, getDoc, collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, updateDoc, increment, deleteDoc,
  arrayUnion, arrayRemove, setDoc, getDocs, limit, startAfter, QueryDocumentSnapshot,
} from "@/lib/db";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { sendNotification } from "@/lib/notify";
import { recordView } from "@/lib/recordView";
import Link from "next/link";

interface Post {
  authorId: string; authorName?: string; authorPhoto?: string;
  caption?: string; text?: string; mediaUrl?: string;
  contentType?: string; mimeType?: string;
  maxViews?: number | null; viewCount?: number;
  likes?: number; likedBy?: string[]; comments?: number; shareCount?: number;
}
interface Comment {
  id: string; authorId: string; authorName?: string; authorPhoto?: string;
  text: string; createdAt?: { seconds: number }; editedAt?: { seconds: number };
  likes?: number; likedBy?: string[]; parentId?: string | null;
}

function resolveMediaType(ct?: string, mime?: string, url?: string) {
  // Check contentType AND mimeType independently — a reel/story stores contentType as
  // "reel"/"story" with the video-ness only in mimeType ("video/mp4"), so a `ct || mime`
  // short-circuit would miss it and render the video in an <img> (broken thumbnail).
  const ctl = (ct || "").toLowerCase();
  const mil = (mime || "").toLowerCase();
  if (ctl === "video" || ctl.startsWith("video/")) return "video";
  if (mil === "video" || mil.startsWith("video/")) return "video";
  const u = url || "";
  if (/\.(mp4|webm|mov|avi|3gp|m4v|mkv)(\?|$)/i.test(u)) return "video";
  if (/\/video\/upload\//i.test(u)) return "video"; // Cloudinary video delivery URL (no extension)
  return "image";
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function timeAgo(s: number) {
  const d = Math.floor(Date.now() / 1000) - s;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m";
  if (d < 86400) return Math.floor(d / 3600) + "h";
  return Math.floor(d / 86400) + "d";
}

// Top-level (stable identity) so the controlled edit input keeps focus across renders.
function CommentRow({
  c, isReply = false, currentUid, isOwner, editingId, editText, setEditText,
  onLike, onReply, onDelete, onStartEdit, onSaveEdit, onCancelEdit, onShowLikes,
}: {
  c: Comment; isReply?: boolean; currentUid?: string; isOwner: boolean;
  editingId: string | null; editText: string; setEditText: (s: string) => void;
  onLike: (c: Comment) => void; onReply: (c: Comment) => void; onDelete: (c: Comment) => void;
  onStartEdit: (c: Comment) => void; onSaveEdit: (c: Comment) => void; onCancelEdit: () => void;
  onShowLikes: (c: Comment) => void;
}) {
  const cInitial = (c.authorName || "U").charAt(0).toUpperCase();
  const avatar = isReply ? 28 : 32;
  const cLiked = !!currentUid && (c.likedBy ?? []).includes(currentUid);
  const cLikes = c.likes ?? 0;
  const isMine = !!currentUid && currentUid === c.authorId;
  const canDeleteC = isMine || isOwner;
  const isEditing = editingId === c.id;
  return (
    <div className="flex items-start gap-3">
      <Link href={`/user-profile?uid=${c.authorId}`} className="shrink-0">
        {c.authorPhoto ? (
          <img src={c.authorPhoto} alt="" className="rounded-full object-cover" style={{ width: avatar, height: avatar }} />
        ) : (
          <div className="rounded-full flex items-center justify-center text-xs font-bold"
            style={{ width: avatar, height: avatar, background: "#1a1a1a", color: "#666" }}>{cInitial}</div>
        )}
      </Link>
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={1000}
              onKeyDown={(e) => { if (e.key === "Enter") onSaveEdit(c); if (e.key === "Escape") onCancelEdit(); }}
              className="flex-1 px-3 py-1.5 rounded-lg outline-none text-sm"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#f2f2f2" }} />
            <button onClick={() => onSaveEdit(c)} className="text-xs font-semibold border-none bg-transparent cursor-pointer" style={{ color: "#fff" }}>Save</button>
            <button onClick={onCancelEdit} className="text-xs font-semibold border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>Cancel</button>
          </div>
        ) : (
          <p className="text-sm leading-relaxed" style={{ color: "#ccc" }}>
            <Link href={`/user-profile?uid=${c.authorId}`} className="font-semibold mr-1" style={{ color: "#f2f2f2" }}>
              {c.authorName || "User"}
            </Link>
            {c.text}
            {c.editedAt?.seconds && <span className="ml-1.5 text-xs" style={{ color: "#444" }}>(edited)</span>}
          </p>
        )}
        {!isEditing && (
          <div className="flex items-center gap-4 mt-1">
            {c.createdAt?.seconds && (
              <span className="text-xs" style={{ color: "#444" }}>{timeAgo(c.createdAt.seconds)}</span>
            )}
            {cLikes > 0 && (
              <button onClick={() => onShowLikes(c)} className="text-xs border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>
                {cLikes} {cLikes === 1 ? "like" : "likes"}
              </button>
            )}
            <button onClick={() => onReply(c)} className="text-xs font-semibold border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>
              Reply
            </button>
            {isMine && (
              <button onClick={() => onStartEdit(c)} className="text-xs font-semibold border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>
                Edit
              </button>
            )}
            {canDeleteC && (
              <button onClick={() => onDelete(c)} className="text-xs font-semibold border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>
                Delete
              </button>
            )}
          </div>
        )}
      </div>
      <button onClick={() => onLike(c)} disabled={!currentUid}
        className="flex items-center justify-center border-none bg-transparent cursor-pointer shrink-0 mt-0.5"
        style={{ width: 28, height: 28, color: cLiked ? "#ef4444" : "#555" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: cLiked ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
      </button>
    </div>
  );
}

export default function PageClient() {
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
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [likesModal, setLikesModal] = useState<Comment | null>(null);
  const [likesList, setLikesList] = useState<{ uid: string; name: string; photo: string }[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const [authorData, setAuthorData] = useState<{ name: string; photo: string } | null>(null);

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [shareCount, setShareCount] = useState(0);
  const [liking, setLiking] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [dotMenu, setDotMenu] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(false);
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
      setLikeCount(typeof p.likes === "number" ? p.likes : 0);
      setShareCount(typeof p.shareCount === "number" ? p.shareCount : 0);
      if (user) setLiked(Array.isArray(p.likedBy) && p.likedBy.includes(user.uid));

      if (user?.uid !== p.authorId) {
        const viewedKey = `viewed_${postId}`;
        const alreadyViewed = typeof window !== "undefined" && sessionStorage.getItem(viewedKey);
        if (!alreadyViewed) {
          if (typeof window !== "undefined") sessionStorage.setItem(viewedKey, "1");
          // maxViews auto-delete
          if (!isReel && p.maxViews != null) {
            const newCount = (p.viewCount ?? 0) + 1;
            if (newCount >= p.maxViews) { await deleteDoc(postRef); router.replace("/"); return; }
          }
          // Track view for creator fund — recorded server-side (client writes to the
          // author's totalViews/monthlyViews are denied by rules → under-counting).
          recordView(isReel ? "reel" : "post", postId);
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
    // No orderBy — serverTimestamp() causes pending docs to be excluded from ordered queries.
    // Sort client-side so comments appear immediately on send. Limit to 500 — beyond that
    // a popular post would crash the client loading tens of thousands of comments.
    const q = query(collection(db, col, postId, "comments"), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      setComments(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Comment, "id">) }))
          .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
      );
      if (initialLoadDone.current) {
        clearTimeout(scrollTimer.current);
        scrollTimer.current = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
      }
      initialLoadDone.current = true;
    });
    return () => { unsub(); clearTimeout(scrollTimer.current); };
  // Keyed on user?.uid (not the user object) so an auth-token refresh doesn't re-run
  // this loader and revert a like the user just made.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, col, isReel, router, user?.uid]);

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
    const t = text.trim();
    const parent = replyingTo;
    try {
      await addDoc(collection(db, col, postId, "comments"), {
        authorId: user.uid,
        authorName: user.displayName || user.email || "User",
        authorPhoto: user.photoURL || "",
        text: t,
        parentId: parent?.id ?? null,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, col, postId), { comments: increment(1) });
      setText("");        // clear only after successful save
      setReplyingTo(null);
      // Notify the post author (always) + the comment author being replied to (if different).
      const notifyTargets = new Set<string>();
      if (post?.authorId && post.authorId !== user.uid) notifyTargets.add(post.authorId);
      const replyTargetId = parent ? comments.find((c) => c.id === parent.id)?.authorId : undefined;
      if (replyTargetId && replyTargetId !== user.uid) notifyTargets.add(replyTargetId);
      for (const recipientId of notifyTargets) {
        addDoc(collection(db, "notifications"), {
          recipientId,
          senderId: user.uid,
          senderName: user.displayName || user.email || "Someone",
          senderPhoto: user.photoURL || "",
          type: "comment",
          postId,
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {});
        sendNotification({ recipientUid: recipientId, type: "comment", senderName: user.displayName || "Someone", senderId: user.uid, postId });
      }
    } catch { /* text already preserved since we didn't clear it */ }
    setSending(false);
  };

  const startReply = (c: Comment) => {
    setReplyingTo({ id: c.parentId ?? c.id, name: c.authorName || "User" });
    inputRef.current?.focus();
  };

  const handleDeleteComment = async (c: Comment) => {
    if (!user) return;
    if (!confirm("Delete this comment?")) return;
    // Optimistic — also drop any replies to it so they don't linger (onSnapshot reconciles).
    setComments((prev) => prev.filter((x) => x.id !== c.id));
    try {
      await deleteDoc(doc(db, col, postId, "comments", c.id));
      // Keep the post's comment counter in step (onlyEngagementFields allows this).
      updateDoc(doc(db, col, postId), { comments: increment(-1) }).catch(() => {});
    } catch { /* snapshot will restore it if the delete was denied */ }
  };

  const showLikes = async (c: Comment) => {
    const uids = (c.likedBy ?? []).slice(0, 50);
    setLikesModal(c);
    setLikesList([]);
    setLikesLoading(true);
    try {
      const rows = await Promise.all(uids.map(async (uid) => {
        try {
          const pub = await getDoc(doc(db, "users", uid, "public", "profile"));
          const d = pub.exists() ? pub.data() : {};
          return { uid, name: d.displayName || d.username || "User", photo: d.photoURL || "" };
        } catch { return { uid, name: "User", photo: "" }; }
      }));
      setLikesList(rows);
    } catch { setLikesList([]); }
    setLikesLoading(false);
  };

  const startEdit = (c: Comment) => {
    setEditingId(c.id);
    setEditText(c.text);
  };

  const saveEdit = async (c: Comment) => {
    const t = editText.trim();
    if (!user || !t || t === c.text) { setEditingId(null); return; }
    setEditingId(null);
    setComments((prev) => prev.map((x) => x.id === c.id ? { ...x, text: t, editedAt: { seconds: Math.floor(Date.now() / 1000) } } : x));
    try {
      await updateDoc(doc(db, col, postId, "comments", c.id), { text: t, editedAt: serverTimestamp() });
    } catch { /* snapshot reconciles on failure */ }
  };

  const handleCommentLike = async (c: Comment) => {
    if (!user) return;
    const newLiked = !(c.likedBy ?? []).includes(user.uid);
    // Optimistic — onSnapshot will reconcile (and revert on failure).
    setComments((prev) => prev.map((x) => x.id === c.id ? {
      ...x,
      likes: Math.max(0, (x.likes ?? 0) + (newLiked ? 1 : -1)),
      likedBy: newLiked ? [...(x.likedBy ?? []), user.uid] : (x.likedBy ?? []).filter((u) => u !== user.uid),
    } : x));
    try {
      await updateDoc(doc(db, col, postId, "comments", c.id), {
        likes: increment(newLiked ? 1 : -1),
        likedBy: newLiked ? arrayUnion(user.uid) : arrayRemove(user.uid),
      });
    } catch { /* snapshot reconciles the optimistic change */ }
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
    setShareCount((c) => c + 1); // optimistic
    updateDoc(doc(db, col, postId), { shareCount: increment(1) }).catch(() => setShareCount((c) => Math.max(0, c - 1)));
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

  const handleDelete = () => {
    if (!post || !user) return;
    setDotMenu(false);
    setDeleteConfirmModal(true);
  };

  const confirmDelete = async () => {
    setDeleteConfirmModal(false);
    await deleteDoc(doc(db, col, postId)).catch(() => {});
    setPostDeleted(true);
    router.replace("/");
  };

  const handleBlock = async () => {
    if (!user || !post) return;
    setDotMenu(false);
    await Promise.all([
      setDoc(doc(db, "users", user.uid, "blocked", post.authorId), { blockedAt: serverTimestamp() }),
      setDoc(doc(db, "users", post.authorId, "blockedBy", user.uid), { blockedAt: serverTimestamp() }),
    ]).catch(() => {});
    // NOTE: blocking is a private user action — it must NOT create a moderation report.
    // (This previously wrote a type:"block" doc into `reports`, flooding the admin queue
    // with empty, non-actionable entries. Removed.)
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

  // Flat thread model: replies are comments carrying a parentId. Group them under parents.
  // A reply whose parent was deleted (parentId no longer exists) is promoted to top level
  // so it still shows instead of silently vanishing.
  const idSet = new Set(comments.map((c) => c.id));
  const topLevelComments = comments.filter((c) => !c.parentId || !idSet.has(c.parentId));
  const repliesByParent: Record<string, Comment[]> = {};
  for (const c of comments) {
    if (c.parentId && idSet.has(c.parentId)) (repliesByParent[c.parentId] ||= []).push(c);
  }

  return (
    <>
    {/* Image lightbox */}
    {imgLightbox && post?.mediaUrl && (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#000", zIndex: 99999 }}>
        <img src={post.mediaUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          onClick={() => setImgLightbox(false)} />
        <button onClick={() => setImgLightbox(false)}
          className="absolute left-4 flex items-center justify-center border-none cursor-pointer"
          style={{ top: "calc(env(safe-area-inset-top, 16px) + 8px)", width: 40, height: 40, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", borderRadius: "50%" }}>
          <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>arrow_back</span>
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
                  <video ref={videoRef} src={post.mediaUrl} muted playsInline preload="auto"
                    className="w-full object-contain cursor-pointer" style={{ maxHeight: 480, display: "block" }}
                    onClick={() => {
                      const v = videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
                      if (!v) return;
                      v.play().catch(() => {});
                      if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
                      else if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
                    }}
                  />
                ) : (
                  <img src={post.mediaUrl} alt="" className="w-full object-contain cursor-pointer" style={{ maxHeight: 480 }}
                    onClick={() => setImgLightbox(true)} />
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
              {(post.viewCount ?? 0) > 0 && (
                <span className="flex items-center gap-1.5 px-2.5 py-1.5" style={{ color: "#555" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>visibility</span>
                  <span className="text-sm font-semibold">{fmtCount(post.viewCount!)}</span>
                </span>
              )}
              <button onClick={handleShare}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border-none cursor-pointer"
                style={{ color: "#555", background: "transparent" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>ios_share</span>
                {shareCount > 0 && <span className="text-sm font-semibold">{shareCount}</span>}
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
              {topLevelComments.map((c) => {
                const rowProps = {
                  currentUid: user?.uid, isOwner: !!isOwner, editingId, editText, setEditText,
                  onLike: handleCommentLike, onReply: startReply, onDelete: handleDeleteComment,
                  onStartEdit: startEdit, onSaveEdit: saveEdit, onCancelEdit: () => setEditingId(null),
                  onShowLikes: showLikes,
                };
                return (
                  <div key={c.id} className="flex flex-col gap-3">
                    <CommentRow c={c} {...rowProps} />
                    {(repliesByParent[c.id] || []).length > 0 && (
                      <div className="flex flex-col gap-3 pl-11">
                        {(repliesByParent[c.id] || []).map((r) => <CommentRow key={r.id} c={r} isReply {...rowProps} />)}
                      </div>
                    )}
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
        {replyingTo && (
          <div className="flex items-center justify-between max-w-xl mx-auto mb-2 px-1">
            <span className="text-xs" style={{ color: "#777" }}>Replying to <span style={{ color: "#aaa" }}>{replyingTo.name}</span></span>
            <button onClick={() => setReplyingTo(null)} className="border-none bg-transparent cursor-pointer flex items-center" style={{ color: "#777" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
        )}
        <div className="flex items-center gap-3 max-w-xl mx-auto">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 32, height: 32 }} />
          ) : (
            <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ width: 32, height: 32, background: "#222", color: "#aaa" }}>{myInitial}</div>
          )}
          <input ref={inputRef} type="text" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendComment()}
            maxLength={1000}
            placeholder={replyingTo ? `Reply to ${replyingTo.name}…` : "Add a comment…"} className="flex-1 px-4 py-2.5 rounded-full outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2", fontSize: 16 }} />
          <button onClick={sendComment} disabled={!text.trim() || sending}
            className="font-semibold text-sm border-none bg-transparent cursor-pointer transition-colors"
            style={{ color: text.trim() ? "#fff" : "#333" }}>
            Post
          </button>
        </div>
      </div>
    </div>

    {/* Likes list bottom sheet */}
    {likesModal && (
      <>
        <div className="fixed inset-0" style={{ background: "rgba(0,0,0,0.5)", zIndex: 90 }} onClick={() => setLikesModal(null)} />
        <div className="fixed bottom-0 left-0 right-0 rounded-t-2xl overflow-hidden flex flex-col"
          style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.08)", paddingBottom: "env(safe-area-inset-bottom,0px)", zIndex: 95, maxHeight: "70vh" }}>
          <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-2" style={{ background: "rgba(255,255,255,0.15)" }} />
          <h3 className="font-bold text-base px-5 pb-3" style={{ color: "#f2f2f2" }}>Likes</h3>
          <div className="overflow-y-auto px-2 pb-4">
            {likesLoading ? (
              <p className="text-center py-8 text-sm" style={{ color: "#555" }}>Loading…</p>
            ) : likesList.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: "#555" }}>No likes yet</p>
            ) : (
              likesList.map((u) => (
                <Link key={u.uid} href={`/user-profile?uid=${u.uid}`} onClick={() => setLikesModal(null)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ color: "#f2f2f2" }}>
                  {u.photo ? (
                    <img src={u.photo} alt="" className="rounded-full object-cover shrink-0" style={{ width: 40, height: 40 }} />
                  ) : (
                    <div className="rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ width: 40, height: 40, background: "#222", color: "#aaa" }}>{u.name.charAt(0).toUpperCase()}</div>
                  )}
                  <span className="font-semibold text-sm truncate">{u.name}</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </>
    )}

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

    {/* Delete confirmation modal */}
    {deleteConfirmModal && (
      <>
        <div className="fixed inset-0" style={{ background: "rgba(0,0,0,0.6)", zIndex: 90 }} onClick={() => setDeleteConfirmModal(false)} />
        <div className="fixed bottom-0 left-0 right-0 rounded-t-2xl overflow-hidden"
          style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.08)", paddingBottom: "env(safe-area-inset-bottom,0px)", zIndex: 95 }}>
          <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-4" style={{ background: "rgba(255,255,255,0.15)" }} />
          <div className="px-5 pb-3 text-center">
            <p className="font-bold text-base mb-1" style={{ color: "#f2f2f2" }}>Delete Post?</p>
            <p className="text-sm" style={{ color: "#555" }}>This can't be undone.</p>
          </div>
          <button onClick={confirmDelete}
            className="flex items-center justify-center w-full py-4 border-none cursor-pointer font-semibold text-sm"
            style={{ background: "transparent", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#f87171" }}>
            Delete
          </button>
          <button onClick={() => setDeleteConfirmModal(false)}
            className="flex items-center justify-center w-full py-4 border-none cursor-pointer font-semibold text-sm"
            style={{ background: "transparent", borderTop: "1px solid rgba(255,255,255,0.06)", color: "#555" }}>
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
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: "var(--fx-accent-2)", display: "block", marginBottom: 8 }}>check_circle</span>
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
