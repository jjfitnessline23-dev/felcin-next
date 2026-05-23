"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { doc, getDoc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, increment, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

interface Post {
  authorId: string; authorName?: string; authorPhoto?: string;
  caption?: string; text?: string; mediaUrl?: string;
  contentType?: string; mimeType?: string;
  maxViews?: number | null; viewCount?: number;
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
  const { user } = useAuth();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [authorData, setAuthorData] = useState<{ name: string; photo: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!postId) return;
    const postRef = doc(db, "posts", postId);
    getDoc(postRef).then(async (snap) => {
      if (!snap.exists()) { router.replace("/"); return; }
      const p = snap.data() as Post;
      setPost(p);

      // Track view and auto-delete if limit reached
      if (p.maxViews != null) {
        const newCount = (p.viewCount ?? 0) + 1;
        if (newCount >= p.maxViews) {
          await deleteDoc(postRef);
          router.replace("/");
          return;
        } else {
          await updateDoc(postRef, { viewCount: increment(1) });
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
    }).catch(() => router.replace("/"));
    const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Comment, "id">) })));
      clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    });
    return () => { unsub(); clearTimeout(scrollTimer.current); };
  }, [postId, router]);

  const sendComment = async () => {
    if (!text.trim() || !user || sending) return;
    setSending(true);
    const t = text.trim(); setText("");
    try {
      await addDoc(collection(db, "posts", postId, "comments"), {
        authorId: user.uid,
        authorName: user.displayName || user.email || "User",
        authorPhoto: user.photoURL || "",
        text: t,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "posts", postId), { comments: increment(1) });
    } catch {}
    setSending(false);
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !post?.mediaUrl) return;
    v.muted = true;
    v.setAttribute("muted", "");
    const play = () => v.play().catch(() => {});
    v.addEventListener("loadedmetadata", play, { once: true });
    v.load();
    return () => v.removeEventListener("loadedmetadata", play);
  }, [post?.mediaUrl]);

  const mediaType = resolveMediaType(post?.contentType, post?.mimeType, post?.mediaUrl);
  const displayName = authorData?.name || post?.authorName || "User";
  const photo = authorData?.photo || post?.authorPhoto || "";
  const caption = post?.caption || post?.text || "";
  const initial = displayName.charAt(0).toUpperCase();
  const myInitial = (user?.displayName || user?.email || "U").charAt(0).toUpperCase();

  return (
    <div className="max-w-xl mx-auto flex flex-col w-full" style={{ minHeight: "100dvh", background: "#090909" }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 sticky z-10"
        style={{ top: "env(safe-area-inset-top,0px)", background: "rgba(9,9,9,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => router.back()} className="icon-btn" style={{ width: 36, height: 36 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#f2f2f2" }}>arrow_back</span>
        </button>
        <h1 className="font-bold text-base" style={{ color: "#f2f2f2" }}>Post</h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {/* Post preview */}
        {post && (
          <>
            <div className="flex items-center gap-3 px-4 py-3">
              <Link href={`/user-profile?uid=${post.authorId}`} className="flex items-center gap-3">
                {photo ? (
                  <img src={photo} alt="" className="rounded-full object-cover shrink-0" style={{ width: 38, height: 38 }} />
                ) : (
                  <div className="rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ width: 38, height: 38, background: "#222", color: "#aaa" }}>
                    {initial}
                  </div>
                )}
                <span className="font-semibold text-sm" style={{ color: "#f2f2f2" }}>{displayName}</span>
              </Link>
            </div>

            {post.mediaUrl && (
              <div style={{ background: "#000" }}>
                {mediaType === "video" ? (
                  <video ref={videoRef} src={post.mediaUrl} autoPlay muted controls playsInline className="w-full object-contain" style={{ maxHeight: 380, display: "block" }} />
                ) : (
                  <img src={post.mediaUrl} alt="" className="w-full object-contain" style={{ maxHeight: 380 }} />
                )}
              </div>
            )}

            {caption && (
              <p className="px-4 py-3 text-sm leading-relaxed" style={{ color: "#aaa", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="font-semibold mr-1" style={{ color: "#f2f2f2" }}>{displayName}</span>{caption}
              </p>
            )}
          </>
        )}

        {/* Comments section */}
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
                        style={{ width: 32, height: 32, background: "#1a1a1a", color: "#666" }}>
                        {cInitial}
                      </div>
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
        style={{ background: "rgba(9,9,9,0.96)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.06)", zIndex: 60, paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex items-center gap-3 max-w-xl mx-auto">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 32, height: 32 }} />
          ) : (
            <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ width: 32, height: 32, background: "#222", color: "#aaa" }}>
              {myInitial}
            </div>
          )}
          <input
            ref={inputRef}
            type="text" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendComment()}
            placeholder="Add a comment…"
            className="flex-1 px-4 py-2.5 rounded-full outline-none"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2", fontSize: 16 }}
          />
          <button onClick={sendComment} disabled={!text.trim() || sending}
            className="font-semibold text-sm border-none bg-transparent cursor-pointer transition-colors"
            style={{ color: text.trim() ? "#fff" : "#333" }}>
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
