"use client";

import { useState, useEffect } from "react";
import {
  doc, collection, query, onSnapshot, addDoc, serverTimestamp, updateDoc,
  increment, deleteDoc, arrayUnion, arrayRemove, getDoc, limit,
} from "@/lib/db";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { sendNotification } from "@/lib/notify";
import Link from "next/link";

interface Comment {
  id: string; authorId: string; authorName?: string; authorPhoto?: string;
  text: string; createdAt?: { seconds: number }; editedAt?: { seconds: number };
  likes?: number; likedBy?: string[]; parentId?: string | null;
}

function timeAgo(s: number) {
  const d = Math.floor(Date.now() / 1000) - s;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m";
  if (d < 86400) return Math.floor(d / 3600) + "h";
  return Math.floor(d / 86400) + "d";
}

// Stable top-level component so the controlled edit input keeps focus across renders.
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
            <button onClick={() => onReply(c)} className="text-xs font-semibold border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>Reply</button>
            {isMine && (
              <button onClick={() => onStartEdit(c)} className="text-xs font-semibold border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>Edit</button>
            )}
            {canDeleteC && (
              <button onClick={() => onDelete(c)} className="text-xs font-semibold border-none bg-transparent cursor-pointer" style={{ color: "#555" }}>Delete</button>
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

/**
 * Full-featured comment thread (tappable profiles, likes, threaded replies, edit, delete,
 * "who liked"), shared by the post detail and reel detail. `col` is "posts" | "reels".
 */
export default function CommentThread({ col, parentId, parentAuthorId }: { col: "posts" | "reels"; parentId: string; parentAuthorId?: string }) {
  const { user } = useAuth();
  const isReel = col === "reels";
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [likesModal, setLikesModal] = useState<Comment | null>(null);
  const [likesList, setLikesList] = useState<{ uid: string; name: string; photo: string }[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);

  const isOwner = !!user && OWNER_UIDS.includes(user.uid);

  useEffect(() => {
    if (!parentId) return;
    // No orderBy — serverTimestamp() leaves a brief null, which drops pending docs from
    // ordered queries. Sort client-side so a new comment shows instantly.
    const unsub = onSnapshot(query(collection(db, col, parentId, "comments"), limit(500)), (snap) => {
      setComments(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Comment, "id">) }))
          .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
      );
    }, () => {});
    return () => unsub();
  }, [col, parentId]);

  const notify = (recipientId: string, type: "comment") => {
    if (!user || !recipientId || recipientId === user.uid) return;
    addDoc(collection(db, "notifications"), {
      recipientId, senderId: user.uid, senderName: user.displayName || user.email || "Someone",
      senderPhoto: user.photoURL || "", type, postId: parentId, isReel, read: false, createdAt: serverTimestamp(),
    }).catch(() => {});
    sendNotification({ recipientUid: recipientId, type, senderName: user.displayName || "Someone", senderId: user.uid, postId: parentId, isReel });
  };

  const send = async () => {
    if (!text.trim() || !user || sending) return;
    setSending(true);
    const t = text.trim();
    const parent = replyingTo;
    try {
      await addDoc(collection(db, col, parentId, "comments"), {
        authorId: user.uid,
        authorName: user.displayName || user.email || "User",
        authorPhoto: user.photoURL || "",
        text: t,
        parentId: parent?.id ?? null,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, col, parentId), { comments: increment(1) }).catch(() => {});
      setText("");
      setReplyingTo(null);
      const targets = new Set<string>();
      if (parentAuthorId) targets.add(parentAuthorId);
      const replyTargetId = parent ? comments.find((c) => c.id === parent.id)?.authorId : undefined;
      if (replyTargetId) targets.add(replyTargetId);
      targets.forEach((id) => notify(id, "comment"));
    } catch { /* text preserved */ }
    setSending(false);
  };

  const startReply = (c: Comment) => setReplyingTo({ id: c.parentId ?? c.id, name: c.authorName || "User" });

  const handleCommentLike = async (c: Comment) => {
    if (!user) return;
    const newLiked = !(c.likedBy ?? []).includes(user.uid);
    setComments((prev) => prev.map((x) => x.id === c.id ? {
      ...x, likes: Math.max(0, (x.likes ?? 0) + (newLiked ? 1 : -1)),
      likedBy: newLiked ? [...(x.likedBy ?? []), user.uid] : (x.likedBy ?? []).filter((u) => u !== user.uid),
    } : x));
    try {
      await updateDoc(doc(db, col, parentId, "comments", c.id), {
        likes: increment(newLiked ? 1 : -1),
        likedBy: newLiked ? arrayUnion(user.uid) : arrayRemove(user.uid),
      });
    } catch { /* snapshot reconciles */ }
  };

  const handleDelete = async (c: Comment) => {
    if (!user) return;
    if (!confirm("Delete this comment?")) return;
    setComments((prev) => prev.filter((x) => x.id !== c.id));
    try {
      await deleteDoc(doc(db, col, parentId, "comments", c.id));
      updateDoc(doc(db, col, parentId), { comments: increment(-1) }).catch(() => {});
    } catch { /* snapshot restores */ }
  };

  const startEdit = (c: Comment) => { setEditingId(c.id); setEditText(c.text); };
  const saveEdit = async (c: Comment) => {
    const t = editText.trim();
    if (!user || !t || t === c.text) { setEditingId(null); return; }
    setEditingId(null);
    setComments((prev) => prev.map((x) => x.id === c.id ? { ...x, text: t, editedAt: { seconds: Math.floor(Date.now() / 1000) } } : x));
    try { await updateDoc(doc(db, col, parentId, "comments", c.id), { text: t, editedAt: serverTimestamp() }); } catch {}
  };

  const showLikes = async (c: Comment) => {
    const uids = (c.likedBy ?? []).slice(0, 50);
    setLikesModal(c); setLikesList([]); setLikesLoading(true);
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

  const idSet = new Set(comments.map((c) => c.id));
  const topLevel = comments.filter((c) => !c.parentId || !idSet.has(c.parentId));
  const repliesByParent: Record<string, Comment[]> = {};
  for (const c of comments) { if (c.parentId && idSet.has(c.parentId)) (repliesByParent[c.parentId] ||= []).push(c); }

  const rowProps = {
    currentUid: user?.uid, isOwner, editingId, editText, setEditText,
    onLike: handleCommentLike, onReply: startReply, onDelete: handleDelete,
    onStartEdit: startEdit, onSaveEdit: saveEdit, onCancelEdit: () => setEditingId(null), onShowLikes: showLikes,
  };

  return (
    <div>
      <p className="text-sm font-bold mb-3" style={{ color: "#f2f2f2" }}>
        Comments {comments.length > 0 && <span style={{ color: "#555" }}>({comments.length})</span>}
      </p>

      {/* Input */}
      {replyingTo && (
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs" style={{ color: "#777" }}>Replying to <span style={{ color: "#aaa" }}>{replyingTo.name}</span></span>
          <button onClick={() => setReplyingTo(null)} className="border-none bg-transparent cursor-pointer flex items-center" style={{ color: "#777" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 mb-5">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder={replyingTo ? `Reply to ${replyingTo.name}…` : "Add a comment…"}
          className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none"
          style={{ background: "#131313", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.08)" }} />
        <button onClick={send} disabled={!text.trim() || sending}
          className="px-4 py-2.5 rounded-full text-sm font-bold border-none cursor-pointer"
          style={{ background: (!text.trim() || sending) ? "rgba(255,255,255,0.06)" : "#f2f2f2", color: (!text.trim() || sending) ? "#444" : "#000" }}>
          {sending ? "…" : "Post"}
        </button>
      </div>

      {/* List */}
      {comments.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: "#444" }}>No comments yet — be the first!</p>
      ) : (
        <div className="flex flex-col gap-4">
          {topLevel.map((c) => (
            <div key={c.id} className="flex flex-col gap-3">
              <CommentRow c={c} {...rowProps} />
              {(repliesByParent[c.id] || []).length > 0 && (
                <div className="flex flex-col gap-3 pl-11">
                  {(repliesByParent[c.id] || []).map((r) => <CommentRow key={r.id} c={r} isReply {...rowProps} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Likes bottom sheet */}
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
    </div>
  );
}
