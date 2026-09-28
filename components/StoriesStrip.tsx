"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, setDoc, deleteDoc, addDoc, updateDoc, increment, arrayUnion, arrayRemove, serverTimestamp } from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { sendNotification } from "@/lib/notify";
import Link from "next/link";

interface Story {
  id: string;
  authorId: string;
  authorName?: string;
  authorPhoto?: string;
  mediaUrl?: string;
  contentType?: string;
  mimeType?: string;
  expiresAt?: { seconds: number };
  likes?: number;
  likedBy?: string[];
  comments?: number;
}

interface UserStories {
  authorId: string;
  authorName: string;
  authorPhoto: string;
  stories: Story[];
}
interface StoryViewer { id: string; uid?: string; displayName?: string; photoURL?: string; viewedAt?: { seconds: number }; }

function timeAgo(seconds: number) {
  const s = Math.floor(Date.now() / 1000 - seconds);
  if (s < 60) return "now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function isVideo(s: Story) {
  const t = s.contentType || s.mimeType || "";
  if (t === "video" || t.startsWith("video/")) return true;
  return /\.(mp4|webm|mov|avi|3gp)(\?|$)/i.test(s.mediaUrl || "");
}

const STORY_DURATION = 5000;

export default function StoriesStrip() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<UserStories[]>([]);
  const [activeGroup, setActiveGroup] = useState<UserStories | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewers, setViewers] = useState<StoryViewer[]>([]);
  const [viewersOpen, setViewersOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(200));
    return onSnapshot(q, async (snap) => {
      try {
      const now = Date.now();
      const raw: Story[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Story, "id">) }))
        .filter((s) => {
          if (!(s as unknown as Record<string, unknown>)["isStory"]) return false;
          if (!s.expiresAt) return true;
          return s.expiresAt.seconds * 1000 > now;
        });

      const uidSet = [...new Set(raw.map((s) => s.authorId).filter(Boolean))];
      const profileMap = new Map<string, { name: string; photo: string }>();
      await Promise.all(
        uidSet.map(async (uid) => {
          try {
            const snap2 = await getDoc(doc(db, "users", uid, "public", "profile"));
            if (snap2.exists()) {
              const d = snap2.data();
              profileMap.set(uid, { name: d.displayName || d.username || "User", photo: d.photoURL || "" });
              return;
            }
            const root = await getDoc(doc(db, "users", uid));
            if (root.exists()) {
              const d = root.data();
              profileMap.set(uid, { name: d.displayName || d.username || "User", photo: d.photoURL || "" });
            }
          } catch {}
        })
      );

      const groupMap = new Map<string, UserStories>();
      for (const s of raw) {
        const profile = profileMap.get(s.authorId);
        const enriched = { ...s, authorName: profile?.name || "User", authorPhoto: profile?.photo || "" };
        if (!groupMap.has(s.authorId)) {
          groupMap.set(s.authorId, { authorId: s.authorId, authorName: enriched.authorName, authorPhoto: enriched.authorPhoto, stories: [] });
        }
        groupMap.get(s.authorId)!.stories.push(enriched);
      }
      setGroups([...groupMap.values()]);
      } catch {}
    }, () => {});
  }, []);

  useEffect(() => {
    if (!activeGroup) return;
    // Pause auto-advance while typing a comment or viewing the "seen by" list
    if (commentOpen || viewersOpen) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
      return;
    }
    setProgress(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);

    const startTime = Date.now();
    progressRef.current = setInterval(() => {
      setProgress(Math.min(100, ((Date.now() - startTime) / STORY_DURATION) * 100));
    }, 50);

    timerRef.current = setTimeout(() => {
      if (activeIdx < activeGroup.stories.length - 1) setActiveIdx((i) => i + 1);
      else closeViewer();
    }, STORY_DURATION);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup, activeIdx, commentOpen, viewersOpen]);

  // Sync like/comment state whenever the visible story changes
  useEffect(() => {
    const s = activeGroup?.stories[activeIdx];
    if (!s) return;
    setLiked(!!(user && Array.isArray(s.likedBy) && s.likedBy.includes(user.uid)));
    setLikeCount(typeof s.likes === "number" ? s.likes : 0);
    setCommentCount(typeof s.comments === "number" ? s.comments : 0);
    setCommentOpen(false);
    setCommentText("");
    setViewersOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup, activeIdx, user]);

  // Story "seen by": record my view of someone else's story; if it's MY story,
  // subscribe to who viewed it.
  useEffect(() => {
    const s = activeGroup?.stories[activeIdx];
    if (!s || !user) { setViewers([]); return; }
    if (s.authorId !== user.uid) {
      setDoc(doc(db, "posts", s.id, "views", user.uid), {
        uid: user.uid,
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        viewedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
      setViewers([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, "posts", s.id, "views"), limit(1000)),
      (snap) => setViewers(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<StoryViewer, "id">) }))
          .sort((a, b) => (b.viewedAt?.seconds ?? 0) - (a.viewedAt?.seconds ?? 0))
      ),
      () => {}
    );
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup, activeIdx, user]);

  const handleDeleteStory = async (story: Story) => {
    if (!user || user.uid !== story.authorId) return;
    if (!confirm("Delete this story?")) return;
    await deleteDoc(doc(db, "posts", story.id)).catch(() => {});
    if (activeGroup) {
      const remaining = activeGroup.stories.filter((s) => s.id !== story.id);
      if (remaining.length === 0) { closeViewer(); return; }
      setActiveGroup({ ...activeGroup, stories: remaining });
      if (activeIdx >= remaining.length) setActiveIdx(remaining.length - 1);
    }
  };

  async function likeStory() {
    if (!user || !current) return;
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => Math.max(0, c + (newLiked ? 1 : -1)));
    current.likedBy = newLiked
      ? [...(current.likedBy || []), user.uid]
      : (current.likedBy || []).filter((u) => u !== user.uid);
    current.likes = Math.max(0, (current.likes || 0) + (newLiked ? 1 : -1));
    try {
      await updateDoc(doc(db, "posts", current.id), {
        likes: increment(newLiked ? 1 : -1),
        likedBy: newLiked ? arrayUnion(user.uid) : arrayRemove(user.uid),
      });
      if (newLiked && current.authorId && current.authorId !== user.uid) {
        addDoc(collection(db, "notifications"), {
          recipientId: current.authorId, senderId: user.uid,
          senderName: user.displayName || "Someone", senderPhoto: user.photoURL || "",
          type: "like", postId: current.id, read: false, createdAt: serverTimestamp(),
        }).catch(() => {});
        sendNotification({ recipientUid: current.authorId, type: "like", senderName: user.displayName || "Someone", senderId: user.uid, postId: current.id });
      }
    } catch {
      setLiked(!newLiked);
      setLikeCount((c) => Math.max(0, c + (newLiked ? -1 : 1)));
    }
  }

  async function sendStoryComment() {
    const t = commentText.trim();
    if (!t || !user || !current || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, "posts", current.id, "comments"), {
        authorId: user.uid,
        authorName: user.displayName || user.email || "User",
        authorPhoto: user.photoURL || "",
        text: t, createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "posts", current.id), { comments: increment(1) });
      current.comments = (current.comments || 0) + 1;
      setCommentCount((c) => c + 1);
      setCommentText("");
      setCommentOpen(false);
      if (current.authorId && current.authorId !== user.uid) {
        addDoc(collection(db, "notifications"), {
          recipientId: current.authorId, senderId: user.uid,
          senderName: user.displayName || user.email || "Someone", senderPhoto: user.photoURL || "",
          type: "comment", postId: current.id, read: false, createdAt: serverTimestamp(),
        }).catch(() => {});
        sendNotification({ recipientUid: current.authorId, type: "comment", senderName: user.displayName || "Someone", senderId: user.uid, postId: current.id });
      }
    } catch { /* keep text so the user can retry */ }
    setSending(false);
  }

  async function shareStory() {
    if (!current) return;
    const url = `${window.location.origin}/comments?postId=${current.id}`;
    const title = `${current.authorName || "A"}'s story on Felcin`;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
    } catch { return; }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const openGroup = (g: UserStories) => { setActiveGroup(g); setActiveIdx(0); };
  const closeViewer = () => {
    setActiveGroup(null);
    setActiveIdx(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
  };
  const goNext = () => {
    if (!activeGroup) return;
    if (activeIdx < activeGroup.stories.length - 1) setActiveIdx((i) => i + 1);
    else closeViewer();
  };
  const goPrev = () => { if (activeIdx > 0) setActiveIdx((i) => i - 1); };
  const current = activeGroup?.stories[activeIdx];

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2 mb-5" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        <Link href="/creator?mode=story" className="flex flex-col items-center gap-1 shrink-0" style={{ textDecoration: "none" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "2px dashed rgba(255,255,255,0.1)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#fff" }}>add</span>
          </div>
          <span className="text-xs" style={{ color: "#555" }}>Add story</span>
        </Link>
        {groups.map((g) => (
          <button key={g.authorId} onClick={() => openGroup(g)} className="flex flex-col items-center gap-1 shrink-0 bg-transparent border-none cursor-pointer p-0">
            <div className="w-14 h-14 rounded-full p-0.5" style={{ background: "rgba(255,255,255,0.15)" }}>
              {g.authorPhoto ? (
                <img src={g.authorPhoto} alt="" width={52} height={52} className="w-full h-full rounded-full object-cover" style={{ border: "2px solid #111" }} />
              ) : (
                <div className="w-full h-full rounded-full flex items-center justify-center font-bold text-sm" style={{ background: "#333", color: "#aaa", border: "2px solid #111" }}>
                  {g.authorName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-xs max-w-[56px] truncate" style={{ color: "#ccc" }}>{g.authorName}</span>
          </button>
        ))}
      </div>

      {activeGroup && current && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#000", zIndex: 65 }}>
          <div className="relative w-full h-full max-w-sm mx-auto flex flex-col">
            <div className="absolute left-0 right-0 z-10 flex flex-col gap-2"
              style={{ top: 0, paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)", paddingLeft: 12, paddingRight: 12 }}>
              {/* Progress bars */}
              <div className="flex gap-1">
                {activeGroup.stories.map((_, i) => (
                  <div key={i} className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.3)" }}>
                    <div className="h-full rounded-full" style={{ background: "#fff", width: i < activeIdx ? "100%" : i === activeIdx ? `${progress}%` : "0%", transition: i === activeIdx ? "none" : undefined }} />
                  </div>
                ))}
              </div>
              {/* Author row */}
              <div className="flex items-center gap-3 py-1">
                <Link href={`/user-profile?uid=${current.authorId}`} className="flex items-center gap-3 min-w-0" style={{ textDecoration: "none" }} onClick={closeViewer}>
                  {current.authorPhoto ? (
                    <img src={current.authorPhoto} alt="" width={36} height={36} className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold" style={{ background: "#333", color: "#aaa" }}>
                      {current.authorName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="font-semibold text-white text-sm">{current.authorName}</span>
                </Link>
                <div className="ml-auto flex items-center gap-2">
                  {user?.uid === current.authorId && (
                    <button onClick={() => handleDeleteStory(current)}
                      className="w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer"
                      style={{ background: "rgba(239,68,68,0.3)", color: "#fff" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                    </button>
                  )}
                  <button onClick={closeViewer} className="w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer" style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center">
              {isVideo(current) ? (
                <video key={current.id} src={current.mediaUrl} autoPlay playsInline muted className="w-full h-full object-contain" style={{ maxHeight: "100vh" }} />
              ) : current.mediaUrl ? (
                <img key={current.id} src={current.mediaUrl} alt="Story" className="w-full h-full object-contain" style={{ maxHeight: "100vh" }} />
              ) : (
                <div className="text-white text-lg font-semibold px-8 text-center">{current.authorName}</div>
              )}
            </div>
            <button onClick={goPrev} className="absolute left-0 top-0 w-1/3 border-none bg-transparent cursor-pointer" style={{ bottom: 92 }} aria-label="Previous" />
            <button onClick={goNext} className="absolute right-0 top-0 w-1/3 border-none bg-transparent cursor-pointer" style={{ bottom: 92 }} aria-label="Next" />

            {/* Like / Comment / Share bar */}
            <div className="absolute bottom-0 left-0 right-0 z-30 px-4 pt-3"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 14px)", background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)" }}>
              {commentOpen ? (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <input autoFocus value={commentText} onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendStoryComment(); }}
                    maxLength={1000}
                    placeholder={`Reply to ${current.authorName || "story"}…`}
                    className="flex-1 px-4 py-2.5 rounded-full outline-none"
                    style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 16 }} />
                  <button onClick={sendStoryComment} disabled={!commentText.trim() || sending}
                    className="font-semibold text-sm border-none bg-transparent cursor-pointer px-1"
                    style={{ color: commentText.trim() ? "#fff" : "#666" }}>Send</button>
                  <button onClick={() => setCommentOpen(false)}
                    className="w-9 h-9 flex items-center justify-center rounded-full border-none cursor-pointer shrink-0"
                    style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                  </button>
                </div>
              ) : current.authorId === user?.uid ? (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setViewersOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border-none cursor-pointer"
                    style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>visibility</span>
                    <span className="text-sm font-semibold">Seen by {viewers.length}</span>
                  </button>
                  <button onClick={shareStory}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full border-none cursor-pointer ml-auto"
                    style={{ background: "rgba(0,0,0,0.4)", color: "#fff" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>ios_share</span>
                    {copied && <span className="text-xs font-semibold">Copied</span>}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={likeStory}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full border-none cursor-pointer"
                    style={{ background: "rgba(0,0,0,0.4)", color: liked ? "#ef4444" : "#fff" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: liked ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
                    {likeCount > 0 && <span className="text-sm font-semibold">{likeCount}</span>}
                  </button>
                  <button onClick={() => setCommentOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full border-none cursor-pointer"
                    style={{ background: "rgba(0,0,0,0.4)", color: "#fff" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>chat_bubble</span>
                    {commentCount > 0 && <span className="text-sm font-semibold">{commentCount}</span>}
                  </button>
                  <button onClick={shareStory}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full border-none cursor-pointer ml-auto"
                    style={{ background: "rgba(0,0,0,0.4)", color: "#fff" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>ios_share</span>
                    {copied && <span className="text-xs font-semibold">Copied</span>}
                  </button>
                </div>
              )}
            </div>

            {/* Viewers ("Seen by") sheet — owner only */}
            {viewersOpen && (
              <div className="absolute inset-0 z-40 flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.55)" }}
                onClick={() => setViewersOpen(false)}>
                <div className="rounded-t-3xl flex flex-col" style={{ background: "#141414", maxHeight: "64%", paddingBottom: "env(safe-area-inset-bottom,0px)" }}
                  onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#fff", fontVariationSettings: "'FILL' 1" }}>visibility</span>
                      <span className="font-bold text-white text-base">Viewers · {viewers.length}</span>
                    </div>
                    <button onClick={() => setViewersOpen(false)} className="border-none bg-transparent cursor-pointer" style={{ color: "#888" }}>
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                  <div style={{ overflowY: "auto" }}>
                    {viewers.length === 0 ? (
                      <p className="text-center text-sm" style={{ color: "#666", padding: "40px 0" }}>No views yet</p>
                    ) : viewers.map((v) => (
                      <div key={v.id} className="flex items-center gap-3 px-5" style={{ paddingTop: 10, paddingBottom: 10 }}>
                        {v.photoURL ? (
                          <img src={v.photoURL} alt="" className="rounded-full object-cover" style={{ width: 38, height: 38 }} />
                        ) : (
                          <div className="rounded-full flex items-center justify-center font-bold" style={{ width: 38, height: 38, background: "#222", color: "#aaa" }}>
                            {(v.displayName || "U").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-medium text-white flex-1">{v.displayName || "User"}</span>
                        <span className="text-xs" style={{ color: "#555" }}>{v.viewedAt ? timeAgo(v.viewedAt.seconds) : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
